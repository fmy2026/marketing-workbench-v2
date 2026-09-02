import { randomBytes } from "node:crypto";
import { parseLaunchIntake, hashText } from "../agents/launchAgent.mjs";
import { evaluateOceanEnginePrewriteReadiness } from "../platforms/oceanengineReadonlyAdapter.mjs";
import {
  evaluateOe3PayloadContract,
  runOe3WorkflowSkills
} from "./skills/oe3/00-index.mjs";
import { readonlyPermissionState } from "./skills/oe3/00-readonly-permission.mjs";
import { getExecutionGrantAvailability } from "./executionGrantScope.mjs";
import { buildConfirmationPreview } from "./gateActionPolicy.mjs";
import { PLAN_KIND_STD_PROJECT_CREATE } from "./executionPlan.mjs";
import {
  workbenchCaseUrl,
  workbenchHomeUrl,
  workbenchJobUrl
} from "../../frontend/workbench-address.mjs";
export {
  WORKFLOW_NODES,
  getWorkflowNode,
  getWorkflowNodeByNumber
} from "./skills/oe3/00-workflow-node-registry.mjs";
import { WORKFLOW_NODES, getWorkflowNode } from "./skills/oe3/00-workflow-node-registry.mjs";

const PHASES = [
  { id: "prepare", title: "准备阶段", summary: "需求、上下文、保底包。" },
  { id: "ready", title: "就绪阶段", summary: "资源诊断与草稿。" },
  { id: "execute", title: "创建执行", summary: "确认、执行、回查。" }
];

const WORKBENCH_INTAKE_FIELDS = Object.freeze([
  Object.freeze({ key: "route_id", label: "推广路线" }),
  Object.freeze({ key: "game_code", label: "游戏标识" }),
  Object.freeze({ key: "advertiser_id", label: "账户 ID" })
]);

const TERMINAL_STATUSES = new Set(["passed", "repairable", "needs_confirmation", "blocked", "locked", "failed"]);

const PUBLIC_FORBIDDEN_KEY = /(touchpoint_url|landing_url|mini_program_url|raw_payload|raw_response|token|secret|auth_code|cookie)/i;
const PUBLIC_FORBIDDEN_VALUE = /(tf-api\.3k\.com|callback\/click|sslocal:\/\/|Bearer\s+[A-Za-z0-9._-]{20,})/i;

function publicView(value) {
  if (Array.isArray(value)) return value.map((item) => publicView(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !PUBLIC_FORBIDDEN_KEY.test(key))
        .map(([key, item]) => [key, publicView(item)])
    );
  }
  if (typeof value === "string" && PUBLIC_FORBIDDEN_VALUE.test(value)) return "[redacted]";
  if (typeof value === "string") {
    return value
      .replaceAll("touchpoint_url", "touchpoint")
      .replaceAll("landing_url", "landing_page")
      .replaceAll("mini_program_url", "mini_program_link");
  }
  return value;
}

function nodeStatus({ nodeKey, status, summary, diagnosticLevel = "info", outputSummary = {}, evidenceRefs = [] }) {
  const node = getWorkflowNode(nodeKey);
  return {
    ...node,
    status,
    summary,
    diagnosticLevel,
    outputSummary,
    evidenceRefs,
    started: status !== "waiting",
    finished: TERMINAL_STATUSES.has(status)
  };
}

function initialNodeRuns() {
  return [
    nodeStatus({
      nodeKey: "launch_intake",
      status: "passed",
      summary: "route_id、game_code、advertiser_id 已归一。"
    }),
    ...WORKFLOW_NODES.slice(1).map((node) => ({
      ...node,
      status: "waiting",
      summary: "等待执行。",
      diagnosticLevel: "pending",
      started: false,
      finished: false
    }))
  ];
}

function has(value) {
  return value !== null && value !== undefined && value !== "";
}

function draftToBundleShape(draft) {
  return {
    draft_id: draft.draftId,
    job_id: draft.jobId,
    object_type: draft.objectType,
    project_name: draft.projectName,
    payload_summary: draft.payloadSummary,
    payload_hash: draft.payloadHash,
    duplicate_status: draft.duplicateStatus,
    write_policy: draft.writePolicy
  };
}

function cachedPlatformReadonly(bundle = {}) {
  const contextNode = (bundle.nodes || []).find((node) => node.node_key === "creation_context");
  const accountNode = (bundle.nodes || []).find((node) => node.node_key === "account_resource_prepare");
  const draftNode = (bundle.nodes || []).find((node) => node.node_key === "std_project_draft_builder");
  const createNode = (bundle.nodes || []).find((node) => node.node_key === "std_project_create_executor");
  const contextOutput = contextNode?.output_summary || {};
  const accountOutput = accountNode?.output_summary || {};
  const draftOutput = draftNode?.output_summary || {};
  const createOutput = createNode?.output_summary || {};
  if (!accountOutput.platformReadonlyStatus && !draftOutput.platformDuplicateCheckStatus) return null;
  const checksByKey = new Map();
  [
    ...(accountOutput.checks || []),
    ...(draftOutput.checks || []),
    ...(createOutput.checks || [])
  ]
    .filter((item) => item.key?.startsWith("platform_"))
    .forEach((item) => checksByKey.set(item.key, item));
  return {
    status: accountOutput.platformReadonlyStatus || "cached",
    credential: {
      status: accountOutput.credentialStatus || contextOutput.credentialStatus || "cached",
      blockers: accountOutput.credentialBlockers || contextOutput.credentialBlockers || []
    },
    checks: [...checksByKey.values()],
    probes: [],
    resourceUpdates: [],
    platformDuplicateCheck: {
      status: draftOutput.platformDuplicateCheckStatus || "cached",
      listCount: null
    }
  };
}

async function buildRuntimeChecks(repo, bundle, { draftOverride, platformReadonly } = {}) {
  const effectiveBundle = draftOverride ? { ...bundle, draft: draftToBundleShape(draftOverride) } : bundle;
  const touchpointVerification = await repo.getTouchpointVerification({
    routeId: effectiveBundle.job.route_id,
    gameCode: effectiveBundle.job.game_code,
    advertiserId: effectiveBundle.job.advertiser_id,
    monitorId: effectiveBundle.account?.monitor_id || effectiveBundle.touchpoint?.monitor_id || ""
  });
  const payloadContract = evaluateOe3PayloadContract({
    bundle: effectiveBundle,
    draft: draftOverride || effectiveBundle.draft,
    touchpointVerification
  });
  const effectivePlatformReadonly = platformReadonly || cachedPlatformReadonly(effectiveBundle);
  const prewriteGate = evaluateOceanEnginePrewriteReadiness({
    bundle: effectiveBundle,
    touchpointVerification,
    contractResult: payloadContract,
    platformReadonly: effectivePlatformReadonly
  });
  return { touchpointVerification, payloadContract, prewriteGate, platformReadonly: effectivePlatformReadonly };
}

function nodeMap(nodes = []) {
  return new Map(nodes.map((node) => [node.node_key, node]));
}

