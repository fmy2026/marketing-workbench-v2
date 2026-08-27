import { createHash } from "node:crypto";
import { assertNoSensitiveLeak, sanitizeForPublic } from "../workflows/skills/oe3/00-contracts.mjs";
import {
  DMP_ENSURE_CONFIRM_ENV,
  DMP_ENSURE_CONFIRM_VALUE,
  validateDmpWriteScope
} from "../workflows/dmpExecutionScope.mjs";
import { createOceanEngineReadonlyClient } from "./oceanengineReadonlyClient.mjs";
import {
  credentialReady,
  getOceanEngineCredentialSummary,
  readOceanEngineEnv
} from "./oceanengineCredentialStore.mjs";

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

function extractCustomAudienceIds(value) {
  const found = [];
  function walk(item) {
    if (Array.isArray(item)) {
      item.forEach(walk);
      return;
    }
    if (!item || typeof item !== "object") return;
    for (const [key, child] of Object.entries(item)) {
      if (["custom_audience_id", "custom_audience_ids", "audience_package_id", "retargeting_tags_exclude"].includes(key)) {
        const values = Array.isArray(child) ? child : [child];
        values.map(clean).filter((id) => /^\d+$/.test(id)).forEach((id) => found.push(id));
      }
      walk(child);
    }
  }
  walk(value);
  return [...new Set(found)];
}

function summarizeDmp(payload = {}) {
  const ids = extractCustomAudienceIds(payload?.data || payload);
  return {
    customAudienceIdCount: ids.length,
    customAudienceIds: ids,
    dataPresent: Boolean(payload?.data)
  };
}

async function probeAudience({ client, advertiserId, customAudienceId }) {
  const audience = assertSafeIntegerId("custom_audience_id", customAudienceId);
  const read = await client.get({
    label: "dmp_custom_audience_read_after_push",
    endpoint: "dmp/custom_audience/read",
    query: {
      advertiser_id: advertiserId,
      custom_audience_ids: JSON.stringify([audience.number])
    },
    requestFieldManifest: {
      fieldNames: ["advertiser_id", "custom_audience_ids"],
      customAudienceIdsTransportType: "json_integer_array_string"
    },
    summarize: summarizeDmp
  });
  const select = await client.get({
    label: "dmp_custom_audience_select_after_push",
    endpoint: "dmp/custom_audience/select",
    query: {
      advertiser_id: advertiserId,
      custom_audience_ids: JSON.stringify([audience.number]),
      page: "1",
      page_size: "100"
    },
    requestFieldManifest: {
      fieldNames: ["advertiser_id", "custom_audience_ids", "page", "page_size"],
      customAudienceIdsTransportType: "json_integer_array_string"
    },
    summarize: summarizeDmp
  });
  const ids = new Set([...(read.summary?.customAudienceIds || []), ...(select.summary?.customAudienceIds || [])]);
  const passed = read.status === "passed" && select.status === "passed" && ids.has(audience.text);
  return sanitizeForPublic({
    status: passed ? "passed" : "missing",
    read: {
      status: read.status,
      httpStatus: read.httpStatus ?? null,
      apiCode: read.apiCode || "",
      requestIdPresent: Boolean(read.requestIdPresent),
      responseHash: read.responseHash || ""
    },
    select: {
      status: select.status,
      httpStatus: select.httpStatus ?? null,
      apiCode: select.apiCode || "",
      requestIdPresent: Boolean(select.requestIdPresent),
      responseHash: select.responseHash || ""
    }
  });
}

export function dmpPushTransportPayload({
  sourceAdvertiserId,
  targetAdvertiserId,
  customAudienceId,
  deliveryStatus = ""
} = {}) {
  const source = assertSafeIntegerId("source_advertiser_id", sourceAdvertiserId);
  const target = assertSafeIntegerId("target_advertiser_id", targetAdvertiserId);
  const audienceId = assertSafeIntegerId("custom_audience_id", customAudienceId);
  const payload = {
    advertiser_id: source.number,
    custom_audience_id: audienceId.number,
    target_advertiser_ids: [target.number]
  };
  if (clean(deliveryStatus)) payload.delivery_status = clean(deliveryStatus);
  return payload;
}

