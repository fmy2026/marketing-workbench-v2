import { createHash, randomBytes } from "node:crypto";
import { stat } from "node:fs/promises";
import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import { createJob } from "../src/workflows/launchWorkflow.mjs";
import { buildExecutionPlanFromBundle } from "../src/workflows/executionPlan.mjs";
import { ensureProductImageForTargetOnce, PRODUCT_IMAGE_CONFIRM_VALUE } from "../src/platforms/oceanengineProductImageExecutor.mjs";
import { revokeProductImageWriteScope } from "../src/workflows/productImageExecutionScope.mjs";
import { runProductImageSourcePrepareSkill } from "../src/workflows/skills/oe3/04-product-image-source-prepare.mjs";
import { assertNoSensitiveLeak, hashValue, sanitizeForPublic } from "../src/workflows/skills/oe3/00-contracts.mjs";

const TASK_ID = "TASK-MWBV2-OE3-PRODUCT-IMAGE-TARGET-UPLOAD-1871922346964041";
const DEFAULT_ROUTE_ID = "oceanengine_3_byte_mini_game";
const DEFAULT_GAME_CODE = "JSZC";
const DEFAULT_ADVERTISER_ID = "1871922346964041";
const DEFAULT_CASE_ID = "CASE-LEGACY-2E4217E20C9E26BFB648772C";
const DEFAULT_SOURCE_ASSET_ID = "PI-JSZC-PRODUCT-IMAGE-001";
const DEFAULT_IMAGE_PATH = "/Users/hys/ProjectAssets/marketing-workbench-v2/JSZC/product_image_108*108.png";
const DEFAULT_ORIGINAL_PATH = "/Users/hys/ProjectAssets/marketing-workbench-v2/JSZC/image.png";

