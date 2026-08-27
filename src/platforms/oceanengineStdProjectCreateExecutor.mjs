import { createHash } from "node:crypto";
import {
  credentialReady,
  getOceanEngineCredentialSummary,
  readOceanEngineEnv
} from "./oceanengineCredentialStore.mjs";
import { evaluateOe3PayloadContract, stablePayloadHash } from "../workflows/skills/oe3/05-payload-contract.mjs";
import { buildOe3StdProjectPayload } from "../workflows/skills/oe3/05-payload.mjs";
import {
  evaluateStdProjectCreatePreflight,
  OE3_STD_PROJECT_ALLOWED_PAYLOAD_PATHS
} from "../workflows/skills/oe3/05-create-preflight-diagnostics.mjs";

const API_BASE = "https://api.oceanengine.com";
const CREATE_ENDPOINT = "/open_api/v3.0/std_project/create/";
const LIST_ENDPOINT = "/open_api/v3.0/std_project/list/";

export const STD_PROJECT_CREATE_CONFIRM_ENV = "MWBV2_OE_STD_PROJECT_CREATE_CONFIRM";
export const STD_PROJECT_CREATE_CONFIRM_VALUE = "CREATE_ONE_STD_PROJECT";

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function clean(value) {
  return String(value ?? "").trim();
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
    event_asset_id_present: Boolean(payload.asset_id),
    micro_app_instance_id_present: Boolean(payload.instance_id),
    aweme_id_present: Boolean(payload.aweme_id),
    mini_program_url_present: Boolean(payload.project_materials?.mini_program_info?.url),
    touchpoint_present: Boolean(payload.track_url_setting?.action_track_url?.length),
    product_image_id_present: Boolean(payload.project_materials?.product_info?.image_ids?.length),
    video_material_count: payload.project_materials?.video_material_list?.length || 0,
    title_material_count: payload.project_materials?.title_material_list?.length || 0,
    payload_fingerprint: `sha256:${sha256(canonicalJson(payload))}`
  };
}

function extractApiCode(payload = {}) {
  return clean(payload.code ?? payload.err_no ?? payload.error_code ?? "");
}

function extractRequestId(payload = {}) {
  return clean(payload.request_id || payload.data?.request_id || "");
}

