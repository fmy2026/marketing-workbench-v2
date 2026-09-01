import { readFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { validateExecutionPlanActionScope } from "./executionPlan.mjs";
import { evaluatePlanBoundWriteAuthorization } from "./workbenchRuntimeWritePolicy.mjs";

const rootDir = normalize(join(dirname(fileURLToPath(import.meta.url)), "../.."));
const defaultProjectStatePath = join(rootDir, "project.state.json");

async function readState(projectStatePath = defaultProjectStatePath) {
  return JSON.parse(await readFile(projectStatePath, "utf8"));
}

function planActions(plan = {}) {
  return plan.planned_actions || plan.plannedActions || [];
}

function planId(plan = {}) {
  return plan.plan_id || plan.planId || "";
}

function planHash(plan = {}) {
  return plan.plan_hash || plan.planHash || "";
}

function scopeFor({ state, bundle, plan, projectStatePath }) {
  const persisted = plan?.metadata?.execution_scope || plan?.metadata?.executionScope || {};
  const compatibility = bundle.job?.source_usage === "test_run" || projectStatePath !== defaultProjectStatePath
    ? state.guardrails?.platform_write_scope || {}
    : {};
  return Object.keys(persisted).length ? persisted : compatibility;
}

async function confirmationForPlan({ repo, bundle, plan }) {
  if (bundle.executionConfirmation) return bundle.executionConfirmation;
  if (typeof repo.getLaunchConfirmationForPlan !== "function") return null;
  return repo.getLaunchConfirmationForPlan(planId(plan));
}

function actionGrant(scope = {}, actionType = "") {
  return scope.action_grants?.[actionType] || scope.actionGrants?.[actionType] || {};
}

export async function validatePlannedActionGrant({
  repo,
  bundle,
  actionType,
  projectStatePath = defaultProjectStatePath,
  expectedMaximumPlatformCalls = null
} = {}) {
  if (!repo || !bundle?.job) throw new Error("planned_action_grant_job_bundle_required");
  if (!actionType) throw new Error("planned_action_type_required");
  const state = await readState(projectStatePath);
  const plan = bundle.executionPlan || await repo.getLatestLaunchExecutionPlan(bundle.job.job_id);
  const scope = scopeFor({ state, bundle, plan, projectStatePath });
  const actions = planActions(plan);
  const action = actions.find((item) => item.action_type === actionType) || null;
  const allowedActions = Array.isArray(scope.allowed_actions) ? scope.allowed_actions : [];
  const bindingMode = scope.binding_mode || scope.bindingMode || "legacy_single_action";
  const isPlanBound = bindingMode === "single_confirmation_plan";
  const grant = actionGrant(scope, actionType);
  const maximumPlatformCalls = Number(
    grant.maximum_platform_calls ?? grant.maximumPlatformCalls ?? scope.maximum_platform_calls ?? 0
  );
  const confirmation = isPlanBound ? await confirmationForPlan({ repo, bundle, plan }) : null;
  const exactPlanScope = isPlanBound
    ? validateExecutionPlanActionScope({ plan, allowedActions })
    : { status: allowedActions.length === 1 && allowedActions[0] === actionType ? "passed" : "blocked", blockers: [] };
  const confirmationMetadata = confirmation?.metadata || {};
  const authorization = isPlanBound
    ? await evaluatePlanBoundWriteAuthorization({
      repo,
      bundle,
      plan,
      projectStatePath,
      authorizationSource: confirmation?.confirmed_by || "",
      requireAwaitingConfirmationGate: false
    })
    : {
      blockers: state.guardrails?.platform_write_allowed === true ? [] : ["platform_write_scope_not_enabled"],
      authorizationMode: state.guardrails?.platform_write_allowed === true ? "task_scope" : "none"
    };
  const blockers = [
    ...authorization.blockers,
    ...(bundle.case?.lifecycle_status === "active" || (!bundle.case && projectStatePath !== defaultProjectStatePath) ? [] : ["workflow_case_not_active"]),
    ...(scope.target_job_id === bundle.job.job_id ? [] : ["platform_write_scope_job_mismatch"]),
    ...(scope.target_advertiser_id === bundle.job.advertiser_id ? [] : ["platform_write_scope_advertiser_mismatch"]),
    ...(scope.target_plan_id === planId(plan) ? [] : ["platform_write_scope_plan_id_mismatch"]),
    ...(scope.target_plan_hash === planHash(plan) ? [] : ["platform_write_scope_plan_hash_mismatch"]),
    ...(exactPlanScope.status === "passed" ? [] : ["platform_write_scope_allowed_actions_invalid", ...exactPlanScope.blockers]),
    ...(Number(scope.maximum_actions) === allowedActions.length && allowedActions.length > 0 ? [] : ["platform_write_scope_maximum_actions_invalid"]),
    ...(scope.retry_allowed === false ? [] : ["platform_write_scope_retry_allowed_must_be_false"]),
    ...(action ? [] : [`planned_action_missing:${actionType}`]),
    ...(action?.status === "planned" || action?.status === "waiting_on_plan_actions" || action?.status === "ready"
      ? []
      : [`planned_action_not_executable:${actionType}`]),
    ...(expectedMaximumPlatformCalls === null || maximumPlatformCalls === Number(expectedMaximumPlatformCalls)
      ? []
      : ["platform_write_scope_maximum_platform_calls_invalid"]),
    ...(!isPlanBound ? [] : [
      ...(confirmation ? [] : ["execution_plan_confirmation_missing"]),
      ...(confirmation?.job_id === bundle.job.job_id ? [] : ["execution_plan_confirmation_job_mismatch"]),
      ...(confirmation?.plan_id === planId(plan) ? [] : ["execution_plan_confirmation_plan_mismatch"]),
      ...(confirmation?.confirmation_status === "confirmed_for_execution_plan" ? [] : ["execution_plan_confirmation_status_invalid"]),
      ...(confirmationMetadata.plan_hash === planHash(plan) ? [] : ["execution_plan_confirmation_hash_mismatch"]),
      ...(confirmationMetadata.retry_allowed === false ? [] : ["execution_plan_confirmation_retry_policy_invalid"])
    ])
  ];
  return {
    status: blockers.length ? "blocked" : "passed",
    blockers: [...new Set(blockers)],
    state,
    plan,
    scope,
    action,
    actionGrant: grant,
    confirmation,
    scopeSummary: {
      authorizationMode: authorization.authorizationMode,
      bindingMode,
      targetJobMatches: scope.target_job_id === bundle.job.job_id,
      targetAdvertiserMatches: scope.target_advertiser_id === bundle.job.advertiser_id,
      targetPlanMatches: scope.target_plan_id === planId(plan),
      targetPlanHashMatches: scope.target_plan_hash === planHash(plan),
      actionPlanned: Boolean(action),
      confirmationPresent: Boolean(confirmation),
      maximumPlatformCalls
    }
  };
}
