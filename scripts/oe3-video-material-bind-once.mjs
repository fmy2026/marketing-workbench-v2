import fs from "node:fs";
import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import { runJob } from "../src/workflows/launchWorkflow.mjs";
import { assertNoSensitiveLeak } from "../src/workflows/skills/oe3/contracts.mjs";
import {
  bindVideoMaterialToTargetOnce,
  preflightVideoMaterialBindOnce,
  VIDEO_MATERIAL_CONFIRM_ENV,
  VIDEO_MATERIAL_CONFIRM_VALUE
} from "../src/platforms/oceanengineVideoMaterialExecutor.mjs";

const DEFAULT_JOB_ID = "JOB-MWBV2-20260824151431-ECA120";
const DEFAULT_SOURCE_ASSET_ID = "JSZC-HUNT-4GE6-14";
const STATE_PATH = new URL("../project.state.json", import.meta.url);

function arg(name, fallback = "") {
  const inline = process.argv.find((item) => item.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.findIndex((item) => item === `--${name}`);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function readProjectState() {
  return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
}

function writeProjectState(state, { status }) {
  state.guardrails.platform_write_allowed = false;
  state.guardrails.platform_write_scope = {
    ...(state.guardrails.platform_write_scope || {}),
    mode: status === "executed"
      ? "completed_single_oceanengine_video_material_bind_for_p04"
      : "revoked_single_oceanengine_video_material_bind_for_p04",
    revoked_at: new Date().toISOString(),
    retry_allowed: false,
    maximum_actions: 1
  };
  state.project_status = status === "executed"
    ? "p04_video_bind_once_executed_recheck_required"
    : "blocked_waiting_p04_single_video_bind_to_target";
  state.source_of_truth.runtime_state = state.project_status;
  state.next_gate = status === "executed"
    ? "已执行 P04 单次视频素材绑定，需查看目标账户只读回查和 P04 readiness；若达到 2/2，则生成 fresh runtime job/draft，当前仍禁止 std_project/create。"
    : "P04 单次视频素材绑定 scope 已撤销；若仍需绑定，必须重新开启单次绑定任务并确认。";
  fs.writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`);
}

function scopeBlockers(state, { jobId, sourceAssetId }) {
  const scope = state.guardrails?.platform_write_scope || {};
  const allowed = Array.isArray(scope.allowed_actions) ? scope.allowed_actions : [];
  return [
    ...(state.guardrails?.platform_write_allowed === true ? [] : ["platform_write_scope_not_enabled"]),
    ...(scope.mode === "single_oceanengine_video_material_bind_for_p04" ? [] : [`scope_mode_not_video_bind:${scope.mode || "missing"}`]),
    ...(scope.target_job_id === jobId ? [] : ["scope_job_mismatch"]),
    ...(scope.source_asset_id === sourceAssetId ? [] : ["scope_source_asset_mismatch"]),
    ...(scope.source_advertiser_id === "1760246749825031" ? [] : ["scope_source_advertiser_mismatch"]),
    ...(scope.target_advertiser_id === "1871922175825993" ? [] : ["scope_target_advertiser_mismatch"]),
    ...(allowed.includes("oceanengine_material_bind_target") ? [] : ["scope_action_not_allowed"]),
    ...(Number(scope.maximum_actions || 0) === 1 ? [] : ["scope_maximum_actions_not_one"]),
    ...(scope.retry_allowed === false ? [] : ["scope_retry_allowed_not_false"])
  ];
}

const repo = new PostgresRepository();
const jobId = arg("job-id", process.env.MWBV2_TARGET_JOB_ID || DEFAULT_JOB_ID);
const sourceAssetId = arg("source-asset-id", DEFAULT_SOURCE_ASSET_ID);
const execute = hasFlag("execute");

const state = readProjectState();
const scopeIssues = execute ? scopeBlockers(state, { jobId, sourceAssetId }) : [];
const preflight = await preflightVideoMaterialBindOnce({
  repo,
  jobId,
  sourceAssetId
});

let result = {
  mode: execute ? "execute_once" : "dry_run",
  executeRequested: execute,
  scopeStatus: scopeIssues.length ? "blocked" : "passed",
  scopeBlockers: scopeIssues,
  preflight: preflight.result,
  bind: null,
  readback: null
};

if (execute && scopeIssues.length === 0) {
  result.bind = await bindVideoMaterialToTargetOnce({
    repo,
    jobId,
    sourceAssetId,
    allowNetworkWrite: true,
    confirmVariableValue: process.env[VIDEO_MATERIAL_CONFIRM_ENV] || ""
  });
  writeProjectState(state, {
    status: result.bind.writeCalled ? "executed" : "revoked"
  });
  if (result.bind.writeCalled) {
    const view = await runJob(repo, jobId, {
      mode: "dry_run",
      allowReadonlyDependency: true,
      allowNetworkWrite: false
    });
    result.readback = {
      jobId,
      node4Status: view.phases
        ?.flatMap((phase) => phase.nodes || [])
        ?.find((node) => node.id === "account_resource_prepare")
        ?.status || "",
      payloadContractStatus: view.payloadContract?.status || "",
      prewriteGateStatus: view.prewriteGateStatus || "",
      createReadinessStatus: view.createReadiness?.status || "",
      stdProjectCreateCalled: false
    };
  }
}

result.confirmVariable = `${VIDEO_MATERIAL_CONFIRM_ENV}=${VIDEO_MATERIAL_CONFIRM_VALUE}`;
result.stdProjectCreateCalled = false;
assertNoSensitiveLeak(result);
console.log(JSON.stringify(result, null, 2));
