import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import { ensureAvatarForTargetOnce } from "../src/platforms/oceanengineAvatarExecutor.mjs";
import { revokeAvatarWriteScope } from "../src/workflows/avatarExecutionScope.mjs";
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
  result = await ensureAvatarForTargetOnce({ repo, jobId });
} finally {
  await revokeAvatarWriteScope();
}
const output = sanitizeForPublic({ ...result, write_scope_revoked: true, token_refresh_called: false });
assertNoSensitiveLeak(output);
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
process.exit(["avatar_ready", "already_ready_noop"].includes(result.status) ? 0 : 1);
