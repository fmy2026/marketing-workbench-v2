import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import { createJob, runJob } from "../src/workflows/launchWorkflow.mjs";

const repo = new PostgresRepository();
const cleanupJobIds = [];

async function createDraft(sourceRecordRef) {
  const view = await createJob(repo, {
    user_intent: "推广路线 oceanengine_3_byte_mini_game，游戏 JSZC，账户 1871922175825993",
    source_usage: "test_run",
    source_record_ref: sourceRecordRef
  });
  cleanupJobIds.push(view.jobId);
  return runJob(repo, view.jobId, { mode: "dry_run" });
}

function projectSeq(projectName) {
  const match = String(projectName || "").match(/_P(\d{2,})_(\d{8})$/);
  if (!match) throw new Error(`project sequence not found in ${projectName}`);
  return {
    seq: Number(match[1]),
    yyyymmdd: match[2]
  };
}

function assertNoSensitiveLeak(view) {
  const text = JSON.stringify(view);
  const forbidden = [
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
  ];
  const matched = forbidden.find((pattern) => pattern.test(text));
  if (matched) throw new Error(`sensitive API leak matched ${matched}`);
}

function assertPayloadContract(view) {
  const gaps = view.payloadContract?.gaps || [];
  const manifest = view.draft?.fields ? view.phases
    ?.flatMap((phase) => phase.nodes || [])
    ?.find((node) => node.id === "std_project_draft_builder")
    ?.outputSummary?.requestFieldManifest || {}
    : {};
  if (view.payloadContract.status === "blocked") {
    if (!gaps.length) throw new Error("blocked payload contract did not expose gaps");
    return {
      status: "blocked",
      dmpBlocked: gaps.some((gap) => gap.key === "dmp_custom_audience_ids")
    };
  }
  if (view.payloadContract.status !== "passed") {
    throw new Error(`unexpected payload contract status ${view.payloadContract.status}`);
  }
  if (manifest.dmpRetargetingTagsExcludePresent !== true) throw new Error("DMP retargeting_tags_exclude missing from manifest");
  if (manifest.dmpRetargetingTagsExcludeIntegerArray !== true) throw new Error("DMP retargeting_tags_exclude is not integer[]");
  return {
    status: "passed",
    dmpBlocked: false,
    dmpRetargetingTagsExcludeCount: manifest.dmpRetargetingTagsExcludeCount || 0
  };
}

try {
  const firstDraft = await createDraft(`smoke:api:first:${new Date().toISOString()}`);
  const secondDraft = await createDraft(`smoke:api:second:${new Date().toISOString()}`);

  const firstNodeCount = await repo.countNodeRuns(firstDraft.jobId);
  const secondNodeCount = await repo.countNodeRuns(secondDraft.jobId);
  const firstName = projectSeq(firstDraft.draft.projectName);
  const secondName = projectSeq(secondDraft.draft.projectName);
  const firstContract = assertPayloadContract(firstDraft);
  const secondContract = assertPayloadContract(secondDraft);

  if (firstNodeCount !== 7) throw new Error(`expected 7 node runs, got ${firstNodeCount}`);
  if (secondNodeCount !== 7) throw new Error(`expected 7 node runs, got ${secondNodeCount}`);
  if (!firstDraft.draft.projectName.includes("JSZC_HUNT_PAY7DROI")) throw new Error("project name style mismatch");
  if (!secondDraft.draft.projectName.includes("JSZC_HUNT_PAY7DROI")) throw new Error("project name style mismatch");
  if (firstName.yyyymmdd === "20260817" || secondName.yyyymmdd === "20260817") throw new Error("project name date is still fixed to seed date");
  if (!firstDraft.draft.payloadHash.startsWith("sha256:")) throw new Error("payload hash missing");
  if (!secondDraft.draft.payloadHash.startsWith("sha256:")) throw new Error("payload hash missing");
  if (firstDraft.touchpoint.status !== "stored_in_database") throw new Error("touchpoint status is not stored_in_database");
  if (!firstDraft.touchpoint.urlHash) throw new Error("touchpoint hash missing from API view");
  if (!["blocked", "locked"].includes(firstDraft.prewriteGate.status)) throw new Error("prewrite gate status missing");
  if ((firstDraft.skills?.runCount || 0) < 18) throw new Error("workflow skill runs were not recorded");
  if (firstDraft.execution?.objectIdPresent) throw new Error("dry_run returned created object");
  assertNoSensitiveLeak(firstDraft);
  assertNoSensitiveLeak(secondDraft);

  const firstBundle = await repo.getLaunchJobBundle(firstDraft.jobId);
  const secondBundle = await repo.getLaunchJobBundle(secondDraft.jobId);
  if (firstBundle.job.source_usage !== "test_run") throw new Error("first smoke job source_usage is not test_run");
  if (secondBundle.job.source_usage !== "test_run") throw new Error("second smoke job source_usage is not test_run");
  if (firstBundle.platformAction || secondBundle.platformAction) throw new Error("dry_run recorded platform action");
  if (firstBundle.createdObject || secondBundle.createdObject) throw new Error("dry_run recorded created object");

  console.log(JSON.stringify({
    firstJobId: firstDraft.jobId,
    secondJobId: secondDraft.jobId,
    firstNodeCount,
    secondNodeCount,
    firstProjectName: firstDraft.draft.projectName,
    secondProjectName: secondDraft.draft.projectName,
    firstProjectSeq: firstName.seq,
    secondProjectSeq: secondName.seq,
    firstPayloadHash: firstDraft.draft.payloadHash,
    secondPayloadHash: secondDraft.draft.payloadHash,
    firstSourceUsage: firstBundle.job.source_usage,
    secondSourceUsage: secondBundle.job.source_usage,
    touchpointStatus: firstDraft.touchpoint.status,
    touchpointHash: firstDraft.touchpoint.urlHash,
    payloadContract: firstContract,
    secondPayloadContract: secondContract,
    skillRunCount: firstDraft.skills?.runCount || 0,
    prewriteGateStatus: firstDraft.prewriteGate.status,
    cleanupPlanned: cleanupJobIds.length
  }, null, 2));
} finally {
  for (const jobId of cleanupJobIds.reverse()) {
    await repo.deleteTestJobCascade(jobId);
  }
}
