import { fileURLToPath } from "node:url";
import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import { createJob, runJob } from "../src/workflows/launchWorkflow.mjs";
import { runMonitorProvisionCommand } from "../src/workflows/skills/oe3/02-monitor-provision.mjs";
import { assertNoSensitiveLeak, sanitizeForPublic } from "../src/workflows/skills/oe3/00-contracts.mjs";
import { runOe3WorkflowSkills } from "../src/workflows/skills/oe3/00-runner.mjs";

const AWEME_AUTH_READINESS_FIELDS = [
  "required",
  "configured",
  "verification_status",
  "ready",
  "blocker_code",
  "next_action",
  "default_aweme_id_hash",
  "verified_at",
  "expires_at",
  "evidence_ref",
  "probe_profile",
  "http_status",
  "platform_code",
  "request_id_present",
  "message_hash",
  "response_hash",
  "returned_row_count",
  "primary_returned_row_count",
  "discovery_returned_row_count",
  "discovery_page_count",
  "default_aweme_id_hit",
  "shared_relation_seen",
  "warning_code"
];

const AWEME_AUTH_READONLY_SKILLS = [
  "intake-normalize",
  "context-resolve-account",
  "launch-pack-resolve-game",
  "launch-pack-resolve-defaults",
  "aweme-authorization-readonly"
];

const FORBIDDEN_FLAGS = new Set([
  "execute",
  "execute-once",
  "mock",
  "mock-ready",
  "mock-execute",
  "allow-network-write",
  "network-write",
  "confirm",
  "confirmation-intent",
  "confirm-variable-value",
  "grant-source",
  "execution-grant-id",
  "allowed-plan-actions",
  "monitor-ensure",
  "create-monitor",
  "refresh-token"
]);

const FORBIDDEN_ENV_NAMES = [
  "MWBV2_OE_EXECUTION_CONFIRM",
  "MWBV2_OE_STD_PROJECT_CREATE_CONFIRM",
  "MWBV2_OE_VIDEO_MATERIAL_CONFIRM",
  "MWBV2_OE_TOKEN_REFRESH_CONFIRM",
  "MWBV2_MONITOR_CREATE_CONFIRM",
  "MWBV2_MONITOR_RETRY_CONFIRM",
  "MWBV2_MONITOR_PROVISION_ID",
  "MWBV2_MONITOR_CREATE_PLAN_HASH",
  "MWBV2_MONITOR_L3_OVERRIDE_CONFIRM"
];

