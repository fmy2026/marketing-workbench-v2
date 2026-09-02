import { createHash } from "node:crypto";
import { basename } from "node:path";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { assertNoSensitiveLeak, hashValue, sanitizeForPublic } from "../workflows/skills/oe3/00-contracts.mjs";
import { inspectProductImageSourceAsset } from "../workflows/skills/oe3/04-product-image-source-prepare.mjs";
import {
  PRODUCT_IMAGE_ENSURE_CONFIRM_ENV,
  PRODUCT_IMAGE_ENSURE_CONFIRM_VALUE,
  validateProductImageWriteScope
} from "../workflows/productImageExecutionScope.mjs";
import {
  credentialReady,
  getOceanEngineCredentialSummary,
  readOceanEngineEnv
} from "./oceanengineCredentialStore.mjs";
import { createOceanEngineReadonlyClient } from "./oceanengineReadonlyClient.mjs";
import { fetchWithDeadline, isPlatformDeadlineError, PLATFORM_UPLOAD_TIMEOUT_MS } from "./httpDeadline.mjs";

export const PRODUCT_IMAGE_CONFIRM_ENV = PRODUCT_IMAGE_ENSURE_CONFIRM_ENV;
export const PRODUCT_IMAGE_CONFIRM_VALUE = PRODUCT_IMAGE_ENSURE_CONFIRM_VALUE;

const API_BASE = "https://api.oceanengine.com";
const IMAGE_UPLOAD_ENDPOINT = "/open_api/2/file/image/ad/";
const IMAGE_UPLOAD_FULL_ENDPOINT = `${API_BASE}${IMAGE_UPLOAD_ENDPOINT}`;
const IMAGE_READBACK_ENDPOINT = "file/image/get";
const REQUIRED_SIZE = "108x108";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const DEFAULT_PRODUCT_IMAGE_READBACK_DELAYS_MS = [0, 2000, 5000, 10000];

function clean(value) {
  return String(value ?? "").trim();
}

function md5Buffer(buffer) {
  return createHash("md5").update(buffer).digest("hex");
}

function apiCode(payload = {}) {
  return clean(payload.code ?? payload.err_no ?? payload.error_code ?? "");
}

function requestIdPresent(payload = {}) {
  return Boolean(payload.request_id || payload.data?.request_id);
}

function success(response, payload = {}) {
  const code = apiCode(payload);
  return response.ok && (code === "0" || code === "");
}

function productImageIdFromPayload(payload = {}) {
  return clean(payload.data?.id || payload.data?.image_id || payload.id || payload.image_id);
}

function productMaterialIdFromPayload(payload = {}) {
  return clean(payload.data?.material_id || payload.material_id);
}

function listFromPayload(payload = {}) {
  const list = payload.data?.list || payload.list || [];
  return Array.isArray(list) ? list : [];
}

function normalizeFormat(value) {
  const text = clean(value).toLowerCase();
  if (text === "jpg") return "jpeg";
  return text;
}

function summarizeImageItem(item = {}) {
  return {
    image_id: clean(item.id || item.image_id),
    material_id: clean(item.material_id),
    width: Number(item.width || 0),
    height: Number(item.height || 0),
    format: normalizeFormat(item.format),
    signature: clean(item.signature).toLowerCase(),
    filename_present: Boolean(clean(item.filename)),
    url_present: Boolean(clean(item.url)),
    raw_response_stored: false
  };
}

function matchingImageItem(payload = {}, { imageId = "", materialId = "", signature = "", width = 108, height = 108 } = {}) {
  const wantedImageId = clean(imageId);
  const wantedMaterialId = clean(materialId);
  const wantedSignature = clean(signature).toLowerCase();
  return listFromPayload(payload)
    .map(summarizeImageItem)
    .find((item) =>
      (!wantedImageId || item.image_id === wantedImageId) &&
      (!wantedMaterialId || item.material_id === wantedMaterialId) &&
      (!wantedSignature || item.signature === wantedSignature) &&
      item.width === Number(width) &&
      item.height === Number(height) &&
      item.format === "png"
    ) || null;
}

