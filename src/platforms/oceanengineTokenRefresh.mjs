import { createHash } from "node:crypto";
import { appendFileSync, chmodSync, closeSync, mkdirSync, openSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  TOKEN_REFRESH_CONFIRM_ENV,
  TOKEN_REFRESH_CONFIRM_VALUE,
  computeExpiresAt,
  computeTokenWindow,
  readOceanEngineEnv,
  redactedCredentialStatus,
  refreshConfirmed,
  resolveOceanEngineEnvPath,
  scheduledTokenRefreshScopeStatus,
  updateOceanEngineEnv
} from "./oceanengineCredentialStore.mjs";
import { fetchWithDeadline, PLATFORM_JSON_TIMEOUT_MS } from "./httpDeadline.mjs";

const REFRESH_URL = "https://api.oceanengine.com/open_api/oauth2/refresh_token/";
const DEFAULT_LOCK_STALE_SECONDS = 15 * 60;

function clean(value) {
  return String(value ?? "").trim();
}

function safeApiCode(payload = {}) {
  return clean(payload.code ?? payload.err_no ?? payload.error_code ?? "");
}

function requestIdPresent(payload = {}) {
  return Boolean(clean(payload.request_id ?? payload.requestId ?? payload.log_id ?? payload.data?.request_id));
}

function responseHash(text = "") {
  if (!text) return "";
  return createHash("sha256").update(String(text)).digest("hex");
}

function safeTransportError(error) {
  return clean(error?.code || error?.name || "transport_error");
}

async function postRefresh(url, body, fetchImpl) {
  const response = await fetchWithDeadline(fetchImpl, url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(body)
  }, { timeoutMs: PLATFORM_JSON_TIMEOUT_MS });
  const text = await response.text();
  let payload = {};
  try {
    payload = JSON.parse(text);
  } catch {
    payload = {};
  }
  return {
    endpointHost: new URL(url).hostname,
    endpointPath: new URL(url).pathname,
    httpStatus: response.status,
    ok: response.ok,
    payload,
    responseHash: responseHash(text),
    requestIdPresent: requestIdPresent(payload)
  };
}

function baseResult(values = {}) {
  return {
    platformWriteCalled: false,
    rawResponseSaved: false,
    ...values
  };
}

function refreshPaths(envPath) {
  const resolvedEnvPath = resolveOceanEngineEnvPath(envPath);
  const dir = path.dirname(resolvedEnvPath);
  return {
    resolvedEnvPath,
    lockPath: path.join(dir, "oceanengine-token-refresh.lock"),
    auditPath: path.join(dir, "oceanengine-token-refresh-audit.jsonl")
  };
}

