import { createHash } from "node:crypto";
import { assertNoSensitiveLeak, sanitizeForPublic } from "../workflows/skills/oe3/00-contracts.mjs";
import {
  DMP_ENSURE_CONFIRM_ENV,
  DMP_ENSURE_CONFIRM_VALUE,
  validateDmpWriteScope
} from "../workflows/dmpExecutionScope.mjs";
import { createOceanEngineReadonlyClient } from "./oceanengineReadonlyClient.mjs";
import { pollDmpAudienceSet } from "./oceanengineDmpReadonly.mjs";
import {
  credentialReady,
  getOceanEngineCredentialSummary,
  readOceanEngineEnv
} from "./oceanengineCredentialStore.mjs";
import { fetchWithDeadline, isPlatformDeadlineError, PLATFORM_JSON_TIMEOUT_MS } from "./httpDeadline.mjs";

export const DMP_PUSH_V2_ENDPOINT = "https://api.oceanengine.com/open_api/2/dmp/custom_audience/push_v2/";
export const DMP_PUSH_ACTION = "oceanengine_dmp_custom_audience_push_v2";
const API_BASE = "https://api.oceanengine.com";
const PUSH_PATH = "/open_api/2/dmp/custom_audience/push_v2/";

function clean(value) {
  return String(value ?? "").trim();
}

function hashValue(value) {
  return `sha256:${createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex")}`;
}

