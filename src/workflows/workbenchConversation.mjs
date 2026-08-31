import {
  isExplicitCreateConfirmation,
  resolveConversationIntent
} from "../agents/conversationIntentResolver.mjs";
import { executeConfirmedLaunch, EXECUTION_GRANT_INTENT } from "./executeConfirmedLaunch.mjs";
import { buildConfirmationPreview, evaluateGateAction } from "./gateActionPolicy.mjs";
import { getJobView, runJob } from "./launchWorkflow.mjs";

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
  fetchImpl
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
    getJobView(repo, jobId, { projectStatePath }),
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
    const nextView = await runJob(repo, jobId, { mode: "dry_run", projectStatePath });
    return response({ view: nextView, interaction: { ...interaction, message: "只读就绪检查已完成。" } });
  }
  if (interaction.effect === "run_readback_only") {
    const nextView = await runJob(repo, jobId, { mode: "readback_only", projectStatePath });
    return response({ view: nextView, interaction: { ...interaction, message: "只读回查已完成。" } });
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
  const executed = await executeConfirmedLaunch({
    repo,
    jobId,
    grantSource: "workbench_conversation",
    executionIntent: EXECUTION_GRANT_INTENT,
    expectedPlanId,
    expectedPlanHash,
    projectStatePath,
    fetchImpl
  });
  const executionBlocked = executed.executionGrant?.status === "blocked";
  return response({
    view: executed,
    interaction: {
      ...interaction,
      effect: executionBlocked ? "execution_blocked" : "execution_completed",
      message: executionBlocked
        ? `未执行平台创建：${executed.executionGrant?.blockers?.[0] || "当前确认 Gate 未通过"}。`
        : "单次创建已提交，并已进入只读回查。"
    }
  });
}
