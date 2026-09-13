import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ACTION_ENSURE_MONITOR,
  ACTION_STD_PROJECT_CREATE,
  PLAN_KIND_MONITOR_BOOTSTRAP,
  PLAN_KIND_RESOURCE_PREPARE,
  STD_PROJECT_40100_REDELIVERY_CONTRACT,
  resolveFreshResourceActionContracts,
  validateExecutionPlanActionScope
} from "./executionPlan.mjs";
import { FORMAL_CONFIRMED_ACTION_ORDER } from "./skills/oe3/04-resource-action-registry.mjs";
import {
  DEFAULT_PROJECT_STATE_PATH,
  evaluatePlanBoundWriteAuthorization
} from "./workbenchRuntimeWritePolicy.mjs";

const rootDir = normalize(join(dirname(fileURLToPath(import.meta.url)), "../.."));
const defaultProjectStatePath = DEFAULT_PROJECT_STATE_PATH;
export const CREATE_ACTION = "oceanengine_std_project_create";

async function readProjectState(projectStatePath = defaultProjectStatePath) {
  return JSON.parse(await readFile(projectStatePath, "utf8"));
}

async function writeProjectState(projectStatePath, state) {
  await writeFile(projectStatePath, `${JSON.stringify(state, null, 2)}\n`);
}

function actionScopeAllowsOnlyCreate(actions = []) {
  return Array.isArray(actions) && actions.length === 1 && actions[0] === CREATE_ACTION;
}

function readyCreatePlanDraftBindingBlockers({ bundle = {}, plan = {}, scope = {} } = {}) {
  const draft = bundle.draft || {};
  const summary = draft.payload_summary || draft.payloadSummary || {};
  const nodeFour = (bundle.nodes || []).find((node) => node.node_key === "account_resource_prepare");
  return [
    ...(bundle.job?.job_status === "draft_ready" ? [] : ["execution_job_not_stable_for_confirmation"]),
    ...(nodeFour?.status === "passed" ? [] : ["account_resource_prepare_not_passed_for_confirmation"]),
    ...(draft.draft_id === scope.target_draft_id ? [] : ["execution_plan_draft_id_mismatch"]),
    ...(draft.payload_hash === scope.target_payload_hash ? [] : ["execution_plan_payload_hash_mismatch"]),
    ...(summary.derived_from_plan_id === plan?.plan_id ? [] : ["final_draft_not_derived_from_confirmed_plan"]),
    ...(summary.derived_from_plan_hash === plan?.plan_hash ? [] : ["final_draft_confirmed_plan_hash_mismatch"]),
    ...(summary.plan_derivation_status === "passed" ? [] : ["final_draft_plan_derivation_not_passed"])
  ];
}

function optionalPlanScopeBlockers(scope = {}, plan = null) {
  if (!scope.target_plan_id && !scope.target_plan_hash && !Array.isArray(scope.allowed_plan_actions)) return [];
  const blockers = [];
  if (!plan) blockers.push("platform_write_scope_plan_missing");
  if (scope.target_plan_id && scope.target_plan_id !== plan?.plan_id) blockers.push("platform_write_scope_plan_id_mismatch");
  if (scope.target_plan_hash && scope.target_plan_hash !== plan?.plan_hash) blockers.push("platform_write_scope_plan_hash_mismatch");
  if (Array.isArray(scope.allowed_plan_actions)) {
    const actionScope = validateExecutionPlanActionScope({
      plan,
      allowedActions: scope.allowed_plan_actions
    });
    blockers.push(...actionScope.blockers);
  }
  return blockers;
}

function actionMaximumPlatformCalls(action = {}) {
  return Number(action.maximum_platform_calls ?? action.maximumPlatformCalls ?? 0);
}

function actionGrantMaximumPlatformCalls(scope = {}, actionType = "") {
  const grant = scope.action_grants?.[actionType] || scope.actionGrants?.[actionType] || {};
  return Number(grant.maximum_platform_calls ?? grant.maximumPlatformCalls ?? 0);
}

