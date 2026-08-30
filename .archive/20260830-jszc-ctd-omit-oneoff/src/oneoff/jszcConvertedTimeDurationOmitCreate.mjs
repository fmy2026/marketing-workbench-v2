import { createHash, randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createOceanEngineReadonlyClient } from "../platforms/oceanengineReadonlyClient.mjs";
import {
  credentialReady,
  getOceanEngineCredentialSummary,
  readOceanEngineEnv
} from "../platforms/oceanengineCredentialStore.mjs";
import {
  readbackStdProjectOnce,
  safePlatformErrorSummary
} from "../platforms/oceanengineStdProjectCreateExecutor.mjs";
import { buildStdProjectCreateWireBody } from "../workflows/skills/oe3/05-std-project-create-wire-body.mjs";
import {
  createFieldLedgerManifest,
  evaluateCreateFieldLedger
} from "../workflows/skills/oe3/05-create-field-ledger.mjs";
import { evaluateSellingPointsContract } from "../workflows/skills/oe3/05-selling-points-contract.mjs";
import { evaluateTitleMaterialSourceEntries } from "../workflows/skills/oe3/05-title-materials-contract.mjs";

const rootDir = normalize(join(dirname(fileURLToPath(import.meta.url)), "../.."));
const defaultProjectStatePath = join(rootDir, "project.state.json");
const API_BASE = [["https:", "", ["api", "oceanengine", "com"].join(".")].join("/")];
const CREATE_ENDPOINT = "/open_api/v3.0/std_project/create/";
const LIST_ENDPOINT = "/open_api/v3.0/std_project/list/";

export const ONEOFF_TASK_ID = "TASK-MWBV2-OE3-JSZC-ONEOFF-CONVERTED-TIME-OMIT-CREATE-20260830";
export const ONEOFF_CASE_KEY = "jszc-converted-time-duration-omit-oneoff-20260830";
export const ONEOFF_SERIES_ID = "SERIES-MWBV2-JSZC-CTD-OMIT-ONEOFF-20260830";
export const BASELINE_JOB_ID = "JOB-MWBV2-20260830031657-2CE128";
export const BASELINE_PAYLOAD_HASH = "sha256:611616c1cfcfbb66d42d204137628f8a2513369cc4bb85db3206045010af9cfe";
export const ONEOFF_PROJECT_NAME = "245828_N_JSZC_HUNT_PAY7DROI_平台定向不限_P04_20260830";
export const ONEOFF_CONFIRM_ENV = "MWBV2_OE_JSZC_CTD_OMIT_CREATE_CONFIRM";
export const ONEOFF_CONFIRM_VALUE = "CREATE_ONE_JSZC_CTD_OMIT";

const ROUTE_ID = "oceanengine_3_byte_mini_game";
const GAME_CODE = "JSZC";
const ADVERTISER_ID = "1871922346964041";
const ALLOWED_DIFF_PATHS = Object.freeze(["name", "audience.converted_time_duration"]);

