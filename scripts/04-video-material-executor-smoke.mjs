import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  DEFAULT_VIDEO_READBACK_DELAYS_MS,
  VIDEO_MATERIAL_CONFIRM_VALUE,
  buildVideoMaterialBatchBindRequestPlan,
  bindVideoMaterialToTargetOnce,
  buildVideoMaterialBindRequestPlan,
  buildVideoMaterialPreparePlan,
  ensureVideoMaterialBindSetOnce,
  materialBindFailList,
  pollVideoMaterialReadback,
  readbackVideoMaterialTargetOnce,
  summarizeVideoMaterialReadbackCycles
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

function videoEntry(id, platformVideoId, { withCover = false } = {}) {
  return {
    item: { item_type: "video_asset", required: true, asset_id: id },
    asset: {
      asset_id: id,
      asset_name: `smoke video ${id}`,
      metadata: {
        video_id: platformVideoId,
        ...(withCover ? { video_cover_id: `img-${id}` } : {}),
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

function bundle({ twoVideos = false, withCover = false } = {}) {
  const entries = [videoEntry(sourceAssetId, videoId, { withCover })];
  const resources = [resourceEntry(sourceAssetId)];
  if (twoVideos) {
    entries.push(videoEntry(secondSourceAssetId, secondVideoId, { withCover }));
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
  const actions = [...(options.initialActions || [])];
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
      const id = value.actionId || value.action_id;
      const index = actions.findIndex((item) => (item.actionId || item.action_id) === id);
      if (index >= 0) {
        actions[index] = { ...actions[index], ...value };
      } else {
        actions.push(value);
      }
    },
    async upsertEvidence(value) {
      evidence.push(value);
    },
    async upsertAccountResourceReadonlyBySourceAsset(value) {
      resourceUpdates.push(value);
    },
    async mergePlatformActionMetadata(actionId, metadata) {
      const index = actions.findIndex((item) => (item.actionId || item.action_id) === actionId);
      if (index >= 0) {
        actions[index] = {
          ...actions[index],
          metadata: {
            ...(actions[index].metadata || {}),
            ...metadata
          },
          merged: true
        };
      } else {
        actions.push({ actionId, metadata, merged: true });
      }
    },
    async getPlatformAction(actionId) {
      return [...actions].reverse().find((item) => (item.actionId || item.action_id) === actionId) || null;
    },
    async listVideoMaterialBindActions() {
      return actions.filter((item) => (item.actionType || item.action_type) === "oceanengine_material_bind_target");
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
assert(DEFAULT_VIDEO_READBACK_DELAYS_MS.join(",") === "0,10000,20000,30000,60000,120000,180000", "video_default_readback_schedule_wrong");

for (const thresholdMs of DEFAULT_VIDEO_READBACK_DELAYS_MS) {
  let currentMs = 0;
  const pollRepo = makeRepo();
  const polling = await pollVideoMaterialReadback({
    repo: pollRepo,
    jobId,
    client: {
      credentialState: () => ({ status: "ready", blockers: [] }),
      async get({ label, endpoint, summarize }) {
        assert(!String(label).startsWith("source_"), "post_bind_poll_should_not_query_source_account");
        return {
          label,
          endpoint,
          status: "passed",
          requestIdPresent: true,
          responseHash: "sha256:poll",
          summary: summarize({ data: { list: currentMs >= thresholdMs ? [{ video_id: videoId }] : [] } })
        };
      }
    },
    delaysMs: DEFAULT_VIDEO_READBACK_DELAYS_MS,
    startedAtMs: 0,
    nowMs: () => currentMs,
    wait: async (ms) => {
      currentMs += ms;
    },
    sourceAssetIds: [sourceAssetId]
  });
  assert(polling.status === "passed", `video_poll_should_pass_at_${thresholdMs}`);
  assert(polling.attempts[polling.attempts.length - 1].plannedDelayMs === thresholdMs, `video_poll_last_delay_wrong_${thresholdMs}`);
}

let exhaustedMs = 0;
const exhausted = await pollVideoMaterialReadback({
  repo: makeRepo(),
  jobId,
  client: {
    credentialState: () => ({ status: "ready", blockers: [] }),
    async get({ label, endpoint, summarize }) {
      assert(!String(label).startsWith("source_"), "exhausted_poll_should_not_query_source_account");
      return {
        label,
        endpoint,
        status: "passed",
        requestIdPresent: true,
        responseHash: "sha256:poll",
        summary: summarize({ data: { list: [] } })
      };
    }
  },
  delaysMs: DEFAULT_VIDEO_READBACK_DELAYS_MS,
  startedAtMs: 0,
  nowMs: () => exhaustedMs,
  wait: async (ms) => {
    exhaustedMs += ms;
  },
  sourceAssetIds: [sourceAssetId]
});
assert(exhausted.status === "readback_pending", "video_poll_exhausted_status_wrong");
assert(exhausted.windowExhausted === true, "video_poll_exhausted_flag_missing");
assert(exhausted.terminalReason === "readback_window_exhausted", "video_poll_exhausted_reason_wrong");

const explicitCoverPolling = await pollVideoMaterialReadback({
  repo: makeRepo({ withCover: true }),
  jobId,
  client: {
    credentialState: () => ({ status: "ready", blockers: [] }),
    async get({ label, endpoint, summarize }) {
      assert(!String(label).startsWith("source_"), "explicit_cover_poll_should_not_query_source_account");
      return {
        label,
        endpoint,
        status: "passed",
        requestIdPresent: true,
        responseHash: "sha256:poll",
        summary: summarize({
          data: {
            list: endpoint === "file/image/get"
              ? [{ image_id: `img-${sourceAssetId}` }]
              : [{ video_id: videoId }]
          }
        })
      };
    }
  },
  delaysMs: [0],
  startedAtMs: 0,
  nowMs: () => 0,
  sourceAssetIds: [sourceAssetId]
});
assert(explicitCoverPolling.status === "passed", "video_poll_explicit_cover_should_pass");
assert(explicitCoverPolling.attempts[0].items[0].coverMode === "explicit_cover_verified", "video_poll_explicit_cover_mode_wrong");

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
  const batchAction = await batchRepo.getPlatformAction(`ACTION-${jobId}-VIDEO-BIND-BATCH-01`);
  assert(Array.isArray(batchAction.metadata.readback_cycles), "video_batch_should_append_readback_cycle");
  assert(batchAction.metadata.readback_cycles.length === 1, "video_batch_readback_cycle_count_wrong");
  assert(batchAction.metadata.readback_status === "passed", "video_batch_compat_readback_status_wrong");

  const delayedActionId = `ACTION-${jobId}-VIDEO-BIND-BATCH-01`;
  const delayedRepo = makeRepo({
    twoVideos: true,
    initialActions: [{
      actionId: delayedActionId,
      jobId,
      actionType: "oceanengine_material_bind_target",
      endpoint: "/open_api/2/file/material/bind/",
      method: "POST",
      actionStatus: "succeeded",
      httpStatus: 200,
      apiCode: "0",
      responseSummary: { fail_list_count: 0 },
      metadata: {
        source_asset_ids: [sourceAssetId, secondSourceAssetId],
        source_advertiser_id: sourceAdvertiserId,
        target_advertiser_id: targetAdvertiserId,
        readback_status: "readback_pending",
        readback_attempts: [{ delayMs: 0, status: "blocked" }, { delayMs: 30000, status: "blocked" }, { delayMs: 60000, status: "blocked" }]
      }
    }]
  });
  const delayedLabels = [];
  const delayedResult = await readbackVideoMaterialTargetOnce({
    repo: delayedRepo,
    jobId,
    actionId: delayedActionId,
    expectedTargetAdvertiserId: targetAdvertiserId,
    expectedSourceAdvertiserId: sourceAdvertiserId,
    expectedSourceAssetIds: [sourceAssetId, secondSourceAssetId],
    readonlyClient: {
      credentialState: () => ({ status: "ready", blockers: [] }),
      async get({ label, endpoint, summarize }) {
        delayedLabels.push(label);
        assert(!String(label).startsWith("source_"), "delayed_readback_should_not_query_source_account");
        const id = label.includes(secondSourceAssetId) ? secondVideoId : videoId;
        return {
          label,
          endpoint,
          status: "passed",
          requestIdPresent: true,
          responseHash: "sha256:delayed",
          summary: summarize({ data: { list: [{ video_id: id }] } })
        };
      }
    },
    nowMs: () => 0
  });
  assert(delayedResult.status === "readback_verified", "delayed_readback_should_verify");
  assert(delayedResult.platformWriteCalled === false, "delayed_readback_should_not_write_platform");
  assert(delayedLabels.length === 2, "delayed_readback_should_query_target_video_only_for_two_assets");
  const delayedAction = await delayedRepo.getPlatformAction(delayedActionId);
  assert(delayedAction.metadata.readback_attempts.length === 3, "delayed_readback_should_preserve_legacy_attempts");
  assert(delayedAction.metadata.readback_cycles.length === 1, "delayed_readback_should_append_cycle");

  const insufficientStats = summarizeVideoMaterialReadbackCycles([delayedAction]);
  assert(insufficientStats.insufficientSample === true, "video_readback_stats_should_mark_insufficient_sample");
  assert(insufficientStats.p50FirstVisibleMs === null, "video_readback_stats_should_not_compute_p50_for_small_sample");
  const richStats = summarizeVideoMaterialReadbackCycles([{
    metadata: {
      readback_cycles: [10000, 20000, 60000].map((value, index) => ({
        cycleId: `CYCLE-${index}`,
        kind: "immediate_post_bind",
        status: "passed",
        firstFullVisibleWindow: { observedAtMs: value, fromDelayMs: 0, toDelayMs: value }
      }))
    }
  }]);
  assert(richStats.insufficientSample === false, "video_readback_stats_should_compute_when_sample_sufficient");
  assert(richStats.minFirstVisibleMs === 10000, "video_readback_stats_min_wrong");
  assert(richStats.p50FirstVisibleMs === 20000, "video_readback_stats_p50_wrong");
  assert(richStats.p90FirstVisibleMs === 60000, "video_readback_stats_p90_wrong");

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
