import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { refreshOceanEngineToken } from "../src/platforms/oceanengineTokenRefresh.mjs";

const TEMP_DIR = mkdtempSync(path.join(os.tmpdir(), "mwbv2-token-refresh-smoke-"));
const ENV_PATH = path.join(TEMP_DIR, "oceanengine.env");
const STATE_PATH = path.join(TEMP_DIR, "project.state.json");
const AUDIT_PATH = path.join(TEMP_DIR, "oceanengine-token-refresh-audit.jsonl");
const LOCK_PATH = path.join(TEMP_DIR, "oceanengine-token-refresh.lock");
const AUTOMATION_ID = "test-scheduled-token-refresh";
const SECRET_MARKERS = ["test-app-secret", "test-refresh-token", "test-new-access-token", "test-new-refresh-token"];
const OFFICIAL_REFRESH_URL = "https://api.oceanengine.com/open_api/oauth2/refresh_token/";

process.on("exit", () => rmSync(TEMP_DIR, { recursive: true, force: true }));

function writeState({ enabled = true, automationId = AUTOMATION_ID, mode = "scheduled_daily_oauth_refresh_only" } = {}) {
  writeFileSync(STATE_PATH, JSON.stringify({
    guardrails: {
      credential_refresh_allowed: enabled,
      credential_refresh_scope: {
        mode,
        authorized_automation_id: automationId,
        timezone: "Asia/Shanghai",
        daily_at: "12:00",
        confirm_variable: "MWBV2_OE_TOKEN_REFRESH_CONFIRM=REFRESH_ONE_OCEANENGINE_TOKEN",
        allowed_actions: ["oceanengine_oauth_refresh_token"]
      }
    }
  }));
}

function writeEnv(overrides = {}) {
  const values = {
    OCEANENGINE_APP_ID: "test-app-id",
    OCEANENGINE_APP_SECRET: "test-app-secret",
    OCEANENGINE_REDIRECT_URI: "http://127.0.0.1/callback",
    OCEANENGINE_ACCESS_TOKEN: "test-old-access-token",
    OCEANENGINE_REFRESH_TOKEN: "test-refresh-token",
    OCEANENGINE_TOKEN_STATUS: "valid",
    ...overrides
  };
  writeFileSync(ENV_PATH, [
    `OCEANENGINE_APP_ID=${values.OCEANENGINE_APP_ID}`,
    `OCEANENGINE_APP_SECRET=${values.OCEANENGINE_APP_SECRET}`,
    `OCEANENGINE_REDIRECT_URI=${values.OCEANENGINE_REDIRECT_URI}`,
    `OCEANENGINE_ACCESS_TOKEN=${values.OCEANENGINE_ACCESS_TOKEN}`,
    `OCEANENGINE_REFRESH_TOKEN=${values.OCEANENGINE_REFRESH_TOKEN}`,
    `OCEANENGINE_REFRESH_TOKEN_EXPIRES_AT=${values.OCEANENGINE_REFRESH_TOKEN_EXPIRES_AT || ""}`,
    `OCEANENGINE_REFRESH_FAILURE_TYPE=${values.OCEANENGINE_REFRESH_FAILURE_TYPE || ""}`,
    `OCEANENGINE_TOKEN_STATUS=${values.OCEANENGINE_TOKEN_STATUS}`
  ].join("\n") + "\n", { mode: 0o600 });
}

function testEnv(overrides = {}) {
  return {
    OCEANENGINE_ENV_PATH: ENV_PATH,
    MWBV2_PROJECT_STATE_PATH: STATE_PATH,
    MWBV2_OE_TOKEN_REFRESH_AUTOMATION_ID: AUTOMATION_ID,
    MWBV2_OE_TOKEN_REFRESH_CONFIRM: "REFRESH_ONE_OCEANENGINE_TOKEN",
    ...overrides
  };
}

function assertNoSecrets(value) {
  const text = JSON.stringify(value);
  for (const marker of SECRET_MARKERS) assert.equal(text.includes(marker), false, "safe result must not expose credentials");
}

function mockResponse({ ok = true, status = 200, payload } = {}) {
  return { ok, status, text: async () => JSON.stringify(payload) };
}

writeEnv();
writeState({ enabled: false });
let fetchCalls = 0;
let before = readFileSync(ENV_PATH, "utf8");
let outcome = await refreshOceanEngineToken({
  env: testEnv(),
  fetchImpl: async () => { fetchCalls += 1; throw new Error("must not call"); }
});
assert.equal(outcome.exitCode, 2);
assert.equal(outcome.result.status, "scheduled_scope_required");
assert.equal(fetchCalls, 0);
assert.equal(readFileSync(ENV_PATH, "utf8"), before);

writeState({ automationId: "different-automation" });
before = readFileSync(ENV_PATH, "utf8");
outcome = await refreshOceanEngineToken({ env: testEnv(), fetchImpl: async () => { fetchCalls += 1; } });
assert.equal(outcome.exitCode, 2);
assert.equal(fetchCalls, 0);
assert.equal(readFileSync(ENV_PATH, "utf8"), before);

