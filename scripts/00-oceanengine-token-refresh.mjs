import { createHash } from "node:crypto";
import {
  TOKEN_REFRESH_CONFIRM_ENV,
  TOKEN_REFRESH_CONFIRM_VALUE,
  computeTokenWindow,
  readOceanEngineEnv,
  redactedCredentialStatus,
  refreshConfirmed,
  updateOceanEngineEnv
} from "../src/platforms/oceanengineCredentialStore.mjs";

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

function sha256(value) {
  return `sha256:${createHash("sha256").update(String(value)).digest("hex")}`;
}

async function postRefresh(url, body) {
  const response = await fetch(url, {
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
    payload,
    responseHash: sha256(text)
  };
}

async function refreshToken() {
  if (!refreshConfirmed()) {
    console.log(JSON.stringify({
      tokenRefreshOk: false,
      refreshAttempted: false,
      status: "confirmation_required",
      requiredConfirmVariable: `${TOKEN_REFRESH_CONFIRM_ENV}=${TOKEN_REFRESH_CONFIRM_VALUE}`,
      platformWriteCalled: false,
      rawResponseSaved: false
    }, null, 2));
    process.exitCode = 2;
    return;
  }

  const { env } = readOceanEngineEnv({ ensure: true });
  const appId = clean(env.OCEANENGINE_APP_ID);
  const appSecret = clean(env.OCEANENGINE_APP_SECRET);
  const refreshTokenValue = clean(env.OCEANENGINE_REFRESH_TOKEN);

  if (!appId || !appSecret || !refreshTokenValue) {
    console.log(JSON.stringify({
      tokenRefreshOk: false,
      refreshAttempted: false,
      status: "missing_required_credential_fields",
      credential: redactedCredentialStatus(),
      platformWriteCalled: false,
      rawResponseSaved: false
    }, null, 2));
    process.exitCode = 1;
    return;
  }

  const requestBody = {
    app_id: appId,
    secret: appSecret,
    refresh_token: refreshTokenValue
  };
  const errors = [];

  for (const url of REFRESH_URLS) {
    try {
      const result = await postRefresh(url, requestBody);
      const data = result.payload?.data ?? result.payload ?? {};
      const nextAccessToken = clean(data.access_token);
      const nextRefreshToken = clean(data.refresh_token);
      const expiresIn = Number(data.expires_in || 0);
      const apiCode = safeApiCode(result.payload);

      if (!result.ok || !nextAccessToken || !nextRefreshToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
        errors.push({
          endpointHost: result.endpointHost,
          endpointPath: result.endpointPath,
          httpStatus: result.httpStatus,
          apiCode,
          responseHash: result.responseHash,
          accessTokenPresent: Boolean(nextAccessToken),
          refreshTokenPresent: Boolean(nextRefreshToken)
        });
        continue;
      }

      const obtainedAt = new Date();
      const tokenWindow = computeTokenWindow({
        obtainedAt,
        expiresIn,
        refreshSafetyMinutes: Number(process.env.OCEANENGINE_TOKEN_REFRESH_SAFETY_MINUTES || 30)
      });
      updateOceanEngineEnv({
        OCEANENGINE_ACCESS_TOKEN: nextAccessToken,
        OCEANENGINE_REFRESH_TOKEN: nextRefreshToken,
        OCEANENGINE_TOKEN_OBTAINED_AT: obtainedAt.toISOString(),
        OCEANENGINE_TOKEN_EXPIRES_AT: tokenWindow.expiresAt,
        OCEANENGINE_TOKEN_REFRESH_AFTER: tokenWindow.refreshAfter,
        OCEANENGINE_TOKEN_STATUS: "valid",
        OCEANENGINE_AUTH_CODE: ""
      });

      console.log(JSON.stringify({
        tokenRefreshOk: true,
        refreshAttempted: true,
        endpointHost: result.endpointHost,
        endpointPath: result.endpointPath,
        httpStatus: result.httpStatus,
        apiCode,
        accessTokenPresent: true,
        refreshTokenPresent: true,
        tokenExpiresAt: tokenWindow.expiresAt,
        tokenRefreshAfter: tokenWindow.refreshAfter,
        credential: redactedCredentialStatus(),
        platformWriteCalled: false,
        rawResponseSaved: false
      }, null, 2));
      return;
    } catch (error) {
      errors.push({
        endpointHost: new URL(url).hostname,
        endpointPath: new URL(url).pathname,
        transportError: clean(error.code || error.name || "transport_error")
      });
    }
  }

  updateOceanEngineEnv({
    OCEANENGINE_TOKEN_STATUS: "refresh_failed"
  });
  console.log(JSON.stringify({
    tokenRefreshOk: false,
    refreshAttempted: true,
    status: "refresh_failed",
    attempts: errors,
    credential: redactedCredentialStatus(),
    platformWriteCalled: false,
    rawResponseSaved: false
  }, null, 2));
  process.exitCode = 1;
}

await refreshToken();
