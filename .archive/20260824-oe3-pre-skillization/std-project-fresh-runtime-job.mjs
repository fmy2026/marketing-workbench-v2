import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import { createJob, runJob } from "../src/workflows/launchWorkflow.mjs";
import { runReadiness } from "./std-project-create-readiness-pack.mjs";

const LOCKED_OLD_JOB_ID = "JOB-MWBV2-20260824014546-851B76";
const TARGET = Object.freeze({
  routeId: "oceanengine_3_byte_mini_game",
  gameCode: "JSZC",
  advertiserId: "1871922175825993"
});

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

function nodeStatusMap(bundle = {}) {
  return Object.fromEntries((bundle.nodes || []).map((node) => [node.node_key, node.status]));
}

async function counts(jobId) {
  const bundle = await repo.getLaunchJobBundle(jobId);
  return {
    platformActions: bundle?.platformAction ? 1 : 0,
    createdObjects: bundle?.createdObject ? 1 : 0
  };
}

async function main() {
  const oldBundle = await repo.getLaunchJobBundle(LOCKED_OLD_JOB_ID);
  const oldCountsBefore = await counts(LOCKED_OLD_JOB_ID);
  assert(oldBundle?.job?.job_status === "failed_waiting_manual_review", "locked_old_job_status_mismatch");
  assert(oldCountsBefore.platformActions === 1, "locked_old_job_platform_actions_mismatch");
  assert(oldCountsBefore.createdObjects === 0, "locked_old_job_created_objects_mismatch");

  const created = await createJob(repo, {
    user_intent: `推广路线 ${TARGET.routeId}，游戏 ${TARGET.gameCode}，账户 ${TARGET.advertiserId}`,
    route_id: TARGET.routeId,
    game_code: TARGET.gameCode,
    advertiser_id: TARGET.advertiserId,
    source_usage: "runtime_truth",
    source_record_ref: `fresh-runtime-job:${new Date().toISOString()}`
  });
  const draftReady = await runJob(repo, created.jobId);
  const readiness = await runReadiness({ jobId: created.jobId });
  const freshBundle = await repo.getLaunchJobBundle(created.jobId);
  const freshCounts = await counts(created.jobId);
  const oldCountsAfter = await counts(LOCKED_OLD_JOB_ID);

  assert(created.jobId !== LOCKED_OLD_JOB_ID, "fresh_job_reused_locked_old_job");
  assert(freshBundle.job.source_usage === "runtime_truth", "fresh_job_source_usage_not_runtime_truth");
  assert(freshBundle.job.job_status === "draft_ready", "fresh_job_not_draft_ready");
  assert(freshBundle.job.current_node === "5", "fresh_job_current_node_not_5");
  assert(freshBundle.draft?.project_name, "fresh_job_draft_missing");
  assert(freshBundle.draft.project_name !== oldBundle.draft?.project_name, "fresh_job_reused_old_project_name");
  assert(readiness.status === "ready_for_user_create_confirmation", `fresh_readiness_not_ready:${readiness.status}`);
  assert(readiness.canCreateCurrentJob === true, "fresh_readiness_can_create_false");
  assert(freshCounts.platformActions === 0, "fresh_job_platform_actions_not_zero");
  assert(freshCounts.createdObjects === 0, "fresh_job_created_objects_not_zero");
  assert(oldCountsAfter.platformActions === 1, "old_job_platform_actions_changed");
  assert(oldCountsAfter.createdObjects === 0, "old_job_created_objects_changed");

  const result = {
    status: "passed",
    freshJobId: created.jobId,
    freshJobStatus: freshBundle.job.job_status,
    freshCurrentNode: freshBundle.job.current_node,
    freshProjectName: freshBundle.draft.project_name,
    freshPayloadHash: freshBundle.draft.payload_hash,
    freshDuplicateStatus: freshBundle.draft.duplicate_status,
    nodeStatuses: nodeStatusMap(freshBundle),
    createReadiness: {
      status: readiness.status,
      canCreateCurrentJob: readiness.canCreateCurrentJob,
      retryAllowed: readiness.retryAllowed,
      nextConfirmationRequired: readiness.nextConfirmationRequired,
      uniqueBlocker: readiness.uniqueBlocker,
      nextAction: readiness.nextAction,
      brandIndustryStatus: readiness.brandIndustryStatus,
      eventChainStatus: readiness.eventChainStatus,
      payloadContractStatus: readiness.payloadContractStatus,
      payloadHashStable: readiness.payloadHashStable,
      duplicateStatus: readiness.duplicateStatus
    },
    oldLockedJob: {
      jobId: LOCKED_OLD_JOB_ID,
      platformActions: oldCountsAfter.platformActions,
      createdObjects: oldCountsAfter.createdObjects
    },
    noPlatformWrite: true,
    noTokenRefresh: true,
    draftReadyViewStatus: draftReady.headline?.status || ""
  };
  assertNoSensitiveLeak(result);
  console.log(JSON.stringify(result, null, 2));
}

await main();
