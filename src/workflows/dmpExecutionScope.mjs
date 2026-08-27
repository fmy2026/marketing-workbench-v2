import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = normalize(join(dirname(fileURLToPath(import.meta.url)), "../.."));
const defaultProjectStatePath = join(rootDir, "project.state.json");

export const DMP_ENSURE_ACTION = "ensure_resource:dmp_audience_package";
export const DMP_ENSURE_CONFIRM_ENV = "MWBV2_OE_DMP_PUSH_CONFIRM";
export const DMP_ENSURE_CONFIRM_VALUE = "PUSH_ONE_DMP_BASELINE_SET";

async function readState(projectStatePath = defaultProjectStatePath) {
  return JSON.parse(await readFile(projectStatePath, "utf8"));
}

async function writeState(projectStatePath, state) {
  await writeFile(projectStatePath, `${JSON.stringify(state, null, 2)}\n`);
}

function hashValue(value) {
  return `sha256:${createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex")}`;
}

function onlyDmpAction(actions) {
  return Array.isArray(actions) && actions.length === 1 && actions[0] === DMP_ENSURE_ACTION;
}

function clean(value) {
  return String(value ?? "").trim();
}

function uniqueClean(values = []) {
  return [...new Set(values.map((value) => clean(value)).filter(Boolean))];
}

function numberShape({ sourceAdvertiserId, targetAdvertiserId, customAudienceId, deliveryStatus = "" }) {
  function safe(name, value) {
    const text = clean(value);
    if (!/^\d+$/.test(text)) throw new Error(`invalid_${name}`);
    const number = Number(text);
    if (!Number.isSafeInteger(number)) throw new Error(`${name}_outside_safe_integer_range`);
    return number;
  }
  return {
    advertiser_id: safe("source_advertiser_id", sourceAdvertiserId),
    custom_audience_id: safe("custom_audience_id", customAudienceId),
    target_advertiser_ids: [safe("target_advertiser_id", targetAdvertiserId)],
    ...(clean(deliveryStatus) ? { delivery_status: clean(deliveryStatus) } : {})
  };
}

function contractVerified(scope = {}) {
  const contract = scope.official_contract || scope.officialContract || {};
  const sourceRef = clean(contract.source_ref || contract.sourceRef);
  const contentHash = clean(contract.content_hash || contract.contentHash);
  const endpoint = clean(contract.endpoint);
  const method = clean(contract.method).toUpperCase();
  return Boolean(
    sourceRef &&
    /^sha256:[a-f0-9]{64}$/i.test(contentHash) &&
    method === "POST" &&
    endpoint.includes("/dmp/custom_audience/push_v2/")
  );
}

