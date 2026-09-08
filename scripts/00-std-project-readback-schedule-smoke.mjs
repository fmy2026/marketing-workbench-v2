import {
  DEFAULT_STD_PROJECT_READBACK_DELAYS_MS,
  readbackStdProjectOnce
} from "../src/platforms/oceanengineStdProjectCreateExecutor.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const PROJECT_ID = "7680763113444425770";
const PROJECT_NAME = "JSZC_STD_READBACK_SCHEDULE_SMOKE";
const EXPECTED_SCHEDULE = [0, 3000, 5000, 8000, 10000];
const EXPECTED_WAIT_WINDOWS = [0, 3000, 2000, 3000, 2000];
const GUIDE_VIDEO_ID = "guide-video-smoke";
const VIDEO_IDS = ["video-smoke-1", "video-smoke-2"];
const VIDEO_COVER_IDS = ["video-cover-smoke-1", "video-cover-smoke-2"];

function bundle({ guideRequired = false, coverRequired = false } = {}) {
  return {
    job: {
      job_id: "JOB-STD-PROJECT-READBACK-SCHEDULE-SMOKE",
      advertiser_id: "1871922414575753"
    },
    account: {
      guide_video_required: guideRequired,
      video_cover_required: coverRequired
    },
    materialPack: {
      items: VIDEO_IDS.map((videoId, index) => ({
        item: { item_type: "video_asset", required: true, asset_id: `VIDEO-SMOKE-${index + 1}` },
        asset: { metadata: { video_id: videoId, video_cover_id: VIDEO_COVER_IDS[index] } }
      }))
    },
    resources: [
      {
        resource_type: "micro_app_instance",
        source_asset_id: "MICRO-APP-SMOKE",
        platform_resource_id: "7434750138926546994",
        visibility_status: "visible",
        readback_status: "readback_verified",
        metadata: {
          guide_video_readiness: {
          status: "passed",
          required: true,
          guide_video_id: GUIDE_VIDEO_ID,
          verified_by_job_id: "JOB-STD-PROJECT-READBACK-SCHEDULE-SMOKE",
          verified_instance_id: "7434750138926546994"
          }
        }
      },
      ...VIDEO_IDS.map((videoId, index) => ({
        resource_type: "video_asset",
        source_asset_id: `VIDEO-SMOKE-${index + 1}`,
        platform_resource_id: videoId,
        visibility_status: "visible",
        readback_status: "readback_verified",
        metadata: {}
      }))
    ],
    draft: {
      project_name: PROJECT_NAME
    },
    executionPlan: {
      plan_id: "PLAN-STD-PROJECT-READBACK-SCHEDULE-SMOKE",
      planned_actions: [{ action_type: "std_project_create" }]
    },
    platformAction: {
      action_status: "succeeded",
      object_id_present: true
    },
    createdObject: {
      object_id: PROJECT_ID,
      evidence_ref: "EV-STD-PROJECT-CREATE-SMOKE"
    }
  };
}

function jsonResponse(payload) {
  return {
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify(payload);
    }
  };
}