function statusLabel(status) {
  return {
    passed: "通过",
    repairable: "可修复",
    needs_confirmation: "需确认",
    blocked: "阻断",
    locked: "锁定",
    waiting: "等待",
    running: "执行中",
    failed: "失败",
    created: "运行已建立",
    diagnosed: "诊断完成",
    draft_ready: "草稿待确认",
    confirm_placeholder_recorded: "确认占位已记录",
    readback_placeholder_ready: "回查占位已完成",
    failed_waiting_manual_review: "失败待复盘",
    created_pending_readback: "已创建待回查",
    blocked_brand_industry: "brand_industry 阻断",
    blocked_after_single_create_failure: "单次创建失败后锁定",
    blocked_confirmed_resource_plan: "资源准备已停止",
    corrective_attempt_requires_new_payload_version: "需修正参数后建立下一次尝试",
    corrective_attempt_limit_or_sequence_blocked: "创建尝试次数或顺序阻断",
    ready_for_user_create_confirmation: "可等待创建确认",
    new_runtime_job_required: "需要新的 runtime job",
    failed_or_unconfirmed: "失败或未确认",
    not_found_or_mismatch: "未找到或不匹配",
    not_started: "未开始",
    not_run: "未运行"
  }[status] || status;
}

function actionForStatus(node, status) {
  if (status === "passed") return "继续";
  if (status === "repairable") return "确认资源后继续";
  if (status === "needs_confirmation") return node.nodeKey === "std_project_draft_builder" ? "确认草稿" : "人工确认";
  if (status === "blocked") return "补齐缺口";
  if (status === "locked") return "保持占位，等待人工 gate";
  return "等待上游节点";
}

function diagnosticsFromNodes(nodes) {
  const items = nodes.map((node) => ({
    phase: node.phase,
    node: node.nodeName,
    status: node.status,
    statusLabel: statusLabel(node.status),
    problem: node.status === "passed" ? "已通过" : node.summary,
    action: actionForStatus(node, node.status),
    evidenceRef: "",
    readonlyChecks: node.outputSummary?.checks || [],
    outputSummary: node.outputSummary || {}
  }));
  const counts = items.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});
  const summary = `当前 ${counts.passed || 0} 项通过，${counts.repairable || 0} 项可修复，${counts.needs_confirmation || 0} 项需确认，${counts.locked || 0} 项锁定，${counts.waiting || 0} 项等待，${counts.blocked || 0} 项阻断。`;
  return { summary, items };
}

function modeForStatus(status) {
  return {
    created: "已创建",
    diagnosed: "诊断完成",
    draft_ready: "草稿待确认",
    confirm_placeholder_recorded: "确认占位已记录",
    readback_placeholder_ready: "回查占位已完成",
    created_pending_readback: "已创建待回查",
    failed_waiting_manual_review: "失败待复盘"
  }[status] || "待执行";
}

function nextActionForBundle(bundle = {}) {
  if (bundle.job?.job_status === "failed_waiting_manual_review") {
    return "禁止重试；修 brand_industry fresh readback，或新建 fresh runtime job。";
  }
  if (bundle.job?.job_status === "created_pending_readback") {
    return "禁止再次创建；执行只读回查收口。";
  }
  if (bundle.draft && !bundle.readback) return "等待人工确认或只读检查。";
  if (!bundle.draft) return "继续生成草稿。";
  return "刷新视图或查看诊断。";
}

function executionView(bundle = {}) {
  const action = bundle.platformAction || {};
  const createdObject = bundle.createdObject || {};
  const readback = bundle.readback || {};
  const readbackIsPlaceholder = readback.readback_status === "placeholder_recorded" ||
    String(readback.object_id || "").startsWith("PLACEHOLDER-");
  const status = action.action_status || createdObject.object_status || "not_started";
  const readbackStatus = readbackIsPlaceholder ? "not_run" : (readback.readback_status || createdObject.readback_status || "not_run");
  return {
    status,
    statusLabel: statusLabel(status),
    apiCode: action.api_code || "",
    objectIdPresent: Boolean(action.object_id_present || createdObject.object_id),
    readbackStatus,
    readbackStatusLabel: statusLabel(readbackStatus),
    retryAllowed: false
  };
}

function actionView(bundle = {}, createReadiness = {}) {
  const failed = bundle.job?.job_status === "failed_waiting_manual_review";
  const readyForConfirmation = createReadiness.status === "ready_for_user_create_confirmation";
  const hasPlatformAction = Boolean(bundle.platformAction);
  return [
    {
      key: "refresh_view",
      label: "刷新视图",
      enabled: true,
      dangerous: false
    },
    {
      key: "diagnostics",
      label: "查看诊断",
      enabled: true,
      dangerous: false
    },
    {
      key: "run",
      label: bundle.draft ? "重跑诊断/草稿" : "开始诊断/草稿",
      enabled: !failed && !hasPlatformAction,
      dangerous: false
    },
    {
      key: "retry_create",
      label: failed ? "禁止重试" : (readyForConfirmation ? "等待确认创建" : "真实创建禁用"),
      enabled: false,
      dangerous: true
    }
  ];
}

function summaryFieldsView(bundle = {}, execution = {}) {
  return [
    { label: "项目名", value: bundle.draft?.project_name || "", visible: true },
    { label: "payload hash", value: bundle.draft?.payload_hash || "", visible: true },
    { label: "查重状态", value: bundle.draft?.duplicate_status || "", visible: true },
    { label: "执行状态", value: execution.statusLabel || "", visible: true },
    { label: "api_code", value: execution.apiCode || "", visible: Boolean(execution.apiCode) },
    { label: "readback", value: execution.readbackStatusLabel || execution.readbackStatus || "", visible: true },
    { label: "对象 ID", value: execution.objectIdPresent ? "已返回" : "未返回", visible: true },
    { label: "允许重试", value: execution.retryAllowed ? "是" : "否", visible: true }
  ];
}

function latestReadinessFromNodes(bundle = {}) {
  const createNode = (bundle.nodes || []).find((node) => node.node_key === "std_project_create_executor") || {};
  const accountNode = (bundle.nodes || []).find((node) => node.node_key === "account_resource_prepare") || {};
  return createNode.output_summary?.createReadiness || accountNode.output_summary?.createReadiness || null;
}