function safeResponseSummary(payload = {}) {
  const itemCount = listFromPayload(payload).length;
  return {
    api_code: apiCode(payload) || "unknown",
    request_id_present: requestIdPresent(payload),
    data_present: Boolean(payload?.data && typeof payload.data === "object"),
    image_id_present: Boolean(productImageIdFromPayload(payload)),
    material_id_present: Boolean(productMaterialIdFromPayload(payload)),
    list_count: itemCount,
    message_present: Boolean(clean(payload.message || payload.msg || payload.error_message)),
    raw_response_stored: false
  };
}

function compactCredential(summary = {}) {
  return {
    status: summary.status,
    env_file_present: Boolean(summary.envFilePresent),
    access_token_present: Boolean(summary.accessTokenPresent),
    refresh_token_present: Boolean(summary.refreshTokenPresent),
    token_expired: Boolean(summary.tokenExpired)
  };
}

function productImageResource(bundle = {}) {
  return (bundle.resources || []).find((item) => item.resource_type === "product_image") || null;
}

function buildSignatureReadbackQuery({ advertiserId, signature }) {
  return {
    advertiser_id: advertiserId,
    filtering: {
      signatures: [signature],
      width: "108",
      height: "108"
    },
    page: 1,
    page_size: 20
  };
}

function buildIdReadbackQuery({ advertiserId, imageId }) {
  return {
    advertiser_id: advertiserId,
    filtering: {
      image_ids: [imageId],
      width: "108",
      height: "108"
    },
    page: 1,
    page_size: 20
  };
}

async function readProductImageBySignature({ advertiserId, signature, readonlyClient }) {
  return readonlyClient.get({
    label: "product_image_signature_readback",
    endpoint: IMAGE_READBACK_ENDPOINT,
    query: buildSignatureReadbackQuery({ advertiserId, signature }),
    requestFieldManifest: {
      field_names: ["advertiser_id", "filtering.signatures", "filtering.width", "filtering.height", "page", "page_size"],
      filter_mode: "signatures",
      width: 108,
      height: 108,
      raw_query_stored: false
    },
    summarize: (payload) => ({
      match: matchingImageItem(payload, { signature }),
      returned_count: listFromPayload(payload).length,
      raw_response_stored: false
    })
  });
}

async function readProductImageById({ advertiserId, imageId, materialId = "", signature, readonlyClient }) {
  return readonlyClient.get({
    label: "product_image_id_readback",
    endpoint: IMAGE_READBACK_ENDPOINT,
    query: buildIdReadbackQuery({ advertiserId, imageId }),
    requestFieldManifest: {
      field_names: ["advertiser_id", "filtering.image_ids", "filtering.width", "filtering.height", "page", "page_size"],
      filter_mode: "image_ids",
      width: 108,
      height: 108,
      raw_query_stored: false
    },
    summarize: (payload) => ({
      match: matchingImageItem(payload, { imageId, materialId, signature }),
      returned_count: listFromPayload(payload).length,
      raw_response_stored: false
    })
  });
}

async function saveProductImageEvidence({ repo, jobId, stage, readback = {}, status, extra = {} }) {
  const artifactId = `EV-${jobId}-PRODUCT-IMAGE-${stage.toUpperCase().replace(/[^A-Z0-9]+/g, "-")}`;
  const summary = sanitizeForPublic({
    stage,
    status,
    endpoint: IMAGE_READBACK_ENDPOINT,
    http_status: readback.httpStatus ?? null,
    api_code: readback.apiCode || "",
    request_id_present: readback.requestIdPresent === true,
    response_hash_present: Boolean(readback.responseHash),
    ...extra,
    raw_response_stored: false
  });
  assertNoSensitiveLeak(summary);
  await repo.upsertEvidence({
    artifactId,
    jobId,
    artifactType: "product_image_readback",
    title: `product image ${stage} readback`,
    summary: `stage=${stage}; status=${status}; http=${summary.http_status ?? "none"}; api_code=${summary.api_code || "unknown"}; response_hash_present=${summary.response_hash_present === true}`,
    contentHash: readback.responseHash || hashValue(summary),
    storageRef: "postgres:evidence_artifacts:redacted_summary_only",
    sourceRef: "oceanengine:file/image/get",
    sourceUsage: "runtime_truth"
  });
  return artifactId;
}

