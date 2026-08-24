import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import { createJob, diagnoseJob, runJob, readbackJob, confirmJob } from "../src/workflows/launchWorkflow.mjs";
import { evaluateStdProjectPayloadContract } from "../src/platforms/oceanengineStdProjectPayloadContract.mjs";

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
const confirmed = await confirmJob(repo, draftReady.jobId);
const closed = await readbackJob(repo, confirmed.jobId);
const bundle = await repo.getLaunchJobBundle(closed.jobId);
const touchpointVerification = await repo.getTouchpointVerification({
  routeId: bundle.job.route_id,
  gameCode: bundle.job.game_code,
  advertiserId: bundle.job.advertiser_id,
  monitorId: bundle.account.monitor_id
});
const contract = evaluateStdProjectPayloadContract({
  bundle,
  draft: bundle.draft,
  touchpointVerification
});

assert(touchpointVerification.touchpointUrlPresent, "touchpoint URL not present");
assert(touchpointVerification.urlHashMatches, "touchpoint URL hash mismatch");
assert(contract.status === "passed", "payload contract did not pass");
assert(contract.expectedPayloadHash === bundle.draft.payload_hash, "payload hash is not stable");
assert(closed.readback.objectName === closed.draft.projectName, "readback objectName does not come from draft projectName");
assert(closed.prewriteGate.canCreate === false, "prewrite gate must not allow real create");
assert(["blocked", "locked"].includes(closed.prewriteGate.status), "prewrite gate status missing");
assertNoSensitiveLeak(closed);

console.log(JSON.stringify({
  jobId: closed.jobId,
  projectName: closed.draft.projectName,
  payloadHash: closed.draft.payloadHash,
  touchpointStatus: closed.touchpoint.status,
  touchpointHash: closed.touchpoint.urlHash,
  payloadContractStatus: contract.status,
  prewriteGateStatus: closed.prewriteGate.status,
  gapCount: closed.prewriteGate.gaps.length
}, null, 2));
