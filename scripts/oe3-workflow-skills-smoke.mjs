import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import { createJob } from "../src/workflows/launchWorkflow.mjs";
import { runOe3WorkflowSkills, assertNoSensitiveLeak } from "../src/workflows/skills/oe3/index.mjs";

const TARGET = Object.freeze({
  routeId: "oceanengine_3_byte_mini_game",
  gameCode: "JSZC",
  advertiserId: "1871922175825993"
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function makeTestJob(repo, sourceRecordRef, cleanupJobIds) {
  const view = await createJob(repo, {
    user_intent: `推广路线 ${TARGET.routeId}，游戏 ${TARGET.gameCode}，账户 ${TARGET.advertiserId}`,
    route_id: TARGET.routeId,
    game_code: TARGET.gameCode,
    advertiser_id: TARGET.advertiserId,
    source_usage: "test_run",
    source_record_ref: sourceRecordRef
  });
  cleanupJobIds.push(view.jobId);
  return view.jobId;
}

const repo = new PostgresRepository();
const cleanupJobIds = [];

try {
  const dryRunJobId = await makeTestJob(repo, `smoke:workflow-skills:dry-run:${new Date().toISOString()}`, cleanupJobIds);
  const dryRun = await runOe3WorkflowSkills({ repo, jobId: dryRunJobId, mode: "dry_run" });
  const dryRunBundle = await repo.getLaunchJobBundle(dryRunJobId);

  assert(dryRun.summary.currentNode === "5", "dry_run_current_node_not_5");
  assert(dryRun.summary.skillRunCount >= 18, "dry_run_skill_run_count_too_low");
  assert(dryRunBundle.job.source_usage === "test_run", "dry_run_job_not_test_run");
  assert(dryRunBundle.draft?.payload_hash?.startsWith("sha256:"), "dry_run_payload_hash_missing");
  assert(dryRunBundle.draft?.payload_summary?.payload_hash_source === "final_controlled_payload", "dry_run_not_final_payload_hash");
  assert(dryRun.summary.nodeStatuses.std_project_create_executor === "locked", "dry_run_create_node_not_locked");
  assert(!dryRunBundle.platformAction, "dry_run_platform_action_recorded");
  assert(!dryRunBundle.createdObject, "dry_run_created_object_recorded");

  const executeJobId = await makeTestJob(repo, `smoke:workflow-skills:execute-mock:${new Date().toISOString()}`, cleanupJobIds);
  const execute = await runOe3WorkflowSkills({
    repo,
    jobId: executeJobId,
    mode: "execute_once",
    mockReady: true,
    mockExecute: true
  });
  const executeBundle = await repo.getLaunchJobBundle(executeJobId);

  assert(execute.summary.currentNode === "7", "execute_mock_current_node_not_7");
  assert(execute.summary.nodeStatuses.std_project_create_executor === "passed", "execute_mock_create_node_not_passed");
  assert(execute.summary.nodeStatuses.readback_closer === "passed", "execute_mock_readback_node_not_passed");
  assert(executeBundle.platformAction?.action_type === "mock_oceanengine_std_project_create", "execute_mock_platform_action_not_mock");
  assert(executeBundle.createdObject?.object_status === "mock_created", "execute_mock_created_object_not_mock");
  assert(executeBundle.readback?.object_name === executeBundle.draft?.project_name, "execute_mock_readback_name_mismatch");
  assert(executeBundle.draft?.payload_summary?.final_payload_manifest?.dmpRetargetingTagsExcludeIntegerArray === true, "execute_mock_dmp_payload_not_integer_array");

  const result = {
    status: "passed",
    dryRun: dryRun.summary,
    executeMock: execute.summary,
    cleanupPlanned: cleanupJobIds.length,
    noRealPlatformWrite: true,
    noTokenRefresh: true
  };
  assertNoSensitiveLeak(result);
  console.log(JSON.stringify(result, null, 2));
} finally {
  for (const jobId of cleanupJobIds.reverse()) {
    await repo.deleteTestJobCascade(jobId);
  }
}
