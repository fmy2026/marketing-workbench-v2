import { createHash, randomBytes } from "node:crypto";
import { parseLaunchIntake, hashText } from "../agents/launchAgent.mjs";
import { buildConfirmPlaceholder, buildReadbackPlaceholder } from "../platforms/oceanenginePlaceholder.mjs";
import { createOceanEngineReadonlyClient } from "../platforms/oceanengineReadonlyClient.mjs";
import { evaluateOceanEnginePrewriteReadiness, runOceanEngineReadonlyProbes } from "../platforms/oceanengineReadonlyAdapter.mjs";
import { evaluateStdProjectPayloadContract, stablePayloadHash } from "../platforms/oceanengineStdProjectPayloadContract.mjs";
import {
  allocateProjectSequence,
  buildStdProjectName,
  buildStdProjectNamePrefix,
  cstYyyymmdd
} from "./stdProjectNameBuilder.mjs";

export const WORKFLOW_NODES = [
  {
    order: "01",
    number: 1,
    nodeKey: "launch_intake",
    nodeName: "Intake 规范",
    phase: "准备阶段",
    output: "launch_intake",
    subflows: ["路线归一", "游戏识别", "账户识别"]
  },
  {
    order: "02",
    number: 2,
    nodeKey: "creation_context",
    nodeName: "创建上下文装配",
    phase: "准备阶段",
    output: "creation_context",
    subflows: ["账户状态", "触点引用", "monitor_id", "平台 app"]
  },
  {
    order: "03",
    number: 3,
    nodeKey: "game_launch_pack",
    nodeName: "游戏保底包解析",
    phase: "准备阶段",
    output: "game_launch_pack",
    subflows: ["游戏主档", "路线默认值", "保底物料包"]
  },
  {
    order: "04",
    number: 4,
    nodeKey: "account_resource_prepare",
    nodeName: "账户资源诊断与补齐",
    phase: "就绪阶段",
    output: "account_ready_report",
    subflows: ["头像", "DMP", "事件链", "视频可见性", "产品图"]
  },
  {
    order: "05",
    number: 5,
    nodeKey: "std_project_draft_builder",
    nodeName: "创建草稿生成",
    phase: "就绪阶段",
    output: "creation_draft",
    subflows: ["项目名", "草稿摘要", "稳定 Hash", "查重"]
  },
  {
    order: "06",
    number: 6,
    nodeKey: "std_project_create_executor",
    nodeName: "创建执行",
    phase: "创建执行",
    output: "created_object",
    subflows: ["确认占位", "写入禁用", "边界锁定"]
  },
  {
    order: "07",
    number: 7,
    nodeKey: "readback_closer",
    nodeName: "回查收口",
    phase: "创建执行",
    output: "readback_verified",
    subflows: ["回查占位", "字段一致性", "证据归档"]
  }
];

const PHASES = [
  { id: "prepare", title: "准备阶段", summary: "需求、上下文、保底包。" },
  { id: "ready", title: "就绪阶段", summary: "资源诊断与草稿。" },
  { id: "execute", title: "创建执行", summary: "确认、执行、回查。" }
];

const TERMINAL_STATUSES = new Set(["passed", "repairable", "needs_confirmation", "blocked", "locked", "failed"]);

function contentHash(value) {
  return `sha256:${createHash("sha256").update(String(value)).digest("hex")}`;
}

function hashJson(value) {
  return stablePayloadHash(value);
}

const PUBLIC_FORBIDDEN_KEY = /(touchpoint_url|raw_payload|raw_response|token|secret|auth_code|cookie)/i;
const PUBLIC_FORBIDDEN_VALUE = /(tf-api\.3k\.com|callback\/click|Bearer\s+[A-Za-z0-9._-]{20,})/i;

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
  return value;
}

