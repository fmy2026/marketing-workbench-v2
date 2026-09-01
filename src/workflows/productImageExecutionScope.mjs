import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { validatePlannedActionGrant } from "./plannedActionGrant.mjs";

const rootDir = normalize(join(dirname(fileURLToPath(import.meta.url)), "../.."));
const defaultProjectStatePath = join(rootDir, "project.state.json");

export const PRODUCT_IMAGE_ENSURE_ACTION = "ensure_resource:product_image";
export const PRODUCT_IMAGE_ENSURE_CONFIRM_ENV = "MWBV2_OE_PRODUCT_IMAGE_CONFIRM";
export const PRODUCT_IMAGE_ENSURE_CONFIRM_VALUE = "UPLOAD_ONE_PRODUCT_IMAGE_TO_TARGET";

async function readState(projectStatePath = defaultProjectStatePath) {
  return JSON.parse(await readFile(projectStatePath, "utf8"));
}

async function writeState(projectStatePath, state) {
  await writeFile(projectStatePath, `${JSON.stringify(state, null, 2)}\n`);
}

function clean(value) {
  return String(value ?? "").trim();
}

function productImageContractVerified(scope = {}) {
  const contract = scope.official_contract || scope.officialContract || {};
  const uploadEndpoint = clean(contract.upload_endpoint || contract.uploadEndpoint);
  const uploadMethod = clean(contract.upload_method || contract.uploadMethod).toUpperCase();
  const readbackEndpoint = clean(contract.readback_endpoint || contract.readbackEndpoint);
  const requiredSize = clean(contract.required_size || contract.requiredSize);
  return Boolean(
    uploadMethod === "POST" &&
    uploadEndpoint.includes("/file/image/ad/") &&
    readbackEndpoint.includes("file/image/get") &&
    requiredSize === "108x108"
  );
}

export async function validateProductImageWriteScope({ repo, bundle, projectStatePath = defaultProjectStatePath } = {}) {
  if (!repo || !bundle?.job) throw new Error("product_image_scope_job_bundle_required");
  const common = await validatePlannedActionGrant({
    repo,
    bundle,
    actionType: PRODUCT_IMAGE_ENSURE_ACTION,
    projectStatePath,
    expectedMaximumPlatformCalls: 1
  });
  const scope = common.scope;
  const contractScope = common.actionGrant?.official_contract
    ? { official_contract: common.actionGrant.official_contract }
    : scope;
  const existingUpload = await repo.countPlatformActions({
    jobId: bundle.job.job_id,
    actionType: "oceanengine_product_image_upload"
  });
  const blockers = [
    ...common.blockers,
    ...(productImageContractVerified(contractScope) ? [] : ["blocked_missing_official_product_image_upload_contract"]),
    ...(existingUpload === 0 ? [] : ["product_image_platform_action_already_recorded_for_job"])
  ];
  return {
    status: blockers.length ? "blocked" : "passed",
    blockers,
    plan: common.plan,
    confirmation: common.confirmation,
    scopeSummary: {
      ...common.scopeSummary,
      productImageActionPlanned: Boolean(common.action),
      officialContractVerified: productImageContractVerified(contractScope),
      existingUpload,
      maximumPlatformCalls: Number(common.scopeSummary.maximumPlatformCalls || 0)
    }
  };
}

export async function revokeProductImageWriteScope(projectStatePath = defaultProjectStatePath) {
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
