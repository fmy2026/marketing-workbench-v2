import { hashValue, sanitizeForPublic } from "./00-contracts.mjs";
import { clean, resource, resourceReady } from "./04-resource-verifiers.mjs";

export const EVENT_ASSET_PROVISION_ACTION = "ensure_resource:event_asset";
export const EVENT_ASSET_TYPE = "MINI_PROGRAME";
export const EVENT_ASSET_CREATE_ACTION_TYPE = "oceanengine_event_asset_create";
export const EVENT_ASSET_CREATE_ENDPOINT = "/open_api/2/event_manager/assets/create/";
export const EVENT_ASSET_CREATE_METHOD = "POST";
export const EVENT_ASSET_OFFICIAL_CREATE_SOURCE_REFS = Object.freeze([
  "official:oceanengine:2.0:19-asset:event_manager/assets/create:120-180",
  "official:oceanengine:2.0-copy:17-asset:event_manager/assets/create:3283-3661"
]);
export const EVENT_ASSET_CREATE_FIELD_NAMES = Object.freeze([
  "advertiser_id",
  "asset_type",
  "mini_program_asset.mini_program_id",
  "mini_program_asset.mini_program_name",
  "mini_program_asset.instance_id",
  "mini_program_asset.mini_program_type"
]);
export const EVENT_ASSET_TEMPLATE_MANIFEST_VERSION = "2026-08-30.event-asset-api-create-v2";

export function eventAssetTemplateRef(advertiserId = "") {
  const target = clean(advertiserId);
  return target ? `jszc:event_asset:mini_program:${target}:20260831` : "";
}

function blueprint(bundle = {}) {
  return (bundle.resourceBlueprints || []).find((item) => item.resource_type === "event_asset") || {};
}

function definitionFromBlueprint(bundle = {}) {
  return blueprint(bundle).metadata?.event_asset_provision || {};
}

function provision(bundle = {}) {
  const item = resource(bundle, "event_asset");
  const fromBlueprint = definitionFromBlueprint(bundle);
  const fromResource = item.metadata?.event_asset_provision || {};
  const official = {
    ...(fromBlueprint.official_create_contract || {}),
    ...(fromResource.official_create_contract || {})
  };
  return {
    ...fromBlueprint,
    ...fromResource,
    ...(Object.keys(official).length ? { official_create_contract: official } : {})
  };
}

function validHash(value = "") {
  return /^sha256:[a-f0-9]{64}$/i.test(clean(value));
}

function stringArray(value) {
  return Array.isArray(value) ? value.map(clean).filter(Boolean) : [];
}

function sameStringSet(left = [], right = []) {
  const normalizedLeft = [...new Set(left.map(clean).filter(Boolean))].sort();
  const normalizedRight = [...new Set(right.map(clean).filter(Boolean))].sort();
  return JSON.stringify(normalizedLeft) === JSON.stringify(normalizedRight);
}

function microAppInstanceId(bundle = {}) {
  const item = resource(bundle, "micro_app_instance");
  const app = bundle.platformApp || {};
  const candidates = [
    [clean(item.platform_resource_id), resourceReady(item) ? "target_resource_record" : ""],
    [clean(item.metadata?.micro_app_instance_id), "account_resource_metadata"],
    [clean(item.metadata?.instance_id), "account_resource_metadata"],
    [clean(app.metadata?.micro_app_instance_id), clean(app.metadata?.micro_app_instance_id_source) || "platform_app_reference"]
  ].filter(([id]) => id);
  const distinct = [...new Map(candidates.map(([id, source]) => [id, source])).entries()];
  return {
    id: distinct.length === 1 ? distinct[0][0] : "",
    source: distinct.length === 1 ? distinct[0][1] : "",
    candidateCount: distinct.length,
    ambiguous: distinct.length > 1
  };
}

export function eventAssetInstanceReadbackVerified(bundle = {}) {
  const item = resource(bundle, "micro_app_instance");
  return resourceReady(item) || item.metadata?.event_chain_readonly_contract?.target_instance_readback_verified === true ||
    item.metadata?.micro_app_instance_authority_readonly_contract?.target_instance_readback_verified === true;
}

