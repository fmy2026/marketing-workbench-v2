import { PostgresRepository } from "../../src/repositories/postgresRepository.mjs";
import {
  analyzeJszcOfficialTwoJobForensic,
  HISTORICAL_ONEOFF_JOB_ID,
  P02_BASELINE_JOB_ID
} from "../../src/oneoff/jszcOfficialTwoJobForensic.mjs";

const FORBIDDEN_FLAGS = new Set([
  "execute",
  "create",
  "write",
  "confirm",
  "refresh-token",
  "live-readonly"
]);

const FORBIDDEN_ENV = [
  "MWBV2_OE_EXECUTION_CONFIRM",
  "MWBV2_OE_STD_PROJECT_CREATE_CONFIRM",
  "MWBV2_OE_HISTORICAL_TEMPLATE_CREATE_CONFIRM",
  "MWBV2_OE_TOKEN_REFRESH_CONFIRM"
];

function arg(name, fallback = "") {
  const prefix = `${name}=`;
  const item = process.argv.slice(2).find((value) => value === name || value.startsWith(prefix));
  if (!item) return fallback;
  return item === name ? "true" : item.slice(prefix.length);
}

function assertInvocation(env = process.env) {
  const flags = process.argv.slice(2)
    .filter((item) => item.startsWith("--"))
    .map((item) => item.slice(2).split("=")[0]);
  const forbiddenFlags = flags.filter((item) => FORBIDDEN_FLAGS.has(item));
  const forbiddenEnv = FORBIDDEN_ENV.filter((name) => env[name]);
  if (forbiddenFlags.length) throw new Error(`forbidden_mutating_or_live_flags:${forbiddenFlags.join(",")}`);
  if (forbiddenEnv.length) throw new Error(`forbidden_confirmation_or_refresh_env:${forbiddenEnv.join(",")}`);
}

async function main() {
  assertInvocation();
  const output = await analyzeJszcOfficialTwoJobForensic({
    repo: new PostgresRepository(),
    p02JobId: arg("--p02-job-id", P02_BASELINE_JOB_ID),
    historicalJobId: arg("--historical-job-id", HISTORICAL_ONEOFF_JOB_ID)
  });
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`jszc_official_two_job_forensic_failed:${error.message}\n`);
  process.exitCode = 1;
});