writeState();
before = readFileSync(ENV_PATH, "utf8");
outcome = await refreshOceanEngineToken({
  env: testEnv({ MWBV2_OE_TOKEN_REFRESH_CONFIRM: "" }),
  fetchImpl: async () => { fetchCalls += 1; }
});
assert.equal(outcome.exitCode, 2);
assert.equal(outcome.result.status, "confirmation_required");
assert.equal(fetchCalls, 0);
assert.equal(readFileSync(ENV_PATH, "utf8"), before);

writeEnv();
fetchCalls = 0;
const requestedUrls = [];
outcome = await refreshOceanEngineToken({
  env: testEnv(),
  now: () => new Date("2026-08-27T04:00:00.000Z"),
  fetchImpl: async (url) => {
    fetchCalls += 1;
    requestedUrls.push(url);
    return mockResponse({
      payload: {
        data: {
          access_token: "test-new-access-token",
          refresh_token: "test-new-refresh-token",
          expires_in: 3600,
          refresh_token_expires_in: 86400,
          request_id: "test-request-id"
        }
      }
    });
  }
});
assert.equal(outcome.exitCode, 0);
assert.equal(outcome.result.status, "valid");
assert.equal(fetchCalls, 1);
assert.deepEqual(requestedUrls, [OFFICIAL_REFRESH_URL]);
assert.equal(statSync(ENV_PATH).mode & 0o777, 0o600);
assert.match(readFileSync(ENV_PATH, "utf8"), /OCEANENGINE_REFRESH_TOKEN_EXPIRES_AT=2026-08-28T04:00:00.000Z/u);
assertNoSecrets(outcome.result);

writeEnv();
writeFileSync(LOCK_PATH, "locked", { mode: 0o600 });
before = readFileSync(ENV_PATH, "utf8");
fetchCalls = 0;
outcome = await refreshOceanEngineToken({
  env: testEnv(),
  fetchImpl: async () => {
    fetchCalls += 1;
    throw new Error("must not call");
  }
});
assert.equal(outcome.exitCode, 1);
assert.equal(outcome.result.status, "refresh_in_progress");
assert.equal(fetchCalls, 0);
assert.equal(readFileSync(ENV_PATH, "utf8"), before);
rmSync(LOCK_PATH, { force: true });
assertNoSecrets(outcome.result);

writeEnv();
outcome = await refreshOceanEngineToken({
  env: testEnv(),
  fetchImpl: async () => { throw Object.assign(new Error("network unavailable"), { code: "ETIMEDOUT" }); }
});
assert.equal(outcome.exitCode, 1);
assert.equal(outcome.result.status, "refresh_failed");
assert.equal(outcome.result.failureType, "transport_error");
assertNoSecrets(outcome.result);

writeEnv();
outcome = await refreshOceanEngineToken({
  env: testEnv(),
  fetchImpl: async () => mockResponse({ ok: false, status: 401, payload: { code: 401, message: "expired", request_id: "test-request-id" } })
});
assert.equal(outcome.exitCode, 1);
assert.equal(outcome.result.status, "reauthorize_required");
assert.equal(outcome.result.failureType, "refresh_token_invalid_or_revoked");

writeEnv();
outcome = await refreshOceanEngineToken({
  env: testEnv(),
  fetchImpl: async () => mockResponse({ payload: { data: { access_token: "test-new-access-token" } } })
});
assert.equal(outcome.exitCode, 1);
assert.equal(outcome.result.status, "refresh_failed");
assert.equal(outcome.result.failureType, "incomplete_refresh_response");
assertNoSecrets(outcome.result);

writeEnv({ OCEANENGINE_REFRESH_TOKEN_EXPIRES_AT: "2026-08-27T03:59:59.000Z" });
fetchCalls = 0;
outcome = await refreshOceanEngineToken({
  env: testEnv(),
  now: () => new Date("2026-08-27T04:00:00.000Z"),
  fetchImpl: async () => {
    fetchCalls += 1;
    throw new Error("must not call");
  }
});
assert.equal(outcome.exitCode, 1);
assert.equal(outcome.result.status, "reauthorize_required");
assert.equal(outcome.result.failureType, "refresh_token_expired");
assert.equal(fetchCalls, 0);
assertNoSecrets(outcome.result);
assertNoSecrets(readFileSync(AUDIT_PATH, "utf8"));

console.log(JSON.stringify({
  tokenRefreshScopeSmoke: "passed",
  cases: [
    "scope_closed",
    "automation_mismatch",
    "confirmation_missing",
    "single_official_endpoint",
    "success_atomic_0600_with_refresh_token_expiry",
    "refresh_in_progress_zero_network",
    "network_failure",
    "oauth_rejected_reauthorize_required",
    "incomplete_response",
    "local_refresh_token_expired"
  ],
  sensitiveValuesEmitted: false
}, null, 2));