export function buildEventAssetCreateTemplateManifest({ bundle = {} } = {}) {
  const app = bundle.platformApp || {};
  const instance = microAppInstanceId(bundle);
  return sanitizeForPublic({
    advertiser_id: clean(bundle.job?.advertiser_id),
    asset_type: EVENT_ASSET_TYPE,
    mini_program_asset: {
      mini_program_id: clean(app.app_id),
      mini_program_name: clean(app.app_name || app.name || "巨兽战场"),
      instance_id: instance.id,
      mini_program_type: "BYTE_GAME"
    },
    objectives: {
      objective: clean(bundle.defaults?.objective),
      deep_objective: clean(bundle.defaults?.deep_objective),
      deep_bid_type: clean(bundle.defaults?.deep_bid_type)
    },
    raw_payload_stored: false
  });
}

export function buildEventAssetCreatePayload({ bundle = {} } = {}) {
  const template = buildEventAssetCreateTemplateManifest({ bundle });
  return {
    advertiser_id: template.advertiser_id,
    asset_type: template.asset_type,
    mini_program_asset: {
      mini_program_id: template.mini_program_asset.mini_program_id,
      mini_program_name: template.mini_program_asset.mini_program_name,
      instance_id: template.mini_program_asset.instance_id,
      mini_program_type: template.mini_program_asset.mini_program_type
    }
  };
}

export function eventAssetCreateContractShape() {
  return sanitizeForPublic({
    method: EVENT_ASSET_CREATE_METHOD,
    endpoint: EVENT_ASSET_CREATE_ENDPOINT,
    field_names: [...EVENT_ASSET_CREATE_FIELD_NAMES],
    source_refs: [...EVENT_ASSET_OFFICIAL_CREATE_SOURCE_REFS],
    raw_payload_stored: false,
    raw_response_stored: false
  });
}

export function eventAssetTemplateHash({ bundle = {} } = {}) {
  return hashValue(buildEventAssetCreateTemplateManifest({ bundle }));
}

export function eventAssetOfficialCreateContractHash() {
  return hashValue(eventAssetCreateContractShape());
}

