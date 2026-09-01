import { readFile } from "node:fs/promises";
import {
  latestCaseJobId,
  progressPresentation,
  progressRefreshLabel,
  PROGRESS_REFRESH_INTERVAL_MS
} from "../frontend/workbench-progress.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const nodes = [
  { status: "passed" },
  { status: "waiting" },
  { status: "waiting" },
  { status: "waiting" },
  { status: "waiting" },
  { status: "waiting" },
  { status: "waiting" }
];
const credentialGate = {
  currentGate: "resolve_case_blocker",
  rootBlockerCodes: ["credential_required"],
  rootBlocker: { title: "平台只读凭据不可用" }
};

assert(PROGRESS_REFRESH_INTERVAL_MS === 1200, "progress_poll_interval_changed");
assert(
  progressPresentation({ nodes, caseGate: credentialGate }) === "进度 1 / 7 · 已暂停：平台只读凭据不可用",
  "credential_blocker_progress_copy_mismatch"
);
assert(
  progressPresentation({ nodes, busy: true }) === "进度 1 / 7 · 正在处理",
  "busy_progress_copy_mismatch"
);
assert(
  progressPresentation({
    nodes,
    confirmationPreview: { planId: "PLAN-1" },
    executionAvailability: { canExecuteOnce: true }
  }) === "进度 1 / 7 · 待确认",
  "confirmation_progress_copy_mismatch"
);
assert(
  progressPresentation({
    nodes,
    caseGate: { currentGate: "await_job_write_authorization", rootBlockerCodes: [], rootBlocker: { title: "无阻断" } },
    confirmationPreview: { planId: "PLAN-1" },
    executionAvailability: { canExecuteOnce: true }
  }) === "进度 1 / 7 · 待确认",
  "zero_blocker_must_not_render_paused"
);
assert(
  progressPresentation({ nodes: nodes.map(() => ({ status: "passed" })), caseGate: { currentGate: "first_std_project_create_completed" } }) === "进度 7 / 7 · 已完成",
  "completion_progress_copy_mismatch"
);
assert(
  progressPresentation({ nodes, viewOnly: true }) === "进度 1 / 7 · 历史 Job，只读查看",
  "history_progress_copy_mismatch"
);
assert(progressRefreshLabel({ hasJob: true }) === "刷新进度", "active_refresh_label_mismatch");
assert(progressRefreshLabel({ hasJob: true, viewOnly: true }) === "刷新历史", "history_refresh_label_mismatch");
assert(progressRefreshLabel({ hasJob: true, refreshing: true }) === "同步中…", "refreshing_label_mismatch");
assert(progressRefreshLabel({ hasJob: true, failed: true }) === "刷新失败，重试", "refresh_failure_label_mismatch");
assert(latestCaseJobId({ summary: { latest_job_id: "JOB-FRESH-2" } }) === "JOB-FRESH-2", "latest_case_job_missing");

const clientSource = await readFile(new URL("../frontend/app.js", import.meta.url), "utf8");
assert(clientSource.includes("refreshProgressFromButton"), "manual_progress_refresh_not_bound");
assert(clientSource.includes("withProgressPolling"), "command_progress_polling_missing");
assert(clientSource.includes("latestCaseJobId(caseView)"), "case_latest_job_switch_missing");

console.log(JSON.stringify({
  status: "passed",
  intervalMs: PROGRESS_REFRESH_INTERVAL_MS,
  latestJobSwitch: true,
  browserPersistence: false
}, null, 2));
