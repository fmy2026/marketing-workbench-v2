import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import { createJob } from "../src/workflows/launchWorkflow.mjs";
import { buildExecutionPlanFromBundle } from "../src/workflows/executionPlan.mjs";
import { runMicroAppInstanceReadonlySkill } from "../src/workflows/skills/oe3/04-micro-app-instance-readiness.mjs";
import { normalizeResourceSkillResult } from "../src/workflows/skills/oe3/04-resource-action-registry.mjs";
import { assertNoSensitiveLeak, hashValue, sanitizeForPublic } from "../src/workflows/skills/oe3/00-index.mjs";

const TASK_ID = "TASK-MWBV2-OE3-MICRO-APP-INSTANCE-READONLY-1871922346964041";
const DEFAULTS = Object.freeze({
  routeId: "oceanengine_3_byte_mini_game",
  gameCode: "JSZC",
  advertiserId: "1871922346964041",
  caseId: "CASE-LEGACY-2E4217E20C9E26BFB648772C"
});

const FORBIDDEN_FLAGS = new Set([
  "execute",
  "execute-once",
  "allow-network-write",
  "network-write",
  "confirm",
  "refresh-token",
  "std-project-create"
]);

const FORBIDDEN_ENV_NAMES = [
  "MWBV2_OE_EXECUTION_CONFIRM",
  "MWBV2_OE_STD_PROJECT_CREATE_CONFIRM",
  "MWBV2_OE_TOKEN_REFRESH_CONFIRM"
];

function arg(name, fallback = "") {
  const prefix = `${name}=`;
  const item = process.argv.slice(2).find((value) => value === name || value.startsWith(prefix));
  if (!item) return fallback;
  if (item === name) return "true";
  return item.slice(prefix.length);
}

function flagNames() {
  return process.argv
    .slice(2)
    .filter((item) => item.startsWith("--"))
    .map((item) => item.slice(2).split("=")[0])
    .filter(Boolean);
}

function assertInvocation(args, env = process.env) {
  const forbiddenFlags = flagNames().filter((name) => FORBIDDEN_FLAGS.has(name));
  const forbiddenEnv = FORBIDDEN_ENV_NAMES.filter((name) => env[name]);
  const missing = [];
  if (!args.routeId) missing.push("route_id");
  if (!args.gameCode) missing.push("game_code");
  if (!args.advertiserId) missing.push("advertiser_id");
  if (!args.caseId) missing.push("case_id");
  if (args.routeId !== DEFAULTS.routeId) throw new Error("micro_app_readonly_route_not_supported");
  if (args.gameCode !== DEFAULTS.gameCode) throw new Error("micro_app_readonly_game_not_supported");
  if (!/^\d+$/.test(args.advertiserId)) throw new Error("invalid_advertiser_id");
  if (missing.length) throw new Error(`missing_required_fields:${missing.join(",")}`);
  if (forbiddenFlags.length) throw new Error(`forbidden_write_flags:${forbiddenFlags.join(",")}`);
  if (forbiddenEnv.length) throw new Error(`forbidden_confirmation_or_refresh_env:${forbiddenEnv.join(",")}`);
}