function sameRateLimitRedeliveryContract(value = {}) {
  const expected = STD_PROJECT_40100_REDELIVERY_CONTRACT;
  return value &&
    value.endpoint === expected.endpoint &&
    value.api_code === expected.api_code &&
    Number(value.maximum_delivery_calls) === expected.maximum_delivery_calls &&
    Array.isArray(value.scheduled_offsets_ms) &&
    value.scheduled_offsets_ms.length === expected.scheduled_offsets_ms.length &&
    value.scheduled_offsets_ms.every((offset, index) => Number(offset) === expected.scheduled_offsets_ms[index]) &&
    Number(value.jitter_max_ms) === expected.jitter_max_ms &&
    Number(value.maximum_total_elapsed_ms) === expected.maximum_total_elapsed_ms;
}

function stdProjectCreateDeliveryContractBlockers({ scope = {}, createAction = {} } = {}) {
  const actionGrant = scope.action_grants?.[ACTION_STD_PROJECT_CREATE] ||
    scope.actionGrants?.[ACTION_STD_PROJECT_CREATE] || {};
  const policy = scope.rate_limit_redelivery;
  return [
    ...(sameRateLimitRedeliveryContract(policy) ? [] : ["std_project_rate_limit_redelivery_scope_invalid"]),
    ...(sameRateLimitRedeliveryContract(createAction.rate_limit_redelivery) ? [] : ["std_project_rate_limit_redelivery_action_invalid"]),
    ...(sameRateLimitRedeliveryContract(actionGrant.rate_limit_redelivery) ? [] : ["std_project_rate_limit_redelivery_grant_invalid"]),
    ...(actionMaximumPlatformCalls(createAction) === STD_PROJECT_40100_REDELIVERY_CONTRACT.maximum_delivery_calls
      ? []
      : ["std_project_rate_limit_redelivery_action_call_limit_invalid"]),
    ...(actionGrantMaximumPlatformCalls(scope, ACTION_STD_PROJECT_CREATE) === STD_PROJECT_40100_REDELIVERY_CONTRACT.maximum_delivery_calls
      ? []
      : ["std_project_rate_limit_redelivery_grant_call_limit_invalid"]),
    ...(Number(scope.maximum_platform_calls) === STD_PROJECT_40100_REDELIVERY_CONTRACT.maximum_delivery_calls
      ? []
      : ["std_project_rate_limit_redelivery_scope_call_limit_invalid"])
  ];
}

