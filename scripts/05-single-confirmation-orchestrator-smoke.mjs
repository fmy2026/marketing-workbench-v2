import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validatePlannedActionGrant } from "../src/workflows/plannedActionGrant.mjs";
import { validatePlanConfirmationScope } from "../src/workflows/executionGrantScope.mjs";
import { runConfirmedResourceOrchestratorSkill } from "../src/workflows/skills/oe3/05-confirmed-resource-orchestrator.mjs";
import { buildExecutionPlanFromBundle, evaluateConfirmedPlanDraftDerivation } from "../src/workflows/executionPlan.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const jobId = "JOB-SINGLE-CONFIRM-SMOKE";
const advertiserId = "1871922434025472";
const planId = `PLAN-${jobId}-V1`;
const planHash = `sha256:${"a".repeat(64)}`;
const resourceActions = [
  "ensure_resource:avatar",
  "ensure_resource:dmp_audience_package",
  "ensure_resource:video_asset",
  "ensure_resource:product_image"
];
const actions = [...resourceActions, "std_project_create"].map((actionType) => ({
  action_type: actionType,
  status: actionType === "std_project_create" ? "waiting_on_plan_actions" : "planned",
  idempotency_key: `IDEMP-${actionType}`
}));
const actionGrants = {
  "ensure_resource:avatar": { maximum_platform_calls: 2, retry_allowed: false },
  "ensure_resource:dmp_audience_package": { maximum_platform_calls: 10, retry_allowed: false },
  "ensure_resource:video_asset": { maximum_platform_calls: 1, retry_allowed: false },
  "ensure_resource:product_image": { maximum_platform_calls: 1, retry_allowed: false },
  std_project_create: { maximum_platform_calls: 1, retry_allowed: false }
};
const plan = {
  plan_id: planId,
  plan_hash: planHash,
  plan_status: "ready",
  blocker_codes: [],
  planned_actions: actions,
  metadata: {
    planning_intent: {
      project_name: "245828_N_JSZC_HUNT_PAY7DROI_平台定向不限_P99_20260830",
      business_intent_hash: `sha256:${"b".repeat(64)}`
    },
    execution_scope: {
      binding_mode: "single_confirmation_plan",
      target_job_id: jobId,
      target_advertiser_id: advertiserId,
      target_plan_id: planId,
      target_plan_hash: planHash,
      allowed_actions: actions.map((action) => action.action_type),
      maximum_actions: actions.length,
      maximum_create_calls: 1,
      action_grants: actionGrants,
      retry_allowed: false
    }
  }
};
const confirmation = {
  confirmation_id: `CONFIRM-${jobId}-EXECUTION-PLAN`,
  job_id: jobId,
  plan_id: planId,
  confirmation_status: "confirmed_for_execution_plan",
  metadata: { plan_hash: planHash, retry_allowed: false }
};
const bundle = {
  job: { job_id: jobId, advertiser_id: advertiserId, source_usage: "test_run", object_type: "std_project" },
  case: { lifecycle_status: "active" },
  executionPlan: plan,
  executionConfirmation: confirmation
};
const repo = {
  getLatestLaunchExecutionPlan: async () => plan,
  getLaunchConfirmationForPlan: async () => confirmation,
  getCreateAttemptState: async () => ({ createActionCount: 0, createdObjectCount: 0 }),
  claimPlannedExecutionAction: async () => ({ claimed: true }),
  finishPlannedExecutionAction: async () => undefined,
  consumeConfirmedResourceExecutionPlan: async () => ({ consumed: true })
};

const directory = await mkdtemp(join(tmpdir(), "mwbv2-single-confirm-"));
const statePath = join(directory, "project.state.json");
await writeFile(statePath, `${JSON.stringify({ guardrails: { platform_write_allowed: true } }, null, 2)}\n`);

