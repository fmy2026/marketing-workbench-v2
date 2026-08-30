import {
  AVATAR_ENSURE_CONFIRM_VALUE,
  ensureAvatarForTargetOnce
} from "../../../platforms/oceanengineAvatarExecutor.mjs";
import { ensureDmpBaselineForTargetOnce } from "../../../platforms/oceanengineDmpExecutor.mjs";
import {
  VIDEO_MATERIAL_CONFIRM_VALUE,
  ensureVideoMaterialBindSetOnce
} from "../../../platforms/oceanengineVideoMaterialExecutor.mjs";
import {
  PRODUCT_IMAGE_CONFIRM_VALUE,
  ensureProductImageForTargetOnce
} from "../../../platforms/oceanengineProductImageExecutor.mjs";
import {
  DMP_ENSURE_CONFIRM_VALUE
} from "../../dmpExecutionScope.mjs";
import { assertNoSensitiveLeak, sanitizeForPublic } from "./00-contracts.mjs";
import { FORMAL_RESOURCE_PREP_ACTION_ORDER } from "./04-resource-action-registry.mjs";

const READY_STATUSES = new Set([
  "already_ready_noop",
  "avatar_ready",
  "dmp_ready",
  "video_material_ready",
  "video_material_ready_noop",
  "product_image_ready",
  "product_image_ready_noop"
]);

function actions(plan = {}) {
  return plan.planned_actions || plan.plannedActions || [];
}

function claimActionId(jobId, actionType) {
  return `ACTION-${jobId}-${actionType.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}-PLAN`;
}

function defaultExecutors() {
  return {
    "ensure_resource:avatar": ({ repo, jobId, fetchImpl, projectStatePath }) => ensureAvatarForTargetOnce({
      repo,
      jobId,
      confirmVariableValue: AVATAR_ENSURE_CONFIRM_VALUE,
      fetchImpl,
      projectStatePath
    }),
    "ensure_resource:dmp_audience_package": ({ repo, jobId, fetchImpl, projectStatePath }) => ensureDmpBaselineForTargetOnce({
      repo,
      jobId,
      confirmVariableValue: DMP_ENSURE_CONFIRM_VALUE,
      fetchImpl,
      projectStatePath
    }),
    "ensure_resource:video_asset": ({ repo, jobId, fetchImpl, projectStatePath }) => ensureVideoMaterialBindSetOnce({
      repo,
      jobId,
      allowNetworkWrite: true,
      confirmVariableValue: VIDEO_MATERIAL_CONFIRM_VALUE,
      fetchImpl,
      projectStatePath
    }),
    "ensure_resource:product_image": ({ repo, jobId, fetchImpl, projectStatePath }) => ensureProductImageForTargetOnce({
      repo,
      jobId,
      confirmVariableValue: PRODUCT_IMAGE_CONFIRM_VALUE,
      fetchImpl,
      projectStatePath
    })
  };
}

