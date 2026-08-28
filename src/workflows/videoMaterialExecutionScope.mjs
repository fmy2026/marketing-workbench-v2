import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { buildVideoMaterialPreparePlan } from "../platforms/oceanengineVideoMaterialExecutor.mjs";

const rootDir = normalize(join(dirname(fileURLToPath(import.meta.url)), "../.."));
const defaultProjectStatePath = join(rootDir, "project.state.json");

export const VIDEO_MATERIAL_ENSURE_ACTION = "ensure_resource:video_asset";
export const VIDEO_MATERIAL_ENSURE_CONFIRM_ENV = "MWBV2_OE_VIDEO_MATERIAL_CONFIRM";
export const VIDEO_MATERIAL_ENSURE_CONFIRM_VALUE = "BIND_ONE_VIDEO_SET_TO_TARGET";

async function readState(projectStatePath = defaultProjectStatePath) {
  return JSON.parse(await readFile(projectStatePath, "utf8"));
}

async function writeState(projectStatePath, state) {
  await writeFile(projectStatePath, `${JSON.stringify(state, null, 2)}\n`);
}

function onlyVideoAction(actions) {
  return Array.isArray(actions) && actions.length === 1 && actions[0] === VIDEO_MATERIAL_ENSURE_ACTION;
}

function clean(value) {
  return String(value ?? "").trim();
}

function contractVerified(scope = {}) {
  const contract = scope.official_contract || scope.officialContract || {};
  const sourceRef = clean(contract.source_ref || contract.sourceRef);
  const endpoint = clean(contract.endpoint);
  const method = clean(contract.method).toUpperCase();
  return Boolean(sourceRef && method === "POST" && endpoint.includes("/file/material/bind/"));
}

export async function validateVideoMaterialWriteScope({ repo, bundle, projectStatePath = defaultProjectStatePath } = {}) {
  if (!repo || !bundle?.job) throw new Error("video_material_scope_job_bundle_required");
  const state = await readState(projectStatePath);
  const plan = bundle.executionPlan || await repo.getLatestLaunchExecutionPlan(bundle.job.job_id);
  const scope = plan?.metadata?.execution_scope || plan?.metadata?.executionScope ||
    (bundle.job.source_usage === "test_run" || projectStatePath !== defaultProjectStatePath ? state.guardrails?.platform_write_scope || {} : {});
  const plannedActions = plan?.planned_actions || plan?.plannedActions || [];
  const videoAction = plannedActions.find((item) => item.action_type === VIDEO_MATERIAL_ENSURE_ACTION);
  const materialPlan = buildVideoMaterialPreparePlan({ bundle });
  const bindItems = (materialPlan.items || []).filter((item) =>
    item.planStatus === "source_ready_target_missing" &&
    item.actions.includes("oceanengine_material_bind_target")
  );
  const bindBatchCount = Number(materialPlan.bindBatchCount || materialPlan.bindBatchRequests?.length || 0);
  const existingBindActions = await repo.countPlatformActions({
    jobId: bundle.job.job_id,
    actionType: "oceanengine_material_bind_target"
  });
  const blockers = [
    ...(state.guardrails?.platform_write_allowed === true ? [] : ["platform_write_scope_not_enabled"]),
    ...(bundle.case?.lifecycle_status === "active" || (!bundle.case && projectStatePath !== defaultProjectStatePath) ? [] : ["workflow_case_not_active"]),
    ...(scope.target_job_id === bundle.job.job_id ? [] : ["platform_write_scope_job_mismatch"]),
    ...(scope.target_advertiser_id === bundle.job.advertiser_id ? [] : ["platform_write_scope_advertiser_mismatch"]),
    ...(scope.target_plan_id === plan?.plan_id ? [] : ["platform_write_scope_plan_id_mismatch"]),
    ...(scope.target_plan_hash === plan?.plan_hash ? [] : ["platform_write_scope_plan_hash_mismatch"]),
    ...(onlyVideoAction(scope.allowed_actions) ? [] : ["platform_write_scope_allowed_actions_invalid"]),
    ...(Number(scope.maximum_actions) === 1 ? [] : ["platform_write_scope_maximum_actions_invalid"]),
    ...(Number(scope.maximum_platform_calls) === bindBatchCount && bindBatchCount > 0 ? [] : ["platform_write_scope_maximum_platform_calls_invalid"]),
    ...(scope.retry_allowed === false ? [] : ["platform_write_scope_retry_allowed_must_be_false"]),
    ...(contractVerified(scope) ? [] : ["blocked_missing_official_video_material_bind_contract"]),
    ...(videoAction ? [] : ["ensure_resource_video_asset_not_in_execution_plan"]),
    ...(videoAction?.status === "planned" ? [] : ["ensure_resource_video_asset_not_planned"]),
    ...(materialPlan.uploadActionCount === 0 ? [] : ["video_upload_required_not_allowed_in_bind_scope"]),
    ...(bindItems.length > 0 ? [] : ["video_bind_plan_empty"]),
    ...(existingBindActions === 0 ? [] : ["video_material_platform_action_already_recorded_for_job"])
  ];
  return {
    status: blockers.length ? "blocked" : "passed",
    blockers,
    plan,
    materialPlan,
    scopeSummary: {
      targetJobMatches: scope.target_job_id === bundle.job.job_id,
      targetAdvertiserMatches: scope.target_advertiser_id === bundle.job.advertiser_id,
      videoActionPlanned: Boolean(videoAction),
      bindItemCount: bindItems.length,
      bindBatchCount,
      existingBindActions,
      officialContractVerified: contractVerified(scope),
      maximumPlatformCalls: Number(scope.maximum_platform_calls || 0)
    }
  };
}

export async function revokeVideoMaterialWriteScope(projectStatePath = defaultProjectStatePath) {
  const state = await readState(projectStatePath);
  state.guardrails ||= {};
  state.guardrails.platform_write_allowed = false;
  if (state.guardrails.platform_write_scope) {
    state.guardrails.platform_write_scope = {
      ...state.guardrails.platform_write_scope,
      allowed_actions: [],
      maximum_actions: 0,
      maximum_platform_calls: 0,
      retry_allowed: false
    };
  }
  await writeState(projectStatePath, state);
}
