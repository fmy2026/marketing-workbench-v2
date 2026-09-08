import { createOceanEngineReadonlyClient } from "../../../platforms/oceanengineReadonlyClient.mjs";
import { hashValue, sanitizeForPublic } from "./00-contracts.mjs";
import { readonlyPermissionState } from "./00-readonly-permission.mjs";
import {
  canonicalGuideVideoReadiness,
  clean,
  verifiedMicroAppInstanceResources
} from "./04-resource-verifiers.mjs";

function requiredVideoEntries(bundle = {}) {
  const items = Array.isArray(bundle.materialPack?.items) ? bundle.materialPack.items : [];
  return items
    .filter((entry) => entry.item?.item_type === "video_asset" && entry.item?.required === true)
    .map((entry) => ({
      sourceAssetId: clean(entry.item?.asset_id || entry.asset?.asset_id),
      assetRef: clean(entry.item?.asset_ref || entry.asset?.asset_ref),
      resourceName: clean(entry.asset?.asset_name || entry.item?.asset_ref || entry.item?.asset_id),
      videoId: clean(entry.asset?.metadata?.video_id || entry.asset?.metadata?.platform_video_id),
      coverId: clean(entry.asset?.metadata?.video_cover_id || entry.asset?.metadata?.cover_id),
      localFilePath: clean(entry.asset?.metadata?.local_file?.path || entry.asset?.metadata?.local_path),
      localFileHash: clean(entry.asset?.metadata?.local_file?.sha256 || entry.asset?.metadata?.local_file_hash),
      localFileSizeBytes: Number(entry.asset?.metadata?.local_file?.size_bytes || entry.asset?.metadata?.local_file_size_bytes || 0)
    }));
}

export function materialSourceAccount(bundle = {}) {
  const account = bundle.defaults?.raw_defaults?.material_source_account || {};
  return {
    advertiserId: clean(account.advertiser_id),
    accountRole: clean(account.account_role),
    targetAdvertiserId: clean(account.target_advertiser_id)
  };
}

function accountResourceForVideo(bundle = {}, sourceAssetId = "") {
  return (bundle.resources || []).find((item) =>
    item.resource_type === "video_asset" &&
    clean(item.source_asset_id) === clean(sourceAssetId)
  ) || null;
}

function guideVideoRequired(bundle = {}) {
  return bundle.account?.guide_video_required === true;
}

function videoCoverRequired(bundle = {}) {
  return bundle.account?.video_cover_required === true;
}

function gameplayList(payload = {}) {
  return [
    payload?.data?.play_infos,
    payload?.data?.list,
    payload?.data?.gameplay_list,
    payload?.data?.items
  ].find((item) => Array.isArray(item)) || [];
}

function summarizeGameplay(payload = {}) {
  const plays = gameplayList(payload);
  const guideVideoIds = [...new Set(plays
    .map((item) => clean(item?.guide_video_id))
    .filter(Boolean))];
  return {
    approvedGameplayCount: plays.length,
    nonemptyGuideVideoCount: plays.filter((item) => Boolean(clean(item?.guide_video_id))).length,
    distinctGuideVideoCount: guideVideoIds.length,
    guideVideoIds
  };
}

function cachedGuideVideoReadiness(bundle = {}) {
  if (!guideVideoRequired(bundle)) return null;
  const canonical = canonicalGuideVideoReadiness(bundle);
  if (canonical.status !== "passed") return null;
  const state = canonical.readiness || {};
  return {
    required: true,
    status: "passed",
    blockers: [],
    guideVideoId: canonical.guideVideoId,
    guideVideoIdPresent: true,
    approvedGameplayCount: Number(state.approved_gameplay_count || 0),
    distinctGuideVideoCount: 1,
    requestIdPresent: state.request_id_present === true,
    responseHash: clean(state.response_hash),
    evidenceRef: clean(state.evidence_ref),
    verifiedInstanceId: canonical.instanceId,
    instanceResource: canonical.instanceResource,
    source: "current_job_cached_readonly"
  };
}

async function recordGuideVideoEvidence({ repo, bundle, result }) {
  const artifactId = `EV-${bundle.job.job_id}-GUIDE-VIDEO-READONLY`;
  await repo.upsertEvidence({
    artifactId,
    jobId: bundle.job.job_id,
    artifactType: "guide_video_readiness",
    title: "P04 guide video readonly readiness",
    summary: [
      `required=${result.required === true}`,
      `status=${result.status}`,
      `approved_gameplay_count=${Number(result.approvedGameplayCount || 0)}`,
      `distinct_guide_video_count=${Number(result.distinctGuideVideoCount || 0)}`,
      `guide_video_id_present=${result.guideVideoIdPresent === true}`,
      `request_id_present=${result.requestIdPresent === true}`,
      `response_hash_present=${Boolean(result.responseHash)}`,
      `blocker=${result.blockers?.[0] || "none"}`,
      "response_body_stored=false"
    ].join("; "),
    contentHash: hashValue({
      status: result.status,
      approvedGameplayCount: Number(result.approvedGameplayCount || 0),
      distinctGuideVideoCount: Number(result.distinctGuideVideoCount || 0),
      guideVideoId: clean(result.guideVideoId),
      responseHash: clean(result.responseHash),
      blocker: result.blockers?.[0] || ""
    }),
    storageRef: `postgres:mwb.evidence_artifacts/${artifactId}`,
    sourceRef: "oceanengine:/open_api/v3.0/gameplay/list/",
    sourceUsage: bundle.job.source_usage || "runtime_truth"
  });
  return artifactId;
}

