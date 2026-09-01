import {
  isExplicitCreateConfirmation,
  resolveConversationIntent
} from "../agents/conversationIntentResolver.mjs";
import { executeConfirmedLaunch, EXECUTION_GRANT_INTENT } from "./executeConfirmedLaunch.mjs";
import { executeConfirmedResourcePlan } from "./skills/oe3/05-confirmed-resource-orchestrator.mjs";
import { buildConfirmationPreview, evaluateGateAction } from "./gateActionPolicy.mjs";
import { createJob, getJobView, runJob } from "./launchWorkflow.mjs";
import { runMonitorProvisionReadonlyReconcile } from "./skills/oe3/02-monitor/index.mjs";
import { executeConfirmedMonitorBootstrap } from "./skills/oe3/02-monitor/executor.mjs";
import { PLAN_KIND_MONITOR_BOOTSTRAP, PLAN_KIND_RESOURCE_PREPARE } from "./executionPlan.mjs";

function clean(value) {
  return String(value ?? "").trim();
}

function response({ view, interaction }) {
  return {
    view,
    interaction: {
      kind: interaction.effect,
      message: interaction.message,
      currentGate: interaction.currentGate || "",
      suggestedNextAction: interaction.nextAction || "",
      rootBlockerCode: interaction.blocker || "",
      confirmationPreview: interaction.confirmationPreview || null
    }
  };
}

function confirmationContextMatches(preview = null, { expectedPlanId = "", expectedPlanHash = "" } = {}) {
  if (!preview) return ["confirmation_preview_unavailable"];
  const blockers = [];
  if (!clean(expectedPlanId) || !clean(expectedPlanHash)) blockers.push("confirmation_context_missing");
  if (clean(expectedPlanId) && clean(expectedPlanId) !== preview.planId) blockers.push("execution_plan_id_changed_since_confirmation");
  if (clean(expectedPlanHash) && clean(expectedPlanHash) !== preview.planHash) blockers.push("execution_plan_hash_changed_since_confirmation");
  return blockers;
}

