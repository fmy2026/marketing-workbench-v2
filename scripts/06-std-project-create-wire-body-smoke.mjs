import assert from "node:assert/strict";
import {
  buildStdProjectCreateWireBody,
  INSTANCE_ID_WIRE_STRATEGY,
  INT64_MAX_DECIMAL
} from "../src/workflows/skills/oe3/05-std-project-create-wire-body.mjs";
import { evaluateStdProjectCreatePreflight } from "../src/workflows/skills/oe3/05-create-preflight-diagnostics.mjs";

function basePayload(instanceId = "7434750138926546994") {
  return {
    advertiser_id: 1871922175825993,
    name: "MWBV2_WIRE_BODY_SMOKE",
    ad_type: "ALL",
    landing_type: "MICRO_GAME",
    marketing_goal: "VIDEO_AND_IMAGE",
    external_action: "AD_CONVERT_TYPE_PAY",
    native_type: "AWEME",
    aweme_id: "1122334455667788",
    delivery_mode: "PROCEDURAL",
    delivery_medium: "BYTE_GAME",
    instance_id: instanceId,
    asset_id: 100000000001,
    schedule_type: "SCHEDULE_FROM_NOW",
    bid_type: "CUSTOM",
    budget_mode: "BUDGET_MODE_DAY",
    budget: 300,
    pricing: "PRICING_OCPM",
    cpa_bid: 30,
    roi_goal: 1.2,
    audience_type: "CUSTOM",
    audience: {
      district: "CITY",
      gender: "GENDER_UNLIMITED",
      age: [],
      converted_time_duration: "THIRTY_DAY",
      hide_if_converted: "NO_EXCLUDE",
      filter_event: ["AD_CONVERT_TYPE_PAY"],
      retargeting_tags_exclude: [100000000001],
      interest_action_mode: "UNLIMITED"
    },
    brand_info: {
      brand_name_id: 100000000001,
      cdp_brand_id: 100000000002,
      cdp_brand_name: "JSZC",
      yuntu_category_id: 100000000003
    },
    project_materials: {
      title_material_list: [{ title: "JSZC wire body smoke" }],
      video_material_list: [{ image_mode: "CREATIVE_IMAGE_MODE_VIDEO_VERTICAL", video_id: "9988776655443322" }],
      image_material_list: [],
      external_url_material_list: ["https://example.invalid/mwbv2/wire-body-smoke"],
      source: "JSZC",
      mini_program_info: { app_id: "tt0000000000000000" },
      product_info: {
        titles: ["JSZC"],
        image_ids: ["1234567890123456"],
        selling_points: ["smoke"]
      },
      call_to_action_buttons: ["立即试玩"],
      anchor_related_type: "ANCHOR_RELATED_TYPE_GAME"
    },
    track_url_setting: {
      send_type: "SERVER_SEND",
      action_track_url: ["https://example.invalid/mwbv2/callback"]
    },
    aigc_dynamic_creative_switch: "OFF",
    is_comment_disable: "OFF"
  };
}

function assertBlocked(instanceId, blocker) {
  const wire = buildStdProjectCreateWireBody(basePayload(instanceId));
  assert.equal(wire.status, "blocked");
  assert(wire.blockers.includes(blocker), `${blocker} not found in ${wire.blockers.join(",")}`);
}

const wire = buildStdProjectCreateWireBody(basePayload());
assert.equal(wire.status, "passed");
assert.equal(wire.instanceIdTransportStrategy, INSTANCE_ID_WIRE_STRATEGY);
assert(wire.body.includes('"instance_id":7434750138926546994'));
assert(!wire.body.includes('"instance_id":"7434750138926546994"'));
assert(!wire.body.includes("7.434750138926547e+18"));
assert.match(wire.requestHash, /^sha256:[a-f0-9]{64}$/);

const int64Wire = buildStdProjectCreateWireBody(basePayload(INT64_MAX_DECIMAL));
assert.equal(int64Wire.status, "passed");
assert(int64Wire.body.includes(`"instance_id":${INT64_MAX_DECIMAL}`));

assertBlocked("07434750138926546994", "invalid_decimal_bigint_json_number:instance_id");
assertBlocked("7434750138926546994.0", "invalid_decimal_bigint_json_number:instance_id");
assertBlocked("-7434750138926546994", "invalid_decimal_bigint_json_number:instance_id");
assertBlocked("9223372036854775808", "instance_id_exceeds_signed_int64");
assertBlocked("7434750138926546994abc", "invalid_decimal_bigint_json_number:instance_id");

const manifestPreflight = evaluateStdProjectCreatePreflight({
  requestFieldManifest: {
    requiredFieldsPresent: true,
    blockers: [],
    advertiserIdStorageType: "string",
    advertiserIdTransportType: "number",
    advertiserIdTransportSafe: true,
    businessDefaultsPresent: true,
    contractMapping: {
      miniGameInstanceCandidateCreateField: "instance_id",
      optimizedGoalQueryInstanceFieldName: "micro_app_instance_id",
      optimizedGoalQueryAppFieldName: "mini_program_id"
    },
    instanceIdCreateEvidence: {
      status: "passed",
      candidateField: "instance_id",
      fieldNameVerified: true,
      createFieldType: "number",
      fieldTypeVerified: true,
      applicabilityVerified: true,
      longIdTransportStrategy: INSTANCE_ID_WIRE_STRATEGY,
      longIdTransportVerified: true,
      longPlatformId: true,
      blockers: []
    },
    microAppInstanceIdTransportStrategy: INSTANCE_ID_WIRE_STRATEGY,
    microAppInstanceIdWireNumberTokenPresent: true,
    createWireBodyEncodingStatus: "passed",
    createWireBodyHash: wire.requestHash,
    createRequestHash: wire.requestHash,
    officialFieldEvidence: { status: "passed", blockerCodes: [], fields: [] },
    finalMaterialReadiness: {
      selectedRequiredVideoCount: 1,
      verifiedVideoCount: 1,
      coverReadyCount: 1
    },
    backupLandingPagePresent: true,
    backupLandingPageHttps: true,
    backupLandingPageTargetVisible: true,
    backupLandingPageReadbackVerified: true,
    backupLandingPageHashMatch: true
  },
  payloadContractStatus: "passed"
});
assert.equal(manifestPreflight.status, "passed");

const unverifiedPreflight = evaluateStdProjectCreatePreflight({
  requestFieldManifest: {
    requiredFieldsPresent: true,
    blockers: [],
    advertiserIdStorageType: "string",
    advertiserIdTransportType: "number",
    advertiserIdTransportSafe: true,
    instanceIdCreateEvidence: {
      status: "blocked",
      candidateField: "instance_id",
      fieldNameVerified: true,
      createFieldType: "number",
      fieldTypeVerified: true,
      applicabilityVerified: true,
      longIdTransportVerified: false,
      longPlatformId: true,
      blockers: ["instance_id_long_id_transport_not_verified"]
    }
  },
  payloadContractStatus: "passed"
});
assert(unverifiedPreflight.blocker_codes.includes("instance_id_long_id_transport_not_verified"));

console.log(JSON.stringify({
  status: "passed",
  instanceIdWireNumberTokenPresent: true,
  requestHashPresent: true,
  invalidInputsBlocked: true,
  unverifiedStrategyBlocked: true,
  rawPayloadStored: false,
  rawResponseStored: false
}, null, 2));