function clean(value) {
  return String(value ?? "").trim();
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(String(value)).digest("hex")}`;
}

function sha256Hex(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sleep(delayMs) {
  return delayMs > 0 ? new Promise((resolve) => setTimeout(resolve, delayMs)) : Promise.resolve();
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

function safeInt(value) {
  const text = clean(value);
  if (!/^\d+$/.test(text)) return null;
  const number = Number(text);
  return Number.isSafeInteger(number) ? number : null;
}

function intOrNull(value) {
  const text = clean(value);
  return /^\d+$/.test(text) ? Number(text) : null;
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
  const productImageReady = item.resource_type === "product_image" &&
    clean(item.metadata?.product_image_target_upload_readback?.status) === "passed" &&
    item.metadata?.product_image_target_upload_readback?.image_id_present === true;
  return item.visibility_status === "visible" &&
    (item.readback_status === "readback_verified" || item.readback_status === "not_required") &&
    (!readonlyStatus || ["passed", "passed_by_manual_confirmation"].includes(readonlyStatus) || productImageReady);
}

function routePayloadDefaults(bundle = {}) {
  return bundle.defaults?.raw_defaults?.payload_defaults || {};
}

function routeAwemeBaseline(bundle = {}) {
  return bundle.defaults?.raw_defaults?.aweme_id_baseline || {};
}

function routeContractMapping(bundle = {}) {
  const defaults = routePayloadDefaults(bundle);
  return defaults.contract_mapping || bundle.defaults?.raw_defaults?.contract_mapping || {};
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
  return [...new Set(candidates.map(clean).filter(Boolean))]
    .map(safeInt)
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

function titleMaterials(bundle = {}) {
  const result = evaluateTitleMaterialSourceEntries(bundle.materialPack?.items || [], {
    blockerPrefix: "oneoff_route_title_material"
  });
  return result;
}

function videoMaterials(bundle = {}) {
  return (bundle.materialPack?.items || [])
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
      if (coverMode === "explicit_cover_verified" && videoCoverId) item.video_cover_id = videoCoverId;
      return item;
    })
    .filter((item) => item.video_id);
}

function videoReadiness(bundle = {}) {
  const selected = (bundle.materialPack?.items || []).filter((entry) => entry.item?.item_type === "video_asset" && entry.item?.required);
  const items = selected.map((entry) => {
    const sourceAssetId = clean(entry.item?.asset_id || entry.asset?.asset_id);
    const resourceItem = resourceBySourceAsset(bundle, "video_asset", sourceAssetId);
    const readonlyStatus = clean(resourceItem.metadata?.readonly_check?.status);
    const coverMode = clean(resourceItem.metadata?.readonly_check?.cover_mode || resourceItem.metadata?.final_material_readiness?.cover_mode);
    return {
      sourceAssetId,
      ready: resourceReady(resourceItem) &&
        ["passed", "passed_by_manual_confirmation"].includes(readonlyStatus) &&
        resourceItem.metadata?.readonly_check?.video_id_present === true &&
        ["explicit_cover_verified", "platform_default_cover_allowed"].includes(coverMode),
      coverMode,
      evidenceRef: clean(resourceItem.metadata?.readonly_check?.evidence_refs?.[0] || resourceItem.metadata?.final_material_readiness?.evidence_ref)
    };
  });
  return {
    selectedRequiredVideoCount: selected.length,
    verifiedVideoCount: items.filter((item) => item.ready).length,
    items
  };
}

function awemeAuthorization(bundle = {}) {
  const baseline = routeAwemeBaseline(bundle);
  const authorization = bundle.account?.aweme_authorization || {};
  const awemeId = clean(baseline.default_aweme_id);
  const expectedHash = awemeId ? sha256(awemeId) : "";
  return {
    awemeId,
    ready: /^\d+$/.test(awemeId) &&
      clean(authorization.verification_status) === "authorized" &&
      clean(authorization.default_aweme_id_hash) === expectedHash,
    hash: expectedHash
  };
}

function controlledBackupLandingPage(controlled = {}) {
  const url = clean(controlled.landing_url);
  const urlHash = clean(controlled.url_hash);
  const computedHash = url ? sha256Hex(url) : "";
  const checks = {
    present: Boolean(clean(controlled.landing_page_asset_id)),
    active: clean(controlled.status) === "active",
    https: /^https:\/\//.test(url),
    targetVisible: clean(controlled.resource_visibility_status) === "visible",
    readbackVerified: clean(controlled.resource_readback_status) === "readback_verified",
    readonlyPassed: ["passed", "passed_by_manual_confirmation"].includes(clean(controlled.resource_readonly_status)),
    hashMatch: Boolean(url && urlHash && computedHash === urlHash)
  };
  return {
    ready: Object.values(checks).every(Boolean),
    url,
    checks,
    assetId: clean(controlled.landing_page_asset_id),
    siteId: clean(controlled.site_id),
    urlHash
  };
}

function controlledLaunchLink(bundle = {}, controlled = {}) {
  const url = clean(controlled.launch_url);
  const urlHash = clean(controlled.url_hash);
  const computedHash = url ? sha256Hex(url) : "";
  const appId = clean(bundle.platformApp?.app_id);
  const checks = {
    present: Boolean(clean(controlled.link_ref)),
    active: clean(controlled.status) === "active",
    scheme: /^sslocal:\/\/microgame/.test(url),
    hashMatch: Boolean(url && urlHash && computedHash === urlHash),
    platformAppIdMatch: clean(controlled.platform_app_id) === clean(bundle.platformApp?.id),
    appIdMatch: clean(controlled.app_id) === appId
  };
  return { ready: Object.values(checks).every(Boolean), url, urlHash, checks, linkRef: clean(controlled.link_ref) };
}

function controlledTouchpoint(touchpoint = {}) {
  const url = clean(touchpoint.touchpoint_url);
  return { ready: /^https?:\/\//.test(url), url, urlHash: url ? sha256Hex(url) : "" };
}

function sellingPoints(defaults = {}, blockers = []) {
  const value = requiredConfigValue(defaults, "product.selling_points", blockers);
  const result = evaluateSellingPointsContract(value, { blockerPrefix: "oneoff_product_selling_points" });
  blockers.push(...result.blockers);
  return result.items;
}

function compilePayload({ bundle = {}, touchpointUrl = {}, backupLandingPageUrl = {}, miniProgramLaunchLink = {} } = {}) {
  const defaults = routePayloadDefaults(bundle);
  const mapping = routeContractMapping(bundle);
  const configBlockers = [];
  const aweme = awemeAuthorization(bundle);
  const eventAsset = resource(bundle, "event_asset");
  const microApp = resource(bundle, "micro_app_instance");
  const productImage = resource(bundle, "product_image");
  const dmp = resource(bundle, "dmp_audience_package");
  const brand = resource(bundle, "brand_info");
  const titleResult = titleMaterials(bundle);
  const videos = videoMaterials(bundle);
  const videoState = videoReadiness(bundle);
  const backup = controlledBackupLandingPage(backupLandingPageUrl);
  const launch = controlledLaunchLink(bundle, miniProgramLaunchLink);
  const touchpoint = controlledTouchpoint(touchpointUrl);
  const instanceField = clean(mapping.mini_game_instance_candidate_create_field || mapping.mini_game_instance_create_field || "instance_id");
  const instanceId = clean(microApp.metadata?.micro_app_instance_id || microApp.metadata?.instance_id || microApp.platform_resource_id);
  const audience = {
    district: clean(requiredConfigValue(defaults, "targeting.district", configBlockers)),
    gender: clean(requiredConfigValue(defaults, "targeting.gender", configBlockers)),
    age: configArrayAllowEmpty(defaults, "targeting.age", configBlockers),
    hide_if_converted: clean(requiredConfigValue(defaults, "targeting.hide_if_converted", configBlockers)),
    retargeting_tags_exclude: dmpAudienceIds(bundle),
    interest_action_mode: clean(requiredConfigValue(defaults, "targeting.interest_action_mode", configBlockers))
  };
  const payload = {
    advertiser_id: safeInt(bundle.job?.advertiser_id),
    name: ONEOFF_PROJECT_NAME,
    ad_type: clean(requiredConfigValue(defaults, "project.ad_type", configBlockers)),
    landing_type: clean(requiredConfigValue(defaults, "project.landing_type", configBlockers)),
    marketing_goal: clean(requiredConfigValue(defaults, "project.marketing_goal", configBlockers)),
    external_action: clean(bundle.draft?.payload_summary?.objective || bundle.defaults?.objective),
    deep_external_action: clean(bundle.draft?.payload_summary?.deep_objective || bundle.defaults?.deep_objective),
    native_type: clean(requiredConfigValue(defaults, "project.native_type", configBlockers)),
    aweme_id: aweme.awemeId,
    delivery_mode: clean(requiredConfigValue(defaults, "project.delivery_mode", configBlockers)),
    delivery_type: clean(requiredConfigValue(defaults, "strategy.delivery_type", configBlockers)),
    delivery_medium: clean(requiredConfigValue(defaults, "strategy.delivery_medium", configBlockers)),
    [instanceField]: instanceId,
    asset_id: intOrNull(eventAsset.platform_resource_id),
    schedule_type: clean(requiredConfigValue(defaults, "schedule.schedule_type", configBlockers)),
    bid_type: clean(requiredConfigValue(defaults, "strategy.bid_type", configBlockers)),
    budget_mode: clean(requiredConfigValue(defaults, "strategy.budget_mode", configBlockers)),
    budget: Number(bundle.draft?.payload_summary?.budget || bundle.defaults?.budget || 0),
    pricing: clean(requiredConfigValue(defaults, "strategy.pricing", configBlockers)),
    cpa_bid: Number(bundle.draft?.payload_summary?.bid || bundle.defaults?.bid || 0),
    roi_goal: Number(bundle.draft?.payload_summary?.roi_goal || bundle.defaults?.roi_goal || 0),
    deep_bid_type: clean(bundle.draft?.payload_summary?.deep_bid_type || bundle.defaults?.deep_bid_type),
    audience_type: clean(requiredConfigValue(defaults, "strategy.audience_type", configBlockers)),
    audience,
    brand_info: brandInfo(bundle),
    project_materials: {
      title_material_list: titleResult.items || [],
      video_material_list: videos,
      image_material_list: [],
      external_url_material_list: backup.ready ? [backup.url] : [],
      source: clean(bundle.game?.brand_name || bundle.game?.game_name || "产品").slice(0, 10),
      mini_program_info: launch.ready ? { url: launch.url } : {},
      product_info: {
        titles: [clean(bundle.game?.product_name || bundle.game?.game_name || "产品")],
        image_ids: [clean(productImage.platform_resource_id)].filter(Boolean),
        selling_points: sellingPoints(defaults, configBlockers)
      },
      call_to_action_buttons: configArray(defaults, "product.call_to_action_buttons", configBlockers),
      anchor_related_type: clean(requiredConfigValue(defaults, "product.anchor_related_type", configBlockers))
    },
    track_url_setting: {
      send_type: clean(requiredConfigValue(defaults, "track_url_setting.send_type", configBlockers)),
      action_track_url: [touchpoint.url].filter(Boolean)
    },
    aigc_dynamic_creative_switch: clean(requiredConfigValue(defaults, "strategy.aigc_dynamic_creative_switch", configBlockers)),
    layer_roi_switch: clean(requiredConfigValue(defaults, "strategy.layer_roi_switch", configBlockers)),
    is_comment_disable: clean(requiredConfigValue(defaults, "strategy.is_comment_disable", configBlockers))
  };
  const blockers = [
    ...configBlockers,
    ...(bundle.job?.job_id === BASELINE_JOB_ID ? [] : ["baseline_attempt3_job_required"]),
    ...(clean(bundle.draft?.payload_hash) === BASELINE_PAYLOAD_HASH ? [] : ["baseline_attempt3_payload_hash_mismatch"]),
    ...(clean(bundle.job?.advertiser_id) === ADVERTISER_ID ? [] : ["advertiser_scope_mismatch"]),
    ...(safeInt(bundle.job?.advertiser_id) ? [] : ["advertiser_id_not_safe_integer_for_platform_payload"]),
    ...(resourceReady(eventAsset) && payload.asset_id ? [] : ["event_asset_not_ready"]),
    ...(resourceReady(microApp) && /^\d+$/.test(instanceId) ? [] : ["micro_app_instance_not_ready"]),
    ...(resourceReady(productImage) && payload.project_materials.product_info.image_ids.length ? [] : ["product_image_not_ready"]),
    ...(resourceReady(dmp) && payload.audience.retargeting_tags_exclude.length ? [] : ["dmp_audience_not_ready"]),
    ...(resourceReady(brand) && Object.values(payload.brand_info || {}).every(Boolean) ? [] : ["brand_info_not_ready"]),
    ...(aweme.ready ? [] : ["aweme_authorization_not_verified"]),
    ...(titleResult.status === "passed" ? [] : titleResult.blockers || []),
    ...(videoState.selectedRequiredVideoCount > 0 && videoState.selectedRequiredVideoCount === videoState.verifiedVideoCount && videos.length === videoState.selectedRequiredVideoCount ? [] : ["video_materials_not_ready"]),
    ...(backup.ready && payload.project_materials.external_url_material_list.length === 1 ? [] : ["backup_landing_page_not_ready"]),
    ...(launch.ready && payload.project_materials.mini_program_info.url ? [] : ["mini_program_launch_link_not_ready"]),
    ...(touchpoint.ready ? [] : ["touchpoint_url_not_ready"]),
    ...(payload.audience.hide_if_converted === "NO_EXCLUDE" ? [] : ["hide_if_converted_not_attempt3_baseline"]),
    ...(Object.hasOwn(payload.audience, "filter_event") ? ["filter_event_must_be_omitted"] : []),
    ...(Object.hasOwn(payload.audience, "converted_time_duration") ? ["converted_time_duration_must_be_omitted"] : []),
    ...(payload.project_materials.external_url_material_list.length === 1 ? [] : ["external_url_material_list_must_remain_single_send"]),
    ...(payload.budget === 88888 && payload.cpa_bid === 488 && payload.roi_goal === 0.088 ? [] : ["budget_bid_roi_not_frozen"])
  ];
  const wire = buildStdProjectCreateWireBody(payload);
  const ledger = evaluateCreateFieldLedger(payload, {
    externalUrlMaterialListPolicy: "send",
    filterEventPolicy: "omit"
  });
  return {
    payload,
    payloadHash: wire.requestHash,
    wire,
    ledger,
    blockers: [...new Set([...blockers, ...wire.blockers, ...(ledger.status === "passed" ? [] : ["create_field_ledger_blocked"])])],
    readiness: {
      backupLandingPage: {
        present: backup.checks.present,
        https: backup.checks.https,
        target_visible: backup.checks.targetVisible,
        readback_verified: backup.checks.readbackVerified,
        hash_match: backup.checks.hashMatch,
        url_hash: backup.urlHash,
        landing_page_asset_id: backup.assetId
      },
      miniProgramLaunchLink: {
        present: launch.checks.present,
        scheme_ok: launch.checks.scheme,
        hash_match: launch.checks.hashMatch,
        app_id_match: launch.checks.appIdMatch,
        platform_app_id_match: launch.checks.platformAppIdMatch,
        url_hash: launch.urlHash,
        link_ref: launch.linkRef
      },
      touchpoint: { present: touchpoint.ready, url_hash: touchpoint.urlHash },
      video: { selected_required_count: videoState.selectedRequiredVideoCount, verified_count: videoState.verifiedVideoCount },
      aweme: { ready: aweme.ready, aweme_id_hash: aweme.hash }
    }
  };
}

function ledgerEntries(ledger = {}) {
  return Array.isArray(ledger.entries) ? ledger.entries : [];
}

function entryKey(entry = {}) {
  return JSON.stringify({
    path: entry.path || "",
    valueType: entry.valueType || "",
    itemCount: entry.itemCount ?? null,
    sendPolicy: entry.sendPolicy || "",
    valueHash: entry.valueHash || ""
  });
}

function compareLedgers(candidate = {}, baseline = {}) {
  const baselineEntries = ledgerEntries(baseline);
  const candidateEntries = ledgerEntries(candidate);
  const baselineCounts = new Map();
  baselineEntries.forEach((entry) => baselineCounts.set(entryKey(entry), (baselineCounts.get(entryKey(entry)) || 0) + 1));
  const candidateCounts = new Map();
  candidateEntries.forEach((entry) => candidateCounts.set(entryKey(entry), (candidateCounts.get(entryKey(entry)) || 0) + 1));
  const allKeys = [...new Set([...baselineCounts.keys(), ...candidateCounts.keys()])];
  const diffs = allKeys
    .filter((key) => (baselineCounts.get(key) || 0) !== (candidateCounts.get(key) || 0))
    .map((key) => {
      const parsed = JSON.parse(key);
      return {
        path: parsed.path,
        beforeCount: baselineCounts.get(key) || 0,
        afterCount: candidateCounts.get(key) || 0,
        valueType: parsed.valueType,
        itemCount: parsed.itemCount,
        sendPolicy: parsed.sendPolicy,
        valueHash: parsed.valueHash
      };
    })
    .sort((left, right) => `${left.path}:${left.valueHash}`.localeCompare(`${right.path}:${right.valueHash}`));
  const changedPaths = [...new Set(diffs.map((diff) => diff.path))].sort();
  const forbiddenChangedPaths = changedPaths.filter((path) => !ALLOWED_DIFF_PATHS.includes(path));
  return {
    status: forbiddenChangedPaths.length ? "blocked" : "passed",
    changedPaths,
    forbiddenChangedPaths,
    diffHash: sha256(canonicalJson({ changedPaths, diffs })),
    diffs,
    rawValuesStored: false
  };
}

function redactedManifest({ bundle = {}, compiled = {}, duplicate = {}, diff = {} } = {}) {
  const payload = compiled.payload || {};
  const materials = payload.project_materials || {};
  return {
    kind: "jszc_converted_time_duration_omit_oneoff_manifest",
    baseline_job_id: BASELINE_JOB_ID,
    baseline_payload_hash: BASELINE_PAYLOAD_HASH,
    project_name: payload.name || "",
    advertiser_id: clean(bundle.job?.advertiser_id),
    route_id: ROUTE_ID,
    game_code: GAME_CODE,
    single_variable: {
      path: "audience.converted_time_duration",
      direction: "sent_SIX_MONTH_to_omitted",
      allowed_changed_paths: [...ALLOWED_DIFF_PATHS],
      changed_paths: diff.changedPaths || [],
      diff_hash: diff.diffHash || "",
      validation_status: diff.status || "blocked"
    },
    frozen_business_values: {
      hide_if_converted: payload.audience?.hide_if_converted || "",
      filter_event_present: Object.hasOwn(payload.audience || {}, "filter_event"),
      converted_time_duration_present: Object.hasOwn(payload.audience || {}, "converted_time_duration"),
      external_url_material_list_present: Object.hasOwn(materials, "external_url_material_list"),
      external_url_material_list_count: materials.external_url_material_list?.length || 0,
      budget: payload.budget,
      cpa_bid: payload.cpa_bid,
      roi_goal: payload.roi_goal,
      schedule_type: payload.schedule_type
    },
    material_counts: {
      title_material_list: materials.title_material_list?.length || 0,
      video_material_list: materials.video_material_list?.length || 0,
      image_material_list: materials.image_material_list?.length || 0,
      product_image_ids: materials.product_info?.image_ids?.length || 0,
      dmp_exclusions: payload.audience?.retargeting_tags_exclude?.length || 0
    },
    readiness: compiled.readiness || {},
    duplicate_check: duplicate,
    create_field_ledger: createFieldLedgerManifest(compiled.ledger || {}),
    blockers: compiled.blockers || [],
    payload_body_stored: false,
    response_body_stored: false,
    complete_url_stored: false,
    complete_request_id_stored: false
  };
}

async function duplicateCheck({ advertiserId, projectName, client }) {
  const probe = await client.get({
    label: "oneoff_ctd_omit_duplicate",
    endpoint: "/open_api/v3.0/std_project/list/",
    query: { advertiser_id: advertiserId, filtering: JSON.stringify({ name: projectName }), page: "1", page_size: "20" },
    summarize: (payload) => {
      const list = payload.data?.list || payload.data?.items || payload.data?.projects || [];
      const items = Array.isArray(list) ? list : [];
      return {
        duplicateFound: items.some((item) => clean(item.name || item.project_name || item.std_project_name) === projectName),
        listCount: items.length
      };
    }
  });
  return {
    status: probe.status === "passed" && probe.summary?.duplicateFound !== true ? "platform_not_duplicate" : "blocked",
    httpStatus: probe.httpStatus ?? null,
    apiCode: probe.apiCode || "",
    requestIdPresent: probe.requestIdPresent === true,
    duplicateFound: probe.summary?.duplicateFound === true,
    responseHash: probe.responseHash || "",
    probeStatus: probe.status || "",
    reason: probe.gap || "",
    credentialStatus: probe.credential?.status || "",
    credentialBlockers: Array.isArray(probe.credential?.blockers) ? probe.credential.blockers : [],
    responseBodyStored: false
  };
}

function summarizeListPayload(payload = {}, projectName = "") {
  const list = payload.data?.list || payload.data?.items || payload.data?.projects || [];
  const items = Array.isArray(list) ? list : [];
  const match = items.find((item) => clean(item.name || item.project_name || item.std_project_name) === projectName) || {};
  return {
    apiCode: clean(payload.code ?? payload.err_no ?? payload.error_code ?? ""),
    requestIdPresent: Boolean(clean(payload.request_id || payload.data?.request_id)),
    objectId: clean(match.project_id || match.std_project_id || match.id || ""),
    objectName: clean(match.name || match.project_name || match.std_project_name || ""),
    objectStatus: clean(match.status || match.project_status || match.opt_status || ""),
    objectNameMatches: Boolean(Object.keys(match).length)
  };
}

export async function readbackConvertedTimeDurationOmitOneOff({
  repo,
  jobId,
  fetchImpl = globalThis.fetch,
  readbackDelaysMs = [0, 10000, 30000]
} = {}) {
  if (!repo || !jobId) throw new Error("repo_and_job_id_required");
  const credential = getOceanEngineCredentialSummary();
  if (!credentialReady(credential)) return { status: "credential_required", blockers: credential.blockers };

  const env = readOceanEngineEnv().env;
  const url = new URL(`${API_BASE}${LIST_ENDPOINT}`);
  url.searchParams.set("advertiser_id", ADVERTISER_ID);
  url.searchParams.set("filtering", JSON.stringify({ name: ONEOFF_PROJECT_NAME }));
  url.searchParams.set("page", "1");
  url.searchParams.set("page_size", "20");

  const startedAt = Date.now();
  const attempts = [];
  let latestText = "";
  let latestSummary = {
    apiCode: "",
    requestIdPresent: false,
    objectId: "",
    objectName: "",
    objectStatus: "",
    objectNameMatches: false
  };

  for (const delayMs of readbackDelaysMs.map(Number).filter((value) => Number.isInteger(value) && value >= 0).slice(0, 3)) {
    await sleep(Math.max(0, delayMs - (Date.now() - startedAt)));
    try {
      const response = await fetchImpl(url, {
        method: "GET",
        headers: { Accept: "application/json", "Access-Token": env.OCEANENGINE_ACCESS_TOKEN }
      });
      latestText = await response.text();
      let payload = {};
      try { payload = JSON.parse(latestText); } catch {}
      latestSummary = summarizeListPayload(payload, ONEOFF_PROJECT_NAME);
      attempts.push({
        delay_ms: delayMs,
        http_status: response.status,
        api_code: latestSummary.apiCode || "",
        request_id_present: latestSummary.requestIdPresent,
        object_id_present: Boolean(latestSummary.objectId),
        object_name_matches: latestSummary.objectNameMatches,
        response_hash: sha256(latestText)
      });
    } catch (error) {
      latestText = canonicalJson({ endpoint: "std_project/list", delay_ms: delayMs, outcome: clean(error?.code || error?.name || "transport_error") });
      latestSummary = {
        apiCode: "transport_error",
        requestIdPresent: false,
        objectId: "",
        objectName: "",
        objectStatus: "",
        objectNameMatches: false
      };
      attempts.push({
        delay_ms: delayMs,
        http_status: null,
        api_code: "transport_error",
        request_id_present: false,
        object_id_present: false,
        object_name_matches: false,
        response_hash: sha256(latestText)
      });
    }
  }

  const confirmedAttempt = [...attempts].reverse().find((attempt) => attempt.object_id_present && attempt.object_name_matches) || null;
  const evidenceRef = `EV-${jobId}-CTD-OMIT-READBACK-THREE`;
  await repo.upsertEvidence({
    artifactId: evidenceRef,
    jobId,
    artifactType: "oneoff_ctd_omit_readback_three",
    title: "JSZC converted_time_duration omit three readback",
    summary: `endpoint=std_project/list attempts=${attempts.length} object_id_present=${Boolean(confirmedAttempt)} object_name_matches=${Boolean(confirmedAttempt)} response_body_stored=false`,
    contentHash: sha256(latestText),
    storageRef: "postgres:evidence_artifacts:redacted_summary_only",
    sourceRef: "oceanengine:std_project/list",
    sourceUsage: "runtime_truth"
  });
  await repo.upsertReadbackRecord({
    readbackId: `RB-${jobId}-STD-PROJECT-REAL`,
    jobId,
    objectType: "std_project",
    objectId: latestSummary.objectId || (confirmedAttempt ? "OBJECT_ID_CONFIRMED_BY_EARLIER_READBACK" : "NOT_FOUND_AFTER_CREATE"),
    objectName: latestSummary.objectName || ONEOFF_PROJECT_NAME,
    readbackStatus: confirmedAttempt ? "readback_verified" : "not_found_after_create",
    fieldDiffSummary: {
      object_name_matches_draft: Boolean(confirmedAttempt),
      source: "oceanengine_std_project_list",
      real_platform_readback_called: true,
      readback_attempts: attempts,
      readback_attempt_count: attempts.length,
      response_body_stored: false
    },
    evidenceRef
  });
  return {
    status: confirmedAttempt ? "readback_verified" : "not_found_or_mismatch",
    readbackAttemptCount: attempts.length,
    objectIdPresent: Boolean(confirmedAttempt),
    objectNameMatches: Boolean(confirmedAttempt),
    evidenceRef
  };
}

function oneoffIds() {
  const nonce = randomBytes(4).toString("hex").toUpperCase();
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const jobId = `JOB-MWBV2-CTD-OMIT-${stamp}-${nonce}`;
  return {
    caseId: `CASE-MWBV2-CTD-OMIT-${stamp}-${nonce}`,
    jobId,
    draftId: `DRAFT-${jobId}-V1`,
    planId: `PLAN-${jobId}-V1`,
    confirmationId: `CONFIRM-${jobId}-CTD-OMIT-CREATE-A01`,
    actionId: `ACTION-${jobId}-CTD-OMIT-CREATE-A01`,
    idempotencyKey: `IDEMP-${jobId}-CTD-OMIT-CREATE-V1`
  };
}

function planFor({ ids, compiled, duplicate, diff }) {
  const duplicateBlockers = duplicate.status === "platform_not_duplicate"
    ? []
    : [
        `platform_duplicate_check_not_passed:${duplicate.probeStatus || duplicate.status || "blocked"}`,
        ...(duplicate.credentialBlockers || []).map((item) => `credential:${item}`)
      ];
  const blockers = [...new Set([
    ...compiled.blockers,
    ...duplicateBlockers,
    ...(diff.status === "passed" ? [] : ["single_variable_diff_not_approved"])
  ])];
  const ready = blockers.length === 0;
  const plannedActions = [{
    action_type: "std_project_create",
    target_ref: `draft:${ids.draftId}`,
    idempotency_key: ids.idempotencyKey,
    status: ready ? "ready" : "blocked",
    module_ref: "scripts/oneoff/06-jszc-converted-time-duration-omit-create.mjs",
    depends_on: ["attempt3_baseline_ledger", "target_account_resource_readiness", "platform_duplicate_check", "single_variable_diff_hash"],
    writes_to: ["launch_confirmations", "platform_actions", "created_objects", "readback_records"],
    reason: "oneoff_attempt3_minus_converted_time_duration_single_create"
  }];
  const planHash = sha256(canonicalJson({
    draftId: ids.draftId,
    payloadHash: compiled.payloadHash,
    diffHash: diff.diffHash,
    plannedActions,
    blockers
  }));
  return {
    planId: ids.planId,
    jobId: ids.jobId,
    planVersion: 1,
    planStatus: ready ? "ready" : "blocked",
    planHash,
    plannedActions,
    blockerCodes: blockers,
    draftId: ids.draftId,
    payloadHash: compiled.payloadHash,
    sourceUsage: "runtime_truth",
    metadata: {
      mode: "oneoff_jszc_attempt3_minus_converted_time_duration",
      task_id: ONEOFF_TASK_ID,
      task_ref: `tasks/${ONEOFF_TASK_ID}.md`,
      verification_series_id: ONEOFF_SERIES_ID,
      create_attempt_no: 1,
      maximum_create_attempts: 1,
      maximum_actions: 1,
      retry_allowed: false,
      baseline_job_id: BASELINE_JOB_ID,
      baseline_payload_hash: BASELINE_PAYLOAD_HASH,
      single_variable_experiment: {
        candidate_path: "audience.converted_time_duration",
        candidate_direction: "sent_SIX_MONTH_to_omitted",
        allowed_changed_paths: [...ALLOWED_DIFF_PATHS],
        changed_paths: diff.changedPaths,
        diff_hash: diff.diffHash,
        validation_status: diff.status
      },
      execution_scope: {
        mode: "oneoff_jszc_converted_time_duration_omit_std_project_create",
        task_ref: `tasks/${ONEOFF_TASK_ID}.md`,
        target_job_id: ids.jobId,
        target_draft_id: ids.draftId,
        target_payload_hash: compiled.payloadHash,
        target_plan_id: ids.planId,
        target_plan_hash: planHash,
        target_attempt_no: 1,
        maximum_total_attempts: 1,
        allowed_actions: ["oceanengine_std_project_create"],
        allowed_plan_actions: ["std_project_create"],
        maximum_actions: 1,
        retry_allowed: false,
        verification_series_id: ONEOFF_SERIES_ID
      },
      payload_body_stored: false,
      response_body_stored: false
    }
  };
}

async function compilePrepared({ repo, jobId, client = createOceanEngineReadonlyClient() }) {
  const baselineBundle = await repo.getLaunchJobBundle(BASELINE_JOB_ID);
  if (!baselineBundle?.draft?.payload_summary?.final_payload_manifest?.createFieldLedger) {
    throw new Error("attempt3_baseline_ledger_missing");
  }
  const oneoffBundle = await repo.getLaunchJobBundle(jobId);
  const touchpoint = await repo.getControlledTouchpointUrl({
    routeId: oneoffBundle.job.route_id,
    gameCode: oneoffBundle.job.game_code,
    advertiserId: oneoffBundle.job.advertiser_id,
    monitorId: oneoffBundle.account?.monitor_id || ""
  });
  const backupLandingPage = await repo.getControlledBackupLandingPageUrl({
    routeId: oneoffBundle.job.route_id,
    gameCode: oneoffBundle.job.game_code,
    advertiserId: oneoffBundle.job.advertiser_id
  });
  const launchLink = await repo.getControlledGameRouteLaunchLink({
    routeId: oneoffBundle.job.route_id,
    gameCode: oneoffBundle.job.game_code,
    platformAppId: oneoffBundle.platformApp?.id || "",
    appId: oneoffBundle.platformApp?.app_id || ""
  });
  const compiled = compilePayload({
    bundle: { ...oneoffBundle, draft: baselineBundle.draft, job: baselineBundle.job },
    touchpointUrl: touchpoint || {},
    backupLandingPageUrl: backupLandingPage || {},
    miniProgramLaunchLink: launchLink || {}
  });
  const diff = compareLedgers(compiled.ledger, baselineBundle.draft.payload_summary.final_payload_manifest.createFieldLedger);
  const duplicate = await duplicateCheck({
    advertiserId: oneoffBundle.job.advertiser_id,
    projectName: ONEOFF_PROJECT_NAME,
    client
  });
  return { oneoffBundle, baselineBundle, compiled, diff, duplicate };
}

export async function prepareConvertedTimeDurationOmitOneOff({ repo, client = createOceanEngineReadonlyClient() } = {}) {
  if (!repo) throw new Error("repo_required");
  const existing = await repo.getWorkflowCaseByKey(ONEOFF_CASE_KEY);
  let ids;
  if (existing) {
    const job = await repo.getLatestLaunchJobByCase(existing.case_id);
    if (!job) throw new Error("oneoff_case_without_job");
    const audit = await repo.getLaunchJobAuditCounts(job.job_id);
    if (Number(audit.platformActions || 0) || Number(audit.launchConfirmations || 0)) {
      throw new Error("oneoff_case_already_has_create_audit");
    }
    ids = {
      caseId: existing.case_id,
      jobId: job.job_id,
      draftId: `DRAFT-${job.job_id}-V1`,
      planId: `PLAN-${job.job_id}-V1`,
      confirmationId: `CONFIRM-${job.job_id}-CTD-OMIT-CREATE-A01`,
      actionId: `ACTION-${job.job_id}-CTD-OMIT-CREATE-A01`,
      idempotencyKey: `IDEMP-${job.job_id}-CTD-OMIT-CREATE-V1`
    };
  } else {
    ids = oneoffIds();
    await repo.createWorkflowCase({
      caseId: ids.caseId,
      caseKey: ONEOFF_CASE_KEY,
      routeId: ROUTE_ID,
      gameCode: GAME_CODE,
      advertiserId: ADVERTISER_ID,
      businessGoal: "One-off real create validation using Attempt 3 shape with audience.converted_time_duration omitted.",
      lifecycleStatus: "active",
      sourceUsage: "runtime_truth",
      metadata: {
        mode: "oneoff_jszc_converted_time_duration_omit",
        task_id: ONEOFF_TASK_ID,
        verification_series_id: ONEOFF_SERIES_ID,
        maximum_create_attempts: 1,
        payload_body_stored: false,
        response_body_stored: false
      }
    });
    await repo.createLaunchJob({
      jobId: ids.jobId,
      caseId: ids.caseId,
      routeId: ROUTE_ID,
      gameCode: GAME_CODE,
      advertiserId: ADVERTISER_ID,
      objectType: "std_project",
      sourceRecordRef: "oneoff:attempt3-minus-converted-time-duration:20260830",
      sourceUsage: "runtime_truth"
    });
  }
  const { oneoffBundle, compiled, diff, duplicate } = await compilePrepared({ repo, jobId: ids.jobId, client });
  const manifest = redactedManifest({ bundle: oneoffBundle, compiled, duplicate, diff });
  const plan = planFor({ ids, compiled, duplicate, diff });
  await repo.upsertDraft({
    draftId: ids.draftId,
    jobId: ids.jobId,
    objectType: "std_project",
    projectName: ONEOFF_PROJECT_NAME,
    payloadSummary: {
      ...manifest,
      final_payload_hash: compiled.payloadHash,
      wire_body_hash: compiled.wire.bodyHash,
      payload_body_stored: false
    },
    payloadHash: compiled.payloadHash,
    duplicateStatus: duplicate.status,
    writePolicy: "oneoff_converted_time_duration_omit_single_create"
  });
  await repo.upsertLaunchExecutionPlan(plan);
  await repo.upsertEvidence({
    artifactId: `EV-${ids.jobId}-CTD-OMIT-PREFLIGHT`,
    jobId: ids.jobId,
    artifactType: "oneoff_ctd_omit_preflight",
    title: "JSZC converted_time_duration omit one-off preflight",
    summary: `ready=${plan.planStatus === "ready"} duplicate=${duplicate.status} diff=${diff.status} blockers=${plan.blockerCodes.length} payload_body_stored=false`,
    contentHash: sha256(canonicalJson({ manifest, payloadHash: compiled.payloadHash, planHash: plan.planHash })),
    storageRef: "postgres:evidence_artifacts:redacted_summary_only",
    sourceRef: "oneoff:attempt3-minus-converted-time-duration",
    sourceUsage: "runtime_truth"
  });
  await repo.updateJob(ids.jobId, { status: plan.planStatus === "ready" ? "draft_ready" : "blocked", currentNode: "oneoff" });
  return {
    status: plan.planStatus === "ready" ? "ready_for_exact_user_confirmation" : "blocked",
    caseId: ids.caseId,
    jobId: ids.jobId,
    draftId: ids.draftId,
    planId: ids.planId,
    planHash: plan.planHash,
    payloadHash: compiled.payloadHash,
    diffHash: diff.diffHash,
    projectName: ONEOFF_PROJECT_NAME,
    duplicateStatus: duplicate.status,
    changedPaths: diff.changedPaths,
    blockers: plan.blockerCodes,
    payloadBodyStored: false,
    responseBodyStored: false
  };
}

export async function authorizeConvertedTimeDurationOmitOneOff({ repo, jobId, projectStatePath = defaultProjectStatePath } = {}) {
  if (!repo || !jobId) throw new Error("repo_and_job_id_required");
  const bundle = await repo.getLaunchJobBundle(jobId);
  if (!bundle?.executionPlan || !bundle?.draft) throw new Error("oneoff_bundle_incomplete");
  if (bundle.executionPlan.plan_status !== "ready") throw new Error("oneoff_plan_not_ready");
  const audit = await repo.getLaunchJobAuditCounts(jobId);
  if (Number(audit.platformActions || 0) || Number(audit.launchConfirmations || 0) || Number(audit.createdObjects || 0)) {
    throw new Error("oneoff_job_already_consumed");
  }
  const state = JSON.parse(await readFile(projectStatePath, "utf8"));
  state.active_task = {
    task_id: ONEOFF_TASK_ID,
    task_ref: `tasks/${ONEOFF_TASK_ID}.md`,
    context_manifest_ref: `tasks-context-manifests/${ONEOFF_TASK_ID}.json`,
    status: "execution_authorized_once",
    read_order: [
      `tasks/${ONEOFF_TASK_ID}.md`,
      `tasks-context-manifests/${ONEOFF_TASK_ID}.json`,
      "docs/Solution Design.md"
    ],
    updated_at: "2026-08-30 CST"
  };
  state.guardrails = state.guardrails || {};
  state.guardrails.platform_write_allowed = true;
  state.guardrails.platform_write_scope = {
    ...bundle.executionPlan.metadata.execution_scope,
    granted_by: "user_confirmed_exact_oneoff_converted_time_duration_omit_create",
    granted_at: "2026-08-30 CST"
  };
  await writeFile(projectStatePath, `${JSON.stringify(state, null, 2)}\n`);
  return {
    status: "execution_authorized_once",
    jobId,
    planId: bundle.executionPlan.plan_id,
    planHash: bundle.executionPlan.plan_hash,
    payloadHash: bundle.draft.payload_hash
  };
}

async function validWriteScope({ jobId, draftId, planId, planHash, payloadHash, projectStatePath }) {
  const state = JSON.parse(await readFile(projectStatePath, "utf8"));
  const scope = state.guardrails?.platform_write_scope || {};
  const blockers = [
    ...(state.guardrails?.platform_write_allowed === true ? [] : ["platform_write_scope_not_enabled"]),
    ...(scope.mode === "oneoff_jszc_converted_time_duration_omit_std_project_create" ? [] : ["oneoff_scope_mode_invalid"]),
    ...(scope.target_job_id === jobId ? [] : ["oneoff_scope_job_mismatch"]),
    ...(scope.target_draft_id === draftId ? [] : ["oneoff_scope_draft_mismatch"]),
    ...(scope.target_plan_id === planId ? [] : ["oneoff_scope_plan_mismatch"]),
    ...(scope.target_plan_hash === planHash ? [] : ["oneoff_scope_plan_hash_mismatch"]),
    ...(scope.target_payload_hash === payloadHash ? [] : ["oneoff_scope_payload_hash_mismatch"]),
    ...(Number(scope.target_attempt_no) === 1 ? [] : ["oneoff_scope_attempt_invalid"]),
    ...(Number(scope.maximum_total_attempts) === 1 ? [] : ["oneoff_scope_maximum_total_attempts_invalid"]),
    ...(Array.isArray(scope.allowed_actions) && scope.allowed_actions.length === 1 && scope.allowed_actions[0] === "oceanengine_std_project_create" ? [] : ["oneoff_scope_actions_invalid"]),
    ...(Number(scope.maximum_actions) === 1 ? [] : ["oneoff_scope_maximum_actions_invalid"]),
    ...(scope.retry_allowed === false ? [] : ["oneoff_scope_retry_allowed_must_be_false"])
  ];
  return { blockers, scope };
}

async function closeScope(projectStatePath) {
  const state = JSON.parse(await readFile(projectStatePath, "utf8"));
  state.guardrails = state.guardrails || {};
  state.guardrails.platform_write_allowed = false;
  state.guardrails.platform_write_scope = {
    ...(state.guardrails.platform_write_scope || {}),
    allowed_actions: [],
    maximum_actions: 0,
    retry_allowed: false
  };
  await writeFile(projectStatePath, `${JSON.stringify(state, null, 2)}\n`);
}

export async function executeConvertedTimeDurationOmitOneOff({
  repo,
  jobId,
  projectStatePath = defaultProjectStatePath,
  fetchImpl = globalThis.fetch,
  client = createOceanEngineReadonlyClient()
} = {}) {
  if (!repo || !jobId) throw new Error("repo_and_job_id_required");
  const { oneoffBundle, compiled, diff, duplicate } = await compilePrepared({ repo, jobId, client });
  const plan = oneoffBundle.executionPlan;
  const draft = oneoffBundle.draft;
  const audit = await repo.getLaunchJobAuditCounts(jobId);
  const scope = await validWriteScope({
    jobId,
    draftId: draft?.draft_id || "",
    planId: plan?.plan_id || "",
    planHash: plan?.plan_hash || "",
    payloadHash: compiled.payloadHash,
    projectStatePath
  });
  const fakeTransport = process.env.NODE_ENV === "test";
  const credential = fakeTransport ? { status: "valid", blockers: [] } : getOceanEngineCredentialSummary();
  const blockers = [
    ...(process.env[ONEOFF_CONFIRM_ENV] === ONEOFF_CONFIRM_VALUE ? [] : ["oneoff_confirmation_env_missing_or_invalid"]),
    ...(draft?.payload_hash === compiled.payloadHash ? [] : ["payload_hash_changed_since_confirmation"]),
    ...(plan?.plan_status === "ready" ? [] : ["oneoff_plan_not_ready"]),
    ...(Number(audit.platformActions || 0) === 0 ? [] : ["platform_action_already_recorded"]),
    ...(Number(audit.launchConfirmations || 0) === 0 ? [] : ["confirmation_already_recorded"]),
    ...(Number(audit.createdObjects || 0) === 0 ? [] : ["created_object_already_recorded"]),
    ...compiled.blockers,
    ...(duplicate.status === "platform_not_duplicate" ? [] : ["duplicate_check_not_platform_not_duplicate"]),
    ...(diff.status === "passed" ? [] : ["single_variable_diff_not_approved"]),
    ...scope.blockers,
    ...(!fakeTransport && !credentialReady(credential) ? credential.blockers.map((item) => `credential:${item}`) : [])
  ];
  if (blockers.length) {
    await closeScope(projectStatePath);
    return { status: "blocked_before_create", createCalled: false, blockers, payloadHash: compiled.payloadHash };
  }
  const action = (plan.planned_actions || []).find((item) => item.action_type === "std_project_create") || {};
  const confirmationId = `CONFIRM-${jobId}-CTD-OMIT-CREATE-A01`;
  const actionId = `ACTION-${jobId}-CTD-OMIT-CREATE-A01`;
  const manifest = redactedManifest({ bundle: oneoffBundle, compiled, duplicate, diff });
  const claim = await repo.claimStdProjectCreateAction({
    confirmation: {
      confirmationId,
      jobId,
      draftId: draft.draft_id,
      objectType: "std_project",
      objectName: ONEOFF_PROJECT_NAME,
      payloadHash: compiled.payloadHash,
      confirmationStatus: "confirmed_for_single_create",
      confirmVariable: `${ONEOFF_CONFIRM_ENV}=${ONEOFF_CONFIRM_VALUE}`,
      planId: plan.plan_id,
      metadata: {
        mode: "oneoff_jszc_converted_time_duration_omit",
        task_id: ONEOFF_TASK_ID,
        maximum_actions: 1,
        retry_allowed: false,
        payload_stored: false,
        response_stored: false
      }
    },
    action: {
      actionId,
      jobId,
      confirmationId,
      planId: plan.plan_id,
      actionType: "oceanengine_std_project_create",
      endpoint: CREATE_ENDPOINT,
      method: "POST",
      attemptNo: 1,
      requestHash: compiled.payloadHash,
      idempotencyKey: action.idempotency_key || `IDEMP-${jobId}-CTD-OMIT-CREATE-V1`,
      metadata: {
        mode: "oneoff_jszc_converted_time_duration_omit",
        task_id: ONEOFF_TASK_ID,
        verification_series_id: ONEOFF_SERIES_ID,
        payload_body_stored: false,
        response_body_stored: false,
        retry_allowed: false
      }
    }
  });
  if (!claim.claimed) {
    await closeScope(projectStatePath);
    return { status: "blocked_before_create", createCalled: false, blockers: ["platform_action_already_recorded"] };
  }
  try {
    const env = fakeTransport ? {} : readOceanEngineEnv().env;
    let response = null;
    let text = "";
    try {
      response = await fetchImpl(`${API_BASE}${CREATE_ENDPOINT}`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json", "Access-Token": env.OCEANENGINE_ACCESS_TOKEN },
        body: compiled.wire.body
      });
      text = await response.text();
    } catch {
      const responseHash = sha256(canonicalJson({ request_hash: compiled.payloadHash, outcome: "transport_unconfirmed" }));
      await repo.upsertPlatformAction({
        actionId,
        jobId,
        confirmationId,
        planId: plan.plan_id,
        actionType: "oceanengine_std_project_create",
        endpoint: CREATE_ENDPOINT,
        method: "POST",
        actionStatus: "failed_or_unconfirmed",
        attemptNo: 1,
        requestHash: compiled.payloadHash,
        responseHash,
        httpStatus: null,
        apiCode: "transport_error",
        requestIdPresent: false,
        objectIdPresent: false,
        errorSummary: "platform_create_transport_not_confirmed",
        requestId: "",
        errorCategory: "unclassified",
        offendingFieldPath: "",
        idempotencyKey: action.idempotency_key || "",
        requestFieldManifest: manifest,
        responseSummary: { transport_failed: true, response_body_stored: false },
        metadata: { mode: "oneoff_jszc_converted_time_duration_omit", payload_body_stored: false, response_body_stored: false, retry_allowed: false },
        finishedAt: new Date().toISOString()
      });
      await repo.upsertEvidence({
        artifactId: `EV-${jobId}-CTD-OMIT-CREATE`,
        jobId,
        artifactType: "oneoff_ctd_omit_create_transport_failed",
        title: "JSZC converted_time_duration omit create once",
        summary: "endpoint=std_project/create transport_failed=true response_body_stored=false",
        contentHash: responseHash,
        storageRef: "postgres:evidence_artifacts:redacted_summary_only",
        sourceRef: "oceanengine:std_project/create",
        sourceUsage: "runtime_truth"
      });
      const readback = await readbackStdProjectOnce({ repo, jobId, fetchImpl, target: { projectName: ONEOFF_PROJECT_NAME, grantSource: fakeTransport ? "test_fake_transport" : "" } });
      await repo.updateWorkflowCaseLifecycle({ caseId: oneoffBundle.job.case_id, lifecycleStatus: "completed", metadataPatch: { oneoff_status: "create_transport_failed", create_called: true, api_code: "transport_error", object_id_present: false, readback_status: readback.status || "", payload_body_stored: false, response_body_stored: false } });
      await repo.updateJob(jobId, { status: "failed_waiting_manual_review", currentNode: "oneoff" });
      return { status: "create_transport_failed_stop", createCalled: true, httpStatus: null, apiCode: "transport_error", requestIdPresent: false, objectIdPresent: false, readbackStatus: readback.status || "", payloadHash: compiled.payloadHash };
    }
    let responsePayload = {};
    try { responsePayload = JSON.parse(text); } catch { responsePayload = {}; }
    const apiCode = clean(responsePayload.code ?? responsePayload.err_no ?? responsePayload.error_code);
    const projectId = clean(responsePayload.data?.project_id || responsePayload.data?.std_project_id || responsePayload.data?.id || responsePayload.project_id || "");
    const safe = safePlatformErrorSummary(responsePayload);
    const passed = response.ok && (apiCode === "0" || !apiCode) && Boolean(projectId);
    const responseHash = sha256(text);
    await repo.upsertPlatformAction({
      actionId,
      jobId,
      confirmationId,
      planId: plan.plan_id,
      actionType: "oceanengine_std_project_create",
      endpoint: CREATE_ENDPOINT,
      method: "POST",
      actionStatus: passed ? "succeeded" : "failed_or_unconfirmed",
      attemptNo: 1,
      requestHash: compiled.payloadHash,
      responseHash,
      httpStatus: response.status,
      apiCode: apiCode || "unknown",
      requestIdPresent: safe.request_id_present === true,
      objectIdPresent: Boolean(projectId),
      errorSummary: passed ? "" : "platform_create_response_not_confirmed",
      requestId: "",
      errorCategory: passed ? "" : safe.error_category,
      offendingFieldPath: passed ? "" : safe.offending_field_path,
      idempotencyKey: action.idempotency_key || "",
      requestFieldManifest: manifest,
      responseSummary: { ...safe, object_id_present: Boolean(projectId), response_hash_present: true },
      metadata: { mode: "oneoff_jszc_converted_time_duration_omit", payload_body_stored: false, response_body_stored: false, retry_allowed: false },
      finishedAt: new Date().toISOString()
    });
    await repo.upsertEvidence({
      artifactId: `EV-${jobId}-CTD-OMIT-CREATE`,
      jobId,
      artifactType: passed ? "oneoff_ctd_omit_create_once" : "oneoff_ctd_omit_create_once_failed",
      title: "JSZC converted_time_duration omit create once",
      summary: `http=${response.status} api_code=${apiCode || "unknown"} request_id_present=${safe.request_id_present === true} object_id_present=${Boolean(projectId)} response_body_stored=false`,
      contentHash: responseHash,
      storageRef: "postgres:evidence_artifacts:redacted_summary_only",
      sourceRef: "oceanengine:std_project/create",
      sourceUsage: "runtime_truth"
    });
    if (passed) {
      await repo.upsertCreatedObject({
        createdObjectId: `CO-${jobId}-STD-PROJECT-${projectId}`,
        jobId,
        confirmationId,
        actionId,
        objectType: "std_project",
        objectId: projectId,
        objectName: ONEOFF_PROJECT_NAME,
        objectStatus: "created_pending_readback",
        readbackStatus: "pending",
        evidenceRef: `EV-${jobId}-CTD-OMIT-CREATE`,
        metadata: { payload_body_stored: false, response_body_stored: false, oneoff_series_id: ONEOFF_SERIES_ID }
      });
    }
    const readback = await readbackStdProjectOnce({ repo, jobId, fetchImpl, target: { projectName: ONEOFF_PROJECT_NAME, grantSource: fakeTransport ? "test_fake_transport" : "" } });
    await repo.updateWorkflowCaseLifecycle({ caseId: oneoffBundle.job.case_id, lifecycleStatus: "completed", metadataPatch: { oneoff_status: passed || readback.status === "readback_verified" ? "create_confirmed" : "create_failed_or_unconfirmed", create_called: true, api_code: apiCode || "unknown", object_id_present: Boolean(projectId), readback_status: readback.status || "", payload_body_stored: false, response_body_stored: false } });
    await repo.updateJob(jobId, { status: passed || readback.status === "readback_verified" ? "created_pending_readback" : "failed_waiting_manual_review", currentNode: "oneoff" });
    return { status: passed || readback.status === "readback_verified" ? "create_confirmed" : "create_failed_stop", createCalled: true, httpStatus: response.status, apiCode, requestIdPresent: safe.request_id_present === true, objectIdPresent: Boolean(projectId), readbackStatus: readback.status || "", payloadHash: compiled.payloadHash };
  } finally {
    await closeScope(projectStatePath);
  }
}
