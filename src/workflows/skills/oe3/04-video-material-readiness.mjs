import { createOceanEngineReadonlyClient } from "../../../platforms/oceanengineReadonlyClient.mjs";
import { hashValue, sanitizeForPublic } from "./00-contracts.mjs";
import { readonlyPermissionState } from "./00-readonly-permission.mjs";
import { clean } from "./04-resource-verifiers.mjs";

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

function existingVideoReady(resource = {}) {
  const readonlyStatus = clean(resource?.metadata?.readonly_check?.status);
  const videoPresent = resource?.metadata?.readonly_check?.video_id_present === true ||
    resource?.metadata?.final_material_readiness?.video_id_present === true;
  const coverMode = clean(resource?.metadata?.readonly_check?.cover_mode || resource?.metadata?.final_material_readiness?.cover_mode);
  const coverReady = ["explicit_cover_verified", "platform_default_cover_allowed"].includes(coverMode);
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
  evidenceRef
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
    evidenceRef
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
        source_account_id_present: Boolean(item.sourceAdvertiserId),
        evidence_ref: evidenceRef || ""
      }
    }
  });
}

function summaryFromItems({ items, source = "postgres_readonly_metadata" }) {
  const verifiedItems = items.filter((item) => item.readbackStatus === "readback_verified");
  const coverReadyItems = items.filter((item) =>
    item.readbackStatus === "readback_verified" &&
    ["explicit_cover_verified", "platform_default_cover_allowed"].includes(item.coverMode)
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
      readonlyStatus: ready ? "passed" : "blocked",
      materialReadinessSource: source,
      displayText: `视频素材 ${verifiedVideoCount}/${selectedRequiredVideoCount} 已就绪`,
      finalMaterialReadiness: {
        status: ready ? "passed" : "blocked",
        selectedRequiredVideoCount,
        verifiedVideoCount,
        coverVerifiedCount: coverReadyCount,
        coverReadyCount,
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
  if (requiredItems.length === 0) {
    return summaryFromItems({ items: [], source: "material_pack_missing_required_video" });
  }

  const cachedItems = requiredItems.map((item) => {
    const resource = accountResourceForVideo(bundle, item.sourceAssetId);
    const cachedReady = mockReady || existingVideoReady(resource);
    return publicItem({
      sourceAssetId: item.sourceAssetId,
      videoIdPresent: Boolean(item.videoId),
      videoCoverIdPresent: Boolean(item.coverId),
      videoReadonlyStatus: cachedReady ? "cached" : clean(resource?.metadata?.readonly_check?.status || "not_checked"),
      coverReadonlyStatus: cachedReady ? "cached" : clean(resource?.metadata?.readonly_check?.status || "not_checked"),
      coverMode: mockReady
        ? "platform_default_cover_allowed"
        : cachedReady
          ? clean(resource?.metadata?.readonly_check?.cover_mode || resource?.metadata?.final_material_readiness?.cover_mode || "platform_default_cover_allowed")
          : clean(resource?.metadata?.readonly_check?.cover_mode || resource?.metadata?.final_material_readiness?.cover_mode || "not_checked"),
      planStatus: clean(resource?.metadata?.readonly_check?.plan_status || resource?.metadata?.final_material_readiness?.plan_status || ""),
      nextAction: clean(resource?.metadata?.readonly_check?.next_action || ""),
      readbackStatus: cachedReady ? "readback_verified" : clean(resource?.readback_status || "missing"),
      evidenceRef: clean(resource?.metadata?.readonly_check?.evidence_refs?.[0] || resource?.metadata?.final_material_readiness?.evidence_ref)
    });
  });
  const cachedSummary = summaryFromItems({ items: cachedItems, source: mockReady ? "mock_ready" : "postgres_readonly_metadata" });
  if (cachedSummary.status === "passed") return sanitizeForPublic(cachedSummary);

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
      const videoQuery = (advertiserId) => ({
        advertiser_id: advertiserId,
        filtering: JSON.stringify({ video_ids: [item.videoId] }),
        page: "1",
        page_size: "100"
      });
      const coverQuery = (advertiserId) => ({
        advertiser_id: advertiserId,
        filtering: JSON.stringify({ image_ids: [item.coverId] }),
        page: "1",
        page_size: "100"
      });
      videoSourceProbe = sourceAccount.advertiserId ? await client.get({
        label: `source_video_material_${item.sourceAssetId}`,
        endpoint: "file/video/get",
        query: videoQuery(sourceAccount.advertiserId),
        summarize: (payload) => summarizeMaterial(payload, item.videoId)
      }) : null;
      coverSourceProbe = sourceAccount.advertiserId && item.coverId ? await client.get({
        label: `source_video_cover_${item.sourceAssetId}`,
        endpoint: "file/image/get",
        query: coverQuery(sourceAccount.advertiserId),
        summarize: (payload) => summarizeMaterial(payload, item.coverId)
      }) : null;
      videoTargetProbe = await client.get({
        label: `target_video_material_${item.sourceAssetId}`,
        endpoint: "file/video/get",
        query: videoQuery(targetAdvertiserId),
        summarize: (payload) => summarizeMaterial(payload, item.videoId)
      });
      coverTargetProbe = item.coverId ? await client.get({
        label: `target_video_cover_${item.sourceAssetId}`,
        endpoint: "file/image/get",
        query: coverQuery(targetAdvertiserId),
        summarize: (payload) => summarizeMaterial(payload, item.coverId)
      }) : null;
      sourceVideoVisible = sourceAccount.advertiserId &&
        videoSourceProbe?.status === "passed" &&
        videoSourceProbe.summary?.targetVisible === true;
      targetVideoVisible = videoTargetProbe.status === "passed" && videoTargetProbe.summary?.targetVisible === true;
      targetCoverVisible = coverTargetProbe?.status === "passed" && coverTargetProbe.summary?.targetVisible === true;
      probeFailed = [videoSourceProbe, videoTargetProbe].some((probe) => ["transport_failed", "credential_required"].includes(probe?.status));
      coverMode = coverModeFrom({ explicitCoverVisible: targetCoverVisible, videoVisible: targetVideoVisible });
      planStatus = materialPlanStatus({
        sourceVideoVisible,
        targetVideoVisible,
        localFileReady: Boolean(item.localFilePath && item.localFileHash && item.localFileSizeBytes > 0),
        probeFailed
      });
      if (!sourceAccount.advertiserId) blocker = "material_source_account_missing";
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
      evidenceRef
    }));
  }

  const result = summaryFromItems({ items: checkedItems, source: "oceanengine_readonly_probe" });
  return sanitizeForPublic({
    ...result,
    evidenceRefs,
    blockers: result.status === "passed" ? [] : [
      ...new Set(checkedItems
        .filter((item) => item.readbackStatus !== "readback_verified")
        .map((item) => `video_material_not_ready:${item.sourceAssetId}`))
    ]
  });
}
