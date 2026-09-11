export const PROGRESS_REFRESH_INTERVAL_MS = 1200;

const IDENTITY_RECOVERY_BLOCKERS = new Set([
  "qiankun_account_identity_changed_since_plan",
  "qiankun_account_identity_preflight_failed",
  "monitor_fresh_readonly_contract_drift"
]);

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
  if (IDENTITY_RECOVERY_BLOCKERS.has(blocker)) {
    return {
      message: "账户监测身份已更新，旧 Plan 已失效；请输入“重新只读准备”。",
      placeholder: "输入“重新只读准备”或“查看状态”…"
    };
  }
  if (blocker === "duplicate_readonly_rate_limited") {
    return {
      message: "当前阻断：平台查重暂时限流，请稍后输入“重新只读准备”；不会确认或创建项目。",
      placeholder: "稍后输入“重新只读准备”或“查看状态”…"
    };
  }
  if (blocker === "brand_info_not_ready") {
    return {
      message: "当前阻断：目标账户品牌/行业尚未满足当前创建前合同。请输入“重新只读准备”重新核验；不会自动确认或创建项目。",
      placeholder: "输入“重新只读准备”或“查看状态”…"
    };
  }
  if (blocker === "brand_info_confirmation") {
    return {
      message: "当前阻断：品牌创建前校验未通过。请输入“重新只读准备”；不会复用旧 Plan 或创建项目。",
      placeholder: "输入“重新只读准备”或“查看状态”…"
    };
  }
  if (blocker === "jszc_success_profile" || blocker === "create_field_ledger") {
    return {
      message: "创建草稿已生成，但字段形态校验未通过；需要修正系统合同校验后重新准备。不会自动确认或创建项目。",
      placeholder: "输入“查看状态”…"
    };
  }
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
  if (blocker === "site_get_target_shared_blocked") return {
    message: "当前阻断：目标账户共享站点只读核验未完成。下一步：输入“重新只读准备”重新核验；不会确认或创建平台对象。",
    placeholder: "输入“重新只读准备”重新核验，或输入“查看状态”..."
  };
  if (blocker) return {
    message: "当前阻断仍待处理。请按上方卡点处理后，输入“重新只读准备”或“查看状态”。",
    placeholder: "输入“重新只读准备”或“查看状态”…"
  };
  return null;
}

export function progressPresentation({
  nodes = [],
  caseGate = {},
  confirmationPreview = null,
  executionAvailability = {},
  headline = {},
  execution = {},
  busy = false,
  viewOnly = false
} = {}) {
  const completed = progressCount(nodes);
  const total = nodes.length;
  const prefix = `进度 ${completed} / ${total}`;
  if (viewOnly) return `${prefix} · 历史 Job，只读查看`;
  if (caseGate?.currentGate === "first_std_project_create_completed") return `${prefix} · 已完成`;
  if (execution?.status === "started" && execution?.latestDeliveryStatus === "rate_limited") {
    const nextDelivery = Math.min(Number(execution.deliveryCount || 0) + 1, Number(execution.maximumDeliveryCalls || 3));
    return `${prefix} · 平台限流，正在等待第 ${nextDelivery}/${Number(execution.maximumDeliveryCalls || 3)} 次错峰投递`;
  }
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
