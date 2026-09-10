import { hashValue } from "./00-contracts.mjs";
import { canonicalGuideVideoReadiness } from "./04-resource-verifiers.mjs";

export const JSZC_SUCCESS_PROFILE_VERSION = "2026-09-09.jszc-byte-game-comment-management-enabled-v3";
export const JSZC_NESTED_FIELD_CONTRACT_VERSION = "2026-09-08.oe3-std-project-create-nested-fields-v6";
export const JSZC_SUCCESS_PROFILE_SOURCE = "jszc_incremental_fallback_plus_official_comment_management_contract";

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
    minimumDmpExclusions: 10,
    commentManagement: "ON"
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
export const JSZC_SUCCESS_PROFILE_GOLDEN_FIELD_SHAPE_HASH = "sha256:e2fd4ac63467eeda4b72064ea751a23bedf71b927e3c4e462ae5a7e4cbd1a844";
export const JSZC_SUCCESS_PROFILE_GOLDEN_LEDGER_PATH_COUNT = 92;
export const JSZC_GUIDE_VIDEO_GOLDEN_FIELD_SHAPE_HASH = "sha256:98ee03c08b3252ad83a8f66a3cc6d64c4a609cc643240b0de06d541fef1207fe";
export const JSZC_GUIDE_VIDEO_GOLDEN_LEDGER_PATH_COUNT = 94;
export const JSZC_VIDEO_COVER_GUIDE_VIDEO_GOLDEN_FIELD_SHAPE_HASH = "sha256:9a1f104f75a724c214b36e6c8b4cf6334b195d10932f0c295eec86c5f02d4d2f";
export const JSZC_VIDEO_COVER_GUIDE_VIDEO_GOLDEN_LEDGER_PATH_COUNT = 96;
export const JSZC_SUCCESS_PROFILE_GOLDEN_MATERIAL_COUNTS = Object.freeze({
  videoMaterialList: 2,
  titleMaterialList: 3,
  imageMaterialList: 0,
  productImageIds: 1,
  externalUrlMaterialList: 1,
  dmpExclusions: 10
});

const BRAND_OMITTED_LEDGER_PATHS = Object.freeze([
  "brand_info",
  "brand_info.brand_name_id",
  "brand_info.cdp_brand_id",
  "brand_info.cdp_brand_name",
  "brand_info.yuntu_category_id"
]);

const BRAND_SENT_LEDGER_SHAPES = Object.freeze([
  { path: "brand_info.brand_name_id", valueType: "number" },
  { path: "brand_info.cdp_brand_id", valueType: "number" },
  { path: "brand_info.cdp_brand_name", valueType: "string" },
  { path: "brand_info.yuntu_category_id", valueType: "number" }
]);

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
  const guideVideoRequired = canonicalGuideVideoReadiness(bundle).required === true;
  const videoCoverRequired = bundle.account?.video_cover_required === true;
  const selectedGoldenFieldShapeHash = videoCoverRequired
    ? JSZC_VIDEO_COVER_GUIDE_VIDEO_GOLDEN_FIELD_SHAPE_HASH
    : guideVideoRequired
      ? JSZC_GUIDE_VIDEO_GOLDEN_FIELD_SHAPE_HASH
      : JSZC_SUCCESS_PROFILE_GOLDEN_FIELD_SHAPE_HASH;
  const selectedLedgerPathCount = videoCoverRequired
    ? JSZC_VIDEO_COVER_GUIDE_VIDEO_GOLDEN_LEDGER_PATH_COUNT
    : guideVideoRequired
      ? JSZC_GUIDE_VIDEO_GOLDEN_LEDGER_PATH_COUNT
      : JSZC_SUCCESS_PROFILE_GOLDEN_LEDGER_PATH_COUNT;
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
    configuredGoldenFieldShapeHash: configured.goldenFieldShapeHash,
    configuredExpectedLedgerPathCount: configured.expectedLedgerPathCount,
    goldenFieldShapeHash: selectedGoldenFieldShapeHash,
    expectedLedgerPathCount: selectedLedgerPathCount,
    guideVideoRequired,
    guideVideoPolicy: guideVideoRequired ? "fresh_gameplay_readonly" : "omit",
    videoCoverRequired,
    videoCoverPolicy: videoCoverRequired ? "required_explicit_current_job_readonly" : "optional_platform_default",
    blockers,
    rawPayloadStored: false
  };
}

function ledgerShape(entry = {}) {
  return {
    path: entry.path || "",
    group: entry.group || "",
    sendPolicy: entry.sendPolicy || "",
    valueType: entry.valueType || "",
    itemCount: entry.itemCount ?? null,
    enumRule: Array.isArray(entry.enumRule) ? entry.enumRule : [],
    enumMatched: entry.enumMatched ?? null,
    preCreateStatus: entry.preCreateStatus || ""
  };
}

