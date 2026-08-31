import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import {
  compileAndSaveSingleResourceExecutionPlan
} from "../src/workflows/executionPlan.mjs";
import {
  runEventChainReadonlySkill
} from "../src/workflows/skills/oe3/04-event-chain-readiness.mjs";
import {
  assertNoSensitiveLeak,
  sanitizeForPublic
} from "../src/workflows/skills/oe3/00-contracts.mjs";
import {
  syncEventAssetAccountProvisionContract
} from "../src/workflows/skills/oe3/04-event-asset-account-contract.mjs";

const FORBIDDEN_FLAGS = new Set([
  "execute", "confirm", "confirmation-intent", "allow-network-write", "network-write", "refresh-token", "mock", "mock-ready"
]);
const FORBIDDEN_ENV_NAMES = [
  "MWBV2_OE_EXECUTION_CONFIRM",
  "MWBV2_OE_STD_PROJECT_CREATE_CONFIRM",
  "MWBV2_OE_TOKEN_REFRESH_CONFIRM",
  "MWBV2_MONITOR_CREATE_CONFIRM"
];

function arg(name) {
  const inline = process.argv.find((item) => item.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.findIndex((item) => item === `--${name}`);
  return index >= 0 ? process.argv[index + 1] || "" : "";
}

function flags() {
  return process.argv.filter((item) => item.startsWith("--")).map((item) => item.slice(2).split("=")[0]);
}

function clean(value) {
  return String(value ?? "").trim();
}

function assertInvocation({ jobId }) {
  if (!clean(jobId)) throw new Error("job_id_required");
  const forbiddenFlags = flags().filter((flag) => FORBIDDEN_FLAGS.has(flag));
  if (forbiddenFlags.length) throw new Error(`forbidden_write_or_mock_flags:${forbiddenFlags.join(",")}`);
  const forbiddenEnv = FORBIDDEN_ENV_NAMES.filter((name) => process.env[name]);
  if (forbiddenEnv.length) throw new Error(`forbidden_confirmation_or_refresh_env:${forbiddenEnv.join(",")}`);
}

const jobId = arg("job-id");
assertInvocation({ jobId });

const repo = new PostgresRepository();
const initialBundle = await repo.getLaunchJobBundle(jobId);
if (!initialBundle?.job) throw new Error("job_not_found");
if (initialBundle.job.source_usage !== "runtime_truth") throw new Error("job_not_runtime_truth");
const summary = await repo.getWorkflowCaseSummary(initialBundle.job.case_id);
if (summary?.lifecycle_status !== "active" || summary?.latest_job_id !== jobId) throw new Error("event_asset_contract_requires_active_latest_case_job");
if (summary?.root_blocker_codes?.[0] !== "event_asset_provision_not_plan_eligible") {
  throw new Error("event_asset_contract_root_blocker_required");
}

const readonly = await runEventChainReadonlySkill({
  repo,
  bundle: initialBundle,
  allowReadonlyDependency: true
});
const refreshedBundle = await repo.getLaunchJobBundle(jobId);
const contract = await syncEventAssetAccountProvisionContract({ repo, bundle: refreshedBundle });
let plan = null;
if (contract.status === "ready_for_plan") {
  const latestPlan = await repo.getLatestLaunchExecutionPlan(jobId);
  const planVersion = Number(latestPlan?.plan_version || 0) + 1;
  const compiled = await compileAndSaveSingleResourceExecutionPlan({
    repo,
    jobId,
    planVersion,
    resourceType: "event_asset",
    planningIntent: {
      mode: "account_contract_readonly_remediation",
      target_resource_type: "event_asset",
      no_std_project_create: true,
      no_other_resource_actions: true,
      no_confirmation_or_execution: true
    }
  });
  plan = compiled.stored || compiled.plan;
}
const auditCounts = await repo.getLaunchJobAuditCounts(jobId);
const output = sanitizeForPublic({
  status: contract.status,
  readonlyStatus: readonly.status,
  blockers: contract.blockers || readonly.blockers || [],
  accountContractStored: contract.outputSummary?.accountContractStored === true,
  plan: plan ? {
    planId: plan.plan_id || plan.planId,
    planKind: plan.plan_kind || plan.planKind,
    planStatus: plan.plan_status || plan.planStatus,
    actionTypes: (plan.planned_actions || plan.plannedActions || []).map((action) => action.action_type),
    maximumPlatformCalls: Number(plan.metadata?.execution_scope?.maximum_platform_calls || 0),
    retryAllowed: plan.metadata?.execution_scope?.retry_allowed === true
  } : null,
  audit: {
    launchConfirmations: Number(auditCounts.launchConfirmations || 0),
    platformActions: Number(auditCounts.platformActions || 0),
    createdObjects: Number(auditCounts.createdObjects || 0)
  },
  platformWriteCalled: false,
  rawRequestStored: false,
  rawResponseStored: false
});
assertNoSensitiveLeak(output);
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
