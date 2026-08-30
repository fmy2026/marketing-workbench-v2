import { assertNoSensitiveLeak, hashValue, sanitizeForPublic } from "./00-contracts.mjs";

export const EVENT_CONFIGS_PROVISION_ACTION = "ensure_event_configs:baseline";
export const EVENT_CONFIG_CREATE_ACTION_TYPE = "oceanengine_event_config_create";
export const EVENT_CONFIG_CREATE_ENDPOINT = "/open_api/2/event_manager/events/create/";
export const EVENT_CONFIG_CREATE_METHOD = "POST";
export const EVENT_CONFIG_TRACK_TYPE = "MINI_PROGRAME_API";
export const EVENT_CONFIG_ASSET_TYPE = "MINI_PROGRAME";
export const EVENT_CONFIG_BASELINE_TEMPLATE_VERSION = "2026-08-30.jszc-event-configs-baseline-v1";

export const EVENT_CONFIG_CREATE_FIELD_NAMES = Object.freeze([
  "advertiser_id",
  "asset_id",
  "event_id",
  "track_types"
]);

export const EVENT_CONFIG_OFFICIAL_CREATE_SOURCE_REFS = Object.freeze([
  "official:oceanengine:2.0:19-asset:event_manager/events/create:196-203",
  "official:oceanengine:2.0-copy:17-asset:event_manager/events/create:4593-4824"
]);

export const EVENT_CONFIG_BASELINE_EVENTS = Object.freeze([
  { event_type: "active", event_cn_name: "激活" },
  { event_type: "active_register", event_cn_name: "注册" },
  { event_type: "active_pay", event_cn_name: "付费" },
  { event_type: "purchase_roi", event_cn_name: "付费ROI" },
  { event_type: "purchase_roi_7d", event_cn_name: "付费ROI-7日" },
  { event_type: "purchase_roi_30d", event_cn_name: "付费ROI-30日" }
]);

function clean(value) {
  return String(value ?? "").trim();
}

function arraysByKey(value, keys) {
  const wanted = new Set(keys);
  const found = [];
  const walk = (item) => {
    if (Array.isArray(item)) {
      item.forEach(walk);
      return;
    }
    if (!item || typeof item !== "object") return;
    Object.entries(item).forEach(([key, child]) => {
      if (wanted.has(key) && Array.isArray(child)) found.push(...child);
      walk(child);
    });
  };
  walk(value);
  return found;
}

function normalizedTrackTypes(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(clean).filter(Boolean))];
}

function baselineByType() {
  return new Map(EVENT_CONFIG_BASELINE_EVENTS.map((item) => [item.event_type, item]));
}

export function eventConfigCreateContractShape() {
  return {
    method: EVENT_CONFIG_CREATE_METHOD,
    endpoint: EVENT_CONFIG_CREATE_ENDPOINT,
    request_field_manifest: [...EVENT_CONFIG_CREATE_FIELD_NAMES],
    required_track_type: EVENT_CONFIG_TRACK_TYPE,
    source_refs: [...EVENT_CONFIG_OFFICIAL_CREATE_SOURCE_REFS],
    payload_persisted: false,
    response_persisted: false
  };
}

export function eventConfigOfficialCreateContractHash() {
  return hashValue(eventConfigCreateContractShape());
}

export function eventConfigBaselineTemplateManifest({ assetIdHint = "" } = {}) {
  const hint = clean(assetIdHint);
  return sanitizeForPublic({
    version: EVENT_CONFIG_BASELINE_TEMPLATE_VERSION,
    asset_type: EVENT_CONFIG_ASSET_TYPE,
    event_types: EVENT_CONFIG_BASELINE_EVENTS.map((item) => item.event_type),
    track_types: [EVENT_CONFIG_TRACK_TYPE],
    event_id_source: "target_asset_available_events_get",
    asset_id_hint_present: Boolean(hint),
    asset_id_hint_hash: hint ? hashValue(hint) : "",
    payload_persisted: false,
    response_persisted: false
  });
}

export function eventConfigBaselineTemplateHash(options = {}) {
  return hashValue(eventConfigBaselineTemplateManifest(options));
}

export function eventConfigsFromPayload(payload = {}) {
  const direct = [
    payload.data?.event_configs,
    payload.data?.list,
    payload.event_configs,
    payload.list
  ].find(Array.isArray);
  return direct || arraysByKey(payload.data || payload, ["event_configs"]);
}

export function normalizeEventConfig(item = {}) {
  return {
    event_id: clean(item.event_id || item.id),
    event_type: clean(item.event_type || item.type),
    event_cn_name: clean(item.event_cn_name || item.name),
    track_types: normalizedTrackTypes(item.track_types || item.trackTypes)
  };
}

export function baselineEventTypes() {
  return EVENT_CONFIG_BASELINE_EVENTS.map((item) => item.event_type);
}

