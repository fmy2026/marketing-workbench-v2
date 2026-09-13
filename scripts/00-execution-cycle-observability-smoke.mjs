import { PostgresRepository } from "../tests/support/repository.mjs";
import { createJob } from "../src/workflows/launchWorkflow.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const repo = new PostgresRepository();
let jobId = "";
try {
  const job = await createJob(repo, {
    user_intent: "推广路线 oceanengine_3_byte_mini_game，游戏 JSZC，账户 1871922175825993",
    route_id: "oceanengine_3_byte_mini_game",
    game_code: "JSZC",
    advertiser_id: "1871922175825993",
    source_usage: "test_run",
    source_record_ref: `smoke:execution-cycle:${new Date().toISOString()}`
  });
  jobId = job.jobId;
  const planId = `PLAN-${jobId}-V1`;
  const planHash = `sha256:${"a".repeat(64)}`;
  await repo.upsertLaunchExecutionPlan({
    planId,
    jobId,
    planVersion: 1,
    planKind: "resource_prepare",
    planStatus: "ready",
    planHash,
    plannedActions: [{ action_type: "ensure_resource:video_asset", status: "planned", maximum_platform_calls: 1 }],
    blockerCodes: [],
    sourceUsage: "test_run",
    metadata: {
      plan_kind: "resource_prepare",
      execution_scope: {
        binding_mode: "single_confirmation_plan",
        target_job_id: jobId,
        target_advertiser_id: "1871922175825993",
        target_plan_id: planId,
        target_plan_hash: planHash,
        allowed_actions: ["ensure_resource:video_asset"],
        maximum_actions: 1,
        maximum_platform_calls: 1,
        retry_allowed: false
      }
    }
  });
  const confirmation = await repo.claimLaunchExecutionPlanConfirmation({
    confirmationId: `CONFIRM-${jobId}-V1`,
    jobId,
    draftId: "",
    objectType: "account_resource_prepare",
    objectName: "resource prepare",
    payloadHash: "",
    confirmationStatus: "confirmed_for_execution_plan",
    confirmVariable: "test:confirm_resource_prepare",
    confirmedBy: "test_smoke",
    planId,
    metadata: { plan_hash: planHash, retry_allowed: false }
  });
  assert(confirmation.claimed === true, "confirmation_claim_must_win_once");
  const duplicate = await repo.claimLaunchExecutionPlanConfirmation({
    confirmationId: `CONFIRM-${jobId}-V1-REPLAY`,
    jobId,
    draftId: "",
    objectType: "account_resource_prepare",
    objectName: "resource prepare",
    payloadHash: "",
    confirmationStatus: "confirmed_for_execution_plan",
    confirmVariable: "test:confirm_resource_prepare",
    confirmedBy: "test_smoke",
    planId,
    metadata: { plan_hash: planHash, retry_allowed: false }
  });
  assert(duplicate.claimed === false && duplicate.alreadyConfirmed === true, "duplicate_confirmation_must_not_reactivate_plan");
  const firstCycle = await repo.startLaunchExecutionCycle({ jobId, mode: "confirmed_resource_execution", planId });
  await repo.upsertLaunchSkillRun({
    skillRunId: `SR-${jobId}-C${firstCycle.cycleNo}-RESOURCE`,
    jobId,
    nodeKey: "account_resource_prepare",
    skillKey: "confirmed-resource-orchestrator",
    executionCycle: firstCycle.cycleNo,
    attemptNo: 1,
    status: "passed",
    inputHash: `sha256:${"b".repeat(64)}`,
    outputSummary: { action_count: 1 },
    blockers: [],
    evidenceRefs: [],
    sourceUsage: "test_run"
  });
  await repo.finishLaunchExecutionCycle({ jobId, cycleNo: firstCycle.cycleNo, status: "completed", summary: { action_count: 1 } });
  const secondCycle = await repo.startLaunchExecutionCycle({ jobId, mode: "readback_only" });
  const bundle = await repo.getLaunchJobBundle(jobId);
  assert(bundle.executionPlan?.plan_status === "executing", "claimed_plan_must_be_executing");
  assert(bundle.executionCycles?.length === 2, "execution_cycles_must_be_retained_per_job");
  assert(bundle.executionCycles?.[0]?.finished_at, "completed_cycle_must_have_finished_at");
  assert(bundle.executionCycles?.[1]?.cycle_status === "running" && !bundle.executionCycles?.[1]?.finished_at, "running_cycle_must_not_fabricate_finished_at");
  assert(bundle.skillRuns?.some((run) => Number(run.execution_cycle) === Number(firstCycle.cycleNo)), "skill_run_must_reference_its_execution_cycle");
  console.log(JSON.stringify({ status: "passed", firstCycle: firstCycle.cycleNo, secondCycle: secondCycle.cycleNo, planStatus: bundle.executionPlan.plan_status }, null, 2));
} finally {
  if (jobId) await repo.deleteTestJobCascade(jobId);
}
