import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { assertNoSensitiveLeak, sanitizeForPublic } from "../workflows/skills/oe3/00-contracts.mjs";
import { inspectAvatarSourceAsset } from "../workflows/skills/oe3/04-avatar-source-prepare.mjs";
import { validateAvatarWriteScope } from "../workflows/avatarExecutionScope.mjs";
import { createOceanEngineReadonlyClient } from "./oceanengineReadonlyClient.mjs";
import { credentialReady, getOceanEngineCredentialSummary, readOceanEngineEnv } from "./oceanengineCredentialStore.mjs";
import { fetchWithDeadline, isPlatformDeadlineError, PLATFORM_UPLOAD_TIMEOUT_MS } from "./httpDeadline.mjs";

export const AVATAR_ENSURE_CONFIRM_ENV = "MWBV2_OE_AVATAR_ENSURE_CONFIRM";
export const AVATAR_ENSURE_CONFIRM_VALUE = "UPLOAD_AND_SUBMIT_ONE_ACCOUNT_AVATAR";
const API_BASE = "https://api.oceanengine.com";
const UPLOAD_ENDPOINT = "/open_api/2/advertiser/avatar/upload/";
const SUBMIT_ENDPOINT = "/open_api/2/advertiser/avatar/submit/";

function clean(value) {
  return String(value ?? "").trim();
}

function hashValue(value) {
  return `sha256:${createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex")}`;
}

function apiCode(payload = {}) {
  return clean(payload.code ?? payload.err_no ?? payload.error_code ?? "");
}

function requestIdPresent(payload = {}) {
  return Boolean(payload.request_id || payload.data?.request_id);
}

function success(response, payload = {}) {
  const code = apiCode(payload);
  return response.ok && (code === "0" || code === "");
}

function safeResponseSummary(payload = {}) {
  const code = apiCode(payload);
  return {
    api_code: code || "unknown",
    request_id_present: requestIdPresent(payload),
    data_present: Boolean(payload?.data && typeof payload.data === "object"),
    message_present: Boolean(clean(payload.message || payload.msg || payload.error_message)),
    raw_response_stored: false
  };
}

function avatarImageId(payload = {}) {
  return clean(payload.data?.image_id || payload.data?.id || payload.image_id || payload.id);
}

export function summarizeAvatarReadback(payload = {}) {
  const data = payload.data || {};
  const avatarInfo = data.avatar_info || {};
  const rawStatus = clean(data.avatar_status);
  const statusMap = { "0": "UNSET", "1": "IN_AUDIT", "2": "AUDIT_REJECT", "3": "AUDIT_PASS" };
  const avatarStatus = statusMap[rawStatus] || rawStatus || "unknown";
  const ready = avatarStatus === "IN_AUDIT" || avatarStatus === "AUDIT_PASS";
  return {
    avatar_status: avatarStatus,
    avatar_ready: ready,
    avatar_readiness_reason: ready
      ? "avatar_ready"
      : avatarStatus === "UNSET"
        ? "avatar_unset"
        : avatarStatus === "AUDIT_REJECT"
          ? "avatar_audit_rejected"
          : "avatar_status_unknown",
    image_present: Boolean(avatarInfo.web_uri || avatarInfo.audit_web_uri || avatarInfo.width || avatarInfo.height),
    width: Number(avatarInfo.width || 0),
    height: Number(avatarInfo.height || 0)
  };
}

