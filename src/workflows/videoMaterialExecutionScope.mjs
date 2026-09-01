import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { buildVideoMaterialPreparePlan } from "../platforms/oceanengineVideoMaterialExecutor.mjs";
import { validatePlannedActionGrant } from "./plannedActionGrant.mjs";

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
  const materialPlan = buildVideoMaterialPreparePlan({ bundle });
  const bindItems = (materialPlan.items || []).filter((item) =>
    item.planStatus === "source_ready_target_missing" &&
    item.actions.includes("oceanengine_material_bind_target")
  );
  const bindBatchCount = Number(materialPlan.bindBatchCount || materialPlan.bindBatchRequests?.length || 0);
  const common = await validatePlannedActionGrant({
    repo,
    bundle,
    actionType: VIDEO_MATERIAL_ENSURE_ACTION,
    projectStatePath,
    expectedMaximumPlatformCalls: bindBatchCount
  });
  const scope = common.scope;
  const contractScope = common.actionGrant?.official_contract
    ? { official_contract: common.actionGrant.official_contract }
    : scope;
  const existingBindActions = await repo.countPlatformActions({
    jobId: bundle.job.job_id,
    actionType: "oceanengine_material_bind_target"
  });
  const blockers = [
    ...common.blockers,
    ...(bindBatchCount > 0 ? [] : ["platform_write_scope_maximum_platform_calls_invalid"]),
    ...(contractVerified(contractScope) ? [] : ["blocked_missing_official_video_material_bind_contract"]),
    ...(materialPlan.uploadActionCount === 0 ? [] : ["video_upload_required_not_allowed_in_bind_scope"]),
    ...(bindItems.length > 0 ? [] : ["video_bind_plan_empty"]),
    ...(existingBindActions === 0 ? [] : ["video_material_platform_action_already_recorded_for_job"])
  ];
  return {
    status: blockers.length ? "blocked" : "passed",
    blockers,
    plan: common.plan,
    confirmation: common.confirmation,
    materialPlan,
    scopeSummary: {
      ...common.scopeSummary,
      videoActionPlanned: Boolean(common.action),
      bindItemCount: bindItems.length,
      bindBatchCount,
      existingBindActions,
      officialContractVerified: contractVerified(contractScope),
      maximumPlatformCalls: Number(common.scopeSummary.maximumPlatformCalls || 0)
    }
  };
}

export async function revokeVideoMaterialWriteScope(projectStatePath = defaultProjectStatePath) {
  const state = await readState(projectStatePath);
  if (state.guardrails?.platform_write_allowed !== true) return;
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
