import {
  OE3_REQUIRED_RESOURCE_TYPES,
  assertNoSensitiveLeak,
  recordSkillRun,
  sanitizeForPublic,
  skillDefinition
} from "./contracts.mjs";
import { cachedReadonlyFromBundle, runContextSkill } from "./context.mjs";
import { runCreateOnceSkill } from "./create-once.mjs";
import { runDmpReadonlyGate } from "./dmp-readonly.mjs";
import { runLaunchPackSkill } from "./launch-pack.mjs";
import {
  applyDraftToBundle,
  buildSkillDraft,
  evaluateOe3PayloadContract
} from "./payload-contract.mjs";
import { runReadbackSkill } from "./readback.mjs";
import {
  brandIndustryPassed,
  eventChainPassed,
  mockReadyBundle,
  runResourceVerifier,
  withDmpCustomAudienceIds
} from "./resource-verifiers.mjs";

export const OE3_WORKFLOW_MODES = new Set(["dry_run", "execute_once", "readback_only"]);

const NODE_DEFINITIONS = [
  { order: "01", number: 1, nodeKey: "launch_intake", nodeName: "Intake 规范", phase: "准备阶段", output: "launch_intake" },
  { order: "02", number: 2, nodeKey: "creation_context", nodeName: "创建上下文装配", phase: "准备阶段", output: "creation_context" },
  { order: "03", number: 3, nodeKey: "game_launch_pack", nodeName: "游戏保底包解析", phase: "准备阶段", output: "game_launch_pack" },
  { order: "04", number: 4, nodeKey: "account_resource_prepare", nodeName: "账户资源诊断与补齐", phase: "就绪阶段", output: "account_ready_report" },
  { order: "05", number: 5, nodeKey: "std_project_draft_builder", nodeName: "创建草稿生成", phase: "就绪阶段", output: "creation_draft" },
  { order: "06", number: 6, nodeKey: "std_project_create_executor", nodeName: "创建执行", phase: "创建执行", output: "created_object" },
  { order: "07", number: 7, nodeKey: "readback_closer", nodeName: "回查收口", phase: "创建执行", output: "readback_verified" }
];

const TERMINAL_STATUSES = new Set(["passed", "repairable", "needs_confirmation", "blocked", "locked", "failed", "mock_passed", "skipped"]);
const CONTEXT_SKILLS = new Set(["intake-normalize", "context-resolve-account", "context-resolve-touchpoint", "context-resolve-platform-app"]);
const LAUNCH_PACK_SKILLS = new Set(["launch-pack-resolve-game", "launch-pack-resolve-defaults", "launch-pack-resolve-materials"]);

function nodeStatus({ nodeKey, status, summary, diagnosticLevel = "info", outputSummary = {}, evidenceRefs = [] }) {
  const node = NODE_DEFINITIONS.find((item) => item.nodeKey === nodeKey);
  return {
    ...node,
    status,
    summary,
    diagnosticLevel,
    outputSummary: sanitizeForPublic(outputSummary),
    evidenceRefs,
    started: status !== "waiting",
    finished: TERMINAL_STATUSES.has(status)
  };
}

function output(context, key) {
  return context.skillOutputs.get(key) || {};
}

function dependencyStatuses(context, definition) {
  return Object.fromEntries(definition.dependsOn.map((key) => [key, output(context, key).status || "waiting"]));
}

function resourceSkillKey(type) {
  return `resource-verify-${type.replace(/_/g, "-")}`;
}

function skillsForMode(mode) {
  if (mode === "readback_only") return ["readback-std-project"];
  const base = [
    "intake-normalize",
    "context-resolve-account",
    "context-resolve-touchpoint",
    "context-resolve-platform-app",
    "launch-pack-resolve-game",
    "launch-pack-resolve-defaults",
    "launch-pack-resolve-materials",
    ...OE3_REQUIRED_RESOURCE_TYPES.map(resourceSkillKey),
    "payload-build",
    "payload-contract",
    "duplicate-check",
    "create-readiness"
  ];
  if (mode === "execute_once") return [...base, "create-once", "readback-std-project"];
  return base;
}

