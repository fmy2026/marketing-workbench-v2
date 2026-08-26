import { hashValue } from "./contracts.mjs";
import {
  applyOfficialCreateFieldSendPolicy,
  evaluateOfficialCreateFieldEvidence,
  getOfficialCreateFieldContract,
  getInstanceIdCreateEvidence,
  instanceIdCreateEvidenceSummary,
  officialFieldEvidenceSummary
} from "./official-create-field-contract.mjs";

const REQUIRED_CREATE_FIELDS = [
  "advertiser_id",
  "name",
  "ad_type",
  "landing_type",
  "marketing_goal",
  "external_action",
  "native_type",
  "delivery_mode",
  "schedule_type",
  "bid_type",
  "budget_mode",
  "pricing",
  "audience_type",
  "audience",
  "project_materials",
  "track_url_setting",
  "brand_info"
];

const ALLOWED_HIDE_IF_CONVERTED = new Set([
  "NO_EXCLUDE",
  "EXCLUDE_CLICK",
  "EXCLUDE_CONVERT",
  "EXCLUDE_APP",
  "EXCLUDE_CUSTOMER"
]);

function clean(value) {
  return String(value ?? "").trim();
}

function intOrNull(value) {
  const text = clean(value);
  return /^\d+$/.test(text) ? Number(text) : null;
}

function safeIntOrNull(value) {
  const text = clean(value);
  if (!/^\d+$/.test(text)) return null;
  const number = Number(text);
  return Number.isSafeInteger(number) ? number : null;
}

function advertiserIdForTransport(value) {
  return safeIntOrNull(value);
}

function numberString(value) {
  const text = clean(value);
  return /^\d+$/.test(text) ? text : "";
}

function platformLongIdString(value) {
  return numberString(value);
}

function platformIdTransportLossless(value) {
  if (Number.isSafeInteger(value)) return true;
  return typeof value === "string" && /^\d+$/.test(value);
}

function sha256Hex(value) {
  return hashValue(String(value)).replace(/^sha256:/, "");
}

function resource(bundle = {}, type) {
  return (bundle.resources || []).find((item) => item.resource_type === type) || {};
}

function resourcesByType(bundle = {}, type) {
  return (bundle.resources || []).filter((item) => item.resource_type === type);
}

function resourceBySourceAsset(bundle = {}, type, sourceAssetId = "") {
  return resourcesByType(bundle, type).find((item) => clean(item.source_asset_id) === clean(sourceAssetId)) || {};
}

function resourceReady(item = {}) {
  const readonlyStatus = clean(item.metadata?.readonly_check?.status);
  return item.visibility_status === "visible" &&
    (item.readback_status === "readback_verified" || item.readback_status === "not_required") &&
    (!readonlyStatus || ["passed", "passed_by_manual_confirmation"].includes(readonlyStatus));
}

function metadataValue(source = {}, paths = []) {
  for (const dotted of paths) {
    let cursor = source;
    for (const part of dotted.split(".")) cursor = cursor?.[part];
    if (cursor !== undefined && cursor !== null && cursor !== "") return cursor;
  }
  return "";
}

function unique(values = []) {
  return [...new Set(values.map(clean).filter(Boolean))];
}

function routePayloadConfig(bundle = {}) {
  const raw = bundle.defaults?.raw_defaults || {};
  const payloadDefaults = raw.payload_defaults || {};
  return {
    payloadDefaults,
    contractMapping: payloadDefaults.contract_mapping || raw.contract_mapping || {}
  };
}

function nestedValue(source = {}, dotted = "") {
  return dotted.split(".").reduce((cursor, key) => cursor?.[key], source);
}

function requiredConfigValue(config = {}, dotted = "", blockers = []) {
  const value = nestedValue(config, dotted);
  const present = value !== undefined && value !== null && value !== "" && (!Array.isArray(value) || value.length > 0);
  if (!present) blockers.push(`route_payload_default_missing:${dotted}`);
  return value;
}

function configArray(config = {}, dotted = "", blockers = []) {
  const value = requiredConfigValue(config, dotted, blockers);
  return Array.isArray(value) ? value.map(clean).filter(Boolean) : [];
}

function configArrayAllowEmpty(config = {}, dotted = "", blockers = []) {
  const value = nestedValue(config, dotted);
  if (!Array.isArray(value)) blockers.push(`route_payload_default_missing:${dotted}`);
  return Array.isArray(value) ? value.map(clean).filter(Boolean) : [];
}

