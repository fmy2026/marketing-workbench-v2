import { SELLING_POINTS_CONTRACT, evaluateSellingPointsContract } from "./05-selling-points-contract.mjs";
import { TITLE_MATERIAL_CONTRACT, evaluateTitleMaterialPayloadList } from "./05-title-materials-contract.mjs";

export const NESTED_FIELD_CONTRACT = Object.freeze({
  ruleVersion: "2026-08-30.oe3-std-project-create-nested-fields-v3",
  source: "postgres:mwb.game_route_defaults.raw_defaults.official_create_field_contract.nested_rules",
  officialCreateRef: "open.oceanengine.com-3.0-waibugei/巨量营销智擎版/创建标准项目.md:142"
});

const REQUIRED_NESTED_RULE_GROUPS = Object.freeze([
  "project_materials.video_material_list",
  "project_materials.image_material_list",
  "project_materials.external_url_material_list",
  "project_materials.product_info",
  "project_materials.call_to_action_buttons",
  "project_materials.source",
  "project_materials.anchor_related_type",
  "project_materials.mini_program_info",
  "track_url_setting",
  "audience",
  "brand_info"
]);

const VIDEO_IMAGE_MODES = new Set(["CREATIVE_IMAGE_MODE_VIDEO", "CREATIVE_IMAGE_MODE_VIDEO_VERTICAL"]);
const HIDE_IF_CONVERTED_VALUES = new Set([
  "NO_EXCLUDE",
  "EXCLUDE_CLICK",
  "EXCLUDE_CONVERT",
  "EXCLUDE_APP",
  "EXCLUDE_CUSTOMER"
]);

function clean(value) {
  return String(value ?? "").trim();
}

function unicodeLength(value) {
  return [...String(value ?? "")].length;
}

function present(value) {
  return value !== undefined && value !== null && value !== "" && (!Array.isArray(value) || value.length > 0);
}

function resourceReady(item = {}) {
  const readonlyStatus = clean(item.metadata?.readonly_check?.status);
  const productImageReadback = item.resource_type === "product_image" &&
    clean(item.metadata?.product_image_target_upload_readback?.status) === "passed" &&
    item.metadata?.product_image_target_upload_readback?.image_id_present === true &&
    item.metadata?.product_image_target_upload_readback?.material_id_present === true;
  return item.visibility_status === "visible" &&
    (item.readback_status === "readback_verified" || item.readback_status === "not_required") &&
    (
      !readonlyStatus ||
      ["passed", "passed_by_manual_confirmation"].includes(readonlyStatus) ||
      productImageReadback
    );
}

function resource(bundle = {}, type) {
  return (bundle.resources || []).find((item) => item.resource_type === type) || {};
}

function resourceBySourceAsset(bundle = {}, type, sourceAssetId = "") {
  return (bundle.resources || [])
    .filter((item) => item.resource_type === type)
    .find((item) => clean(item.source_asset_id) === clean(sourceAssetId)) || {};
}

function routePayloadDefaults(bundle = {}) {
  return bundle.defaults?.raw_defaults?.payload_defaults || {};
}

function nestedRules(bundle = {}) {
  const raw = bundle.defaults?.raw_defaults?.official_create_field_contract?.nested_rules;
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
}

function nestedRuleVersion(rules = {}) {
  return clean(rules.version || NESTED_FIELD_CONTRACT.ruleVersion);
}

function nestedRuleSource(rules = {}) {
  return clean(rules.source || NESTED_FIELD_CONTRACT.source);
}

function nestedGroupRule(rules = {}, group) {
  const groups = rules.groups && typeof rules.groups === "object" && !Array.isArray(rules.groups)
    ? rules.groups
    : {};
  const rule = groups[group];
  return rule && typeof rule === "object" && !Array.isArray(rule) ? rule : {};
}

function nestedSendPolicy(rules = {}, group, fallback = "send") {
  return clean(nestedGroupRule(rules, group).send_policy || fallback);
}

