import { createHash } from "node:crypto";
import {
  TOKEN_MAINTENANCE_REFRESH_BEFORE_EXPIRY_MINUTES,
  getOceanEngineCredentialSummary,
  readOceanEngineEnv,
  refreshConfirmed,
  scheduledTokenRefreshScopeStatus,
  updateOceanEngineEnv
} from "./oceanengineCredentialStore.mjs";
import {
  acquireRefreshLock,
  appendAuditEvent,
  refreshOceanEngineToken,
  refreshPaths,
  transportFailureClass
} from "./oceanengineTokenRefresh.mjs";
import { fetchWithDeadline, PLATFORM_JSON_TIMEOUT_MS, readResponseTextWithDeadline } from "./httpDeadline.mjs";

const OAUTH_ADVERTISER_URL = "https://api.oceanengine.com/open_api/oauth2/advertiser/get/";
const UNCERTAIN_STATUSES = new Set(["refreshing", "refresh_uncertain"]);

function clean(value) {
  return String(value ?? "").trim();
}

function apiCode(payload = {}) {
  return clean(payload.code ?? payload.err_no ?? payload.error_code ?? "");
}

function requestIdPresent(payload = {}) {
  return Boolean(clean(payload.request_id ?? payload.requestId ?? payload.log_id ?? payload.data?.request_id));
}

function responseHash(text = "") {
  return text ? createHash("sha256").update(String(text)).digest("hex") : "";
}

function localDate(instant) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(instant);
}

function remainingMinutes(summary, now) {
  const expiresAt = Date.parse(summary.tokenExpiresAt);
  if (!Number.isFinite(expiresAt)) return Number.NEGATIVE_INFINITY;
  return (expiresAt - now.getTime()) / 60_000;
}

function readyForRefresh(summary) {
  return summary.envFilePresent &&
    summary.appIdPresent &&
    summary.appSecretPresent &&
    summary.refreshTokenPresent &&
    !summary.refreshTokenExpired;
}

function notificationFor({ priorStatus, nextStatus, env, now, failureType = "" }) {
  const today = localDate(now);
  const changed = priorStatus !== nextStatus;
  const failure = nextStatus !== "ready";
  const recovery = priorStatus && priorStatus !== "ready" && nextStatus === "ready";
  return {
    shouldNotify: (failure || recovery) && changed && clean(env.OCEANENGINE_TOKEN_LAST_NOTIFICATION_DATE) !== today,
    date: today,
    kind: recovery ? "recovered" : failure ? "attention_required" : "",
    failureType
  };
}

function baseResult(values = {}) {
  return {
    platformWriteCalled: false,
    rawResponseSaved: false,
    ...values
  };
}

export async function verifyOceanEngineToken({ envPath, fetchImpl = globalThis.fetch } = {}) {
  const { env } = readOceanEngineEnv({ envPath, ensure: false });
  const appId = clean(env.OCEANENGINE_APP_ID);
  const secret = clean(env.OCEANENGINE_APP_SECRET);
  const accessToken = clean(env.OCEANENGINE_ACCESS_TOKEN);
  if (!appId || !secret || !accessToken) {
    return { ok: false, failureType: "verification_credentials_missing", endpointHost: "api.oceanengine.com", endpointPath: "/open_api/oauth2/advertiser/get/" };
  }
  const url = new URL(OAUTH_ADVERTISER_URL);
  url.searchParams.set("app_id", appId);
  url.searchParams.set("secret", secret);
  try {
    const response = await fetchWithDeadline(fetchImpl, url, {
      method: "GET",
      headers: { Accept: "application/json", "Access-Token": accessToken }
    }, { timeoutMs: PLATFORM_JSON_TIMEOUT_MS });
    const text = await readResponseTextWithDeadline(response, { timeoutMs: PLATFORM_JSON_TIMEOUT_MS });
    let payload = {};
    try { payload = JSON.parse(text); } catch { /* classified below */ }
    const code = apiCode(payload);
    const ok = response.ok && (code === "0" || code === "");
    return {
      ok,
      failureType: ok ? "" : "verification_rejected",
      endpointHost: url.hostname,
      endpointPath: url.pathname,
      httpStatus: response.status,
      apiCode: code,
      requestIdPresent: requestIdPresent(payload),
      responseHash: responseHash(text)
    };
  } catch (error) {
    return {
      ok: false,
      failureType: "verification_transport_error",
      endpointHost: "api.oceanengine.com",
      endpointPath: "/open_api/oauth2/advertiser/get/",
      transportFailureClass: transportFailureClass(error)
    };
  }
}