function titleMaterials(bundle = {}, payloadDefaults = {}) {
  const gameName = clean(bundle.game?.game_name || bundle.game?.product_name || "产品");
  const materialItems = Array.isArray(bundle.materialPack?.items) ? bundle.materialPack.items : [];
  const names = materialItems
    .map((entry) => clean(entry.asset?.asset_name))
    .filter((title) => title.length >= 5 && title.length <= 30);
  const configured = Array.isArray(payloadDefaults.product?.title_materials)
    ? payloadDefaults.product.title_materials
    : [];
  return unique([
    ...configured,
    `来${gameName}开荒`,
    `${gameName}福利开局`,
    ...names
  ]).slice(0, 30).map((title) => ({ title }));
}

function videoMaterials(bundle = {}) {
  const materialItems = Array.isArray(bundle.materialPack?.items) ? bundle.materialPack.items : [];
  return materialItems
    .filter((entry) => entry.item?.item_type === "video_asset" && entry.item?.required)
    .map((entry) => {
      const sourceAssetId = clean(entry.item?.asset_id || entry.asset?.asset_id);
      const resourceItem = resourceBySourceAsset(bundle, "video_asset", sourceAssetId);
      const coverMode = clean(resourceItem.metadata?.readonly_check?.cover_mode || resourceItem.metadata?.final_material_readiness?.cover_mode);
      const videoCoverId = clean(entry.asset?.metadata?.video_cover_id || entry.asset?.metadata?.cover_id || "");
      const item = {
        image_mode: "CREATIVE_IMAGE_MODE_VIDEO_VERTICAL",
        video_id: clean(entry.asset?.metadata?.video_id || entry.asset?.metadata?.platform_video_id || "")
      };
      if (coverMode === "explicit_cover_verified" && videoCoverId) {
        item.video_cover_id = videoCoverId;
      }
      return item;
    })
    .filter((item) => item.video_id);
}

function requiredVideoMaterialReadiness(bundle = {}) {
  const materialItems = Array.isArray(bundle.materialPack?.items) ? bundle.materialPack.items : [];
  const items = materialItems
    .filter((entry) => entry.item?.item_type === "video_asset" && entry.item?.required)
    .map((entry) => {
      const sourceAssetId = clean(entry.item?.asset_id || entry.asset?.asset_id);
      const resourceItem = resourceBySourceAsset(bundle, "video_asset", sourceAssetId);
      const readonlyStatus = clean(resourceItem.metadata?.readonly_check?.status);
      const coverMode = clean(resourceItem.metadata?.readonly_check?.cover_mode || resourceItem.metadata?.final_material_readiness?.cover_mode);
      const coverReady = ["explicit_cover_verified", "platform_default_cover_allowed"].includes(coverMode);
      const ready = sourceAssetId &&
        resourceReady(resourceItem) &&
        ["passed", "passed_by_manual_confirmation"].includes(readonlyStatus) &&
        resourceItem.metadata?.readonly_check?.video_id_present === true &&
        coverReady;
      return {
        sourceAssetId,
        videoIdPresent: Boolean(clean(entry.asset?.metadata?.video_id || entry.asset?.metadata?.platform_video_id)),
        videoCoverIdPresent: Boolean(clean(entry.asset?.metadata?.video_cover_id || entry.asset?.metadata?.cover_id)),
        coverMode: coverMode || "not_checked",
        readbackStatus: ready ? "readback_verified" : clean(resourceItem.readback_status || "missing"),
        readonlyStatus: ready ? "passed" : clean(readonlyStatus || "not_checked"),
        evidenceRef: clean(resourceItem.metadata?.readonly_check?.evidence_refs?.[0] || resourceItem.metadata?.final_material_readiness?.evidence_ref)
      };
    });
  const selectedRequiredVideoCount = items.length;
  const verifiedVideoCount = items.filter((item) => item.readbackStatus === "readback_verified").length;
  const coverReadyCount = items.filter((item) =>
    item.readbackStatus === "readback_verified" &&
    ["explicit_cover_verified", "platform_default_cover_allowed"].includes(item.coverMode)
  ).length;
  return {
    status: selectedRequiredVideoCount > 0 &&
      selectedRequiredVideoCount === verifiedVideoCount &&
      selectedRequiredVideoCount === coverReadyCount
      ? "passed"
      : "blocked",
    selectedRequiredVideoCount,
    verifiedVideoCount,
    coverVerifiedCount: coverReadyCount,
    coverReadyCount,
    items
  };
}

