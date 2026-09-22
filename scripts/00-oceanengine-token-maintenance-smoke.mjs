import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { maintainOceanEngineToken } from "../src/platforms/oceanengineTokenMaintenance.mjs";
import { isPlatformDeadlineError, readResponseTextWithDeadline } from "../src/platforms/httpDeadline.mjs";

const TEMP_DIR = mkdtempSync(path.join(os.tmpdir(), "mwbv2-token-maintenance-smoke-"));
const ENV_PATH = path.join(TEMP_DIR, "oceanengine.env");
const STATE_PATH = path.join(TEMP_DIR, "project.state.json");
const LOCK_PATH = path.join(TEMP_DIR, "oceanengine-token-refresh.lock");
const AUDIT_PATH = path.join(TEMP_DIR, "oceanengine-token-refresh-audit.jsonl");
const AUTOMATION_ID = "com.hys.marketing-workbench.oceanengine-token-maintenance";
const SECRET_MARKERS = ["test-app-secret", "test-access-token", "test-refresh-token", "test-new-access-token", "test-new-refresh-token"];
const NOW = new Date("2026-09-22T04:00:00.000Z");

process.on("exit", () => rmSync(TEMP_DIR, { recursive: true, force: true }));

function writeState(overrides = {}) {
  writeFileSync(STATE_PATH, JSON.stringify({ guardrails: {
    credential_refresh_allowed: true,
    credential_refresh_scope: {
      mode: "system_hourly_oauth_maintenance_only",
      authorized_automation_id: AUTOMATION_ID,
      timezone: "Asia/Shanghai",
      check_interval_minutes: 60,
      refresh_before_expiry_minutes: 120,
      confirm_variable: "MWBV2_OE_TOKEN_REFRESH_CONFIRM=REFRESH_ONE_OCEANENGINE_TOKEN",
      allowed_actions: ["oceanengine_oauth_refresh_token", "oceanengine_oauth_token_readback"],
      ...overrides
    }
  } }));
}

function writeEnv(overrides = {}) {
  const values = {
    OCEANENGINE_APP_ID: "test-app-id",
    OCEANENGINE_APP_SECRET: "test-app-secret",
    OCEANENGINE_REDIRECT_URI: "http://127.0.0.1/callback",
    OCEANENGINE_ACCESS_TOKEN: "test-access-token",
    OCEANENGINE_REFRESH_TOKEN: "test-refresh-token",
    OCEANENGINE_TOKEN_EXPIRES_AT: "2026-09-22T08:00:00.000Z",
    OCEANENGINE_TOKEN_REFRESH_AFTER: "2026-09-22T07:30:00.000Z",
    OCEANENGINE_REFRESH_TOKEN_EXPIRES_AT: "2026-10-22T04:00:00.000Z",
    OCEANENGINE_TOKEN_STATUS: "valid",
    OCEANENGINE_TOKEN_MAINTENANCE_STATUS: "ready",
    ...overrides
  };
  writeFileSync(ENV_PATH, Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n") + "\n", { mode: 0o600 });
}

function testEnv(overrides = {}) {
  return {
    OCEANENGINE_ENV_PATH: ENV_PATH,
    MWBV2_PROJECT_STATE_PATH: STATE_PATH,
    MWBV2_OE_TOKEN_MAINTENANCE_ID: AUTOMATION_ID,
    MWBV2_OE_TOKEN_REFRESH_CONFIRM: "REFRESH_ONE_OCEANENGINE_TOKEN",
    ...overrides
  };
}

function response(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(payload) };
}

function refreshSuccess() {
  return response({ code: 0, data: {
    access_token: "test-new-access-token",
    refresh_token: "test-new-refresh-token",
    expires_in: 86_400,
    refresh_token_expires_in: 2_592_000,
    request_id: "test-request-id"
  } });
}

function readEnvText() {
  return readFileSync(ENV_PATH, "utf8");
}

function assertNoSecrets(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  for (const marker of SECRET_MARKERS) assert.equal(text.includes(marker), false, "sensitive value leaked");
}

