import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import { createJob } from "../src/workflows/launchWorkflow.mjs";
import { runOe3WorkflowSkills, assertNoSensitiveLeak } from "../src/workflows/skills/oe3/00-index.mjs";

function arg(name, fallback = "") {
  const inline = process.argv.find((item) => item.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.findIndex((item) => item === `--${name}`);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

async function resolveJob(repo) {
  const jobId = arg("job-id");
  const createTestJob = hasFlag("create-test-job");
  if (jobId && createTestJob) throw new Error("job_id_and_create_test_job_are_mutually_exclusive");
  if (jobId) return { jobId, cleanupAfterRun: false };
  if (!createTestJob) throw new Error("job_id_or_create_test_job_required");

  const routeId = arg("route-id");
  const gameCode = arg("game-code").toUpperCase();
  const advertiserId = arg("advertiser-id");
  if (!routeId || !gameCode || !advertiserId) {
    throw new Error("create_test_job_requires_route_id_game_code_advertiser_id");
  }
  const view = await createJob(repo, {
    user_intent: `route_id=${routeId} game_code=${gameCode} advertiser_id=${advertiserId}`,
    route_id: routeId,
    game_code: gameCode,
    advertiser_id: advertiserId,
    source_usage: "test_run",
    source_record_ref: `oe3-workflow-cli:test:${new Date().toISOString()}`
  });
  return { jobId: view.jobId, cleanupAfterRun: true };
}

const repo = new PostgresRepository();
const mode = arg("mode", "dry_run");
const { jobId, cleanupAfterRun } = await resolveJob(repo);
try {
  const result = await runOe3WorkflowSkills({
    repo,
    jobId,
    mode,
    mockReady: hasFlag("mock-ready"),
    mockExecute: hasFlag("mock-execute")
  });
  const summary = { ...result.summary, cleanupPlanned: cleanupAfterRun };
  assertNoSensitiveLeak(summary);
  console.log(JSON.stringify(summary, null, 2));
} finally {
  if (cleanupAfterRun) await repo.deleteTestJobCascade(jobId);
}
