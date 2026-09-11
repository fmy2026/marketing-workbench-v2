import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import { createJob, runJob } from "../src/workflows/launchWorkflow.mjs";
import {
  EXECUTION_GRANT_INTENT,
  executeConfirmedLaunch
} from "../src/workflows/executeConfirmedLaunch.mjs";

const TARGET = {
  routeId: "oceanengine_3_byte_mini_game",
  gameCode: "JSZC",
  advertiserId: "1871922175825993"
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function fakeFetchFactory({ projectId, createApiCode = "0", createObjectIdPresent = true } = {}) {
  const calls = [];
  async function fakeFetch(url, options = {}) {
    const href = String(url);
    calls.push({ href, method: options.method || "GET" });
    if (href.includes("/std_project/create/")) {
      return new Response(JSON.stringify({
        code: createApiCode,
        request_id: "fake-request-create",
        message: createApiCode === "0" ? "success" : "opaque platform condition",
        data: createObjectIdPresent ? { project_id: projectId } : {}
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (href.includes("/std_project/list/")) {
      const filtering = new URL(href).searchParams.get("filtering") || "{}";
      const name = JSON.parse(filtering).name || "";
      return new Response(JSON.stringify({
        code: "0",
        request_id: "fake-request-list",
        data: { list: [{ project_id: projectId, name, status: "ENABLE" }] }
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error(`unexpected_fake_fetch_url:${href}`);
  }
  fakeFetch.calls = calls;
  return fakeFetch;
}

function callCount(fakeFetch, fragment) {
  return fakeFetch.calls.filter((call) => call.href.includes(fragment)).length;
}

const repo = new PostgresRepository();
const jobIds = [];
const tempDirs = [];
const runRef = `case-corrective-create-smoke:${Date.now()}`;

async function createReadyJob({ caseId = "", attemptNo, deriveAttemptNo = false }) {
  const created = await createJob(repo, {
    user_intent: `${TARGET.routeId} ${TARGET.gameCode} ${TARGET.advertiserId}`,
    route_id: TARGET.routeId,
    game_code: TARGET.gameCode,
    advertiser_id: TARGET.advertiserId,
    source_usage: "test_run",
    source_record_ref: `${runRef}:attempt-${attemptNo}`,
    ...(caseId ? { case_id: caseId } : {})
  });
  jobIds.push(created.jobId);
  const runOptions = {
    mode: "dry_run",
    mockReady: true,
    maximumCreateAttempts: 3
  };
  if (!deriveAttemptNo) runOptions.createAttemptNo = attemptNo;
  await runJob(repo, created.jobId, runOptions);
  const bundle = await repo.getLaunchJobBundle(created.jobId);
  assert(bundle.executionPlan?.plan_status === "ready", `attempt_${attemptNo}_plan_not_ready`);
  assert(Number(bundle.executionPlan?.metadata?.create_attempt_no) === attemptNo, `attempt_${attemptNo}_binding_missing`);
  return {
    jobId: created.jobId,
    caseId: bundle.job.case_id,
    draftId: bundle.draft?.draft_id || "",
    payloadHash: bundle.draft?.payload_hash || ""
  };
}

async function writePlanBoundState(job) {
  const dir = await mkdtemp(join(tmpdir(), "mwbv2-case-corrective-create-"));
  tempDirs.push(dir);
  const path = join(dir, "project.state.json");
  await writeFile(path, `${JSON.stringify({
    guardrails: {
      platform_write_allowed: true,
      platform_write_scope: {
        mode: "test_plan_bound_confirmation",
        target_job_id: job.jobId,
        target_draft_id: job.draftId,
        target_payload_hash: job.payloadHash,
        allowed_actions: ["oceanengine_std_project_create"],
        maximum_actions: 1,
        retry_allowed: false
      }
    }
  }, null, 2)}\n`);
  return path;
}

try {
  const first = await createReadyJob({ attemptNo: 1, deriveAttemptNo: true });
  const firstState = await writePlanBoundState(first);
  const firstFetch = fakeFetchFactory({
    projectId: "999901001",
    createApiCode: "40000",
    createObjectIdPresent: false
  });
  const firstResult = await executeConfirmedLaunch({
    repo,
    jobId: first.jobId,
    grantSource: "test_fake_transport",
    executionIntent: EXECUTION_GRANT_INTENT,
    fetchImpl: firstFetch,
    projectStatePath: firstState
  });
  assert(callCount(firstFetch, "/std_project/create/") === 1, "attempt_1_create_call_count_invalid");
  assert(firstResult.executionGrant.createCalled === true, "attempt_1_create_not_recorded");
  const failedAttemptBundle = await repo.getLaunchJobBundle(first.jobId);
  assert(failedAttemptBundle.platformAction?.request_id_present === true, "formatted_request_id_presence_not_persisted");
  assert(failedAttemptBundle.platformAction?.request_id_recorded === false, "request_id_value_must_not_be_persisted");
  assert(
    failedAttemptBundle.platformAction?.error_summary === "platform_rejected_without_safe_detail",
    "safe_error_summary_not_persisted"
  );
  assert(!JSON.stringify(failedAttemptBundle.platformAction || {}).includes("opaque platform condition"), "raw_platform_error_persisted");

  const mismatched = await createJob(repo, {
    user_intent: `${TARGET.routeId} ${TARGET.gameCode} ${TARGET.advertiserId}`,
    route_id: TARGET.routeId,
    game_code: TARGET.gameCode,
    advertiser_id: TARGET.advertiserId,
    case_id: first.caseId,
    source_usage: "test_run",
    source_record_ref: `${runRef}:attempt-mismatch`
  });
  jobIds.push(mismatched.jobId);
  let mismatchError = null;
  try {
    await runJob(repo, mismatched.jobId, {
      mode: "dry_run",
      mockReady: true,
      createAttemptNo: 1,
      maximumCreateAttempts: 3
    });
  } catch (error) {
    mismatchError = error;
  }
  assert(mismatchError?.message === "create_attempt_no_mismatch", "explicit_attempt_mismatch_must_fail_closed");
  const mismatchedBundle = await repo.getLaunchJobBundle(mismatched.jobId);
  assert(!mismatchedBundle.draft, "attempt_mismatch_must_not_persist_draft");
  assert(!mismatchedBundle.executionPlan, "attempt_mismatch_must_not_persist_plan");
  assert(!mismatchedBundle.platformAction, "attempt_mismatch_must_not_persist_platform_action");

  const second = await createReadyJob({ caseId: first.caseId, attemptNo: 2, deriveAttemptNo: true });
  const secondState = await writePlanBoundState(second);
  const secondFetch = fakeFetchFactory({
    projectId: "999901002",
  });
  const secondResult = await executeConfirmedLaunch({
    repo,
    jobId: second.jobId,
    grantSource: "test_fake_transport",
    executionIntent: EXECUTION_GRANT_INTENT,
    fetchImpl: secondFetch,
    projectStatePath: secondState
  });
  assert(callCount(secondFetch, "/std_project/create/") === 1, "attempt_2_create_call_count_invalid");
  assert(callCount(secondFetch, "/std_project/list/") === 1, "attempt_2_readback_call_count_invalid");
  assert(callCount(secondFetch, "/oc_project/material/get/") === 0, "attempt_2_must_not_call_material_readback");
  assert(secondResult.executionGrant.createCalled === true, "attempt_2_create_not_recorded");
  assert(secondResult.headline.status === "created", "attempt_2_not_verified");

  const caseState = await repo.getCaseCreateAttemptState(first.caseId);
  assert(Number(caseState.createActionCount) === 2, "case_create_action_count_invalid");
  assert(Number(caseState.createdObjectCount) === 1, "case_created_object_count_invalid");
  assert(Number(caseState.readbackVerifiedCount) === 1, "case_readback_verified_count_invalid");

  await repo.updateWorkflowCaseLifecycle({
    caseId: first.caseId,
    lifecycleStatus: "active",
    metadataPatch: { test_reopened_for_case_object_guard: true }
  });
  const third = await createReadyJob({ caseId: first.caseId, attemptNo: 3 });
  const thirdState = await writePlanBoundState(third);
  const thirdFetch = fakeFetchFactory({ projectId: "999901003" });
  const thirdResult = await executeConfirmedLaunch({
    repo,
    jobId: third.jobId,
    grantSource: "test_fake_transport",
    executionIntent: EXECUTION_GRANT_INTENT,
    fetchImpl: thirdFetch,
    projectStatePath: thirdState
  });
  assert(callCount(thirdFetch, "/std_project/create/") === 0, "case_object_guard_allowed_create");
  assert(thirdResult.executionGrant.createCalled === false, "case_object_guard_did_not_stop_before_create");
  assert(
    thirdResult.executionGrant.blockers.includes("case_created_object_already_recorded"),
    "case_created_object_blocker_missing"
  );

  console.log(JSON.stringify({
    status: "passed",
    ordinaryCaseAttempt2CreateCalls: callCount(secondFetch, "/std_project/create/"),
    ordinaryCaseAttempt2ReadbackCalls: callCount(secondFetch, "/std_project/list/"),
    caseCreateActionCount: Number(caseState.createActionCount),
    caseCreatedObjectCount: Number(caseState.createdObjectCount),
    caseReadbackVerifiedCount: Number(caseState.readbackVerifiedCount),
    requestIdPresencePersisted: failedAttemptBundle.platformAction?.request_id_present === true,
    rawPlatformErrorPersisted: false,
    createAfterVerifiedObjectCalls: callCount(thirdFetch, "/std_project/create/"),
    realPlatformWrites: 0
  }, null, 2));
} finally {
  for (const jobId of jobIds.reverse()) await repo.deleteTestJobCascade(jobId);
  for (const dir of tempDirs.reverse()) await rm(dir, { recursive: true, force: true });
}
