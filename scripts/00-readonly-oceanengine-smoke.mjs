import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import { createJob, resolveReadonlyDependencyForRun, runJob } from "../src/workflows/launchWorkflow.mjs";
import { readonlyPermissionState } from "../src/workflows/skills/oe3/00-readonly-permission.mjs";
import { assertNoSensitiveLeak } from "../src/workflows/skills/oe3/00-contracts.mjs";

const repo = new PostgresRepository();
const cleanupJobIds = [];
const permissionStateDir = await mkdtemp(join(tmpdir(), "mwbv2-readonly-permission-"));
const permissionStatePath = join(permissionStateDir, "project.state.json");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  assertNoSensitiveLeak({
    touchpoint_url_present: true,
    touchpoint_url_hash: "sha256:smoke",
    touchpoint_url_status: "ready",
    monitor_touchpoint_url_hash: "sha256:smoke"
  });
  let rawTouchpointKeyRejected = false;
  try {
    assertNoSensitiveLeak({ touchpoint_url: "https://example.invalid/not-persisted" });
  } catch (error) {
    rawTouchpointKeyRejected = error instanceof Error && error.message === "sensitive_summary_leak_detected";
  }
  assert(rawTouchpointKeyRejected, "raw_touchpoint_url_key_must_remain_forbidden");

  await writeFile(permissionStatePath, JSON.stringify({
    guardrails: { real_platform_dependency_allowed: true }
  }));
  assert(resolveReadonlyDependencyForRun({ projectStatePath: permissionStatePath }) === true, "omitted_readonly_permission_must_inherit_guardrail");
  assert(resolveReadonlyDependencyForRun({ projectStatePath: permissionStatePath, allowReadonlyDependency: false }) === false, "explicit_readonly_rejection_must_win");
  assert(readonlyPermissionState({ allowReadonlyDependency: false, projectStatePath: permissionStatePath }).allowed === false, "explicit_readonly_rejection_must_not_fall_back_to_guardrail");

  const created = await createJob(repo, {
    user_intent: "推广路线 oceanengine_3_byte_mini_game，游戏 JSZC，账户 1871922175825993",
    source_usage: "test_run",
    source_record_ref: "smoke:readonly"
  });
  cleanupJobIds.push(created.jobId);
  const draftReady = await runJob(repo, created.jobId, {
    mode: "dry_run",
    allowReadonlyDependency: false
  });
  const bundle = await repo.getLaunchJobBundle(draftReady.jobId);
  const nodes = bundle.nodes || [];
  const skillRuns = bundle.skillRuns || [];
  const dmpSkill = skillRuns.find((run) => run.skill_key === "resource-verify-dmp-audience-package");
  const duplicateSkill = skillRuns.find((run) => run.skill_key === "duplicate-check");
  const dmpEvidence = (bundle.evidence || []).filter((item) => /^dmp_/u.test(item.artifact_type || ""));
  const dmpNodeSummary = nodes.find((node) => node.node_key === "account_resource_prepare")
    ?.output_summary?.checks?.find((item) => item.resourceType === "dmp_audience_package") || {};

  assert(nodes.length === 7, `expected 7 node runs, got ${nodes.length}`);
  assert(bundle.job.source_usage === "test_run", "readonly smoke job source_usage is not test_run");
  assert(dmpSkill, "DMP readonly skill run missing");
  assert(duplicateSkill?.status === "blocked", "explicit_readonly_rejection_must_block_duplicate_check");
  assert((duplicateSkill.blockers || []).includes("readonly_permission_required"), "duplicate_check_must_report_explicit_readonly_rejection");
  assert(["passed", "blocked"].includes(dmpSkill.status), `unexpected DMP skill status ${dmpSkill.status}`);
  assert(dmpNodeSummary.resourceType === "dmp_audience_package", "DMP node summary missing");
  assert(dmpNodeSummary.payloadField === "audience.retargeting_tags_exclude", "DMP payload field mismatch");
  assert(bundle.job.source_usage === "test_run" || dmpEvidence.length > 0 || (dmpSkill.evidence_refs || []).length > 0, "DMP readonly evidence missing");
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
  await rm(permissionStateDir, { recursive: true, force: true });
}
