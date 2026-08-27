import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import { createJob, runJob } from "../src/workflows/launchWorkflow.mjs";
import {
  ACTION_ENSURE_MONITOR,
  ACTION_STD_PROJECT_CREATE,
  buildExecutionPlanFromBundle,
  compileAndSaveExecutionPlan,
  validateExecutionPlanActionScope
} from "../src/workflows/executionPlan.mjs";
import { assertNoSensitiveLeak } from "../src/workflows/skills/oe3/00-index.mjs";

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

function actionTypes(plan) {
  return (plan?.plannedActions || plan?.planned_actions || []).map((action) => action.action_type);
}

const repo = new PostgresRepository();
const cleanupJobIds = [];

try {
  const jobId = await makeTestJob(repo, `smoke:execution-plan:${new Date().toISOString()}`, cleanupJobIds);
  await runJob(repo, jobId, { mode: "dry_run", mockReady: true });

  const first = await compileAndSaveExecutionPlan({ repo, jobId });
  const second = await compileAndSaveExecutionPlan({ repo, jobId });
  assert(first.plan.planHash === second.plan.planHash, "execution_plan_hash_not_stable");
  assert(second.stored?.plan_id === second.plan.planId, "execution_plan_not_persisted");
  assert(second.stored?.planned_actions?.length === second.plan.plannedActions.length, "stored_plan_action_count_mismatch");
  assert(actionTypes(second.plan).includes(ACTION_STD_PROJECT_CREATE), "std_project_create_not_planned");

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
  const missingMonitorPlan = buildExecutionPlanFromBundle({
    ...bundle,
    account: { ...(bundle.account || {}), monitor_id: "" },
    touchpoint: null
  });
  assert(actionTypes(missingMonitorPlan).includes(ACTION_ENSURE_MONITOR), "ensure_monitor_not_planned_when_missing");
  const missingMonitorHashAgain = buildExecutionPlanFromBundle({
    ...bundle,
    account: { ...(bundle.account || {}), monitor_id: "" },
    touchpoint: null
  }).planHash;
  assert(missingMonitorPlan.planHash === missingMonitorHashAgain, "missing_monitor_plan_hash_not_stable");

  const attemptState = await repo.getCreateAttemptState(jobId);
  assert((attemptState.createActionCount || 0) === 0, "platform_action_recorded_by_plan_smoke");
  assert((attemptState.confirmationCount || 0) === 0, "confirmation_recorded_by_plan_smoke");
  assert((attemptState.createdObjectCount || 0) === 0, "created_object_recorded_by_plan_smoke");

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
      hasEnsureMonitor: true,
      stableHash: true
    },
    planScope: {
      exactScopeStatus: exactScope.status,
      outsideScopeStatus: outsideScope.status,
      outsideScopeBlockers: outsideScope.blockers
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