function dmpAudienceIds(bundle = {}) {
  const item = resource(bundle, "dmp_audience_package");
  const metadata = item.metadata || {};
  const candidates = [
    metadata.custom_audience_ids,
    metadata.custom_audience_id_list,
    metadata.readonly_check?.custom_audience_ids,
    metadata.readonly_check?.custom_audience_id_list,
    /^\d+$/.test(clean(item.platform_resource_id)) ? [item.platform_resource_id] : []
  ].flatMap((value) => Array.isArray(value) ? value : (value ? [value] : []));
  return unique(candidates)
    .map(safeIntOrNull)
    .filter((value) => value !== null);
}

function brandInfo(bundle = {}) {
  const summaryBrand = bundle.draft?.payload_summary?.brand_info || {};
  const official = resource(bundle, "brand_info").metadata?.brand_info_official || {};
  return {
    brand_name_id: intOrNull(summaryBrand.brand_name_id || official.brand_name_id),
    cdp_brand_id: intOrNull(summaryBrand.cdp_brand_id || official.cdp_brand_id),
    cdp_brand_name: clean(summaryBrand.cdp_brand_name || official.cdp_brand_name),
    yuntu_category_id: intOrNull(summaryBrand.yuntu_category_id || official.yuntu_category_id)
  };
}

function backupLandingPageReadiness(bundle = {}, controlled = {}) {
  const asset = bundle.backupLandingPage || {};
  const item = resource(bundle, "backup_landing_page");
  const url = clean(controlled.landing_url);
  const computedHash = url ? sha256Hex(url) : "";
  const urlHash = clean(controlled.url_hash || asset.url_hash || item.metadata?.url_hash);
  const readonlyStatus = clean(item.metadata?.readonly_check?.status);
  const checks = {
    present: Boolean(clean(asset.landing_page_asset_id || controlled.landing_page_asset_id)),
    active: clean(controlled.status || asset.status) === "active",
    https: /^https:\/\//.test(url),
    targetVisible: clean(controlled.resource_visibility_status || item.visibility_status) === "visible",
    readbackVerified: clean(controlled.resource_readback_status || item.readback_status) === "readback_verified",
    readonlyPassed: ["passed", "passed_by_manual_confirmation"].includes(clean(controlled.resource_readonly_status || readonlyStatus)),
    hashMatch: Boolean(url && urlHash && computedHash === urlHash)
  };
  const ready = Object.values(checks).every(Boolean);
  return {
    ready,
    url: ready ? url : "",
    assetId: clean(controlled.landing_page_asset_id || asset.landing_page_asset_id || item.source_asset_id),
    siteId: clean(controlled.site_id || asset.site_id || item.platform_resource_id),
    siteName: clean(controlled.site_name || asset.site_name || item.resource_name),
    urlHash,
    checks
  };
}

