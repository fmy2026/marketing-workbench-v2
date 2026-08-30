import assert from "node:assert/strict";
import {
  buildStdProjectCreateWireBody,
  INSTANCE_ID_WIRE_STRATEGY,
  INT64_MAX_DECIMAL
} from "../src/workflows/skills/oe3/05-std-project-create-wire-body.mjs";
import { evaluateStdProjectCreatePreflight } from "../src/workflows/skills/oe3/05-create-preflight-diagnostics.mjs";
import { CREATE_FIELD_LEDGER_VERSION } from "../src/workflows/skills/oe3/05-create-field-ledger.mjs";
import { SELLING_POINTS_CONTRACT } from "../src/workflows/skills/oe3/05-selling-points-contract.mjs";
import { TITLE_MATERIAL_CONTRACT } from "../src/workflows/skills/oe3/05-title-materials-contract.mjs";
import { NESTED_FIELD_CONTRACT } from "../src/workflows/skills/oe3/05-nested-field-contract.mjs";
import {
  JSZC_SUCCESS_PROFILE_FIXTURE_HASH,
  JSZC_SUCCESS_PROFILE_GOLDEN_FIELD_SHAPE_HASH,
  JSZC_SUCCESS_PROFILE_GOLDEN_LEDGER_PATH_COUNT,
  JSZC_SUCCESS_PROFILE_SOURCE,
  JSZC_SUCCESS_PROFILE_VERSION
} from "../src/workflows/skills/oe3/05-jszc-success-profile.mjs";

const FIELD_SHAPE_HASH = JSZC_SUCCESS_PROFILE_GOLDEN_FIELD_SHAPE_HASH;

function passedCreateFieldLedger() {
  return {
    status: "passed",
    ruleVersion: CREATE_FIELD_LEDGER_VERSION,
    checkedPathCount: JSZC_SUCCESS_PROFILE_GOLDEN_LEDGER_PATH_COUNT,
    blockedPathCount: 0,
    fieldShapeHash: FIELD_SHAPE_HASH,
    entries: Array.from({ length: JSZC_SUCCESS_PROFILE_GOLDEN_LEDGER_PATH_COUNT }, (_, index) => ({
      path: `shape_path_${index}`,
      sendPolicy: "send",
      preCreateStatus: "passed",
      rawValueStored: false
    })),
    rawPayloadStored: false
  };
}

function passedCurrentRouteManifest() {
  return {
    externalUrlMaterialListPolicy: "send",
    externalUrlMaterialListPresent: true,
    externalUrlMaterialListCount: 1,
    externalUrlMaterialListOmittedByContract: false,
    hideIfConverted: "NO_EXCLUDE",
    filterEventPolicy: "omit",
    filterEventPresent: false,
    filterEventOmittedByContract: true,
    convertedTimeDurationPolicy: "omit_when_no_exclude",
    convertedTimeDurationPresent: false,
    convertedTimeDurationOmittedByContract: true,
    successProfileVersion: JSZC_SUCCESS_PROFILE_VERSION,
    fieldShapeHash: FIELD_SHAPE_HASH,
    successProfile: {
      status: "passed",
      version: JSZC_SUCCESS_PROFILE_VERSION,
      source: JSZC_SUCCESS_PROFILE_SOURCE,
      fixtureHash: JSZC_SUCCESS_PROFILE_FIXTURE_HASH,
      goldenFieldShapeHash: JSZC_SUCCESS_PROFILE_GOLDEN_FIELD_SHAPE_HASH,
      expectedLedgerPathCount: JSZC_SUCCESS_PROFILE_GOLDEN_LEDGER_PATH_COUNT,
      filterEventPolicy: "omit",
      convertedTimeDurationPolicy: "omit_when_no_exclude",
      externalUrlMaterialListPolicy: "send",
      externalUrlMaterialListRequiredCount: 1,
      rawPayloadStored: false
    },
    productSellingPointsSource: "postgres:mwb.game_route_defaults.raw_defaults.payload_defaults.product.selling_points",
    productSellingPointsContractRuleVersion: SELLING_POINTS_CONTRACT.ruleVersion,
    productSellingPointsCount: 1,
    productSellingPointsMinChars: 6,
    productSellingPointsMaxChars: 6,
    productSellingPointsValidated: true,
    productSellingPointsBlockerCount: 0,
    titleMaterialSource: TITLE_MATERIAL_CONTRACT.source,
    titleMaterialContractRuleVersion: TITLE_MATERIAL_CONTRACT.ruleVersion,
    titleMaterialPackId: "PACK-WIRE-SMOKE",
    titleMaterialCount: 1,
    titleMaterialMinChars: 5,
    titleMaterialMaxChars: 5,
    titleMaterialAssetIds: ["ASSET-WIRE-SMOKE"],
    titleMaterialAssetHashes: ["sha256:wire-smoke"],
    titleMaterialValidated: true,
    titleMaterialBlockerCount: 0,
    titleMaterialSourceTypeMismatchCount: 0,
    titleMaterialFilenameLikeCount: 0,
    officialFieldEvidence: {
      status: "passed",
      blockerCodes: [],
      fields: [
        { fieldPath: "delivery_type", evidenceLevel: "official_direct", sendPolicy: "send", status: "passed" },
        { fieldPath: "layer_roi_switch", evidenceLevel: "official_direct", sendPolicy: "send", status: "passed" }
      ],
      omittedFieldPaths: ["micro_promotion_type"]
    },
    nestedFieldContract: {
      status: "passed",
      ruleVersion: NESTED_FIELD_CONTRACT.ruleVersion,
      source: NESTED_FIELD_CONTRACT.source,
      checkedPathCount: 7,
      blockerCount: 0,
      blockers: [],
      checkedGroups: [
        "video_materials",
        "product_info",
        "image_material_list",
        "external_url_material_list",
        "mini_program_info",
        "track_url_setting",
        "audience"
      ],
      externalUrlMaterialListPolicy: "send",
      externalUrlMaterialListPresent: true,
      externalUrlMaterialListOmittedByContract: false,
      filterEventPolicy: "omit",
      filterEventPresent: false,
      filterEventOmittedByContract: true,
      convertedTimeDurationPolicy: "omit_when_no_exclude",
      convertedTimeDurationPresent: false,
      convertedTimeDurationOmittedByContract: true,
      rawPayloadStored: false
    }
  };
}

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
    createFieldLedger: passedCreateFieldLedger(),
    finalMaterialReadiness: {
      selectedRequiredVideoCount: 1,
      verifiedVideoCount: 1,
      coverReadyCount: 1
    },
    backupLandingPagePresent: true,
    backupLandingPageHttps: true,
    backupLandingPageTargetVisible: true,
    backupLandingPageReadbackVerified: true,
    backupLandingPageHashMatch: true,
    ...passedCurrentRouteManifest()
  },
  payloadContractStatus: "passed"
});
assert.equal(manifestPreflight.status, "passed", JSON.stringify(manifestPreflight.blocker_codes));

const unverifiedPreflight = evaluateStdProjectCreatePreflight({
  requestFieldManifest: {
    requiredFieldsPresent: true,
    blockers: [],
    advertiserIdStorageType: "string",
    advertiserIdTransportType: "number",
    advertiserIdTransportSafe: true,
    createFieldLedger: passedCreateFieldLedger(),
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
