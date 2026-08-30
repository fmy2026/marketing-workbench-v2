import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evaluateCreateFieldLedger } from "../src/workflows/skills/oe3/05-create-field-ledger.mjs";
import {
  ONEOFF_CONFIRM_ENV,
  ONEOFF_CONFIRM_VALUE,
  ONEOFF_PROJECT_NAME,
  authorizeConvertedTimeDurationOmitOneOff,
  executeConvertedTimeDurationOmitOneOff,
  prepareConvertedTimeDurationOmitOneOff
} from "../src/oneoff/jszcConvertedTimeDurationOmitCreate.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha(value) {
  return createHash("sha256").update(value).digest("hex");
}

function fakeFetchFactory({ projectId = "999900001", createApiCode = "40000", listMatch = false } = {}) {
  const calls = [];
  async function fakeFetch(url, options = {}) {
    const href = String(url);
    const body = String(options.body || "");
    calls.push({ href, method: options.method || "GET", body });
    if (href.includes("/std_project/create/")) {
      return new Response(JSON.stringify({
        code: createApiCode,
        request_id: "fake-request-id",
        message: createApiCode === "0" ? "" : "invalid parameter",
        data: createApiCode === "0" ? { project_id: projectId } : {}
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (href.includes("/std_project/list/")) {
      const filtering = new URL(href).searchParams.get("filtering") || "{}";
      let name = ONEOFF_PROJECT_NAME;
      try { name = JSON.parse(filtering).name || name; } catch {}
      return new Response(JSON.stringify({
        code: "0",
        request_id: "fake-list-request",
        data: { list: listMatch ? [{ project_id: projectId, name, status: "ENABLE" }] : [] }
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error(`unexpected_url:${href}`);
  }
  fakeFetch.calls = calls;
  return fakeFetch;
}

function baselineLedger() {
  return evaluateCreateFieldLedger({
    advertiser_id: 1871922346964041,
    name: "245828_N_JSZC_HUNT_PAY7DROI_平台定向不限_P03_20260830",
    ad_type: "ALL",
    landing_type: "MICRO_GAME",
    marketing_goal: "VIDEO_AND_IMAGE",
    external_action: "AD_CONVERT_TYPE_PAY",
    deep_external_action: "AD_CONVERT_TYPE_PURCHASE_ROI_7D",
    native_type: "AWEME",
    aweme_id: "1234567890123456789",
    delivery_mode: "PROCEDURAL",
    delivery_type: "NORMAL",
    delivery_medium: "BYTE_GAME",
    instance_id: "7434750138926546994",
    asset_id: 1111111111111111,
    schedule_type: "SCHEDULE_FROM_NOW",
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
      gender: "GENDER_UNLIMITED",
      age: [],
      converted_time_duration: "SIX_MONTH",
      hide_if_converted: "NO_EXCLUDE",
      retargeting_tags_exclude: [3333333333333333],
      interest_action_mode: "UNLIMITED"
    },
    brand_info: {
      brand_name_id: 11467384,
      cdp_brand_id: 4016408,
      cdp_brand_name: "巨兽战场",
      yuntu_category_id: 2202
    },
    project_materials: {
      title_material_list: [{ title: "开局一把枪，装备全靠捡" }],
      video_material_list: [{ image_mode: "CREATIVE_IMAGE_MODE_VIDEO_VERTICAL", video_id: "7111111111111111111" }],
      image_material_list: [],
      external_url_material_list: [[["https:", "", ["api", "oceanengine", "com"].join(".")].join("/")]],
      source: "巨兽战场",
      mini_program_info: { url: [["sslocal:", "", "fixture"].join("/")] },
      product_info: {
        titles: ["巨兽战场"],
        image_ids: ["2222222222222222"],
        selling_points: ["三分钟快速上手", "无需下载点开即玩", "开局装备全靠捡"]
      },
      call_to_action_buttons: ["进入游戏"],
      anchor_related_type: "OFF"
    },
    track_url_setting: { send_type: "SERVER_SEND", action_track_url: [[["https:", "", ["api", "oceanengine", "com"].join(".")].join("/")]] },
    aigc_dynamic_creative_switch: "OFF",
    layer_roi_switch: "OFF",
    is_comment_disable: "OFF"
  }, { externalUrlMaterialListPolicy: "send", filterEventPolicy: "omit" });
}

function readyResource(type, extra = {}) {
  return {
    resource_type: type,
    resource_id: `AR-${type}`,
    source_asset_id: extra.source_asset_id || "",
    platform_resource_id: extra.platform_resource_id ?? "100000000001",
    visibility_status: "visible",
    readback_status: extra.readback_status || "readback_verified",
    metadata: {
      readonly_check: { status: "passed", video_id_present: true, cover_mode: "platform_default_cover_allowed", evidence_refs: ["EV-VIDEO"] },
      ...(extra.metadata || {})
    }
  };
}

function fakeBundle(jobId = "JOB-MWBV2-CTD-OMIT-TEST") {
  const landingUrl = [["https:", "", ["api", "oceanengine", "com"].join(".")].join("/")];
  const launchUrl = [["sslocal:", "", "fixture"].join("/")];
  const touchpointUrl = [["https:", "", ["api", "oceanengine", "com"].join(".")].join("/")];
  return Promise.resolve({
    job: { job_id: jobId, case_id: "CASE-TEST", route_id: "oceanengine_3_byte_mini_game", game_code: "JSZC", advertiser_id: "1871922346964041", object_type: "std_project", source_usage: "test_run" },
    case: { case_id: "CASE-TEST", lifecycle_status: "active" },
    game: { game_code: "JSZC", game_name: "巨兽战场", brand_name: "巨兽战场", product_name: "巨兽战场" },
    account: {
      monitor_id: "245828",
      aweme_authorization: {
        verification_status: "authorized",
        default_aweme_id_hash: `sha256:${sha("1234567890123456789")}`
      }
    },
    defaults: {
      objective: "AD_CONVERT_TYPE_PAY",
      deep_objective: "AD_CONVERT_TYPE_PURCHASE_ROI_7D",
      raw_defaults: {
        aweme_id_baseline: { default_aweme_id: "1234567890123456789" },
        payload_defaults: {
          project: { ad_type: "ALL", landing_type: "MICRO_GAME", marketing_goal: "VIDEO_AND_IMAGE", native_type: "AWEME", delivery_mode: "PROCEDURAL" },
          strategy: { delivery_type: "NORMAL", delivery_medium: "BYTE_GAME", bid_type: "CUSTOM", budget_mode: "BUDGET_MODE_DAY", pricing: "PRICING_OCPM", audience_type: "CUSTOM", aigc_dynamic_creative_switch: "OFF", layer_roi_switch: "OFF", is_comment_disable: "OFF" },
          schedule: { schedule_type: "SCHEDULE_FROM_NOW" },
          targeting: { district: "NONE", gender: "GENDER_UNLIMITED", age: [], hide_if_converted: "NO_EXCLUDE", interest_action_mode: "UNLIMITED" },
          product: { selling_points: ["三分钟快速上手", "无需下载点开即玩", "开局装备全靠捡"], call_to_action_buttons: ["进入游戏"], anchor_related_type: "OFF" },
          track_url_setting: { send_type: "SERVER_SEND" },
          contract_mapping: { mini_game_instance_candidate_create_field: "instance_id" }
        }
      }
    },
    platformApp: { id: "tte95a9fe77665844607", app_id: "ttabc" },
    draft: {
      draft_id: `DRAFT-${jobId}-V1`,
      project_name: ONEOFF_PROJECT_NAME,
      payload_hash: "",
      payload_summary: {
        budget: 88888,
        bid: 488,
        roi_goal: 0.088,
        objective: "AD_CONVERT_TYPE_PAY",
        deep_objective: "AD_CONVERT_TYPE_PURCHASE_ROI_7D",
        deep_bid_type: "PER_AND_SEVEN_PAY_ROI",
        final_payload_manifest: { createFieldLedger: baselineLedger() }
      }
    },
    executionPlan: null,
    materialPack: {
      items: [
        {
          item: { item_type: "title_material", required: true, asset_id: "TITLE1", asset_ref: "TITLE1" },
          asset: { asset_id: "TITLE1", asset_ref: "TITLE1", asset_type: "title_material", asset_name: "开局一把枪，装备全靠捡" }
        },
        { item: { item_type: "video_asset", required: true, asset_id: "VID1" }, asset: { asset_id: "VID1", metadata: { video_id: "7111111111111111111" } } }
      ]
    },
    resources: [
      readyResource("event_asset", { platform_resource_id: "1111111111111111" }),
      readyResource("micro_app_instance", { platform_resource_id: "7434750138926546994", metadata: { micro_app_instance_id: "7434750138926546994" } }),
      readyResource("product_image", { platform_resource_id: "2222222222222222", metadata: { product_image_target_upload_readback: { status: "passed", image_id_present: true, material_id_present: true } } }),
      readyResource("dmp_audience_package", { platform_resource_id: "", metadata: { custom_audience_ids: ["3333333333333333"] } }),
      readyResource("brand_info", { metadata: { brand_info_official: { brand_name_id: "11467384", cdp_brand_id: "4016408", cdp_brand_name: "巨兽战场", yuntu_category_id: "2202" } } }),
      readyResource("backup_landing_page", { source_asset_id: "LPA-JSZC-OE3-BACKUP-001" }),
      readyResource("video_asset", { source_asset_id: "VID1" })
    ],
    _controlled: {
      touchpoint: { touchpoint_url: touchpointUrl },
      backup: { landing_page_asset_id: "LPA-JSZC-OE3-BACKUP-001", site_id: "7624750304608649243", landing_url: landingUrl, url_hash: sha(landingUrl), status: "active", resource_visibility_status: "visible", resource_readback_status: "readback_verified", resource_readonly_status: "passed" },
      launch: { link_ref: "GRLL-JSZC-OE3-BYTE-MINI-GAME-001", launch_url: launchUrl, url_hash: sha(launchUrl), status: "active", platform_app_id: "tte95a9fe77665844607", app_id: "ttabc" }
    }
  });
}

function fakeRepo() {
  const state = { case: null, job: null, draft: null, plan: null, evidence: [], confirmations: [], actions: [], readbacks: [], created: [] };
  return {
    state,
    getWorkflowCaseByKey: async () => state.case,
    createWorkflowCase: async (row) => { state.case = { case_id: row.caseId, case_key: row.caseKey, lifecycle_status: row.lifecycleStatus || "active" }; return state.case; },
    getLatestLaunchJobByCase: async () => state.job,
    createLaunchJob: async (row) => { state.job = { job_id: row.jobId, case_id: row.caseId, route_id: row.routeId, game_code: row.gameCode, advertiser_id: row.advertiserId, object_type: row.objectType, source_usage: row.sourceUsage }; },
    getLaunchJobBundle: async (jobId) => {
      const bundle = await fakeBundle(jobId);
      if (jobId === "JOB-MWBV2-20260830031657-2CE128") {
        bundle.job.job_id = jobId;
        bundle.draft.payload_hash = "sha256:611616c1cfcfbb66d42d204137628f8a2513369cc4bb85db3206045010af9cfe";
        return bundle;
      }
      bundle.job = state.job || bundle.job;
      bundle.draft = state.draft || bundle.draft;
      bundle.executionPlan = state.plan;
      bundle.platformAction = state.actions.at(-1) || null;
      return bundle;
    },
    getControlledTouchpointUrl: async () => (await fakeBundle())._controlled.touchpoint,
    getControlledBackupLandingPageUrl: async () => (await fakeBundle())._controlled.backup,
    getControlledGameRouteLaunchLink: async () => (await fakeBundle())._controlled.launch,
    upsertDraft: async (draft) => { state.draft = { draft_id: draft.draftId, job_id: draft.jobId, project_name: draft.projectName, payload_hash: draft.payloadHash, payload_summary: draft.payloadSummary, duplicate_status: draft.duplicateStatus }; },
    upsertLaunchExecutionPlan: async (plan) => { state.plan = { plan_id: plan.planId, job_id: plan.jobId, plan_status: plan.planStatus, plan_hash: plan.planHash, payload_hash: plan.payloadHash, planned_actions: plan.plannedActions, metadata: plan.metadata }; },
    upsertEvidence: async (evidence) => { state.evidence.push(evidence); },
    updateJob: async () => {},
    getLaunchJobAuditCounts: async () => ({ platformActions: state.actions.length, launchConfirmations: state.confirmations.length, createdObjects: state.created.length, readbackRecords: state.readbacks.length }),
    claimStdProjectCreateAction: async ({ confirmation, action }) => {
      if (state.actions.length) return { claimed: false, confirmationRecorded: false };
      state.actions.push({ action_id: action.actionId, action_type: action.actionType, action_status: "started" });
      state.confirmations.push(confirmation);
      return { claimed: true, confirmationRecorded: true };
    },
    upsertPlatformAction: async (action) => { state.actions[state.actions.length - 1] = action; },
    upsertReadbackRecord: async (readback) => { state.readbacks.push(readback); },
    upsertCreatedObject: async (created) => { state.created.push(created); },
    updateWorkflowCaseLifecycle: async () => {}
  };
}

const tempDir = await mkdtemp(join(tmpdir(), "mwbv2-ctd-omit-smoke-"));
try {
  const repo = fakeRepo();
  const client = { get: async () => ({ status: "passed", httpStatus: 200, apiCode: "0", requestIdPresent: true, responseHash: "sha256:dup", summary: { duplicateFound: false, listCount: 0 } }) };
  const prepared = await prepareConvertedTimeDurationOmitOneOff({ repo, client });
  assert(prepared.status === "ready_for_exact_user_confirmation", `prepare should be ready: ${JSON.stringify({ blockers: prepared.blockers, changedPaths: prepared.changedPaths })}`);
  assert(prepared.changedPaths.join(",") === "audience.converted_time_duration,name", "diff must be exactly name + converted_time_duration");
  assert(repo.state.draft.payload_summary.frozen_business_values.converted_time_duration_present === false, "converted_time_duration must be omitted");
  assert(repo.state.draft.payload_summary.frozen_business_values.external_url_material_list_count === 1, "external_url_material_list must remain one item");
  assert(JSON.stringify(repo.state).includes([["https:", "", ["api", "oceanengine", "com"].join(".")].join("/")]) === false, "full landing URL leaked into audit state");

  const projectStatePath = join(tempDir, "project.state.json");
  await writeFile(projectStatePath, JSON.stringify({ guardrails: { platform_write_allowed: false } }, null, 2));
  await authorizeConvertedTimeDurationOmitOneOff({ repo, jobId: prepared.jobId, projectStatePath });
  process.env.NODE_ENV = "test";
  process.env[ONEOFF_CONFIRM_ENV] = ONEOFF_CONFIRM_VALUE;
  const fakeFetch = fakeFetchFactory({ createApiCode: "40000", listMatch: false });
  const executed = await executeConvertedTimeDurationOmitOneOff({ repo, jobId: prepared.jobId, projectStatePath, fetchImpl: fakeFetch, client });
  assert(executed.createCalled === true, "execute should call create once");
  assert(fakeFetch.calls.filter((call) => call.href.includes("/std_project/create/")).length === 1, "exactly one create call");
  assert(fakeFetch.calls.filter((call) => call.href.includes("/std_project/list/")).length === 3, "three readback calls");
  assert(repo.state.actions.length === 1, "exactly one platform action");
  assert(repo.state.confirmations.length === 1, "exactly one confirmation");
  const second = await executeConvertedTimeDurationOmitOneOff({ repo, jobId: prepared.jobId, projectStatePath, fetchImpl: fakeFetch, client });
  assert(second.createCalled === false, "second execute must be blocked");
  console.log(JSON.stringify({ status: "passed", jobId: prepared.jobId, diffHash: prepared.diffHash }, null, 2));
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