function createReadinessView(bundle = {}, runtimeChecks = {}) {
  const persisted = latestReadinessFromNodes(bundle) || {};
  const createGate = ((bundle.nodes || []).find((node) => node.node_key === "std_project_create_executor") || {}).output_summary || {};
  const accountGate = ((bundle.nodes || []).find((node) => node.node_key === "account_resource_prepare") || {}).output_summary || {};
  const brandEventGate = createGate.oe3BrandEventReadonlyGate || accountGate.oe3BrandEventReadonlyGate || {};
  const brandIndustryRepair = createGate.oe3BrandIndustryRepair || accountGate.oe3BrandIndustryRepair || {};
  const gateStatuses = brandEventGate.gateStatuses || {};
  const brandIndustryStatus = persisted.brandIndustryStatus || brandIndustryRepair.brandIndustryStatus || gateStatuses.brand_industry || "not_run";
  const eventGateKeys = ["event_asset_detail", "available_events", "event_configs", "optimized_goal", "dbt"];
  const eventChainStatus = persisted.eventChainStatus || (eventGateKeys.every((key) => gateStatuses[key] === "passed") ? "passed" : "blocked");
  const latestAttemptNo = Number(bundle.platformAction?.attempt_no || 0);
  const currentAttemptNo = Number(bundle.executionPlan?.metadata?.create_attempt_no || bundle.executionPlan?.plan_version || 1);
  const maximumCreateAttempts = Number(bundle.executionPlan?.metadata?.maximum_create_attempts || 3);
  const hasCurrentCreateAttempt = latestAttemptNo >= currentAttemptNo;
  const correctiveAttemptAvailable = latestAttemptNo < currentAttemptNo && currentAttemptNo <= maximumCreateAttempts;
  const payloadContractStatus = runtimeChecks.payloadContract?.status || createGate.createReadiness?.payloadContractStatus || "waiting";
  const payloadHashStable = runtimeChecks.payloadContract?.expectedPayloadHash
    ? runtimeChecks.payloadContract.expectedPayloadHash === bundle.draft?.payload_hash
    : true;
  const inferredBlockers = [
    ...(brandIndustryStatus !== "passed" ? ["brand_industry_readback_blocked"] : []),
    ...(hasCurrentCreateAttempt ? [`std_project_create_attempt_${currentAttemptNo}_already_recorded`] : []),
    ...(payloadContractStatus !== "passed" ? ["payload_contract_blocked"] : []),
    ...(bundle.draft?.duplicate_status && bundle.draft.duplicate_status !== "platform_not_duplicate" ? ["duplicate_check_not_platform_not_duplicate"] : [])
  ];
  const blockers = hasCurrentCreateAttempt
    ? [...new Set([...(Array.isArray(persisted.blockers) ? persisted.blockers : []), ...inferredBlockers])]
    : (Array.isArray(persisted.blockers) ? persisted.blockers : inferredBlockers);
  const status = hasCurrentCreateAttempt
    ? "corrective_attempt_requires_new_payload_version"
    : (persisted.status || (
      brandIndustryStatus !== "passed"
        ? "blocked_brand_industry"
        : inferredBlockers.length
          ? "new_runtime_job_required"
          : "ready_for_user_create_confirmation"
    ));
  const canCreateCurrentJob = status === "ready_for_user_create_confirmation" && correctiveAttemptAvailable;
  const uniqueBlocker = hasCurrentCreateAttempt
    ? (brandIndustryStatus === "passed"
      ? `当前 attempt ${currentAttemptNo} 已消耗；修正参数后才能生成下一版本。`
      : `当前 attempt ${currentAttemptNo} 已消耗；brand_industry 仍未通过。`)
    : (persisted.uniqueBlocker || (
      canCreateCurrentJob
        ? "无"
        : brandIndustryStatus !== "passed"
          ? "brand_industry fresh readback 未通过"
          : blockers.join("；")
    ));
  const nextAction = hasCurrentCreateAttempt
    ? (brandIndustryStatus === "passed"
      ? (currentAttemptNo < maximumCreateAttempts
        ? "修正 payload 后生成下一 attempt 版本，再执行 readonly preflight。"
        : "已达到测试期创建次数上限，进入人工排障。")
      : "修完 brand_industry 后再生成下一 attempt 版本。")
    : (persisted.nextAction || (
      brandIndustryStatus !== "passed"
        ? "先修 brand_industry fresh readback。"
        : "等待用户单次创建确认任务。"
    ));
  return {
    status,
    statusLabel: statusLabel(status),
    currentState: statusLabel(bundle.job?.job_status || ""),
    uniqueBlocker,
    nextAction,
    canCreateCurrentJob,
    targetJobReusable: canCreateCurrentJob,
    retryAllowed: false,
    nextConfirmationRequired: canCreateCurrentJob,
    hasSingleCreateAttempt: latestAttemptNo > 0,
    currentAttemptNo,
    latestAttemptNo,
    maximumCreateAttempts,
    correctiveAttemptAvailable,
    brandIndustryStatus,
    eventChainStatus,
    payloadContractStatus: persisted.payloadContractStatus || payloadContractStatus,
    payloadHashStable: persisted.payloadHashStable ?? payloadHashStable,
    duplicateStatus: bundle.draft?.duplicate_status || "not_generated",
    platformActions: latestAttemptNo,
    createdObjects: bundle.createdObject ? 1 : 0,
    blockers: [...new Set(blockers)]
  };
}

function draftFields(bundle, runtimeChecks = {}) {
  const touchpoint = bundle.touchpoint || {};
  const backup = bundle.draft?.payload_summary?.backup_landing_page || {};
  const backupSource = bundle.backupLandingPage || {};
  const contract = runtimeChecks.payloadContract || {};
  const gate = runtimeChecks.prewriteGate || {};
  const gateGaps = Array.isArray(gate.gaps) ? gate.gaps.map((gap) => gap.message).join("；") : "";
  const draft = bundle.draft;
  if (!draft) {
    return [
      { label: "推广路线", value: bundle.job.route_id },
      { label: "创建对象", value: bundle.job.object_type },
      { label: "游戏标识", value: bundle.job.game_code },
      { label: "账户 ID", value: bundle.job.advertiser_id },
      { label: "触点状态", value: touchpoint.status || "未读取" },
      { label: "触点 Hash", value: touchpoint.url_hash || "未读取" },
      { label: "备用落地页", value: backupSource.status || "未读取" },
      { label: "备用页 Hash", value: backupSource.url_hash || "未读取" },
      { label: "payload 合同", value: contract.status || "等待草稿" },
      { label: "平台只读", value: gate.platformReadonlyApi?.status || "not_run" },
      { label: "创建前 gate", value: gate.status || "等待草稿" },
      { label: "素材包", value: bundle.materialPack?.pack?.pack_name || "等待读取" },
      { label: "证据", value: "仅保存脱敏摘要和 hash" }
    ];
  }

  return [
    { label: "推广路线", value: draft.payload_summary?.route_id || bundle.job.route_id },
    { label: "创建对象", value: draft.object_type },
    { label: "游戏标识", value: draft.payload_summary?.game_code || bundle.job.game_code },
    { label: "账户 ID", value: draft.payload_summary?.advertiser_id || bundle.job.advertiser_id },
    { label: "项目名", value: draft.project_name },
    { label: "触点状态", value: touchpoint.status || "未读取" },
    { label: "触点 Hash", value: touchpoint.url_hash || "未读取" },
    { label: "备用落地页", value: backup.present ? "已就绪" : (backupSource.status || "待解析") },
    { label: "备用页 Site", value: backup.site_id || backupSource.site_id || "未读取" },
    { label: "备用页 Hash", value: backup.url_hash || backupSource.url_hash || "未读取" },
    { label: "payload 合同", value: contract.status || "未检查" },
    { label: "平台只读", value: gate.platformReadonlyApi?.status || "not_run" },
    { label: "创建前 gate", value: gate.status || "未检查" },
    { label: "缺口", value: gateGaps || "无本地阻断缺口" },
    { label: "素材包", value: draft.payload_summary?.material_pack_id || "保底物料包" }
  ];
}

