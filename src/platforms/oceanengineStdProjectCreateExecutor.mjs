import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  credentialReady,
  getOceanEngineCredentialSummary,
  readOceanEngineEnv
} from "./oceanengineCredentialStore.mjs";
import { evaluateOe3PayloadContract, stablePayloadHash } from "../workflows/skills/oe3/payload-contract.mjs";
import { buildOe3StdProjectPayload } from "../workflows/skills/oe3/payload.mjs";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(MODULE_DIR, "../..");
const LOCAL_DIR = path.join(PROJECT_ROOT, ".local");
const API_BASE = "https://api.oceanengine.com";
const CREATE_ENDPOINT = "/open_api/v3.0/std_project/create/";
const LIST_ENDPOINT = "/open_api/v3.0/std_project/list/";

export const STD_PROJECT_CREATE_CONFIRM_ENV = "MWBV2_OE_STD_PROJECT_CREATE_CONFIRM";
export const STD_PROJECT_CREATE_CONFIRM_VALUE = "CREATE_ONE_STD_PROJECT";

// One fixed target executor:
// This module exists only to preserve the audited single-create attempt for
// JOB-MWBV2-20260824014546-851B76. It must not be reused as a generic
// parameterized creator. Future account/project automation needs a separate
// task with a new idempotency, confirmation, and readback contract.
export const TARGET_STD_PROJECT_CREATE = Object.freeze({
  jobId: "JOB-MWBV2-20260824014546-851B76",
  draftId: "DRAFT-JOB-MWBV2-20260824014546-851B76",
  objectType: "std_project",
  routeId: "oceanengine_3_byte_mini_game",
  gameCode: "JSZC",
  advertiserId: "1871922175825993",
  projectName: "245791_N_JSZC_HUNT_PAY7DROI_平台定向不限_P19_20260824",
  payloadHash: "sha256:8db82f4009abfc567592e59b4d11ad6324b4fbb12dd9d40cb89f64aa5007c7b7"
});

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function clean(value) {
  return String(value ?? "").trim();
}

function isPlaceholderId(value) {
  return !value || /^PLACEHOLDER/i.test(String(value));
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function redactedPayloadSummary(payload = {}) {
  return {
    advertiser_id: clean(payload.advertiser_id),
    name: clean(payload.name),
    brand_info_present: Boolean(payload.brand_info),
    brand_info_has_ecom_brand_id: Object.prototype.hasOwnProperty.call(payload.brand_info || {}, "ecom_brand_id"),
    event_asset_id_present: Boolean(payload.asset_id),
    micro_app_instance_id_present: Boolean(payload.instance_id),
    aweme_id_present: Boolean(payload.aweme_id),
    mini_program_url_present: Boolean(payload.project_materials?.mini_program_info?.url),
    touchpoint_present: Boolean(payload.track_url_setting?.action_track_url?.length),
    product_image_id_present: Boolean(payload.project_materials?.product_info?.image_ids?.length),
    video_material_count: payload.project_materials?.video_material_list?.length || 0,
    video_id_ready_count: (payload.project_materials?.video_material_list || []).filter((item) => item.video_id).length,
    video_cover_ready_count: (payload.project_materials?.video_material_list || []).filter((item) => item.video_cover_id).length,
    title_material_count: payload.project_materials?.title_material_list?.length || 0,
    payload_fingerprint: `sha256:${sha256(canonicalJson(payload))}`
  };
}

function attemptPath(jobId) {
  return path.join(LOCAL_DIR, `std-project-create-attempt-${jobId}.json`);
}

function readAttempt(jobId) {
  const file = attemptPath(jobId);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return { status: "attempt_file_unreadable" };
  }
}

function writeAttempt(jobId, data) {
  mkdirSync(LOCAL_DIR, { recursive: true });
  writeFileSync(attemptPath(jobId), `${JSON.stringify(data, null, 2)}\n`, { encoding: "utf8" });
}

function extractApiCode(payload = {}) {
  return clean(payload.code ?? payload.err_no ?? payload.error_code ?? "");
}

function extractRequestId(payload = {}) {
  return clean(payload.request_id || payload.data?.request_id || "");
}

