import {
  OE3_REQUIRED_RESOURCE_TYPES,
  assertNoSensitiveLeak,
  recordSkillRun,
  sanitizeForPublic,
  skillDefinition
} from "./00-contracts.mjs";
import { cachedReadonlyFromBundle, runContextSkill } from "./02-context-resolvers.mjs";
import { evaluateStdProjectCreatePreflight } from "./05-create-preflight-diagnostics.mjs";
import { runCreateOnceSkill } from "./06-create-once.mjs";
import { runDuplicateReadonlyCheck } from "./05-duplicate-readonly.mjs";
import { runDmpReadonlyGate } from "./04-dmp-readonly.mjs";
import { runLaunchPackSkill } from "./03-launch-pack.mjs";
import { runMonitorWorkflowSkill } from "./02-monitor-provision.mjs";
import { runObjectiveContractReadonlyGate } from "./05-objective-contract-readiness.mjs";
import {
  applyDraftToBundle,
  buildSkillDraft,
  evaluateOe3PayloadContract
} from "./05-payload-contract.mjs";
import { runReadbackSkill } from "./07-readback.mjs";
import {
  createNodeStatusFromSkill,
  readbackNodeStatusFromSkill,
  workflowJobUpdateFromSkillResults,
  workflowNoRealPlatformWrite
} from "./00-result-mapping.mjs";
import { WORKFLOW_NODES, getWorkflowNode } from "./00-workflow-node-registry.mjs";
import {
  brandIndustryPassed,
  eventChainPassed,
  mockReadyBundle,
  runResourceVerifier,
  withDmpCustomAudienceIds
} from "./04-resource-verifiers.mjs";
import { runVideoMaterialReadonlyGate } from "./04-video-material-readiness.mjs";
import { runIntakeNormalizeSkill } from "./01-intake-normalize.mjs";
import { compileAndSaveExecutionPlan } from "../../executionPlan.mjs";

export const OE3_WORKFLOW_MODES = new Set(["dry_run", "execute_once", "readback_only", "planned_actions"]);

const TERMINAL_STATUSES = new Set(["passed", "repairable", "needs_confirmation", "blocked", "locked", "failed", "mock_passed", "skipped"]);
const MONITOR_SKILLS = new Set(["monitor-query", "monitor-plan", "monitor-ensure", "monitor-readback"]);
const CONTEXT_SKILLS = new Set(["context-resolve-account", "context-resolve-touchpoint", "context-resolve-platform-app"]);
const LAUNCH_PACK_SKILLS = new Set([
  "launch-pack-resolve-game",
  "launch-pack-resolve-defaults",
  "launch-pack-resolve-materials",
  "launch-pack-resolve-backup-landing-page"
]);

