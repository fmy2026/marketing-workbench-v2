import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EVENT_ASSET_CREATE_ACTION_TYPE,
  EVENT_ASSET_CREATE_ENDPOINT,
  EVENT_ASSET_CREATE_FIELD_NAMES,
  EVENT_ASSET_CREATE_METHOD,
  EVENT_ASSET_PROVISION_ACTION,
  eventAssetOfficialCreateContractHash,
  evaluateEventAssetProvisionContract
} from "./skills/oe3/04-event-asset-provision-contract.mjs";
import { validatePlannedActionGrant } from "./plannedActionGrant.mjs";

const rootDir = normalize(join(dirname(fileURLToPath(import.meta.url)), "../.."));
const defaultProjectStatePath = join(rootDir, "project.state.json");

export const EVENT_ASSET_ENSURE_ACTION = EVENT_ASSET_PROVISION_ACTION;
export const EVENT_ASSET_ENSURE_CONFIRM_ENV = "MWBV2_OE_EVENT_ASSET_CONFIRM";
export const EVENT_ASSET_ENSURE_CONFIRM_VALUE = "CREATE_ONE_EVENT_ASSET_TO_TARGET";

async function readState(projectStatePath = defaultProjectStatePath) {
  return JSON.parse(await readFile(projectStatePath, "utf8"));
}

async function writeState(projectStatePath, state) {
  await writeFile(projectStatePath, `${JSON.stringify(state, null, 2)}\n`);
}

function clean(value) {
  return String(value ?? "").trim();
}

function sameStringSet(left = [], right = []) {
  const normalizedLeft = [...new Set((Array.isArray(left) ? left : []).map(clean).filter(Boolean))].sort();
  const normalizedRight = [...new Set((Array.isArray(right) ? right : []).map(clean).filter(Boolean))].sort();
  return JSON.stringify(normalizedLeft) === JSON.stringify(normalizedRight);
}

function contractVerified(scope = {}) {
  const contract = scope.official_contract || scope.officialContract || {};
  const endpoint = clean(contract.endpoint);
  const method = clean(contract.method).toUpperCase();
  const contentHash = clean(contract.content_hash || contract.contentHash);
  const fieldManifest = contract.request_field_manifest || contract.requestFieldManifest || contract.field_names || contract.fieldNames || [];
  return Boolean(
    clean(contract.source_ref || contract.sourceRef) &&
    contentHash === eventAssetOfficialCreateContractHash() &&
    method === EVENT_ASSET_CREATE_METHOD &&
    endpoint === EVENT_ASSET_CREATE_ENDPOINT &&
    sameStringSet(fieldManifest, EVENT_ASSET_CREATE_FIELD_NAMES)
  );
}

export async function validateEventAssetWriteScope({ repo, bundle, projectStatePath = defaultProjectStatePath } = {}) {
  if (!repo || !bundle?.job) throw new Error("event_asset_scope_job_bundle_required");
  const common = await validatePlannedActionGrant({
    repo,
    bundle,
    actionType: EVENT_ASSET_ENSURE_ACTION,
    projectStatePath,
    expectedMaximumPlatformCalls: 1
  });
  const scope = common.scope;
  const contractScope = common.actionGrant?.official_contract
    ? { official_contract: common.actionGrant.official_contract }
    : scope;
  const provision = evaluateEventAssetProvisionContract({ bundle });
  const existingCreateActions = await repo.countPlatformActions({
    jobId: bundle.job.job_id,
    actionType: EVENT_ASSET_CREATE_ACTION_TYPE
  });
  const blockers = [
    ...common.blockers,
    ...(bundle.job.route_id === "oceanengine_3_byte_mini_game" && bundle.job.game_code === "JSZC"
      ? []
      : ["event_asset_scope_not_jszc_byte_mini_game"]),
    ...(provision.status === "ready_for_plan" ? [] : provision.blockers || ["event_asset_provision_not_plan_eligible"]),
    ...(contractVerified(contractScope) ? [] : ["blocked_missing_official_event_asset_create_contract"]),
    ...(existingCreateActions === 0 ? [] : ["event_asset_platform_action_already_recorded_for_job"])
  ];
  return {
    status: blockers.length ? "blocked" : "passed",
    blockers: [...new Set(blockers)],
    plan: common.plan,
    confirmation: common.confirmation,
    provision,
    scopeSummary: {
      ...common.scopeSummary,
      eventAssetActionPlanned: Boolean(common.action),
      existingCreateActions,
      officialContractVerified: contractVerified(contractScope),
      provisionStatus: provision.status,
      provisionPlanEligible: provision.outputSummary?.planEligible === true,
      templateHashMatchesExpected: provision.outputSummary?.templateHashMatchesExpected === true,
      maximumPlatformCalls: Number(common.scopeSummary.maximumPlatformCalls || 0),
      platformActionType: EVENT_ASSET_CREATE_ACTION_TYPE,
      endpoint: EVENT_ASSET_CREATE_ENDPOINT
    }
  };
}

export async function revokeEventAssetWriteScope(projectStatePath = defaultProjectStatePath) {
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