const PUBLIC_WORKFLOW_STATUSES = new Set([
  "waiting",
  "locked",
  "running",
  "passed",
  "needs_confirmation",
  "repairable",
  "blocked",
  "failed"
]);

function publicWorkflowStatus(status, fallback = "waiting") {
  if (PUBLIC_WORKFLOW_STATUSES.has(status)) return status;
  if (["created", "mock_created", "diagnosed", "readback_verified", "resolved"].includes(status)) return "passed";
  if (["draft_ready", "ready_for_user_create_confirmation"].includes(status)) return "needs_confirmation";
  if (status === "corrective_attempt_requires_new_payload_version") return "blocked";
  if (["created_pending_readback", "running"].includes(status)) return "running";
  if (["not_found_or_mismatch", "failed_or_unconfirmed", "failed_waiting_manual_review"].includes(status)) return "failed";
  if (String(status || "").startsWith("blocked")) return "blocked";
  if (String(status || "").startsWith("failed")) return "failed";
  return PUBLIC_WORKFLOW_STATUSES.has(fallback) ? fallback : "waiting";
}

function latestSkillRun(skillRuns = [], skillKeys = []) {
  for (const skillKey of skillKeys) {
    const matchingRuns = skillRuns.filter((run) => run.skill_key === skillKey);
    if (matchingRuns.length) return matchingRuns.at(-1);
  }
  return null;
}

function readbackStatus(bundle = {}) {
  const readback = bundle.readback || {};
  if (!readback.readback_status || String(readback.object_id || "").startsWith("PLACEHOLDER-")) return "waiting";
  return publicWorkflowStatus(readback.readback_status, "waiting");
}

function skillRunTraceView(run) {
  if (!run) return null;
  return {
    status: publicWorkflowStatus(run.status, "waiting"),
    inputHash: run.input_hash || "",
    outputSummary: publicView(run.output_summary || {}),
    blockers: publicView(run.blockers || []),
    evidenceRefs: publicView(run.evidence_refs || [])
  };
}

function publicTraceContract(values = []) {
  return values.map((value) => String(value)
    .replaceAll("touchpoint_url", "touchpoint")
    .replaceAll("landing_url", "landing_page"));
}

function childTraceView(descriptor, bundle) {
  const trace = descriptor.trace || {};
  return {
    type: trace.type || "derived",
    resolverRef: trace.resolverRef || "",
    selection: trace.selection || "resolver",
    inputContract: publicTraceContract(trace.inputContract || []),
    outputContract: publicTraceContract(trace.outputContract || []),
    stopConditions: publicTraceContract(trace.stopConditions || []),
    skills: (trace.skills || []).map((skill) => ({
      skillKey: skill.skillKey,
      nodeKey: skill.nodeKey,
      moduleRef: skill.moduleRef,
      inputContract: publicTraceContract(skill.inputContract || []),
      outputContract: publicTraceContract(skill.outputContract || []),
      stopConditions: publicTraceContract(skill.stopConditions || []),
      latestRun: skillRunTraceView(latestSkillRun(bundle.skillRuns || [], [skill.skillKey]))
    }))
  };
}

function currentAccountStatus(bundle = {}) {
  const account = bundle.account || {};
  if (!account.advertiser_id) return "blocked";
  if (account.auth_status === "ready") return "passed";
  return account.auth_status ? "blocked" : "waiting";
}

function currentMonitorTouchpointStatus(bundle = {}) {
  const readiness = bundle.monitorReadiness || {};
  if (readiness.touchpoint_ref_present === true &&
      readiness.touchpoint_url_present === true &&
      readiness.readback_verified === true) return "passed";
  const blocker = String(readiness.actionable_blocker_code || "");
  if (blocker.startsWith("touchpoint_") || readiness.readiness_status === "needs_touchpoint_readback") return "blocked";
  return "waiting";
}

function currentMonitorStatus(bundle = {}) {
  const readiness = bundle.monitorReadiness || {};
  if (readiness.monitor_ready === true) return "passed";
  if (readiness.actionable_blocker_code) return "blocked";
  return "waiting";
}

function childStatus({ descriptor, node, bundle, executionAvailability, currentCaseReadiness = false }) {
  const source = descriptor.statusSource || {};
  const nodeFallback = publicWorkflowStatus(node.status, "waiting");
  if (source.kind === "node_status") return nodeFallback;
  if (currentCaseReadiness && source.kind === "current_account_readiness") {
    return currentAccountStatus(bundle);
  }
  if (currentCaseReadiness && source.kind === "monitor_touchpoint_readiness") {
    return currentMonitorTouchpointStatus(bundle);
  }
  if (currentCaseReadiness && source.kind === "monitor_readiness") {
    return currentMonitorStatus(bundle);
  }
  if (source.kind === "latest_skill" || source.skillKeys?.length) {
    const run = latestSkillRun(bundle.skillRuns || [], source.skillKeys || []);
    return run ? publicWorkflowStatus(run.status, nodeFallback) : nodeFallback;
  }
  if (source.kind === "execution_grant") {
    const currentPlanKind = bundle.executionPlan?.plan_kind || bundle.executionPlan?.planKind || bundle.executionPlan?.metadata?.plan_kind || "";
    if (currentPlanKind !== PLAN_KIND_STD_PROJECT_CREATE) return "waiting";
    if (executionAvailability.canExecuteOnce) return "passed";
    if (executionAvailability.alreadyAttempted) return "locked";
    return nodeFallback === "waiting" ? "waiting" : "locked";
  }
  if (source.kind === "created_object") {
    const status = bundle.platformAction?.action_status || bundle.createdObject?.object_status || "waiting";
    return publicWorkflowStatus(status, "waiting");
  }
  if (source.kind === "readback_consistency") return readbackStatus(bundle);
  if (source.kind === "readback_evidence") {
    const status = readbackStatus(bundle);
    if (status === "passed" && !bundle.readback?.evidence_ref) return "running";
    return status;
  }
  return nodeFallback;
}

function childView(node, bundle, executionAvailability, presentation = {}) {
  return (node.children || []).map((descriptor) => {
    const status = childStatus({
      descriptor,
      node,
      bundle,
      executionAvailability,
      currentCaseReadiness: presentation.currentCaseReadiness === true
    });
    const videoCount = descriptor.id === "resource-video_asset"
      ? (bundle.resources || []).filter((resource) => resource.resource_type === "video_asset").length
      : 0;
    return {
      id: descriptor.id,
      label: videoCount > 1 ? `${descriptor.label} × ${videoCount}` : descriptor.label,
      status,
      statusLabel: statusLabel(status),
      trace: childTraceView(descriptor, bundle)
    };
  });
}

