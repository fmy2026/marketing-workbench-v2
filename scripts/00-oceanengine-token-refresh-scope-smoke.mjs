import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { refreshOceanEngineToken } from "../src/platforms/oceanengineTokenRefresh.mjs";

const TEMP_DIR = mkdtempSync(path.join(os.tmpdir(), "mwbv2-token-refresh-smoke-"));
const ENV_PATH = path.join(TEMP_DIR, "oceanengine.env");
const STATE_PATH = path.join(TEMP_DIR, "project.state.json");
const AUTOMATION_ID = "test-scheduled-token-refresh";
const SECRET_MARKERS = ["test-app-secret", "test-refresh-token", "test-new-access-token", "test-new-refresh-token"];

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

function writeEnv() {
  writeFileSync(ENV_PATH, [
    "OCEANENGINE_APP_ID=test-app-id",
    "OCEANENGINE_APP_SECRET=test-app-secret",
    "OCEANENGINE_REDIRECT_URI=http://127.0.0.1/callback",
    "OCEANENGINE_ACCESS_TOKEN=test-old-access-token",
    "OCEANENGINE_REFRESH_TOKEN=test-refresh-token",
    "OCEANENGINE_TOKEN_STATUS=valid"
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
outcome = await refreshOceanEngineToken({
  env: testEnv(),
  now: () => new Date("2026-08-27T04:00:00.000Z"),
  fetchImpl: async () => {
    fetchCalls += 1;
    return mockResponse({ payload: { data: { access_token: "test-new-access-token", refresh_token: "test-new-refresh-token", expires_in: 3600 } } });
  }
});
assert.equal(outcome.exitCode, 0);
assert.equal(outcome.result.status, "valid");
assert.equal(fetchCalls, 1);
assert.equal(statSync(ENV_PATH).mode & 0o777, 0o600);
assertNoSecrets(outcome.result);

writeEnv();
outcome = await refreshOceanEngineToken({
  env: testEnv(),
  fetchImpl: async () => { throw Object.assign(new Error("network unavailable"), { code: "ETIMEDOUT" }); }
});
assert.equal(outcome.exitCode, 1);
assert.equal(outcome.result.status, "refresh_failed");
assertNoSecrets(outcome.result);

writeEnv();
outcome = await refreshOceanEngineToken({
  env: testEnv(),
  fetchImpl: async () => mockResponse({ ok: false, status: 401, payload: { code: 401, message: "expired" } })
});
assert.equal(outcome.exitCode, 1);
assert.equal(outcome.result.status, "refresh_failed");

writeEnv();
outcome = await refreshOceanEngineToken({
  env: testEnv(),
  fetchImpl: async () => mockResponse({ payload: { data: { access_token: "test-new-access-token" } } })
});
assert.equal(outcome.exitCode, 1);
assert.equal(outcome.result.status, "refresh_failed");
assertNoSecrets(outcome.result);

console.log(JSON.stringify({
  tokenRefreshScopeSmoke: "passed",
  cases: ["scope_closed", "automation_mismatch", "confirmation_missing", "success_0600", "network_failure", "oauth_rejected", "incomplete_response"],
  sensitiveValuesEmitted: false
}, null, 2));