function projectedSentBrandShape({ path, valueType }) {
  return {
    path,
    group: "brand",
    sendPolicy: "send",
    valueType,
    itemCount: null,
    enumRule: [],
    enumMatched: null,
    preCreateStatus: "passed"
  };
}

/**
 * Validates one narrow, approved deviation from the recorded JSZC success
 * shape. The Draft retains the factual five omitted brand paths; only this
 * in-memory comparison projects them back to the four historical send paths.
 */
export function evaluateJsZcFieldShapeCompatibility({
  createFieldLedger = {},
  successProfile = {},
  brandMode = ""
} = {}) {
  const entries = Array.isArray(createFieldLedger.entries) ? createFieldLedger.entries : [];
  const expectedHash = String(successProfile.goldenFieldShapeHash || "");
  const expectedCount = Number(successProfile.expectedLedgerPathCount || 0);
  const isTargetEmptyOmit = brandMode === "target_empty_omit_experiment";
  const brandEntries = entries.filter((entry) => entry.group === "brand");
  const exactOmittedBrandShape = isTargetEmptyOmit &&
    brandEntries.length === BRAND_OMITTED_LEDGER_PATHS.length &&
    BRAND_OMITTED_LEDGER_PATHS.every((path) => brandEntries.some((entry) =>
      entry.path === path &&
      entry.sendPolicy === "omit" &&
      entry.valueType === "absent" &&
      entry.itemCount === null &&
      Array.isArray(entry.enumRule) && entry.enumRule.length === 0 &&
      entry.enumMatched === null &&
      entry.preCreateStatus === "passed" && entry.rawValueStored === false
    ));
  const projectedShapes = isTargetEmptyOmit && exactOmittedBrandShape
    ? [
        ...[
          ...entries.filter((entry) => entry.group !== "brand" && entry.sendPolicy !== "omit").map(ledgerShape),
          ...BRAND_SENT_LEDGER_SHAPES.map(projectedSentBrandShape)
        ].sort((left, right) => left.path.localeCompare(right.path)),
        ...entries.filter((entry) => entry.group !== "brand" && entry.sendPolicy === "omit").map(ledgerShape)
      ]
    : entries.map(ledgerShape);
  const comparativeShapeHash = hashValue(projectedShapes);
  const comparativeEntryCount = projectedShapes.length;
  const blockers = [
    ...(!expectedHash ? ["jszc_success_profile_expected_shape_missing"] : []),
    ...(expectedCount < 1 ? ["jszc_success_profile_expected_ledger_count_missing"] : []),
    ...(isTargetEmptyOmit && !exactOmittedBrandShape ? ["target_empty_brand_omit_ledger_shape_invalid"] : []),
    ...(comparativeShapeHash !== expectedHash ? ["jszc_success_profile_field_shape_mismatch"] : []),
    ...(comparativeEntryCount !== expectedCount ? ["jszc_success_profile_ledger_path_count_mismatch"] : [])
  ];
  return {
    status: blockers.length ? "blocked" : "passed",
    mode: isTargetEmptyOmit ? "target_empty_omit_projection" : "strict_recorded_shape",
    actualEntryCount: entries.length,
    comparativeEntryCount,
    expectedEntryCount: expectedCount,
    actualFieldShapeHash: String(createFieldLedger.fieldShapeHash || ""),
    comparativeFieldShapeHash: comparativeShapeHash,
    expectedFieldShapeHash: expectedHash,
    exactOmittedBrandShape,
    blockers,
    rawPayloadStored: false
  };
}

export function jszcFieldShapeCompatibilityManifest(result = {}) {
  return {
    status: result.status || "blocked",
    mode: result.mode || "strict_recorded_shape",
    actualEntryCount: Number(result.actualEntryCount || 0),
    comparativeEntryCount: Number(result.comparativeEntryCount || 0),
    expectedEntryCount: Number(result.expectedEntryCount || 0),
    actualFieldShapeHash: result.actualFieldShapeHash || "",
    comparativeFieldShapeHash: result.comparativeFieldShapeHash || "",
    expectedFieldShapeHash: result.expectedFieldShapeHash || "",
    exactOmittedBrandShape: result.exactOmittedBrandShape === true,
    blockers: Array.isArray(result.blockers) ? result.blockers : [],
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
    configuredGoldenFieldShapeHash: result.configuredGoldenFieldShapeHash || result.goldenFieldShapeHash || "",
    configuredExpectedLedgerPathCount: Number(result.configuredExpectedLedgerPathCount || result.expectedLedgerPathCount || 0),
    guideVideoRequired: result.guideVideoRequired === true,
    guideVideoPolicy: result.guideVideoPolicy || "omit",
    videoCoverRequired: result.videoCoverRequired === true,
    videoCoverPolicy: result.videoCoverPolicy || "optional_platform_default",
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