export function buildDmpPushRequestPlan({
  sourceAdvertiserId,
  targetAdvertiserId,
  customAudienceId,
  deliveryStatus = ""
} = {}) {
  const source = assertSafeIntegerId("source_advertiser_id", sourceAdvertiserId);
  const target = assertSafeIntegerId("target_advertiser_id", targetAdvertiserId);
  const audienceId = assertSafeIntegerId("custom_audience_id", customAudienceId);
  const requestShape = dmpPushTransportPayload({
    sourceAdvertiserId: source.text,
    targetAdvertiserId: target.text,
    customAudienceId: audienceId.text,
    deliveryStatus
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
  const verifiedIds = [];
  for (const plan of plans) {
    if (plan.plan_status !== "planned") continue;
    const requestBody = dmpPushTransportPayload({
      sourceAdvertiserId: plan.source_advertiser_id,
      targetAdvertiserId: plan.target_advertiser_id,
      customAudienceId: plan.custom_audience_id,
      deliveryStatus: ""
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
      response = await fetchImpl(`${API_BASE}${PUSH_PATH}`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "Access-Token": env.OCEANENGINE_ACCESS_TOKEN
        },
        body: JSON.stringify(requestBody)
      });
      text = await response.text();
      try { payload = JSON.parse(text); } catch { payload = {}; }
    } catch (error) {
      const evidenceRef = await saveDmpPushEvidence({ repo, jobId, customAudienceId: plan.custom_audience_id, stage: "transport", status: "transport_failed", pushActionId: actionId });
      await recordPushAction({
        repo,
        jobId,
        plan,
        status: "failed_once",
        requestHash,
        errorSummary: "dmp_push_transport_failed",
        errorCategory: clean(error?.code || error?.name || "transport_error"),
        response: { transport_error: true, response_body_stored: false }
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

    const readback = await probeAudience({ client, advertiserId: plan.target_advertiser_id, customAudienceId: plan.custom_audience_id });
    const verified = readback.status === "passed";
    const evidenceRef = await saveDmpPushEvidence({
      repo,
      jobId,
      customAudienceId: plan.custom_audience_id,
      stage: "readback",
      status: verified ? "verified" : "readback_blocked",
      pushActionId: actionId,
      readback,
      responseHash
    });
    await repo.updateDmpPackageMemberAccountReadonly({
      packageSetId: plan.package_set_id,
      customAudienceId: plan.custom_audience_id,
      advertiserId: plan.target_advertiser_id,
      readonlyStatus: verified ? "passed" : "blocked",
      evidenceRef,
      metadata: {
        dmp_push_readback_summary: {
          status: verified ? "passed" : "blocked",
          action_id: actionId,
          response_hash_present: Boolean(responseHash),
          read_hash_present: Boolean(readback.read?.responseHash),
          select_hash_present: Boolean(readback.select?.responseHash),
          checked_at: new Date().toISOString()
        }
      }
    });
    await repo.updateDmpPackagePushPlanStatus({
      pushPlanId: plan.push_plan_id,
      planStatus: verified ? "verified" : "executed",
      evidenceRef,
      responseHash,
      metadata: { readback_status: readback.status, response_body_stored: false }
    });
    if (!verified) {
      return sanitizeForPublic({ status: "dmp_push_readback_not_verified", jobId, failed_custom_audience_id: plan.custom_audience_id, platform_write_called: true, evidence_ref: evidenceRef });
    }
    verifiedIds.push(plan.custom_audience_id);
  }

  const finalPlans = await repo.getDmpPackagePushPlans(jobId);
  const allVerified = finalPlans.length > 0 && finalPlans.every((plan) => plan.plan_status === "verified");
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
        verified_count: verifiedIds.length,
        checked_at: new Date().toISOString(),
        responseBodyStored: false
      },
      resourceMetadata: {
        custom_audience_ids: verifiedIds,
        dmp_package_set_id: finalPlans[0]?.package_set_id || ""
      }
    });
  }
  const result = sanitizeForPublic({
    status: allVerified ? "dmp_ready" : "dmp_not_fully_verified",
    jobId,
    verified_count: verifiedIds.length,
    plan_count: finalPlans.length,
    platform_write_called: verifiedIds.length > 0,
    requestBodyStored: false,
    responseBodyStored: false
  });
  assertNoSensitiveLeak(result);
  return result;
}
