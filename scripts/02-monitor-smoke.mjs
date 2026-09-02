import assert from "node:assert/strict";
import {
  ACTION_ENSURE_MONITOR,
  ACTION_STD_PROJECT_CREATE,
  buildExecutionPlanFromBundle,
  buildMonitorBootstrapExecutionPlanFromBundle,
  PLAN_KIND_MONITOR_BOOTSTRAP
} from "../src/workflows/executionPlan.mjs";
import { assertNoSensitiveLeak } from "../src/workflows/skills/oe3/00-contracts.mjs";
import { buildMonitorBootstrapContract } from "../src/workflows/skills/oe3/02-monitor/readonly-reconcile.mjs";
import { monitorReadinessFromBundle } from "../src/workflows/skills/oe3/02-monitor/readiness.mjs";
import { executeConfirmedMonitorBootstrap } from "../src/workflows/skills/oe3/02-monitor/executor.mjs";
import { resolveMonitorTouchpointState } from "../src/workflows/skills/oe3/02-monitor/index.mjs";

const target = {
  routeId: "oceanengine_3_byte_mini_game",
  gameCode: "JSZC",
  advertiserId: "8990000000001301"
};

const monitorContract = buildMonitorBootstrapContract({
  target,
  account: {
    qiankunAccountRecordId: "QK-8990000000001301",
    ownerKey: "synthetic_owner"
  },
  technicalConfig: {
    os: 3,
    package_id: "36820",
    cate_id: "122",
    vest_id: "1414",
    channel: "dymini3k",
    media_id: "310",
    agent_id: "613",
    monitor_api: "toutiao_wxgame",
    usage: 0,
    num: 1
  },
  provisionId: "MPR-SYNTHETIC-8990000000001301",
  cycleId: "MPR-SYNTHETIC-8990000000001301-CYCLE-01",
  cycleNo: 1,
  attemptNo: 1,
  readonlyEvidenceRef: "EV-SYNTHETIC-MONITOR-READONLY"
});

const bundle = {
  job: {
    job_id: "JOB-SYNTHETIC-MONITOR-PLAN",
    case_id: "CASE-SYNTHETIC-MONITOR-PLAN",
    route_id: target.routeId,
    game_code: target.gameCode,
    advertiser_id: target.advertiserId,
    object_type: "std_project",
    source_usage: "test_run"
  },
  monitorReadiness: {
    readiness_status: "needs_plan",
    monitor_ready: false,
    actionable_blocker_code: "monitor_plan_required",
    diagnostic_codes: [],
    suggested_action: "compile_monitor_bootstrap_plan"
  },
  resources: [],
  nodes: []
};

const readiness = monitorReadinessFromBundle(bundle);
assert.equal(readiness.monitorReady, false);
assert.equal(readiness.actionableBlockerCode, "monitor_plan_required");

const resolvedTouchpoint = resolveMonitorTouchpointState({
  monitor: { monitorId: "MONITOR-SYNTHETIC", touchpointUrl: "controlled-touchpoint-value", touchpointUrlHash: "a".repeat(64) },
  verification: { touchpointRef: "TP-SYNTHETIC", touchpointUrlPresent: true, urlHashMatches: true }
});
assert.equal(resolvedTouchpoint.verified, true, "touchpoint must require post-write integrity verification");
assert.equal(resolvedTouchpoint.runStatus, "touchpoint_resolved");

const hashOnlyTouchpoint = resolveMonitorTouchpointState({
  monitor: { monitorId: "MONITOR-SYNTHETIC", touchpointUrlHash: "a".repeat(64) },
  verification: { touchpointRef: "TP-SYNTHETIC", touchpointUrlPresent: false, urlHashMatches: false }
});
assert.equal(hashOnlyTouchpoint.verified, false, "hash-only touchpoint must not be ready");
assert.equal(hashOnlyTouchpoint.runStatus, "monitor_resolved_touchpoint_pending");
assert.equal(hashOnlyTouchpoint.blocker, "touchpoint_url_missing");

const mismatchedTouchpoint = resolveMonitorTouchpointState({
  monitor: { monitorId: "MONITOR-SYNTHETIC", touchpointUrl: "controlled-touchpoint-value", touchpointUrlHash: "a".repeat(64) },
  verification: { touchpointRef: "TP-SYNTHETIC", touchpointUrlPresent: true, urlHashMatches: false }
});
assert.equal(mismatchedTouchpoint.verified, false, "hash mismatch must not be ready");
assert.equal(mismatchedTouchpoint.blocker, "touchpoint_url_hash_mismatch");

