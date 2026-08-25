import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import { createJob, runJob } from "../src/workflows/launchWorkflow.mjs";

const TARGET = {
  routeId: "oceanengine_3_byte_mini_game",
  gameCode: "JSZC",
  advertiserId: "1871922175825993"
};
const repo = new PostgresRepository();
const cleanupJobIds = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function parseSequence(projectName) {
  const match = String(projectName || "").match(/_P(\d{2,})_\d{8}$/);
  if (!match) throw new Error("project_sequence_missing");
  return Number(match[1]);
}

async function createTestJob(label) {
  const view = await createJob(repo, {
    user_intent: `route_id=${TARGET.routeId} game_code=${TARGET.gameCode} advertiser_id=${TARGET.advertiserId}`,
    route_id: TARGET.routeId,
    game_code: TARGET.gameCode,
    advertiser_id: TARGET.advertiserId,
    source_usage: "test_run",
    source_record_ref: `test:runtime-reservations:${label}:${new Date().toISOString()}`
  });
  cleanupJobIds.push(view.jobId);
  return view.jobId;
}

try {
  const beforeRuntimeNames = await repo.getOccupiedProjectNames({
    routeId: TARGET.routeId,
    gameCode: TARGET.gameCode,
    advertiserId: TARGET.advertiserId
  });
  const [firstJobId, secondJobId] = await Promise.all([
    createTestJob("first"),
    createTestJob("second")
  ]);
  const [first, second] = await Promise.all([
    runJob(repo, firstJobId, { mode: "dry_run", mockReady: true }),
    runJob(repo, secondJobId, { mode: "dry_run", mockReady: true })
  ]);
  const rerun = await runJob(repo, firstJobId, { mode: "dry_run", mockReady: true });
  const afterRuntimeNames = await repo.getOccupiedProjectNames({
    routeId: TARGET.routeId,
    gameCode: TARGET.gameCode,
    advertiserId: TARGET.advertiserId
  });

  assert(first.draft.projectName !== second.draft.projectName, "concurrent_jobs_must_not_share_project_name");
  assert(parseSequence(first.draft.projectName) !== parseSequence(second.draft.projectName), "concurrent_jobs_must_not_share_project_sequence");
  assert(first.draft.projectName === rerun.draft.projectName, "same_job_must_reuse_project_name_reservation");
  assert(first.draft.payloadHash === rerun.draft.payloadHash, "same_job_payload_hash_must_be_stable");
  assert(JSON.stringify(beforeRuntimeNames) === JSON.stringify(afterRuntimeNames), "test_run_must_not_affect_runtime_project_occupancy");

  console.log(JSON.stringify({
    status: "passed",
    firstProjectName: first.draft.projectName,
    secondProjectName: second.draft.projectName,
    firstSequence: parseSequence(first.draft.projectName),
    secondSequence: parseSequence(second.draft.projectName),
    sameJobStable: true,
    testRunIsolatedFromRuntimeOccupancy: true,
    cleanupPlanned: cleanupJobIds.length
  }, null, 2));
} finally {
  for (const jobId of cleanupJobIds.reverse()) {
    await repo.deleteTestJobCascade(jobId);
  }
}
