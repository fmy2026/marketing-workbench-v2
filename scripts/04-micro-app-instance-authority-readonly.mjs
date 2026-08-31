import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import { runMicroAppInstanceAuthorityReadonlySkill } from "../src/workflows/skills/oe3/04-event-chain-readiness.mjs";
import { assertNoSensitiveLeak, sanitizeForPublic } from "../src/workflows/skills/oe3/00-contracts.mjs";

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

function clean(value) {
  return String(value ?? "").trim();
}

function assertInvocation({ jobId }) {
  if (!clean(jobId)) throw new Error("job_id_required");
  const forbiddenFlags = process.argv.filter((item) => item.startsWith("--"))
    .map((item) => item.slice(2).split("=")[0])
    .filter((flag) => FORBIDDEN_FLAGS.has(flag));
  if (forbiddenFlags.length) throw new Error(`forbidden_write_or_mock_flags:${forbiddenFlags.join(",")}`);
  const forbiddenEnv = FORBIDDEN_ENV_NAMES.filter((name) => process.env[name]);
  if (forbiddenEnv.length) throw new Error(`forbidden_confirmation_or_refresh_env:${forbiddenEnv.join(",")}`);
}

const jobId = arg("job-id");
assertInvocation({ jobId });

const repo = new PostgresRepository();
const bundle = await repo.getLaunchJobBundle(jobId);
if (!bundle?.job) throw new Error("job_not_found");
if (bundle.job.source_usage !== "runtime_truth") throw new Error("job_not_runtime_truth");
const summary = await repo.getWorkflowCaseSummary(bundle.job.case_id);
if (summary?.lifecycle_status !== "active" || summary?.latest_job_id !== jobId) {
  throw new Error("micro_app_instance_authority_requires_active_latest_case_job");
}
if (summary?.root_blocker_codes?.[0] !== "event_asset_provision_not_plan_eligible") {
  throw new Error("micro_app_instance_authority_root_blocker_required");
}

const result = await runMicroAppInstanceAuthorityReadonlySkill({
  repo,
  bundle,
  allowReadonlyDependency: true
});
const auditCounts = await repo.getLaunchJobAuditCounts(jobId);
const output = sanitizeForPublic({
  status: result.status,
  blockers: result.blockers || [],
  targetInstanceReadbackVerified: result.outputSummary?.targetInstanceReadbackVerified === true,
  objectiveFound: result.outputSummary?.objectiveFound === true,
  deepObjectiveFound: result.outputSummary?.deepObjectiveFound === true,
  optimizedGoalStatus: result.outputSummary?.optimizedGoalStatus || "not_called",
  requestIdPresent: result.outputSummary?.requestIdPresent === true,
  evidenceRef: result.outputSummary?.evidenceRef || "",
  audit: {
    launchConfirmations: Number(auditCounts.launchConfirmations || 0),
    platformActions: Number(auditCounts.platformActions || 0),
    createdObjects: Number(auditCounts.createdObjects || 0)
  },
  platformWriteCalled: false,
  tokenRefreshCalled: false,
  rawRequestStored: false,
  rawResponseStored: false
});
assertNoSensitiveLeak(output);
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
