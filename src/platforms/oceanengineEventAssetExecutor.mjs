import {
  assertNoSensitiveLeak,
  hashValue,
  sanitizeForPublic
} from "../workflows/skills/oe3/00-contracts.mjs";
import { buildLosslessJsonWireBody } from "../workflows/skills/oe3/05-std-project-create-wire-body.mjs";
import { runEventChainReadonlySkill } from "../workflows/skills/oe3/04-event-chain-readiness.mjs";
import {
  EVENT_ASSET_CREATE_ACTION_TYPE,
  EVENT_ASSET_CREATE_ENDPOINT,
  EVENT_ASSET_CREATE_FIELD_NAMES,
  EVENT_ASSET_CREATE_METHOD,
  buildEventAssetCreatePayload,
  eventAssetTemplateHash,
  eventAssetTemplateRef,
  evaluateEventAssetProvisionContract
} from "../workflows/skills/oe3/04-event-asset-provision-contract.mjs";
import {
  EVENT_ASSET_ENSURE_CONFIRM_ENV,
  EVENT_ASSET_ENSURE_CONFIRM_VALUE,
  validateEventAssetWriteScope
} from "../workflows/eventAssetExecutionScope.mjs";
import {
  credentialReady,
  getOceanEngineCredentialSummary,
  readOceanEngineEnv
} from "./oceanengineCredentialStore.mjs";
import { fetchWithDeadline, isPlatformDeadlineError, PLATFORM_JSON_TIMEOUT_MS } from "./httpDeadline.mjs";
import { createOceanEngineReadonlyClient } from "./oceanengineReadonlyClient.mjs";

export const EVENT_ASSET_CONFIRM_ENV = EVENT_ASSET_ENSURE_CONFIRM_ENV;
export const EVENT_ASSET_CONFIRM_VALUE = EVENT_ASSET_ENSURE_CONFIRM_VALUE;
export const DEFAULT_EVENT_ASSET_POST_CREATE_READBACK_DELAYS_MS = Object.freeze([0, 1000, 3000, 5000]);

const API_BASE = "https://api.oceanengine.com";
const EVENT_ASSET_CREATE_FULL_ENDPOINT = `${API_BASE}${EVENT_ASSET_CREATE_ENDPOINT}`;

function clean(value) {
  return String(value ?? "").trim();
}

function sleep(delayMs) {
  return Number(delayMs) > 0
    ? new Promise((resolve) => setTimeout(resolve, Number(delayMs)))
    : Promise.resolve();
}

function safePostCreateReadbackDelays(delays = DEFAULT_EVENT_ASSET_POST_CREATE_READBACK_DELAYS_MS) {
  const values = Array.isArray(delays) ? delays : DEFAULT_EVENT_ASSET_POST_CREATE_READBACK_DELAYS_MS;
  const normalized = [...new Set(values
    .map(Number)
    .filter((value) => Number.isInteger(value) && value >= 0 && value <= 5000))]
    .sort((left, right) => left - right);
  return normalized.length ? normalized.slice(0, 4) : [...DEFAULT_EVENT_ASSET_POST_CREATE_READBACK_DELAYS_MS];
}

function apiCode(payload = {}) {
  return clean(payload.code ?? payload.err_no ?? payload.error_code ?? "");
}

function requestIdPresent(payload = {}) {
  return Boolean(payload.request_id || payload.data?.request_id);
}

function eventAssetIdFromPayload(payload = {}) {
  return clean(payload.data?.asset_id || payload.asset_id || payload.id);
}

function messageHash(payload = {}) {
  const message = clean(payload.message || payload.msg || payload.error_message || payload.error?.message || "");
  return message ? hashValue(message) : "";
}

function safeResponseSummary(payload = {}) {
  return sanitizeForPublic({
    api_code: apiCode(payload) || "unknown",
    request_id_present: requestIdPresent(payload),
    data_present: Boolean(payload?.data && typeof payload.data === "object"),
    asset_id_present: Boolean(eventAssetIdFromPayload(payload)),
    message_hash: messageHash(payload),
    payload_persisted: false,
    response_persisted: false
  });
}

