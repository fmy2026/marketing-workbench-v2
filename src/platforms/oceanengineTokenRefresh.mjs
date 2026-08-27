import {
  TOKEN_REFRESH_CONFIRM_ENV,
  TOKEN_REFRESH_CONFIRM_VALUE,
  computeTokenWindow,
  readOceanEngineEnv,
  redactedCredentialStatus,
  refreshConfirmed,
  scheduledTokenRefreshScopeStatus,
  updateOceanEngineEnv
} from "./oceanengineCredentialStore.mjs";

const REFRESH_URLS = [
  "https://ad.oceanengine.com/open_api/oauth2/refresh_token/",
  "https://api.oceanengine.com/open_api/oauth2/refresh_token/"
];

function clean(value) {
  return String(value ?? "").trim();
}

function safeApiCode(payload = {}) {
  return clean(payload.code ?? payload.err_no ?? payload.error_code ?? "");
}

async function postRefresh(url, body, fetchImpl) {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(body)
  });
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
    payload
  };
}

function baseResult(values = {}) {
  return {
    platformWriteCalled: false,
    rawResponseSaved: false,
    ...values
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

  const { envFilePresent, env: credentialEnv } = readOceanEngineEnv({ envPath, ensure: false });
  const appId = clean(credentialEnv.OCEANENGINE_APP_ID);
  const appSecret = clean(credentialEnv.OCEANENGINE_APP_SECRET);
  const refreshTokenValue = clean(credentialEnv.OCEANENGINE_REFRESH_TOKEN);

  if (!envFilePresent || !appId || !appSecret || !refreshTokenValue) {
    return {
      exitCode: 1,
      result: baseResult({
        tokenRefreshOk: false,
        refreshAttempted: false,
        status: "missing_required_credential_fields",
        credential: redactedCredentialStatus({ envPath })
      })
    };
  }

  const requestBody = { app_id: appId, secret: appSecret, refresh_token: refreshTokenValue };
  const attempts = [];

  for (const url of REFRESH_URLS) {
    try {
      const response = await postRefresh(url, requestBody, fetchImpl);
      const data = response.payload?.data ?? response.payload ?? {};
      const nextAccessToken = clean(data.access_token);
      const nextRefreshToken = clean(data.refresh_token);
      const expiresIn = Number(data.expires_in || 0);
      const apiCode = safeApiCode(response.payload);

      if (!response.ok || !nextAccessToken || !nextRefreshToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
        attempts.push({
          endpointHost: response.endpointHost,
          endpointPath: response.endpointPath,
          httpStatus: response.httpStatus,
          apiCode,
          failure: !response.ok ? "oauth_rejected" : "incomplete_refresh_response"
        });
        continue;
      }

      const obtainedAt = now();
      const tokenWindow = computeTokenWindow({
        obtainedAt,
        expiresIn,
        refreshSafetyMinutes: Number(env.OCEANENGINE_TOKEN_REFRESH_SAFETY_MINUTES || 30)
      });
      updateOceanEngineEnv(
        {
          OCEANENGINE_ACCESS_TOKEN: nextAccessToken,
          OCEANENGINE_REFRESH_TOKEN: nextRefreshToken,
          OCEANENGINE_TOKEN_OBTAINED_AT: obtainedAt.toISOString(),
          OCEANENGINE_TOKEN_EXPIRES_AT: tokenWindow.expiresAt,
          OCEANENGINE_TOKEN_REFRESH_AFTER: tokenWindow.refreshAfter,
          OCEANENGINE_TOKEN_STATUS: "valid",
          OCEANENGINE_AUTH_CODE: ""
        },
        { envPath, ensure: false }
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
          credential: redactedCredentialStatus({ envPath })
        })
      };
    } catch (error) {
      attempts.push({
        endpointHost: new URL(url).hostname,
        endpointPath: new URL(url).pathname,
        failure: "transport_error",
        transportError: clean(error?.code || error?.name || "transport_error")
      });
    }
  }

  updateOceanEngineEnv({ OCEANENGINE_TOKEN_STATUS: "refresh_failed" }, { envPath, ensure: false });
  return {
    exitCode: 1,
    result: baseResult({
      tokenRefreshOk: false,
      refreshAttempted: true,
      status: "refresh_failed",
      attempts,
      credential: redactedCredentialStatus({ envPath })
    })
  };
}
