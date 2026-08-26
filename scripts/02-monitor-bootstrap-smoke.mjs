import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  QIANKUN_CREDENTIAL_SCHEMA_VERSION,
  ensureQiankunCredentialStoreScaffold,
  ensureQiankunMonitorEnvScaffold,
  redactedQiankunCredentialStatus
} from "../src/platforms/qiankunCredentialStore.mjs";
import {
  MONITOR_PROVISION_ID_ENV,
  MONITOR_PROVISION_TARGET,
  MONITOR_RETRY_CONFIRM_ENV,
  MONITOR_RETRY_CONFIRM_VALUE,
  monitorEnsureConfirmed,
  monitorProvisionFingerprint,
  monitorProvisionId,
  runMonitorProvisionCommand
} from "../src/workflows/skills/oe3/02-monitor-provision.mjs";
import { createQiankunMonitorClient } from "../src/platforms/qiankunMonitorClient.mjs";
import { assertNoSensitiveLeak } from "../src/workflows/skills/oe3/00-contracts.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const tempDir = mkdtempSync(path.join(tmpdir(), "mwbv2-monitor-bootstrap-"));
try {
  const envPath = path.join(tempDir, "qiankun-monitor.env");
  const storePath = path.join(tempDir, "qiankun-passport-credentials.json");
  ensureQiankunMonitorEnvScaffold({ envPath });
  writeFileSync(envPath, [
    "QIANKUN_API_BASE_URL=https://center.3k.com",
    `QIANKUN_CREDENTIAL_STORE_PATH=${storePath}`,
    ""
  ].join("\n"), { encoding: "utf8", mode: 0o600 });
  ensureQiankunCredentialStoreScaffold({ envPath, storePath });
  writeFileSync(storePath, JSON.stringify({
    schema_version: QIANKUN_CREDENTIAL_SCHEMA_VERSION,
    updated_at: "2026-08-26T00:00:00.000Z",
    credentials: [
      {
        owner_key: "owner.test",
        owner_name: "Owner Test",
        passport_token: "x",
        token_updated_at: "2026-08-26T00:00:00.000Z",
        expires_at: "2099-01-01T00:00:00.000Z",
        refresh_after: "2098-12-25T00:00:00.000Z",
        status: "active"
      }
    ]
  }, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });

  const credential = redactedQiankunCredentialStatus({ envPath, storePath, ownerKey: "owner.test" });
  assert(credential.status === "active", "credential_status_should_be_active");
  assert(credential.credentials[0].passportTokenPresent === true, "passport_token_presence_should_be_boolean");
  assert(JSON.stringify(credential).includes("\"passport_token\"") === false, "passport_token_key_leaked");
  assertNoSensitiveLeak(credential);

  writeFileSync(storePath, JSON.stringify({
    schema_version: QIANKUN_CREDENTIAL_SCHEMA_VERSION,
    updated_at: "2026-08-26T00:05:00.000Z",
    credentials: [
      {
        owner_key: "",
        owner_name: "Pending Owner",
        passport_token: "x",
        token_updated_at: "2026-08-26T00:05:00.000Z",
        expires_at: "2099-01-01T00:00:00.000Z",
        refresh_after: "2098-12-25T00:00:00.000Z",
        status: "active"
      }
    ]
  }, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
  const pendingClient = createQiankunMonitorClient({
    envPath,
    storePath,
    allowPendingOwnerKeyBootstrap: true,
    pendingOwnerKeyBootstrapEndpoints: ["/tf/ad/index"],
    fetchImpl: async (_url, options = {}) => {
      assert(options.headers?.["X-Passport-Token"] === "x", "pending_bootstrap_token_not_used");
      return new Response(JSON.stringify({
        code: 0,
        data: {
          resultTotal: 1,
          list: [
            {
              id: 1,
              monitor_id: "245822",
              sso_owner: "owner.pending"
            }
          ]
        }
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
  });
  const pendingResult = await pendingClient.queryMonitorIndex({ ownerKey: "", params: { monitorId: "245822" } });
  assert(pendingResult.status === "passed", "pending_bootstrap_readonly_query_should_pass");
  assert(pendingResult.credential.pendingOwnerKeyBootstrap === true, "pending_bootstrap_flag_missing");
  assert(pendingResult.summary.list[0].ssoOwner === "owner.pending", "monitor_sso_owner_not_compacted");
  assertNoSensitiveLeak(pendingResult);
  let writeBlockedForPendingOwner = false;
  try {
    await pendingClient.postForm({
      endpoint: "/tf/ad/monitorSerialNumberAdd",
      ownerKey: "",
      allowWrite: true,
      params: { os: 3 }
    });
  } catch (error) {
    writeBlockedForPendingOwner = String(error?.message || "").includes("qiankun_write_requires_confirmed_owner_key");
  }
  assert(writeBlockedForPendingOwner === true, "pending_bootstrap_must_not_allow_write_endpoint");

  const provisionId = monitorProvisionId(MONITOR_PROVISION_TARGET);
  assert(provisionId === "MPR-OCEANENGINE-3-BYTE-MINI-GAME-JSZC-1871922346964041", "provision_id_unstable");
  const firstFingerprint = monitorProvisionFingerprint({
    ...MONITOR_PROVISION_TARGET,
    technicalConfig: { os: 3, package_id: "36820" }
  });
  const secondFingerprint = monitorProvisionFingerprint({
    ...MONITOR_PROVISION_TARGET,
    technicalConfig: { package_id: "36820", os: 3 }
  });
  assert(firstFingerprint === secondFingerprint, "fingerprint_must_be_canonical");
  assert(firstFingerprint.startsWith("sha256:"), "fingerprint_must_be_hash");

  assert(monitorEnsureConfirmed({
    [MONITOR_RETRY_CONFIRM_ENV]: MONITOR_RETRY_CONFIRM_VALUE,
    [MONITOR_PROVISION_ID_ENV]: provisionId
  }, provisionId) === false, "legacy_confirm_call_shape_should_not_pass");
  assert(monitorEnsureConfirmed({
    env: {
      [MONITOR_RETRY_CONFIRM_ENV]: MONITOR_RETRY_CONFIRM_VALUE,
      [MONITOR_PROVISION_ID_ENV]: provisionId
    },
    provisionId
  }) === true, "confirm_helper_failed");
  const createResult = await runMonitorProvisionCommand({
    mode: "ensure",
    env: {}
  });
  assert(createResult.status === "blocked", "foundation_create_must_block");
  assert(createResult.createCalled === false, "foundation_create_must_not_call_platform");
  assert(createResult.retryAllowed === false, "foundation_create_retry_must_be_false");
  assertNoSensitiveLeak(createResult);

  console.log(JSON.stringify({
    status: "passed",
    credentialStatus: credential.status,
    provisionId,
    fingerprintStable: firstFingerprint === secondFingerprint,
    ensureBlockedWithoutConfirm: createResult.createCalled === false,
    tokenLeaked: false
  }, null, 2));
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
