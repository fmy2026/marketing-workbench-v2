import {
  ACTION_ENSURE_MONITOR,
  ACTION_STD_PROJECT_CREATE,
  PLAN_KIND_MONITOR_BOOTSTRAP,
  PLAN_KIND_RESOURCE_PREPARE
} from "./executionPlan.mjs";
import { FORMAL_CONFIRMED_ACTION_ORDER } from "./skills/oe3/04-resource-action-registry.mjs";
import { presentWorkflowProgress } from "./workbenchProgressNarrative.mjs";

function clean(value) {
  return String(value ?? "").trim();
}

function maskIdentifier(value) {
  const text = clean(value);
  if (!text) return "";
  if (text.length <= 4) return "****";
  return `****${text.slice(-4)}`;
}

function actionType(action = {}) {
  return clean(action.action_type || action.actionType);
}

function canReconcileTerminalMonitor({ caseSummary = null, isLatestCaseJob = false } = {}) {
  return isLatestCaseJob === true &&
    clean(caseSummary?.lifecycle_status) === "active" &&
    clean(caseSummary?.current_gate) === "resolve_case_blocker" &&
    clean((caseSummary?.root_blocker_codes || [])[0]) === "monitor_create_busy_retry_exhausted" &&
    caseSummary?.monitor_resolved === false;
}

function terminalMonitorReadonlyHint({ caseSummary = null, isLatestCaseJob = false } = {}) {
  return canReconcileTerminalMonitor({ caseSummary, isLatestCaseJob })
    ? "可输入“重新只读回查 monitor”执行一次 fresh readonly 回查；不会创建 monitor。"
    : "";
}

function canRecoverReadonlyBlocker({ caseSummary = null, isLatestCaseJob = false } = {}) {
  return isLatestCaseJob === true &&
    clean(caseSummary?.lifecycle_status) === "active" &&
    clean(caseSummary?.current_gate) === "resolve_case_blocker" &&
    !canReconcileTerminalMonitor({ caseSummary, isLatestCaseJob });
}

export function requiresFreshReadonlyRecovery({ caseSummary = null, isLatestCaseJob = false } = {}) {
  return canRecoverReadonlyBlocker({ caseSummary, isLatestCaseJob }) &&
    ["blocked_confirmed_resource_plan", "blocked_confirmed_monitor_plan"].includes(clean(caseSummary?.latest_job_status));
}

function readonlyRecoveryHint({ caseSummary = null, isLatestCaseJob = false } = {}) {
  return canRecoverReadonlyBlocker({ caseSummary, isLatestCaseJob })
    ? "可输入“重新只读准备”重新核验；不会确认或创建平台对象。"
    : "";
}

function correctiveAttemptMessage() {
  return "标准项目创建已被平台明确拒绝；本次 Attempt 与 Plan 已消耗且不会重试。输入“继续执行”可创建同一 Case 的 fresh Job，重新只读准备下一 Attempt；真正创建仍需本人核对新确认卡并输入“确认创建”。";
}

function attemptLimitReviewMessage(manualReviewApproved = false) {
  return manualReviewApproved
    ? "该 Case 已用尽创建次数，三次旧 Attempt 均不可重试。复盘已批准；只有账户本人可输入“重新只读准备”建立新的单次验证 Case，随后仍须完成 readonly 并再次输入“确认创建”。"
    : "该 Case 已用尽创建次数，旧 Plan 已消耗且未创建项目。禁止重试或继续执行；等待人工复盘、明确平台原因和单一修复后，才能由账户本人输入“重新只读准备”。";
}