function resourceTypeFromSkill(skillKey) {
  return skillKey.replace("resource-verify-", "").replace(/-/g, "_");
}

async function executePayloadBuild({ repo, context }) {
  const draft = await buildSkillDraft({
    repo,
    bundle: withDmpCustomAudienceIds(context.bundle, context.dmpCustomAudienceIds || []),
    mockReady: context.mockReady
  });
  await repo.upsertDraft(draft);
  context.draft = draft;
  context.bundle = applyDraftToBundle(context.bundle, draft);
  return {
    status: draft.payloadSummary.final_payload_blockers?.length ? "blocked" : "passed",
    blockers: draft.payloadSummary.final_payload_blockers || [],
    outputSummary: {
      projectName: draft.projectName,
      payloadHash: draft.payloadHash,
      payloadHashSource: draft.payloadSummary.payload_hash_source || "legacy_summary",
      requestFieldManifest: draft.payloadSummary.final_payload_manifest || {},
      rawPayloadStored: false
    }
  };
}

async function executePayloadContract({ repo, context }) {
  const latestBundle = await repo.getLaunchJobBundle(context.bundle.job.job_id);
  context.bundle = latestBundle;
  const contract = evaluateOe3PayloadContract({
    bundle: latestBundle,
    draft: latestBundle.draft,
    touchpointVerification: context.touchpointVerification
  });
  context.payloadContract = contract;
  return {
    status: contract.status,
    blockers: contract.gaps.map((gap) => gap.key),
    outputSummary: {
      payloadContractStatus: contract.status,
      payloadHashStable: Boolean(contract.expectedPayloadHash && contract.expectedPayloadHash === latestBundle.draft?.payload_hash),
      expectedPayloadHash: contract.expectedPayloadHash || "",
      checks: contract.checks.map((check) => ({ key: check.key, status: check.status, summary: check.summary }))
    }
  };
}

async function executeDuplicateCheck({ repo, context }) {
  const latestBundle = await repo.getLaunchJobBundle(context.bundle.job.job_id);
  context.bundle = latestBundle;
  const status = latestBundle.draft?.duplicate_status === "platform_not_duplicate"
    ? "platform_not_duplicate"
    : "not_checked";
  return {
    status: status === "platform_not_duplicate" || context.mockReady ? "passed" : "blocked",
    blockers: status === "platform_not_duplicate" || context.mockReady ? [] : ["duplicate_check_not_platform_not_duplicate"],
    outputSummary: {
      duplicateStatus: context.mockReady ? "mock_platform_not_duplicate" : status,
      source: status === "platform_not_duplicate" ? "postgres_cached_readonly" : "not_checked_no_platform_call"
    }
  };
}

async function executeCreateReadiness({ repo, context }) {
  const latestBundle = await repo.getLaunchJobBundle(context.bundle.job.job_id);
  context.bundle = latestBundle;
  const skillBlockers = [...context.skillOutputs.values()].flatMap((item) => item.blockers || []);
  const platformActions = latestBundle.platformAction ? 1 : 0;
  const createdObjects = latestBundle.createdObject ? 1 : 0;
  const blockers = [...new Set([
    ...skillBlockers,
    ...(platformActions > 0 ? ["single_create_attempt_already_recorded"] : []),
    ...(createdObjects > 0 ? ["created_object_already_recorded"] : []),
    ...(!brandIndustryPassed(latestBundle) && !context.mockReady ? ["brand_industry_readback_blocked"] : []),
    ...(!eventChainPassed(latestBundle) && !context.mockReady ? ["event_chain_readback_blocked"] : [])
  ])];
  const ready = blockers.length === 0 || context.mockReady;
  const status = ready
    ? "ready_for_user_create_confirmation"
    : platformActions > 0
      ? "blocked_after_single_create_failure"
      : blockers.includes("brand_industry_readback_blocked")
        ? "blocked_brand_industry"
        : "new_runtime_job_required";
  return {
    status: ready ? "passed" : "blocked",
    blockers,
    outputSummary: {
      createReadiness: {
        status,
        canCreateCurrentJob: ready,
        retryAllowed: false,
        nextConfirmationRequired: ready && context.mode === "execute_once",
        platformActions,
        createdObjects,
        brandIndustryStatus: context.mockReady ? "mock_passed" : (brandIndustryPassed(latestBundle) ? "passed" : "blocked"),
        eventChainStatus: context.mockReady ? "mock_passed" : (eventChainPassed(latestBundle) ? "passed" : "blocked"),
        payloadContractStatus: context.payloadContract?.status || "not_run",
        payloadHashStable: context.payloadContract?.expectedPayloadHash === latestBundle.draft?.payload_hash,
        duplicateStatus: latestBundle.draft?.duplicate_status || "not_generated",
        blockers,
        uniqueBlocker: ready ? "无" : blockers[0],
        nextAction: ready ? "等待单次创建确认任务。" : "修复唯一阻断后重跑 dry_run。"
      }
    }
  };
}

