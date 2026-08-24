import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  credentialReady,
  getOceanEngineCredentialSummary,
  readOceanEngineEnv
} from "./oceanengineCredentialStore.mjs";
import { evaluateStdProjectPayloadContract, stablePayloadHash } from "./oceanengineStdProjectPayloadContract.mjs";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(MODULE_DIR, "../..");
const LOCAL_DIR = path.join(PROJECT_ROOT, ".local");
const API_BASE = "https://api.oceanengine.com";
const CREATE_ENDPOINT = "/open_api/v3.0/std_project/create/";
const LIST_ENDPOINT = "/open_api/v3.0/std_project/list/";

export const STD_PROJECT_CREATE_CONFIRM_ENV = "MWBV2_OE_STD_PROJECT_CREATE_CONFIRM";
export const STD_PROJECT_CREATE_CONFIRM_VALUE = "CREATE_ONE_STD_PROJECT";

export const TARGET_STD_PROJECT_CREATE = Object.freeze({
  jobId: "JOB-MWBV2-20260824014546-851B76",
  draftId: "DRAFT-JOB-MWBV2-20260824014546-851B76",
  objectType: "std_project",
  routeId: "oceanengine_3_byte_mini_game",
  gameCode: "JSZC",
  advertiserId: "1871922175825993",
  projectName: "245791_N_JSZC_HUNT_PAY7DROI_平台定向不限_P19_20260824",
  payloadHash: "sha256:8db82f4009abfc567592e59b4d11ad6324b4fbb12dd9d40cb89f64aa5007c7b7"
});

const REQUIRED_PAYLOAD_FIELDS = [
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
  "project_materials",
  "track_url_setting",
  "brand_info"
];

const FORBIDDEN_PATHS = new Set([
  "brand_info.ecom_brand_id",
  "asset_ids",
  "delivery_range",
  "delivery_setting",
  "inventory_catalog",
  "micro_app_instance_id",
  "product_info",
  "app_id",
  "project_materials.dynamic_creative_switch",
  "project_materials.aigc_dynamic_creative_switch",
  "project_materials.video_material_list[].material_id",
  "project_materials.image_material_list[].material_id",
  "project_materials.image_material_list[].width",
  "project_materials.image_material_list[].height"
]);

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function clean(value) {
  return String(value ?? "").trim();
}

function isPlaceholderId(value) {
  return !value || /^PLACEHOLDER/i.test(String(value));
}

function intOrNull(value) {
  const text = clean(value);
  return /^\d+$/.test(text) ? Number(text) : null;
}

function requiredString(value) {
  const text = clean(value);
  return text || "";
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function normalizedPaths(value, prefix = "") {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) {
    return value.flatMap((child) => normalizedPaths(child, `${prefix}[]`));
  }
  return Object.entries(value).flatMap(([key, child]) => {
    const nextPath = prefix ? `${prefix}.${key}` : key;
    return [
      nextPath,
      ...(child && typeof child === "object" ? normalizedPaths(child, nextPath) : [])
    ];
  });
}

function resource(resources = [], type) {
  return resources.find((item) => item.resource_type === type) || {};
}

function metadataValue(resources, type, paths = []) {
  const source = resource(resources, type);
  for (const dotted of paths) {
    let cursor = source;
    for (const part of dotted.split(".")) cursor = cursor?.[part];
    if (cursor !== undefined && cursor !== null && cursor !== "") return cursor;
  }
  return "";
}

