import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import { createJob } from "../src/workflows/launchWorkflow.mjs";
import { runOe3WorkflowSkills, assertNoSensitiveLeak } from "../src/workflows/skills/oe3/index.mjs";

const TARGET = Object.freeze({
  routeId: "oceanengine_3_byte_mini_game",
  gameCode: "JSZC",
  advertiserId: "1871922175825993"
});

function arg(name, fallback = "") {
  const inline = process.argv.find((item) => item.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.findIndex((item) => item === `--${name}`);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

async function resolveJob(repo) {
  const jobId = arg("job-id", process.env.MWBV2_TARGET_JOB_ID || "");
  if (jobId) return { jobId, cleanupAfterRun: false };
  if (!hasFlag("create-job")) return { jobId: await repo.latestJobId(), cleanupAfterRun: false };
  const sourceUsage = hasFlag("runtime-truth") ? "runtime_truth" : "test_run";
  const view = await createJob(repo, {
    user_intent: `推广路线 ${TARGET.routeId}，游戏 ${TARGET.gameCode}，账户 ${TARGET.advertiserId}`,
    route_id: TARGET.routeId,
    game_code: TARGET.gameCode,
    advertiser_id: TARGET.advertiserId,
    source_usage: sourceUsage,
    source_record_ref: `oe3-workflow-cli:${new Date().toISOString()}`
  });
  return { jobId: view.jobId, cleanupAfterRun: sourceUsage === "test_run" };
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
  const summary = {
    ...result.summary,
    cleanupPlanned: cleanupAfterRun
  };
  assertNoSensitiveLeak(summary);
  console.log(JSON.stringify(summary, null, 2));
} finally {
  if (cleanupAfterRun) {
    await repo.deleteTestJobCascade(jobId);
  }
}