async function updateAction(repo, action) {
  await repo.upsertPlatformAction(action);
}

async function callProductImageUpload({ repo, jobId, body, headers, requestHash, requestFieldManifest, metadata, fetchImpl }) {
  const actionId = `ACTION-${jobId}-PRODUCT-IMAGE-UPLOAD`;
  await updateAction(repo, {
    actionId,
    jobId,
    actionType: "oceanengine_product_image_upload",
    endpoint: IMAGE_UPLOAD_ENDPOINT,
    method: "POST",
    actionStatus: "started",
    attemptNo: 1,
    requestHash,
    requestFieldManifest,
    metadata
  });
  try {
    const response = await fetchWithDeadline(fetchImpl, IMAGE_UPLOAD_FULL_ENDPOINT, { method: "POST", headers, body }, { timeoutMs: PLATFORM_UPLOAD_TIMEOUT_MS });
    const text = await response.text();
    let payload = {};
    try { payload = JSON.parse(text); } catch { payload = {}; }
    const imageId = productImageIdFromPayload(payload);
    const passed = success(response, payload) && Boolean(imageId);
    const responseHash = hashValue(text);
    await updateAction(repo, {
      actionId,
      jobId,
      actionType: "oceanengine_product_image_upload",
      endpoint: IMAGE_UPLOAD_ENDPOINT,
      method: "POST",
      actionStatus: passed ? "succeeded" : "failed_once",
      attemptNo: 1,
      requestHash,
      responseHash,
      httpStatus: response.status,
      apiCode: apiCode(payload) || "unknown",
      requestIdPresent: requestIdPresent(payload),
      objectIdPresent: Boolean(imageId),
      errorSummary: passed ? "" : "product_image_platform_response_not_confirmed",
      errorCategory: passed ? "" : "platform_response_not_confirmed",
      requestFieldManifest,
      responseSummary: safeResponseSummary(payload),
      metadata,
      finishedAt: new Date().toISOString()
    });
    return { actionId, passed, response, payload, responseHash };
  } catch (error) {
    const timedOut = isPlatformDeadlineError(error);
    const errorCategory = timedOut ? "timeout" : clean(error?.code || error?.name || "transport_error");
    await updateAction(repo, {
      actionId,
      jobId,
      actionType: "oceanengine_product_image_upload",
      endpoint: IMAGE_UPLOAD_ENDPOINT,
      method: "POST",
      actionStatus: "failed_once",
      attemptNo: 1,
      requestHash,
      responseHash: "",
      httpStatus: null,
      apiCode: timedOut ? "timeout" : "",
      requestIdPresent: false,
      objectIdPresent: false,
      errorSummary: "product_image_platform_transport_failed",
      errorCategory,
      requestFieldManifest,
      responseSummary: { transport_error: true, timeout: timedOut, raw_response_stored: false },
      metadata,
      finishedAt: new Date().toISOString()
    });
    return { actionId, passed: false, response: null, payload: {}, responseHash: "", errorCategory };
  }
}

