import { ACTION_ENSURE_MONITOR, ACTION_STD_PROJECT_CREATE, PLAN_KIND_MONITOR_BOOTSTRAP } from "./executionPlan.mjs";

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
  if (gate !== "await_job_write_authorization" || (!isSingleCreatePlan && !isMonitorBootstrapPlan)) return null;
  const monitor = metadata.monitor_bootstrap || {};
  return {
    status: "confirmation_required",
    planKind: isMonitorBootstrapPlan ? PLAN_KIND_MONITOR_BOOTSTRAP : "std_project_create",
    actionLabel: isMonitorBootstrapPlan ? "确认创建 monitor" : "创建 1 个广告项目",
    projectName: isMonitorBootstrapPlan ? "" : clean(metadata.planning_intent?.project_name || bundle.draft?.project_name),
    advertiser: maskIdentifier(bundle.job?.advertiser_id),
    actions: actionTypes,
    maximumPlatformCalls: Number(scope.maximum_platform_calls || scope.maximum_actions || 1),
    retryAllowed: scope.retry_allowed === true,
    planId: clean(plan.plan_id),
    planHash: clean(plan.plan_hash),
    ...(isMonitorBootstrapPlan ? {
      cycle: clean(monitor.cycle_id),
      attemptNo: Number(monitor.attempt_no || 0),
      confirmationPhrase: "确认创建 monitor"
    } : { confirmationPhrase: "确认创建" })
  };
}

export function evaluateGateAction({ intent = {}, message = "", caseSummary = null, isLatestCaseJob = false, confirmationPreview = null, explicitConfirmation = false } = {}) {
  const currentGate = clean(caseSummary?.current_gate);
  const nextAction = clean(caseSummary?.suggested_next_action);
  const blocker = clean((caseSummary?.root_blocker_codes || [])[0]);
  const base = { currentGate, nextAction, blocker };
  if (!isLatestCaseJob) {
    return { ...base, effect: "history_readonly", message: "这是历史运行，只读查看；请通过当前 Case 继续。" };
  }
  if (intent.intent === "cancel") {
    return { ...base, effect: "cancelled", message: "已取消本次对话操作，流程状态未改变。" };
  }
  if (intent.intent === "unknown") {
    return { ...base, effect: "clarify", message: "我只理解：继续执行、查看状态、确认创建或取消。" };
  }
  if (intent.intent === "intake_update") {
    return { ...base, effect: "intake_not_applicable", message: "当前流程已有 Job；请使用“继续执行”或查看当前状态。" };
  }
  if (intent.intent === "request_status") {
    return { ...base, effect: "status", message: blocker ? `当前卡点：${blocker}；下一步：${nextAction || "等待后端更新"}。` : `当前 Gate：${currentGate || "未投影"}；下一步：${nextAction || "等待后端更新"}。` };
  }
  if (intent.intent === "request_confirmation") {
    if (!explicitConfirmation) {
      const phrase = confirmationPreview?.confirmationPhrase || "确认创建";
      return { ...base, effect: "confirmation_phrase_required", confirmationPreview, message: `如确认，请核对确认卡后输入完整短语“${phrase}”。` };
    }
    if (currentGate !== "await_job_write_authorization" || !confirmationPreview) {
      return { ...base, effect: "confirmation_unavailable", message: "当前没有可确认的单次创建 Plan。" };
    }
    return { ...base, effect: "execute_confirmed_plan", confirmationPreview, message: confirmationPreview.planKind === PLAN_KIND_MONITOR_BOOTSTRAP ? "已收到 monitor 的精确单次确认，正在执行既有 Plan-bound 链路。" : "已收到精确创建确认，正在执行既有单次确认链路。" };
  }
  if (intent.intent === "continue_workflow") {
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
        const label = confirmationPreview.planKind === PLAN_KIND_MONITOR_BOOTSTRAP ? "monitor" : "广告项目";
        return { ...base, effect: "confirmation_required", confirmationPreview, message: `只读检查已完成。请核对以下单次 ${label} 确认卡；“继续执行”不会直接写入平台。` };
      }
      return { ...base, effect: "manual_confirmation_required", message: "当前 Plan 需要受控授权，但该动作暂不支持在工作台对话中执行。" };
    }
    if (currentGate === "resolve_case_blocker") {
      return { ...base, effect: "blocker", message: `当前卡点：${blocker || "未归类"}；下一步：${nextAction || "等待人工处理"}。` };
    }
    if (currentGate === "first_std_project_create_completed") {
      return { ...base, effect: "completed", message: "该 Case 已完成首次项目创建并通过回查。" };
    }
    return { ...base, effect: "status", message: `当前 Gate：${currentGate || "未投影"}；下一步：${nextAction || "等待后端更新"}。` };
  }
  return { ...base, effect: "clarify", message: "请使用“继续执行”、查看状态、确认创建或取消。" };
}
