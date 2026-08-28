import { createHash } from "node:crypto";
import { assertNoSensitiveLeak, sanitizeForPublic } from "../workflows/skills/oe3/00-contracts.mjs";
import {
  credentialReady,
  getOceanEngineCredentialSummary,
  readOceanEngineEnv
} from "./oceanengineCredentialStore.mjs";
import { createOceanEngineReadonlyClient } from "./oceanengineReadonlyClient.mjs";
import { runVideoMaterialReadonlyGate } from "../workflows/skills/oe3/04-video-material-readiness.mjs";
import {
  VIDEO_MATERIAL_ENSURE_CONFIRM_ENV,
  VIDEO_MATERIAL_ENSURE_CONFIRM_VALUE,
  validateVideoMaterialWriteScope
} from "../workflows/videoMaterialExecutionScope.mjs";

export const VIDEO_MATERIAL_CONFIRM_ENV = VIDEO_MATERIAL_ENSURE_CONFIRM_ENV;
export const VIDEO_MATERIAL_CONFIRM_VALUE = VIDEO_MATERIAL_ENSURE_CONFIRM_VALUE;
const API_BASE = "https://api.oceanengine.com";
const MATERIAL_BIND_ENDPOINT = "/open_api/2/file/material/bind/";
const MATERIAL_BIND_FULL_ENDPOINT = `${API_BASE}${MATERIAL_BIND_ENDPOINT}`;
const DEFAULT_VIDEO_READBACK_DELAYS_MS = [0, 30000, 60000];

function clean(value) {
  return String(value ?? "").trim();
}