export async function resolveGuideVideoReadonly({
  repo,
  bundle,
  client = createOceanEngineReadonlyClient(),
  mockReady = false,
  allowReadonlyDependency = false
} = {}) {
  if (!guideVideoRequired(bundle)) {
    return {
      required: false,
      status: "not_required",
      blockers: [],
      guideVideoId: "",
      guideVideoIdPresent: false,
      approvedGameplayCount: 0,
      distinctGuideVideoCount: 0,
      requestIdPresent: false,
      responseHash: "",
      evidenceRef: "",
      source: "account_policy"
    };
  }

  const instanceResources = verifiedMicroAppInstanceResources(bundle);
  const instanceIds = [...new Set(instanceResources.map((item) => clean(item.platform_resource_id)))];
  if (instanceResources.length !== 1 || instanceIds.length !== 1) {
    const result = {
      required: true,
      status: "blocked",
      blockers: [instanceResources.length === 0 ? "guide_video_instance_not_verified" : "guide_video_instance_ambiguous"],
      guideVideoId: "",
      guideVideoIdPresent: false,
      approvedGameplayCount: 0,
      distinctGuideVideoCount: 0,
      requestIdPresent: false,
      responseHash: "",
      verifiedInstanceId: "",
      instanceResource: null,
      source: "verified_micro_app_instance"
    };
    result.evidenceRef = await recordGuideVideoEvidence({ repo, bundle, result });
    return result;
  }

  const instanceResource = instanceResources[0];
  const verifiedInstanceId = instanceIds[0];
  const cached = cachedGuideVideoReadiness(bundle);
  if (cached) return cached;

  if (mockReady) {
    return {
      required: true,
      status: "passed",
      blockers: [],
      guideVideoId: "guide-video-test",
      guideVideoIdPresent: true,
      approvedGameplayCount: 1,
      distinctGuideVideoCount: 1,
      requestIdPresent: true,
      responseHash: hashValue("guide-video-test"),
      evidenceRef: "mock:guide-video-readonly",
      verifiedInstanceId,
      instanceResource,
      source: "mock_ready"
    };
  }

  const permission = readonlyPermissionState({ allowReadonlyDependency });
  if (!permission.allowed) {
    return {
      required: true,
      status: "blocked",
      blockers: permission.blockers,
      guideVideoId: "",
      guideVideoIdPresent: false,
      approvedGameplayCount: 0,
      distinctGuideVideoCount: 0,
      requestIdPresent: false,
      responseHash: "",
      evidenceRef: "",
      source: "readonly_permission"
    };
  }

  const credential = client.credentialState();
  if (credential.status !== "ready") {
    return {
      required: true,
      status: "blocked",
      blockers: ["credential_required", ...(credential.blockers || [])],
      guideVideoId: "",
      guideVideoIdPresent: false,
      approvedGameplayCount: 0,
      distinctGuideVideoCount: 0,
      requestIdPresent: false,
      responseHash: "",
      evidenceRef: "",
      source: "credential_state"
    };
  }

  const probe = await client.get({
    label: `guide_video_gameplay_${bundle.job.job_id}`,
    endpoint: "/open_api/v3.0/gameplay/list/",
    query: {
      account_id: clean(bundle.job.advertiser_id),
      account_type: "AD",
      asset_id: verifiedInstanceId,
      asset_type: "BYTE_GAME",
      page_info: JSON.stringify({ page: 1, page_size: 100 })
    },
    summarize: summarizeGameplay
  });
  const ids = Array.isArray(probe.summary?.guideVideoIds)
    ? probe.summary.guideVideoIds.map(clean).filter(Boolean)
    : [];
  const blockers = probe.status !== "passed"
    ? ["guide_video_readonly_failed"]
    : ids.length === 0
      ? ["guide_video_candidate_missing"]
      : ids.length > 1
        ? ["guide_video_candidate_ambiguous"]
        : [];
  const result = {
    required: true,
    status: blockers.length ? "blocked" : "passed",
    blockers,
    guideVideoId: blockers.length ? "" : ids[0],
    guideVideoIdPresent: !blockers.length && Boolean(ids[0]),
    approvedGameplayCount: Number(probe.summary?.approvedGameplayCount || 0),
    distinctGuideVideoCount: Number(probe.summary?.distinctGuideVideoCount || ids.length),
    requestIdPresent: probe.requestIdPresent === true,
    responseHash: clean(probe.responseHash),
    evidenceRef: "",
    verifiedInstanceId,
    instanceResource,
    source: "oceanengine_gameplay_list"
  };
  result.evidenceRef = await recordGuideVideoEvidence({ repo, bundle, result });
  return result;
}

function publicGuideVideoReadiness(result = {}) {
  return {
    required: result.required === true,
    status: clean(result.status || "not_checked"),
    guideVideoIdPresent: result.guideVideoIdPresent === true,
    approvedGameplayCount: Number(result.approvedGameplayCount || 0),
    distinctGuideVideoCount: Number(result.distinctGuideVideoCount || 0),
    requestIdPresent: result.requestIdPresent === true,
    responseHashPresent: Boolean(result.responseHash),
    evidenceRefPresent: Boolean(result.evidenceRef),
    source: clean(result.source),
    blockers: Array.isArray(result.blockers) ? result.blockers : []
  };
}

async function persistGuideVideoReadiness({ repo, bundle, result }) {
  if (bundle.job.source_usage === "test_run" || result.status !== "passed") return;
  const resource = result.instanceResource || {};
  await repo.upsertAccountResourceReadonlyBySourceAsset({
    routeId: bundle.job.route_id,
    gameCode: bundle.job.game_code,
    advertiserId: bundle.job.advertiser_id,
    resourceType: "micro_app_instance",
    sourceAssetId: clean(resource.source_asset_id),
    resourceName: clean(resource.resource_name || resource.source_asset_id),
    visibilityStatus: clean(resource.visibility_status || "visible"),
    readbackStatus: clean(resource.readback_status || "readback_verified"),
    platformResourceId: result.verifiedInstanceId,
    required: resource.required !== false,
    metadata: resource.metadata?.readonly_check || {},
    resourceMetadata: {
      guide_video_readiness: {
        status: "passed",
        required: true,
        guide_video_id: result.guideVideoId,
        guide_video_id_present: true,
        approved_gameplay_count: result.approvedGameplayCount,
        distinct_guide_video_count: result.distinctGuideVideoCount,
        request_id_present: result.requestIdPresent,
        response_hash: result.responseHash,
        evidence_ref: result.evidenceRef,
        verified_by_job_id: bundle.job.job_id,
        verified_instance_id: result.verifiedInstanceId,
        verified_at: new Date().toISOString(),
        raw_response_stored: false
      }
    }
  });
}

