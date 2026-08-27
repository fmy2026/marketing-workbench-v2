import { fileURLToPath } from "node:url";
import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import { summarizeDmpPushPlans } from "../src/platforms/oceanengineDmpExecutor.mjs";
import { assertNoSensitiveLeak, sanitizeForPublic } from "../src/workflows/skills/oe3/00-contracts.mjs";

const FORBIDDEN_FLAGS = new Set([
  "execute",
  "push",
  "write",
  "allow-network-write",
  "confirm",
  "confirmation-intent",
  "confirm-variable-value"
]);

const FORBIDDEN_ENV_NAMES = [
  "MWBV2_OE_DMP_PUSH_CONFIRM",
  "MWBV2_OE_EXECUTION_CONFIRM",
  "MWBV2_OE_STD_PROJECT_CREATE_CONFIRM"
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

export function parseDmpPushPlanArgs(argv = process.argv.slice(2)) {
  return {
    jobId: argValue(argv, "job-id"),
    flags: flagNames(argv)
  };
}

export function assertDryRunOnly({ args, env = process.env } = {}) {
  if (!args.jobId) throw new Error("missing_required_field:job_id");
  if (!/^JOB-[A-Za-z0-9_-]+$/.test(args.jobId)) throw new Error("invalid_job_id");
  const forbiddenFlags = args.flags.filter((name) => FORBIDDEN_FLAGS.has(name));
  const forbiddenEnv = FORBIDDEN_ENV_NAMES.filter((name) => env[name]);
  if (forbiddenFlags.length) throw new Error(`forbidden_write_flags:${forbiddenFlags.join(",")}`);
  if (forbiddenEnv.length) throw new Error(`forbidden_confirmation_env:${forbiddenEnv.join(",")}`);
}

export async function runDmpPushPlanReport({ repo = new PostgresRepository(), args, env = process.env } = {}) {
  assertDryRunOnly({ args, env });
  const plans = await repo.getDmpPackagePushPlans(args.jobId);
  const summary = sanitizeForPublic({
    status: "completed",
    jobId: args.jobId,
    ...summarizeDmpPushPlans(plans || []),
    pushPlanIds: (plans || []).map((plan) => plan.push_plan_id),
    planStatuses: (plans || []).map((plan) => plan.plan_status),
    noPlatformWriteCalled: true,
    rawRequestStored: false,
    rawResponseStored: false
  });
  assertNoSensitiveLeak(summary);
  return summary;
}

async function main() {
  const args = parseDmpPushPlanArgs();
  try {
    const summary = await runDmpPushPlanReport({ args });
    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    const output = sanitizeForPublic({
      status: "failed",
      error: error.message || "dmp_push_plan_report_failed",
      noPlatformWriteCalled: true,
      rawRequestStored: false,
      rawResponseStored: false
    });
    assertNoSensitiveLeak(output);
    console.error(JSON.stringify(output, null, 2));
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