function workflowPhasesView(nodes = [], bundle = null, executionAvailability = {}, presentation = {}) {
  return PHASES.map((phase) => ({
    ...phase,
    nodes: nodes.filter((node) => node.phase === phase.title).map((node) => ({
      id: node.nodeKey,
      number: node.number,
      name: node.nodeName,
      status: node.status || "waiting",
      statusLabel: statusLabel(node.status || "waiting"),
      subflows: node.subflows,
      children: bundle
        ? childView(node, bundle, executionAvailability, presentation)
        : (node.children || []).map((child) => ({
          id: child.id,
          label: child.label,
          status: "waiting",
          statusLabel: statusLabel("waiting")
        })),
      detail: node.detail || "等待执行。",
      output: node.output,
      readonlyChecks: node.outputSummary?.checks || [],
      outputSummary: node.outputSummary || {}
    }))
  }));
}

function activeCaseView(summary = {}) {
  const rootBlockerCodes = Array.isArray(summary.root_blocker_codes) ? summary.root_blocker_codes : [];
  return {
    caseId: summary.case_id || "",
    advertiserId: summary.advertiser_id || "",
    routeId: summary.route_id || "",
    gameCode: summary.game_code || "",
    currentGate: summary.current_gate || "",
    rootBlockerCode: rootBlockerCodes[0] || "",
    suggestedNextAction: summary.suggested_next_action || "",
    updatedAt: summary.latest_job_updated_at || summary.updated_at || "",
    latestJobId: summary.latest_job_id || "",
    caseUrl: workbenchCaseUrl(summary.case_id),
    jobUrl: summary.latest_job_id ? workbenchJobUrl(summary.latest_job_id) : ""
  };
}

export function buildWorkbenchView({ activeCases = [] } = {}) {
  const nodes = WORKFLOW_NODES.map((node) => ({
    ...node,
    status: "waiting",
    detail: "等待规范化输入。",
    outputSummary: {}
  }));
  return publicView({
    state: "idle",
    workbenchUrl: workbenchHomeUrl(),
    activeCases: (activeCases || []).map(activeCaseView),
    intake: {
      prompt: "请提供推广路线、游戏标识和账户 ID；可分多条消息输入。",
      requiredFields: WORKBENCH_INTAKE_FIELDS
    },
    phases: workflowPhasesView(nodes)
  });
}

function rootBlockerPresentation(code = "") {
  const catalog = {
    monitor_create_busy_retry_exhausted: {
      title: "monitor 创建周期已耗尽",
      reason: "目标账户尚无 monitor 与触点；历史周期的两次创建均因服务端繁忙失败。",
      nextActionLabel: "先执行 fresh readonly 查询；若仍缺失，另建 monitor 专项 Task 并取得单次写入授权。"
    },
    monitor_id_missing: {
      title: "缺少 monitor ID",
      reason: "创建上下文未获得目标账户的 monitor。",
      nextActionLabel: "执行 monitor 只读核验或进入受控 monitor 专项流程。"
    },
    monitor_readonly_reconcile_required: {
      title: "需要刷新 monitor 只读状态",
      reason: "当前账户缺少可验证的 monitor 回查证据。",
      nextActionLabel: "执行一次 fresh readonly monitor 回查。"
    },
    touchpoint_url_missing: {
      title: "缺少触点",
      reason: "当前 monitor 尚未回查出受控触点。",
      nextActionLabel: "完成 monitor 回查后重新执行只读就绪检查。"
    },
    touchpoint_url_hash_mismatch: {
      title: "触点完整性校验未通过",
      reason: "已读取到触点，但受控触点与平台 hash 未通过一致性校验。",
      nextActionLabel: "执行一次 fresh readonly monitor 回查；不得创建或重试。"
    },
    credential_required: {
      title: "平台只读凭据不可用",
      reason: "当前只读校验无法继续；若已有已确认资源 Plan，旧 Plan 不可重试。",
      nextActionLabel: "凭据恢复后输入“重新只读准备”，以 fresh Job 重新核验；不会确认或创建平台对象。"
    },
    confirmed_resource_execution_interrupted: {
      title: "资源执行中断，等待只读恢复",
      reason: "已确认资源 Plan 在平台响应未明确时停止；旧 Plan 已消费且禁止重试。",
      nextActionLabel: "输入“重新只读准备”创建 fresh Job，只读核验后再决定新的 Plan。"
    },
    created_object_readback_pending: {
      title: "项目已创建，等待平台 API 可见",
      reason: "创建接口已返回对象 ID，但权威 list 回查尚未确认对象 ID 与草稿名称一致。",
      nextActionLabel: "输入“继续执行”进行一次只读回查；不会再次创建项目。"
    },
    event_asset_provision_not_plan_eligible: {
      title: "事件资产尚无当前账户合同",
      reason: "目标账户事件资产的模板或账户绑定未通过校验。",
      nextActionLabel: "建立账户级合同并完成只读前提核验后，再生成单次事件资产 Plan。"
    }
  };
  return { code, ...(catalog[code] || {
    title: code ? "存在待处理阻断" : "无阻断",
    reason: code ? "请按当前 Case 的建议动作完成修复后重新只读核验。" : "",
    nextActionLabel: code ? "查看 Gate 建议动作。" : ""
  }) };
}

function caseGateView(summary = null, jobId = "") {
  const isLatestCaseJob = Boolean(summary?.latest_job_id && summary.latest_job_id === jobId);
  const rootBlockerCode = Array.isArray(summary?.root_blocker_codes) ? summary.root_blocker_codes[0] || "" : "";
  const publicBlockerCode = (value = "") => String(value)
    .replaceAll("touchpoint_url", "touchpoint")
    .replaceAll("landing_url", "landing_page");
  const rootBlocker = rootBlockerPresentation(rootBlockerCode);
  return {
    currentGate: summary?.current_gate || "",
    rootBlockerCodes: Array.isArray(summary?.root_blocker_codes)
      ? summary.root_blocker_codes.map(publicBlockerCode)
      : [],
    rootBlocker: {
      ...rootBlocker,
      code: publicBlockerCode(rootBlocker.code)
    },
    suggestedNextAction: publicBlockerCode(summary?.suggested_next_action || ""),
    lifecycleStatus: summary?.lifecycle_status || "",
    monitorResolved: summary?.monitor_resolved === true,
    isLatestCaseJob
  };
}

function primaryActionView(bundle = {}, createReadiness = {}, executionAvailability = {}) {
  const alreadyAttempted = executionAvailability.alreadyAttempted || createReadiness.hasSingleCreateAttempt;
  if (alreadyAttempted) {
    return { kind: "disabled", label: "禁止重试", enabled: false };
  }
  if (executionAvailability.canExecuteOnce && createReadiness.canCreateCurrentJob) {
    return { kind: "execute_once", label: "确认创建", enabled: true };
  }
  const terminal = Boolean(bundle.platformAction || bundle.createdObject) ||
    ["created_pending_readback", "failed_waiting_manual_review"].includes(bundle.job?.job_status);
  return {
    kind: terminal ? "disabled" : "run",
    label: terminal ? "禁止重试" : "开始执行",
    enabled: !terminal
  };
}

function persistedCreateSucceeded(bundle = {}) {
  return Boolean(bundle.createdObject?.object_id) &&
    bundle.platformAction?.object_id_present === true &&
    ["succeeded", "mock_succeeded"].includes(bundle.platformAction?.action_status);
}