function extractStdProjectId(payload = {}) {
  return clean(
    payload.data?.project_id ||
    payload.data?.std_project_id ||
    payload.data?.id ||
    payload.project_id ||
    payload.std_project_id ||
    ""
  );
}

function summarizeListPayload(payload = {}, projectName = "") {
  const data = payload.data || {};
  const list = data.list || data.items || data.projects || [];
  const items = Array.isArray(list) ? list : [];
  const match = items.find((item) => clean(item.name || item.project_name || item.std_project_name) === projectName) || items[0] || {};
  return {
    apiCode: extractApiCode(payload),
    requestIdPresent: Boolean(extractRequestId(payload)),
    listCount: items.length,
    objectId: clean(match.project_id || match.std_project_id || match.id || ""),
    objectName: clean(match.name || match.project_name || match.std_project_name || ""),
    objectStatus: clean(match.status || match.project_status || match.opt_status || ""),
    objectNameMatches: projectName ? clean(match.name || match.project_name || match.std_project_name) === projectName : false
  };
}

function targetFromBundle(bundle = {}) {
  return {
    jobId: bundle.job?.job_id || "",
    draftId: bundle.draft?.draft_id || "",
    objectType: bundle.job?.object_type || "std_project",
    routeId: bundle.job?.route_id || "",
    gameCode: bundle.job?.game_code || "",
    advertiserId: bundle.job?.advertiser_id || "",
    projectName: bundle.draft?.project_name || "",
    payloadHash: bundle.draft?.payload_hash || ""
  };
}

function latestCreateReadiness(bundle = {}) {
  const createNode = (bundle.nodes || []).find((node) => node.node_key === "std_project_create_executor") || {};
  const accountNode = (bundle.nodes || []).find((node) => node.node_key === "account_resource_prepare") || {};
  return createNode.output_summary?.createReadiness || accountNode.output_summary?.createReadiness || {};
}

export async function prepareStdProjectCreate({ repo, jobId = TARGET_STD_PROJECT_CREATE.jobId, target = null } = {}) {
  const bundle = await repo.getLaunchJobBundle(jobId);
  if (!bundle) throw new Error("target_job_not_found");
  const effectiveTarget = target || TARGET_STD_PROJECT_CREATE;

  const touchpoint = await repo.getControlledTouchpointUrl({
    routeId: bundle.job.route_id,
    gameCode: bundle.job.game_code,
    advertiserId: bundle.job.advertiser_id,
    monitorId: bundle.account.monitor_id
  });
  const touchpointVerification = await repo.getTouchpointVerification({
    routeId: bundle.job.route_id,
    gameCode: bundle.job.game_code,
    advertiserId: bundle.job.advertiser_id,
    monitorId: bundle.account.monitor_id
  });
  const contract = evaluateOe3PayloadContract({ bundle, draft: bundle.draft, touchpointVerification });
  const payloadHashStable = bundle.draft?.payload_summary?.payload_hash_source === "final_controlled_payload"
    ? bundle.draft?.payload_summary?.final_payload_hash === bundle.draft?.payload_hash
    : stablePayloadHash(bundle.draft?.payload_summary || {}) === bundle.draft?.payload_hash;
  const finalPayload = buildOe3StdProjectPayload({ bundle, touchpointUrl: touchpoint?.touchpoint_url || "" });
  const payload = finalPayload.payload;
  const blockers = [
    ...(bundle.job.job_id !== effectiveTarget.jobId ? ["target_job_mismatch"] : []),
    ...(bundle.draft?.draft_id !== effectiveTarget.draftId ? ["target_draft_mismatch"] : []),
    ...(bundle.job.route_id !== effectiveTarget.routeId ? ["target_route_mismatch"] : []),
    ...(bundle.job.game_code !== effectiveTarget.gameCode ? ["target_game_code_mismatch"] : []),
    ...(bundle.job.advertiser_id !== effectiveTarget.advertiserId ? ["target_advertiser_mismatch"] : []),
    ...(bundle.draft?.project_name !== effectiveTarget.projectName ? ["target_project_name_mismatch"] : []),
    ...(bundle.draft?.payload_hash !== effectiveTarget.payloadHash ? ["target_payload_hash_mismatch"] : []),
    ...(!payloadHashStable ? ["payload_hash_not_stable"] : []),
    ...(bundle.draft?.duplicate_status !== "platform_not_duplicate" ? ["duplicate_status_not_platform_not_duplicate"] : []),
    ...(contract.status !== "passed" ? contract.gaps.map((gap) => `payload_contract:${gap.key}`) : []),
    ...(!touchpoint?.touchpoint_url ? ["controlled_touchpoint_url_missing"] : []),
    ...(!touchpointVerification.urlHashMatches ? ["touchpoint_hash_mismatch"] : []),
    ...(!isPlaceholderId(bundle.readback?.object_id) ? ["real_readback_record_already_exists"] : []),
    ...finalPayload.blockers
  ];

  return {
    ready: blockers.length === 0,
    blockers,
    bundle,
    payload,
    redactedPayloadSummary: redactedPayloadSummary(payload),
    payloadContractStatus: contract.status,
    payloadHashStable
  };
}

