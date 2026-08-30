import { hashValue } from "./00-contracts.mjs";

export const JSZC_SUCCESS_PROFILE_VERSION = "2026-08-30.jszc-byte-game-success-profile-v1";
export const JSZC_NESTED_FIELD_CONTRACT_VERSION = "2026-08-30.oe3-std-project-create-nested-fields-v4";
export const JSZC_SUCCESS_PROFILE_SOURCE = "verified_jszc_oneoff_created_and_three_readbacks";

export const JSZC_SUCCESS_PROFILE_FIXTURE = Object.freeze({
  routeId: "oceanengine_3_byte_mini_game",
  gameCode: "JSZC",
  deliveryMedium: "BYTE_GAME",
  landingType: "MICRO_GAME",
  hideIfConverted: "NO_EXCLUDE",
  policies: Object.freeze({
    filterEvent: "omit",
    convertedTimeDuration: "omit_when_no_exclude",
    externalUrlMaterialList: "send",
    externalUrlMaterialListRequiredCount: 1,
    miniProgramInfo: "url_only",
    imageMaterialList: "send_empty_array"
  }),
  requiredSendShapes: Object.freeze([
    Object.freeze({ path: "project_materials.external_url_material_list", valueType: "array", itemCount: 1 }),
    Object.freeze({ path: "project_materials.mini_program_info.url", valueType: "string" }),
    Object.freeze({ path: "project_materials.image_material_list", valueType: "array", itemCount: 0 })
  ]),
  requiredOmittedPaths: Object.freeze([
    "audience.filter_event",
    "audience.converted_time_duration",
    "micro_promotion_type",
    "project_materials.mini_program_info.app_id",
    "project_materials.mini_program_info.start_path",
    "project_materials.mini_program_info.params",
    "project_materials.anchor_material_list",
    "project_materials.component_material_list"
  ]),
  rawPayloadStored: false
});

export const JSZC_SUCCESS_PROFILE_FIXTURE_HASH = hashValue(JSZC_SUCCESS_PROFILE_FIXTURE);
export const JSZC_SUCCESS_PROFILE_GOLDEN_FIELD_SHAPE_HASH = "sha256:9203ddf077d05b51958e851dad86894f75fdf09884ffc99690ad459ce5dd1064";
export const JSZC_SUCCESS_PROFILE_GOLDEN_LEDGER_PATH_COUNT = 82;
export const JSZC_SUCCESS_PROFILE_GOLDEN_MATERIAL_COUNTS = Object.freeze({
  videoMaterialList: 2,
  titleMaterialList: 3,
  imageMaterialList: 0,
  productImageIds: 1,
  externalUrlMaterialList: 1,
  dmpExclusions: 10
});

function clean(value) {
  return String(value ?? "").trim();
}

export function configuredJsZcSuccessProfile(bundle = {}) {
  const contract = bundle.defaults?.raw_defaults?.official_create_field_contract || {};
  const nestedRules = contract.nested_rules || {};
  const groups = nestedRules.groups || {};
  const audience = groups.audience || {};
  const externalUrl = groups["project_materials.external_url_material_list"] || {};
  const profile = contract.success_profile || {};
  return {
    version: clean(profile.version),
    source: clean(profile.source),
    fixtureHash: clean(profile.fixture_hash),
    goldenFieldShapeHash: clean(profile.golden_field_shape_hash),
    expectedLedgerPathCount: Number(profile.expected_ledger_path_count || 0),
    nestedRuleVersion: clean(nestedRules.version),
    filterEventPolicy: clean(audience.filter_event_policy),
    convertedTimeDurationPolicy: clean(audience.converted_time_duration_policy),
    externalUrlMaterialListPolicy: clean(externalUrl.send_policy),
    externalUrlMaterialListRequiredCount: Number(externalUrl.required_count || 0),
    rawPayloadStored: false
  };
}

export function evaluateJsZcSuccessProfile(bundle = {}) {
  const configured = configuredJsZcSuccessProfile(bundle);
  const blockers = [
    ...(configured.version === JSZC_SUCCESS_PROFILE_VERSION ? [] : ["jszc_success_profile_version_mismatch"]),
    ...(configured.source === JSZC_SUCCESS_PROFILE_SOURCE ? [] : ["jszc_success_profile_source_mismatch"]),
    ...(configured.fixtureHash === JSZC_SUCCESS_PROFILE_FIXTURE_HASH ? [] : ["jszc_success_profile_fixture_hash_mismatch"]),
    ...(configured.goldenFieldShapeHash === JSZC_SUCCESS_PROFILE_GOLDEN_FIELD_SHAPE_HASH ? [] : ["jszc_success_profile_golden_field_shape_hash_mismatch"]),
    ...(configured.expectedLedgerPathCount === JSZC_SUCCESS_PROFILE_GOLDEN_LEDGER_PATH_COUNT ? [] : ["jszc_success_profile_ledger_path_count_mismatch"]),
    ...(configured.nestedRuleVersion === JSZC_NESTED_FIELD_CONTRACT_VERSION ? [] : ["jszc_nested_contract_version_mismatch"]),
    ...(configured.filterEventPolicy === "omit" ? [] : ["jszc_filter_event_policy_mismatch"]),
    ...(configured.convertedTimeDurationPolicy === "omit_when_no_exclude" ? [] : ["jszc_converted_time_duration_policy_mismatch"]),
    ...(configured.externalUrlMaterialListPolicy === "send" ? [] : ["jszc_external_url_material_list_policy_mismatch"]),
    ...(configured.externalUrlMaterialListRequiredCount === 1 ? [] : ["jszc_external_url_material_list_required_count_mismatch"])
  ];
  return {
    status: blockers.length ? "blocked" : "passed",
    ...configured,
    blockers,
    rawPayloadStored: false
  };
}

export function jszcSuccessProfileManifest(result = {}) {
  return {
    status: result.status || "blocked",
    version: result.version || "",
    source: result.source || "",
    fixtureHash: result.fixtureHash || "",
    goldenFieldShapeHash: result.goldenFieldShapeHash || "",
    expectedLedgerPathCount: Number(result.expectedLedgerPathCount || 0),
    nestedRuleVersion: result.nestedRuleVersion || "",
    filterEventPolicy: result.filterEventPolicy || "",
    convertedTimeDurationPolicy: result.convertedTimeDurationPolicy || "",
    externalUrlMaterialListPolicy: result.externalUrlMaterialListPolicy || "",
    externalUrlMaterialListRequiredCount: Number(result.externalUrlMaterialListRequiredCount || 0),
    blockers: Array.isArray(result.blockers) ? result.blockers : [],
    rawPayloadStored: false
  };
}
