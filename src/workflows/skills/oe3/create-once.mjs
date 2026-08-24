import { randomBytes } from "node:crypto";
import { hashValue } from "./contracts.mjs";
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

function confirmPlaceholder({ jobId, draftId, projectName }) {
  const artifactId = `EV-${jobId}-CONFIRM-PLACEHOLDER`;
  return {
    artifactId,
    jobId,
    artifactType: "mock_create_confirmation",
    title: "execute_once mock create confirmation",
    summary: "execute_once mock 确认已记录；未调用真实 std_project/create。",
    storageRef: `postgres:mwb.evidence_artifacts/${artifactId}`,
    sourceRef: "workflow-skill:create-once",
    draftId,
    projectName
  };
}

export async function runCreateOnceSkill({
  repo,
  bundle,
  mode,
  mockReady = false,
  mockExecute = false,
  readiness = {},
  allowNetworkWrite = false,
  confirmationIntent = "",
  confirmVariableValue = "",
  grantSource = "",
  executionGrantId = "",
  fetchImpl = globalThis.fetch
} = {}) {
  const latestBundle = await repo.getLaunchJobBundle(bundle.job.job_id);
  const canMockCreate = mode === "execute_once" &&
    mockExecute &&
    latestBundle.job.source_usage === "test_run" &&
    (readiness.canCreateCurrentJob || mockReady);

  if (!canMockCreate && mode === "execute_once") {
    const result = await createStdProjectForTargetOnce({
      repo,
      target: targetFromBundle(latestBundle),
      allowNetworkWrite,
      confirmationIntent,
      confirmVariableValue,
      grantSource,
      executionGrantId,
      readiness,
      fetchImpl
    });
    const skillStatus = {
      created_pending_readback: "passed",
      create_failed_stop_for_manual_review: "failed",
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
            : "真实创建已完成，等待回查。"
      }
    };
  }

  if (!canMockCreate) {
    return {
      status: "locked",
      blockers: ["platform_write_disabled_in_this_task"],
      outputSummary: {
        createNodeStatus: "locked",
        createCalled: false,
        mockCreateCalled: false,
        retryAllowed: false,
        nextConfirmationRequired: false,
        reason: "本任务禁止真实平台写入。"
      }
    };
  }

  const confirmation = confirmPlaceholder({
    jobId: latestBundle.job.job_id,
    draftId: latestBundle.draft.draft_id,
    projectName: latestBundle.draft.project_name
  });
  const actionId = `ACTION-${latestBundle.job.job_id}-STD-PROJECT-CREATE-MOCK`;
  const objectId = `MOCK-STD-PROJECT-${randomBytes(4).toString("hex").toUpperCase()}`;
  await repo.upsertEvidence({
    ...confirmation,
    contentHash: hashValue(`${confirmation.artifactId}:${latestBundle.draft.payload_hash}:mock`),
    sourceUsage: latestBundle.job.source_usage || "test_run"
  });
  await repo.upsertPlatformAction({
    actionId,
    jobId: latestBundle.job.job_id,
    actionType: "mock_oceanengine_std_project_create",
    endpoint: "mock:oceanengine/std_project/create",
    method: "MOCK",
    actionStatus: "mock_succeeded",
    attemptNo: 1,
    requestHash: latestBundle.draft.payload_hash,
    responseHash: hashValue({ objectIdPresent: true, requestIdPresent: true, mock: true }),
    httpStatus: 200,
    apiCode: "0",
    requestIdPresent: true,
    objectIdPresent: true,
    requestFieldManifest: latestBundle.draft.payload_summary?.final_payload_manifest || {},
    responseSummary: {
      mock: true,
      request_id_present: true,
      object_id_present: true,
      raw_response_stored: false
    },
    metadata: {
      mock_execute_once: true,
      raw_payload_stored: false,
      raw_response_stored: false,
      retry_allowed: false
    }
  });
  await repo.upsertCreatedObject({
    createdObjectId: `CO-${latestBundle.job.job_id}-STD-PROJECT-${objectId}`,
    jobId: latestBundle.job.job_id,
    actionId,
    objectType: "std_project",
    objectId,
    objectName: latestBundle.draft.project_name,
    objectStatus: "mock_created",
    readbackStatus: "pending",
    evidenceRef: confirmation.artifactId,
    metadata: {
      mock: true,
      raw_payload_stored: false,
      raw_response_stored: false
    }
  });
  return {
    status: "mock_passed",
    blockers: [],
    evidenceRefs: [confirmation.artifactId],
    outputSummary: {
      createNodeStatus: "mock_created_once",
      createCalled: false,
      mockCreateCalled: true,
      realPlatformWriteCalled: false,
      objectIdPresent: true,
      retryAllowed: false,
      nextConfirmationRequired: false,
      actionId
    }
  };
}
