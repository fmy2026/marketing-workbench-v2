import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validatePlanConfirmationScope, validateResourcePlanConfirmationScope } from "../src/workflows/executionGrantScope.mjs";
import { executeConfirmedLaunch, EXECUTION_GRANT_INTENT } from "../src/workflows/executeConfirmedLaunch.mjs";
import { evaluatePlanBoundWriteAuthorization } from "../src/workflows/workbenchRuntimeWritePolicy.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const directory = await mkdtemp(join(tmpdir(), "mwbv2-workbench-policy-"));
const statePath = join(directory, "project.state.json");
const jobId = "JOB-WORKBENCH-RUNTIME-POLICY-SMOKE";
const caseId = "CASE-WORKBENCH-RUNTIME-POLICY-SMOKE";
const advertiserId = "1871922434025472";
const planId = `PLAN-${jobId}-V1`;
const planHash = `sha256:${"a".repeat(64)}`;
const actions = [{ action_type: "ensure_resource:avatar", status: "planned" }];
const plan = {
  plan_id: planId,
  plan_hash: planHash,
  plan_kind: "resource_prepare",
  plan_status: "ready",
  blocker_codes: [],
  planned_actions: actions,
  metadata: {
    execution_scope: {
      binding_mode: "single_confirmation_plan",
      target_job_id: jobId,
      target_advertiser_id: advertiserId,
      target_plan_id: planId,
      target_plan_hash: planHash,
      allowed_actions: actions.map((action) => action.action_type),
      maximum_actions: 1,
      maximum_create_calls: 0,
      retry_allowed: false
    }
  }
};
const bundle = {
  job: {
    job_id: jobId,
    case_id: caseId,
    advertiser_id: advertiserId,
    source_usage: "runtime_truth"
  },
  case: { lifecycle_status: "active" },
  executionPlan: plan
};
let summary = {
  case_id: caseId,
  lifecycle_status: "active",
  latest_job_id: jobId,
  current_gate: "await_job_write_authorization"
};
const repo = {
  async getWorkflowCaseSummary() { return summary; },
  async getLatestLaunchExecutionPlan() { return plan; },
  async getLaunchConfirmationForPlan() { return null; }
};

await writeFile(statePath, `${JSON.stringify({
  guardrails: {
    platform_write_allowed: false,
    workbench_runtime_write_policy: {
      enabled: true,
      mode: "loopback_plan_bound_confirmation_only",
      origin: "http://127.0.0.1:3000",
      allowed_source_usage: ["runtime_truth"],
      allowed_plan_kinds: ["monitor_bootstrap", "resource_prepare", "std_project_create"],
      require_active_case: true,
      require_latest_case_job: true,
      require_exact_plan_binding: true,
      require_exact_confirmation_phrase: true,
      maximum_confirmations_per_plan: 1,
      retry_allowed: false
    }
  }
}, null, 2)}\n`);

