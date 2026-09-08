import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import {
  buildSingleResourceExecutionPlanFromBundle,
  compileAndSaveSingleResourceExecutionPlan
} from "../src/workflows/executionPlan.mjs";
import {
  EVENT_ASSET_CONFIRM_ENV,
  EVENT_ASSET_CONFIRM_VALUE
} from "../src/platforms/oceanengineEventAssetExecutor.mjs";
import {
  revokeEventAssetWriteScope
} from "../src/workflows/eventAssetExecutionScope.mjs";
import {
  runConfirmedResourceOrchestratorSkill
} from "../src/workflows/skills/oe3/05-confirmed-resource-orchestrator.mjs";
import {
  assertNoSensitiveLeak,
  hashValue,
  sanitizeForPublic
} from "../src/workflows/skills/oe3/00-contracts.mjs";

const rootDir = normalize(join(dirname(fileURLToPath(import.meta.url)), ".."));
const defaultProjectStatePath = join(rootDir, "project.state.json");

const DEFAULT_JOB_ID = "JOB-MWBV2-20260830140153-667873";
const DEFAULT_TASK_ID = "TASK-MWBV2-OE3-JSZC-EVENT-ASSET-API-CREATE-1871922434025472-20260830";

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

function planActions(plan = {}) {
  return plan.plannedActions || plan.planned_actions || [];
}

async function readProjectState(projectStatePath = defaultProjectStatePath) {
  return JSON.parse(await readFile(projectStatePath, "utf8"));
}

async function writeProjectStateScope({ projectStatePath = defaultProjectStatePath, plan, bundle }) {
  const state = await readProjectState(projectStatePath);
  state.guardrails ||= {};
  state.guardrails.platform_write_allowed = true;
  state.guardrails.platform_write_scope = {
    ...(plan.metadata?.execution_scope || {}),
    granted_by_task_id: DEFAULT_TASK_ID,
    granted_at: new Date().toISOString()
  };
  state.guardrails.last_event_asset_write_grant = {
    task_id: DEFAULT_TASK_ID,
    job_id: bundle.job.job_id,
    advertiser_id: bundle.job.advertiser_id,
    plan_id: plan.planId || plan.plan_id,
    plan_hash: plan.planHash || plan.plan_hash,
    allowed_actions: planActions(plan).map((item) => item.action_type),
    maximum_platform_calls: 1,
    retry_allowed: false
  };
  await writeFile(projectStatePath, `${JSON.stringify(state, null, 2)}\n`);
}

async function confirmPlan({ repo, bundle, plan, planHash }) {
  const actualHash = plan.planHash || plan.plan_hash || "";
  if (planHash !== actualHash) {
    throw new Error("confirmed_plan_hash_drift");
  }
  const confirmationId = `CONFIRM-${bundle.job.job_id}-EVENT-ASSET-V${plan.planVersion || plan.plan_version}`;
  await repo.upsertLaunchConfirmation({
    confirmationId,
    jobId: bundle.job.job_id,
    draftId: "",
    objectType: "event_asset",
    objectName: "JSZC event_asset single API create",
    payloadHash: actualHash,
    confirmationStatus: "confirmed_for_execution_plan",
    confirmVariable: `${EVENT_ASSET_CONFIRM_ENV}=${EVENT_ASSET_CONFIRM_VALUE}`,
    confirmedBy: "local_operator",
    planId: plan.planId || plan.plan_id,
    metadata: {
      plan_hash: actualHash,
      allowed_actions: planActions(plan).map((item) => item.action_type),
      retry_allowed: false,
      event_asset_single_resource_plan: true,
      confirmation_input_hash: hashValue({
        job_id: bundle.job.job_id,
        plan_id: plan.planId || plan.plan_id,
        plan_hash: actualHash
      })
    }
  });
  return confirmationId;
}

async function recordSkillRun({ repo, jobId, result }) {
  const outputSummary = sanitizeForPublic(result.outputSummary || result);
  await repo.upsertLaunchSkillRun({
    skillRunId: `${jobId}-confirmed-resource-orchestrator-event-asset-1`,
    jobId,
    nodeKey: "account_resource_prepare",
    skillKey: "confirmed-resource-orchestrator",
    attemptNo: 1,
    status: result.status === "passed" ? "passed" : "blocked",
    inputHash: hashValue({ jobId, skillKey: "confirmed-resource-orchestrator", resourceType: "event_asset" }),
    outputSummary,
    blockers: result.blockers || [],
    evidenceRefs: [],
    blockerCodes: result.blockers || [],
    moduleRef: "src/workflows/skills/oe3/05-confirmed-resource-orchestrator.mjs",
    sourceUsage: "runtime_truth"
  });
}