function argValue(argv, name, fallback = "") {
  const inline = argv.find((item) => item.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = argv.findIndex((item) => item === `--${name}`);
  return index >= 0 ? argv[index + 1] || fallback : fallback;
}

function flagNames(argv) {
  return argv
    .filter((item) => item.startsWith("--"))
    .map((item) => item.slice(2).split("=")[0])
    .filter(Boolean);
}

export function parseReadonlyReadinessArgs(argv = process.argv.slice(2)) {
  return {
    scope: argValue(argv, "scope"),
    routeId: argValue(argv, "route-id"),
    gameCode: argValue(argv, "game-code").toUpperCase(),
    advertiserId: argValue(argv, "advertiser-id"),
    caseId: argValue(argv, "case-id"),
    jobId: argValue(argv, "job-id"),
    expectedMonitorId: argValue(argv, "expected-monitor-id", "245828"),
    sourceRecordRef: argValue(argv, "source-record-ref"),
    flags: flagNames(argv),
    argv
  };
}

export function assertReadonlyReadinessInvocation({ args, env = process.env } = {}) {
  const forbiddenFlags = args.flags.filter((name) => FORBIDDEN_FLAGS.has(name));
  const forbiddenEnv = FORBIDDEN_ENV_NAMES.filter((name) => env[name]);
  const missing = [];
  if (args.scope && args.scope !== "aweme_authorization") throw new Error("readonly_readiness_scope_not_supported");
  if (args.scope === "aweme_authorization" && args.jobId) throw new Error("aweme_authorization_scope_requires_fresh_job");
  if (!args.jobId && !args.routeId) missing.push("route_id");
  if (!args.jobId && !args.gameCode) missing.push("game_code");
  if (!args.jobId && !args.advertiserId) missing.push("advertiser_id");
  if (!args.jobId && !args.caseId) missing.push("case_id");
  if (args.routeId && args.routeId !== "oceanengine_3_byte_mini_game") throw new Error("readonly_readiness_route_not_supported");
  if (args.gameCode && args.gameCode !== "JSZC") throw new Error("readonly_readiness_game_not_supported");
  if (args.advertiserId && !/^\d+$/.test(args.advertiserId)) throw new Error("invalid_advertiser_id");
  if (missing.length) throw new Error(`missing_required_fields:${missing.join(",")}`);
  if (forbiddenFlags.length) throw new Error(`forbidden_write_or_mock_flags:${forbiddenFlags.join(",")}`);
  if (forbiddenEnv.length) throw new Error(`forbidden_confirmation_or_refresh_env:${forbiddenEnv.join(",")}`);
}

export function awemeAuthorizationReadinessOnly(row = {}) {
  return Object.fromEntries(AWEME_AUTH_READINESS_FIELDS.map((key) => [key, row?.[key] ?? null]));
}

function assertAwemeAuthorizationReadonlyBoundary({ bundle, auditCounts }) {
  const skillKeys = (bundle.skillRuns || []).map((run) => run.skill_key);
  const unexpectedSkills = skillKeys.filter((key) => !AWEME_AUTH_READONLY_SKILLS.includes(key));
  const missingSkills = AWEME_AUTH_READONLY_SKILLS.filter((key) => !skillKeys.includes(key));
  if (unexpectedSkills.length || missingSkills.length) {
    throw new Error(`aweme_authorization_scope_skill_boundary_failed:${[
      ...unexpectedSkills.map((key) => `unexpected:${key}`),
      ...missingSkills.map((key) => `missing:${key}`)
    ].join(",")}`);
  }
  const forbiddenCounts = [
    ["drafts", auditCounts.drafts],
    ["executionPlans", auditCounts.executionPlans],
    ["readbackRecords", auditCounts.readbackRecords],
    ["launchConfirmations", auditCounts.launchConfirmations],
    ["platformActions", auditCounts.platformActions],
    ["createdObjects", auditCounts.createdObjects]
  ].filter(([, value]) => Number(value || 0) > 0);
  if (forbiddenCounts.length) {
    throw new Error(`aweme_authorization_scope_forbidden_records:${forbiddenCounts.map(([key]) => key).join(",")}`);
  }
}

function requireSame(value, expected, label) {
  if (expected && String(value || "") !== String(expected)) {
    throw new Error(`${label}_mismatch`);
  }
}

export async function createOrResolveReadonlyReadinessJob({ repo, args, sourceRecordPrefix = "workflow:readonly-readiness" }) {
  if (args.jobId) {
    const bundle = await repo.getLaunchJobBundle(args.jobId);
    if (!bundle?.job) throw new Error("job_not_found");
    if (bundle.job.source_usage !== "runtime_truth") throw new Error("job_not_runtime_truth");
    requireSame(bundle.job.route_id, args.routeId, "route_id");
    requireSame(bundle.job.game_code, args.gameCode, "game_code");
    requireSame(bundle.job.advertiser_id, args.advertiserId, "advertiser_id");
    requireSame(bundle.job.case_id, args.caseId, "case_id");
    return { jobId: args.jobId, created: false, bundle };
  }

  const sourceRecordRef = args.sourceRecordRef || `${sourceRecordPrefix}:${new Date().toISOString()}`;
  const view = await createJob(repo, {
    user_intent: `route_id=${args.routeId} game_code=${args.gameCode} advertiser_id=${args.advertiserId}`,
    route_id: args.routeId,
    game_code: args.gameCode,
    advertiser_id: args.advertiserId,
    case_id: args.caseId,
    source_usage: "runtime_truth",
    source_record_ref: sourceRecordRef
  });
  const bundle = await repo.getLaunchJobBundle(view.jobId);
  return { jobId: view.jobId, created: true, bundle };
}

function statusesByNode(bundle = {}) {
  return Object.fromEntries((bundle.nodes || []).map((node) => [node.node_key, node.status]));
}

function skillStatuses(bundle = {}) {
  return Object.fromEntries((bundle.skillRuns || []).map((run) => [run.skill_key, run.status]));
}

function evidenceRefs(bundle = {}) {
  return (bundle.evidence || []).map((item) => ({
    artifactId: item.artifact_id,
    artifactType: item.artifact_type,
    contentHash: item.content_hash
  }));
}

export function summarizeReadonlyReconcileExecution(bundle = {}) {
  const run = (bundle.skillRuns || [])
    .filter((item) => item.skill_key === "resource-live-readonly-reconcile")
    .at(-1);
  const evidencePresent = Boolean(run?.evidence_refs?.length) ||
    (bundle.evidence || []).some((item) => item.artifact_type === "baseline_resource_readonly_reconcile");
  return {
    executed: Boolean(run),
    status: run?.status || "not_run",
    evidencePresent,
    result: !run ? "not_run" : run.status === "blocked" ? "executed_blocked" : "executed"
  };
}

function externalReadonlyCoverage({ bundle, monitorPreflight }) {
  const skills = skillStatuses(bundle);
  const evidenceTypes = new Set((bundle.evidence || []).map((item) => item.artifact_type));
  const reconcile = summarizeReadonlyReconcileExecution(bundle);
  const baselineProbeIntegrated = reconcile.executed;
  return {
    qiankun: {
      accountIndexCalled: monitorPreflight.accountApiCalled === true,
      monitorIndexCalled: monitorPreflight.monitorListApiCalled === true,
      expectedMonitorId: monitorPreflight.resolvedMonitor?.monitorId || "",
      touchpointControlledPresent: monitorPreflight.resolvedMonitor?.touchpointUrlPresent === true,
      responseHashPresent: Boolean(monitorPreflight.monitorList?.responseHash)
    },
    oceanengine: {
      stdProjectListDuplicateCheck: evidenceTypes.has("std_project_duplicate_readonly") || skills["duplicate-check"] === "passed",
      dmpReadonlyGate: Boolean(skills["resource-verify-dmp-audience-package"]),
      eventReadonlyGate: Boolean(skills["resource-verify-event-asset"]),
      videoReadonlyGate: Boolean(skills["resource-verify-video-asset"]),
      baselineResourceProbeAdapterIntegrated: baselineProbeIntegrated,
      fullResourceProbeAdapterIntegrated: baselineProbeIntegrated,
      baselineResourceProbeExecution: reconcile,
      coverageGap: baselineProbeIntegrated
        ? ""
        : "Node 4 baseline resource readonly reconcile skill did not run."
    }
  };
}

function createReadinessFromBundle(bundle = {}) {
  const node = (bundle.nodes || []).find((item) => item.node_key === "std_project_draft_builder");
  return node?.output_summary?.createReadiness || {};
}

function nodeFiveRan(bundle = {}) {
  const skills = new Set((bundle.skillRuns || []).map((run) => run.skill_key));
  return ["payload-build", "payload-contract", "duplicate-check", "create-readiness"].every((key) => skills.has(key));
}

function classifyConclusion({ bundle, auditCounts }) {
  const readiness = createReadinessFromBundle(bundle);
  const blockers = Array.isArray(readiness.blockers) ? readiness.blockers : [];
  if (Number(auditCounts.platformActions || 0) > 0 || Number(auditCounts.launchConfirmations || 0) > 0 || Number(auditCounts.createdObjects || 0) > 0) {
    return "blocked_with_evidence";
  }
  if (blockers.length) return "blocked_with_evidence";
  const reconcile = summarizeReadonlyReconcileExecution(bundle);
  if (!reconcile.executed) return "mechanism_coverage_incomplete";
  return reconcile.status === "passed" ? "ready_for_single_create_task" : "blocked_with_evidence";
}

export async function runReadonlyReadiness({ repo = new PostgresRepository(), args, env = process.env, sourceRecordPrefix } = {}) {
  assertReadonlyReadinessInvocation({ args, env });
  const job = await createOrResolveReadonlyReadinessJob({ repo, args, ...(sourceRecordPrefix ? { sourceRecordPrefix } : {}) });
  const target = {
    routeId: job.bundle.job.route_id,
    gameCode: job.bundle.job.game_code,
    advertiserId: job.bundle.job.advertiser_id
  };
  const monitorPreflight = await runMonitorProvisionCommand({
    mode: "plan",
    repo,
    target,
    jobId: job.jobId
  });
  if (args.expectedMonitorId) {
    requireSame(monitorPreflight.resolvedMonitor?.monitorId, args.expectedMonitorId, "expected_monitor_id");
  }
  const view = await runJob(repo, job.jobId, {
    mode: "dry_run",
    allowReadonlyDependency: true
  });
  const bundle = await repo.getLaunchJobBundle(job.jobId);
  const auditCounts = await repo.getLaunchJobAuditCounts(job.jobId);
  const nodeStatuses = statusesByNode(bundle);
  const conclusion = classifyConclusion({ bundle, auditCounts });
  const summary = sanitizeForPublic({
    status: "completed",
    conclusion,
    jobId: job.jobId,
    jobCreated: job.created,
    sourceUsage: bundle.job.source_usage,
    target,
    monitorPreflight: {
      status: monitorPreflight.status,
      runStatus: monitorPreflight.runStatus,
      accountApiCalled: monitorPreflight.accountApiCalled === true,
      monitorListApiCalled: monitorPreflight.monitorListApiCalled === true,
      exactMatchCount: monitorPreflight.monitorList?.exactMatchCount || 0,
      expectedMonitorId: args.expectedMonitorId,
      resolvedMonitorId: monitorPreflight.resolvedMonitor?.monitorId || "",
      touchpointUrlPresent: monitorPreflight.resolvedMonitor?.touchpointUrlPresent === true,
      evidenceArtifactId: monitorPreflight.evidenceArtifactId || ""
    },
    workflow: {
      nodeCount: (bundle.nodes || []).length,
      nodeStatuses,
      nodeFiveRan: nodeFiveRan(bundle),
      skillRunCount: (bundle.skillRuns || []).length,
      draftId: bundle.draft?.draft_id || "",
      projectName: bundle.draft?.project_name || "",
      payloadHash: bundle.draft?.payload_hash || "",
      createReadiness: createReadinessFromBundle(bundle),
      prewriteGateStatus: view.prewriteGate?.status || ""
    },
    auditCounts,
    zeroPlatformWriteAudit: {
      launchConfirmations: Number(auditCounts.launchConfirmations || 0),
      platformActions: Number(auditCounts.platformActions || 0),
      createdObjects: Number(auditCounts.createdObjects || 0),
      passed: Number(auditCounts.launchConfirmations || 0) === 0 &&
        Number(auditCounts.platformActions || 0) === 0 &&
        Number(auditCounts.createdObjects || 0) === 0
    },
    externalReadonlyCoverage: externalReadonlyCoverage({ bundle, monitorPreflight }),
    evidenceRefs: evidenceRefs(bundle),
    mechanismObservations: (() => {
      const reconcile = summarizeReadonlyReconcileExecution(bundle);
      if (reconcile.status === "passed") return [];
      if (reconcile.executed) {
        return [{
          title: "Node 4 baseline readonly reconcile 已执行但受阻",
          evidence: "resource-live-readonly-reconcile 已记录运行结果；阻断原因以该 Skill 的 blockers 与 evidence 为准。",
          impact: "平台只读覆盖已实际执行，但目标账户资源仍未形成通过结论。",
          nextTask: "按该 Skill 的唯一阻断项处理权限、凭据或平台返回，再新建 fresh runtime job 复核。",
          boundary: "record_only_no_repair_in_current_task"
        }];
      }
      return [{
        title: "Node 4 baseline readonly reconcile 未执行",
        evidence: "resource-live-readonly-reconcile 在本 job 中无运行记录。",
        impact: "保底资产只读覆盖不完整，不得把当前 job 视为全资源已核验。",
        nextTask: "检查 Node 4 resource-live-readonly-reconcile 的权限、凭据或运行入口。",
        boundary: "record_only_no_repair_in_current_task"
      }];
    })(),
    rawRequestStored: false,
    rawResponseStored: false,
    rawPayloadStored: false
  });
  assertNoSensitiveLeak(summary);
  if (!summary.zeroPlatformWriteAudit.passed) throw new Error("zero_platform_write_audit_failed");
  return summary;
}

export async function runAwemeAuthorizationReadonlyReadiness({
  repo = new PostgresRepository(),
  args,
  env = process.env,
  sourceRecordPrefix
} = {}) {
  assertReadonlyReadinessInvocation({ args, env });
  if (args.scope !== "aweme_authorization") throw new Error("aweme_authorization_scope_required");
  const job = await createOrResolveReadonlyReadinessJob({
    repo,
    args,
    sourceRecordPrefix: sourceRecordPrefix || "workflow:readonly-readiness:aweme_authorization"
  });
  await runOe3WorkflowSkills({
    repo,
    jobId: job.jobId,
    mode: "aweme_auth_readonly",
    allowReadonlyDependency: true
  });
  const bundle = await repo.getLaunchJobBundle(job.jobId);
  const auditCounts = await repo.getLaunchJobAuditCounts(job.jobId);
  assertAwemeAuthorizationReadonlyBoundary({ bundle, auditCounts });
  const readiness = await repo.getAdvertiserAwemeAuthorizationReadiness({
    routeId: bundle.job.route_id,
    gameCode: bundle.job.game_code,
    advertiserId: bundle.job.advertiser_id
  });
  const summary = sanitizeForPublic(awemeAuthorizationReadinessOnly(readiness || {}));
  assertNoSensitiveLeak(summary);
  return summary;
}

async function main() {
  const args = parseReadonlyReadinessArgs();
  try {
    const summary = args.scope === "aweme_authorization"
      ? await runAwemeAuthorizationReadonlyReadiness({ args })
      : await runReadonlyReadiness({ args });
    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    const output = sanitizeForPublic({
      status: "failed",
      error: error.message || "readonly_readiness_failed",
      rawRequestStored: false,
      rawResponseStored: false,
      rawPayloadStored: false
    });
    assertNoSensitiveLeak(output);
    console.error(JSON.stringify(output, null, 2));
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
