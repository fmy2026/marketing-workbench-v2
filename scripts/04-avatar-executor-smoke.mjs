import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ensureAvatarForTargetOnce, AVATAR_ENSURE_CONFIRM_VALUE } from "../src/platforms/oceanengineAvatarExecutor.mjs";

function assert(value, message) {
  if (!value) throw new Error(message);
}

function pngHeader(width, height) {
  const header = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(header, 0);
  header.writeUInt32BE(13, 8);
  header.write("IHDR", 12, "ascii");
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  return header;
}

function response(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

function avatarProbe(status) {
  return {
    status: "passed",
    httpStatus: 200,
    apiCode: "0",
    requestIdPresent: true,
    responseHash: "sha256:readback",
    summary: {
      avatar_status: status,
      avatar_ready: ["IN_AUDIT", "AUDIT_PASS"].includes(status),
      avatar_readiness_reason: ["IN_AUDIT", "AUDIT_PASS"].includes(status) ? "avatar_ready" : "avatar_unset",
      image_present: status !== "UNSET",
      width: status === "UNSET" ? 0 : 300,
      height: status === "UNSET" ? 0 : 300
    }
  };
}

const dir = await mkdtemp(path.join(os.tmpdir(), "mwbv2-avatar-executor-"));
try {
  const file = path.join(dir, "account-avatar-300x300.png");
  const bytes = pngHeader(300, 300);
  await writeFile(file, bytes);
  const hash = createHash("sha256").update(bytes).digest("hex");
  const jobId = "JOB-AVATAR-EXECUTOR-SMOKE";
  const asset = { asset_id: "AI-JSZC-ACCOUNT-AVATAR-300-001", asset_type: "avatar_image", asset_ref: file, asset_hash: hash, metadata: { width: 300, height: 300 } };
  const writes = [];
  const resourceUpdates = [];
  const baseRepo = {
    getLaunchJobBundle: async () => ({
      job: { job_id: jobId, route_id: "oceanengine_3_byte_mini_game", game_code: "JSZC", advertiser_id: "1871922346964041" },
      resources: [{ resource_type: "avatar", source_asset_id: asset.asset_id, metadata: {} }],
      executionPlan: { plan_id: `PLAN-${jobId}-V1`, plan_hash: "sha256:plan", planned_actions: [{ action_type: "ensure_resource:avatar", status: "planned" }] }
    }),
    getLatestLaunchExecutionPlan: async () => null,
    countPlatformActions: async () => 0,
    getGameAsset: async () => asset,
    upsertPlatformAction: async (value) => writes.push(value),
    upsertEvidence: async () => {},
    updateAccountResourceReadonly: async (value) => resourceUpdates.push(value),
    updateAccountResourcePlatformResource: async (value) => resourceUpdates.push(value)
  };
  const statePath = path.join(dir, "state.json");
  await writeFile(statePath, JSON.stringify({ guardrails: { platform_write_allowed: true, platform_write_scope: { target_job_id: jobId, target_advertiser_id: "1871922346964041", target_plan_id: `PLAN-${jobId}-V1`, target_plan_hash: "sha256:plan", allowed_actions: ["ensure_resource:avatar"], maximum_actions: 1, maximum_platform_calls: 2, retry_allowed: false } } }));
  const credential = { status: "valid", blockers: [], envFilePresent: true, accessTokenPresent: true, refreshTokenPresent: true, tokenExpired: false };

  let probeCount = 0;
  const successResult = await ensureAvatarForTargetOnce({
    repo: baseRepo,
    jobId,
    confirmVariableValue: AVATAR_ENSURE_CONFIRM_VALUE,
    credentialSummary: credential,
    oceanEngineEnv: { OCEANENGINE_ACCESS_TOKEN: "test-token" },
    projectStatePath: statePath,
    readonlyClient: { get: async () => avatarProbe(probeCount++ === 0 ? "UNSET" : "IN_AUDIT") },
    fetchImpl: async (url) => String(url).includes("upload") ? response({ code: 0, data: { image_id: "123456" } }) : response({ code: 0, data: {} })
  });
  assert(successResult.status === "avatar_ready", "avatar_executor_success_not_ready");
  assert(writes.filter((item) => item.actionStatus === "started").length === 2, "avatar_executor_should_call_two_writes");
  assert(resourceUpdates.some((item) => item.readbackStatus === "pending"), "avatar_upload_should_use_schema_pending_status");

  const uploadFailure = await ensureAvatarForTargetOnce({
    repo: { ...baseRepo, upsertPlatformAction: async () => {} },
    jobId,
    confirmVariableValue: AVATAR_ENSURE_CONFIRM_VALUE,
    credentialSummary: credential,
    oceanEngineEnv: { OCEANENGINE_ACCESS_TOKEN: "test-token" },
    projectStatePath: statePath,
    readonlyClient: { get: async () => avatarProbe("UNSET") },
    fetchImpl: async () => response({ code: 40000 }, 400)
  });
  assert(uploadFailure.status === "upload_failed_once", "avatar_upload_failure_not_stopped");

  const alreadyReady = await ensureAvatarForTargetOnce({
    repo: baseRepo,
    jobId,
    confirmVariableValue: AVATAR_ENSURE_CONFIRM_VALUE,
    credentialSummary: credential,
    oceanEngineEnv: { OCEANENGINE_ACCESS_TOKEN: "test-token" },
    projectStatePath: statePath,
    readonlyClient: { get: async () => avatarProbe("AUDIT_PASS") },
    fetchImpl: async () => { throw new Error("write_should_not_run"); }
  });
  assert(alreadyReady.status === "already_ready_noop", "avatar_ready_should_noop");
  process.stdout.write(`${JSON.stringify({ status: "passed", success: successResult.status, uploadFailure: uploadFailure.status, alreadyReady: alreadyReady.status, rawResponseStored: false }, null, 2)}\n`);
} finally {
  await rm(dir, { recursive: true, force: true });
}