function materialList(payload = {}) {
  return [
    payload?.data?.list,
    payload?.data?.video_list,
    payload?.data?.material_list,
    payload?.data?.items
  ].find((item) => Array.isArray(item)) || [];
}

function summarizeMaterial(payload = {}, wantedId = "") {
  const wanted = clean(wantedId);
  const found = materialList(payload).find((item) => {
    const ids = [item.id, item.video_id, item.image_id, item.material_id].map(clean);
    return ids.includes(wanted);
  });
  return {
    listCount: materialList(payload).length,
    targetVisible: Boolean(found),
    materialIdPresent: Boolean(found?.material_id),
    widthPresent: Boolean(found?.width),
    heightPresent: Boolean(found?.height)
  };
}

function existingVideoReady(resource = {}, { requireExplicitCover = false, jobId = "" } = {}) {
  const readonlyStatus = clean(resource?.metadata?.readonly_check?.status);
  const videoPresent = resource?.metadata?.readonly_check?.video_id_present === true ||
    resource?.metadata?.final_material_readiness?.video_id_present === true;
  const coverMode = clean(resource?.metadata?.readonly_check?.cover_mode || resource?.metadata?.final_material_readiness?.cover_mode);
  const coverReady = requireExplicitCover
    ? coverMode === "explicit_cover_verified" &&
      clean(resource?.metadata?.readonly_check?.verified_by_job_id || resource?.metadata?.final_material_readiness?.verified_by_job_id) === clean(jobId)
    : ["explicit_cover_verified", "platform_default_cover_allowed"].includes(coverMode);
  return resource?.visibility_status === "visible" &&
    resource?.readback_status === "readback_verified" &&
    ["passed", "passed_by_manual_confirmation"].includes(readonlyStatus) &&
    videoPresent &&
    coverReady;
}

function publicItem({
  sourceAssetId,
  videoIdPresent,
  videoCoverIdPresent,
  videoReadonlyStatus,
  coverReadonlyStatus,
  coverMode,
  planStatus,
  nextAction,
  readbackStatus,
  evidenceRef,
  targetVideoVisible = false,
  explicitCoverVisible = false,
  videoRequestIdPresent = false,
  coverRequestIdPresent = false,
  videoResponseHashPresent = false,
  coverResponseHashPresent = false,
  videoVerifiedByCurrentJob = false,
  coverVerifiedByCurrentJob = false
}) {
  return {
    sourceAssetId,
    videoIdPresent: Boolean(videoIdPresent),
    videoCoverIdPresent: Boolean(videoCoverIdPresent),
    videoReadonlyStatus,
    coverReadonlyStatus,
    coverMode: coverMode || "",
    planStatus: planStatus || "",
    nextAction: nextAction || "",
    readbackStatus,
    evidenceRef,
    targetVideoVisible: Boolean(targetVideoVisible),
    explicitCoverVisible: Boolean(explicitCoverVisible),
    videoRequestIdPresent: Boolean(videoRequestIdPresent),
    coverRequestIdPresent: Boolean(coverRequestIdPresent),
    videoResponseHashPresent: Boolean(videoResponseHashPresent),
    coverResponseHashPresent: Boolean(coverResponseHashPresent),
    videoVerifiedByCurrentJob: Boolean(videoVerifiedByCurrentJob),
    coverVerifiedByCurrentJob: Boolean(coverVerifiedByCurrentJob)
  };
}

function coverModeFrom({ explicitCoverVisible = false, videoVisible = false } = {}) {
  if (explicitCoverVisible) return "explicit_cover_verified";
  if (videoVisible) return "platform_default_cover_allowed";
  return "cover_not_ready";
}

function materialPlanStatus({ sourceVideoVisible = false, targetVideoVisible = false, localFileReady = false, probeFailed = false } = {}) {
  if (probeFailed) return "platform_probe_failed";
  if (sourceVideoVisible && targetVideoVisible) return "source_ready_target_ready";
  if (sourceVideoVisible && !targetVideoVisible) return "source_ready_target_missing";
  if (!sourceVideoVisible && localFileReady) return "source_missing_local_ready";
  return "source_missing_local_missing";
}

function nextActionForPlan(planStatus) {
  if (planStatus === "source_ready_target_ready") return "无需动作";
  if (planStatus === "source_ready_target_missing") return "仅需将物料户视频绑定或推送到目标账户";
  if (planStatus === "source_missing_local_ready") return "先上传本地 MP4 到物料户，再绑定或推送到目标账户";
  if (planStatus === "platform_probe_failed") return "只读 probe 失败，停止并复查平台返回";
  return "补齐 v2 本地 MP4 或确认物料户素材";
}

function videoQueryFor(item, advertiserId) {
  return {
    advertiser_id: advertiserId,
    filtering: JSON.stringify({ video_ids: [item.videoId] }),
    page: "1",
    page_size: "100"
  };
}

function coverQueryFor(item, advertiserId) {
  return {
    advertiser_id: advertiserId,
    filtering: JSON.stringify({ image_ids: [item.coverId] }),
    page: "1",
    page_size: "100"
  };
}

