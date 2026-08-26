import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import {
  EXECUTION_GRANT_CONFIRM_ENV,
  executeConfirmedLaunch
} from "../src/workflows/executeConfirmedLaunch.mjs";

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || "" : "";
}

const jobId = argValue("--job-id");
if (!jobId) {
  console.error(JSON.stringify({ status: "blocked", blockers: ["job_id_required"] }, null, 2));
  process.exit(1);
}

const repo = new PostgresRepository();
const result = await executeConfirmedLaunch({
  repo,
  jobId,
  grantSource: "cli_confirm",
  envConfirm: process.env[EXECUTION_GRANT_CONFIRM_ENV] || ""
});

console.log(JSON.stringify({
  status: result.executionGrant?.status || "unknown",
  jobId: result.jobId,
  headlineStatus: result.headline?.status || "",
  createReadinessStatus: result.createReadiness?.status || "",
  createCalled: result.executionGrant?.createCalled === true,
  retryAllowed: false,
  blockers: result.executionGrant?.blockers || result.createReadiness?.blockers || [],
  nextAction: result.headline?.nextAction || result.createReadiness?.nextAction || ""
}, null, 2));

if (result.executionGrant?.status === "blocked") process.exit(1);