export function buildConfirmationPreview(bundle = {}, caseSummary = null) {
  const plan = bundle.executionPlan || {};
  const gate = clean(caseSummary?.current_gate);
  const actions = Array.isArray(plan.planned_actions) ? plan.planned_actions : [];
  const metadata = plan.metadata || {};
  const scope = metadata.execution_scope || metadata.executionScope || {};
  const actionTypes = actions.map(actionType).filter(Boolean);
  const isSingleCreatePlan = plan.plan_status === "ready" &&
    actionTypes.length === 1 && actionTypes[0] === ACTION_STD_PROJECT_CREATE;
  const isMonitorBootstrapPlan = plan.plan_status === "ready" &&
    clean(plan.plan_kind || metadata.plan_kind) === PLAN_KIND_MONITOR_BOOTSTRAP &&
    actionTypes.length === 1 && actionTypes[0] === ACTION_ENSURE_MONITOR;
  const isResourcePreparePlan = plan.plan_status === "ready" &&
    clean(plan.plan_kind || metadata.plan_kind) === PLAN_KIND_RESOURCE_PREPARE &&
    actionTypes.length > 0 &&
    actionTypes.every((action) => FORMAL_CONFIRMED_ACTION_ORDER.includes(action)) &&
    !actionTypes.includes(ACTION_STD_PROJECT_CREATE) &&
    Number(scope.maximum_create_calls || 0) === 0;
  if (gate !== "await_job_write_authorization" || (!isSingleCreatePlan && !isMonitorBootstrapPlan && !isResourcePreparePlan)) return null;
  const monitor = metadata.monitor_bootstrap || {};
  const planKind = isMonitorBootstrapPlan
    ? PLAN_KIND_MONITOR_BOOTSTRAP
    : isResourcePreparePlan
      ? PLAN_KIND_RESOURCE_PREPARE
      : "std_project_create";
  const confirmationPhrase = isMonitorBootstrapPlan
    ? "确认创建 monitor"
    : isResourcePreparePlan
      ? "确认准备资源"
      : "确认创建";
  const actionGrants = scope.action_grants || scope.actionGrants || {};
  const brandOfficial = (bundle.resources || []).find((item) => item.resource_type === "brand_info")?.metadata?.brand_info_official || {};
  const brandFallbackExperiment = isSingleCreatePlan &&
    clean(brandOfficial.source) === "game_route_fallback_experiment" &&
    clean(brandOfficial.readback_status) === "experimental_pending_create"
    ? {
      source: "game_route_fallback_experiment",
      label: "游戏维度保底候选；目标账户可投品牌列表为空；本次为验证创建",
      tupleHash: clean(brandOfficial.tuple_hash)
    }
    : null;
  const targetEmptyBrandOmitExperiment = isSingleCreatePlan &&
    clean(brandOfficial.source) === "target_empty_omit_experiment" &&
    clean(brandOfficial.readback_status) === "target_empty_omit_experiment"
    ? {
      source: "target_empty_omit_experiment",
      label: "品牌模式：目标账户品牌列表为空；创建字段：整组省略 brand_info；游戏维度保底候选：不使用；本次仅允许一次 std_project_create"
    }
    : null;
  const actionLimits = actionTypes.map((type) => ({
    actionType: type,
    maximumPlatformCalls: Number(
      actionGrants[type]?.maximum_platform_calls ??
      actionGrants[type]?.maximumPlatformCalls ??
      actions.find((action) => actionType(action) === type)?.maximum_platform_calls ??
      0
    )
  }));
  return {
    status: "confirmation_required",
    planKind,
    actionLabel: isMonitorBootstrapPlan
      ? "确认创建 monitor"
      : isResourcePreparePlan
        ? `准备 ${actionTypes.length} 个受控资源动作`
        : "创建 1 个广告项目",
    projectName: isMonitorBootstrapPlan || isResourcePreparePlan ? "" : clean(metadata.planning_intent?.project_name || bundle.draft?.project_name),
    advertiser: maskIdentifier(bundle.job?.advertiser_id),
    actions: actionTypes,
    actionLimits,
    maximumPlatformCalls: Number(scope.maximum_platform_calls || actions.reduce((sum, action) => sum + Number(action.maximum_platform_calls || 0), 0) || scope.maximum_actions || 1),
    maximumCreateAttempts: Number(metadata.maximum_create_attempts || scope.maximum_total_attempts || caseSummary?.action_readback_state?.maximum_attempts || 3),
    retryAllowed: scope.retry_allowed === true,
    planId: clean(plan.plan_id),
    planHash: clean(plan.plan_hash),
    brandFallbackExperiment,
    targetEmptyBrandOmitExperiment,
    ...(isMonitorBootstrapPlan ? {
      cycle: clean(monitor.cycle_id),
      attemptNo: Number(monitor.attempt_no || 0),
      confirmationPhrase
    } : { confirmationPhrase })
  };
}