function nodeStatus({ nodeKey, status, summary, diagnosticLevel = "info", outputSummary = {}, evidenceRefs = [] }) {
  const node = getWorkflowNode(nodeKey);
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
  const monitorDryRun = ["monitor-query", "monitor-plan"];
  const monitorPlannedActions = ["monitor-query", "monitor-plan", "monitor-ensure", "monitor-readback"];
  if (mode === "planned_actions") {
    return [
      "intake-normalize",
      ...monitorPlannedActions,
      "context-resolve-account",
      "context-resolve-touchpoint",
      "context-resolve-platform-app"
    ];
  }
  const base = [
    "intake-normalize",
    ...monitorDryRun,
    "context-resolve-account",
    "context-resolve-touchpoint",
    "context-resolve-platform-app",
    "launch-pack-resolve-game",
    "launch-pack-resolve-defaults",
    "launch-pack-resolve-materials",
    "launch-pack-resolve-backup-landing-page",
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

async function getTouchpointVerification(repo, bundle) {
  return repo.getTouchpointVerification({
    routeId: bundle.job.route_id,
    gameCode: bundle.job.game_code,
    advertiserId: bundle.job.advertiser_id,
    monitorId: bundle.account?.monitor_id || bundle.touchpoint?.monitor_id || ""
  });
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
  const result = await runDuplicateReadonlyCheck({
    repo,
    bundle: latestBundle,
    mockReady: context.mockReady,
    allowReadonlyDependency: context.allowReadonlyDependency === true
  });
  return {
    ...result,
    outputSummary: {
      ...(result.outputSummary || {}),
      duplicateStatus: result.outputSummary?.status || "not_checked",
      source: context.mockReady ? "mock_ready" : "oceanengine_std_project_list_readonly"
    }
  };
}

async function executeCreateReadiness({ repo, context }) {
  const latestBundle = await repo.getLaunchJobBundle(context.bundle.job.job_id);
  context.bundle = latestBundle;
  const createPreflight = evaluateStdProjectCreatePreflight({
    requestFieldManifest: latestBundle.draft?.payload_summary?.final_payload_manifest || {},
    payloadContractStatus: context.payloadContract?.status || "not_run"
  });
  const skillBlockers = [...context.skillOutputs.values()].flatMap((item) => item.blockers || []);
  const platformActions = latestBundle.platformAction ? 1 : 0;
  const createdObjects = latestBundle.createdObject ? 1 : 0;
  const blockers = [...new Set([
    ...skillBlockers,
    ...createPreflight.blocker_codes,
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
        createPreflightStatus: createPreflight.status,
        createPreflightSummary: createPreflight.summary,
        createPreflightDiagnostics: createPreflight.diagnostics,
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

  if (skillKey === "intake-normalize") {
    result = runIntakeNormalizeSkill({ bundle: context.bundle });
  } else if (MONITOR_SKILLS.has(skillKey)) {
    result = await runMonitorWorkflowSkill({
      repo,
      bundle: context.bundle,
      skillKey,
      mode: context.mode,
      ownerKey: context.qiankunOwnerKey || "",
      allowedPlanActions: context.allowedPlanActions || [],
      mockMonitorEnsure: context.mockMonitorEnsure === true,
      fetchImpl: context.fetchImpl || globalThis.fetch,
      env: context.env || process.env,
      previousOutputs: context.skillOutputs
    });
  } else if (CONTEXT_SKILLS.has(skillKey)) {
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
      ? await runDmpReadonlyGate({
        repo,
        bundle: context.bundle,
        mockReady: context.mockReady,
        allowReadonlyDependency: context.allowReadonlyDependency === true
      })
      : resourceType === "event_asset"
        ? await runObjectiveContractReadonlyGate({
          repo,
          bundle: context.bundle,
          mockReady: context.mockReady,
          allowReadonlyDependency: context.allowReadonlyDependency === true
        })
      : resourceType === "video_asset"
        ? await runVideoMaterialReadonlyGate({
          repo,
          bundle: context.bundle,
          mockReady: context.mockReady,
          allowReadonlyDependency: context.allowReadonlyDependency === true
        })
      : runResourceVerifier({
        bundle: context.mockReady ? mockReadyBundle(context.bundle) : context.bundle,
        resourceType,
        mockReady: context.mockReady
      });
    if (resourceType === "dmp_audience_package" && Array.isArray(result.customAudienceIds)) {
      context.dmpCustomAudienceIds = result.customAudienceIds;
    }
    if (!context.mockReady && (resourceType === "event_asset" || resourceType === "video_asset")) {
      context.bundle = await repo.getLaunchJobBundle(context.bundle.job.job_id);
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
      readiness: output(context, "create-readiness").outputSummary?.createReadiness || {},
      allowNetworkWrite: context.allowNetworkWrite === true,
      confirmationIntent: context.confirmationIntent || "",
      confirmVariableValue: context.confirmVariableValue || "",
      grantSource: context.grantSource || "",
      executionGrantId: context.executionGrantId || "",
      fetchImpl: context.fetchImpl || globalThis.fetch
    });
  } else if (skillKey === "readback-std-project") {
    result = await runReadbackSkill({
      repo,
      bundle: context.bundle,
      mode: context.mode,
      fetchImpl: context.fetchImpl || globalThis.fetch,
      grantSource: context.grantSource || "",
      createResult: output(context, "create-once")
    });
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
  const plannedActionsMode = mode === "planned_actions";
  const cachedReadonly = cachedReadonlyFromBundle(bundle);
  const skillOutput = (key) => skillOutputs.get(key) || {};
  const resourceOutputs = OE3_REQUIRED_RESOURCE_TYPES.map((type) => skillOutput(resourceSkillKey(type)));
  const resourceBlockers = resourceOutputs.flatMap((item) => item.blockers || []);
  const payloadContract = skillOutput("payload-contract");
  const readiness = skillOutput("create-readiness").outputSummary?.createReadiness || {};
  const create = skillOutput("create-once");
  const readback = skillOutput("readback-std-project");
  const monitorOutputs = ["monitor-query", "monitor-plan", "monitor-ensure", "monitor-readback"]
    .map((key) => skillOutput(key))
    .filter((item) => item.outputSummary);
  const monitorBlockers = monitorOutputs.flatMap((item) => item.blockers || []);
  const createNode = createNodeStatusFromSkill({ create, mode });
  const readbackNode = readbackNodeStatusFromSkill({ readback, mode });
  const contextBlocked = ["context-resolve-account", "context-resolve-touchpoint", "context-resolve-platform-app"]
    .some((key) => skillOutput(key).status === "blocked");
  const packBlocked = ["launch-pack-resolve-game", "launch-pack-resolve-defaults", "launch-pack-resolve-materials", "launch-pack-resolve-backup-landing-page"]
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
      status: contextBlocked || monitorBlockers.length ? "blocked" : "passed",
      summary: contextBlocked || monitorBlockers.length ? "账户、触点、monitor 或平台 app 上下文未就绪。" : "账户、触点、monitor 和平台 app 已由 Skill 装配。",
      diagnosticLevel: contextBlocked || monitorBlockers.length ? "error" : "info",
      outputSummary: {
        monitor: {
          query: skillOutput("monitor-query").outputSummary || {},
          plan: skillOutput("monitor-plan").outputSummary || {},
          ensure: skillOutput("monitor-ensure").outputSummary || {},
          readback: skillOutput("monitor-readback").outputSummary || {},
          blockers: monitorBlockers
        },
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
      status: plannedActionsMode ? "waiting" : packBlocked ? "blocked" : "passed",
      summary: plannedActionsMode ? "等待 Node 2 planned action 完成后执行。" : packBlocked ? "游戏主档、路线默认值、保底物料包或备用落地页缺失。" : "游戏主档、路线默认值、保底物料包和备用落地页已由 Skill 装配。",
      diagnosticLevel: plannedActionsMode ? "pending" : packBlocked ? "error" : "info",
      outputSummary: {
        game: skillOutput("launch-pack-resolve-game").outputSummary || {},
        defaults: skillOutput("launch-pack-resolve-defaults").outputSummary || {},
        materials: skillOutput("launch-pack-resolve-materials").outputSummary || {},
        backupLandingPage: skillOutput("launch-pack-resolve-backup-landing-page").outputSummary || {}
      }
    }),
    nodeStatus({
      nodeKey: "account_resource_prepare",
      status: plannedActionsMode ? "waiting" : resourceBlockers.length ? "blocked" : "passed",
      summary: plannedActionsMode ? "等待 Node 3 后执行账户资源准备。" : resourceBlockers.length ? `账户资源存在 ${resourceBlockers.length} 个阻断。` : `${OE3_REQUIRED_RESOURCE_TYPES.length} 项账户资源均已通过 Skill 检查。`,
      diagnosticLevel: plannedActionsMode ? "pending" : resourceBlockers.length ? "error" : "info",
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
      status: plannedActionsMode ? "waiting" : payloadContract.status === "passed" && readiness.canCreateCurrentJob ? "needs_confirmation" : "repairable",
      summary: plannedActionsMode ? "等待 Node 2-4 准备完成后生成草稿。" : draft.projectName
        ? `创建草稿已生成：${draft.projectName}；${readiness.uniqueBlocker || "等待创建确认"}。`
        : "等待创建草稿。",
      diagnosticLevel: plannedActionsMode ? "pending" : payloadContract.status === "passed" && readiness.canCreateCurrentJob ? "warning" : "error",
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
      status: createNode.status,
      summary: createNode.summary,
      diagnosticLevel: createNode.diagnosticLevel,
      outputSummary: {
        ...createNode.outputSummary,
        createReadiness: readiness
      },
      evidenceRefs: create.evidenceRefs || []
    }),
    nodeStatus({
      nodeKey: "readback_closer",
      status: readbackNode.status,
      summary: readbackNode.summary,
      diagnosticLevel: readbackNode.diagnosticLevel,
      outputSummary: readbackNode.outputSummary,
      evidenceRefs: readback.evidenceRefs || []
    })
  ];
}

export async function runOe3WorkflowSkills({
  repo,
  jobId,
  mode = "dry_run",
  mockReady = false,
  mockExecute = false,
  allowNetworkWrite = false,
  allowReadonlyDependency = false,
  confirmationIntent = "",
  confirmVariableValue = "",
  grantSource = "",
  executionGrantId = "",
  fetchImpl = globalThis.fetch,
  env = process.env,
  allowedPlanActions = [],
  mockMonitorEnsure = false,
  qiankunOwnerKey = ""
} = {}) {
  if (!OE3_WORKFLOW_MODES.has(mode)) throw new Error(`unsupported_oe3_workflow_mode:${mode}`);
  let bundle = await repo.getLaunchJobBundle(jobId);
  if (!bundle) throw new Error("job_not_found");
  if (mode !== "readback_only") {
    await compileAndSaveExecutionPlan({ repo, jobId });
    bundle = await repo.getLaunchJobBundle(jobId);
  }
  const touchpointVerification = await getTouchpointVerification(repo, bundle);
  const context = {
    bundle,
    mode,
    mockReady,
    mockExecute,
    allowNetworkWrite,
    allowReadonlyDependency,
    confirmationIntent,
    confirmVariableValue,
    grantSource,
    executionGrantId,
    fetchImpl,
    env,
    allowedPlanActions,
    mockMonitorEnsure,
    qiankunOwnerKey,
    touchpointVerification,
    skillOutputs: new Map(),
    payloadContract: null
  };
  for (const skillKey of skillsForMode(mode)) {
    await executeSkill({ repo, context, skillKey });
    bundle = await repo.getLaunchJobBundle(jobId);
    context.bundle = bundle;
    context.touchpointVerification = await getTouchpointVerification(repo, bundle);
  }
  const nodes = aggregateNodeRuns({
    bundle: context.bundle,
    mode,
    skillOutputs: context.skillOutputs
  });
  await repo.upsertNodeRuns(jobId, nodes);
  if (mode === "dry_run") {
    const latestDraftBundle = await repo.getLaunchJobBundle(jobId);
    if (latestDraftBundle?.draft?.project_name) {
      await repo.upsertReadbackRecord({
        readbackId: `RB-${jobId}-STD-PROJECT-NOT-APPLICABLE`,
        jobId,
        objectType: "std_project",
        objectId: "NOT_APPLICABLE_DRY_RUN",
        objectName: latestDraftBundle.draft.project_name,
        readbackStatus: "not_applicable",
        fieldDiffSummary: {
          reason: "dry_run_does_not_create_platform_object",
          object_name_from_draft: true,
          real_platform_readback_called: false
        },
        evidenceRef: ""
      });
    }
  }
  const jobUpdate = workflowJobUpdateFromSkillResults({
    mode,
    create: context.skillOutputs.get("create-once") || {},
    readback: context.skillOutputs.get("readback-std-project") || {}
  });
  if (jobUpdate) await repo.updateJob(jobId, jobUpdate);
  const latest = await repo.getLaunchJobBundle(jobId);
  const summary = {
    jobId,
    mode,
    jobStatus: latest.job.job_status,
    currentNode: latest.job.current_node,
    skillRunCount: context.skillOutputs.size,
    nodeStatuses: Object.fromEntries(nodes.map((node) => [node.nodeKey, node.status])),
    createReadiness: nodes.find((node) => node.nodeKey === "std_project_draft_builder")?.outputSummary?.createReadiness || {},
    noRealPlatformWrite: workflowNoRealPlatformWrite({
      create: context.skillOutputs.get("create-once") || {}
    }),
    noTokenRefresh: true
  };
  assertNoSensitiveLeak(summary);
  return { bundle: latest, nodes, summary };
}
