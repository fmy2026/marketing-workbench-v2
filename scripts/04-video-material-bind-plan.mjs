import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import { buildVideoMaterialPreparePlan } from "../src/platforms/oceanengineVideoMaterialExecutor.mjs";
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
if (process.argv.includes("--execute")) {
  console.error(JSON.stringify({ status: "blocked", blockers: ["video_material_bind_execute_requires_separate_single_write_task"] }, null, 2));
  process.exit(1);
}

const repo = new PostgresRepository();
const bundle = await repo.getLaunchJobBundle(jobId);
if (!bundle?.job) {
  console.error(JSON.stringify({ status: "blocked", blockers: ["job_not_found"] }, null, 2));
  process.exit(1);
}
const plan = buildVideoMaterialPreparePlan({ bundle });
const output = sanitizeForPublic({
  ...plan,
  status: plan.status,
  noRealPlatformWrite: true,
  tokenRefreshCalled: false
});
assertNoSensitiveLeak(output);
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
process.exit(0);
