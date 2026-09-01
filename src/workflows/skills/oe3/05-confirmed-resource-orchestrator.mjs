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
  EVENT_ASSET_CONFIRM_VALUE,
  ensureEventAssetForTargetOnce
} from "../../../platforms/oceanengineEventAssetExecutor.mjs";
import {
  EVENT_CONFIGS_CONFIRM_VALUE,
  ensureEventConfigsForTargetOnce
} from "../../../platforms/oceanengineEventConfigExecutor.mjs";
import {
  DMP_ENSURE_CONFIRM_VALUE
} from "../../dmpExecutionScope.mjs";
import { revokeWriteScope, validateResourcePlanConfirmationScope } from "../../executionGrantScope.mjs";
import { assertNoSensitiveLeak, hashValue, sanitizeForPublic } from "./00-contracts.mjs";
import { FORMAL_CONFIRMED_ACTION_ORDER } from "./04-resource-action-registry.mjs";

const READY_STATUSES = new Set([
  "already_ready_noop",
  "avatar_ready",
  "dmp_ready",
  "video_material_ready",
  "video_material_ready_noop",
  "product_image_ready",
  "product_image_ready_noop",
  "event_asset_ready",
  "event_asset_ready_noop",
  "event_asset_identity_ready",
  "event_configs_ready",
  "event_configs_ready_noop"
]);

function clean(value) {
  return String(value ?? "").trim();
}

function actions(plan = {}) {
  return plan.planned_actions || plan.plannedActions || [];
}

