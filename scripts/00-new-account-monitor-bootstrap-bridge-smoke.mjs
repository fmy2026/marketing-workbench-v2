import { buildConfirmationPreview } from "../src/workflows/gateActionPolicy.mjs";
import {
  createWorkflowCase,
  reconcileMonitorAndPersistPlan,
  runWorkbenchInitialReadonly
} from "../src/workflows/launchWorkflow.mjs";

const TARGET = Object.freeze({
  routeId: "oceanengine_3_byte_mini_game",
  gameCode: "JSZC",
  advertiserId: "1999999999999999"
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function caseInput(suffix) {
  return {
    case_key: `smoke.new-account-monitor.${suffix}`,
    route_id: TARGET.routeId,
    game_code: TARGET.gameCode,
    advertiser_id: TARGET.advertiserId,
    business_goal: "Mock-only new-account monitor bootstrap bridge smoke.",
    source_usage: "runtime_truth"
  };
}

let identityMaterialized = false;
let accountBootstrapCalls = 0;
let caseCreates = 0;
const bootstrapRepo = {
  async getCoreContext() {
    return identityMaterialized ? { route: {}, game: {}, account: {} } : null;
  },
  async getGameRouteDefaults() { return { id: "GRD-OE3-JSZC" }; },
  async getAdvertiserAccount() { return null; },
  async getWorkflowCaseByKey() { return null; },
  async getActiveRuntimeWorkflowCase() { return null; },
  async createWorkflowCase(input) {
    caseCreates += 1;
    return { case_id: input.caseId, ...input };
  }
};
const createdCase = await createWorkflowCase(bootstrapRepo, caseInput("success"), {
  accountBootstrapFn: async ({ target }) => {
    accountBootstrapCalls += 1;
    assert(target.advertiserId === TARGET.advertiserId, "account_bootstrap_target_changed");
    identityMaterialized = true;
    return {
      status: "passed",
      accountIdentityWritten: true,
      evidenceArtifactId: "EVIDENCE-ACCOUNT-PREFLIGHT",
      createCalled: false,
      blockers: []
    };
  }
});
assert(Boolean(createdCase.case_id), "runtime_case_not_created_after_account_bootstrap");
assert(accountBootstrapCalls === 1, "account_bootstrap_must_run_once");
assert(caseCreates === 1, "runtime_case_must_be_created_once");

let blockedCaseCreates = 0;
let blockedError = null;
try {
  await createWorkflowCase({
    async getCoreContext() { return null; },
    async getGameRouteDefaults() { return { id: "GRD-OE3-JSZC" }; },
    async getAdvertiserAccount() { return null; },
    async createWorkflowCase() { blockedCaseCreates += 1; }
  }, caseInput("blocked"), {
    accountBootstrapFn: async () => ({
      status: "blocked",
      accountIdentityWritten: false,
      blockers: ["account_identity_unresolved:zero_match"],
      createCalled: false
    })
  });
} catch (error) {
  blockedError = error;
}
assert(blockedError?.message === "account_bootstrap_blocked", "account_discovery_failure_must_fail_closed");
assert(blockedCaseCreates === 0, "blocked_account_discovery_must_not_create_case");

let conflictBootstrapCalls = 0;
let conflictError = null;
try {
  await createWorkflowCase({
    async getCoreContext() { return null; },
    async getGameRouteDefaults() { return { id: "GRD-OE3-JSZC" }; },
    async getAdvertiserAccount() {
      return { route_id: "another_route", game_code: TARGET.gameCode };
    }
  }, caseInput("scope-conflict"), {
    accountBootstrapFn: async () => { conflictBootstrapCalls += 1; }
  });
} catch (error) {
  conflictError = error;
}
assert(conflictError?.message === "advertiser_scope_conflict", "account_scope_conflict_must_fail_closed");
assert(conflictBootstrapCalls === 0, "scope_conflict_must_not_query_or_overwrite_account");

const JOB_ID = "JOB-MOCK-NEW-ACCOUNT-1";
const CASE_ID = "CASE-MOCK-NEW-ACCOUNT-1";
let storedPlan = null;
let readonlyReconcileCalls = 0;
const planRepo = {
  async getLaunchJobBundle() {
    return {
      job: {
        job_id: JOB_ID,
        case_id: CASE_ID,
        route_id: TARGET.routeId,
        game_code: TARGET.gameCode,
        advertiser_id: TARGET.advertiserId,
        object_type: "std_project",
        source_usage: "runtime_truth"
      },
      monitorReadiness: {
        provision_id: "MONPROV-MOCK-1",
        cycle_id: "MONCYCLE-MOCK-1",
        cycle_no: 1,
        readiness_status: "needs_plan"
      },
      executionPlan: storedPlan
    };
  },
  async getLatestLaunchExecutionPlan() { return storedPlan; },
  async getLaunchConfirmationForPlan() { return null; },
  async upsertLaunchExecutionPlan(plan) {
    storedPlan = {
      plan_id: plan.planId,
      job_id: plan.jobId,
      plan_version: plan.planVersion,
      plan_kind: plan.planKind,
      plan_status: plan.planStatus,
      plan_hash: plan.planHash,
      planned_actions: plan.plannedActions,
      blocker_codes: plan.blockerCodes,
      metadata: plan.metadata
    };
  },
  async getLaunchExecutionPlan() { return storedPlan; }
};
const caseSummary = {
  current_gate: "await_job_write_authorization",
  suggested_next_action: "obtain_single_plan_confirmation",
  root_blocker_codes: [],
  latest_job_id: JOB_ID
};
const getPlanView = async (repo) => {
  const bundle = await repo.getLaunchJobBundle(JOB_ID);
  return {
    jobId: JOB_ID,
    caseGate: { currentGate: caseSummary.current_gate, rootBlockerCodes: [] },
    confirmationPreview: buildConfirmationPreview(bundle, caseSummary)
  };
};
const bridge = await reconcileMonitorAndPersistPlan(planRepo, JOB_ID, {
  monitorReadonlyReconcile: async ({ target, jobId }) => {
    readonlyReconcileCalls += 1;
    assert(jobId === JOB_ID, "monitor_reconcile_job_changed");
    assert(target.advertiserId === TARGET.advertiserId, "monitor_reconcile_account_changed");
    return {
      status: "blocked",
      runStatus: "account_resolved",
      blockers: ["monitor_exact_match_missing"],
      createCalled: false,
      monitorBootstrapContract: {
        target,
        provisionId: "MONPROV-MOCK-1",
        cycleId: "MONCYCLE-MOCK-1",
        cycleNo: 1,
        attemptNo: 1,
        createRequestHash: `sha256:${"1".repeat(64)}`,
        configContractHash: `sha256:${"2".repeat(64)}`,
        readonlyEvidenceRef: "EVIDENCE-MONITOR-READONLY-1"
      }
    };
  },
  getJobViewFn: getPlanView
});
assert(bridge.planSaved === true, "monitor_bootstrap_plan_not_saved_ready");
assert(storedPlan?.plan_status === "ready", "monitor_bootstrap_plan_not_ready");
assert(storedPlan?.plan_kind === "monitor_bootstrap", "monitor_bootstrap_plan_kind_changed");
assert(storedPlan?.planned_actions?.length === 1, "monitor_plan_must_have_one_action");
assert(storedPlan.planned_actions[0].action_type === "ensure_monitor", "monitor_plan_action_changed");
assert(bridge.view.confirmationPreview?.confirmationPhrase === "确认创建 monitor", "monitor_confirmation_card_missing");
assert(readonlyReconcileCalls === 1, "monitor_readonly_reconcile_must_run_once");

const duplicate = await reconcileMonitorAndPersistPlan(planRepo, JOB_ID, {
  monitorReadonlyReconcile: async () => { readonlyReconcileCalls += 1; },
  getJobViewFn: getPlanView
});
assert(duplicate.existingReadyPlan === true, "existing_ready_monitor_plan_not_reused");
assert(readonlyReconcileCalls === 1, "existing_ready_plan_must_prevent_duplicate_reconcile");

let initialDryRuns = 0;
let initialBridgeCalls = 0;
const initialView = await runWorkbenchInitialReadonly({}, JOB_ID, {
  runJobFn: async () => {
    initialDryRuns += 1;
    return { caseGate: { currentGate: "run_monitor_readonly" } };
  },
  monitorBridgeFn: async () => {
    initialBridgeCalls += 1;
    return { view: bridge.view, reconcile: { runStatus: "account_resolved" }, planSaved: true };
  }
});
assert(initialDryRuns === 1, "initial_workbench_dry_run_count_changed");
assert(initialBridgeCalls === 1, "initial_monitor_bridge_not_run_once");
assert(initialView.confirmationPreview?.confirmationPhrase === "确认创建 monitor", "initial_flow_did_not_return_monitor_confirmation");

console.log(JSON.stringify({
  status: "passed",
  accountBootstrapCalls,
  caseCreates,
  accountFailureFailClosed: true,
  scopeConflictFailClosed: true,
  monitorReadonlyReconcileCalls: readonlyReconcileCalls,
  monitorPlanActions: storedPlan.planned_actions.map((action) => action.action_type),
  confirmationPhrase: bridge.view.confirmationPreview.confirmationPhrase,
  realPlatformWriteCalled: false
}, null, 2));
