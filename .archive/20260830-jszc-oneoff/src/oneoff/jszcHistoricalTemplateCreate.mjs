import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildOe3StdProjectPayload } from "../workflows/skills/oe3/05-payload.mjs";
import { buildStdProjectCreateWireBody } from "../workflows/skills/oe3/05-std-project-create-wire-body.mjs";
import { createOceanEngineReadonlyClient } from "../platforms/oceanengineReadonlyClient.mjs";
import { credentialReady, getOceanEngineCredentialSummary, readOceanEngineEnv } from "../platforms/oceanengineCredentialStore.mjs";
import { readbackStdProjectOnce, safePlatformErrorSummary } from "../platforms/oceanengineStdProjectCreateExecutor.mjs";
import { revokeWriteScope } from "../workflows/executionGrantScope.mjs";

const rootDir = normalize(join(dirname(fileURLToPath(import.meta.url)), "../.."));
const defaultProjectStatePath = join(rootDir, "project.state.json");
const API_BASE = "https://api.oceanengine.com";
const CREATE_ENDPOINT = "/open_api/v3.0/std_project/create/";
export const ONEOFF_CONFIRM_ENV = "MWBV2_OE_HISTORICAL_TEMPLATE_CREATE_CONFIRM";
export const ONEOFF_CONFIRM_VALUE = "CREATE_ONE_HISTORICAL_TEMPLATE";
export const ONEOFF_CASE_KEY = "jszc-historical-template-oneoff-20260830";
export const HISTORICAL_PROJECT_NAME = "245791_N_JSZC_HUNT_PAY7DROI_平台定向不限_P01_20260817";

const HISTORY = Object.freeze({
  schedule_time: "000000000000000000111111111111111111111111111111000000000000000000111111111111111111111111111111000000000000000000111111111111111111111111111111000000000000000000001111111111111111111111111111000000000000000000111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111",
  titles: ["开局一把枪，装备全靠捡，看你能射多远！", "3分钟上手，5分钟上头，来试试你能过多少关卡！", "2026超魔性的休闲策略小游戏，无需下载，点开即玩！"],
  selling_points: ["开局装备全靠捡", "三分钟快速上手", "无需下载点开即玩"],
  ctas: ["进入游戏", "点击即玩", "打开游戏", "无需下载"],
  age: ["AGE_BETWEEN_24_30", "AGE_BETWEEN_31_40", "AGE_BETWEEN_41_49", "AGE_ABOVE_50"]
});