function writeMaintenance(envPath, values, updateEnv) {
  updateEnv(values, { envPath, ensure: false });
}

function audit(auditPath, now, values = {}) {
  appendAuditEvent(auditPath, { recordedAt: now.toISOString(), event: "token_maintenance", ...values });
}

function finalize({ envPath, auditPath, now, priorEnv, nextStatus, failureType = "", values = {}, verificationAttempted = false, tokenRefreshAttempted = false, result = {}, updateEnv = updateOceanEngineEnv }) {
  const notification = notificationFor({ priorStatus: clean(priorEnv.OCEANENGINE_TOKEN_MAINTENANCE_STATUS), nextStatus, env: priorEnv, now, failureType });
  try {
    writeMaintenance(envPath, {
      OCEANENGINE_TOKEN_MAINTENANCE_STATUS: nextStatus,
      OCEANENGINE_TOKEN_LAST_CHECK_AT: now.toISOString(),
      OCEANENGINE_TOKEN_LAST_FAILURE_TYPE: failureType,
      ...(notification.shouldNotify ? { OCEANENGINE_TOKEN_LAST_NOTIFICATION_DATE: notification.date } : {}),
      ...values
    }, updateEnv);
  } catch {
    audit(auditPath, now, {
      status: "persistence_failed",
      failureType: "maintenance_state_persist_failed",
      maintenanceStatus: "persistence_failed",
      tokenRefreshAttempted,
      verificationAttempted
    });
    return baseResult({
      status: "persistence_failed",
      failureType: "maintenance_state_persist_failed",
      tokenRefreshAttempted,
      verificationAttempted,
      notification: { shouldNotify: true, date: notification.date, kind: "attention_required", failureType: "maintenance_state_persist_failed" }
    });
  }
  const credential = getOceanEngineCredentialSummary({ envPath, now });
  audit(auditPath, now, {
    status: nextStatus,
    failureType,
    maintenanceStatus: nextStatus,
    tokenExpiresAt: credential.tokenExpiresAt,
    tokenRefreshAfter: credential.tokenRefreshAfter,
    tokenRefreshAttempted,
    verificationAttempted,
    ...result
  });
  return baseResult({
    status: nextStatus,
    failureType,
    tokenRefreshAttempted,
    verificationAttempted,
    credential: {
      status: credential.status,
      tokenExpiresAt: credential.tokenExpiresAt,
      tokenRefreshAfter: credential.tokenRefreshAfter,
      refreshTokenExpiresAt: credential.refreshTokenExpiresAt,
      blockers: credential.blockers
    },
    notification
  });
}

async function verifyAndFinalize({ envPath, auditPath, now, priorEnv, fetchImpl, refreshed = false, updateEnv = updateOceanEngineEnv }) {
  const verification = await verifyOceanEngineToken({ envPath, fetchImpl });
  if (!verification.ok) {
    return finalize({
      envPath, auditPath, now, priorEnv, nextStatus: "verification_required", failureType: verification.failureType,
      verificationAttempted: true, tokenRefreshAttempted: refreshed,
      values: refreshed ? { OCEANENGINE_TOKEN_LAST_REFRESH_AT: now.toISOString() } : {}, result: verification, updateEnv
    });
  }
  return finalize({
    envPath, auditPath, now, priorEnv, nextStatus: "ready", verificationAttempted: true, tokenRefreshAttempted: refreshed,
    values: {
      ...(refreshed ? { OCEANENGINE_TOKEN_LAST_REFRESH_AT: now.toISOString() } : {}),
      OCEANENGINE_TOKEN_LAST_VERIFY_AT: now.toISOString()
    }, result: verification, updateEnv
  });
}

/**
 * One deterministic maintenance cycle. It owns the same lock as refresh, so
 * expiry assessment and a possible OAuth call cannot race another cycle.
 */
