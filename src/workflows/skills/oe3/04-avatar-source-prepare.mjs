import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { assertNoSensitiveLeak, sanitizeForPublic } from "./00-contracts.mjs";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function clean(value) {
  return String(value ?? "").trim();
}

function avatarResource(bundle = {}) {
  return (bundle.resources || []).find((item) => item.resource_type === "avatar") || null;
}

function sha256Buffer(buffer) {
  return `sha256:${createHash("sha256").update(buffer).digest("hex")}`;
}

export async function inspectAvatarSourceAsset(asset = {}) {
  const assetRef = clean(asset.asset_ref);
  const expectedHash = clean(asset.asset_hash);
  const metadata = asset.metadata || {};
  const blockers = [];
  let bytes = null;

  if (clean(asset.asset_type) !== "avatar_image") blockers.push("avatar_source_asset_type_invalid");
  if (!assetRef) blockers.push("avatar_source_file_ref_missing");
  if (!blockers.length) {
    try {
      bytes = await readFile(assetRef);
    } catch {
      blockers.push("avatar_source_file_missing");
    }
  }

  const isPng = Boolean(bytes && bytes.length >= 24 && bytes.subarray(0, 8).equals(PNG_SIGNATURE));
  const width = isPng ? bytes.readUInt32BE(16) : 0;
  const height = isPng ? bytes.readUInt32BE(20) : 0;
  const actualHash = bytes ? sha256Buffer(bytes) : "";
  const normalizedExpectedHash = expectedHash ? `sha256:${expectedHash.replace(/^sha256:/, "")}` : "";
  const expectedWidth = Number(metadata.width || 300);
  const expectedHeight = Number(metadata.height || 300);

  if (bytes && !isPng) blockers.push("avatar_source_format_not_png");
  if (isPng && (width !== expectedWidth || height !== expectedHeight)) blockers.push("avatar_source_dimensions_invalid");
  if (!expectedHash) blockers.push("avatar_source_hash_missing");
  if (expectedHash && actualHash !== normalizedExpectedHash) blockers.push("avatar_source_hash_mismatch");

  const result = {
    status: blockers.length ? "blocked" : "passed",
    sourceAssetId: clean(asset.asset_id),
    source_asset_id: clean(asset.asset_id),
    sourceFilePresent: Boolean(bytes),
    source_file_present: Boolean(bytes),
    format: isPng ? "png" : "",
    width,
    height,
    sourceHash: actualHash,
    source_hash: actualHash,
    expectedHashPresent: Boolean(expectedHash),
    expected_hash_present: Boolean(expectedHash),
    derivedFromAssetId: clean(metadata.derived_from_asset_id),
    derived_from_asset_id: clean(metadata.derived_from_asset_id),
    blockers,
    rawFilePathStored: false,
    raw_file_path_stored: false
  };
  assertNoSensitiveLeak(result);
  return result;
}

export async function runAvatarSourcePrepareSkill({ repo, bundle } = {}) {
  if (!repo || !bundle?.job) throw new Error("launch_job_bundle_required");
  const resource = avatarResource(bundle);
  const sourceAssetId = clean(resource?.source_asset_id);
  let inspection = null;
  let blockers = [];

  if (!resource) {
    blockers = ["avatar_resource_missing"];
  } else if (!sourceAssetId) {
    blockers = ["avatar_source_asset_missing"];
  } else {
    const asset = await repo.getGameAsset(sourceAssetId);
    if (!asset) blockers = ["avatar_source_asset_missing"];
    else inspection = await inspectAvatarSourceAsset(asset);
  }
  if (inspection?.blockers?.length) blockers = inspection.blockers;

  const status = blockers.length ? "blocked" : "passed";
  const outputSummary = sanitizeForPublic({
    status,
    source_asset_id: sourceAssetId,
    source_file_present: inspection?.sourceFilePresent === true,
    format: inspection?.format || "",
    width: inspection?.width || 0,
    height: inspection?.height || 0,
    source_hash: inspection?.sourceHash || "",
    derived_from_asset_id: inspection?.derivedFromAssetId || "",
    next_action: status === "passed" ? "进入头像提交计划核验" : "补齐或修复独立头像源图",
    raw_file_path_stored: false
  });

  if (resource) {
    await repo.mergeAccountResourceMetadata({
      routeId: bundle.job.route_id,
      gameCode: bundle.job.game_code,
      advertiserId: bundle.job.advertiser_id,
      resourceType: "avatar",
      resourceMetadata: {
        avatar_source_preparation: {
          status,
          source_asset_id: sourceAssetId,
          source_file_present: inspection?.sourceFilePresent === true,
          format: inspection?.format || "",
          width: inspection?.width || 0,
          height: inspection?.height || 0,
          source_hash: inspection?.sourceHash || "",
          derived_from_asset_id: inspection?.derivedFromAssetId || "",
          checked_at: new Date().toISOString(),
          raw_file_path_stored: false
        }
      }
    });
  }

  const result = { status, blockers, outputSummary, evidenceRefs: [] };
  assertNoSensitiveLeak(result);
  return result;
}