function titleMaterials(bundle = {}) {
  const gameName = clean(bundle.game?.game_name || bundle.game?.product_name || "巨兽战场");
  const materialItems = Array.isArray(bundle.materialPack?.items) ? bundle.materialPack.items : [];
  const names = materialItems
    .map((entry) => clean(entry.asset?.asset_name))
    .filter((title) => title.length >= 5 && title.length <= 30);
  return [...new Set([
    `来${gameName}开荒`,
    `${gameName}福利开局`,
    ...names
  ])].slice(0, 30).map((title) => ({ title }));
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

function buildCreatePayload({ bundle, touchpointUrl }) {
  const summary = bundle.draft?.payload_summary || {};
  const resources = bundle.resources || [];
  const brand = summary.brand_info || {};
  const eventAssetId = intOrNull(resource(resources, "event_asset").platform_resource_id);
  const microAppInstanceId = intOrNull(metadataValue(resources, "micro_app_instance", [
    "metadata.micro_app_instance_id",
    "metadata.instance_id",
    "platform_resource_id"
  ]));
  const awemeId = requiredString(metadataValue(resources, "avatar", [
    "metadata.default_aweme_id",
    "metadata.aweme_id",
    "platform_resource_id"
  ]));
  const miniProgramUrl = requiredString(metadataValue(resources, "micro_app_instance", [
    "metadata.mini_program_url",
    "metadata.launch_url",
    "metadata.byte_mini_game_launch_url"
  ]));
  const productImageId = requiredString(resource(resources, "product_image").platform_resource_id);
  const videos = videoMaterials(bundle);

  return {
    advertiser_id: clean(summary.advertiser_id),
    name: clean(summary.project_name),
    ad_type: "ALL",
    landing_type: "MICRO_GAME",
    marketing_goal: "VIDEO_AND_IMAGE",
    external_action: clean(summary.objective),
    deep_external_action: clean(summary.deep_objective),
    native_type: "AWEME",
    aweme_id: awemeId,
    delivery_mode: "PROCEDURAL",
    delivery_type: "NORMAL",
    delivery_medium: "BYTE_GAME",
    micro_promotion_type: "BYTE_GAME",
    instance_id: microAppInstanceId,
    asset_id: eventAssetId,
    schedule_type: "SCHEDULE_FROM_NOW",
    bid_type: "CUSTOM",
    budget_mode: "BUDGET_MODE_DAY",
    budget: Number(summary.budget || 0),
    pricing: "PRICING_OCPM",
    cpa_bid: Number(summary.bid || 0),
    roi_goal: Number(summary.roi_goal || 0),
    deep_bid_type: clean(summary.deep_bid_type),
    audience_type: "CUSTOM",
    audience: {
      district: "NONE",
      gender: "NONE",
      age: [],
      converted_time_duration: "SIX_MONTH",
      hide_if_converted: clean(summary.objective),
      interest_action_mode: "UNLIMITED"
    },
    brand_info: {
      brand_name_id: intOrNull(brand.brand_name_id),
      cdp_brand_id: intOrNull(brand.cdp_brand_id),
      cdp_brand_name: clean(brand.cdp_brand_name),
      yuntu_category_id: intOrNull(brand.yuntu_category_id)
    },
    project_materials: {
      title_material_list: titleMaterials(bundle),
      video_material_list: videos,
      image_material_list: [],
      source: clean(bundle.game?.brand_name || bundle.game?.game_name || "巨兽战场").slice(0, 10),
      mini_program_info: {
        app_id: clean(summary.platform_app_id),
        url: miniProgramUrl
      },
      product_info: {
        titles: [clean(bundle.game?.product_name || bundle.game?.game_name || "巨兽战场")],
        image_ids: [productImageId].filter(Boolean),
        selling_points: ["策略开荒", "巨兽养成", "联盟对战"]
      },
      call_to_action_buttons: ["立即试玩"],
      anchor_related_type: "OFF"
    },
    track_url_setting: {
      send_type: "SERVER_SEND",
      action_track_url: [touchpointUrl]
    },
    aigc_dynamic_creative_switch: "OFF",
    layer_roi_switch: "OFF",
    is_comment_disable: "OFF"
  };
}

function payloadBlockers(payload = {}) {
  const missing = REQUIRED_PAYLOAD_FIELDS.filter((field) => {
    const value = payload[field];
    return value === "" || value === null || value === undefined || (Array.isArray(value) && !value.length);
  });
  const forbidden = normalizedPaths(payload)
    .map((pathName) => pathName.replace(/\[\]\.\d+/g, "[]"))
    .filter((pathName) => FORBIDDEN_PATHS.has(pathName));
  const semantic = [
    ...(!payload.asset_id ? ["asset_id_missing_or_not_integer"] : []),
    ...(!payload.instance_id ? ["micro_app_instance_id_missing_or_not_integer"] : []),
    ...(!payload.aweme_id ? ["aweme_id_missing"] : []),
    ...(!payload.project_materials?.mini_program_info?.url ? ["mini_program_url_missing"] : []),
    ...(!payload.track_url_setting?.action_track_url?.length ? ["touchpoint_url_missing_controlled_payload"] : []),
    ...(!payload.project_materials?.product_info?.image_ids?.length ? ["product_image_id_missing"] : []),
    ...(!payload.project_materials?.video_material_list?.length ? ["video_material_list_missing"] : []),
    ...((payload.project_materials?.video_material_list || []).some((item) => !item.video_id) ? ["video_id_missing"] : []),
    ...((payload.project_materials?.video_material_list || []).some((item) => !item.video_cover_id) ? ["video_cover_id_missing"] : []),
    ...(!payload.project_materials?.title_material_list?.length ? ["title_material_list_missing"] : []),
    ...(!payload.brand_info?.brand_name_id || !payload.brand_info?.cdp_brand_id || !payload.brand_info?.yuntu_category_id ? ["brand_info_integer_fields_missing"] : [])
  ];
  return [
    ...missing.map((field) => `payload_required_missing:${field}`),
    ...forbidden.map((field) => `payload_forbidden_field:${field}`),
    ...semantic
  ];
}

function redactedPayloadSummary(payload = {}) {
  return {
    advertiser_id: clean(payload.advertiser_id),
    name: clean(payload.name),
    brand_info_present: Boolean(payload.brand_info),
    brand_info_has_ecom_brand_id: Object.prototype.hasOwnProperty.call(payload.brand_info || {}, "ecom_brand_id"),
    event_asset_id_present: Boolean(payload.asset_id),
    micro_app_instance_id_present: Boolean(payload.instance_id),
    aweme_id_present: Boolean(payload.aweme_id),
    mini_program_url_present: Boolean(payload.project_materials?.mini_program_info?.url),
    touchpoint_url_present: Boolean(payload.track_url_setting?.action_track_url?.length),
    product_image_id_present: Boolean(payload.project_materials?.product_info?.image_ids?.length),
    video_material_count: payload.project_materials?.video_material_list?.length || 0,
    video_id_ready_count: (payload.project_materials?.video_material_list || []).filter((item) => item.video_id).length,
    video_cover_ready_count: (payload.project_materials?.video_material_list || []).filter((item) => item.video_cover_id).length,
    title_material_count: payload.project_materials?.title_material_list?.length || 0,
    payload_fingerprint: `sha256:${sha256(canonicalJson(payload))}`
  };
}

function attemptPath(jobId) {
  return path.join(LOCAL_DIR, `std-project-create-attempt-${jobId}.json`);
}

function readAttempt(jobId) {
  const file = attemptPath(jobId);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return { status: "attempt_file_unreadable" };
  }
}

