import { createHash, randomUUID } from "node:crypto";
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
import { buildStdProjectCreateWireBody } from "../workflows/skills/oe3/05-std-project-create-wire-body.mjs";
import { canonicalGuideVideoReadiness } from "../workflows/skills/oe3/04-resource-verifiers.mjs";
import { parseOceanEngineStdProjectResponse } from "./oceanengineStdProjectResponse.mjs";
import {
  fetchWithDeadline,
  isPlatformDeadlineError,
  PLATFORM_JSON_TIMEOUT_MS,
  STD_PROJECT_READBACK_DEADLINE_MS
} from "./httpDeadline.mjs";

const API_BASE = "https://api.oceanengine.com";
const CREATE_ENDPOINT = "/open_api/v3.0/std_project/create/";
const LIST_ENDPOINT = "/open_api/v3.0/std_project/list/";
const MATERIAL_GET_ENDPOINT = "/open_api/v3.0/oc_project/material/get/";

export const STD_PROJECT_40100_REDELIVERY_POLICY = Object.freeze({
  endpoint: CREATE_ENDPOINT,
  api_code: "40100",
  maximum_delivery_calls: 3,
  scheduled_offsets_ms: Object.freeze([0, 20000, 45000]),
  jitter_max_ms: 4000,
  maximum_total_elapsed_ms: 65000
});

export const STD_PROJECT_CREATE_CONFIRM_ENV = "MWBV2_OE_STD_PROJECT_CREATE_CONFIRM";
export const STD_PROJECT_CREATE_CONFIRM_VALUE = "CREATE_ONE_STD_PROJECT";

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function clean(value) {
  return String(value ?? "").trim();
}