function compactCredential(summary = {}) {
  return {
    status: summary.status,
    env_file_present: Boolean(summary.envFilePresent),
    access_token_present: Boolean(summary.accessTokenPresent),
    refresh_token_present: Boolean(summary.refreshTokenPresent),
    token_expired: Boolean(summary.tokenExpired)
  };
}

function plannedActionFromScope(scope = {}) {
  return scope?.action || {};
}

function eventAssetCreateActionId(jobId) {
  return `ACTION-${jobId}-EVENT-ASSET-CREATE`;
}

function requestFieldManifest({ bundle = {}, requestHash = "", templateHash = "" } = {}) {
  const payload = buildEventAssetCreatePayload({ bundle });
  return sanitizeForPublic({
    field_names: [...EVENT_ASSET_CREATE_FIELD_NAMES],
    asset_type: payload.asset_type,
    mini_program_type: payload.mini_program_asset?.mini_program_type || "",
    advertiser_id_hash: hashValue(payload.advertiser_id),
    mini_program_id_hash: hashValue(payload.mini_program_asset?.mini_program_id || ""),
    mini_program_name_hash: hashValue(payload.mini_program_asset?.mini_program_name || ""),
    instance_id_hash: hashValue(payload.mini_program_asset?.instance_id || ""),
    instance_id_wire_strategy: "decimal_bigint_json_number",
    template_ref: eventAssetTemplateRef(bundle.job?.advertiser_id),
    template_hash: templateHash,
    request_hash: requestHash,
    payload_persisted: false
  });
}

export function buildEventAssetCreateRequestPlan({ bundle = {} } = {}) {
  const payload = buildEventAssetCreatePayload({ bundle });
  const wire = buildLosslessJsonWireBody(payload, {
    losslessIntegerPaths: ["advertiser_id", "mini_program_asset.instance_id"]
  });
  const templateHash = eventAssetTemplateHash({ bundle });
  const manifest = requestFieldManifest({ bundle, requestHash: wire.requestHash, templateHash });
  const blockers = [
    ...(wire.status === "passed" ? [] : wire.blockers || ["event_asset_create_wire_body_blocked"]),
    ...(payload.advertiser_id ? [] : ["event_asset_create_advertiser_id_missing"]),
    ...(payload.asset_type === "MINI_PROGRAME" ? [] : ["event_asset_create_asset_type_invalid"]),
    ...(payload.mini_program_asset?.mini_program_id ? [] : ["event_asset_create_mini_program_id_missing"]),
    ...(payload.mini_program_asset?.mini_program_name ? [] : ["event_asset_create_mini_program_name_missing"]),
    ...(payload.mini_program_asset?.instance_id ? [] : ["event_asset_create_instance_id_missing"]),
    ...(payload.mini_program_asset?.mini_program_type === "BYTE_GAME" ? [] : ["event_asset_create_mini_program_type_invalid"])
  ];
  const result = sanitizeForPublic({
    status: blockers.length ? "blocked" : "passed",
    blockers: [...new Set(blockers)],
    endpoint: EVENT_ASSET_CREATE_ENDPOINT,
    method: EVENT_ASSET_CREATE_METHOD,
    body: wire.body,
    bodyHash: wire.bodyHash,
    requestHash: wire.requestHash,
    requestFieldManifest: manifest,
    outputSummary: {
      advertiser_id_hash: hashValue(payload.advertiser_id),
      asset_type: payload.asset_type,
      mini_program_id_hash: hashValue(payload.mini_program_asset?.mini_program_id || ""),
      instance_id_hash: hashValue(payload.mini_program_asset?.instance_id || ""),
      template_ref: eventAssetTemplateRef(bundle.job?.advertiser_id),
      template_hash: templateHash,
      instance_id_wire_number_token_present: /"instance_id":\d+/.test(wire.body),
      payload_persisted: false,
      response_persisted: false
    }
  });
  assertNoSensitiveLeak({
    ...result,
    body: ""
  });
  return result;
}

async function updateAction(repo, action) {
  await repo.upsertPlatformAction(action);
}

