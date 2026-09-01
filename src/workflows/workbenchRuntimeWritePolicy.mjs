import { readFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = normalize(join(dirname(fileURLToPath(import.meta.url)), "../.."));
export const DEFAULT_PROJECT_STATE_PATH = join(rootDir, "project.state.json");
const LOOPBACK_WORKBENCH_ORIGIN = "http://127.0.0.1:3000";

function clean(value) {
  return String(value ?? "").trim();
}

function planId(plan = {}) {
  return clean(plan.plan_id || plan.planId);
}

function planHash(plan = {}) {
  return clean(plan.plan_hash || plan.planHash);
}

function planKind(plan = {}) {
  return clean(plan.plan_kind || plan.planKind || plan.metadata?.plan_kind);
}

function blockerCodes(plan = {}) {
  const values = plan.blocker_codes || plan.blockerCodes || [];
  return Array.isArray(values) ? values : [];
}

export async function readProjectControlState(projectStatePath = DEFAULT_PROJECT_STATE_PATH) {
  return JSON.parse(await readFile(projectStatePath, "utf8"));
}

export async function evaluatePlanBoundWriteAuthorization({
  repo,
  bundle,
  plan = bundle?.executionPlan,
  projectStatePath = DEFAULT_PROJECT_STATE_PATH,
  authorizationSource = "",
  requireAwaitingConfirmationGate = true
} = {}) {
  if (!bundle?.job) throw new Error("plan_bound_authorization_job_required");
  const state = await readProjectControlState(projectStatePath);
  if (state.guardrails?.platform_write_allowed === true) {
    return {
      status: "passed",
      blockers: [],
      authorizationMode: "task_scope",
      state
    };
  }

  const policy = state.guardrails?.workbench_runtime_write_policy || {};
  const scope = plan?.metadata?.execution_scope || plan?.metadata?.executionScope || {};
  const summary = bundle.job.case_id && typeof repo?.getWorkflowCaseSummary === "function"
    ? await repo.getWorkflowCaseSummary(bundle.job.case_id)
    : null;
  const allowedSources = new Set(["workbench_view", "workbench_conversation"]);
  const allowedSourceUsage = Array.isArray(policy.allowed_source_usage) ? policy.allowed_source_usage : [];
  const allowedPlanKinds = Array.isArray(policy.allowed_plan_kinds) ? policy.allowed_plan_kinds : [];
  const source = clean(authorizationSource);
  const currentPlanId = planId(plan);
  const currentPlanHash = planHash(plan);
  const blockers = [
    ...(policy.enabled === true ? [] : ["platform_write_scope_not_enabled", "workbench_runtime_write_policy_not_enabled"]),
    ...(policy.mode === "loopback_plan_bound_confirmation_only" ? [] : ["workbench_runtime_write_policy_mode_invalid"]),
    ...(clean(policy.origin).replace(/\/$/, "") === LOOPBACK_WORKBENCH_ORIGIN ? [] : ["workbench_runtime_origin_policy_invalid"]),
    ...(policy.require_active_case === true ? [] : ["workbench_runtime_active_case_requirement_invalid"]),
    ...(policy.require_latest_case_job === true ? [] : ["workbench_runtime_latest_job_requirement_invalid"]),
    ...(policy.require_exact_plan_binding === true ? [] : ["workbench_runtime_plan_binding_requirement_invalid"]),
    ...(policy.require_exact_confirmation_phrase === true ? [] : ["workbench_runtime_confirmation_phrase_requirement_invalid"]),
    ...(allowedSources.has(source) ? [] : ["workbench_runtime_authorization_source_invalid"]),
    ...(allowedSourceUsage.includes(bundle.job.source_usage) ? [] : ["workbench_runtime_source_usage_not_allowed"]),
    ...(allowedPlanKinds.includes(planKind(plan)) ? [] : ["workbench_runtime_plan_kind_not_allowed"]),
    ...(bundle.case?.lifecycle_status === "active" ? [] : ["workflow_case_not_active"]),
    ...(summary?.lifecycle_status === "active" ? [] : ["workflow_case_summary_not_active"]),
    ...(summary?.latest_job_id === bundle.job.job_id ? [] : ["workbench_runtime_latest_job_mismatch"]),
    ...(!requireAwaitingConfirmationGate || summary?.current_gate === "await_job_write_authorization"
      ? []
      : ["workbench_runtime_gate_not_confirmable"]),
    ...(plan?.plan_status === "ready" ? [] : ["execution_plan_not_ready_for_confirmation"]),
    ...(blockerCodes(plan).length === 0 ? [] : ["execution_plan_has_blockers"]),
    ...(scope.binding_mode === "single_confirmation_plan" ? [] : ["execution_plan_confirmation_model_invalid"]),
    ...(scope.target_job_id === bundle.job.job_id ? [] : ["platform_write_scope_job_mismatch"]),
    ...(scope.target_advertiser_id === bundle.job.advertiser_id ? [] : ["platform_write_scope_advertiser_mismatch"]),
    ...(scope.target_plan_id === currentPlanId ? [] : ["platform_write_scope_plan_id_mismatch"]),
    ...(scope.target_plan_hash === currentPlanHash ? [] : ["platform_write_scope_plan_hash_mismatch"]),
    ...(scope.retry_allowed === false && policy.retry_allowed === false ? [] : ["platform_write_scope_retry_allowed_must_be_false"]),
    ...(Number(policy.maximum_confirmations_per_plan) === 1 ? [] : ["workbench_runtime_confirmation_limit_invalid"])
  ];
  return {
    status: blockers.length ? "blocked" : "passed",
    blockers: [...new Set(blockers)],
    authorizationMode: blockers.length ? "none" : "workbench_plan_bound",
    state,
    summary
  };
}
