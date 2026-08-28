import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  VIDEO_MATERIAL_CONFIRM_VALUE,
  buildVideoMaterialBatchBindRequestPlan,
  bindVideoMaterialToTargetOnce,
  buildVideoMaterialBindRequestPlan,
  buildVideoMaterialPreparePlan,
  ensureVideoMaterialBindSetOnce,
  materialBindFailList
} from "../src/platforms/oceanengineVideoMaterialExecutor.mjs";
import { validateVideoMaterialWriteScope } from "../src/workflows/videoMaterialExecutionScope.mjs";

function assert(value, message) {
  if (!value) throw new Error(message);
}

function response(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

const jobId = "JOB-VIDEO-EXECUTOR-SMOKE";
const sourceAdvertiserId = "1760246749825031";
const targetAdvertiserId = "1871922346964041";
const sourceAssetId = "JSZC-HUNT-4IG2-3";
const secondSourceAssetId = "JSZC-HUNT-4GE6-14";
const videoId = "v02033g10000smoke";
const secondVideoId = "v02033g10000smoke2";

function videoEntry(id, platformVideoId) {
  return {
    item: { item_type: "video_asset", required: true, asset_id: id },
    asset: {
      asset_id: id,
      asset_name: `smoke video ${id}`,
      metadata: {
        video_id: platformVideoId,
        local_file: {
          path: "/tmp/smoke.mp4",
          sha256: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          size_bytes: 100
        }
      }
    }
  };
}

function resourceEntry(id) {
  return {
    resource_type: "video_asset",
    source_asset_id: id,
    visibility_status: "needs_confirmation",
    readback_status: "not_checked",
    metadata: {
      readonly_check: {
        status: "blocked",
        plan_status: "source_ready_target_missing",
        cover_mode: "cover_not_ready",
        source_video_visible: true,
        target_video_visible: false
      }
    }
  };
}

function bundle({ twoVideos = false } = {}) {
  const entries = [videoEntry(sourceAssetId, videoId)];
  const resources = [resourceEntry(sourceAssetId)];
  if (twoVideos) {
    entries.push(videoEntry(secondSourceAssetId, secondVideoId));
    resources.push(resourceEntry(secondSourceAssetId));
  }
  return {
    job: {
      job_id: jobId,
      route_id: "oceanengine_3_byte_mini_game",
      game_code: "JSZC",
      advertiser_id: targetAdvertiserId,
      source_usage: "test_run"
    },
    defaults: {
      raw_defaults: {
        material_source_account: {
          advertiser_id: sourceAdvertiserId,
          account_role: "material_source"
        }
      }
    },
    materialPack: {
      items: entries
    },
    resources,
    executionPlan: {
      plan_id: `PLAN-${jobId}-V1`,
      plan_hash: "sha256:plan",
      planned_actions: [{ action_type: "ensure_resource:video_asset", status: "planned" }]
    }
  };
}

function makeRepo(options = {}) {
  const actions = [];
  const evidence = [];
  const resourceUpdates = [];
  const base = bundle(options);
  return {
    actions,
    evidence,
    resourceUpdates,
    async getLaunchJobBundle() {
      return base;
    },
    async getLatestLaunchExecutionPlan() {
      return base.executionPlan;
    },
    async countPlatformActions() {
      return 0;
    },
    async upsertPlatformAction(value) {
      actions.push(value);
    },
    async upsertEvidence(value) {
      evidence.push(value);
    },
    async upsertAccountResourceReadonlyBySourceAsset(value) {
      resourceUpdates.push(value);
    },
    async mergePlatformActionMetadata(actionId, metadata) {
      actions.push({ actionId, metadata, merged: true });
    }
  };
}

const requestPlan = buildVideoMaterialBindRequestPlan({ sourceAdvertiserId, targetAdvertiserId, videoId, sourceAssetId });
assert(requestPlan.requestFieldManifest.fieldNames.join(",") === "advertiser_id,target_advertiser_ids,video_ids", "video_bind_field_manifest_wrong");
assert(requestPlan.requestHash.startsWith("sha256:"), "video_bind_request_hash_missing");

const plan = buildVideoMaterialPreparePlan({ bundle: bundle() });
assert(plan.bindActionCount === 1, "video_prepare_bind_count_wrong");
assert(plan.bindBatchCount === 1, "video_prepare_batch_count_wrong");
assert(plan.items[0].requestHash === requestPlan.requestHash, "video_prepare_request_hash_mismatch");
assert(plan.items[0].targetAdvertiserId === targetAdvertiserId, "video_prepare_target_should_come_from_job");

const twoVideoPlan = buildVideoMaterialPreparePlan({ bundle: bundle({ twoVideos: true }) });
assert(twoVideoPlan.bindActionCount === 2, "video_prepare_two_video_bind_count_wrong");
assert(twoVideoPlan.bindBatchCount === 1, "video_prepare_two_video_batch_count_wrong");
assert(twoVideoPlan.bindBatchRequests[0].requestFieldManifest.sourceAssetCount === 2, "video_prepare_two_video_batch_item_count_wrong");

const manyItems = Array.from({ length: 51 }, (_, index) => ({
  sourceAssetId: `ASSET-${String(index).padStart(2, "0")}`,
  videoId: `v${String(index).padStart(4, "0")}`
}));
const oneBatch = buildVideoMaterialBatchBindRequestPlan({ sourceAdvertiserId, targetAdvertiserId, items: manyItems.slice(0, 50) });
assert(oneBatch.requestFieldManifest.sourceAssetCount === 50, "video_batch_request_limit_wrong");

assert(materialBindFailList({ data: { fail_list: [{ video_id: videoId, target_advertiser_id: targetAdvertiserId }] } }).length === 1, "video_fail_list_parse_failed");

const dir = await mkdtemp(path.join(os.tmpdir(), "mwbv2-video-executor-"));
try {
  const statePath = path.join(dir, "state.json");
  await writeFile(statePath, JSON.stringify({
    guardrails: {
      platform_write_allowed: true,
      platform_write_scope: {
        target_job_id: jobId,
        target_advertiser_id: targetAdvertiserId,
        target_plan_id: `PLAN-${jobId}-V1`,
        target_plan_hash: "sha256:plan",
        allowed_actions: ["ensure_resource:video_asset"],
        maximum_actions: 1,
        maximum_platform_calls: 1,
        retry_allowed: false,
        official_contract: {
          source_ref: "official-doc:test-only",
          endpoint: "/open_api/2/file/material/bind/",
          method: "POST"
        }
      }
    }
  }));
  const repo = makeRepo();
  const scope = await validateVideoMaterialWriteScope({ repo, bundle: bundle(), projectStatePath: statePath });
  assert(scope.status === "passed", "video_scope_should_pass");

  const failedByFailList = await bindVideoMaterialToTargetOnce({
    repo,
    jobId,
    sourceAssetId,
    allowNetworkWrite: true,
    confirmVariableValue: VIDEO_MATERIAL_CONFIRM_VALUE,
    projectStatePath: statePath,
    credentialSummary: {
      status: "valid",
      blockers: [],
      envFilePresent: true,
      accessTokenPresent: true,
      refreshTokenPresent: true,
      tokenExpired: false
    },
    oceanEngineEnv: { OCEANENGINE_ACCESS_TOKEN: "test-token" },
    fetchImpl: async () => response({ code: 0, request_id: "req", data: { fail_list: [{ video_id: videoId, target_advertiser_id: targetAdvertiserId, fail_reason: "x" }] } })
  });
  assert(failedByFailList.status === "bind_failed_stop_for_manual_review", "video_fail_list_should_fail");
  assert(repo.actions.some((item) => item.actionStatus === "failed_or_unconfirmed"), "video_fail_list_action_not_failed");

  const successRepo = makeRepo();
  const success = await bindVideoMaterialToTargetOnce({
    repo: successRepo,
    jobId,
    sourceAssetId,
    allowNetworkWrite: true,
    confirmVariableValue: VIDEO_MATERIAL_CONFIRM_VALUE,
    projectStatePath: statePath,
    credentialSummary: {
      status: "valid",
      blockers: [],
      envFilePresent: true,
      accessTokenPresent: true,
      refreshTokenPresent: true,
      tokenExpired: false
    },
    oceanEngineEnv: { OCEANENGINE_ACCESS_TOKEN: "test-token" },
    fetchImpl: async () => response({ code: 0, request_id: "req", data: { fail_list: [] } })
  });
  assert(success.status === "bind_called_readback_required", "video_success_status_wrong");
  assert(successRepo.actions.some((item) => item.idempotencyKey), "video_action_idempotency_key_missing");

  const batchStatePath = path.join(dir, "batch-state.json");
  await writeFile(batchStatePath, JSON.stringify({
    guardrails: {
      platform_write_allowed: true,
      platform_write_scope: {
        target_job_id: jobId,
        target_advertiser_id: targetAdvertiserId,
        target_plan_id: `PLAN-${jobId}-V1`,
        target_plan_hash: "sha256:plan",
        allowed_actions: ["ensure_resource:video_asset"],
        maximum_actions: 1,
        maximum_platform_calls: 1,
        retry_allowed: false,
        official_contract: {
          source_ref: "official-doc:test-only",
          endpoint: "/open_api/2/file/material/bind/",
          method: "POST"
        }
      }
    }
  }));
  let bindCalled = false;
  const batchRepo = makeRepo({ twoVideos: true });
  const readonlyClient = {
    credentialState: () => ({ status: "ready", blockers: [], envFilePresent: true, accessTokenPresent: true, refreshTokenPresent: true, tokenExpired: false }),
    async get({ label, endpoint, summarize }) {
      const isTarget = String(label).startsWith("target_video_material_");
      const id = label.includes(secondSourceAssetId) ? secondVideoId : videoId;
      const visible = !isTarget || bindCalled;
      return {
        label,
        endpoint,
        status: "passed",
        httpStatus: 200,
        apiCode: "0",
        requestIdPresent: true,
        responseHash: "sha256:readonly",
        summary: summarize({ data: { list: visible ? [{ video_id: id }] : [] } })
      };
    }
  };
  const batchResult = await ensureVideoMaterialBindSetOnce({
    repo: batchRepo,
    jobId,
    confirmVariableValue: VIDEO_MATERIAL_CONFIRM_VALUE,
    projectStatePath: batchStatePath,
    credentialSummary: {
      status: "valid",
      blockers: [],
      envFilePresent: true,
      accessTokenPresent: true,
      refreshTokenPresent: true,
      tokenExpired: false
    },
    oceanEngineEnv: { OCEANENGINE_ACCESS_TOKEN: "test-token" },
    readonlyClient,
    readbackDelaysMs: [0, 1, 2],
    fetchImpl: async (_url, options) => {
      bindCalled = true;
      const body = JSON.parse(options.body);
      assert(body.video_ids.length === 2, "video_batch_should_send_two_video_ids_once");
      return response({ code: 0, request_id: "req", data: { fail_list: [] } });
    }
  });
  assert(batchResult.status === "video_material_ready", "video_batch_ensure_should_finish_ready");
  assert(batchRepo.actions.filter((item) => item.actionType === "oceanengine_material_bind_target" && item.actionStatus === "succeeded").length === 1, "video_batch_should_record_one_succeeded_action");

  const result = {
    status: "passed",
    bindActionCount: plan.bindActionCount,
    bindBatchCount: twoVideoPlan.bindBatchCount,
    failListBlocked: true,
    scopeStatus: scope.status,
    noRealPlatformWrite: true,
    noTokenRefresh: true
  };
  console.log(JSON.stringify(result, null, 2));
} finally {
  await rm(dir, { recursive: true, force: true });
}
