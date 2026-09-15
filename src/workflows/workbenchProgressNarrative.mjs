function clean(value) {
  return String(value ?? "").trim();
}

function confirmationLabel(preview = null) {
  if (!preview) return "受控操作";
  if (preview.planKind === "monitor_bootstrap") return "创建 monitor";
  if (preview.planKind === "resource_prepare") return "准备资源";
  if (preview.planKind === "project_video_material_push") return "推送素材";
  if (preview.planKind === "project_video_append") return "追加视频";
  return "创建项目";
}

function blockerMessage(caseGate = {}) {
  const blocker = caseGate.rootBlocker || {};
  const title = clean(blocker.title) || "当前检查未通过";
  const reason = clean(blocker.reason);
  const next = clean(blocker.nextActionLabel);
  return `当前卡点：${title}。${reason}${next ? ` 下一步：${next}` : ""}`.trim();
}

/**
 * This is presentation only. Gate, blocker and next-action truth remain in
 * workflow_case_summary; callers must not use this result for state changes.
 */
export function presentWorkflowProgress({ caseGate = {}, confirmationPreview = null, isLatestCaseJob = false, progress = null } = {}) {
  if (!isLatestCaseJob) {
    return Object.freeze({ shortLabel: "历史运行，只读", message: "这是历史运行，只读查看；不会执行或创建。" });
  }
  const currentGate = clean(caseGate.currentGate || caseGate.current_gate);
  const append = clean(caseGate.operation) === "append_project_videos";
  const messages = {
    create_fresh_job: "已收到完整需求，正在建立本次流程。",
    run_monitor_readonly: "正在核对这个账户的监测配置，目前不会创建任何对象。",
    run_fresh_readiness: append
      ? "正在核验指定视频并准备追加计划，目前不会追加视频。"
      : "正在核对账户资源并准备创建草稿，目前不会创建项目。",
    run_project_video_append_readback: "正在检查已确认追加的视频是否已出现在目标项目；不会再次追加。",
    run_readback_only: "项目已创建，正在确认项目 ID 和名称；不会重复创建。",
    first_std_project_create_completed: "项目已通过平台回查，本次创建流程已完成。"
  };
  if (messages[currentGate]) {
    return Object.freeze({
      shortLabel: currentGate === "run_fresh_readiness" ? "待只读核验" : "流程进行中",
      message: currentGate === "run_fresh_readiness"
        ? (append ? "已完成初步匹配，待开始核验指定视频；不会追加视频。" : "已完成初步匹配，待开始账户资源核验；不会创建项目。")
        : messages[currentGate]
    });
  }
  if (currentGate === "await_job_write_authorization") {
    const phrase = clean(confirmationPreview?.confirmationPhrase);
    const action = confirmationLabel(confirmationPreview);
    return Object.freeze({
      shortLabel: "等待确认",
      message: phrase
        ? `检查已完成，等待你核对并输入完整短语“${phrase}”确认${action}。`
        : "检查已完成，等待你核对并完成受控确认。"
    });
  }
  if (currentGate === "project_video_append_completed") {
    return Object.freeze({ shortLabel: "已完成", message: "追加视频已通过项目素材回查，本次流程已完成。" });
  }
  if (progress?.executionPhase) {
    return Object.freeze({ shortLabel: "执行中", message: `已完成 ${progress.completedCount}/${progress.totalCount}，当前第 ${progress.currentNodeNumber} 节点：${progress.currentNodeLabel}；${progress.executionPhase}。` });
  }
  if (currentGate === "resolve_case_blocker") {
    return Object.freeze({ shortLabel: "流程受阻", message: blockerMessage(caseGate) });
  }
  if (currentGate === "prepare_corrective_attempt") {
    return Object.freeze({ shortLabel: "等待只读准备", message: "上一轮创建未完成；可继续进行新的只读准备，生成新确认卡前不会创建项目。" });
  }
  if (currentGate === "manual_review_after_attempt_limit") {
    return Object.freeze({ shortLabel: "等待人工复盘", message: "创建尝试已用尽，当前不会自动重试；请查看唯一卡点并等待人工复盘。" });
  }
  return Object.freeze({ shortLabel: "状态更新中", message: "流程状态正在更新，请刷新查看。" });
}