function finalPayloadBlockers(payload = {}, bundle = {}, {
  configBlockers = [],
  materialReadiness = {},
  backupLandingPage = {},
  officialFieldEvidence = {},
  instanceIdCreateEvidence = {}
} = {}) {
  const missing = REQUIRED_CREATE_FIELDS.filter((field) => {
    const value = payload[field];
    return value === "" || value === null || value === undefined || (Array.isArray(value) && !value.length);
  });
  const resources = ["avatar", "dmp_audience_package", "event_asset", "product_image", "brand_info", "micro_app_instance", "backup_landing_page"]
    .map((type) => [type, resource(bundle, type)])
    .filter(([, item]) => !resourceReady(item))
    .map(([type]) => `resource_${type}_not_ready`);
  const selectedRequiredVideoCount = Number(materialReadiness.selectedRequiredVideoCount || 0);
  const verifiedVideoCount = Number(materialReadiness.verifiedVideoCount || 0);
  const coverVerifiedCount = Number(materialReadiness.coverVerifiedCount || 0);
  const semantic = [
    ...configBlockers,
    ...(!Number.isSafeInteger(payload.advertiser_id) ? ["advertiser_id_not_safe_integer_for_platform_payload"] : []),
    ...(!payload.asset_id ? ["asset_id_missing_or_not_integer"] : []),
    ...(instanceIdCreateEvidence.blockers || []),
    ...(!payload.aweme_id ? ["aweme_id_missing"] : []),
    ...(!payload.project_materials?.mini_program_info?.url ? ["mini_program_url_missing"] : []),
    ...(!payload.track_url_setting?.action_track_url?.length ? ["controlled_touchpoint_missing"] : []),
    ...(!payload.project_materials?.product_info?.image_ids?.length ? ["product_image_id_missing"] : []),
    ...(!payload.project_materials?.external_url_material_list?.length ? ["backup_landing_page_missing"] : []),
    ...(!backupLandingPage.checks?.present ? ["backup_landing_page_default_missing"] : []),
    ...(backupLandingPage.checks?.present && !backupLandingPage.checks?.active ? ["backup_landing_page_not_active"] : []),
    ...(backupLandingPage.checks?.present && !backupLandingPage.checks?.https ? ["backup_landing_page_url_missing_or_not_https"] : []),
    ...(backupLandingPage.checks?.present && !backupLandingPage.checks?.targetVisible ? ["backup_landing_page_target_not_visible"] : []),
    ...(backupLandingPage.checks?.present && !backupLandingPage.checks?.readbackVerified ? ["backup_landing_page_readback_not_verified"] : []),
    ...(backupLandingPage.checks?.present && !backupLandingPage.checks?.hashMatch ? ["backup_landing_page_hash_mismatch"] : []),
    ...(!payload.project_materials?.video_material_list?.length ? ["video_material_list_missing"] : []),
    ...((payload.project_materials?.video_material_list || []).some((item) => !item.video_id) ? ["video_id_missing"] : []),
    ...(selectedRequiredVideoCount !== payload.project_materials?.video_material_list?.length ? ["selected_required_video_count_mismatch"] : []),
    ...(selectedRequiredVideoCount !== verifiedVideoCount ? ["required_video_material_readback_incomplete"] : []),
    ...(selectedRequiredVideoCount !== coverVerifiedCount ? ["required_video_cover_readback_incomplete"] : []),
    ...(!payload.project_materials?.title_material_list?.length ? ["title_material_list_missing"] : []),
    ...(!payload.brand_info?.brand_name_id || !payload.brand_info?.cdp_brand_id || !payload.brand_info?.yuntu_category_id ? ["brand_info_integer_fields_missing"] : []),
    ...(payload.audience?.gender !== "GENDER_UNLIMITED" ? ["audience_gender_not_unlimited_enum"] : []),
    ...(!ALLOWED_HIDE_IF_CONVERTED.has(clean(payload.audience?.hide_if_converted)) ? ["hide_if_converted_invalid_enum"] : []),
    ...(clean(payload.audience?.hide_if_converted) === clean(payload.external_action) ? ["hide_if_converted_uses_conversion_event"] : []),
    ...(!(payload.audience?.filter_event || []).includes(clean(payload.external_action)) ? ["filter_event_missing_primary_conversion_event"] : []),
    ...(!(payload.audience?.retargeting_tags_exclude || []).length ? ["dmp_custom_audience_ids_missing"] : []),
    ...((payload.audience?.retargeting_tags_exclude || []).some((value) => !Number.isInteger(value)) ? ["dmp_custom_audience_ids_not_integer_array"] : []),
    ...(officialFieldEvidence.blockerCodes || [])
  ];
  return [...new Set([
    ...missing.map((field) => `payload_required_missing:${field}`),
    ...resources,
    ...semantic
  ])];
}

