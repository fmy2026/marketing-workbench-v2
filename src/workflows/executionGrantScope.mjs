import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { validateExecutionPlanActionScope } from "./executionPlan.mjs";

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
  const scope = Object.keys(testCompatibilityScope).length ? testCompatibilityScope : {
    target_job_id: bundle.job.job_id,
    target_draft_id: bundle.draft?.draft_id || "",
    target_payload_hash: bundle.draft?.payload_hash || "",
    target_plan_id: plan?.plan_id || "",
    target_plan_hash: plan?.plan_hash || "",
    allowed_actions: [CREATE_ACTION],
    maximum_actions: 1,
    retry_allowed: false,
    ...planScope
  };
  const planScopeBlockers = optionalPlanScopeBlockers(scope, plan);
  const blockers = [
    ...(state.guardrails?.platform_write_allowed === true ? [] : ["platform_write_scope_not_enabled"]),
    ...(bundle.case?.lifecycle_status === "active" ? [] : ["workflow_case_not_active"]),
    ...(scope.target_job_id === bundle.job.job_id ? [] : ["platform_write_scope_job_mismatch"]),
    ...(scope.target_draft_id === bundle.draft?.draft_id ? [] : ["platform_write_scope_draft_mismatch"]),
    ...(scope.target_payload_hash === bundle.draft?.payload_hash ? [] : ["platform_write_scope_payload_hash_mismatch"]),
    ...(actionScopeAllowsOnlyCreate(scope.allowed_actions) ? [] : ["platform_write_scope_allowed_actions_invalid"]),
    ...(Number(scope.maximum_actions) === 1 ? [] : ["platform_write_scope_maximum_actions_invalid"]),
    ...(scope.retry_allowed === false ? [] : ["platform_write_scope_retry_allowed_must_be_false"]),
    ...((attemptState.createActionCount || 0) > 0 ? ["platform_action_already_recorded"] : []),
    ...((attemptState.confirmationCount || 0) > 0 ? ["confirmation_already_recorded"] : []),
    ...((attemptState.createdObjectCount || 0) > 0 ? ["created_object_already_recorded"] : []),
    ...((attemptState.realReadbackCount || 0) > 0 ? ["real_readback_already_recorded"] : []),
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
      retryAllowed: scope.retry_allowed === true
    }
  };
}

export async function getExecutionGrantAvailability({ repo, bundle, projectStatePath = defaultProjectStatePath }) {
  const scope = await validateWriteScope({ repo, bundle, projectStatePath });
  const alreadyAttempted = [
    scope.attemptState.createActionCount,
    scope.attemptState.confirmationCount,
    scope.attemptState.createdObjectCount,
    scope.attemptState.realReadbackCount
  ].some((count) => Number(count) > 0);
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