try {
  const authorization = await evaluatePlanBoundWriteAuthorization({
    repo,
    bundle,
    plan,
    projectStatePath: statePath,
    authorizationSource: "workbench_view"
  });
  assert(authorization.status === "passed", `runtime_policy_not_passed:${authorization.blockers.join(",")}`);
  assert(authorization.authorizationMode === "workbench_plan_bound", "runtime_policy_mode_not_projected");

  const confirmationScope = await validateResourcePlanConfirmationScope({
    repo,
    bundle,
    projectStatePath: statePath,
    authorizationSource: "workbench_conversation"
  });
  assert(confirmationScope.status === "passed", `resource_confirmation_scope_not_passed:${confirmationScope.blockers.join(",")}`);

  summary = { ...summary, latest_job_id: "JOB-STALE" };
  const stale = await evaluatePlanBoundWriteAuthorization({
    repo,
    bundle,
    plan,
    projectStatePath: statePath,
    authorizationSource: "workbench_conversation"
  });
  assert(stale.blockers.includes("workbench_runtime_latest_job_mismatch"), "historical_job_not_blocked");

  summary = { ...summary, latest_job_id: jobId };
  const wrongSource = await evaluatePlanBoundWriteAuthorization({
    repo,
    bundle,
    plan,
    projectStatePath: statePath,
    authorizationSource: "cli_confirm"
  });
  assert(wrongSource.blockers.includes("workbench_runtime_authorization_source_invalid"), "non_workbench_source_not_blocked");

  const drifted = await evaluatePlanBoundWriteAuthorization({
    repo,
    bundle,
    plan: { ...plan, plan_hash: `sha256:${"b".repeat(64)}` },
    projectStatePath: statePath,
    authorizationSource: "workbench_conversation"
  });
  assert(drifted.blockers.includes("platform_write_scope_plan_hash_mismatch"), "plan_hash_drift_not_blocked");

  const createPlanId = `PLAN-${jobId}-CREATE-V2`;
  const createPlanHash = `sha256:${"c".repeat(64)}`;
  const draftId = `DRAFT-${jobId}`;
  const payloadHash = `sha256:${"d".repeat(64)}`;
  const createPlan = {
    plan_id: createPlanId,
    plan_hash: createPlanHash,
    plan_kind: "std_project_create",
    plan_status: "ready",
    blocker_codes: [],
    planned_actions: [{ action_type: "std_project_create", status: "planned" }],
    metadata: {
      planning_intent: {
        project_name: "WORKBENCH_RUNTIME_POLICY_SMOKE",
        business_intent_hash: `sha256:${"e".repeat(64)}`
      },
      execution_scope: {
        binding_mode: "single_confirmation_plan",
        target_job_id: jobId,
        target_advertiser_id: advertiserId,
        target_draft_id: draftId,
        target_payload_hash: payloadHash,
        target_plan_id: createPlanId,
        target_plan_hash: createPlanHash,
        allowed_actions: ["std_project_create"],
        maximum_actions: 1,
        maximum_create_calls: 1,
        retry_allowed: false
      }
    }
  };
  let createConfirmation = null;
  let createConfirmationClaims = 0;
  let createExecutorCalls = 0;
  const createBundle = {
    ...bundle,
    job: { ...bundle.job, object_type: "std_project", job_status: "draft_ready" },
    nodes: [{ node_key: "account_resource_prepare", status: "passed" }],
    draft: {
      draft_id: draftId,
      payload_hash: payloadHash,
      project_name: "WORKBENCH_RUNTIME_POLICY_SMOKE",
      payload_summary: {
        derived_from_plan_id: createPlanId,
        derived_from_plan_hash: createPlanHash,
        plan_derivation_status: "passed"
      }
    },
    executionPlan: createPlan
  };
  const createRepo = {
    async getWorkflowCaseSummary() { return summary; },
    async getLaunchJobBundle() { return { ...createBundle, executionConfirmation: createConfirmation }; },
    async getLatestLaunchExecutionPlan() { return createPlan; },
    async getLaunchConfirmationForPlan() { return createConfirmation; },
    async getCreateAttemptState() {
      return { createActionCount: 0, createdObjectCount: 0, nextCreateAttemptNo: 1, maximumCreateAttempts: 3 };
    },
    async claimLaunchExecutionPlanConfirmation(input) {
      if (createConfirmation) return { claimed: false };
      createConfirmationClaims += 1;
      createConfirmation = {
        confirmation_id: input.confirmationId,
        job_id: input.jobId,
        plan_id: input.planId,
        confirmation_status: input.confirmationStatus,
        confirmed_by: input.confirmedBy,
        metadata: input.metadata
      };
      return { claimed: true };
    }
  };
  const unboundScope = await validatePlanConfirmationScope({
    repo: createRepo,
    bundle: {
      ...createBundle,
      draft: { ...createBundle.draft, payload_summary: {} }
    },
    projectStatePath: statePath,
    authorizationSource: "workbench_conversation"
  });
  assert(unboundScope.status === "blocked", "unbound_draft_confirmation_must_block");
  assert(unboundScope.blockers.includes("final_draft_not_derived_from_confirmed_plan"), "unbound_draft_blocker_missing");
  assert(createConfirmationClaims === 0, "unbound_draft_must_not_claim_confirmation");
  const executeCreate = () => executeConfirmedLaunch({
    repo: createRepo,
    jobId,
    grantSource: "workbench_conversation",
    executionIntent: EXECUTION_GRANT_INTENT,
    expectedPlanId: createPlanId,
    expectedPlanHash: createPlanHash,
    projectStatePath: statePath,
    getJobViewFn: async () => ({ jobId, caseGate: { currentGate: "await_job_write_authorization" }, phases: [] }),
    runJobFn: async () => {
      createExecutorCalls += 1;
      return {
        jobId,
        caseGate: { currentGate: "run_readback_only" },
        phases: [{ nodes: [{ id: "std_project_create_executor", outputSummary: { createCalled: true, mockCreateCalled: true } }] }]
      };
    }
  });
  const createResults = await Promise.all([executeCreate(), executeCreate()]);
  assert(createConfirmationClaims === 1, "create_plan_confirmation_claim_not_atomic");
  assert(createExecutorCalls === 1, "create_plan_executor_called_more_than_once");
  assert(createResults.filter((item) => item.executionGrant?.status === "consumed").length === 1, "create_plan_atomic_winner_missing");
  assert(createResults.filter((item) => item.executionGrant?.status === "blocked").length === 1, "create_plan_atomic_loser_not_blocked");

  let prewriteConfirmation = null;
  let prewriteFinalizations = 0;
  const prewriteRepo = {
    ...createRepo,
    async getLaunchJobBundle() { return { ...createBundle, executionConfirmation: prewriteConfirmation }; },
    async getLaunchConfirmationForPlan() { return prewriteConfirmation; },
    async claimLaunchExecutionPlanConfirmation(input) {
      if (prewriteConfirmation) return { claimed: false };
      prewriteConfirmation = {
        confirmation_id: input.confirmationId,
        plan_id: input.planId,
        confirmation_status: input.confirmationStatus
      };
      return { claimed: true };
    },
    async finalizeConfirmedCreatePlanBeforeAction() {
      prewriteFinalizations += 1;
      return { finalized: true, jobFinalized: true };
    }
  };
  const prewriteResult = await executeConfirmedLaunch({
    repo: prewriteRepo,
    jobId,
    grantSource: "workbench_conversation",
    executionIntent: EXECUTION_GRANT_INTENT,
    expectedPlanId: createPlanId,
    expectedPlanHash: createPlanHash,
    projectStatePath: statePath,
    getJobViewFn: async () => ({ jobId, caseGate: { currentGate: "prepare_corrective_attempt" }, phases: [] }),
    runJobFn: async () => ({
      jobId,
      caseGate: { currentGate: "prepare_corrective_attempt" },
      phases: [{
        nodes: [{
          id: "std_project_create_executor",
          outputSummary: {
            createNodeStatus: "blocked_before_create",
            createCalled: false,
            blockers: ["final_draft_plan_derivation_not_passed"]
          }
        }]
      }]
    })
  });
  assert(prewriteFinalizations === 1, "confirmed_zero_action_prewrite_plan_not_finalized");
  assert(prewriteResult.executionGrant?.status === "blocked", "prewrite_finalization_should_report_blocked");
  assert(prewriteResult.executionGrant?.createCalled === false, "prewrite_finalization_must_not_create");

  console.log(JSON.stringify({
    status: "passed",
    authorizationMode: authorization.authorizationMode,
    latestJobRequired: true,
    exactPlanHashRequired: true,
    workbenchSourceRequired: true,
    createConfirmationWinnerCount: 1,
    createExecutorCalls,
    confirmedZeroActionPrewriteFinalized: true,
    realPlatformWriteCalled: false
  }, null, 2));
} finally {
  await rm(directory, { recursive: true, force: true });
}
