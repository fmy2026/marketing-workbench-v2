import { hashValue } from "./00-contracts.mjs";

export const JSZC_SUCCESS_PROFILE_VERSION = "2026-09-02.jszc-byte-game-incremental-fallback-v2";
export const JSZC_NESTED_FIELD_CONTRACT_VERSION = "2026-09-02.oe3-std-project-create-nested-fields-v5";
export const JSZC_SUCCESS_PROFILE_SOURCE = "jszc_incremental_fallback_screenshot_plus_official_create_contract";

export const JSZC_FALLBACK_BUDGET = 66666;
export const JSZC_FALLBACK_BID = 366;
export const JSZC_FALLBACK_ROI_GOAL = 0.16;
export const JSZC_FALLBACK_GENDER = "GENDER_MALE";
export const JSZC_FALLBACK_AGES = Object.freeze([
  "AGE_BETWEEN_18_23",
  "AGE_BETWEEN_24_30",
  "AGE_BETWEEN_31_40",
  "AGE_BETWEEN_41_49",
  "AGE_ABOVE_50"
]);
export const JSZC_FALLBACK_CALL_TO_ACTION_BUTTONS = Object.freeze([
  "立即试玩",
  "打开游戏",
  "点击即玩",
  "进入游戏",
  "无需下载"
]);

const scheduleDay = (startHour) => `${"0".repeat(startHour * 2)}${"1".repeat((24 - startHour) * 2)}`;
export const JSZC_FALLBACK_SCHEDULE_TIME = [
  scheduleDay(9),
  scheduleDay(9),
  scheduleDay(9),
  scheduleDay(10),
  scheduleDay(9),
  scheduleDay(0),
  scheduleDay(0)
].join("");
export const JSZC_FALLBACK_SCHEDULE_TIME_DIGEST = "9e35339db1e951fd0c5b2de1908de02d1ff0d67243145c05ec195b15236c9594";

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
  incrementalFallback: Object.freeze({
    budget: JSZC_FALLBACK_BUDGET,
    bid: JSZC_FALLBACK_BID,
    roiGoal: JSZC_FALLBACK_ROI_GOAL,
    gender: JSZC_FALLBACK_GENDER,
    ages: JSZC_FALLBACK_AGES,
    callToActionButtons: JSZC_FALLBACK_CALL_TO_ACTION_BUTTONS,
    scheduleType: "SCHEDULE_FROM_NOW",
    scheduleTimeLength: 336,
    scheduleTimeDigest: JSZC_FALLBACK_SCHEDULE_TIME_DIGEST,
    minimumDmpExclusions: 10
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
export const JSZC_SUCCESS_PROFILE_GOLDEN_FIELD_SHAPE_HASH = "sha256:47bdf25b99339c610e31e9f54a9a6d4cf8c142b01bebfecb0ff843c4f866f464";
export const JSZC_SUCCESS_PROFILE_GOLDEN_LEDGER_PATH_COUNT = 92;
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

function sameArray(left, right) {
  return Array.isArray(left) && Array.isArray(right) &&
    left.length === right.length && left.every((value, index) => value === right[index]);
}

export function evaluateJsZcScheduleTime(value) {
  const scheduleTime = clean(value);
  const digest = hashValue(scheduleTime).replace(/^sha256:/, "");
  const valid = scheduleTime.length === 336 && /^[01]{336}$/.test(scheduleTime) &&
    scheduleTime === JSZC_FALLBACK_SCHEDULE_TIME && digest === JSZC_FALLBACK_SCHEDULE_TIME_DIGEST;
  return {
    status: valid ? "passed" : "blocked",
    present: Boolean(scheduleTime),
    length: scheduleTime.length,
    binary: /^[01]+$/.test(scheduleTime),
    digest,
    digestMatches: digest === JSZC_FALLBACK_SCHEDULE_TIME_DIGEST,
    exactScheduleMatches: scheduleTime === JSZC_FALLBACK_SCHEDULE_TIME,
    rawValueStored: false
  };
}

export function configuredJsZcSuccessProfile(bundle = {}) {
  const contract = bundle.defaults?.raw_defaults?.official_create_field_contract || {};
  const nestedRules = contract.nested_rules || {};
  const groups = nestedRules.groups || {};
  const audience = groups.audience || {};
  const externalUrl = groups["project_materials.external_url_material_list"] || {};
  const profile = contract.success_profile || {};
  const payloadDefaults = bundle.defaults?.raw_defaults?.payload_defaults || {};
  const routeSchedule = bundle.defaults?.schedule || {};
  const scheduleTime = clean(payloadDefaults.schedule?.schedule_time);
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
    scheduleTimeDigest: clean(profile.schedule_time_digest),
    configuredScheduleDigest: clean(routeSchedule.schedule_time_digest),
    scheduleTimeValidation: evaluateJsZcScheduleTime(scheduleTime),
    fallbackDefaultsMatch: Number(bundle.defaults?.budget) === JSZC_FALLBACK_BUDGET &&
      Number(bundle.defaults?.bid) === JSZC_FALLBACK_BID &&
      Number(bundle.defaults?.roi_goal) === JSZC_FALLBACK_ROI_GOAL &&
      clean(payloadDefaults.schedule?.schedule_type) === "SCHEDULE_FROM_NOW" &&
      clean(payloadDefaults.targeting?.gender) === JSZC_FALLBACK_GENDER &&
      sameArray(payloadDefaults.targeting?.age, JSZC_FALLBACK_AGES) &&
      sameArray(payloadDefaults.product?.call_to_action_buttons, JSZC_FALLBACK_CALL_TO_ACTION_BUTTONS),
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
    ...(configured.externalUrlMaterialListRequiredCount === 1 ? [] : ["jszc_external_url_material_list_required_count_mismatch"]),
    ...(configured.scheduleTimeDigest === JSZC_FALLBACK_SCHEDULE_TIME_DIGEST ? [] : ["jszc_success_profile_schedule_digest_mismatch"]),
    ...(configured.configuredScheduleDigest === JSZC_FALLBACK_SCHEDULE_TIME_DIGEST ? [] : ["jszc_route_schedule_digest_mismatch"]),
    ...(configured.scheduleTimeValidation.status === "passed" ? [] : ["jszc_schedule_time_contract_mismatch"]),
    ...(configured.fallbackDefaultsMatch ? [] : ["jszc_incremental_fallback_defaults_mismatch"])
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
    scheduleTimeDigest: result.scheduleTimeDigest || "",
    configuredScheduleDigest: result.configuredScheduleDigest || "",
    scheduleTimeValidation: {
      status: result.scheduleTimeValidation?.status || "blocked",
      present: result.scheduleTimeValidation?.present === true,
      length: Number(result.scheduleTimeValidation?.length || 0),
      binary: result.scheduleTimeValidation?.binary === true,
      digest: result.scheduleTimeValidation?.digest || "",
      digestMatches: result.scheduleTimeValidation?.digestMatches === true,
      exactScheduleMatches: result.scheduleTimeValidation?.exactScheduleMatches === true,
      rawValueStored: false
    },
    fallbackDefaultsMatch: result.fallbackDefaultsMatch === true,
    blockers: Array.isArray(result.blockers) ? result.blockers : [],
    rawPayloadStored: false
  };
}
