import { readFileSync } from "node:fs";
import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import { getJobView } from "../src/workflows/launchWorkflow.mjs";

const TARGET_JOB_ID = "JOB-MWBV2-20260824014546-851B76";
const repo = new PostgresRepository();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

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

async function psqlJson(sql) {
  const { spawn } = await import("node:child_process");
  return new Promise((resolve, reject) => {
    const child = spawn("psql", ["-X", "-d", "marketing_workbench_v2", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-c", sql.replace(/\s+/g, " ").trim()]);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => {
      if (code === 0) resolve(JSON.parse(stdout.trim() || "null"));
      else reject(new Error(stderr.trim() || `psql exited with ${code}`));
    });
  });
}

const projectState = JSON.parse(readFileSync("project.state.json", "utf8"));
if (projectState.active_task) {
  const taskText = readFileSync(projectState.active_task.task_ref, "utf8");
  assert(taskText.includes(`状态：${projectState.active_task.status}`), "project.state active_task status does not match task card");
}

const db = await psqlJson(`
  SELECT jsonb_build_object(
    'gamesAppIdColumnCount', (
      SELECT count(*)
      FROM information_schema.columns
      WHERE table_schema = 'mwb'
        AND table_name = 'games'
        AND column_name = 'app_id'
    ),
    'targetJob', (
      SELECT to_jsonb(j)
      FROM mwb.launch_jobs j
      WHERE j.job_id = '${TARGET_JOB_ID}'
    ),
    'nodeStatuses', (
      SELECT jsonb_object_agg(node_key, jsonb_build_object(
        'status', status,
        'output', output_summary->>'output',
        'readbackStatus', coalesce(output_summary->>'readbackStatus', output_summary->>'readback_status')
      ))
      FROM mwb.launch_node_runs
      WHERE job_id = '${TARGET_JOB_ID}'
    ),
    'platformActions', (
      SELECT count(*)
      FROM mwb.platform_actions
      WHERE job_id = '${TARGET_JOB_ID}'
    ),
    'createdObjects', (
      SELECT count(*)
      FROM mwb.created_objects
      WHERE job_id = '${TARGET_JOB_ID}'
    ),
    'notFoundReadbacks', (
      SELECT count(*)
      FROM mwb.readback_records
      WHERE job_id = '${TARGET_JOB_ID}'
        AND readback_status = 'not_found_or_mismatch'
    ),
    'testRunLatestCandidates', (
      SELECT count(*)
      FROM mwb.launch_jobs
      WHERE source_usage = 'test_run'
        AND job_id = (SELECT job_id FROM mwb.launch_jobs ORDER BY updated_at DESC LIMIT 1)
    ),
    'platformAppId', (
      SELECT app_id
      FROM mwb.game_platform_apps
      WHERE game_code = 'JSZC'
        AND platform = 'oceanengine'
        AND app_type = 'byte_mini_game'
      LIMIT 1
    ),
    'targetDraftPlatformAppId', (
      SELECT d.payload_summary->>'platform_app_id'
      FROM mwb.launch_drafts d
      WHERE d.job_id = '${TARGET_JOB_ID}'
      ORDER BY d.created_at DESC
      LIMIT 1
    ),
    'latestTestJob', (
      SELECT to_jsonb(j)
      FROM mwb.launch_jobs j
      WHERE j.source_usage = 'test_run'
      ORDER BY j.updated_at DESC, j.created_at DESC
      LIMIT 1
    ),
    'latestRuntimeJob', (
      SELECT to_jsonb(j)
      FROM mwb.launch_jobs j
      WHERE j.job_id = (SELECT job_id FROM mwb.launch_jobs ORDER BY updated_at DESC, created_at DESC LIMIT 1)
    )
  )::text;
`);

const latestJobId = await repo.latestJobId();
const targetView = await getJobView(repo, TARGET_JOB_ID);
const latestView = await getJobView(repo, latestJobId);
assert(db.gamesAppIdColumnCount === 0, "mwb.games.app_id still exists");
assert(db.targetJob.job_status === "failed_waiting_manual_review", "target job_status mismatch");
assert(db.targetJob.current_node === "7", "target current_node mismatch");
assert(db.nodeStatuses.std_project_create_executor.status === "failed", "node 6 is not failed");
assert(db.nodeStatuses.readback_closer.status === "failed", "node 7 is not failed");
assert(db.nodeStatuses.readback_closer.output === "readback_failed", "failed readback_closer output is not readback_failed");
assert(db.platformActions === 1, "target platform_actions count mismatch");
assert(db.createdObjects === 0, "target created_objects should be 0");
assert(db.notFoundReadbacks > 0, "target not_found_or_mismatch readback missing");
assert(db.targetDraftPlatformAppId === db.platformAppId, "payload_summary.platform_app_id does not match game_platform_apps.app_id");
assert(targetView.execution.retryAllowed === false, "target view retryAllowed must be false");
assert(Array.isArray(targetView.summaryFields) && targetView.summaryFields.length > 0, "summaryFields missing from target view");
assertNoSensitiveLeak(targetView);
assert(latestView.intake?.gameCode === "JSZC", "latest job view game_code mismatch");
assert(latestView.intake?.advertiserId === "1871922175825993", "latest job view advertiser mismatch");
assertNoSensitiveLeak(latestView);

const latestTest = db.latestTestJob;
if (latestTest?.job_id) {
  const testView = await getJobView(repo, latestTest.job_id);
  assert(testView.draft?.fields?.some((field) => field.label === "平台只读") || testView.draft, "test job view malformed");
  assert(latestTest.job_id !== latestJobId, "latestJobId returned a test_run job");
}

const code = [
  "src/workflows/launchWorkflow.mjs",
  "src/repositories/postgresRepository.mjs",
  "src/platforms/oceanengineStdProjectCreateExecutor.mjs"
].map((file) => readFileSync(file, "utf8")).join("\n");
assert(!/\bgame\.app_id\b/.test(code), "code still reads game.app_id");

console.log(JSON.stringify({
  status: "passed",
  latestJobId,
  latestJobStatus: latestView.headline?.status,
  latestCreateReadinessStatus: latestView.createReadiness?.status,
  targetJobStatus: db.targetJob.job_status,
  targetCurrentNode: db.targetJob.current_node,
  node6Status: db.nodeStatuses.std_project_create_executor.status,
  node7Status: db.nodeStatuses.readback_closer.status,
  node7Output: db.nodeStatuses.readback_closer.output,
  gamesAppIdColumnCount: db.gamesAppIdColumnCount,
  platformAppIdPresent: Boolean(db.platformAppId),
  platformActions: db.platformActions,
  createdObjects: db.createdObjects,
  retryAllowed: targetView.execution.retryAllowed
}, null, 2));
