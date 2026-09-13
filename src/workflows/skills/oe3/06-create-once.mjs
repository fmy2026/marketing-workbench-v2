import { createStdProjectForTargetOnce } from "../../../platforms/oceanengineStdProjectCreateExecutor.mjs";

function targetFromBundle(bundle = {}) {
  return {
    jobId: bundle.job?.job_id || "",
    draftId: bundle.draft?.draft_id || "",
    objectType: bundle.job?.object_type || "std_project",
    routeId: bundle.job?.route_id || "",
    gameCode: bundle.job?.game_code || "",
    advertiserId: bundle.job?.advertiser_id || "",
    projectName: bundle.draft?.project_name || "",
    payloadHash: bundle.draft?.payload_hash || ""
  };
}

export async function runCreateOnceSkill({
  repo,
  bundle,
  mode,
  readiness = {},
  allowNetworkWrite = false,
  confirmationIntent = "",
  confirmVariableValue = "",
  grantSource = "",
  executionGrantId = "",
  fetchImpl = globalThis.fetch,
  credentialSummary,
  deliveryWait,
  deliveryNowMs
} = {}) {
  const latestBundle = await repo.getLaunchJobBundle(bundle.job.job_id);
  if (mode !== "execute_once") {
    return {
      status: "locked",
      blockers: ["execute_mode_required"],
      outputSummary: {
        createNodeStatus: "locked",
        createCalled: false,
        mockCreateCalled: false,
        retryAllowed: false,
        nextConfirmationRequired: false,
        reason: "仅 execute_once 可进入创建执行。"
      }
    };
  }
  const result = await createStdProjectForTargetOnce({
    repo,
    target: targetFromBundle(latestBundle),
    allowNetworkWrite,
    confirmationIntent,
    confirmVariableValue,
    grantSource,
    executionGrantId,
    readiness,
    fetchImpl,
    credentialSummary,
    ...(typeof deliveryWait === "function" ? { wait: deliveryWait } : {}),
    ...(typeof deliveryNowMs === "function" ? { nowMs: deliveryNowMs } : {})
  });
  const skillStatus = {
    created_pending_readback: "passed",
    create_failed_stop_for_manual_review: "failed",
    create_rate_limit_retry_exhausted: "failed",
    blocked_before_create: "blocked"
  }[result.status] || "blocked";
  return {
    status: skillStatus,
    blockers: result.blockers || [],
    evidenceRefs: result.evidenceRef ? [result.evidenceRef] : [],
    outputSummary: {
      createNodeStatus: result.status,
      createCalled: result.createCalled === true,
      mockCreateCalled: false,
      realPlatformWriteCalled: result.createCalled === true,
      objectIdPresent: Boolean(result.stdProjectId),
      retryAllowed: false,
      deliveryCount: Number(result.deliveryCount || 0),
      rateLimitedDeliveryCount: Number(result.rateLimitedDeliveryCount || 0),
      maximumDeliveryCalls: Number(result.maximumDeliveryCalls || 1),
      nextConfirmationRequired: false,
      httpStatus: result.httpStatus || null,
      apiCode: result.apiCode || "",
      requestIdPresent: result.requestIdPresent === true,
      stdProjectIdPresent: Boolean(result.stdProjectId),
      grantSource: result.grantSource || grantSource || "",
      createPreflightStatus: result.createPreflight?.status || "",
      createPreflightSummary: result.createPreflight?.summary || "",
      createPreflightDiagnostics: result.createPreflight?.diagnostics || [],
      blockers: result.blockers || [],
      reason: result.status === "blocked_before_create"
        ? "创建前 gate 未满足或本任务未开放网络写入。"
        : result.status === "create_failed_stop_for_manual_review"
          ? "真实创建已调用一次但平台未确认成功，禁止自动重试。"
          : result.status === "create_rate_limit_retry_exhausted"
            ? "平台连续三次明确返回系统级限流，已耗尽本逻辑动作的错峰投递额度。"
            : "创建已完成，等待回查。"
    }
  };
}
