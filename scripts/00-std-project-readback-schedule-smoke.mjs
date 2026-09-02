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

function bundle() {
  return {
    job: {
      job_id: "JOB-STD-PROJECT-READBACK-SCHEDULE-SMOKE",
      advertiser_id: "1871922414575753"
    },
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
    status: 200,
    async text() {
      return JSON.stringify(payload);
    }
  };
}

async function runScenario({ matchAt = 0, mismatch = "", transportError = false } = {}) {
  let now = 0;
  let listCallCount = 0;
  const requestTimes = [];
  const waits = [];
  const readbackRecords = [];
  const planTransitions = [];
  const repo = {
    async getLaunchJobBundle() {
      return bundle();
    },
    async markConfirmedStdProjectCreatePlanWaitingReadback({ jobId, planId }) {
      assert(jobId === bundle().job.job_id, "waiting_readback_job_binding_changed");
      assert(planId === bundle().executionPlan.plan_id, "waiting_readback_plan_binding_changed");
      planTransitions.push("waiting_readback");
      return { transitioned: planTransitions.length === 1 };
    },
    async consumeConfirmedStdProjectCreatePlanAfterReadback({ jobId, planId }) {
      assert(jobId === bundle().job.job_id, "consumed_job_binding_changed");
      assert(planId === bundle().executionPlan.plan_id, "consumed_plan_binding_changed");
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
    jobId: bundle().job.job_id,
    target: { grantSource: "test_fake_transport" },
    nowFn: () => now,
    sleepImpl: async (delayMs) => {
      waits.push(delayMs);
      now += delayMs;
    },
    fetchImpl: async () => {
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
  return { result, listCallCount, requestTimes, waits, readbackRecords, planTransitions };
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

console.log(JSON.stringify({
  status: "passed",
  absoluteScheduleMs: EXPECTED_SCHEDULE,
  maximumListCalls: 5,
  createCalls: 0,
  verifiedLifecycle: fifthMatch.planTransitions,
  mismatchOutcomes: [idMismatch.result.status, nameMismatch.result.status]
}, null, 2));