export async function validateDmpWriteScope({ repo, bundle, projectStatePath = defaultProjectStatePath } = {}) {
  if (!repo || !bundle?.job) throw new Error("dmp_scope_job_bundle_required");
  const state = await readState(projectStatePath);
  const scope = state.guardrails?.platform_write_scope || {};
  const plan = bundle.executionPlan || await repo.getLatestLaunchExecutionPlan(bundle.job.job_id);
  const plannedActions = plan?.planned_actions || plan?.plannedActions || [];
  const dmpAction = plannedActions.find((item) => item.action_type === DMP_ENSURE_ACTION);
  const pushPlans = await repo.getDmpPackagePushPlans(bundle.job.job_id);
  const packageSet = await repo.getDmpPackageSet({
    routeId: bundle.job.route_id,
    gameCode: bundle.job.game_code,
    targetAdvertiserId: bundle.job.advertiser_id
  });
  const members = packageSet?.members || [];
  const existingPushActions = await repo.countPlatformActions({
    jobId: bundle.job.job_id,
    actionType: "oceanengine_dmp_custom_audience_push_v2"
  });
  const packageSetIds = [...new Set((pushPlans || []).map((item) => item.package_set_id).filter(Boolean))];
  const sourceAdvertiserIds = [...new Set((pushPlans || []).map((item) => item.source_advertiser_id).filter(Boolean))];
  const targetAdvertiserIds = [...new Set((pushPlans || []).map((item) => item.target_advertiser_id).filter(Boolean))];
  const memberIds = uniqueClean(members.map((item) => item.custom_audience_id));
  const plannedIds = uniqueClean(pushPlans.map((item) => item.custom_audience_id));
  const plannedIdSet = new Set(plannedIds);
  const plannedOnly = pushPlans.length > 0 &&
    pushPlans.length === plannedIds.length &&
    pushPlans.length <= members.length &&
    pushPlans.every((item) => item.plan_status === "planned");
  const allPlansInPackageSet = plannedIds.every((id) => memberIds.includes(id));
  const sourceAvailable = members.length === 10 && members.every((item) => item.source_readonly_status === "passed");
  const plannedTargetsMissing = members.length === 10 && members
    .filter((item) => plannedIdSet.has(clean(item.custom_audience_id)))
    .every((item) => item.target_readonly_status === "missing");
  const unplannedTargetsPassed = members.length === 10 && members
    .filter((item) => !plannedIdSet.has(clean(item.custom_audience_id)))
    .every((item) => item.target_readonly_status === "passed");
  const targetStateMatchesPlan = plannedTargetsMissing && unplannedTargetsPassed;
  const hashesMatch = pushPlans.every((item) => {
    const requestShape = numberShape({
      sourceAdvertiserId: item.source_advertiser_id,
      targetAdvertiserId: item.target_advertiser_id,
      customAudienceId: item.custom_audience_id,
      deliveryStatus: ""
    });
    return hashValue(requestShape) === item.request_hash;
  });
  const blockers = [
    ...(state.guardrails?.platform_write_allowed === true ? [] : ["platform_write_scope_not_enabled"]),
    ...(scope.target_job_id === bundle.job.job_id ? [] : ["platform_write_scope_job_mismatch"]),
    ...(scope.target_advertiser_id === bundle.job.advertiser_id ? [] : ["platform_write_scope_advertiser_mismatch"]),
    ...(scope.target_plan_id === plan?.plan_id ? [] : ["platform_write_scope_plan_id_mismatch"]),
    ...(scope.target_plan_hash === plan?.plan_hash ? [] : ["platform_write_scope_plan_hash_mismatch"]),
    ...(onlyDmpAction(scope.allowed_actions) ? [] : ["platform_write_scope_allowed_actions_invalid"]),
    ...(Number(scope.maximum_actions) === 1 ? [] : ["platform_write_scope_maximum_actions_invalid"]),
    ...(Number(scope.maximum_platform_calls) === pushPlans.length && pushPlans.length > 0 ? [] : ["platform_write_scope_maximum_platform_calls_invalid"]),
    ...(scope.retry_allowed === false ? [] : ["platform_write_scope_retry_allowed_must_be_false"]),
    ...(contractVerified(scope) ? [] : ["blocked_missing_official_dmp_push_contract"]),
    ...(dmpAction ? [] : ["ensure_resource_dmp_audience_package_not_in_execution_plan"]),
    ...(dmpAction?.status === "planned" ? [] : ["ensure_resource_dmp_audience_package_not_planned"]),
    ...(sourceAvailable ? [] : ["dmp_source_preflight_not_available_full_set"]),
    ...(targetStateMatchesPlan ? [] : ["dmp_target_preflight_not_aligned_to_push_plan"]),
    ...(plannedOnly ? [] : ["dmp_push_plan_rows_not_planned_or_empty"]),
    ...(allPlansInPackageSet ? [] : ["dmp_push_plan_ids_not_in_package_set"]),
    ...(hashesMatch ? [] : ["dmp_push_plan_request_hash_mismatch"]),
    ...(packageSetIds.length === 1 ? [] : ["dmp_push_plan_package_set_mismatch"]),
    ...(sourceAdvertiserIds.length === 1 ? [] : ["dmp_push_plan_source_advertiser_mismatch"]),
    ...(targetAdvertiserIds.length === 1 && targetAdvertiserIds[0] === bundle.job.advertiser_id ? [] : ["dmp_push_plan_target_advertiser_mismatch"]),
    ...(existingPushActions === 0 ? [] : ["dmp_platform_action_already_recorded_for_job"])
  ];
  return {
    status: blockers.length ? "blocked" : "passed",
    blockers,
    plan,
    scopeSummary: {
      targetJobMatches: scope.target_job_id === bundle.job.job_id,
      targetAdvertiserMatches: scope.target_advertiser_id === bundle.job.advertiser_id,
      dmpActionPlanned: Boolean(dmpAction),
      sourceAvailableCount: members.filter((item) => item.source_readonly_status === "passed").length,
      targetMissingCount: members.filter((item) => item.target_readonly_status === "missing").length,
      targetPassedCount: members.filter((item) => item.target_readonly_status === "passed").length,
      pushPlanCount: pushPlans.length,
      pushPlanIdHash: hashValue(plannedIds),
      existingPushActions,
      officialContractVerified: contractVerified(scope),
      maximumPlatformCalls: Number(scope.maximum_platform_calls || 0)
    }
  };
}

export async function revokeDmpWriteScope(projectStatePath = defaultProjectStatePath) {
  const state = await readState(projectStatePath);
  state.guardrails ||= {};
  state.guardrails.platform_write_allowed = false;
  state.guardrails.platform_write_scope = {
    ...(state.guardrails.platform_write_scope || {}),
    mode: "read_only_after_single_dmp_push_attempt",
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