function writeAttempt(jobId, data) {
  mkdirSync(LOCAL_DIR, { recursive: true });
  writeFileSync(attemptPath(jobId), `${JSON.stringify(data, null, 2)}\n`, { encoding: "utf8" });
}

function extractApiCode(payload = {}) {
  return clean(payload.code ?? payload.err_no ?? payload.error_code ?? "");
}

function extractRequestId(payload = {}) {
  return clean(payload.request_id || payload.data?.request_id || "");
}

function extractStdProjectId(payload = {}) {
  return clean(
    payload.data?.project_id ||
    payload.data?.std_project_id ||
    payload.data?.id ||
    payload.project_id ||
    payload.std_project_id ||
    ""
  );
}

function summarizeListPayload(payload = {}, projectName = "") {
  const data = payload.data || {};
  const list = data.list || data.items || data.projects || [];
  const items = Array.isArray(list) ? list : [];
  const match = items.find((item) => clean(item.name || item.project_name || item.std_project_name) === projectName) || items[0] || {};
  return {
    apiCode: extractApiCode(payload),
    requestIdPresent: Boolean(extractRequestId(payload)),
    listCount: items.length,
    objectId: clean(match.project_id || match.std_project_id || match.id || ""),
    objectName: clean(match.name || match.project_name || match.std_project_name || ""),
    objectStatus: clean(match.status || match.project_status || match.opt_status || ""),
    objectNameMatches: projectName ? clean(match.name || match.project_name || match.std_project_name) === projectName : false
  };
}