export function evaluateEventAssetProvisionContract({ bundle = {} } = {}) {
  const definition = provision(bundle);
  const official = definition.official_create_contract || {};
  const defaults = bundle.defaults || {};
  const app = bundle.platformApp || {};
  const instance = microAppInstanceId(bundle);
  const expectedTemplate = buildEventAssetCreateTemplateManifest({ bundle });
  const expectedTemplateHash = hashValue(expectedTemplate);
  const expectedContractHash = eventAssetOfficialCreateContractHash();
  const expectedObjective = clean(defaults.objective);
  const expectedDeepObjective = clean(defaults.deep_objective);
  const expectedDeepBidType = clean(defaults.deep_bid_type);
  const expectedAdvertiserId = clean(bundle.job?.advertiser_id);
  const expectedTemplateRef = eventAssetTemplateRef(expectedAdvertiserId);
  const fieldManifest = stringArray(official.request_field_manifest || official.field_names);
  const endpoint = clean(official.endpoint);
  const method = clean(official.method).toUpperCase();
  const blockers = [
    ...(clean(definition.template_status) === "ready" ? [] : ["event_asset_provision_template_not_ready"]),
    ...(clean(definition.target_advertiser_id) === expectedAdvertiserId && expectedAdvertiserId ? [] : ["event_asset_provision_advertiser_scope_mismatch"]),
    ...(clean(definition.template_ref) === expectedTemplateRef ? [] : ["event_asset_provision_template_ref_mismatch"]),
    ...(validHash(definition.template_hash) ? [] : ["event_asset_provision_template_hash_invalid"]),
    ...(clean(definition.template_hash) === expectedTemplateHash ? [] : ["event_asset_provision_template_hash_mismatch"]),
    ...(clean(definition.asset_type) === EVENT_ASSET_TYPE ? [] : ["event_asset_provision_asset_type_invalid"]),
    ...(clean(definition.platform_app_ref) ? [] : ["event_asset_provision_platform_app_ref_missing"]),
    ...(clean(definition.objective) === expectedObjective && expectedObjective ? [] : ["event_asset_provision_objective_mismatch"]),
    ...(clean(definition.deep_objective) === expectedDeepObjective && expectedDeepObjective ? [] : ["event_asset_provision_deep_objective_mismatch"]),
    ...(clean(definition.deep_bid_type) === expectedDeepBidType && expectedDeepBidType ? [] : ["event_asset_provision_deep_bid_type_mismatch"]),
    ...(clean(official.status) === "verified" ? [] : ["event_asset_create_contract_unverified"]),
    ...(clean(official.source_ref) ? [] : ["event_asset_create_contract_source_missing"]),
    ...(validHash(official.content_hash) ? [] : ["event_asset_create_contract_hash_invalid"]),
    ...(clean(official.content_hash) === expectedContractHash ? [] : ["event_asset_create_contract_hash_mismatch"]),
    ...(method === EVENT_ASSET_CREATE_METHOD ? [] : ["event_asset_create_contract_method_invalid"]),
    ...(endpoint === EVENT_ASSET_CREATE_ENDPOINT ? [] : ["event_asset_create_contract_endpoint_missing"]),
    ...(sameStringSet(fieldManifest, EVENT_ASSET_CREATE_FIELD_NAMES) ? [] : ["event_asset_create_contract_field_manifest_missing"]),
    ...(clean(app.app_id) && clean(app.app_type) === "byte_mini_game" && clean(app.status) === "active"
      ? []
      : ["event_asset_provision_platform_app_unverified"]),
    ...(instance.ambiguous ? ["event_asset_provision_instance_ambiguous"] : []),
    ...(instance.id ? [] : ["event_asset_provision_instance_missing"]),
    ...(eventAssetInstanceReadbackVerified(bundle) ? [] : ["event_asset_provision_instance_readback_unverified"]),
    ...(clean(expectedTemplate.mini_program_asset.mini_program_id) ? [] : ["event_asset_provision_mini_program_id_missing"]),
    ...(clean(expectedTemplate.mini_program_asset.mini_program_name) ? [] : ["event_asset_provision_mini_program_name_missing"])
  ];
  const planEligible = blockers.length === 0;
  return sanitizeForPublic({
    status: planEligible ? "ready_for_plan" : "blocked",
    blockers,
    outputSummary: {
      provisionVersion: clean(definition.version),
      templateManifestVersion: EVENT_ASSET_TEMPLATE_MANIFEST_VERSION,
      targetAdvertiserMatches: clean(definition.target_advertiser_id) === expectedAdvertiserId && Boolean(expectedAdvertiserId),
      targetAdvertiserIdPresent: Boolean(clean(definition.target_advertiser_id)),
      templateRef: clean(definition.template_ref),
      expectedTemplateRef,
      templateRefPresent: Boolean(clean(definition.template_ref)),
      templateHashPresent: validHash(definition.template_hash),
      templateHashMatchesExpected: clean(definition.template_hash) === expectedTemplateHash,
      templateHash: clean(definition.template_hash),
      expectedTemplateHash,
      templateStatus: clean(definition.template_status) || "missing",
      assetType: clean(definition.asset_type),
      platformAppRefPresent: Boolean(clean(definition.platform_app_ref)),
      officialCreateContractStatus: clean(official.status) || "missing",
      officialCreateContractSourcePresent: Boolean(clean(official.source_ref)),
      officialCreateContractHashPresent: validHash(official.content_hash),
      officialCreateContractHashMatchesExpected: clean(official.content_hash) === expectedContractHash,
      officialCreateEndpoint: endpoint,
      officialCreateMethod: method,
      officialCreateContractFieldManifestPresent: fieldManifest.length > 0,
      officialCreateContractFieldManifestMatches: sameStringSet(fieldManifest, EVENT_ASSET_CREATE_FIELD_NAMES),
      platformAppReady: clean(app.app_id) !== "" && clean(app.app_type) === "byte_mini_game" && clean(app.status) === "active",
      microAppInstanceIdPresent: Boolean(instance.id),
      microAppInstanceCandidateCount: instance.candidateCount,
      microAppInstanceSource: instance.source,
      microAppInstanceReadbackVerified: eventAssetInstanceReadbackVerified(bundle),
      planEligible,
      proposedAction: planEligible ? EVENT_ASSET_PROVISION_ACTION : "",
      idempotencyScope: planEligible
        ? hashValue({
          route_id: bundle.job?.route_id || "",
          game_code: bundle.job?.game_code || "",
          advertiser_id: bundle.job?.advertiser_id || "",
          template_hash: clean(definition.template_hash)
        })
        : "",
      platformWriteCalled: false,
      rawRequestStored: false,
      rawResponseStored: false
    }
  });
}
