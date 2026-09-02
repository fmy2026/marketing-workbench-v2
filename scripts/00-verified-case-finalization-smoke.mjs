import { finalizeVerifiedStdProjectRuntimeCase } from "../src/workflows/finalizeVerifiedStdProjectRuntimeCase.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function fixture({
  planStatus = "ready",
  readbackStatus = "readback_verified",
  readbackObjectId = "7680763113444425770",
  readbackObjectName = "VERIFIED_FINALIZATION_SMOKE",
  latestJobId = "JOB-VERIFIED-FINALIZATION-SMOKE"
} = {}) {
  const state = {
    planStatus,
    lifecycleStatus: "active",
    calls: []
  };
  const jobId = "JOB-VERIFIED-FINALIZATION-SMOKE";
  const caseId = "CASE-VERIFIED-FINALIZATION-SMOKE";
  const planId = "PLAN-VERIFIED-FINALIZATION-SMOKE-V1";
  const bundle = () => ({
    job: { job_id: jobId, case_id: caseId, source_usage: "runtime_truth" },
    case: { case_id: caseId, lifecycle_status: state.lifecycleStatus },
    draft: { project_name: "VERIFIED_FINALIZATION_SMOKE" },
    executionPlan: { plan_id: planId, plan_kind: "std_project_create", plan_status: state.planStatus },
    platformAction: {
      plan_id: planId,
      action_type: "oceanengine_std_project_create",
      action_status: "succeeded",
      object_id_present: true
    },
    createdObject: {
      object_id: "7680763113444425770",
      object_name: "VERIFIED_FINALIZATION_SMOKE"
    },
    readback: {
      object_id: readbackObjectId,
      object_name: readbackObjectName,
      readback_status: readbackStatus
    }
  });
  const repo = {
    async getLaunchJobBundle() { return bundle(); },
    async getWorkflowCaseSummary() {
      return {
        latest_job_id: latestJobId,
        current_gate: readbackStatus === "readback_verified"
          ? "first_std_project_create_completed"
          : "run_readback_only"
      };
    },
    async markConfirmedStdProjectCreatePlanWaitingReadback() {
      state.calls.push("waiting_readback");
      if (state.planStatus === "ready") state.planStatus = "waiting_readback";
      return { transitioned: true };
    },
    async consumeConfirmedStdProjectCreatePlanAfterReadback() {
      state.calls.push("consumed");
      if (state.planStatus === "waiting_readback") state.planStatus = "consumed";
      return { consumed: true };
    },
    async completeVerifiedStdProjectRuntimeCase() {
      state.calls.push("case_completed");
      assert(state.planStatus === "consumed", "case_must_not_complete_before_plan_consumed");
      state.lifecycleStatus = "completed";
      return { completed: true };
    }
  };
  return { state, repo, jobId, caseId, planId };
}

const verified = fixture();
const verifiedResult = await finalizeVerifiedStdProjectRuntimeCase({
  repo: verified.repo,
  jobId: verified.jobId,
  getJobViewFn: async () => ({ caseGate: { currentGate: "first_std_project_create_completed" } })
});
assert(verifiedResult.finalized === true, "verified_runtime_case_must_finalize");
assert(
  JSON.stringify(verified.state.calls) === JSON.stringify(["waiting_readback", "consumed", "case_completed"]),
  "verified_finalization_order_changed"
);
assert(verified.state.lifecycleStatus === "completed", "verified_runtime_case_lifecycle_not_completed");

verified.state.calls.length = 0;
const repeated = await finalizeVerifiedStdProjectRuntimeCase({ repo: verified.repo, jobId: verified.jobId });
assert(repeated.finalized === true, "repeated_verified_finalization_must_be_idempotent");
assert(JSON.stringify(verified.state.calls) === JSON.stringify(["case_completed"]), "repeated_finalization_must_not_repeat_plan_transitions");

for (const [label, options, expectedReason] of [
  ["pending", { readbackStatus: "not_found_after_create" }, "verified_finalization_gate_not_completed"],
  ["transport", { readbackStatus: "transport_error" }, "verified_finalization_gate_not_completed"],
  ["id_mismatch", { readbackObjectId: "7680763113444425771" }, "verified_finalization_project_id_mismatch"],
  ["name_mismatch", { readbackObjectName: "OTHER_PROJECT" }, "verified_finalization_project_name_mismatch"],
  ["historical_job", { latestJobId: "JOB-OTHER" }, "verified_finalization_latest_case_job_required"]
]) {
  const scenario = fixture(options);
  const result = await finalizeVerifiedStdProjectRuntimeCase({ repo: scenario.repo, jobId: scenario.jobId });
  assert(result.finalized === false, `${label}_must_not_finalize`);
  assert(result.reason === expectedReason, `${label}_reason_changed`);
  assert(scenario.state.calls.length === 0, `${label}_must_not_mutate_plan_or_case`);
}

console.log(JSON.stringify({
  status: "passed",
  transitionOrder: ["ready", "waiting_readback", "consumed", "case_completed"],
  repeatedFinalization: "idempotent",
  platformCalls: 0
}, null, 2));