const monitorPlan = buildMonitorBootstrapExecutionPlanFromBundle(bundle, {
  planVersion: 4,
  monitorContract
});
assert.equal(monitorPlan.planKind, PLAN_KIND_MONITOR_BOOTSTRAP);
assert.equal(monitorPlan.planStatus, "ready");
assert.deepEqual(monitorPlan.plannedActions.map((action) => action.action_type), [ACTION_ENSURE_MONITOR]);
assert.equal(monitorPlan.metadata.execution_scope.maximum_platform_calls, 1);
assert.equal(monitorPlan.metadata.execution_scope.retry_allowed, false);
assert.equal(monitorPlan.draftId, "");
assert.equal(monitorPlan.payloadHash, "");
assert.equal(JSON.stringify(monitorPlan).includes("package_download_url"), false);
assertNoSensitiveLeak(monitorPlan);

const standardPlan = buildExecutionPlanFromBundle({
  ...bundle,
  monitorReadiness: {
    readiness_status: "ready",
    monitor_ready: true,
    actionable_blocker_code: ""
  },
  resources: [
    { resource_type: "avatar", visibility_status: "visible", readback_status: "readback_verified" },
    { resource_type: "dmp_audience_package", visibility_status: "visible", readback_status: "readback_verified" },
    { resource_type: "event_asset", visibility_status: "visible", readback_status: "readback_verified" },
    { resource_type: "video_asset", visibility_status: "visible", readback_status: "readback_verified" },
    { resource_type: "product_image", visibility_status: "visible", readback_status: "readback_verified" },
    { resource_type: "brand_info", visibility_status: "visible", readback_status: "readback_verified" },
    { resource_type: "micro_app_instance", visibility_status: "visible", readback_status: "readback_verified" },
    { resource_type: "backup_landing_page", visibility_status: "visible", readback_status: "readback_verified" }
  ],
  nodes: [{ node_key: "std_project_draft_builder", output_summary: { createReadiness: { blockers: [], canCreateCurrentJob: false } } }]
});
assert.equal(standardPlan.plannedActions.some((action) => action.action_type === ACTION_ENSURE_MONITOR), false);
assert.equal(standardPlan.plannedActions.some((action) => action.action_type === ACTION_STD_PROJECT_CREATE), true);

let confirmationWrites = 0;
const blockedExecution = await executeConfirmedMonitorBootstrap({
  repo: {
    async getLaunchJobBundle() {
      return { ...bundle, case: { lifecycle_status: "active" }, executionPlan: {
        plan_id: monitorPlan.planId,
        plan_kind: monitorPlan.planKind,
        plan_status: monitorPlan.planStatus,
        plan_hash: monitorPlan.planHash,
        planned_actions: monitorPlan.plannedActions,
        blocker_codes: [],
        metadata: monitorPlan.metadata
      } };
    },
    async getLatestLaunchExecutionPlan() { return null; },
    async getLaunchConfirmationForPlan() { return null; },
    async upsertLaunchConfirmation() { confirmationWrites += 1; }
  },
  jobId: bundle.job.job_id,
  expectedPlanId: monitorPlan.planId,
  expectedPlanHash: monitorPlan.planHash
});
assert.equal(blockedExecution.status, "blocked");
assert(
  blockedExecution.blockers.includes("platform_write_scope_not_enabled") ||
  blockedExecution.blockers.includes("workbench_runtime_source_usage_not_allowed"),
  "test fixture must fail closed under the active authorization policy"
);
assert.equal(confirmationWrites, 0, "no confirmation/action/platform write when guardrail is disabled");
assert.equal(blockedExecution.platformWriteCalled, false);
assertNoSensitiveLeak(blockedExecution);

console.log(JSON.stringify({
  status: "passed",
  assertions: [
    "monitor_bootstrap_plan_has_exactly_one_ensure_monitor",
    "standard_plan_does_not_mix_monitor_action",
    "monitor_contract_is_hash_only",
    "blocked_authorization_produces_zero_confirmation_or_platform_writes"
  ]
}, null, 2));
