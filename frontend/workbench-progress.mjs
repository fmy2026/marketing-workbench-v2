export const PROGRESS_REFRESH_INTERVAL_MS = 1200;

export function progressCount(nodes = []) {
  return nodes.filter((node) => node?.status === "passed").length;
}

export function latestCaseJobId(caseView = {}) {
  return String(caseView?.summary?.latest_job_id || "").trim();
}

export function readonlyRecoveryGuidance(caseGate = {}) {
  const gate = String(caseGate?.currentGate || "").trim();
  const blocker = String(caseGate?.rootBlockerCodes?.[0] || "").trim();
  if (gate !== "resolve_case_blocker") return null;
  if (blocker === "guide_video_capability_probe_failed") {
    return {
      message: "当前阻断：无法确认本账户的引导视频能力，请重新只读核验。",
      placeholder: "输入“重新只读准备”重新核验，或输入“查看状态”..."
    };
  }
  if (blocker === "guide_video_candidate_ambiguous") {
    return {
      message: "当前阻断：检测到多个引导视频，需先确定唯一玩法。",
      placeholder: "输入“查看状态”..."
    };
  }
  if (blocker !== "site_get_target_shared_blocked") return null;
  return {
    message: "当前阻断：目标账户共享站点只读核验未完成。下一步：输入“重新只读准备”重新核验；不会确认或创建平台对象。",
    placeholder: "输入“重新只读准备”重新核验，或输入“查看状态”..."
  };
}

export function progressPresentation({
  nodes = [],
  caseGate = {},
  confirmationPreview = null,
  executionAvailability = {},
  headline = {},
  busy = false,
  viewOnly = false
} = {}) {
  const completed = progressCount(nodes);
  const total = nodes.length;
  const prefix = `进度 ${completed} / ${total}`;
  if (viewOnly) return `${prefix} · 历史 Job，只读查看`;
  if (caseGate?.currentGate === "first_std_project_create_completed") return `${prefix} · 已完成`;
  if (busy) return `${prefix} · 正在处理`;
  const blockerCode = String(caseGate?.rootBlockerCodes?.[0] || "").trim();
  const blockerTitle = blockerCode ? String(caseGate?.rootBlocker?.title || blockerCode).trim() : "";
  if (blockerTitle) return `${prefix} · 已暂停：${blockerTitle}`;
  if (confirmationPreview && executionAvailability?.canExecuteOnce === true) return `${prefix} · 待确认`;
  if (confirmationPreview) return `${prefix} · 已暂停：当前 Plan 不可确认`;
  return `${prefix} · ${headline?.statusLabel || "已同步"}`;
}

export function progressRefreshLabel({ busy = false, refreshing = false, failed = false, viewOnly = false, hasJob = false } = {}) {
  if (!hasJob) return "等待流程";
  if (busy || refreshing) return "同步中…";
  if (failed) return "刷新失败，重试";
  return viewOnly ? "刷新历史" : "刷新进度";
}
