import { PLAN_KIND_STD_PROJECT_CREATE } from "./executionPlan.mjs";

const COMPLETED_GATE = "first_std_project_create_completed";

function clean(value) {
  return String(value ?? "").trim();
}

function planKind(plan = {}) {
  return clean(plan.plan_kind || plan.metadata?.plan_kind);
}

function verifiedRuntimeFacts(bundle = {}, summary = null) {
  const job = bundle.job || {};
  const plan = bundle.executionPlan || {};
  const action = bundle.platformAction || {};
  const object = bundle.createdObject || {};
  const readback = bundle.readback || {};
  const draft = bundle.draft || {};
  const jobId = clean(job.job_id);
  const caseId = clean(job.case_id);
  const planId = clean(plan.plan_id);
  const objectId = clean(object.object_id);
  const objectName = clean(object.object_name);
  const draftName = clean(draft.project_name);
  const readbackObjectId = clean(readback.object_id);
  const readbackObjectName = clean(readback.object_name);

  if (!jobId || !caseId || !planId) return { eligible: false, reason: "verified_finalization_binding_missing" };
  if (clean(job.source_usage) !== "runtime_truth") return { eligible: false, reason: "verified_finalization_runtime_truth_required" };
  if (clean(summary?.latest_job_id) !== jobId) return { eligible: false, reason: "verified_finalization_latest_case_job_required" };
  if (clean(summary?.current_gate) !== COMPLETED_GATE) return { eligible: false, reason: "verified_finalization_gate_not_completed" };
  if (planKind(plan) !== PLAN_KIND_STD_PROJECT_CREATE) return { eligible: false, reason: "verified_finalization_create_plan_required" };
  if (!["ready", "waiting_readback", "consumed"].includes(clean(plan.plan_status))) {
    return { eligible: false, reason: "verified_finalization_plan_status_invalid" };
  }
  if (clean(action.plan_id) !== planId || clean(action.action_type) !== "oceanengine_std_project_create") {
    return { eligible: false, reason: "verified_finalization_action_binding_invalid" };
  }
  if (clean(action.action_status) !== "succeeded" || action.object_id_present !== true) {
    return { eligible: false, reason: "verified_finalization_create_not_succeeded" };
  }
  if (!objectId || !objectName || !draftName) return { eligible: false, reason: "verified_finalization_object_or_draft_missing" };
  if (clean(readback.readback_status) !== "readback_verified") {
    return { eligible: false, reason: "verified_finalization_readback_not_verified" };
  }
  if (readbackObjectId !== objectId) return { eligible: false, reason: "verified_finalization_project_id_mismatch" };
  if (readbackObjectName !== draftName || objectName !== draftName) {
    return { eligible: false, reason: "verified_finalization_project_name_mismatch" };
  }
  return { eligible: true, jobId, caseId, planId };
}

export async function finalizeVerifiedStdProjectRuntimeCase({
  repo,
  jobId,
  projectStatePath,
  getJobViewFn
} = {}) {
  if (!repo) throw new Error("repo_required");
  if (!clean(jobId)) throw new Error("job_id_required");

  const view = async () => typeof getJobViewFn === "function"
    ? getJobViewFn(repo, jobId, { projectStatePath })
    : null;
  if (
    typeof repo.getLaunchJobBundle !== "function" ||
    typeof repo.getWorkflowCaseSummary !== "function" ||
    typeof repo.markConfirmedStdProjectCreatePlanWaitingReadback !== "function" ||
    typeof repo.consumeConfirmedStdProjectCreatePlanAfterReadback !== "function" ||
    typeof repo.completeVerifiedStdProjectRuntimeCase !== "function"
  ) {
    return { finalized: false, reason: "verified_finalization_repository_capability_missing", view: null };
  }

  let bundle = await repo.getLaunchJobBundle(jobId);
  if (!bundle) return { finalized: false, reason: "job_not_found", view: null };
  let summary = await repo.getWorkflowCaseSummary(bundle.job?.case_id);
  let facts = verifiedRuntimeFacts(bundle, summary);
  if (!facts.eligible) return { finalized: false, reason: facts.reason, view: null };

  if (clean(bundle.executionPlan?.plan_status) === "ready") {
    await repo.markConfirmedStdProjectCreatePlanWaitingReadback({ jobId: facts.jobId, planId: facts.planId });
    bundle = await repo.getLaunchJobBundle(jobId);
    summary = await repo.getWorkflowCaseSummary(facts.caseId);
    facts = verifiedRuntimeFacts(bundle, summary);
    if (!facts.eligible) return { finalized: false, reason: facts.reason, view: await view() };
  }

  if (clean(bundle.executionPlan?.plan_status) === "waiting_readback") {
    await repo.consumeConfirmedStdProjectCreatePlanAfterReadback({ jobId: facts.jobId, planId: facts.planId });
    bundle = await repo.getLaunchJobBundle(jobId);
    summary = await repo.getWorkflowCaseSummary(facts.caseId);
    facts = verifiedRuntimeFacts(bundle, summary);
    if (!facts.eligible) return { finalized: false, reason: facts.reason, view: await view() };
  }

  if (clean(bundle.executionPlan?.plan_status) !== "consumed") {
    return { finalized: false, reason: "verified_finalization_plan_not_consumed", view: await view() };
  }
  const completion = await repo.completeVerifiedStdProjectRuntimeCase({
    caseId: facts.caseId,
    jobId: facts.jobId,
    planId: facts.planId
  });
  return {
    finalized: completion?.completed === true || clean(bundle.case?.lifecycle_status) === "completed",
    reason: completion?.completed === true ? "verified_runtime_case_completed" : "verified_runtime_case_already_completed_or_ineligible",
    caseId: facts.caseId,
    jobId: facts.jobId,
    planId: facts.planId,
    view: await view()
  };
}
