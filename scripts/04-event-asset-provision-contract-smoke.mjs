import {
  EVENT_ASSET_CREATE_ENDPOINT,
  EVENT_ASSET_CREATE_FIELD_NAMES,
  EVENT_ASSET_CREATE_METHOD,
  EVENT_ASSET_OFFICIAL_CREATE_SOURCE_REFS,
  EVENT_ASSET_PROVISION_ACTION,
  EVENT_ASSET_TEMPLATE_REF,
  assertNoSensitiveLeak,
  eventAssetOfficialCreateContractHash,
  eventAssetTemplateHash,
  evaluateEventAssetProvisionContract
} from "../src/workflows/skills/oe3/00-index.mjs";
import { eventChainResourceReadiness } from "../src/workflows/skills/oe3/04-event-chain-readiness.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const HASH = `sha256:${"a".repeat(64)}`;

function bundle({ provision = {}, eventContract = { status: "blocked", blocker_codes: ["event_asset_target_not_found"] } } = {}) {
  return {
    job: {
      job_id: "JOB-SMOKE-EVENT-ASSET-PROVISION",
      route_id: "oceanengine_3_byte_mini_game",
      game_code: "JSZC",
      advertiser_id: "1871922434025472"
    },
    defaults: {
      objective: "AD_CONVERT_TYPE_PAY",
      deep_objective: "AD_CONVERT_TYPE_PURCHASE_ROI_7D",
      deep_bid_type: "PER_AND_SEVEN_PAY_ROI"
    },
    platformApp: {
      id: "GPA-JSZC-OE-BYTE-MINI-GAME",
      app_id: "tte95a9fe77665844607",
      app_name: "巨兽战场",
      app_type: "byte_mini_game",
      status: "active",
      metadata: {
        micro_app_instance_id: "7434750138926546994",
        micro_app_instance_id_source: "platform_app_reference"
      }
    },
    resourceBlueprints: [{
      resource_type: "event_asset",
      metadata: { event_asset_provision: provision }
    }],
    resources: [{
      resource_type: "event_asset",
      visibility_status: "needs_confirmation",
      readback_status: "not_checked",
      metadata: { event_chain_readonly_contract: eventContract }
    }, {
      resource_type: "micro_app_instance",
      visibility_status: "needs_confirmation",
      readback_status: "not_checked",
      metadata: {}
    }]
  };
}

const unverified = evaluateEventAssetProvisionContract({ bundle: bundle() });
assert(unverified.status === "blocked", "unverified_contract_must_block");
assert(unverified.blockers.includes("event_asset_create_contract_unverified"), "unverified_contract_blocker_missing");
assert(unverified.outputSummary.planEligible === false, "unverified_contract_must_not_plan");

const missingTemplate = evaluateEventAssetProvisionContract({
  bundle: bundle({
    provision: {
      version: "test",
      template_status: "missing",
      asset_type: "MINI_PROGRAME",
      platform_app_ref: "GPA-JSZC-OE-BYTE-MINI-GAME",
      objective: "AD_CONVERT_TYPE_PAY",
      deep_objective: "AD_CONVERT_TYPE_PURCHASE_ROI_7D",
      deep_bid_type: "PER_AND_SEVEN_PAY_ROI",
      official_create_contract: {
        status: "verified",
        source_ref: EVENT_ASSET_OFFICIAL_CREATE_SOURCE_REFS[0],
        content_hash: eventAssetOfficialCreateContractHash(),
        method: EVENT_ASSET_CREATE_METHOD,
        endpoint: EVENT_ASSET_CREATE_ENDPOINT,
        request_field_manifest: [...EVENT_ASSET_CREATE_FIELD_NAMES]
      }
    }
  })
});
assert(missingTemplate.blockers.includes("event_asset_provision_template_ref_missing"), "missing_template_ref_not_blocked");

const verifiedBundle = bundle();
const verifiedProvision = {
  version: "test",
  template_status: "ready",
  template_ref: EVENT_ASSET_TEMPLATE_REF,
  template_hash: eventAssetTemplateHash({ bundle: verifiedBundle }),
  asset_type: "MINI_PROGRAME",
  platform_app_ref: "GPA-JSZC-OE-BYTE-MINI-GAME",
  objective: "AD_CONVERT_TYPE_PAY",
  deep_objective: "AD_CONVERT_TYPE_PURCHASE_ROI_7D",
  deep_bid_type: "PER_AND_SEVEN_PAY_ROI",
  official_create_contract: {
    status: "verified",
    source_ref: EVENT_ASSET_OFFICIAL_CREATE_SOURCE_REFS[0],
    content_hash: eventAssetOfficialCreateContractHash(),
    method: EVENT_ASSET_CREATE_METHOD,
    endpoint: EVENT_ASSET_CREATE_ENDPOINT,
    request_field_manifest: [...EVENT_ASSET_CREATE_FIELD_NAMES]
  }
};
const eligible = evaluateEventAssetProvisionContract({ bundle: bundle({ provision: verifiedProvision }) });
assert(eligible.status === "ready_for_plan", "verified_contract_should_be_plan_eligible");
assert(eligible.outputSummary.proposedAction === EVENT_ASSET_PROVISION_ACTION, "event_action_missing");
assert(Boolean(eligible.outputSummary.idempotencyScope), "event_idempotency_scope_missing");
assert(eligible.outputSummary.officialCreateEndpoint === EVENT_ASSET_CREATE_ENDPOINT, "event_create_endpoint_mismatch");
assert(eligible.outputSummary.templateHashMatchesExpected === true, "event_template_hash_mismatch");

const missingTargetReadiness = eventChainResourceReadiness({
  bundle: bundle({ provision: verifiedProvision }),
  resourceType: "event_asset"
});
assert(missingTargetReadiness.status === "blocked", "missing_target_must_stay_blocked");
assert(missingTargetReadiness.blockers[0] === "event_asset_target_not_found", "target_blocker_must_remain_primary");
assert(missingTargetReadiness.outputSummary.eventAssetProvisionPlanEligible === true, "eligible_provision_not_exposed");

const result = {
  status: "passed",
  unverifiedBlocked: unverified.status === "blocked",
  missingTemplateBlocked: missingTemplate.status === "blocked",
  verifiedProvisionEligible: eligible.outputSummary.planEligible,
  targetMissingStillBlocked: missingTargetReadiness.status === "blocked",
  platformWriteCalled: false,
  rawRequestStored: false,
  rawResponseStored: false
};
assertNoSensitiveLeak(result);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