export async function validateWriteScope({ repo, bundle, projectStatePath = defaultProjectStatePath }) {
  const state = await readProjectState(projectStatePath);
  const attemptState = await repo.getCreateAttemptState(bundle.job.job_id);
  const plan = bundle.executionPlan || await repo.getLatestLaunchExecutionPlan(bundle.job.job_id);
  const testCompatibilityScope = (bundle.job.source_usage === "test_run" || projectStatePath !== defaultProjectStatePath)
    ? state.guardrails?.platform_write_scope || {}
    : {};
  const planScope = plan?.metadata?.execution_scope || plan?.metadata?.executionScope || {};
  const defaultScope = {
    target_job_id: bundle.job.job_id,
    target_draft_id: bundle.draft?.draft_id || "",
    target_payload_hash: bundle.draft?.payload_hash || "",
    target_plan_id: plan?.plan_id || "",
    target_plan_hash: plan?.plan_hash || "",
    allowed_actions: [CREATE_ACTION],
    maximum_actions: 1,
    target_attempt_no: Number(plan?.metadata?.create_attempt_no || plan?.plan_version || 1),
    maximum_total_attempts: Number(plan?.metadata?.maximum_create_attempts || 3),
    retry_allowed: false,
    ...planScope
  };
  const scope = {
    ...defaultScope,
    ...(Object.keys(testCompatibilityScope).length ? testCompatibilityScope : {})
  };
  const verificationSeriesId = scope.verification_series_id || "";
  const verificationSeriesState = verificationSeriesId
    ? await repo.getCaseCreateVerificationSeriesState({
      caseId: bundle.job.case_id,
      verificationSeriesId,
      maximumCreateAttempts: Number(scope.maximum_total_attempts || 3)
    })
    : null;
  const effectiveAttemptState = verificationSeriesState || attemptState;
  const planSeriesId = planScope.verification_series_id || "";
  const planSeriesTaskRef = planScope.task_ref || "";
  const planScopeBlockers = optionalPlanScopeBlockers(scope, plan);
  const blockers = [
    ...(state.guardrails?.platform_write_allowed === true ? [] : ["platform_write_scope_not_enabled"]),
    ...(bundle.case?.lifecycle_status === "active" ? [] : ["workflow_case_not_active"]),
    ...(scope.target_job_id === bundle.job.job_id ? [] : ["platform_write_scope_job_mismatch"]),
    ...(scope.target_draft_id === bundle.draft?.draft_id ? [] : ["platform_write_scope_draft_mismatch"]),
    ...(scope.target_payload_hash === bundle.draft?.payload_hash ? [] : ["platform_write_scope_payload_hash_mismatch"]),
    ...(actionScopeAllowsOnlyCreate(scope.allowed_actions) ? [] : ["platform_write_scope_allowed_actions_invalid"]),
    ...(Number(scope.maximum_actions) === 1 ? [] : ["platform_write_scope_maximum_actions_invalid"]),
    ...(Number(scope.maximum_total_attempts) === 3 ? [] : ["platform_write_scope_maximum_total_attempts_invalid"]),
    ...(verificationSeriesId === planSeriesId ? [] : ["platform_write_scope_verification_series_mismatch"]),
    ...(verificationSeriesId && !planSeriesTaskRef ? ["platform_write_scope_verification_task_ref_missing"] : []),
    ...(Number(scope.target_attempt_no) === Number(effectiveAttemptState.nextCreateAttemptNo) ? [] : ["platform_write_scope_attempt_number_mismatch"]),
    ...(Number(scope.target_attempt_no) <= Number(effectiveAttemptState.maximumCreateAttempts) ? [] : ["platform_write_scope_attempt_limit_reached"]),
    ...(verificationSeriesState && Number(verificationSeriesState.createdObjectCount || 0) > 0 ? ["verification_series_created_object_already_recorded"] : []),
    ...(verificationSeriesState && Number(verificationSeriesState.readbackVerifiedCount || 0) > 0 ? ["verification_series_readback_already_verified"] : []),
    ...(scope.retry_allowed === false ? [] : ["platform_write_scope_retry_allowed_must_be_false"]),
    ...((attemptState.createdObjectCount || 0) > 0 ? ["created_object_already_recorded"] : []),
    ...planScopeBlockers
  ];
  return {
    status: blockers.length ? "blocked" : "passed",
    blockers,
    attemptState,
    scopeSummary: {
      platformWriteAllowed: state.guardrails?.platform_write_allowed === true,
      workflowCaseActive: bundle.case?.lifecycle_status === "active",
      targetJobMatches: scope.target_job_id === bundle.job.job_id,
      targetDraftMatches: scope.target_draft_id === bundle.draft?.draft_id,
      targetPayloadHashMatches: scope.target_payload_hash === bundle.draft?.payload_hash,
      allowedActionsValid: actionScopeAllowsOnlyCreate(scope.allowed_actions),
      targetPlanMatches: !scope.target_plan_id || scope.target_plan_id === plan?.plan_id,
      targetPlanHashMatches: !scope.target_plan_hash || scope.target_plan_hash === plan?.plan_hash,
      allowedPlanActionsValid: !Array.isArray(scope.allowed_plan_actions) || planScopeBlockers.length === 0,
      maximumActions: Number(scope.maximum_actions || 0),
      targetAttemptNo: Number(scope.target_attempt_no || 0),
      maximumTotalAttempts: Number(scope.maximum_total_attempts || 0),
      retryAllowed: scope.retry_allowed === true,
      verificationSeriesId,
      verificationSeriesTaskRef: planSeriesTaskRef,
      verificationSeriesActionCount: verificationSeriesState ? Number(verificationSeriesState.createActionCount || 0) : 0,
      verificationSeriesCreatedObjectCount: verificationSeriesState ? Number(verificationSeriesState.createdObjectCount || 0) : 0,
      verificationSeriesReadbackVerifiedCount: verificationSeriesState ? Number(verificationSeriesState.readbackVerifiedCount || 0) : 0
    }
  };
}

