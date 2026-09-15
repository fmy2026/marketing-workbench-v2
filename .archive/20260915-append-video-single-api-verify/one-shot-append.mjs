import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PostgresRepository } from "../../src/repositories/postgresRepository.mjs";
import { createJob, runProjectVideoAppendReadback } from "../../src/workflows/launchWorkflow.mjs";
import { executeConfirmedLaunch, EXECUTION_GRANT_INTENT } from "../../src/workflows/executeConfirmedLaunch.mjs";
import {
  buildProjectVideoAppendWireBody,
  prepareProjectVideoAppendReadonly,
  PROJECT_VIDEO_APPEND_ACTION
} from "../../src/platforms/oceanengineProjectVideoAppendExecutor.mjs";
import { resolveGuideVideoReadonly } from "../../src/workflows/skills/oe3/04-video-material-readiness.mjs";

const TASK_ID = "TASK-MWBV2-APPEND-VIDEO-SINGLE-API-VERIFY-20260915";
const CASE_ID = "CASE-MWBV2-718FF962130E387B3A";
const ADVERTISER_ID = "1875922007036249";
const PROJECT_ID = "7684895789612826666";
const MATERIAL_CODE = "4iLE-2";
const PROJECT_STATE_PATH = resolve("project.state.json");
const ACTION_TYPE = PROJECT_VIDEO_APPEND_ACTION;

function hash(value) {
  return `sha256:${createHash("sha256").update(String(value)).digest("hex")}`;
}