function sourceReadyFromCachedResource(resource = {}) {
  const readonlyCheck = resource?.metadata?.readonly_check || {};
  const finalReadiness = resource?.metadata?.final_material_readiness || {};
  const planStatus = clean(readonlyCheck.plan_status || finalReadiness.plan_status);
  return readonlyCheck.source_video_visible === true ||
    finalReadiness.source_video_visible === true ||
    ["source_ready_target_missing", "source_ready_target_ready"].includes(planStatus);
}

function probeFailedStatus(...probes) {
  return probes.some((probe) => ["transport_failed", "credential_required"].includes(probe?.status));
}

function readbackProbeSummaryFromItems(items = []) {
  return {
    itemProbeCount: items.length,
    requestIdPresent: items.some((item) => item.videoRequestIdPresent || item.coverRequestIdPresent),
    responseHashPresent: items.some((item) => item.videoResponseHashPresent || item.coverResponseHashPresent),
    videoRequestIdPresentCount: items.filter((item) => item.videoRequestIdPresent).length,
    coverRequestIdPresentCount: items.filter((item) => item.coverRequestIdPresent).length,
    videoResponseHashPresentCount: items.filter((item) => item.videoResponseHashPresent).length,
    coverResponseHashPresentCount: items.filter((item) => item.coverResponseHashPresent).length,
    items: items.map((item) => ({
      sourceAssetId: item.sourceAssetId,
      targetVideoVisible: item.targetVideoVisible === true,
      explicitCoverVisible: item.explicitCoverVisible === true,
      coverMode: item.coverMode,
      videoRequestIdPresent: item.videoRequestIdPresent === true,
      coverRequestIdPresent: item.coverRequestIdPresent === true,
      videoResponseHashPresent: item.videoResponseHashPresent === true,
      coverResponseHashPresent: item.coverResponseHashPresent === true
    }))
  };
}

async function recordVideoEvidence({ repo, bundle, item, status, videoProbe, coverProbe, blocker, coverMode, planStatus }) {
  const artifactId = `EV-${bundle.job.job_id}-VIDEO-MATERIAL-${item.sourceAssetId.replace(/[^A-Za-z0-9]+/g, "_")}`;
  const summary = [
    `status=${status}`,
    `source_asset_id=${item.sourceAssetId}`,
    `video_id_present=${Boolean(item.videoId)}`,
    `video_cover_id_present=${Boolean(item.coverId)}`,
    `cover_mode=${coverMode || "not_checked"}`,
    `plan_status=${planStatus || "not_checked"}`,
    `local_file_present=${Boolean(item.localFilePath)}`,
    `local_file_hash_present=${Boolean(item.localFileHash)}`,
    `video_probe_status=${videoProbe?.status || "not_called"}`,
    `cover_probe_status=${coverProbe?.status || "not_called"}`,
    `video_target_visible=${Boolean(videoProbe?.summary?.targetVisible)}`,
    `cover_target_visible=${Boolean(coverProbe?.summary?.targetVisible)}`,
    `video_source_visible=${Boolean(videoProbe?.summary?.sourceVisible)}`,
    `cover_source_visible=${Boolean(coverProbe?.summary?.sourceVisible)}`,
    `video_request_id_present=${Boolean(videoProbe?.requestIdPresent)}`,
    `cover_request_id_present=${Boolean(coverProbe?.requestIdPresent)}`,
    `video_response_hash_present=${Boolean(videoProbe?.responseHash)}`,
    `cover_response_hash_present=${Boolean(coverProbe?.responseHash)}`,
    `blocker=${blocker || "none"}`,
    "response_body_stored=false"
  ].join("; ");
  await repo.upsertEvidence({
    artifactId,
    jobId: bundle.job.job_id,
    artifactType: "video_material_readiness",
    title: "P04 video material readonly readiness",
    summary,
    contentHash: hashValue({
      sourceAssetId: item.sourceAssetId,
      status,
      videoProbeStatus: videoProbe?.status || "",
      coverProbeStatus: coverProbe?.status || "",
      videoResponseHash: videoProbe?.responseHash || "",
      coverResponseHash: coverProbe?.responseHash || "",
      coverMode: coverMode || "",
      planStatus: planStatus || "",
      blocker: blocker || ""
    }),
    storageRef: `postgres:mwb.evidence_artifacts/${artifactId}`,
    sourceRef: "oceanengine:file/video/get+file/image/get",
    sourceUsage: bundle.job.source_usage || "runtime_truth"
  });
  return artifactId;
}

async function persistVideoResource({ repo, bundle, item, status, evidenceRef, blocker, coverMode, planStatus, sourceVideoVisible, targetVideoVisible, explicitCoverVisible }) {
  if (bundle.job.source_usage === "test_run") return;
  await repo.upsertAccountResourceReadonlyBySourceAsset({
    routeId: bundle.job.route_id,
    gameCode: bundle.job.game_code,
    advertiserId: bundle.job.advertiser_id,
    resourceType: "video_asset",
    sourceAssetId: item.sourceAssetId,
    resourceName: item.resourceName || item.sourceAssetId,
    visibilityStatus: status === "passed" ? "visible" : "needs_confirmation",
    readbackStatus: status === "passed" ? "readback_verified" : "not_checked",
    platformResourceId: item.sourceAssetId,
    required: true,
    metadata: {
      status,
      key: "platform_video_material_pair",
      gap: blocker || "",
      next_action: status === "passed" ? "无需动作" : "确认视频在物料户与目标账户可用；显式封面不可用时走平台默认封面",
      source_asset_id: item.sourceAssetId,
      video_id_present: Boolean(item.videoId),
      video_cover_id_present: Boolean(item.coverId),
      cover_mode: coverMode || "not_checked",
      plan_status: planStatus || "not_checked",
      source_video_visible: Boolean(sourceVideoVisible),
      target_video_visible: Boolean(targetVideoVisible),
      explicit_cover_visible: Boolean(explicitCoverVisible),
      verified_by_job_id: bundle.job.job_id,
      local_file_present: Boolean(item.localFilePath),
      local_file_hash_present: Boolean(item.localFileHash),
      source_account_id_present: Boolean(item.sourceAdvertiserId),
      checked_at: new Date().toISOString(),
      evidence_refs: [evidenceRef].filter(Boolean)
    },
    resourceMetadata: {
      role: "default_video",
      final_material_readiness: {
        status,
        source_asset_id: item.sourceAssetId,
        video_id_present: Boolean(item.videoId),
        video_cover_id_present: Boolean(item.coverId),
        cover_mode: coverMode || "not_checked",
        plan_status: planStatus || "not_checked",
        source_video_visible: Boolean(sourceVideoVisible),
        target_video_visible: Boolean(targetVideoVisible),
        explicit_cover_visible: Boolean(explicitCoverVisible),
        verified_by_job_id: bundle.job.job_id,
        source_account_id_present: Boolean(item.sourceAdvertiserId),
        evidence_ref: evidenceRef || ""
      }
    }
  });
}

