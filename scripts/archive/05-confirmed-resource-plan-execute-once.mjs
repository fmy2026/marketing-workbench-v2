import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import { FORMAL_CONFIRMED_ACTION_ORDER } from "../src/workflows/skills/oe3/04-resource-action-registry.mjs";
import { runConfirmedResourceOrchestratorSkill } from "../src/workflows/skills/oe3/05-confirmed-resource-orchestrator.mjs";
import { assertNoSensitiveLeak, hashValue, sanitizeForPublic } from "../src/workflows/skills/oe3/00-contracts.mjs";

const rootDir = normalize(join(dirname(fileURLToPath(import.meta.url)), ".."));
const defaultProjectStatePath = join(rootDir, "project.state.json");
const CONFIRMATION_INTENT = "EXECUTE_EXACT_CONFIRMED_RESOURCE_PLAN";
const CONFIRMATION_ENV = "MWBV2_OE_CONFIRMED_RESOURCE_PLAN_CONFIRM";

function arg(name, fallback = "") {
  const inline = process.argv.find((item) => item.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.findIndex((item) => item === `--${name}`);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

function clean(value) {
  return String(value ?? "").trim();
}

function planId(plan = {}) {
  return clean(plan.plan_id || plan.planId);
}

function planHash(plan = {}) {
  return clean(plan.plan_hash || plan.planHash);
}

function actions(plan = {}) {
  return plan.planned_actions || plan.plannedActions || [];
}

async function readProjectState(projectStatePath) {
  return JSON.parse(await readFile(projectStatePath, "utf8"));
}

async function writeProjectState(projectStatePath, state) {
  await writeFile(projectStatePath, `${JSON.stringify(state, null, 2)}\n`);
}

function assertExactResourcePlan({ bundle, plan, args }) {
  const actionTypes = actions(plan).map((item) => clean(item.action_type));
  const expectedScope = plan.metadata?.execution_scope || plan.metadata?.executionScope || {};
  const scopeActions = Array.isArray(expectedScope.allowed_actions) ? expectedScope.allowed_actions : [];
  const blockers = [
    ...(bundle?.job ? [] : ["launch_job_not_found"]),
    ...(plan?.plan_status === "ready" || plan?.planStatus === "ready" ? [] : ["execution_plan_not_ready"]),
    ...(Array.isArray(plan?.blocker_codes || plan?.blockerCodes) && !(plan.blocker_codes || plan.blockerCodes).length ? [] : ["execution_plan_has_blockers"]),
    ...(args.planId === planId(plan) ? [] : ["confirmed_plan_id_drift"]),
    ...(args.planHash === planHash(plan) ? [] : ["confirmed_plan_hash_drift"]),
    ...(args.confirmationIntent === CONFIRMATION_INTENT ? [] : ["confirmation_intent_missing_or_invalid"]),
    ...(expectedScope.binding_mode === "single_confirmation_plan" ? [] : ["execution_plan_confirmation_model_invalid"]),
    ...(expectedScope.target_job_id === bundle?.job?.job_id ? [] : ["execution_plan_job_scope_invalid"]),
    ...(expectedScope.target_advertiser_id === bundle?.job?.advertiser_id ? [] : ["execution_plan_advertiser_scope_invalid"]),
    ...(expectedScope.target_plan_id === planId(plan) ? [] : ["execution_plan_plan_id_scope_invalid"]),
    ...(expectedScope.target_plan_hash === planHash(plan) ? [] : ["execution_plan_plan_hash_scope_invalid"]),
    ...(expectedScope.retry_allowed === false ? [] : ["execution_plan_retry_policy_invalid"]),
    ...(Number(expectedScope.maximum_create_calls || 0) === 0 ? [] : ["std_project_create_not_allowed_in_resource_execution"]),
    ...(actionTypes.length > 0 ? [] : ["confirmed_resource_plan_actions_missing"]),
    ...(actionTypes.every((actionType) => FORMAL_CONFIRMED_ACTION_ORDER.includes(actionType)) ? [] : ["confirmed_resource_action_not_in_registry"]),
    ...(actionTypes.includes("std_project_create") ? ["std_project_create_not_allowed_in_resource_execution"] : []),
    ...(JSON.stringify(actionTypes) === JSON.stringify(scopeActions) ? [] : ["execution_plan_allowed_actions_drift"]),
    ...(Number(expectedScope.maximum_actions || 0) === actionTypes.length ? [] : ["execution_plan_maximum_actions_invalid"])
  ];
  if (blockers.length) throw new Error([...new Set(blockers)].join(","));
  return { actionTypes, scope: expectedScope };
}

async function enableExactPlanScope({ projectStatePath, scope, taskId }) {
  const state = await readProjectState(projectStatePath);
  state.guardrails ||= {};
  state.guardrails.platform_write_allowed = true;
  state.guardrails.platform_write_scope = {
    ...scope,
    granted_by_task_id: taskId,
    granted_at: new Date().toISOString(),
    revoked_at: "",
    revocation_reason: ""
  };
  await writeProjectState(projectStatePath, state);
}

async function revokeExactPlanScope({ projectStatePath, reason }) {
  const state = await readProjectState(projectStatePath);
  state.guardrails ||= {};
  state.guardrails.platform_write_allowed = false;
  if (state.guardrails.platform_write_scope) {
    state.guardrails.platform_write_scope = {
      ...state.guardrails.platform_write_scope,
      allowed_actions: [],
      allowed_plan_actions: [],
      maximum_actions: 0,
      maximum_platform_calls: 0,
      maximum_create_calls: 0,
      action_grants: {},
      retry_allowed: false,
      revoked_at: new Date().toISOString(),
      revocation_reason: reason
    };
  }
  await writeProjectState(projectStatePath, state);
}

async function confirmPlan({ repo, bundle, plan, actionTypes }) {
  const existing = await repo.getLaunchConfirmationForPlan(planId(plan));
  if (existing?.confirmation_status === "confirmed_for_execution_plan") {
    throw new Error("execution_plan_confirmation_already_consumed");
  }
  const confirmationId = `CONFIRM-${bundle.job.job_id}-RESOURCE-PLAN`;
  await repo.upsertLaunchConfirmation({
    confirmationId,
    jobId: bundle.job.job_id,
    draftId: bundle.draft?.draft_id || "",
    objectType: "account_resource_prepare",
    objectName: "confirmed bounded resource plan",
    payloadHash: bundle.draft?.payload_hash || "",
    confirmationStatus: "confirmed_for_execution_plan",
    confirmVariable: `${CONFIRMATION_ENV}=${CONFIRMATION_INTENT}`,
    confirmedBy: "user_confirmed_chat",
    planId: planId(plan),
    metadata: {
      binding_mode: "single_confirmation_plan",
      plan_hash: planHash(plan),
      allowed_actions: actionTypes,
      maximum_actions: actionTypes.length,
      maximum_create_calls: 0,
      retry_allowed: false,
      confirmation_input_hash: hashValue({
        job_id: bundle.job.job_id,
        plan_id: planId(plan),
        plan_hash: planHash(plan),
        action_types: actionTypes
      })
    }
  });
  return confirmationId;
}

async function recordSkillRun({ repo, bundle, result, actionTypes }) {
  const outputSummary = sanitizeForPublic(result.outputSummary || result);
  await repo.upsertLaunchSkillRun({
    skillRunId: `${bundle.job.job_id}-confirmed-resource-orchestrator-resource-plan-1`,
    jobId: bundle.job.job_id,
    nodeKey: "std_project_draft_builder",
    skillKey: "confirmed-resource-orchestrator",
    attemptNo: 1,
    status: result.status === "passed" ? "passed" : "blocked",
    inputHash: hashValue({ jobId: bundle.job.job_id, planId: planId(bundle.executionPlan || {}), actionTypes }),
    outputSummary,
    blockers: result.blockers || [],
    evidenceRefs: result.evidenceRefs || [],
    blockerCodes: result.blockers || [],
    moduleRef: "src/workflows/skills/oe3/05-confirmed-resource-orchestrator.mjs",
    sourceUsage: bundle.job.source_usage || "runtime_truth"
  });
}

const args = {
  jobId: clean(arg("job-id")),
  planId: clean(arg("plan-id")),
  planHash: clean(arg("plan-hash")),
  confirmationIntent: clean(arg("confirmation-intent")),
  projectStatePath: arg("project-state-path", defaultProjectStatePath)
};

const repo = new PostgresRepository();
let scopeEnabled = false;
let output = {};
try {
  if (!args.jobId || !args.planId || !args.planHash) throw new Error("job_id_plan_id_plan_hash_required");
  let bundle = await repo.getLaunchJobBundle(args.jobId);
  const plan = await repo.getLaunchExecutionPlan(args.planId);
  const state = await readProjectState(args.projectStatePath);
  const { actionTypes, scope } = assertExactResourcePlan({ bundle, plan, args });
  const taskId = clean(state.active_task?.task_id);
  if (!taskId) throw new Error("active_task_id_required");

  const confirmationId = await confirmPlan({ repo, bundle, plan, actionTypes });
  await enableExactPlanScope({ projectStatePath: args.projectStatePath, scope, taskId });
  scopeEnabled = true;
  bundle = await repo.getLaunchJobBundle(args.jobId);
  const orchestrator = await runConfirmedResourceOrchestratorSkill({
    repo,
    bundle,
    projectStatePath: args.projectStatePath
  });
  await recordSkillRun({ repo, bundle, result: orchestrator, actionTypes });
  await repo.updateJob(args.jobId, {
    status: orchestrator.status === "passed" ? "completed_confirmed_resource_plan" : "blocked_confirmed_resource_plan",
    currentNode: "5"
  });
  output = sanitizeForPublic({
    status: orchestrator.status,
    job_id: args.jobId,
    plan_id: planId(plan),
    plan_hash: planHash(plan),
    confirmation_id: confirmationId,
    action_types: actionTypes,
    orchestrator_status: orchestrator.outputSummary?.orchestratorStatus || "",
    action_results: orchestrator.outputSummary?.actionResults || [],
    executed_action_count: Number(orchestrator.outputSummary?.executedActionCount || 0),
    platform_write_called: orchestrator.outputSummary?.actionResults?.some((item) => item.platformWriteCalled === true) === true,
    retry_allowed: false,
    create_called: false,
    next_action: orchestrator.status === "passed"
      ? "create_fresh_runtime_truth_job_for_draft_and_create_plan"
      : "stop_and_review_redacted_readback_evidence",
    token_refresh_called: false
  });
} catch (error) {
  output = sanitizeForPublic({
    status: "blocked",
    blockers: [clean(error.message) || "confirmed_resource_plan_execute_failed"],
    create_called: false,
    retry_allowed: false,
    token_refresh_called: false
  });
} finally {
  if (scopeEnabled) {
    await revokeExactPlanScope({
      projectStatePath: args.projectStatePath,
      reason: output.status === "passed" ? "confirmed_resource_plan_consumed" : "confirmed_resource_plan_stopped"
    }).catch(() => {});
  }
}

assertNoSensitiveLeak(output);
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
process.exit(output.status === "passed" ? 0 : 1);
