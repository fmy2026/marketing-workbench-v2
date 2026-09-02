import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import { createJob, runJob } from "../src/workflows/launchWorkflow.mjs";
import {
  ACTION_STD_PROJECT_CREATE,
  buildExecutionPlanFromBundle,
  compileAndSaveExecutionPlan,
  evaluateSingleVariableLedgerDiff,
  validateExecutionPlanActionScope
} from "../src/workflows/executionPlan.mjs";
import { JSZC_SUCCESS_PROFILE_VERSION } from "../src/workflows/skills/oe3/05-jszc-success-profile.mjs";
import { assertNoSensitiveLeak } from "../src/workflows/skills/oe3/00-index.mjs";

const TARGET = Object.freeze({
  routeId: "oceanengine_3_byte_mini_game",
  gameCode: "JSZC",
  advertiserId: "1871922175825993"
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertThrows(fn, expectedMessage, message) {
  try {
    fn();
  } catch (error) {
    if (error.message === expectedMessage) return;
    throw error;
  }
  throw new Error(message);
}

function ledgerEntry(path, overrides = {}) {
  return {
    path,
    sendPolicy: "send",
    valueType: "string",
    itemCount: null,
    stringLength: null,
    enumRule: [],
    enumMatched: null,
    valueHash: `sha256:${"a".repeat(64)}`,
    preCreateStatus: "passed",
    ...overrides
  };
}

function ledgerBundle({ jobId, payloadHash, entries }) {
  return {
    job: { job_id: jobId },
    draft: {
      payload_hash: payloadHash,
      payload_summary: {
        final_payload_manifest: {
          createFieldLedger: { entries }
        }
      }
    }
  };
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

function actionTypes(plan) {
  return (plan?.plannedActions || plan?.planned_actions || []).map((action) => action.action_type);
}

const repo = new PostgresRepository();
const cleanupJobIds = [];

try {
  const filterEventDiff = evaluateSingleVariableLedgerDiff({
    baselineBundle: ledgerBundle({
      jobId: "JOB-BASELINE-FILTER-EVENT",
      payloadHash: `sha256:${"1".repeat(64)}`,
      entries: [
        ledgerEntry("name", { valueHash: `sha256:${"2".repeat(64)}` }),
        ledgerEntry("audience.filter_event", { valueType: "array", itemCount: 1, valueHash: `sha256:${"3".repeat(64)}` }),
        ledgerEntry("audience.filter_event.[]", { valueHash: `sha256:${"4".repeat(64)}` }),
        ledgerEntry("project_materials.title_material_list.[].title", { valueHash: `sha256:${"a".repeat(64)}` }),
        ledgerEntry("project_materials.title_material_list.[].title", { valueHash: `sha256:${"b".repeat(64)}` })
      ]
    }),
    freshBundle: ledgerBundle({
      jobId: "JOB-FRESH-FILTER-EVENT",
      payloadHash: `sha256:${"5".repeat(64)}`,
      entries: [
        ledgerEntry("name", { valueHash: `sha256:${"6".repeat(64)}` }),
        ledgerEntry("project_materials.title_material_list.[].title", { valueHash: `sha256:${"b".repeat(64)}` }),
        ledgerEntry("audience.filter_event", {
          sendPolicy: "omit",
          valueType: "absent",
          valueHash: ""
        }),
        ledgerEntry("project_materials.title_material_list.[].title", { valueHash: `sha256:${"a".repeat(64)}` })
      ]
    }),
    candidatePath: "audience.filter_event",
    candidateDirection: "single_item_to_omitted"
  });
  assert(filterEventDiff.status === "passed", "filter_event_single_variable_diff_not_passed");
  assert(filterEventDiff.changedPaths.includes("audience.filter_event.[]"), "filter_event_item_path_diff_missing");
  assert(filterEventDiff.allowedChangedPaths.length === 3, "filter_event_allowed_changed_paths_mismatch");
  assert(filterEventDiff.diffHash.startsWith("sha256:"), "filter_event_diff_hash_missing");

  const unapprovedDiff = evaluateSingleVariableLedgerDiff({
    baselineBundle: ledgerBundle({
      jobId: "JOB-BASELINE-UNAPPROVED",
      payloadHash: `sha256:${"7".repeat(64)}`,
      entries: [
        ledgerEntry("name", { valueHash: `sha256:${"8".repeat(64)}` }),
        ledgerEntry("audience.filter_event", { valueType: "array", itemCount: 1 }),
        ledgerEntry("audience.filter_event.[]")
      ]
    }),
    freshBundle: ledgerBundle({
      jobId: "JOB-FRESH-UNAPPROVED",
      payloadHash: `sha256:${"9".repeat(64)}`,
      entries: [
        ledgerEntry("name", { valueHash: `sha256:${"b".repeat(64)}` }),
        ledgerEntry("audience.filter_event", { sendPolicy: "omit", valueType: "absent", valueHash: "" }),
        ledgerEntry("budget", { valueType: "number", valueHash: `sha256:${"c".repeat(64)}` })
      ]
    }),
    candidatePath: "audience.filter_event"
  });
  assert(unapprovedDiff.status === "blocked", "unapproved_business_change_not_blocked");
  assert(unapprovedDiff.blockedPaths.includes("budget"), "unapproved_budget_path_not_reported");

  const externalUrlDiff = evaluateSingleVariableLedgerDiff({
    baselineBundle: ledgerBundle({
      jobId: "JOB-BASELINE-EXTERNAL-URL",
      payloadHash: `sha256:${"d".repeat(64)}`,
      entries: [
        ledgerEntry("name", { valueHash: `sha256:${"e".repeat(64)}` }),
        ledgerEntry("project_materials.external_url_material_list", { sendPolicy: "omit", valueType: "absent", valueHash: "" })
      ]
    }),
    freshBundle: ledgerBundle({
      jobId: "JOB-FRESH-EXTERNAL-URL",
      payloadHash: `sha256:${"f".repeat(64)}`,
      entries: [
        ledgerEntry("name", { valueHash: `sha256:${"0".repeat(64)}` }),
        ledgerEntry("project_materials.external_url_material_list", { valueType: "array", itemCount: 1 }),
        ledgerEntry("project_materials.external_url_material_list.[]")
      ]
    }),
    candidatePath: "project_materials.external_url_material_list"
  });
  assert(externalUrlDiff.status === "passed", "external_url_candidate_compatibility_broken");

  const jobId = await makeTestJob(repo, `smoke:execution-plan:${new Date().toISOString()}`, cleanupJobIds);
  await runJob(repo, jobId, { mode: "dry_run", mockReady: true });

  const first = await compileAndSaveExecutionPlan({ repo, jobId });
  const second = await compileAndSaveExecutionPlan({ repo, jobId });
  assert(first.plan.planHash === second.plan.planHash, "execution_plan_hash_not_stable");
  assert(second.stored?.plan_id === second.plan.planId, "execution_plan_not_persisted");
  assert(second.stored?.planned_actions?.length === second.plan.plannedActions.length, "stored_plan_action_count_mismatch");
  const boundBundleAfterPlan = await repo.getLaunchJobBundle(jobId);
  assert(boundBundleAfterPlan.draft?.payload_summary?.derived_from_plan_id === second.plan.planId, "ready_plan_draft_id_binding_missing");
  assert(boundBundleAfterPlan.draft?.payload_summary?.derived_from_plan_hash === second.plan.planHash, "ready_plan_draft_hash_binding_missing");
  assert(boundBundleAfterPlan.draft?.payload_summary?.plan_derivation_status === "passed", "ready_plan_draft_derivation_not_passed");
  assert(actionTypes(second.plan).includes(ACTION_STD_PROJECT_CREATE), "std_project_create_not_planned");
  assert(second.plan.metadata.success_profile?.success_profile_version === JSZC_SUCCESS_PROFILE_VERSION, "success_profile_version_not_in_plan_metadata");
  assert(/^sha256:[a-f0-9]{64}$/.test(second.plan.metadata.success_profile?.field_shape_hash || ""), "field_shape_hash_not_in_plan_metadata");
  assert(second.plan.metadata.success_profile?.filter_event_policy === "omit", "filter_event_policy_not_in_plan_metadata");
  assert(second.plan.metadata.success_profile?.filter_event_present === false, "filter_event_presence_not_in_plan_metadata");
  assert(second.plan.metadata.success_profile?.converted_time_duration_policy === "omit_when_no_exclude", "converted_time_duration_policy_not_in_plan_metadata");
  assert(second.plan.metadata.success_profile?.converted_time_duration_present === false, "converted_time_duration_presence_not_in_plan_metadata");
  assert(second.plan.metadata.success_profile?.external_url_material_list_policy === "send", "external_url_policy_not_in_plan_metadata");
  assert(second.plan.metadata.success_profile?.external_url_material_list_count === 1, "external_url_count_not_in_plan_metadata");

  const plannedTypes = actionTypes(second.plan);
  const exactScope = validateExecutionPlanActionScope({
    plan: second.plan,
    allowedActions: plannedTypes
  });
  assert(exactScope.status === "passed", "exact_plan_action_scope_not_passed");

  const outsideScope = validateExecutionPlanActionScope({
    plan: second.plan,
    allowedActions: [...plannedTypes, "outside_plan_action"]
  });
  assert(outsideScope.status === "blocked", "outside_plan_action_not_blocked");
  assert(outsideScope.blockers.includes("action_not_planned:outside_plan_action"), "outside_plan_action_blocker_missing");

  const bundle = await repo.getLaunchJobBundle(jobId);
  const preDraftPlan = buildExecutionPlanFromBundle({ ...bundle, draft: null });
  assert(preDraftPlan.planStatus === "blocked", "std_project_create_plan_must_not_be_ready_without_final_draft");
  assert(preDraftPlan.blockerCodes.includes("draft_not_ready_for_std_project_create"), "pre_draft_plan_blocker_missing");
  const boundExperiment = {
    status: "passed",
    baselineJobId: "JOB-BASELINE-P02",
    baselinePayloadHash: `sha256:${"1".repeat(64)}`,
    freshPayloadHash: bundle.draft.payload_hash,
    candidatePath: "audience.filter_event",
    candidateDirection: "single_item_to_omitted",
    diffHash: `sha256:${"2".repeat(64)}`,
    allowedChangedPaths: ["name", "audience.filter_event", "audience.filter_event.[]"],
    changedPaths: ["name", "audience.filter_event", "audience.filter_event.[]"]
  };
  const boundPlan = buildExecutionPlanFromBundle(bundle, { singleVariableExperiment: boundExperiment });
  const boundPlanAgain = buildExecutionPlanFromBundle(bundle, { singleVariableExperiment: boundExperiment });
  assert(boundPlan.planHash === boundPlanAgain.planHash, "single_variable_plan_hash_not_stable");
  assert(boundPlan.planHash !== second.plan.planHash, "single_variable_binding_not_in_plan_hash");
  assert(boundPlan.metadata.single_variable_experiment.diff_hash === boundExperiment.diffHash, "single_variable_diff_hash_not_in_metadata");
  assert(boundPlan.metadata.single_variable_experiment.baseline_job_id === boundExperiment.baselineJobId, "single_variable_baseline_job_not_in_metadata");
  assert(boundPlan.metadata.execution_scope.single_variable_experiment.candidate_path === "audience.filter_event", "single_variable_candidate_not_in_execution_scope");
  const canonicalBoundPlan = buildExecutionPlanFromBundle(bundle, {
    singleVariableExperiment: boundPlan.metadata.single_variable_experiment
  });
  assert(canonicalBoundPlan.planHash === boundPlan.planHash, "canonical_single_variable_plan_hash_drifted");
  assert(
    JSON.stringify(canonicalBoundPlan.metadata.single_variable_experiment) === JSON.stringify(boundPlan.metadata.single_variable_experiment),
    "canonical_single_variable_metadata_drifted"
  );
  await compileAndSaveExecutionPlan({
    repo,
    jobId,
    singleVariableExperiment: boundPlan.metadata.single_variable_experiment,
    expectedPlanId: boundPlan.planId,
    expectedPlanHash: boundPlan.planHash
  });
  let confirmedHashDriftBlocked = false;
  try {
    await compileAndSaveExecutionPlan({
      repo,
      jobId,
      singleVariableExperiment: boundPlan.metadata.single_variable_experiment,
      expectedPlanId: boundPlan.planId,
      expectedPlanHash: `sha256:${"9".repeat(64)}`
    });
  } catch (error) {
    confirmedHashDriftBlocked = error.message === "confirmed_plan_hash_drift";
  }
  assert(confirmedHashDriftBlocked, "confirmed_plan_hash_drift_not_blocked");
  const storedBoundPlan = await repo.getLatestLaunchExecutionPlan(jobId);
  assert(storedBoundPlan?.plan_hash === boundPlan.planHash, "confirmed_plan_was_overwritten_after_drift");
  assertThrows(
    () => buildExecutionPlanFromBundle(bundle, {
      singleVariableExperiment: {
        ...boundExperiment,
        changedPaths: [...boundExperiment.changedPaths, "budget"]
      }
    }),
    "invalid_single_variable_experiment_binding",
    "unapproved_plan_binding_was_not_rejected"
  );
  const missingMonitorPlan = buildExecutionPlanFromBundle({
    ...bundle,
    account: { ...(bundle.account || {}), monitor_id: "" },
    touchpoint: null,
    monitorReadiness: {
      readiness_status: "needs_plan",
      monitor_ready: false,
      actionable_blocker_code: "monitor_plan_required"
    }
  });
  assert(!actionTypes(missingMonitorPlan).includes("ensure_monitor"), "unexecutable_ensure_monitor_must_not_be_planned");
  assert(!actionTypes(missingMonitorPlan).includes(ACTION_STD_PROJECT_CREATE), "missing_monitor_plan_must_not_contain_create");
  assert(missingMonitorPlan.blockerCodes.includes("monitor_plan_required"), "missing_monitor_canonical_blocker_missing");
  const missingMonitorHashAgain = buildExecutionPlanFromBundle({
    ...bundle,
    account: { ...(bundle.account || {}), monitor_id: "" },
    touchpoint: null,
    monitorReadiness: {
      readiness_status: "needs_plan",
      monitor_ready: false,
      actionable_blocker_code: "monitor_plan_required"
    }
  }).planHash;
  assert(missingMonitorPlan.planHash === missingMonitorHashAgain, "missing_monitor_plan_hash_not_stable");

  const leafBlockerPlan = buildExecutionPlanFromBundle({
    ...bundle,
    nodes: (bundle.nodes || []).map((node) => node.node_key === "std_project_draft_builder" ? {
      ...node,
      output_summary: {
        ...(node.output_summary || {}),
        createReadiness: {
          ...(node.output_summary?.createReadiness || {}),
          status: "blocked",
          canCreateCurrentJob: false,
          blockers: ["instance_id_long_id_transport_not_verified"],
          requestFieldManifest: {
            blockers: ["instance_id_long_id_transport_not_verified"]
          }
        }
      }
    } : node)
  });
  assert(leafBlockerPlan.metadata.root_blocker_codes.length === 1, "root_blocker_not_projected");
  assert(leafBlockerPlan.metadata.root_blocker_codes[0] === "instance_id_long_id_transport_not_verified", "root_blocker_code_mismatch");
  assert(leafBlockerPlan.blockerCodes.includes("draft_not_ready_for_std_project_create"), "structural_blocker_not_retained");
  const readinessFallbackPlan = buildExecutionPlanFromBundle({
    ...bundle,
    nodes: (bundle.nodes || []).map((node) => node.node_key === "std_project_draft_builder" ? {
      ...node,
      output_summary: {
        ...(node.output_summary || {}),
        createReadiness: {
          ...(node.output_summary?.createReadiness || {}),
          status: "blocked",
          canCreateCurrentJob: false,
          blockers: ["instance_id_long_id_transport_not_verified", "final_payload_blockers"],
          requestFieldManifest: {
            blockers: []
          }
        }
      }
    } : node)
  });
  assert(readinessFallbackPlan.metadata.root_blocker_codes[0] === "instance_id_long_id_transport_not_verified", "readiness_root_blocker_fallback_missing");

  const sharedReadonlyDegradedPlan = buildExecutionPlanFromBundle({
    ...bundle,
    nodes: (bundle.nodes || []).map((node) => node.node_key === "account_resource_prepare" ? {
      ...node,
      output_summary: {
        ...(node.output_summary || {}),
        checks: [
          ...(node.output_summary?.checks || []).filter((check) => (check.resource_type || check.resourceType) !== "backup_landing_page"),
          {
            resource_type: "backup_landing_page",
            status: "blocked",
            blocker_codes: ["site_get_target_shared_blocked"],
            prepare_capability: { status: "blocked" }
          }
        ]
      }
    } : node)
  });
  assert(sharedReadonlyDegradedPlan.planStatus === "blocked", "shared_readonly_degraded_plan_not_blocked");
  assert(sharedReadonlyDegradedPlan.metadata.root_blocker_codes[0] === "site_get_target_shared_blocked", "shared_readonly_degraded_root_not_preserved");
  assert(!sharedReadonlyDegradedPlan.blockerCodes.includes("backup_landing_page_target_site_missing"), "shared_readonly_degraded_must_not_imply_missing_site");

  const attemptState = await repo.getCreateAttemptState(jobId);
  assert((attemptState.createActionCount || 0) === 0, "platform_action_recorded_by_plan_smoke");
  assert((attemptState.confirmationCount || 0) === 0, "confirmation_recorded_by_plan_smoke");
  assert((attemptState.createdObjectCount || 0) === 0, "created_object_recorded_by_plan_smoke");

  await repo.upsertLaunchConfirmation({
    confirmationId: `CONFIRM-${jobId}-EXECUTION-PLAN`,
    jobId,
    draftId: "",
    objectType: "std_project",
    objectName: boundPlan.metadata.planning_intent.project_name,
    payloadHash: "",
    confirmationStatus: "confirmed_for_execution_plan",
    confirmVariable: "TEST_ONLY",
    confirmedBy: "execution_plan_smoke",
    planId: boundPlan.planId,
    metadata: {
      plan_hash: boundPlan.planHash,
      retry_allowed: false,
      test_only: true
    }
  });
  let confirmedPlanImmutable = false;
  try {
    await compileAndSaveExecutionPlan({ repo, jobId });
  } catch (error) {
    confirmedPlanImmutable = error.message === "confirmed_execution_plan_immutable";
  }
  assert(confirmedPlanImmutable, "confirmed_execution_plan_was_mutable");
  const storedAfterConfirmation = await repo.getLatestLaunchExecutionPlan(jobId);
  assert(storedAfterConfirmation?.plan_hash === boundPlan.planHash, "confirmed_execution_plan_hash_changed");

  const zeroActionJobId = await makeTestJob(repo, `smoke:confirmed-prewrite-finalization:${new Date().toISOString()}`, cleanupJobIds);
  await runJob(repo, zeroActionJobId, { mode: "dry_run", mockReady: true });
  const zeroActionPlan = await compileAndSaveExecutionPlan({ repo, jobId: zeroActionJobId });
  const zeroActionBundle = await repo.getLaunchJobBundle(zeroActionJobId);
  const zeroActionClaim = await repo.claimLaunchExecutionPlanConfirmation({
    confirmationId: `CONFIRM-${zeroActionJobId}-EXECUTION-PLAN`,
    jobId: zeroActionJobId,
    draftId: "",
    objectType: "std_project",
    objectName: zeroActionBundle.draft?.project_name || "",
    payloadHash: "",
    confirmationStatus: "confirmed_for_execution_plan",
    confirmVariable: "test_only",
    confirmedBy: "test_fake_transport",
    planId: zeroActionPlan.plan.planId,
    metadata: { test_only: true }
  });
  assert(zeroActionClaim.claimed === true, "zero_action_confirmation_not_claimed");
  const zeroActionFinalized = await repo.finalizeConfirmedCreatePlanBeforeAction({
    jobId: zeroActionJobId,
    planId: zeroActionPlan.plan.planId,
    blockerCode: "final_draft_plan_derivation_not_passed"
  });
  assert(zeroActionFinalized.finalized === true, "confirmed_zero_action_plan_not_finalized");
  const zeroActionClosedBundle = await repo.getLaunchJobBundle(zeroActionJobId);
  assert(zeroActionClosedBundle.executionPlan?.plan_status === "consumed", "confirmed_zero_action_plan_not_consumed");
  assert(zeroActionClosedBundle.job?.job_status === "failed_waiting_manual_review", "confirmed_zero_action_job_not_finalized");

  const result = {
    status: "passed",
    persistedPlan: {
      jobId,
      planId: second.plan.planId,
      planStatus: second.plan.planStatus,
      actionTypes: plannedTypes,
      stableHash: true
    },
    missingMonitorPlan: {
      actionTypes: actionTypes(missingMonitorPlan),
      hasEnsureMonitor: false,
      blocker: missingMonitorPlan.metadata.unique_root_blocker,
      stableHash: true
    },
    confirmedPlanImmutable,
    readyPlanDraftBound: true,
    confirmedZeroActionPlanFinalized: true,
    leafBlockerProjection: {
      rootBlockerCodes: leafBlockerPlan.metadata.root_blocker_codes,
      structuralBlockerRetained: leafBlockerPlan.blockerCodes.includes("draft_not_ready_for_std_project_create")
    },
    sharedReadonlyDegradedPlan: {
      status: sharedReadonlyDegradedPlan.planStatus,
      rootBlocker: sharedReadonlyDegradedPlan.metadata.root_blocker_codes[0]
    },
    planScope: {
      exactScopeStatus: exactScope.status,
      outsideScopeStatus: outsideScope.status,
      outsideScopeBlockers: outsideScope.blockers
    },
    singleVariableExperiment: {
      filterEventDiffStatus: filterEventDiff.status,
      externalUrlCompatibilityStatus: externalUrlDiff.status,
      unapprovedChangeStatus: unapprovedDiff.status,
      planHashBound: boundPlan.planHash !== second.plan.planHash,
      metadataBound: boundPlan.metadata.single_variable_experiment.diff_hash === boundExperiment.diffHash
    },
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