function clean(value) {
  return String(value ?? "").trim();
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(String(value)).digest("hex")}`;
}

function safeInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function resourceReady(resource = {}) {
  const readonly = clean(resource.metadata?.readonly_check?.status);
  return resource.visibility_status === "visible" &&
    resource.readback_status === "readback_verified" &&
    ["passed", "passed_by_manual_confirmation"].includes(readonly);
}

function resource(bundle, type) {
  return (bundle.resources || []).find((item) => item.resource_type === type) || {};
}

function historicalVideoMaterials(bundle = {}) {
  return (bundle.materialPack?.items || [])
    .filter((entry) => entry.item?.item_type === "video_asset" && entry.item?.required === true)
    .map((entry) => ({
      image_mode: "CREATIVE_IMAGE_MODE_VIDEO_VERTICAL",
      video_id: clean(entry.asset?.metadata?.video_id || entry.asset?.metadata?.platform_video_id),
      video_cover_id: clean(entry.asset?.metadata?.video_cover_id || entry.asset?.metadata?.cover_id)
    }))
    .filter((item) => item.video_id && item.video_cover_id);
}

function historicalManifest(payload = {}, { sources = {}, blockers = [], duplicate = {} } = {}) {
  const materials = payload.project_materials || {};
  return {
    kind: "jszc_historical_template_oneoff_manifest",
    historical_reference: "docs/.问题排查/3.0项目创建排查对比/巨量营销3.0-标准项目-7675218401040220179-创建字段参数.md",
    project_name: payload.name || "",
    field_paths: [
      "advertiser_id", "name", "ad_type", "landing_type", "marketing_goal", "external_action", "deep_external_action",
      "native_type", "aweme_id", "delivery_mode", "delivery_type", "delivery_medium", "micro_promotion_type", "instance_id",
      "asset_id", "schedule_type", "schedule_time", "bid_type", "budget_mode", "budget", "pricing", "cpa_bid", "roi_goal",
      "deep_bid_type", "audience_type", "audience", "brand_info", "project_materials", "track_url_setting",
      "aigc_dynamic_creative_switch", "layer_roi_switch", "is_comment_disable"
    ],
    history_values_locked: {
      budget: payload.budget,
      cpa_bid: payload.cpa_bid,
      roi_goal: payload.roi_goal,
      schedule_time_length: clean(payload.schedule_time).length,
      title_count: materials.title_material_list?.length || 0,
      video_count: materials.video_material_list?.length || 0,
      external_url_material_list_present: Object.hasOwn(materials, "external_url_material_list"),
      mini_program_info_keys: Object.keys(materials.mini_program_info || {}).sort()
    },
    current_account_sources: sources,
    duplicate_check: duplicate,
    blockers: [...new Set(blockers)],
    raw_payload_stored: false,
    raw_response_stored: false,
    complete_url_stored: false
  };
}

function currentSourceSummary(bundle = {}, payload = {}, controlled = {}) {
  const materials = payload.project_materials || {};
  return {
    advertiser_id: "current_task_scope",
    aweme_id: "game_route_defaults.aweme_id_baseline + advertiser_accounts.aweme_authorization",
    asset_id: "account_resources:event_asset",
    instance_id: "account_resources:micro_app_instance",
    brand_info: "account_resources:brand_info",
    dmp_exclusions: "account_resources:dmp_audience_package",
    video_material_list: "current_material_pack + account_resources:video_asset",
    product_image: "account_resources:product_image",
    mini_program_app_id: "game_platform_apps + game_route_launch_links",
    mini_program_url_hash: controlled.launch_url ? sha256(controlled.launch_url) : "",
    touchpoint_url_hash: controlled.touchpoint_url ? sha256(controlled.touchpoint_url) : "",
    account_id_matches_payload: clean(bundle.job?.advertiser_id) === clean(payload.advertiser_id),
    complete_url_stored: false
  };
}

export function buildHistoricalTemplatePayload({ bundle = {}, touchpointUrl = "", launchLink = {} } = {}) {
  const base = buildOe3StdProjectPayload({
    bundle,
    touchpointUrl,
    miniProgramLaunchLink: launchLink,
    backupLandingPageUrl: {}
  }).payload;
  const blockers = [];
  const event = resource(bundle, "event_asset");
  const instance = resource(bundle, "micro_app_instance");
  const brand = resource(bundle, "brand_info");
  const dmp = resource(bundle, "dmp_audience_package");
  const productImage = resource(bundle, "product_image");
  const videos = (bundle.resources || []).filter((item) => item.resource_type === "video_asset");
  const historicalVideos = historicalVideoMaterials(bundle);
  const appId = clean(bundle.platformApp?.app_id);
  const launchUrl = clean(launchLink.launch_url);
  const awemeId = clean(bundle.defaults?.raw_defaults?.aweme_id_baseline?.default_aweme_id);
  const awemeAuthorization = bundle.account?.aweme_authorization || {};
  const payload = {
    ...base,
    advertiser_id: clean(bundle.job?.advertiser_id),
    name: HISTORICAL_PROJECT_NAME,
    ad_type: "ALL",
    landing_type: "MICRO_GAME",
    marketing_goal: "VIDEO_AND_IMAGE",
    external_action: "AD_CONVERT_TYPE_PAY",
    deep_external_action: "AD_CONVERT_TYPE_PURCHASE_ROI_7D",
    native_type: "AWEME",
    aweme_id: awemeId,
    delivery_mode: "PROCEDURAL",
    delivery_type: "NORMAL",
    delivery_medium: "BYTE_GAME",
    micro_promotion_type: "BYTE_GAME",
    schedule_type: "SCHEDULE_FROM_NOW",
    schedule_time: HISTORY.schedule_time,
    bid_type: "CUSTOM",
    budget_mode: "BUDGET_MODE_DAY",
    budget: 88888,
    pricing: "PRICING_OCPM",
    cpa_bid: 488,
    roi_goal: 0.088,
    deep_bid_type: "PER_AND_SEVEN_PAY_ROI",
    audience_type: "CUSTOM",
    audience: {
      district: "NONE",
      gender: "GENDER_MALE",
      age: HISTORY.age,
      android_osv: "NONE",
      ios_osv: "NONE",
      harmony_osv: "NONE",
      converted_time_duration: "SIX_MONTH",
      hide_if_converted: "ORGANIZATION",
      interest_action_mode: "UNLIMITED",
      retargeting_tags_exclude: base.audience?.retargeting_tags_exclude || []
    },
    project_materials: {
      title_material_list: HISTORY.titles.map((title) => ({ title })),
      video_material_list: historicalVideos,
      image_material_list: [],
      source: "巨兽战场",
      mini_program_info: { app_id: appId, url: launchUrl },
      product_info: {
        titles: ["巨兽战场"],
        image_ids: base.project_materials?.product_info?.image_ids || [],
        selling_points: HISTORY.selling_points
      },
      call_to_action_buttons: HISTORY.ctas,
      anchor_related_type: "OFF"
    },
    track_url_setting: { send_type: "SERVER_SEND", action_track_url: [clean(touchpointUrl)] },
    aigc_dynamic_creative_switch: "OFF",
    layer_roi_switch: "OFF",
    is_comment_disable: "OFF"
  };
  delete payload.audience.filter_event;
  delete payload.project_materials.external_url_material_list;

  const checks = [
    ["current_advertiser_id_missing", /^\d+$/.test(payload.advertiser_id)],
    ["aweme_id_missing", /^\d+$/.test(clean(payload.aweme_id))],
    ["aweme_authorization_not_verified", clean(awemeAuthorization.verification_status) === "authorized" && clean(awemeAuthorization.default_aweme_id_hash) === sha256(awemeId)],
    ["event_asset_not_ready", resourceReady(event) && safeInteger(payload.asset_id)],
    ["micro_app_instance_not_ready", resourceReady(instance) && /^\d+$/.test(clean(payload.instance_id))],
    ["brand_info_not_ready", resourceReady(brand) && Object.values(payload.brand_info || {}).every(Boolean)],
    ["dmp_audience_not_ready", resourceReady(dmp) && payload.audience.retargeting_tags_exclude.length > 0],
    ["product_image_not_ready", resourceReady(productImage) && payload.project_materials.product_info.image_ids.length > 0],
    ["video_materials_not_ready", videos.filter(resourceReady).length >= 2 && payload.project_materials.video_material_list.length === 2 && payload.project_materials.video_material_list.every((item) => clean(item.video_id) && clean(item.video_cover_id))],
    ["mini_program_app_id_missing", /^tt[A-Za-z0-9]+$/.test(appId)],
    ["mini_program_launch_url_missing", /^sslocal:\/\/microgame/.test(launchUrl)],
    ["touchpoint_url_missing", /^https?:\/\//.test(clean(touchpointUrl))],
    ["historical_schedule_invalid", payload.schedule_time.length === 336],
    ["historical_external_url_must_be_omitted", !Object.hasOwn(payload.project_materials, "external_url_material_list")]
  ];
  checks.forEach(([code, passed]) => { if (!passed) blockers.push(code); });
  const wire = buildStdProjectCreateWireBody(payload);
  blockers.push(...wire.blockers);
  return {
    payload,
    payloadHash: wire.requestHash,
    wire,
    blockers: [...new Set(blockers)],
    sources: currentSourceSummary(bundle, payload, { launch_url: launchUrl, touchpoint_url: touchpointUrl })
  };
}

async function duplicateCheck({ advertiserId, projectName, client }) {
  const probe = await client.get({
    label: "oneoff_historical_template_duplicate",
    endpoint: "/open_api/v3.0/std_project/list/",
    query: { advertiser_id: advertiserId, filtering: JSON.stringify({ name: projectName }), page: "1", page_size: "20" },
    summarize: (payload) => {
      const items = payload.data?.list || payload.data?.items || payload.data?.projects || [];
      const list = Array.isArray(items) ? items : [];
      return { duplicateFound: list.some((item) => clean(item.name || item.project_name || item.std_project_name) === projectName), listCount: list.length };
    }
  });
  return {
    status: probe.status === "passed" && !probe.summary?.duplicateFound ? "platform_not_duplicate" : "blocked",
    httpStatus: probe.httpStatus ?? null,
    apiCode: probe.apiCode || "",
    requestIdPresent: probe.requestIdPresent === true,
    duplicateFound: probe.summary?.duplicateFound === true,
    responseHash: probe.responseHash || "",
    reason: probe.gap || ""
  };
}

function oneoffIds() {
  const nonce = randomBytes(4).toString("hex").toUpperCase();
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const jobId = `JOB-MWBV2-HISTORICAL-${stamp}-${nonce}`;
  return {
    caseId: `CASE-MWBV2-HISTORICAL-${stamp}-${nonce}`,
    jobId,
    draftId: `DRAFT-${jobId}-V1`,
    planId: `PLAN-${jobId}-V1`,
    confirmationId: `CONFIRM-${jobId}-HISTORICAL-CREATE-A01`,
    actionId: `ACTION-${jobId}-HISTORICAL-CREATE-A01`,
    idempotencyKey: `IDEMP-${jobId}-HISTORICAL-TEMPLATE-CREATE-V1`
  };
}

function planFor({ ids, compiled, duplicate }) {
  const ready = compiled.blockers.length === 0 && duplicate.status === "platform_not_duplicate";
  const plannedActions = [{
    action_type: "std_project_create",
    target_ref: `draft:${ids.draftId}`,
    idempotency_key: ids.idempotencyKey,
    status: ready ? "ready" : "blocked",
    module_ref: "scripts/oneoff/06-jszc-historical-template-create.mjs",
    depends_on: ["historical_template_payload_hash", "target_account_readiness", "platform_duplicate_check"],
    writes_to: ["launch_confirmations", "platform_actions", "created_objects", "readback_records"],
    reason: "oneoff_historical_template_single_create"
  }];
  const blockers = [...new Set([
    ...compiled.blockers,
    ...(duplicate.status === "platform_not_duplicate" ? [] : ["platform_duplicate_check_not_passed"])
  ])];
  const planHash = sha256(JSON.stringify({ draftId: ids.draftId, payloadHash: compiled.payloadHash, plannedActions, blockers }));
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
      mode: "oneoff_historical_template_current_account_replica",
      maximum_actions: 1,
      retry_allowed: false,
      historical_project_name: HISTORICAL_PROJECT_NAME,
      execution_scope: {
        target_job_id: ids.jobId,
        target_draft_id: ids.draftId,
        target_payload_hash: compiled.payloadHash,
        target_plan_id: ids.planId,
        target_plan_hash: planHash,
        allowed_actions: ["oceanengine_std_project_create"],
        allowed_plan_actions: ["std_project_create"],
        maximum_actions: 1,
        retry_allowed: false
      },
      payload_stored: false,
      response_stored: false
    }
  };
}

export async function prepareHistoricalTemplateOneOff({ repo, client = createOceanEngineReadonlyClient() } = {}) {
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
      confirmationId: `CONFIRM-${job.job_id}-HISTORICAL-CREATE-A01`,
      actionId: `ACTION-${job.job_id}-HISTORICAL-CREATE-A01`,
      idempotencyKey: `IDEMP-${job.job_id}-HISTORICAL-TEMPLATE-CREATE-V1`
    };
  } else {
    ids = oneoffIds();
    await repo.createWorkflowCase({
      caseId: ids.caseId,
      caseKey: ONEOFF_CASE_KEY,
      routeId: "oceanengine_3_byte_mini_game",
      gameCode: "JSZC",
      advertiserId: "1871922346964041",
      businessGoal: "One-off current-account replica of the historical JSZC successful create template.",
      sourceUsage: "runtime_truth",
      metadata: { mode: "oneoff_historical_template", payload_stored: false, response_stored: false }
    });
    await repo.createLaunchJob({
      jobId: ids.jobId,
      caseId: ids.caseId,
      routeId: "oceanengine_3_byte_mini_game",
      gameCode: "JSZC",
      advertiserId: "1871922346964041",
      objectType: "std_project",
      sourceRecordRef: "historical-template-oneoff:20260830",
      sourceUsage: "runtime_truth"
    });
  }
  const bundle = await repo.getLaunchJobBundle(ids.jobId);
  const touchpoint = await repo.getControlledTouchpointUrl({ routeId: bundle.job.route_id, gameCode: bundle.job.game_code, advertiserId: bundle.job.advertiser_id, monitorId: bundle.account?.monitor_id || "" });
  const launchLink = await repo.getControlledGameRouteLaunchLink({ routeId: bundle.job.route_id, gameCode: bundle.job.game_code, platformAppId: bundle.platformApp?.id || "", appId: bundle.platformApp?.app_id || "" });
  const compiled = buildHistoricalTemplatePayload({ bundle, touchpointUrl: touchpoint?.touchpoint_url || "", launchLink: launchLink || {} });
  const duplicate = await duplicateCheck({ advertiserId: bundle.job.advertiser_id, projectName: HISTORICAL_PROJECT_NAME, client });
  const manifest = historicalManifest(compiled.payload, { sources: compiled.sources, blockers: compiled.blockers, duplicate });
  await repo.upsertDraft({
    draftId: ids.draftId,
    jobId: ids.jobId,
    objectType: "std_project",
    projectName: HISTORICAL_PROJECT_NAME,
    payloadSummary: { ...manifest, final_payload_hash: compiled.payloadHash, wire_body_hash: compiled.wire.bodyHash, payload_body_stored: false },
    payloadHash: compiled.payloadHash,
    duplicateStatus: duplicate.status,
    writePolicy: "oneoff_historical_template_single_create"
  });
  const plan = planFor({ ids, compiled, duplicate });
  await repo.upsertLaunchExecutionPlan(plan);
  await repo.upsertEvidence({
    artifactId: `EV-${ids.jobId}-HISTORICAL-TEMPLATE-PREFLIGHT`, jobId: ids.jobId, artifactType: "historical_template_preflight",
    title: "Historical template one-off preflight",
    summary: `ready=${plan.planStatus === "ready"} duplicate=${duplicate.status} blockers=${plan.blockerCodes.length} raw_payload_stored=false`,
    contentHash: sha256(JSON.stringify({ manifest, payloadHash: compiled.payloadHash, planHash: plan.planHash })),
    storageRef: "postgres:evidence_artifacts:redacted_summary_only", sourceRef: "historical:jszc_success_template", sourceUsage: "runtime_truth"
  });
  await repo.updateJob(ids.jobId, { status: plan.planStatus === "ready" ? "draft_ready" : "blocked", currentNode: "oneoff" });
  return {
    status: plan.planStatus === "ready" ? "ready_for_exact_user_confirmation" : "blocked",
    caseId: ids.caseId, jobId: ids.jobId, draftId: ids.draftId, planId: ids.planId, planHash: plan.planHash,
    payloadHash: compiled.payloadHash, projectName: HISTORICAL_PROJECT_NAME, duplicateStatus: duplicate.status,
    blockers: plan.blockerCodes, manifest, rawPayloadStored: false, rawResponseStored: false
  };
}

async function validWriteScope({ jobId, draftId, planId, planHash, payloadHash, projectStatePath }) {
  const state = JSON.parse(await readFile(projectStatePath, "utf8"));
  const scope = state.guardrails?.platform_write_scope || {};
  const blockers = [
    ...(state.guardrails?.platform_write_allowed === true ? [] : ["platform_write_scope_not_enabled"]),
    ...(scope.mode === "oneoff_historical_template_std_project_create" ? [] : ["oneoff_scope_mode_invalid"]),
    ...(scope.target_job_id === jobId ? [] : ["oneoff_scope_job_mismatch"]),
    ...(scope.target_draft_id === draftId ? [] : ["oneoff_scope_draft_mismatch"]),
    ...(scope.target_plan_id === planId ? [] : ["oneoff_scope_plan_mismatch"]),
    ...(scope.target_plan_hash === planHash ? [] : ["oneoff_scope_plan_hash_mismatch"]),
    ...(scope.target_payload_hash === payloadHash ? [] : ["oneoff_scope_payload_hash_mismatch"]),
    ...(Array.isArray(scope.allowed_actions) && scope.allowed_actions.length === 1 && scope.allowed_actions[0] === "oceanengine_std_project_create" ? [] : ["oneoff_scope_actions_invalid"]),
    ...(Number(scope.maximum_actions) === 1 ? [] : ["oneoff_scope_maximum_actions_invalid"]),
    ...(scope.retry_allowed === false ? [] : ["oneoff_scope_retry_allowed_must_be_false"])
  ];
  return { blockers, scope };
}

async function safeOneOffReadback({ repo, jobId, fetchImpl }) {
  try {
    return await readbackStdProjectOnce({ repo, jobId, fetchImpl });
  } catch (error) {
    const errorHash = sha256(clean(error?.code || error?.name || "readback_transport_error"));
    const evidenceRef = `EV-${jobId}-HISTORICAL-TEMPLATE-READBACK-TRANSPORT`;
    await repo.upsertEvidence({
      artifactId: evidenceRef,
      jobId,
      artifactType: "historical_template_readback_transport_failed",
      title: "Historical template readback transport failure",
      summary: "endpoint=std_project/list transport_failed=true raw_response_stored=false",
      contentHash: errorHash,
      storageRef: "postgres:evidence_artifacts:redacted_summary_only",
      sourceRef: "oceanengine:std_project/list",
      sourceUsage: "runtime_truth"
    });
    await repo.upsertReadbackRecord({
      readbackId: `RB-${jobId}-STD-PROJECT-REAL`,
      jobId,
      objectType: "std_project",
      objectId: "READBACK_TRANSPORT_FAILED",
      objectName: HISTORICAL_PROJECT_NAME,
      readbackStatus: "readback_transport_failed",
      fieldDiffSummary: {
        source: "oceanengine_std_project_list",
        real_platform_readback_called: true,
        transport_failed: true,
        error_hash: errorHash,
        raw_response_stored: false
      },
      evidenceRef
    });
    return { status: "readback_transport_failed", evidenceRef, errorHash };
  }
}

export async function executeHistoricalTemplateOneOff({ repo, jobId, projectStatePath = defaultProjectStatePath, fetchImpl = globalThis.fetch, client = createOceanEngineReadonlyClient() } = {}) {
  if (!repo || !jobId) throw new Error("repo_and_job_id_required");
  const bundle = await repo.getLaunchJobBundle(jobId);
  if (!bundle?.draft || !bundle.executionPlan) throw new Error("oneoff_bundle_incomplete");
  const plan = bundle.executionPlan;
  const touchpoint = await repo.getControlledTouchpointUrl({ routeId: bundle.job.route_id, gameCode: bundle.job.game_code, advertiserId: bundle.job.advertiser_id, monitorId: bundle.account?.monitor_id || "" });
  const launchLink = await repo.getControlledGameRouteLaunchLink({ routeId: bundle.job.route_id, gameCode: bundle.job.game_code, platformAppId: bundle.platformApp?.id || "", appId: bundle.platformApp?.app_id || "" });
  const compiled = buildHistoricalTemplatePayload({ bundle, touchpointUrl: touchpoint?.touchpoint_url || "", launchLink: launchLink || {} });
  const duplicate = await duplicateCheck({ advertiserId: bundle.job.advertiser_id, projectName: HISTORICAL_PROJECT_NAME, client });
  const scope = await validWriteScope({ jobId, draftId: bundle.draft.draft_id, planId: plan.plan_id, planHash: plan.plan_hash, payloadHash: compiled.payloadHash, projectStatePath });
  const credential = getOceanEngineCredentialSummary();
  const blockers = [
    ...(process.env[ONEOFF_CONFIRM_ENV] === ONEOFF_CONFIRM_VALUE ? [] : ["oneoff_confirmation_env_missing_or_invalid"]),
    ...(bundle.draft.payload_hash === compiled.payloadHash ? [] : ["payload_hash_changed_since_confirmation"]),
    ...(plan.plan_status === "ready" ? [] : ["oneoff_plan_not_ready"]),
    ...compiled.blockers,
    ...(duplicate.status === "platform_not_duplicate" ? [] : ["duplicate_check_not_platform_not_duplicate"]),
    ...scope.blockers,
    ...(credentialReady(credential) ? [] : credential.blockers.map((item) => `credential:${item}`))
  ];
  if (blockers.length) {
    await repo.updateWorkflowCaseLifecycle({ caseId: bundle.job.case_id, lifecycleStatus: "completed", metadataPatch: { oneoff_status: "blocked_before_create", blockers, payload_stored: false } });
    await revokeWriteScope(projectStatePath);
    return { status: "blocked_before_create", createCalled: false, blockers, payloadHash: compiled.payloadHash };
  }
  const action = (plan.planned_actions || []).find((item) => item.action_type === "std_project_create") || {};
  const ids = { confirmationId: `CONFIRM-${jobId}-HISTORICAL-CREATE-A01`, actionId: `ACTION-${jobId}-HISTORICAL-CREATE-A01` };
  const claim = await repo.claimStdProjectCreateAction({
    confirmation: {
      confirmationId: ids.confirmationId, jobId, draftId: bundle.draft.draft_id, objectType: "std_project", objectName: HISTORICAL_PROJECT_NAME,
      payloadHash: compiled.payloadHash, confirmationStatus: "confirmed_for_single_create", confirmVariable: `${ONEOFF_CONFIRM_ENV}=${ONEOFF_CONFIRM_VALUE}`,
      planId: plan.plan_id, metadata: { mode: "oneoff_historical_template", maximum_actions: 1, retry_allowed: false, payload_stored: false, response_stored: false }
    },
    action: {
      actionId: ids.actionId, jobId, confirmationId: ids.confirmationId, planId: plan.plan_id, actionType: "oceanengine_std_project_create",
      endpoint: CREATE_ENDPOINT, method: "POST", attemptNo: 1, requestHash: compiled.payloadHash, idempotencyKey: action.idempotency_key || `IDEMP-${jobId}-HISTORICAL-TEMPLATE-CREATE-V1`,
      metadata: { mode: "oneoff_historical_template", payload_stored: false, response_stored: false, retry_allowed: false }
    }
  });
  if (!claim.claimed) return { status: "blocked_before_create", createCalled: false, blockers: ["platform_action_already_recorded"] };
  try {
    const env = readOceanEngineEnv().env;
    let response;
    let text;
    try {
      response = await fetchImpl(`${API_BASE}${CREATE_ENDPOINT}`, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", "Access-Token": env.OCEANENGINE_ACCESS_TOKEN }, body: compiled.wire.body });
      text = await response.text();
    } catch (error) {
      const errorHash = sha256(clean(error?.code || error?.name || "create_transport_error"));
      await repo.upsertPlatformAction({
        actionId: ids.actionId, jobId, confirmationId: ids.confirmationId, planId: plan.plan_id, actionType: "oceanengine_std_project_create", endpoint: CREATE_ENDPOINT, method: "POST",
        actionStatus: "failed_or_unconfirmed", attemptNo: 1, requestHash: compiled.payloadHash, responseHash: errorHash, httpStatus: null, apiCode: "transport_error",
        requestIdPresent: false, objectIdPresent: false, errorSummary: "platform_create_transport_not_confirmed", requestId: "", errorCategory: "unclassified", offendingFieldPath: "", idempotencyKey: action.idempotency_key || "",
        requestFieldManifest: historicalManifest(compiled.payload, { sources: compiled.sources, duplicate }), responseSummary: { transport_failed: true, error_hash: errorHash },
        metadata: { mode: "oneoff_historical_template", payload_stored: false, response_stored: false, retry_allowed: false }, finishedAt: new Date().toISOString()
      });
      await repo.upsertEvidence({ artifactId: `EV-${jobId}-HISTORICAL-TEMPLATE-CREATE`, jobId, artifactType: "historical_template_create_once_transport_failed", title: "Historical template create once", summary: "endpoint=std_project/create transport_failed=true raw_response_stored=false", contentHash: errorHash, storageRef: "postgres:evidence_artifacts:redacted_summary_only", sourceRef: "oceanengine:std_project/create", sourceUsage: "runtime_truth" });
      const readback = await safeOneOffReadback({ repo, jobId, fetchImpl });
      await repo.updateWorkflowCaseLifecycle({ caseId: bundle.job.case_id, lifecycleStatus: "completed", metadataPatch: { oneoff_status: "create_transport_failed", create_called: true, api_code: "transport_error", object_id_present: false, readback_status: readback.status || "", payload_stored: false, response_stored: false } });
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
      actionId: ids.actionId, jobId, confirmationId: ids.confirmationId, planId: plan.plan_id, actionType: "oceanengine_std_project_create", endpoint: CREATE_ENDPOINT, method: "POST",
      actionStatus: passed ? "succeeded" : "failed_or_unconfirmed", attemptNo: 1, requestHash: compiled.payloadHash, responseHash, httpStatus: response.status, apiCode: apiCode || "unknown",
      requestIdPresent: safe.request_id_present === true, objectIdPresent: Boolean(projectId), errorSummary: passed ? "" : "platform_create_response_not_confirmed", requestId: safe.request_id,
      errorCategory: passed ? "" : safe.error_category, offendingFieldPath: passed ? "" : safe.offending_field_path, idempotencyKey: action.idempotency_key || "",
      requestFieldManifest: historicalManifest(compiled.payload, { sources: compiled.sources, duplicate }), responseSummary: { ...safe, object_id_present: Boolean(projectId), response_hash_present: true },
      metadata: { mode: "oneoff_historical_template", payload_stored: false, response_stored: false, retry_allowed: false }, finishedAt: new Date().toISOString()
    });
    await repo.upsertEvidence({ artifactId: `EV-${jobId}-HISTORICAL-TEMPLATE-CREATE`, jobId, artifactType: passed ? "historical_template_create_once" : "historical_template_create_once_failed", title: "Historical template create once", summary: `http=${response.status} api_code=${apiCode || "unknown"} request_id_present=${safe.request_id_present === true} object_id_present=${Boolean(projectId)} raw_response_stored=false`, contentHash: responseHash, storageRef: "postgres:evidence_artifacts:redacted_summary_only", sourceRef: "oceanengine:std_project/create", sourceUsage: "runtime_truth" });
    const readback = await safeOneOffReadback({ repo, jobId, fetchImpl });
    await repo.updateWorkflowCaseLifecycle({ caseId: bundle.job.case_id, lifecycleStatus: "completed", metadataPatch: { oneoff_status: passed ? "create_completed" : "create_failed", create_called: true, api_code: apiCode || "unknown", object_id_present: Boolean(projectId), readback_status: readback.status || "", payload_stored: false, response_stored: false } });
    await repo.updateJob(jobId, { status: passed ? "created_pending_readback" : "failed_waiting_manual_review", currentNode: "oneoff" });
    return { status: passed ? "create_completed" : "create_failed_stop", createCalled: true, httpStatus: response.status, apiCode, requestIdPresent: safe.request_id_present === true, objectIdPresent: Boolean(projectId), readbackStatus: readback.status || "", payloadHash: compiled.payloadHash };
  } finally {
    await revokeWriteScope(projectStatePath);
  }
}
