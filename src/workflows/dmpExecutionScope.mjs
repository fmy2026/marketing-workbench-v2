import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { validatePlannedActionGrant } from "./plannedActionGrant.mjs";

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
  const pushPlans = await repo.getDmpPackagePushPlans(bundle.job.job_id);
  const common = await validatePlannedActionGrant({
    repo,
    bundle,
    actionType: DMP_ENSURE_ACTION,
    projectStatePath,
    expectedMaximumPlatformCalls: pushPlans.length
  });
  const scope = common.scope;
  const contractScope = common.actionGrant?.official_contract
    ? { official_contract: common.actionGrant.official_contract }
    : scope;
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
    ...common.blockers,
    ...(pushPlans.length > 0 ? [] : ["platform_write_scope_maximum_platform_calls_invalid"]),
    ...(contractVerified(contractScope) ? [] : ["blocked_missing_official_dmp_push_contract"]),
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
    plan: common.plan,
    confirmation: common.confirmation,
    scopeSummary: {
      ...common.scopeSummary,
      dmpActionPlanned: Boolean(common.action),
      sourceAvailableCount: members.filter((item) => item.source_readonly_status === "passed").length,
      targetMissingCount: members.filter((item) => item.target_readonly_status === "missing").length,
      targetPassedCount: members.filter((item) => item.target_readonly_status === "passed").length,
      pushPlanCount: pushPlans.length,
      pushPlanIdHash: hashValue(plannedIds),
      existingPushActions,
      officialContractVerified: contractVerified(contractScope),
      maximumPlatformCalls: Number(common.scopeSummary.maximumPlatformCalls || 0)
    }
  };
}

export async function revokeDmpWriteScope(projectStatePath = defaultProjectStatePath) {
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