export async function prepareStdProjectCreate({ repo, jobId = TARGET_STD_PROJECT_CREATE.jobId } = {}) {
  const bundle = await repo.getLaunchJobBundle(jobId);
  if (!bundle) throw new Error("target_job_not_found");

  const touchpoint = await repo.getControlledTouchpointUrl({
    routeId: bundle.job.route_id,
    gameCode: bundle.job.game_code,
    advertiserId: bundle.job.advertiser_id,
    monitorId: bundle.account.monitor_id
  });
  const touchpointVerification = await repo.getTouchpointVerification({
    routeId: bundle.job.route_id,
    gameCode: bundle.job.game_code,
    advertiserId: bundle.job.advertiser_id,
    monitorId: bundle.account.monitor_id
  });
  const contract = evaluateStdProjectPayloadContract({ bundle, draft: bundle.draft, touchpointVerification });
  const payloadHashStable = stablePayloadHash(bundle.draft?.payload_summary || {}) === bundle.draft?.payload_hash;
  const payload = buildCreatePayload({ bundle, touchpointUrl: touchpoint?.touchpoint_url || "" });
  const blockers = [
    ...(bundle.job.job_id !== TARGET_STD_PROJECT_CREATE.jobId ? ["target_job_mismatch"] : []),
    ...(bundle.draft?.draft_id !== TARGET_STD_PROJECT_CREATE.draftId ? ["target_draft_mismatch"] : []),
    ...(bundle.job.route_id !== TARGET_STD_PROJECT_CREATE.routeId ? ["target_route_mismatch"] : []),
    ...(bundle.job.game_code !== TARGET_STD_PROJECT_CREATE.gameCode ? ["target_game_code_mismatch"] : []),
    ...(bundle.job.advertiser_id !== TARGET_STD_PROJECT_CREATE.advertiserId ? ["target_advertiser_mismatch"] : []),
    ...(bundle.draft?.project_name !== TARGET_STD_PROJECT_CREATE.projectName ? ["target_project_name_mismatch"] : []),
    ...(bundle.draft?.payload_hash !== TARGET_STD_PROJECT_CREATE.payloadHash ? ["target_payload_hash_mismatch"] : []),
    ...(!payloadHashStable ? ["payload_hash_not_stable"] : []),
    ...(bundle.draft?.duplicate_status !== "platform_not_duplicate" ? ["duplicate_status_not_platform_not_duplicate"] : []),
    ...(contract.status !== "passed" ? contract.gaps.map((gap) => `payload_contract:${gap.key}`) : []),
    ...(!touchpoint?.touchpoint_url ? ["controlled_touchpoint_url_missing"] : []),
    ...(!touchpointVerification.urlHashMatches ? ["touchpoint_hash_mismatch"] : []),
    ...(!isPlaceholderId(bundle.readback?.object_id) ? ["real_readback_record_already_exists"] : []),
    ...payloadBlockers(payload)
  ];

  return {
    ready: blockers.length === 0,
    blockers,
    bundle,
    payload,
    redactedPayloadSummary: redactedPayloadSummary(payload),
    payloadContractStatus: contract.status,
    payloadHashStable
  };
}

