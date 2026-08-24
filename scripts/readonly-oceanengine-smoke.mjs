import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import { createJob, runJob } from "../src/workflows/launchWorkflow.mjs";

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

try {
  const created = await createJob(repo, {
    user_intent: "推广路线 oceanengine_3_byte_mini_game，游戏 JSZC，账户 1871922175825993",
    source_usage: "test_run",
    source_record_ref: "smoke:readonly"
  });
  cleanupJobIds.push(created.jobId);
  const draftReady = await runJob(repo, created.jobId, { mode: "dry_run" });
  const bundle = await repo.getLaunchJobBundle(draftReady.jobId);
  const nodes = bundle.nodes || [];
  const skillRuns = bundle.skillRuns || [];
  const dmpSkill = skillRuns.find((run) => run.skill_key === "resource-verify-dmp-audience-package");
  const dmpEvidence = (bundle.evidence || []).filter((item) => item.artifact_type === "dmp_readonly_gate");
  const dmpNodeSummary = nodes.find((node) => node.node_key === "account_resource_prepare")
    ?.output_summary?.checks?.find((item) => item.resourceType === "dmp_audience_package") || {};

  assert(nodes.length === 7, `expected 7 node runs, got ${nodes.length}`);
  assert(bundle.job.source_usage === "test_run", "readonly smoke job source_usage is not test_run");
  assert(dmpSkill, "DMP readonly skill run missing");
  assert(["passed", "blocked"].includes(dmpSkill.status), `unexpected DMP skill status ${dmpSkill.status}`);
  assert(dmpNodeSummary.resourceType === "dmp_audience_package", "DMP node summary missing");
  assert(dmpNodeSummary.payloadField === "audience.retargeting_tags_exclude", "DMP payload field mismatch");
  assert(dmpEvidence.length > 0, "DMP readonly evidence missing");
  assert(draftReady.prewriteGate.canCreate === false, "prewrite gate must not allow create");
  assert(!bundle.platformAction, "readonly smoke recorded platform action");
  assert(!bundle.createdObject, "readonly smoke recorded created object");
  for (const node of nodes) {
    assert(node.output_summary && Object.keys(node.output_summary).length > 0, `node ${node.node_key} missing output_summary`);
  }

  assertNoSensitiveLeak(draftReady);
  assertNoSensitiveLeak(bundle.nodes);
  assertNoSensitiveLeak(bundle.evidence);
  assertNoSensitiveLeak(bundle.skillRuns);

  console.log(JSON.stringify({
    jobId: draftReady.jobId,
    sourceUsage: bundle.job.source_usage,
    projectName: draftReady.draft.projectName,
    dmpSkillStatus: dmpSkill.status,
    dmpReadonlyStatus: dmpSkill.output_summary?.readonlyStatus || "",
    dmpCustomAudienceIdCount: dmpSkill.output_summary?.dmpCustomAudienceIdCount || 0,
    prewriteGateStatus: draftReady.prewriteGate.status,
    blockedResourceTypes: draftReady.prewriteGate.blockedResourceTypes,
    dmpEvidenceCount: dmpEvidence.length,
    nodeOutputCount: nodes.filter((node) => node.output_summary && Object.keys(node.output_summary).length > 0).length,
    cleanupPlanned: cleanupJobIds.length
  }, null, 2));
} finally {
  for (const jobId of cleanupJobIds.reverse()) {
    await repo.deleteTestJobCascade(jobId);
  }
}
