import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createJob, getJobView, runJob } from "../src/workflows/launchWorkflow.mjs";
import { STD_PROJECT_CREATE_CONFIRM_VALUE } from "../src/platforms/oceanengineStdProjectCreateExecutor.mjs";
import { evaluateStdProjectCreatePreflight } from "../src/workflows/skills/oe3/05-create-preflight-diagnostics.mjs";
import { compileAndSaveExecutionPlan } from "../src/workflows/executionPlan.mjs";
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
  listProjectId = projectId,
  createApiCode = "0",
  createObjectIdPresent = true,
  listMatch = true,
  createMessage = "",
  createTransportThrows = false,
  numericProjectIdTokens = false
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
      if (createTransportThrows) throw new Error("synthetic_create_transport_error");
      if (numericProjectIdTokens && createObjectIdPresent) {
        return new Response(`{"code":${JSON.stringify(createApiCode)},"request_id":"fake-request-create","data":{"project_id":${String(projectId)}}}`,
          { status: 200, headers: { "content-type": "application/json" } });
      }
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
      if (numericProjectIdTokens && listMatch) {
        return new Response(`{"code":"0","request_id":"fake-request-list","data":{"list":[{"project_id":${String(listProjectId)},"name":${JSON.stringify(name)},"status":"ENABLE"}]}}`,
          { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({
        code: "0",
        request_id: "fake-request-list",
        data: {
          list: listMatch ? [
            { project_id: listProjectId, name, status: "ENABLE" }
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
const testRunRef = `run-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;

async function createTestJob(sourceRecordRef, { caseId = "" } = {}) {
  const view = await createJob(repo, {
    user_intent: "oceanengine_3_byte_mini_game JSZC 1871922175825993",
    route_id: "oceanengine_3_byte_mini_game",
    game_code: "JSZC",
    advertiser_id: "1871922175825993",
    source_usage: "test_run",
    source_record_ref: `${sourceRecordRef}:${testRunRef}`,
    ...(caseId ? { case_id: caseId } : {})
  });
  createdJobIds.push(view.jobId);
  return view;
}

async function createReadyTestJob(sourceRecordRef, { caseId = "", workflowOptions = {} } = {}) {
  const view = await createTestJob(sourceRecordRef, { caseId });
  await runJob(repo, view.jobId, { mode: "dry_run", mockReady: true, ...workflowOptions });
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

  const longProjectId = "7679693367995088902";
  const losslessView = await createReadyTestJob("execution-grant-smoke:lossless-numeric-project-id");
  const losslessState = await writeProjectStateForScope(losslessView);
  const losslessFetch = fakeFetchFactory({ projectId: longProjectId, numericProjectIdTokens: true });
  const losslessResult = await executeConfirmedLaunch({
    repo,
    jobId: losslessView.jobId,
    grantSource: "test_fake_transport",
    executionIntent: EXECUTION_GRANT_INTENT,
    fetchImpl: losslessFetch,
    projectStatePath: losslessState
  });
  assertOneCreateOneReadback(losslessFetch);
  assert(losslessResult.readback?.status === "readback_verified", "numeric long project ID should pass Node 7");
  const losslessBundle = await repo.getLaunchJobBundle(losslessView.jobId);
  assert(losslessBundle.createdObject?.object_id === longProjectId, "created_objects must retain exact numeric response project ID as string");
  assert(losslessBundle.readback?.object_id === longProjectId, "readback_records must retain exact numeric response project ID as string");

  const mismatchView = await createReadyTestJob("execution-grant-smoke:project-id-mismatch-stops");
  const mismatchState = await writeProjectStateForScope(mismatchView);
  const mismatchFetch = fakeFetchFactory({
    projectId: longProjectId,
    listProjectId: "7679693367995088903",
    numericProjectIdTokens: true
  });
  const mismatchResult = await executeConfirmedLaunch({
    repo,
    jobId: mismatchView.jobId,
    grantSource: "test_fake_transport",
    executionIntent: EXECUTION_GRANT_INTENT,
    fetchImpl: mismatchFetch,
    projectStatePath: mismatchState
  });
  assertOneCreateOneReadback(mismatchFetch);
  const mismatchReadbackSkill = latestSkill(mismatchResult, "readback-std-project");
  assert(mismatchReadbackSkill.blockers?.includes("readback_project_id_mismatch"), "Node 7 must expose project ID mismatch blocker");
  assert(mismatchResult.readback?.status === "project_id_mismatch", "Node 7 must not verify a mismatched project ID");
  assert(mismatchResult.executionGrant.createCalled === true, "mismatch must preserve the one create call");

  const reconciliationLegacyId = "7679693367995089000";
  const reconciliationView = await createReadyTestJob("execution-grant-smoke:lossless-id-db-reconciliation");
  const reconciliationState = await writeProjectStateForScope(reconciliationView);
  const reconciliationFetch = fakeFetchFactory({ projectId: reconciliationLegacyId });
  const reconciliationCreated = await executeConfirmedLaunch({
    repo,
    jobId: reconciliationView.jobId,
    grantSource: "test_fake_transport",
    executionIntent: EXECUTION_GRANT_INTENT,
    fetchImpl: reconciliationFetch,
    projectStatePath: reconciliationState
  });
  assert(reconciliationCreated.readback?.status === "readback_verified", "reconciliation fixture must create a verified legacy object");
  const reconciliationEvidenceRef = `EV-${reconciliationView.jobId}-LOSSLESS-ID-REPAIR`;
  await repo.upsertEvidence({
    artifactId: reconciliationEvidenceRef,
    jobId: reconciliationView.jobId,
    artifactType: "std_project_id_lossless_reconciliation",
    title: "std project ID lossless reconciliation smoke",
    summary: "fresh_readonly_exact_id_match=true raw_response_stored=false",
    contentHash: `sha256:${"1".repeat(64)}`,
    storageRef: "postgres:evidence_artifacts:redacted_summary_only",
    sourceRef: "test:std_project/list",
    sourceUsage: "test_run"
  });
  const reconciliationBefore = await repo.getLaunchJobAuditCounts(reconciliationView.jobId);
  const reconciliationBeforeBundle = await repo.getLaunchJobBundle(reconciliationView.jobId);
  const reconciliation = await repo.reconcileStdProjectObjectId({
    jobId: reconciliationView.jobId,
    legacyObjectId: reconciliationLegacyId,
    verifiedObjectId: longProjectId
  });
  const reconciliationAfter = await repo.getLaunchJobAuditCounts(reconciliationView.jobId);
  const reconciledBundle = await repo.getLaunchJobBundle(reconciliationView.jobId);
  assert(reconciliation.status === "reconciled", "lossless project ID reconciliation should complete");
  assert(reconciliation.object_id_matches_verified === true, "created object primary ID must be corrected");
  assert(reconciliation.readback_id_matches_verified === true, "readback project ID must be corrected");
  assert(reconciledBundle.createdObject?.object_id === longProjectId, "reconciliation must correct created_objects.object_id");
  assert(reconciledBundle.readback?.object_id === longProjectId, "reconciliation must correct readback_records.object_id");
  assert(reconciledBundle.createdObject?.evidence_ref === reconciliationBeforeBundle.createdObject?.evidence_ref, "reconciliation must preserve created object evidence reference");
  assert(reconciledBundle.readback?.evidence_ref === reconciliationBeforeBundle.readback?.evidence_ref, "reconciliation must preserve readback evidence reference");
  ["launchConfirmations", "platformActions", "createdObjects", "readbackRecords"].forEach((key) => {
    assert(reconciliationAfter[key] === reconciliationBefore[key], `reconciliation must preserve ${key} count`);
  });

  const boundView = await createReadyTestJob("execution-grant-smoke:single-variable-plan-binding");
  const boundExperiment = {
    status: "passed",
    baselineJobId: "JOB-BASELINE-P02-SMOKE",
    baselinePayloadHash: `sha256:${"1".repeat(64)}`,
    freshPayloadHash: boundView.payloadHash,
    candidatePath: "audience.filter_event",
    candidateDirection: "single_item_to_omitted",
    diffHash: `sha256:${"2".repeat(64)}`,
    allowedChangedPaths: ["name", "audience.filter_event", "audience.filter_event.[]"],
    changedPaths: ["name", "audience.filter_event", "audience.filter_event.[]"]
  };
  const boundCompiled = await compileAndSaveExecutionPlan({
    repo,
    jobId: boundView.jobId,
    singleVariableExperiment: boundExperiment
  });
  const boundState = await writeProjectStateForScope({
    ...boundView,
    overrides: {
      target_plan_id: boundCompiled.plan.planId,
      target_plan_hash: boundCompiled.plan.planHash,
      allowed_plan_actions: ["std_project_create"]
    }
  });
  const boundFetch = fakeFetchFactory({ projectId: "999900013" });
  const boundResult = await executeConfirmedLaunch({
    repo,
    jobId: boundView.jobId,
    grantSource: "test_fake_transport",
    executionIntent: EXECUTION_GRANT_INTENT,
    fetchImpl: boundFetch,
    projectStatePath: boundState
  });
  assertOneCreateOneReadback(boundFetch);
  assert(boundResult.executionGrant.createCalled === true, "bound experiment should execute once");
  const boundAfter = await repo.getLatestLaunchExecutionPlan(boundView.jobId);
  assert(boundAfter?.plan_id === boundCompiled.plan.planId, "bound plan id drifted during execute_once");
  assert(boundAfter?.plan_hash === boundCompiled.plan.planHash, "bound plan hash drifted during execute_once");
  assert(boundAfter?.metadata?.single_variable_experiment?.validation_status === "passed", "bound experiment validation status was lost");
  assert(boundAfter?.metadata?.single_variable_experiment?.candidate_path === "audience.filter_event", "bound experiment candidate was lost");
  assert(boundAfter?.metadata?.single_variable_experiment?.diff_hash === boundExperiment.diffHash, "bound experiment diff hash was lost");

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
  assert(recoveredAudit.platformAction?.request_id_recorded === false, "complete request_id must not be retained in action audit");
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

  const transportView = await createReadyTestJob("execution-grant-smoke:create-transport-unconfirmed-readback-miss");
  const transportState = await writeProjectStateForScope(transportView);
  const transportFetch = fakeFetchFactory({
    projectId: "999900014",
    createTransportThrows: true,
    listMatch: false
  });
  const transportResult = await executeConfirmedLaunch({
    repo,
    jobId: transportView.jobId,
    grantSource: "test_fake_transport",
    executionIntent: EXECUTION_GRANT_INTENT,
    fetchImpl: transportFetch,
    projectStatePath: transportState
  });
  assertOneCreateOneReadback(transportFetch);
  const transportAudit = await repo.getLaunchJobBundle(transportView.jobId);
  assert(transportAudit.platformAction?.action_status === "failed_or_unconfirmed", "transport error action must be closed as unconfirmed");
  assert(transportAudit.platformAction?.api_code === "transport_error", "transport error API code missing");
  assert(transportAudit.platformAction?.request_id_recorded === false, "transport error must not retain request id");
  assert(transportResult.executionGrant.createCalled === true, "transport error must preserve that create was attempted");
  assert(transportResult.readback?.status === "not_found_after_create", "transport error must continue to readback");

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

  const verificationSeriesId = "TEST-OE3-CREATE-SERIES-20260829";
  const verificationTaskRef = "tasks/test-execution-grant-series.md";
  const seriesFirst = await createReadyTestJob("execution-grant-smoke:series-attempt-1", {
    workflowOptions: {
      createAttemptNo: 1,
      verificationSeriesId,
      verificationTaskRef,
      maximumCreateAttempts: 3
    }
  });
  const seriesCaseId = (await repo.getLaunchJobBundle(seriesFirst.jobId)).job.case_id;
  const seriesFirstState = await writeProjectStateForScope(seriesFirst);
  const seriesFirstFetch = fakeFetchFactory({
    projectId: "999900010",
    createApiCode: "40000",
    createObjectIdPresent: false,
    listMatch: false,
    createMessage: "opaque platform condition"
  });
  const seriesFirstResult = await executeConfirmedLaunch({
    repo,
    jobId: seriesFirst.jobId,
    grantSource: "test_fake_transport",
    executionIntent: EXECUTION_GRANT_INTENT,
    fetchImpl: seriesFirstFetch,
    projectStatePath: seriesFirstState
  });
  assertOneCreateOneReadback(seriesFirstFetch);
  assert(seriesFirstResult.executionGrant.createCalled === true, "series attempt 1 should make exactly one create call");

  const seriesSecond = await createReadyTestJob("execution-grant-smoke:series-attempt-2", {
    caseId: seriesCaseId,
    workflowOptions: {
      createAttemptNo: 2,
      verificationSeriesId,
      verificationTaskRef,
      maximumCreateAttempts: 3
    }
  });
  const seriesSecondState = await writeProjectStateForScope(seriesSecond);
  const seriesSecondFetch = fakeFetchFactory({ projectId: "999900011" });
  const seriesSecondResult = await executeConfirmedLaunch({
    repo,
    jobId: seriesSecond.jobId,
    grantSource: "test_fake_transport",
    executionIntent: EXECUTION_GRANT_INTENT,
    fetchImpl: seriesSecondFetch,
    projectStatePath: seriesSecondState
  });
  assertOneCreateOneReadback(seriesSecondFetch);
  assert(seriesSecondResult.headline.status === "created", "series attempt 2 readback should create the object");
  const seriesStateAfterSuccess = await repo.getCaseCreateVerificationSeriesState({
    caseId: seriesCaseId,
    verificationSeriesId,
    maximumCreateAttempts: 3
  });
  assert(Number(seriesStateAfterSuccess.createActionCount) === 2, "series should count actions across fresh jobs");
  assert(Number(seriesStateAfterSuccess.createdObjectCount) === 1, "series should retain its created object");
  assert(Number(seriesStateAfterSuccess.readbackVerifiedCount) === 1, "series should retain its verified readback");
  const fieldLedgerAttestation = await repo.attestCreateFieldLedger({
    jobId: seriesSecond.jobId,
    operator: "test_operator",
    allMatched: true
  });
  assert(fieldLedgerAttestation.status === "manual_console_verified", "field ledger should require explicit post-create attestation");
  assert(Number(fieldLedgerAttestation.checkedPathCount) > 0, "field ledger should contain checked paths");
  const attestedBundle = await repo.getLaunchJobBundle(seriesSecond.jobId);
  assert(
    attestedBundle.readback?.field_diff_summary?.create_field_ledger?.status === "manual_console_verified",
    "manual field ledger result should be stored on the existing readback record"
  );
  assert(attestedBundle.readback?.field_diff_summary?.raw_response_stored === false, "readback must attest that raw response was not stored");
  assert(!JSON.stringify(attestedBundle.readback?.field_diff_summary || {}).includes("fake-request-list"), "readback must not retain a complete request id");

  const seriesThird = await createReadyTestJob("execution-grant-smoke:series-attempt-3-blocked-after-success", {
    caseId: seriesCaseId,
    workflowOptions: {
      createAttemptNo: 3,
      verificationSeriesId,
      verificationTaskRef,
      maximumCreateAttempts: 3
    }
  });
  const seriesThirdState = await writeProjectStateForScope(seriesThird);
  const seriesThirdFetch = fakeFetchFactory({ projectId: "999900012" });
  const seriesThirdResult = await executeConfirmedLaunch({
    repo,
    jobId: seriesThird.jobId,
    grantSource: "test_fake_transport",
    executionIntent: EXECUTION_GRANT_INTENT,
    fetchImpl: seriesThirdFetch,
    projectStatePath: seriesThirdState
  });
  assert(seriesThirdResult.executionGrant.status === "blocked", "series must lock after any created object");
  assert(seriesThirdResult.executionGrant.blockers.includes("verification_series_created_object_already_recorded"), "series lock blocker should be explicit");
  assert(callCount(seriesThirdFetch, "/std_project/create/") === 0, "locked series must not call create again");

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
    verificationSeriesCountedAcrossFreshJobs: true,
    verificationSeriesLockedAfterSuccess: true,
    createFieldLedgerAttested: true,
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