function nodeStatus({ nodeKey, status, summary, diagnosticLevel = "info", outputSummary = {}, evidenceRefs = [] }) {
  const node = WORKFLOW_NODES.find((item) => item.nodeKey === nodeKey);
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

function has(value) {
  return value !== null && value !== undefined && value !== "";
}

function resourceDiagnosis(resources = []) {
  const required = resources.filter((resource) => resource.required === true);
  const missing = ["avatar", "dmp_audience_package", "event_asset", "video_asset", "product_image", "brand_info", "micro_app_instance"]
    .filter((kind) => !required.some((resource) => resource.resource_type === kind));
  const blocked = required.filter((resource) => resource.visibility_status === "not_visible");
  const needsAttention = required.filter((resource) => (
    resource.visibility_status === "pending" ||
    resource.visibility_status === "needs_confirmation" ||
    resource.readback_status === "pending" ||
    resource.readback_status === "needs_confirmation" ||
    resource.readback_status === "not_checked"
  ));

  if (missing.length || blocked.length) {
    const gaps = [
      ...missing.map((kind) => `缺少 ${kind}`),
      ...blocked.map((resource) => `${resource.resource_type} 不可见`)
    ];
    return {
      status: "blocked",
      level: "error",
      summary: `账户资源阻断：${gaps.join("；")}。`,
      gaps
    };
  }
  if (needsAttention.length) {
    const gaps = needsAttention.map((resource) => `${resource.resource_type} visibility=${resource.visibility_status} readback=${resource.readback_status}`);
    return {
      status: "repairable",
      level: "warning",
      summary: `账户资源有 ${needsAttention.length} 项待确认或待回查：${gaps.join("；")}。`,
      gaps
    };
  }
  return {
    status: "passed",
    level: "info",
    summary: "账户资源均已通过本地最小真值检查。",
    gaps: []
  };
}

function outputForNode(nodeKey, bundle, runtimeChecks = {}) {
  const resourceChecks = (runtimeChecks.prewriteGate?.checks || []).filter((item) => item.resourceType);
  const platformChecks = (runtimeChecks.prewriteGate?.checks || []).filter((item) => item.key?.startsWith("platform_"));
  const gate = runtimeChecks.prewriteGate || {};
  const contract = runtimeChecks.payloadContract || {};
  if (nodeKey === "launch_intake") {
    return {
      output: "launch_intake",
      routeId: bundle?.job?.route_id || "",
      gameCode: bundle?.job?.game_code || "",
      advertiserId: bundle?.job?.advertiser_id || "",
      missingFields: [],
      gameSlugUsed: false
    };
  }
  if (nodeKey === "creation_context") {
    return {
      output: "creation_context",
      accountStatus: bundle?.account?.auth_status || "",
      monitorIdPresent: has(bundle?.account?.monitor_id),
      touchpointRef: bundle?.touchpoint?.touchpoint_ref || "",
      urlHash: bundle?.touchpoint?.url_hash || "",
      touchpointPresent: Boolean(runtimeChecks.touchpointVerification?.touchpointUrlPresent),
      touchpointHashMatches: Boolean(runtimeChecks.touchpointVerification?.urlHashMatches),
      gamePlatformAppId: bundle?.platformApp?.app_id || "",
      platformReadonlyStatus: gate.platformReadonlyApi?.status || "not_run",
      credentialStatus: gate.platformReadonlyApi?.credentialStatus || "unknown",
      credentialBlockers: runtimeChecks.platformReadonly?.credential?.blockers || []
    };
  }
  if (nodeKey === "game_launch_pack") {
    return {
      output: "game_launch_pack",
      gameName: bundle?.game?.game_name || "",
      productName: bundle?.game?.product_name || "",
      categoryName: bundle?.game?.category || "",
      brandName: bundle?.game?.brand_name || "",
      appIdSource: "game_platform_apps",
      gamePlatformAppId: bundle?.platformApp?.app_id || "",
      objective: bundle?.defaults?.objective || "",
      deepObjective: bundle?.defaults?.deep_objective || "",
      budget: Number(bundle?.defaults?.budget || 0),
      bid: Number(bundle?.defaults?.bid || 0),
      roiGoal: Number(bundle?.defaults?.roi_goal || 0),
      materialPackId: bundle?.materialPack?.pack?.pack_id || "",
      materialItemCount: Array.isArray(bundle?.materialPack?.items) ? bundle.materialPack.items.length : 0
    };
  }
  if (nodeKey === "account_resource_prepare") {
    return {
      output: "account_ready_report",
      platformReadonlyStatus: gate.platformReadonlyApi?.status || "not_run",
      credentialStatus: gate.platformReadonlyApi?.credentialStatus || "unknown",
      credentialBlockers: runtimeChecks.platformReadonly?.credential?.blockers || [],
      blockedResourceTypes: gate.blockedResourceTypes || [],
      checks: resourceChecks.map((item) => ({
        key: item.key,
        status: item.status,
        resourceType: item.resourceType,
        gap: item.gap || "",
        nextAction: item.nextAction || "",
        summary: item.summary
      }))
    };
  }
  if (nodeKey === "std_project_draft_builder") {
    return {
      output: "creation_draft",
      projectName: bundle?.draft?.project_name || "",
      payloadHash: bundle?.draft?.payload_hash || "",
      duplicateStatus: bundle?.draft?.duplicate_status || "not_generated",
      payloadContractStatus: contract.status || "waiting",
      prewriteGateStatus: gate.status || "waiting",
      platformDuplicateCheckStatus: gate.platformReadonlyApi?.duplicateStatus || "waiting",
      checks: [
        ...(contract.checks || []),
        ...platformChecks.filter((item) => item.key === "platform_std_project_duplicate")
      ].map((item) => ({ key: item.key, status: item.status, summary: item.summary }))
    };
  }
  if (nodeKey === "std_project_create_executor") {
    return {
      output: "created_object",
      createNodeStatus: gate.status === "locked" && !gate.gaps?.length ? "ready_for_single_create_confirmation" : "locked",
      nextConfirmationRequired: gate.status === "locked" && !gate.gaps?.length,
      guardrailPlatformWriteAllowed: false,
      blockedReasons: gate.gaps || [],
      checks: [
        { key: "prewrite_gate", status: gate.status || "waiting", summary: gate.summary || "" },
        { key: "payload_contract", status: contract.status || "waiting", summary: contract.summary || "" },
        ...platformChecks
      ].map((item) => ({ key: item.key, status: item.status, summary: item.summary, resourceType: item.resourceType || "" }))
    };
  }
  if (nodeKey === "readback_closer") {
    const objectNameMatches = !bundle?.readback?.object_name || bundle.readback.object_name === bundle?.draft?.project_name;
    return {
      output: bundle?.readback ? "readback_verified" : "readback_placeholder",
      objectNameSource: "launch_drafts.project_name",
      objectNameMatchesDraft: objectNameMatches,
      realObjectIdPresent: Boolean(bundle?.readback?.object_id && !String(bundle.readback.object_id).includes("PLACEHOLDER")),
      futureReadbackContract: "std_project/list by project_id or project_name after a separately confirmed create",
      evidenceRef: bundle?.readback?.evidence_ref || ""
    };
  }
  return {};
}

function diagnoseBundle(bundle, runtimeChecks = {}) {
  const touchpointReady = Boolean(
    runtimeChecks.touchpointVerification?.touchpointUrlPresent &&
    runtimeChecks.touchpointVerification?.urlHashMatches
  );
  const contextReady = has(bundle?.account?.monitor_id) &&
    has(bundle?.touchpoint?.touchpoint_ref) &&
    has(bundle?.touchpoint?.url_hash) &&
    touchpointReady &&
    has(bundle?.platformApp?.app_id) &&
    bundle?.account?.auth_status === "ready";
  const packReady = has(bundle?.game?.game_code) &&
    has(bundle?.defaults?.objective) &&
    has(bundle?.materialPack?.pack?.pack_id) &&
    Array.isArray(bundle?.materialPack?.items) &&
    bundle.materialPack.items.length > 0;
  const resource = resourceDiagnosis(bundle?.resources || []);
  const draftReady = Boolean(bundle?.draft?.project_name && bundle?.draft?.payload_hash);
  const confirmRecorded = (bundle?.evidence || []).some((item) => item.artifact_type === "confirm_placeholder");
  const readbackReady = Boolean(bundle?.readback?.readback_id);
  const contractResult = runtimeChecks.payloadContract || { status: "waiting", summary: "等待 payload 合同检查。" };
  const prewriteGate = runtimeChecks.prewriteGate || { status: "waiting", summary: "等待创建前 gate 检查。", gaps: [] };
  const credentialRequired = runtimeChecks.platformReadonly?.credential?.status === "credential_required";
  const contextStatus = contextReady ? (credentialRequired ? "repairable" : "passed") : "blocked";

  return [
    nodeStatus({
      nodeKey: "launch_intake",
      status: "passed",
      summary: "route_id、game_code、advertiser_id 已归一。",
      outputSummary: outputForNode("launch_intake", bundle, runtimeChecks)
    }),
    nodeStatus({
      nodeKey: "creation_context",
      status: contextStatus,
      summary: contextReady
        ? (credentialRequired ? "本地上下文已装配；平台只读凭据需要单独处理。" : "账户、monitor_id、触点引用、触点 hash 和平台 app 已装配。")
        : "账户上下文缺少 monitor_id、触点 URL/hash 校验或平台 app。",
      diagnosticLevel: contextStatus === "passed" ? "info" : (contextStatus === "repairable" ? "warning" : "error"),
      outputSummary: outputForNode("creation_context", bundle, runtimeChecks)
    }),
    nodeStatus({
      nodeKey: "game_launch_pack",
      status: packReady ? "passed" : "blocked",
      summary: packReady ? "游戏主档、路线默认值和保底物料包已装配。" : "游戏主档、路线默认值或保底物料包缺失。",
      diagnosticLevel: packReady ? "info" : "error",
      outputSummary: outputForNode("game_launch_pack", bundle, runtimeChecks)
    }),
    nodeStatus({
      nodeKey: "account_resource_prepare",
      status: resource.status,
      summary: resource.summary,
      diagnosticLevel: resource.level,
      outputSummary: outputForNode("account_resource_prepare", bundle, runtimeChecks)
    }),
    nodeStatus({
      nodeKey: "std_project_draft_builder",
      status: draftReady ? (contractResult.status === "passed" ? "needs_confirmation" : "repairable") : "waiting",
      summary: draftReady ? `创建草稿已生成；${contractResult.summary}` : "等待生成创建草稿。",
      diagnosticLevel: draftReady ? (contractResult.status === "passed" ? "warning" : "error") : "pending",
      outputSummary: outputForNode("std_project_draft_builder", bundle, runtimeChecks)
    }),
    nodeStatus({
      nodeKey: "std_project_create_executor",
      status: confirmRecorded ? "locked" : (draftReady ? "locked" : "waiting"),
      summary: confirmRecorded ? "确认占位已写入，真实平台创建未执行。" : (draftReady ? prewriteGate.summary : "等待草稿确认占位。"),
      diagnosticLevel: confirmRecorded ? "warning" : (draftReady ? "warning" : "pending"),
      outputSummary: outputForNode("std_project_create_executor", bundle, runtimeChecks)
    }),
    nodeStatus({
      nodeKey: "readback_closer",
      status: readbackReady ? "passed" : "waiting",
      summary: readbackReady ? "回查占位已写入，对象名来自草稿。" : "等待回查占位。",
      diagnosticLevel: readbackReady ? "info" : "pending",
      outputSummary: outputForNode("readback_closer", bundle, runtimeChecks)
    })
  ];
}

function buildDraft(bundle, { occupiedProjectNames = [] } = {}) {
  const yyyymmdd = cstYyyymmdd(bundle.job.created_at);
  const nameContext = {
    account: bundle.account,
    game: bundle.game,
    defaults: bundle.defaults,
    materialPack: bundle.materialPack,
    yyyymmdd
  };
  const namePrefix = buildStdProjectNamePrefix(nameContext);
  const projectSeq = allocateProjectSequence({
    namePrefix,
    yyyymmdd,
    occupiedNames: occupiedProjectNames
  });
  const projectName = buildStdProjectName({
    ...nameContext,
    projectSeq
  });
  const materialItems = Array.isArray(bundle.materialPack?.items) ? bundle.materialPack.items : [];
  const brandInfoOfficial = (bundle.resources || []).find((resource) => resource.resource_type === "brand_info")
    ?.metadata?.brand_info_official || {};
  const brandInfoSummary = {
    brand_name_id: String(brandInfoOfficial.brand_name_id || ""),
    cdp_brand_id: String(brandInfoOfficial.cdp_brand_id || ""),
    cdp_brand_name: String(brandInfoOfficial.cdp_brand_name || ""),
    yuntu_category_id: String(brandInfoOfficial.yuntu_category_id || ""),
    matched_industry_path: String(brandInfoOfficial.matched_industry_path || ""),
    readback_status: String(brandInfoOfficial.readback_status || ""),
    confirmation_status: String(brandInfoOfficial.confirmation_status || "")
  };
  const payloadSummary = {
    route_id: bundle.job.route_id,
    game_code: bundle.job.game_code,
    advertiser_id: bundle.job.advertiser_id,
    object_type: bundle.job.object_type,
    project_name: projectName,
    monitor_id: bundle.account.monitor_id,
    platform_app_id: bundle.platformApp?.app_id || "",
    objective: bundle.defaults?.objective || "",
    deep_objective: bundle.defaults?.deep_objective || "",
    deep_bid_type: bundle.defaults?.deep_bid_type || "",
    budget: Number(bundle.defaults?.budget || 0),
    bid: Number(bundle.defaults?.bid || 0),
    roi_goal: Number(bundle.defaults?.roi_goal || 0),
    targeting_summary: bundle.defaults?.targeting_summary || "",
    dmp_summary: bundle.defaults?.dmp_summary || "",
    brand_info: brandInfoSummary,
    material_pack_id: bundle.materialPack?.pack?.pack_id || "",
    material_asset_refs: materialItems.map((entry) => entry.item?.asset_ref).filter(Boolean),
    naming_prefix: namePrefix,
    project_seq: projectSeq,
    yyyymmdd,
    source_usage: "runtime_truth",
    platform_write_allowed: false
  };
  return {
    draftId: `DRAFT-${bundle.job.job_id}`,
    jobId: bundle.job.job_id,
    objectType: bundle.job.object_type,
    projectName,
    payloadSummary,
    payloadHash: hashJson(payloadSummary),
    duplicateStatus: "not_checked",
    writePolicy: "confirm_required_placeholder_only"
  };
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

function evidenceSummaryForProbe(probe = {}) {
  return [
    `endpoint=${probe.endpoint}`,
    `status=${probe.status}`,
    `http=${probe.httpStatus ?? "none"}`,
    `api_code=${probe.apiCode || "none"}`,
    `data_present=${Boolean(probe.dataPresent)}`,
    `request_id_present=${Boolean(probe.requestIdPresent)}`
  ].join("; ");
}

async function persistPlatformReadonly(repo, bundle, platformReadonly) {
  if (!platformReadonly) return [];
  const jobId = bundle.job.job_id;
  const evidenceRefs = [];
  for (const [index, probe] of (platformReadonly.probes || []).entries()) {
    const key = String(probe.label || `probe_${index + 1}`).replace(/[^A-Za-z0-9_.:-]/g, "_").toUpperCase();
    const artifactId = `EV-${jobId}-OE-READONLY-${String(index + 1).padStart(2, "0")}-${key}`;
    const summary = evidenceSummaryForProbe(probe);
    await repo.upsertEvidence({
      artifactId,
      jobId,
      artifactType: "platform_readonly_probe",
      title: `OceanEngine 只读校验 ${probe.label}`,
      summary,
      contentHash: probe.responseHash || contentHash(summary),
      storageRef: `postgres:mwb.evidence_artifacts/${artifactId}`,
      sourceRef: `oceanengine:${probe.endpoint}`
    });
    evidenceRefs.push(artifactId);
  }

  for (const update of platformReadonly.resourceUpdates || []) {
    await repo.updateAccountResourceReadonly({
      routeId: bundle.job.route_id,
      gameCode: bundle.job.game_code,
      advertiserId: bundle.job.advertiser_id,
      resourceType: update.resourceType,
      visibilityStatus: update.visibilityStatus,
      readbackStatus: update.readbackStatus,
      platformResourceId: update.platformResourceId,
      resourceMetadata: update.resourceMetadata || {},
      metadata: {
        ...update.readonlyCheck,
        evidence_refs: evidenceRefs,
        checked_at: new Date().toISOString()
      }
    });
  }

  if (bundle.draft?.draft_id && platformReadonly.platformDuplicateCheck?.status) {
    await repo.updateDraftDuplicateStatus(
      bundle.draft.draft_id,
      platformReadonly.platformDuplicateCheck.status === "passed" ? "platform_not_duplicate" : "platform_duplicate_check_blocked"
    );
  }
  return evidenceRefs;
}

async function buildRuntimeChecks(repo, bundle, { draftOverride, platformReadonly } = {}) {
  const effectiveBundle = draftOverride ? { ...bundle, draft: draftToBundleShape(draftOverride) } : bundle;
  const touchpointVerification = await repo.getTouchpointVerification({
    routeId: effectiveBundle.job.route_id,
    gameCode: effectiveBundle.job.game_code,
    advertiserId: effectiveBundle.job.advertiser_id,
    monitorId: effectiveBundle.account?.monitor_id || effectiveBundle.touchpoint?.monitor_id || ""
  });
  const payloadContract = evaluateStdProjectPayloadContract({
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
    failed: "失败",
    created: "已创建",
    diagnosed: "诊断完成",
    draft_ready: "草稿待确认",
    confirm_placeholder_recorded: "确认占位已记录",
    readback_placeholder_ready: "回查占位已完成",
    failed_waiting_manual_review: "失败待复盘",
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
    failed_waiting_manual_review: "失败待复盘"
  }[status] || "待执行";
}

function nextActionForBundle(bundle = {}) {
  if (bundle.job?.job_status === "failed_waiting_manual_review") {
    return "禁止重试；复盘平台返回码，或用只读列表核对项目名。";
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

function actionView(bundle = {}) {
  const failed = bundle.job?.job_status === "failed_waiting_manual_review";
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
      key: "retry_create",
      label: failed ? "禁止重试" : "真实创建禁用",
      enabled: false,
      dangerous: true
    }
  ];
}

function draftFields(bundle, runtimeChecks = {}) {
  const touchpoint = bundle.touchpoint || {};
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
    { label: "payload 合同", value: contract.status || "未检查" },
    { label: "平台只读", value: gate.platformReadonlyApi?.status || "not_run" },
    { label: "创建前 gate", value: gate.status || "未检查" },
    { label: "缺口", value: gateGaps || "无本地阻断缺口" },
    { label: "素材包", value: draft.payload_summary?.material_pack_id || "保底物料包" }
  ];
}

export function buildLaunchJobView(bundle, runtimeChecks = {}) {
  const dbNodes = nodeMap(bundle.nodes || []);
  const nodes = WORKFLOW_NODES.map((node) => {
    const row = dbNodes.get(node.nodeKey) || {};
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
  const phases = PHASES.map((phase) => ({
    ...phase,
    nodes: nodes.filter((node) => node.phase === phase.title).map((node) => ({
      id: node.nodeKey,
      number: node.number,
      name: node.nodeName,
      status: node.status,
      statusLabel: statusLabel(node.status),
      subflows: node.subflows,
      detail: node.detail,
      output: node.output,
      readonlyChecks: node.outputSummary?.checks || [],
      outputSummary: node.outputSummary || {}
    }))
  }));
  const diagnostics = diagnosticsFromNodes(nodes);
  const headline = {
    title: bundle.draft?.project_name || bundle.job.job_id,
    status: bundle.job.job_status,
    statusLabel: statusLabel(bundle.job.job_status),
    nextAction: nextActionForBundle(bundle)
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
  const execution = executionView(bundle);
  const actions = actionView(bundle);

  return publicView({
    jobId: bundle.job.job_id,
    updatedAt: bundle.job.updated_at || bundle.job.created_at,
    headline,
    agent: {
      name: "投放创建 Agent",
      status: bundle.job.job_status,
      statusText: statusLabel(bundle.job.job_status),
      mode: modeForStatus(bundle.job.job_status),
      writePolicy: bundle.route.write_policy === "confirm_required" ? "确认占位" : bundle.route.write_policy
    },
    intake: {
      routeId: bundle.job.route_id,
      gameCode: bundle.job.game_code,
      advertiserId: bundle.job.advertiser_id,
      sourceRecordRef: bundle.job.source_record_ref || "",
      missingFields: []
    },
    touchpoint: {
      touchpointRef: bundle.touchpoint?.touchpoint_ref || "",
      urlHash: bundle.touchpoint?.url_hash || "",
      status: bundle.touchpoint?.status || "missing"
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
    diagnostics,
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

export async function getJobView(repo, jobId) {
  const bundle = await repo.getLaunchJobBundle(jobId);
  if (!bundle) return null;
  return buildLaunchJobView(bundle, await buildRuntimeChecks(repo, bundle));
}

export async function createJob(repo, body = {}) {
  const intake = parseLaunchIntake(body.user_intent || body.userIntent || "");
  const routeId = body.route_id || body.routeId || intake.route_id;
  const gameCode = String(body.game_code || body.gameCode || intake.game_code || "").toUpperCase();
  const advertiserId = body.advertiser_id || body.advertiserId || intake.advertiser_id;
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

  const nowStamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const jobId = `JOB-MWBV2-${nowStamp}-${hashText(`${routeId}:${gameCode}:${advertiserId}:${Date.now()}:${randomBytes(4).toString("hex")}`).slice(0, 6).toUpperCase()}`;
  await repo.createLaunchJob({
    jobId,
    routeId,
    gameCode,
    advertiserId,
    objectType: context.route.object_type,
    sourceRecordRef: intake.source_record_ref
  });
  await repo.upsertNodeRuns(jobId, [
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
  ]);
  const bundle = await repo.getLaunchJobBundle(jobId);
  return buildLaunchJobView(bundle, await buildRuntimeChecks(repo, bundle));
}

export async function diagnoseJob(repo, jobId) {
  const bundle = await repo.getLaunchJobBundle(jobId);
  if (!bundle) {
    const error = new Error("job_not_found");
    error.statusCode = 404;
    throw error;
  }
  const platformReadonly = await runOceanEngineReadonlyProbes({
    bundle,
    client: createOceanEngineReadonlyClient()
  });
  const evidenceRefs = await persistPlatformReadonly(repo, bundle, platformReadonly);
  const latestBundle = await repo.getLaunchJobBundle(jobId);
  const runtimeChecks = await buildRuntimeChecks(repo, latestBundle, { platformReadonly });
  const nodes = diagnoseBundle(latestBundle, runtimeChecks)
    .map((node) => ["creation_context", "account_resource_prepare", "std_project_draft_builder", "std_project_create_executor"].includes(node.nodeKey)
      ? { ...node, evidenceRefs }
      : node);
  await repo.upsertNodeRuns(jobId, nodes);
  await repo.upsertEvidence({
    artifactId: `EV-${jobId}-DIAGNOSE`,
    jobId,
    artifactType: "diagnostic_summary",
    title: "Workflow 诊断摘要",
    summary: diagnosticsFromNodes(nodes).summary,
    contentHash: contentHash(diagnosticsFromNodes(nodes).summary),
    storageRef: `postgres:mwb.evidence_artifacts/EV-${jobId}-DIAGNOSE`,
    sourceRef: "api:diagnose"
  });
  await repo.updateJob(jobId, { status: "diagnosed", currentNode: "4" });
  const updatedBundle = await repo.getLaunchJobBundle(jobId);
  return buildLaunchJobView(updatedBundle, await buildRuntimeChecks(repo, updatedBundle));
}

export async function runJob(repo, jobId) {
  const bundle = await repo.getLaunchJobBundle(jobId);
  if (!bundle) {
    const error = new Error("job_not_found");
    error.statusCode = 404;
    throw error;
  }
  const runtimeChecks = await buildRuntimeChecks(repo, bundle);
  const nodes = diagnoseBundle(bundle, runtimeChecks);
  const blockers = nodes
    .filter((node) => node.status === "blocked" && node.nodeKey !== "account_resource_prepare")
    .map((node) => node.nodeKey);
  if (blockers.length) {
    await repo.upsertNodeRuns(jobId, nodes);
    await repo.updateJob(jobId, { status: "diagnosed", currentNode: "4" });
    const error = new Error("workflow_blocked");
    error.statusCode = 409;
    error.details = { blockers };
    throw error;
  }

  if (bundle.draft) return buildLaunchJobView(bundle, runtimeChecks);

  const occupiedProjectNames = await repo.getOccupiedProjectNames({
    routeId: bundle.job.route_id,
    gameCode: bundle.job.game_code,
    advertiserId: bundle.job.advertiser_id
  });
  const draft = buildDraft(bundle, { occupiedProjectNames });
  const platformReadonly = await runOceanEngineReadonlyProbes({
    bundle,
    draft,
    client: createOceanEngineReadonlyClient()
  });
  await repo.upsertDraft(draft);
  const persistedDraftBundle = await repo.getLaunchJobBundle(jobId);
  const evidenceRefs = await persistPlatformReadonly(repo, persistedDraftBundle, platformReadonly);
  const latestDraftBundle = await repo.getLaunchJobBundle(jobId);
  const draftRuntimeChecks = await buildRuntimeChecks(repo, latestDraftBundle, { platformReadonly });
  const refreshedNodes = diagnoseBundle(latestDraftBundle, draftRuntimeChecks);
  const updatedNodes = [
    ...refreshedNodes.slice(0, 4).map((node) => ["creation_context", "account_resource_prepare"].includes(node.nodeKey)
      ? { ...node, evidenceRefs }
      : node),
    nodeStatus({
      nodeKey: "std_project_draft_builder",
      status: draftRuntimeChecks.payloadContract.status === "passed" ? "needs_confirmation" : "repairable",
      summary: `创建草稿已生成：${draft.projectName}；${draftRuntimeChecks.payloadContract.summary}`,
      diagnosticLevel: draftRuntimeChecks.payloadContract.status === "passed" ? "warning" : "error",
      outputSummary: outputForNode("std_project_draft_builder", latestDraftBundle, draftRuntimeChecks),
      evidenceRefs
    }),
    nodeStatus({
      nodeKey: "std_project_create_executor",
      status: "locked",
      summary: draftRuntimeChecks.prewriteGate.summary,
      diagnosticLevel: "warning",
      outputSummary: outputForNode("std_project_create_executor", latestDraftBundle, draftRuntimeChecks),
      evidenceRefs
    }),
    nodeStatus({
      nodeKey: "readback_closer",
      status: "waiting",
      summary: "等待确认占位后写入回查占位。",
      diagnosticLevel: "pending",
      outputSummary: outputForNode("readback_closer", latestDraftBundle, draftRuntimeChecks)
    })
  ];
  await repo.upsertNodeRuns(jobId, updatedNodes);
  await repo.updateJob(jobId, { status: "draft_ready", currentNode: "5" });
  const updatedBundle = await repo.getLaunchJobBundle(jobId);
  return buildLaunchJobView(updatedBundle, await buildRuntimeChecks(repo, updatedBundle));
}

export async function confirmJob(repo, jobId) {
  const bundle = await repo.getLaunchJobBundle(jobId);
  if (!bundle?.draft) {
    const error = new Error("draft_not_ready");
    error.statusCode = 409;
    throw error;
  }
  const placeholder = buildConfirmPlaceholder({
    jobId,
    draftId: bundle.draft.draft_id,
    projectName: bundle.draft.project_name
  });
  await repo.upsertEvidence({
    ...placeholder,
    contentHash: contentHash(`${placeholder.artifactId}:${placeholder.projectName}:no-platform-write`)
  });
  const runtimeChecks = await buildRuntimeChecks(repo, bundle);
  await repo.upsertNodeRuns(jobId, [
    nodeStatus({
      nodeKey: "std_project_create_executor",
      status: "locked",
      summary: "确认占位已写入，未触发真实平台创建。",
      diagnosticLevel: "warning",
      outputSummary: outputForNode("std_project_create_executor", bundle, runtimeChecks)
    }),
    nodeStatus({
      nodeKey: "readback_closer",
      status: "waiting",
      summary: "等待回查占位。",
      diagnosticLevel: "pending",
      outputSummary: outputForNode("readback_closer", bundle, runtimeChecks)
    })
  ]);
  await repo.updateJob(jobId, { status: "confirm_placeholder_recorded", currentNode: "6" });
  const updatedBundle = await repo.getLaunchJobBundle(jobId);
  return buildLaunchJobView(updatedBundle, await buildRuntimeChecks(repo, updatedBundle));
}

export async function readbackJob(repo, jobId) {
  const bundle = await repo.getLaunchJobBundle(jobId);
  if (!bundle?.draft) {
    const error = new Error("draft_not_ready");
    error.statusCode = 409;
    throw error;
  }
  const placeholder = buildReadbackPlaceholder({
    jobId,
    projectName: bundle.draft.project_name
  });
  await repo.upsertEvidence({
    artifactId: placeholder.artifactId,
    jobId,
    artifactType: "readback_placeholder",
    title: "回查占位摘要",
    summary: "回查占位已写入；对象名来自 launch_drafts.project_name，未调用真实平台。",
    contentHash: contentHash(`${placeholder.artifactId}:${placeholder.objectName}:no-platform-readback`),
    storageRef: `postgres:mwb.evidence_artifacts/${placeholder.artifactId}`,
    sourceRef: "api:readback_placeholder"
  });
  await repo.upsertReadbackRecord({
    readbackId: placeholder.readbackId,
    jobId,
    objectType: placeholder.objectType,
    objectId: placeholder.objectId,
    objectName: placeholder.objectName,
    readbackStatus: placeholder.readbackStatus,
    fieldDiffSummary: placeholder.fieldDiffSummary,
    evidenceRef: placeholder.artifactId
  });
  const outputBundle = await repo.getLaunchJobBundle(jobId);
  const runtimeChecks = await buildRuntimeChecks(repo, outputBundle);
  await repo.upsertNodeRuns(jobId, [
    nodeStatus({
      nodeKey: "std_project_create_executor",
      status: "locked",
      summary: "确认占位已记录；平台创建未执行。",
      diagnosticLevel: "warning",
      outputSummary: outputForNode("std_project_create_executor", outputBundle, runtimeChecks)
    }),
    nodeStatus({
      nodeKey: "readback_closer",
      status: "passed",
      summary: "回查占位已写入，对象名来自草稿。",
      diagnosticLevel: "info",
      outputSummary: outputForNode("readback_closer", outputBundle, runtimeChecks)
    })
  ]);
  await repo.updateJob(jobId, { status: "readback_placeholder_ready", currentNode: "7" });
  const updatedBundle = await repo.getLaunchJobBundle(jobId);
  return buildLaunchJobView(updatedBundle, await buildRuntimeChecks(repo, updatedBundle));
}