function projectCreatedNodeStatus(nodeKey, row = {}, bundle = {}) {
  if (nodeKey === "readback_closer" && bundle.readback?.readback_status === "readback_verified") {
    return {
      ...row,
      status: "passed",
      summary: "真实对象名与对象 ID 回查一致，已完成收口。",
      diagnostic_level: "info",
      output_summary: {
        ...(row.output_summary || {}),
        readbackStatus: "readback_verified",
        realPlatformReadbackCalled: true,
        objectNameMatchesDraft: true
      }
    };
  }
  if (!persistedCreateSucceeded(bundle)) return row;
  if (nodeKey === "std_project_draft_builder") {
    return {
      ...row,
      status: "passed",
      summary: "创建草稿已确认并进入创建/回查闭环。",
      diagnostic_level: "info",
      output_summary: {
        ...(row.output_summary || {}),
        confirmed_create_projection: true,
        retry_allowed: false
      }
    };
  }
  if (nodeKey === "std_project_create_executor") {
    return {
      ...row,
      status: "passed",
      summary: "真实 std_project/create 已单次执行，已返回对象 ID，等待或执行回查。",
      diagnostic_level: "info",
      output_summary: {
        ...(row.output_summary || {}),
        createNodeStatus: "created_pending_readback",
        createCalled: bundle.platformAction?.action_status === "succeeded",
        mockCreateCalled: bundle.platformAction?.action_status === "mock_succeeded",
        realPlatformWriteCalled: bundle.platformAction?.action_status === "succeeded",
        objectIdPresent: true,
        retryAllowed: false,
        nextConfirmationRequired: false
      }
    };
  }
  return row;
}

export function buildLaunchJobView(bundle, runtimeChecks = {}, executionAvailability = {}, awemeReadiness = null, caseSummary = null, presentation = {}) {
  const dbNodes = nodeMap(bundle.nodes || []);
  const nodes = WORKFLOW_NODES.map((node) => {
    const row = projectCreatedNodeStatus(node.nodeKey, dbNodes.get(node.nodeKey) || {}, bundle);
    return {
      ...node,
      status: row.status || "waiting",
      summary: row.summary || "等待执行。",
      detail: row.summary || "等待执行。",
      diagnosticLevel: row.diagnostic_level || "pending",
      outputSummary: row.output_summary || {},
      evidenceRefs: row.evidence_refs || []
    };
  });
  const caseGate = caseGateView(caseSummary, bundle.job.job_id);
  const phases = workflowPhasesView(nodes, bundle, executionAvailability, {
    currentCaseReadiness: caseGate.isLatestCaseJob && presentation.currentCaseReadiness !== false
  });
  const diagnostics = diagnosticsFromNodes(nodes);
  const execution = executionView(bundle);
  const createReadiness = createReadinessView(bundle, runtimeChecks);
  const actions = actionView(bundle, createReadiness);
  const primaryAction = primaryActionView(bundle, createReadiness, executionAvailability);
  const confirmationPreview = buildConfirmationPreview(bundle, caseSummary);
  const fallbackNextAction = createReadiness.nextAction || nextActionForBundle(bundle);
  const completedCase = caseGate.isLatestCaseJob && caseGate.currentGate === "first_std_project_create_completed";
  const headline = {
    title: bundle.draft?.project_name || bundle.job.job_id,
    status: bundle.job.job_status,
    statusLabel: completedCase ? "已完成" : statusLabel(bundle.job.job_status),
    nextAction: completedCase
      ? "已完成，无需继续执行"
      : caseGate.currentGate
      ? (caseGate.isLatestCaseJob ? caseGate.suggestedNextAction : "历史运行，只读查看。")
      : fallbackNextAction
  };
  const workflow = phases.map((phase) => ({
    phase: phase.title,
    nodes: phase.nodes.map((node) => ({
      number: node.number,
      name: node.name,
      status: node.status,
      statusLabel: node.statusLabel
    }))
  }));
  const summaryFields = [
    ...summaryFieldsView(bundle, execution),
    { label: "创建就绪", value: createReadiness.statusLabel || createReadiness.status, visible: true },
    { label: "当前 Gate", value: caseGate.currentGate || "未投影", visible: true },
    { label: "唯一阻断", value: caseGate.rootBlockerCodes[0] || "无", visible: true },
    { label: "下一步", value: headline.nextAction, visible: true }
  ];

  return publicView({
    jobId: bundle.job.job_id,
    caseId: bundle.job.case_id,
    isLatestCaseJob: caseGate.isLatestCaseJob,
    caseGate,
    updatedAt: bundle.job.updated_at || bundle.job.created_at,
    headline,
    agent: {
      name: "投放创建 Agent",
      status: bundle.job.job_status,
      statusText: completedCase ? "已完成" : statusLabel(bundle.job.job_status),
      mode: modeForStatus(bundle.job.job_status),
      writePolicy: bundle.route.write_policy === "confirm_required" ? "确认占位" : bundle.route.write_policy
    },
    intake: {
      routeId: bundle.job.route_id,
      gameCode: bundle.job.game_code,
      advertiserId: bundle.job.advertiser_id,
      sourceRecordRef: bundle.job.source_record_ref || "",
      missingFields: [],
      requiredFields: WORKBENCH_INTAKE_FIELDS
    },
    touchpoint: {
      touchpointRef: bundle.touchpoint?.touchpoint_ref || "",
      urlHash: bundle.touchpoint?.url_hash || "",
      status: bundle.touchpoint?.status || "missing"
    },
    awemeAuthorization: {
      routeId: awemeReadiness?.route_id || bundle.job.route_id,
      gameCode: awemeReadiness?.game_code || bundle.job.game_code,
      advertiserId: awemeReadiness?.advertiser_id || bundle.job.advertiser_id,
      required: awemeReadiness?.required === true,
      configured: awemeReadiness?.configured === true,
      verificationStatus: awemeReadiness?.verification_status || "not_verified",
      ready: awemeReadiness?.ready === true,
      blockerCode: awemeReadiness?.blocker_code || "",
      nextAction: awemeReadiness?.next_action || "run_node4_aweme_authorization_readonly_for_default_aweme",
      defaultAwemeIdHash: awemeReadiness?.default_aweme_id_hash || "",
      verifiedAt: awemeReadiness?.verified_at || "",
      expiresAt: awemeReadiness?.expires_at || "",
      evidenceRef: awemeReadiness?.evidence_ref || ""
    },
    backupLandingPage: {
      landingPageAssetId: bundle.draft?.payload_summary?.backup_landing_page?.landing_page_asset_id || bundle.backupLandingPage?.landing_page_asset_id || "",
      siteId: bundle.draft?.payload_summary?.backup_landing_page?.site_id || bundle.backupLandingPage?.site_id || "",
      siteName: bundle.backupLandingPage?.site_name || "",
      urlHash: bundle.draft?.payload_summary?.backup_landing_page?.url_hash || bundle.backupLandingPage?.url_hash || "",
      status: bundle.backupLandingPage?.status || "missing",
      present: bundle.draft?.payload_summary?.backup_landing_page?.present === true,
      targetVisible: bundle.draft?.payload_summary?.backup_landing_page?.target_visible === true,
      readbackVerified: bundle.draft?.payload_summary?.backup_landing_page?.readback_verified === true
    },
    payloadContract: runtimeChecks.payloadContract || {
      status: "waiting",
      summary: "等待草稿生成后执行 payload 合同检查。",
      checks: [],
      gaps: []
    },
    prewriteGate: runtimeChecks.prewriteGate || {
      status: "waiting",
      canCreate: false,
      writeMode: "placeholder_only",
      summary: "等待创建前 gate 检查。",
      checks: [],
      gaps: []
    },
    createReadiness,
    executionAvailability: {
      status: executionAvailability.status || "unavailable",
      canExecuteOnce: executionAvailability.canExecuteOnce === true,
      alreadyAttempted: executionAvailability.alreadyAttempted === true,
      authorizationMode: executionAvailability.authorizationMode || "none",
      reasonCode: executionAvailability.reasonCode || ""
    },
    primaryAction,
    confirmationPreview,
    platformReadonly: {
      status: runtimeChecks.prewriteGate?.platformReadonlyApi?.status || "not_run",
      credentialStatus: runtimeChecks.prewriteGate?.platformReadonlyApi?.credentialStatus || "unknown",
      duplicateStatus: runtimeChecks.prewriteGate?.platformReadonlyApi?.duplicateStatus || "waiting",
      credentialBlockers: runtimeChecks.platformReadonly?.credential?.blockers || []
    },
    chat: [
      { role: "agent", text: "请提供推广路线、游戏标识和账户 ID。" },
      { role: "agent", text: `${bundle.job.route_id} / ${bundle.job.game_code} / ${bundle.job.advertiser_id}` },
      { role: "agent", text: headline.nextAction }
    ],
    phases,
    workflow,
    summaryFields,
    diagnostics,
    skills: {
      runCount: (bundle.skillRuns || []).length,
      latest: (bundle.skillRuns || []).slice(-30).map((run) => ({
        skillKey: run.skill_key,
        nodeKey: run.node_key,
        status: run.status,
        blockers: run.blockers || [],
        outputSummary: run.output_summary || {},
        evidenceRefs: run.evidence_refs || []
      }))
    },
    draft: {
      objectType: bundle.job.object_type,
      projectName: bundle.draft?.project_name || "等待生成",
      routeId: bundle.job.route_id,
      gameCode: bundle.job.game_code,
      duplicateStatus: bundle.draft?.duplicate_status || "未生成",
      payloadHash: bundle.draft?.payload_hash || "等待生成",
      writePolicy: bundle.draft?.write_policy || "confirm_required_placeholder_only",
      fields: draftFields(bundle, runtimeChecks)
    },
    readback: bundle.readback ? {
      objectType: bundle.readback.object_type,
      objectId: bundle.readback.object_id,
      objectName: bundle.readback.object_name,
      status: bundle.readback.readback_status,
      evidenceRef: bundle.readback.evidence_ref
    } : null,
    execution,
    actions
  });
}