async function executeSkill({ repo, context, skillKey }) {
  const definition = skillDefinition(skillKey);
  const startedAt = new Date().toISOString();
  const input = {
    jobId: context.bundle.job.job_id,
    mode: context.mode,
    dependsOn: definition.dependsOn,
    dependencyStatuses: dependencyStatuses(context, definition),
    sourceUsage: context.bundle.job.source_usage || "runtime_truth"
  };
  let result;

  if (CONTEXT_SKILLS.has(skillKey)) {
    result = runContextSkill({
      bundle: context.bundle,
      touchpointVerification: context.touchpointVerification,
      skillKey
    });
  } else if (LAUNCH_PACK_SKILLS.has(skillKey)) {
    result = runLaunchPackSkill({ bundle: context.bundle, skillKey });
  } else if (skillKey.startsWith("resource-verify-")) {
    const resourceType = resourceTypeFromSkill(skillKey);
    result = resourceType === "dmp_audience_package"
      ? await runDmpReadonlyGate({ repo, bundle: context.bundle, mockReady: context.mockReady })
      : runResourceVerifier({
        bundle: context.mockReady ? mockReadyBundle(context.bundle) : context.bundle,
        resourceType,
        mockReady: context.mockReady
      });
    if (resourceType === "dmp_audience_package" && Array.isArray(result.customAudienceIds)) {
      context.dmpCustomAudienceIds = result.customAudienceIds;
    }
  } else if (skillKey === "payload-build") {
    result = await executePayloadBuild({ repo, context });
  } else if (skillKey === "payload-contract") {
    result = await executePayloadContract({ repo, context });
  } else if (skillKey === "duplicate-check") {
    result = await executeDuplicateCheck({ repo, context });
  } else if (skillKey === "create-readiness") {
    result = await executeCreateReadiness({ repo, context });
  } else if (skillKey === "create-once") {
    result = await runCreateOnceSkill({
      repo,
      bundle: context.bundle,
      mode: context.mode,
      mockReady: context.mockReady,
      mockExecute: context.mockExecute,
      readiness: output(context, "create-readiness").outputSummary?.createReadiness || {}
    });
  } else if (skillKey === "readback-std-project") {
    result = await runReadbackSkill({ repo, bundle: context.bundle, mode: context.mode });
  } else {
    throw new Error(`skill_not_implemented:${skillKey}`);
  }

  const resultForRecord = { ...result };
  delete resultForRecord.customAudienceIds;
  const safeResult = sanitizeForPublic(resultForRecord);
  assertNoSensitiveLeak(safeResult);
  context.skillOutputs.set(skillKey, safeResult);
  await recordSkillRun({ repo, bundle: context.bundle, definition, input, result: safeResult, startedAt });
  return safeResult;
}

