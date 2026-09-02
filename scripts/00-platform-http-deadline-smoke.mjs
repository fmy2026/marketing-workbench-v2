import {
  fetchWithDeadline,
  isPlatformDeadlineError,
  PLATFORM_JSON_TIMEOUT_MS,
  PLATFORM_UPLOAD_TIMEOUT_MS,
  STD_PROJECT_READBACK_DEADLINE_MS
} from "../src/platforms/httpDeadline.mjs";
import { readbackStdProjectOnce } from "../src/platforms/oceanengineStdProjectCreateExecutor.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

let aborted = false;
const hangingFetch = async (_url, options = {}) => new Promise((_resolve, reject) => {
  options.signal?.addEventListener("abort", () => {
    aborted = options.signal.aborted;
    reject(options.signal.reason);
  }, { once: true });
});

let timedOut = null;
try {
  await fetchWithDeadline(hangingFetch, "https://example.invalid/hang", {}, { timeoutMs: 10 });
} catch (error) {
  timedOut = error;
}
assert(isPlatformDeadlineError(timedOut), "hanging_request_must_throw_platform_deadline_error");
assert(timedOut.code === "ETIMEDOUT", "timeout_code_must_be_stable");
assert(aborted === true, "timeout_must_abort_caller_fetch");

let successSignal;
await fetchWithDeadline(async (_url, options = {}) => {
  successSignal = options.signal;
  return { ok: true };
}, "https://example.invalid/fast", {}, { timeoutMs: 10 });
await new Promise((resolve) => setTimeout(resolve, 20));
assert(successSignal?.aborted === false, "successful_request_timer_must_be_cleared");

let now = 0;
let listCalls = 0;
const attempts = [];
const repo = {
  async getLaunchJobBundle() {
    return {
      job: { job_id: "JOB-HTTP-DEADLINE-SMOKE", advertiser_id: "1871922414575753" },
      draft: { project_name: "HTTP_DEADLINE_SMOKE" },
      executionPlan: { plan_id: "PLAN-HTTP-DEADLINE-SMOKE", planned_actions: [{ action_type: "std_project_create" }] },
      platformAction: { action_status: "succeeded", object_id_present: true },
      createdObject: { object_id: "123" }
    };
  },
  async markConfirmedStdProjectCreatePlanWaitingReadback() {},
  async consumeConfirmedStdProjectCreatePlanAfterReadback() {},
  async upsertEvidence() {},
  async upsertCreatedObject() {},
  async upsertReadbackRecord(record) { attempts.push(record); }
};
const readback = await readbackStdProjectOnce({
  repo,
  jobId: "JOB-HTTP-DEADLINE-SMOKE",
  target: { grantSource: "test_fake_transport" },
  readbackDelaysMs: [0, 10, 20, 30],
  readbackDeadlineMs: 25,
  nowFn: () => now,
  sleepImpl: async (delayMs) => { now += delayMs; },
  fetchImpl: async () => {
    listCalls += 1;
    return {
      status: 200,
      async text() { return JSON.stringify({ code: "0", data: { list: [] } }); }
    };
  }
});
assert(readback.status === "not_found_or_mismatch", "deadline_readback_must_remain_unverified");
assert(listCalls === 3, "readback_deadline_must_prevent_late_fourth_request");
assert(now <= 25, "readback_deadline_must_bound_total_elapsed_time");
assert(attempts.at(-1)?.readbackStatus === "not_found_after_create", "deadline_readback_must_write_safe_pending_record");

console.log(JSON.stringify({
  status: "passed",
  jsonTimeoutMs: PLATFORM_JSON_TIMEOUT_MS,
  uploadTimeoutMs: PLATFORM_UPLOAD_TIMEOUT_MS,
  stdProjectReadbackDeadlineMs: STD_PROJECT_READBACK_DEADLINE_MS,
  abortObserved: aborted,
  deadlineListCalls: listCalls
}, null, 2));
