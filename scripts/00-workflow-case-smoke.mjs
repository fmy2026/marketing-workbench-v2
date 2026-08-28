import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import { createJob, createWorkflowCase } from "../src/workflows/launchWorkflow.mjs";

const TARGET = Object.freeze({
  routeId: "oceanengine_3_byte_mini_game",
  gameCode: "JSZC",
  advertiserId: "1871922175825993"
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const repo = new PostgresRepository();
const cleanupJobIds = [];

async function makeCase(suffix) {
  return createWorkflowCase(repo, {
    case_key: `smoke.case-isolation.${suffix}.${Date.now()}`,
    route_id: TARGET.routeId,
    game_code: TARGET.gameCode,
    advertiser_id: TARGET.advertiserId,
    business_goal: "Disposable workflow case isolation smoke.",
    source_usage: "test_run"
  });
}

try {
  const [firstCase, secondCase] = await Promise.all([makeCase("first"), makeCase("second")]);
  assert(firstCase.case_id !== secondCase.case_id, "case_ids_must_differ");

  const [firstJob, secondJob] = await Promise.all([
    createJob(repo, {
      route_id: TARGET.routeId,
      game_code: TARGET.gameCode,
      advertiser_id: TARGET.advertiserId,
      case_id: firstCase.case_id,
      source_usage: "test_run",
      source_record_ref: `smoke:workflow-case:first:${Date.now()}`
    }),
    createJob(repo, {
      route_id: TARGET.routeId,
      game_code: TARGET.gameCode,
      advertiser_id: TARGET.advertiserId,
      case_id: secondCase.case_id,
      source_usage: "test_run",
      source_record_ref: `smoke:workflow-case:second:${Date.now()}`
    })
  ]);
  cleanupJobIds.push(firstJob.jobId, secondJob.jobId);

  const [firstBundle, secondBundle, firstSummary, secondSummary, allCases] = await Promise.all([
    repo.getLaunchJobBundle(firstJob.jobId),
    repo.getLaunchJobBundle(secondJob.jobId),
    repo.getWorkflowCaseSummary(firstCase.case_id),
    repo.getWorkflowCaseSummary(secondCase.case_id),
    repo.listWorkflowCaseSummaries({ sourceUsage: "test_run" })
  ]);
  assert(firstBundle.case.case_id === firstCase.case_id, "first_job_case_link_missing");
  assert(secondBundle.case.case_id === secondCase.case_id, "second_job_case_link_missing");
  assert(firstSummary.latest_job_id === firstJob.jobId, "first_summary_latest_job_mismatch");
  assert(secondSummary.latest_job_id === secondJob.jobId, "second_summary_latest_job_mismatch");
  assert(firstSummary.current_gate === "run_fresh_readiness", "first_summary_gate_not_derived");
  assert(secondSummary.current_gate === "run_fresh_readiness", "second_summary_gate_not_derived");
  assert(allCases.some((item) => item.case_id === firstCase.case_id), "first_case_missing_from_list");
  assert(allCases.some((item) => item.case_id === secondCase.case_id), "second_case_missing_from_list");

  let runtimeCaseRequired = false;
  try {
    await createJob(repo, {
      route_id: TARGET.routeId,
      game_code: TARGET.gameCode,
      advertiser_id: TARGET.advertiserId,
      source_usage: "runtime_truth",
      source_record_ref: `smoke:workflow-case:runtime-without-case:${Date.now()}`
    });
  } catch (error) {
    runtimeCaseRequired = error.message === "case_id_required_for_runtime_job";
  }
  assert(runtimeCaseRequired, "runtime_job_must_require_explicit_case");

  console.log(JSON.stringify({
    status: "passed",
    sameAccountIsolated: true,
    runtimeCaseRequired,
    firstCaseId: firstCase.case_id,
    secondCaseId: secondCase.case_id,
    currentGate: firstSummary.current_gate,
    platformWrites: 0
  }, null, 2));
} finally {
  for (const jobId of cleanupJobIds.reverse()) await repo.deleteTestJobCascade(jobId);
}