function safeIdToken(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function claimActionId(jobId, actionType, planId = "") {
  const planToken = safeIdToken(planId).slice(-48) || "PLAN";
  return `ACTION-${jobId}-${safeIdToken(actionType)}-${planToken}`;
}

function claimIdempotencyKey(plannedAction = {}, actionId = "", planId = "") {
  return `${plannedAction.idempotency_key || `IDEMP-${actionId}`}:${safeIdToken(planId)}`;
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
    }),
    "ensure_resource:event_asset": ({ repo, jobId, fetchImpl, projectStatePath, plan }) => ensureEventAssetForTargetOnce({
      repo,
      jobId,
      confirmVariableValue: EVENT_ASSET_CONFIRM_VALUE,
      fetchImpl,
      projectStatePath,
      deferFullEventChainUntilConfigs: actions(plan).some((action) => action.action_type === "ensure_event_configs:baseline")
    }),
    "ensure_event_configs:baseline": ({ repo, jobId, fetchImpl, projectStatePath, plan, plannedAction, runtimeContext }) => ensureEventConfigsForTargetOnce({
      repo,
      jobId,
      confirmVariableValue: EVENT_CONFIGS_CONFIRM_VALUE,
      fetchImpl,
      projectStatePath,
      assetIdHint: runtimeContext?.eventAssetId || (() => {
        const targetHint = String(plannedAction?.target_ref || "").split(":").pop();
        return targetHint === "target_event_asset" ? "" : targetHint || plan?.metadata?.event_config_asset_id_hint || "";
      })()
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
      .filter((action) => !FORMAL_CONFIRMED_ACTION_ORDER.includes(action.action_type))
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
  const runtimeContext = {
    eventAssetId: clean((bundle.resources || []).find((resource) =>
      resource.resource_type === "event_asset" && resource.platform_resource_id
    )?.platform_resource_id)
  };
  for (const actionType of FORMAL_CONFIRMED_ACTION_ORDER) {
    if (!planned.has(actionType)) continue;
    const plannedAction = actions(plan).find((action) => action.action_type === actionType) || {};
    const planId = plan.plan_id || plan.planId;
    const actionId = claimActionId(bundle.job.job_id, actionType, planId);
    const idempotencyKey = claimIdempotencyKey(plannedAction, actionId, planId);
    const claim = await repo.claimPlannedExecutionAction({
      actionId,
      jobId: bundle.job.job_id,
      confirmationId: confirmation.confirmation_id,
      planId,
      actionType,
      idempotencyKey
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
    let result;
    try {
      result = await executors[actionType]({
        repo,
        jobId: bundle.job.job_id,
        fetchImpl,
        projectStatePath,
        plan,
        plannedAction,
        runtimeContext
      });
    } catch {
      result = {
        status: "resource_executor_interrupted",
        blockers: ["confirmed_resource_execution_interrupted"],
        platform_write_called: true,
        response_unknown: true,
        retry_allowed: false
      };
    }
    const safe = sanitizeForPublic(result || {});
    if (actionType === "ensure_resource:event_asset" && clean(safe.runtime_event_asset_id)) {
      runtimeContext.eventAssetId = clean(safe.runtime_event_asset_id);
    }
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
      planId,
      actionType,
      idempotencyKey,
      actionStatus: READY_STATUSES.has(safe.status) ? "succeeded" : "failed_once",
      metadata: {
        executor_status: safe.status || "unknown",
        platform_write_called: safe.platform_write_called === true || safe.platformWriteCalled === true,
        response_unknown: safe.response_unknown === true,
        retry_allowed: false
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
  const planId = plan.plan_id || plan.planId || "";
  const consumed = typeof repo.consumeConfirmedResourceExecutionPlan === "function"
    ? await repo.consumeConfirmedResourceExecutionPlan({ jobId: bundle.job.job_id, planId })
    : { consumed: false };
  const passed = {
    status: "passed",
    blockers: [],
    outputSummary: {
      orchestratorStatus: "all_planned_resources_ready",
      executedActionCount: results.length,
      actionResults: results,
      planConsumed: consumed.consumed === true,
      createCalled: false,
      retryAllowed: false
    }
  };
  assertNoSensitiveLeak(passed);
  return passed;
}

export async function executeConfirmedResourcePlan({
  repo,
  jobId,
  expectedPlanId = "",
  expectedPlanHash = "",
  grantSource = "workbench_conversation",
  projectStatePath,
  fetchImpl = globalThis.fetch,
  executorOverrides = {}
} = {}) {
  if (!repo || !jobId) throw new Error("confirmed_resource_plan_job_required");
  let bundle = await repo.getLaunchJobBundle(jobId);
  if (!bundle?.job) throw new Error("job_not_found");
  const plan = bundle.executionPlan || await repo.getLatestLaunchExecutionPlan(jobId);
  const currentPlanId = clean(plan?.plan_id || plan?.planId);
  const currentPlanHash = clean(plan?.plan_hash || plan?.planHash);
  const contextBlockers = [
    ...(expectedPlanId && expectedPlanId !== currentPlanId ? ["execution_plan_id_changed_since_confirmation"] : []),
    ...(expectedPlanHash && expectedPlanHash !== currentPlanHash ? ["execution_plan_hash_changed_since_confirmation"] : [])
  ];
  if (contextBlockers.length) return sanitizeForPublic({ status: "blocked", blockers: contextBlockers, createCalled: false });

  const availability = await validateResourcePlanConfirmationScope({
    repo,
    bundle,
    projectStatePath,
    authorizationSource: grantSource
  });
  if (availability.status !== "passed") {
    return sanitizeForPublic({ status: "blocked", blockers: availability.blockers, createCalled: false });
  }

  const actionTypes = actions(plan).map((action) => action.action_type);
  const confirmationId = `CONFIRM-${jobId}-RESOURCE-PLAN`;
  const confirmationClaim = await repo.claimLaunchExecutionPlanConfirmation({
    confirmationId,
    jobId,
    draftId: "",
    objectType: "account_resource_prepare",
    objectName: "bounded resource preparation",
    payloadHash: "",
    confirmationStatus: "confirmed_for_execution_plan",
    confirmVariable: "workbench:confirm_resource_prepare",
    confirmedBy: grantSource,
    planId: currentPlanId,
    metadata: {
      binding_mode: "single_confirmation_plan",
      plan_hash: currentPlanHash,
      advertiser_id: bundle.job.advertiser_id,
      allowed_actions: actionTypes,
      maximum_actions: actionTypes.length,
      maximum_create_calls: 0,
      retry_allowed: false,
      confirmation_input_hash: hashValue({
        job_id: jobId,
        plan_id: currentPlanId,
        plan_hash: currentPlanHash,
        action_types: actionTypes
      }),
      raw_payload_stored: false,
      raw_response_stored: false
    }
  });
  if (confirmationClaim?.claimed !== true) {
    return sanitizeForPublic({
      status: "blocked",
      blockers: ["execution_plan_confirmation_already_recorded"],
      createCalled: false,
      retryAllowed: false
    });
  }

  try {
    bundle = await repo.getLaunchJobBundle(jobId);
    let orchestrator;
    try {
      orchestrator = await runConfirmedResourceOrchestratorSkill({
        repo,
        bundle,
        fetchImpl,
        projectStatePath,
        executorOverrides
      });
    } catch {
      orchestrator = sanitizeForPublic({
        status: "blocked",
        blockers: ["confirmed_resource_execution_interrupted"],
        outputSummary: {
          orchestratorStatus: "interrupted_after_confirmation",
          executedActionCount: 0,
          createCalled: false,
          responseUnknown: true,
          retryAllowed: false
        }
      });
    }
    if (orchestrator.status !== "passed" && typeof repo.finalizeConfirmedResourceExecutionPlan === "function") {
      await repo.finalizeConfirmedResourceExecutionPlan({
        jobId,
        planId: currentPlanId,
        blockerCode: clean(orchestrator.blockers?.[0]) || "confirmed_resource_execution_interrupted"
      });
    }
    if (typeof repo.upsertLaunchSkillRun === "function") {
      await repo.upsertLaunchSkillRun({
        skillRunId: `${jobId}-confirmed-resource-orchestrator-workbench-1`,
        jobId,
        nodeKey: "std_project_draft_builder",
        skillKey: "confirmed-resource-orchestrator",
        attemptNo: 1,
        status: orchestrator.status === "passed" ? "passed" : "blocked",
        inputHash: hashValue({ jobId, planId: currentPlanId, actionTypes }),
        outputSummary: sanitizeForPublic(orchestrator.outputSummary || {}),
        blockers: orchestrator.blockers || [],
        evidenceRefs: orchestrator.evidenceRefs || [],
        blockerCodes: orchestrator.blockers || [],
        moduleRef: "src/workflows/skills/oe3/05-confirmed-resource-orchestrator.mjs",
        sourceUsage: bundle.job.source_usage || "runtime_truth"
      });
    }
    if (typeof repo.updateJob === "function") {
      await repo.updateJob(jobId, {
        status: orchestrator.status === "passed" ? "completed_confirmed_resource_plan" : "blocked_confirmed_resource_plan",
        currentNode: "5"
      });
    }
    return sanitizeForPublic({
      status: orchestrator.status,
      blockers: orchestrator.blockers || [],
      confirmationId,
      planId: currentPlanId,
      planHash: currentPlanHash,
      outputSummary: orchestrator.outputSummary || {},
      createCalled: false,
      retryAllowed: false
    });
  } finally {
    if (availability.scopeSummary?.authorizationMode !== "workbench_plan_bound") {
      await revokeWriteScope(projectStatePath);
    }
  }
}
