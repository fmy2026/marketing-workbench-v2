import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { ACTION_STD_PROJECT_CREATE, validateExecutionPlanActionScope } from "./executionPlan.mjs";

const rootDir = normalize(join(dirname(fileURLToPath(import.meta.url)), "../.."));
const defaultProjectStatePath = join(rootDir, "project.state.json");
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

export async function validatePlanConfirmationScope({ repo, bundle, projectStatePath = defaultProjectStatePath }) {
  const state = await readProjectState(projectStatePath);
  const plan = bundle.executionPlan || await repo.getLatestLaunchExecutionPlan(bundle.job.job_id);
  const scope = plan?.metadata?.execution_scope || {};
  const actions = plan?.planned_actions || plan?.plannedActions || [];
  const blockerCodes = plan?.blocker_codes || plan?.blockerCodes || [];
  const createActions = actions.filter((action) => action.action_type === ACTION_STD_PROJECT_CREATE);
  const existingConfirmation = typeof repo.getLaunchConfirmationForPlan === "function"
    ? await repo.getLaunchConfirmationForPlan(plan?.plan_id || plan?.planId || "")
    : null;
  const attemptState = await repo.getCreateAttemptState(bundle.job.job_id);
  const actionScope = validateExecutionPlanActionScope({
    plan,
    allowedActions: scope.allowed_actions || []
  });
  const blockers = [
    ...(state.guardrails?.platform_write_allowed === true ? [] : ["platform_write_scope_not_enabled"]),
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
    ...(scope.retry_allowed === false ? [] : ["platform_write_scope_retry_allowed_must_be_false"]),
    ...(existingConfirmation ? ["execution_plan_confirmation_already_recorded"] : []),
    ...(Number(attemptState.createActionCount || 0) === 0 ? [] : ["std_project_create_action_already_recorded"]),
    ...(Number(attemptState.createdObjectCount || 0) === 0 ? [] : ["created_object_already_recorded"]),
    ...(plan?.metadata?.planning_intent?.project_name ? [] : ["execution_plan_project_name_missing"]),
    ...(plan?.metadata?.planning_intent?.business_intent_hash ? [] : ["execution_plan_business_intent_hash_missing"])
  ];
  return {
    status: blockers.length ? "blocked" : "passed",
    blockers,
    plan,
    scope,
    attemptState,
    scopeSummary: {
      bindingMode: scope.binding_mode || "",
      planReady: plan?.plan_status === "ready",
      blockerCount: blockerCodes.length,
      actionCount: actions.length,
      createActionCount: createActions.length,
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
  const scope = planBound
    ? await validatePlanConfirmationScope({ repo, bundle, projectStatePath })
    : await validateWriteScope({ repo, bundle, projectStatePath });
  const alreadyAttempted = planBound
    ? scope.blockers.includes("execution_plan_confirmation_already_recorded") || Number(scope.attemptState.createActionCount || 0) > 0
    : Number(scope.attemptState.nextCreateAttemptNo || 1) > Number(scope.attemptState.maximumCreateAttempts || 3);
  return {
    status: scope.status === "passed" ? "available" : (alreadyAttempted ? "consumed" : "unavailable"),
    canExecuteOnce: scope.status === "passed",
    alreadyAttempted
  };
}

export async function revokeWriteScope(projectStatePath = defaultProjectStatePath) {
  const state = await readProjectState(projectStatePath);
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