export async function readbackStdProjectOnce({ repo, jobId = TARGET_STD_PROJECT_CREATE.jobId, target = null, fetchImpl = globalThis.fetch } = {}) {
  const bundle = await repo.getLaunchJobBundle(jobId);
  if (!bundle) throw new Error("target_job_not_found");
  const effectiveTarget = target || TARGET_STD_PROJECT_CREATE;
  const credentialSummary = getOceanEngineCredentialSummary();
  if (!credentialReady(credentialSummary)) {
    return { status: "credential_required", blockers: credentialSummary.blockers };
  }
  const env = readOceanEngineEnv().env;
  const url = new URL(`${API_BASE}${LIST_ENDPOINT}`);
  url.searchParams.set("advertiser_id", effectiveTarget.advertiserId);
  url.searchParams.set("filtering", JSON.stringify({ name: effectiveTarget.projectName }));
  url.searchParams.set("page", "1");
  url.searchParams.set("page_size", "20");
  const response = await fetchImpl(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Access-Token": env.OCEANENGINE_ACCESS_TOKEN
    }
  });
  const text = await response.text();
  let payload = {};
  try {
    payload = JSON.parse(text);
  } catch {
    payload = {};
  }
  const summary = summarizeListPayload(payload, effectiveTarget.projectName);
  const evidenceRef = `EV-${jobId}-STD-PROJECT-READBACK-ONCE`;
  await repo.upsertEvidence({
    artifactId: evidenceRef,
    jobId,
    artifactType: "std_project_readback_once",
    title: "std_project readback once",
    summary: `endpoint=std_project/list http=${response.status} api_code=${summary.apiCode || "unknown"} request_id_present=${summary.requestIdPresent} object_id_present=${Boolean(summary.objectId)} object_name_matches=${summary.objectNameMatches}`,
    contentHash: `sha256:${sha256(text)}`,
    storageRef: "postgres:evidence_artifacts:redacted_summary_only",
    sourceRef: "oceanengine:/open_api/v3.0/std_project/list/"
  });
  if (summary.objectId && summary.objectNameMatches) {
    await repo.upsertCreatedObject({
      createdObjectId: `CO-${jobId}-STD-PROJECT-${summary.objectId}`,
      jobId,
      objectType: "std_project",
      objectId: summary.objectId,
      objectName: summary.objectName,
      objectStatus: summary.objectStatus || "readable",
      readbackStatus: "readback_verified",
      evidenceRef,
      readbackAt: new Date().toISOString(),
      metadata: {
        readback_source: "oceanengine_std_project_list",
        object_name_matches_draft: true
      }
    });
    await repo.upsertReadbackRecord({
      readbackId: `RB-${jobId}-STD-PROJECT-REAL`,
      jobId,
      objectType: "std_project",
      objectId: summary.objectId,
      objectName: summary.objectName,
      readbackStatus: "readback_verified",
      fieldDiffSummary: {
        object_name_matches_draft: true,
        object_status: summary.objectStatus || "readable",
        source: "oceanengine_std_project_list"
      },
      evidenceRef
    });
    await repo.updateNodeRun(jobId, "readback_closer", {
      status: "passed",
      summary: "真实 std_project 已 readback 验证，对象名等于草稿项目名。",
      diagnosticLevel: "info",
      evidenceRefs: [evidenceRef],
      outputSummary: {
        output: "readback_verified",
        objectNameSource: "launch_drafts.project_name",
        objectNameMatchesDraft: true,
        realObjectIdPresent: true,
        evidenceRef
      }
    });
  }
  return {
    status: summary.objectId && summary.objectNameMatches ? "readback_verified" : "not_found_or_mismatch",
    httpStatus: response.status,
    apiCode: summary.apiCode,
    requestIdPresent: summary.requestIdPresent,
    objectId: summary.objectId,
    objectName: summary.objectName,
    objectStatus: summary.objectStatus,
    objectNameMatches: summary.objectNameMatches,
    evidenceRef
  };
}