export async function handleWorkbenchCommand({
  repo,
  jobId,
  message = "",
  expectedPlanId = "",
  expectedPlanHash = "",
  resolver,
  projectStatePath,
  fetchImpl,
  getJobViewFn = getJobView,
  createFreshJobFn = createJob,
  runJobFn = runJob,
  executeConfirmedResourcePlanFn = executeConfirmedResourcePlan,
  executeConfirmedLaunchFn = executeConfirmedLaunch,
  monitorReadonlyReconcile = runMonitorProvisionReadonlyReconcile
} = {}) {
  if (!repo) throw new Error("repo_required");
  if (!clean(jobId)) throw new Error("job_id_required");
  const bundle = await repo.getLaunchJobBundle(jobId);
  if (!bundle) {
    const error = new Error("job_not_found");
    error.statusCode = 404;
    throw error;
  }
  const [view, caseSummary] = await Promise.all([
    getJobViewFn(repo, jobId, { projectStatePath }),
    repo.getWorkflowCaseSummary(bundle.job.case_id)
  ]);
  const intent = await resolveConversationIntent({ message, jobView: view, resolver });
  const confirmationPreview = buildConfirmationPreview(bundle, caseSummary);
  const interaction = evaluateGateAction({
    intent,
    message,
    caseSummary,
    isLatestCaseJob: caseSummary?.latest_job_id === jobId,
    confirmationPreview,
    explicitConfirmation: isExplicitCreateConfirmation(message)
  });

  if (interaction.effect === "run_dry_run") {
    const nextView = await runJobFn(repo, jobId, { mode: "dry_run", projectStatePath });
    return response({ view: nextView, interaction: { ...interaction, message: "只读就绪检查已完成。" } });
  }
  if (interaction.effect === "run_readback_only") {
    const nextView = await runJobFn(repo, jobId, { mode: "readback_only", projectStatePath });
    return response({ view: nextView, interaction: { ...interaction, message: "只读回查已完成。" } });
  }
  if (interaction.effect === "run_monitor_readonly") {
    const reconcile = await monitorReadonlyReconcile({
      repo,
      target: {
        routeId: bundle.job.route_id,
        gameCode: bundle.job.game_code,
        advertiserId: bundle.job.advertiser_id
      },
      jobId,
      fetchImpl: fetchImpl || globalThis.fetch
    });
    const nextView = await getJobViewFn(repo, jobId, { projectStatePath });
    const resolved = nextView?.caseGate?.monitorResolved === true;
    const reconcileBlocker = clean((reconcile?.blockers || [])[0]);
    const blocker = clean(nextView?.caseGate?.rootBlockerCodes?.[0] || reconcileBlocker);
    const monitorFound = Boolean(clean(reconcile?.resolvedMonitor?.monitorId)) ||
      clean(reconcile?.runStatus) === "monitor_resolved_touchpoint_pending";
    const message = resolved
      ? "fresh readonly monitor 回查已确认 monitor 与受控触点，Case 状态已刷新。"
      : monitorFound
        ? `fresh readonly monitor 回查已找到 monitor，但受控触点回查未完成：${blocker || "touchpoint_url_missing"}。未创建、未重试。`
      : blocker
        ? `fresh readonly monitor 回查未确认 monitor：${blocker}。未创建、未重试；如仍需创建，须新建 monitor_bootstrap Task/Plan。`
        : "fresh readonly monitor 回查未确认 monitor。未创建、未重试；如仍需创建，须新建 monitor_bootstrap Task/Plan。";
    return response({ view: nextView, interaction: { ...interaction, message } });
  }
  if (interaction.effect !== "execute_confirmed_plan") return response({ view, interaction });

  const contextBlockers = confirmationContextMatches(confirmationPreview, { expectedPlanId, expectedPlanHash });
  if (contextBlockers.length) {
    return response({
      view,
      interaction: {
        ...interaction,
        effect: "confirmation_context_invalid",
        message: "确认卡已失效或未完整绑定当前 Plan；请先重新输入“继续执行”。",
        blocker: contextBlockers[0],
        confirmationPreview
      }
    });
  }
  const isMonitorBootstrap = confirmationPreview.planKind === PLAN_KIND_MONITOR_BOOTSTRAP;
  const isResourcePrepare = confirmationPreview.planKind === PLAN_KIND_RESOURCE_PREPARE;
  const executed = isMonitorBootstrap
    ? await executeConfirmedMonitorBootstrap({
      repo,
      jobId,
      grantSource: "workbench_conversation",
      expectedPlanId,
      expectedPlanHash,
      projectStatePath,
      fetchImpl
    })
    : isResourcePrepare
      ? await executeConfirmedResourcePlanFn({
        repo,
        jobId,
        grantSource: "workbench_conversation",
        expectedPlanId,
        expectedPlanHash,
        projectStatePath,
        fetchImpl
      })
      : await executeConfirmedLaunchFn({
      repo,
      jobId,
      grantSource: "workbench_conversation",
      executionIntent: EXECUTION_GRANT_INTENT,
      expectedPlanId,
      expectedPlanHash,
      projectStatePath,
      fetchImpl
    });
  const executionBlocked = isMonitorBootstrap || isResourcePrepare
    ? executed.status === "blocked"
    : executed.executionGrant?.status === "blocked";
  let nextView = isMonitorBootstrap || isResourcePrepare
    ? await getJobViewFn(repo, jobId, { projectStatePath })
    : executed;
  if (isResourcePrepare && !executionBlocked) {
    const fresh = await createFreshJobFn(repo, {
      case_id: bundle.job.case_id,
      route_id: bundle.job.route_id,
      game_code: bundle.job.game_code,
      advertiser_id: bundle.job.advertiser_id,
      source_usage: bundle.job.source_usage || "runtime_truth",
      source_record_ref: `workbench:resource-plan:${confirmationPreview.planId}`
    });
    nextView = await runJobFn(repo, fresh.jobId, { mode: "dry_run", projectStatePath });
  }
  return response({
    view: nextView,
    interaction: {
      ...interaction,
      effect: executionBlocked ? "execution_blocked" : "execution_completed",
      message: executionBlocked
        ? `未执行受控动作：${(isMonitorBootstrap || isResourcePrepare ? executed.blockers?.[0] : executed.executionGrant?.blockers?.[0]) || "当前确认 Gate 未通过"}。`
        : isMonitorBootstrap
          ? "monitor 已按单次 Plan 执行并完成只读回查。"
          : isResourcePrepare
            ? "资源 Plan 已执行并完成回查；同一 Case 的 fresh Job 已完成只读准备，请核对第二张创建确认卡。"
            : "单次创建已提交，并已进入只读回查。"
    }
  });
}
