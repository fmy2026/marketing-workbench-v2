import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import { getJobView } from "../src/workflows/launchWorkflow.mjs";

const TARGET_JOB_ID = "JOB-MWBV2-20260824014546-851B76";
const TARGET_ROUTE_ID = "oceanengine_3_byte_mini_game";
const TARGET_GAME_CODE = "JSZC";
const TARGET_ADVERTISER_ID = "1871922175825993";

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
  return new Promise((resolve, reject) => {
    const child = spawn("psql", [
      "-X",
      "-d",
      "marketing_workbench_v2",
      "-t",
      "-A",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      String(sql).replace(/\s+/g, " ").trim()
    ], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(JSON.parse(stdout.trim() || "null"));
      else reject(new Error(stderr.trim() || `psql exited with ${code}`));
    });
  });
}

function sequenceFromName(name) {
  const match = String(name || "").match(/_P([0-9]{2,})_[0-9]{8}$/);
  return match ? Number(match[1]) : null;
}

const projectState = JSON.parse(readFileSync("project.state.json", "utf8"));
if (projectState.active_task) {
  assert(
    projectState.active_task.task_id === "TASK-MWBV2-RUNTIME-TEST-DATA-PURGE-AND-PSEQUENCE-CLEANUP",
    "project.state active_task does not point to runtime test data purge task"
  );
}

const db = await psqlJson(`
  WITH candidate_jobs AS (
    SELECT j.job_id
    FROM mwb.launch_jobs j
    WHERE (
        (
          j.source_usage = 'runtime_truth'
          AND j.job_id <> '${TARGET_JOB_ID}'
          AND j.source_record_ref = 'api:intake:97f20040f3d3d423'
        )
        OR j.source_usage = 'test_run'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM mwb.platform_actions pa
        WHERE pa.job_id = j.job_id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM mwb.created_objects co
        WHERE co.job_id = j.job_id
      )
  ),
  target_draft AS (
    SELECT d.project_name, d.payload_summary
    FROM mwb.launch_drafts d
    WHERE d.job_id = '${TARGET_JOB_ID}'
    ORDER BY d.created_at DESC
    LIMIT 1
  )
  SELECT jsonb_build_object(
    'candidateJobCountAfter', (SELECT count(*) FROM candidate_jobs),
    'candidateEvidenceCountAfter', (
      SELECT count(*)
      FROM mwb.evidence_artifacts e
      WHERE e.job_id IN (SELECT job_id FROM candidate_jobs)
    ),
    'candidateDraftCountAfter', (
      SELECT count(*)
      FROM mwb.launch_drafts d
      WHERE d.job_id IN (SELECT job_id FROM candidate_jobs)
    ),
    'candidateReadbackCountAfter', (
      SELECT count(*)
      FROM mwb.readback_records r
      WHERE r.job_id IN (SELECT job_id FROM candidate_jobs)
    ),
    'testRunNoActionObjectCountAfter', (
      SELECT count(*)
      FROM mwb.launch_jobs j
      WHERE j.source_usage = 'test_run'
        AND NOT EXISTS (
          SELECT 1
          FROM mwb.platform_actions pa
          WHERE pa.job_id = j.job_id
        )
        AND NOT EXISTS (
          SELECT 1
          FROM mwb.created_objects co
          WHERE co.job_id = j.job_id
        )
    ),
    'targetJob', (
      SELECT to_jsonb(j)
      FROM mwb.launch_jobs j
      WHERE j.job_id = '${TARGET_JOB_ID}'
    ),
    'targetDraftCount', (
      SELECT count(*)
      FROM mwb.launch_drafts
      WHERE job_id = '${TARGET_JOB_ID}'
    ),
    'targetNodeRunCount', (
      SELECT count(*)
      FROM mwb.launch_node_runs
      WHERE job_id = '${TARGET_JOB_ID}'
    ),
    'targetReadbackCount', (
      SELECT count(*)
      FROM mwb.readback_records
      WHERE job_id = '${TARGET_JOB_ID}'
    ),
    'targetEvidenceCount', (
      SELECT count(*)
      FROM mwb.evidence_artifacts
      WHERE job_id = '${TARGET_JOB_ID}'
    ),
    'targetPlatformActions', (
      SELECT count(*)
      FROM mwb.platform_actions
      WHERE job_id = '${TARGET_JOB_ID}'
    ),
    'targetCreatedObjects', (
      SELECT count(*)
      FROM mwb.created_objects
      WHERE job_id = '${TARGET_JOB_ID}'
    ),
    'targetProjectName', (
      SELECT project_name
      FROM target_draft
    ),
    'platformAppId', (
      SELECT app_id
      FROM mwb.game_platform_apps
      WHERE game_code = '${TARGET_GAME_CODE}'
        AND platform = 'oceanengine'
        AND app_type = 'byte_mini_game'
      LIMIT 1
    ),
    'targetDraftPlatformAppId', (
      SELECT payload_summary->>'platform_app_id'
      FROM target_draft
    ),
    'gamesAppIdColumnCount', (
      SELECT count(*)
      FROM information_schema.columns
      WHERE table_schema = 'mwb'
        AND table_name = 'games'
        AND column_name = 'app_id'
    ),
    'dimensionCounts', jsonb_build_object(
      'platform_routes', (SELECT count(*) FROM mwb.platform_routes),
      'games', (SELECT count(*) FROM mwb.games),
      'game_platform_apps', (SELECT count(*) FROM mwb.game_platform_apps),
      'advertiser_accounts', (SELECT count(*) FROM mwb.advertiser_accounts),
      'account_touchpoints', (SELECT count(*) FROM mwb.account_touchpoints),
      'game_route_defaults', (SELECT count(*) FROM mwb.game_route_defaults),
      'game_assets', (SELECT count(*) FROM mwb.game_assets),
      'material_packs', (SELECT count(*) FROM mwb.material_packs),
      'material_pack_items', (SELECT count(*) FROM mwb.material_pack_items),
      'account_resources', (SELECT count(*) FROM mwb.account_resources)
    )
  )::text;
`);