function output(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function fail(code) {
  throw new Error(code);
}

function appendItems(plan = {}) {
  return Array.isArray(plan.metadata?.append_items) ? plan.metadata.append_items : [];
}

function hasExpectedSingleItem(plan = {}) {
  const items = appendItems(plan);
  return items.length === 1 && String(items[0]?.origin_resource_id || "") === MATERIAL_CODE &&
    typeof items[0]?.video_id === "string" && Boolean(items[0].video_id.trim());
}

function taskActionKey(plan = {}) {
  return `append-diagnostic:${hash(`${TASK_ID}:${plan.plan_id}:${plan.plan_hash}`).slice("sha256:".length, 38)}`;
}

function sanitizedPreview(bundle, plan, phase) {
  const item = appendItems(plan)[0] || {};
  const scope = plan.metadata?.execution_scope || {};
  return {
    phase,
    taskId: TASK_ID,
    caseId: CASE_ID,
    accountId: ADVERTISER_ID,
    projectId: PROJECT_ID,
    materialCode: MATERIAL_CODE,
    jobId: bundle.job?.job_id || "",
    planId: plan.plan_id || "",
    planHash: plan.plan_hash || "",
    planStatus: plan.plan_status || "",
    videoId: item.video_id || "",
    guideVideoIdPresent: Boolean(item.guide_video_id),
    coverVideoIdPresent: Boolean(item.video_cover_id),
    requestHash: plan.metadata?.append_request_hash || "",
    requestFields: plan.metadata?.append_request_field_manifest?.field_names || [],
    actionType: ACTION_TYPE,
    idempotencyKey: plan.planned_actions?.[0]?.idempotency_key || "",
    maximumPlatformCalls: Number(plan.planned_actions?.[0]?.maximum_platform_calls || 0),
    plannedAttemptNo: Number(plan.metadata?.append_attempt_no || 0),
    maximumAppendAttempts: Number(plan.metadata?.maximum_append_attempts || 0),
    projectSnapshotHash: plan.metadata?.project_snapshot_hash || "",
    targetPlanHashMatchesScope: scope.target_plan_hash === plan.plan_hash,
    rawPayloadStored: false,
    rawResponseStored: false
  };
}

async function newestCaseBundle(repo) {
  const summary = await repo.getWorkflowCaseSummary(CASE_ID);
  if (!summary || summary.lifecycle_status !== "active") fail("workflow_case_not_active");
  if (!summary.latest_job_id) fail("workflow_case_latest_job_missing");
  const bundle = await repo.getLaunchJobBundle(summary.latest_job_id);
  if (!bundle?.job || bundle.job.case_id !== CASE_ID) fail("workflow_case_latest_job_invalid");
  if (String(bundle.job.advertiser_id) !== ADVERTISER_ID || String(bundle.case?.target_project_id) !== PROJECT_ID) fail("diagnostic_target_scope_mismatch");
  return { summary, bundle };
}

async function prepare(repo) {
  const { bundle: predecessor } = await newestCaseBundle(repo);
  const existingPlan = predecessor.executionPlan;
  if (existingPlan?.plan_status === "ready" &&
    existingPlan?.metadata?.task_binding?.task_id === TASK_ID &&
    hasExpectedSingleItem(existingPlan) &&
    String(existingPlan?.planned_actions?.[0]?.idempotency_key || "").startsWith("append-diagnostic:")) {
    return {
      bundle: predecessor,
      plan: existingPlan,
      preview: sanitizedPreview(predecessor, existingPlan, "ready_for_user_confirmation"),
      ready: true
    };
  }

  const created = await createJob(repo, {
    case_id: CASE_ID,
    source_usage: "runtime_truth",
    source_record_ref: `task:${TASK_ID}:single-api-prepare`,
    schema_version: "launch-request.v2",
    operation: "append_project_videos",
    route_id: predecessor.job.route_id,
    game_code: predecessor.job.game_code,
    advertiser_id: ADVERTISER_ID,
    project_id: PROJECT_ID,
    origin_resource_ids: [MATERIAL_CODE]
  });
  const bundle = await repo.getLaunchJobBundle(created.jobId);
  if (!bundle?.job || bundle.job.case_id !== CASE_ID) fail("diagnostic_job_creation_failed");
  const owner = predecessor.case?.owner_user_id
    ? await repo.getWorkbenchUserById(predecessor.case.owner_user_id)
    : null;
  const qiankunOwnerKey = String(owner?.qiankun_owner_key || "").trim();
  if (!qiankunOwnerKey) fail("diagnostic_owner_key_missing");

  const materialAccountId = String(bundle.defaults?.raw_defaults?.material_source_account?.advertiser_id || "").trim();
  if (!materialAccountId) fail("diagnostic_material_source_account_missing");
  const prepared = await prepareProjectVideoAppendReadonly({
    advertiserId: ADVERTISER_ID,
    projectId: PROJECT_ID,
    originResourceIds: [MATERIAL_CODE],
    materialAccountId,
    ownerKey: qiankunOwnerKey
  });
  const effectivePlan = prepared?.effectivePlan || prepared?.plan || {};
  const candidates = (prepared?.items || []).filter((item) => item.status === "append_ready");
  let guide = { required: false, status: "not_required", blockers: [], guideVideoId: "", responseHash: "", evidenceRef: "", verifiedInstanceId: "" };
  if (effectivePlan.status === "ready" && candidates.length === 1) {
    guide = await resolveGuideVideoReadonly({ repo, bundle, allowReadonlyDependency: true });
  }
  const appendItemsForPlan = candidates.map((item) => ({
    origin_resource_id: item.originResourceId,
    video_id: item.videoId,
    ...(guide.required === true && guide.status === "passed" ? { guide_video_id: guide.guideVideoId } : {})
  }));
  const wire = appendItemsForPlan.length === 1
    ? buildProjectVideoAppendWireBody({ advertiserId: ADVERTISER_ID, projectId: PROJECT_ID, appendItems: appendItemsForPlan })
    : null;
  const attemptState = await repo.getCaseProjectVideoAppendAttemptState(CASE_ID);
  const appendAttemptNo = Number(attemptState?.nextAppendAttemptNo || 1);
  const maximumAppendAttempts = Number(attemptState?.maximumAppendAttempts || 3);
  const blockerCodes = [...new Set([
    ...(effectivePlan.blockerCodes || prepared?.blockerCodes || []),
    ...(candidates.length === 1 ? [] : [candidates.length === 0 && (prepared?.items || []).some((item) => item.status === "already_in_project") ? "project_video_already_present" : "diagnostic_video_not_append_ready"]),
    ...(guide.status === "blocked" ? (guide.blockers || ["guide_video_capability_probe_failed"]) : []),
    ...(wire?.status === "passed" ? [] : [wire?.blockers?.[0] || "project_video_append_wire_body_invalid"]),
    ...(appendAttemptNo <= maximumAppendAttempts ? [] : ["project_video_append_attempt_limit_reached"])
  ].map(String).filter(Boolean))];
  const planId = `PLAN-${bundle.job.job_id}-APPEND-V1`;
  const provisionalPlan = { plan_id: planId, plan_hash: hash(`${TASK_ID}:${planId}`) };
  const idempotencyKey = taskActionKey(provisionalPlan);
  const planHash = hash(JSON.stringify({
    taskId: TASK_ID,
    planId,
    actionType: ACTION_TYPE,
    idempotencyKey,
    requestHash: wire?.requestHash || "",
    projectSnapshotHash: effectivePlan.projectSnapshotHash || "",
    appendItems: appendItemsForPlan,
    appendAttemptNo,
    maximumAppendAttempts
  }));
  const ready = blockerCodes.length === 0;
  const plannedActions = ready ? [{
    action_type: ACTION_TYPE,
    target_ref: `project:${PROJECT_ID}`,
    idempotency_key: idempotencyKey,
    status: "ready",
    module_ref: "src/platforms/oceanengineProjectVideoAppendExecutor.mjs",
    depends_on: ["project_material_readonly", "video_origin_mapping_readonly", "guide_video_readonly"],
    writes_to: ["platform_actions", "readback_records"],
    reason: "append_one_frozen_target_video_for_task_validation",
    maximum_platform_calls: 1,
    endpoint: "/open_api/v3.0/oc_project/material/create/",
    method: "POST"
  }] : [];
  const plan = {
    planId,
    jobId: bundle.job.job_id,
    planVersion: 1,
    planKind: "project_video_append",
    planStatus: ready ? "ready" : "blocked",
    planHash,
    plannedActions,
    blockerCodes,
    draftId: "",
    payloadHash: "",
    sourceUsage: bundle.job.source_usage,
    metadata: {
      plan_kind: "project_video_append",
      compiler: `task:${TASK_ID}:one-shot-append`,
      project_id: PROJECT_ID,
      append_items: appendItemsForPlan,
      append_request_hash: wire?.requestHash || "",
      append_request_field_manifest: wire?.requestFieldManifest || {},
      append_attempt_no: appendAttemptNo,
      maximum_append_attempts: maximumAppendAttempts,
      append_retry_cooldown_seconds: 20,
      append_material_contract: {
        guide_video_required: guide.required === true,
        guide_video_ready: guide.status === "passed" || guide.status === "not_required",
        guide_video_id_present: Boolean(guide.guideVideoId),
        guide_video_response_hash: guide.responseHash || "",
        guide_video_evidence_ref: guide.evidenceRef || "",
        guide_video_verified_instance_id: guide.verifiedInstanceId || "",
        cover_policy: bundle.account?.video_cover_required === true ? "explicit_cover_required" : "platform_default_allowed",
        payload_persisted: false
      },
      project_snapshot_hash: effectivePlan.projectSnapshotHash || "",
      original_project_video_ids: [...(prepared?.projectVideoIds || [])].sort(),
      readonly_checks: prepared?.readonlyChecks || {},
      root_blocker_codes: blockerCodes.slice(0, 1),
      append_summary: {
        requested_count: 1,
        already_in_project_count: (prepared?.items || []).filter((item) => item.status === "already_in_project").length,
        append_ready_count: candidates.length,
        guide_video_bound_count: guide.required === true && guide.status === "passed" ? candidates.length : 0,
        target_push_required_count: (prepared?.items || []).filter((item) => item.status === "target_push_required").length,
        source_prepare_required_count: (prepared?.items || []).filter((item) => item.status === "source_prepare_required").length
      },
      task_binding: {
        task_id: TASK_ID,
        purpose: "single_api_validation",
        exact_material_code: MATERIAL_CODE,
        maximum_platform_calls: 1,
        retry_allowed: false,
        payload_persisted: false,
        response_persisted: false
      },
      execution_scope: {
        binding_mode: "single_confirmation_plan",
        target_job_id: bundle.job.job_id,
        target_advertiser_id: ADVERTISER_ID,
        target_project_id: PROJECT_ID,
        target_plan_id: planId,
        target_plan_hash: planHash,
        allowed_actions: ready ? [ACTION_TYPE] : [],
        allowed_plan_actions: ready ? [ACTION_TYPE] : [],
        maximum_actions: ready ? 1 : 0,
        maximum_platform_calls: ready ? 1 : 0,
        maximum_create_calls: 0,
        retry_allowed: false
      },
      payload_persisted: false,
      response_persisted: false
    }
  };
  await repo.upsertLaunchExecutionPlan(plan);
  const preparedBundle = await repo.getLaunchJobBundle(bundle.job.job_id);
  const preparedPlan = preparedBundle?.executionPlan;
  if (!preparedPlan || !hasExpectedSingleItem(preparedPlan)) fail("diagnostic_plan_freeze_failed");
  await repo.upsertEvidence({
    artifactId: `EV-${preparedBundle.job.job_id}-SINGLE-API-PREVIEW`,
    jobId: preparedBundle.job.job_id,
    artifactType: "project_video_append_single_api_preview",
    title: "single append API preview",
    summary: `task_id=${TASK_ID}; material_code=${MATERIAL_CODE}; plan_id=${preparedPlan.plan_id}; request_hash_present=${Boolean(preparedPlan.metadata?.append_request_hash)}; maximum_platform_calls=1; payload_persisted=false; response_persisted=false`,
    contentHash: hash(JSON.stringify(sanitizedPreview(preparedBundle, preparedPlan, "ready_for_user_confirmation"))),
    storageRef: `postgres:mwb.evidence_artifacts/EV-${preparedBundle.job.job_id}-SINGLE-API-PREVIEW`,
    sourceRef: "task:single-api-preview",
    sourceUsage: preparedBundle.job.source_usage
  });
  return { bundle: preparedBundle, plan: preparedPlan, preview: sanitizedPreview(preparedBundle, preparedPlan, ready ? "ready_for_user_confirmation" : "blocked_before_confirmation"), ready };
}

async function executeOnce(repo) {
  const state = JSON.parse(await readFile(PROJECT_STATE_PATH, "utf8"));
  const { bundle, plan, preview, ready } = await prepare(repo);
  if (!ready) fail(`diagnostic_preflight_blocked:${plan?.blocker_codes?.[0] || "unknown"}`);
  const scope = state.guardrails?.platform_write_scope || {};
  const stateMatches = state.guardrails?.platform_write_allowed === true &&
    scope.target_job_id === bundle.job.job_id && scope.target_plan_id === plan.plan_id &&
    scope.target_plan_hash === plan.plan_hash && scope.target_advertiser_id === ADVERTISER_ID &&
    scope.target_project_id === PROJECT_ID && Array.isArray(scope.allowed_actions) &&
    scope.allowed_actions.length === 1 && scope.allowed_actions[0] === ACTION_TYPE &&
    Number(scope.maximum_actions) === 1 && Number(scope.maximum_platform_calls) === 1 && scope.retry_allowed === false;
  if (!stateMatches) fail("diagnostic_exact_task_grant_missing");
  const result = await executeConfirmedLaunch({
    repo,
    jobId: bundle.job.job_id,
    grantSource: "cli_confirm",
    envConfirm: EXECUTION_GRANT_INTENT,
    confirmedByUserId: bundle.case?.owner_user_id || "",
    projectStatePath: PROJECT_STATE_PATH
  });
  output({ preview, execution: {
    status: result.executionGrant?.status || "unknown",
    appendCalled: result.executionGrant?.appendCalled === true,
    blockers: result.executionGrant?.blockers || [],
    currentGate: result.caseGate?.currentGate || ""
  }});
}

async function readbackOnly(repo) {
  const { bundle } = await newestCaseBundle(repo);
  const plan = bundle.executionPlan || {};
  if (plan.metadata?.task_binding?.task_id !== TASK_ID || plan.plan_status !== "consumed") {
    fail("diagnostic_readback_plan_not_consumed");
  }
  const observations = [];
  for (let index = 2; index <= 3; index += 1) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 5000));
    const view = await runProjectVideoAppendReadback(repo, bundle.job.job_id, { projectStatePath: PROJECT_STATE_PATH });
    const latest = await repo.getLaunchJobBundle(bundle.job.job_id);
    const readback = latest?.readback || {};
    observations.push({
      observation: index,
      readbackStatus: readback.readback_status || "",
      verifiedCount: Number(readback.field_diff_summary?.verified_count || 0),
      currentGate: view.caseGate?.currentGate || ""
    });
  }
  output({
    taskId: TASK_ID,
    jobId: bundle.job.job_id,
    planId: plan.plan_id,
    mode: "readback_only",
    observations,
    postCalls: 0
  });
}

const command = process.argv.slice(2);
const repo = new PostgresRepository();
if (command.includes("--prepare") && command.includes("--preview") && !command.includes("--execute-once")) {
  const result = await prepare(repo);
  output(result.preview);
} else if (command.length === 1 && command[0] === "--execute-once") {
  await executeOnce(repo);
} else if (command.length === 1 && command[0] === "--readback-only") {
  await readbackOnly(repo);
} else {
  fail("usage: node tasks/TASK-MWBV2-APPEND-VIDEO-SINGLE-API-VERIFY-20260915/one-shot-append.mjs --prepare --preview | --execute-once | --readback-only");
}
