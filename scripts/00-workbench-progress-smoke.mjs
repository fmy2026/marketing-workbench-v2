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
assert(readonlyRecoveryGuidance({ currentGate: "resolve_case_blocker", rootBlockerCodes: ["credential_required"] })?.placeholder === "输入“重新只读准备”或“查看状态”…", "unrelated_blocker_must_use_recovery_guidance");
const prewriteTransportGuidance = readonlyRecoveryGuidance({ currentGate: "resolve_case_blocker", rootBlockerCodes: ["readonly_transport_failed"] });
assert(prewriteTransportGuidance?.message.includes("当前阻断仍待处理"), "prewrite_transport_failure_must_keep_specific_blocker_guidance");
assert(prewriteTransportGuidance?.placeholder === "输入“重新只读准备”或“查看状态”…", "prewrite_transport_failure_must_offer_readonly_recovery");
const emptyVideoPlanGuidance = readonlyRecoveryGuidance({ currentGate: "resolve_case_blocker", rootBlockerCodes: ["video_bind_plan_empty"] });
assert(emptyVideoPlanGuidance?.message.includes("旧资源 Plan"), "empty_video_plan_guidance_missing");
assert(emptyVideoPlanGuidance?.placeholder === "输入“重新只读准备”或“查看状态”…", "empty_video_plan_recovery_missing");
const missingVideoMappingGuidance = readonlyRecoveryGuidance({ currentGate: "resolve_case_blocker", rootBlockerCodes: ["video_material_source_mapping_not_verified:VIDEO-1"] });
assert(missingVideoMappingGuidance?.message.includes("视频素材来源未能唯一核验"), "video_mapping_guidance_missing");
const brandFallbackGuidance = readonlyRecoveryGuidance({ currentGate: "resolve_case_blocker", rootBlockerCodes: ["brand_info_not_ready"] });
assert(brandFallbackGuidance?.message.includes("当前创建前合同"), "brand_contract_guidance_missing");
assert(!brandFallbackGuidance.message.includes("游戏维度保底候选"), "brand_guidance_must_not_name_stale_fallback");
assert(brandFallbackGuidance?.placeholder === "输入“重新只读准备”或“查看状态”…", "brand_fallback_placeholder_mismatch");
assert(!brandFallbackGuidance.placeholder.includes("继续执行"), "brand_fallback_placeholder_must_not_continue");
const brandConfirmationGuidance = readonlyRecoveryGuidance({ currentGate: "resolve_case_blocker", rootBlockerCodes: ["brand_info_confirmation"] });
assert(brandConfirmationGuidance?.message.includes("品牌创建前校验未通过"), "brand_confirmation_guidance_missing");
assert(brandConfirmationGuidance?.placeholder === "输入“重新只读准备”或“查看状态”…", "brand_confirmation_placeholder_mismatch");
assert(!brandConfirmationGuidance.placeholder.includes("继续执行"), "brand_confirmation_placeholder_must_not_continue");
const fieldShapeGuidance = readonlyRecoveryGuidance({ currentGate: "resolve_case_blocker", rootBlockerCodes: ["jszc_success_profile"] });
assert(fieldShapeGuidance?.message.includes("字段形态校验未通过"), "field_shape_contract_guidance_missing");
assert(fieldShapeGuidance?.placeholder === "输入“查看状态”…", "field_shape_contract_guidance_must_not_request_repeated_readonly");
const genericBlockerGuidance = readonlyRecoveryGuidance({ currentGate: "resolve_case_blocker", rootBlockerCodes: ["resource_contract_missing"] });
assert(genericBlockerGuidance?.placeholder === "输入“重新只读准备”或“查看状态”…", "generic_blocker_placeholder_mismatch");
const duplicateRateLimitGuidance = readonlyRecoveryGuidance({ currentGate: "resolve_case_blocker", rootBlockerCodes: ["duplicate_readonly_rate_limited"] });
assert(duplicateRateLimitGuidance?.message === "当前阻断：平台查重暂时限流，请稍后输入“重新只读准备”；不会确认或创建项目。", "duplicate_rate_limit_guidance_message_mismatch");
assert(duplicateRateLimitGuidance?.placeholder === "稍后输入“重新只读准备”或“查看状态”…", "duplicate_rate_limit_guidance_placeholder_mismatch");
assert(readonlyRecoveryGuidance({ currentGate: "resolve_case_blocker", rootBlockerCodes: ["guide_video_capability_probe_failed"] })?.message === "当前阻断：无法确认本账户的引导视频能力，请重新只读核验。", "guide_video_probe_guidance_message_mismatch");
assert(readonlyRecoveryGuidance({ currentGate: "resolve_case_blocker", rootBlockerCodes: ["guide_video_candidate_ambiguous"] })?.message === "当前阻断：检测到多个引导视频，需先确定唯一玩法。", "guide_video_ambiguous_guidance_message_mismatch");
const identityRecoveryBlockers = [
  "qiankun_account_identity_changed_since_plan",
  "qiankun_account_identity_preflight_failed",
  "monitor_fresh_readonly_contract_drift"
];
for (const blocker of identityRecoveryBlockers) {
  const guidance = readonlyRecoveryGuidance({ currentGate: "resolve_case_blocker", rootBlockerCodes: [blocker] });
  assert(guidance?.message === "账户监测身份已更新，旧 Plan 已失效；请输入“重新只读准备”。", `identity_recovery_message_mismatch:${blocker}`);
  assert(guidance?.placeholder === "输入“重新只读准备”或“查看状态”…", `identity_recovery_placeholder_mismatch:${blocker}`);
  assert(!guidance.placeholder.includes("继续执行"), `identity_recovery_placeholder_must_not_continue:${blocker}`);
  assert(guidance.message !== "流程状态正在更新，请刷新查看。", `identity_recovery_must_not_fall_back_to_refresh:${blocker}`);
}

