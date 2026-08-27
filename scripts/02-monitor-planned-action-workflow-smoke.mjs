import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import { createJob, runJob } from "../src/workflows/launchWorkflow.mjs";
import { ACTION_ENSURE_MONITOR } from "../src/workflows/executionPlan.mjs";
import {
  QIANKUN_CREDENTIAL_SCHEMA_VERSION,
  ensureQiankunCredentialStoreScaffold,
  ensureQiankunMonitorEnvScaffold
} from "../src/platforms/qiankunCredentialStore.mjs";
import { assertNoSensitiveLeak, hashValue } from "../src/workflows/skills/oe3/00-contracts.mjs";

const ROUTE_ID = "oceanengine_3_byte_mini_game";
const GAME_CODE = "JSZC";
const OWNER_KEY = "fengmeiyu";
const TOUCHPOINT_URL = ["https://example.test", "/mwbv2-monitor"].join("");

const ACCOUNTS = Object.freeze({
  success: "899900000000001",
  existing: "899900000000002",
  unauthorized: "899900000000003",
  busy: "899900000000004"
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256Hex(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function formParams(body) {
  return Object.fromEntries(new URLSearchParams(String(body || "")).entries());
}

function monitorRow({ advertiserId, recordId, monitorId }) {
  return {
    id: `SERIAL-${monitorId}`,
    monitor_id: monitorId,
    package_id: "36820",
    _cate_id: "122",
    cate_id: "122",
    _vest_id: "1414",
    vest_id: "1414",
    channel: "dymini3k",
    media_account_id: advertiserId,
    _media_account_id: recordId,
    _os_name: "3",
    os_name: "3",
    _media_id: "310",
    media_id: "310",
    _agent_id: "613",
    agent_id: "613",
    _monitor_api: "toutiao_wxgame",
    monitor_api: "toutiao_wxgame",
    sso_owner: OWNER_KEY,
    _sso_owner: OWNER_KEY,
    touchpoint_url: TOUCHPOINT_URL
  };
}

function createMockFetch({ scenario, calls }) {
  const state = {
    created: false,
    createCalls: 0
  };
  return async (url, options = {}) => {
    const endpoint = new URL(String(url)).pathname;
    const body = String(options.body || "");
    const params = formParams(body);
    calls.push({ endpoint, params, paramsPresent: Object.keys(params).length > 0, body });

    if (endpoint === "/tf/account_info/accountIndex") {
      const advertiserId = String(params.accountId || "");
      return new Response(JSON.stringify({
        code: 0,
        data: {
          resultTotal: 1,
          list: [
            {
              id: `QK-${advertiserId.slice(-3)}`,
              _media_account_id: `QK-${advertiserId.slice(-3)}`,
              account_id: advertiserId,
              _agent_id: "613",
              agent_id: "613",
              sso_owner: OWNER_KEY,
              _sso_owner: OWNER_KEY,
              sso_owner_name: OWNER_KEY,
              advertiser_name: `Synthetic ${advertiserId.slice(-3)}`,
              account_auth_status_name: "授权正常",
              status: "active",
              [["access", "token"].join("_")]: "present"
            }
          ]
        }
      }), { status: 200, headers: { "content-type": "application/json" } });
    }

    if (endpoint === "/tf/ad/index") {
      const advertiserId = String(params.mediaAccountId || "");
      const existing = scenario === "existing";
      const rows = existing
        ? [monitorRow({ advertiserId, recordId: `QK-${advertiserId.slice(-3)}`, monitorId: "245999" })]
        : state.created && scenario === "success"
          ? [monitorRow({ advertiserId, recordId: `QK-${advertiserId.slice(-3)}`, monitorId: "246001" })]
          : [];
      return new Response(JSON.stringify({
        code: 0,
        data: {
          resultTotal: rows.length,
          list: rows
        }
      }), { status: 200, headers: { "content-type": "application/json" } });
    }

    if (endpoint === "/tf/ad/monitorSerialNumberAdd") {
      state.createCalls += 1;
      if (scenario === "busy") {
        return new Response(JSON.stringify({ code: 500, msg: "服务器繁忙" }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      state.created = true;
      return new Response(JSON.stringify({ code: 0, data: { created: true } }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ code: 404, msg: "mock endpoint not found" }), {
      status: 404,
      headers: { "content-type": "application/json" }
    });
  };
}

async function prepareCredentialEnv() {
  const tempDir = mkdtempSync(path.join(tmpdir(), "mwbv2-monitor-planned-"));
  const envPath = path.join(tempDir, "qiankun-monitor.env");
  const storePath = path.join(tempDir, "qiankun-passport-credentials.json");
  ensureQiankunMonitorEnvScaffold({ envPath });
  writeFileSync(envPath, [
    "QIANKUN_API_BASE_URL=https://mock.qiankun.local",
    `QIANKUN_CREDENTIAL_STORE_PATH=${storePath}`,
    ""
  ].join("\n"), { encoding: "utf8", mode: 0o600 });
  ensureQiankunCredentialStoreScaffold({ envPath, storePath });
  writeFileSync(storePath, JSON.stringify({
    schema_version: QIANKUN_CREDENTIAL_SCHEMA_VERSION,
    updated_at: "2026-08-27T00:00:00.000Z",
    credentials: [
      {
        owner_key: OWNER_KEY,
        owner_name: "Workflow Test Owner",
        [["passport", "token"].join("_")]: "x",
        token_updated_at: "2026-08-27T00:00:00.000Z",
        expires_at: "2099-01-01T00:00:00.000Z",
        refresh_after: "2098-12-25T00:00:00.000Z",
        status: "active"
      }
    ]
  }, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
  return { tempDir, envPath };
}

async function seedAccount(repo, advertiserId, { monitorId = "" } = {}) {
  await repo.upsertAdvertiserAccount({
    advertiserId,
    routeId: ROUTE_ID,
    gameCode: GAME_CODE,
    accountName: `Synthetic ${advertiserId.slice(-3)}`,
    platform: "oceanengine",
    authStatus: "ready",
    platformStatus: "active",
    ownerName: OWNER_KEY,
    monitorId
  });
  if (monitorId) {
    const touchpointId = `QK-MONITOR-${advertiserId}-${monitorId}`;
    await repo.upsertAccountTouchpoint({
      touchpointId,
      advertiserId,
      routeId: ROUTE_ID,
      gameCode: GAME_CODE,
      monitorId,
      touchpointRef: touchpointId,
      urlHash: sha256Hex(TOUCHPOINT_URL),
      status: "stored_in_database",
      source: "monitor_planned_action_smoke_seed",
      touchpointUrl: TOUCHPOINT_URL
    });
  }
}

async function makeJob(repo, advertiserId, cleanupJobIds) {
  const view = await createJob(repo, {
    user_intent: `推广路线 ${ROUTE_ID}，游戏 ${GAME_CODE}，账户 ${advertiserId}`,
    route_id: ROUTE_ID,
    game_code: GAME_CODE,
    advertiser_id: advertiserId,
    source_usage: "test_run",
    source_record_ref: `smoke:monitor-planned-action:${advertiserId}:${new Date().toISOString()}`
  });
  cleanupJobIds.push(view.jobId);
  return view.jobId;
}

function node2(view) {
  return (view.phases || [])
    .flatMap((phase) => phase.nodes || [])
    .find((node) => node.id === "creation_context") || {};
}

async function cleanup(repo, cleanupJobIds) {
  for (const jobId of cleanupJobIds.reverse()) {
    await repo.deleteTestJobCascade(jobId);
  }
  for (const advertiserId of Object.values(ACCOUNTS)) {
    await repo.deleteSyntheticMonitorTestContext({ routeId: ROUTE_ID, gameCode: GAME_CODE, advertiserId });
  }
}

const repo = new PostgresRepository();
const cleanupJobIds = [];
const previousEnvPath = process.env.QIANKUN_MONITOR_ENV_PATH;
const { tempDir, envPath } = await prepareCredentialEnv();
process.env.QIANKUN_MONITOR_ENV_PATH = envPath;

try {
  for (const advertiserId of Object.values(ACCOUNTS)) {
    await repo.deleteSyntheticMonitorTestContext({ routeId: ROUTE_ID, gameCode: GAME_CODE, advertiserId });
  }

  await seedAccount(repo, ACCOUNTS.success);
  const successCalls = [];
  const successJobId = await makeJob(repo, ACCOUNTS.success, cleanupJobIds);
  const successView = await runJob(repo, successJobId, {
    mode: "planned_actions",
    mockReady: true,
    mockMonitorEnsure: true,
    allowedPlanActions: [ACTION_ENSURE_MONITOR],
    qiankunOwnerKey: OWNER_KEY,
    fetchImpl: createMockFetch({ scenario: "success", calls: successCalls })
  });
  const successBundle = await repo.getLaunchJobBundle(successJobId);
  const successNode2 = node2(successView);
  assert(successNode2.status === "passed", "success_node2_not_passed");
  assert(successNode2.outputSummary.monitor.ensure.createCalled === true, "success_monitor_create_not_called");
  const successAccountIndexCall = successCalls.find((item) => item.endpoint === "/tf/account_info/accountIndex");
  const successCreateCall = successCalls.find((item) => item.endpoint === "/tf/ad/monitorSerialNumberAdd");
  assert(successAccountIndexCall, "success_account_index_call_missing");
  assert(successCreateCall, "success_create_call_missing");
  const oldCreateHashWithoutPackageDownloadUrl = hashValue({
    os: 3,
    package_id: "36820",
    cate_id: "122",
    vest_id: "1414",
    channel: "dymini3k",
    owner: OWNER_KEY,
    media_id: "310",
    agent_id: "613",
    num: 1,
    usage: 0,
    monitor_api: "toutiao_wxgame",
    media_account_id: `QK-${ACCOUNTS.success.slice(-3)}`,
    server_callback_type: "2",
    server_callback_data_types: ["active", "register", "success_order"],
    remark: `mwbv2-${GAME_CODE}-${ACCOUNTS.success}`
  });
  assert(successNode2.outputSummary.monitor.plan.createPlanHash !== oldCreateHashWithoutPackageDownloadUrl, "create_plan_hash_must_include_package_download_url");
  assert(successAccountIndexCall.body.includes("package_download_url=") === false, "readonly_account_index_must_not_send_empty_package_download_url");
  assert(successCreateCall.body.includes("package_download_url="), "create_form_must_send_empty_package_download_url");
  assert(successCreateCall.params.package_download_url === "", "create_params_must_preserve_empty_package_download_url");
  assert(successBundle.account.monitor_id === "246001", "success_monitor_not_written_to_account");
  assert(successBundle.touchpoint?.url_hash, "success_touchpoint_hash_missing");
  assert(successBundle.nodes.some((item) => item.node_key === "creation_context" && item.output_summary?.monitor?.readback?.monitorIdPresent === true), "success_readback_not_recorded");
  const monitorSkillRuns = (successBundle.skillRuns || []).filter((item) => String(item.skill_key || "").startsWith("monitor-"));
  assert(monitorSkillRuns.length === 4, "monitor_skill_run_count_not_4");
  assert(monitorSkillRuns.every((item) => item.module_ref === "src/workflows/skills/oe3/02-monitor-provision.mjs"), "monitor_skill_module_ref_missing");

  await seedAccount(repo, ACCOUNTS.existing, { monitorId: "245999" });
  const existingCalls = [];
  const existingJobId = await makeJob(repo, ACCOUNTS.existing, cleanupJobIds);
  const existingView = await runJob(repo, existingJobId, {
    mode: "planned_actions",
    mockReady: true,
    mockMonitorEnsure: true,
    allowedPlanActions: [ACTION_ENSURE_MONITOR],
    qiankunOwnerKey: OWNER_KEY,
    fetchImpl: createMockFetch({ scenario: "existing", calls: existingCalls })
  });
  assert(node2(existingView).status === "passed", "existing_node2_not_passed");
  assert(existingCalls.filter((item) => item.endpoint === "/tf/ad/monitorSerialNumberAdd").length === 0, "existing_monitor_should_not_create");

  await seedAccount(repo, ACCOUNTS.unauthorized);
  const unauthorizedCalls = [];
  const unauthorizedJobId = await makeJob(repo, ACCOUNTS.unauthorized, cleanupJobIds);
  const unauthorizedView = await runJob(repo, unauthorizedJobId, {
    mode: "planned_actions",
    mockReady: true,
    mockMonitorEnsure: true,
    allowedPlanActions: [],
    qiankunOwnerKey: OWNER_KEY,
    fetchImpl: createMockFetch({ scenario: "success", calls: unauthorizedCalls })
  });
  const unauthorizedBlockers = node2(unauthorizedView).outputSummary.monitor.blockers || [];
  assert(unauthorizedBlockers.includes("planned_action_not_allowed:ensure_monitor"), "unauthorized_blocker_missing");
  assert(unauthorizedCalls.filter((item) => item.endpoint === "/tf/ad/monitorSerialNumberAdd").length === 0, "unauthorized_monitor_create_called");

  await seedAccount(repo, ACCOUNTS.busy);
  const busyCalls = [];
  const busyJobId = await makeJob(repo, ACCOUNTS.busy, cleanupJobIds);
  const busyFetch = createMockFetch({ scenario: "busy", calls: busyCalls });
  await runJob(repo, busyJobId, {
    mode: "planned_actions",
    mockReady: true,
    mockMonitorEnsure: true,
    allowedPlanActions: [ACTION_ENSURE_MONITOR],
    qiankunOwnerKey: OWNER_KEY,
    fetchImpl: busyFetch
  });
  await delay(5200);
  await runJob(repo, busyJobId, {
    mode: "planned_actions",
    mockReady: true,
    mockMonitorEnsure: true,
    allowedPlanActions: [ACTION_ENSURE_MONITOR],
    qiankunOwnerKey: OWNER_KEY,
    fetchImpl: busyFetch
  });
  const thirdBusyView = await runJob(repo, busyJobId, {
    mode: "planned_actions",
    mockReady: true,
    mockMonitorEnsure: true,
    allowedPlanActions: [ACTION_ENSURE_MONITOR],
    qiankunOwnerKey: OWNER_KEY,
    fetchImpl: busyFetch
  });
  const busyCreateCalls = busyCalls.filter((item) => item.endpoint === "/tf/ad/monitorSerialNumberAdd").length;
  assert(busyCreateCalls === 2, "busy_create_call_count_not_2");
  assert((node2(thirdBusyView).outputSummary.monitor.blockers || []).includes("monitor_create_attempt_limit_reached"), "busy_attempt_limit_blocker_missing");

  const cliLikeBlocked = await import("../src/workflows/skills/oe3/02-monitor-provision.mjs")
    .then((mod) => mod.runMonitorProvisionCommand({
      mode: "ensure",
      repo,
      ownerKey: OWNER_KEY,
      target: { routeId: ROUTE_ID, gameCode: GAME_CODE, advertiserId: ACCOUNTS.unauthorized },
      env: {},
      fetchImpl: createMockFetch({ scenario: "success", calls: [] })
    }));
  assert(cliLikeBlocked.blockers.includes("confirm_variable_missing_or_invalid"), "cli_like_blocker_mismatch");

  const skillRows = successBundle.nodes.find((item) => item.node_key === "creation_context");
  const result = {
    status: "passed",
    success: {
      jobId: successJobId,
      node2Status: successNode2.status,
      monitorIdWritten: successBundle.account.monitor_id === "246001",
      touchpointHashPresent: Boolean(successBundle.touchpoint?.url_hash),
      monitorCreateCalls: successCalls.filter((item) => item.endpoint === "/tf/ad/monitorSerialNumberAdd").length,
      packageDownloadUrlEmptyFieldSent: successCreateCall.body.includes("package_download_url=")
    },
    existingMonitor: {
      jobId: existingJobId,
      node2Status: node2(existingView).status,
      monitorCreateCalls: existingCalls.filter((item) => item.endpoint === "/tf/ad/monitorSerialNumberAdd").length
    },
    unauthorized: {
      jobId: unauthorizedJobId,
      blockers: unauthorizedBlockers,
      monitorCreateCalls: unauthorizedCalls.filter((item) => item.endpoint === "/tf/ad/monitorSerialNumberAdd").length
    },
    busy: {
      jobId: busyJobId,
      monitorCreateCalls: busyCreateCalls,
      thirdRunBlocked: (node2(thirdBusyView).outputSummary.monitor.blockers || []).includes("monitor_create_attempt_limit_reached")
    },
    cliAndWorkflowUseSameHandler: cliLikeBlocked.blockers.includes("confirm_variable_missing_or_invalid"),
    monitorSkillModuleRefsRecorded: monitorSkillRuns.length === 4,
    node2OutputRecorded: Boolean(skillRows?.output_summary?.monitor),
    noRealPlatformWrite: true,
    noTokenRefresh: true
  };
  assertNoSensitiveLeak(result);
  console.log(JSON.stringify(result, null, 2));
} finally {
  if (previousEnvPath === undefined) {
    delete process.env.QIANKUN_MONITOR_ENV_PATH;
  } else {
    process.env.QIANKUN_MONITOR_ENV_PATH = previousEnvPath;
  }
  await cleanup(repo, cleanupJobIds);
  rmSync(tempDir, { recursive: true, force: true });
}