async function buildPublicJobView(repo, bundle, { projectStatePath, currentCaseReadiness = true } = {}) {
  const [runtimeChecks, executionAvailability, awemeReadiness, caseSummary] = await Promise.all([
    buildRuntimeChecks(repo, bundle),
    getExecutionGrantAvailability({ repo, bundle, projectStatePath }),
    repo.getAdvertiserAwemeAuthorizationReadiness({
      routeId: bundle.job.route_id,
      gameCode: bundle.job.game_code,
      advertiserId: bundle.job.advertiser_id
    }),
    repo.getWorkflowCaseSummary(bundle.job.case_id)
  ]);
  return buildLaunchJobView(bundle, runtimeChecks, executionAvailability, awemeReadiness, caseSummary, {
    currentCaseReadiness
  });
}

export async function getJobView(repo, jobId, options = {}) {
  const bundle = await repo.getLaunchJobBundle(jobId);
  if (!bundle) return null;
  return buildPublicJobView(repo, bundle, options);
}

function workflowCaseId(caseKey) {
  return `CASE-MWBV2-${hashText(`${caseKey}:${Date.now()}:${randomBytes(4).toString("hex")}`).slice(0, 18).toUpperCase()}`;
}

function requiredCaseScope(body = {}, intake = {}) {
  return {
    routeId: body.route_id || body.routeId || intake.route_id,
    gameCode: String(body.game_code || body.gameCode || intake.game_code || "").toUpperCase(),
    advertiserId: body.advertiser_id || body.advertiserId || intake.advertiser_id,
    sourceUsage: body.source_usage || body.sourceUsage || "runtime_truth"
  };
}

export async function createWorkflowCase(repo, body = {}) {
  const intake = parseLaunchIntake(body.user_intent || body.userIntent || "");
  const { routeId, gameCode, advertiserId, sourceUsage } = requiredCaseScope(body, intake);
  const caseKey = String(body.case_key || body.caseKey || "").trim();
  const businessGoal = String(body.business_goal || body.businessGoal || "").trim();
  const missingFields = [];
  if (!caseKey) missingFields.push("case_key");
  if (!routeId) missingFields.push("route_id");
  if (!gameCode) missingFields.push("game_code");
  if (!advertiserId) missingFields.push("advertiser_id");
  if (missingFields.length) {
    const error = new Error("missing_required_fields");
    error.statusCode = 400;
    error.details = { missingFields };
    throw error;
  }
  const context = await repo.getCoreContext({ routeId, gameCode, advertiserId });
  if (!context) {
    const error = new Error("core_context_not_found");
    error.statusCode = 404;
    throw error;
  }
  const existing = await repo.getWorkflowCaseByKey(caseKey);
  if (existing) {
    if (existing.route_id === routeId && existing.game_code === gameCode && existing.advertiser_id === advertiserId &&
      existing.source_usage === "runtime_truth" && existing.lifecycle_status === "active") {
      return { ...existing, reusedActiveCase: true, workbenchUrl: workbenchCaseUrl(existing.case_id) };
    }
    const error = new Error("workflow_case_key_already_exists");
    error.statusCode = 409;
    error.details = { caseId: existing.case_id };
    throw error;
  }
  if (sourceUsage === "runtime_truth") {
    const active = await repo.getActiveRuntimeWorkflowCase({ routeId, gameCode, advertiserId });
    if (active) return { ...active, reusedActiveCase: true, workbenchUrl: workbenchCaseUrl(active.case_id) };
  }
  try {
    return await repo.createWorkflowCase({
      caseId: workflowCaseId(caseKey),
      caseKey,
      routeId,
      gameCode,
      advertiserId,
      businessGoal,
      sourceUsage,
      metadata: { created_via: "workflow_case_api_or_cli" }
    });
  } catch (error) {
    if (sourceUsage !== "runtime_truth") throw error;
    const active = await repo.getActiveRuntimeWorkflowCase({ routeId, gameCode, advertiserId });
    if (active) return { ...active, reusedActiveCase: true, workbenchUrl: workbenchCaseUrl(active.case_id) };
    throw error;
  }
}

