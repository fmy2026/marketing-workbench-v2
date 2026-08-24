import { hashValue } from "./contracts.mjs";

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

function numberString(value) {
  const text = clean(value);
  return /^\d+$/.test(text) ? text : "";
}

function resource(bundle = {}, type) {
  return (bundle.resources || []).find((item) => item.resource_type === type) || {};
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

function titleMaterials(bundle = {}) {
  const gameName = clean(bundle.game?.game_name || bundle.game?.product_name || "巨兽战场");
  const materialItems = Array.isArray(bundle.materialPack?.items) ? bundle.materialPack.items : [];
  const names = materialItems
    .map((entry) => clean(entry.asset?.asset_name))
    .filter((title) => title.length >= 5 && title.length <= 30);
  return unique([
    `来${gameName}开荒`,
    `${gameName}福利开局`,
    ...names
  ]).slice(0, 30).map((title) => ({ title }));
}

function videoMaterials(bundle = {}) {
  const materialItems = Array.isArray(bundle.materialPack?.items) ? bundle.materialPack.items : [];
  return materialItems
    .filter((entry) => entry.item?.item_type === "video_asset" && entry.item?.required)
    .map((entry) => ({
      image_mode: "CREATIVE_IMAGE_MODE_VIDEO_VERTICAL",
      video_id: clean(entry.asset?.metadata?.video_id || entry.asset?.metadata?.platform_video_id || ""),
      video_cover_id: clean(entry.asset?.metadata?.video_cover_id || entry.asset?.metadata?.cover_id || "")
    }))
    .filter((item) => item.video_id || item.video_cover_id);
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

function finalPayloadBlockers(payload = {}, bundle = {}) {
  const missing = REQUIRED_CREATE_FIELDS.filter((field) => {
    const value = payload[field];
    return value === "" || value === null || value === undefined || (Array.isArray(value) && !value.length);
  });
  const resources = ["avatar", "dmp_audience_package", "event_asset", "video_asset", "product_image", "brand_info", "micro_app_instance"]
    .map((type) => [type, resource(bundle, type)])
    .filter(([, item]) => !resourceReady(item))
    .map(([type]) => `resource_${type}_not_ready`);
  const semantic = [
    ...(!payload.asset_id ? ["asset_id_missing_or_not_integer"] : []),
    ...(!payload.instance_id ? ["micro_app_instance_id_missing_or_not_integer"] : []),
    ...(!payload.aweme_id ? ["aweme_id_missing"] : []),
    ...(!payload.project_materials?.mini_program_info?.url ? ["mini_program_url_missing"] : []),
    ...(!payload.track_url_setting?.action_track_url?.length ? ["controlled_touchpoint_missing"] : []),
    ...(!payload.project_materials?.product_info?.image_ids?.length ? ["product_image_id_missing"] : []),
    ...(!payload.project_materials?.video_material_list?.length ? ["video_material_list_missing"] : []),
    ...((payload.project_materials?.video_material_list || []).some((item) => !item.video_id) ? ["video_id_missing"] : []),
    ...((payload.project_materials?.video_material_list || []).some((item) => !item.video_cover_id) ? ["video_cover_id_missing"] : []),
    ...(!payload.project_materials?.title_material_list?.length ? ["title_material_list_missing"] : []),
    ...(!payload.brand_info?.brand_name_id || !payload.brand_info?.cdp_brand_id || !payload.brand_info?.yuntu_category_id ? ["brand_info_integer_fields_missing"] : []),
    ...(payload.audience?.gender !== "GENDER_UNLIMITED" ? ["audience_gender_not_unlimited_enum"] : []),
    ...(!ALLOWED_HIDE_IF_CONVERTED.has(clean(payload.audience?.hide_if_converted)) ? ["hide_if_converted_invalid_enum"] : []),
    ...(clean(payload.audience?.hide_if_converted) === clean(payload.external_action) ? ["hide_if_converted_uses_conversion_event"] : []),
    ...(!(payload.audience?.filter_event || []).includes(clean(payload.external_action)) ? ["filter_event_missing_primary_conversion_event"] : []),
    ...(!(payload.audience?.retargeting_tags_exclude || []).length ? ["dmp_custom_audience_ids_missing"] : []),
    ...((payload.audience?.retargeting_tags_exclude || []).some((value) => !Number.isInteger(value)) ? ["dmp_custom_audience_ids_not_integer_array"] : [])
  ];
  return [...new Set([
    ...missing.map((field) => `payload_required_missing:${field}`),
    ...resources,
    ...semantic
  ])];
}

function fieldManifest(payload = {}, blockers = []) {
  const audience = payload.audience || {};
  const materials = payload.project_materials || {};
  const brand = payload.brand_info || {};
  return {
    kind: "oe3_std_project_final_payload_manifest",
    requiredFieldsPresent: REQUIRED_CREATE_FIELDS.every((field) => payload[field] !== undefined && payload[field] !== null && payload[field] !== ""),
    advertiserIdType: typeof payload.advertiser_id,
    projectNamePresent: Boolean(payload.name),
    appIdPresent: Boolean(materials.mini_program_info?.app_id),
    eventAssetIdPresent: Boolean(payload.asset_id),
    eventAssetIdType: payload.asset_id === null ? "null" : typeof payload.asset_id,
    microAppInstanceIdPresent: Boolean(payload.instance_id),
    microAppInstanceIdType: payload.instance_id === null ? "null" : typeof payload.instance_id,
    awemeIdPresent: Boolean(payload.aweme_id),
    productImageCount: materials.product_info?.image_ids?.length || 0,
    videoMaterialCount: materials.video_material_list?.length || 0,
    videoIdReadyCount: (materials.video_material_list || []).filter((item) => item.video_id).length,
    videoCoverReadyCount: (materials.video_material_list || []).filter((item) => item.video_cover_id).length,
    titleMaterialCount: materials.title_material_list?.length || 0,
    touchpointUrlControlledPresent: Boolean(payload.track_url_setting?.action_track_url?.length),
    audienceGender: audience.gender || "",
    hideIfConverted: audience.hide_if_converted || "",
    filterEvent: audience.filter_event || [],
    dmpRetargetingTagsExcludeCount: audience.retargeting_tags_exclude?.length || 0,
    dmpRetargetingTagsExcludePresent: Boolean(audience.retargeting_tags_exclude?.length),
    dmpRetargetingTagsExcludeIntegerArray: (audience.retargeting_tags_exclude || []).every((value) => Number.isInteger(value)),
    brandInfo: {
      brandNameIdPresent: Boolean(brand.brand_name_id),
      cdpBrandIdPresent: Boolean(brand.cdp_brand_id),
      cdpBrandNamePresent: Boolean(brand.cdp_brand_name),
      yuntuCategoryIdPresent: Boolean(brand.yuntu_category_id)
    },
    forbiddenFieldsPresent: false,
    blockers
  };
}

export function buildOe3StdProjectPayload({ bundle, touchpointUrl = "" } = {}) {
  const summary = bundle.draft?.payload_summary || {};
  const avatar = resource(bundle, "avatar");
  const eventAsset = resource(bundle, "event_asset");
  const microApp = resource(bundle, "micro_app_instance");
  const productImage = resource(bundle, "product_image");
  const dmpIds = dmpAudienceIds(bundle);
  const brand = brandInfo(bundle);
  const objective = clean(summary.objective || bundle.defaults?.objective);
  const deepObjective = clean(summary.deep_objective || bundle.defaults?.deep_objective);

  const payload = {
    advertiser_id: clean(summary.advertiser_id || bundle.job?.advertiser_id),
    name: clean(summary.project_name || bundle.draft?.project_name),
    ad_type: "ALL",
    landing_type: "MICRO_GAME",
    marketing_goal: "VIDEO_AND_IMAGE",
    external_action: objective,
    deep_external_action: deepObjective,
    native_type: "AWEME",
    aweme_id: clean(metadataValue(avatar, ["metadata.default_aweme_id", "metadata.aweme_id", "platform_resource_id"])),
    delivery_mode: "PROCEDURAL",
    delivery_type: "NORMAL",
    delivery_medium: "BYTE_GAME",
    micro_promotion_type: "BYTE_GAME",
    instance_id: intOrNull(metadataValue(microApp, ["metadata.micro_app_instance_id", "metadata.instance_id", "platform_resource_id"])),
    asset_id: intOrNull(eventAsset.platform_resource_id),
    schedule_type: "SCHEDULE_FROM_NOW",
    bid_type: "CUSTOM",
    budget_mode: "BUDGET_MODE_DAY",
    budget: Number(summary.budget || bundle.defaults?.budget || 0),
    pricing: "PRICING_OCPM",
    cpa_bid: Number(summary.bid || bundle.defaults?.bid || 0),
    roi_goal: Number(summary.roi_goal || bundle.defaults?.roi_goal || 0),
    deep_bid_type: clean(summary.deep_bid_type || bundle.defaults?.deep_bid_type),
    audience_type: "CUSTOM",
    audience: {
      district: "NONE",
      gender: "GENDER_UNLIMITED",
      age: [],
      converted_time_duration: "SIX_MONTH",
      hide_if_converted: "NO_EXCLUDE",
      filter_event: objective ? [objective] : [],
      retargeting_tags_exclude: dmpIds,
      interest_action_mode: "UNLIMITED"
    },
    brand_info: brand,
    project_materials: {
      title_material_list: titleMaterials(bundle),
      video_material_list: videoMaterials(bundle),
      image_material_list: [],
      source: clean(bundle.game?.brand_name || bundle.game?.game_name || "巨兽战场").slice(0, 10),
      mini_program_info: {
        app_id: clean(summary.platform_app_id || bundle.platformApp?.app_id),
        url: clean(metadataValue(microApp, ["metadata.mini_program_url", "metadata.launch_url", "metadata.byte_mini_game_launch_url"]))
      },
      product_info: {
        titles: [clean(bundle.game?.product_name || bundle.game?.game_name || "巨兽战场")],
        image_ids: [clean(productImage.platform_resource_id)].filter(Boolean),
        selling_points: ["策略开荒", "巨兽养成", "联盟对战"]
      },
      call_to_action_buttons: ["立即试玩"],
      anchor_related_type: "OFF"
    },
    track_url_setting: {
      send_type: "SERVER_SEND",
      action_track_url: [clean(touchpointUrl)].filter(Boolean)
    },
    aigc_dynamic_creative_switch: "OFF",
    layer_roi_switch: "OFF",
    is_comment_disable: "OFF"
  };
  const blockers = finalPayloadBlockers(payload, bundle);
  const payloadHash = hashValue(payload);
  return {
    payload,
    payloadHash,
    requestFieldManifest: fieldManifest(payload, blockers),
    blockers
  };
}

export function finalPayloadHashFromSummary(payloadSummary = {}) {
  return clean(payloadSummary.final_payload_hash);
}
