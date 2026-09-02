import { resolveConversationIntent } from "../agents/conversationIntentResolver.mjs";
import { executeConfirmedLaunch, EXECUTION_GRANT_INTENT } from "./executeConfirmedLaunch.mjs";
import { executeConfirmedResourcePlan } from "./skills/oe3/05-confirmed-resource-orchestrator.mjs";
import { buildConfirmationPreview, evaluateGateAction } from "./gateActionPolicy.mjs";
import {
  createJob,
  createReadonlyRecoveryJob,
  getJobView,
  reconcileMonitorAndPersistPlan,
  runJob,
  runWorkbenchInitialReadonly
} from "./launchWorkflow.mjs";
import { runMonitorProvisionReadonlyReconcile } from "./skills/oe3/02-monitor/index.mjs";
import { executeConfirmedMonitorBootstrap } from "./skills/oe3/02-monitor/executor.mjs";
import { PLAN_KIND_MONITOR_BOOTSTRAP, PLAN_KIND_RESOURCE_PREPARE } from "./executionPlan.mjs";
import { createOceanEngineReadonlyClient } from "../platforms/oceanengineReadonlyClient.mjs";
import { finalizeVerifiedStdProjectRuntimeCase } from "./finalizeVerifiedStdProjectRuntimeCase.mjs";

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

function readbackOutcome(view = {}) {
  const node = (view.phases || [])
    .flatMap((phase) => phase.nodes || [])
    .find((item) => item.id === "readback_closer");
  return clean(node?.outputSummary?.readbackStatus);
}

