import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = normalize(join(dirname(fileURLToPath(import.meta.url)), "../.."));
const defaultProjectStatePath = join(rootDir, "project.state.json");
export const AVATAR_ENSURE_ACTION = "ensure_resource:avatar";

async function readState(projectStatePath = defaultProjectStatePath) {
  return JSON.parse(await readFile(projectStatePath, "utf8"));
}

async function writeState(projectStatePath, state) {
  await writeFile(projectStatePath, `${JSON.stringify(state, null, 2)}\n`);
}

function onlyAvatarAction(actions) {
  return Array.isArray(actions) && actions.length === 1 && actions[0] === AVATAR_ENSURE_ACTION;
}

export async function validateAvatarWriteScope({ repo, bundle, projectStatePath = defaultProjectStatePath } = {}) {
  if (!repo || !bundle?.job) throw new Error("avatar_scope_job_bundle_required");
  const state = await readState(projectStatePath);
  const scope = state.guardrails?.platform_write_scope || {};
  const plan = bundle.executionPlan || await repo.getLatestLaunchExecutionPlan(bundle.job.job_id);
  const plannedActions = plan?.planned_actions || plan?.plannedActions || [];
  const avatarAction = plannedActions.find((item) => item.action_type === AVATAR_ENSURE_ACTION);
  const existingUpload = await repo.countPlatformActions({
    jobId: bundle.job.job_id,
    actionType: "oceanengine_advertiser_avatar_upload"
  });
  const existingSubmit = await repo.countPlatformActions({
    jobId: bundle.job.job_id,
    actionType: "oceanengine_advertiser_avatar_submit"
  });
  const blockers = [
    ...(state.guardrails?.platform_write_allowed === true ? [] : ["platform_write_scope_not_enabled"]),
    ...(scope.target_job_id === bundle.job.job_id ? [] : ["platform_write_scope_job_mismatch"]),
    ...(scope.target_advertiser_id === bundle.job.advertiser_id ? [] : ["platform_write_scope_advertiser_mismatch"]),
    ...(scope.target_plan_id === plan?.plan_id ? [] : ["platform_write_scope_plan_id_mismatch"]),
    ...(scope.target_plan_hash === plan?.plan_hash ? [] : ["platform_write_scope_plan_hash_mismatch"]),
    ...(onlyAvatarAction(scope.allowed_actions) ? [] : ["platform_write_scope_allowed_actions_invalid"]),
    ...(Number(scope.maximum_actions) === 1 ? [] : ["platform_write_scope_maximum_actions_invalid"]),
    ...(Number(scope.maximum_platform_calls) === 2 ? [] : ["platform_write_scope_maximum_platform_calls_invalid"]),
    ...(scope.retry_allowed === false ? [] : ["platform_write_scope_retry_allowed_must_be_false"]),
    ...(avatarAction ? [] : ["ensure_resource_avatar_not_in_execution_plan"]),
    ...(avatarAction?.status === "planned" ? [] : ["ensure_resource_avatar_not_planned"]),
    ...(existingUpload === 0 && existingSubmit === 0 ? [] : ["avatar_platform_action_already_recorded_for_job"])
  ];
  return {
    status: blockers.length ? "blocked" : "passed",
    blockers,
    plan,
    scopeSummary: {
      targetJobMatches: scope.target_job_id === bundle.job.job_id,
      targetAdvertiserMatches: scope.target_advertiser_id === bundle.job.advertiser_id,
      avatarActionPlanned: Boolean(avatarAction),
      existingUpload,
      existingSubmit,
      maximumPlatformCalls: Number(scope.maximum_platform_calls || 0)
    }
  };
}

export async function revokeAvatarWriteScope(projectStatePath = defaultProjectStatePath) {
  const state = await readState(projectStatePath);
  state.guardrails ||= {};
  state.guardrails.platform_write_allowed = false;
  state.guardrails.platform_write_scope = {
    ...(state.guardrails.platform_write_scope || {}),
    mode: "read_only_after_single_avatar_upload_submit_attempt",
    target_job_id: "",
    target_advertiser_id: "",
    target_plan_id: "",
    target_plan_hash: "",
    target_draft_id: "",
    target_payload_hash: "",
    allowed_actions: [],
    maximum_actions: 0,
    maximum_platform_calls: 0,
    retry_allowed: false
  };
  await writeState(projectStatePath, state);
}