function nestedFieldPolicy(rules = {}, group, fieldPolicy, fallback = "") {
  return clean(nestedGroupRule(rules, group)[fieldPolicy] || fallback);
}

function addCheck(checks, {
  group,
  path,
  passed,
  rule,
  blockerCode,
  actual = {}
}) {
  checks.push({
    group,
    path,
    status: passed ? "passed" : "blocked",
    rule,
    blockerCode: passed ? "" : blockerCode,
    actual
  });
}

function requiredVideoEntries(bundle = {}) {
  const entries = Array.isArray(bundle.materialPack?.items) ? bundle.materialPack.items : [];
  return entries
    .filter((entry) => clean(entry?.item?.item_type) === "video_asset" && entry?.item?.required === true)
    .map((entry) => {
      const sourceAssetId = clean(entry.item?.asset_id || entry.asset?.asset_id);
      const resourceItem = resourceBySourceAsset(bundle, "video_asset", sourceAssetId);
      const readonly = resourceItem.metadata?.readonly_check || {};
      const finalReadiness = resourceItem.metadata?.final_material_readiness || {};
      return {
        sourceAssetId,
        expectedVideoId: clean(entry.asset?.metadata?.video_id || entry.asset?.metadata?.platform_video_id),
        expectedCoverId: clean(entry.asset?.metadata?.video_cover_id || entry.asset?.metadata?.cover_id),
        coverMode: clean(readonly.cover_mode || finalReadiness.cover_mode || "not_checked"),
        videoIdPresent: readonly.video_id_present === true,
        evidenceRefPresent: Boolean(clean(readonly.evidence_refs?.[0] || finalReadiness.evidence_ref)),
        ready: Boolean(sourceAssetId) &&
          resourceReady(resourceItem) &&
          ["passed", "passed_by_manual_confirmation"].includes(clean(readonly.status)) &&
          readonly.video_id_present === true
      };
    });
}

function expectedRouteArray(defaults = {}, path) {
  const value = path.split(".").reduce((cursor, key) => cursor?.[key], defaults);
  return Array.isArray(value) ? value.map(clean).filter(Boolean) : [];
}

function sameArray(left = [], right = []) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function stringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && clean(item));
}

function integerArray(value) {
  return Array.isArray(value) && value.every((item) => Number.isInteger(item));
}

function lengthRange(lengths = []) {
  const numeric = lengths.filter((value) => Number.isFinite(value));
  return {
    minChars: numeric.length ? Math.min(...numeric) : 0,
    maxChars: numeric.length ? Math.max(...numeric) : 0
  };
}

function evaluateRuleCoverage({ rules = {}, checks = [] } = {}) {
  const groups = rules.groups && typeof rules.groups === "object" && !Array.isArray(rules.groups)
    ? rules.groups
    : {};
  const missingGroups = REQUIRED_NESTED_RULE_GROUPS.filter((group) => !groups[group]);
  missingGroups.forEach((group) => addCheck(checks, {
    group: "nested_rules",
    path: group,
    passed: false,
    rule: "configured_nested_rule_group_present",
    blockerCode: `nested_field_rule_missing:${group}`,
    actual: { configured: false }
  }));
  addCheck(checks, {
    group: "nested_rules",
    path: "official_create_field_contract.nested_rules",
    passed: missingGroups.length === 0 && nestedRuleVersion(rules) === NESTED_FIELD_CONTRACT.ruleVersion,
    rule: `version:${NESTED_FIELD_CONTRACT.ruleVersion}`,
    blockerCode: "nested_field_contract_rules_missing_or_version_mismatch",
    actual: {
      configuredGroupCount: Object.keys(groups).length,
      missingGroupCount: missingGroups.length,
      ruleVersion: nestedRuleVersion(rules)
    }
  });
}