let stalledBodyError = null;
try {
  await readResponseTextWithDeadline({ text: async () => new Promise(() => {}) }, { timeoutMs: 10 });
} catch (error) {
  stalledBodyError = error;
}
assert.equal(isPlatformDeadlineError(stalledBodyError), true);

const absentStatusPath = path.join(TEMP_DIR, "status-does-not-exist.env");
const statusCommand = spawnSync(process.execPath, ["scripts/00-oceanengine-token-status.mjs"], {
  cwd: process.cwd(),
  env: { ...process.env, OCEANENGINE_ENV_PATH: absentStatusPath },
  encoding: "utf8"
});
assert.equal(statusCommand.status, 0);
assert.equal(existsSync(absentStatusPath), false, "token_status_must_not_create_or_modify_credentials");

writeState();
writeEnv();
let calls = [];
let outcome = await maintainOceanEngineToken({
  env: testEnv(), now: () => NOW,
  fetchImpl: async (url) => { calls.push(url); throw new Error("must not call"); }
});
assert.equal(outcome.exitCode, 0);
assert.equal(outcome.result.status, "ready");
assert.equal(outcome.result.tokenRefreshAttempted, false);
assert.equal(calls.length, 0);
assert.match(readEnvText(), /OCEANENGINE_TOKEN_LAST_CHECK_AT=2026-09-22T04:00:00.000Z/u);

writeEnv({ OCEANENGINE_TOKEN_EXPIRES_AT: "2026-09-22T05:59:00.000Z" });
calls = [];
outcome = await maintainOceanEngineToken({
  env: testEnv(), now: () => NOW,
  fetchImpl: async (url) => {
    calls.push(url);
    return calls.length === 1 ? refreshSuccess() : response({ code: 0, data: { list: [] }, request_id: "verify-request-id" });
  }
});
assert.equal(outcome.exitCode, 0);
assert.equal(outcome.result.status, "ready");
assert.equal(outcome.result.tokenRefreshAttempted, true);
assert.equal(outcome.result.verificationAttempted, true);
assert.equal(calls.length, 2);
assert.equal(new URL(calls[0]).pathname, "/open_api/oauth2/refresh_token/");
assert.equal(new URL(calls[1]).pathname, "/open_api/oauth2/advertiser/get/");
assert.match(readEnvText(), /OCEANENGINE_TOKEN_LAST_VERIFY_AT=2026-09-22T04:00:00.000Z/u);
assert.match(readEnvText(), /OCEANENGINE_TOKEN_MAINTENANCE_STATUS=ready/u);

calls = [];
outcome = await maintainOceanEngineToken({ env: testEnv(), now: () => NOW, fetchImpl: async () => { calls.push("called"); throw new Error("must not call"); } });
assert.equal(outcome.exitCode, 0);
assert.equal(calls.length, 0);

writeEnv({ OCEANENGINE_TOKEN_EXPIRES_AT: "2026-09-22T05:59:00.000Z" });
writeFileSync(LOCK_PATH, "locked", { mode: 0o600 });
calls = [];
outcome = await maintainOceanEngineToken({ env: testEnv(), now: () => NOW, fetchImpl: async () => { calls.push("called"); } });
assert.equal(outcome.exitCode, 1);
assert.equal(outcome.result.status, "maintenance_in_progress");
assert.equal(calls.length, 0);
rmSync(LOCK_PATH, { force: true });

writeState({ check_interval_minutes: 30 });
writeEnv({ OCEANENGINE_TOKEN_EXPIRES_AT: "2026-09-22T05:59:00.000Z" });
calls = [];
outcome = await maintainOceanEngineToken({ env: testEnv(), now: () => NOW, fetchImpl: async () => { calls.push("called"); } });
assert.equal(outcome.exitCode, 2);
assert.equal(outcome.result.status, "maintenance_scope_required");
assert.equal(calls.length, 0);

