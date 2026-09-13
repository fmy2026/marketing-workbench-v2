import { PostgresRepository } from "../tests/support/repository.mjs";
import { createJob, runJob } from "../src/workflows/launchWorkflow.mjs";
import { EXECUTION_GRANT_INTENT, executeConfirmedLaunch } from "../src/workflows/executeConfirmedLaunch.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const repo = new PostgresRepository();
const createdJobIds = [];

try {
  const created = await createJob(repo, {
    user_intent: "oceanengine_3_byte_mini_game JSZC 1871922175825993",
    route_id: "oceanengine_3_byte_mini_game",
    game_code: "JSZC",
    advertiser_id: "1871922175825993",
    source_usage: "test_run",
    source_record_ref: `test:unified-execution:${Date.now()}`
  });
  createdJobIds.push(created.jobId);

  const dryRun = await runJob(repo, created.jobId, { mode: "dry_run" });
  const dryRunText = JSON.stringify(dryRun);
  assert(!/mock_ready|mock_execute|mock_created|mock_passed/i.test(dryRunText), "workflow_contains_removed_mock_result");

  const legacyGrant = await executeConfirmedLaunch({
    repo,
    jobId: created.jobId,
    grantSource: "test_fake_transport",
    executionIntent: EXECUTION_GRANT_INTENT
  });
  assert(legacyGrant.executionGrant.status === "blocked", "legacy_test_grant_not_blocked");
  assert(legacyGrant.executionGrant.blockers.includes("grant_source_invalid"), "legacy_test_grant_blocker_missing");

  const unboundWorkbenchGrant = await executeConfirmedLaunch({
    repo,
    jobId: created.jobId,
    grantSource: "workbench_click",
    executionIntent: EXECUTION_GRANT_INTENT
  });
  assert(unboundWorkbenchGrant.executionGrant.status === "blocked", "unbound_workbench_grant_not_blocked");
  assert(unboundWorkbenchGrant.executionGrant.blockers.includes("execution_plan_confirmation_context_missing"), "plan_binding_blocker_missing");

  console.log(JSON.stringify({
    status: "passed",
    dryRunUsesFormalRules: true,
    legacyTestGrantRejected: true,
    unboundPlanRejected: true,
    realPlatformCalled: false
  }));
} finally {
  for (const jobId of createdJobIds.reverse()) await repo.deleteTestJobCascade(jobId);
}