export async function validatePlanConfirmationScope({
  repo,
  bundle,
  projectStatePath = defaultProjectStatePath,
  authorizationSource = "workbench_view",
  authenticatedUserId = ""
}) {
  const state = await readProjectState(projectStatePath);
  const plan = bundle.executionPlan || await repo.getLatestLaunchExecutionPlan(bundle.job.job_id);
  const authorization = await evaluatePlanBoundWriteAuthorization({
    repo,
    bundle,
    plan,
    projectStatePath,
    authorizationSource,
    authenticatedUserId
  });
  const scope = plan?.metadata?.execution_scope || {};
  const actions = plan?.planned_actions || plan?.plannedActions || [];
  const blockerCodes = plan?.blocker_codes || plan?.blockerCodes || [];
  const createActions = actions.filter((action) => action.action_type === ACTION_STD_PROJECT_CREATE);
  const createAction = createActions[0] || {};
  const existingConfirmation = typeof repo.getLaunchConfirmationForPlan === "function"
    ? await repo.getLaunchConfirmationForPlan(plan?.plan_id || plan?.planId || "")
    : null;
  const confirmedCreatePlan = typeof repo.getConfirmedStdProjectCreatePlanForJob === "function"
    ? await repo.getConfirmedStdProjectCreatePlanForJob(bundle.job.job_id)
    : null;
  const confirmedCreatePlanId = confirmedCreatePlan?.plan_id || confirmedCreatePlan?.planId || "";
  const currentPlanId = plan?.plan_id || plan?.planId || "";
  const differentConfirmedCreatePlan = Boolean(confirmedCreatePlanId && confirmedCreatePlanId !== currentPlanId);
  const attemptState = await repo.getCreateAttemptState(bundle.job.job_id);
  const actionScope = validateExecutionPlanActionScope({
    plan,
    allowedActions: scope.allowed_actions || []
  });
  const blockers = [
    ...authorization.blockers,
    ...(bundle.case?.lifecycle_status === "active" ? [] : ["workflow_case_not_active"]),
    ...(plan?.plan_status === "ready" ? [] : ["execution_plan_not_ready_for_confirmation"]),
    ...(blockerCodes.length === 0 ? [] : ["execution_plan_has_blockers"]),
    ...(scope.binding_mode === "single_confirmation_plan" ? [] : ["execution_plan_confirmation_model_invalid"]),
    ...(scope.target_job_id === bundle.job.job_id ? [] : ["platform_write_scope_job_mismatch"]),
    ...(scope.target_advertiser_id === bundle.job.advertiser_id ? [] : ["platform_write_scope_advertiser_mismatch"]),
    ...(scope.target_plan_id === plan?.plan_id ? [] : ["platform_write_scope_plan_id_mismatch"]),
    ...(scope.target_plan_hash === plan?.plan_hash ? [] : ["platform_write_scope_plan_hash_mismatch"]),
    ...(actionScope.status === "passed" ? [] : actionScope.blockers),
    ...(Number(scope.maximum_actions) === actions.length && actions.length > 0 ? [] : ["platform_write_scope_maximum_actions_invalid"]),
    ...(createActions.length === 1 ? [] : ["execution_plan_create_action_count_invalid"]),
    ...(Number(scope.maximum_create_calls) === 1 ? [] : ["execution_plan_create_call_limit_invalid"]),
    ...stdProjectCreateDeliveryContractBlockers({ scope, createAction }),
    ...(scope.retry_allowed === false ? [] : ["platform_write_scope_retry_allowed_must_be_false"]),
    ...(differentConfirmedCreatePlan ? ["execution_job_has_confirmed_create_plan"] : []),
    ...(existingConfirmation ? ["execution_plan_confirmation_already_recorded"] : []),
    ...(Number(attemptState.createActionCount || 0) === 0 ? [] : ["std_project_create_action_already_recorded"]),
    ...(Number(attemptState.createdObjectCount || 0) === 0 ? [] : ["created_object_already_recorded"]),
    ...(plan?.metadata?.planning_intent?.project_name ? [] : ["execution_plan_project_name_missing"]),
    ...(plan?.metadata?.planning_intent?.business_intent_hash ? [] : ["execution_plan_business_intent_hash_missing"]),
    ...readyCreatePlanDraftBindingBlockers({ bundle, plan, scope })
  ];
  return {
    status: blockers.length ? "blocked" : "passed",
    blockers,
    plan,
    scope,
    attemptState,
    scopeSummary: {
      authorizationMode: authorization.authorizationMode,
      bindingMode: scope.binding_mode || "",
      planReady: plan?.plan_status === "ready",
      blockerCount: blockerCodes.length,
      actionCount: actions.length,
      createActionCount: createActions.length,
      maximumPlatformCalls: actionMaximumPlatformCalls(createAction),
      rateLimitRedeliveryAuthorized: sameRateLimitRedeliveryContract(scope.rate_limit_redelivery),
      existingConfirmation: Boolean(existingConfirmation),
      differentConfirmedCreatePlan,
      retryAllowed: scope.retry_allowed === true
    }
  };
}

