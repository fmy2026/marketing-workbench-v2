import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import { readFileSync } from "node:fs";

const ALLOWED_TASK = "TASK-MWBV2-READONLY-RECONCILIATION-FRESH-RUNTIME-DRY-RUN";
const repo = new PostgresRepository();

function assertNoSensitiveLeak(value) {
  const text = JSON.stringify(value);
  [
    /touchpoint_url/i,
    /raw_payload/i,
    /raw_response/i,
    /tf-api\.3k\.com/i,
    /callback\/click/i,
    /\bcookie\b/i,
    /OCEANENGINE_ACCESS_TOKEN/i,
    /OCEANENGINE_REFRESH_TOKEN/i,
    /OCEANENGINE_APP_SECRET/i,
    /Access-Token/i,
    /Bearer\s+[A-Za-z0-9._-]{20,}/i
  ].forEach((pattern) => {
    if (pattern.test(text)) throw new Error(`sensitive leak matched ${pattern}`);
  });
}

const state = JSON.parse(readFileSync("project.state.json", "utf8"));
if (state.active_task?.task_id !== ALLOWED_TASK) {
  throw new Error(`runtime_test_data_purge_requires_active_task:${ALLOWED_TASK}`);
}

const before = await repo.listTestRunJobs();
const deleted = await repo.deleteAllTestRunJobsCascade();
const after = await repo.listTestRunJobs();
const summary = {
  status: after.length === 0 ? "passed" : "blocked",
  beforeCount: before.length,
  beforeSampleJobIds: before.slice(0, 20).map((job) => job.job_id),
  deletedCount: deleted.length,
  afterCount: after.length,
  runtimeTruthTouched: false,
  seedSourceTouched: false
};
assertNoSensitiveLeak(summary);
console.log(JSON.stringify(summary, null, 2));