async function callEventAssetCreate({
  repo,
  bundle,
  body,
  headers,
  requestHash,
  requestFieldManifest,
  metadata,
  idempotencyKey,
  fetchImpl
}) {
  const jobId = bundle.job.job_id;
  const actionId = eventAssetCreateActionId(jobId);
  await updateAction(repo, {
    actionId,
    jobId,
    actionType: EVENT_ASSET_CREATE_ACTION_TYPE,
    endpoint: EVENT_ASSET_CREATE_ENDPOINT,
    method: EVENT_ASSET_CREATE_METHOD,
    actionStatus: "started",
    attemptNo: 1,
    requestHash,
    idempotencyKey,
    requestFieldManifest,
    metadata
  });
  try {
    const response = await fetchWithDeadline(fetchImpl, EVENT_ASSET_CREATE_FULL_ENDPOINT, { method: EVENT_ASSET_CREATE_METHOD, headers, body }, { timeoutMs: PLATFORM_JSON_TIMEOUT_MS });
    const text = await response.text();
    let payload = {};
    try { payload = JSON.parse(text); } catch { payload = {}; }
    const code = apiCode(payload);
    const passed = response.ok && (code === "0" || code === "");
    const responseHash = hashValue(text);
    const assetId = eventAssetIdFromPayload(payload);
    await updateAction(repo, {
      actionId,
      jobId,
      actionType: EVENT_ASSET_CREATE_ACTION_TYPE,
      endpoint: EVENT_ASSET_CREATE_ENDPOINT,
      method: EVENT_ASSET_CREATE_METHOD,
      actionStatus: passed ? "succeeded" : "failed_once",
      attemptNo: 1,
      requestHash,
      responseHash,
      httpStatus: response.status,
      apiCode: code || "unknown",
      requestIdPresent: requestIdPresent(payload),
      objectIdPresent: Boolean(assetId),
      errorSummary: passed ? "" : "event_asset_platform_response_not_confirmed",
      errorCategory: passed ? "" : "platform_response_not_confirmed",
      idempotencyKey,
      requestFieldManifest,
      responseSummary: safeResponseSummary(payload),
      metadata: {
        ...metadata,
        response_asset_id_present: Boolean(assetId),
        response_asset_id_hash: assetId ? hashValue(assetId) : ""
      },
      finishedAt: new Date().toISOString()
    });
    return { actionId, passed, response, payload, responseHash, assetId };
  } catch (error) {
    const timedOut = isPlatformDeadlineError(error);
    const errorCategory = timedOut ? "timeout" : clean(error?.code || error?.name || "transport_error");
    await updateAction(repo, {
      actionId,
      jobId,
      actionType: EVENT_ASSET_CREATE_ACTION_TYPE,
      endpoint: EVENT_ASSET_CREATE_ENDPOINT,
      method: EVENT_ASSET_CREATE_METHOD,
      actionStatus: "failed_once",
      attemptNo: 1,
      requestHash,
      responseHash: "",
      httpStatus: null,
      apiCode: timedOut ? "timeout" : "",
      requestIdPresent: false,
      objectIdPresent: false,
      errorSummary: "event_asset_platform_transport_failed",
      errorCategory,
      idempotencyKey,
      requestFieldManifest,
      responseSummary: { transport_error: true, timeout: timedOut, response_persisted: false },
      metadata,
      finishedAt: new Date().toISOString()
    });
    return { actionId, passed: false, response: null, payload: {}, responseHash: "", assetId: "", errorCategory };
  }
}