function summaryFromItems({ items, source = "postgres_readonly_metadata", requireExplicitCover = false }) {
  const verifiedItems = items.filter((item) => item.readbackStatus === "readback_verified");
  const coverReadyItems = items.filter((item) =>
    item.readbackStatus === "readback_verified" &&
    (requireExplicitCover
      ? item.coverMode === "explicit_cover_verified" && item.coverVerifiedByCurrentJob === true
      : ["explicit_cover_verified", "platform_default_cover_allowed"].includes(item.coverMode))
  );
  const selectedRequiredVideoCount = items.length;
  const verifiedVideoCount = verifiedItems.length;
  const coverReadyCount = coverReadyItems.length;
  const ready = selectedRequiredVideoCount > 0 &&
    selectedRequiredVideoCount === verifiedVideoCount &&
    selectedRequiredVideoCount === coverReadyCount;
  return {
    status: ready ? "passed" : "blocked",
    blockers: ready ? [] : ["video_material_per_item_readiness_not_passed"],
    outputSummary: {
      resourceType: "video_asset",
      label: "视频",
      ready,
      selectedRequiredVideoCount,
      verifiedVideoCount,
      coverVerifiedCount: coverReadyCount,
      coverReadyCount,
      videoCoverRequired: requireExplicitCover,
      readonlyStatus: ready ? "passed" : "blocked",
      materialReadinessSource: source,
      displayText: `视频素材 ${verifiedVideoCount}/${selectedRequiredVideoCount} 已就绪`,
      finalMaterialReadiness: {
        status: ready ? "passed" : "blocked",
        selectedRequiredVideoCount,
        verifiedVideoCount,
        coverVerifiedCount: coverReadyCount,
        coverReadyCount,
        videoCoverRequired: requireExplicitCover,
        items: items.map(publicItem)
      },
      nextAction: ready ? "无需动作" : "逐条补齐视频在目标账户的可读性；封面优先显式验证，否则使用平台默认封面"
    }
  };
}

