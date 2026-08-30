import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EVENT_CONFIGS_PROVISION_ACTION,
  EVENT_CONFIG_BASELINE_EVENTS,
  EVENT_CONFIG_CREATE_ACTION_TYPE,
  EVENT_CONFIG_CREATE_ENDPOINT,
  EVENT_CONFIG_CREATE_FIELD_NAMES,
  EVENT_CONFIG_CREATE_METHOD,
  eventConfigOfficialCreateContractHash,
  evaluateEventConfigProvisionContract
} from "./skills/oe3/04-event-config-provision-contract.mjs";
import { validatePlannedActionGrant } from "./plannedActionGrant.mjs";

const rootDir = normalize(join(dirname(fileURLToPath(import.meta.url)), "../.."));
const defaultProjectStatePath = join(rootDir, "project.state.json");

export const EVENT_CONFIGS_ENSURE_ACTION = EVENT_CONFIGS_PROVISION_ACTION;
export const EVENT_CONFIGS_ENSURE_CONFIRM_ENV = "MWBV2_OE_EVENT_CONFIGS_CONFIRM";
export const EVENT_CONFIGS_ENSURE_CONFIRM_VALUE = "CREATE_BASELINE_EVENT_CONFIGS";

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
  const trackTypes = contract.track_types || contract.trackTypes || [];
  const baselineEventTypes = contract.baseline_event_types || contract.baselineEventTypes || [];
  return Boolean(
    clean(contract.source_ref || contract.sourceRef) &&
    contentHash === eventConfigOfficialCreateContractHash() &&
    method === EVENT_CONFIG_CREATE_METHOD &&
    endpoint === EVENT_CONFIG_CREATE_ENDPOINT &&
    sameStringSet(fieldManifest, EVENT_CONFIG_CREATE_FIELD_NAMES) &&
    sameStringSet(trackTypes, ["MINI_PROGRAME_API"]) &&
    sameStringSet(baselineEventTypes, EVENT_CONFIG_BASELINE_EVENTS.map((item) => item.event_type))
  );
}

export async function validateEventConfigsWriteScope({
  repo,
  bundle,
  projectStatePath = defaultProjectStatePath,
  assetIdHint = ""
} = {}) {
  if (!repo || !bundle?.job) throw new Error("event_configs_scope_job_bundle_required");
  const common = await validatePlannedActionGrant({
    repo,
    bundle,
    actionType: EVENT_CONFIGS_ENSURE_ACTION,
    projectStatePath,
    expectedMaximumPlatformCalls: EVENT_CONFIG_BASELINE_EVENTS.length
  });
  const scope = common.scope;
  const contractScope = common.actionGrant?.official_contract
    ? { official_contract: common.actionGrant.official_contract }
    : scope;
  const provision = evaluateEventConfigProvisionContract({ bundle, assetIdHint });
  const existingCreateActions = await repo.countPlatformActions({
    jobId: bundle.job.job_id,
    actionType: EVENT_CONFIG_CREATE_ACTION_TYPE
  });
  const blockers = [
    ...common.blockers,
    ...(bundle.job.route_id === "oceanengine_3_byte_mini_game" && bundle.job.game_code === "JSZC"
      ? []
      : ["event_configs_scope_not_jszc_byte_mini_game"]),
    ...(provision.status === "ready_for_plan" ? [] : provision.blockers || ["event_config_provision_not_plan_eligible"]),
    ...(contractVerified(contractScope) ? [] : ["blocked_missing_official_event_config_create_contract"]),
    ...(existingCreateActions === 0 ? [] : ["event_config_platform_action_already_recorded_for_job"])
  ];
  return {
    status: blockers.length ? "blocked" : "passed",
    blockers: [...new Set(blockers)],
    plan: common.plan,
    confirmation: common.confirmation,
    provision,
    scopeSummary: {
      ...common.scopeSummary,
      eventConfigsActionPlanned: Boolean(common.action),
      existingCreateActions,
      officialContractVerified: contractVerified(contractScope),
      provisionStatus: provision.status,
      baselineEventCount: EVENT_CONFIG_BASELINE_EVENTS.length,
      maximumPlatformCalls: Number(common.scopeSummary.maximumPlatformCalls || 0),
      platformActionType: EVENT_CONFIG_CREATE_ACTION_TYPE,
      endpoint: EVENT_CONFIG_CREATE_ENDPOINT
    }
  };
}

export async function revokeEventConfigsWriteScope(projectStatePath = defaultProjectStatePath) {
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