export async function maintainOceanEngineToken({
  env = process.env,
  envPath = env.OCEANENGINE_ENV_PATH,
  projectStatePath,
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
  updateEnv = updateOceanEngineEnv
} = {}) {
  const instant = now();
  const scope = scheduledTokenRefreshScopeStatus({ env, projectStatePath });
  if (!scope.allowed) return { exitCode: 2, result: baseResult({ status: "maintenance_scope_required", scopeBlockers: scope.blockers }) };
  if (!refreshConfirmed(env)) return { exitCode: 2, result: baseResult({ status: "confirmation_required" }) };

  const { resolvedEnvPath, lockPath, auditPath } = refreshPaths(envPath);
  const lock = acquireRefreshLock({ lockPath, nowMs: instant.getTime(), staleSeconds: Number(env.OCEANENGINE_TOKEN_REFRESH_LOCK_STALE_SECONDS || 900) });
  if (!lock.acquired) {
    audit(auditPath, instant, { status: "maintenance_in_progress", failureType: "maintenance_in_progress", maintenanceStatus: "maintenance_in_progress" });
    return { exitCode: 1, result: baseResult({ status: "maintenance_in_progress", failureType: "maintenance_in_progress" }) };
  }

  try {
    const { env: priorEnv } = readOceanEngineEnv({ envPath: resolvedEnvPath, ensure: false });
    const priorStatus = clean(priorEnv.OCEANENGINE_TOKEN_MAINTENANCE_STATUS);
    if (UNCERTAIN_STATUSES.has(priorStatus)) {
      return { exitCode: 1, result: finalize({ envPath: resolvedEnvPath, auditPath, now: instant, priorEnv, nextStatus: "refresh_uncertain", failureType: "refresh_result_uncertain", updateEnv }) };
    }

    const summary = getOceanEngineCredentialSummary({ envPath: resolvedEnvPath, now: instant });
    if (priorStatus === "verification_required") {
      const outcome = await verifyAndFinalize({ envPath: resolvedEnvPath, auditPath, now: instant, priorEnv, fetchImpl, updateEnv });
      return { exitCode: outcome.status === "ready" ? 0 : 1, result: outcome };
    }
    if (!readyForRefresh(summary)) {
      const failureType = summary.refreshTokenExpired ? "refresh_token_expired" : "maintenance_credentials_missing";
      const nextStatus = summary.refreshTokenExpired ? "reauthorize_required" : "refresh_failed";
      return { exitCode: 1, result: finalize({ envPath: resolvedEnvPath, auditPath, now: instant, priorEnv, nextStatus, failureType, updateEnv }) };
    }

    if (remainingMinutes(summary, instant) >= TOKEN_MAINTENANCE_REFRESH_BEFORE_EXPIRY_MINUTES) {
      return { exitCode: 0, result: finalize({ envPath: resolvedEnvPath, auditPath, now: instant, priorEnv, nextStatus: "ready", values: { OCEANENGINE_TOKEN_LAST_FAILURE_TYPE: "" }, updateEnv }) };
    }

    const refreshed = await refreshOceanEngineToken({
      env,
      envPath: resolvedEnvPath,
      projectStatePath,
      fetchImpl,
      now: () => instant,
      lockAlreadyHeld: true,
      beforeNetworkAttempt: () => writeMaintenance(resolvedEnvPath, {
        OCEANENGINE_TOKEN_MAINTENANCE_STATUS: "refreshing",
        OCEANENGINE_TOKEN_LAST_CHECK_AT: instant.toISOString(),
        OCEANENGINE_TOKEN_LAST_REFRESH_ATTEMPT_AT: instant.toISOString(),
        OCEANENGINE_TOKEN_LAST_FAILURE_TYPE: ""
      }, updateEnv)
    });
    if (!refreshed.result.tokenRefreshOk) {
      const timeout = refreshed.result.attempts?.[0]?.transportFailureClass === "timeout";
      const failureType = refreshed.result.failureType || "refresh_failed";
      const nextStatus = timeout ? "refresh_uncertain" :
        ["refresh_token_expired", "refresh_token_invalid_or_revoked"].includes(failureType) ? "reauthorize_required" : "retry_pending";
      return { exitCode: 1, result: finalize({
        envPath: resolvedEnvPath, auditPath, now: instant, priorEnv, nextStatus, failureType,
        tokenRefreshAttempted: Boolean(refreshed.result.refreshAttempted),
        values: timeout ? {} : { OCEANENGINE_TOKEN_LAST_REFRESH_ATTEMPT_AT: instant.toISOString() }, updateEnv
      }) };
    }
    const outcome = await verifyAndFinalize({ envPath: resolvedEnvPath, auditPath, now: instant, priorEnv, fetchImpl, refreshed: true, updateEnv });
    return { exitCode: outcome.status === "ready" ? 0 : 1, result: outcome };
  } finally {
    try { lock.release(); } catch { /* stale lock cleanup is safe */ }
  }
}