function hashValue(value) {
  return `sha256:${createHash("sha256").update(String(value)).digest("hex")}`;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function assertSafeIntegerId(name, value) {
  const text = clean(value);
  if (!/^\d+$/.test(text)) throw new Error(`invalid_${name}`);
  const number = Number(text);
  if (!Number.isSafeInteger(number)) throw new Error(`${name}_outside_safe_integer_range`);
  return { text, number };
}

function apiCode(payload = {}) {
  return clean(payload.code ?? payload.err_no ?? payload.error_code ?? "");
}

function requestId(payload = {}) {
  return clean(payload.request_id || payload.data?.request_id || "");
}

function messageText(payload = {}) {
  return clean(payload.message || payload.msg || payload.error_msg || payload.error_message || "");
}

function duplicateOrAlreadyBound(payload = {}) {
  const text = messageText(payload).toLowerCase();
  return /duplicate|already|exist|重复|已存在|已绑定/.test(text);
}

export function materialBindFailList(payload = {}) {
  const list = payload?.data?.fail_list || payload?.fail_list || [];
  return Array.isArray(list)
    ? list.map((item) => ({
      videoId: clean(item.video_id || item.videoId),
      targetAdvertiserId: clean(item.target_advertiser_id || item.targetAdvertiserId),
      failReasonPresent: Boolean(clean(item.fail_reason || item.failReason))
    }))
    : [];
}

function materialBindFailedFor(payload = {}, { videoId = "", targetAdvertiserId = "" } = {}) {
  const wantedVideoId = clean(videoId);
  const wantedTarget = clean(targetAdvertiserId);
  return materialBindFailList(payload).some((item) =>
    item.videoId === wantedVideoId &&
    (!wantedTarget || item.targetAdvertiserId === wantedTarget)
  );
}

function materialBindFailedIdsForTarget(payload = {}, targetAdvertiserId = "") {
  const target = clean(targetAdvertiserId);
  return new Set(materialBindFailList(payload)
    .filter((item) => !target || item.targetAdvertiserId === target)
    .map((item) => item.videoId)
    .filter(Boolean));
}

function safeBindResponseSummary(payload = {}) {
  const message = messageText(payload);
  const keywords = [
    "duplicate",
    "already",
    "exist",
    "permission",
    "material",
    "video",
    "target",
    "invalid",
    "param",
    "频繁",
    "权限",
    "重复",
    "已存在",
    "已绑定"
  ].filter((keyword) => message.toLowerCase().includes(keyword.toLowerCase()));
  return {
    api_code: apiCode(payload),
    request_id_present: Boolean(requestId(payload)),
    message_present: Boolean(message),
    duplicate_or_already_bound: duplicateOrAlreadyBound(payload),
    keyword_count: keywords.length,
    safe_error_fingerprint: hashValue({
      api_code: apiCode(payload),
      duplicate_or_already_bound: duplicateOrAlreadyBound(payload),
      keywords
    })
  };
}

function requiredVideoEntries(bundle = {}) {
  const items = Array.isArray(bundle.materialPack?.items) ? bundle.materialPack.items : [];
  return items
    .filter((entry) => entry.item?.item_type === "video_asset" && entry.item?.required === true)
    .map((entry) => {
      const metadata = entry.asset?.metadata || {};
      return {
        sourceAssetId: clean(entry.item?.asset_id || entry.asset?.asset_id),
        resourceName: clean(entry.asset?.asset_name || entry.item?.asset_ref || entry.item?.asset_id),
        videoId: clean(metadata.video_id || metadata.platform_video_id),
        videoIdPresent: Boolean(clean(metadata.video_id || metadata.platform_video_id)),
        explicitCoverIdPresent: Boolean(clean(metadata.video_cover_id || metadata.cover_id)),
        localFilePathPresent: Boolean(clean(metadata.local_file?.path || metadata.local_path)),
        localFileHashPresent: Boolean(clean(metadata.local_file?.sha256 || metadata.local_file_hash)),
        localFileSizeBytes: Number(metadata.local_file?.size_bytes || metadata.local_file_size_bytes || 0),
        localFileHash: clean(metadata.local_file?.sha256 || metadata.local_file_hash)
      };
    });
}

function materialSourceAccount(bundle = {}) {
  const account = bundle.defaults?.raw_defaults?.material_source_account || {};
  return {
    advertiserId: clean(account.advertiser_id),
    accountRole: clean(account.account_role),
    targetAdvertiserId: clean(account.target_advertiser_id)
  };
}

function resourceFor(bundle = {}, sourceAssetId = "") {
  return (bundle.resources || []).find((item) =>
    item.resource_type === "video_asset" &&
    clean(item.source_asset_id) === clean(sourceAssetId)
  ) || {};
}

function actionListFor(planStatus) {
  if (planStatus === "source_missing_local_ready") {
    return ["oceanengine_video_upload_source", "oceanengine_material_bind_target"];
  }
  if (planStatus === "source_ready_target_missing") {
    return ["oceanengine_material_bind_target"];
  }
  return [];
}

function nextAction(planStatus) {
  if (planStatus === "source_ready_target_ready") return "无需动作";
  if (planStatus === "source_ready_target_missing") return "绑定或推送到目标账户";
  if (planStatus === "source_missing_local_ready") return "上传到物料户后绑定或推送到目标账户";
  if (planStatus === "platform_probe_failed") return "只读 probe 失败，停止";
  return "补齐本地文件或物料户素材";
}

export function videoMaterialBindTransportPayload({ sourceAdvertiserId, targetAdvertiserId, videoId } = {}) {
  const source = assertSafeIntegerId("source_advertiser_id", sourceAdvertiserId);
  const target = assertSafeIntegerId("target_advertiser_id", targetAdvertiserId);
  const safeVideoId = clean(videoId);
  if (!safeVideoId) throw new Error("video_id_required");
  return {
    advertiser_id: source.number,
    target_advertiser_ids: [target.number],
    video_ids: [safeVideoId]
  };
}

export function videoMaterialBatchBindTransportPayload({ sourceAdvertiserId, targetAdvertiserId, videoIds = [] } = {}) {
  const source = assertSafeIntegerId("source_advertiser_id", sourceAdvertiserId);
  const target = assertSafeIntegerId("target_advertiser_id", targetAdvertiserId);
  const safeVideoIds = [...new Set((videoIds || []).map(clean).filter(Boolean))];
  if (safeVideoIds.length === 0) throw new Error("video_ids_required");
  if (safeVideoIds.length > 50) throw new Error("video_ids_exceed_official_batch_limit");
  return {
    advertiser_id: source.number,
    target_advertiser_ids: [target.number],
    video_ids: safeVideoIds
  };
}

export function buildVideoMaterialBindRequestPlan({ sourceAdvertiserId, targetAdvertiserId, videoId, sourceAssetId = "" } = {}) {
  const requestShape = videoMaterialBindTransportPayload({ sourceAdvertiserId, targetAdvertiserId, videoId });
  return sanitizeForPublic({
    endpoint: MATERIAL_BIND_FULL_ENDPOINT,
    method: "POST",
    requestHash: hashValue(canonicalJson(requestShape)),
    requestFieldManifest: {
      fieldNames: Object.keys(requestShape),
      sourceAssetId,
      advertiserIdRole: "source_advertiser_id",
      targetAdvertiserIdsRole: "target_advertiser_ids",
      advertiserIdTransportType: "number",
      targetAdvertiserIdsTransportType: "number_array",
      videoIdsTransportType: "string_array",
      rawPayloadStored: false
    },
    outputSummary: {
      sourceAdvertiserId: clean(sourceAdvertiserId),
      targetAdvertiserId: clean(targetAdvertiserId),
      sourceAssetId,
      videoIdPresent: true,
      requestHash: hashValue(canonicalJson(requestShape)),
      rawPayloadStored: false,
      rawResponseStored: false
    }
  });
}

export function buildVideoMaterialBatchBindRequestPlan({ sourceAdvertiserId, targetAdvertiserId, items = [], batchIndex = 1 } = {}) {
  const safeItems = (items || [])
    .map((item) => ({
      sourceAssetId: clean(item.sourceAssetId),
      videoId: clean(item.videoId)
    }))
    .filter((item) => item.sourceAssetId && item.videoId)
    .sort((a, b) => a.sourceAssetId.localeCompare(b.sourceAssetId));
  const requestShape = videoMaterialBatchBindTransportPayload({
    sourceAdvertiserId,
    targetAdvertiserId,
    videoIds: safeItems.map((item) => item.videoId)
  });
  const requestHash = hashValue(canonicalJson(requestShape));
  return sanitizeForPublic({
    endpoint: MATERIAL_BIND_FULL_ENDPOINT,
    method: "POST",
    requestHash,
    requestFieldManifest: {
      fieldNames: Object.keys(requestShape),
      sourceAssetIds: safeItems.map((item) => item.sourceAssetId),
      sourceAssetCount: safeItems.length,
      batchIndex,
      advertiserIdRole: "source_advertiser_id",
      targetAdvertiserIdsRole: "target_advertiser_ids",
      advertiserIdTransportType: "number",
      targetAdvertiserIdsTransportType: "number_array",
      videoIdsTransportType: "string_array",
      maxVideoIdsPerRequest: 50,
      rawPayloadStored: false
    },
    outputSummary: {
      sourceAdvertiserId: clean(sourceAdvertiserId),
      targetAdvertiserId: clean(targetAdvertiserId),
      sourceAssetCount: safeItems.length,
      sourceAssetIds: safeItems.map((item) => item.sourceAssetId),
      videoIdCount: safeItems.length,
      requestHash,
      rawPayloadStored: false,
      rawResponseStored: false
    }
  });
}

function chunk(items = [], size = 50) {
  const result = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function buildBatchBindRequests({ bindItems = [] } = {}) {
  const groups = new Map();
  for (const item of bindItems) {
    const key = `${clean(item.sourceAccountId)}::${clean(item.targetAdvertiserId)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  const requests = [];
  for (const [, groupItems] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const ordered = [...groupItems].sort((a, b) => clean(a.sourceAssetId).localeCompare(clean(b.sourceAssetId)));
    for (const batchItems of chunk(ordered, 50)) {
      const first = batchItems[0] || {};
      requests.push(buildVideoMaterialBatchBindRequestPlan({
        sourceAdvertiserId: first.sourceAccountId,
        targetAdvertiserId: first.targetAdvertiserId,
        items: batchItems.map((item) => ({
          sourceAssetId: item.sourceAssetId,
          videoId: item.videoId
        })),
        batchIndex: requests.length + 1
      }));
    }
  }
  return requests;
}

export function buildVideoMaterialPreparePlan({ bundle } = {}) {
  if (!bundle?.job) throw new Error("launch_job_bundle_required");
  const sourceAccount = materialSourceAccount(bundle);
  const targetAdvertiserId = clean(bundle.job.advertiser_id);
  const items = requiredVideoEntries(bundle).map((item) => {
    const resource = resourceFor(bundle, item.sourceAssetId);
    const readonly = resource.metadata?.readonly_check || {};
    const planStatus = clean(readonly.plan_status || resource.metadata?.final_material_readiness?.plan_status || "not_checked");
    const coverMode = clean(readonly.cover_mode || resource.metadata?.final_material_readiness?.cover_mode || "not_checked");
    const actions = actionListFor(planStatus);
    const bindRequestPlan = actions.includes("oceanengine_material_bind_target") && item.videoId && sourceAccount.advertiserId && targetAdvertiserId
      ? buildVideoMaterialBindRequestPlan({
        sourceAdvertiserId: sourceAccount.advertiserId,
        targetAdvertiserId,
        videoId: item.videoId,
        sourceAssetId: item.sourceAssetId
      })
      : null;
    return {
      sourceAssetId: item.sourceAssetId,
      resourceName: item.resourceName,
      sourceAccountId: sourceAccount.advertiserId,
      targetAdvertiserId,
      localFilePresent: item.localFilePathPresent,
      localFileHashPresent: item.localFileHashPresent,
      localFileSizeBytes: item.localFileSizeBytes,
      localFileHash: item.localFileHash ? hashValue(item.localFileHash) : "",
      videoIdPresent: item.videoIdPresent,
      explicitCoverIdPresent: item.explicitCoverIdPresent,
      coverMode,
      planStatus,
      readonlyStatus: clean(readonly.status || "not_checked"),
      sourceVideoVisible: readonly.source_video_visible === true,
      targetVideoVisible: readonly.target_video_visible === true,
      actionRequired: actions.length > 0,
      actions,
      requestHash: bindRequestPlan?.requestHash || "",
      requestFieldManifest: bindRequestPlan?.requestFieldManifest || {},
      maxAttemptsPerAction: 1,
      nextAction: nextAction(planStatus)
    };
  });
  const bindItems = items.filter((item) =>
    item.planStatus === "source_ready_target_missing" &&
    item.actions.includes("oceanengine_material_bind_target")
  ).map((item) => ({
    ...item,
    videoId: requiredVideoEntries(bundle).find((entry) => entry.sourceAssetId === item.sourceAssetId)?.videoId || ""
  }));
  const batchBindRequests = buildBatchBindRequests({ bindItems });
  const uploadCount = items.filter((item) => item.actions.includes("oceanengine_video_upload_source")).length;
  const bindCount = items.filter((item) => item.actions.includes("oceanengine_material_bind_target")).length;
  const readyCount = items.filter((item) => item.planStatus === "source_ready_target_ready").length;
  const result = {
    status: readyCount === items.length && items.length > 0 ? "ready" : "action_plan_required",
    mode: "dry_run_plan_only",
    routeId: bundle.job.route_id,
    gameCode: bundle.job.game_code,
    jobId: bundle.job.job_id,
    sourceAccount: {
      accountRole: sourceAccount.accountRole,
      advertiserId: sourceAccount.advertiserId
    },
    targetAdvertiserId,
    selectedRequiredVideoCount: items.length,
    readyCount,
    uploadActionCount: uploadCount,
    bindActionCount: bindCount,
    bindBatchCount: batchBindRequests.length,
    bindBatchRequestHash: batchBindRequests.length ? hashValue(canonicalJson(batchBindRequests.map((item) => item.requestHash))) : "",
    bindBatchRequests: batchBindRequests,
    writeGrantRequired: uploadCount + bindCount > 0,
    createScopeReusable: false,
    rawPayloadStored: false,
    rawResponseStored: false,
    officialContract: {
      sourceRef: "/Users/hys/knowledge/01-个人本地知识库/01-官方文档/open.oceanengine.com-2.0/14-素材管理.md:242",
      detailSourceRef: "/Users/hys/knowledge/01-个人本地知识库/01-官方文档/open.oceanengine.com-2.0-copy/12-素材管理.md:4091",
      priority: "3.0 first; 2.0 fallback because 3.0 detailed bind contract is not located locally",
      endpoint: MATERIAL_BIND_FULL_ENDPOINT,
      method: "POST",
      requestFieldManifest: {
        fieldNames: ["advertiser_id", "target_advertiser_ids", "video_ids"],
        responseFailListField: "data.fail_list",
        rawPayloadStored: false,
        rawResponseStored: false
      }
    },
    items
  };
  assertNoSensitiveLeak(result);
  return result;
}

export async function preflightVideoMaterialBindSet({
  repo,
  jobId,
  expectedTargetAdvertiserId = "",
  credentialSummary = null
} = {}) {
  if (!repo || !jobId) throw new Error("video_material_bind_set_preflight_required");
  const bundle = await repo.getLaunchJobBundle(jobId);
  if (!bundle?.job) throw new Error("job_not_found");
  const targetAdvertiserId = clean(bundle.job.advertiser_id);
  const credential = credentialSummary || getOceanEngineCredentialSummary();
  const materialPlan = buildVideoMaterialPreparePlan({ bundle });
  const entriesByAssetId = new Map(requiredVideoEntries(bundle).map((item) => [item.sourceAssetId, item]));
  const bindItems = (materialPlan.items || []).filter((item) =>
    item.planStatus === "source_ready_target_missing" &&
    item.actions.includes("oceanengine_material_bind_target")
  ).map((item) => ({
    ...item,
    videoId: entriesByAssetId.get(item.sourceAssetId)?.videoId || ""
  }));
  const alreadyReady = (materialPlan.items || []).filter((item) => item.planStatus === "source_ready_target_ready");
  const previousSuccess = typeof repo.countPlatformActions === "function"
    ? await repo.countPlatformActions({
      jobId,
      actionType: "oceanengine_material_bind_target",
      statuses: ["succeeded", "succeeded_or_already_bound", "succeeded_readback_verified"]
    })
    : 0;
  const blockers = [
    ...(expectedTargetAdvertiserId && expectedTargetAdvertiserId !== targetAdvertiserId ? ["target_advertiser_mismatch"] : []),
    ...(materialPlan.uploadActionCount === 0 ? [] : ["video_upload_required_not_allowed_in_bind_scope"]),
    ...(materialPlan.selectedRequiredVideoCount > 0 ? [] : ["required_video_material_empty"]),
    ...(bindItems.length > 0 || alreadyReady.length === materialPlan.selectedRequiredVideoCount ? [] : ["video_bind_plan_empty"]),
    ...((materialPlan.items || []).flatMap((item) => {
      if (["source_ready_target_missing", "source_ready_target_ready"].includes(item.planStatus)) return [];
      return [`video_not_bindable:${item.sourceAssetId}:${item.planStatus || "unknown"}`];
    })),
    ...(previousSuccess === 0 ? [] : ["successful_video_bind_action_already_recorded"]),
    ...(credentialReady(credential) ? [] : credential.blockers.map((blocker) => `credential:${blocker}`))
  ];
  const result = sanitizeForPublic({
    status: blockers.length ? "blocked" : "passed",
    blockers,
    jobId,
    targetAdvertiserId,
    selectedRequiredVideoCount: materialPlan.selectedRequiredVideoCount,
    bindActionCount: bindItems.length,
    bindBatchCount: materialPlan.bindBatchCount,
    bindBatchRequestHash: materialPlan.bindBatchRequestHash,
    readyCount: alreadyReady.length,
    credential: {
      status: credential.status,
      envFilePresent: Boolean(credential.envFilePresent),
      accessTokenPresent: Boolean(credential.accessTokenPresent),
      refreshTokenPresent: Boolean(credential.refreshTokenPresent),
      tokenExpired: Boolean(credential.tokenExpired)
    },
    items: (materialPlan.items || []).map((item) => ({
      sourceAssetId: item.sourceAssetId,
      planStatus: item.planStatus,
      sourceVideoVisible: item.sourceVideoVisible,
      targetVideoVisible: item.targetVideoVisible,
      requestHashPresent: Boolean(item.requestHash)
    })),
    rawPayloadStored: false,
    rawResponseStored: false
  });
  assertNoSensitiveLeak(result);
  return { result, bundle, materialPlan, bindItems };
}

function batchActionId(jobId, batchIndex) {
  return `ACTION-${jobId}-VIDEO-BIND-BATCH-${String(batchIndex).padStart(2, "0")}`;
}

function batchEvidenceId(jobId, batchIndex, stage = "RESPONSE") {
  return `EV-${jobId}-VIDEO-BIND-BATCH-${String(batchIndex).padStart(2, "0")}-${stage}`;
}

async function saveVideoBatchEvidence({ repo, jobId, batchIndex, stage, status, responseHash = "", actionId = "", itemCount = 0, failListCount = 0, readback = {} } = {}) {
  const artifactId = batchEvidenceId(jobId, batchIndex, stage.toUpperCase());
  await repo.upsertEvidence({
    artifactId,
    jobId,
    artifactType: `video_material_bind_batch_${stage}`,
    title: `video material bind batch ${stage}`,
    summary: [
      `batch_index=${batchIndex}`,
      `status=${status}`,
      `action_id=${actionId || "none"}`,
      `item_count=${itemCount}`,
      `fail_list_count=${failListCount}`,
      `readback_status=${readback.status || "not_run"}`,
      `response_hash_present=${Boolean(responseHash)}`,
      "request_body_stored=false",
      "response_body_stored=false"
    ].join("; "),
    contentHash: responseHash || hashValue(canonicalJson({ jobId, batchIndex, stage, status, itemCount, failListCount, readback })),
    storageRef: "postgres:evidence_artifacts:redacted_summary_only",
    sourceRef: "oceanengine:/open_api/2/file/material/bind/",
    sourceUsage: "runtime_truth"
  });
  return artifactId;
}

async function pollVideoMaterialReadback({
  repo,
  jobId,
  client,
  delaysMs = DEFAULT_VIDEO_READBACK_DELAYS_MS
} = {}) {
  const attempts = [];
  const started = Date.now();
  let last = null;
  for (const targetDelay of delaysMs) {
    const waitMs = Math.max(0, Number(targetDelay || 0) - (Date.now() - started));
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
    const bundle = await repo.getLaunchJobBundle(jobId);
    last = await runVideoMaterialReadonlyGate({
      repo,
      bundle,
      client,
      allowReadonlyDependency: true
    });
    attempts.push({
      delayMs: Number(targetDelay || 0),
      status: last.status,
      verifiedVideoCount: last.outputSummary?.verifiedVideoCount || 0,
      selectedRequiredVideoCount: last.outputSummary?.selectedRequiredVideoCount || 0,
      coverReadyCount: last.outputSummary?.coverReadyCount || 0
    });
    if (last.status === "passed") break;
  }
  return sanitizeForPublic({
    status: last?.status === "passed" ? "passed" : "readback_pending",
    attempts,
    final: last,
    rawPayloadStored: false,
    rawResponseStored: false
  });
}

export async function ensureVideoMaterialBindSetOnce({
  repo,
  jobId,
  allowNetworkWrite = true,
  confirmVariableValue = process.env[VIDEO_MATERIAL_CONFIRM_ENV] || "",
  fetchImpl = globalThis.fetch,
  readonlyClient = null,
  projectStatePath,
  credentialSummary = null,
  oceanEngineEnv = null,
  readbackDelaysMs = DEFAULT_VIDEO_READBACK_DELAYS_MS
} = {}) {
  if (!repo || !jobId) throw new Error("video_material_executor_repo_and_job_required");
  const client = readonlyClient || createOceanEngineReadonlyClient({ fetchImpl });
  const initialBundle = await repo.getLaunchJobBundle(jobId);
  if (!initialBundle?.job) throw new Error("job_not_found");
  const readonly = await runVideoMaterialReadonlyGate({
    repo,
    bundle: initialBundle,
    client,
    allowReadonlyDependency: true
  });
  const freshPreflight = await preflightVideoMaterialBindSet({
    repo,
    jobId,
    expectedTargetAdvertiserId: initialBundle.job.advertiser_id,
    credentialSummary
  });
  const scope = await validateVideoMaterialWriteScope({ repo, bundle: freshPreflight.bundle, projectStatePath });
  const credential = credentialSummary || getOceanEngineCredentialSummary();
  const bindBatches = freshPreflight.materialPlan.bindBatchRequests || [];
  const blockers = [
    ...(allowNetworkWrite ? [] : ["network_write_not_enabled_by_caller"]),
    ...(confirmVariableValue === VIDEO_MATERIAL_CONFIRM_VALUE ? [] : ["confirm_variable_missing_or_invalid"]),
    ...(readonly.status === "passed" ? ["video_material_already_ready_no_write_required"] : []),
    ...(freshPreflight.result.status === "passed" ? [] : freshPreflight.result.blockers),
    ...(scope.status === "passed" ? [] : scope.blockers),
    ...(bindBatches.length > 0 ? [] : ["video_bind_batch_plan_empty"]),
    ...(credentialReady(credential) ? [] : credential.blockers.map((blocker) => `credential:${blocker}`))
  ];
  if (blockers.length) {
    const blocked = sanitizeForPublic({
      status: blockers.includes("video_material_already_ready_no_write_required") ? "video_material_ready_noop" : "blocked_before_video_material_write",
      jobId,
      blockers: blockers.filter((item) => item !== "video_material_already_ready_no_write_required"),
      readonlyPreflightStatus: readonly.status,
      bindBatchCount: bindBatches.length,
      platformWriteCalled: false,
      rawPayloadStored: false,
      rawResponseStored: false
    });
    assertNoSensitiveLeak(blocked);
    return blocked;
  }

  const env = oceanEngineEnv || readOceanEngineEnv().env;
  const executed = [];
  for (const batch of bindBatches) {
    const batchIndex = Number(batch.requestFieldManifest?.batchIndex || executed.length + 1);
    const actionId = batchActionId(jobId, batchIndex);
    const requestPayload = videoMaterialBatchBindTransportPayload({
      sourceAdvertiserId: batch.outputSummary.sourceAdvertiserId,
      targetAdvertiserId: batch.outputSummary.targetAdvertiserId,
      videoIds: freshPreflight.bindItems
        .filter((item) => (batch.requestFieldManifest?.sourceAssetIds || []).includes(item.sourceAssetId))
        .sort((a, b) => a.sourceAssetId.localeCompare(b.sourceAssetId))
        .map((item) => item.videoId)
    });
    const requestHash = hashValue(canonicalJson(requestPayload));
    if (requestHash !== batch.requestHash) {
      const evidenceRef = await saveVideoBatchEvidence({ repo, jobId, batchIndex, stage: "preflight", status: "request_hash_mismatch", itemCount: batch.outputSummary.sourceAssetCount });
      return sanitizeForPublic({
        status: "blocked_before_video_material_write",
        jobId,
        blockers: ["video_batch_request_hash_mismatch"],
        evidenceRef,
        platformWriteCalled: false
      });
    }
    const requestFieldManifest = {
      ...batch.requestFieldManifest,
      source_advertiser_id: batch.outputSummary.sourceAdvertiserId,
      target_advertiser_id: batch.outputSummary.targetAdvertiserId,
      video_id_count: requestPayload.video_ids.length,
      raw_payload_stored: false
    };
    const metadata = {
      batch_index: batchIndex,
      source_asset_ids: batch.requestFieldManifest.sourceAssetIds || [],
      source_advertiser_id: batch.outputSummary.sourceAdvertiserId,
      target_advertiser_id: batch.outputSummary.targetAdvertiserId,
      high_level_action: "ensure_resource:video_asset",
      retry_allowed: false,
      raw_payload_stored: false,
      raw_response_stored: false
    };
    await repo.upsertPlatformAction({
      actionId,
      jobId,
      actionType: "oceanengine_material_bind_target",
      endpoint: MATERIAL_BIND_ENDPOINT,
      method: "POST",
      actionStatus: "started",
      attemptNo: batchIndex,
      requestHash,
      idempotencyKey: `IDEMP-${jobId}-VIDEO-MATERIAL-BIND-BATCH-${String(batchIndex).padStart(2, "0")}`,
      requestFieldManifest,
      metadata
    });

    let response = null;
    let text = "";
    let payload = {};
    try {
      response = await fetchImpl(`${API_BASE}${MATERIAL_BIND_ENDPOINT}`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "Access-Token": env.OCEANENGINE_ACCESS_TOKEN
        },
        body: JSON.stringify(requestPayload)
      });
      text = await response.text();
      try {
        payload = JSON.parse(text);
      } catch {
        payload = {};
      }
    } catch (error) {
      const evidenceRef = await saveVideoBatchEvidence({
        repo,
        jobId,
        batchIndex,
        stage: "transport",
        status: "transport_failed",
        actionId,
        itemCount: requestPayload.video_ids.length
      });
      await repo.upsertPlatformAction({
        actionId,
        jobId,
        actionType: "oceanengine_material_bind_target",
        endpoint: MATERIAL_BIND_ENDPOINT,
        method: "POST",
        actionStatus: "failed_or_unconfirmed",
        attemptNo: batchIndex,
        requestHash,
        errorSummary: "video_material_bind_transport_failed",
        errorCategory: "unclassified",
        idempotencyKey: `IDEMP-${jobId}-VIDEO-MATERIAL-BIND-BATCH-${String(batchIndex).padStart(2, "0")}`,
        requestFieldManifest,
        responseSummary: { transport_error: true, response_body_stored: false },
        metadata,
        finishedAt: new Date().toISOString()
      });
      return sanitizeForPublic({
        status: "video_material_bind_failed_once",
        jobId,
        failedBatchIndex: batchIndex,
        evidenceRef,
        platformWriteCalled: true,
        rawPayloadStored: false,
        rawResponseStored: false
      });
    }

    const code = apiCode(payload);
    const responseHash = hashValue(text);
    const failedIds = materialBindFailedIdsForTarget(payload, batch.outputSummary.targetAdvertiserId);
    const failList = materialBindFailList(payload);
    const alreadyBound = duplicateOrAlreadyBound(payload);
    const passed = response.ok && failedIds.size === 0 && (code === "0" || code === "" || alreadyBound);
    const responseSummary = safeBindResponseSummary(payload);
    responseSummary.fail_list_count = failList.length;
    responseSummary.current_batch_failed_count = failedIds.size;
    responseSummary.current_batch_source_asset_count = requestPayload.video_ids.length;
    const evidenceRef = await saveVideoBatchEvidence({
      repo,
      jobId,
      batchIndex,
      stage: "response",
      status: passed ? "accepted_pending_readback" : "failed",
      actionId,
      responseHash,
      itemCount: requestPayload.video_ids.length,
      failListCount: failList.length
    });
    await repo.upsertPlatformAction({
      actionId,
      jobId,
      actionType: "oceanengine_material_bind_target",
      endpoint: MATERIAL_BIND_ENDPOINT,
      method: "POST",
      actionStatus: passed ? (alreadyBound ? "succeeded_or_already_bound" : "succeeded") : "failed_or_unconfirmed",
      attemptNo: batchIndex,
      requestHash,
      responseHash,
      httpStatus: response.status,
      apiCode: code || "unknown",
      requestIdPresent: Boolean(requestId(payload)),
      objectIdPresent: false,
      errorSummary: passed ? "" : "material_bind_batch_response_not_confirmed",
      idempotencyKey: `IDEMP-${jobId}-VIDEO-MATERIAL-BIND-BATCH-${String(batchIndex).padStart(2, "0")}`,
      requestFieldManifest,
      responseSummary,
      metadata: {
        ...metadata,
        evidence_ref: evidenceRef
      },
      finishedAt: new Date().toISOString()
    });
    executed.push({ actionId, batchIndex, responseHash, evidenceRef, passed });
    if (!passed) {
      return sanitizeForPublic({
        status: "video_material_bind_failed_once",
        jobId,
        failedBatchIndex: batchIndex,
        failListCount: failList.length,
        failedBatchVideoCount: failedIds.size,
        evidenceRef,
        platformWriteCalled: true,
        rawPayloadStored: false,
        rawResponseStored: false
      });
    }
  }

  const readback = await pollVideoMaterialReadback({
    repo,
    jobId,
    client,
    delaysMs: readbackDelaysMs
  });
  for (const item of executed) {
    await repo.mergePlatformActionMetadata(item.actionId, {
      readback_status: readback.status,
      readback_attempts: readback.attempts,
      readback_finished_at: new Date().toISOString()
    });
    await saveVideoBatchEvidence({
      repo,
      jobId,
      batchIndex: item.batchIndex,
      stage: "readback",
      status: readback.status,
      actionId: item.actionId,
      responseHash: item.responseHash,
      itemCount: freshPreflight.bindItems.length,
      readback
    });
  }
  const result = sanitizeForPublic({
    status: readback.status === "passed" ? "video_material_ready" : "video_material_readback_pending",
    jobId,
    bindBatchCount: executed.length,
    platformWriteCalled: executed.length > 0,
    readbackStatus: readback.status,
    readbackAttempts: readback.attempts,
    verifiedVideoCount: readback.final?.outputSummary?.verifiedVideoCount || 0,
    selectedRequiredVideoCount: readback.final?.outputSummary?.selectedRequiredVideoCount || 0,
    rawPayloadStored: false,
    rawResponseStored: false
  });
  assertNoSensitiveLeak(result);
  return result;
}

function targetItem(plan = {}, sourceAssetId = "") {
  return (plan.items || []).find((item) => item.sourceAssetId === sourceAssetId) || null;
}

function internalVideoItem(bundle = {}, sourceAssetId = "") {
  return requiredVideoEntries(bundle).find((item) => item.sourceAssetId === sourceAssetId) || null;
}

async function previousBindActionCount(repo, { jobId, sourceAssetId, statuses = ["succeeded", "succeeded_or_already_bound"] } = {}) {
  if (typeof repo.countPlatformActions !== "function") return 0;
  return repo.countPlatformActions({
    jobId,
    actionType: "oceanengine_material_bind_target",
    sourceAssetId,
    statuses
  });
}

export async function preflightVideoMaterialBindOnce({
  repo,
  jobId,
  sourceAssetId,
  expectedSourceAdvertiserId = "",
  expectedTargetAdvertiserId = "",
  plan = null,
  credentialSummary = null
} = {}) {
  if (!repo) throw new Error("repo_required");
  const bundle = await repo.getLaunchJobBundle(jobId);
  if (!bundle) throw new Error("job_not_found");
  const effectivePlan = plan || buildVideoMaterialPreparePlan({ bundle });
  const item = targetItem(effectivePlan, sourceAssetId);
  const internal = internalVideoItem(bundle, sourceAssetId);
  const resource = resourceFor(bundle, sourceAssetId);
  const credential = credentialSummary || getOceanEngineCredentialSummary();
  const previousSuccess = await previousBindActionCount(repo, { jobId, sourceAssetId });
  const requestPlan = item && internal?.videoId && item.sourceAccountId && item.targetAdvertiserId
    ? buildVideoMaterialBindRequestPlan({
      sourceAdvertiserId: item.sourceAccountId,
      targetAdvertiserId: item.targetAdvertiserId,
      videoId: internal.videoId,
      sourceAssetId
    })
    : null;
  const blockers = [
    ...(!item ? ["source_asset_not_in_required_video_plan"] : []),
    ...(item && !item.actions.includes("oceanengine_material_bind_target") ? ["bind_action_not_required_by_plan"] : []),
    ...(item && item.planStatus !== "source_ready_target_missing" ? [`plan_status_not_bindable:${item.planStatus}`] : []),
    ...(expectedSourceAdvertiserId && item && item.sourceAccountId !== expectedSourceAdvertiserId ? ["source_advertiser_mismatch"] : []),
    ...(expectedTargetAdvertiserId && item && item.targetAdvertiserId !== expectedTargetAdvertiserId ? ["target_advertiser_mismatch"] : []),
    ...(item && item.sourceVideoVisible !== true ? ["source_video_not_visible"] : []),
    ...(item && item.targetVideoVisible === true ? ["target_video_already_visible"] : []),
    ...(!internal?.videoId ? ["video_id_missing_for_controlled_bind"] : []),
    ...(internal && !internal.localFileHashPresent ? ["local_file_hash_missing"] : []),
    ...(resource.visibility_status === "visible" && resource.readback_status === "readback_verified" ? ["target_resource_already_verified"] : []),
    ...(previousSuccess > 0 ? ["successful_bind_action_already_recorded"] : []),
    ...(item?.requestHash && requestPlan?.requestHash && item.requestHash !== requestPlan.requestHash ? ["video_bind_request_hash_mismatch"] : []),
    ...(!credentialReady(credential) ? credential.blockers.map((blocker) => `credential:${blocker}`) : [])
  ];
  const result = {
    status: blockers.length ? "blocked" : "passed",
    blockers,
    jobId,
    sourceAssetId,
    sourceAdvertiserId: item?.sourceAccountId || expectedSourceAdvertiserId || "",
    targetAdvertiserId: item?.targetAdvertiserId || expectedTargetAdvertiserId || "",
    requestHash: requestPlan?.requestHash || "",
    planStatus: item?.planStatus || "",
    action: "oceanengine_material_bind_target",
    sourceVideoVisible: item?.sourceVideoVisible === true,
    targetVideoVisible: item?.targetVideoVisible === true,
    videoIdPresent: Boolean(internal?.videoId),
    localFileHashPresent: Boolean(internal?.localFileHashPresent),
    previousSuccessfulBindActionCount: previousSuccess,
    credential: {
      status: credential.status,
      envFilePresent: Boolean(credential.envFilePresent),
      accessTokenPresent: Boolean(credential.accessTokenPresent),
      refreshTokenPresent: Boolean(credential.refreshTokenPresent),
      tokenExpired: Boolean(credential.tokenExpired)
    },
    rawPayloadStored: false,
    rawResponseStored: false
  };
  assertNoSensitiveLeak(result);
  return { result, bundle, internal, item, requestPlan };
}

export async function executeVideoMaterialPreparePlanOnce({
  allowNetworkWrite = false,
  confirmVariableValue = process.env[VIDEO_MATERIAL_CONFIRM_ENV] || "",
  plan
} = {}) {
  const blockers = [
    ...(allowNetworkWrite ? [] : ["network_write_not_enabled_by_caller"]),
    ...(confirmVariableValue === VIDEO_MATERIAL_CONFIRM_VALUE ? [] : ["confirm_variable_missing_or_invalid"]),
    ...(!plan ? ["action_plan_required"] : []),
    ...(plan?.writeGrantRequired ? [] : ["no_platform_write_actions_required"])
  ];
  if (blockers.length) {
    return {
      status: "blocked_before_video_material_write",
      writeCalled: false,
      blockers
    };
  }
  return {
    status: "blocked_before_video_material_write",
    writeCalled: false,
    blockers: ["video_material_write_transport_not_enabled_in_this_task"],
    allowedActionTypes: ["oceanengine_video_upload_source", "oceanengine_material_bind_target"]
  };
}

export async function bindVideoMaterialToTargetOnce({
  repo,
  jobId,
  sourceAssetId,
  allowNetworkWrite = false,
  confirmVariableValue = process.env[VIDEO_MATERIAL_CONFIRM_ENV] || "",
  expectedSourceAdvertiserId = "",
  expectedTargetAdvertiserId = "",
  fetchImpl = globalThis.fetch,
  projectStatePath,
  credentialSummary = null,
  oceanEngineEnv = null
} = {}) {
  const preflight = await preflightVideoMaterialBindOnce({
    repo,
    jobId,
    sourceAssetId,
    expectedSourceAdvertiserId,
    expectedTargetAdvertiserId,
    credentialSummary
  });
  const scope = await validateVideoMaterialWriteScope({ repo, bundle: preflight.bundle, projectStatePath });
  const blockers = [
    ...(allowNetworkWrite ? [] : ["network_write_not_enabled_by_caller"]),
    ...(confirmVariableValue === VIDEO_MATERIAL_CONFIRM_VALUE ? [] : ["confirm_variable_missing_or_invalid"]),
    ...(scope.status === "passed" ? [] : scope.blockers),
    ...(preflight.result.status === "passed" ? [] : preflight.result.blockers)
  ];
  if (blockers.length) {
    const blocked = {
      status: "blocked_before_video_material_write",
      writeCalled: false,
      blockers,
      preflight: preflight.result
    };
    assertNoSensitiveLeak(blocked);
    return blocked;
  }

  const sourceAdvertiserId = preflight.item.sourceAccountId;
  const targetAdvertiserId = preflight.item.targetAdvertiserId;
  const requestPayload = videoMaterialBindTransportPayload({
    sourceAdvertiserId,
    targetAdvertiserId,
    videoId: preflight.internal.videoId
  });
  const actionId = `ACTION-${jobId}-VIDEO-BIND-${sourceAssetId.replace(/[^A-Za-z0-9]+/g, "_")}`;
  const requestHash = hashValue(canonicalJson(requestPayload));
  const requestFieldManifest = {
    source_asset_id: sourceAssetId,
    field_names: ["advertiser_id", "target_advertiser_ids", "video_ids"],
    source_advertiser_id: sourceAdvertiserId,
    target_advertiser_id: targetAdvertiserId,
    video_id_present: true,
    raw_payload_stored: false
  };
  const metadata = {
    source_asset_id: sourceAssetId,
    source_advertiser_id: sourceAdvertiserId,
    target_advertiser_id: targetAdvertiserId,
    retry_allowed: false,
    raw_payload_stored: false,
    raw_response_stored: false
  };
  await repo.upsertPlatformAction({
    actionId,
    jobId,
    actionType: "oceanengine_material_bind_target",
    endpoint: MATERIAL_BIND_ENDPOINT,
    method: "POST",
    actionStatus: "started",
    attemptNo: 1,
    requestHash,
    idempotencyKey: `IDEMP-${jobId}-VIDEO-MATERIAL-BIND-${sourceAssetId.replace(/[^A-Za-z0-9]+/g, "_")}`,
    requestFieldManifest,
    metadata
  });

  const env = oceanEngineEnv || readOceanEngineEnv().env;
  const response = await fetchImpl(`${API_BASE}${MATERIAL_BIND_ENDPOINT}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "Access-Token": env.OCEANENGINE_ACCESS_TOKEN
    },
    body: JSON.stringify(requestPayload)
  });
  const text = await response.text();
  let payload = {};
  try {
    payload = JSON.parse(text);
  } catch {
    payload = {};
  }
  const code = apiCode(payload);
  const responseHash = hashValue(text);
  const alreadyBound = duplicateOrAlreadyBound(payload);
  const failedByFailList = materialBindFailedFor(payload, {
    videoId: preflight.internal.videoId,
    targetAdvertiserId
  });
  const passed = response.ok && !failedByFailList && (code === "0" || code === "" || alreadyBound);
  const responseSummary = safeBindResponseSummary(payload);
  responseSummary.fail_list_count = materialBindFailList(payload).length;
  responseSummary.current_video_failed = failedByFailList;
  const evidenceRef = `EV-${jobId}-VIDEO-BIND-${sourceAssetId.replace(/[^A-Za-z0-9]+/g, "_")}`;
  await repo.upsertPlatformAction({
    actionId,
    jobId,
    actionType: "oceanengine_material_bind_target",
    endpoint: MATERIAL_BIND_ENDPOINT,
    method: "POST",
    actionStatus: passed ? (alreadyBound ? "succeeded_or_already_bound" : "succeeded") : "failed_or_unconfirmed",
    attemptNo: 1,
    requestHash,
    responseHash,
    httpStatus: response.status,
    apiCode: code || "unknown",
    requestIdPresent: Boolean(requestId(payload)),
    objectIdPresent: false,
    errorSummary: passed ? "" : "material_bind_response_not_confirmed",
    idempotencyKey: `IDEMP-${jobId}-VIDEO-MATERIAL-BIND-${sourceAssetId.replace(/[^A-Za-z0-9]+/g, "_")}`,
    requestFieldManifest,
    responseSummary,
    metadata,
    finishedAt: new Date().toISOString()
  });
  await repo.upsertEvidence({
    artifactId: evidenceRef,
    jobId,
    artifactType: passed ? "video_material_bind_once" : "video_material_bind_once_failed",
    title: "video material bind once",
    summary: `endpoint=file/material/bind http=${response.status} api_code=${code || "unknown"} request_id_present=${Boolean(requestId(payload))} response_hash_present=true source_asset_id=${sourceAssetId}`,
    contentHash: responseHash,
    storageRef: "postgres:evidence_artifacts:redacted_summary_only",
    sourceRef: "oceanengine:/open_api/2/file/material/bind/",
    sourceUsage: "runtime_truth"
  });
  const result = {
    status: passed ? "bind_called_readback_required" : "bind_failed_stop_for_manual_review",
    writeCalled: true,
    actionId,
    evidenceRef,
    httpStatus: response.status,
    apiCode: code || "unknown",
    requestIdPresent: Boolean(requestId(payload)),
    duplicateOrAlreadyBound: alreadyBound,
    failedByFailList,
    responseHashPresent: true,
    rawPayloadStored: false,
    rawResponseStored: false
  };
  assertNoSensitiveLeak(result);
  return result;
}