function fieldManifest(payload = {}, blockers = [], {
  advertiserIdStorageValue = "",
  configSource = {},
  materialReadiness = {},
  backupLandingPage = {},
  officialFieldEvidence = {},
  instanceIdCreateEvidence = {}
} = {}) {
  const audience = payload.audience || {};
  const materials = payload.project_materials || {};
  const brand = payload.brand_info || {};
  const advertiserIdStorageText = clean(advertiserIdStorageValue);
  return {
    kind: "oe3_std_project_final_payload_manifest",
    requiredFieldsPresent: REQUIRED_CREATE_FIELDS.every((field) => payload[field] !== undefined && payload[field] !== null && payload[field] !== ""),
    advertiserIdType: typeof payload.advertiser_id,
    advertiserIdStorageType: typeof advertiserIdStorageText,
    advertiserIdTransportType: typeof payload.advertiser_id,
    advertiserIdTransportSafe: Number.isSafeInteger(payload.advertiser_id),
    projectNamePresent: Boolean(payload.name),
    appIdPresent: Boolean(materials.mini_program_info?.app_id),
    eventAssetIdPresent: Boolean(payload.asset_id),
    eventAssetIdType: payload.asset_id === null ? "null" : typeof payload.asset_id,
    microAppInstanceIdPresent: Boolean(payload[instanceIdCreateEvidence.candidateField || "instance_id"]),
    microAppInstanceIdType: payload[instanceIdCreateEvidence.candidateField || "instance_id"] === null ? "null" : typeof payload[instanceIdCreateEvidence.candidateField || "instance_id"],
    microAppInstanceIdTransportLossless: platformIdTransportLossless(payload[instanceIdCreateEvidence.candidateField || "instance_id"]),
    microAppInstanceIdTransportStrategy: typeof payload[instanceIdCreateEvidence.candidateField || "instance_id"] === "string" ? "digit_string_long_platform_id" : "safe_integer_number",
    awemeIdPresent: Boolean(payload.aweme_id),
    productImageCount: materials.product_info?.image_ids?.length || 0,
    videoMaterialCount: materials.video_material_list?.length || 0,
    videoIdReadyCount: (materials.video_material_list || []).filter((item) => item.video_id).length,
    videoCoverReadyCount: (materials.video_material_list || []).filter((item) => item.video_cover_id).length,
    titleMaterialCount: materials.title_material_list?.length || 0,
    backupLandingPagePresent: Boolean(materials.external_url_material_list?.length),
    backupLandingPageSiteId: backupLandingPage.siteId || "",
    backupLandingPageAssetId: backupLandingPage.assetId || "",
    backupLandingPageUrlHash: backupLandingPage.urlHash || "",
    backupLandingPageHttps: backupLandingPage.checks?.https === true,
    backupLandingPageTargetVisible: backupLandingPage.checks?.targetVisible === true,
    backupLandingPageReadbackVerified: backupLandingPage.checks?.readbackVerified === true,
    backupLandingPageHashMatch: backupLandingPage.checks?.hashMatch === true,
    touchpointUrlControlledPresent: Boolean(payload.track_url_setting?.action_track_url?.length),
    audienceGender: audience.gender || "",
    hideIfConverted: audience.hide_if_converted || "",
    filterEvent: audience.filter_event || [],
    dmpRetargetingTagsExcludeCount: audience.retargeting_tags_exclude?.length || 0,
    dmpRetargetingTagsExcludePresent: Boolean(audience.retargeting_tags_exclude?.length),
    dmpRetargetingTagsExcludeIntegerArray: (audience.retargeting_tags_exclude || []).every((value) => Number.isInteger(value)),
    businessDefaultsSource: configSource.businessDefaultsSource || "postgres:mwb.game_route_defaults.raw_defaults.payload_defaults",
    businessDefaultsPresent: configSource.businessDefaultsPresent === true,
    contractMapping: {
      miniGameInstanceCandidateCreateField: configSource.contractMapping?.mini_game_instance_candidate_create_field || "",
      optimizedGoalQueryInstanceFieldName: configSource.contractMapping?.optimized_goal_query_instance_field || "",
      optimizedGoalQueryAppFieldName: configSource.contractMapping?.optimized_goal_query_app_field || ""
    },
    finalMaterialReadiness: {
      status: materialReadiness.status || "not_checked",
      selectedRequiredVideoCount: materialReadiness.selectedRequiredVideoCount || 0,
      verifiedVideoCount: materialReadiness.verifiedVideoCount || 0,
      coverVerifiedCount: materialReadiness.coverVerifiedCount || 0,
      coverReadyCount: materialReadiness.coverReadyCount || materialReadiness.coverVerifiedCount || 0,
      items: (materialReadiness.items || []).map((item) => ({
        sourceAssetId: item.sourceAssetId,
        videoIdPresent: Boolean(item.videoIdPresent),
        videoCoverIdPresent: Boolean(item.videoCoverIdPresent),
        coverMode: item.coverMode || "",
        readbackStatus: item.readbackStatus || "",
        readonlyStatus: item.readonlyStatus || "",
        evidenceRef: item.evidenceRef || ""
      }))
    },
    brandInfo: {
      brandNameIdPresent: Boolean(brand.brand_name_id),
      cdpBrandIdPresent: Boolean(brand.cdp_brand_id),
      cdpBrandNamePresent: Boolean(brand.cdp_brand_name),
      yuntuCategoryIdPresent: Boolean(brand.yuntu_category_id)
    },
    officialFieldEvidence: officialFieldEvidenceSummary(officialFieldEvidence),
    instanceIdCreateEvidence: instanceIdCreateEvidenceSummary(instanceIdCreateEvidence),
    forbiddenFieldsPresent: false,
    blockers
  };
}

