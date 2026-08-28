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
  MONITOR_RETRY_CONFIRM_ENV,
  MONITOR_RETRY_CONFIRM_VALUE,
  monitorEnsureConfirmed,
  monitorProvisionFingerprint,
  monitorProvisionId,
  runMonitorProvisionCommand,
  sanitizeMonitorPublicSummary
} from "../src/workflows/skills/oe3/02-monitor-provision.mjs";
import { createQiankunMonitorClient } from "../src/platforms/qiankunMonitorClient.mjs";
import { assertNoSensitiveLeak } from "../src/workflows/skills/oe3/00-contracts.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const tempDir = mkdtempSync(path.join(tmpdir(), "mwbv2-monitor-bootstrap-"));
const TEST_TARGET = {
  routeId: "oceanengine_3_byte_mini_game",
  gameCode: "JSZC",
  advertiserId: "1871922346964041"
};
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
  assert(credential.apiBaseUrlPresent === true, "api_base_url_presence_should_be_boolean");
  assert(JSON.stringify(credential).includes("\"passport_token\"") === false, "passport_token_key_leaked");
  assertNoSensitiveLeak(credential);

  const urlRedaction = sanitizeMonitorPublicSummary({
    sourceRef: "https://example.test/private-touchpoint",
    nested: { value: "https://example.test/private-landing" }
  });
  assert(urlRedaction.sourceRef === "[redacted]", "full_url_source_ref_must_be_redacted");
  assert(urlRedaction.nested.value === "[redacted]", "nested_full_url_must_be_redacted");
  assertNoSensitiveLeak(urlRedaction);

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

  const previousEnvPath = process.env.QIANKUN_MONITOR_ENV_PATH;
  writeFileSync(storePath, JSON.stringify({
    schema_version: QIANKUN_CREDENTIAL_SCHEMA_VERSION,
    updated_at: "2026-08-26T00:10:00.000Z",
    credentials: [
      {
        owner_key: "fengmeiyu",
        owner_name: "Owner Test",
        passport_token: "x",
        token_updated_at: "2026-08-26T00:10:00.000Z",
        expires_at: "2099-01-01T00:00:00.000Z",
        refresh_after: "2098-12-25T00:00:00.000Z",
        status: "active"
      }
    ]
  }, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
  process.env.QIANKUN_MONITOR_ENV_PATH = envPath;
  try {
    const fetchCalls = [];
    const writes = [];
    const reconcile = await runMonitorProvisionCommand({
      mode: "reconcile",
      target: TEST_TARGET,
      repo: {
        async getMonitorProvisionDefaults() {
          return {
            monitor_provision_present: true,
            monitor_provision: {
              os: 3,
              package_id: "36820",
              cate_id: "122",
              vest_id: "1414",
              channel: "dymini3k",
              usage: 0,
              num: 1
            },
            monitor_provision_reference_candidates: {
              media_id: "310",
              agent_id: "613",
              monitor_api: "toutiao_wxgame",
              status: "reference_only",
              source_ref: "smoke"
            }
          };
        },
        async upsertEvidence(evidence) {
          writes.push(["evidence", evidence.artifactId]);
        },
        async upsertAdvertiserAccount(account) {
          writes.push(["account", account.advertiserId]);
        },
        async upsertAccountTouchpoint(touchpoint) {
          writes.push(["touchpoint", touchpoint.monitorId]);
        },
        async upsertMonitorProvisionRun(run) {
          writes.push(["run", run.status, run.cycleStatus, run.createCalled === true]);
        }
      },
      fetchImpl: async (url, options = {}) => {
        const endpoint = new URL(url).pathname;
        fetchCalls.push(endpoint);
        assert(endpoint !== "/tf/ad/monitorSerialNumberAdd", "readonly_reconcile_must_not_call_create_endpoint");
        assert(options.headers?.["X-Passport-Token"] === "x", "active_token_not_used");
        if (endpoint === "/tf/account_info/accountIndex") {
          return new Response(JSON.stringify({
            code: 0,
            msg: "Success",
            data: {
              resultTotal: 1,
              list: [
                {
                  id: "8448",
                  account_id: TEST_TARGET.advertiserId,
                  _media_account_id: "8448",
                  _agent_id: "613",
                  agent_id_name: "Agent",
                  _sso_owner: "fengmeiyu",
                  sso_owner: "fengmeiyu",
                  sso_owner_name: "Owner Test",
                  advertiser_name: "Advertiser",
                  account_auth_status_name: "授权正常",
                  status: "1",
                  access_token: "present"
                }
              ]
            }
          }), { status: 200, headers: { "content-type": "application/json" } });
        }
        return new Response(JSON.stringify({
          code: 0,
          msg: "Success",
          data: {
            resultTotal: 1,
            list: [
              {
                id: "245828",
                monitor_id: "245828",
                package_id: "36820",
                _cate_id: "122",
                _media_account_id: "8448",
                media_account_id: TEST_TARGET.advertiserId,
                _os_name: "3",
                _media_id: "310",
                media_id: "Media",
                _agent_id: "613",
                agent_id: "Agent",
                _monitor_api: "toutiao_wxgame",
                monitor_api: "Monitor API",
                _sso_owner: "fengmeiyu",
                sso_owner: "Owner Test",
                _vest_id: "1414",
                vest_id: "Vest",
                channel: "dymini3k",
                wxgame_click_url: "https://example.test/touchpoint"
              }
            ]
          }
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
    });
    assert(reconcile.status === "passed", "reference_candidates_should_enable_readonly_exact_match");
    assert(reconcile.runStatus === "touchpoint_resolved", "readonly_reconcile_should_resolve_touchpoint");
    assert(reconcile.createCalled === false, "readonly_reconcile_should_not_create");
    assert(reconcile.defaults.referenceCandidateFieldsApplied.includes("media_id"), "media_id_candidate_not_applied");
    assert(fetchCalls.filter((endpoint) => endpoint === "/tf/ad/index").length === 1, "monitor_index_call_count_changed");
    assert(writes.some((item) => item[0] === "touchpoint" && item[1] === "245828"), "touchpoint_not_written");
    assert(writes.some((item) => item[0] === "run" && item[1] === "touchpoint_resolved" && item[2] === "resolved"), "resolved_touchpoint_cycle_should_close");
    assertNoSensitiveLeak(reconcile);
  } finally {
    if (previousEnvPath === undefined) {
      delete process.env.QIANKUN_MONITOR_ENV_PATH;
    } else {
      process.env.QIANKUN_MONITOR_ENV_PATH = previousEnvPath;
    }
  }

  const provisionId = monitorProvisionId(TEST_TARGET);
  assert(provisionId === "MPR-OCEANENGINE-3-BYTE-MINI-GAME-JSZC-1871922346964041", "provision_id_unstable");
  const firstFingerprint = monitorProvisionFingerprint({
    ...TEST_TARGET,
    technicalConfig: { os: 3, package_id: "36820" }
  });
  const secondFingerprint = monitorProvisionFingerprint({
    ...TEST_TARGET,
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
    env: {},
    target: TEST_TARGET
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