function readbackMessage(view = {}) {
  const currentGate = clean(view?.caseGate?.currentGate);
  const outcome = readbackOutcome(view);
  if (currentGate === "first_std_project_create_completed" || outcome === "readback_verified") {
    return "只读回查已确认项目 ID 与草稿名称一致，Case 已完成收口。";
  }
  if (outcome === "project_id_mismatch") {
    return "只读回查发现项目 ID 与创建响应不一致，已停止且未再次创建；请人工检查。";
  }
  if (outcome === "project_name_mismatch") {
    return "只读回查发现项目名称与草稿不一致，已停止且未再次创建；请人工检查。";
  }
  if (currentGate === "run_readback_only" || outcome === "created_pending_readback") {
    return "项目已创建，但本次只读回查尚未在平台 API 中验证；Case 保持暂停，未再次创建。";
  }
  return "只读回查已结束；请按当前 Case Gate 查看下一步。";
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
  createReadonlyRecoveryJobFn = createReadonlyRecoveryJob,
  runJobFn = runJob,
  runWorkbenchInitialReadonlyFn = runWorkbenchInitialReadonly,
  executeConfirmedMonitorBootstrapFn = executeConfirmedMonitorBootstrap,
  executeConfirmedResourcePlanFn = executeConfirmedResourcePlan,
  executeConfirmedLaunchFn = executeConfirmedLaunch,
  monitorReadonlyReconcile = runMonitorProvisionReadonlyReconcile,
  monitorReadonlyPlanBridge = reconcileMonitorAndPersistPlan,
  credentialStateFn = () => createOceanEngineReadonlyClient().credentialState()
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
    explicitConfirmation: clean(message) === clean(confirmationPreview?.confirmationPhrase)
  });

  if (interaction.effect === "run_dry_run") {
    const nextView = await runWorkbenchInitialReadonlyFn(repo, jobId, {
      mode: "dry_run",
      projectStatePath,
      getJobViewFn,
      forceDryRun: intent.intent === "request_readonly_recovery",
      runJobFn
    });
    return response({
      view: nextView,
      interaction: {
        ...interaction,
        message: intent.intent === "request_readonly_recovery" ? "已重新完成当前 Job 的只读准备。" : "只读就绪检查已完成。"
      }
    });
  }
  if (interaction.effect === "create_fresh_readonly_recovery_job") {
    const credential = credentialStateFn() || {};
    if (clean(credential.status) !== "ready") {
      return response({
        view,
        interaction: {
          ...interaction,
          effect: "readonly_recovery_credential_unavailable",
          blocker: "credential_required",
          message: "当前平台只读凭据仍不可用，未创建 fresh Job、未执行平台操作。"
        }
      });
    }
    const recovery = await createReadonlyRecoveryJobFn(repo, bundle.job);
    if (!clean(recovery?.jobId)) {
      return response({
        view,
        interaction: {
          ...interaction,
          effect: "readonly_recovery_stale",
          message: "当前 Case 已变化，请刷新后从最新 Job 继续；未执行平台操作。"
        }
      });
    }
    if (recovery.created !== true) {
      const nextView = await getJobViewFn(repo, recovery.jobId, { projectStatePath });
      return response({
        view: nextView,
        interaction: {
          ...interaction,
          effect: "readonly_recovery_already_started",
          message: "该失败 Job 的 fresh readonly 恢复已启动，已切换到同一 Case 的恢复 Job。"
        }
      });
    }
    const nextView = await runWorkbenchInitialReadonlyFn(repo, recovery.jobId, {
      mode: "dry_run",
      projectStatePath,
      getJobViewFn,
      runJobFn
    });
    return response({
      view: nextView,
      interaction: {
        ...interaction,
        effect: "readonly_recovery_started",
        message: "已创建同一 Case 的 fresh Job 并完成只读准备；旧 Plan、确认和平台动作未被复用。"
      }
    });
  }
  if (interaction.effect === "run_readback_only") {
    let nextView = await runJobFn(repo, jobId, { mode: "readback_only", projectStatePath });
    if (nextView?.caseGate?.currentGate === "first_std_project_create_completed") {
      const finalization = await finalizeVerifiedStdProjectRuntimeCase({
        repo,
        jobId,
        projectStatePath,
        getJobViewFn
      });
      nextView = finalization.view || nextView;
    }
    return response({ view: nextView, interaction: { ...interaction, message: readbackMessage(nextView) } });
  }
  if (interaction.effect === "run_monitor_readonly") {
    const bridged = await monitorReadonlyPlanBridge(repo, jobId, {
      monitorReadonlyReconcile,
      fetchImpl: fetchImpl || globalThis.fetch,
      projectStatePath,
      getJobViewFn
    });
    const reconcile = bridged.reconcile || {};
    let nextView = bridged.view || await getJobViewFn(repo, jobId, { projectStatePath });
    const resolved = nextView?.caseGate?.monitorResolved === true;
    if (interaction.currentGate === "run_monitor_readonly" && resolved) {
      nextView = await runWorkbenchInitialReadonlyFn(repo, jobId, {
        mode: "dry_run",
        projectStatePath,
        getJobViewFn,
        runJobFn
      });
    }
    const reconcileBlocker = clean((reconcile?.blockers || [])[0]);
    const blocker = clean(nextView?.caseGate?.rootBlockerCodes?.[0] || reconcileBlocker);
    const monitorFound = Boolean(clean(reconcile?.resolvedMonitor?.monitorId)) ||
      clean(reconcile?.runStatus) === "monitor_resolved_touchpoint_pending";
    const message = bridged.planSaved === true
      ? "fresh readonly 已确认当前账户没有 monitor，并保存唯一 ready Monitor Plan；请核对确认卡后输入“确认创建 monitor”。"
      : resolved
      ? "fresh readonly monitor 回查已确认 monitor 与受控触点，Case 状态已刷新。"
      : monitorFound
        ? `fresh readonly monitor 回查已找到 monitor，但受控触点回查未完成：${blocker || "touchpoint_url_missing"}。未创建、未重试。`
      : blocker
        ? `fresh readonly monitor 回查未确认 monitor：${blocker}。未创建、未重试；如仍需创建，须新建 monitor_bootstrap Task/Plan。`
        : "fresh readonly monitor 回查未确认 monitor。未创建、未重试；如仍需创建，须新建 monitor_bootstrap Task/Plan。";
    return response({
      view: nextView,
      interaction: {
        ...interaction,
        message,
        confirmationPreview: nextView?.confirmationPreview || null
      }
    });
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
    ? await executeConfirmedMonitorBootstrapFn({
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
  if (isMonitorBootstrap && !executionBlocked) {
    nextView = await runWorkbenchInitialReadonlyFn(repo, jobId, {
      mode: "dry_run",
      projectStatePath,
      getJobViewFn,
      runJobFn
    });
  } else if (isResourcePrepare && !executionBlocked) {
    const fresh = await createFreshJobFn(repo, {
      case_id: bundle.job.case_id,
      route_id: bundle.job.route_id,
      game_code: bundle.job.game_code,
      advertiser_id: bundle.job.advertiser_id,
      source_usage: bundle.job.source_usage || "runtime_truth",
      source_record_ref: `workbench:resource-plan:${confirmationPreview.planId}`
    });
    nextView = await runWorkbenchInitialReadonlyFn(repo, fresh.jobId, {
      mode: "dry_run",
      projectStatePath,
      getJobViewFn,
      runJobFn
    });
  }
  return response({
    view: nextView,
    interaction: {
      ...interaction,
      effect: executionBlocked ? "execution_blocked" : "execution_completed",
      confirmationPreview: executionBlocked ? confirmationPreview : nextView?.confirmationPreview || null,
      message: executionBlocked
        ? `未执行受控动作：${(isMonitorBootstrap || isResourcePrepare ? executed.blockers?.[0] : executed.executionGrant?.blockers?.[0]) || "当前确认 Gate 未通过"}。`
        : isMonitorBootstrap
          ? "monitor 已按单次 Plan 执行并完成只读回查；工作台已自动按 Gate 继续 readonly。"
          : isResourcePrepare
            ? "资源 Plan 已执行并完成回查；同一 Case 的 fresh Job 已完成只读准备，请核对第二张创建确认卡。"
            : "单次创建已提交，并已进入只读回查。"
    }
  });
}