function responseUnknownCreateAction(action = {}) {
  return action.action_status === "failed_or_unconfirmed" &&
    action.response_summary?.outcome_category === "platform_response_unknown";
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function redactedPayloadSummary(payload = {}) {
  const wireBody = buildStdProjectCreateWireBody(payload);
  return {
    advertiser_id: clean(payload.advertiser_id),
    name: clean(payload.name),
    brand_info_present: Boolean(payload.brand_info),
    event_asset_id_present: Boolean(payload.asset_id),
    micro_app_instance_id_present: Boolean(payload.instance_id),
    aweme_id_present: Boolean(payload.aweme_id),
    mini_program_launch_link_present: Boolean(payload.project_materials?.mini_program_info?.url),
    touchpoint_present: Boolean(payload.track_url_setting?.action_track_url?.length),
    product_image_id_present: Boolean(payload.project_materials?.product_info?.image_ids?.length),
    video_material_count: payload.project_materials?.video_material_list?.length || 0,
    title_material_count: payload.project_materials?.title_material_list?.length || 0,
    payload_fingerprint: wireBody.bodyHash || `sha256:${sha256(canonicalJson(payload))}`,
    wire_body_hash_present: Boolean(wireBody.bodyHash),
    raw_payload_stored: false
  };
}

function extractApiCode(payload = {}) {
  return clean(payload.code ?? payload.err_no ?? payload.error_code ?? "");
}

function extractRequestId(payload = {}) {
  return clean(payload.request_id || payload.data?.request_id || "");
}

export function safePersistedRequestId(value = "") {
  const requestId = clean(value);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(requestId)) return "";
  if (/(?:raw|token|secret|cookie|credential|url)/i.test(requestId)) return "";
  // A bare long number is treated as an account/object identifier, not a
  // diagnosable request id. Do not persist it in the request-id column.
  if (/^[0-9]{13,}$/.test(requestId)) return "";
  return requestId;
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

// Platform validation messages may name only the JSON leaf instead of the
// canonical request path. Keep this list explicit: accepting arbitrary leaf
// names such as `url` or `name` would create false field attributions.
const SAFE_ERROR_FIELD_ALIASES = new Map([
  ["filter_event", "audience.filter_event"]
]);

function includesFieldToken(text = "", token = "") {
  const escaped = clean(token).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return Boolean(escaped) && new RegExp(`(?:^|[^a-z0-9_])${escaped}(?:$|[^a-z0-9_])`, "i").test(text);
}

function safeOffendingFieldPath(text = "") {
  const normalized = clean(text).toLowerCase();
  const canonicalPath = SAFE_ERROR_FIELD_PATHS.find((path) => normalized.includes(path.toLowerCase()));
  if (canonicalPath) return canonicalPath;
  for (const [alias, path] of SAFE_ERROR_FIELD_ALIASES) {
    if (includesFieldToken(normalized, alias)) return path;
  }
  return "";
}

function safeErrorCategory({ text = "", fieldPath = "", apiCode = "" } = {}) {
  if (apiCode === "40100") return "system_rate_limited";
  const normalized = clean(text).toLowerCase();
  if (/permission|authorize|authorization|scope|无权限|权限/.test(normalized)) return "permission_denied";
  if (/landing|external_url_material_list|落地页|链接/.test(normalized)) return "landing_url_invalid";
  if (fieldPath && /invalid|required|param|field|参数|字段|必填/.test(normalized)) return "invalid_field";
  if (/asset|resource|brand|event|image|video|素材|资源|品牌|事件/.test(normalized)) return "resource_not_eligible";
  if (fieldPath || /invalid|required|param|field|参数|字段|必填/.test(normalized)) return "invalid_field";
  return apiCode ? "unclassified" : "";
}

function safeDiagnosticErrorText({ errorCategory = "", offendingFieldPath = "" } = {}) {
  const categoryLabel = {
    permission_denied: "platform_permission_denied",
    landing_url_invalid: "platform_landing_link_rejected",
    system_rate_limited: "platform_system_rate_limited",
    invalid_field: "platform_field_validation_rejected",
    resource_not_eligible: "platform_resource_eligibility_rejected",
    unclassified: "platform_rejected_without_safe_detail"
  }[errorCategory] || "platform_response_not_confirmed";
  return offendingFieldPath ? `${categoryLabel};field=${offendingFieldPath}` : categoryLabel;
}

function sameRateLimitRedeliveryPolicy(policy = {}) {
  const offsets = Array.isArray(policy.scheduled_offsets_ms) ? policy.scheduled_offsets_ms.map(Number) : [];
  const expected = STD_PROJECT_40100_REDELIVERY_POLICY;
  return policy.endpoint === expected.endpoint &&
    String(policy.api_code || "") === expected.api_code &&
    Number(policy.maximum_delivery_calls) === expected.maximum_delivery_calls &&
    Number(policy.jitter_max_ms) === expected.jitter_max_ms &&
    Number(policy.maximum_total_elapsed_ms) === expected.maximum_total_elapsed_ms &&
    JSON.stringify(offsets) === JSON.stringify(expected.scheduled_offsets_ms);
}

function redeliveryPolicyFromBundle(bundle = {}) {
  const scope = bundle.executionPlan?.metadata?.execution_scope || {};
  const action = (bundle.executionPlan?.planned_actions || bundle.executionPlan?.plannedActions || [])
    .find((item) => item.action_type === "std_project_create") || {};
  const grant = scope.action_grants?.std_project_create || scope.actionGrants?.std_project_create || {};
  const valid = sameRateLimitRedeliveryPolicy(scope.rate_limit_redelivery) &&
    sameRateLimitRedeliveryPolicy(action.rate_limit_redelivery) &&
    sameRateLimitRedeliveryPolicy(grant.rate_limit_redelivery) &&
    Number(action.maximum_platform_calls ?? action.maximumPlatformCalls) === STD_PROJECT_40100_REDELIVERY_POLICY.maximum_delivery_calls &&
    Number(grant.maximum_platform_calls ?? grant.maximumPlatformCalls) === STD_PROJECT_40100_REDELIVERY_POLICY.maximum_delivery_calls &&
    Number(scope.maximum_platform_calls) === STD_PROJECT_40100_REDELIVERY_POLICY.maximum_delivery_calls;
  return valid ? STD_PROJECT_40100_REDELIVERY_POLICY : null;
}

export function stdProjectRateLimitRedeliverySchedule(actionId, policy = STD_PROJECT_40100_REDELIVERY_POLICY) {
  const seed = Number.parseInt(sha256(actionId).slice(0, 8), 16);
  const jitter = Number.isFinite(seed) ? seed % (Number(policy.jitter_max_ms) + 1) : 0;
  return policy.scheduled_offsets_ms.map((offset, index) => index === 0 ? 0 : Number(offset) + jitter);
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
    error_category: errorCategory,
    offending_field_path: offendingFieldPath,
    safe_error_text: safeDiagnosticErrorText({ errorCategory, offendingFieldPath }),
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

function projectIdFromListItem(item = {}) {
  return clean(item?.project_id || item?.std_project_id || item?.id || "");
}

function projectNameFromListItem(item = {}) {
  return clean(item?.name || item?.project_name || item?.std_project_name || "");
}

function summarizeListPayload(payload = {}, { projectName = "", expectedProjectId = "" } = {}) {
  const data = payload.data || {};
  const list = data.list || data.items || data.projects || [];
  const items = Array.isArray(list) ? list : [];
  const nameMatch = items.find((item) => projectNameFromListItem(item) === projectName) || null;
  const expectedId = clean(expectedProjectId);
  const exactIdMatch = expectedId
    ? items.find((item) => projectIdFromListItem(item) === expectedId) || null
    : null;
  // An ID-filtered list must never promote its first item as the created
  // project. Keep a mismatching returned ID only as a fail-closed diagnostic.
  const unexpectedObjectId = expectedId
    ? projectIdFromListItem(items.find((item) => {
        const itemId = projectIdFromListItem(item);
        return Boolean(itemId) && itemId !== expectedId;
      }))
    : "";
  const match = expectedId ? exactIdMatch : nameMatch;
  return {
    apiCode: extractApiCode(payload),
    requestIdPresent: Boolean(extractRequestId(payload)),
    listCount: items.length,
    objectId: projectIdFromListItem(match),
    objectName: projectNameFromListItem(match),
    objectStatus: clean(match?.status || match?.project_status || match?.opt_status || ""),
    objectNameMatches: Boolean(match && projectNameFromListItem(match) === projectName),
    expectedIdFound: Boolean(exactIdMatch),
    unexpectedObjectId
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
    payloadHash: bundle.draft?.payload_hash || "",
    createAttemptNo: Number(executionPlan.metadata?.create_attempt_no || executionPlan.plan_version || 1),
    maximumCreateAttempts: Number(executionPlan.metadata?.maximum_create_attempts || 3),
    verificationSeriesId: clean(executionPlan.metadata?.verification_series_id || ""),
    verificationTaskRef: clean(executionPlan.metadata?.task_ref || "")
  };
}

function expectedGuideVideoBindings(bundle = {}) {
  const guideRequired = canonicalGuideVideoReadiness(bundle).required === true;
  const coverRequired = bundle.account?.video_cover_required === true;
  if (!guideRequired && !coverRequired) {
    return { required: false, status: "not_required", guideVideoId: "", videoIds: [], bindings: [] };
  }
  const guideReadiness = canonicalGuideVideoReadiness(bundle);
  const materialItems = Array.isArray(bundle.materialPack?.items) ? bundle.materialPack.items : [];
  const bindings = materialItems
    .filter((entry) => entry.item?.item_type === "video_asset" && entry.item?.required === true)
    .map((entry) => ({
      videoId: clean(entry.asset?.metadata?.video_id || entry.asset?.metadata?.platform_video_id),
      videoCoverId: clean(entry.asset?.metadata?.video_cover_id || entry.asset?.metadata?.cover_id)
    }));
  const videoIds = bindings.map((item) => item.videoId);
  const ready = (!guideRequired || guideReadiness.status === "passed") &&
    bindings.length > 0 &&
    bindings.every((item) => Boolean(item.videoId) && (!coverRequired || Boolean(item.videoCoverId)));
  return {
    required: true,
    status: ready ? "ready" : "blocked",
    guideRequired,
    coverRequired,
    guideVideoId: ready && guideRequired ? guideReadiness.guideVideoId : "",
    videoIds: ready ? videoIds : [],
    bindings: ready ? bindings : []
  };
}

function summarizeProjectVideoMaterials(payload = {}, expected = {}) {
  const items = [
    payload?.data?.video_material_list,
    payload?.data?.list,
    payload?.data?.material_list,
    payload?.data?.items
  ].find((value) => Array.isArray(value)) || [];
  const expectedBindings = new Map((expected.bindings || []).map((item) => [item.videoId, item]));
  const returnedByVideoId = new Map(items
    .map((item) => [clean(item?.video_id), item])
    .filter(([videoId]) => expectedBindings.has(videoId)));
  const matchedVideoCount = [...expectedBindings.keys()].filter((videoId) => returnedByVideoId.has(videoId)).length;
  const matchedCoverCount = [...expectedBindings.entries()].filter(([videoId, binding]) => {
    if (!expected.coverRequired) return true;
    const returned = returnedByVideoId.get(videoId);
    return clean(returned?.video_cover_id || returned?.video_cover_uri) === clean(binding.videoCoverId);
  }).length;
  const matchedGuideVideoCount = [...expectedBindings.keys()].filter((videoId) => {
    if (!expected.guideRequired) return true;
    return clean(returnedByVideoId.get(videoId)?.guide_video_id) === clean(expected.guideVideoId);
  }).length;
  const expectedVideoCount = expectedBindings.size;
  return {
    apiCode: extractApiCode(payload),
    requestIdPresent: Boolean(extractRequestId(payload)),
    returnedVideoCount: items.length,
    expectedVideoCount,
    matchedVideoCount,
    matchedCoverCount,
    matchedGuideVideoCount,
    allExpectedBindingsMatch: expectedVideoCount > 0 &&
      matchedVideoCount === expectedVideoCount &&
      matchedCoverCount === expectedVideoCount &&
      matchedGuideVideoCount === expectedVideoCount
  };
}

async function readbackGuideVideoMaterialsOnce({ repo, bundle, objectId, fetchImpl, accessToken, remainingMs, evidenceRef: suppliedEvidenceRef = "" }) {
  const expected = expectedGuideVideoBindings(bundle);
  if (!expected.required) return { status: "not_required", called: false, evidenceRef: "" };
  if (expected.status !== "ready") {
    return { status: "blocked_precondition", called: false, evidenceRef: "", expectedVideoCount: 0, matchedVideoCount: 0 };
  }
  if (remainingMs <= 0) {
    return { status: "deadline_exhausted", called: false, evidenceRef: "", expectedVideoCount: expected.videoIds.length, matchedVideoCount: 0 };
  }

  const url = new URL(`${API_BASE}${MATERIAL_GET_ENDPOINT}`);
  url.searchParams.set("advertiser_id", clean(bundle.job.advertiser_id));
  url.searchParams.set("project_id", clean(objectId));
  url.searchParams.set("filtering", JSON.stringify({ material_type: "VIDEO" }));
  url.searchParams.set("page", "1");
  url.searchParams.set("page_size", "100");
  let response = null;
  let text = "";
  let summary = {
    apiCode: "",
    requestIdPresent: false,
    returnedVideoCount: 0,
    expectedVideoCount: expected.videoIds.length,
    matchedVideoCount: 0,
    matchedCoverCount: 0,
    matchedGuideVideoCount: 0,
    allExpectedBindingsMatch: false
  };
  let timedOut = false;
  try {
    response = await fetchWithDeadline(fetchImpl, url, {
      method: "GET",
      headers: { Accept: "application/json", "Access-Token": accessToken }
    }, { timeoutMs: Math.min(PLATFORM_JSON_TIMEOUT_MS, remainingMs) });
    text = await response.text();
    let payload = {};
    try {
      payload = JSON.parse(text);
    } catch {
      payload = {};
    }
    summary = summarizeProjectVideoMaterials(payload, expected);
  } catch (error) {
    timedOut = isPlatformDeadlineError(error);
    text = canonicalJson({ endpoint: "oc_project/material/get", outcome: timedOut ? "timeout" : "transport_error" });
    summary.apiCode = timedOut ? "timeout" : "transport_error";
  }
  const passed = Boolean(response?.ok) && (summary.apiCode === "0" || summary.apiCode === "") && summary.allExpectedBindingsMatch;
  const evidenceRef = clean(suppliedEvidenceRef) || `EV-${bundle.job.job_id}-GUIDE-VIDEO-MATERIAL-READBACK`;
  await repo.upsertEvidence({
    artifactId: evidenceRef,
    jobId: bundle.job.job_id,
    artifactType: "guide_video_material_readback",
    title: "guide video material readback",
    summary: `endpoint=oc_project/material/get status=${passed ? "passed" : "pending"} http=${response?.status || 0} api_code=${summary.apiCode || "unknown"} request_id_present=${summary.requestIdPresent === true} expected_video_count=${summary.expectedVideoCount} matched_video_count=${summary.matchedVideoCount} matched_cover_count=${summary.matchedCoverCount} matched_guide_video_count=${summary.matchedGuideVideoCount} raw_response_stored=false`,
    contentHash: `sha256:${sha256(text)}`,
    storageRef: "postgres:evidence_artifacts:redacted_summary_only",
    sourceRef: `oceanengine:${MATERIAL_GET_ENDPOINT}`,
    sourceUsage: bundle.job.source_usage || "runtime_truth"
  });
  return {
    status: passed ? "passed" : timedOut ? "timeout" : "pending_or_mismatch",
    called: true,
    httpStatus: response?.status || null,
    apiCode: summary.apiCode,
    requestIdPresent: summary.requestIdPresent,
    expectedVideoCount: summary.expectedVideoCount,
    matchedVideoCount: summary.matchedVideoCount,
    matchedCoverCount: summary.matchedCoverCount,
    matchedGuideVideoCount: summary.matchedGuideVideoCount,
    allExpectedBindingsMatch: summary.allExpectedBindingsMatch,
    responseHash: `sha256:${sha256(text)}`,
    evidenceRef
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
  const miniProgramLaunchLink = await repo.getControlledGameRouteLaunchLink({
    routeId: bundle.job.route_id,
    gameCode: bundle.job.game_code,
    platformAppId: bundle.platformApp?.id || "",
    appId: bundle.platformApp?.app_id || ""
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
    backupLandingPageUrl: backupLandingPageUrl || {},
    miniProgramLaunchLink: miniProgramLaunchLink || {}
  });
  const createPreflight = evaluateStdProjectCreatePreflight({
    payload: finalPayload.payload,
    requestFieldManifest: finalPayload.requestFieldManifest,
    payloadContractStatus: contract.status
  });
  const wireBody = buildStdProjectCreateWireBody(finalPayload.payload);
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
    ...(wireBody.status === "blocked" ? wireBody.blockers : []),
    ...createPreflight.blocker_codes
  ];
  return {
    ready: blockers.length === 0,
    blockers,
    bundle,
    target: runtimeTarget,
    payload: finalPayload.payload,
    requestFieldManifest: finalPayload.requestFieldManifest,
    redactedPayloadSummary: redactedPayloadSummary(finalPayload.payload),
    payloadContractStatus: contract.status,
    payloadHashStable,
    createPreflight,
    createWireBodySummary: {
      status: wireBody.status,
      requestHash: wireBody.requestHash,
      instanceIdWireNumberTokenPresent: wireBody.instanceIdWireNumberTokenPresent === true,
      rawPayloadStored: false
    }
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
  readiness: readinessOverride = null,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  nowMs = () => Date.now()
} = {}) {
  if (!target?.jobId) throw new Error("target_required");
  const bundle = await repo.getLaunchJobBundle(target.jobId);
  if (!bundle) throw new Error("target_job_not_found");
  const runtimeTarget = { ...targetFromBundle(bundle), ...target };
  const existingPlanConfirmation = bundle.executionPlan?.metadata?.execution_scope?.binding_mode === "single_confirmation_plan" &&
    typeof repo.getLaunchConfirmationForPlan === "function"
    ? await repo.getLaunchConfirmationForPlan(runtimeTarget.planId)
    : null;
  const planBound = existingPlanConfirmation?.confirmation_status === "confirmed_for_execution_plan";
  const scope = bundle.executionPlan?.metadata?.execution_scope || {};
  const rateLimitRedeliveryPolicy = redeliveryPolicyFromBundle(bundle);
  const rateLimitContractPresent = Object.hasOwn(scope, "rate_limit_redelivery");
  const fakeTransport = grantSource === "test_fake_transport";
  const credentialSummary = fakeTransport ? { status: "valid", blockers: [] } : getOceanEngineCredentialSummary();
  const prepared = await prepareStdProjectCreate({ repo, jobId: runtimeTarget.jobId, target: runtimeTarget });
  const readiness = readinessOverride || latestCreateReadiness(bundle);
  const attemptState = await createAttemptState(repo, runtimeTarget.jobId);
  const caseAttemptState = bundle.job.case_id &&
    typeof repo.getCaseCreateAttemptState === "function"
    ? await repo.getCaseCreateAttemptState(bundle.job.case_id)
    : null;
  const verificationSeriesState = runtimeTarget.verificationSeriesId
    ? await repo.getCaseCreateVerificationSeriesState({
      caseId: bundle.job.case_id,
      verificationSeriesId: runtimeTarget.verificationSeriesId,
      maximumCreateAttempts: runtimeTarget.maximumCreateAttempts
    })
    : null;
  const effectiveAttemptState = verificationSeriesState || caseAttemptState || attemptState;
  const blockers = [
    ...(confirmationIntent !== STD_PROJECT_CREATE_CONFIRM_VALUE ? ["confirmation_intent_missing_or_invalid"] : []),
    ...(confirmVariableValue !== STD_PROJECT_CREATE_CONFIRM_VALUE ? ["confirm_variable_missing_or_invalid"] : []),
    ...(!fakeTransport && !credentialReady(credentialSummary) ? credentialSummary.blockers.map((item) => `credential:${item}`) : []),
    ...(bundle.job.source_usage !== "runtime_truth" && !fakeTransport ? ["job_not_runtime_truth"] : []),
    ...((attemptState.createdObjectCount || 0) > 0 ? ["created_object_already_recorded"] : []),
    ...(caseAttemptState && Number(caseAttemptState.createdObjectCount || 0) > 0 ? ["case_created_object_already_recorded"] : []),
    ...(caseAttemptState && Number(caseAttemptState.readbackVerifiedCount || 0) > 0 ? ["case_readback_already_verified"] : []),
    ...(verificationSeriesState && Number(verificationSeriesState.createdObjectCount || 0) > 0 ? ["verification_series_created_object_already_recorded"] : []),
    ...(verificationSeriesState && Number(verificationSeriesState.readbackVerifiedCount || 0) > 0 ? ["verification_series_readback_already_verified"] : []),
    ...(Number(runtimeTarget.createAttemptNo) !== Number(effectiveAttemptState.nextCreateAttemptNo) ? ["create_attempt_number_not_next"] : []),
    ...(Number(runtimeTarget.createAttemptNo) > Number(effectiveAttemptState.maximumCreateAttempts) ? ["create_attempt_limit_reached"] : []),
    ...(readiness.status !== "ready_for_user_create_confirmation" ? [`readiness_not_ready:${readiness.status || "missing"}`] : []),
    ...(!fakeTransport && readiness.brandIndustryStatus !== "passed" ? ["brand_industry_not_passed"] : []),
    ...(!fakeTransport && readiness.eventChainStatus !== "passed" ? ["event_chain_not_passed"] : []),
    ...(readiness.payloadContractStatus !== "passed" ? ["payload_contract_not_passed"] : []),
    ...(readiness.duplicateStatus !== "platform_not_duplicate" ? ["duplicate_check_not_platform_not_duplicate"] : []),
    ...(runtimeTarget.payloadHash !== bundle.draft?.payload_hash ? ["payload_hash_mismatch"] : []),
    ...(planBound &&
      bundle.draft?.payload_summary?.derived_from_plan_id !== runtimeTarget.planId
      ? ["final_draft_not_derived_from_confirmed_plan"] : []),
    ...(planBound &&
      bundle.draft?.payload_summary?.derived_from_plan_hash !== runtimeTarget.planHash
      ? ["final_draft_confirmed_plan_hash_mismatch"] : []),
    ...(planBound &&
      bundle.draft?.payload_summary?.plan_derivation_status !== "passed"
      ? ["final_draft_plan_derivation_not_passed"] : []),
    ...(rateLimitContractPresent && !rateLimitRedeliveryPolicy ? ["rate_limit_redelivery_contract_invalid"] : []),
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
  const attemptLabel = String(runtimeTarget.createAttemptNo).padStart(2, "0");
  const confirmationId = planBound
    ? existingPlanConfirmation?.confirmation_id || ""
    : `CONFIRM-${runtimeTarget.jobId}-STD-PROJECT-CREATE-A${attemptLabel}`;
  if (planBound && !confirmationId) {
    return {
      status: "blocked_before_create",
      createCalled: false,
      blockers: ["execution_plan_confirmation_missing_before_create"],
      credentialStatus: credentialSummary.status,
      attemptState,
      redactedPayloadSummary: prepared.redactedPayloadSummary,
      createPreflight: prepared.createPreflight
    };
  }
  const actionId = `ACTION-${runtimeTarget.jobId}-STD-PROJECT-CREATE-A${attemptLabel}`;
  const requestFieldManifest = prepared.requestFieldManifest || bundle.draft?.payload_summary?.final_payload_manifest || {};
  const wireBody = buildStdProjectCreateWireBody(prepared.payload);
  const requestHash = wireBody.requestHash;
  const claim = await repo.claimStdProjectCreateAction({
    confirmation: {
      confirmationId,
      jobId: runtimeTarget.jobId,
      draftId: runtimeTarget.draftId,
      objectType: runtimeTarget.objectType,
      objectName: runtimeTarget.projectName,
      payloadHash: runtimeTarget.payloadHash,
      confirmationStatus: planBound ? "confirmed_for_execution_plan" : "confirmed_for_single_create",
      confirmVariable: planBound
        ? existingPlanConfirmation.confirm_variable
        : `${STD_PROJECT_CREATE_CONFIRM_ENV}=${STD_PROJECT_CREATE_CONFIRM_VALUE}`,
      planId: runtimeTarget.planId,
      metadata: {
        grant_source: grantSource || "unknown",
        execution_grant_id: executionGrantId || "",
        job_id: runtimeTarget.jobId,
        plan_id: runtimeTarget.planId,
        plan_hash: runtimeTarget.planHash,
        payload_hash: runtimeTarget.payloadHash,
        maximum_actions: 1,
        attempt_no: runtimeTarget.createAttemptNo,
        maximum_total_attempts: runtimeTarget.maximumCreateAttempts,
        retry_allowed: false,
        rate_limit_redelivery: rateLimitRedeliveryPolicy ? {
          api_code: rateLimitRedeliveryPolicy.api_code,
          maximum_delivery_calls: rateLimitRedeliveryPolicy.maximum_delivery_calls
        } : {},
        verification_series_id: runtimeTarget.verificationSeriesId || "",
        verification_task_ref: runtimeTarget.verificationTaskRef || "",
        raw_payload_stored: false,
        raw_response_stored: false,
        create_wire_body_hash: requestHash,
        create_wire_body_strategy: "decimal_bigint_json_number"
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
      attemptNo: runtimeTarget.createAttemptNo,
      requestHash,
      idempotencyKey: runtimeTarget.planStdProjectCreateIdempotencyKey,
      requestFieldManifest,
      metadata: {
        target_project_name: runtimeTarget.projectName,
        raw_payload_stored: false,
        raw_response_stored: false,
        retry_allowed: false,
        rate_limit_redelivery: rateLimitRedeliveryPolicy ? {
          api_code: rateLimitRedeliveryPolicy.api_code,
          maximum_delivery_calls: rateLimitRedeliveryPolicy.maximum_delivery_calls
        } : {},
        attempt_no: runtimeTarget.createAttemptNo,
        create_wire_body_hash: requestHash,
        verification_series_id: runtimeTarget.verificationSeriesId || "",
        verification_task_ref: runtimeTarget.verificationTaskRef || ""
      }
    },
    requireExistingConfirmation: planBound
  });
  if (!claim.claimed) {
    return {
      status: "blocked_before_create",
      createCalled: false,
      blockers: ["platform_action_already_recorded_for_attempt"],
      credentialStatus: credentialSummary.status,
      attemptState: await createAttemptState(repo, runtimeTarget.jobId),
      redactedPayloadSummary: prepared.redactedPayloadSummary,
      createPreflight: prepared.createPreflight
    };
  }

  const deliveryPolicy = rateLimitRedeliveryPolicy;
  const deliveryOffsets = deliveryPolicy ? stdProjectRateLimitRedeliverySchedule(actionId, deliveryPolicy) : [0];
  const deliveryStartedAtMs = nowMs();
  const evidenceRef = `EV-${runtimeTarget.jobId}-STD-PROJECT-CREATE-A${attemptLabel}`;
  let response = null;
  let text = "";
  let payload = {};
  let apiCode = "";
  let requestId = "";
  let requestIdPresent = false;
  let persistedRequestId = "";
  let stdProjectId = "";
  let safeErrorSummary = safePlatformErrorSummary({});
  let responseHash = "";
  let passed = false;
  let deliveryCount = 0;
  let rateLimitedDeliveryCount = 0;

  for (let index = 0; index < deliveryOffsets.length; index += 1) {
    const deliveryNo = index + 1;
    const scheduledOffsetMs = deliveryOffsets[index];
    const remainingDelayMs = Math.max(0, deliveryStartedAtMs + scheduledOffsetMs - nowMs());
    if (remainingDelayMs > 0) await wait(remainingDelayMs);
    const scheduledAt = new Date(deliveryStartedAtMs + scheduledOffsetMs).toISOString();
    const deliveryId = `${actionId}-DELIVERY-${String(deliveryNo).padStart(2, "0")}`;
    const deliveryStartedAt = new Date(nowMs()).toISOString();
    if (typeof repo.upsertStdProjectCreateDelivery === "function") {
      await repo.upsertStdProjectCreateDelivery({
        deliveryId,
        actionId,
        deliveryNo,
        deliveryStatus: "started",
        scheduledOffsetMs,
        scheduledAt,
        startedAt: deliveryStartedAt,
        requestHash,
        metadata: { payload_stored: false, response_stored: false, retry_allowed: false }
      });
    }
    try {
      response = await fetchWithDeadline(fetchImpl, `${API_BASE}${CREATE_ENDPOINT}`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json", "Access-Token": env.OCEANENGINE_ACCESS_TOKEN },
        body: wireBody.body
      }, { timeoutMs: PLATFORM_JSON_TIMEOUT_MS });
      text = await response.text();
    } catch (error) {
      const timedOut = isPlatformDeadlineError(error);
      responseHash = `sha256:${sha256(canonicalJson({ request_hash: requestHash, outcome: "transport_unconfirmed", retry_allowed: false }))}`;
      if (typeof repo.upsertStdProjectCreateDelivery === "function") {
        await repo.upsertStdProjectCreateDelivery({
          deliveryId,
          actionId,
          deliveryNo,
          deliveryStatus: "failed_or_unconfirmed",
          scheduledOffsetMs,
          scheduledAt,
          startedAt: deliveryStartedAt,
          finishedAt: new Date(nowMs()).toISOString(),
          requestHash,
          responseHash,
          apiCode: timedOut ? "timeout" : "transport_error",
          errorCategory: "unclassified",
          errorSummary: "platform_create_transport_not_confirmed",
          metadata: { payload_stored: false, response_stored: false, retry_allowed: false }
        });
      }
      await repo.upsertPlatformAction({
        actionId, jobId: runtimeTarget.jobId, confirmationId, planId: runtimeTarget.planId,
        actionType: "oceanengine_std_project_create", endpoint: CREATE_ENDPOINT, method: "POST", requestFieldManifest,
        actionStatus: "failed_or_unconfirmed", attemptNo: runtimeTarget.createAttemptNo, requestHash, responseHash,
        httpStatus: null, apiCode: timedOut ? "timeout" : "transport_error", requestIdPresent: false,
        objectIdPresent: false, errorSummary: "platform_create_transport_not_confirmed", requestId: "",
        errorCategory: "unclassified", offendingFieldPath: "", idempotencyKey: runtimeTarget.planStdProjectCreateIdempotencyKey,
        responseSummary: {
          api_code: timedOut ? "timeout" : "transport_error", request_id_present: false, object_id_present: false,
          error_category: "unclassified", offending_field_path: "", transport_unconfirmed: true,
          outcome_category: "platform_response_unknown", timeout: timedOut, response_hash_present: true, raw_response_stored: false
        },
        finishedAt: new Date(nowMs()).toISOString(),
        metadata: {
          target_project_name: runtimeTarget.projectName, raw_payload_stored: false, raw_response_stored: false,
          retry_allowed: false, attempt_no: runtimeTarget.createAttemptNo, delivery_count: deliveryNo,
          rate_limited_delivery_count: rateLimitedDeliveryCount, verification_series_id: runtimeTarget.verificationSeriesId || "",
          verification_task_ref: runtimeTarget.verificationTaskRef || ""
        }
      });
      await repo.upsertEvidence({
        artifactId: evidenceRef, jobId: runtimeTarget.jobId, artifactType: "std_project_create_once_transport_unconfirmed",
        title: "std_project create transport unconfirmed",
        summary: `endpoint=std_project/create delivery_count=${deliveryNo} transport_status=unconfirmed request_id_present=false std_project_id_present=false response_hash_present=true retry_allowed=false`,
        contentHash: responseHash, storageRef: "postgres:evidence_artifacts:redacted_summary_only",
        sourceRef: `oceanengine:${CREATE_ENDPOINT}`, sourceUsage: "runtime_truth"
      });
      return { status: "create_failed_stop_for_manual_review", createCalled: true, httpStatus: null,
        apiCode: timedOut ? "timeout" : "transport_error", requestIdPresent: false, stdProjectId: "",
        deliveryCount: deliveryNo, rateLimitedDeliveryCount, maximumDeliveryCalls: deliveryPolicy?.maximum_delivery_calls || 1, evidenceRef };
    }

    payload = {};
    try { payload = parseOceanEngineStdProjectResponse(text); } catch { payload = {}; }
    apiCode = extractApiCode(payload);
    requestId = extractRequestId(payload);
    requestIdPresent = Boolean(requestId);
    // Delivery/action audits retain only whether a request ID was present.
    // The ID itself is platform-response data and is not needed for recovery.
    persistedRequestId = "";
    stdProjectId = extractStdProjectId(payload);
    safeErrorSummary = safePlatformErrorSummary(payload);
    responseHash = `sha256:${sha256(text)}`;
    passed = response.ok && (apiCode === "0" || apiCode === "") && Boolean(stdProjectId);
    const rateLimited = apiCode === STD_PROJECT_40100_REDELIVERY_POLICY.api_code && !stdProjectId;
    deliveryCount = deliveryNo;
    if (rateLimited) rateLimitedDeliveryCount += 1;
    if (typeof repo.upsertStdProjectCreateDelivery === "function") {
      await repo.upsertStdProjectCreateDelivery({
        deliveryId, actionId, deliveryNo, scheduledOffsetMs, scheduledAt, startedAt: deliveryStartedAt,
        finishedAt: new Date(nowMs()).toISOString(), requestHash, responseHash, httpStatus: response.status,
        apiCode: apiCode || "unknown", requestIdPresent, objectIdPresent: Boolean(stdProjectId),
        deliveryStatus: passed ? "succeeded" : rateLimited ? "rate_limited" : "failed",
        errorCategory: passed ? "" : safeErrorSummary.error_category,
        errorSummary: passed ? "" : safeErrorSummary.safe_error_text,
        metadata: { payload_stored: false, response_stored: false, retry_allowed: false }
      });
    }
    if (!(rateLimited && deliveryPolicy && deliveryNo < deliveryOffsets.length)) break;
  }
  await repo.upsertPlatformAction({
    actionId,
    jobId: runtimeTarget.jobId,
    confirmationId,
    planId: runtimeTarget.planId,
    actionType: "oceanengine_std_project_create",
    requestFieldManifest,
    endpoint: CREATE_ENDPOINT,
    method: "POST",
    actionStatus: passed ? "succeeded" : "failed",
    attemptNo: runtimeTarget.createAttemptNo,
    requestHash,
    responseHash,
    httpStatus: response.status,
    apiCode: apiCode || "unknown",
    requestIdPresent,
    objectIdPresent: Boolean(stdProjectId),
    errorSummary: passed ? "" : safeErrorSummary.safe_error_text,
    requestId: persistedRequestId,
    errorCategory: passed ? "" : safeErrorSummary.error_category,
    offendingFieldPath: passed ? "" : safeErrorSummary.offending_field_path,
    idempotencyKey: runtimeTarget.planStdProjectCreateIdempotencyKey,
    responseSummary: {
      ...safeErrorSummary,
      request_id_saved: Boolean(persistedRequestId),
      object_id_present: Boolean(stdProjectId),
      delivery_count: deliveryCount,
      rate_limited_delivery_count: rateLimitedDeliveryCount,
      maximum_delivery_calls: deliveryPolicy?.maximum_delivery_calls || 1,
      response_hash_present: true
    },
    finishedAt: new Date(nowMs()).toISOString(),
    metadata: {
      target_project_name: runtimeTarget.projectName,
      raw_payload_stored: false,
      raw_response_stored: false,
      retry_allowed: false,
      attempt_no: runtimeTarget.createAttemptNo,
      delivery_count: deliveryCount,
      rate_limited_delivery_count: rateLimitedDeliveryCount,
      maximum_delivery_calls: deliveryPolicy?.maximum_delivery_calls || 1,
      verification_series_id: runtimeTarget.verificationSeriesId || "",
      verification_task_ref: runtimeTarget.verificationTaskRef || ""
    }
  });
  await repo.upsertEvidence({
    artifactId: evidenceRef,
    jobId: runtimeTarget.jobId,
    artifactType: passed ? "std_project_create_once" : rateLimitedDeliveryCount === deliveryCount && deliveryCount === 3
      ? "std_project_create_rate_limit_retry_exhausted"
      : "std_project_create_once_failed",
    title: "std_project create once",
    summary: `endpoint=std_project/create delivery_count=${deliveryCount} rate_limited_delivery_count=${rateLimitedDeliveryCount} http=${response.status} api_code=${apiCode || "unknown"} request_id_present=${requestIdPresent} request_id_saved=${Boolean(persistedRequestId)} safe_error=${passed ? "none" : safeErrorSummary.safe_error_text} std_project_id_present=${Boolean(stdProjectId)} response_hash_present=true`,
    contentHash: responseHash,
    storageRef: "postgres:evidence_artifacts:redacted_summary_only",
    sourceRef: `oceanengine:${CREATE_ENDPOINT}`,
    sourceUsage: "runtime_truth"
  });

  if (!passed) {
    return {
      status: rateLimitedDeliveryCount === deliveryCount && deliveryCount === 3
        ? "create_rate_limit_retry_exhausted"
        : "create_failed_stop_for_manual_review",
      createCalled: true,
      httpStatus: response.status,
      apiCode,
      requestIdPresent,
      stdProjectId: "",
      deliveryCount,
      rateLimitedDeliveryCount,
      maximumDeliveryCalls: deliveryPolicy?.maximum_delivery_calls || 1,
      evidenceRef
    };
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
    metadata: {
      create_response_id_present: true,
      raw_payload_stored: false,
      raw_response_stored: false,
      verification_series_id: runtimeTarget.verificationSeriesId || "",
      verification_task_ref: runtimeTarget.verificationTaskRef || ""
    }
  });
  if (runtimeTarget.planId && typeof repo.markConfirmedStdProjectCreatePlanWaitingReadback === "function") {
    await repo.markConfirmedStdProjectCreatePlanWaitingReadback({
      jobId: runtimeTarget.jobId,
      planId: runtimeTarget.planId
    });
  }
  return {
    status: "created_pending_readback",
    createCalled: true,
    httpStatus: response.status,
    apiCode,
    requestIdPresent,
    deliveryCount,
    rateLimitedDeliveryCount,
    maximumDeliveryCalls: deliveryPolicy?.maximum_delivery_calls || 1,
    stdProjectId,
    projectName: runtimeTarget.projectName,
    evidenceRef
  };
}

export const DEFAULT_STD_PROJECT_READBACK_DELAYS_MS = Object.freeze([0, 3000, 5000, 8000, 10000]);

function sleep(delayMs) {
  return delayMs > 0 ? new Promise((resolve) => setTimeout(resolve, delayMs)) : Promise.resolve();
}

function safeReadbackDelays(delays = DEFAULT_STD_PROJECT_READBACK_DELAYS_MS) {
  const values = Array.isArray(delays) ? delays : DEFAULT_STD_PROJECT_READBACK_DELAYS_MS;
  const normalized = [...new Set(values.map(Number).filter((value) => Number.isInteger(value) && value >= 0 && value <= 10000))]
    .sort((left, right) => left - right);
  return normalized.length ? normalized.slice(0, 5) : [...DEFAULT_STD_PROJECT_READBACK_DELAYS_MS];
}

function validDecimalProjectId(value = "") {
  const projectId = clean(value);
  return /^[0-9]+$/.test(projectId) ? projectId : "";
}

function observationToken(value = "") {
  const token = clean(value);
  return /^[A-Za-z0-9_-]{8,128}$/.test(token) ? token : "";
}

function readbackObservationToken(factory) {
  const supplied = typeof factory === "function" ? observationToken(factory()) : "";
  return supplied || randomUUID();
}

function buildStdProjectReadbackLookup({ responseConfirmedByCreate, createResponseObjectId, projectName }) {
  if (responseConfirmedByCreate) {
    const objectId = validDecimalProjectId(createResponseObjectId);
    if (!objectId) return { mode: "confirmed_object_id_missing", filtering: "", expectedProjectId: "" };
    // The official API declares project_ids as number[]. Construct this small
    // JSON fragment from validated decimal text so large platform IDs never
    // pass through a JavaScript number and lose precision.
    return { mode: "project_ids", filtering: `{\"project_ids\":[${objectId}]}`, expectedProjectId: objectId };
  }
  return { mode: "name", filtering: JSON.stringify({ name: clean(projectName) }), expectedProjectId: "" };
}

export async function readbackStdProjectOnce({
  repo,
  jobId,
  target = null,
  fetchImpl = globalThis.fetch,
  readbackDelaysMs = DEFAULT_STD_PROJECT_READBACK_DELAYS_MS,
  nowFn = Date.now,
  sleepImpl = sleep,
  readbackDeadlineMs = STD_PROJECT_READBACK_DEADLINE_MS,
  observationIdFactory
} = {}) {
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
  const attempts = [];
  const responseConfirmedByCreate = bundle.platformAction?.action_status === "succeeded" &&
    bundle.platformAction?.object_id_present === true;
  const responseUnknownByCreate = responseUnknownCreateAction(bundle.platformAction);
  const createResponseObjectId = responseConfirmedByCreate
    ? clean(bundle.createdObject?.object_id)
    : "";
  const lookup = buildStdProjectReadbackLookup({
    responseConfirmedByCreate,
    createResponseObjectId,
    projectName: runtimeTarget.projectName
  });
  const observationId = readbackObservationToken(observationIdFactory);
  const evidenceRef = `EV-${jobId}-STD-PROJECT-READBACK-${observationId}`;
  const readbackId = `RB-${jobId}-STD-PROJECT-REAL-${observationId}`;
  if (runtimeTarget.planId && typeof repo.markConfirmedStdProjectCreatePlanWaitingReadback === "function") {
    await repo.markConfirmedStdProjectCreatePlanWaitingReadback({
      jobId,
      planId: runtimeTarget.planId
    });
  }
  if (lookup.mode === "confirmed_object_id_missing") {
    await repo.upsertEvidence({
      artifactId: evidenceRef,
      jobId,
      artifactType: "std_project_readback_once",
      title: "std_project readback skipped",
      summary: "endpoint=std_project/list status=blocked reason=confirmed_create_response_object_id_missing platform_called=false",
      contentHash: `sha256:${sha256(`${jobId}:${observationId}:confirmed_create_response_object_id_missing`)}`,
      storageRef: "postgres:evidence_artifacts:redacted_summary_only",
      sourceRef: `oceanengine:${LIST_ENDPOINT}`,
      sourceUsage: "runtime_truth"
    });
    await repo.upsertReadbackRecord({
      readbackId,
      jobId,
      objectType: "std_project",
      objectId: "CONFIRMED_CREATE_OBJECT_ID_MISSING",
      objectName: runtimeTarget.projectName,
      readbackStatus: "confirmed_create_object_id_missing",
      fieldDiffSummary: {
        source: "oceanengine_std_project_list",
        real_platform_readback_called: false,
        create_response_confirmed: true,
        raw_response_stored: false
      },
      evidenceRef
    });
    return {
      status: "confirmed_create_object_id_missing",
      httpStatus: null,
      apiCode: "",
      requestIdPresent: false,
      objectId: "",
      objectName: "",
      objectStatus: "",
      objectNameMatches: false,
      projectIdMatchesCreate: false,
      responseUnknownByCreate,
      readbackAttempts: [],
      guideVideoMaterialReadback: { status: "not_called", called: false, evidenceRef: "" },
      evidenceRef
    };
  }
  const url = new URL(`${API_BASE}${LIST_ENDPOINT}`);
  url.searchParams.set("advertiser_id", runtimeTarget.advertiserId);
  url.searchParams.set("filtering", lookup.filtering);
  url.searchParams.set("page", "1");
  url.searchParams.set("page_size", "20");
  let response = null;
  let text = "";
  let summary = { apiCode: "", requestIdPresent: false, objectId: "", objectName: "", objectStatus: "", objectNameMatches: false, expectedIdFound: false, unexpectedObjectId: "" };
  const readbackStartedAt = nowFn();
  const absoluteDeadlineMs = Math.max(1, Number(readbackDeadlineMs) || STD_PROJECT_READBACK_DEADLINE_MS);
  for (const delayMs of safeReadbackDelays(readbackDelaysMs)) {
    const elapsedMs = nowFn() - readbackStartedAt;
    if (elapsedMs >= absoluteDeadlineMs) break;
    const requestedWaitMs = Math.max(0, delayMs - elapsedMs);
    const remainingBeforeWaitMs = absoluteDeadlineMs - elapsedMs;
    await sleepImpl(Math.min(requestedWaitMs, remainingBeforeWaitMs));
    if (requestedWaitMs >= remainingBeforeWaitMs) break;
    const remainingMs = absoluteDeadlineMs - (nowFn() - readbackStartedAt);
    if (remainingMs <= 0) break;
    try {
      response = await fetchWithDeadline(fetchImpl, url, {
        method: "GET",
        headers: { Accept: "application/json", "Access-Token": env.OCEANENGINE_ACCESS_TOKEN }
      }, { timeoutMs: Math.min(PLATFORM_JSON_TIMEOUT_MS, remainingMs) });
      text = await response.text();
    } catch (error) {
      const timedOut = isPlatformDeadlineError(error);
      response = null;
      text = canonicalJson({ endpoint: "std_project/list", delay_ms: delayMs, outcome: timedOut ? "timeout" : "transport_error" });
      summary = {
        apiCode: timedOut ? "timeout" : "transport_error",
        requestIdPresent: false,
        objectId: "",
        objectName: "",
        objectStatus: "",
        objectNameMatches: false
      };
      attempts.push({
        delay_ms: delayMs,
        http_status: null,
        api_code: timedOut ? "timeout" : "transport_error",
        request_id_present: false,
        object_id_present: false,
        object_name_matches: false,
        response_hash: `sha256:${sha256(text)}`,
        timeout: timedOut
      });
      continue;
    }
    let payload = {};
    try {
      payload = parseOceanEngineStdProjectResponse(text);
    } catch {
      payload = {};
    }
    summary = summarizeListPayload(payload, {
      projectName: runtimeTarget.projectName,
      expectedProjectId: lookup.expectedProjectId
    });
    const projectIdMatchesCreate = !lookup.expectedProjectId ||
      (summary.expectedIdFound && !summary.unexpectedObjectId);
    attempts.push({
      delay_ms: delayMs,
      http_status: response.status,
      api_code: summary.apiCode || "",
      request_id_present: summary.requestIdPresent === true,
      object_id_present: Boolean(summary.objectId),
      object_name_matches: summary.objectNameMatches === true,
      project_id_matches_create: projectIdMatchesCreate,
      lookup_mode: lookup.mode,
      response_hash: `sha256:${sha256(text)}`
    });
    if (summary.objectId || summary.unexpectedObjectId) break;
  }
  const guideVideoMaterialReadback = summary.objectId
    ? await readbackGuideVideoMaterialsOnce({
        repo,
        bundle,
        objectId: summary.objectId,
        fetchImpl,
        accessToken: env.OCEANENGINE_ACCESS_TOKEN,
        remainingMs: absoluteDeadlineMs - (nowFn() - readbackStartedAt),
        evidenceRef: `EV-${jobId}-GUIDE-VIDEO-MATERIAL-READBACK-${observationId}`
      })
    : {
        status: canonicalGuideVideoReadiness(bundle).required === true || bundle.account?.video_cover_required === true ? "project_not_found" : "not_required",
        called: false,
        evidenceRef: ""
      };
  await repo.upsertEvidence({
    artifactId: evidenceRef,
    jobId,
    artifactType: "std_project_readback_once",
    title: "std_project readback once",
    summary: `endpoint=std_project/list lookup=${lookup.mode} attempts=${attempts.length} http=${response?.status || 0} api_code=${summary.apiCode || "unknown"} request_id_present=${summary.requestIdPresent} object_id_present=${Boolean(summary.objectId)} object_name_matches=${summary.objectNameMatches} guide_video_material_status=${guideVideoMaterialReadback.status}`,
    contentHash: `sha256:${sha256(text)}`,
    storageRef: "postgres:evidence_artifacts:redacted_summary_only",
    sourceRef: `oceanengine:${LIST_ENDPOINT}`,
    sourceUsage: "runtime_truth"
  });
  const projectIdMatchesCreate = !lookup.expectedProjectId ||
    (summary.expectedIdFound && !summary.unexpectedObjectId);
  const guideVideoMaterialVerified = ["not_required", "passed"].includes(guideVideoMaterialReadback.status);
  const readbackVerified = Boolean(summary.objectId) && summary.objectNameMatches && projectIdMatchesCreate && guideVideoMaterialVerified;
  if (readbackVerified) {
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
        object_name_matches_draft: true,
        readback_attempt_count: attempts.length,
        guide_video_material_status: guideVideoMaterialReadback.status,
        raw_response_stored: false
      }
    });
    await repo.upsertReadbackRecord({
      readbackId,
      jobId,
      objectType: "std_project",
      objectId: summary.objectId,
      objectName: summary.objectName,
      readbackStatus: "readback_verified",
      fieldDiffSummary: {
        object_name_matches_draft: true,
        object_status: summary.objectStatus || "readable",
        source: "oceanengine_std_project_list",
        readback_attempts: attempts,
        guide_video_material_readback: {
          required: guideVideoMaterialReadback.status !== "not_required",
          status: guideVideoMaterialReadback.status,
          called: guideVideoMaterialReadback.called === true,
          expected_video_count: Number(guideVideoMaterialReadback.expectedVideoCount || 0),
          matched_video_count: Number(guideVideoMaterialReadback.matchedVideoCount || 0),
          matched_cover_count: Number(guideVideoMaterialReadback.matchedCoverCount || 0),
          matched_guide_video_count: Number(guideVideoMaterialReadback.matchedGuideVideoCount || 0),
          evidence_ref: guideVideoMaterialReadback.evidenceRef || "",
          raw_response_stored: false
        },
        create_field_ledger_status: "manual_console_verification_required",
        raw_response_stored: false
      },
      evidenceRef
    });
    if (responseUnknownByCreate && bundle.platformAction?.action_id && typeof repo.promoteUnconfirmedStdProjectCreateActionAfterReadback === "function") {
      await repo.promoteUnconfirmedStdProjectCreateActionAfterReadback({
        jobId,
        planId: runtimeTarget.planId,
        actionId: bundle.platformAction.action_id,
        objectId: summary.objectId,
        objectName: summary.objectName
      });
    } else if (!responseConfirmedByCreate && bundle.platformAction?.action_id && typeof repo.mergePlatformActionMetadata === "function") {
      await repo.mergePlatformActionMetadata(bundle.platformAction.action_id, {
        recovered_by_readback: false,
        recovery_blocked_reason: "create_response_was_explicit_failure",
        retry_allowed: false,
        raw_payload_stored: false,
        raw_response_stored: false
      });
    }
    if (responseUnknownByCreate && runtimeTarget.planId && typeof repo.markConfirmedStdProjectCreatePlanWaitingReadback === "function") {
      await repo.markConfirmedStdProjectCreatePlanWaitingReadback({
        jobId,
        planId: runtimeTarget.planId
      });
    }
    if (runtimeTarget.planId && typeof repo.consumeConfirmedStdProjectCreatePlanAfterReadback === "function") {
      await repo.consumeConfirmedStdProjectCreatePlanAfterReadback({
        jobId,
        planId: runtimeTarget.planId
      });
    }
  } else {
    const projectIdMismatch = Boolean(summary.unexpectedObjectId) || (Boolean(summary.objectId) && !projectIdMatchesCreate);
    const projectNameMismatch = Boolean(summary.objectId) && projectIdMatchesCreate && !summary.objectNameMatches;
    const guideVideoMaterialPending = Boolean(summary.objectId) && summary.objectNameMatches && projectIdMatchesCreate && !guideVideoMaterialVerified;
    await repo.upsertReadbackRecord({
      readbackId,
      jobId,
      objectType: "std_project",
      objectId: projectIdMismatch
        ? (createResponseObjectId || "PROJECT_ID_MISMATCH")
        : guideVideoMaterialPending
          ? summary.objectId
          : "NOT_FOUND_AFTER_CREATE",
      objectName: runtimeTarget.projectName,
      readbackStatus: projectIdMismatch
        ? "project_id_mismatch"
        : projectNameMismatch
          ? "project_name_mismatch"
          : guideVideoMaterialPending
            ? "guide_video_material_pending"
          : "not_found_after_create",
      fieldDiffSummary: {
        object_name_matches_draft: summary.objectNameMatches === true,
        source: "oceanengine_std_project_list",
        real_platform_readback_called: true,
        request_id_present: summary.requestIdPresent === true,
        api_code: summary.apiCode || "",
        create_response_confirmed: responseConfirmedByCreate,
        create_response_id_matches_readback: projectIdMatchesCreate,
        readback_attempts: attempts,
        guide_video_material_readback: {
          required: guideVideoMaterialReadback.status !== "not_required",
          status: guideVideoMaterialReadback.status,
          called: guideVideoMaterialReadback.called === true,
          expected_video_count: Number(guideVideoMaterialReadback.expectedVideoCount || 0),
          matched_video_count: Number(guideVideoMaterialReadback.matchedVideoCount || 0),
          matched_cover_count: Number(guideVideoMaterialReadback.matchedCoverCount || 0),
          matched_guide_video_count: Number(guideVideoMaterialReadback.matchedGuideVideoCount || 0),
          evidence_ref: guideVideoMaterialReadback.evidenceRef || "",
          raw_response_stored: false
        },
        raw_response_stored: false
      },
      evidenceRef
    });
  }
  return {
    status: readbackVerified
      ? "readback_verified"
        : (summary.objectId || summary.unexpectedObjectId) && !projectIdMatchesCreate
        ? "project_id_mismatch"
        : summary.objectId && !summary.objectNameMatches
          ? "project_name_mismatch"
        : summary.objectId && !guideVideoMaterialVerified
          ? "guide_video_material_pending"
        : "not_found_or_mismatch",
    httpStatus: response?.status || null,
    apiCode: summary.apiCode,
    requestIdPresent: summary.requestIdPresent,
    objectId: summary.objectId,
    objectName: summary.objectName,
    objectStatus: summary.objectStatus,
    objectNameMatches: summary.objectNameMatches,
    projectIdMatchesCreate,
    lookupMode: lookup.mode,
    responseUnknownByCreate,
    readbackAttempts: attempts,
    guideVideoMaterialReadback,
    evidenceRef
  };
}
