import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { getJobView, runJob } from "./launchWorkflow.mjs";
import { validateExecutionPlanActionScope } from "./executionPlan.mjs";
import { assertNoSensitiveLeak } from "./skills/oe3/00-contracts.mjs";
import {
  STD_PROJECT_CREATE_CONFIRM_VALUE
} from "../platforms/oceanengineStdProjectCreateExecutor.mjs";

export const EXECUTION_GRANT_CONFIRM_ENV = "MWBV2_OE_EXECUTION_CONFIRM";
export const EXECUTION_GRANT_INTENT = "EXECUTE_ONE_LAUNCH";
const rootDir = normalize(join(dirname(fileURLToPath(import.meta.url)), "../.."));
const defaultProjectStatePath = join(rootDir, "project.state.json");
const CREATE_ACTION = "oceanengine_std_project_create";

function grantId(jobId, source) {
  return `GRANT-${jobId}-${source}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

function createCalledFromView(view = {}) {
  const createNode = (view.phases || [])
    .flatMap((phase) => phase.nodes || [])
    .find((node) => node.id === "std_project_create_executor");
  return createNode?.outputSummary?.createCalled === true &&
    createNode?.outputSummary?.mockCreateCalled !== true;
}

function validateGrant({ grantSource, executionIntent, envConfirm }) {
  if (grantSource === "workbench_click") {
    return executionIntent === EXECUTION_GRANT_INTENT ? [] : ["execution_intent_missing_or_invalid"];
  }
  if (grantSource === "cli_confirm") {
    return envConfirm === EXECUTION_GRANT_INTENT ? [] : [`${EXECUTION_GRANT_CONFIRM_ENV}_missing_or_invalid`];
  }
  if (grantSource === "test_fake_transport") {
    return executionIntent === EXECUTION_GRANT_INTENT ? [] : ["execution_intent_missing_or_invalid"];
  }
  return ["grant_source_invalid"];
}

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

async function validateWriteScope({ repo, bundle, projectStatePath = defaultProjectStatePath }) {
  const state = await readProjectState(projectStatePath);
  const scope = state.guardrails?.platform_write_scope || {};
  const attemptState = await repo.getCreateAttemptState(bundle.job.job_id);
  const plan = bundle.executionPlan || await repo.getLatestLaunchExecutionPlan(bundle.job.job_id);
  const planScopeBlockers = optionalPlanScopeBlockers(scope, plan);
  const blockers = [
    ...(state.guardrails?.platform_write_allowed === true ? [] : ["platform_write_scope_not_enabled"]),
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

async function revokeWriteScope(projectStatePath = defaultProjectStatePath) {
  const state = await readProjectState(projectStatePath);
  if (!state.guardrails) state.guardrails = {};
  state.guardrails.platform_write_allowed = false;
  state.guardrails.platform_write_scope = {
    ...(state.guardrails.platform_write_scope || {}),
    mode: "read_only_no_platform_write_after_single_create_attempt",
    target_job_id: "",
    target_draft_id: "",
    target_payload_hash: "",
    allowed_actions: [],
    maximum_actions: 0,
    retry_allowed: false
  };
  await writeProjectState(projectStatePath, state);
}

export async function executeConfirmedLaunch({
  repo,
  jobId,
  grantSource,
  executionIntent = "",
  envConfirm = process.env[EXECUTION_GRANT_CONFIRM_ENV] || "",
  fetchImpl = globalThis.fetch,
  projectStatePath = defaultProjectStatePath
} = {}) {
  if (!repo) throw new Error("repo_required");
  if (!jobId) throw new Error("job_id_required");

  const blockers = validateGrant({ grantSource, executionIntent, envConfirm });
  const bundle = await repo.getLaunchJobBundle(jobId);
  if (!bundle) throw new Error("job_not_found");

  if (blockers.length) {
    const view = await getJobView(repo, jobId);
    const result = {
      ...view,
      executionGrant: {
        status: "blocked",
        grantSource,
        blockers,
        createCalled: false
      }
    };
    assertNoSensitiveLeak(result.executionGrant);
    return result;
  }

  const scopeCheck = await validateWriteScope({ repo, bundle, projectStatePath });
  if (scopeCheck.blockers.length) {
    const view = await getJobView(repo, jobId);
    const result = {
      ...view,
      executionGrant: {
        status: "blocked",
        grantSource,
        blockers: scopeCheck.blockers,
        createCalled: false,
        scopeSummary: scopeCheck.scopeSummary
      }
    };
    assertNoSensitiveLeak(result.executionGrant);
    return result;
  }

  const latestBundleBeforeCreate = await repo.getLaunchJobBundle(jobId);
  const secondScopeCheck = await validateWriteScope({ repo, bundle: latestBundleBeforeCreate, projectStatePath });
  if (secondScopeCheck.blockers.length) {
    const view = await getJobView(repo, jobId);
    const result = {
      ...view,
      executionGrant: {
        status: "blocked",
        grantSource,
        blockers: secondScopeCheck.blockers,
        createCalled: false,
        scopeSummary: secondScopeCheck.scopeSummary
      }
    };
    assertNoSensitiveLeak(result.executionGrant);
    return result;
  }

  const executionGrantId = grantId(jobId, grantSource);
  try {
    const view = await runJob(repo, jobId, {
      mode: "execute_once",
      mockReady: grantSource === "test_fake_transport",
      allowReadonlyDependency: true,
      allowNetworkWrite: true,
      confirmationIntent: STD_PROJECT_CREATE_CONFIRM_VALUE,
      confirmVariableValue: STD_PROJECT_CREATE_CONFIRM_VALUE,
      grantSource,
      executionGrantId,
      fetchImpl
    });
    const result = {
      ...view,
      executionGrant: {
        status: "consumed",
        grantSource,
        executionGrantId,
        createCalled: createCalledFromView(view),
        maximumActions: 1,
        retryAllowed: false
      }
    };
    assertNoSensitiveLeak(result.executionGrant);
    return result;
  } finally {
    await revokeWriteScope(projectStatePath);
  }
}