export async function readbackStdProjectOnce({ repo, jobId = TARGET_STD_PROJECT_CREATE.jobId, fetchImpl = globalThis.fetch } = {}) {
  const bundle = await repo.getLaunchJobBundle(jobId);
  if (!bundle) throw new Error("target_job_not_found");
  const credentialSummary = getOceanEngineCredentialSummary();
  if (!credentialReady(credentialSummary)) {
    return { status: "credential_required", blockers: credentialSummary.blockers };
  }
  const env = readOceanEngineEnv().env;
  const url = new URL(`${API_BASE}${LIST_ENDPOINT}`);
  url.searchParams.set("advertiser_id", TARGET_STD_PROJECT_CREATE.advertiserId);
  url.searchParams.set("filtering", JSON.stringify({ name: TARGET_STD_PROJECT_CREATE.projectName }));
  url.searchParams.set("page", "1");
  url.searchParams.set("page_size", "20");
  const response = await fetchImpl(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Access-Token": env.OCEANENGINE_ACCESS_TOKEN
    }
  });
  const text = await response.text();
  let payload = {};
  try {
    payload = JSON.parse(text);
  } catch {
    payload = {};
  }
  const summary = summarizeListPayload(payload, TARGET_STD_PROJECT_CREATE.projectName);
  const evidenceRef = `EV-${jobId}-STD-PROJECT-READBACK-ONCE`;
  await repo.upsertEvidence({
    artifactId: evidenceRef,
    jobId,
    artifactType: "std_project_readback_once",
    title: "std_project readback once",
    summary: `endpoint=std_project/list http=${response.status} api_code=${summary.apiCode || "unknown"} request_id_present=${summary.requestIdPresent} object_id_present=${Boolean(summary.objectId)} object_name_matches=${summary.objectNameMatches}`,
    contentHash: `sha256:${sha256(text)}`,
    storageRef: "postgres:evidence_artifacts:redacted_summary_only",
    sourceRef: "oceanengine:/open_api/v3.0/std_project/list/"
  });
  if (summary.objectId && summary.objectNameMatches) {
    await repo.upsertCreatedObject({
      createdObjectId: `CO-${jobId}-STD-PROJECT-${summary.objectId}`,
      jobId,
      objectType: "std_project",
      objectId: summary.objectId,
      objectName: summary.objectName,
      objectStatus: summary.objectStatus || "readable",
      readbackStatus: "readback_verified",
      evidenceRef,
      readbackAt: new Date().toISOString(),
      metadata: {
        readback_source: "oceanengine_std_project_list",
        object_name_matches_draft: true
      }
    });
    await repo.upsertReadbackRecord({
      readbackId: `RB-${jobId}-STD-PROJECT-REAL`,
      jobId,
      objectType: "std_project",
      objectId: summary.objectId,
      objectName: summary.objectName,
      readbackStatus: "readback_verified",
      fieldDiffSummary: {
        object_name_matches_draft: true,
        object_status: summary.objectStatus || "readable",
        source: "oceanengine_std_project_list"
      },
      evidenceRef
    });
    await repo.updateNodeRun(jobId, "readback_closer", {
      status: "passed",
      summary: "真实 std_project 已 readback 验证，对象名等于草稿项目名。",
      diagnosticLevel: "info",
      evidenceRefs: [evidenceRef],
      outputSummary: {
        output: "readback_verified",
        objectNameSource: "launch_drafts.project_name",
        objectNameMatchesDraft: true,
        realObjectIdPresent: true,
        evidenceRef
      }
    });
  }
  return {
    status: summary.objectId && summary.objectNameMatches ? "readback_verified" : "not_found_or_mismatch",
    httpStatus: response.status,
    apiCode: summary.apiCode,
    requestIdPresent: summary.requestIdPresent,
    objectId: summary.objectId,
    objectName: summary.objectName,
    objectStatus: summary.objectStatus,
    objectNameMatches: summary.objectNameMatches,
    evidenceRef
  };
}