async function saveEventAssetCreateEvidence({ repo, bundle, create = {}, status, readback = {} }) {
  if (!repo?.upsertEvidence || !bundle?.job) return "";
  const artifactId = `EV-${bundle.job.job_id}-EVENT-ASSET-CREATE`;
  const summary = sanitizeForPublic({
    status,
    action_type: EVENT_ASSET_CREATE_ACTION_TYPE,
    endpoint: EVENT_ASSET_CREATE_ENDPOINT,
    http_status: create.response?.status ?? null,
    api_code: apiCode(create.payload) || "unknown",
    request_id_present: requestIdPresent(create.payload),
    response_hash_present: Boolean(create.responseHash),
    response_asset_id_present: Boolean(create.assetId),
    post_readback_status: readback.status || "not_called",
    post_readback_blocker_count: Array.isArray(readback.blockers) ? readback.blockers.length : 0,
    post_readback_attempt_count: Number(readback.attemptCount || 0),
    post_readback_elapsed_ms: Number(readback.elapsedMs || 0),
    payload_persisted: false,
    response_persisted: false
  });
  assertNoSensitiveLeak(summary);
  await repo.upsertEvidence({
    artifactId,
    jobId: bundle.job.job_id,
    artifactType: "event_asset_create",
    title: "JSZC 事件资产 API 单次创建",
    summary: `status=${status}; http=${summary.http_status ?? "none"}; api_code=${summary.api_code}; request_id_present=${summary.request_id_present === true}; post_readback_status=${summary.post_readback_status}; post_readback_attempts=${summary.post_readback_attempt_count}; response_persisted=false`,
    contentHash: create.responseHash || hashValue(summary),
    storageRef: "postgres:evidence_artifacts:redacted_summary_only",
    sourceRef: "oceanengine:event_manager/assets/create",
    sourceUsage: bundle.job.source_usage || "runtime_truth"
  });
  return artifactId;
}

function createAllowedByPreflight(preflight = {}) {
  const blockers = Array.isArray(preflight.blockers) ? preflight.blockers : [];
  return blockers.length === 1 && blockers[0] === "event_asset_target_not_found";
}

function identityReadyWithBaselineMissing(preflight = {}) {
  const blockers = Array.isArray(preflight.blockers) ? preflight.blockers : [];
  return (
    blockers.length === 1 &&
    blockers[0] === "event_configs_baseline_missing" &&
    preflight.outputSummary?.eventAssetIdentityReadbackVerified === true &&
    clean(preflight.runtimeEventAssetId)
  );
}

export async function pollEventAssetPostCreateReadback({
  repo,
  jobId,
  client,
  expectedEventAssetId,
  allowReadonlyDependency = true,
  delaysMs = DEFAULT_EVENT_ASSET_POST_CREATE_READBACK_DELAYS_MS,
  nowFn = Date.now,
  sleepImpl = sleep
} = {}) {
  if (!repo || !jobId || !client || !clean(expectedEventAssetId)) {
    throw new Error("event_asset_post_create_readback_context_required");
  }
  const startedAtMs = Number(nowFn());
  const attempts = [];
  let result = null;
  for (const plannedDelayMs of safePostCreateReadbackDelays(delaysMs)) {
    const waitMs = Math.max(0, plannedDelayMs - Math.max(0, Number(nowFn()) - startedAtMs));
    if (waitMs > 0) await sleepImpl(waitMs);
    const bundle = await repo.getLaunchJobBundle(jobId);
    result = await runEventChainReadonlySkill({
      repo,
      bundle,
      client,
      allowReadonlyDependency,
      expectedEventAssetId
    });
    const identityReady = result.outputSummary?.eventAssetIdentityReadbackVerified === true &&
      clean(result.runtimeEventAssetId) === clean(expectedEventAssetId);
    attempts.push(sanitizeForPublic({
      planned_delay_ms: plannedDelayMs,
      actual_elapsed_ms: Math.max(0, Number(nowFn()) - startedAtMs),
      status: result.status || "blocked",
      blocker_count: Array.isArray(result.blockers) ? result.blockers.length : 0,
      identity_verified: identityReady
    }));
    if (identityReady) {
      return {
        identityReady: true,
        result,
        attempts,
        elapsedMs: Math.max(0, Number(nowFn()) - startedAtMs)
      };
    }
  }
  return {
    identityReady: false,
    result,
    attempts,
    elapsedMs: Math.max(0, Number(nowFn()) - startedAtMs)
  };
}

