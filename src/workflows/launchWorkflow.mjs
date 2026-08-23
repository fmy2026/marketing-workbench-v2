import { createHash } from "node:crypto";
import { parseLaunchIntake, hashText } from "../agents/launchAgent.mjs";
import { buildConfirmPlaceholder, buildReadbackPlaceholder } from "../platforms/oceanenginePlaceholder.mjs";
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

const TERMINAL_STATUSES = new Set(["passed", "repairable", "needs_confirmation", "blocked", "failed"]);

function contentHash(value) {
  return `sha256:${createHash("sha256").update(String(value)).digest("hex")}`;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashJson(value) {
  return contentHash(canonicalJson(value));
}

function nodeStatus({ nodeKey, status, summary, diagnosticLevel = "info" }) {
  const node = WORKFLOW_NODES.find((item) => item.nodeKey === nodeKey);
  return {
    ...node,
    status,
    summary,
    diagnosticLevel,
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
    return {
      status: "blocked",
      level: "error",
      summary: `账户资源阻断：缺少 ${missing.length} 项，不可见 ${blocked.length} 项。`
    };
  }
  if (needsAttention.length) {
    return {
      status: "repairable",
      level: "warning",
      summary: `账户资源有 ${needsAttention.length} 项待确认或待回查。`
    };
  }
  return {
    status: "passed",
    level: "info",
    summary: "账户资源均已通过本地最小真值检查。"
  };
}

function diagnoseBundle(bundle) {
  const contextReady = has(bundle?.account?.monitor_id) &&
    has(bundle?.touchpoint?.touchpoint_ref) &&
    has(bundle?.touchpoint?.url_hash) &&
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

  return [
    nodeStatus({
      nodeKey: "launch_intake",
      status: "passed",
      summary: "route_id、game_code、advertiser_id 已归一。"
    }),
    nodeStatus({
      nodeKey: "creation_context",
      status: contextReady ? "passed" : "blocked",
      summary: contextReady ? "账户、monitor_id、触点引用和平台 app 已装配。" : "账户上下文缺少 monitor_id、触点引用或平台 app。",
      diagnosticLevel: contextReady ? "info" : "error"
    }),
    nodeStatus({
      nodeKey: "game_launch_pack",
      status: packReady ? "passed" : "blocked",
      summary: packReady ? "游戏主档、路线默认值和保底物料包已装配。" : "游戏主档、路线默认值或保底物料包缺失。",
      diagnosticLevel: packReady ? "info" : "error"
    }),
    nodeStatus({
      nodeKey: "account_resource_prepare",
      status: resource.status,
      summary: resource.summary,
      diagnosticLevel: resource.level
    }),
    nodeStatus({
      nodeKey: "std_project_draft_builder",
      status: draftReady ? "needs_confirmation" : "waiting",
      summary: draftReady ? "创建草稿已生成，等待确认。" : "等待生成创建草稿。",
      diagnosticLevel: draftReady ? "warning" : "pending"
    }),
    nodeStatus({
      nodeKey: "std_project_create_executor",
      status: confirmRecorded ? "passed" : "waiting",
      summary: confirmRecorded ? "确认占位已写入，真实平台创建未执行。" : "等待草稿确认占位。",
      diagnosticLevel: confirmRecorded ? "info" : "pending"
    }),
    nodeStatus({
      nodeKey: "readback_closer",
      status: readbackReady ? "passed" : "waiting",
      summary: readbackReady ? "回查占位已写入，对象名来自草稿。" : "等待回查占位。",
      diagnosticLevel: readbackReady ? "info" : "pending"
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

function nodeMap(nodes = []) {
  return new Map(nodes.map((node) => [node.node_key, node]));
}

function statusLabel(status) {
  return {
    passed: "通过",
    repairable: "可修复",
    needs_confirmation: "需确认",
    blocked: "阻断",
    waiting: "等待",
    failed: "失败",
    created: "已创建",
    diagnosed: "诊断完成",
    draft_ready: "草稿待确认",
    confirm_placeholder_recorded: "确认占位已记录",
    readback_placeholder_ready: "回查占位已完成"
  }[status] || status;
}

function actionForStatus(node, status) {
  if (status === "passed") return "继续";
  if (status === "repairable") return "确认资源后继续";
  if (status === "needs_confirmation") return node.nodeKey === "std_project_draft_builder" ? "确认草稿" : "人工确认";
  if (status === "blocked") return "补齐缺口";
  return "等待上游节点";
}

function diagnosticsFromNodes(nodes) {
  const items = nodes.map((node) => ({
    phase: node.phase,
    node: node.nodeName,
    status: node.status,
    problem: node.status === "passed" ? "已通过" : node.summary,
    action: actionForStatus(node, node.status),
    evidenceRef: ""
  }));
  const counts = items.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});
  const summary = `当前 ${counts.passed || 0} 项通过，${counts.repairable || 0} 项可修复，${counts.needs_confirmation || 0} 项需确认，${counts.waiting || 0} 项等待，${counts.blocked || 0} 项阻断。`;
  return { summary, items };
}

function modeForStatus(status) {
  return {
    created: "已创建",
    diagnosed: "诊断完成",
    draft_ready: "草稿待确认",
    confirm_placeholder_recorded: "确认占位已记录",
    readback_placeholder_ready: "回查占位已完成"
  }[status] || "待执行";
}

function draftFields(bundle) {
  const draft = bundle.draft;
  if (!draft) {
    return [
      { label: "推广路线", value: bundle.job.route_id },
      { label: "创建对象", value: bundle.job.object_type },
      { label: "游戏标识", value: bundle.job.game_code },
      { label: "账户 ID", value: bundle.job.advertiser_id },
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
    { label: "素材包", value: draft.payload_summary?.material_pack_id || "保底物料包" }
  ];
}

export function buildLaunchJobView(bundle) {
  const dbNodes = nodeMap(bundle.nodes || []);
  const nodes = WORKFLOW_NODES.map((node) => {
    const row = dbNodes.get(node.nodeKey) || {};
    return {
      ...node,
      status: row.status || "waiting",
      summary: row.summary || "等待执行。",
      detail: row.summary || "等待执行。",
      diagnosticLevel: row.diagnostic_level || "pending"
    };
  });
  const phases = PHASES.map((phase) => ({
    ...phase,
    nodes: nodes.filter((node) => node.phase === phase.title).map((node) => ({
      id: node.nodeKey,
      number: node.number,
      name: node.nodeName,
      status: node.status,
      subflows: node.subflows,
      detail: node.detail,
      output: node.output
    }))
  }));
  const diagnostics = diagnosticsFromNodes(nodes);

  return {
    jobId: bundle.job.job_id,
    updatedAt: bundle.job.updated_at || bundle.job.created_at,
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
    chat: [
      { role: "agent", text: "请提供推广路线、游戏标识和账户 ID。" },
      { role: "agent", text: `${bundle.job.route_id} / ${bundle.job.game_code} / ${bundle.job.advertiser_id} 已进入 Workflow。` }
    ],
    phases,
    diagnostics,
    draft: {
      objectType: bundle.job.object_type,
      projectName: bundle.draft?.project_name || "等待生成",
      routeId: bundle.job.route_id,
      gameCode: bundle.job.game_code,
      duplicateStatus: bundle.draft?.duplicate_status || "未生成",
      payloadHash: bundle.draft?.payload_hash || "等待生成",
      writePolicy: bundle.draft?.write_policy || "confirm_required_placeholder_only",
      fields: draftFields(bundle)
    },
    readback: bundle.readback ? {
      objectType: bundle.readback.object_type,
      objectId: bundle.readback.object_id,
      objectName: bundle.readback.object_name,
      status: bundle.readback.readback_status,
      evidenceRef: bundle.readback.evidence_ref
    } : null,
    actions: {
      canDiagnose: true,
      canRun: !bundle.draft,
      canConfirm: Boolean(bundle.draft),
      canReadback: Boolean(bundle.draft)
    }
  };
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
  const jobId = `JOB-MWBV2-${nowStamp}-${hashText(`${routeId}:${gameCode}:${advertiserId}:${Date.now()}`).slice(0, 6).toUpperCase()}`;
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
  return buildLaunchJobView(await repo.getLaunchJobBundle(jobId));
}

export async function diagnoseJob(repo, jobId) {
  const bundle = await repo.getLaunchJobBundle(jobId);
  if (!bundle) {
    const error = new Error("job_not_found");
    error.statusCode = 404;
    throw error;
  }
  const nodes = diagnoseBundle(bundle);
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
  return buildLaunchJobView(await repo.getLaunchJobBundle(jobId));
}

export async function runJob(repo, jobId) {
  const bundle = await repo.getLaunchJobBundle(jobId);
  if (!bundle) {
    const error = new Error("job_not_found");
    error.statusCode = 404;
    throw error;
  }
  const nodes = diagnoseBundle(bundle);
  const blockers = nodes.filter((node) => node.status === "blocked").map((node) => node.nodeKey);
  if (blockers.length) {
    await repo.upsertNodeRuns(jobId, nodes);
    await repo.updateJob(jobId, { status: "diagnosed", currentNode: "4" });
    const error = new Error("workflow_blocked");
    error.statusCode = 409;
    error.details = { blockers };
    throw error;
  }

  if (bundle.draft) return buildLaunchJobView(bundle);

  const occupiedProjectNames = await repo.getOccupiedProjectNames({
    routeId: bundle.job.route_id,
    gameCode: bundle.job.game_code,
    advertiserId: bundle.job.advertiser_id
  });
  const draft = buildDraft(bundle, { occupiedProjectNames });
  await repo.upsertDraft(draft);
  const updatedNodes = [
    ...nodes.slice(0, 4),
    nodeStatus({
      nodeKey: "std_project_draft_builder",
      status: "needs_confirmation",
      summary: `创建草稿已生成：${draft.projectName}`,
      diagnosticLevel: "warning"
    }),
    nodeStatus({
      nodeKey: "std_project_create_executor",
      status: "waiting",
      summary: "等待确认占位；真实平台创建保持禁用。",
      diagnosticLevel: "pending"
    }),
    nodeStatus({
      nodeKey: "readback_closer",
      status: "waiting",
      summary: "等待确认占位后写入回查占位。",
      diagnosticLevel: "pending"
    })
  ];
  await repo.upsertNodeRuns(jobId, updatedNodes);
  await repo.updateJob(jobId, { status: "draft_ready", currentNode: "5" });
  return buildLaunchJobView(await repo.getLaunchJobBundle(jobId));
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
  await repo.upsertNodeRuns(jobId, [
    nodeStatus({
      nodeKey: "std_project_create_executor",
      status: "passed",
      summary: "确认占位已写入，未触发真实平台创建。",
      diagnosticLevel: "info"
    }),
    nodeStatus({
      nodeKey: "readback_closer",
      status: "waiting",
      summary: "等待回查占位。",
      diagnosticLevel: "pending"
    })
  ]);
  await repo.updateJob(jobId, { status: "confirm_placeholder_recorded", currentNode: "6" });
  return buildLaunchJobView(await repo.getLaunchJobBundle(jobId));
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
  await repo.upsertNodeRuns(jobId, [
    nodeStatus({
      nodeKey: "std_project_create_executor",
      status: "passed",
      summary: "确认占位已记录；平台创建未执行。",
      diagnosticLevel: "info"
    }),
    nodeStatus({
      nodeKey: "readback_closer",
      status: "passed",
      summary: "回查占位已写入，对象名来自草稿。",
      diagnosticLevel: "info"
    })
  ]);
  await repo.updateJob(jobId, { status: "readback_placeholder_ready", currentNode: "7" });
  return buildLaunchJobView(await repo.getLaunchJobBundle(jobId));
}