async function markReady({ repo, bundle, match, evidenceRef, source, responseHash, uploadActionId = "" }) {
  const metadata = {
    status: "passed",
    key: "product_image_target_readback_verified",
    image_id_present: Boolean(match.image_id),
    material_id_present: Boolean(match.material_id),
    image_id_hash: match.image_id ? hashValue(match.image_id) : "",
    material_id: match.material_id,
    signature_hash: match.signature ? hashValue(match.signature) : "",
    width: match.width,
    height: match.height,
    format: match.format,
    source_hash: source.source_hash,
    response_hash: responseHash || "",
    evidence_ref: evidenceRef,
    upload_action_id: uploadActionId,
    checked_at: new Date().toISOString(),
    raw_response_stored: false
  };
  await repo.updateAccountResourceReadonly({
    routeId: bundle.job.route_id,
    gameCode: bundle.job.game_code,
    advertiserId: bundle.job.advertiser_id,
    resourceType: "product_image",
    platformResourceId: match.image_id,
    visibilityStatus: "visible",
    readbackStatus: "readback_verified",
    metadata,
    resourceMetadata: {
      product_image_target_upload_readback: metadata
    }
  });
}

export function buildProductImageUploadRequestPlan({ advertiserId, sourceAssetId, sourceHash, imageMd5, filename = "product_image_108*108.png" } = {}) {
  const requestShape = {
    advertiser_id: clean(advertiserId),
    upload_type: "UPLOAD_BY_FILE",
    image_signature: clean(imageMd5).toLowerCase(),
    image_file_present: true,
    filename: clean(filename)
  };
  return sanitizeForPublic({
    endpoint: IMAGE_UPLOAD_FULL_ENDPOINT,
    method: "POST",
    requestHash: hashValue(requestShape),
    requestFieldManifest: {
      field_names: ["advertiser_id", "upload_type", "image_signature", "image_file", "filename", "is_aigc"],
      upload_type: "UPLOAD_BY_FILE",
      file_format: "png",
      width: 108,
      height: 108,
      max_size_bytes: MAX_IMAGE_BYTES,
      source_asset_id: sourceAssetId,
      raw_payload_stored: false
    },
    outputSummary: {
      advertiser_id: clean(advertiserId),
      source_asset_id: sourceAssetId,
      source_hash: sourceHash,
      image_md5_hash: imageMd5 ? hashValue(imageMd5) : "",
      filename_present: Boolean(clean(filename)),
      request_hash: hashValue(requestShape),
      raw_payload_stored: false,
      raw_response_stored: false
    }
  });
}