export function evaluateGateAction({ intent = {}, message = "", caseSummary = null, caseGate = null, isLatestCaseJob = false, confirmationPreview = null, explicitConfirmation = false, manualReviewApproved = false } = {}) {
  const currentGate = clean(caseSummary?.current_gate);
  const nextAction = clean(caseSummary?.suggested_next_action);
  const blocker = clean((caseSummary?.root_blocker_codes || [])[0]);
  const base = { currentGate, nextAction, blocker };
  const progressCaseGate = caseGate || { currentGate, rootBlocker: {} };
  if (!isLatestCaseJob) {
    return { ...base, effect: "history_readonly", message: "这是历史运行，只读查看；请通过当前 Case 继续。" };
  }
  if (intent.intent === "cancel") {
    return { ...base, effect: "cancelled", message: "已取消本次对话操作，流程状态未改变。" };
  }
  if (intent.intent === "unknown") {
    return { ...base, effect: "clarify", message: "我只处理投放创建所需信息、当前进度、唯一卡点和受控确认，不提供开放问答或策略生成。" };
  }
  if (intent.intent === "intake_update") {
    return { ...base, effect: "intake_not_applicable", message: "当前流程已有 Job；请使用“继续执行”或查看当前状态。" };
  }
  if (intent.intent === "request_status") {
    if (currentGate === "prepare_corrective_attempt") {
      return { ...base, effect: "status", message: correctiveAttemptMessage() };
    }
    if (currentGate === "manual_review_after_attempt_limit" && blocker === "std_project_create_attempt_limit_reached") {
      return { ...base, effect: "status", message: attemptLimitReviewMessage(manualReviewApproved) };
    }
    const hint = terminalMonitorReadonlyHint({ caseSummary, isLatestCaseJob }) || readonlyRecoveryHint({ caseSummary, isLatestCaseJob });
    const progress = presentWorkflowProgress({
      caseGate: progressCaseGate,
      confirmationPreview,
      isLatestCaseJob
    });
    return { ...base, effect: "status", message: `${progress.message}${hint ? ` ${hint}` : ""}` };
  }
  if (intent.intent === "request_confirmation") {
    if (!explicitConfirmation) {
      const phrase = confirmationPreview?.confirmationPhrase || "确认创建";
      return { ...base, effect: "confirmation_phrase_required", confirmationPreview, message: `如确认，请核对确认卡后输入完整短语“${phrase}”。` };
    }
    if (currentGate !== "await_job_write_authorization" || !confirmationPreview) {
      return { ...base, effect: "confirmation_unavailable", message: "当前没有可确认的受控 Plan。" };
    }
    return {
      ...base,
      effect: "execute_confirmed_plan",
      confirmationPreview,
      message: confirmationPreview.planKind === PLAN_KIND_MONITOR_BOOTSTRAP
        ? "已收到 monitor 的精确单次确认，正在执行既有 Plan-bound 链路。"
        : confirmationPreview.planKind === PLAN_KIND_RESOURCE_PREPARE
          ? "已收到资源准备的精确单次确认，正在执行既有受控资源链路。"
          : "已收到精确创建确认，正在执行既有单次确认链路。"
    };
  }
  if (intent.intent === "request_monitor_readonly_reconcile") {
    if (!canReconcileTerminalMonitor({ caseSummary, isLatestCaseJob })) {
      return { ...base, effect: "monitor_readonly_unavailable", message: "当前 Case 不满足终态 monitor 的只读回查条件，未执行平台操作。" };
    }
    return { ...base, effect: "run_monitor_readonly", message: "将执行一次 fresh readonly monitor 回查，不会创建 monitor。" };
  }
  if (intent.intent === "request_readonly_recovery") {
    if (currentGate === "manual_review_after_attempt_limit" && blocker === "std_project_create_attempt_limit_reached") {
      return {
        ...base,
        effect: "create_approved_replacement_case",
        message: manualReviewApproved
          ? "复盘已批准；将关闭旧 Case、建立同账户的一次性验证 Case，并先执行完整 readonly。不会复用旧 Plan、确认或平台动作。"
          : "当前尚无已批准的人工复盘证据，未创建替代 Case、未执行平台操作。"
      };
    }
    if (!canRecoverReadonlyBlocker({ caseSummary, isLatestCaseJob })) {
      return { ...base, effect: "readonly_recovery_unavailable", message: "当前 Case 不满足重新只读准备条件，未执行平台操作。" };
    }
    if (requiresFreshReadonlyRecovery({ caseSummary, isLatestCaseJob })) {
      return { ...base, effect: "create_fresh_readonly_recovery_job", message: "将创建同一 Case 的 fresh Job 并执行只读准备；不会复用旧 Plan、确认或平台动作。" };
    }
    if (blocker === "monitor_plan_required") {
      return { ...base, effect: "run_monitor_readonly", message: "将重新执行 monitor 只读核验并生成可确认 Plan；不会创建 monitor。" };
    }
    return { ...base, effect: "run_dry_run", message: "将重新执行当前 Job 的只读准备；不会确认或创建平台对象。" };
  }
  if (intent.intent === "continue_workflow") {
    if (currentGate === "manual_review_after_attempt_limit" && blocker === "std_project_create_attempt_limit_reached") {
      return { ...base, effect: "manual_review_required", message: attemptLimitReviewMessage(manualReviewApproved) };
    }
    if (currentGate === "prepare_corrective_attempt") {
      return { ...base, effect: "create_fresh_corrective_attempt", message: "将创建同一 Case 的 fresh Job 并重新完成只读准备；不会复用旧 Plan、确认或平台动作，也不会自动创建项目。" };
    }
    if (currentGate === "run_monitor_readonly") {
      return { ...base, effect: "run_monitor_readonly", message: "将执行 fresh readonly monitor 回查，不会创建 monitor。" };
    }
    if (currentGate === "run_fresh_readiness") {
      return { ...base, effect: "run_dry_run", message: "将继续执行只读就绪检查。" };
    }
    if (currentGate === "run_readback_only") {
      return { ...base, effect: "run_readback_only", message: "将继续执行只读回查。" };
    }
    if (currentGate === "await_job_write_authorization") {
      if (confirmationPreview) {
        const label = confirmationPreview.planKind === PLAN_KIND_MONITOR_BOOTSTRAP
          ? "monitor"
          : confirmationPreview.planKind === PLAN_KIND_RESOURCE_PREPARE
            ? "资源准备"
            : "广告项目";
        return { ...base, effect: "confirmation_required", confirmationPreview, message: `只读检查已完成。请核对以下单次 ${label} 确认卡；“继续执行”不会直接写入平台。` };
      }
      return { ...base, effect: "manual_confirmation_required", message: "当前 Plan 需要受控授权，但该动作暂不支持在工作台对话中执行。" };
    }
    if (currentGate === "resolve_case_blocker") {
      const progress = presentWorkflowProgress({ caseGate: progressCaseGate, confirmationPreview, isLatestCaseJob });
      const hint = terminalMonitorReadonlyHint({ caseSummary, isLatestCaseJob }) || readonlyRecoveryHint({ caseSummary, isLatestCaseJob });
      return { ...base, effect: "blocker", message: `${progress.message}${hint ? ` ${hint}` : ""}` };
    }
    if (currentGate === "first_std_project_create_completed") {
      return { ...base, effect: "completed", message: "该 Case 已完成首次项目创建并通过回查。" };
    }
    const progress = presentWorkflowProgress({ caseGate: progressCaseGate, confirmationPreview, isLatestCaseJob });
    return { ...base, effect: "status", message: progress.message };
  }
  return { ...base, effect: "clarify", message: "我只处理投放创建所需信息、当前进度、唯一卡点和受控确认，不提供开放问答或策略生成。" };
}
