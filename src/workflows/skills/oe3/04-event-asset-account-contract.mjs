import {
  assertNoSensitiveLeak,
  sanitizeForPublic
} from "./00-contracts.mjs";
import {
  EVENT_ASSET_CREATE_ENDPOINT,
  EVENT_ASSET_CREATE_FIELD_NAMES,
  EVENT_ASSET_CREATE_METHOD,
  EVENT_ASSET_OFFICIAL_CREATE_SOURCE_REFS,
  EVENT_ASSET_TEMPLATE_MANIFEST_VERSION,
  EVENT_ASSET_TYPE,
  buildEventAssetCreateTemplateManifest,
  eventAssetOfficialCreateContractHash,
  eventAssetTemplateHash,
  eventAssetTemplateRef,
  evaluateEventAssetProvisionContract
} from "./04-event-asset-provision-contract.mjs";
import { clean, resource } from "./04-resource-verifiers.mjs";
import {
  microAppInstanceCandidate,
  microAppInstanceCandidateBlockers
} from "./04-micro-app-instance-candidate.mjs";

function eventResourceWithProvision(bundle = {}, provision = {}) {
  return {
    ...bundle,
    resources: (bundle.resources || []).map((item) => item.resource_type === "event_asset"
      ? { ...item, metadata: { ...(item.metadata || {}), event_asset_provision: provision } }
      : item)
  };
}

export function buildEventAssetAccountProvisionContract({ bundle = {} } = {}) {
  const job = bundle.job || {};
  const app = bundle.platformApp || {};
  const template = buildEventAssetCreateTemplateManifest({ bundle });
  const instance = microAppInstanceCandidate(bundle);
  const blockers = [
    ...(clean(job.route_id) === "oceanengine_3_byte_mini_game" && clean(job.game_code) === "JSZC"
      ? []
      : ["event_asset_account_contract_scope_invalid"]),
    ...(clean(job.advertiser_id) ? [] : ["event_asset_account_contract_advertiser_missing"]),
    ...(clean(app.app_id) && clean(app.app_type) === "byte_mini_game" && clean(app.status) === "active"
      ? []
      : ["event_asset_provision_platform_app_unverified"]),
    ...microAppInstanceCandidateBlockers(instance)
  ];
  if (blockers.length) {
    return sanitizeForPublic({
      status: "blocked",
      blockers: [...new Set(blockers)],
      provision: null,
      outputSummary: {
        accountContractStored: false,
        targetInstanceCandidateTrusted: instance.instanceCandidateTrusted === true,
        platformWriteCalled: false,
        rawRequestStored: false,
        rawResponseStored: false
      }
    });
  }
  const provision = {
    version: EVENT_ASSET_TEMPLATE_MANIFEST_VERSION,
    template_status: "ready",
    target_advertiser_id: clean(job.advertiser_id),
    template_ref: eventAssetTemplateRef(job.advertiser_id),
    template_hash: eventAssetTemplateHash({ bundle }),
    asset_type: EVENT_ASSET_TYPE,
    platform_app_ref: clean(app.id || app.app_id),
    objective: clean(bundle.defaults?.objective),
    deep_objective: clean(bundle.defaults?.deep_objective),
    deep_bid_type: clean(bundle.defaults?.deep_bid_type),
    official_create_contract: {
      status: "verified",
      source_ref: EVENT_ASSET_OFFICIAL_CREATE_SOURCE_REFS[0],
      content_hash: eventAssetOfficialCreateContractHash(),
      method: EVENT_ASSET_CREATE_METHOD,
      endpoint: EVENT_ASSET_CREATE_ENDPOINT,
      request_field_manifest: [...EVENT_ASSET_CREATE_FIELD_NAMES],
      payload_persisted: false,
      response_persisted: false
    }
  };
  const effectiveBundle = eventResourceWithProvision(bundle, provision);
  const evaluation = evaluateEventAssetProvisionContract({ bundle: effectiveBundle });
  const result = sanitizeForPublic({
    status: evaluation.status === "ready_for_plan" ? "ready_for_plan" : "blocked",
    blockers: evaluation.blockers || [],
    provision: evaluation.status === "ready_for_plan" ? provision : null,
    outputSummary: {
      accountContractStored: false,
      targetInstanceCandidateTrusted: instance.instanceCandidateTrusted === true,
      templateHashMatchesExpected: evaluation.outputSummary?.templateHashMatchesExpected === true,
      contractPlanEligible: evaluation.outputSummary?.planEligible === true,
      platformWriteCalled: false,
      rawRequestStored: false,
      rawResponseStored: false
    }
  });
  assertNoSensitiveLeak(result);
  return result;
}

export async function syncEventAssetAccountProvisionContract({ repo, bundle } = {}) {
  if (!repo?.mergeAccountResourceMetadata) throw new Error("account_resource_metadata_repository_required");
  if (!bundle?.job) throw new Error("launch_job_bundle_required");
  const prepared = buildEventAssetAccountProvisionContract({ bundle });
  if (prepared.status !== "ready_for_plan" || !prepared.provision) return prepared;
  const eventAsset = resource(bundle, "event_asset");
  if (!eventAsset.resource_type) throw new Error("event_asset_account_resource_missing");
  await repo.mergeAccountResourceMetadata({
    routeId: bundle.job.route_id,
    gameCode: bundle.job.game_code,
    advertiserId: bundle.job.advertiser_id,
    resourceType: "event_asset",
    resourceMetadata: { event_asset_provision: prepared.provision }
  });
  return sanitizeForPublic({
    ...prepared,
    outputSummary: {
      ...prepared.outputSummary,
      accountContractStored: true
    }
  });
}