const args = {
  jobId: arg("job-id", DEFAULT_JOB_ID),
  planVersion: Number(arg("plan-version", "2")),
  confirmPlanHash: clean(arg("confirm-plan-hash", "")),
  projectStatePath: arg("project-state-path", defaultProjectStatePath),
  execute: hasFlag("execute"),
  confirm: hasFlag("confirm") || hasFlag("execute"),
  planOnly: hasFlag("plan-only") || (!hasFlag("confirm") && !hasFlag("execute"))
};

const repo = new PostgresRepository();
let output = {};
let revokeAfterExecute = false;
try {
  const { plan } = await compileAndSaveSingleResourceExecutionPlan({
    repo,
    jobId: args.jobId,
    planVersion: args.planVersion,
    resourceType: "event_asset",
    planningIntent: {
      mode: "single_resource_remediation",
      target_resource_type: "event_asset",
      case_id: "CASE-MWBV2-3CDAF4E9202381253E",
      latest_job_id: args.jobId,
      no_std_project_create: true,
      no_other_resource_actions: true
    }
  });
  let bundle = await repo.getLaunchJobBundle(args.jobId);
  const rebuilt = buildSingleResourceExecutionPlanFromBundle(bundle, {
    planVersion: args.planVersion,
    resourceType: "event_asset",
    planningIntent: plan.metadata?.planning_intent || {}
  });
  if (rebuilt.planHash !== plan.planHash) {
    throw new Error("saved_event_asset_plan_hash_not_reproducible");
  }

  let confirmationId = "";
  if (args.confirm || args.execute) {
    if (!args.confirmPlanHash) throw new Error("confirm_plan_hash_required");
    confirmationId = await confirmPlan({
      repo,
      bundle,
      plan,
      planHash: args.confirmPlanHash
    });
  }

  let orchestrator = null;
  if (args.execute) {
    await writeProjectStateScope({ projectStatePath: args.projectStatePath, plan, bundle });
    revokeAfterExecute = true;
    bundle = await repo.getLaunchJobBundle(args.jobId);
    orchestrator = await runConfirmedResourceOrchestratorSkill({
      repo,
      bundle,
      projectStatePath: args.projectStatePath
    });
    await recordSkillRun({ repo, jobId: args.jobId, result: orchestrator });
    await repo.updateJob(args.jobId, {
      status: orchestrator.status === "passed" ? "completed_event_asset_ready" : "blocked_event_asset",
      currentNode: "4"
    });
  }

  output = sanitizeForPublic({
    status: args.execute ? orchestrator.status : "plan_ready",
    mode: args.execute ? "execute" : args.confirm ? "confirmed_only" : "plan_only",
    job_id: args.jobId,
    plan_id: plan.planId,
    plan_version: plan.planVersion,
    plan_status: plan.planStatus,
    plan_hash: plan.planHash,
    action_types: planActions(plan).map((item) => item.action_type),
    blocker_codes: plan.blockerCodes || [],
    confirmation_id: confirmationId,
    orchestrator_status: orchestrator?.outputSummary?.orchestratorStatus || "",
    action_results: orchestrator?.outputSummary?.actionResults || [],
    platform_write_called: orchestrator?.outputSummary?.actionResults?.some((item) => item.platformWriteCalled === true) === true,
    next_action: args.execute
      ? (orchestrator.status === "passed" ? "fresh_run_recompile_downstream_unique_mechanism" : "keep_blocked_and_review_redacted_evidence")
      : `confirm hash then run: node scripts/04-event-asset-api-create-once.mjs --job-id ${args.jobId} --confirm-plan-hash ${plan.planHash} --execute`,
    retry_allowed: false,
    token_refresh_called: false,
    payload_persisted: false,
    response_persisted: false
  });
} finally {
  if (revokeAfterExecute) {
    await revokeEventAssetWriteScope(args.projectStatePath).catch(() => {});
  }
}

assertNoSensitiveLeak(output);
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
process.exit(output.status === "blocked" ? 1 : 0);
