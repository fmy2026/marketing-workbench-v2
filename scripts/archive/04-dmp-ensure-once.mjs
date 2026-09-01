import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import { ensureDmpBaselineForTargetOnce } from "../src/platforms/oceanengineDmpExecutor.mjs";
import { revokeDmpWriteScope } from "../src/workflows/dmpExecutionScope.mjs";
import { assertNoSensitiveLeak, sanitizeForPublic } from "../src/workflows/skills/oe3/00-contracts.mjs";

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
let result;
try {
  result = await ensureDmpBaselineForTargetOnce({ repo, jobId });
} finally {
  await revokeDmpWriteScope();
}
const output = sanitizeForPublic({ ...result, write_scope_revoked: true, token_refresh_called: false });
assertNoSensitiveLeak(output);
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
process.exit(result.status === "dmp_ready" ? 0 : 1);