export async function createStdProjectForTargetOnce({ repo, target, fetchImpl = globalThis.fetch, allowNetworkWrite = false } = {}) {
  if (!target?.jobId) throw new Error("target_required");
  const bundle = await repo.getLaunchJobBundle(target.jobId);
  if (!bundle) throw new Error("target_job_not_found");
  const runtimeTarget = { ...targetFromBundle(bundle), ...target };
  const confirmValue = process.env[STD_PROJECT_CREATE_CONFIRM_ENV] || "";
  const credentialSummary = getOceanEngineCredentialSummary();
  const existingAttempt = readAttempt(runtimeTarget.jobId);
  const prepared = await prepareStdProjectCreate({ repo, jobId: runtimeTarget.jobId, target: runtimeTarget });
  const readiness = latestCreateReadiness(bundle);
  const blockers = [
    ...(confirmValue !== STD_PROJECT_CREATE_CONFIRM_VALUE ? ["confirm_variable_missing_or_invalid"] : []),
    ...(!credentialReady(credentialSummary) ? credentialSummary.blockers.map((item) => `credential:${item}`) : []),
    ...(bundle.job.source_usage !== "runtime_truth" ? ["job_not_runtime_truth"] : []),
    ...(bundle.platformAction ? ["platform_action_already_recorded"] : []),
    ...(bundle.createdObject ? ["created_object_already_recorded"] : []),
    ...(existingAttempt ? ["std_project_create_attempt_already_recorded"] : []),
    ...(readiness.status !== "ready_for_user_create_confirmation" ? [`readiness_not_ready:${readiness.status || "missing"}`] : []),
    ...(readiness.brandIndustryStatus !== "passed" ? ["brand_industry_not_passed"] : []),
    ...(readiness.eventChainStatus !== "passed" ? ["event_chain_not_passed"] : []),
    ...(readiness.payloadContractStatus !== "passed" ? ["payload_contract_not_passed"] : []),
    ...(readiness.duplicateStatus !== "platform_not_duplicate" ? ["duplicate_check_not_platform_not_duplicate"] : []),
    ...(runtimeTarget.payloadHash !== bundle.draft?.payload_hash ? ["payload_hash_mismatch"] : []),
    ...(!prepared.ready ? prepared.blockers : []),
    ...(!allowNetworkWrite ? ["network_write_not_enabled_by_caller"] : [])
  ];
  if (blockers.length) {
    return {
      status: "blocked_before_create",
      createCalled: false,
      blockers,
      credentialStatus: credentialSummary.status,
      redactedPayloadSummary: prepared.redactedPayloadSummary
    };
  }

  const env = readOceanEngineEnv().env;
  const attemptId = randomUUID();
  const confirmationId = `CONFIRM-${runtimeTarget.jobId}-STD-PROJECT-CREATE-ONCE`;
  const actionId = `ACTION-${runtimeTarget.jobId}-STD-PROJECT-CREATE-ONCE`;
  const requestHash = `sha256:${sha256(canonicalJson(prepared.payload))}`;
  await repo.upsertLaunchConfirmation({
    confirmationId,
    jobId: runtimeTarget.jobId,
    draftId: runtimeTarget.draftId,
    objectType: runtimeTarget.objectType,
    objectName: runtimeTarget.projectName,
    payloadHash: runtimeTarget.payloadHash,
    confirmationStatus: "confirmed_for_single_create",
    confirmVariable: `${STD_PROJECT_CREATE_CONFIRM_ENV}=${STD_PROJECT_CREATE_CONFIRM_VALUE}`,
    metadata: {
      maximum_actions: 1,
      retry_allowed: false,
      raw_payload_stored: false,
      raw_response_stored: false
    }
  });
  await repo.upsertPlatformAction({
    actionId,
    jobId: runtimeTarget.jobId,
    confirmationId,
    actionType: "oceanengine_std_project_create",
    endpoint: "/open_api/v3.0/std_project/create/",
    method: "POST",
    actionStatus: "started",
    attemptNo: 1,
    requestHash,
    metadata: {
      target_project_name: runtimeTarget.projectName,
      raw_payload_stored: false,
      raw_response_stored: false,
      retry_allowed: false
    }
  });
  writeAttempt(runtimeTarget.jobId, {
    attemptId,
    status: "network_attempt_started",
    endpoint: "oceanengine:/open_api/v3.0/std_project/create/",
    jobId: runtimeTarget.jobId,
    projectName: runtimeTarget.projectName,
    startedAt: new Date().toISOString()
  });

  const response = await fetchImpl(`${API_BASE}${CREATE_ENDPOINT}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "Access-Token": env.OCEANENGINE_ACCESS_TOKEN
    },
    body: JSON.stringify(prepared.payload)
  });
  const text = await response.text();
  let payload = {};
  try {
    payload = JSON.parse(text);
  } catch {
    payload = {};
  }
  const apiCode = extractApiCode(payload);
  const requestIdPresent = Boolean(extractRequestId(payload));
  const stdProjectId = extractStdProjectId(payload);
  const responseHash = `sha256:${sha256(text)}`;
  const passed = response.ok && (apiCode === "0" || apiCode === "") && Boolean(stdProjectId);
  const evidenceRef = `EV-${runtimeTarget.jobId}-STD-PROJECT-CREATE-ONCE`;
  await repo.upsertPlatformAction({
    actionId,
    jobId: runtimeTarget.jobId,
    confirmationId,
    actionType: "oceanengine_std_project_create",
    endpoint: "/open_api/v3.0/std_project/create/",
    method: "POST",
    actionStatus: passed ? "succeeded" : "failed_or_unconfirmed",
    attemptNo: 1,
    requestHash,
    responseHash,
    httpStatus: response.status,
    apiCode: apiCode || "unknown",
    requestIdPresent,
    objectIdPresent: Boolean(stdProjectId),
    errorSummary: passed ? "" : "platform_create_response_not_confirmed",
    finishedAt: new Date().toISOString(),
    metadata: {
      target_project_name: runtimeTarget.projectName,
      raw_payload_stored: false,
      raw_response_stored: false,
      retry_allowed: false
    }
  });
  writeAttempt(runtimeTarget.jobId, {
    attemptId,
    status: passed ? "create_response_id_present" : "create_response_failed_or_unconfirmed",
    endpoint: "oceanengine:/open_api/v3.0/std_project/create/",
    jobId: runtimeTarget.jobId,
    projectName: runtimeTarget.projectName,
    httpStatus: response.status,
    apiCode: apiCode || "unknown",
    requestIdPresent,
    stdProjectIdPresent: Boolean(stdProjectId),
    responseHash,
    finishedAt: new Date().toISOString()
  });
  await repo.upsertEvidence({
    artifactId: evidenceRef,
    jobId: runtimeTarget.jobId,
    artifactType: passed ? "std_project_create_once" : "std_project_create_once_failed",
    title: "std_project create once",
    summary: `endpoint=std_project/create http=${response.status} api_code=${apiCode || "unknown"} request_id_present=${requestIdPresent} std_project_id_present=${Boolean(stdProjectId)} response_hash_present=true`,
    contentHash: responseHash,
    storageRef: "postgres:evidence_artifacts:redacted_summary_only",
    sourceRef: "oceanengine:/open_api/v3.0/std_project/create/",
    sourceUsage: "runtime_truth"
  });

  if (!passed) {
    await repo.updateNodeRun(runtimeTarget.jobId, "std_project_create_executor", {
      status: "failed",
      summary: `单次 std_project/create 已调用一次但平台未确认成功；api_code=${apiCode || "unknown"}；禁止自动重试。`,
      diagnosticLevel: "error",
      evidenceRefs: [evidenceRef],
      outputSummary: {
        output: "created_object",
        createNodeStatus: "failed_or_unconfirmed",
        create_called: true,
        retry_allowed: false,
        nextConfirmationRequired: false,
        http_status: response.status,
        api_code: apiCode || "unknown",
        request_id_present: requestIdPresent,
        std_project_id_present: false,
        raw_payload_stored: false,
        raw_response_stored: false,
        evidenceRef
      }
    });
    await repo.updateJob(runtimeTarget.jobId, { status: "failed_waiting_manual_review", currentNode: "6" });
    return {
      status: "create_failed_stop_for_manual_review",
      createCalled: true,
      httpStatus: response.status,
      apiCode,
      requestIdPresent,
      stdProjectId: "",
      evidenceRef,
      nextAction: "只读查重判断是否已创建成功；不得自动第二次创建。"
    };
  }

  await repo.upsertReadbackRecord({
    readbackId: `RB-${runtimeTarget.jobId}-STD-PROJECT-REAL`,
    jobId: runtimeTarget.jobId,
    objectType: "std_project",
    objectId: stdProjectId,
    objectName: runtimeTarget.projectName,
    readbackStatus: "created_pending_readback",
    fieldDiffSummary: {
      create_response_id_present: true,
      source: "oceanengine_std_project_create"
    },
    evidenceRef
  });
  await repo.upsertCreatedObject({
    createdObjectId: `CO-${runtimeTarget.jobId}-STD-PROJECT-${stdProjectId}`,
    jobId: runtimeTarget.jobId,
    confirmationId,
    actionId,
    objectType: "std_project",
    objectId: stdProjectId,
    objectName: runtimeTarget.projectName,
    objectStatus: "created_pending_readback",
    readbackStatus: "pending",
    evidenceRef,
    metadata: {
      create_response_id_present: true,
      raw_payload_stored: false,
      raw_response_stored: false
    }
  });
  await repo.updateNodeRun(runtimeTarget.jobId, "std_project_draft_builder", {
    status: "passed",
    summary: "创建草稿已确认，payload hash 未变化。",
    diagnosticLevel: "info",
    outputSummary: { payloadHashStable: true }
  });
  await repo.updateNodeRun(runtimeTarget.jobId, "std_project_create_executor", {
    status: "passed",
    summary: "真实 std_project/create 已单次执行，返回真实 std_project_id。",
    diagnosticLevel: "info",
    evidenceRefs: [evidenceRef],
    outputSummary: {
      output: "created_object",
      createNodeStatus: "created_once",
      realObjectIdPresent: true,
      nextConfirmationRequired: false,
      retry_allowed: false,
      writeActionCount: 1,
      evidenceRef
    }
  });

  const readback = await readbackStdProjectOnce({ repo, jobId: runtimeTarget.jobId, target: runtimeTarget, fetchImpl });
  await repo.updateJob(runtimeTarget.jobId, { status: readback.status === "readback_verified" ? "created" : "created_pending_readback", currentNode: "7" });
  return {
    status: readback.status === "readback_verified" ? "created_and_readback_verified" : "created_readback_not_verified",
    createCalled: true,
    httpStatus: response.status,
    apiCode,
    requestIdPresent,
    stdProjectId,
    projectName: runtimeTarget.projectName,
    evidenceRef,
    readback
  };
}

export async function createStdProjectOnce({ repo, fetchImpl = globalThis.fetch, allowNetworkWrite = false } = {}) {
  const confirmValue = process.env[STD_PROJECT_CREATE_CONFIRM_ENV] || "";
  const credentialSummary = getOceanEngineCredentialSummary();
  const existingAttempt = readAttempt(TARGET_STD_PROJECT_CREATE.jobId);
  const prepared = await prepareStdProjectCreate({ repo, jobId: TARGET_STD_PROJECT_CREATE.jobId });
  const blockers = [
    ...(confirmValue !== STD_PROJECT_CREATE_CONFIRM_VALUE ? ["confirm_variable_missing_or_invalid"] : []),
    ...(!credentialReady(credentialSummary) ? credentialSummary.blockers.map((item) => `credential:${item}`) : []),
    ...(existingAttempt ? ["std_project_create_attempt_already_recorded"] : []),
    ...(!prepared.ready ? prepared.blockers : []),
    ...(!allowNetworkWrite ? ["network_write_not_enabled_by_caller"] : [])
  ];
  if (blockers.length) {
    return {
      status: "blocked_before_create",
      createCalled: false,
      blockers,
      credentialStatus: credentialSummary.status,
      redactedPayloadSummary: prepared.redactedPayloadSummary
    };
  }

  const env = readOceanEngineEnv().env;
  const attemptId = randomUUID();
  const confirmationId = `CONFIRM-${TARGET_STD_PROJECT_CREATE.jobId}-STD-PROJECT-CREATE-ONCE`;
  const actionId = `ACTION-${TARGET_STD_PROJECT_CREATE.jobId}-STD-PROJECT-CREATE-ONCE`;
  const requestHash = `sha256:${sha256(canonicalJson(prepared.payload))}`;
  await repo.upsertLaunchConfirmation({
    confirmationId,
    jobId: TARGET_STD_PROJECT_CREATE.jobId,
    draftId: TARGET_STD_PROJECT_CREATE.draftId,
    objectType: TARGET_STD_PROJECT_CREATE.objectType,
    objectName: TARGET_STD_PROJECT_CREATE.projectName,
    payloadHash: TARGET_STD_PROJECT_CREATE.payloadHash,
    confirmationStatus: "confirmed_for_single_create",
    confirmVariable: `${STD_PROJECT_CREATE_CONFIRM_ENV}=${STD_PROJECT_CREATE_CONFIRM_VALUE}`,
    metadata: {
      maximum_actions: 1,
      retry_allowed: false,
      raw_payload_stored: false,
      raw_response_stored: false
    }
  });
  await repo.upsertPlatformAction({
    actionId,
    jobId: TARGET_STD_PROJECT_CREATE.jobId,
    confirmationId,
    actionType: "oceanengine_std_project_create",
    endpoint: "/open_api/v3.0/std_project/create/",
    method: "POST",
    actionStatus: "started",
    attemptNo: 1,
    requestHash,
    metadata: {
      target_project_name: TARGET_STD_PROJECT_CREATE.projectName,
      raw_payload_stored: false,
      raw_response_stored: false
    }
  });
  writeAttempt(TARGET_STD_PROJECT_CREATE.jobId, {
    attemptId,
    status: "network_attempt_started",
    endpoint: "oceanengine:/open_api/v3.0/std_project/create/",
    jobId: TARGET_STD_PROJECT_CREATE.jobId,
    projectName: TARGET_STD_PROJECT_CREATE.projectName,
    startedAt: new Date().toISOString()
  });

  const response = await fetchImpl(`${API_BASE}${CREATE_ENDPOINT}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "Access-Token": env.OCEANENGINE_ACCESS_TOKEN
    },
    body: JSON.stringify(prepared.payload)
  });
  const text = await response.text();
  let payload = {};
  try {
    payload = JSON.parse(text);
  } catch {
    payload = {};
  }
  const apiCode = extractApiCode(payload);
  const requestIdPresent = Boolean(extractRequestId(payload));
  const stdProjectId = extractStdProjectId(payload);
  const responseHash = `sha256:${sha256(text)}`;
  const passed = response.ok && (apiCode === "0" || apiCode === "") && Boolean(stdProjectId);
  const evidenceRef = `EV-${TARGET_STD_PROJECT_CREATE.jobId}-STD-PROJECT-CREATE-ONCE`;
  await repo.upsertPlatformAction({
    actionId,
    jobId: TARGET_STD_PROJECT_CREATE.jobId,
    confirmationId,
    actionType: "oceanengine_std_project_create",
    endpoint: "/open_api/v3.0/std_project/create/",
    method: "POST",
    actionStatus: passed ? "succeeded" : "failed_or_unconfirmed",
    attemptNo: 1,
    requestHash,
    responseHash,
    httpStatus: response.status,
    apiCode: apiCode || "unknown",
    requestIdPresent,
    objectIdPresent: Boolean(stdProjectId),
    errorSummary: passed ? "" : "platform_create_response_not_confirmed",
    finishedAt: new Date().toISOString(),
    metadata: {
      target_project_name: TARGET_STD_PROJECT_CREATE.projectName,
      raw_payload_stored: false,
      raw_response_stored: false
    }
  });

  writeAttempt(TARGET_STD_PROJECT_CREATE.jobId, {
    attemptId,
    status: passed ? "create_response_id_present" : "create_response_failed_or_unconfirmed",
    endpoint: "oceanengine:/open_api/v3.0/std_project/create/",
    jobId: TARGET_STD_PROJECT_CREATE.jobId,
    projectName: TARGET_STD_PROJECT_CREATE.projectName,
    httpStatus: response.status,
    apiCode: apiCode || "unknown",
    requestIdPresent,
    stdProjectIdPresent: Boolean(stdProjectId),
    responseHash,
    finishedAt: new Date().toISOString()
  });

  await repo.upsertEvidence({
    artifactId: evidenceRef,
    jobId: TARGET_STD_PROJECT_CREATE.jobId,
    artifactType: passed ? "std_project_create_once" : "std_project_create_once_failed",
    title: "std_project create once",
    summary: `endpoint=std_project/create http=${response.status} api_code=${apiCode || "unknown"} request_id_present=${requestIdPresent} std_project_id_present=${Boolean(stdProjectId)} response_hash_present=true`,
    contentHash: responseHash,
    storageRef: "postgres:evidence_artifacts:redacted_summary_only",
    sourceRef: "oceanengine:/open_api/v3.0/std_project/create/"
  });

  if (!passed) {
    return {
      status: "create_failed_stop_for_manual_review",
      createCalled: true,
      httpStatus: response.status,
      apiCode,
      requestIdPresent,
      stdProjectId: "",
      evidenceRef,
      nextAction: "只读查重判断是否已创建成功；不得自动第二次创建。"
    };
  }

  await repo.upsertReadbackRecord({
    readbackId: `RB-${TARGET_STD_PROJECT_CREATE.jobId}-STD-PROJECT-REAL`,
    jobId: TARGET_STD_PROJECT_CREATE.jobId,
    objectType: "std_project",
    objectId: stdProjectId,
    objectName: TARGET_STD_PROJECT_CREATE.projectName,
    readbackStatus: "created_pending_readback",
    fieldDiffSummary: {
      create_response_id_present: true,
      source: "oceanengine_std_project_create"
    },
    evidenceRef
  });
  await repo.upsertCreatedObject({
    createdObjectId: `CO-${TARGET_STD_PROJECT_CREATE.jobId}-STD-PROJECT-${stdProjectId}`,
    jobId: TARGET_STD_PROJECT_CREATE.jobId,
    confirmationId,
    actionId,
    objectType: "std_project",
    objectId: stdProjectId,
    objectName: TARGET_STD_PROJECT_CREATE.projectName,
    objectStatus: "created_pending_readback",
    readbackStatus: "pending",
    evidenceRef,
    metadata: {
      create_response_id_present: true,
      raw_payload_stored: false,
      raw_response_stored: false
    }
  });
  await repo.updateNodeRun(TARGET_STD_PROJECT_CREATE.jobId, "std_project_draft_builder", {
    status: "passed",
    summary: "创建草稿已确认，payload hash 未变化。",
    diagnosticLevel: "info",
    outputSummary: { payloadHashStable: true }
  });
  await repo.updateNodeRun(TARGET_STD_PROJECT_CREATE.jobId, "std_project_create_executor", {
    status: "passed",
    summary: "真实 std_project/create 已单次执行，返回真实 std_project_id。",
    diagnosticLevel: "info",
    evidenceRefs: [evidenceRef],
    outputSummary: {
      output: "created_object",
      createNodeStatus: "created_once",
      realObjectIdPresent: true,
      nextConfirmationRequired: false,
      writeActionCount: 1,
      evidenceRef
    }
  });

  const readback = await readbackStdProjectOnce({ repo, jobId: TARGET_STD_PROJECT_CREATE.jobId, fetchImpl });
  return {
    status: readback.status === "readback_verified" ? "created_and_readback_verified" : "created_readback_not_verified",
    createCalled: true,
    httpStatus: response.status,
    apiCode,
    requestIdPresent,
    stdProjectId,
    projectName: TARGET_STD_PROJECT_CREATE.projectName,
    evidenceRef,
    readback
  };
}