function aggregateNodeRuns({ bundle, mode, skillOutputs }) {
  const cachedReadonly = cachedReadonlyFromBundle(bundle);
  const skillOutput = (key) => skillOutputs.get(key) || {};
  const resourceOutputs = OE3_REQUIRED_RESOURCE_TYPES.map((type) => skillOutput(resourceSkillKey(type)));
  const resourceBlockers = resourceOutputs.flatMap((item) => item.blockers || []);
  const payloadContract = skillOutput("payload-contract");
  const readiness = skillOutput("create-readiness").outputSummary?.createReadiness || {};
  const create = skillOutput("create-once");
  const readback = skillOutput("readback-std-project");
  const contextBlocked = ["context-resolve-account", "context-resolve-touchpoint", "context-resolve-platform-app"]
    .some((key) => skillOutput(key).status === "blocked");
  const packBlocked = ["launch-pack-resolve-game", "launch-pack-resolve-defaults", "launch-pack-resolve-materials"]
    .some((key) => skillOutput(key).status === "blocked");
  const draft = skillOutput("payload-build").outputSummary || {};

  return [
    nodeStatus({
      nodeKey: "launch_intake",
      status: skillOutput("intake-normalize").status || "passed",
      summary: "route_id、game_code、advertiser_id 已归一。",
      outputSummary: skillOutput("intake-normalize").outputSummary || {}
    }),
    nodeStatus({
      nodeKey: "creation_context",
      status: contextBlocked ? "blocked" : "passed",
      summary: contextBlocked ? "账户、触点或平台 app 上下文未就绪。" : "账户、触点和平台 app 已由 Skill 装配。",
      diagnosticLevel: contextBlocked ? "error" : "info",
      outputSummary: {
        account: skillOutput("context-resolve-account").outputSummary || {},
        touchpoint: skillOutput("context-resolve-touchpoint").outputSummary || {},
        platformApp: skillOutput("context-resolve-platform-app").outputSummary || {},
        platformReadonlyStatus: cachedReadonly.platformReadonlyStatus,
        credentialStatus: cachedReadonly.credentialStatus,
        credentialBlockers: cachedReadonly.credentialBlockers
      }
    }),
    nodeStatus({
      nodeKey: "game_launch_pack",
      status: packBlocked ? "blocked" : "passed",
      summary: packBlocked ? "游戏主档、路线默认值或保底物料包缺失。" : "游戏主档、路线默认值和保底物料包已由 Skill 装配。",
      diagnosticLevel: packBlocked ? "error" : "info",
      outputSummary: {
        game: skillOutput("launch-pack-resolve-game").outputSummary || {},
        defaults: skillOutput("launch-pack-resolve-defaults").outputSummary || {},
        materials: skillOutput("launch-pack-resolve-materials").outputSummary || {}
      }
    }),
    nodeStatus({
      nodeKey: "account_resource_prepare",
      status: resourceBlockers.length ? "blocked" : "passed",
      summary: resourceBlockers.length ? `账户资源存在 ${resourceBlockers.length} 个阻断。` : "七项账户资源均已通过 Skill 检查。",
      diagnosticLevel: resourceBlockers.length ? "error" : "info",
      outputSummary: {
        blockedResourceTypes: resourceOutputs
          .filter((item) => item.status === "blocked")
          .map((item) => item.outputSummary?.resourceType)
          .filter(Boolean),
        checks: resourceOutputs.map((item) => item.outputSummary).filter(Boolean),
        platformReadonlyStatus: cachedReadonly.platformReadonlyStatus,
        credentialStatus: cachedReadonly.credentialStatus,
        credentialBlockers: cachedReadonly.credentialBlockers,
        skillLayer: "src/workflows/skills/oe3"
      }
    }),
    nodeStatus({
      nodeKey: "std_project_draft_builder",
      status: payloadContract.status === "passed" && readiness.canCreateCurrentJob ? "needs_confirmation" : "repairable",
      summary: draft.projectName
        ? `创建草稿已生成：${draft.projectName}；${readiness.uniqueBlocker || "等待创建确认"}。`
        : "等待创建草稿。",
      diagnosticLevel: payloadContract.status === "passed" && readiness.canCreateCurrentJob ? "warning" : "error",
      outputSummary: {
        projectName: draft.projectName || bundle.draft?.project_name || "",
        payloadHash: draft.payloadHash || bundle.draft?.payload_hash || "",
        payloadHashSource: draft.payloadHashSource || bundle.draft?.payload_summary?.payload_hash_source || "",
        duplicateStatus: skillOutput("duplicate-check").outputSummary?.duplicateStatus || bundle.draft?.duplicate_status || "not_generated",
        payloadContractStatus: payloadContract.outputSummary?.payloadContractStatus || payloadContract.status || "not_run",
        platformDuplicateCheckStatus: cachedReadonly.platformDuplicateCheckStatus,
        requestFieldManifest: draft.requestFieldManifest || bundle.draft?.payload_summary?.final_payload_manifest || {},
        createReadiness: readiness
      }
    }),
    nodeStatus({
      nodeKey: "std_project_create_executor",
      status: create.status === "mock_passed" ? "passed" : "locked",
      summary: create.status === "mock_passed"
        ? "execute_once mock 创建已通过；未调用真实平台。"
        : "创建节点锁定；本任务禁止真实平台写入。",
      diagnosticLevel: create.status === "mock_passed" ? "info" : "warning",
      outputSummary: {
        ...(create.outputSummary || {
          createNodeStatus: mode === "execute_once" ? "locked" : "dry_run_locked",
          createCalled: false,
          realPlatformWriteCalled: false,
          retryAllowed: false
        }),
        createReadiness: readiness
      },
      evidenceRefs: create.evidenceRefs || []
    }),
    nodeStatus({
      nodeKey: "readback_closer",
      status: readback.status === "mock_passed" ? "passed" : (mode === "dry_run" ? "waiting" : "locked"),
      summary: readback.status === "mock_passed"
        ? "execute_once mock 回查已收口。"
        : (mode === "dry_run" ? "dry_run 不执行回查。" : "回查等待创建对象或显式 readback_only。"),
      diagnosticLevel: readback.status === "mock_passed" ? "info" : "pending",
      outputSummary: readback.outputSummary || {
        readbackStatus: "not_run",
        realPlatformReadbackCalled: false
      },
      evidenceRefs: readback.evidenceRefs || []
    })
  ];
}