export async function ensureProductImageForTargetOnce({
  repo,
  jobId,
  confirmVariableValue = process.env[PRODUCT_IMAGE_CONFIRM_ENV] || "",
  fetchImpl = globalThis.fetch,
  readonlyClient = null,
  credentialSummary = null,
  oceanEngineEnv = null,
  projectStatePath,
  readbackDelaysMs = DEFAULT_PRODUCT_IMAGE_READBACK_DELAYS_MS
} = {}) {
  if (!repo || !jobId) throw new Error("product_image_executor_repo_and_job_required");
  const bundle = await repo.getLaunchJobBundle(jobId);
  if (!bundle?.job) throw new Error("job_not_found");
  const resource = productImageResource(bundle);
  const sourceAsset = resource?.source_asset_id ? await repo.getGameAsset(resource.source_asset_id) : null;
  const source = sourceAsset ? await inspectProductImageSourceAsset(sourceAsset) : { status: "blocked", blockers: ["product_image_source_asset_missing"] };
  const credential = credentialSummary || getOceanEngineCredentialSummary();
  const client = readonlyClient || createOceanEngineReadonlyClient({ fetchImpl });
  const file = sourceAsset?.asset_ref ? await readFile(sourceAsset.asset_ref).catch(() => null) : null;
  const imageMd5 = file ? md5Buffer(file) : "";
  const signatureReadback = imageMd5
    ? await readProductImageBySignature({ advertiserId: bundle.job.advertiser_id, signature: imageMd5, readonlyClient: client })
    : { status: "blocked", summary: {}, responseHash: "", blockers: ["product_image_file_missing"] };
  const signatureMatch = signatureReadback.summary?.match || null;

  if (signatureReadback.status === "passed" && signatureMatch?.image_id && signatureMatch?.material_id) {
    const evidenceRef = await saveProductImageEvidence({
      repo,
      jobId,
      stage: "signature_inventory",
      readback: signatureReadback,
      status: "passed",
      extra: { matched: true, image_id_present: true, material_id_present: true }
    });
    await markReady({ repo, bundle, match: signatureMatch, evidenceRef, source, responseHash: signatureReadback.responseHash });
    const result = sanitizeForPublic({
      status: "product_image_ready_noop",
      jobId,
      evidence_ref: evidenceRef,
      target_already_usable: true,
      platform_write_called: false,
      token_refresh_called: false
    });
    assertNoSensitiveLeak(result);
    return result;
  }

  const scope = await validateProductImageWriteScope({ repo, bundle, projectStatePath });
  const sizeBytes = Number(file?.length || 0);
  const sourceRequiredSize = clean(source.required_size || source.requiredSize || sourceAsset?.metadata?.required_size);
  const blockers = [
    ...(confirmVariableValue === PRODUCT_IMAGE_CONFIRM_VALUE ? [] : ["confirm_variable_missing_or_invalid"]),
    ...(scope.status === "passed" ? [] : scope.blockers),
    ...(credentialReady(credential) ? [] : credential.blockers.map((item) => `credential:${item}`)),
    ...(resource ? [] : ["product_image_resource_missing"]),
    ...(source.status === "passed" ? [] : source.blockers || ["product_image_source_not_ready"]),
    ...(source.format === "png" ? [] : ["product_image_generated_format_not_png"]),
    ...(source.width === 108 && source.height === 108 ? [] : ["product_image_generated_size_not_108x108"]),
    ...(sourceRequiredSize === REQUIRED_SIZE ? [] : ["official_product_image_required_size_not_confirmed"]),
    ...(file ? [] : ["product_image_file_missing"]),
    ...(sizeBytes > 0 && sizeBytes <= MAX_IMAGE_BYTES ? [] : ["product_image_file_size_invalid"]),
    ...(imageMd5 ? [] : ["product_image_md5_missing"]),
    ...(signatureReadback.status === "passed" || ["blocked", "transport_failed", "credential_required"].includes(signatureReadback.status) ? [] : ["product_image_signature_preflight_status_unknown"])
  ];

  if (blockers.length) {
    const result = sanitizeForPublic({
      status: "blocked_before_product_image_write",
      jobId,
      blockers,
      source_status: source.status,
      source_hash: source.source_hash || "",
      source_width: source.width || 0,
      source_height: source.height || 0,
      source_format: source.format || "",
      file_size_bytes: sizeBytes,
      signature_preflight_status: signatureReadback.status,
      credential: compactCredential(credential),
      platform_write_called: false,
      token_refresh_called: false
    });
    assertNoSensitiveLeak(result);
    return result;
  }

  const env = oceanEngineEnv || readOceanEngineEnv().env;
  const filename = basename(sourceAsset.asset_ref) || "product_image_108*108.png";
  const uploadPlan = buildProductImageUploadRequestPlan({
    advertiserId: bundle.job.advertiser_id,
    sourceAssetId: resource.source_asset_id,
    sourceHash: source.source_hash,
    imageMd5,
    filename
  });
  const body = new FormData();
  body.set("advertiser_id", bundle.job.advertiser_id);
  body.set("upload_type", "UPLOAD_BY_FILE");
  body.set("image_signature", imageMd5);
  body.set("image_file", new Blob([file], { type: "image/png" }), filename);
  body.set("filename", filename);
  body.set("is_aigc", source.aigc_declared === true ? "true" : "false");
  const upload = await callProductImageUpload({
    repo,
    jobId,
    body,
    headers: {
      Accept: "application/json",
      "Access-Token": env.OCEANENGINE_ACCESS_TOKEN
    },
    requestHash: uploadPlan.requestHash,
    requestFieldManifest: uploadPlan.requestFieldManifest,
    metadata: {
      source_asset_id: resource.source_asset_id,
      source_hash: source.source_hash,
      image_md5_hash: hashValue(imageMd5),
      retry_allowed: false,
      raw_payload_stored: false,
      raw_response_stored: false
    },
    fetchImpl
  });
  if (!upload.passed) {
    const result = sanitizeForPublic({
      status: "product_image_upload_failed_once",
      jobId,
      upload_action_id: upload.actionId,
      http_status: upload.response?.status ?? null,
      api_code: apiCode(upload.payload) || "unknown",
      response_hash_present: Boolean(upload.responseHash),
      platform_write_called: true,
      readback_called: false,
      token_refresh_called: false
    });
    assertNoSensitiveLeak(result);
    return result;
  }

  const imageId = productImageIdFromPayload(upload.payload);
  const materialId = productMaterialIdFromPayload(upload.payload);
  await repo.updateAccountResourcePlatformResource({
    routeId: bundle.job.route_id,
    gameCode: bundle.job.game_code,
    advertiserId: bundle.job.advertiser_id,
    resourceType: "product_image",
    platformResourceId: imageId,
    visibilityStatus: "needs_confirmation",
    readbackStatus: "pending",
    metadata: {
      product_image_upload: {
        upload_action_id: upload.actionId,
        image_id_present: true,
        material_id_present: Boolean(materialId),
        image_id_hash: hashValue(imageId),
        material_id: materialId,
        upload_response_hash: upload.responseHash,
        source_asset_id: resource.source_asset_id,
        source_hash: source.source_hash,
        raw_response_stored: false
      }
    }
  });

  let idReadback = null;
  let readbackAttempts = 0;
  for (const waitMs of readbackDelaysMs) {
    if (Number(waitMs) > 0) await delay(Number(waitMs));
    readbackAttempts += 1;
    idReadback = await readProductImageById({
      advertiserId: bundle.job.advertiser_id,
      imageId,
      materialId,
      signature: imageMd5,
      readonlyClient: client
    });
    if (idReadback.status === "passed" && idReadback.summary?.match?.image_id && idReadback.summary?.match?.material_id) break;
  }
  const match = idReadback.summary?.match || null;
  const ready = idReadback.status === "passed" && Boolean(match?.image_id && match?.material_id);
  const evidenceRef = await saveProductImageEvidence({
    repo,
    jobId,
    stage: "post_upload",
    readback: idReadback,
    status: ready ? "passed" : "blocked",
    extra: {
      matched: ready,
      image_id_present: Boolean(match?.image_id),
      material_id_present: Boolean(match?.material_id)
    }
  });
  if (ready) {
    await markReady({ repo, bundle, match, evidenceRef, source, responseHash: idReadback.responseHash, uploadActionId: upload.actionId });
  } else {
    await repo.updateAccountResourceReadonly({
      routeId: bundle.job.route_id,
      gameCode: bundle.job.game_code,
      advertiserId: bundle.job.advertiser_id,
      resourceType: "product_image",
      visibilityStatus: "needs_confirmation",
      readbackStatus: "failed",
      metadata: {
        status: "blocked",
        key: "product_image_post_upload_readback_not_verified",
        evidence_ref: evidenceRef,
        upload_action_id: upload.actionId,
        response_hash: idReadback.responseHash || "",
        image_id_present: Boolean(imageId),
        material_id_present: Boolean(materialId),
        readback_attempts: readbackAttempts,
        target_match: false,
        raw_response_stored: false
      },
      resourceMetadata: {
        product_image_target_upload_readback: {
          status: "blocked",
          evidence_ref: evidenceRef,
          upload_action_id: upload.actionId,
          raw_response_stored: false
        }
      }
    });
  }
  const result = sanitizeForPublic({
    status: ready ? "product_image_ready" : "product_image_readback_not_verified",
    jobId,
    upload_action_id: upload.actionId,
    evidence_ref: evidenceRef,
    target_match: ready,
    image_id_present: Boolean(imageId),
    material_id_present: Boolean(materialId || match?.material_id),
    readback_attempts: readbackAttempts,
    platform_write_called: true,
    token_refresh_called: false,
    raw_payload_stored: false,
    raw_response_stored: false
  });
  assertNoSensitiveLeak(result);
  return result;
}
