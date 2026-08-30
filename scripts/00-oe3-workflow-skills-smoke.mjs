import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import { buildLaunchJobView, createJob } from "../src/workflows/launchWorkflow.mjs";
import {
  OE3_REQUIRED_RESOURCE_TYPES,
  OE3_SKILL_DEFINITIONS,
  assertNoSensitiveLeak,
  runOe3WorkflowSkills,
  validateOe3WorkflowSchedules,
  validateWorkflowNodeRegistry
} from "../src/workflows/skills/oe3/00-index.mjs";

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
  const registryValidation = validateWorkflowNodeRegistry({
    skillDefinitions: OE3_SKILL_DEFINITIONS,
    requiredResourceTypes: OE3_REQUIRED_RESOURCE_TYPES
  });
  assert(registryValidation.status === "passed", "workflow_node_registry_invalid");
  assert(registryValidation.nodeCount === 7, "workflow_node_registry_count_not_7");
  assert(registryValidation.node4ResourceSkillCountMatches === true, "node4_resource_skill_count_mismatch");
  assert(registryValidation.monitorProvisionClassification.includes("creation-context bootstrap"), "monitor_provision_classification_missing");
  assert(registryValidation.childTraceable === true, "workflow_child_trace_incomplete");

  const scheduleValidation = validateOe3WorkflowSchedules();
  assert(scheduleValidation.status === "passed", "workflow_skill_schedule_invalid");

  const dryRunJobId = await makeTestJob(repo, `smoke:workflow-skills:dry-run:${new Date().toISOString()}`, cleanupJobIds);
  const dryRun = await runOe3WorkflowSkills({ repo, jobId: dryRunJobId, mode: "dry_run" });
  const dryRunBundle = await repo.getLaunchJobBundle(dryRunJobId);

  assert(dryRun.summary.currentNode === "5", "dry_run_current_node_not_5");
  assert(dryRun.summary.skillRunCount >= 18, "dry_run_skill_run_count_too_low");
  assert(dryRunBundle.job.source_usage === "test_run", "dry_run_job_not_test_run");
  assert(dryRunBundle.draft?.payload_hash?.startsWith("sha256:"), "dry_run_payload_hash_missing");
  assert(dryRunBundle.draft?.payload_summary?.payload_hash_source === "final_controlled_payload", "dry_run_not_final_payload_hash");
  assert(typeof dryRunBundle.draft?.payload_summary?.advertiser_id === "string", "dry_run_advertiser_id_storage_not_string");
  assert(dryRunBundle.draft?.payload_summary?.final_payload_manifest?.advertiserIdTransportType === "number", "dry_run_advertiser_id_transport_not_number");
  assert(dryRunBundle.draft?.payload_summary?.final_payload_manifest?.advertiserIdTransportSafe === true, "dry_run_advertiser_id_transport_not_safe");
  assert(dryRun.summary.nodeStatuses.std_project_create_executor === "locked", "dry_run_create_node_not_locked");
  assert(!dryRunBundle.platformAction, "dry_run_platform_action_recorded");
  assert(!dryRunBundle.createdObject, "dry_run_created_object_recorded");
  const dryRunView = buildLaunchJobView(dryRunBundle);
  const workflowChildren = dryRunView.phases.flatMap((phase) => phase.nodes.flatMap((node) => node.children));
  assert(workflowChildren.length === registryValidation.childCount, "workflow_child_view_count_mismatch");
  assert(workflowChildren.every((child) => child.trace?.type && child.trace?.resolverRef), "workflow_child_trace_view_missing");
  assert(workflowChildren.filter((child) => child.trace.type !== "derived").every((child) => child.trace.skills.length > 0), "workflow_skill_trace_view_missing_skills");
  const backupLandingChild = workflowChildren.find((child) => child.id === "resource-backup_landing_page");
  assert(backupLandingChild?.trace?.type === "pipeline", "backup_landing_child_not_pipeline");
  assert(JSON.stringify(backupLandingChild?.trace?.skills?.map((item) => item.skillKey)) === JSON.stringify([
    "backup-landing-page-material-inventory",
    "backup-landing-page-source-prepare",
    "resource-verify-backup-landing-page"
  ]), "backup_landing_child_pipeline_wrong");
  assert(backupLandingChild?.trace?.skills?.every((item) => item.latestRun?.inputHash?.startsWith("sha256:")), "backup_landing_child_latest_runs_missing");

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
  assert(typeof executeBundle.draft?.payload_summary?.advertiser_id === "string", "execute_mock_advertiser_id_storage_not_string");
  assert(executeBundle.draft?.payload_summary?.final_payload_manifest?.advertiserIdTransportType === "number", "execute_mock_advertiser_id_transport_not_number");
  assert(executeBundle.draft?.payload_summary?.final_payload_manifest?.advertiserIdTransportSafe === true, "execute_mock_advertiser_id_transport_not_safe");
  assert(executeBundle.draft?.payload_summary?.final_payload_manifest?.dmpRetargetingTagsExcludeIntegerArray === true, "execute_mock_dmp_payload_not_integer_array");

  const awemeReadonlyJobId = await makeTestJob(repo, `smoke:workflow-skills:aweme-auth-readonly:${new Date().toISOString()}`, cleanupJobIds);
  const awemeReadonly = await runOe3WorkflowSkills({
    repo,
    jobId: awemeReadonlyJobId,
    mode: "aweme_auth_readonly",
    mockReady: true
  });
  const awemeReadonlyBundle = await repo.getLaunchJobBundle(awemeReadonlyJobId);
  const awemeReadonlyAudit = await repo.getLaunchJobAuditCounts(awemeReadonlyJobId);
  const awemeSkillKeys = (awemeReadonlyBundle.skillRuns || []).map((run) => run.skill_key);

  assert(awemeReadonly.summary.currentNode === "4", "aweme_auth_readonly_current_node_not_4");
  assert(awemeReadonly.summary.jobStatus === "diagnosed", "aweme_auth_readonly_job_not_diagnosed");
  assert(JSON.stringify(awemeSkillKeys) === JSON.stringify([
    "intake-normalize",
    "context-resolve-account",
    "launch-pack-resolve-game",
    "launch-pack-resolve-defaults",
    "aweme-authorization-readonly"
  ]), "aweme_auth_readonly_skill_boundary_failed");
  assert(!awemeReadonlyBundle.draft, "aweme_auth_readonly_draft_recorded");
  assert(!awemeReadonlyBundle.executionPlan, "aweme_auth_readonly_execution_plan_recorded");
  assert(!awemeReadonlyBundle.platformAction, "aweme_auth_readonly_platform_action_recorded");
  assert(!awemeReadonlyBundle.createdObject, "aweme_auth_readonly_created_object_recorded");
  assert(!awemeReadonlyBundle.readback, "aweme_auth_readonly_readback_recorded");
  assert(Number(awemeReadonlyAudit.drafts || 0) === 0, "aweme_auth_readonly_draft_count_not_zero");
  assert(Number(awemeReadonlyAudit.executionPlans || 0) === 0, "aweme_auth_readonly_execution_plan_count_not_zero");
  assert(Number(awemeReadonlyAudit.readbackRecords || 0) === 0, "aweme_auth_readonly_readback_count_not_zero");
  assert(Number(awemeReadonlyAudit.launchConfirmations || 0) === 0, "aweme_auth_readonly_confirmation_count_not_zero");
  assert(Number(awemeReadonlyAudit.platformActions || 0) === 0, "aweme_auth_readonly_platform_action_count_not_zero");
  assert(Number(awemeReadonlyAudit.createdObjects || 0) === 0, "aweme_auth_readonly_created_object_count_not_zero");

  const result = {
    status: "passed",
    dryRun: dryRun.summary,
    executeMock: execute.summary,
    awemeAuthReadonly: awemeReadonly.summary,
    registryValidation,
    scheduleValidation,
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