function avatarResource(bundle = {}) {
  return (bundle.resources || []).find((item) => item.resource_type === "avatar") || null;
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

async function readAvatar({ advertiserId, readonlyClient }) {
  return readonlyClient.get({
    label: "account_avatar_readback",
    endpoint: "https://ad.oceanengine.com/open_api/2/advertiser/avatar/get/",
    query: { advertiser_id: advertiserId },
    requestFieldManifest: { field_names: ["advertiser_id"], raw_query_stored: false },
    summarize: summarizeAvatarReadback
  });
}

async function updateAction(repo, action) {
  await repo.upsertPlatformAction(action);
}

async function callWrite({ repo, jobId, actionType, endpoint, body, headers, requestHash, requestFieldManifest, metadata, fetchImpl }) {
  const actionId = `ACTION-${jobId}-${actionType.replace(/^oceanengine_advertiser_avatar_/, "AVATAR-").toUpperCase()}`;
  await updateAction(repo, {
    actionId,
    jobId,
    actionType,
    endpoint,
    method: "POST",
    actionStatus: "started",
    attemptNo: 1,
    requestHash,
    requestFieldManifest,
    metadata
  });
  try {
    const response = await fetchWithDeadline(fetchImpl, `${API_BASE}${endpoint}`, { method: "POST", headers, body }, { timeoutMs: PLATFORM_UPLOAD_TIMEOUT_MS });
    const text = await response.text();
    let payload = {};
    try { payload = JSON.parse(text); } catch { payload = {}; }
    const passed = success(response, payload);
    const responseHash = hashValue(text);
    await updateAction(repo, {
      actionId,
      jobId,
      actionType,
      endpoint,
      method: "POST",
      actionStatus: passed ? "succeeded" : "failed_once",
      attemptNo: 1,
      requestHash,
      responseHash,
      httpStatus: response.status,
      apiCode: apiCode(payload) || "unknown",
      requestIdPresent: requestIdPresent(payload),
      objectIdPresent: actionType.endsWith("upload") ? Boolean(avatarImageId(payload)) : false,
      errorSummary: passed ? "" : "avatar_platform_response_not_confirmed",
      errorCategory: passed ? "" : "platform_response_not_confirmed",
      requestFieldManifest,
      responseSummary: safeResponseSummary(payload),
      metadata,
      finishedAt: new Date().toISOString()
    });
    return { actionId, passed, response, payload, responseHash };
  } catch (error) {
    const timedOut = isPlatformDeadlineError(error);
    const errorCategory = timedOut ? "timeout" : clean(error?.code || error?.name || "transport_error");
    await updateAction(repo, {
      actionId,
      jobId,
      actionType,
      endpoint,
      method: "POST",
      actionStatus: "failed_once",
      attemptNo: 1,
      requestHash,
      responseHash: "",
      httpStatus: null,
      apiCode: timedOut ? "timeout" : "",
      requestIdPresent: false,
      objectIdPresent: false,
      errorSummary: "avatar_platform_transport_failed",
      errorCategory,
      requestFieldManifest,
      responseSummary: { transport_error: true, timeout: timedOut, raw_response_stored: false },
      metadata,
      finishedAt: new Date().toISOString()
    });
    return { actionId, passed: false, response: null, payload: {}, responseHash: "", errorCategory };
  }
}

async function saveReadbackEvidence({ repo, jobId, readback, attemptCount }) {
  const summary = readback.summary || {};
  const artifactId = `EV-${jobId}-AVATAR-READBACK`;
  await repo.upsertEvidence({
    artifactId,
    jobId,
    artifactType: "account_avatar_readback",
    title: "account avatar submit readback",
    summary: `endpoint=advertiser/avatar/get attempts=${attemptCount} http=${readback.httpStatus ?? "none"} api_code=${readback.apiCode || "unknown"} avatar_status=${summary.avatar_status || "unknown"} request_id_present=${readback.requestIdPresent === true} response_hash_present=${Boolean(readback.responseHash)}`,
    contentHash: readback.responseHash || hashValue({ status: readback.status, attemptCount }),
    storageRef: "postgres:evidence_artifacts:redacted_summary_only",
    sourceRef: "oceanengine:advertiser/avatar/get",
    sourceUsage: "runtime_truth"
  });
  return artifactId;
}

export async function ensureAvatarForTargetOnce({
  repo,
  jobId,
  confirmVariableValue = process.env[AVATAR_ENSURE_CONFIRM_ENV] || "",
  fetchImpl = globalThis.fetch,
  readonlyClient = null,
  credentialSummary = null,
  oceanEngineEnv = null,
  projectStatePath
} = {}) {
  if (!repo || !jobId) throw new Error("avatar_executor_repo_and_job_required");
  const bundle = await repo.getLaunchJobBundle(jobId);
  if (!bundle?.job) throw new Error("job_not_found");
  const resource = avatarResource(bundle);
  const credential = credentialSummary || getOceanEngineCredentialSummary();
  const client = readonlyClient || createOceanEngineReadonlyClient({ fetchImpl });
  const scope = await validateAvatarWriteScope({ repo, bundle, projectStatePath });
  const preflightReadback = await readAvatar({ advertiserId: bundle.job.advertiser_id, readonlyClient: client });
  const sourceAsset = resource?.source_asset_id ? await repo.getGameAsset(resource.source_asset_id) : null;
  const source = sourceAsset ? await inspectAvatarSourceAsset(sourceAsset) : { status: "blocked", blockers: ["avatar_source_asset_missing"] };
  const preflightStatus = preflightReadback.summary?.avatar_status || "unknown";
  const blockers = [
    ...(confirmVariableValue === AVATAR_ENSURE_CONFIRM_VALUE ? [] : ["confirm_variable_missing_or_invalid"]),
    ...(scope.status === "passed" ? [] : scope.blockers),
    ...(credentialReady(credential) ? [] : credential.blockers.map((item) => `credential:${item}`)),
    ...(resource ? [] : ["avatar_resource_missing"]),
    ...(source.status === "passed" ? [] : source.blockers || ["avatar_source_not_ready"]),
    ...(preflightReadback.status === "passed" ? [] : ["avatar_preflight_readback_failed"]),
    ...(preflightStatus === "AUDIT_REJECT" ? ["avatar_audit_rejected"] : [])
  ];
  if (preflightReadback.status === "passed" && ["IN_AUDIT", "AUDIT_PASS"].includes(preflightStatus)) {
    const evidenceRef = await saveReadbackEvidence({ repo, jobId, readback: preflightReadback, attemptCount: 1 });
    await repo.updateAccountResourceReadonly({
      routeId: bundle.job.route_id,
      gameCode: bundle.job.game_code,
      advertiserId: bundle.job.advertiser_id,
      resourceType: "avatar",
      visibilityStatus: "visible",
      readbackStatus: "readback_verified",
      metadata: { ...preflightReadback.summary, response_hash: preflightReadback.responseHash, evidence_ref: evidenceRef, status: "passed" },
      resourceMetadata: { avatar_readonly_diagnostic: { ...preflightReadback.summary, response_hash: preflightReadback.responseHash, evidence_ref: evidenceRef, checked_at: new Date().toISOString() } }
    });
    return sanitizeForPublic({ status: "already_ready_noop", jobId, avatar_status: preflightStatus, platform_write_called: false, evidence_ref: evidenceRef });
  }
  if (blockers.length) {
    return sanitizeForPublic({
      status: "blocked_before_avatar_write",
      jobId,
      blockers,
      preflight_avatar_status: preflightStatus,
      source_status: source.status,
      credential: compactCredential(credential),
      platform_write_called: false
    });
  }

  const env = oceanEngineEnv || readOceanEngineEnv().env;
  const file = await readFile(sourceAsset.asset_ref);
  const uploadManifest = { field_names: ["advertiser_id", "image_file"], file_format: "png", width: source.width, height: source.height, raw_payload_stored: false };
  const uploadHash = hashValue({ advertiser_id: bundle.job.advertiser_id, source_hash: source.source_hash, field_names: uploadManifest.field_names });
  const uploadBody = new FormData();
  uploadBody.set("advertiser_id", bundle.job.advertiser_id);
  uploadBody.set("image_file", new Blob([file], { type: "image/png" }), "account-avatar-300x300.png");
  const upload = await callWrite({
    repo,
    jobId,
    actionType: "oceanengine_advertiser_avatar_upload",
    endpoint: UPLOAD_ENDPOINT,
    body: uploadBody,
    headers: { Accept: "application/json", "Access-Token": env.OCEANENGINE_ACCESS_TOKEN },
    requestHash: uploadHash,
    requestFieldManifest: uploadManifest,
    metadata: { source_asset_id: resource.source_asset_id, source_hash: source.source_hash, retry_allowed: false, raw_payload_stored: false, raw_response_stored: false },
    fetchImpl
  });
  if (!upload.passed || !avatarImageId(upload.payload)) {
    return sanitizeForPublic({ status: "upload_failed_once", jobId, upload_action_id: upload.actionId, http_status: upload.response?.status ?? null, api_code: apiCode(upload.payload) || "unknown", response_hash_present: Boolean(upload.responseHash), platform_write_called: true, submit_called: false });
  }
  const imageId = avatarImageId(upload.payload);
  await repo.updateAccountResourcePlatformResource({
    routeId: bundle.job.route_id,
    gameCode: bundle.job.game_code,
    advertiserId: bundle.job.advertiser_id,
    resourceType: "avatar",
    platformResourceId: imageId,
    visibilityStatus: "needs_confirmation",
    readbackStatus: "pending",
    metadata: { avatar_submission: { upload_action_id: upload.actionId, image_id_present: true, upload_response_hash: upload.responseHash, source_asset_id: resource.source_asset_id, source_hash: source.source_hash, raw_response_stored: false } }
  });

  const submitPayload = { advertiser_id: Number(bundle.job.advertiser_id), image_id: imageId, source_info: "巨兽战场" };
  const submitManifest = { field_names: ["advertiser_id", "image_id", "source_info"], source_info: "巨兽战场", raw_payload_stored: false };
  const submit = await callWrite({
    repo,
    jobId,
    actionType: "oceanengine_advertiser_avatar_submit",
    endpoint: SUBMIT_ENDPOINT,
    body: JSON.stringify(submitPayload),
    headers: { Accept: "application/json", "Content-Type": "application/json", "Access-Token": env.OCEANENGINE_ACCESS_TOKEN },
    requestHash: hashValue(submitPayload),
    requestFieldManifest: submitManifest,
    metadata: { source_asset_id: resource.source_asset_id, image_id_present: true, retry_allowed: false, raw_payload_stored: false, raw_response_stored: false },
    fetchImpl
  });
  if (!submit.passed) {
    return sanitizeForPublic({ status: "submit_failed_once", jobId, upload_action_id: upload.actionId, submit_action_id: submit.actionId, http_status: submit.response?.status ?? null, api_code: apiCode(submit.payload) || "unknown", response_hash_present: Boolean(submit.responseHash), platform_write_called: true, readback_called: false });
  }

  let readback = null;
  let attempts = 0;
  for (let index = 0; index < 3; index += 1) {
    attempts += 1;
    readback = await readAvatar({ advertiserId: bundle.job.advertiser_id, readonlyClient: client });
    if (readback.status !== "passed") break;
    const avatarStatus = readback.summary?.avatar_status || "unknown";
    if (["IN_AUDIT", "AUDIT_PASS", "AUDIT_REJECT"].includes(avatarStatus)) break;
  }
  const evidenceRef = await saveReadbackEvidence({ repo, jobId, readback: readback || {}, attemptCount: attempts });
  const avatarStatus = readback?.summary?.avatar_status || "unknown";
  const ready = readback?.status === "passed" && ["IN_AUDIT", "AUDIT_PASS"].includes(avatarStatus);
  const metadata = {
    ...(readback?.summary || {}),
    response_hash: readback?.responseHash || "",
    evidence_ref: evidenceRef,
    status: ready ? "passed" : "blocked",
    checked_at: new Date().toISOString(),
    raw_response_stored: false
  };
  await repo.updateAccountResourceReadonly({
    routeId: bundle.job.route_id,
    gameCode: bundle.job.game_code,
    advertiserId: bundle.job.advertiser_id,
    resourceType: "avatar",
    visibilityStatus: ready ? "visible" : "needs_confirmation",
    readbackStatus: ready ? "readback_verified" : "failed",
    metadata,
    resourceMetadata: { avatar_readonly_diagnostic: metadata, avatar_submission: { upload_action_id: upload.actionId, submit_action_id: submit.actionId, image_id_present: true, readback_attempts: attempts, evidence_ref: evidenceRef, raw_response_stored: false } }
  });
  const result = sanitizeForPublic({
    status: ready ? "avatar_ready" : avatarStatus === "AUDIT_REJECT" ? "avatar_audit_rejected" : "avatar_readback_not_converged",
    jobId,
    upload_action_id: upload.actionId,
    submit_action_id: submit.actionId,
    avatar_status: avatarStatus,
    readback_attempts: attempts,
    evidence_ref: evidenceRef,
    platform_write_called: true,
    raw_payload_stored: false,
    raw_response_stored: false
  });
  assertNoSensitiveLeak(result);
  return result;
}