export function buildOe3StdProjectPayload({ bundle, touchpointUrl = "", backupLandingPageUrl = {} } = {}) {
  const summary = bundle.draft?.payload_summary || {};
  const { payloadDefaults, contractMapping } = routePayloadConfig(bundle);
  const configBlockers = [];
  const advertiserIdStorageValue = summary.advertiser_id || bundle.job?.advertiser_id;
  const avatar = resource(bundle, "avatar");
  const eventAsset = resource(bundle, "event_asset");
  const microApp = resource(bundle, "micro_app_instance");
  const productImage = resource(bundle, "product_image");
  const dmpIds = dmpAudienceIds(bundle);
  const brand = brandInfo(bundle);
  const backupLandingPage = backupLandingPageReadiness(bundle, backupLandingPageUrl);
  const objective = clean(summary.objective || bundle.defaults?.objective);
  const deepObjective = clean(summary.deep_objective || bundle.defaults?.deep_objective);
  const instanceCandidateField = clean(
    contractMapping.mini_game_instance_candidate_create_field ||
    contractMapping.mini_game_instance_create_field ||
    "instance_id"
  );
  const optimizedGoalQueryInstanceField = clean(requiredConfigValue(contractMapping, "optimized_goal_query_instance_field", configBlockers));
  const optimizedGoalQueryAppField = clean(requiredConfigValue(contractMapping, "optimized_goal_query_app_field", configBlockers));
  const materialReadiness = requiredVideoMaterialReadiness(bundle);
  const officialContract = getOfficialCreateFieldContract(bundle);
  const instanceIdValue = platformLongIdString(metadataValue(microApp, ["metadata.micro_app_instance_id", "metadata.instance_id", "platform_resource_id"]));
  const instanceIdCreateEvidence = getInstanceIdCreateEvidence(officialContract, { resourceId: instanceIdValue });

  const requestedPayload = {
    advertiser_id: advertiserIdForTransport(advertiserIdStorageValue),
    name: clean(summary.project_name || bundle.draft?.project_name),
    ad_type: clean(requiredConfigValue(payloadDefaults, "project.ad_type", configBlockers)),
    landing_type: clean(requiredConfigValue(payloadDefaults, "project.landing_type", configBlockers)),
    marketing_goal: clean(requiredConfigValue(payloadDefaults, "project.marketing_goal", configBlockers)),
    external_action: objective,
    deep_external_action: deepObjective,
    native_type: clean(requiredConfigValue(payloadDefaults, "project.native_type", configBlockers)),
    aweme_id: clean(metadataValue(avatar, ["metadata.default_aweme_id", "metadata.aweme_id", "platform_resource_id"])),
    delivery_mode: clean(requiredConfigValue(payloadDefaults, "project.delivery_mode", configBlockers)),
    delivery_type: clean(requiredConfigValue(payloadDefaults, "strategy.delivery_type", configBlockers)),
    delivery_medium: clean(requiredConfigValue(payloadDefaults, "strategy.delivery_medium", configBlockers)),
    micro_promotion_type: clean(requiredConfigValue(payloadDefaults, "strategy.micro_promotion_type", configBlockers)),
    ...(instanceIdCreateEvidence.canSend ? { [instanceCandidateField]: instanceIdValue } : {}),
    asset_id: intOrNull(eventAsset.platform_resource_id),
    schedule_type: clean(requiredConfigValue(payloadDefaults, "schedule.schedule_type", configBlockers)),
    bid_type: clean(requiredConfigValue(payloadDefaults, "strategy.bid_type", configBlockers)),
    budget_mode: clean(requiredConfigValue(payloadDefaults, "strategy.budget_mode", configBlockers)),
    budget: Number(summary.budget || bundle.defaults?.budget || 0),
    pricing: clean(requiredConfigValue(payloadDefaults, "strategy.pricing", configBlockers)),
    cpa_bid: Number(summary.bid || bundle.defaults?.bid || 0),
    roi_goal: Number(summary.roi_goal || bundle.defaults?.roi_goal || 0),
    deep_bid_type: clean(summary.deep_bid_type || bundle.defaults?.deep_bid_type),
    audience_type: clean(requiredConfigValue(payloadDefaults, "strategy.audience_type", configBlockers)),
    audience: {
      district: clean(requiredConfigValue(payloadDefaults, "targeting.district", configBlockers)),
      gender: clean(requiredConfigValue(payloadDefaults, "targeting.gender", configBlockers)),
      age: configArrayAllowEmpty(payloadDefaults, "targeting.age", configBlockers),
      converted_time_duration: clean(requiredConfigValue(payloadDefaults, "targeting.converted_time_duration", configBlockers)),
      hide_if_converted: clean(requiredConfigValue(payloadDefaults, "targeting.hide_if_converted", configBlockers)),
      filter_event: objective ? [objective] : [],
      retargeting_tags_exclude: dmpIds,
      interest_action_mode: clean(requiredConfigValue(payloadDefaults, "targeting.interest_action_mode", configBlockers))
    },
    brand_info: brand,
    project_materials: {
      title_material_list: titleMaterials(bundle, payloadDefaults),
      video_material_list: videoMaterials(bundle),
      image_material_list: [],
      external_url_material_list: backupLandingPage.ready ? [backupLandingPage.url] : [],
      source: clean(bundle.game?.brand_name || bundle.game?.game_name || "产品").slice(0, 10),
      mini_program_info: {
        app_id: clean(summary.platform_app_id || bundle.platformApp?.app_id),
        url: clean(metadataValue(microApp, ["metadata.mini_program_url", "metadata.launch_url", "metadata.byte_mini_game_launch_url"]))
      },
      product_info: {
        titles: [clean(bundle.game?.product_name || bundle.game?.game_name || "产品")],
        image_ids: [clean(productImage.platform_resource_id)].filter(Boolean),
        selling_points: configArray(payloadDefaults, "product.selling_points", configBlockers)
      },
      call_to_action_buttons: configArray(payloadDefaults, "product.call_to_action_buttons", configBlockers),
      anchor_related_type: clean(requiredConfigValue(payloadDefaults, "product.anchor_related_type", configBlockers))
    },
    track_url_setting: {
      send_type: "SERVER_SEND",
      action_track_url: [clean(touchpointUrl)].filter(Boolean)
    },
    aigc_dynamic_creative_switch: "OFF",
    layer_roi_switch: "OFF",
    is_comment_disable: "OFF"
  };
  const policyApplied = applyOfficialCreateFieldSendPolicy({
    payload: requestedPayload,
    contract: officialContract
  });
  const payload = policyApplied.payload;
  const officialFieldEvidence = evaluateOfficialCreateFieldEvidence({
    payload,
    contract: officialContract,
    omittedFieldPaths: policyApplied.omittedFieldPaths
  });
  const configSource = {
    businessDefaultsSource: "postgres:mwb.game_route_defaults.raw_defaults.payload_defaults",
    businessDefaultsPresent: configBlockers.length === 0,
    contractMapping: {
      mini_game_instance_candidate_create_field: instanceCandidateField,
      optimized_goal_query_instance_field: optimizedGoalQueryInstanceField,
      optimized_goal_query_app_field: optimizedGoalQueryAppField
    }
  };
  const blockers = finalPayloadBlockers(payload, bundle, {
    configBlockers,
    materialReadiness,
    backupLandingPage,
    officialFieldEvidence,
    instanceIdCreateEvidence
  });
  const payloadHash = hashValue(payload);
  return {
    payload,
    payloadHash,
    requestFieldManifest: fieldManifest(payload, blockers, {
      advertiserIdStorageValue,
      configSource,
      materialReadiness,
      backupLandingPage,
      officialFieldEvidence,
      instanceIdCreateEvidence
    }),
    blockers
  };
}

export function finalPayloadHashFromSummary(payloadSummary = {}) {
  return clean(payloadSummary.final_payload_hash);
}
