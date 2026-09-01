import { ACTION_ENSURE_MONITOR, PLAN_KIND_MONITOR_BOOTSTRAP } from "../../../executionPlan.mjs";
import { validatePlannedActionGrant } from "../../../plannedActionGrant.mjs";
import { revokeWriteScope } from "../../../executionGrantScope.mjs";
import { evaluatePlanBoundWriteAuthorization } from "../../../workbenchRuntimeWritePolicy.mjs";
import { assertNoSensitiveLeak, sanitizeForPublic } from "../00-contracts.mjs";
import {
  executeMonitorBootstrapWithAuthorization,
  runMonitorProvisionReadonlyReconcile
} from "./index.mjs";

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

function planKind(plan = {}) {
  return clean(plan.plan_kind || plan.planKind || plan.metadata?.plan_kind);
}

function actionId(jobId, planIdValue) {
  return `ACTION-${jobId}-ENSURE_MONITOR-${planIdValue.replace(/[^A-Za-z0-9]+/g, "_").slice(-72)}`;
}

function actionIdempotencyKey(action = {}, actionIdValue = "") {
  return `${clean(action.idempotency_key) || `IDEMP-${actionIdValue}`}:${actionIdValue}`;
}

function bootstrapPlanBlockers({ bundle, plan, expectedPlanId = "", expectedPlanHash = "" } = {}) {
  const monitor = plan?.metadata?.monitor_bootstrap || {};
  const planned = actions(plan);
  const actionTypes = planned.map((action) => action.action_type);
  return [
    ...(bundle?.job?.case_id ? [] : ["monitor_bootstrap_case_id_required"]),
    ...(planKind(plan) === PLAN_KIND_MONITOR_BOOTSTRAP ? [] : ["monitor_plan_kind_invalid"]),
    ...(plan?.plan_status === "ready" ? [] : ["execution_plan_not_ready_for_confirmation"]),
    ...(Array.isArray(plan?.blocker_codes || plan?.blockerCodes) && (plan.blocker_codes || plan.blockerCodes).length === 0
      ? []
      : ["execution_plan_has_blockers"]),
    ...(actionTypes.length === 1 && actionTypes[0] === ACTION_ENSURE_MONITOR ? [] : ["monitor_plan_action_set_invalid"]),
    ...(clean(monitor.provision_id) ? [] : ["monitor_provision_id_missing"]),
    ...(clean(monitor.cycle_id) ? [] : ["monitor_cycle_missing"]),
    ...(Number(monitor.attempt_no) >= 1 && Number(monitor.attempt_no) <= 2 ? [] : ["monitor_attempt_not_plan_eligible"]),
    ...(clean(monitor.create_request_hash).startsWith("sha256:") ? [] : ["monitor_create_request_hash_missing"]),
    ...(clean(monitor.config_contract_hash).startsWith("sha256:") ? [] : ["monitor_config_contract_hash_missing"]),
    ...(clean(monitor.readonly_evidence_ref) ? [] : ["monitor_readonly_evidence_missing"]),
    ...(expectedPlanId && expectedPlanId !== planId(plan) ? ["execution_plan_id_changed_since_confirmation"] : []),
    ...(expectedPlanHash && expectedPlanHash !== planHash(plan) ? ["execution_plan_hash_changed_since_confirmation"] : [])
  ];
}

async function confirmationAvailability({ repo, bundle, plan, projectStatePath, authorizationSource }) {
  const authorization = await evaluatePlanBoundWriteAuthorization({
    repo,
    bundle,
    plan,
    projectStatePath,
    authorizationSource
  });
  const scope = plan?.metadata?.execution_scope || {};
  const existing = typeof repo.getLaunchConfirmationForPlan === "function"
    ? await repo.getLaunchConfirmationForPlan(planId(plan))
    : null;
  const blockers = [
    ...authorization.blockers,
    ...(bundle.case?.lifecycle_status === "active" ? [] : ["workflow_case_not_active"]),
    ...(scope.binding_mode === "single_confirmation_plan" ? [] : ["execution_plan_confirmation_model_invalid"]),
    ...(scope.target_job_id === bundle.job.job_id ? [] : ["platform_write_scope_job_mismatch"]),
    ...(scope.target_advertiser_id === bundle.job.advertiser_id ? [] : ["platform_write_scope_advertiser_mismatch"]),
    ...(scope.target_plan_id === planId(plan) ? [] : ["platform_write_scope_plan_id_mismatch"]),
    ...(scope.target_plan_hash === planHash(plan) ? [] : ["platform_write_scope_plan_hash_mismatch"]),
    ...(Number(scope.maximum_actions) === 1 ? [] : ["platform_write_scope_maximum_actions_invalid"]),
    ...(Number(scope.maximum_platform_calls) === 1 ? [] : ["platform_write_scope_maximum_platform_calls_invalid"]),
    ...(scope.retry_allowed === false ? [] : ["platform_write_scope_retry_allowed_must_be_false"]),
    ...(existing ? ["execution_plan_confirmation_already_recorded"] : [])
  ];
  return {
    status: blockers.length ? "blocked" : "passed",
    blockers,
    authorizationMode: authorization.authorizationMode
  };
}