export async function runVideoMaterialReadonlyGate({
  repo,
  bundle,
  client = createOceanEngineReadonlyClient(),
  mockReady = false,
  allowReadonlyDependency = false
} = {}) {
  const requiredItems = requiredVideoEntries(bundle);
  const requireExplicitCover = videoCoverRequired(bundle);
  if (requiredItems.length === 0) {
    return summaryFromItems({ items: [], source: "material_pack_missing_required_video", requireExplicitCover });
  }

  const guideVideoReadiness = await resolveGuideVideoReadonly({
    repo,
    bundle,
    client,
    mockReady,
    allowReadonlyDependency
  });
  if (guideVideoReadiness.status === "passed" && guideVideoReadiness.source !== "current_job_cached_readonly") {
    await persistGuideVideoReadiness({ repo, bundle, result: guideVideoReadiness });
  }

  const cachedItems = requiredItems.map((item) => {
    const resource = accountResourceForVideo(bundle, item.sourceAssetId);
    const cachedReady = mockReady || (!requireExplicitCover && existingVideoReady(resource));
    return publicItem({
      sourceAssetId: item.sourceAssetId,
      videoIdPresent: Boolean(item.videoId),
      videoCoverIdPresent: Boolean(item.coverId),
      videoReadonlyStatus: cachedReady ? "cached" : clean(resource?.metadata?.readonly_check?.status || "not_checked"),
      coverReadonlyStatus: cachedReady ? "cached" : clean(resource?.metadata?.readonly_check?.status || "not_checked"),
      coverMode: mockReady
        ? (requireExplicitCover ? "explicit_cover_verified" : "platform_default_cover_allowed")
        : cachedReady
          ? clean(resource?.metadata?.readonly_check?.cover_mode || resource?.metadata?.final_material_readiness?.cover_mode || "platform_default_cover_allowed")
          : clean(resource?.metadata?.readonly_check?.cover_mode || resource?.metadata?.final_material_readiness?.cover_mode || "not_checked"),
      planStatus: clean(resource?.metadata?.readonly_check?.plan_status || resource?.metadata?.final_material_readiness?.plan_status || ""),
      nextAction: clean(resource?.metadata?.readonly_check?.next_action || ""),
      readbackStatus: cachedReady ? "readback_verified" : clean(resource?.readback_status || "missing"),
      evidenceRef: clean(resource?.metadata?.readonly_check?.evidence_refs?.[0] || resource?.metadata?.final_material_readiness?.evidence_ref),
      videoVerifiedByCurrentJob: mockReady,
      coverVerifiedByCurrentJob: mockReady && requireExplicitCover
    });
  });
  const cachedSummary = summaryFromItems({ items: cachedItems, source: mockReady ? "mock_ready" : "postgres_readonly_metadata", requireExplicitCover });
  if (guideVideoReadiness.status === "blocked") {
    return sanitizeForPublic({
      status: "blocked",
      blockers: guideVideoReadiness.blockers,
      outputSummary: {
        ...cachedSummary.outputSummary,
        ready: false,
        readonlyStatus: "guide_video_not_ready",
        guideVideoReadiness: publicGuideVideoReadiness(guideVideoReadiness),
        nextAction: "重新只读玩法；仅在唯一审核通过引导视频可确定后继续"
      },
      evidenceRefs: [guideVideoReadiness.evidenceRef].filter(Boolean)
    });
  }
  if (cachedSummary.status === "passed") {
    return sanitizeForPublic({
      ...cachedSummary,
      outputSummary: {
        ...cachedSummary.outputSummary,
        guideVideoReadiness: publicGuideVideoReadiness(guideVideoReadiness)
      },
      evidenceRefs: [guideVideoReadiness.evidenceRef].filter(Boolean)
    });
  }

  const permission = readonlyPermissionState({ allowReadonlyDependency });
  if (!permission.allowed) {
    return sanitizeForPublic({
      status: "blocked",
      blockers: permission.blockers,
      outputSummary: {
        ...cachedSummary.outputSummary,
        readonlyStatus: "readonly_permission_required",
        nextAction: "仅开放真实平台只读依赖后重跑 per-video readiness"
      }
    });
  }

  const credential = client.credentialState();
  if (credential.status !== "ready") {
    return sanitizeForPublic({
      status: "blocked",
      blockers: ["credential_required", ...(credential.blockers || [])],
      outputSummary: {
        ...cachedSummary.outputSummary,
        readonlyStatus: "credential_required",
        credential: {
          status: credential.status,
          envFilePresent: Boolean(credential.envFilePresent),
          accessTokenPresent: Boolean(credential.accessTokenPresent),
          refreshTokenPresent: Boolean(credential.refreshTokenPresent),
          tokenExpired: Boolean(credential.tokenExpired),
          blockers: credential.blockers || []
        },
        nextAction: "处理 v2 OceanEngine 凭据后重跑视频逐条只读 gate"
      }
    });
  }

  const targetAdvertiserId = clean(bundle.job.advertiser_id);
  const sourceAccount = materialSourceAccount(bundle);
  const checkedItems = [];
  const evidenceRefs = [];
  for (const item of requiredItems) {
    item.sourceAdvertiserId = sourceAccount.advertiserId;
    let blocker = "";
    let videoTargetProbe = null;
    let coverTargetProbe = null;
    let videoSourceProbe = null;
    let coverSourceProbe = null;
    let coverMode = "not_checked";
    let planStatus = "not_checked";
    let sourceVideoVisible = false;
    let targetVideoVisible = false;
    let targetCoverVisible = false;
    let probeFailed = false;
    if (!item.videoId) {
      blocker = "video_id_missing";
    } else {
      videoSourceProbe = sourceAccount.advertiserId ? await client.get({
        label: `source_video_material_${item.sourceAssetId}`,
        endpoint: "file/video/get",
        query: videoQueryFor(item, sourceAccount.advertiserId),
        summarize: (payload) => summarizeMaterial(payload, item.videoId)
      }) : null;
      coverSourceProbe = sourceAccount.advertiserId && item.coverId ? await client.get({
        label: `source_video_cover_${item.sourceAssetId}`,
        endpoint: "file/image/get",
        query: coverQueryFor(item, sourceAccount.advertiserId),
        summarize: (payload) => summarizeMaterial(payload, item.coverId)
      }) : null;
      videoTargetProbe = await client.get({
        label: `target_video_material_${item.sourceAssetId}`,
        endpoint: "file/video/get",
        query: videoQueryFor(item, targetAdvertiserId),
        summarize: (payload) => summarizeMaterial(payload, item.videoId)
      });
      coverTargetProbe = item.coverId ? await client.get({
        label: `target_video_cover_${item.sourceAssetId}`,
        endpoint: "file/image/get",
        query: coverQueryFor(item, targetAdvertiserId),
        summarize: (payload) => summarizeMaterial(payload, item.coverId)
      }) : null;
      sourceVideoVisible = sourceAccount.advertiserId &&
        videoSourceProbe?.status === "passed" &&
        videoSourceProbe.summary?.targetVisible === true;
      targetVideoVisible = videoTargetProbe.status === "passed" && videoTargetProbe.summary?.targetVisible === true;
      targetCoverVisible = coverTargetProbe?.status === "passed" && coverTargetProbe.summary?.targetVisible === true;
      probeFailed = probeFailedStatus(
        videoSourceProbe,
        videoTargetProbe,
        ...(requireExplicitCover ? [coverSourceProbe, coverTargetProbe] : [])
      );
      coverMode = coverModeFrom({ explicitCoverVisible: targetCoverVisible, videoVisible: targetVideoVisible });
      planStatus = materialPlanStatus({
        sourceVideoVisible,
        targetVideoVisible,
        localFileReady: Boolean(item.localFilePath && item.localFileHash && item.localFileSizeBytes > 0),
        probeFailed
      });
      if (!sourceAccount.advertiserId) blocker = "material_source_account_missing";
      if (!blocker && requireExplicitCover && !item.coverId) blocker = "video_cover_id_missing";
      if (!blocker && requireExplicitCover && coverSourceProbe?.summary?.targetVisible !== true) blocker = "video_cover_source_not_visible";
      if (!blocker && requireExplicitCover && !targetCoverVisible) blocker = "video_cover_target_not_visible";
      if (!blocker && planStatus === "platform_probe_failed") blocker = "platform_probe_failed";
      if (!blocker && planStatus === "source_missing_local_missing") blocker = "source_missing_local_missing";
      if (!blocker && planStatus === "source_missing_local_ready") blocker = "source_missing_local_ready";
      if (!blocker && planStatus === "source_ready_target_missing") blocker = "source_ready_target_missing";
    }
    const status = blocker ? "blocked" : "passed";
    const evidenceRef = await recordVideoEvidence({
      repo,
      bundle,
      item,
      status,
      videoProbe: {
        ...(videoTargetProbe || {}),
        summary: {
          ...(videoTargetProbe?.summary || {}),
          sourceVisible: videoSourceProbe?.summary?.targetVisible === true
        }
      },
      coverProbe: {
        ...(coverTargetProbe || {}),
        summary: {
          ...(coverTargetProbe?.summary || {}),
          sourceVisible: coverSourceProbe?.summary?.targetVisible === true
        }
      },
      blocker,
      coverMode,
      planStatus
    });
    evidenceRefs.push(evidenceRef);
    await persistVideoResource({
      repo,
      bundle,
      item,
      status,
      evidenceRef,
      blocker,
      coverMode,
      planStatus,
      sourceVideoVisible,
      targetVideoVisible,
      explicitCoverVisible: targetCoverVisible
    });
    checkedItems.push(publicItem({
      sourceAssetId: item.sourceAssetId,
      videoIdPresent: Boolean(item.videoId),
      videoCoverIdPresent: Boolean(item.coverId),
      videoReadonlyStatus: videoTargetProbe?.summary?.targetVisible === true ? "passed" : (videoTargetProbe?.status === "passed" ? "blocked" : (videoTargetProbe?.status || (item.videoId ? "not_called" : "missing"))),
      coverReadonlyStatus: coverMode === "explicit_cover_verified" ? "passed" : (coverMode === "platform_default_cover_allowed" ? "not_required" : (coverTargetProbe?.status || (item.coverId ? "not_called" : "missing"))),
      coverMode,
      planStatus,
      nextAction: nextActionForPlan(planStatus),
      readbackStatus: status === "passed" ? "readback_verified" : "not_checked",
      evidenceRef,
      targetVideoVisible,
      explicitCoverVisible: targetCoverVisible,
      videoRequestIdPresent: videoTargetProbe?.requestIdPresent === true,
      coverRequestIdPresent: coverTargetProbe?.requestIdPresent === true,
      videoResponseHashPresent: Boolean(videoTargetProbe?.responseHash),
      coverResponseHashPresent: Boolean(coverTargetProbe?.responseHash),
      videoVerifiedByCurrentJob: targetVideoVisible,
      coverVerifiedByCurrentJob: targetCoverVisible
    }));
  }

  const result = summaryFromItems({ items: checkedItems, source: "oceanengine_readonly_probe", requireExplicitCover });
  return sanitizeForPublic({
    ...result,
    outputSummary: {
      ...result.outputSummary,
      guideVideoReadiness: publicGuideVideoReadiness(guideVideoReadiness),
      readbackProbeSummary: readbackProbeSummaryFromItems(checkedItems)
    },
    evidenceRefs: [...evidenceRefs, guideVideoReadiness.evidenceRef].filter(Boolean),
    blockers: result.status === "passed" ? [] : [
      ...new Set(checkedItems
        .filter((item) => item.readbackStatus !== "readback_verified")
        .map((item) => `video_material_not_ready:${item.sourceAssetId}`))
    ]
  });
}