export async function validateResourcePlanConfirmationScope({
  repo,
  bundle,
  projectStatePath = defaultProjectStatePath,
  authorizationSource = "workbench_view",
  authenticatedUserId = ""
}) {
  const state = await readProjectState(projectStatePath);
  const plan = bundle.executionPlan || await repo.getLatestLaunchExecutionPlan(bundle.job.job_id);
  const authorization = await evaluatePlanBoundWriteAuthorization({
    repo,
    bundle,
    plan,
    projectStatePath,
    authorizationSource,
    authenticatedUserId
  });
  const scope = plan?.metadata?.execution_scope || {};
  const actions = plan?.planned_actions || plan?.plannedActions || [];
  const actionTypes = actions.map((action) => action.action_type);
  const blockerCodes = plan?.blocker_codes || plan?.blockerCodes || [];
  const existingConfirmation = typeof repo.getLaunchConfirmationForPlan === "function"
    ? await repo.getLaunchConfirmationForPlan(plan?.plan_id || plan?.planId || "")
    : null;
  const actionScope = validateExecutionPlanActionScope({
    plan,
    allowedActions: scope.allowed_actions || []
  });
  const plannedMaximumPlatformCalls = actions.reduce(
    (sum, action) => sum + actionMaximumPlatformCalls(action),
    0
  );
  const frozenActionCallLimitBlockers = actions.flatMap((action) => {
    const actionType = action.action_type || "";
    const actionLimit = actionMaximumPlatformCalls(action);
    const grantLimit = actionGrantMaximumPlatformCalls(scope, actionType);
    return [
      ...(Number.isInteger(actionLimit) && actionLimit > 0 ? [] : [`execution_plan_action_call_limit_invalid:${actionType}`]),
      ...(grantLimit === actionLimit ? [] : [`execution_plan_action_grant_limit_mismatch:${actionType}`])
    ];
  });
  const freshResourceActions = await resolveFreshResourceActionContracts({ bundle, actionTypes });
  const freshActionCallLimits = freshResourceActions.actionCallLimits;
  const freshActionCallLimitDrift = Object.entries(freshActionCallLimits).flatMap(([actionType, currentLimit]) => {
    const action = actions.find((item) => item.action_type === actionType);
    return action && actionMaximumPlatformCalls(action) === Number(currentLimit)
      ? []
      : [`resource_action_call_limit_drifted:${actionType}`];
  });
  const videoContract = freshResourceActions.resourceActionContracts.video_asset;
  const videoAction = actions.find((action) => action.action_type === "ensure_resource:video_asset");
  const videoContractDrift = !videoContract
    ? []
    : [
      ...(videoContract.status === "blocked" ? ["video_material_prepare_contract_not_executable"] : []),
      ...(videoContract.status === "planned" && !videoAction ? ["video_material_prepare_action_missing"] : []),
      ...(videoContract.status === "ready" && videoAction ? ["video_material_prepare_action_stale"] : []),
      ...(videoAction && actionMaximumPlatformCalls(videoAction) === Number(videoContract.maximumPlatformCalls)
        ? []
        : videoAction ? ["video_material_prepare_call_limit_drifted"] : []),
      ...(videoAction && videoAction.resource_contract_hash === videoContract.contractHash
        ? []
        : videoAction ? ["video_material_prepare_binding_set_drifted"] : [])
    ];
  const blockers = [
    ...authorization.blockers,
    ...(bundle.case?.lifecycle_status === "active" ? [] : ["workflow_case_not_active"]),
    ...((plan?.plan_kind || plan?.planKind || plan?.metadata?.plan_kind) === PLAN_KIND_RESOURCE_PREPARE ? [] : ["execution_plan_kind_not_resource_prepare"]),
    ...(plan?.plan_status === "ready" ? [] : ["execution_plan_not_ready_for_confirmation"]),
    ...(blockerCodes.length === 0 ? [] : ["execution_plan_has_blockers"]),
    ...(scope.binding_mode === "single_confirmation_plan" ? [] : ["execution_plan_confirmation_model_invalid"]),
    ...(scope.target_job_id === bundle.job.job_id ? [] : ["platform_write_scope_job_mismatch"]),
    ...(scope.target_advertiser_id === bundle.job.advertiser_id ? [] : ["platform_write_scope_advertiser_mismatch"]),
    ...(scope.target_plan_id === plan?.plan_id ? [] : ["platform_write_scope_plan_id_mismatch"]),
    ...(scope.target_plan_hash === plan?.plan_hash ? [] : ["platform_write_scope_plan_hash_mismatch"]),
    ...(actionScope.status === "passed" ? [] : actionScope.blockers),
    ...(Number(scope.maximum_actions) === actions.length && actions.length > 0 ? [] : ["platform_write_scope_maximum_actions_invalid"]),
    ...(Number(scope.maximum_platform_calls) === plannedMaximumPlatformCalls ? [] : ["platform_write_scope_maximum_platform_calls_invalid"]),
    ...frozenActionCallLimitBlockers,
    ...freshActionCallLimitDrift,
    ...videoContractDrift,
    ...(actionTypes.every((actionType) => FORMAL_CONFIRMED_ACTION_ORDER.includes(actionType)) ? [] : ["confirmed_resource_action_not_in_registry"]),
    ...(actionTypes.includes(ACTION_STD_PROJECT_CREATE) ? ["std_project_create_not_allowed_in_resource_execution"] : []),
    ...(Number(scope.maximum_create_calls || 0) === 0 ? [] : ["execution_plan_create_call_limit_invalid"]),
    ...(scope.retry_allowed === false ? [] : ["platform_write_scope_retry_allowed_must_be_false"]),
    ...(existingConfirmation ? ["execution_plan_confirmation_already_recorded"] : [])
  ];
  return {
    status: blockers.length ? "blocked" : "passed",
    blockers: [...new Set(blockers)],
    plan,
    scope,
    scopeSummary: {
      authorizationMode: authorization.authorizationMode,
      bindingMode: scope.binding_mode || "",
      planReady: plan?.plan_status === "ready",
      blockerCount: blockerCodes.length,
      actionCount: actions.length,
      existingConfirmation: Boolean(existingConfirmation),
      retryAllowed: scope.retry_allowed === true
    }
  };
}