export function evaluateNestedFieldContract({
  payload = {},
  bundle = {},
  materialReadiness = {},
  backupLandingPage = {},
  miniProgramLaunchLink = {}
} = {}) {
  const checks = [];
  const rules = nestedRules(bundle);
  const defaults = routePayloadDefaults(bundle);
  const materials = payload.project_materials || {};
  const microGameByteGame = clean(payload.landing_type) === "MICRO_GAME" && clean(payload.delivery_medium) === "BYTE_GAME";
  evaluateRuleCoverage({ rules, checks });

  const requiredVideos = requiredVideoEntries(bundle);
  const videoList = Array.isArray(materials.video_material_list) ? materials.video_material_list : [];
  addCheck(checks, {
    group: "video_materials",
    path: "project_materials.video_material_list",
    passed: requiredVideos.length > 0 && videoList.length === requiredVideos.length,
    rule: "sent_video_count_matches_required_video_assets",
    blockerCode: "nested_video_material_required_count_mismatch",
    actual: { payloadCount: videoList.length, requiredVideoCount: requiredVideos.length }
  });
  videoList.forEach((item, index) => {
    const expected = requiredVideos[index] || {};
    const coverShouldSend = expected.coverMode === "explicit_cover_verified";
    const coverShouldOmit = expected.coverMode === "platform_default_cover_allowed";
    addCheck(checks, {
      group: "video_materials",
      path: `project_materials.video_material_list[${index}].image_mode`,
      passed: VIDEO_IMAGE_MODES.has(clean(item.image_mode)) && clean(item.image_mode) === "CREATIVE_IMAGE_MODE_VIDEO_VERTICAL",
      rule: "image_mode_is_official_vertical_video_enum_for_current_route",
      blockerCode: `nested_video_image_mode_invalid:${index}`,
      actual: { enumValue: clean(item.image_mode), expected: "CREATIVE_IMAGE_MODE_VIDEO_VERTICAL" }
    });
    addCheck(checks, {
      group: "video_materials",
      path: `project_materials.video_material_list[${index}].video_id`,
      passed: Boolean(clean(item.video_id)) && clean(item.video_id) === clean(expected.expectedVideoId) && expected.ready === true,
      rule: "video_id_from_required_material_pack_asset_with_target_readonly_evidence",
      blockerCode: `nested_video_id_source_not_verified:${index}`,
      actual: {
        present: Boolean(clean(item.video_id)),
        expectedMatch: Boolean(clean(item.video_id) && clean(item.video_id) === clean(expected.expectedVideoId)),
        sourceReady: expected.ready === true,
        evidenceRefPresent: expected.evidenceRefPresent === true
      }
    });
    addCheck(checks, {
      group: "video_materials",
      path: `project_materials.video_material_list[${index}].video_cover_id`,
      passed: (coverShouldSend && Boolean(clean(item.video_cover_id)) && clean(item.video_cover_id) === clean(expected.expectedCoverId)) ||
        (coverShouldOmit && !Object.hasOwn(item, "video_cover_id")),
      rule: "cover_sent_only_when_explicit_cover_verified_otherwise_platform_default_cover",
      blockerCode: `nested_video_cover_contract_invalid:${index}`,
      actual: {
        coverMode: expected.coverMode || "not_checked",
        coverSent: Object.hasOwn(item, "video_cover_id"),
        expectedExplicitCover: coverShouldSend,
        platformDefaultCoverAllowed: coverShouldOmit
      }
    });
  });

  const imageMaterialList = materials.image_material_list;
  addCheck(checks, {
    group: "image_material_list",
    path: "project_materials.image_material_list",
    passed: Array.isArray(imageMaterialList) && imageMaterialList.length === 0,
    rule: "current_jszc_route_sends_empty_image_material_list",
    blockerCode: "nested_image_material_list_must_be_empty_for_current_route",
    actual: {
      present: Object.hasOwn(materials, "image_material_list"),
      count: Array.isArray(imageMaterialList) ? imageMaterialList.length : 0,
      source: "route_nested_contract"
    }
  });

  const externalUrlPolicy = nestedSendPolicy(rules, "project_materials.external_url_material_list", "send");
  const externalUrlListPresent = Object.hasOwn(materials, "external_url_material_list");
  const externalUrlList = materials.external_url_material_list;
  addCheck(checks, {
    group: "external_url_material_list",
    path: "project_materials.external_url_material_list",
    passed: externalUrlPolicy === "omit"
      ? !externalUrlListPresent
      : Array.isArray(externalUrlList) && externalUrlList.length === 1 && backupLandingPage.ready === true,
    rule: externalUrlPolicy === "omit"
      ? "current_jszc_route_omits_external_url_material_list"
      : "send_only_when_backup_landing_page_ready",
    blockerCode: externalUrlPolicy === "omit"
      ? "nested_external_url_material_list_must_be_omitted_for_current_route"
      : "nested_external_url_material_list_contract_invalid",
    actual: {
      sendPolicy: externalUrlPolicy || "missing",
      present: externalUrlListPresent,
      count: Array.isArray(externalUrlList) ? externalUrlList.length : 0,
      backupLandingPageReady: backupLandingPage.ready === true,
      rawUrlStoredInManifest: false
    }
  });

  const productInfo = materials.product_info || {};
  const productTitles = productInfo.titles;
  const expectedProductTitle = clean(bundle.game?.product_name || bundle.game?.game_name || "产品");
  const productTitleLengths = Array.isArray(productTitles) ? productTitles.map(unicodeLength) : [];
  const productTitleRange = lengthRange(productTitleLengths);
  addCheck(checks, {
    group: "product_info",
    path: "project_materials.product_info.titles",
    passed: Array.isArray(productTitles) &&
      productTitles.length === 1 &&
      typeof productTitles[0] === "string" &&
      clean(productTitles[0]) === expectedProductTitle &&
      productTitleLengths[0] >= 1 &&
      productTitleLengths[0] <= 20,
    rule: "single_product_name_from_game_identity_chars_1_20",
    blockerCode: "nested_product_titles_contract_invalid",
    actual: { count: Array.isArray(productTitles) ? productTitles.length : 0, ...productTitleRange, source: "game_identity" }
  });
  const productImage = resource(bundle, "product_image");
  const imageIds = productInfo.image_ids;
  addCheck(checks, {
    group: "product_info",
    path: "project_materials.product_info.image_ids",
    passed: stringArray(imageIds) &&
      imageIds.length >= 1 &&
      imageIds.length <= 10 &&
      imageIds.includes(clean(productImage.platform_resource_id)) &&
      resourceReady(productImage),
    rule: "image_ids_count_1_10_from_verified_target_product_image",
    blockerCode: "nested_product_image_ids_source_not_verified",
    actual: {
      count: Array.isArray(imageIds) ? imageIds.length : 0,
      stringArray: stringArray(imageIds),
      productImageReady: resourceReady(productImage)
    }
  });
  const selling = evaluateSellingPointsContract(productInfo.selling_points, {
    blockerPrefix: "nested_product_selling_points"
  });
  addCheck(checks, {
    group: "product_info",
    path: "project_materials.product_info.selling_points",
    passed: selling.status === "passed",
    rule: `selling_points_count_${SELLING_POINTS_CONTRACT.minItems}_${SELLING_POINTS_CONTRACT.maxItems}_chars_${SELLING_POINTS_CONTRACT.minChars}_${SELLING_POINTS_CONTRACT.maxChars}`,
    blockerCode: selling.blockers[0] || "nested_product_selling_points_invalid",
    actual: { count: selling.count, minChars: selling.minChars, maxChars: selling.maxChars }
  });

  const title = evaluateTitleMaterialPayloadList(materials.title_material_list, {
    blockerPrefix: "nested_title_material"
  });
  addCheck(checks, {
    group: "title_materials",
    path: "project_materials.title_material_list",
    passed: title.status === "passed",
    rule: `title_material_count_${TITLE_MATERIAL_CONTRACT.minItems}_${TITLE_MATERIAL_CONTRACT.maxItems}_chars_${TITLE_MATERIAL_CONTRACT.minChars}_${TITLE_MATERIAL_CONTRACT.maxChars}`,
    blockerCode: title.blockers[0] || "nested_title_material_invalid",
    actual: { count: title.count, minChars: title.minChars, maxChars: title.maxChars }
  });

  const cta = materials.call_to_action_buttons;
  const ctaLengths = Array.isArray(cta) ? cta.map(unicodeLength) : [];
  const ctaRange = lengthRange(ctaLengths);
  const expectedCta = expectedRouteArray(defaults, "product.call_to_action_buttons");
  addCheck(checks, {
    group: "call_to_action",
    path: "project_materials.call_to_action_buttons",
    passed: Array.isArray(cta) &&
      cta.length >= 1 &&
      cta.length <= 10 &&
      cta.every((item) => typeof item === "string" && unicodeLength(clean(item)) >= 2 && unicodeLength(clean(item)) <= 4) &&
      sameArray(cta.map(clean), expectedCta),
    rule: "route_default_cta_count_1_10_chars_2_4",
    blockerCode: "nested_call_to_action_contract_invalid",
    actual: { count: Array.isArray(cta) ? cta.length : 0, ...ctaRange, source: "route_defaults" }
  });

  const expectedSource = clean(bundle.game?.brand_name || bundle.game?.game_name || "产品").slice(0, 10);
  const sourceLength = unicodeLength(clean(materials.source));
  addCheck(checks, {
    group: "source",
    path: "project_materials.source",
    passed: clean(materials.source) === expectedSource && sourceLength >= 2 && sourceLength <= 10,
    rule: "source_from_game_identity_chars_2_10",
    blockerCode: "nested_source_contract_invalid",
    actual: { present: present(materials.source), chars: sourceLength, source: "game_identity" }
  });

  addCheck(checks, {
    group: "anchor",
    path: "project_materials.anchor_related_type",
    passed: clean(materials.anchor_related_type) === "OFF" &&
      !Object.hasOwn(materials, "anchor_material_list") &&
      !Object.hasOwn(materials, "component_material_list"),
    rule: "current_jszc_route_anchor_related_type_off_without_anchor_or_component_materials",
    blockerCode: clean(materials.anchor_related_type) === "SELECT"
      ? "nested_anchor_select_requires_readonly_contract"
      : "nested_anchor_contract_invalid",
    actual: {
      anchorRelatedType: clean(materials.anchor_related_type),
      anchorMaterialListPresent: Object.hasOwn(materials, "anchor_material_list"),
      componentMaterialListPresent: Object.hasOwn(materials, "component_material_list")
    }
  });

  const mini = materials.mini_program_info || {};
  const miniKeys = Object.keys(mini).sort();
  addCheck(checks, {
    group: "mini_program_info",
    path: "project_materials.mini_program_info",
    passed: !microGameByteGame || (
      miniKeys.length === 1 &&
      miniKeys[0] === "url" &&
      /^sslocal:\/\/microgame/.test(clean(mini.url)) &&
      miniProgramLaunchLink.ready === true &&
      miniProgramLaunchLink.checks?.hashMatch === true &&
      miniProgramLaunchLink.checks?.appIdMatch === true
    ),
    rule: "micro_game_byte_game_sends_only_controlled_url_no_app_id_start_path_params",
    blockerCode: "nested_mini_program_info_contract_invalid",
    actual: {
      microGameByteGame,
      keyShape: miniKeys.join(","),
      launchLinkReady: miniProgramLaunchLink.ready === true,
      hashMatch: miniProgramLaunchLink.checks?.hashMatch === true,
      appIdMatch: miniProgramLaunchLink.checks?.appIdMatch === true
    }
  });

  const trackUrls = payload.track_url_setting?.action_track_url;
  addCheck(checks, {
    group: "track_url_setting",
    path: "track_url_setting",
    passed: clean(payload.track_url_setting?.send_type) === "SERVER_SEND" &&
      Array.isArray(trackUrls) &&
      trackUrls.length === 1 &&
      /^https:\/\//.test(clean(trackUrls[0])),
    rule: "server_send_single_controlled_touchpoint_url",
    blockerCode: "nested_track_url_setting_contract_invalid",
    actual: {
      sendType: clean(payload.track_url_setting?.send_type),
      urlCount: Array.isArray(trackUrls) ? trackUrls.length : 0,
      urlStoredInManifest: false
    }
  });

  const audience = payload.audience || {};
  const filterEventPolicy = nestedFieldPolicy(rules, "audience", "filter_event_policy", "missing");
  const filterEventPresent = Object.hasOwn(audience, "filter_event");
  const filterEventOmittedByContract = filterEventPolicy === "omit" && !filterEventPresent;
  addCheck(checks, {
    group: "audience",
    path: "audience",
    passed: clean(audience.gender) === "GENDER_UNLIMITED" &&
      HIDE_IF_CONVERTED_VALUES.has(clean(audience.hide_if_converted)) &&
      clean(audience.hide_if_converted) !== clean(payload.external_action) &&
      clean(audience.hide_if_converted) === "NO_EXCLUDE" &&
      filterEventPolicy === "omit" &&
      filterEventOmittedByContract &&
      integerArray(audience.retargeting_tags_exclude) &&
      audience.retargeting_tags_exclude.length > 0,
    rule: "no_exclude_requires_filter_event_omitted_and_route_audience_fields_valid",
    blockerCode: "nested_audience_contract_invalid",
    actual: {
      gender: clean(audience.gender),
      hideIfConverted: clean(audience.hide_if_converted),
      filterEventPolicy,
      filterEventPresent,
      filterEventOmittedByContract,
      dmpCount: Array.isArray(audience.retargeting_tags_exclude) ? audience.retargeting_tags_exclude.length : 0,
      dmpIntegerArray: integerArray(audience.retargeting_tags_exclude)
    }
  });

  const brand = payload.brand_info || {};
  addCheck(checks, {
    group: "brand_info",
    path: "brand_info",
    passed: Number.isInteger(brand.brand_name_id) &&
      Number.isInteger(brand.cdp_brand_id) &&
      typeof brand.cdp_brand_name === "string" &&
      clean(brand.cdp_brand_name) &&
      Number.isInteger(brand.yuntu_category_id),
    rule: "sent_brand_info_ids_are_integers_and_name_present_from_target_readonly_evidence",
    blockerCode: "nested_brand_info_contract_invalid",
    actual: {
      brandNameIdPresent: Number.isInteger(brand.brand_name_id),
      cdpBrandIdPresent: Number.isInteger(brand.cdp_brand_id),
      cdpBrandNamePresent: Boolean(clean(brand.cdp_brand_name)),
      yuntuCategoryIdPresent: Number.isInteger(brand.yuntu_category_id)
    }
  });

  const blocked = checks.filter((item) => item.status === "blocked");
  const coverModes = [...new Set(requiredVideos.map((item) => item.coverMode).filter(Boolean))];
  return {
    status: blocked.length ? "blocked" : "passed",
    ruleVersion: nestedRuleVersion(rules),
    source: nestedRuleSource(rules),
    checkedPathCount: checks.length,
    passedCount: checks.length - blocked.length,
    blockerCount: blocked.length,
    blockers: blocked.map((item) => item.blockerCode).filter(Boolean),
    checkedGroups: [...new Set(checks.map((item) => item.group))],
    sourceCategories: ["material_pack", "target_readonly_resources", "route_defaults", "game_identity", "controlled_links"],
    quantityRanges: {
      videoMaterialCount: videoList.length,
      productImageCount: Array.isArray(imageIds) ? imageIds.length : 0,
      titleMaterialCount: title.count,
      imageMaterialCount: Array.isArray(imageMaterialList) ? imageMaterialList.length : 0,
      externalUrlMaterialCount: Array.isArray(externalUrlList) ? externalUrlList.length : 0,
      sellingPointCount: selling.count,
      ctaCount: Array.isArray(cta) ? cta.length : 0
    },
    lengthRanges: {
      productTitle: {
        minChars: productTitleRange.minChars,
        maxChars: productTitleRange.maxChars
      },
      titleMaterial: { minChars: title.minChars, maxChars: title.maxChars },
      sellingPoints: { minChars: selling.minChars, maxChars: selling.maxChars },
      cta: {
        minChars: ctaRange.minChars,
        maxChars: ctaRange.maxChars
      },
      source: { minChars: sourceLength, maxChars: sourceLength }
    },
    enumResults: {
      videoImageMode: videoList.every((item) => clean(item.image_mode) === "CREATIVE_IMAGE_MODE_VIDEO_VERTICAL"),
      imageMaterialListEmpty: Array.isArray(imageMaterialList) && imageMaterialList.length === 0,
      externalUrlMaterialListPolicy: externalUrlPolicy || "missing",
      externalUrlMaterialListOmitted: !externalUrlListPresent,
      anchorRelatedType: clean(materials.anchor_related_type),
      miniProgramUrlOnly: miniKeys.length === 1 && miniKeys[0] === "url",
      trackSendType: clean(payload.track_url_setting?.send_type),
      audienceGender: clean(audience.gender),
      hideIfConverted: clean(audience.hide_if_converted),
      filterEventPolicy,
      filterEventPresent
    },
    videoCoverMode: coverModes.length ? coverModes.join("+") : "not_checked",
    videoEvidenceRefCount: requiredVideos.filter((item) => item.evidenceRefPresent).length,
    materialReadinessStatus: clean(materialReadiness.status || "not_checked"),
    backupLandingPageReady: backupLandingPage.ready === true,
    externalUrlMaterialListPolicy: externalUrlPolicy || "missing",
    externalUrlMaterialListPresent: externalUrlListPresent,
    externalUrlMaterialListOmittedByContract: externalUrlPolicy === "omit" && !externalUrlListPresent,
    filterEventPolicy,
    filterEventPresent,
    filterEventOmittedByContract,
    miniProgramLaunchLinkReady: miniProgramLaunchLink.ready === true,
    rawPayloadStored: false
  };
}

