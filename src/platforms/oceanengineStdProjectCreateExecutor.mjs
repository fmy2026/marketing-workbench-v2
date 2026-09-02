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
import { buildStdProjectCreateWireBody } from "../workflows/skills/oe3/05-std-project-create-wire-body.mjs";
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
  const normalized = clean(text).toLowerCase();
  if (/permission|authorize|authorization|scope|无权限|权限/.test(normalized)) return "permission_denied";
  if (/landing|external_url_material_list|落地页|链接/.test(normalized)) return "landing_url_invalid";
  if (fieldPath && /invalid|required|param|field|参数|字段|必填/.test(normalized)) return "invalid_field";
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
  const nameMatch = items.find((item) => clean(item.name || item.project_name || item.std_project_name) === projectName) || null;
  // The list endpoint is filtered by draft name, but retain the first returned
  // object when that filter is eventually consistent or interpreted loosely.
  // That lets the readback close immediately and preserve an ID/name mismatch
  // for manual inspection instead of relabeling a visible inconsistent object
  // as another ordinary "not found" attempt.
  const match = nameMatch || items[0] || null;
  return {
    apiCode: extractApiCode(payload),
    requestIdPresent: Boolean(extractRequestId(payload)),
    listCount: items.length,
    objectId: clean(match?.project_id || match?.std_project_id || match?.id || ""),
    objectName: clean(match?.name || match?.project_name || match?.std_project_name || ""),
    objectStatus: clean(match?.status || match?.project_status || match?.opt_status || ""),
    objectNameMatches: Boolean(nameMatch)
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
  readiness: readinessOverride = null
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
  const fakeTransport = grantSource === "test_fake_transport";
  const credentialSummary = fakeTransport ? { status: "valid", blockers: [] } : getOceanEngineCredentialSummary();
  const prepared = await prepareStdProjectCreate({ repo, jobId: runtimeTarget.jobId, target: runtimeTarget });
  const readiness = readinessOverride || latestCreateReadiness(bundle);
  const attemptState = await createAttemptState(repo, runtimeTarget.jobId);
  const verificationSeriesState = runtimeTarget.verificationSeriesId
    ? await repo.getCaseCreateVerificationSeriesState({
      caseId: bundle.job.case_id,
      verificationSeriesId: runtimeTarget.verificationSeriesId,
      maximumCreateAttempts: runtimeTarget.maximumCreateAttempts
    })
    : null;
  const effectiveAttemptState = verificationSeriesState || attemptState;
  const blockers = [
    ...(confirmationIntent !== STD_PROJECT_CREATE_CONFIRM_VALUE ? ["confirmation_intent_missing_or_invalid"] : []),
    ...(confirmVariableValue !== STD_PROJECT_CREATE_CONFIRM_VALUE ? ["confirm_variable_missing_or_invalid"] : []),
    ...(!fakeTransport && !credentialReady(credentialSummary) ? credentialSummary.blockers.map((item) => `credential:${item}`) : []),
    ...(bundle.job.source_usage !== "runtime_truth" && !fakeTransport ? ["job_not_runtime_truth"] : []),
    ...((attemptState.createdObjectCount || 0) > 0 ? ["created_object_already_recorded"] : []),
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
      metadata: {
        target_project_name: runtimeTarget.projectName,
        raw_payload_stored: false,
        raw_response_stored: false,
        retry_allowed: false,
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

  let response = null;
  let text = "";
  try {
    response = await fetchWithDeadline(fetchImpl, `${API_BASE}${CREATE_ENDPOINT}`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", "Access-Token": env.OCEANENGINE_ACCESS_TOKEN },
      body: wireBody.body
    }, { timeoutMs: PLATFORM_JSON_TIMEOUT_MS });
    text = await response.text();
  } catch (error) {
    const timedOut = isPlatformDeadlineError(error);
    const responseHash = `sha256:${sha256(canonicalJson({
      request_hash: requestHash,
      outcome: "transport_unconfirmed",
      retry_allowed: false
    }))}`;
    const evidenceRef = `EV-${runtimeTarget.jobId}-STD-PROJECT-CREATE-A${attemptLabel}`;
    await repo.upsertPlatformAction({
      actionId,
      jobId: runtimeTarget.jobId,
      confirmationId,
      planId: runtimeTarget.planId,
      actionType: "oceanengine_std_project_create",
      endpoint: CREATE_ENDPOINT,
      method: "POST",
      actionStatus: "failed_or_unconfirmed",
      attemptNo: runtimeTarget.createAttemptNo,
      requestHash,
      responseHash,
      httpStatus: null,
      apiCode: timedOut ? "timeout" : "transport_error",
      requestIdPresent: false,
      objectIdPresent: false,
      errorSummary: "platform_create_transport_not_confirmed",
      requestId: "",
      errorCategory: "unclassified",
      offendingFieldPath: "",
      idempotencyKey: runtimeTarget.planStdProjectCreateIdempotencyKey,
      responseSummary: {
        api_code: timedOut ? "timeout" : "transport_error",
        request_id_present: false,
        object_id_present: false,
        error_category: "unclassified",
        offending_field_path: "",
        transport_unconfirmed: true,
        outcome_category: "platform_response_unknown",
        timeout: timedOut,
        response_hash_present: true,
        raw_response_stored: false
      },
      finishedAt: new Date().toISOString(),
      metadata: {
        target_project_name: runtimeTarget.projectName,
        raw_payload_stored: false,
        raw_response_stored: false,
        retry_allowed: false,
        attempt_no: runtimeTarget.createAttemptNo,
        verification_series_id: runtimeTarget.verificationSeriesId || "",
        verification_task_ref: runtimeTarget.verificationTaskRef || ""
      }
    });
    await repo.upsertEvidence({
      artifactId: evidenceRef,
      jobId: runtimeTarget.jobId,
      artifactType: "std_project_create_once_transport_unconfirmed",
      title: "std_project create once transport unconfirmed",
      summary: "endpoint=std_project/create transport_status=unconfirmed request_id_present=false std_project_id_present=false response_hash_present=true retry_allowed=false",
      contentHash: responseHash,
      storageRef: "postgres:evidence_artifacts:redacted_summary_only",
      sourceRef: `oceanengine:${CREATE_ENDPOINT}`,
      sourceUsage: "runtime_truth"
    });
    return {
      status: "create_failed_stop_for_manual_review",
      createCalled: true,
      httpStatus: null,
      apiCode: timedOut ? "timeout" : "transport_error",
      requestIdPresent: false,
      stdProjectId: "",
      evidenceRef
    };
  }
  let payload = {};
  try {
    payload = parseOceanEngineStdProjectResponse(text);
  } catch {
    payload = {};
  }
  const apiCode = extractApiCode(payload);
  const requestIdPresent = Boolean(extractRequestId(payload));
  const stdProjectId = extractStdProjectId(payload);
  const safeErrorSummary = safePlatformErrorSummary(payload);
  const responseHash = `sha256:${sha256(text)}`;
  const passed = response.ok && (apiCode === "0" || apiCode === "") && Boolean(stdProjectId);
  const evidenceRef = `EV-${runtimeTarget.jobId}-STD-PROJECT-CREATE-A${attemptLabel}`;
  await repo.upsertPlatformAction({
    actionId,
    jobId: runtimeTarget.jobId,
    confirmationId,
    planId: runtimeTarget.planId,
    actionType: "oceanengine_std_project_create",
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
    errorSummary: passed ? "" : "platform_create_response_not_confirmed",
    requestId: "",
    errorCategory: passed ? "" : safeErrorSummary.error_category,
    offendingFieldPath: passed ? "" : safeErrorSummary.offending_field_path,
    idempotencyKey: runtimeTarget.planStdProjectCreateIdempotencyKey,
    responseSummary: {
      ...safeErrorSummary,
      object_id_present: Boolean(stdProjectId),
      response_hash_present: true
    },
    finishedAt: new Date().toISOString(),
    metadata: {
      target_project_name: runtimeTarget.projectName,
      raw_payload_stored: false,
      raw_response_stored: false,
      retry_allowed: false,
      attempt_no: runtimeTarget.createAttemptNo,
      verification_series_id: runtimeTarget.verificationSeriesId || "",
      verification_task_ref: runtimeTarget.verificationTaskRef || ""
    }
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

export async function readbackStdProjectOnce({
  repo,
  jobId,
  target = null,
  fetchImpl = globalThis.fetch,
  readbackDelaysMs = DEFAULT_STD_PROJECT_READBACK_DELAYS_MS,
  nowFn = Date.now,
  sleepImpl = sleep,
  readbackDeadlineMs = STD_PROJECT_READBACK_DEADLINE_MS
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
  const url = new URL(`${API_BASE}${LIST_ENDPOINT}`);
  url.searchParams.set("advertiser_id", runtimeTarget.advertiserId);
  url.searchParams.set("filtering", JSON.stringify({ name: runtimeTarget.projectName }));
  url.searchParams.set("page", "1");
  url.searchParams.set("page_size", "20");
  const attempts = [];
  const responseConfirmedByCreate = bundle.platformAction?.action_status === "succeeded" &&
    bundle.platformAction?.object_id_present === true;
  const responseUnknownByCreate = responseUnknownCreateAction(bundle.platformAction);
  const createResponseObjectId = responseConfirmedByCreate
    ? clean(bundle.createdObject?.object_id)
    : "";
  if (runtimeTarget.planId && typeof repo.markConfirmedStdProjectCreatePlanWaitingReadback === "function") {
    await repo.markConfirmedStdProjectCreatePlanWaitingReadback({
      jobId,
      planId: runtimeTarget.planId
    });
  }
  let response = null;
  let text = "";
  let summary = { apiCode: "", requestIdPresent: false, objectId: "", objectName: "", objectStatus: "", objectNameMatches: false };
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
    summary = summarizeListPayload(payload, runtimeTarget.projectName);
    const projectIdMatchesCreate = !createResponseObjectId ||
      (Boolean(summary.objectId) && summary.objectId === createResponseObjectId);
    attempts.push({
      delay_ms: delayMs,
      http_status: response.status,
      api_code: summary.apiCode || "",
      request_id_present: summary.requestIdPresent === true,
      object_id_present: Boolean(summary.objectId),
      object_name_matches: summary.objectNameMatches === true,
      project_id_matches_create: projectIdMatchesCreate,
      response_hash: `sha256:${sha256(text)}`
    });
    if (summary.objectId) break;
  }
  const evidenceRef = `EV-${jobId}-STD-PROJECT-READBACK-ONCE`;
  await repo.upsertEvidence({
    artifactId: evidenceRef,
    jobId,
    artifactType: "std_project_readback_once",
    title: "std_project readback once",
    summary: `endpoint=std_project/list attempts=${attempts.length} http=${response?.status || 0} api_code=${summary.apiCode || "unknown"} request_id_present=${summary.requestIdPresent} object_id_present=${Boolean(summary.objectId)} object_name_matches=${summary.objectNameMatches}`,
    contentHash: `sha256:${sha256(text)}`,
    storageRef: "postgres:evidence_artifacts:redacted_summary_only",
    sourceRef: `oceanengine:${LIST_ENDPOINT}`,
    sourceUsage: "runtime_truth"
  });
  const projectIdMatchesCreate = !createResponseObjectId ||
    (Boolean(summary.objectId) && summary.objectId === createResponseObjectId);
  const readbackVerified = Boolean(summary.objectId) && summary.objectNameMatches && projectIdMatchesCreate;
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
        raw_response_stored: false
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
        source: "oceanengine_std_project_list",
        readback_attempts: attempts,
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
    const projectIdMismatch = Boolean(summary.objectId) && !projectIdMatchesCreate;
    const projectNameMismatch = Boolean(summary.objectId) && projectIdMatchesCreate && !summary.objectNameMatches;
    await repo.upsertReadbackRecord({
      readbackId: `RB-${jobId}-STD-PROJECT-REAL`,
      jobId,
      objectType: "std_project",
      objectId: projectIdMismatch ? (createResponseObjectId || "PROJECT_ID_MISMATCH") : "NOT_FOUND_AFTER_CREATE",
      objectName: runtimeTarget.projectName,
      readbackStatus: projectIdMismatch
        ? "project_id_mismatch"
        : projectNameMismatch
          ? "project_name_mismatch"
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
        raw_response_stored: false
      },
      evidenceRef
    });
  }
  return {
    status: readbackVerified
      ? "readback_verified"
      : summary.objectId && !projectIdMatchesCreate
        ? "project_id_mismatch"
        : summary.objectId && !summary.objectNameMatches
          ? "project_name_mismatch"
        : "not_found_or_mismatch",
    httpStatus: response?.status || null,
    apiCode: summary.apiCode,
    requestIdPresent: summary.requestIdPresent,
    objectId: summary.objectId,
    objectName: summary.objectName,
    objectStatus: summary.objectStatus,
    objectNameMatches: summary.objectNameMatches,
    projectIdMatchesCreate,
    responseUnknownByCreate,
    readbackAttempts: attempts,
    evidenceRef
  };
}
