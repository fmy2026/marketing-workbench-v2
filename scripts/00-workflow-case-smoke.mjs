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

  await repo.upsertLaunchExecutionPlan({
    planId: `PLAN-${firstJob.jobId}-V1`,
    jobId: firstJob.jobId,
    planVersion: 1,
    planStatus: "blocked",
    planHash: `sha256:${"1".repeat(64)}`,
    plannedActions: [],
    blockerCodes: [
      "resource_prepare_unsupported:event_asset",
      "nested_audience_contract_invalid"
    ],
    sourceUsage: "test_run",
    metadata: {
      resource_states: [
        { resource_type: "micro_app_instance", state: "BLOCKED", blocker: "resource_prepare_unsupported:micro_app_instance" },
        { resource_type: "event_asset", state: "BLOCKED", blocker: "resource_prepare_unsupported:event_asset" }
      ],
      root_blocker_codes: ["nested_audience_contract_invalid"]
    }
  });
  await repo.upsertLaunchExecutionPlan({
    planId: `PLAN-${secondJob.jobId}-V1`,
    jobId: secondJob.jobId,
    planVersion: 1,
    planStatus: "blocked",
    planHash: `sha256:${"2".repeat(64)}`,
    plannedActions: [],
    blockerCodes: ["nested_audience_contract_invalid"],
    sourceUsage: "test_run",
    metadata: {
      resource_states: [],
      root_blocker_codes: ["nested_audience_contract_invalid"]
    }
  });
  const [resourceBlockedSummary, node5BlockedSummary] = await Promise.all([
    repo.getWorkflowCaseSummary(firstCase.case_id),
    repo.getWorkflowCaseSummary(secondCase.case_id)
  ]);
  assert(resourceBlockedSummary.current_gate === "resolve_case_blocker", "resource_root_gate_not_single");
  assert(resourceBlockedSummary.root_blocker_codes?.length === 1, "resource_root_blocker_cardinality_invalid");
  assert(resourceBlockedSummary.root_blocker_codes[0] === "resource_prepare_unsupported:event_asset", "resource_root_priority_invalid");
  assert(resourceBlockedSummary.blocker_codes?.length === 1, "effective_blocker_cardinality_invalid");
  assert(resourceBlockedSummary.structural_blocker_codes?.length === 2, "structural_blockers_not_retained");
  assert(resourceBlockedSummary.suggested_next_action === "resolve_root_blocker:resource_prepare_unsupported:event_asset", "resource_next_action_not_aligned");
  assert(node5BlockedSummary.root_blocker_codes?.length === 1, "node5_root_blocker_cardinality_invalid");
  assert(node5BlockedSummary.root_blocker_codes[0] === "nested_audience_contract_invalid", "node5_root_fallback_missing");

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
    resourceRootBlocker: resourceBlockedSummary.root_blocker_codes[0],
    node5RootBlocker: node5BlockedSummary.root_blocker_codes[0],
    structuralBlockerCount: resourceBlockedSummary.structural_blocker_codes.length,
    platformWrites: 0
  }, null, 2));
} finally {
  for (const jobId of cleanupJobIds.reverse()) await repo.deleteTestJobCascade(jobId);
}
