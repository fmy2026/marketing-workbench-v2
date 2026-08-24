import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import { createJob, runJob } from "../src/workflows/launchWorkflow.mjs";
import { STD_PROJECT_CREATE_CONFIRM_VALUE } from "../src/platforms/oceanengineStdProjectCreateExecutor.mjs";
import { evaluateStdProjectCreatePreflight } from "../src/workflows/skills/oe3/create-preflight-diagnostics.mjs";
import {
  EXECUTION_GRANT_INTENT,
  executeConfirmedLaunch
} from "../src/workflows/executeConfirmedLaunch.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertNoSensitiveLeak(value) {
  const text = JSON.stringify(value);
  [
    /touchpoint_url/i,
    /raw_payload/i,
    /raw_response/i,
    /tf-api\.3k\.com/i,
    /callback\/click/i,
    /\bcookie\b/i,
    /OCEANENGINE_ACCESS_TOKEN/i,
    /OCEANENGINE_REFRESH_TOKEN/i,
    /OCEANENGINE_APP_SECRET/i,
    /Access-Token/i,
    /Bearer\s+[A-Za-z0-9._-]{20,}/i
  ].forEach((pattern) => {
    if (pattern.test(text)) throw new Error(`sensitive leak matched ${pattern}`);
  });
}

function nodeStatuses(view = {}) {
  return Object.fromEntries(
    (view.phases || [])
      .flatMap((phase) => phase.nodes || [])
      .map((node) => [node.id, node.status])
  );
}

function debugCreateBlock(label, view, fakeFetch) {
  const createNode = (view.phases || [])
    .flatMap((phase) => phase.nodes || [])
    .find((node) => node.id === "std_project_create_executor");
  const relevantSkills = (view.skills?.latest || [])
    .filter((skill) => ["create-readiness", "create-once", "readback-std-project"].includes(skill.skillKey));
  console.error(JSON.stringify({
    label,
    executionGrant: view.executionGrant || {},
    headline: view.headline || {},
    createNode: createNode || {},
    relevantSkills,
    fakeCalls: fakeFetch?.calls || []
  }, null, 2));
}