function acquireRefreshLock({ lockPath, nowMs = Date.now(), staleSeconds = DEFAULT_LOCK_STALE_SECONDS } = {}) {
  mkdirSync(path.dirname(lockPath), { recursive: true });
  try {
    const current = statSync(lockPath);
    if (nowMs - current.mtimeMs > staleSeconds * 1000) {
      unlinkSync(lockPath);
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  let fd;
  try {
    fd = openSync(lockPath, "wx", 0o600);
    writeFileSync(fd, JSON.stringify({ pid: process.pid, acquiredAt: new Date(nowMs).toISOString() }));
    closeSync(fd);
    chmodSync(lockPath, 0o600);
    return { acquired: true, release: () => unlinkSync(lockPath) };
  } catch (error) {
    if (fd !== undefined) closeSync(fd);
    if (error?.code === "EEXIST") return { acquired: false };
    throw error;
  }
}

function appendAuditEvent(auditPath, event = {}) {
  mkdirSync(path.dirname(auditPath), { recursive: true });
  const safeEvent = {
    recordedAt: event.recordedAt,
    status: event.status,
    failureType: event.failureType,
    endpointHost: event.endpointHost,
    endpointPath: event.endpointPath,
    httpStatus: event.httpStatus,
    apiCode: event.apiCode,
    requestIdPresent: Boolean(event.requestIdPresent),
    responseHash: event.responseHash,
    transportError: event.transportError
  };
  appendFileSync(auditPath, `${JSON.stringify(safeEvent)}\n`, { encoding: "utf8", mode: 0o600 });
  chmodSync(auditPath, 0o600);
}

function classifyFailure(response = {}, data = {}) {
  const apiCode = safeApiCode(response.payload);
  const searchable = JSON.stringify({
    code: apiCode,
    message: response.payload?.message ?? response.payload?.msg ?? response.payload?.error ?? ""
  }).toLowerCase();
  if (
    response.httpStatus === 401 ||
    response.httpStatus === 403 ||
    /refresh.*(invalid|expire|expired|revoked)|invalid.*refresh|token.*(invalid|expire|expired|revoked)|unauthori[sz]ed|forbidden/u.test(searchable)
  ) {
    return "refresh_token_invalid_or_revoked";
  }
  if (!response.ok || (apiCode && apiCode !== "0")) return "oauth_rejected";

  const nextAccessToken = clean(data.access_token);
  const nextRefreshToken = clean(data.refresh_token);
  const expiresIn = Number(data.expires_in || 0);
  const refreshTokenExpiresIn = Number(data.refresh_token_expires_in || 0);
  if (
    !nextAccessToken ||
    !nextRefreshToken ||
    !Number.isFinite(expiresIn) ||
    expiresIn <= 0 ||
    !Number.isFinite(refreshTokenExpiresIn) ||
    refreshTokenExpiresIn <= 0
  ) {
    return "incomplete_refresh_response";
  }
  return "";
}

function failureStatusFor(failureType) {
  return failureType === "refresh_token_expired" || failureType === "refresh_token_invalid_or_revoked"
    ? "reauthorize_required"
    : "refresh_failed";
}

function safeAttemptFromResponse(response, failureType) {
  return {
    endpointHost: response.endpointHost,
    endpointPath: response.endpointPath,
    httpStatus: response.httpStatus,
    apiCode: safeApiCode(response.payload),
    requestIdPresent: response.requestIdPresent,
    responseHash: response.responseHash,
    failure: failureType
  };
}

/**
 * Refreshes OAuth credentials without exposing their values. Scope and
 * confirmation checks run before the credential file is read or created.
 */
export async function refreshOceanEngineToken({
  env = process.env,
  envPath = env.OCEANENGINE_ENV_PATH,
  projectStatePath,
  fetchImpl = globalThis.fetch,
  now = () => new Date()
} = {}) {
  const { resolvedEnvPath, lockPath, auditPath } = refreshPaths(envPath);
  const scope = scheduledTokenRefreshScopeStatus({ env, projectStatePath });
  if (!scope.allowed) {
    return {
      exitCode: 2,
      result: baseResult({
        tokenRefreshOk: false,
        refreshAttempted: false,
        status: "scheduled_scope_required",
        scopeBlockers: scope.blockers
      })
    };
  }

  if (!refreshConfirmed(env)) {
    return {
      exitCode: 2,
      result: baseResult({
        tokenRefreshOk: false,
        refreshAttempted: false,
        status: "confirmation_required",
        requiredConfirmVariable: `${TOKEN_REFRESH_CONFIRM_ENV}=${TOKEN_REFRESH_CONFIRM_VALUE}`
      })
    };
  }

  const lock = acquireRefreshLock({
    lockPath,
    nowMs: now().getTime(),
    staleSeconds: Number(env.OCEANENGINE_TOKEN_REFRESH_LOCK_STALE_SECONDS || DEFAULT_LOCK_STALE_SECONDS)
  });
  if (!lock.acquired) {
    appendAuditEvent(auditPath, {
      recordedAt: now().toISOString(),
      status: "refresh_in_progress",
      failureType: "refresh_in_progress"
    });
    return {
      exitCode: 1,
      result: baseResult({
        tokenRefreshOk: false,
        refreshAttempted: false,
        status: "refresh_in_progress",
        failureType: "refresh_in_progress"
      })
    };
  }

  try {
    const { envFilePresent, env: credentialEnv } = readOceanEngineEnv({ envPath: resolvedEnvPath, ensure: false });
    const appId = clean(credentialEnv.OCEANENGINE_APP_ID);
    const appSecret = clean(credentialEnv.OCEANENGINE_APP_SECRET);
    const refreshTokenValue = clean(credentialEnv.OCEANENGINE_REFRESH_TOKEN);
    const refreshTokenExpiresAt = clean(credentialEnv.OCEANENGINE_REFRESH_TOKEN_EXPIRES_AT);
    const refreshTokenExpiresMs = refreshTokenExpiresAt ? Date.parse(refreshTokenExpiresAt) : NaN;

    if (!envFilePresent || !appId || !appSecret || !refreshTokenValue) {
      return {
        exitCode: 1,
        result: baseResult({
          tokenRefreshOk: false,
          refreshAttempted: false,
          status: "missing_required_credential_fields",
          credential: redactedCredentialStatus({ envPath: resolvedEnvPath })
        })
      };
    }

    if (refreshTokenExpiresAt && Number.isFinite(refreshTokenExpiresMs) && refreshTokenExpiresMs <= now().getTime()) {
      const failureType = "refresh_token_expired";
      updateOceanEngineEnv(
        { OCEANENGINE_TOKEN_STATUS: "reauthorize_required", OCEANENGINE_REFRESH_FAILURE_TYPE: failureType },
        { envPath: resolvedEnvPath, ensure: false }
      );
      appendAuditEvent(auditPath, {
        recordedAt: now().toISOString(),
        status: "reauthorize_required",
        failureType,
        endpointHost: new URL(REFRESH_URL).hostname,
        endpointPath: new URL(REFRESH_URL).pathname
      });
      return {
        exitCode: 1,
        result: baseResult({
          tokenRefreshOk: false,
          refreshAttempted: false,
          status: "reauthorize_required",
          failureType,
          endpointHost: new URL(REFRESH_URL).hostname,
          endpointPath: new URL(REFRESH_URL).pathname,
          credential: redactedCredentialStatus({ envPath: resolvedEnvPath })
        })
      };
    }

    const requestBody = { app_id: appId, secret: appSecret, refresh_token: refreshTokenValue };
    const attempts = [];

    try {
      const response = await postRefresh(REFRESH_URL, requestBody, fetchImpl);
      const data = response.payload?.data ?? response.payload ?? {};
      const nextAccessToken = clean(data.access_token);
      const nextRefreshToken = clean(data.refresh_token);
      const expiresIn = Number(data.expires_in || 0);
      const refreshTokenExpiresIn = Number(data.refresh_token_expires_in || 0);
      const apiCode = safeApiCode(response.payload);
      const failureType = classifyFailure(response, data);

      if (failureType) {
        attempts.push(safeAttemptFromResponse(response, failureType));
      } else {
        const obtainedAt = now();
        const tokenWindow = computeTokenWindow({
          obtainedAt,
          expiresIn,
          refreshSafetyMinutes: Number(env.OCEANENGINE_TOKEN_REFRESH_SAFETY_MINUTES || 30)
        });
        const nextRefreshTokenExpiresAt = computeExpiresAt({ obtainedAt, expiresIn: refreshTokenExpiresIn });
        updateOceanEngineEnv(
          {
            OCEANENGINE_ACCESS_TOKEN: nextAccessToken,
            OCEANENGINE_REFRESH_TOKEN: nextRefreshToken,
            OCEANENGINE_TOKEN_OBTAINED_AT: obtainedAt.toISOString(),
            OCEANENGINE_TOKEN_EXPIRES_AT: tokenWindow.expiresAt,
            OCEANENGINE_TOKEN_REFRESH_AFTER: tokenWindow.refreshAfter,
            OCEANENGINE_REFRESH_TOKEN_EXPIRES_AT: nextRefreshTokenExpiresAt,
            OCEANENGINE_REFRESH_FAILURE_TYPE: "",
            OCEANENGINE_TOKEN_STATUS: "valid",
            OCEANENGINE_AUTH_CODE: ""
          },
          { envPath: resolvedEnvPath, ensure: false }
        );

        return {
          exitCode: 0,
          result: baseResult({
            tokenRefreshOk: true,
            refreshAttempted: true,
            status: "valid",
            endpointHost: response.endpointHost,
            endpointPath: response.endpointPath,
            httpStatus: response.httpStatus,
            apiCode,
            tokenExpiresAt: tokenWindow.expiresAt,
            tokenRefreshAfter: tokenWindow.refreshAfter,
            refreshTokenExpiresAt: nextRefreshTokenExpiresAt,
            credential: redactedCredentialStatus({ envPath: resolvedEnvPath })
          })
        };
      }
    } catch (error) {
      attempts.push({
        endpointHost: new URL(REFRESH_URL).hostname,
        endpointPath: new URL(REFRESH_URL).pathname,
        failure: "transport_error",
        transportError: safeTransportError(error)
      });
    }

    const firstAttempt = attempts[0] || {};
    const failureType = firstAttempt.failure || "refresh_failed";
    const status = failureStatusFor(failureType);
    updateOceanEngineEnv(
      { OCEANENGINE_TOKEN_STATUS: status, OCEANENGINE_REFRESH_FAILURE_TYPE: failureType },
      { envPath: resolvedEnvPath, ensure: false }
    );
    appendAuditEvent(auditPath, {
      recordedAt: now().toISOString(),
      status,
      failureType,
      endpointHost: firstAttempt.endpointHost,
      endpointPath: firstAttempt.endpointPath,
      httpStatus: firstAttempt.httpStatus,
      apiCode: firstAttempt.apiCode,
      requestIdPresent: firstAttempt.requestIdPresent,
      responseHash: firstAttempt.responseHash,
      transportError: firstAttempt.transportError
    });
    return {
      exitCode: 1,
      result: baseResult({
        tokenRefreshOk: false,
        refreshAttempted: true,
        status,
        failureType,
        attempts,
        credential: redactedCredentialStatus({ envPath: resolvedEnvPath })
      })
    };
  } finally {
    if (lock.acquired) {
      try {
        lock.release();
      } catch {
        // Another process may have removed a stale lock after this process ended.
      }
    }
  }
}
