import { readFile } from "node:fs/promises";
import {
  latestCaseJobId,
  progressPresentation,
  progressRefreshLabel,
  readonlyRecoveryGuidance,
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
    execution: {
      status: "started",
      latestDeliveryStatus: "rate_limited",
      deliveryCount: 1,
      maximumDeliveryCalls: 3
    }
  }) === "进度 1 / 7 · 平台限流，正在等待第 2/3 次错峰投递",
  "rate_limit_redelivery_progress_copy_mismatch"
);
const interruptedNodes = nodes.map((node, index) => index < 4 ? { ...node, status: "passed" } : node);
assert(
  progressPresentation({
    nodes: interruptedNodes,
    caseGate: {
      currentGate: "resolve_case_blocker",
      rootBlockerCodes: ["confirmed_resource_execution_interrupted"],
      rootBlocker: { title: "资源执行中断，等待只读恢复" }
    }
  }) === "进度 4 / 7 · 已暂停：资源执行中断，等待只读恢复",
  "interrupted_resource_progress_copy_mismatch"
);
const createdPendingReadbackNodes = nodes.map((node, index) => index < 6 ? { ...node, status: "passed" } : { ...node, status: "repairable" });
assert(
  progressPresentation({
    nodes: createdPendingReadbackNodes,
    caseGate: {
      currentGate: "run_readback_only",
      rootBlockerCodes: ["created_object_readback_pending"],
      rootBlocker: { title: "项目已创建，等待平台 API 可见" }
    }
  }) === "进度 6 / 7 · 已暂停：项目已创建，等待平台 API 可见",
  "created_pending_readback_must_render_six_of_seven_paused"
);
assert(
  progressPresentation({
    nodes: interruptedNodes,
    caseGate: {
      currentGate: "prepare_corrective_attempt",
      rootBlockerCodes: ["corrective_attempt_requires_new_payload_version"],
      rootBlocker: { title: "当前创建尝试失败，可重新准备" }
    }
  }) === "进度 4 / 7 · 已暂停：当前创建尝试失败，可重新准备",
  "corrective_attempt_progress_copy_mismatch"
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
const targetSharedGuidance = readonlyRecoveryGuidance({
  currentGate: "resolve_case_blocker",
  rootBlockerCodes: ["site_get_target_shared_blocked"]
});
assert(targetSharedGuidance?.message === "当前阻断：目标账户共享站点只读核验未完成。下一步：输入“重新只读准备”重新核验；不会确认或创建平台对象。", "target_shared_readonly_guidance_message_mismatch");
assert(targetSharedGuidance?.placeholder === "输入“重新只读准备”重新核验，或输入“查看状态”...", "target_shared_readonly_guidance_placeholder_mismatch");
assert(!targetSharedGuidance.message.includes("resolve_root_blocker:"), "target_shared_guidance_must_not_expose_internal_action_code");
assert(readonlyRecoveryGuidance({ currentGate: "resolve_case_blocker", rootBlockerCodes: ["credential_required"] }) === null, "unrelated_blocker_must_keep_existing_guidance");
assert(readonlyRecoveryGuidance({ currentGate: "resolve_case_blocker", rootBlockerCodes: ["guide_video_capability_probe_failed"] })?.message === "当前阻断：无法确认本账户的引导视频能力，请重新只读核验。", "guide_video_probe_guidance_message_mismatch");
assert(readonlyRecoveryGuidance({ currentGate: "resolve_case_blocker", rootBlockerCodes: ["guide_video_candidate_ambiguous"] })?.message === "当前阻断：检测到多个引导视频，需先确定唯一玩法。", "guide_video_ambiguous_guidance_message_mismatch");

const [htmlSource, clientSource, styleSource] = await Promise.all([
  readFile(new URL("../frontend/index.html", import.meta.url), "utf8"),
  readFile(new URL("../frontend/app.js", import.meta.url), "utf8"),
  readFile(new URL("../frontend/styles.css", import.meta.url), "utf8")
]);
assert(!htmlSource.includes('id="caseGate"'), "duplicate_case_gate_panel_still_present");
assert(!clientSource.includes("renderCaseGate"), "duplicate_case_gate_renderer_still_present");
assert(!styleSource.includes(".case-gate"), "duplicate_case_gate_styles_still_present");
assert(clientSource.includes("function operationalMessage()"), "left_conversation_gate_projection_missing");
assert(htmlSource.includes('id="progressText"'), "bottom_progress_text_removed");
assert(htmlSource.includes('id="progressRefreshButton"'), "bottom_progress_refresh_removed");
assert(clientSource.includes("refreshProgressFromButton"), "manual_progress_refresh_not_bound");
assert(clientSource.includes("withProgressPolling"), "command_progress_polling_missing");
assert(clientSource.includes("latestCaseJobId(caseView)"), "case_latest_job_switch_missing");
assert(clientSource.includes("已完成，无需继续执行"), "completed_gate_next_action_copy_missing");
assert(clientSource.includes("已完成，可输入“查看状态”"), "completed_gate_input_copy_missing");
assert(clientSource.includes("当前 Attempt 已失败并安全结束。输入“继续执行”可重新只读准备下一 Attempt"), "corrective_gate_operational_copy_missing");
assert(clientSource.includes("输入“继续执行”重新准备下一 Attempt，或输入“查看状态”"), "corrective_gate_input_copy_missing");
assert(clientSource.includes("readonlyRecoveryGuidance(gate)"), "target_shared_operational_guidance_not_rendered");
assert(clientSource.includes("readonlyRecovery.placeholder"), "target_shared_input_guidance_not_rendered");
assert(clientSource.includes("平台限流，正在等待第"), "rate_limit_operational_message_missing");

console.log(JSON.stringify({
  status: "passed",
  intervalMs: PROGRESS_REFRESH_INTERVAL_MS,
  latestJobSwitch: true,
  browserPersistence: false
}, null, 2));