export async function validateMonitorPlanConfirmationScope({
  repo,
  bundle,
  projectStatePath = defaultProjectStatePath,
  authorizationSource = "workbench_view"
}) {
  const plan = bundle.executionPlan || await repo.getLatestLaunchExecutionPlan(bundle.job.job_id);
  const scope = plan?.metadata?.execution_scope || {};
  const actions = plan?.planned_actions || plan?.plannedActions || [];
  const blockerCodes = plan?.blocker_codes || plan?.blockerCodes || [];
  const existingConfirmation = typeof repo.getLaunchConfirmationForPlan === "function"
    ? await repo.getLaunchConfirmationForPlan(plan?.plan_id || plan?.planId || "")
    : null;
  const authorization = await evaluatePlanBoundWriteAuthorization({
    repo,
    bundle,
    plan,
    projectStatePath,
    authorizationSource
  });
  const blockers = [
    ...authorization.blockers,
    ...((plan?.plan_kind || plan?.planKind || plan?.metadata?.plan_kind) === PLAN_KIND_MONITOR_BOOTSTRAP ? [] : ["execution_plan_kind_not_monitor_bootstrap"]),
    ...(actions.length === 1 && actions[0]?.action_type === ACTION_ENSURE_MONITOR ? [] : ["monitor_plan_action_set_invalid"]),
    ...(Number(scope.maximum_actions) === 1 ? [] : ["platform_write_scope_maximum_actions_invalid"]),
    ...(Number(scope.maximum_platform_calls) === 1 ? [] : ["platform_write_scope_maximum_platform_calls_invalid"]),
    ...(scope.retry_allowed === false ? [] : ["platform_write_scope_retry_allowed_must_be_false"]),
    ...(blockerCodes.length === 0 ? [] : ["execution_plan_has_blockers"]),
    ...(existingConfirmation ? ["execution_plan_confirmation_already_recorded"] : [])
  ];
  return {
    status: blockers.length ? "blocked" : "passed",
    blockers: [...new Set(blockers)],
    plan,
    scope,
    scopeSummary: {
      authorizationMode: authorization.authorizationMode,
      bindingMode: scope.binding_mode || "",
      planReady: plan?.plan_status === "ready",
      blockerCount: blockerCodes.length,
      actionCount: actions.length,
      existingConfirmation: Boolean(existingConfirmation),
      retryAllowed: scope.retry_allowed === true
    }
  };
}