const latestJobId = await repo.latestJobId();
const occupiedNames = await repo.getOccupiedProjectNames({
  routeId: TARGET_ROUTE_ID,
  gameCode: TARGET_GAME_CODE,
  advertiserId: TARGET_ADVERTISER_ID
});
const targetView = await getJobView(repo, TARGET_JOB_ID);

assert(latestJobId === TARGET_JOB_ID, `latestJobId returned ${latestJobId}`);
assert(db.candidateJobCountAfter === 0, "historical candidate jobs remain");
assert(db.candidateEvidenceCountAfter === 0, "historical candidate evidence remains");
assert(db.candidateDraftCountAfter === 0, "historical candidate drafts remain");
assert(db.candidateReadbackCountAfter === 0, "historical candidate readbacks remain");
assert(db.testRunNoActionObjectCountAfter === 0, "test_run jobs without actions/objects remain");
assert(db.targetJob?.job_id === TARGET_JOB_ID, "target failed job missing");
assert(db.targetJob.source_usage === "runtime_truth", "target source_usage mismatch");
assert(db.targetJob.job_status === "failed_waiting_manual_review", "target job_status mismatch");
assert(db.targetJob.current_node === "7", "target current_node mismatch");
assert(db.targetDraftCount > 0, "target draft missing");
assert(db.targetNodeRunCount >= 7, "target node runs missing");
assert(db.targetReadbackCount > 0, "target readback missing");
assert(db.targetEvidenceCount > 0, "target evidence missing");
assert(db.targetPlatformActions === 1, "target platform action count mismatch");
assert(db.targetCreatedObjects === 0, "target created object count should be 0");
assert(db.gamesAppIdColumnCount === 0, "mwb.games.app_id still exists");
assert(Boolean(db.platformAppId), "game_platform_apps.app_id missing");
assert(db.targetDraftPlatformAppId === db.platformAppId, "target draft platform_app_id does not match game_platform_apps.app_id");
assert(Array.isArray(occupiedNames), "occupied project names result malformed");
assert(occupiedNames.includes(db.targetProjectName), "target project name missing from occupied names");
assert(!occupiedNames.some((name) => sequenceFromName(name) > sequenceFromName(db.targetProjectName)), "occupied names still include higher historical P sequence");
Object.entries(db.dimensionCounts || {}).forEach(([table, count]) => {
  assert(count > 0, `dimension truth table ${table} appears empty`);
});
assertNoSensitiveLeak(targetView);

console.log(JSON.stringify({
  status: "passed",
  latestJobId,
  candidateJobCountAfter: db.candidateJobCountAfter,
  candidateEvidenceCountAfter: db.candidateEvidenceCountAfter,
  testRunNoActionObjectCountAfter: db.testRunNoActionObjectCountAfter,
  targetJobStatus: db.targetJob.job_status,
  targetCurrentNode: db.targetJob.current_node,
  targetDraftCount: db.targetDraftCount,
  targetNodeRunCount: db.targetNodeRunCount,
  targetReadbackCount: db.targetReadbackCount,
  targetEvidenceCount: db.targetEvidenceCount,
  targetPlatformActions: db.targetPlatformActions,
  targetCreatedObjects: db.targetCreatedObjects,
  gamesAppIdColumnCount: db.gamesAppIdColumnCount,
  platformAppIdPresent: Boolean(db.platformAppId),
  occupiedProjectNamesCount: occupiedNames.length,
  highestOccupiedPSequence: Math.max(...occupiedNames.map(sequenceFromName).filter(Boolean)),
  targetPSequence: sequenceFromName(db.targetProjectName)
}, null, 2));