export async function ensureEventAssetForTargetOnce({
  repo,
  jobId,
  confirmVariableValue = process.env[EVENT_ASSET_CONFIRM_ENV] || "",
  fetchImpl = globalThis.fetch,
  readonlyClient = null,
  credentialSummary = null,
  oceanEngineEnv = null,
  projectStatePath,
  allowReadonlyDependency = true,
  deferFullEventChainUntilConfigs = false,
  postCreateReadbackDelaysMs = DEFAULT_EVENT_ASSET_POST_CREATE_READBACK_DELAYS_MS,
  nowFn = Date.now,
  sleepImpl = sleep
} = {}) {
  if (!repo || !jobId) throw new Error("event_asset_executor_repo_and_job_required");
  let bundle = await repo.getLaunchJobBundle(jobId);
  if (!bundle?.job) throw new Error("job_not_found");
  const client = readonlyClient || createOceanEngineReadonlyClient({ fetchImpl });
  const preflight = await runEventChainReadonlySkill({
    repo,
    bundle,
    client,
    allowReadonlyDependency
  });

  if (preflight.status === "passed") {
    const result = sanitizeForPublic({
      status: "event_asset_ready_noop",
      jobId,
      evidence_refs: preflight.evidenceRefs || [],
      target_already_usable: true,
      platform_write_called: false,
      token_refresh_called: false,
      payload_persisted: false,
      response_persisted: false
    });
    assertNoSensitiveLeak(result);
    return result;
  }

  if (identityReadyWithBaselineMissing(preflight)) {
    const result = sanitizeForPublic({
      status: "event_asset_identity_ready",
      jobId,
      evidence_refs: preflight.evidenceRefs || [],
      runtime_event_asset_id: clean(preflight.runtimeEventAssetId),
      target_identity_readback_verified: true,
      target_readback_verified: false,
      blockers: [],
      platform_write_called: false,
      token_refresh_called: false,
      payload_persisted: false,
      response_persisted: false
    });
    assertNoSensitiveLeak(result);
    return result;
  }

  const scope = await validateEventAssetWriteScope({ repo, bundle, projectStatePath });
  const credential = credentialSummary || getOceanEngineCredentialSummary();
  const provision = evaluateEventAssetProvisionContract({ bundle });
  const requestPlan = buildEventAssetCreateRequestPlan({ bundle });
  const blockers = [
    ...(confirmVariableValue === EVENT_ASSET_CONFIRM_VALUE ? [] : ["confirm_variable_missing_or_invalid"]),
    ...(createAllowedByPreflight(preflight) ? [] : preflight.blockers || ["event_asset_preflight_not_missing_only"]),
    ...(scope.status === "passed" ? [] : scope.blockers),
    ...(credentialReady(credential) ? [] : credential.blockers.map((item) => `credential:${item}`)),
    ...(provision.status === "ready_for_plan" ? [] : provision.blockers || ["event_asset_provision_not_plan_eligible"]),
    ...(requestPlan.status === "passed" ? [] : requestPlan.blockers || ["event_asset_create_request_plan_blocked"])
  ];

  if (blockers.length) {
    const result = sanitizeForPublic({
      status: "blocked_before_event_asset_write",
      jobId,
      blockers: [...new Set(blockers)],
      preflight_status: preflight.status,
      preflight_blockers: preflight.blockers || [],
      scope_status: scope.status,
      provision_status: provision.status,
      request_plan_status: requestPlan.status,
      credential: compactCredential(credential),
      platform_write_called: false,
      token_refresh_called: false,
      payload_persisted: false,
      response_persisted: false
    });
    assertNoSensitiveLeak(result);
    return result;
  }

  const env = oceanEngineEnv || readOceanEngineEnv().env;
  const plannedAction = plannedActionFromScope(scope);
  const create = await callEventAssetCreate({
    repo,
    bundle,
    body: requestPlan.body,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "Access-Token": env.OCEANENGINE_ACCESS_TOKEN
    },
    requestHash: requestPlan.requestHash,
    requestFieldManifest: requestPlan.requestFieldManifest,
    metadata: {
      route_id: bundle.job.route_id,
      game_code: bundle.job.game_code,
      advertiser_id_hash: hashValue(bundle.job.advertiser_id),
      template_ref: eventAssetTemplateRef(bundle.job?.advertiser_id),
      template_hash: eventAssetTemplateHash({ bundle }),
      idempotency_scope_hash: provision.outputSummary?.idempotencyScope || "",
      retry_allowed: false,
      maximum_platform_calls: 1,
      payload_persisted: false,
      response_persisted: false
    },
    idempotencyKey: plannedAction.idempotency_key || requestPlan.requestHash,
    fetchImpl
  });

  if (!create.passed) {
    const evidenceRef = await saveEventAssetCreateEvidence({
      repo,
      bundle,
      create,
      status: "failed_once",
      readback: { status: "not_called", blockers: [] }
    });
    const result = sanitizeForPublic({
      status: "event_asset_create_failed_once",
      jobId,
      create_action_id: create.actionId,
      evidence_ref: evidenceRef,
      http_status: create.response?.status ?? null,
      api_code: apiCode(create.payload) || "unknown",
      response_hash_present: Boolean(create.responseHash),
      platform_write_called: true,
      readback_called: false,
      token_refresh_called: false,
      payload_persisted: false,
      response_persisted: false
    });
    assertNoSensitiveLeak(result);
    return result;
  }

  if (!clean(create.assetId)) {
    const evidenceRef = await saveEventAssetCreateEvidence({
      repo,
      bundle,
      create,
      status: "response_id_missing",
      readback: { status: "not_called", blockers: ["event_asset_create_response_id_missing"] }
    });
    const result = sanitizeForPublic({
      status: "event_asset_create_response_id_missing",
      jobId,
      create_action_id: create.actionId,
      evidence_ref: evidenceRef,
      blockers: ["event_asset_create_response_id_missing"],
      event_asset_id_present_in_response: false,
      platform_write_called: true,
      token_refresh_called: false,
      payload_persisted: false,
      response_persisted: false
    });
    assertNoSensitiveLeak(result);
    return result;
  }

  const postReadbackCycle = await pollEventAssetPostCreateReadback({
    repo,
    jobId,
    client,
    expectedEventAssetId: create.assetId,
    allowReadonlyDependency,
    delaysMs: postCreateReadbackDelaysMs,
    nowFn,
    sleepImpl
  });
  bundle = await repo.getLaunchJobBundle(jobId);
  const postReadback = postReadbackCycle.result || {
    status: "blocked",
    blockers: ["event_asset_post_create_readback_timeout"]
  };
  const identityReadyForConfigs = Boolean(deferFullEventChainUntilConfigs === true &&
    postReadbackCycle.identityReady === true &&
    clean(postReadback.runtimeEventAssetId) === clean(create.assetId));
  const ready = postReadbackCycle.identityReady === true && postReadback.status === "passed";
  const readbackForEvidence = {
    ...postReadback,
    attemptCount: postReadbackCycle.attempts.length,
    elapsedMs: postReadbackCycle.elapsedMs
  };
  const evidenceRef = await saveEventAssetCreateEvidence({
    repo,
    bundle,
    create,
    status: ready ? "passed" : identityReadyForConfigs ? "identity_readback_passed_pending_event_configs" : "post_readback_blocked",
    readback: readbackForEvidence
  });
  const result = sanitizeForPublic({
    status: ready
      ? "event_asset_ready"
      : identityReadyForConfigs
        ? "event_asset_identity_ready"
        : "event_asset_readback_not_verified",
    jobId,
    create_action_id: create.actionId,
    evidence_ref: evidenceRef,
    readback_evidence_refs: postReadback.evidenceRefs || [],
    blockers: ready || identityReadyForConfigs ? [] : postReadback.blockers?.length
      ? postReadback.blockers
      : ["event_asset_post_create_readback_timeout"],
    runtime_event_asset_id: identityReadyForConfigs ? postReadback.runtimeEventAssetId : "",
    event_asset_id_present_in_response: Boolean(create.assetId),
    target_identity_readback_verified: ready || identityReadyForConfigs,
    target_readback_verified: ready,
    readback_attempt_count: postReadbackCycle.attempts.length,
    readback_elapsed_ms: postReadbackCycle.elapsedMs,
    optimized_goal_verified: postReadback.outputSummary?.objectiveFound === true &&
      postReadback.outputSummary?.deepObjectiveFound === true,
    deep_bid_type_verified: postReadback.outputSummary?.deepBidTypeFound === true,
    platform_write_called: true,
    token_refresh_called: false,
    payload_persisted: false,
    response_persisted: false
  });
  assertNoSensitiveLeak(result);
  return result;
}
