import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
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

  process.stdout.write(`${JSON.stringify({
    status: "passed",
    ordinaryCaseMaximumCreateAttempts: 3,
    replacementStyleCaseMaximumCreateAttempts: 1,
    planMaximumCreateAttempts: 1,
    platformWrites: 0
  }, null, 2)}\n`);
} finally {
  for (const jobId of jobIds.reverse()) await repo.deleteTestJobCascade(jobId);
}
