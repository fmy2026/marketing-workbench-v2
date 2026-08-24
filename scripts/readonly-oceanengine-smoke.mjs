import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import { createJob, diagnoseJob, runJob } from "../src/workflows/launchWorkflow.mjs";

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

const created = await createJob(repo, {
  user_intent: "推广路线 oceanengine_3_byte_mini_game，游戏 JSZC，账户 1871922175825993"
});
await diagnoseJob(repo, created.jobId);
const draftReady = await runJob(repo, created.jobId);
const bundle = await repo.getLaunchJobBundle(draftReady.jobId);
const nodes = bundle.nodes || [];
const resources = bundle.resources || [];
const platformEvidence = (bundle.evidence || []).filter((item) => item.artifact_type === "platform_readonly_probe");

assert(nodes.length === 7, `expected 7 node runs, got ${nodes.length}`);
for (const node of nodes) {
  assert(node.output_summary && Object.keys(node.output_summary).length > 0, `node ${node.node_key} missing output_summary`);
}

assert(draftReady.platformReadonly.status !== "not_run", "platform readonly status not recorded");
assert(["blocked", "locked"].includes(draftReady.prewriteGate.status), "prewrite gate status missing");
assert(draftReady.prewriteGate.canCreate === false, "prewrite gate must not allow create");
if (draftReady.prewriteGate.status === "blocked") {
  assert((draftReady.prewriteGate.blockedResourceTypes || []).length > 0, "blocked resource types missing");
} else {
  assert((draftReady.prewriteGate.blockedResourceTypes || []).length === 0, "ready gate must not report blocked resources");
  assert((draftReady.prewriteGate.gaps || []).length === 0, "ready gate must have zero gaps");
  const createNode = nodes.find((node) => node.node_key === "std_project_create_executor");
  assert(createNode?.status === "locked", "std_project create executor must remain locked");
  assert(createNode?.output_summary?.createNodeStatus === "ready_for_single_create_confirmation", "create executor must be ready for single create confirmation");
}
assert(platformEvidence.length > 0 || draftReady.platformReadonly.credentialStatus === "credential_required", "platform readonly evidence missing");

for (const resource of resources) {
  assert(resource.metadata?.readonly_check, `resource ${resource.resource_type} missing readonly_check metadata`);
}

assertNoSensitiveLeak(draftReady);
assertNoSensitiveLeak(bundle.nodes);
assertNoSensitiveLeak(bundle.evidence);

console.log(JSON.stringify({
  jobId: draftReady.jobId,
  projectName: draftReady.draft.projectName,
  platformReadonlyStatus: draftReady.platformReadonly.status,
  credentialStatus: draftReady.platformReadonly.credentialStatus,
  prewriteGateStatus: draftReady.prewriteGate.status,
  blockedResourceTypes: draftReady.prewriteGate.blockedResourceTypes,
  platformEvidenceCount: platformEvidence.length,
  nodeOutputCount: nodes.filter((node) => node.output_summary && Object.keys(node.output_summary).length > 0).length
}, null, 2));