async function resolveFreshJob({ repo, args }) {
  if (args.jobId) {
    const bundle = await repo.getLaunchJobBundle(args.jobId);
    if (!bundle?.job) throw new Error("job_not_found");
    if (bundle.job.case_id !== args.caseId) throw new Error("case_id_mismatch");
    if (bundle.job.route_id !== args.routeId) throw new Error("route_id_mismatch");
    if (bundle.job.game_code !== args.gameCode) throw new Error("game_code_mismatch");
    if (bundle.job.advertiser_id !== args.advertiserId) throw new Error("advertiser_id_mismatch");
    if (bundle.job.source_usage !== "runtime_truth") throw new Error("job_not_runtime_truth");
    return { jobId: args.jobId, created: false };
  }
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

async function recordSkillRun({ repo, jobId, result }) {
  const normalized = normalizeResourceSkillResult({
    resourceType: "micro_app_instance",
    result
  });
  await repo.upsertLaunchSkillRun({
    skillRunId: `${jobId}-micro-app-instance-readonly-1`,
    jobId,
    nodeKey: "account_resource_prepare",
    skillKey: "micro-app-instance-readonly",
    attemptNo: 1,
    status: normalized.status === "passed" ? "passed" : "blocked",
    inputHash: hashValue({ jobId, skillKey: "micro-app-instance-readonly" }),
    outputSummary: sanitizeForPublic(normalized.outputSummary || {}),
    blockers: normalized.blockers || [],
    evidenceRefs: normalized.evidenceRefs || [],
    blockerCodes: normalized.blockers || [],
    moduleRef: "src/workflows/skills/oe3/04-micro-app-instance-readiness.mjs",
    sourceUsage: "runtime_truth"
  });
  return normalized;
}

async function savePlan({ repo, jobId }) {
  const bundle = await repo.getLaunchJobBundle(jobId);
  const plan = buildExecutionPlanFromBundle(bundle);
  await repo.upsertLaunchExecutionPlan(plan);
  return plan;
}

async function main() {
  const args = {
    routeId: arg("--route-id", DEFAULTS.routeId),
    gameCode: arg("--game-code", DEFAULTS.gameCode).toUpperCase(),
    advertiserId: arg("--advertiser-id", DEFAULTS.advertiserId),
    caseId: arg("--case-id", DEFAULTS.caseId),
    jobId: arg("--job-id", ""),
    sourceRecordRef: arg("--source-record-ref", TASK_ID)
  };
  assertInvocation(args);

  const repo = new PostgresRepository();
  const job = await resolveFreshJob({ repo, args });
  const bundle = await repo.getLaunchJobBundle(job.jobId);
  const result = await runMicroAppInstanceReadonlySkill({
    repo,
    bundle,
    allowReadonlyDependency: true
  });
  const normalized = await recordSkillRun({ repo, jobId: job.jobId, result });
  await repo.updateNodeRun(job.jobId, "account_resource_prepare", {
    status: normalized.status === "passed" ? "passed" : "blocked",
    summary: normalized.status === "passed"
      ? "micro_app_instance 目标账户 optimized_goal 只读回查通过。"
      : "micro_app_instance 目标账户 optimized_goal 只读回查未通过。",
    diagnosticLevel: normalized.status === "passed" ? "info" : "error",
    outputSummary: sanitizeForPublic({
      micro_app_instance: normalized.outputSummary,
      resource_scope_only: true,
      std_project_create_called: false
    }),
    evidenceRefs: normalized.evidenceRefs || []
  });
  const plan = await savePlan({ repo, jobId: job.jobId });
  await repo.updateJob(job.jobId, {
    status: normalized.status === "passed" ? "completed_micro_app_instance_ready" : "blocked_micro_app_instance",
    currentNode: "4"
  });
  const output = sanitizeForPublic({
    status: normalized.status,
    conclusion: normalized.status === "passed" ? "target_optimized_goal_eligible" : "target_readonly_blocked",
    jobId: job.jobId,
    jobCreated: job.created,
    blockers: normalized.blockers || [],
    defaultTargetSeen: normalized.outputSummary?.target_instance_id_present === true,
    defaultTargetReadbackVerified: normalized.outputSummary?.target_readback_verified === true,
    optimizedGoalStatus: normalized.outputSummary?.optimized_goal_readonly_status || "",
    objectiveFound: normalized.outputSummary?.objective_found === true,
    deepObjectiveFound: normalized.outputSummary?.deep_objective_found === true,
    node4ResourceReady: normalized.outputSummary?.node4_resource_ready === true,
    node5CreateTransportBlocked: normalized.outputSummary?.node5_create_transport_blocked === true,
    planStatus: plan.planStatus,
    planBlockers: plan.blockerCodes || [],
    noRealPlatformWrite: true,
    noTokenRefresh: true,
    rawResponseStored: false
  });
  assertNoSensitiveLeak(output);
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  process.exitCode = normalized.status === "passed" ? 0 : 1;
}

main().catch((error) => {
  process.stderr.write(`micro_app_instance_readonly_check_failed:${error.message}\n`);
  process.exitCode = 1;
});
