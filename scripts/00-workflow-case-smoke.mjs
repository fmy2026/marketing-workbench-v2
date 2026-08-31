import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import { createJob, createWorkflowCase, getJobView } from "../src/workflows/launchWorkflow.mjs";

const TARGET = Object.freeze({
  routeId: "oceanengine_3_byte_mini_game",
  gameCode: "JSZC",
  // This target has an existing canonical monitor readiness record. Keep Case
  // root-blocker assertions focused on the blocker under test rather than the
  // intentionally stricter legacy monitor-evidence migration path.
  advertiserId: "1871922434025472"
});

const TOUCHPOINT_TARGET = Object.freeze({
  routeId: "oceanengine_3_byte_mini_game",
  gameCode: "JSZC",
  advertiserId: "1871922414575753"
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

async function makeCaseForTarget(target, suffix) {
  return createWorkflowCase(repo, {
    case_key: `smoke.case-monitor-touchpoint.${suffix}.${Date.now()}`,
    route_id: target.routeId,
    game_code: target.gameCode,
    advertiser_id: target.advertiserId,
    business_goal: "Disposable monitor touchpoint projection smoke.",
    source_usage: "test_run"
  });
}

try {
  const touchpointCase = await makeCaseForTarget(TOUCHPOINT_TARGET, "canonical-root");
  const touchpointJob = await createJob(repo, {
    route_id: TOUCHPOINT_TARGET.routeId,
    game_code: TOUCHPOINT_TARGET.gameCode,
    advertiser_id: TOUCHPOINT_TARGET.advertiserId,
    case_id: touchpointCase.case_id,
    source_usage: "test_run",
    source_record_ref: `smoke:workflow-case:monitor-touchpoint:${Date.now()}`
  });
  cleanupJobIds.push(touchpointJob.jobId);
  const touchpointSummary = await repo.getWorkflowCaseSummary(touchpointCase.case_id);
  assert(touchpointSummary.monitor_resolved === true, "monitor_readonly_reconcile_must_promote_verified_touchpoint");
  assert(touchpointSummary.root_blocker_codes?.[0] !== "monitor_id_missing", "verified_monitor_must_not_fall_back_to_stale_skill");

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

  await repo.upsertLaunchSkillRun({
    skillRunId: `SR-${firstJob.jobId}-STALE-MONITOR-ID`,
    jobId: firstJob.jobId,
    nodeKey: "creation_context",
    skillKey: "context-resolve-account",
    attemptNo: 1,
    status: "blocked",
    inputHash: `sha256:${"9".repeat(64)}`,
    outputSummary: { monitorIdPresent: false },
    blockers: ["monitor_id_missing"],
    evidenceRefs: [],
    sourceUsage: "test_run"
  });
  const staleMonitorSkillSummary = await repo.getWorkflowCaseSummary(firstCase.case_id);
  assert(staleMonitorSkillSummary.root_blocker_codes?.[0] === "resource_prepare_unsupported:event_asset", "ready_monitor_must_ignore_stale_monitor_skill_blocker");

  await repo.upsertLaunchSkillRun({
    skillRunId: `SR-${secondJob.jobId}-BACKUP-LANDING-INVENTORY`,
    jobId: secondJob.jobId,
    nodeKey: "account_resource_prepare",
    skillKey: "backup-landing-page-material-inventory",
    attemptNo: 1,
    status: "blocked",
    inputHash: `sha256:${"3".repeat(64)}`,
    outputSummary: { observation_status: "degraded" },
    blockers: ["site_get_target_shared_blocked"],
    evidenceRefs: [],
    sourceUsage: "test_run"
  });
  await repo.upsertLaunchExecutionPlan({
    planId: `PLAN-${secondJob.jobId}-V2`,
    jobId: secondJob.jobId,
    planVersion: 2,
    planStatus: "blocked",
    planHash: `sha256:${"4".repeat(64)}`,
    plannedActions: [],
    blockerCodes: ["backup_landing_page_target_not_visible"],
    sourceUsage: "test_run",
    metadata: {
      resource_states: [
        { resource_type: "backup_landing_page", state: "BLOCKED", blocker: "backup_landing_page_target_not_visible" }
      ],
      root_blocker_codes: ["backup_landing_page_target_not_visible"]
    }
  });
  const sharedReadonlyDegradedSummary = await repo.getWorkflowCaseSummary(secondCase.case_id);
  assert(sharedReadonlyDegradedSummary.root_blocker_codes?.[0] === "site_get_target_shared_blocked", "shared_readonly_root_blocker_not_prioritized");
  assert(sharedReadonlyDegradedSummary.suggested_next_action === "resolve_root_blocker:site_get_target_shared_blocked", "shared_readonly_next_action_not_aligned");

  await repo.upsertLaunchSkillRun({
    skillRunId: `SR-${secondJob.jobId}-CONFIRMED-RESOURCE-STOP`,
    jobId: secondJob.jobId,
    nodeKey: "std_project_draft_builder",
    skillKey: "confirmed-resource-orchestrator",
    attemptNo: 1,
    status: "blocked",
    inputHash: `sha256:${"5".repeat(64)}`,
    outputSummary: { orchestratorStatus: "stopped_after_resource_failure" },
    blockers: ["credential:token_status_not_valid"],
    evidenceRefs: [],
    sourceUsage: "test_run"
  });
  const confirmedResourceStopSummary = await repo.getWorkflowCaseSummary(secondCase.case_id);
  assert(confirmedResourceStopSummary.root_blocker_codes?.[0] === "credential:token_status_not_valid", "confirmed_resource_stop_not_prioritized");
  assert(confirmedResourceStopSummary.suggested_next_action === "resolve_root_blocker:credential:token_status_not_valid", "confirmed_resource_stop_next_action_not_aligned");

  const completionCase = await makeCase("completed");
  const completionJob = await createJob(repo, {
    route_id: TARGET.routeId,
    game_code: TARGET.gameCode,
    advertiser_id: TARGET.advertiserId,
    case_id: completionCase.case_id,
    source_usage: "test_run",
    source_record_ref: `smoke:workflow-case:completed:${Date.now()}`
  });
  cleanupJobIds.push(completionJob.jobId);
  const completionPlanId = `PLAN-${completionJob.jobId}-V1`;
  const completionActionId = `ACTION-${completionJob.jobId}-CREATE`;
  const completionObjectId = "900000001";
  await repo.upsertLaunchExecutionPlan({
    planId: completionPlanId,
    jobId: completionJob.jobId,
    planVersion: 1,
    planStatus: "ready",
    planHash: `sha256:${"6".repeat(64)}`,
    plannedActions: [{ action_type: "std_project_create", status: "ready" }],
    blockerCodes: [],
    sourceUsage: "test_run",
    metadata: { resource_states: [], root_blocker_codes: [] }
  });
  await repo.upsertPlatformAction({
    actionId: completionActionId,
    jobId: completionJob.jobId,
    planId: completionPlanId,
    actionType: "oceanengine_std_project_create",
    endpoint: "test:std_project/create",
    method: "POST",
    actionStatus: "succeeded",
    attemptNo: 1,
    idempotencyKey: `IDEMP-${completionJob.jobId}`,
    objectIdPresent: true,
    responseHash: `sha256:${"7".repeat(64)}`,
    finishedAt: new Date().toISOString()
  });
  await repo.upsertCreatedObject({
    createdObjectId: `CO-${completionJob.jobId}-STD-PROJECT-${completionObjectId}`,
    jobId: completionJob.jobId,
    actionId: completionActionId,
    objectType: "std_project",
    objectId: completionObjectId,
    objectName: "workflow-case-completion-smoke",
    objectStatus: "ENABLE",
    readbackStatus: "readback_verified",
    evidenceRef: `EV-${completionJob.jobId}-READBACK`,
    readbackAt: new Date().toISOString()
  });
  await repo.upsertReadbackRecord({
    readbackId: `RB-${completionJob.jobId}-STD-PROJECT-REAL`,
    jobId: completionJob.jobId,
    objectType: "std_project",
    objectId: completionObjectId,
    objectName: "workflow-case-completion-smoke",
    readbackStatus: "readback_verified",
    fieldDiffSummary: { project_id_matches_create: true },
    evidenceRef: `EV-${completionJob.jobId}-READBACK`
  });
  await repo.updateJob(completionJob.jobId, { status: "created", currentNode: "7" });
  const completionSummary = await repo.getWorkflowCaseSummary(completionCase.case_id);
  assert(completionSummary.current_gate === "first_std_project_create_completed", "verified_create_must_close_case_before_ready_plan_gate");
  assert(completionSummary.suggested_next_action === "first_std_project_create_completed", "verified_create_next_action_not_closed");
  assert(completionSummary.root_blocker_codes?.length === 0, "verified_create_must_not_have_root_blocker");

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

  const historicalJob = await createJob(repo, {
    route_id: TARGET.routeId,
    game_code: TARGET.gameCode,
    advertiser_id: TARGET.advertiserId,
    case_id: firstCase.case_id,
    source_usage: "test_run",
    source_record_ref: `smoke:workflow-case:history:${Date.now()}`
  });
  cleanupJobIds.push(historicalJob.jobId);
  const [historicalView, latestView] = await Promise.all([
    getJobView(repo, firstJob.jobId),
    getJobView(repo, historicalJob.jobId)
  ]);
  assert(historicalView.caseId === firstCase.case_id, "historical_view_case_id_missing");
  assert(historicalView.isLatestCaseJob === false, "historical_view_must_not_claim_current_case_job");
  assert(latestView.isLatestCaseJob === true, "latest_view_must_claim_current_case_job");
  assert(historicalView.caseGate.currentGate === latestView.caseGate.currentGate, "historical_and_latest_case_gate_must_share_projection");

  console.log(JSON.stringify({
    status: "passed",
    sameAccountIsolated: true,
    runtimeCaseRequired,
    firstCaseId: firstCase.case_id,
    secondCaseId: secondCase.case_id,
    currentGate: firstSummary.current_gate,
    resourceRootBlocker: resourceBlockedSummary.root_blocker_codes[0],
    node5RootBlocker: node5BlockedSummary.root_blocker_codes[0],
    sharedReadonlyRootBlocker: sharedReadonlyDegradedSummary.root_blocker_codes[0],
    confirmedResourceStopRootBlocker: confirmedResourceStopSummary.root_blocker_codes[0],
    completedCreateGate: completionSummary.current_gate,
    historicalJobSeparated: historicalView.isLatestCaseJob === false && latestView.isLatestCaseJob === true,
    structuralBlockerCount: resourceBlockedSummary.structural_blocker_codes.length,
    platformWrites: 0
  }, null, 2));
} finally {
  for (const jobId of cleanupJobIds.reverse()) await repo.deleteTestJobCascade(jobId);
}
