import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import { createJob, diagnoseJob, runJob, confirmJob, readbackJob } from "../src/workflows/launchWorkflow.mjs";

const repo = new PostgresRepository();

async function createDraft() {
  const view = await createJob(repo, {
    user_intent: "推广路线 oceanengine_3_byte_mini_game，游戏 JSZC，账户 1871922175825993"
  });
  await diagnoseJob(repo, view.jobId);
  const draftReady = await runJob(repo, view.jobId);
  return draftReady;
}

async function closeDraft(jobId) {
  await confirmJob(repo, jobId);
  return readbackJob(repo, jobId);
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

const firstDraft = await createDraft();
const firstClosed = await closeDraft(firstDraft.jobId);
const secondDraft = await createDraft();
const secondClosed = await closeDraft(secondDraft.jobId);

const firstNodeCount = await repo.countNodeRuns(firstClosed.jobId);
const secondNodeCount = await repo.countNodeRuns(secondClosed.jobId);
const firstName = projectSeq(firstClosed.draft.projectName);
const secondName = projectSeq(secondClosed.draft.projectName);

if (firstNodeCount !== 7) throw new Error(`expected 7 node runs, got ${firstNodeCount}`);
if (secondNodeCount !== 7) throw new Error(`expected 7 node runs, got ${secondNodeCount}`);
if (!firstClosed.draft.projectName.includes("JSZC_HUNT_PAY7DROI")) throw new Error("project name style mismatch");
if (!secondClosed.draft.projectName.includes("JSZC_HUNT_PAY7DROI")) throw new Error("project name style mismatch");
if (firstName.yyyymmdd === "20260817") throw new Error("project name date is still fixed to seed date");
if (secondName.seq !== firstName.seq + 1) throw new Error(`expected sequence ${firstName.seq + 1}, got ${secondName.seq}`);
if (!firstClosed.draft.payloadHash.startsWith("sha256:")) throw new Error("payload hash missing");
if (!secondClosed.draft.payloadHash.startsWith("sha256:")) throw new Error("payload hash missing");
if (firstClosed.readback.objectName !== firstClosed.draft.projectName) throw new Error("readback object name does not match first draft project name");
if (secondClosed.readback.objectName !== secondClosed.draft.projectName) throw new Error("readback object name does not match second draft project name");
if (firstClosed.touchpoint.status !== "stored_in_database") throw new Error("touchpoint status is not stored_in_database");
if (!firstClosed.touchpoint.urlHash) throw new Error("touchpoint hash missing from API view");
if (firstClosed.payloadContract.status !== "passed") throw new Error("payload contract did not pass");
if (!["blocked", "locked"].includes(firstClosed.prewriteGate.status)) throw new Error("prewrite gate status missing");
assertNoSensitiveLeak(firstClosed);
assertNoSensitiveLeak(secondClosed);

console.log(JSON.stringify({
  firstJobId: firstClosed.jobId,
  secondJobId: secondClosed.jobId,
  firstNodeCount,
  secondNodeCount,
  firstProjectName: firstClosed.draft.projectName,
  secondProjectName: secondClosed.draft.projectName,
  firstPayloadHash: firstClosed.draft.payloadHash,
  secondPayloadHash: secondClosed.draft.payloadHash,
  firstReadbackObjectName: firstClosed.readback.objectName,
  secondReadbackObjectName: secondClosed.readback.objectName,
  touchpointStatus: firstClosed.touchpoint.status,
  touchpointHash: firstClosed.touchpoint.urlHash,
  payloadContractStatus: firstClosed.payloadContract.status,
  prewriteGateStatus: firstClosed.prewriteGate.status
}, null, 2));