export function eventConfigBaselineReadiness({
  availableEvents = [],
  existingConfigs = []
} = {}) {
  const required = baselineByType();
  const normalizedAvailable = availableEvents.map(normalizeEventConfig);
  const normalizedExisting = existingConfigs.map(normalizeEventConfig);
  const availableByType = new Map();
  for (const item of normalizedAvailable) {
    if (!required.has(item.event_type)) continue;
    if (!item.track_types.includes(EVENT_CONFIG_TRACK_TYPE)) continue;
    if (!item.event_id) continue;
    if (!availableByType.has(item.event_type)) availableByType.set(item.event_type, item);
  }
  const configuredByType = new Map();
  for (const item of normalizedExisting) {
    if (!required.has(item.event_type)) continue;
    if (!item.track_types.includes(EVENT_CONFIG_TRACK_TYPE)) continue;
    configuredByType.set(item.event_type, item);
  }
  const missingAvailableEventTypes = [];
  const missingConfiguredEventTypes = [];
  const createCandidates = [];
  for (const baseline of EVENT_CONFIG_BASELINE_EVENTS) {
    const available = availableByType.get(baseline.event_type);
    const configured = configuredByType.get(baseline.event_type);
    if (!available) {
      missingAvailableEventTypes.push(baseline.event_type);
      continue;
    }
    if (!configured) {
      missingConfiguredEventTypes.push(baseline.event_type);
      createCandidates.push({
        event_type: baseline.event_type,
        event_cn_name: baseline.event_cn_name,
        event_id: available.event_id,
        track_types: [EVENT_CONFIG_TRACK_TYPE]
      });
    }
  }
  const blockers = missingAvailableEventTypes.length ? ["event_config_available_events_baseline_missing"] : [];
  return sanitizeForPublic({
    status: blockers.length
      ? "blocked"
      : missingConfiguredEventTypes.length
        ? "needs_create"
        : "passed",
    blockers,
    required_event_count: EVENT_CONFIG_BASELINE_EVENTS.length,
    available_event_count: normalizedAvailable.length,
    configured_event_count: normalizedExisting.length,
    baseline_available_count: EVENT_CONFIG_BASELINE_EVENTS.length - missingAvailableEventTypes.length,
    baseline_configured_count: EVENT_CONFIG_BASELINE_EVENTS.length - missingConfiguredEventTypes.length,
    missing_available_event_types: missingAvailableEventTypes,
    missing_configured_event_types: missingConfiguredEventTypes,
    create_candidate_count: createCandidates.length,
    create_candidates: createCandidates,
    track_type: EVENT_CONFIG_TRACK_TYPE,
    event_id_source: "target_asset_available_events_get",
    payload_persisted: false,
    response_persisted: false
  });
}

export function buildEventConfigCreatePayload({ advertiserId, assetId, eventId } = {}) {
  return {
    advertiser_id: clean(advertiserId),
    asset_id: clean(assetId),
    event_id: clean(eventId),
    track_types: [EVENT_CONFIG_TRACK_TYPE]
  };
}

export function evaluateEventConfigProvisionContract({ bundle = {}, assetIdHint = "" } = {}) {
  const job = bundle.job || {};
  const hint = clean(assetIdHint);
  const template = eventConfigBaselineTemplateManifest({ assetIdHint: hint });
  const contractHash = eventConfigOfficialCreateContractHash();
  const blockers = [
    ...(job.route_id === "oceanengine_3_byte_mini_game" ? [] : ["event_config_scope_not_oe3_byte_mini_game"]),
    ...(job.game_code === "JSZC" ? [] : ["event_config_scope_not_jszc"]),
    ...(clean(job.advertiser_id) ? [] : ["event_config_advertiser_missing"]),
    ...(EVENT_CONFIG_BASELINE_EVENTS.length === 6 ? [] : ["event_config_baseline_template_incomplete"]),
    ...(contractHash ? [] : ["event_config_official_create_contract_missing"])
  ];
  const result = sanitizeForPublic({
    status: blockers.length ? "blocked" : "ready_for_plan",
    blockers: [...new Set(blockers)],
    outputSummary: {
      action_type: EVENT_CONFIGS_PROVISION_ACTION,
      platform_action_type: EVENT_CONFIG_CREATE_ACTION_TYPE,
      endpoint: EVENT_CONFIG_CREATE_ENDPOINT,
      method: EVENT_CONFIG_CREATE_METHOD,
      official_create_contract_status: "verified",
      official_create_contract_hash: contractHash,
      official_create_contract_source_ref: EVENT_CONFIG_OFFICIAL_CREATE_SOURCE_REFS[0],
      request_field_manifest: [...EVENT_CONFIG_CREATE_FIELD_NAMES],
      baseline_template_version: EVENT_CONFIG_BASELINE_TEMPLATE_VERSION,
      baseline_template_hash: hashValue(template),
      baseline_event_count: EVENT_CONFIG_BASELINE_EVENTS.length,
      baseline_event_types: baselineEventTypes(),
      track_type: EVENT_CONFIG_TRACK_TYPE,
      asset_id_hint_present: Boolean(hint),
      asset_id_hint_hash: hint ? hashValue(hint) : "",
      event_id_source: "target_asset_available_events_get",
      planEligible: blockers.length === 0,
      platformWriteCalled: false,
      payload_persisted: false,
      response_persisted: false
    }
  });
  assertNoSensitiveLeak(result);
  return result;
}
