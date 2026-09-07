import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { upsertQiankunCredential } from "../src/platforms/qiankunCredentialStore.mjs";

const root = mkdtempSync(path.join(tmpdir(), "mwbv2-qiankun-credential-"));
const envPath = path.join(root, "qiankun-monitor.env");
const storePath = path.join(root, "credentials.json");
const now = new Date("2026-09-07T00:00:00.000Z");
const secret = "test-only-passport-token";

const first = upsertQiankunCredential({
  ownerKey: "zhangjingwei",
  ownerName: "张境威",
  passportToken: secret,
  envPath,
  storePath,
  now
});
assert.equal(first.status, "active");
assert.equal(first.activeCredentialCount, 1);
assert.equal(first.credentials[0].passportTokenPresent, true);
assert.equal(first.credentials[0].expiresAt, "2026-10-07T00:00:00.000Z");
assert.equal(first.credentials[0].refreshAfter, "2026-10-02T00:00:00.000Z");
assert.equal(JSON.stringify(first).includes(secret), false);
assert.equal(statSync(storePath).mode & 0o777, 0o600);

const second = upsertQiankunCredential({
  ownerKey: "zhangjingwei",
  ownerName: "张境威",
  passportToken: "replacement-test-token",
  envPath,
  storePath,
  now: new Date("2026-09-08T00:00:00.000Z")
});
assert.equal(second.credentialCount, 1);
const stored = JSON.parse(readFileSync(storePath, "utf8"));
assert.equal(stored.credentials.length, 1);
assert.equal(stored.credentials[0].passport_token, "replacement-test-token");
assert.equal(stored.credentials[0].token_updated_at, "2026-09-08T00:00:00.000Z");

assert.throws(() => upsertQiankunCredential({
  ownerKey: "bad owner",
  ownerName: "Bad",
  passportToken: secret,
  envPath,
  storePath,
  now
}), /invalid_owner_key/);

console.log(JSON.stringify({
  status: "passed",
  cases: ["create_redacted", "replace_in_place", "mode_0600", "invalid_owner_rejected"],
  sensitiveOutput: false
}, null, 2));