async function runScenario({
  matchAt = 0,
  mismatch = "",
  transportError = false,
  guideRequired = false,
  coverRequired = false,
  guideBindingMatch = true,
  coverBindingMatch = true
} = {}) {
  let now = 0;
  let listCallCount = 0;
  let materialCallCount = 0;
  const requestTimes = [];
  const waits = [];
  const readbackRecords = [];
  const planTransitions = [];
  const repo = {
    async getLaunchJobBundle() {
      return bundle({ guideRequired, coverRequired });
    },
    async markConfirmedStdProjectCreatePlanWaitingReadback({ jobId, planId }) {
      assert(jobId === bundle({ guideRequired, coverRequired }).job.job_id, "waiting_readback_job_binding_changed");
      assert(planId === bundle({ guideRequired, coverRequired }).executionPlan.plan_id, "waiting_readback_plan_binding_changed");
      planTransitions.push("waiting_readback");
      return { transitioned: planTransitions.length === 1 };
    },
    async consumeConfirmedStdProjectCreatePlanAfterReadback({ jobId, planId }) {
      assert(jobId === bundle({ guideRequired, coverRequired }).job.job_id, "consumed_job_binding_changed");
      assert(planId === bundle({ guideRequired, coverRequired }).executionPlan.plan_id, "consumed_plan_binding_changed");
      planTransitions.push("consumed");
      return { consumed: true };
    },
    async upsertEvidence() {},
    async upsertCreatedObject() {},
    async upsertReadbackRecord(record) {
      readbackRecords.push(record);
    }
  };
  const result = await readbackStdProjectOnce({
    repo,
    jobId: bundle({ guideRequired, coverRequired }).job.job_id,
    target: { grantSource: "test_fake_transport" },
    nowFn: () => now,
    sleepImpl: async (delayMs) => {
      waits.push(delayMs);
      now += delayMs;
    },
    fetchImpl: async (requestUrl) => {
      if (String(requestUrl).includes("/oc_project/material/get/")) {
        materialCallCount += 1;
        return jsonResponse({
          code: 0,
          request_id: `material-request-${materialCallCount}`,
          data: {
            video_material_list: VIDEO_IDS.map((videoId, index) => ({
              video_id: videoId,
              video_cover_id: coverBindingMatch || index > 0 ? VIDEO_COVER_IDS[index] : "different-video-cover",
              guide_video_id: guideBindingMatch || index > 0 ? GUIDE_VIDEO_ID : "different-guide-video"
            }))
          }
        });
      }
      listCallCount += 1;
      requestTimes.push(now);
      if (transportError) throw new Error("transport_error_for_smoke");
      const item = listCallCount === matchAt
        ? {
            project_id: mismatch === "id" ? "7680763113444425771" : PROJECT_ID,
            name: mismatch === "name" ? `${PROJECT_NAME}_OTHER` : PROJECT_NAME
          }
        : null;
      return jsonResponse({
        code: 0,
        request_id: `request-${listCallCount}`,
        data: { list: item ? [item] : [] }
      });
    }
  });
  return { result, listCallCount, materialCallCount, requestTimes, waits, readbackRecords, planTransitions };
}

assert(
  JSON.stringify(DEFAULT_STD_PROJECT_READBACK_DELAYS_MS) === JSON.stringify(EXPECTED_SCHEDULE),
  "default_readback_schedule_must_be_absolute_0_3_5_8_10"
);

const fifthMatch = await runScenario({ matchAt: 5 });
assert(fifthMatch.result.status === "readback_verified", "fifth_attempt_must_verify");
assert(fifthMatch.listCallCount === 5, "fifth_attempt_must_call_list_five_times");
assert(JSON.stringify(fifthMatch.requestTimes) === JSON.stringify(EXPECTED_SCHEDULE), "list_request_times_must_use_absolute_elapsed_schedule");
assert(JSON.stringify(fifthMatch.waits) === JSON.stringify(EXPECTED_WAIT_WINDOWS), "wait_windows_must_not_accumulate_to_26_seconds");
assert(JSON.stringify(fifthMatch.planTransitions) === JSON.stringify(["waiting_readback", "consumed"]), "verified_plan_must_transition_ready_waiting_consumed");
assert(fifthMatch.readbackRecords.at(-1)?.readbackStatus === "readback_verified", "verified_readback_record_missing");

for (const matchAt of [1, 2, 3, 4]) {
  const earlyMatch = await runScenario({ matchAt });
  assert(earlyMatch.result.status === "readback_verified", `attempt_${matchAt}_must_verify`);
  assert(earlyMatch.listCallCount === matchAt, `attempt_${matchAt}_must_stop_after_match`);
  assert(
    JSON.stringify(earlyMatch.requestTimes) === JSON.stringify(EXPECTED_SCHEDULE.slice(0, matchAt)),
    `attempt_${matchAt}_must_not_issue_later_list_requests`
  );
}

const pending = await runScenario();
assert(pending.result.status === "not_found_or_mismatch", "five_misses_must_remain_pending");
assert(pending.listCallCount === 5, "five_misses_must_cap_list_calls_at_five");
assert(JSON.stringify(pending.requestTimes) === JSON.stringify(EXPECTED_SCHEDULE), "five_misses_must_keep_absolute_schedule");
assert(JSON.stringify(pending.planTransitions) === JSON.stringify(["waiting_readback"]), "pending_plan_must_not_be_consumed");
assert(pending.readbackRecords.at(-1)?.readbackStatus === "not_found_after_create", "five_misses_must_record_pending_readback");

