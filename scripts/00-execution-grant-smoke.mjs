import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createJob, getJobView, runJob } from "../src/workflows/launchWorkflow.mjs";
import { STD_PROJECT_CREATE_CONFIRM_VALUE } from "../src/platforms/oceanengineStdProjectCreateExecutor.mjs";
import { evaluateStdProjectCreatePreflight } from "../src/workflows/skills/oe3/05-create-preflight-diagnostics.mjs";
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
  listMatch = true,
  createMessage = ""
}) {
  const calls = [];
  async function fakeFetch(url, options = {}) {
    const href = String(url);
    const bodyText = String(options.body || "");
    calls.push({
      href,
      method: options.method || "GET",
      ...(href.includes("/std_project/create/") ? {
        instanceIdJsonNumberTokenPresent: /"instance_id":7434750138926546994/.test(bodyText),
        instanceIdQuotedStringPresent: /"instance_id":"7434750138926546994"/.test(bodyText),
        instanceIdScientificNotationPresent: /7\.434750138926547e\+18/i.test(bodyText)
      } : {})
    });
    if (href.includes("/std_project/create/")) {
      return new Response(JSON.stringify({
        code: createApiCode,
        request_id: "fake-request-create",
        ...(createMessage ? { message: createMessage } : {}),
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
const tempDirs = [];

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

async function createReadyTestJob(sourceRecordRef) {
  const view = await createTestJob(sourceRecordRef);
  await runJob(repo, view.jobId, { mode: "dry_run", mockReady: true });
  return getBundleView(view.jobId);
}

async function getBundleView(jobId) {
  const bundle = await repo.getLaunchJobBundle(jobId);
  return {
    jobId,
    draftId: bundle.draft?.draft_id || "",
    payloadHash: bundle.draft?.payload_hash || ""
  };
}

async function writeProjectStateForScope({ jobId, draftId, payloadHash, enabled = true, overrides = {} }) {
  const dir = await mkdtemp(join(tmpdir(), "mwbv2-execution-grant-"));
  tempDirs.push(dir);
  const projectStatePath = join(dir, "project.state.json");
  const state = {
    guardrails: {
      platform_write_allowed: enabled,
      platform_write_scope: {
        mode: "single_oceanengine_std_project_create",
        target_job_id: jobId,
        target_draft_id: draftId,
        target_payload_hash: payloadHash,
        allowed_actions: ["oceanengine_std_project_create"],
        maximum_actions: 1,
        retry_allowed: false,
        ...overrides
      }
    }
  };
  await writeFile(projectStatePath, `${JSON.stringify(state, null, 2)}\n`);
  return projectStatePath;
}

async function readProjectState(projectStatePath) {
  return JSON.parse(await readFile(projectStatePath, "utf8"));
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
      advertiser_id: "1871922175825993",
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
  assert(invalidShapePreflight.blocker_codes.includes("advertiser_id_not_safe_integer_for_platform_payload"), "preflight should detect advertiser_id transport type");
  assert(invalidShapePreflight.blocker_codes.includes("invalid_integer_array:audience.retargeting_tags_exclude"), "preflight should detect DMP integer array shape");
  assertNoSensitiveLeak(invalidShapePreflight);

  const unsafeAdvertiserManifestPreflight = evaluateStdProjectCreatePreflight({
    requestFieldManifest: {
      requiredFieldsPresent: true,
      blockers: [],
      advertiserIdStorageType: "string",
      advertiserIdTransportType: "number",
      advertiserIdTransportSafe: false
    },
    payloadContractStatus: "passed"
  });
  assert(unsafeAdvertiserManifestPreflight.status === "blocked", "unsafe advertiser_id manifest should be blocked");
  assert(
    unsafeAdvertiserManifestPreflight.blocker_codes.includes("advertiser_id_not_safe_integer_for_platform_payload"),
    "manifest preflight should detect unsafe advertiser_id transport"
  );
  assertNoSensitiveLeak(unsafeAdvertiserManifestPreflight);

  const invalid = await createReadyTestJob("execution-grant-smoke:invalid");
  const invalidState = await writeProjectStateForScope(invalid);
  const blocked = await executeConfirmedLaunch({
    repo,
    jobId: invalid.jobId,
    grantSource: "test_fake_transport",
    executionIntent: "",
    fetchImpl: fakeFetchFactory({ projectId: "999900001" }),
    projectStatePath: invalidState
  });
  assert(blocked.executionGrant.status === "blocked", "invalid grant should block");
  assert(blocked.executionGrant.createCalled === false, "invalid grant should not create");

  const missingScopeView = await createReadyTestJob("execution-grant-smoke:missing-scope");
  const missingScopeState = await writeProjectStateForScope({ ...missingScopeView, enabled: false });
  const missingScope = await executeConfirmedLaunch({
    repo,
    jobId: missingScopeView.jobId,
    grantSource: "test_fake_transport",
    executionIntent: EXECUTION_GRANT_INTENT,
    fetchImpl: fakeFetchFactory({ projectId: "999900001" }),
    projectStatePath: missingScopeState
  });
  assert(missingScope.executionGrant.status === "blocked", "missing scope should block");
  assert(missingScope.executionGrant.blockers.includes("platform_write_scope_not_enabled"), "missing scope blocker not reported");
  assert(missingScope.executionGrant.createCalled === false, "missing scope should not create");

  const wrongHashView = await createReadyTestJob("execution-grant-smoke:wrong-hash");
  const wrongHashState = await writeProjectStateForScope({ ...wrongHashView, payloadHash: "sha256:wrong" });
  const wrongHash = await executeConfirmedLaunch({
    repo,
    jobId: wrongHashView.jobId,
    grantSource: "test_fake_transport",
    executionIntent: EXECUTION_GRANT_INTENT,
    fetchImpl: fakeFetchFactory({ projectId: "999900001" }),
    projectStatePath: wrongHashState
  });
  assert(wrongHash.executionGrant.status === "blocked", "wrong payload hash should block");
  assert(wrongHash.executionGrant.blockers.includes("platform_write_scope_payload_hash_mismatch"), "wrong hash blocker not reported");
  assert(wrongHash.executionGrant.createCalled === false, "wrong payload hash should not create");

  const successView = await createReadyTestJob("execution-grant-smoke:create-ok-readback-hit");
  const successState = await writeProjectStateForScope(successView);
  const grantedView = await getJobView(repo, successView.jobId, { projectStatePath: successState });
  assert(grantedView.primaryAction?.kind === "execute_once", "valid grant should expose execute-once action");
  assert(grantedView.primaryAction?.enabled === true, "valid grant execute-once action should be enabled");
  const successFetch = fakeFetchFactory({ projectId: "999900002" });
  const result = await executeConfirmedLaunch({
    repo,
    jobId: successView.jobId,
    grantSource: "test_fake_transport",
    executionIntent: EXECUTION_GRANT_INTENT,
    fetchImpl: successFetch,
    projectStatePath: successState
  });
  const statuses = nodeStatuses(result);
  if (!successFetch.calls.some((call) => call.href.includes("/std_project/create/"))) {
    debugCreateBlock("fake_create_not_called", result, successFetch);
  }
  assertOneCreateOneReadback(successFetch);
  const successCreateCall = successFetch.calls.find((call) => call.href.includes("/std_project/create/")) || {};
  assert(successCreateCall.instanceIdJsonNumberTokenPresent === true, "create body should contain unquoted lossless instance_id token");
  assert(successCreateCall.instanceIdQuotedStringPresent === false, "create body must not quote instance_id");
  assert(successCreateCall.instanceIdScientificNotationPresent === false, "create body must not use scientific notation for instance_id");
  assert(statuses.launch_intake === "passed", "node 1 should pass");
  assert(statuses.creation_context === "passed", "node 2 should pass");
  assert(statuses.game_launch_pack === "passed", "node 3 should pass");
  assert(statuses.account_resource_prepare === "passed", "node 4 should pass");
  assert(statuses.std_project_draft_builder === "needs_confirmation", "node 5 should need confirmation");
  assert(statuses.std_project_create_executor === "passed", "node 6 should pass");
  assert(statuses.readback_closer === "passed", "node 7 should pass");

  const concurrentView = await createReadyTestJob("execution-grant-smoke:atomic-claim");
  const concurrentState = await writeProjectStateForScope(concurrentView);
  const concurrentFetch = fakeFetchFactory({ projectId: "999900008" });
  const concurrentResults = await Promise.all([
    executeConfirmedLaunch({
      repo,
      jobId: concurrentView.jobId,
      grantSource: "test_fake_transport",
      executionIntent: EXECUTION_GRANT_INTENT,
      fetchImpl: concurrentFetch,
      projectStatePath: concurrentState
    }),
    executeConfirmedLaunch({
      repo,
      jobId: concurrentView.jobId,
      grantSource: "test_fake_transport",
      executionIntent: EXECUTION_GRANT_INTENT,
      fetchImpl: concurrentFetch,
      projectStatePath: concurrentState
    })
  ]);
  assertOneCreateOneReadback(concurrentFetch);
  assert(concurrentResults.filter((view) => view.executionGrant?.createCalled === true).length === 1, "atomic claim must allow one create caller");
  assert(result.headline.status === "created", "job should be created after fake readback");
  assert(result.executionGrant.createCalled === true, "execution grant should report createCalled");
  assert(result.readback?.status === "readback_verified", "readback should be verified");
  const successStateAfter = await readProjectState(successState);
  assert(successStateAfter.guardrails.platform_write_allowed === false, "scope should be revoked after create");
  assert(successStateAfter.guardrails.platform_write_scope.maximum_actions === 0, "scope maximum actions should be reset");
  assertNoSensitiveLeak(result);

  const recoveredView = await createReadyTestJob("execution-grant-smoke:create-40000-readback-hit");
  const recoveredState = await writeProjectStateForScope(recoveredView);
  const recoveredFetch = fakeFetchFactory({
    projectId: "999900004",
    createApiCode: "40000",
    createObjectIdPresent: false,
    listMatch: true,
    createMessage: "invalid parameter: project_materials.external_url_material_list"
  });
  const recovered = await executeConfirmedLaunch({
    repo,
    jobId: recoveredView.jobId,
    grantSource: "test_fake_transport",
    executionIntent: EXECUTION_GRANT_INTENT,
    fetchImpl: recoveredFetch,
    projectStatePath: recoveredState
  });
  const recoveredStatuses = nodeStatuses(recovered);
  const recoveredReadback = latestSkill(recovered, "readback-std-project");
  assertOneCreateOneReadback(recoveredFetch);
  assert(recoveredStatuses.std_project_create_executor === "failed", "anomalous create node should preserve failed response");
  assert(recoveredStatuses.readback_closer === "passed", "readback hit should pass node 7");
  assert(recovered.headline.status === "created", "readback hit should close job as created");
  assert(recovered.readback?.status === "readback_verified", "recovered readback should be verified");
  assert(recoveredReadback.outputSummary?.recoveredByReadback === true, "readback should mark recoveredByReadback");
  const recoveredAudit = await repo.getLaunchJobBundle(recoveredView.jobId);
  assert(recoveredAudit.platformAction?.request_id_recorded === true, "request_id should be retained only in internal action audit");
  assert(recoveredAudit.platformAction?.error_category === "landing_url_invalid", "field error should have a safe landing URL category");
  assert(recoveredAudit.platformAction?.offending_field_path === "project_materials.external_url_material_list", "field error should retain only the allowed field path");
  assert(!JSON.stringify(recoveredAudit.platformAction || {}).includes("invalid parameter"), "platform error text must not be persisted in public job data");
  assertNoSensitiveLeak(recovered);

  const missView = await createReadyTestJob("execution-grant-smoke:create-40000-readback-miss");
  const missState = await writeProjectStateForScope(missView);
  const missFetch = fakeFetchFactory({
    projectId: "999900005",
    createApiCode: "40000",
    createObjectIdPresent: false,
    listMatch: false,
    createMessage: "permission denied for requested operation"
  });
  const missed = await executeConfirmedLaunch({
    repo,
    jobId: missView.jobId,
    grantSource: "test_fake_transport",
    executionIntent: EXECUTION_GRANT_INTENT,
    fetchImpl: missFetch,
    projectStatePath: missState
  });
  const missedStatuses = nodeStatuses(missed);
  assertOneCreateOneReadback(missFetch);
  assert(missedStatuses.std_project_create_executor === "failed", "missed create node should fail");
  assert(missedStatuses.readback_closer === "failed", "readback miss should fail node 7");
  assert(missed.headline.status === "failed_waiting_manual_review", "readback miss should stop for manual review");
  const missedAudit = await repo.getLaunchJobBundle(missView.jobId);
  assert(missedAudit.platformAction?.error_category === "permission_denied", "permission response should have a safe category");
  assert(missedAudit.platformAction?.offending_field_path === "", "permission response must not invent a field path");
  const missedSecond = await executeConfirmedLaunch({
    repo,
    jobId: missView.jobId,
    grantSource: "test_fake_transport",
    executionIntent: EXECUTION_GRANT_INTENT,
    fetchImpl: fakeFetchFactory({ projectId: "999900006" }),
    projectStatePath: missState
  });
  assert(missedSecond.executionGrant.status === "blocked", "failed job second grant should be blocked");
  assert(missedSecond.executionGrant.createCalled === false, "failed job second grant should not create");
  assertNoSensitiveLeak(missed);

  const unknownView = await createReadyTestJob("execution-grant-smoke:create-40000-unclassified");
  const unknownState = await writeProjectStateForScope(unknownView);
  const unknown = await executeConfirmedLaunch({
    repo,
    jobId: unknownView.jobId,
    grantSource: "test_fake_transport",
    executionIntent: EXECUTION_GRANT_INTENT,
    fetchImpl: fakeFetchFactory({
      projectId: "999900009",
      createApiCode: "40000",
      createObjectIdPresent: false,
      listMatch: false,
      createMessage: "opaque platform condition"
    }),
    projectStatePath: unknownState
  });
  const unknownAudit = await repo.getLaunchJobBundle(unknownView.jobId);
  assert(unknownAudit.platformAction?.error_category === "unclassified", "unknown response should be classified without retaining text");
  assert(unknownAudit.platformAction?.offending_field_path === "", "unknown response must not retain a field path");
  assert(!JSON.stringify(unknownAudit.platformAction || {}).includes("opaque platform condition"), "unknown platform text must not be persisted");
  assertNoSensitiveLeak(unknown);

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
    fetchImpl: fakeFetchFactory({ projectId: "999900003" }),
    projectStatePath: successState
  });
  assert(second.executionGrant.status === "blocked", "second create attempt should be blocked");
  assert(second.executionGrant.createCalled === false, "second grant should not create");

  console.log(JSON.stringify({
    status: "passed",
    invalidGrantBlocked: true,
    missingScopeBlocked: true,
    wrongHashBlocked: true,
    successJobId: successView.jobId,
    recoveredJobId: recoveredView.jobId,
    missedJobId: missView.jobId,
    fakeCreateCalls: callCount(successFetch, "/std_project/create/"),
    fakeReadbackCalls: callCount(successFetch, "/std_project/list/"),
    anomalyRecovered: true,
    anomalyMissStopped: true,
    invalidShapePreflightBlocked: true,
    atomicClaimAllowedOneCreate: true,
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
  for (const dir of tempDirs.reverse()) {
    await rm(dir, { recursive: true, force: true });
  }
}