function assertSafeIntegerId(name, value) {
  const text = clean(value);
  if (!/^\d+$/.test(text)) throw new Error(`invalid_${name}`);
  const number = Number(text);
  if (!Number.isSafeInteger(number)) throw new Error(`${name}_outside_safe_integer_range`);
  return { text, number };
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

function responseSummary(payload = {}) {
  const code = apiCode(payload);
  return {
    api_code: code || "unknown",
    request_id_present: requestIdPresent(payload),
    data_present: Boolean(payload?.data && typeof payload.data === "object"),
    message_present: Boolean(clean(payload.message || payload.msg || payload.error_message)),
    responseBodyStored: false
  };
}

export function dmpPushTransportPayload({ sourceAdvertiserId, targetAdvertiserId, customAudienceId } = {}) {
  const source = assertSafeIntegerId("source_advertiser_id", sourceAdvertiserId);
  const target = assertSafeIntegerId("target_advertiser_id", targetAdvertiserId);
  const audienceId = assertSafeIntegerId("custom_audience_id", customAudienceId);
  const payload = {
    advertiser_id: source.number,
    custom_audience_id: audienceId.number,
    target_advertiser_ids: [target.number]
  };
  return payload;
}

export function buildDmpPushRequestPlan({ sourceAdvertiserId, targetAdvertiserId, customAudienceId } = {}) {
  const source = assertSafeIntegerId("source_advertiser_id", sourceAdvertiserId);
  const target = assertSafeIntegerId("target_advertiser_id", targetAdvertiserId);
  const audienceId = assertSafeIntegerId("custom_audience_id", customAudienceId);
  const requestShape = dmpPushTransportPayload({
    sourceAdvertiserId: source.text,
    targetAdvertiserId: target.text,
    customAudienceId: audienceId.text
  });
  const requestHash = hashValue(requestShape);
  return sanitizeForPublic({
    endpoint: DMP_PUSH_V2_ENDPOINT,
    method: "POST",
    requestHash,
    requestFieldManifest: {
      fieldNames: Object.keys(requestShape),
      advertiserIdRole: "source_advertiser_id",
      targetAdvertiserIdsRole: "target_advertiser_ids",
      advertiserIdTransportType: "number",
      targetAdvertiserIdsTransportType: "number_array",
      customAudienceIdTransportType: "number",
      deliveryStatusPolicy: "readback_only_not_sent",
      requestBodyStored: false
    },
    outputSummary: {
      sourceAdvertiserId: source.text,
      targetAdvertiserId: target.text,
      customAudienceIdPresent: Boolean(audienceId.text),
      requestHash,
      requestBodyStored: false,
      responseBodyStored: false
    }
  });
}

export function summarizeDmpPushPlans(plans = []) {
  const platformWriteObservedFromPlanStatuses = plans.some((plan) =>
    ["executed", "verified", "failed"].includes(plan.plan_status || plan.planStatus)
  );
  return sanitizeForPublic({
    planCount: plans.length,
    requestHashCount: plans.filter((plan) => plan.request_hash || plan.requestHash).length,
    endpoint: DMP_PUSH_V2_ENDPOINT,
    fieldNames: ["advertiser_id", "custom_audience_id", "target_advertiser_ids"],
    transportTypes: {
      advertiser_id: "number",
      custom_audience_id: "number",
      target_advertiser_ids: "number_array"
    },
    planReportNoPlatformWriteCalled: true,
    platformWriteObservedFromPlanStatuses,
    requestBodyStored: false,
    responseBodyStored: false
  });
}

async function recordPushAction({ repo, jobId, plan, status, requestHash, responseHash = "", httpStatus = null, apiCodeValue = "", requestId = false, errorSummary = "", errorCategory = "", response = {}, metadata = {} }) {
  const actionId = `ACTION-${jobId}-DMP-PUSH-${plan.custom_audience_id}`;
  await repo.upsertPlatformAction({
    actionId,
    jobId,
    actionType: DMP_PUSH_ACTION,
    endpoint: PUSH_PATH,
    method: "POST",
    actionStatus: status,
    attemptNo: 1,
    requestHash,
    responseHash,
    httpStatus,
    apiCode: apiCodeValue,
    requestIdPresent: requestId,
    objectIdPresent: false,
    errorSummary,
    errorCategory,
    requestFieldManifest: plan.request_field_manifest || {},
    responseSummary: response,
    metadata: {
      push_plan_id: plan.push_plan_id,
      custom_audience_id_present: Boolean(plan.custom_audience_id),
      request_body_stored: false,
      response_body_stored: false,
      ...metadata
    },
    finishedAt: status === "started" ? null : new Date().toISOString()
  });
  return actionId;
}

async function saveDmpPushEvidence({ repo, jobId, customAudienceId, stage, status, pushActionId = "", readback = {}, responseHash = "" }) {
  const artifactId = `EV-${jobId}-DMP-PUSH-${customAudienceId}-${stage.toUpperCase()}`;
  await repo.upsertEvidence({
    artifactId,
    jobId,
    artifactType: `dmp_push_${stage}`,
    title: `DMP push ${stage}`,
    summary: [
      `custom_audience_id=${customAudienceId}`,
      `status=${status}`,
      `push_action_id=${pushActionId || "none"}`,
      `read_status=${readback.read?.status || "not_run"}`,
      `select_status=${readback.select?.status || "not_run"}`,
      `response_hash_present=${Boolean(responseHash || readback.read?.responseHash || readback.select?.responseHash)}`,
      "request_body_stored=false",
      "response_body_stored=false"
    ].join("; "),
    contentHash: responseHash || hashValue({ jobId, customAudienceId, stage, status, readback }),
    storageRef: "postgres:evidence_artifacts:redacted_summary_only",
    sourceRef: "oceanengine:dmp/custom_audience/push_v2",
    sourceUsage: "runtime_truth"
  });
  return artifactId;
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

export async function ensureDmpBaselineForTargetOnce({
  repo,
  jobId,
  confirmVariableValue = process.env[DMP_ENSURE_CONFIRM_ENV] || "",
  fetchImpl = globalThis.fetch,
  readonlyClient = null,
  credentialSummary = null,
  oceanEngineEnv = null,
  projectStatePath
} = {}) {
  if (!repo || !jobId) throw new Error("dmp_executor_repo_and_job_required");
  const bundle = await repo.getLaunchJobBundle(jobId);
  if (!bundle?.job) throw new Error("job_not_found");
  const scope = await validateDmpWriteScope({ repo, bundle, projectStatePath });
  const credential = credentialSummary || getOceanEngineCredentialSummary();
  const plans = await repo.getDmpPackagePushPlans(jobId);
  const blockers = [
    ...(confirmVariableValue === DMP_ENSURE_CONFIRM_VALUE ? [] : ["confirm_variable_missing_or_invalid"]),
    ...(scope.status === "passed" ? [] : scope.blockers),
    ...(credentialReady(credential) ? [] : credential.blockers.map((item) => `credential:${item}`))
  ];
  if (blockers.length) {
    return sanitizeForPublic({
      status: "blocked_before_dmp_write",
      jobId,
      blockers,
      plan_count: plans.length,
      credential: compactCredential(credential),
      platform_write_called: false,
      requestBodyStored: false,
      responseBodyStored: false
    });
  }

  const env = oceanEngineEnv || readOceanEngineEnv().env;
  const client = readonlyClient || createOceanEngineReadonlyClient({ fetchImpl });
  const pushed = [];
  for (const plan of plans) {
    if (plan.plan_status !== "planned") continue;
    const requestBody = dmpPushTransportPayload({
      sourceAdvertiserId: plan.source_advertiser_id,
      targetAdvertiserId: plan.target_advertiser_id,
      customAudienceId: plan.custom_audience_id
    });
    const requestHash = hashValue(requestBody);
    if (requestHash !== plan.request_hash) {
      const evidenceRef = await saveDmpPushEvidence({ repo, jobId, customAudienceId: plan.custom_audience_id, stage: "preflight", status: "request_hash_mismatch" });
      await repo.updateDmpPackagePushPlanStatus({
        pushPlanId: plan.push_plan_id,
        planStatus: "blocked",
        evidenceRef,
        metadata: { blocker: "request_hash_mismatch", request_body_stored: false }
      });
      return sanitizeForPublic({ status: "blocked_before_dmp_write", jobId, blockers: ["request_hash_mismatch"], failed_custom_audience_id: plan.custom_audience_id, platform_write_called: false });
    }
    const actionId = await recordPushAction({ repo, jobId, plan, status: "started", requestHash });
    let payload = {};
    let text = "";
    let response = null;
    try {
      response = await fetchWithDeadline(fetchImpl, `${API_BASE}${PUSH_PATH}`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "Access-Token": env.OCEANENGINE_ACCESS_TOKEN
        },
        body: JSON.stringify(requestBody)
      }, { timeoutMs: PLATFORM_JSON_TIMEOUT_MS });
      text = await response.text();
      try { payload = JSON.parse(text); } catch { payload = {}; }
    } catch (error) {
      const timedOut = isPlatformDeadlineError(error);
      const evidenceRef = await saveDmpPushEvidence({ repo, jobId, customAudienceId: plan.custom_audience_id, stage: "transport", status: "transport_failed", pushActionId: actionId });
      await recordPushAction({
        repo,
        jobId,
        plan,
        status: "failed_once",
        requestHash,
        errorSummary: "dmp_push_transport_failed",
        errorCategory: timedOut ? "timeout" : clean(error?.code || error?.name || "transport_error"),
        response: { transport_error: true, timeout: timedOut, response_body_stored: false }
      });
      await repo.updateDmpPackagePushPlanStatus({ pushPlanId: plan.push_plan_id, planStatus: "failed", evidenceRef, metadata: { blocker: "transport_failed" } });
      return sanitizeForPublic({ status: "dmp_push_failed_once", jobId, failed_custom_audience_id: plan.custom_audience_id, platform_write_called: true, evidence_ref: evidenceRef });
    }
    const responseHash = hashValue(text);
    const passed = success(response, payload);
    await recordPushAction({
      repo,
      jobId,
      plan,
      status: passed ? "succeeded" : "failed_once",
      requestHash,
      responseHash,
      httpStatus: response.status,
      apiCodeValue: apiCode(payload) || "unknown",
      requestId: requestIdPresent(payload),
      errorSummary: passed ? "" : "dmp_push_platform_response_not_confirmed",
      errorCategory: passed ? "" : "platform_response_not_confirmed",
      response: responseSummary(payload)
    });
    if (!passed) {
      const evidenceRef = await saveDmpPushEvidence({ repo, jobId, customAudienceId: plan.custom_audience_id, stage: "response", status: "failed", pushActionId: actionId, responseHash });
      await repo.updateDmpPackagePushPlanStatus({ pushPlanId: plan.push_plan_id, planStatus: "failed", evidenceRef, responseHash, metadata: { blocker: "platform_response_not_confirmed" } });
      return sanitizeForPublic({ status: "dmp_push_failed_once", jobId, failed_custom_audience_id: plan.custom_audience_id, platform_write_called: true, evidence_ref: evidenceRef });
    }

    const evidenceRef = await saveDmpPushEvidence({
      repo,
      jobId,
      customAudienceId: plan.custom_audience_id,
      stage: "response",
      status: "accepted_pending_batch_readback",
      pushActionId: actionId,
      responseHash
    });
    await repo.updateDmpPackagePushPlanStatus({
      pushPlanId: plan.push_plan_id,
      planStatus: "executed",
      evidenceRef,
      responseHash,
      metadata: { batch_readback_status: "pending", response_body_stored: false }
    });
    pushed.push({ plan, actionId, responseHash });
  }

  const targetAdvertiserId = plans[0]?.target_advertiser_id || bundle.job.advertiser_id;
  const readbackPoll = await pollDmpAudienceSet({
    client,
    advertiserId: targetAdvertiserId,
    customAudienceIds: pushed.map((item) => item.plan.custom_audience_id),
    label: "dmp_push_batch_readback"
  });
  const membersById = new Map((readbackPoll.result?.members || []).map((item) => [item.customAudienceId, item]));
  const verifiedIds = [];
  for (const item of pushed) {
    const member = membersById.get(item.plan.custom_audience_id) || {};
    const verified = member.status === "passed";
    const readonlyStatus = verified ? "passed" : member.status === "visible_not_available"
      ? "visible_not_available"
      : readbackPoll.result?.status === "transport_failed" ? "transport_failed"
        : "readback_pending";
    const evidenceRef = await saveDmpPushEvidence({
      repo,
      jobId,
      customAudienceId: item.plan.custom_audience_id,
      stage: "batch-readback",
      status: verified ? "verified" : readonlyStatus,
      pushActionId: item.actionId,
      readback: {
        read: readbackPoll.result?.read,
        select: readbackPoll.result?.selectAvailable
      },
      responseHash: item.responseHash
    });
    await repo.updateDmpPackageMemberAccountReadonly({
      packageSetId: item.plan.package_set_id,
      customAudienceId: item.plan.custom_audience_id,
      advertiserId: item.plan.target_advertiser_id,
      readonlyStatus,
      evidenceRef,
      metadata: {
        dmp_push_batch_readback: {
          status: readonlyStatus,
          action_id: item.actionId,
          read_hit: member.readHit === true,
          visible_hit: member.visibleHit === true,
          available_hit: member.availableHit === true,
          delivery_status: member.deliveryStatus || "",
          poll_attempts: readbackPoll.attempts,
          response_hash_present: Boolean(item.responseHash),
          checked_at: new Date().toISOString()
        }
      }
    });
    await repo.updateDmpPackagePushPlanStatus({
      pushPlanId: item.plan.push_plan_id,
      planStatus: verified ? "verified" : "executed",
      evidenceRef,
      responseHash: item.responseHash,
      metadata: { batch_readback_status: readonlyStatus, response_body_stored: false }
    });
    if (verified) verifiedIds.push(item.plan.custom_audience_id);
  }

  const finalPlans = await repo.getDmpPackagePushPlans(jobId);
  const allVerified = finalPlans.length === pushed.length && pushed.length > 0 && finalPlans.every((plan) => plan.plan_status === "verified");
  let allTargetPassedIds = verifiedIds;
  if (allVerified) {
    const refreshedPackageSet = await repo.getDmpPackageSet({
      routeId: bundle.job.route_id,
      gameCode: bundle.job.game_code,
      targetAdvertiserId: bundle.job.advertiser_id,
      packageSetId: finalPlans[0]?.package_set_id || ""
    });
    allTargetPassedIds = (refreshedPackageSet?.members || [])
      .filter((member) => member.target_readonly_status === "passed")
      .map((member) => clean(member.custom_audience_id))
      .filter(Boolean);
  }
  if (allVerified) {
    await repo.updateAccountResourceReadonly({
      routeId: bundle.job.route_id,
      gameCode: bundle.job.game_code,
      advertiserId: bundle.job.advertiser_id,
      resourceType: "dmp_audience_package",
      visibilityStatus: "visible",
      readbackStatus: "readback_verified",
      inheritanceStatus: "target_readonly_verified",
      metadata: {
        status: "passed",
        key: "dmp_push_readback_verified",
        verified_count: allTargetPassedIds.length,
        pushed_verified_count: verifiedIds.length,
        checked_at: new Date().toISOString(),
        responseBodyStored: false
      },
      resourceMetadata: {
        custom_audience_ids: allTargetPassedIds,
        dmp_package_set_id: finalPlans[0]?.package_set_id || ""
      }
    });
  }
  const result = sanitizeForPublic({
    status: allVerified ? "dmp_ready" : "dmp_batch_readback_pending",
    jobId,
    verified_count: allTargetPassedIds.length,
    pushed_verified_count: verifiedIds.length,
    plan_count: finalPlans.length,
    platform_write_called: pushed.length > 0,
    batchReadbackAttempts: readbackPoll.attempts,
    requestBodyStored: false,
    responseBodyStored: false
  });
  assertNoSensitiveLeak(result);
  return result;
}
