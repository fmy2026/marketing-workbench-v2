import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { getJobView, runJob } from "./launchWorkflow.mjs";
import { revokeWriteScope, validatePlanConfirmationScope, validateWriteScope } from "./executionGrantScope.mjs";
import { assertNoSensitiveLeak } from "./skills/oe3/00-contracts.mjs";
import {
  STD_PROJECT_CREATE_CONFIRM_VALUE
} from "../platforms/oceanengineStdProjectCreateExecutor.mjs";

export const EXECUTION_GRANT_CONFIRM_ENV = "MWBV2_OE_EXECUTION_CONFIRM";
export const EXECUTION_GRANT_INTENT = "EXECUTE_ONE_LAUNCH";

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

async function usePlanBoundConfirmation(bundle, projectStatePath) {
  const binding = bundle.executionPlan?.metadata?.execution_scope?.binding_mode === "single_confirmation_plan";
  if (!binding) return false;
  if (bundle.job?.source_usage !== "test_run" || !projectStatePath) return true;
  const state = JSON.parse(await readFile(projectStatePath, "utf8"));
  return state.guardrails?.platform_write_scope?.mode !== "single_oceanengine_std_project_create";
}


export async function executeConfirmedLaunch({
  repo,
  jobId,
  grantSource,
  executionIntent = "",
  envConfirm = process.env[EXECUTION_GRANT_CONFIRM_ENV] || "",
  fetchImpl = globalThis.fetch,
  projectStatePath
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

  const planBound = await usePlanBoundConfirmation(bundle, projectStatePath);
  if (!planBound && (bundle.job?.source_usage || "runtime_truth") !== "test_run") {
    const view = await getJobView(repo, jobId);
    const result = {
      ...view,
      executionGrant: {
        status: "blocked",
        grantSource,
        blockers: ["runtime_truth_requires_plan_bound_confirmation"],
        createCalled: false
      }
    };
    assertNoSensitiveLeak(result.executionGrant);
    return result;
  }
  const scopeCheck = planBound
    ? await validatePlanConfirmationScope({ repo, bundle, projectStatePath })
    : await validateWriteScope({ repo, bundle, projectStatePath });
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

  let latestBundleBeforeCreate = await repo.getLaunchJobBundle(jobId);
  const secondScopeCheck = planBound
    ? await validatePlanConfirmationScope({ repo, bundle: latestBundleBeforeCreate, projectStatePath })
    : await validateWriteScope({ repo, bundle: latestBundleBeforeCreate, projectStatePath });
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
  const planMetadata = latestBundleBeforeCreate.executionPlan?.metadata || {};
  const createAttemptNo = Number(planMetadata.create_attempt_no || latestBundleBeforeCreate.executionPlan?.plan_version || 1);
  const expectedPlanId = latestBundleBeforeCreate.executionPlan?.plan_id || "";
  const expectedPlanHash = latestBundleBeforeCreate.executionPlan?.plan_hash || "";
  const singleVariableExperiment = planMetadata.single_variable_experiment || {};
  try {
    if (planBound) {
      const planningIntent = planMetadata.planning_intent || {};
      await repo.upsertLaunchConfirmation({
        confirmationId: `CONFIRM-${jobId}-EXECUTION-PLAN`,
        jobId,
        draftId: "",
        objectType: latestBundleBeforeCreate.job.object_type,
        objectName: planningIntent.project_name || "",
        payloadHash: "",
        confirmationStatus: "confirmed_for_execution_plan",
        confirmVariable: `${EXECUTION_GRANT_CONFIRM_ENV}=${EXECUTION_GRANT_INTENT}`,
        confirmedBy: grantSource || "local_operator",
        planId: expectedPlanId,
        metadata: {
          binding_mode: "single_confirmation_plan",
          plan_hash: expectedPlanHash,
          business_intent_hash: planningIntent.business_intent_hash || "",
          advertiser_id: latestBundleBeforeCreate.job.advertiser_id,
          allowed_actions: latestBundleBeforeCreate.executionPlan?.planned_actions?.map((action) => action.action_type) || [],
          maximum_create_calls: 1,
          retry_allowed: false,
          raw_payload_stored: false,
          raw_response_stored: false
        }
      });
      latestBundleBeforeCreate = await repo.getLaunchJobBundle(jobId);
    }
    const view = await runJob(repo, jobId, {
      mode: "execute_once",
      mockReady: grantSource === "test_fake_transport",
      allowReadonlyDependency: true,
      allowNetworkWrite: true,
      confirmationIntent: STD_PROJECT_CREATE_CONFIRM_VALUE,
      confirmVariableValue: STD_PROJECT_CREATE_CONFIRM_VALUE,
      grantSource,
      executionGrantId,
      createAttemptNo,
      verificationSeriesId: planMetadata.verification_series_id || "",
      verificationTaskRef: planMetadata.task_ref || "",
      maximumCreateAttempts: Number(planMetadata.maximum_create_attempts || 3),
      singleVariableExperiment,
      expectedPlanId,
      expectedPlanHash,
      confirmedPlanExecution: planBound,
      projectStatePath,
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
