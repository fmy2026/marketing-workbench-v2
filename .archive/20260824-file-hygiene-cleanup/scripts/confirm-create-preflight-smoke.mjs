import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";

const API = "http://127.0.0.1:3000/api";
const repo = new PostgresRepository();
const cleanupJobIds = [];

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

async function post(path, body) {
  const response = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`${path} failed: ${JSON.stringify(payload)}`);
  return payload;
}

try {
  const created = await post("/launch/jobs", {
    user_intent: "推广路线 oceanengine_3_byte_mini_game，游戏 JSZC，账户 1871922175825993",
    source_usage: "test_run",
    source_record_ref: `smoke:confirm-create-preflight:${new Date().toISOString()}`
  });
  cleanupJobIds.push(created.jobId);
  const dryRun = await post(`/launch/jobs/${created.jobId}/run`, { mode: "dry_run" });
  const confirm = await post(`/launch/jobs/${created.jobId}/confirm-create`, {
    payload_hash: dryRun.draft.payloadHash,
    confirmation_intent: "CREATE_ONE_STD_PROJECT"
  });
  const bundle = await repo.getLaunchJobBundle(created.jobId);
  const node6 = (bundle.nodes || []).find((node) => node.node_key === "std_project_create_executor") || {};
  const createSkill = (bundle.skillRuns || []).find((run) => run.skill_key === "create-once") || {};
  assert(bundle.job.source_usage === "test_run", "preflight job is not test_run");
  assert(confirm.executionGrant?.status === "blocked", "confirm-create should be blocked without execution_intent");
  assert(confirm.executionGrant?.createCalled === false, "confirm-create unexpectedly reported createCalled");
  assert((confirm.executionGrant?.blockers || []).includes("execution_intent_missing_or_invalid"), "confirm-create blocker mismatch");
  assert(node6.status === "locked", `node6 expected locked after dry_run, got ${node6.status}`);
  assert(!createSkill || createSkill.status !== "passed", "create skill unexpectedly passed");
  assert(!bundle.platformAction, "confirm preflight recorded platform action");
  assert(!bundle.createdObject, "confirm preflight recorded created object");
  assertNoSensitiveLeak({ dryRun, confirm, nodes: bundle.nodes, skills: bundle.skillRuns });
  console.log(JSON.stringify({
    status: "passed",
    jobId: created.jobId,
    sourceUsage: bundle.job.source_usage,
    node6Status: node6.status,
    confirmCreateStatus: confirm.executionGrant?.status,
    confirmCreateBlockers: confirm.executionGrant?.blockers || [],
    createCalled: confirm.executionGrant?.createCalled === true,
    realPlatformWriteCalled: false,
    platformActionRecorded: Boolean(bundle.platformAction),
    createdObjectRecorded: Boolean(bundle.createdObject),
    cleanupPlanned: cleanupJobIds.length
  }, null, 2));
} finally {
  for (const jobId of cleanupJobIds.reverse()) {
    await repo.deleteTestJobCascade(jobId);
  }
}