try {
  const resourceReady = (resourceType) => ({
    resource_type: resourceType,
    visibility_status: "visible",
    readback_status: "readback_verified"
  });
  const planBundle = {
    job: {
      job_id: jobId,
      case_id: "CASE-SINGLE-CONFIRM-SMOKE",
      route_id: "oceanengine_3_byte_mini_game",
      game_code: "JSZC",
      advertiser_id: advertiserId,
      object_type: "std_project",
      source_usage: "test_run"
    },
    account: { monitor_id: "245828" },
    draft: {
      draft_id: `DRAFT-${jobId}`,
      payload_hash: `sha256:${"f".repeat(64)}`
    },
    resources: [
      resourceReady("event_asset"),
      resourceReady("brand_info"),
      resourceReady("micro_app_instance"),
      resourceReady("backup_landing_page")
    ],
    nodes: []
  };
  const compiledMultiAction = buildExecutionPlanFromBundle(planBundle, {
    planningIntent: plan.metadata.planning_intent,
    maximumCreateAttempts: 1,
    actionCallLimits: { "ensure_resource:dmp_audience_package": 10 }
  });
  assert(compiledMultiAction.planStatus === "ready", "multi_action_plan_not_ready");
  assert(compiledMultiAction.plannedActions.length === 4, "multi_action_plan_action_count_wrong");
  assert(!compiledMultiAction.plannedActions.some((action) => action.action_type === "std_project_create"), "resource_plan_must_not_include_create_action");
  assert(compiledMultiAction.metadata.execution_scope.maximum_create_calls === 0, "resource_plan_create_calls_must_be_zero");
  assert(compiledMultiAction.metadata.resource_states.filter((item) => item.state === "PLANNED").length === 4, "node4_planned_state_count_wrong");
  assert(compiledMultiAction.metadata.resource_states.filter((item) => item.state === "READY").length === 4, "node4_ready_state_count_wrong");

  const blockedBundle = {
    ...planBundle,
    resources: planBundle.resources.filter((item) => item.resource_type !== "micro_app_instance")
  };
  const compiledBlocked = buildExecutionPlanFromBundle(blockedBundle, { planningIntent: plan.metadata.planning_intent });
  assert(compiledBlocked.planStatus === "blocked", "blocked_resource_plan_status_wrong");
  assert(!compiledBlocked.plannedActions.some((action) => action.action_type === "std_project_create"), "blocked_plan_must_not_contain_create");
  assert(compiledBlocked.metadata.unique_root_blocker === "resource_prepare_unsupported:micro_app_instance", "unique_root_blocker_wrong");

  const derivedDraft = {
    projectName: plan.metadata.planning_intent.project_name,
    payloadHash: `sha256:${"c".repeat(64)}`,
    payloadSummary: { budget: 88888, bid: 488, roi_goal: 0.088 }
  };
  const derivationPlan = {
    ...plan,
    metadata: {
      ...plan.metadata,
      planning_intent: {
        ...plan.metadata.planning_intent,
        budget: 88888,
        cpa_bid: 488,
        roi_goal: 0.088
      }
    }
  };
  const derived = evaluateConfirmedPlanDraftDerivation({ plan: derivationPlan, draft: derivedDraft });
  assert(derived.status === "passed", "confirmed_plan_draft_derivation_not_passed");
  const drifted = evaluateConfirmedPlanDraftDerivation({
    plan: derivationPlan,
    draft: { ...derivedDraft, payloadSummary: { ...derivedDraft.payloadSummary, bid: 489 } }
  });
  assert(drifted.status === "blocked", "confirmed_plan_draft_drift_not_blocked");
  assert(drifted.blockers.includes("confirmed_plan_bid_derivation_mismatch"), "confirmed_plan_bid_drift_blocker_missing");

  const avatarGrant = await validatePlannedActionGrant({
    repo,
    bundle,
    actionType: "ensure_resource:avatar",
    projectStatePath: statePath,
    expectedMaximumPlatformCalls: 2
  });
  assert(avatarGrant.status === "passed", `avatar_plan_grant_blocked:${avatarGrant.blockers.join(",")}`);
  assert(avatarGrant.confirmation?.confirmation_id === confirmation.confirmation_id, "shared_confirmation_not_resolved");
  for (const actionType of resourceActions) {
    const grant = await validatePlannedActionGrant({
      repo,
      bundle,
      actionType,
      projectStatePath: statePath,
      expectedMaximumPlatformCalls: actionGrants[actionType].maximum_platform_calls
    });
    assert(grant.status === "passed", `shared_confirmation_did_not_authorize:${actionType}:${grant.blockers.join(",")}`);
    assert(grant.confirmation?.confirmation_id === confirmation.confirmation_id, `confirmation_drift:${actionType}`);
  }

  const outsidePlan = await validatePlannedActionGrant({
    repo,
    bundle,
    actionType: "ensure_resource:outside_plan",
    projectStatePath: statePath,
    expectedMaximumPlatformCalls: 1
  });
  assert(outsidePlan.status === "blocked", "outside_plan_action_not_blocked");

  const confirmable = await validatePlanConfirmationScope({
    repo: { ...repo, getLaunchConfirmationForPlan: async () => null },
    bundle,
    projectStatePath: statePath
  });
  assert(confirmable.status === "passed", `ready_plan_not_confirmable:${confirmable.blockers.join(",")}`);

  const order = [];
  const executorOverrides = Object.fromEntries(resourceActions.map((actionType) => [actionType, async () => {
    order.push(actionType);
    return {
      status: {
        "ensure_resource:avatar": "avatar_ready",
        "ensure_resource:dmp_audience_package": "dmp_ready",
        "ensure_resource:video_asset": "video_material_ready",
        "ensure_resource:product_image": "product_image_ready"
      }[actionType],
      platform_write_called: false
    };
  }]));
  const passed = await runConfirmedResourceOrchestratorSkill({ repo, bundle, projectStatePath: statePath, executorOverrides });
  assert(passed.status === "passed", "confirmed_resource_orchestrator_not_passed");
  assert(order.join(",") === resourceActions.join(","), "resource_action_order_mismatch");
  assert(passed.outputSummary.createCalled === false, "orchestrator_must_not_call_create");
  assert(passed.outputSummary.planConsumed === true, "resource_plan_not_consumed_after_all_readbacks");

  const consumedActions = new Set();
  const atomicRepo = {
    ...repo,
    claimPlannedExecutionAction: async ({ actionType }) => {
      if (consumedActions.has(actionType)) return { claimed: false };
      consumedActions.add(actionType);
      return { claimed: true };
    }
  };
  const firstAtomic = await runConfirmedResourceOrchestratorSkill({
    repo: atomicRepo,
    bundle,
    projectStatePath: statePath,
    executorOverrides
  });
  const secondAtomic = await runConfirmedResourceOrchestratorSkill({
    repo: atomicRepo,
    bundle,
    projectStatePath: statePath,
    executorOverrides
  });
  assert(firstAtomic.status === "passed", "first_atomic_resource_consumption_failed");
  assert(secondAtomic.status === "blocked", "second_atomic_resource_consumption_not_blocked");
  assert(secondAtomic.blockers[0] === "planned_action_already_consumed:ensure_resource:avatar", "duplicate_action_blocker_wrong");

  const failedOrder = [];
  const failed = await runConfirmedResourceOrchestratorSkill({
    repo,
    bundle,
    projectStatePath: statePath,
    executorOverrides: {
      ...executorOverrides,
      "ensure_resource:avatar": async () => {
        failedOrder.push("ensure_resource:avatar");
        return { status: "avatar_ready", platform_write_called: false };
      },
      "ensure_resource:dmp_audience_package": async () => {
        failedOrder.push("ensure_resource:dmp_audience_package");
        return { status: "dmp_batch_readback_pending", platform_write_called: false };
      },
      "ensure_resource:video_asset": async () => {
        failedOrder.push("ensure_resource:video_asset");
        return { status: "video_material_ready", platform_write_called: false };
      }
    }
  });
  assert(failed.status === "blocked", "resource_failure_did_not_stop_orchestrator");
  assert(!failedOrder.includes("ensure_resource:video_asset"), "orchestrator_did_not_fail_fast");
  assert(failed.outputSummary.createCalled === false, "resource_failure_must_not_call_create");

  console.log(JSON.stringify({
    status: "passed",
    onePlan: planId,
    oneConfirmation: confirmation.confirmation_id,
    plannedActionCount: actions.length,
    readyResourceCount: compiledMultiAction.metadata.resource_states.filter((item) => item.state === "READY").length,
    plannedResourceCount: compiledMultiAction.metadata.resource_states.filter((item) => item.state === "PLANNED").length,
    uniqueBlockedRoot: compiledBlocked.metadata.unique_root_blocker,
    executedResourceActionCount: passed.outputSummary.executedActionCount,
    outsidePlanBlocked: true,
    duplicateResourceConsumptionBlocked: true,
    failFastBeforeCreate: true,
    finalDraftDerivationDriftBlocked: true,
    realPlatformWriteCalled: false
  }, null, 2));
} finally {
  await rm(directory, { recursive: true, force: true });
}