function result(status, blockers, extra = {}) {
  const safe = sanitizeForPublic({
    status,
    blockers: [...new Set(blockers)].filter(Boolean),
    platformWriteCalled: false,
    retryAllowed: false,
    rawRequestStored: false,
    rawResponseStored: false,
    ...extra
  });
  assertNoSensitiveLeak(safe);
  return safe;
}

async function revokeTaskScope(projectStatePath, authorizationMode) {
  if (authorizationMode !== "workbench_plan_bound") await revokeWriteScope(projectStatePath);
}

export async function executeConfirmedMonitorBootstrap({
  repo,
  jobId,
  expectedPlanId = "",
  expectedPlanHash = "",
  grantSource = "workbench_conversation",
  projectStatePath,
  fetchImpl = globalThis.fetch
} = {}) {
  if (!repo || !jobId) throw new Error("monitor_bootstrap_executor_job_required");
  let bundle = await repo.getLaunchJobBundle(jobId);
  if (!bundle?.job) throw new Error("job_not_found");
  const plan = bundle.executionPlan || await repo.getLatestLaunchExecutionPlan(jobId);
  const planBlockers = bootstrapPlanBlockers({ bundle, plan, expectedPlanId, expectedPlanHash });
  if (planBlockers.length) return result("blocked", planBlockers);

  const availability = await confirmationAvailability({
    repo,
    bundle,
    plan,
    projectStatePath,
    authorizationSource: grantSource
  });
  if (availability.status !== "passed") return result("blocked", availability.blockers);

  const confirmationId = `CONFIRM-${jobId}-MONITOR-BOOTSTRAP`;
  const confirmationClaim = await repo.claimLaunchExecutionPlanConfirmation({
    confirmationId,
    jobId,
    draftId: "",
    objectType: "monitor_bootstrap",
    objectName: "monitor bootstrap",
    payloadHash: "",
    confirmationStatus: "confirmed_for_execution_plan",
    confirmVariable: "workbench:confirm_monitor_bootstrap",
    confirmedBy: grantSource,
    planId: planId(plan),
    metadata: {
      binding_mode: "single_confirmation_plan",
      plan_hash: planHash(plan),
      plan_kind: PLAN_KIND_MONITOR_BOOTSTRAP,
      advertiser_id: bundle.job.advertiser_id,
      allowed_actions: [ACTION_ENSURE_MONITOR],
      maximum_platform_calls: 1,
      retry_allowed: false,
      raw_payload_stored: false,
      raw_response_stored: false
    }
  });
  if (confirmationClaim?.claimed !== true) {
    return result("blocked", ["execution_plan_confirmation_already_recorded"]);
  }

  try {
    bundle = await repo.getLaunchJobBundle(jobId);
    const grant = await validatePlannedActionGrant({
      repo,
      bundle,
      actionType: ACTION_ENSURE_MONITOR,
      projectStatePath,
      expectedMaximumPlatformCalls: 1
    });
    if (grant.status !== "passed") {
      await revokeTaskScope(projectStatePath, availability.authorizationMode);
      return result("blocked", grant.blockers, { confirmationId });
    }

  const monitor = grant.plan.metadata?.monitor_bootstrap || {};
  const target = {
    routeId: bundle.job.route_id,
    gameCode: bundle.job.game_code,
    advertiserId: bundle.job.advertiser_id
  };
  const fresh = await runMonitorProvisionReadonlyReconcile({
    repo,
    target,
    jobId,
    planId: planId(grant.plan),
    fetchImpl
  });
  const freshContract = fresh.monitorBootstrapContract || null;
  const freshAlreadyReady = fresh.runStatus === "touchpoint_resolved";
  const freshContractMatches = freshContract &&
    freshContract.createRequestHash === monitor.create_request_hash &&
    freshContract.configContractHash === monitor.config_contract_hash &&
    freshContract.provisionId === monitor.provision_id &&
    freshContract.cycleId === monitor.cycle_id &&
    Number(freshContract.attemptNo) === Number(monitor.attempt_no);
  if (!freshAlreadyReady && !freshContractMatches) {
    await revokeTaskScope(projectStatePath, availability.authorizationMode);
    return result("blocked", ["monitor_fresh_readonly_contract_drift"], {
      confirmationId,
      freshReadonlyCompleted: true
    });
  }

  const action = actions(grant.plan)[0];
  const actionIdValue = actionId(jobId, planId(grant.plan));
  const idempotencyKey = actionIdempotencyKey(action, actionIdValue);
  const claim = await repo.claimPlannedExecutionAction({
    actionId: actionIdValue,
    jobId,
    confirmationId,
    planId: planId(grant.plan),
    actionType: ACTION_ENSURE_MONITOR,
    idempotencyKey
  });
  if (!claim?.claimed) {
    await revokeTaskScope(projectStatePath, availability.authorizationMode);
    return result("blocked", ["planned_action_already_consumed:ensure_monitor"], { confirmationId, freshReadonlyCompleted: true });
  }

  if (freshAlreadyReady) {
    await repo.finishPlannedExecutionAction({
      actionId: actionIdValue,
      jobId,
      confirmationId,
      planId: planId(grant.plan),
      actionType: ACTION_ENSURE_MONITOR,
      idempotencyKey,
      actionStatus: "succeeded",
      metadata: { executor_status: "already_ready_after_fresh_readonly", platform_write_called: false }
    });
    await repo.consumeConfirmedResourceExecutionPlan({ jobId, planId: planId(grant.plan) });
    await revokeTaskScope(projectStatePath, availability.authorizationMode);
    return result("passed", [], { confirmationId, freshReadonlyCompleted: true, monitorReady: true });
  }

  const ensure = await executeMonitorBootstrapWithAuthorization({
    repo,
    target,
    jobId,
    planId: planId(grant.plan),
    idempotencyKey,
    fetchImpl,
    authorization: {
      status: "passed",
      planId: planId(grant.plan),
      planHash: planHash(grant.plan),
      confirmationId,
      target,
      provisionId: monitor.provision_id,
      cycleId: monitor.cycle_id,
      attemptNo: Number(monitor.attempt_no),
      createRequestHash: monitor.create_request_hash,
      configContractHash: monitor.config_contract_hash
    }
  });
  const succeeded = ensure.status === "passed" && ensure.runStatus === "touchpoint_resolved";
  await repo.finishPlannedExecutionAction({
    actionId: actionIdValue,
    jobId,
    confirmationId,
    planId: planId(grant.plan),
    actionType: ACTION_ENSURE_MONITOR,
    idempotencyKey,
    actionStatus: succeeded ? "succeeded" : "failed_once",
    metadata: {
      executor_status: ensure.status || "unknown",
      platform_write_called: ensure.createCalled === true,
      monitor_ready: succeeded
    }
  });
  if (!succeeded) {
    await revokeTaskScope(projectStatePath, availability.authorizationMode);
    return result("blocked", ensure.blockers || ["monitor_bootstrap_readback_not_ready"], {
      confirmationId,
      freshReadonlyCompleted: true,
      platformWriteCalled: ensure.createCalled === true
    });
  }
  await repo.consumeConfirmedResourceExecutionPlan({ jobId, planId: planId(grant.plan) });
  await revokeTaskScope(projectStatePath, availability.authorizationMode);
  return result("passed", [], { confirmationId, freshReadonlyCompleted: true, monitorReady: true, platformWriteCalled: true });
  } catch (error) {
    await revokeTaskScope(projectStatePath, availability.authorizationMode).catch(() => undefined);
    throw error;
  }
}