async function resolveCaseForNewJob(repo, { body, routeId, gameCode, advertiserId, sourceUsage, sourceRecordRef }) {
  const caseId = String(body.case_id || body.caseId || "").trim();
  if (caseId) {
    const scope = await repo.assertWorkflowCaseScope({ caseId, routeId, gameCode, advertiserId, sourceUsage });
    if (scope.status === "not_found") {
      const error = new Error("workflow_case_not_found");
      error.statusCode = 404;
      throw error;
    }
    if (scope.status !== "passed") {
      const error = new Error("workflow_case_scope_invalid");
      error.statusCode = 409;
      error.details = { blockers: scope.blockers || [] };
      throw error;
    }
    return scope.workflowCase;
  }

  // Test runs are disposable fixtures, not business workflow cases. Keep the
  // fixture creation local to the runner while requiring every runtime job to
  // explicitly select a durable case.
  if (sourceUsage === "test_run") {
    const fixtureKey = `test.${hashText(`${routeId}:${gameCode}:${advertiserId}:${sourceRecordRef || Date.now()}`).slice(0, 24)}`;
    return repo.createWorkflowCase({
      caseId: workflowCaseId(fixtureKey),
      caseKey: fixtureKey,
      routeId,
      gameCode,
      advertiserId,
      businessGoal: "Disposable test fixture.",
      sourceUsage: "test_run",
      metadata: { fixture: true }
    });
  }
  const error = new Error("case_id_required_for_runtime_job");
  error.statusCode = 400;
  throw error;
}

export async function createJob(repo, body = {}) {
  const intake = parseLaunchIntake(body.user_intent || body.userIntent || "");
  const routeId = body.route_id || body.routeId || intake.route_id;
  const gameCode = String(body.game_code || body.gameCode || intake.game_code || "").toUpperCase();
  const advertiserId = body.advertiser_id || body.advertiserId || intake.advertiser_id;
  const sourceUsage = body.source_usage || body.sourceUsage || "runtime_truth";
  const sourceRecordRef = body.source_record_ref || body.sourceRecordRef || intake.source_record_ref;
  const missingFields = [];
  if (!routeId) missingFields.push("route_id");
  if (!gameCode) missingFields.push("game_code");
  if (!advertiserId) missingFields.push("advertiser_id");
  if (missingFields.length) {
    const error = new Error("missing_required_fields");
    error.statusCode = 400;
    error.details = { missingFields };
    throw error;
  }

  const context = await repo.getCoreContext({ routeId, gameCode, advertiserId });
  if (!context) {
    const error = new Error("core_context_not_found");
    error.statusCode = 404;
    throw error;
  }

  const workflowCase = await resolveCaseForNewJob(repo, {
    body,
    routeId,
    gameCode,
    advertiserId,
    sourceUsage,
    sourceRecordRef
  });

  const nowStamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const jobId = `JOB-MWBV2-${nowStamp}-${hashText(`${routeId}:${gameCode}:${advertiserId}:${Date.now()}:${randomBytes(4).toString("hex")}`).slice(0, 6).toUpperCase()}`;
  await repo.createLaunchJob({
    jobId,
    caseId: workflowCase.case_id,
    routeId,
    gameCode,
    advertiserId,
    objectType: context.route.object_type,
    sourceRecordRef,
    sourceUsage
  });
  await repo.upsertNodeRuns(jobId, initialNodeRuns());
  const bundle = await repo.getLaunchJobBundle(jobId);
  return buildPublicJobView(repo, bundle);
}

export async function createReadonlyRecoveryJob(repo, predecessorJob = {}) {
  if (!repo || typeof repo.createReadonlyRecoveryLaunchJobOnce !== "function") {
    throw new Error("readonly_recovery_repository_unavailable");
  }
  const predecessorJobId = String(predecessorJob.job_id || "").trim();
  const caseId = String(predecessorJob.case_id || "").trim();
  if (!predecessorJobId || !caseId) throw new Error("readonly_recovery_predecessor_required");
  const recoveryJobId = `JOB-MWBV2-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${hashText(`${caseId}:${predecessorJobId}:${Date.now()}:${randomBytes(4).toString("hex")}`).slice(0, 6).toUpperCase()}`;
  const sourceRecordRef = `workbench:readonly-recovery:${predecessorJobId}`;
  const claimed = await repo.createReadonlyRecoveryLaunchJobOnce({
    recoveryJobId,
    predecessorJobId,
    caseId,
    sourceRecordRef
  });
  const job = claimed?.job || null;
  if (!job?.job_id) return { created: false, jobId: "" };
  if (claimed.created === true) await repo.upsertNodeRuns(job.job_id, initialNodeRuns());
  return { created: claimed.created === true, jobId: job.job_id };
}

export function resolveReadonlyDependencyForRun(options = {}) {
  if (Object.prototype.hasOwnProperty.call(options, "allowReadonlyDependency")) {
    return options.allowReadonlyDependency === true;
  }
  return readonlyPermissionState({ projectStatePath: options.projectStatePath }).allowed;
}

export async function runJob(repo, jobId, options = {}) {
  const bundle = await repo.getLaunchJobBundle(jobId);
  if (!bundle) {
    const error = new Error("job_not_found");
    error.statusCode = 404;
    throw error;
  }
  const allowReadonlyDependency = resolveReadonlyDependencyForRun(options);
  const result = await runOe3WorkflowSkills({
    repo,
    jobId,
    mode: options.mode || "dry_run",
    mockReady: options.mockReady === true,
    mockExecute: options.mockExecute === true,
    allowNetworkWrite: options.allowNetworkWrite === true,
    allowReadonlyDependency,
    confirmationIntent: options.confirmationIntent || "",
    confirmVariableValue: options.confirmVariableValue || "",
    grantSource: options.grantSource || "",
    executionGrantId: options.executionGrantId || "",
    fetchImpl: options.fetchImpl || globalThis.fetch,
    env: options.env || process.env,
    allowedPlanActions: options.allowedPlanActions || [],
    mockMonitorEnsure: options.mockMonitorEnsure === true,
    qiankunOwnerKey: options.qiankunOwnerKey || "",
    createAttemptNo: options.createAttemptNo || 1,
    verificationSeriesId: options.verificationSeriesId || "",
    verificationTaskRef: options.verificationTaskRef || "",
    maximumCreateAttempts: options.maximumCreateAttempts || 3,
    singleVariableExperiment: options.singleVariableExperiment || {},
    expectedPlanId: options.expectedPlanId || "",
    expectedPlanHash: options.expectedPlanHash || "",
    confirmedPlanExecution: options.confirmedPlanExecution === true,
    projectStatePath: options.projectStatePath
  });
  const view = await buildPublicJobView(repo, result.bundle, options);
  if (options.includeExecutionSummary === true) {
    return {
      view,
      runSummary: {
        createCalled: result.summary?.noRealPlatformWrite !== true
      }
    };
  }
  return view;
}