function arg(name, fallback = "") {
  const inline = process.argv.find((item) => item.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.findIndex((item) => item === `--${name}`);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function clean(value) {
  return String(value ?? "").trim();
}

function sha256Hex(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function md5Hex(buffer) {
  return createHash("md5").update(buffer).digest("hex");
}

function pngInfo(buffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!buffer?.subarray(0, 8).equals(signature)) return { format: "", width: 0, height: 0 };
  return {
    format: "png",
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

async function readImageSummary(path) {
  const bytes = await import("node:fs/promises").then((fs) => fs.readFile(path));
  const info = pngInfo(bytes);
  const fileStat = await stat(path);
  return {
    path,
    bytes,
    format: info.format,
    width: info.width,
    height: info.height,
    sizeBytes: fileStat.size,
    sha256: sha256Hex(bytes),
    md5: md5Hex(bytes)
  };
}

async function recordSkillRun({ repo, jobId, skillKey, result, moduleRef }) {
  const outputSummary = sanitizeForPublic(result.outputSummary || result);
  await repo.upsertLaunchSkillRun({
    skillRunId: `${jobId}-${skillKey}-1`,
    jobId,
    nodeKey: "account_resource_prepare",
    skillKey,
    attemptNo: 1,
    status: result.status?.includes("ready") || result.status === "passed" ? "passed" : "blocked",
    inputHash: hashValue({ jobId, skillKey }),
    outputSummary,
    blockers: result.blockers || [],
    evidenceRefs: result.evidenceRefs || [result.evidence_ref || result.evidenceRef || ""].filter(Boolean),
    blockerCodes: result.blockers || [],
    moduleRef,
    sourceUsage: "runtime_truth"
  });
}

async function resolveJob({ repo, args }) {
  const jobId = clean(args.jobId);
  if (jobId) return { jobId, created: false };
  const view = await createJob(repo, {
    user_intent: `${args.routeId} ${args.gameCode} ${args.advertiserId}`,
    route_id: args.routeId,
    game_code: args.gameCode,
    advertiser_id: args.advertiserId,
    case_id: args.caseId,
    source_usage: "runtime_truth",
    source_record_ref: args.sourceRecordRef
  });
  return { jobId: view.jobId, created: true };
}

async function saveProductImageExecutionPlan({ repo, jobId }) {
  const bundle = await repo.getLaunchJobBundle(jobId);
  const plan = buildExecutionPlanFromBundle(bundle);
  const scope = {
    mode: "single_oceanengine_product_image_upload",
    target_job_id: jobId,
    target_advertiser_id: bundle.job.advertiser_id,
    target_plan_id: plan.planId,
    target_plan_hash: plan.planHash,
    allowed_actions: ["ensure_resource:product_image"],
    maximum_actions: 1,
    maximum_platform_calls: 1,
    retry_allowed: false,
    official_contract: {
      source_ref: "/Users/hys/knowledge/01-个人本地知识库/01-官方文档/open.oceanengine.com-3.0-waibugei/巨量营销智擎版/创建标准项目.md:165",
      upload_source_ref: "/Users/hys/knowledge/01-个人本地知识库/01-官方文档/open.oceanengine.com-2.0-copy/12-素材管理.md:894",
      readback_source_ref: "/Users/hys/knowledge/01-个人本地知识库/01-官方文档/open.oceanengine.com-2.0-copy/12-素材管理.md:2155",
      required_size: "108x108",
      upload_endpoint: "https://api.oceanengine.com/open_api/2/file/image/ad/",
      upload_method: "POST",
      readback_endpoint: "file/image/get",
      upload_type: "UPLOAD_BY_FILE",
      payload_persisted: false,
      response_persisted: false
    }
  };
  const scopedPlan = {
    ...plan,
    metadata: {
      ...plan.metadata,
      execution_scope: scope
    }
  };
  await repo.upsertLaunchExecutionPlan(scopedPlan);
  return scopedPlan;
}

const args = {
  routeId: arg("route-id", DEFAULT_ROUTE_ID),
  gameCode: arg("game-code", DEFAULT_GAME_CODE).toUpperCase(),
  advertiserId: arg("advertiser-id", DEFAULT_ADVERTISER_ID),
  caseId: arg("case-id", DEFAULT_CASE_ID),
  sourceRecordRef: arg("source-record-ref", TASK_ID),
  sourceAssetId: arg("source-asset-id", DEFAULT_SOURCE_ASSET_ID),
  imagePath: arg("image-path", DEFAULT_IMAGE_PATH),
  originalPath: arg("original-path", DEFAULT_ORIGINAL_PATH),
  jobId: arg("job-id", "")
};

const repo = new PostgresRepository();
let result = {};
try {
  const generated = await readImageSummary(args.imagePath);
  const original = await readImageSummary(args.originalPath).catch(() => null);
  const preflightBlockers = [
    ...(generated.format === "png" ? [] : ["generated_product_image_not_png"]),
    ...(generated.width === 108 && generated.height === 108 ? [] : ["generated_product_image_not_108x108"]),
    ...(generated.sizeBytes > 0 && generated.sizeBytes <= 5 * 1024 * 1024 ? [] : ["generated_product_image_size_invalid"])
  ];
  if (preflightBlockers.length) {
    throw new Error(preflightBlockers.join(","));
  }
  await repo.updateGameAssetFile({
    assetId: args.sourceAssetId,
    assetRef: args.imagePath,
    assetHash: generated.sha256,
    visibilityStatus: "active",
    metadata: {
      width: generated.width,
      height: generated.height,
      format: generated.format,
      required_size: "108x108",
      upload_transform: "scaled_from_original",
      original_source_hash: original ? `sha256:${original.sha256}` : "",
      generated_sha256: `sha256:${generated.sha256}`,
      image_md5_hash: hashValue(generated.md5),
      file_size_bytes: generated.sizeBytes,
      filename_literal_star: args.imagePath.includes("*"),
      source_record_ref: args.sourceRecordRef,
      full_file_path_in_evidence: false
    }
  });
  const { jobId, created } = await resolveJob({ repo, args });
  let bundle = await repo.getLaunchJobBundle(jobId);
  const sourceResult = await runProductImageSourcePrepareSkill({ repo, bundle });
  await recordSkillRun({
    repo,
    jobId,
    skillKey: "product-image-source-prepare",
    result: sourceResult,
    moduleRef: "src/workflows/skills/oe3/04-product-image-source-prepare.mjs"
  });
  const plan = await saveProductImageExecutionPlan({ repo, jobId });
  bundle = await repo.getLaunchJobBundle(jobId);
  const ensureResult = await ensureProductImageForTargetOnce({
    repo,
    jobId,
    confirmVariableValue: hasFlag("auto-confirm") ? PRODUCT_IMAGE_CONFIRM_VALUE : process.env.MWBV2_OE_PRODUCT_IMAGE_CONFIRM || ""
  });
  await recordSkillRun({
    repo,
    jobId,
    skillKey: "product-image-target-ensure",
    result: ensureResult,
    moduleRef: "src/platforms/oceanengineProductImageExecutor.mjs"
  });
  const ready = ["product_image_ready", "product_image_ready_noop"].includes(ensureResult.status);
  await repo.updateJob(jobId, {
    status: ready ? "completed_product_image_ready" : "blocked_product_image",
    currentNode: "4"
  });
  result = sanitizeForPublic({
    status: ready ? "passed" : "blocked",
    conclusion: ensureResult.status,
    blockers: ensureResult.blockers || [],
    task_id: args.sourceRecordRef,
    job_id: jobId,
    job_created: created,
    plan_id: plan.planId,
    product_image_asset_id: args.sourceAssetId,
    generated_image_sha256: `sha256:${generated.sha256}`,
    generated_image_md5_hash: hashValue(generated.md5),
    generated_width: generated.width,
    generated_height: generated.height,
    generated_size_bytes: generated.sizeBytes,
    platform_write_called: ensureResult.platform_write_called === true,
    target_already_usable: ensureResult.target_already_usable === true,
    image_id_present: ensureResult.image_id_present === true || ensureResult.status === "product_image_ready_noop",
    material_id_present: ensureResult.material_id_present === true || ensureResult.status === "product_image_ready_noop",
    evidence_ref: ensureResult.evidence_ref || "",
    noTokenRefresh: true,
    token_refresh_called: false
  });
} finally {
  await revokeProductImageWriteScope();
}

assertNoSensitiveLeak(result);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
process.exit(result.status === "passed" ? 0 : 1);
