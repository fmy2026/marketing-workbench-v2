import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { assertNoSensitiveLeak, hashValue, sanitizeForPublic } from "./00-contracts.mjs";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function clean(value) {
  return String(value ?? "").trim();
}

function resource(bundle = {}) {
  return (bundle.resources || []).find((item) => item.resource_type === "product_image") || null;
}

function sha256Buffer(buffer) {
  return `sha256:${createHash("sha256").update(buffer).digest("hex")}`;
}

function jpegSize(buffer) {
  if (!buffer || buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return { width: 0, height: 0 };
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) break;
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2) break;
    if (marker >= 0xc0 && marker <= 0xc3) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7)
      };
    }
    offset += 2 + length;
  }
  return { width: 0, height: 0 };
}

function imageInfo(buffer) {
  if (buffer?.length >= 24 && buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return {
      format: "png",
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20)
    };
  }
  const jpeg = jpegSize(buffer);
  if (jpeg.width && jpeg.height) return { format: "jpeg", ...jpeg };
  return { format: "", width: 0, height: 0 };
}

export async function inspectProductImageSourceAsset(asset = {}) {
  const assetRef = clean(asset.asset_ref);
  const expectedHash = clean(asset.asset_hash);
  const metadata = asset.metadata || {};
  const blockers = [];
  let bytes = null;

  if (clean(asset.asset_type) !== "product_image") blockers.push("product_image_source_asset_type_invalid");
  if (!assetRef) blockers.push("product_image_source_file_ref_missing");
  if (!blockers.length) {
    try {
      bytes = await readFile(assetRef);
    } catch {
      blockers.push("product_image_source_file_missing");
    }
  }

  const info = imageInfo(bytes);
  const actualHash = bytes ? sha256Buffer(bytes) : "";
  const normalizedExpectedHash = expectedHash ? `sha256:${expectedHash.replace(/^sha256:/, "")}` : "";
  if (bytes && !info.format) blockers.push("product_image_source_format_unsupported");
  if (expectedHash && actualHash !== normalizedExpectedHash) blockers.push("product_image_source_hash_mismatch");
  if (!expectedHash) blockers.push("product_image_source_hash_missing");

  const requiredSize = clean(metadata.required_size || "");
  const requiredMatch = requiredSize.match(/^(\d+)x(\d+)$/);
  const uploadTransformRequired = Boolean(
    requiredMatch &&
    info.width &&
    info.height &&
    (info.width !== Number(requiredMatch[1]) || info.height !== Number(requiredMatch[2]))
  );

  const result = {
    status: blockers.length ? "blocked" : "passed",
    sourceAssetId: clean(asset.asset_id),
    source_asset_id: clean(asset.asset_id),
    sourceFilePresent: Boolean(bytes),
    source_file_present: Boolean(bytes),
    format: info.format,
    width: info.width,
    height: info.height,
    sourceHash: actualHash,
    source_hash: actualHash,
    expectedHashPresent: Boolean(expectedHash),
    expected_hash_present: Boolean(expectedHash),
    requiredSize,
    required_size: requiredSize,
    uploadTransformRequired,
    upload_transform_required: uploadTransformRequired,
    aigcDeclared: metadata.aigc === true,
    aigc_declared: metadata.aigc === true,
    blockers,
    rawFilePathStored: false,
    raw_file_path_stored: false
  };
  assertNoSensitiveLeak(result);
  return result;
}

async function writeEvidence(repo, bundle, outputSummary) {
  const artifactId = `EV-${bundle.job.job_id}-PRODUCT-IMAGE-SOURCE-PREP`;
  const evidence = {
    artifactId,
    jobId: bundle.job.job_id,
    artifactType: "product_image_source_prepare",
    title: "产品图源文件与目标户只读准备摘要",
    summary: `source_status=${outputSummary.status}; target_candidate_count=${outputSummary.target_candidate_count}; direct_target_upload_default=${outputSummary.direct_target_upload_default}`,
    contentHash: hashValue(outputSummary),
    storageRef: `postgres:mwb.launch_skill_runs/${bundle.job.job_id}/product-image-source-prepare`,
    sourceRef: "src/workflows/skills/oe3/04-product-image-source-prepare.mjs",
    sourceUsage: bundle.job.source_usage || "runtime_truth"
  };
  assertNoSensitiveLeak(evidence);
  await repo.upsertEvidence(evidence);
  return artifactId;
}

export async function runProductImageSourcePrepareSkill({ repo, bundle } = {}) {
  if (!repo || !bundle?.job) throw new Error("launch_job_bundle_required");
  const item = resource(bundle);
  const sourceAssetId = clean(item?.source_asset_id);
  const targetInventory = item?.metadata?.product_image_inventory || {};
  let inspection = null;
  let blockers = [];

  if (!item) {
    blockers = ["product_image_resource_missing"];
  } else if (!sourceAssetId) {
    blockers = ["product_image_source_asset_missing"];
  } else {
    const asset = await repo.getGameAsset(sourceAssetId);
    if (!asset) blockers = ["product_image_source_asset_missing"];
    else inspection = await inspectProductImageSourceAsset(asset);
  }
  if (inspection?.blockers?.length) blockers = inspection.blockers;

  const status = blockers.length ? "blocked" : "passed";
  const outputSummary = sanitizeForPublic({
    status,
    resource_type: "product_image",
    source_asset_id: sourceAssetId,
    source_file_present: inspection?.sourceFilePresent === true,
    format: inspection?.format || "",
    width: inspection?.width || 0,
    height: inspection?.height || 0,
    source_hash: inspection?.sourceHash || "",
    required_size: inspection?.requiredSize || "",
    upload_transform_required: inspection?.uploadTransformRequired === true,
    aigc_declared: inspection?.aigcDeclared === true,
    target_candidate_count: Number(targetInventory.candidate_count || 0),
    target_image_id_present: Boolean(item?.platform_resource_id),
    target_material_id_present: Boolean(item?.metadata?.material_id || item?.metadata?.product_image_inventory?.material_id),
    target_response_hash_present: Boolean(targetInventory.response_hash),
    official_readback_contract: "file/image/get",
    direct_target_upload_default: true,
    material_account_route_allowed: false,
    material_account_route_reason: "no_official_cross_account_image_share_or_bind_contract_verified",
    platform_write_called: false,
    next_action: status === "passed"
      ? "目标户仍缺产品图时，另建单次目标户图片上传与回查任务。"
      : "补齐或修复产品图源文件后重跑只读准备。",
    raw_file_path_stored: false
  });
  const evidenceRef = await writeEvidence(repo, bundle, outputSummary);

  if (item) {
    await repo.mergeAccountResourceMetadata({
      routeId: bundle.job.route_id,
      gameCode: bundle.job.game_code,
      advertiserId: bundle.job.advertiser_id,
      resourceType: "product_image",
      resourceMetadata: {
        product_image_source_preparation: {
          ...outputSummary,
          evidence_ref: evidenceRef,
          checked_at: new Date().toISOString()
        }
      }
    });
  }

  const result = { status, blockers, outputSummary: { ...outputSummary, evidenceRef, evidence_ref: evidenceRef }, evidenceRefs: [evidenceRef] };
  assertNoSensitiveLeak(result);
  return result;
}