const [htmlSource, clientSource, styleSource, workflowSource] = await Promise.all([
  readFile(new URL("../frontend/index.html", import.meta.url), "utf8"),
  readFile(new URL("../frontend/app.js", import.meta.url), "utf8"),
  readFile(new URL("../frontend/styles.css", import.meta.url), "utf8"),
  readFile(new URL("../src/workflows/launchWorkflow.mjs", import.meta.url), "utf8")
]);
assert(workflowSource.includes("duplicate_readonly_rate_limited"), "duplicate_rate_limit_root_blocker_copy_missing");
assert(workflowSource.includes("平台查重暂时限流"), "duplicate_rate_limit_root_blocker_title_missing");
assert(!htmlSource.includes('id="caseGate"'), "duplicate_case_gate_panel_still_present");
assert(!clientSource.includes("renderCaseGate"), "duplicate_case_gate_renderer_still_present");
assert(!styleSource.includes(".case-gate"), "duplicate_case_gate_styles_still_present");
assert(!htmlSource.includes('id="runState"'), "workflow_dynamic_run_state_must_be_removed");
assert(!clientSource.includes('getElementById("runState")'), "workflow_dynamic_run_state_renderer_must_be_removed");
assert(clientSource.includes("function operationalMessage()"), "left_conversation_gate_projection_missing");
assert(clientSource.includes("progressNarrative?.shortLabel || \"等待处理\""), "headline_must_use_compact_gate_status");
assert(htmlSource.includes('id="progressText"'), "bottom_progress_text_removed");
assert(htmlSource.includes('id="progressRefreshButton"'), "bottom_progress_refresh_removed");
assert(clientSource.includes("refreshProgressFromButton"), "manual_progress_refresh_not_bound");
assert(clientSource.includes("withProgressPolling"), "command_progress_polling_missing");
assert(clientSource.includes("latestCaseJobId(caseView)"), "case_latest_job_switch_missing");
assert(clientSource.includes("progressNarrative?.message"), "deterministic_progress_narrative_not_rendered");
assert(!clientSource.includes("当前 Gate：${gate.currentGate}"), "raw_gate_must_not_be_primary_conversation_copy");
assert(clientSource.includes("已完成，可输入“查看状态”"), "completed_gate_input_copy_missing");
assert(clientSource.includes("当前 Attempt 已失败并安全结束。输入“重新只读准备”可准备下一 Attempt"), "corrective_gate_operational_copy_missing");
assert(clientSource.includes("输入“重新只读准备”准备下一 Attempt，或输入“查看状态”"), "corrective_gate_input_copy_missing");
assert(!clientSource.includes("输入“继续执行”重新准备下一 Attempt"), "corrective_gate_legacy_input_copy_still_primary");
assert(clientSource.includes("readonlyRecoveryGuidance(gate)"), "target_shared_operational_guidance_not_rendered");
assert(clientSource.includes("readonlyRecovery.placeholder"), "target_shared_input_guidance_not_rendered");
assert(clientSource.includes('const recoveryButton = el("button", "conversation-preset", "重新只读准备")'), "readonly_recovery_button_missing");
assert(clientSource.includes('submitJobCommand("重新只读准备")'), "readonly_recovery_button_must_use_existing_text_command");
assert(clientSource.includes("平台限流，正在等待第"), "rate_limit_operational_message_missing");
assert(clientSource.includes("preview.targetEmptyBrandOmit.label"), "target_empty_brand_confirmation_label_missing");
assert(clientSource.includes('error?.status >= 500 || error?.message === "internal_error"'), "internal_error_ui_boundary_missing");
assert(clientSource.includes('“${stage || "服务处理"}”未完成；已刷新当前状态'), "internal_error_stage_copy_missing");
assert(clientSource.includes("诊断码：${diagnosticCode}"), "internal_error_diagnostic_code_missing");
assert(clientSource.includes("start_workflow_create_case"), "create_case_diagnostic_stage_missing");
assert(clientSource.includes("start_workflow_create_job"), "create_job_diagnostic_stage_missing");
assert(clientSource.includes("start_workflow_run_readonly"), "run_readonly_diagnostic_stage_missing");
assert(!clientSource.includes("本次处理未完成，请刷新后重试"), "legacy_internal_error_refresh_copy_still_present");
assert(!clientSource.includes('message("agent", `唯一阻断：${error.message}${owner}`);\n      return;'), "internal_error_must_not_render_as_root_blocker");
assert(clientSource.includes("freezeConfirmationSubmission"), "confirmation_submission_snapshot_helper_missing");
assert(clientSource.includes("activeConfirmationSubmission = submission"), "confirmation_submission_state_missing");
assert(clientSource.includes('button.textContent = "提交中…"'), "confirmation_button_local_busy_copy_missing");
assert(clientSource.includes("await submitJobCommand(submission.message, submission)"), "confirmation_submission_must_use_frozen_context");
assert(!clientSource.includes("setBusy(true);\n      try {\n        await submitJobCommand(preview.confirmationPhrase || \"确认创建\");"), "confirmation_button_must_not_redraw_before_submit");

console.log(JSON.stringify({
  status: "passed",
  intervalMs: PROGRESS_REFRESH_INTERVAL_MS,
  latestJobSwitch: true,
  browserPersistence: false
}, null, 2));
