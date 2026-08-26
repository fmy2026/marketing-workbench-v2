import { createHash } from "node:crypto";
import { assertNoSensitiveLeak } from "../workflows/skills/oe3/00-contracts.mjs";
import {
  credentialReady,
  getOceanEngineCredentialSummary,
  readOceanEngineEnv
} from "./oceanengineCredentialStore.mjs";

export const VIDEO_MATERIAL_CONFIRM_ENV = "MWBV2_OE_VIDEO_MATERIAL_CONFIRM";
export const VIDEO_MATERIAL_CONFIRM_VALUE = "BIND_ONE_VIDEO_TO_TARGET";
const API_BASE = "https://api.oceanengine.com";
const MATERIAL_BIND_ENDPOINT = "/open_api/2/file/material/bind/";

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
      maxAttemptsPerAction: 1,
      nextAction: nextAction(planStatus)
    };
  });
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
    writeGrantRequired: uploadCount + bindCount > 0,
    createScopeReusable: false,
    rawPayloadStored: false,
    rawResponseStored: false,
    items
  };
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
  expectedSourceAdvertiserId = "1760246749825031",
  expectedTargetAdvertiserId = "1871922175825993",
  plan = null
} = {}) {
  if (!repo) throw new Error("repo_required");
  const bundle = await repo.getLaunchJobBundle(jobId);
  if (!bundle) throw new Error("job_not_found");
  const effectivePlan = plan || buildVideoMaterialPreparePlan({ bundle });
  const item = targetItem(effectivePlan, sourceAssetId);
  const internal = internalVideoItem(bundle, sourceAssetId);
  const resource = resourceFor(bundle, sourceAssetId);
  const credential = getOceanEngineCredentialSummary();
  const previousSuccess = await previousBindActionCount(repo, { jobId, sourceAssetId });
  const blockers = [
    ...(!item ? ["source_asset_not_in_required_video_plan"] : []),
    ...(item && !item.actions.includes("oceanengine_material_bind_target") ? ["bind_action_not_required_by_plan"] : []),
    ...(item && item.planStatus !== "source_ready_target_missing" ? [`plan_status_not_bindable:${item.planStatus}`] : []),
    ...(item && item.sourceAccountId !== expectedSourceAdvertiserId ? ["source_advertiser_mismatch"] : []),
    ...(item && item.targetAdvertiserId !== expectedTargetAdvertiserId ? ["target_advertiser_mismatch"] : []),
    ...(item && item.sourceVideoVisible !== true ? ["source_video_not_visible"] : []),
    ...(item && item.targetVideoVisible === true ? ["target_video_already_visible"] : []),
    ...(!internal?.videoId ? ["video_id_missing_for_controlled_bind"] : []),
    ...(internal && !internal.localFileHashPresent ? ["local_file_hash_missing"] : []),
    ...(resource.visibility_status === "visible" && resource.readback_status === "readback_verified" ? ["target_resource_already_verified"] : []),
    ...(previousSuccess > 0 ? ["successful_bind_action_already_recorded"] : []),
    ...(!credentialReady(credential) ? credential.blockers.map((blocker) => `credential:${blocker}`) : [])
  ];
  const result = {
    status: blockers.length ? "blocked" : "passed",
    blockers,
    jobId,
    sourceAssetId,
    sourceAdvertiserId: expectedSourceAdvertiserId,
    targetAdvertiserId: expectedTargetAdvertiserId,
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
  return { result, bundle, internal };
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
  expectedSourceAdvertiserId = "1760246749825031",
  expectedTargetAdvertiserId = "1871922175825993",
  fetchImpl = globalThis.fetch
} = {}) {
  const preflight = await preflightVideoMaterialBindOnce({
    repo,
    jobId,
    sourceAssetId,
    expectedSourceAdvertiserId,
    expectedTargetAdvertiserId
  });
  const blockers = [
    ...(allowNetworkWrite ? [] : ["network_write_not_enabled_by_caller"]),
    ...(confirmVariableValue === VIDEO_MATERIAL_CONFIRM_VALUE ? [] : ["confirm_variable_missing_or_invalid"]),
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

  const requestPayload = {
    advertiser_id: expectedSourceAdvertiserId,
    target_advertiser_ids: [expectedTargetAdvertiserId],
    video_ids: [preflight.internal.videoId]
  };
  const actionId = `ACTION-${jobId}-VIDEO-BIND-${sourceAssetId.replace(/[^A-Za-z0-9]+/g, "_")}`;
  const requestHash = hashValue(canonicalJson(requestPayload));
  const requestFieldManifest = {
    source_asset_id: sourceAssetId,
    source_advertiser_id: expectedSourceAdvertiserId,
    target_advertiser_id: expectedTargetAdvertiserId,
    video_id_present: true,
    raw_payload_stored: false
  };
  const metadata = {
    source_asset_id: sourceAssetId,
    source_advertiser_id: expectedSourceAdvertiserId,
    target_advertiser_id: expectedTargetAdvertiserId,
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
    requestFieldManifest,
    metadata
  });

  const env = readOceanEngineEnv().env;
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
  const passed = response.ok && (code === "0" || code === "" || alreadyBound);
  const responseSummary = safeBindResponseSummary(payload);
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
    responseHashPresent: true,
    rawPayloadStored: false,
    rawResponseStored: false
  };
  assertNoSensitiveLeak(result);
  return result;
}
