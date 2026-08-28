import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ensureProductImageForTargetOnce, PRODUCT_IMAGE_CONFIRM_VALUE } from "../src/platforms/oceanengineProductImageExecutor.mjs";
import { assertNoSensitiveLeak } from "../src/workflows/skills/oe3/00-index.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function tinyPng108() {
  return Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x6c,
    0x00, 0x00, 0x00, 0x6c,
    0x08, 0x02, 0x00, 0x00, 0x00
  ]);
}

function sha256Hex(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function md5Hex(buffer) {
  return createHash("md5").update(buffer).digest("hex");
}

async function writeState(dir, { enabled = true } = {}) {
  const statePath = join(dir, `project-state-${enabled ? "enabled" : "disabled"}.json`);
  await writeFile(statePath, `${JSON.stringify({ guardrails: { platform_write_allowed: enabled } }, null, 2)}\n`);
  return statePath;
}

function makeBundle({ jobId = "JOB-SMOKE-PRODUCT-IMAGE", imagePath, planHash = "sha256:plan" } = {}) {
  return {
    job: {
      job_id: jobId,
      case_id: "CASE-SMOKE",
      route_id: "oceanengine_3_byte_mini_game",
      game_code: "JSZC",
      advertiser_id: "1871922346964041",
      object_type: "std_project",
      source_usage: "runtime_truth"
    },
    case: {
      case_id: "CASE-SMOKE",
      lifecycle_status: "active"
    },
    executionPlan: {
      plan_id: `PLAN-${jobId}-V1`,
      plan_hash: planHash,
      planned_actions: [
        {
          action_type: "ensure_resource:product_image",
          status: "planned",
          module_ref: "src/platforms/oceanengineProductImageExecutor.mjs"
        }
      ],
      metadata: {
        execution_scope: {
          mode: "single_oceanengine_product_image_upload",
          target_job_id: jobId,
          target_advertiser_id: "1871922346964041",
          target_plan_id: `PLAN-${jobId}-V1`,
          target_plan_hash: planHash,
          allowed_actions: ["ensure_resource:product_image"],
          maximum_actions: 1,
          maximum_platform_calls: 1,
          retry_allowed: false,
          official_contract: {
            required_size: "108x108",
            upload_endpoint: "https://api.oceanengine.com/open_api/2/file/image/ad/",
            upload_method: "POST",
            readback_endpoint: "file/image/get"
          }
        }
      }
    },
    resources: [
      {
        resource_type: "product_image",
        resource_name: "smoke product image",
        source_asset_id: "PI-SMOKE-PRODUCT",
        visibility_status: "needs_confirmation",
        readback_status: "not_checked",
        metadata: {}
      }
    ],
    sourceAsset: {
      asset_id: "PI-SMOKE-PRODUCT",
      asset_type: "product_image",
      asset_name: "smoke product image",
      asset_ref: imagePath,
      asset_hash: "",
      metadata: {
        required_size: "108x108",
        aigc: false
      }
    }
  };
}

function fakeRepo(bundle, { existingActionCount = 0 } = {}) {
  const actions = [];
  const resourceUpdates = [];
  const platformUpdates = [];
  const evidence = [];
  bundle.sourceAsset.asset_hash = sha256Hex(bundle.fileBytes);
  return {
    actions,
    resourceUpdates,
    platformUpdates,
    evidence,
    async getLaunchJobBundle(jobId) {
      assert(jobId === bundle.job.job_id, "unexpected_job_id");
      return bundle;
    },
    async getLatestLaunchExecutionPlan() {
      return bundle.executionPlan;
    },
    async getGameAsset(assetId) {
      return assetId === bundle.sourceAsset.asset_id ? bundle.sourceAsset : null;
    },
    async countPlatformActions() {
      return existingActionCount;
    },
    async upsertPlatformAction(action) {
      actions.push(action);
    },
    async upsertEvidence(item) {
      evidence.push(item);
    },
    async updateAccountResourceReadonly(update) {
      resourceUpdates.push(update);
    },
    async updateAccountResourcePlatformResource(update) {
      platformUpdates.push(update);
    }
  };
}

function readonlyClientFor({ signature, existing = false, postUploadMatch = true }) {
  const calls = [];
  return {
    calls,
    async get({ label, summarize }) {
      calls.push(label);
      if (label === "product_image_signature_readback" && existing) {
        return {
          label,
          status: "passed",
          httpStatus: 200,
          apiCode: "0",
          requestIdPresent: true,
          responseHash: "sha256:signature-hit",
          summary: summarize({
            code: 0,
            request_id: "request",
            data: {
              list: [
                { id: "tos-cn-i-sd07hgqsbj/existing", material_id: 100001, width: 108, height: 108, format: "png", signature, url: "https://example.invalid/preview" }
              ]
            }
          })
        };
      }
      if (label === "product_image_signature_readback") {
        return {
          label,
          status: "passed",
          httpStatus: 200,
          apiCode: "0",
          requestIdPresent: true,
          responseHash: "sha256:signature-miss",
          summary: summarize({ code: 0, request_id: "request", data: { list: [] } })
        };
      }
      const item = postUploadMatch
        ? { id: "tos-cn-i-sd07hgqsbj/new", material_id: 200002, width: 108, height: 108, format: "png", signature, url: "https://example.invalid/preview" }
        : { id: "tos-cn-i-sd07hgqsbj/new", material_id: 200002, width: 120, height: 120, format: "png", signature, url: "https://example.invalid/preview" };
      return {
        label,
        status: "passed",
        httpStatus: 200,
        apiCode: "0",
        requestIdPresent: true,
        responseHash: "sha256:id-readback",
        summary: summarize({ code: 0, request_id: "request", data: { list: [item] } })
      };
    }
  };
}

function fakeFetch({ ok = true } = {}) {
  const calls = [];
  async function fetchImpl(url, options = {}) {
    calls.push({ url: String(url), method: options.method || "GET" });
    if (!ok) {
      return new Response(JSON.stringify({ code: 40000, request_id: "request", message: "invalid image" }), { status: 200 });
    }
    return new Response(JSON.stringify({
      code: 0,
      request_id: "request",
      data: {
        id: "tos-cn-i-sd07hgqsbj/new",
        material_id: 200002,
        width: 108,
        height: 108,
        format: "png",
        signature: "unused",
        url: "https://example.invalid/preview"
      }
    }), { status: 200 });
  }
  fetchImpl.calls = calls;
  return fetchImpl;
}

const root = await mkdtemp(join(tmpdir(), "mwbv2-product-image-executor-"));
try {
  const imagePath = join(root, "product_image_108x108.png");
  const bytes = tinyPng108();
  await writeFile(imagePath, bytes);
  const signature = md5Hex(bytes);
  const enabledState = await writeState(root, { enabled: true });
  const disabledState = await writeState(root, { enabled: false });
  const credentialSummary = {
    status: "valid",
    envFilePresent: true,
    accessTokenPresent: true,
    refreshTokenPresent: true,
    tokenExpired: false,
    blockers: []
  };
  const oceanEngineEnv = { OCEANENGINE_ACCESS_TOKEN: "test-access-token" };

  const existingBundle = makeBundle({ jobId: "JOB-SMOKE-PRODUCT-EXISTING", imagePath });
  existingBundle.fileBytes = bytes;
  const existingRepo = fakeRepo(existingBundle);
  const existingClient = readonlyClientFor({ signature, existing: true });
  const existing = await ensureProductImageForTargetOnce({
    repo: existingRepo,
    jobId: existingBundle.job.job_id,
    confirmVariableValue: "",
    readonlyClient: existingClient,
    fetchImpl: fakeFetch(),
    credentialSummary,
    oceanEngineEnv,
    projectStatePath: disabledState,
    readbackDelaysMs: [0]
  });
  assert(existing.status === "product_image_ready_noop", "existing_match_should_noop");
  assert(existing.platform_write_called === false, "existing_match_must_not_upload");
  assert(existingRepo.resourceUpdates.at(-1)?.readbackStatus === "readback_verified", "existing_match_should_update_readback");

  const uploadBundle = makeBundle({ jobId: "JOB-SMOKE-PRODUCT-UPLOAD", imagePath });
  uploadBundle.fileBytes = bytes;
  const uploadRepo = fakeRepo(uploadBundle);
  const uploadFetch = fakeFetch();
  const uploaded = await ensureProductImageForTargetOnce({
    repo: uploadRepo,
    jobId: uploadBundle.job.job_id,
    confirmVariableValue: PRODUCT_IMAGE_CONFIRM_VALUE,
    readonlyClient: readonlyClientFor({ signature }),
    fetchImpl: uploadFetch,
    credentialSummary,
    oceanEngineEnv,
    projectStatePath: enabledState,
    readbackDelaysMs: [0]
  });
  assert(uploaded.status === "product_image_ready", "upload_should_be_ready_after_readback");
  assert(uploadFetch.calls.length === 1, "upload_should_call_platform_once");
  assert(uploadRepo.platformUpdates.length === 1, "upload_should_record_platform_resource");
  assert(uploadRepo.resourceUpdates.at(-1)?.visibilityStatus === "visible", "upload_should_mark_visible");

  const failedBundle = makeBundle({ jobId: "JOB-SMOKE-PRODUCT-UPLOAD-FAIL", imagePath });
  failedBundle.fileBytes = bytes;
  const failedRepo = fakeRepo(failedBundle);
  const failed = await ensureProductImageForTargetOnce({
    repo: failedRepo,
    jobId: failedBundle.job.job_id,
    confirmVariableValue: PRODUCT_IMAGE_CONFIRM_VALUE,
    readonlyClient: readonlyClientFor({ signature }),
    fetchImpl: fakeFetch({ ok: false }),
    credentialSummary,
    oceanEngineEnv,
    projectStatePath: enabledState,
    readbackDelaysMs: [0]
  });
  assert(failed.status === "product_image_upload_failed_once", "upload_failure_should_stop");

  const mismatchBundle = makeBundle({ jobId: "JOB-SMOKE-PRODUCT-READBACK-MISMATCH", imagePath });
  mismatchBundle.fileBytes = bytes;
  const mismatchRepo = fakeRepo(mismatchBundle);
  const mismatch = await ensureProductImageForTargetOnce({
    repo: mismatchRepo,
    jobId: mismatchBundle.job.job_id,
    confirmVariableValue: PRODUCT_IMAGE_CONFIRM_VALUE,
    readonlyClient: readonlyClientFor({ signature, postUploadMatch: false }),
    fetchImpl: fakeFetch(),
    credentialSummary,
    oceanEngineEnv,
    projectStatePath: enabledState,
    readbackDelaysMs: [0]
  });
  assert(mismatch.status === "product_image_readback_not_verified", "readback_mismatch_should_block");
  assert(mismatchRepo.resourceUpdates.at(-1)?.readbackStatus === "failed", "mismatch_should_record_failed_readback");

  const blockedBundle = makeBundle({ jobId: "JOB-SMOKE-PRODUCT-BLOCKED", imagePath });
  blockedBundle.fileBytes = bytes;
  const blocked = await ensureProductImageForTargetOnce({
    repo: fakeRepo(blockedBundle),
    jobId: blockedBundle.job.job_id,
    confirmVariableValue: PRODUCT_IMAGE_CONFIRM_VALUE,
    readonlyClient: readonlyClientFor({ signature }),
    fetchImpl: fakeFetch(),
    credentialSummary,
    oceanEngineEnv,
    projectStatePath: disabledState,
    readbackDelaysMs: [0]
  });
  assert(blocked.status === "blocked_before_product_image_write", "disabled_scope_should_block");
  assert(blocked.blockers.includes("platform_write_scope_not_enabled"), "disabled_scope_blocker_missing");
  assert(blocked.platform_write_called === false, "disabled_scope_must_not_upload");

  const result = {
    status: "passed",
    existingNoop: existing.status,
    uploadReady: uploaded.status,
    uploadCallCount: uploadFetch.calls.length,
    uploadFailure: failed.status,
    readbackMismatch: mismatch.status,
    disabledScope: blocked.status,
    noRealPlatformWrite: true,
    noTokenRefresh: true
  };
  assertNoSensitiveLeak(result);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  await rm(root, { recursive: true, force: true });
}