export async function createStdProjectOnce({ repo, fetchImpl = globalThis.fetch, allowNetworkWrite = false } = {}) {
  const confirmValue = process.env[STD_PROJECT_CREATE_CONFIRM_ENV] || "";
  const credentialSummary = getOceanEngineCredentialSummary();
  const existingAttempt = readAttempt(TARGET_STD_PROJECT_CREATE.jobId);
  const prepared = await prepareStdProjectCreate({ repo, jobId: TARGET_STD_PROJECT_CREATE.jobId });
  const blockers = [
    ...(confirmValue !== STD_PROJECT_CREATE_CONFIRM_VALUE ? ["confirm_variable_missing_or_invalid"] : []),
    ...(!credentialReady(credentialSummary) ? credentialSummary.blockers.map((item) => `credential:${item}`) : []),
    ...(existingAttempt ? ["std_project_create_attempt_already_recorded"] : []),
    ...(!prepared.ready ? prepared.blockers : []),
    ...(!allowNetworkWrite ? ["network_write_not_enabled_by_caller"] : [])
  ];
  if (blockers.length) {
    return {
      status: "blocked_before_create",
      createCalled: false,
      blockers,
      credentialStatus: credentialSummary.status,
      redactedPayloadSummary: prepared.redactedPayloadSummary
    };
  }

  const env = readOceanEngineEnv().env;
  const attemptId = randomUUID();
  const confirmationId = `CONFIRM-${TARGET_STD_PROJECT_CREATE.jobId}-STD-PROJECT-CREATE-ONCE`;
  const actionId = `ACTION-${TARGET_STD_PROJECT_CREATE.jobId}-STD-PROJECT-CREATE-ONCE`;
  const requestHash = `sha256:${sha256(canonicalJson(prepared.payload))}`;
  await repo.upsertLaunchConfirmation({
    confirmationId,
    jobId: TARGET_STD_PROJECT_CREATE.jobId,
    draftId: TARGET_STD_PROJECT_CREATE.draftId,
    objectType: TARGET_STD_PROJECT_CREATE.objectType,
    objectName: TARGET_STD_PROJECT_CREATE.projectName,
    payloadHash: TARGET_STD_PROJECT_CREATE.payloadHash,
    confirmationStatus: "confirmed_for_single_create",
    confirmVariable: `${STD_PROJECT_CREATE_CONFIRM_ENV}=${STD_PROJECT_CREATE_CONFIRM_VALUE}`,
    metadata: {
      maximum_actions: 1,
      retry_allowed: false,
      raw_payload_stored: false,
      raw_response_stored: false
    }
  });
  await repo.upsertPlatformAction({
    actionId,
    jobId: TARGET_STD_PROJECT_CREATE.jobId,
    confirmationId,
    actionType: "oceanengine_std_project_create",
    endpoint: "/open_api/v3.0/std_project/create/",
    method: "POST",
    actionStatus: "started",
    attemptNo: 1,
    requestHash,
    metadata: {
      target_project_name: TARGET_STD_PROJECT_CREATE.projectName,
      raw_payload_stored: false,
      raw_response_stored: false
    }
  });
  writeAttempt(TARGET_STD_PROJECT_CREATE.jobId, {
    attemptId,
    status: "network_attempt_started",
    endpoint: "oceanengine:/open_api/v3.0/std_project/create/",
    jobId: TARGET_STD_PROJECT_CREATE.jobId,
    projectName: TARGET_STD_PROJECT_CREATE.projectName,
    startedAt: new Date().toISOString()
  });

  const response = await fetchImpl(`${API_BASE}${CREATE_ENDPOINT}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "Access-Token": env.OCEANENGINE_ACCESS_TOKEN
    },
    body: JSON.stringify(prepared.payload)
  });
  const text = await response.text();
  let payload = {};
  try {
    payload = JSON.parse(text);
  } catch {
    payload = {};
  }
  const apiCode = extractApiCode(payload);
  const requestIdPresent = Boolean(extractRequestId(payload));
  const stdProjectId = extractStdProjectId(payload);
  const responseHash = `sha256:${sha256(text)}`;
  const passed = response.ok && (apiCode === "0" || apiCode === "") && Boolean(stdProjectId);
  const evidenceRef = `EV-${TARGET_STD_PROJECT_CREATE.jobId}-STD-PROJECT-CREATE-ONCE`;
  await repo.upsertPlatformAction({
    actionId,
    jobId: TARGET_STD_PROJECT_CREATE.jobId,
    confirmationId,
    actionType: "oceanengine_std_project_create",
    endpoint: "/open_api/v3.0/std_project/create/",
    method: "POST",
    actionStatus: passed ? "succeeded" : "failed_or_unconfirmed",
    attemptNo: 1,
    requestHash,
    responseHash,
    httpStatus: response.status,
    apiCode: apiCode || "unknown",
    requestIdPresent,
    objectIdPresent: Boolean(stdProjectId),
    errorSummary: passed ? "" : "platform_create_response_not_confirmed",
    finishedAt: new Date().toISOString(),
    metadata: {
      target_project_name: TARGET_STD_PROJECT_CREATE.projectName,
      raw_payload_stored: false,
      raw_response_stored: false
    }
  });

  writeAttempt(TARGET_STD_PROJECT_CREATE.jobId, {
    attemptId,
    status: passed ? "create_response_id_present" : "create_response_failed_or_unconfirmed",
    endpoint: "oceanengine:/open_api/v3.0/std_project/create/",
    jobId: TARGET_STD_PROJECT_CREATE.jobId,
    projectName: TARGET_STD_PROJECT_CREATE.projectName,
    httpStatus: response.status,
    apiCode: apiCode || "unknown",
    requestIdPresent,
    stdProjectIdPresent: Boolean(stdProjectId),
    responseHash,
    finishedAt: new Date().toISOString()
  });

  await repo.upsertEvidence({
    artifactId: evidenceRef,
    jobId: TARGET_STD_PROJECT_CREATE.jobId,
    artifactType: passed ? "std_project_create_once" : "std_project_create_once_failed",
    title: "std_project create once",
    summary: `endpoint=std_project/create http=${response.status} api_code=${apiCode || "unknown"} request_id_present=${requestIdPresent} std_project_id_present=${Boolean(stdProjectId)} response_hash_present=true`,
    contentHash: responseHash,
    storageRef: "postgres:evidence_artifacts:redacted_summary_only",
    sourceRef: "oceanengine:/open_api/v3.0/std_project/create/"
  });

  if (!passed) {
    return {
      status: "create_failed_stop_for_manual_review",
      createCalled: true,
      httpStatus: response.status,
      apiCode,
      requestIdPresent,
      stdProjectId: "",
      evidenceRef,
      nextAction: "只读查重判断是否已创建成功；不得自动第二次创建。"
    };
  }

  await repo.upsertReadbackRecord({
    readbackId: `RB-${TARGET_STD_PROJECT_CREATE.jobId}-STD-PROJECT-REAL`,
    jobId: TARGET_STD_PROJECT_CREATE.jobId,
    objectType: "std_project",
    objectId: stdProjectId,
    objectName: TARGET_STD_PROJECT_CREATE.projectName,
    readbackStatus: "created_pending_readback",
    fieldDiffSummary: {
      create_response_id_present: true,
      source: "oceanengine_std_project_create"
    },
    evidenceRef
  });
  await repo.upsertCreatedObject({
    createdObjectId: `CO-${TARGET_STD_PROJECT_CREATE.jobId}-STD-PROJECT-${stdProjectId}`,
    jobId: TARGET_STD_PROJECT_CREATE.jobId,
    confirmationId,
    actionId,
    objectType: "std_project",
    objectId: stdProjectId,
    objectName: TARGET_STD_PROJECT_CREATE.projectName,
    objectStatus: "created_pending_readback",
    readbackStatus: "pending",
    evidenceRef,
    metadata: {
      create_response_id_present: true,
      raw_payload_stored: false,
      raw_response_stored: false
    }
  });
  await repo.updateNodeRun(TARGET_STD_PROJECT_CREATE.jobId, "std_project_draft_builder", {
    status: "passed",
    summary: "创建草稿已确认，payload hash 未变化。",
    diagnosticLevel: "info",
    outputSummary: { payloadHashStable: true }
  });
  await repo.updateNodeRun(TARGET_STD_PROJECT_CREATE.jobId, "std_project_create_executor", {
    status: "passed",
    summary: "真实 std_project/create 已单次执行，返回真实 std_project_id。",
    diagnosticLevel: "info",
    evidenceRefs: [evidenceRef],
    outputSummary: {
      output: "created_object",
      createNodeStatus: "created_once",
      realObjectIdPresent: true,
      nextConfirmationRequired: false,
      writeActionCount: 1,
      evidenceRef
    }
  });

  const readback = await readbackStdProjectOnce({ repo, jobId: TARGET_STD_PROJECT_CREATE.jobId, fetchImpl });
  return {
    status: readback.status === "readback_verified" ? "created_and_readback_verified" : "created_readback_not_verified",
    createCalled: true,
    httpStatus: response.status,
    apiCode,
    requestIdPresent,
    stdProjectId,
    projectName: TARGET_STD_PROJECT_CREATE.projectName,
    evidenceRef,
    readback
  };
}
