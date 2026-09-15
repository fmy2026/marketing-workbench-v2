import { PostgresRepository } from "../tests/support/repository.mjs";
import { createJob, createWorkflowCase, runJob } from "../src/workflows/launchWorkflow.mjs";

const TARGET = Object.freeze({
  routeId: "oceanengine_3_byte_mini_game",
  gameCode: "JSZC",
  advertiserId: "1871922175825993"
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const repo = new PostgresRepository();
const caseKey = `smoke.case-attempt-limit.${Date.now()}`;
const jobIds = [];

try {
  const workflowCase = await createWorkflowCase(repo, {
    case_key: caseKey,
    route_id: TARGET.routeId,
    game_code: TARGET.gameCode,
    advertiser_id: TARGET.advertiserId,
    business_goal: "Disposable Case-level attempt limit smoke.",
    source_usage: "test_run"
  });
  assert(Number(workflowCase.maximum_create_attempts) === 3, "ordinary_case_default_attempt_limit_invalid");
  const ordinaryJob = await createJob(repo, {
    route_id: TARGET.routeId,
    game_code: TARGET.gameCode,
    advertiser_id: TARGET.advertiserId,
    case_id: workflowCase.case_id,
    source_usage: "test_run",
    source_record_ref: `smoke:case-attempt-limit-default:${Date.now()}`
  });
  jobIds.push(ordinaryJob.jobId);

  // Test fixtures may explicitly exercise the tighter Case contract without
  // exposing an intake/API option that could weaken runtime Case policy.
  const oneAttemptCase = await repo.createWorkflowCase({
    caseId: `CASE-MWBV2-SMOKE-LIMIT-${Date.now()}`,
    caseKey: `smoke.case-attempt-limit-one.${Date.now()}`,
    routeId: TARGET.routeId,
    gameCode: TARGET.gameCode,
    advertiserId: TARGET.advertiserId,
    businessGoal: "Disposable one-attempt Case contract smoke.",
    sourceUsage: "test_run",
    maximumCreateAttempts: 1,
    metadata: { fixture: true }
  });
  const created = await createJob(repo, {
    route_id: TARGET.routeId,
    game_code: TARGET.gameCode,
    advertiser_id: TARGET.advertiserId,
    case_id: oneAttemptCase.case_id,
    source_usage: "test_run",
    source_record_ref: `smoke:case-attempt-limit:${Date.now()}`
  });
  jobIds.push(created.jobId);
  await runJob(repo, created.jobId, {
    mode: "dry_run",
    mockReady: true,
    // Deliberately disagree with the Case. The runner must use the Case
    // truth, not this caller value.
    maximumCreateAttempts: 3
  });
  const bundle = await repo.getLaunchJobBundle(created.jobId);
  const state = await repo.getCaseCreateAttemptState(oneAttemptCase.case_id);
  assert(Number(bundle.case?.maximum_create_attempts) === 1, "one_attempt_case_truth_missing");
  assert(Number(bundle.executionPlan?.metadata?.maximum_create_attempts) === 1, "plan_did_not_use_case_attempt_limit");
  assert(Number(state.maximumCreateAttempts) === 1, "repository_attempt_state_did_not_use_case_attempt_limit");

  const appendCase = await createWorkflowCase(repo, {
    case_key: `smoke.append-attempt-limit.${Date.now()}`,
    route_id: TARGET.routeId,
    game_code: TARGET.gameCode,
    advertiser_id: TARGET.advertiserId,
    operation: "append_project_videos",
    project_id: "7684895789612826666",
    origin_resource_ids: ["4iLE-2"],
    source_usage: "test_run"
  });
  const appendJobs = [];
  for (let attemptNo = 1; attemptNo <= 3; attemptNo += 1) {
    const appendJob = await createJob(repo, {
      route_id: TARGET.routeId, game_code: TARGET.gameCode, advertiser_id: TARGET.advertiserId,
      case_id: appendCase.case_id, source_usage: "test_run",
      source_record_ref: `smoke:append-attempt-limit:${attemptNo}:${Date.now()}`
    });
    appendJobs.push(appendJob.jobId);
    jobIds.push(appendJob.jobId);
    await repo.upsertPlatformAction({
      actionId: `ACTION-SMOKE-APPEND-${Date.now()}-${attemptNo}`, jobId: appendJob.jobId,
      actionType: "oc_project_video_append", actionStatus: "failed_or_unconfirmed", attemptNo,
      endpoint: "internal:smoke", method: "INTERNAL",
      idempotencyKey: `smoke-append-${attemptNo}`, requestHash: `sha256:append-${attemptNo}`,
      errorCategory: "unclassified", finishedAt: new Date(Date.now() - (attemptNo === 3 ? 0 : 30000)).toISOString(),
      metadata: { payload_persisted: false, response_persisted: false }
    });
  }
  const appendState = await repo.getCaseProjectVideoAppendAttemptState(appendCase.case_id);
  assert(Number(appendState.appendActionCount) === 3 && Number(appendState.nextAppendAttemptNo) === 4, "append_attempts_must_accumulate_across_jobs");
  assert(appendState.appendAttemptLimitReached === true && Number(appendState.maximumAppendAttempts) === 3, "append_case_attempt_limit_invalid");
  assert(Number(appendState.cooldownRemainingSeconds) > 0, "append_cooldown_must_start_from_latest_attempt");

  process.stdout.write(`${JSON.stringify({
    status: "passed",
    ordinaryCaseMaximumCreateAttempts: 3,
    replacementStyleCaseMaximumCreateAttempts: 1,
    planMaximumCreateAttempts: 1,
    appendAttemptsUsed: Number(appendState.appendActionCount),
    appendAttemptLimitReached: appendState.appendAttemptLimitReached,
    platformWrites: 0
  }, null, 2)}\n`);
} finally {
  for (const jobId of jobIds.reverse()) await repo.deleteTestJobCascade(jobId);
}
