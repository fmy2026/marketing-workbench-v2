import { buildExecutionPlanFromBundle } from "../src/workflows/executionPlan.mjs";
import { runConfirmedResourceOrchestratorSkill } from "../src/workflows/skills/oe3/05-confirmed-resource-orchestrator.mjs";
import { OE3_REQUIRED_RESOURCE_TYPES, assertNoSensitiveLeak } from "../src/workflows/skills/oe3/00-contracts.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const jobId = "JOB-MONITOR-FORMAL-BOUNDARY-SMOKE";
const advertiserId = "899900000000001";
const planningIntent = {
  project_name: "TEST_MONITOR_FORMAL_BOUNDARY",
  budget: 88888,
  cpa_bid: 488,
  roi_goal: 0.088,
  business_intent_hash: `sha256:${"b".repeat(64)}`
};
const readyResources = OE3_REQUIRED_RESOURCE_TYPES.map((resourceType) => ({
  resource_type: resourceType,
  visibility_status: "visible",
  readback_status: "readback_verified"
}));
const baseBundle = {
  job: {
    job_id: jobId,
    case_id: "CASE-MONITOR-FORMAL-BOUNDARY-SMOKE",
    route_id: "oceanengine_3_byte_mini_game",
    game_code: "JSZC",
    advertiser_id: advertiserId,
    object_type: "std_project",
    source_usage: "test_run"
  },
  resources: readyResources,
  nodes: []
};

const missingMonitor = buildExecutionPlanFromBundle(baseBundle, { planningIntent });
const missingActions = missingMonitor.plannedActions.map((action) => action.action_type);
assert(missingMonitor.planStatus === "blocked", "missing_monitor_plan_must_be_blocked");
assert(missingMonitor.blockerCodes.includes("monitor_prepare_not_in_formal_executor_registry"), "missing_monitor_blocker_missing");
assert(!missingActions.includes("ensure_monitor"), "ensure_monitor_must_not_enter_formal_plan");
assert(!missingActions.includes("std_project_create"), "missing_monitor_must_block_create_action");

const monitorReady = buildExecutionPlanFromBundle({
  ...baseBundle,
  account: { monitor_id: "245999" }
}, { planningIntent });
assert(monitorReady.planStatus === "ready", "monitor_ready_plan_not_ready");
assert(monitorReady.plannedActions.length === 1, "monitor_ready_plan_action_count_wrong");
assert(monitorReady.plannedActions[0].action_type === "std_project_create", "monitor_ready_create_action_missing");

const corruptPlan = {
  plan_id: `PLAN-${jobId}-V1`,
  plan_hash: `sha256:${"a".repeat(64)}`,
  plan_status: "ready",
  blocker_codes: [],
  planned_actions: [
    { action_type: "ensure_monitor", status: "planned" },
    { action_type: "std_project_create", status: "waiting_on_plan_actions" }
  ],
  metadata: {
    execution_scope: { binding_mode: "single_confirmation_plan" }
  }
};
const confirmation = {
  confirmation_id: `CONFIRM-${jobId}-EXECUTION-PLAN`,
  confirmation_status: "confirmed_for_execution_plan",
  metadata: { plan_hash: corruptPlan.plan_hash }
};
const corruptResult = await runConfirmedResourceOrchestratorSkill({
  repo: {
    getLaunchConfirmationForPlan: async () => confirmation
  },
  bundle: {
    ...baseBundle,
    case: { lifecycle_status: "active" },
    executionPlan: corruptPlan,
    executionConfirmation: confirmation
  },
  executorOverrides: {}
});
assert(corruptResult.status === "blocked", "corrupt_monitor_action_not_blocked");
assert(
  corruptResult.blockers.includes("planned_resource_action_executor_missing:ensure_monitor"),
  "corrupt_monitor_executor_blocker_missing"
);

const result = {
  status: "passed",
  missingMonitorPlanStatus: missingMonitor.planStatus,
  missingMonitorBlocker: missingMonitor.metadata.unique_root_blocker,
  ensureMonitorPlanned: false,
  monitorReadyCreatePlanned: true,
  corruptMonitorActionBlocked: true,
  realPlatformWriteCalled: false,
  tokenRefreshCalled: false
};
assertNoSensitiveLeak(result);
console.log(JSON.stringify(result, null, 2));