export async function runVideoMaterialTargetReadonlyProbe({
  repo,
  bundle,
  client = createOceanEngineReadonlyClient(),
  allowReadonlyDependency = false,
  sourceAssetIds = [],
  assumeSourceReady = true
} = {}) {
  const wantedAssetIds = new Set((sourceAssetIds || []).map(clean).filter(Boolean));
  const requiredItems = requiredVideoEntries(bundle)
    .filter((item) => wantedAssetIds.size === 0 || wantedAssetIds.has(item.sourceAssetId));
  if (requiredItems.length === 0) {
    return summaryFromItems({ items: [], source: "material_pack_missing_required_video", requireExplicitCover: videoCoverRequired(bundle) });
  }
  const requireExplicitCover = videoCoverRequired(bundle);

  const permission = readonlyPermissionState({ allowReadonlyDependency });
  if (!permission.allowed) {
    const items = requiredItems.map((item) => publicItem({
      sourceAssetId: item.sourceAssetId,
      videoIdPresent: Boolean(item.videoId),
      videoCoverIdPresent: Boolean(item.coverId),
      videoReadonlyStatus: "readonly_permission_required",
      coverReadonlyStatus: "readonly_permission_required",
      coverMode: "not_checked",
      planStatus: "not_checked",
      nextAction: "仅开放真实平台只读依赖后重跑目标户视频 readback",
      readbackStatus: "not_checked",
      evidenceRef: ""
    }));
    const summary = summaryFromItems({ items, source: "target_account_readonly_permission_required", requireExplicitCover });
    return sanitizeForPublic({
      ...summary,
      blockers: permission.blockers,
      outputSummary: {
        ...summary.outputSummary,
        readonlyStatus: "readonly_permission_required",
        readbackProbeSummary: readbackProbeSummaryFromItems(items)
      }
    });
  }

  const credential = client.credentialState();
  if (credential.status !== "ready") {
    const items = requiredItems.map((item) => publicItem({
      sourceAssetId: item.sourceAssetId,
      videoIdPresent: Boolean(item.videoId),
      videoCoverIdPresent: Boolean(item.coverId),
      videoReadonlyStatus: "credential_required",
      coverReadonlyStatus: "credential_required",
      coverMode: "not_checked",
      planStatus: "platform_probe_failed",
      nextAction: "处理 v2 OceanEngine 凭据后重跑目标户视频 readback",
      readbackStatus: "not_checked",
      evidenceRef: ""
    }));
    const summary = summaryFromItems({ items, source: "target_account_credential_required", requireExplicitCover });
    return sanitizeForPublic({
      ...summary,
      blockers: ["credential_required", ...(credential.blockers || [])],
      outputSummary: {
        ...summary.outputSummary,
        readonlyStatus: "credential_required",
        credential: {
          status: credential.status,
          envFilePresent: Boolean(credential.envFilePresent),
          accessTokenPresent: Boolean(credential.accessTokenPresent),
          refreshTokenPresent: Boolean(credential.refreshTokenPresent),
          tokenExpired: Boolean(credential.tokenExpired),
          blockers: credential.blockers || []
        },
        readbackProbeSummary: readbackProbeSummaryFromItems(items)
      }
    });
  }

  const targetAdvertiserId = clean(bundle.job.advertiser_id);
  const checkedItems = [];
  const evidenceRefs = [];
  for (const item of requiredItems) {
    const resource = accountResourceForVideo(bundle, item.sourceAssetId);
    const sourceVideoVisible = assumeSourceReady || sourceReadyFromCachedResource(resource);
    let blocker = "";
    let videoTargetProbe = null;
    let coverTargetProbe = null;
    let targetVideoVisible = false;
    let targetCoverVisible = false;
    let coverMode = "not_checked";
    let planStatus = "not_checked";

    if (!item.videoId) {
      blocker = "video_id_missing";
    } else {
      videoTargetProbe = await client.get({
        label: `target_video_material_${item.sourceAssetId}`,
        endpoint: "file/video/get",
        query: videoQueryFor(item, targetAdvertiserId),
        summarize: (payload) => summarizeMaterial(payload, item.videoId)
      });
      coverTargetProbe = item.coverId ? await client.get({
        label: `target_video_cover_${item.sourceAssetId}`,
        endpoint: "file/image/get",
        query: coverQueryFor(item, targetAdvertiserId),
        summarize: (payload) => summarizeMaterial(payload, item.coverId)
      }) : null;
      targetVideoVisible = videoTargetProbe.status === "passed" && videoTargetProbe.summary?.targetVisible === true;
      targetCoverVisible = coverTargetProbe?.status === "passed" && coverTargetProbe.summary?.targetVisible === true;
      coverMode = coverModeFrom({ explicitCoverVisible: targetCoverVisible, videoVisible: targetVideoVisible });
      planStatus = materialPlanStatus({
        sourceVideoVisible,
        targetVideoVisible,
        localFileReady: Boolean(item.localFilePath && item.localFileHash && item.localFileSizeBytes > 0),
        probeFailed: probeFailedStatus(videoTargetProbe)
      });
      if (!blocker && planStatus === "platform_probe_failed") blocker = "platform_probe_failed";
      if (!blocker && requireExplicitCover && !item.coverId) blocker = "video_cover_id_missing";
      if (!blocker && requireExplicitCover && !targetCoverVisible) blocker = "video_cover_target_not_visible";
      if (!blocker && planStatus === "source_missing_local_missing") blocker = "source_readiness_not_verified_by_precheck";
      if (!blocker && planStatus === "source_missing_local_ready") blocker = "source_readiness_not_verified_by_precheck";
      if (!blocker && planStatus === "source_ready_target_missing") blocker = "source_ready_target_missing";
    }

    const status = blocker ? "blocked" : "passed";
    const evidenceRef = await recordVideoEvidence({
      repo,
      bundle,
      item,
      status,
      videoProbe: {
        ...(videoTargetProbe || {}),
        summary: {
          ...(videoTargetProbe?.summary || {}),
          sourceVisible: sourceVideoVisible
        }
      },
      coverProbe: {
        ...(coverTargetProbe || {}),
        summary: coverTargetProbe?.summary || {}
      },
      blocker,
      coverMode,
      planStatus
    });
    evidenceRefs.push(evidenceRef);
    await persistVideoResource({
      repo,
      bundle,
      item,
      status,
      evidenceRef,
      blocker,
      coverMode,
      planStatus,
      sourceVideoVisible,
      targetVideoVisible,
      explicitCoverVisible: targetCoverVisible
    });
    checkedItems.push(publicItem({
      sourceAssetId: item.sourceAssetId,
      videoIdPresent: Boolean(item.videoId),
      videoCoverIdPresent: Boolean(item.coverId),
      videoReadonlyStatus: targetVideoVisible ? "passed" : (videoTargetProbe?.status === "passed" ? "blocked" : (videoTargetProbe?.status || (item.videoId ? "not_called" : "missing"))),
      coverReadonlyStatus: coverMode === "explicit_cover_verified" ? "passed" : (coverMode === "platform_default_cover_allowed" ? "not_required" : (coverTargetProbe?.status || (item.coverId ? "not_called" : "missing"))),
      coverMode,
      planStatus,
      nextAction: nextActionForPlan(planStatus),
      readbackStatus: status === "passed" ? "readback_verified" : "not_checked",
      evidenceRef,
      targetVideoVisible,
      explicitCoverVisible: targetCoverVisible,
      videoRequestIdPresent: videoTargetProbe?.requestIdPresent === true,
      coverRequestIdPresent: coverTargetProbe?.requestIdPresent === true,
      videoResponseHashPresent: Boolean(videoTargetProbe?.responseHash),
      coverResponseHashPresent: Boolean(coverTargetProbe?.responseHash),
      videoVerifiedByCurrentJob: targetVideoVisible,
      coverVerifiedByCurrentJob: targetCoverVisible
    }));
  }

  const result = summaryFromItems({ items: checkedItems, source: "oceanengine_target_readonly_probe", requireExplicitCover });
  return sanitizeForPublic({
    ...result,
    evidenceRefs,
    outputSummary: {
      ...result.outputSummary,
      sourceReadinessMode: assumeSourceReady ? "precheck_reused" : "postgres_metadata_reused",
      readbackProbeSummary: readbackProbeSummaryFromItems(checkedItems)
    },
    blockers: result.status === "passed" ? [] : [
      ...new Set(checkedItems
        .filter((item) => item.readbackStatus !== "readback_verified")
        .map((item) => `video_material_not_ready:${item.sourceAssetId}`))
    ]
  });
}