export async function runConfirmedResourceOrchestratorSkill({
  repo,
  bundle,
  fetchImpl = globalThis.fetch,
  projectStatePath,
  executorOverrides = {}
} = {}) {
  if (!repo || !bundle?.job) throw new Error("confirmed_resource_orchestrator_bundle_required");
  const plan = bundle.executionPlan || await repo.getLatestLaunchExecutionPlan(bundle.job.job_id);
  const scope = plan?.metadata?.execution_scope || {};
  const planned = new Set(actions(plan).map((action) => action.action_type));
  const confirmation = typeof repo.getLaunchConfirmationForPlan === "function"
    ? await repo.getLaunchConfirmationForPlan(plan?.plan_id || plan?.planId || "")
    : bundle.executionConfirmation || null;
  const preflightBlockers = [
    ...(plan?.plan_status === "ready" || plan?.planStatus === "ready" ? [] : ["execution_plan_not_ready_for_confirmation"]),
    ...(Array.isArray(plan?.blocker_codes || plan?.blockerCodes) && (plan.blocker_codes || plan.blockerCodes).length === 0
      ? []
      : ["execution_plan_has_blockers"]),
    ...(scope.binding_mode === "single_confirmation_plan" ? [] : ["execution_plan_confirmation_model_invalid"]),
    ...(confirmation?.confirmation_status === "confirmed_for_execution_plan" ? [] : ["execution_plan_confirmation_missing"]),
    ...(confirmation?.metadata?.plan_hash === (plan?.plan_hash || plan?.planHash) ? [] : ["execution_plan_confirmation_hash_mismatch"]),
    ...actions(plan)
      .filter((action) => action.action_type !== "std_project_create")
      .filter((action) => !FORMAL_RESOURCE_PREP_ACTION_ORDER.includes(action.action_type))
      .map((action) => `planned_resource_action_executor_missing:${action.action_type}`)
  ];
  if (preflightBlockers.length) {
    return sanitizeForPublic({
      status: "blocked",
      blockers: preflightBlockers,
      outputSummary: {
        orchestratorStatus: "blocked_before_resource_write",
        executedActionCount: 0,
        createCalled: false,
        retryAllowed: false
      }
    });
  }

  const executors = { ...defaultExecutors(), ...executorOverrides };
  const results = [];
  for (const actionType of FORMAL_RESOURCE_PREP_ACTION_ORDER) {
    if (!planned.has(actionType)) continue;
    const plannedAction = actions(plan).find((action) => action.action_type === actionType) || {};
    const actionId = claimActionId(bundle.job.job_id, actionType);
    const claim = await repo.claimPlannedExecutionAction({
      actionId,
      jobId: bundle.job.job_id,
      confirmationId: confirmation.confirmation_id,
      planId: plan.plan_id || plan.planId,
      actionType,
      idempotencyKey: plannedAction.idempotency_key || `IDEMP-${actionId}`
    });
    if (!claim?.claimed) {
      return sanitizeForPublic({
        status: "blocked",
        blockers: [`planned_action_already_consumed:${actionType}`],
        outputSummary: {
          orchestratorStatus: "stopped_before_duplicate_resource_action",
          stoppedAction: actionType,
          executedActionCount: results.length,
          actionResults: results,
          createCalled: false,
          retryAllowed: false
        }
      });
    }
    const result = await executors[actionType]({
      repo,
      jobId: bundle.job.job_id,
      fetchImpl,
      projectStatePath
    });
    const safe = sanitizeForPublic(result || {});
    results.push({
      actionType,
      status: safe.status || "unknown",
      platformWriteCalled: safe.platform_write_called === true || safe.platformWriteCalled === true,
      blockerCount: Array.isArray(safe.blockers) ? safe.blockers.length : 0
    });
    await repo.finishPlannedExecutionAction({
      actionId,
      jobId: bundle.job.job_id,
      confirmationId: confirmation.confirmation_id,
      planId: plan.plan_id || plan.planId,
      actionType,
      idempotencyKey: plannedAction.idempotency_key || `IDEMP-${actionId}`,
      actionStatus: READY_STATUSES.has(safe.status) ? "succeeded" : "failed_once",
      metadata: {
        executor_status: safe.status || "unknown",
        platform_write_called: safe.platform_write_called === true || safe.platformWriteCalled === true
      }
    });
    if (!READY_STATUSES.has(safe.status)) {
      const blocked = {
        status: "blocked",
        blockers: Array.isArray(safe.blockers) && safe.blockers.length
          ? safe.blockers
          : [`planned_resource_action_not_ready:${actionType}:${safe.status || "unknown"}`],
        outputSummary: {
          orchestratorStatus: "stopped_after_resource_failure",
          stoppedAction: actionType,
          executedActionCount: results.length,
          actionResults: results,
          createCalled: false,
          retryAllowed: false
        }
      };
      assertNoSensitiveLeak(blocked);
      return blocked;
    }
  }
  const passed = {
    status: "passed",
    blockers: [],
    outputSummary: {
      orchestratorStatus: "all_planned_resources_ready",
      executedActionCount: results.length,
      actionResults: results,
      createCalled: false,
      retryAllowed: false
    }
  };
  assertNoSensitiveLeak(passed);
  return passed;
}