writeState();
writeEnv({ OCEANENGINE_TOKEN_EXPIRES_AT: "2026-09-22T05:59:00.000Z" });
calls = [];
outcome = await maintainOceanEngineToken({
  env: testEnv(), now: () => NOW,
  updateEnv: () => { throw new Error("disk unavailable"); },
  fetchImpl: async () => { calls.push("called"); }
});
assert.equal(outcome.exitCode, 1);
assert.equal(outcome.result.status, "persistence_failed");
assert.equal(calls.length, 0);

writeEnv({ OCEANENGINE_TOKEN_EXPIRES_AT: "2026-09-22T05:59:00.000Z" });
outcome = await maintainOceanEngineToken({
  env: testEnv(), now: () => NOW,
  fetchImpl: async () => { throw Object.assign(new Error("dns"), { code: "ENOTFOUND" }); }
});
assert.equal(outcome.exitCode, 1);
assert.equal(outcome.result.status, "retry_pending");
assert.equal(outcome.result.failureType, "transport_error");

calls = [];
outcome = await maintainOceanEngineToken({
  env: testEnv(), now: () => NOW,
  fetchImpl: async (url) => {
    calls.push(url);
    return calls.length === 1 ? refreshSuccess() : response({ code: 0, data: {} });
  }
});
assert.equal(outcome.exitCode, 0);
assert.equal(outcome.result.status, "ready");
assert.equal(calls.length, 2);

writeEnv({ OCEANENGINE_TOKEN_EXPIRES_AT: "2026-09-22T05:59:00.000Z" });
outcome = await maintainOceanEngineToken({
  env: testEnv(), now: () => NOW,
  fetchImpl: async () => { throw Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }); }
});
assert.equal(outcome.exitCode, 1);
assert.equal(outcome.result.status, "refresh_uncertain");
calls = [];
outcome = await maintainOceanEngineToken({ env: testEnv(), now: () => NOW, fetchImpl: async () => { calls.push("called"); } });
assert.equal(outcome.exitCode, 1);
assert.equal(outcome.result.status, "refresh_uncertain");
assert.equal(calls.length, 0);

writeEnv({ OCEANENGINE_TOKEN_EXPIRES_AT: "2026-09-22T05:59:00.000Z" });
calls = [];
outcome = await maintainOceanEngineToken({
  env: testEnv(), now: () => NOW,
  fetchImpl: async (url) => {
    calls.push(url);
    return calls.length === 1 ? refreshSuccess() : response({ code: 400, message: "invalid" }, 400);
  }
});
assert.equal(outcome.exitCode, 1);
assert.equal(outcome.result.status, "verification_required");
calls = [];
outcome = await maintainOceanEngineToken({
  env: testEnv(), now: () => NOW,
  fetchImpl: async (url) => { calls.push(url); return response({ code: 0, data: {} }); }
});
assert.equal(outcome.exitCode, 0);
assert.equal(outcome.result.status, "ready");
assert.equal(calls.length, 1);
assert.equal(new URL(calls[0]).pathname, "/open_api/oauth2/advertiser/get/");

writeEnv({ OCEANENGINE_REFRESH_TOKEN_EXPIRES_AT: "2026-09-22T03:59:00.000Z" });
calls = [];
outcome = await maintainOceanEngineToken({ env: testEnv(), now: () => NOW, fetchImpl: async () => { calls.push("called"); } });
assert.equal(outcome.exitCode, 1);
assert.equal(outcome.result.status, "reauthorize_required");
assert.equal(calls.length, 0);

assertNoSecrets(readFileSync(AUDIT_PATH, "utf8"));
assertNoSecrets(outcome.result);
console.log(JSON.stringify({
  tokenMaintenanceSmoke: "passed",
  cases: [
    "not_due_zero_refresh",
    "threshold_refresh_and_oauth_readback",
    "repeat_check_skips_refresh",
    "shared_lock",
    "scope_closed_without_active_task",
    "persistence_failure_prevents_request",
    "dns_failure_recovers_next_hour",
    "timeout_blocks_automatic_retry",
    "verification_failure_readback_only_recovery",
    "refresh_token_expired_requires_reauthorization",
    "response_body_timeout",
    "token_status_is_read_only",
    "safe_audit"
  ],
  sensitiveValuesEmitted: false
}, null, 2));
