import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

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

function onlyProductImageAction(actions) {
  return Array.isArray(actions) && actions.length === 1 && actions[0] === PRODUCT_IMAGE_ENSURE_ACTION;
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
  const state = await readState(projectStatePath);
  const plan = bundle.executionPlan || await repo.getLatestLaunchExecutionPlan(bundle.job.job_id);
  const scope = plan?.metadata?.execution_scope || plan?.metadata?.executionScope ||
    (bundle.job.source_usage === "test_run" || projectStatePath !== defaultProjectStatePath ? state.guardrails?.platform_write_scope || {} : {});
  const plannedActions = plan?.planned_actions || plan?.plannedActions || [];
  const productImageAction = plannedActions.find((item) => item.action_type === PRODUCT_IMAGE_ENSURE_ACTION);
  const existingUpload = await repo.countPlatformActions({
    jobId: bundle.job.job_id,
    actionType: "oceanengine_product_image_upload"
  });
  const blockers = [
    ...(state.guardrails?.platform_write_allowed === true ? [] : ["platform_write_scope_not_enabled"]),
    ...(bundle.case?.lifecycle_status === "active" || (!bundle.case && projectStatePath !== defaultProjectStatePath) ? [] : ["workflow_case_not_active"]),
    ...(scope.target_job_id === bundle.job.job_id ? [] : ["platform_write_scope_job_mismatch"]),
    ...(scope.target_advertiser_id === bundle.job.advertiser_id ? [] : ["platform_write_scope_advertiser_mismatch"]),
    ...(scope.target_plan_id === plan?.plan_id ? [] : ["platform_write_scope_plan_id_mismatch"]),
    ...(scope.target_plan_hash === plan?.plan_hash ? [] : ["platform_write_scope_plan_hash_mismatch"]),
    ...(onlyProductImageAction(scope.allowed_actions) ? [] : ["platform_write_scope_allowed_actions_invalid"]),
    ...(Number(scope.maximum_actions) === 1 ? [] : ["platform_write_scope_maximum_actions_invalid"]),
    ...(Number(scope.maximum_platform_calls) === 1 ? [] : ["platform_write_scope_maximum_platform_calls_invalid"]),
    ...(scope.retry_allowed === false ? [] : ["platform_write_scope_retry_allowed_must_be_false"]),
    ...(productImageContractVerified(scope) ? [] : ["blocked_missing_official_product_image_upload_contract"]),
    ...(productImageAction ? [] : ["ensure_resource_product_image_not_in_execution_plan"]),
    ...(productImageAction?.status === "planned" ? [] : ["ensure_resource_product_image_not_planned"]),
    ...(existingUpload === 0 ? [] : ["product_image_platform_action_already_recorded_for_job"])
  ];
  return {
    status: blockers.length ? "blocked" : "passed",
    blockers,
    plan,
    scopeSummary: {
      targetJobMatches: scope.target_job_id === bundle.job.job_id,
      targetAdvertiserMatches: scope.target_advertiser_id === bundle.job.advertiser_id,
      productImageActionPlanned: Boolean(productImageAction),
      officialContractVerified: productImageContractVerified(scope),
      existingUpload,
      maximumPlatformCalls: Number(scope.maximum_platform_calls || 0)
    }
  };
}

export async function revokeProductImageWriteScope(projectStatePath = defaultProjectStatePath) {
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
