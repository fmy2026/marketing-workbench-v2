import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { validatePlannedActionGrant } from "./plannedActionGrant.mjs";

const rootDir = normalize(join(dirname(fileURLToPath(import.meta.url)), "../.."));
const defaultProjectStatePath = join(rootDir, "project.state.json");
export const AVATAR_ENSURE_ACTION = "ensure_resource:avatar";

async function readState(projectStatePath = defaultProjectStatePath) {
  return JSON.parse(await readFile(projectStatePath, "utf8"));
}

async function writeState(projectStatePath, state) {
  await writeFile(projectStatePath, `${JSON.stringify(state, null, 2)}\n`);
}

export async function validateAvatarWriteScope({ repo, bundle, projectStatePath = defaultProjectStatePath } = {}) {
  if (!repo || !bundle?.job) throw new Error("avatar_scope_job_bundle_required");
  const common = await validatePlannedActionGrant({
    repo,
    bundle,
    actionType: AVATAR_ENSURE_ACTION,
    projectStatePath,
    expectedMaximumPlatformCalls: 2
  });
  const existingUpload = await repo.countPlatformActions({
    jobId: bundle.job.job_id,
    actionType: "oceanengine_advertiser_avatar_upload"
  });
  const existingSubmit = await repo.countPlatformActions({
    jobId: bundle.job.job_id,
    actionType: "oceanengine_advertiser_avatar_submit"
  });
  const blockers = [
    ...common.blockers,
    ...(existingUpload === 0 && existingSubmit === 0 ? [] : ["avatar_platform_action_already_recorded_for_job"])
  ];
  return {
    status: blockers.length ? "blocked" : "passed",
    blockers,
    plan: common.plan,
    confirmation: common.confirmation,
    scopeSummary: {
      ...common.scopeSummary,
      avatarActionPlanned: Boolean(common.action),
      existingUpload,
      existingSubmit,
      maximumPlatformCalls: Number(common.scopeSummary.maximumPlatformCalls || 0)
    }
  };
}

export async function revokeAvatarWriteScope(projectStatePath = defaultProjectStatePath) {
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