export function nestedFieldContractManifest(result = {}) {
  return {
    status: result.status || "blocked",
    ruleVersion: result.ruleVersion || "",
    source: result.source || NESTED_FIELD_CONTRACT.source,
    checkedPathCount: Number(result.checkedPathCount || 0),
    passedCount: Number(result.passedCount || 0),
    blockerCount: Number(result.blockerCount || 0),
    blockers: Array.isArray(result.blockers) ? result.blockers : [],
    checkedGroups: Array.isArray(result.checkedGroups) ? result.checkedGroups : [],
    sourceCategories: Array.isArray(result.sourceCategories) ? result.sourceCategories : [],
    quantityRanges: result.quantityRanges || {},
    lengthRanges: result.lengthRanges || {},
    enumResults: result.enumResults || {},
    videoCoverMode: result.videoCoverMode || "not_checked",
    videoEvidenceRefCount: Number(result.videoEvidenceRefCount || 0),
    materialReadinessStatus: result.materialReadinessStatus || "not_checked",
    backupLandingPageReady: result.backupLandingPageReady === true,
    externalUrlMaterialListPolicy: result.externalUrlMaterialListPolicy || "",
    externalUrlMaterialListPresent: result.externalUrlMaterialListPresent === true,
    externalUrlMaterialListOmittedByContract: result.externalUrlMaterialListOmittedByContract === true,
    filterEventPolicy: result.filterEventPolicy || "",
    filterEventPresent: result.filterEventPresent === true,
    filterEventOmittedByContract: result.filterEventOmittedByContract === true,
    miniProgramLaunchLinkReady: result.miniProgramLaunchLinkReady === true,
    rawPayloadStored: false
  };
}