function safeRequestId(payload = {}) {
  const requestId = extractRequestId(payload);
  return /^[A-Za-z0-9._:-]{1,256}$/.test(requestId) ? requestId : "";
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

function collectTextByKey(value, keyPattern, found = []) {
  if (!value || typeof value !== "object") return found;
  if (Array.isArray(value)) {
    value.forEach((item) => collectTextByKey(item, keyPattern, found));
    return found;
  }
  Object.entries(value).forEach(([key, child]) => {
    if (keyPattern.test(key) && typeof child === "string" && clean(child)) found.push(clean(child));
    collectTextByKey(child, keyPattern, found);
  });
  return found;
}

const SAFE_ERROR_FIELD_PATHS = [...OE3_STD_PROJECT_ALLOWED_PAYLOAD_PATHS]
  .filter((path) => !path.includes("[]"))
  .sort((left, right) => right.length - left.length);

function safeOffendingFieldPath(text = "") {
  const normalized = clean(text).toLowerCase();
  return SAFE_ERROR_FIELD_PATHS.find((path) => normalized.includes(path.toLowerCase())) || "";
}

function safeErrorCategory({ text = "", fieldPath = "", apiCode = "" } = {}) {
  const normalized = clean(text).toLowerCase();
  if (/permission|authorize|authorization|scope|无权限|权限/.test(normalized)) return "permission_denied";
  if (/landing|external_url_material_list|落地页|链接/.test(normalized)) return "landing_url_invalid";
  if (/asset|resource|brand|event|image|video|素材|资源|品牌|事件/.test(normalized)) return "resource_not_eligible";
  if (fieldPath || /invalid|required|param|field|参数|字段|必填/.test(normalized)) return "invalid_field";
  return apiCode ? "unclassified" : "";
}

export function safePlatformErrorSummary(payload = {}) {
  const apiCode = extractApiCode(payload);
  const messageTexts = collectTextByKey(payload, /^(message|msg)$/i);
  const errorTexts = collectTextByKey(payload, /(error|reason|detail|hint|field)/i);
  const joined = [...messageTexts, ...errorTexts].join(" ").toLowerCase();
  const offendingFieldPath = safeOffendingFieldPath(joined);
  const errorCategory = safeErrorCategory({ text: joined, fieldPath: offendingFieldPath, apiCode });
  const keywords = [
    "advertiser",
    "permission",
    "brand",
    "industry",
    "event",
    "asset",
    "product",
    "image",
    "video",
    "dmp",
    "audience",
    "touchpoint",
    "track",
    "app",
    "instance",
    "budget",
    "bid",
    "duplicate",
    "required",
    "invalid",
    "param",
    "field"
  ].filter((keyword) => joined.includes(keyword));
  return {
    api_code: apiCode || "",
    request_id_present: Boolean(extractRequestId(payload)),
    request_id: safeRequestId(payload),
    error_category: errorCategory,
    offending_field_path: offendingFieldPath,
    message_present: messageTexts.length > 0,
    error_message_present: errorTexts.length > 0,
    error_keyword_present: keywords.length > 0,
    error_keywords_count: keywords.length,
    safe_error_fingerprint: `sha256:${sha256(canonicalJson({
      api_code: apiCode || "",
      error_category: errorCategory,
      offending_field_path: offendingFieldPath,
      keywords,
      message_present: messageTexts.length > 0,
      error_message_present: errorTexts.length > 0
    }))}`
  };
}

function summarizeListPayload(payload = {}, projectName = "") {
  const data = payload.data || {};
  const list = data.list || data.items || data.projects || [];
  const items = Array.isArray(list) ? list : [];
  const match = items.find((item) => clean(item.name || item.project_name || item.std_project_name) === projectName) || null;
  return {
    apiCode: extractApiCode(payload),
    requestIdPresent: Boolean(extractRequestId(payload)),
    listCount: items.length,
    objectId: clean(match?.project_id || match?.std_project_id || match?.id || ""),
    objectName: clean(match?.name || match?.project_name || match?.std_project_name || ""),
    objectStatus: clean(match?.status || match?.project_status || match?.opt_status || ""),
    objectNameMatches: Boolean(match)
  };
}

function targetFromBundle(bundle = {}) {
  const executionPlan = bundle.executionPlan || {};
  const planActions = executionPlan.planned_actions || executionPlan.plannedActions || [];
  const createAction = planActions.find((action) => action.action_type === "std_project_create") || {};
  return {
    jobId: bundle.job?.job_id || "",
    draftId: bundle.draft?.draft_id || "",
    planId: executionPlan.plan_id || executionPlan.planId || "",
    planHash: executionPlan.plan_hash || executionPlan.planHash || "",
    planStdProjectCreateIdempotencyKey: createAction.idempotency_key || "",
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
  const draftNode = (bundle.nodes || []).find((node) => node.node_key === "std_project_draft_builder") || {};
  return createNode.output_summary?.createReadiness || draftNode.output_summary?.createReadiness || {};
}

async function createAttemptState(repo, jobId) {
  if (typeof repo.getCreateAttemptState === "function") return repo.getCreateAttemptState(jobId);
  return { createActionCount: 0, confirmationCount: 0, createdObjectCount: 0, realReadbackCount: 0 };
}

export async function prepareStdProjectCreate({ repo, jobId, target = null } = {}) {
  if (!jobId) throw new Error("job_id_required");
  const bundle = await repo.getLaunchJobBundle(jobId);
  if (!bundle) throw new Error("target_job_not_found");
  const runtimeTarget = { ...targetFromBundle(bundle), ...(target || {}) };
  const touchpoint = await repo.getControlledTouchpointUrl({
    routeId: bundle.job.route_id,
    gameCode: bundle.job.game_code,
    advertiserId: bundle.job.advertiser_id,
    monitorId: bundle.account.monitor_id
  });
  const backupLandingPageUrl = await repo.getControlledBackupLandingPageUrl({
    routeId: bundle.job.route_id,
    gameCode: bundle.job.game_code,
    advertiserId: bundle.job.advertiser_id
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
  const finalPayload = buildOe3StdProjectPayload({
    bundle,
    touchpointUrl: touchpoint?.touchpoint_url || "",
    backupLandingPageUrl: backupLandingPageUrl || {}
  });
  const createPreflight = evaluateStdProjectCreatePreflight({
    payload: finalPayload.payload,
    requestFieldManifest: finalPayload.requestFieldManifest,
    payloadContractStatus: contract.status
  });
  const blockers = [
    ...(bundle.job.job_id !== runtimeTarget.jobId ? ["target_job_mismatch"] : []),
    ...(bundle.draft?.draft_id !== runtimeTarget.draftId ? ["target_draft_mismatch"] : []),
    ...(bundle.job.route_id !== runtimeTarget.routeId ? ["target_route_mismatch"] : []),
    ...(bundle.job.game_code !== runtimeTarget.gameCode ? ["target_game_code_mismatch"] : []),
    ...(bundle.job.advertiser_id !== runtimeTarget.advertiserId ? ["target_advertiser_mismatch"] : []),
    ...(bundle.draft?.project_name !== runtimeTarget.projectName ? ["target_project_name_mismatch"] : []),
    ...(bundle.draft?.payload_hash !== runtimeTarget.payloadHash ? ["target_payload_hash_mismatch"] : []),
    ...(!payloadHashStable ? ["payload_hash_not_stable"] : []),
    ...(bundle.draft?.duplicate_status !== "platform_not_duplicate" ? ["duplicate_status_not_platform_not_duplicate"] : []),
    ...(contract.status !== "passed" ? contract.gaps.map((gap) => `payload_contract:${gap.key}`) : []),
    ...(!touchpoint?.touchpoint_url ? ["controlled_touchpoint_url_missing"] : []),
    ...(!touchpointVerification.urlHashMatches ? ["touchpoint_hash_mismatch"] : []),
    ...finalPayload.blockers,
    ...createPreflight.blocker_codes
  ];
  return {
    ready: blockers.length === 0,
    blockers,
    bundle,
    target: runtimeTarget,
    payload: finalPayload.payload,
    redactedPayloadSummary: redactedPayloadSummary(finalPayload.payload),
    payloadContractStatus: contract.status,
    payloadHashStable,
    createPreflight
  };
}

export async function createStdProjectForTargetOnce({
  repo,
  target,
  fetchImpl = globalThis.fetch,
  allowNetworkWrite = false,
  confirmationIntent = "",
  confirmVariableValue = process.env[STD_PROJECT_CREATE_CONFIRM_ENV] || "",
  grantSource = "",
  executionGrantId = "",
  readiness: readinessOverride = null
} = {}) {
  if (!target?.jobId) throw new Error("target_required");
  const bundle = await repo.getLaunchJobBundle(target.jobId);
  if (!bundle) throw new Error("target_job_not_found");
  const runtimeTarget = { ...targetFromBundle(bundle), ...target };
  const fakeTransport = grantSource === "test_fake_transport";
  const credentialSummary = fakeTransport ? { status: "valid", blockers: [] } : getOceanEngineCredentialSummary();
  const prepared = await prepareStdProjectCreate({ repo, jobId: runtimeTarget.jobId, target: runtimeTarget });
  const readiness = readinessOverride || latestCreateReadiness(bundle);
  const attemptState = await createAttemptState(repo, runtimeTarget.jobId);
  const blockers = [
    ...(confirmationIntent !== STD_PROJECT_CREATE_CONFIRM_VALUE ? ["confirmation_intent_missing_or_invalid"] : []),
    ...(confirmVariableValue !== STD_PROJECT_CREATE_CONFIRM_VALUE ? ["confirm_variable_missing_or_invalid"] : []),
    ...(!fakeTransport && !credentialReady(credentialSummary) ? credentialSummary.blockers.map((item) => `credential:${item}`) : []),
    ...(bundle.job.source_usage !== "runtime_truth" && !fakeTransport ? ["job_not_runtime_truth"] : []),
    ...((attemptState.createActionCount || 0) > 0 ? ["platform_action_already_recorded"] : []),
    ...((attemptState.confirmationCount || 0) > 0 ? ["confirmation_already_recorded"] : []),
    ...((attemptState.createdObjectCount || 0) > 0 ? ["created_object_already_recorded"] : []),
    ...((attemptState.realReadbackCount || 0) > 0 ? ["real_readback_already_recorded"] : []),
    ...(readiness.status !== "ready_for_user_create_confirmation" ? [`readiness_not_ready:${readiness.status || "missing"}`] : []),
    ...(!fakeTransport && readiness.brandIndustryStatus !== "passed" ? ["brand_industry_not_passed"] : []),
    ...(!fakeTransport && readiness.eventChainStatus !== "passed" ? ["event_chain_not_passed"] : []),
    ...(readiness.payloadContractStatus !== "passed" ? ["payload_contract_not_passed"] : []),
    ...(readiness.duplicateStatus !== "platform_not_duplicate" ? ["duplicate_check_not_platform_not_duplicate"] : []),
    ...(runtimeTarget.payloadHash !== bundle.draft?.payload_hash ? ["payload_hash_mismatch"] : []),
    ...(!fakeTransport && !prepared.ready ? prepared.blockers : []),
    ...(!allowNetworkWrite ? ["network_write_not_enabled_by_caller"] : [])
  ];
  if (blockers.length) {
    return {
      status: "blocked_before_create",
      createCalled: false,
      blockers,
      credentialStatus: credentialSummary.status,
      attemptState,
      redactedPayloadSummary: prepared.redactedPayloadSummary,
      createPreflight: prepared.createPreflight
    };
  }

  const env = fakeTransport ? {} : readOceanEngineEnv().env;
  const confirmationId = `CONFIRM-${runtimeTarget.jobId}-STD-PROJECT-CREATE-ONCE`;
  const actionId = `ACTION-${runtimeTarget.jobId}-STD-PROJECT-CREATE-ONCE`;
  const requestHash = `sha256:${sha256(canonicalJson(prepared.payload))}`;
  const claim = await repo.claimStdProjectCreateAction({
    confirmation: {
      confirmationId,
      jobId: runtimeTarget.jobId,
      draftId: runtimeTarget.draftId,
      objectType: runtimeTarget.objectType,
      objectName: runtimeTarget.projectName,
      payloadHash: runtimeTarget.payloadHash,
      confirmationStatus: "confirmed_for_single_create",
      confirmVariable: `${STD_PROJECT_CREATE_CONFIRM_ENV}=${STD_PROJECT_CREATE_CONFIRM_VALUE}`,
      planId: runtimeTarget.planId,
      metadata: {
        grant_source: grantSource || "unknown",
        execution_grant_id: executionGrantId || "",
        job_id: runtimeTarget.jobId,
        plan_id: runtimeTarget.planId,
        plan_hash: runtimeTarget.planHash,
        payload_hash: runtimeTarget.payloadHash,
        maximum_actions: 1,
        retry_allowed: false,
        raw_payload_stored: false,
        raw_response_stored: false
      }
    },
    action: {
      actionId,
      jobId: runtimeTarget.jobId,
      confirmationId,
      planId: runtimeTarget.planId,
      actionType: "oceanengine_std_project_create",
      endpoint: CREATE_ENDPOINT,
      method: "POST",
      attemptNo: 1,
      requestHash,
      idempotencyKey: runtimeTarget.planStdProjectCreateIdempotencyKey,
      metadata: { target_project_name: runtimeTarget.projectName, raw_payload_stored: false, raw_response_stored: false, retry_allowed: false }
    }
  });
  if (!claim.claimed) {
    return {
      status: "blocked_before_create",
      createCalled: false,
      blockers: ["platform_action_already_recorded"],
      credentialStatus: credentialSummary.status,
      attemptState: await createAttemptState(repo, runtimeTarget.jobId),
      redactedPayloadSummary: prepared.redactedPayloadSummary,
      createPreflight: prepared.createPreflight
    };
  }

  const response = await fetchImpl(`${API_BASE}${CREATE_ENDPOINT}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", "Access-Token": env.OCEANENGINE_ACCESS_TOKEN },
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
  const safeErrorSummary = safePlatformErrorSummary(payload);
  const responseHash = `sha256:${sha256(text)}`;
  const passed = response.ok && (apiCode === "0" || apiCode === "") && Boolean(stdProjectId);
  const evidenceRef = `EV-${runtimeTarget.jobId}-STD-PROJECT-CREATE-ONCE`;
  await repo.upsertPlatformAction({
    actionId,
    jobId: runtimeTarget.jobId,
    confirmationId,
    planId: runtimeTarget.planId,
    actionType: "oceanengine_std_project_create",
    endpoint: CREATE_ENDPOINT,
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
    requestId: safeErrorSummary.request_id,
    errorCategory: passed ? "" : safeErrorSummary.error_category,
    offendingFieldPath: passed ? "" : safeErrorSummary.offending_field_path,
    idempotencyKey: runtimeTarget.planStdProjectCreateIdempotencyKey,
    responseSummary: {
      ...safeErrorSummary,
      object_id_present: Boolean(stdProjectId),
      response_hash_present: true
    },
    finishedAt: new Date().toISOString(),
    metadata: { target_project_name: runtimeTarget.projectName, raw_payload_stored: false, raw_response_stored: false, retry_allowed: false }
  });
  await repo.upsertEvidence({
    artifactId: evidenceRef,
    jobId: runtimeTarget.jobId,
    artifactType: passed ? "std_project_create_once" : "std_project_create_once_failed",
    title: "std_project create once",
    summary: `endpoint=std_project/create http=${response.status} api_code=${apiCode || "unknown"} request_id_present=${requestIdPresent} std_project_id_present=${Boolean(stdProjectId)} response_hash_present=true`,
    contentHash: responseHash,
    storageRef: "postgres:evidence_artifacts:redacted_summary_only",
    sourceRef: `oceanengine:${CREATE_ENDPOINT}`,
    sourceUsage: "runtime_truth"
  });

  if (!passed) {
    return { status: "create_failed_stop_for_manual_review", createCalled: true, httpStatus: response.status, apiCode, requestIdPresent, stdProjectId: "", evidenceRef };
  }

  await repo.upsertReadbackRecord({
    readbackId: `RB-${runtimeTarget.jobId}-STD-PROJECT-CREATED-PENDING`,
    jobId: runtimeTarget.jobId,
    objectType: "std_project",
    objectId: stdProjectId,
    objectName: runtimeTarget.projectName,
    readbackStatus: "created_pending_readback",
    fieldDiffSummary: { create_response_id_present: true, source: "oceanengine_std_project_create" },
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
    metadata: { create_response_id_present: true, raw_payload_stored: false, raw_response_stored: false }
  });
  return {
    status: "created_pending_readback",
    createCalled: true,
    httpStatus: response.status,
    apiCode,
    requestIdPresent,
    stdProjectId,
    projectName: runtimeTarget.projectName,
    evidenceRef
  };
}

export async function readbackStdProjectOnce({ repo, jobId, target = null, fetchImpl = globalThis.fetch } = {}) {
  if (!jobId) throw new Error("job_id_required");
  const bundle = await repo.getLaunchJobBundle(jobId);
  if (!bundle) throw new Error("target_job_not_found");
  const runtimeTarget = { ...targetFromBundle(bundle), ...(target || {}) };
  const fakeTransport = target?.grantSource === "test_fake_transport";
  const credentialSummary = fakeTransport ? { status: "ready", blockers: [] } : getOceanEngineCredentialSummary();
  if (!fakeTransport && !credentialReady(credentialSummary)) {
    return { status: "credential_required", blockers: credentialSummary.blockers };
  }
  const env = fakeTransport ? {} : readOceanEngineEnv().env;
  const url = new URL(`${API_BASE}${LIST_ENDPOINT}`);
  url.searchParams.set("advertiser_id", runtimeTarget.advertiserId);
  url.searchParams.set("filtering", JSON.stringify({ name: runtimeTarget.projectName }));
  url.searchParams.set("page", "1");
  url.searchParams.set("page_size", "20");
  const response = await fetchImpl(url, {
    method: "GET",
    headers: { Accept: "application/json", "Access-Token": env.OCEANENGINE_ACCESS_TOKEN }
  });
  const text = await response.text();
  let payload = {};
  try {
    payload = JSON.parse(text);
  } catch {
    payload = {};
  }
  const summary = summarizeListPayload(payload, runtimeTarget.projectName);
  const evidenceRef = `EV-${jobId}-STD-PROJECT-READBACK-ONCE`;
  await repo.upsertEvidence({
    artifactId: evidenceRef,
    jobId,
    artifactType: "std_project_readback_once",
    title: "std_project readback once",
    summary: `endpoint=std_project/list http=${response.status} api_code=${summary.apiCode || "unknown"} request_id_present=${summary.requestIdPresent} object_id_present=${Boolean(summary.objectId)} object_name_matches=${summary.objectNameMatches}`,
    contentHash: `sha256:${sha256(text)}`,
    storageRef: "postgres:evidence_artifacts:redacted_summary_only",
    sourceRef: `oceanengine:${LIST_ENDPOINT}`,
    sourceUsage: "runtime_truth"
  });
  const responseConfirmedByCreate = bundle.platformAction?.action_status === "succeeded" &&
    bundle.platformAction?.object_id_present === true;
  if (summary.objectId && summary.objectNameMatches) {
    if (!responseConfirmedByCreate && bundle.platformAction?.action_id && typeof repo.mergePlatformActionMetadata === "function") {
      await repo.mergePlatformActionMetadata(bundle.platformAction.action_id, {
        recovered_by_readback: true,
        readback_object_name_matches_draft: true,
        retry_allowed: false,
        raw_payload_stored: false,
        raw_response_stored: false
      });
    }
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
      metadata: { readback_source: "oceanengine_std_project_list", object_name_matches_draft: true }
    });
    await repo.upsertReadbackRecord({
      readbackId: `RB-${jobId}-STD-PROJECT-REAL`,
      jobId,
      objectType: "std_project",
      objectId: summary.objectId,
      objectName: summary.objectName,
      readbackStatus: "readback_verified",
      fieldDiffSummary: { object_name_matches_draft: true, object_status: summary.objectStatus || "readable", source: "oceanengine_std_project_list" },
      evidenceRef
    });
  } else {
    await repo.upsertReadbackRecord({
      readbackId: `RB-${jobId}-STD-PROJECT-REAL`,
      jobId,
      objectType: "std_project",
      objectId: "NOT_FOUND_AFTER_CREATE",
      objectName: runtimeTarget.projectName,
      readbackStatus: "not_found_after_create",
      fieldDiffSummary: {
        object_name_matches_draft: false,
        source: "oceanengine_std_project_list",
        real_platform_readback_called: true,
        request_id_present: summary.requestIdPresent === true,
        api_code: summary.apiCode || "",
        create_response_confirmed: responseConfirmedByCreate,
        raw_response_stored: false
      },
      evidenceRef
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
