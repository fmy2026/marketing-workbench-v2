import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import { getJobView } from "../src/workflows/launchWorkflow.mjs";
import { assertNoSensitiveLeak } from "../src/workflows/skills/oe3/contracts.mjs";

function arg(name) {
  const inline = process.argv.find((item) => item.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.findIndex((item) => item === `--${name}`);
  return index >= 0 ? process.argv[index + 1] || "" : "";
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const jobId = arg("job-id");
if (!jobId) throw new Error("job_id_required");

const repo = new PostgresRepository();
const bundle = await repo.getLaunchJobBundle(jobId);
if (!bundle) throw new Error("job_not_found");
const view = await getJobView(repo, jobId);
const attempts = await repo.getCreateAttemptState(jobId);
const nodes = new Map((bundle.nodes || []).map((node) => [node.node_key, node]));
const draft = bundle.draft || null;
const manifest = draft?.payload_summary?.final_payload_manifest || {};

assert(["runtime_truth", "reference_only", "seed_source", "private_runtime", "test_run"].includes(bundle.job.source_usage), "invalid_source_usage");
assert(nodes.size === 7, "workflow_node_count_must_be_7");
assert(nodes.has("launch_intake"), "launch_intake_missing");
assert(nodes.has("std_project_create_executor"), "create_node_missing");
assert(nodes.has("readback_closer"), "readback_node_missing");
if (draft) {
  assert(draft.payload_hash?.startsWith("sha256:"), "draft_payload_hash_missing");
  assert(draft.payload_summary?.game_code === bundle.job.game_code, "draft_game_code_mismatch");
  assert(draft.payload_summary?.advertiser_id === bundle.job.advertiser_id, "draft_advertiser_id_mismatch");
  assert(draft.payload_summary?.platform_app_id === bundle.platformApp?.app_id, "draft_platform_app_id_mismatch");
  assert(manifest.advertiserIdStorageType === "string", "advertiser_id_storage_type_invalid");
}
if (attempts.createActionCount > 0) {
  assert(view.execution.retryAllowed === false, "create_attempt_must_disable_retry");
  assert(view.createReadiness?.hasSingleCreateAttempt === true, "create_attempt_not_exposed_in_readiness");
}
assertNoSensitiveLeak(view);

console.log(JSON.stringify({
  status: "passed",
  jobId,
  sourceUsage: bundle.job.source_usage,
  jobStatus: bundle.job.job_status,
  currentNode: bundle.job.current_node,
  nodeCount: nodes.size,
  draftPresent: Boolean(draft),
  projectName: draft?.project_name || "",
  payloadHashPresent: Boolean(draft?.payload_hash),
  platformAppIdPresent: Boolean(bundle.platformApp?.app_id),
  createActions: attempts.createActionCount,
  confirmations: attempts.confirmationCount,
  createdObjects: attempts.createdObjectCount,
  realReadbacks: attempts.realReadbackCount,
  retryAllowed: view.execution.retryAllowed === true
}, null, 2));