export async function getExecutionGrantAvailability({ repo, bundle, projectStatePath = defaultProjectStatePath }) {
  const state = await readProjectState(projectStatePath);
  const legacyTestScope = bundle.job?.source_usage === "test_run" &&
    projectStatePath !== defaultProjectStatePath &&
    state.guardrails?.platform_write_scope?.mode === "single_oceanengine_std_project_create";
  const planBound = bundle.executionPlan?.metadata?.execution_scope?.binding_mode === "single_confirmation_plan" && !legacyTestScope;
  if (!planBound && (bundle.job?.source_usage || "runtime_truth") !== "test_run") {
    return {
      status: "unavailable",
      canExecuteOnce: false,
      alreadyAttempted: false,
      blockers: ["runtime_truth_requires_plan_bound_confirmation"]
    };
  }
  const resourcePlan = (bundle.executionPlan?.plan_kind || bundle.executionPlan?.metadata?.plan_kind) === PLAN_KIND_RESOURCE_PREPARE;
  const monitorPlan = (bundle.executionPlan?.plan_kind || bundle.executionPlan?.metadata?.plan_kind) === PLAN_KIND_MONITOR_BOOTSTRAP;
  const scope = planBound
    ? monitorPlan
      ? await validateMonitorPlanConfirmationScope({ repo, bundle, projectStatePath, authorizationSource: "workbench_view" })
      : resourcePlan
      ? await validateResourcePlanConfirmationScope({ repo, bundle, projectStatePath, authorizationSource: "workbench_view" })
      : await validatePlanConfirmationScope({ repo, bundle, projectStatePath, authorizationSource: "workbench_view" })
    : await validateWriteScope({ repo, bundle, projectStatePath });
  const alreadyAttempted = planBound
    ? scope.blockers.includes("execution_plan_confirmation_already_recorded") ||
      scope.blockers.includes("execution_job_has_confirmed_create_plan") ||
      Number(scope.attemptState?.createActionCount || 0) > 0
    : Number(scope.attemptState.nextCreateAttemptNo || 1) > Number(scope.attemptState.maximumCreateAttempts || 3);
  return {
    status: scope.status === "passed" ? "available" : (alreadyAttempted ? "consumed" : "unavailable"),
    canExecuteOnce: scope.status === "passed",
    alreadyAttempted,
    authorizationMode: scope.scopeSummary?.authorizationMode || (scope.status === "passed" ? "task_scope" : "none"),
    reasonCode: scope.blockers?.[0] || ""
  };
}

export async function revokeWriteScope(projectStatePath = defaultProjectStatePath) {
  const state = await readProjectState(projectStatePath);
  if (state.guardrails?.platform_write_allowed !== true) return;
  if (!state.guardrails) state.guardrails = {};
  state.guardrails.platform_write_allowed = false;
  // Runtime authorization belongs to the consumed job plan/action. The following
  // reset is only retained for disposable legacy test fixtures that inject it.
  if (state.guardrails.platform_write_scope) {
    state.guardrails.platform_write_scope = {
      ...state.guardrails.platform_write_scope,
      allowed_actions: [],
      maximum_actions: 0,
      retry_allowed: false
    };
  }
  await writeProjectState(projectStatePath, state);
}