const transport = await runScenario({ transportError: true });
assert(transport.result.status === "not_found_or_mismatch", "transport_errors_must_not_verify_or_create");
assert(transport.listCallCount === 5, "transport_errors_must_cap_list_calls_at_five");
assert(transport.result.readbackAttempts.every((attempt) => attempt.api_code === "transport_error"), "transport_errors_must_be_recorded_safely");

const idMismatch = await runScenario({ matchAt: 2, mismatch: "id" });
assert(idMismatch.result.status === "project_id_mismatch", "id_mismatch_must_stop_for_manual_review");
assert(idMismatch.listCallCount === 2, "id_mismatch_must_stop_immediately_after_visible_object");
assert(idMismatch.readbackRecords.at(-1)?.readbackStatus === "project_id_mismatch", "id_mismatch_record_missing");

const nameMismatch = await runScenario({ matchAt: 3, mismatch: "name" });
assert(nameMismatch.result.status === "project_name_mismatch", "name_mismatch_must_stop_for_manual_review");
assert(nameMismatch.listCallCount === 3, "name_mismatch_must_stop_immediately_after_visible_object");
assert(nameMismatch.readbackRecords.at(-1)?.readbackStatus === "project_name_mismatch", "name_mismatch_record_missing");

const guideMatched = await runScenario({ matchAt: 1, guideRequired: true, coverRequired: true });
assert(guideMatched.result.status === "readback_verified", "video_cover_and_guide_material_match_must_verify");
assert(guideMatched.materialCallCount === 1, "video_cover_and_guide_material_readback_must_call_once");
assert(guideMatched.result.guideVideoMaterialReadback?.matchedVideoCount === 2, "both_video_bindings_must_match");
assert(guideMatched.result.guideVideoMaterialReadback?.matchedCoverCount === 2, "both_video_cover_bindings_must_match");
assert(guideMatched.result.guideVideoMaterialReadback?.matchedGuideVideoCount === 2, "both_guide_video_bindings_must_match");

const guideMismatch = await runScenario({ matchAt: 1, guideRequired: true, coverRequired: true, guideBindingMatch: false });
assert(guideMismatch.result.status === "guide_video_material_pending", "guide_video_material_mismatch_must_remain_pending");
assert(guideMismatch.materialCallCount === 1, "guide_video_material_mismatch_must_not_retry_read");
assert(guideMismatch.readbackRecords.at(-1)?.readbackStatus === "guide_video_material_pending", "guide_video_pending_record_missing");
assert(JSON.stringify(guideMismatch.planTransitions) === JSON.stringify(["waiting_readback"]), "guide_video_pending_plan_must_not_be_consumed");

const coverMismatch = await runScenario({ matchAt: 1, guideRequired: true, coverRequired: true, coverBindingMatch: false });
assert(coverMismatch.result.status === "guide_video_material_pending", "video_cover_material_mismatch_must_remain_pending");
assert(coverMismatch.materialCallCount === 1, "video_cover_material_mismatch_must_not_retry_read");
assert(coverMismatch.result.guideVideoMaterialReadback?.matchedCoverCount === 1, "video_cover_mismatch_count_must_be_visible");
assert(coverMismatch.readbackRecords.at(-1)?.readbackStatus === "guide_video_material_pending", "video_cover_pending_record_missing");
assert(JSON.stringify(coverMismatch.planTransitions) === JSON.stringify(["waiting_readback"]), "video_cover_pending_plan_must_not_be_consumed");

console.log(JSON.stringify({
  status: "passed",
  absoluteScheduleMs: EXPECTED_SCHEDULE,
  maximumListCalls: 5,
  guideVideoMaterialCallsPerReadback: 1,
  createCalls: 0,
  verifiedLifecycle: fifthMatch.planTransitions,
  mismatchOutcomes: [idMismatch.result.status, nameMismatch.result.status, guideMismatch.result.status, coverMismatch.result.status]
}, null, 2));