function fakeFetchFactory({
  projectId,
  createApiCode = "0",
  createObjectIdPresent = true,
  listMatch = true
}) {
  const calls = [];
  async function fakeFetch(url, options = {}) {
    const href = String(url);
    calls.push({ href, method: options.method || "GET" });
    if (href.includes("/std_project/create/")) {
      return new Response(JSON.stringify({
        code: createApiCode,
        request_id: "fake-request-create",
        data: createObjectIdPresent ? { project_id: projectId } : {}
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (href.includes("/std_project/list/")) {
      const filtering = new URL(href).searchParams.get("filtering") || "{}";
      let name = "";
      try {
        name = JSON.parse(filtering).name || "";
      } catch {
        name = "";
      }
      return new Response(JSON.stringify({
        code: "0",
        request_id: "fake-request-list",
        data: {
          list: listMatch ? [
            { project_id: projectId, name, status: "ENABLE" }
          ] : []
        }
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error(`unexpected_fake_fetch_url:${href}`);
  }
  fakeFetch.calls = calls;
  return fakeFetch;
}

const repo = new PostgresRepository();
const createdJobIds = [];

async function createTestJob(sourceRecordRef) {
  const view = await createJob(repo, {
    user_intent: "oceanengine_3_byte_mini_game JSZC 1871922175825993",
    route_id: "oceanengine_3_byte_mini_game",
    game_code: "JSZC",
    advertiser_id: "1871922175825993",
    source_usage: "test_run",
    source_record_ref: sourceRecordRef
  });
  createdJobIds.push(view.jobId);
  return view;
}

function callCount(fakeFetch, pattern) {
  return fakeFetch.calls.filter((call) => call.href.includes(pattern)).length;
}

function assertOneCreateOneReadback(fakeFetch) {
  assert(callCount(fakeFetch, "/std_project/create/") === 1, "expected exactly one fake create call");
  assert(callCount(fakeFetch, "/std_project/list/") === 1, "expected exactly one fake readback call");
}

function latestSkill(view, skillKey) {
  return (view.skills?.latest || []).filter((skill) => skill.skillKey === skillKey).at(-1) || {};
}

try {
  const invalidShapePreflight = evaluateStdProjectCreatePreflight({
    payload: {
      advertiser_id: 1871922175825993,
      name: "fake_invalid_shape",
      ad_type: "ALL",
      landing_type: "MICRO_GAME",
      marketing_goal: "VIDEO_AND_IMAGE",
      external_action: "AD_CONVERT_TYPE_PAY",
      native_type: "AWEME",
      delivery_mode: "PROCEDURAL",
      schedule_type: "SCHEDULE_FROM_NOW",
      bid_type: "CUSTOM",
      budget_mode: "BUDGET_MODE_DAY",
      pricing: "PRICING_OCPM",
      audience_type: "CUSTOM",
      audience: {
        gender: "GENDER_UNLIMITED",
        hide_if_converted: "NO_EXCLUDE",
        retargeting_tags_exclude: ["100000000001"]
      },
      project_materials: {},
      track_url_setting: {},
      brand_info: {}
    },
    payloadContractStatus: "passed"
  });
  assert(invalidShapePreflight.status === "blocked", "invalid field shape should be blocked by preflight");
  assert(invalidShapePreflight.blocker_codes.includes("invalid_field_type:advertiser_id"), "preflight should detect advertiser_id type");
  assert(invalidShapePreflight.blocker_codes.includes("invalid_integer_array:audience.retargeting_tags_exclude"), "preflight should detect DMP integer array shape");
  assertNoSensitiveLeak(invalidShapePreflight);

  const invalid = await createTestJob("execution-grant-smoke:invalid");
  const blocked = await executeConfirmedLaunch({
    repo,
    jobId: invalid.jobId,
    grantSource: "test_fake_transport",
    executionIntent: "",
    fetchImpl: fakeFetchFactory({ projectId: "999900001" })
  });
  assert(blocked.executionGrant.status === "blocked", "invalid grant should block");
  assert(blocked.executionGrant.createCalled === false, "invalid grant should not create");

  const successView = await createTestJob("execution-grant-smoke:create-ok-readback-hit");
  const successFetch = fakeFetchFactory({ projectId: "999900002" });
  const result = await executeConfirmedLaunch({
    repo,
    jobId: successView.jobId,
    grantSource: "test_fake_transport",
    executionIntent: EXECUTION_GRANT_INTENT,
    fetchImpl: successFetch
  });
  const statuses = nodeStatuses(result);
  if (!successFetch.calls.some((call) => call.href.includes("/std_project/create/"))) {
    debugCreateBlock("fake_create_not_called", result, successFetch);
  }
  assertOneCreateOneReadback(successFetch);
  assert(statuses.launch_intake === "passed", "node 1 should pass");
  assert(statuses.creation_context === "passed", "node 2 should pass");
  assert(statuses.game_launch_pack === "passed", "node 3 should pass");
  assert(statuses.account_resource_prepare === "passed", "node 4 should pass");
  assert(statuses.std_project_draft_builder === "needs_confirmation", "node 5 should need confirmation");
  assert(statuses.std_project_create_executor === "passed", "node 6 should pass");
  assert(statuses.readback_closer === "passed", "node 7 should pass");
  assert(result.headline.status === "created", "job should be created after fake readback");
  assert(result.executionGrant.createCalled === true, "execution grant should report createCalled");
  assert(result.readback?.status === "readback_verified", "readback should be verified");
  assertNoSensitiveLeak(result);

  const recoveredView = await createTestJob("execution-grant-smoke:create-40000-readback-hit");
  const recoveredFetch = fakeFetchFactory({
    projectId: "999900004",
    createApiCode: "40000",
    createObjectIdPresent: false,
    listMatch: true
  });
  const recovered = await executeConfirmedLaunch({
    repo,
    jobId: recoveredView.jobId,
    grantSource: "test_fake_transport",
    executionIntent: EXECUTION_GRANT_INTENT,
    fetchImpl: recoveredFetch
  });
  const recoveredStatuses = nodeStatuses(recovered);
  const recoveredReadback = latestSkill(recovered, "readback-std-project");
  assertOneCreateOneReadback(recoveredFetch);
  assert(recoveredStatuses.std_project_create_executor === "failed", "anomalous create node should preserve failed response");
  assert(recoveredStatuses.readback_closer === "passed", "readback hit should pass node 7");
  assert(recovered.headline.status === "created", "readback hit should close job as created");
  assert(recovered.readback?.status === "readback_verified", "recovered readback should be verified");
  assert(recoveredReadback.outputSummary?.recoveredByReadback === true, "readback should mark recoveredByReadback");
  assertNoSensitiveLeak(recovered);

  const missView = await createTestJob("execution-grant-smoke:create-40000-readback-miss");
  const missFetch = fakeFetchFactory({
    projectId: "999900005",
    createApiCode: "40000",
    createObjectIdPresent: false,
    listMatch: false
  });
  const missed = await executeConfirmedLaunch({
    repo,
    jobId: missView.jobId,
    grantSource: "test_fake_transport",
    executionIntent: EXECUTION_GRANT_INTENT,
    fetchImpl: missFetch
  });
  const missedStatuses = nodeStatuses(missed);
  assertOneCreateOneReadback(missFetch);
  assert(missedStatuses.std_project_create_executor === "failed", "missed create node should fail");
  assert(missedStatuses.readback_closer === "failed", "readback miss should fail node 7");
  assert(missed.headline.status === "failed_waiting_manual_review", "readback miss should stop for manual review");
  const missedSecond = await executeConfirmedLaunch({
    repo,
    jobId: missView.jobId,
    grantSource: "test_fake_transport",
    executionIntent: EXECUTION_GRANT_INTENT,
    fetchImpl: fakeFetchFactory({ projectId: "999900006" })
  });
  assert(nodeStatuses(missedSecond).std_project_create_executor === "blocked", "failed job second grant should be blocked");
  assert(missedSecond.executionGrant.createCalled === false, "failed job second grant should not create");
  assertNoSensitiveLeak(missed);

  const preGateView = await createTestJob("execution-grant-smoke:pre-create-blocked");
  const preGateFetch = fakeFetchFactory({ projectId: "999900007" });
  const preGate = await runJob(repo, preGateView.jobId, {
    mode: "execute_once",
    mockReady: true,
    allowNetworkWrite: false,
    confirmationIntent: STD_PROJECT_CREATE_CONFIRM_VALUE,
    confirmVariableValue: STD_PROJECT_CREATE_CONFIRM_VALUE,
    grantSource: "test_fake_transport",
    fetchImpl: preGateFetch
  });
  assert(callCount(preGateFetch, "/std_project/create/") === 0, "pre-create gate should not call create");
  assert(callCount(preGateFetch, "/std_project/list/") === 0, "pre-create gate should not call readback");
  assert(nodeStatuses(preGate).std_project_create_executor === "blocked", "pre-create gate should block node 6");

  const second = await executeConfirmedLaunch({
    repo,
    jobId: successView.jobId,
    grantSource: "test_fake_transport",
    executionIntent: EXECUTION_GRANT_INTENT,
    fetchImpl: fakeFetchFactory({ projectId: "999900003" })
  });
  const secondCreate = nodeStatuses(second).std_project_create_executor;
  assert(secondCreate === "blocked", "second create attempt should be blocked");
  assert(second.executionGrant.createCalled === false, "second grant should not create");

  console.log(JSON.stringify({
    status: "passed",
    invalidGrantBlocked: true,
    successJobId: successView.jobId,
    recoveredJobId: recoveredView.jobId,
    missedJobId: missView.jobId,
    fakeCreateCalls: callCount(successFetch, "/std_project/create/"),
    fakeReadbackCalls: callCount(successFetch, "/std_project/list/"),
    anomalyRecovered: true,
    anomalyMissStopped: true,
    invalidShapePreflightBlocked: true,
    preCreateGateBlockedWithoutCalls: true,
    node6Status: statuses.std_project_create_executor,
    node7Status: statuses.readback_closer,
    retryBlocked: true,
    realPlatformCalled: false,
    cleanupPlanned: createdJobIds.length
  }, null, 2));
} finally {
  for (const jobId of createdJobIds.reverse()) {
    await repo.deleteTestJobCascade(jobId);
  }
}