export async function runOe3WorkflowSkills({
  repo,
  jobId,
  mode = "dry_run",
  mockReady = false,
  mockExecute = false
} = {}) {
  if (!OE3_WORKFLOW_MODES.has(mode)) throw new Error(`unsupported_oe3_workflow_mode:${mode}`);
  let bundle = await repo.getLaunchJobBundle(jobId);
  if (!bundle) throw new Error("job_not_found");
  const touchpointVerification = await repo.getTouchpointVerification({
    routeId: bundle.job.route_id,
    gameCode: bundle.job.game_code,
    advertiserId: bundle.job.advertiser_id,
    monitorId: bundle.account?.monitor_id || bundle.touchpoint?.monitor_id || ""
  });
  const context = {
    bundle,
    mode,
    mockReady,
    mockExecute,
    touchpointVerification,
    skillOutputs: new Map(),
    payloadContract: null
  };
  for (const skillKey of skillsForMode(mode)) {
    await executeSkill({ repo, context, skillKey });
    bundle = await repo.getLaunchJobBundle(jobId);
    context.bundle = bundle;
  }
  const nodes = aggregateNodeRuns({
    bundle: context.bundle,
    mode,
    skillOutputs: context.skillOutputs
  });
  await repo.upsertNodeRuns(jobId, nodes);
  if (mode === "execute_once" && context.skillOutputs.get("readback-std-project")?.status === "mock_passed") {
    await repo.updateJob(jobId, { status: "created", currentNode: "7" });
  } else if (mode === "dry_run") {
    await repo.updateJob(jobId, { status: "draft_ready", currentNode: "5" });
  }
  const latest = await repo.getLaunchJobBundle(jobId);
  const summary = {
    jobId,
    mode,
    jobStatus: latest.job.job_status,
    currentNode: latest.job.current_node,
    skillRunCount: context.skillOutputs.size,
    nodeStatuses: Object.fromEntries(nodes.map((node) => [node.nodeKey, node.status])),
    createReadiness: nodes.find((node) => node.nodeKey === "std_project_draft_builder")?.outputSummary?.createReadiness || {},
    noRealPlatformWrite: true,
    noTokenRefresh: true
  };
  assertNoSensitiveLeak(summary);
  return { bundle: latest, nodes, summary };
}
