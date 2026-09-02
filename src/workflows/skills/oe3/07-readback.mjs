import { hashValue } from "./00-contracts.mjs";
import { readbackStdProjectOnce } from "../../../platforms/oceanengineStdProjectCreateExecutor.mjs";

function readbackPlaceholder({ jobId, projectName }) {
  return {
    artifactId: `EV-${jobId}-READBACK-MOCK`,
    readbackId: `RB-${jobId}-STD-PROJECT-MOCK`,
    objectType: "std_project",
    objectId: `MOCK-STD-PROJECT-${jobId}`,
    objectName: projectName,
    readbackStatus: "readback_verified",
    fieldDiffSummary: {
      mock: true,
      object_name_matches_draft: true,
      raw_response_stored: false
    }
  };
}

function responseUnknownCreateAction(action = {}) {
  const responseSummary = action.response_summary || action.responseSummary || {};
  return action.action_status === "failed_or_unconfirmed" &&
    responseSummary.outcome_category === "platform_response_unknown";
}

export async function runReadbackSkill({ repo, bundle, mode, fetchImpl = globalThis.fetch, grantSource = "", createResult = null } = {}) {
  const latestBundle = await repo.getLaunchJobBundle(bundle.job.job_id);
  const isMock = latestBundle.platformAction?.action_type === "mock_oceanengine_std_project_create";
  if (mode !== "readback_only" && mode !== "execute_once") {
    return {
      status: "skipped",
      blockers: [],
      outputSummary: {
        readbackStatus: "not_applicable",
        reason: "dry_run 不执行 Node 7。"
      }
    };
  }

  if (createResult?.status === "blocked_before_create" ||
    (createResult?.status === "blocked" && createResult?.outputSummary?.createNodeStatus === "blocked_before_create")) {
    return {
      status: "locked",
      blockers: ["readback_skipped_when_create_claim_not_owned"],
      outputSummary: {
        readbackStatus: "not_run",
        objectNameSource: "launch_drafts.project_name",
        realPlatformReadbackCalled: false
      }
    };
  }

  if (isMock && latestBundle.createdObject) {
    const placeholder = readbackPlaceholder({
      jobId: latestBundle.job.job_id,
      projectName: latestBundle.draft.project_name
    });
    await repo.upsertEvidence({
      artifactId: placeholder.artifactId,
      jobId: latestBundle.job.job_id,
      artifactType: "mock_readback_verified",
      title: "mock readback verified",
      summary: "execute_once mock 回查通过；对象名来自 launch_drafts.project_name；未调用真实平台。",
      contentHash: hashValue(`${placeholder.artifactId}:${latestBundle.draft.project_name}:mock-readback`),
      storageRef: `postgres:mwb.evidence_artifacts/${placeholder.artifactId}`,
      sourceRef: "workflow-skill:readback-std-project",
      sourceUsage: latestBundle.job.source_usage || "test_run"
    });
    await repo.upsertReadbackRecord({
      readbackId: placeholder.readbackId,
      jobId: latestBundle.job.job_id,
      objectType: "std_project",
      objectId: latestBundle.createdObject.object_id,
      objectName: latestBundle.draft.project_name,
      readbackStatus: "readback_verified",
      fieldDiffSummary: placeholder.fieldDiffSummary,
      evidenceRef: placeholder.artifactId
    });
    const planId = latestBundle.executionPlan?.plan_id || "";
    if (planId && typeof repo.consumeConfirmedStdProjectCreatePlanAfterReadback === "function") {
      await repo.consumeConfirmedStdProjectCreatePlanAfterReadback({
        jobId: latestBundle.job.job_id,
        planId
      });
    }
    return {
      status: "mock_passed",
      blockers: [],
      evidenceRefs: [placeholder.artifactId],
      outputSummary: {
        readbackStatus: "readback_verified",
        objectNameSource: "launch_drafts.project_name",
        objectNameMatchesDraft: true,
        realPlatformReadbackCalled: false,
        mockReadback: true,
        evidenceRef: placeholder.artifactId
      }
    };
  }

  const realCreateAction = latestBundle.platformAction?.action_type === "oceanengine_std_project_create"
    ? latestBundle.platformAction
    : null;
  if (realCreateAction) {
    const responseConfirmed = realCreateAction.action_status === "succeeded" && realCreateAction.object_id_present === true;
    const responseUnknown = responseUnknownCreateAction(realCreateAction);
    if (!responseConfirmed && !responseUnknown) {
      const planId = latestBundle.executionPlan?.plan_id || "";
      if (planId && typeof repo.finalizeConfirmedStdProjectCreatePlanAfterAction === "function") {
        await repo.finalizeConfirmedStdProjectCreatePlanAfterAction({ jobId: latestBundle.job.job_id, planId });
      }
      return {
        status: "failed",
        blockers: ["create_response_explicitly_failed"],
        evidenceRefs: [],
        outputSummary: {
          readbackStatus: "skipped_after_explicit_create_failure",
          objectNameSource: "launch_drafts.project_name",
          objectNameMatchesDraft: false,
          realPlatformReadbackCalled: false,
          createResponseConfirmed: false,
          responseAnomalyPreserved: false,
          userVisibleSummary: "创建请求已被平台明确拒绝，已停止且禁止自动重试。"
        }
      };
    }
    const readback = await readbackStdProjectOnce({
      repo,
      jobId: latestBundle.job.job_id,
      target: { grantSource },
      fetchImpl,
      readbackDelaysMs: grantSource === "test_fake_transport" ? [0] : undefined
    });
    const projectIdMismatch = readback.status === "project_id_mismatch";
    const projectNameMismatch = readback.status === "project_name_mismatch";
    const identityMismatch = projectIdMismatch || projectNameMismatch;
    const recoveredByReadback = readback.status === "readback_verified" && responseUnknown;
    const readbackMissAfterUnconfirmedCreate = readback.status !== "readback_verified" && responseUnknown;
    if (readbackMissAfterUnconfirmedCreate) {
      const planId = latestBundle.executionPlan?.plan_id || "";
      if (planId && typeof repo.finalizeConfirmedStdProjectCreatePlanAfterAction === "function") {
        await repo.finalizeConfirmedStdProjectCreatePlanAfterAction({ jobId: latestBundle.job.job_id, planId });
      }
    }
    return {
      status: readback.status === "readback_verified"
        ? "passed"
        : identityMismatch
          ? "blocked"
        : readbackMissAfterUnconfirmedCreate
          ? "failed"
          : "blocked",
      blockers: readback.status === "readback_verified"
        ? []
        : projectIdMismatch
          ? ["readback_project_id_mismatch"]
          : projectNameMismatch
            ? ["readback_project_name_mismatch"]
        : readbackMissAfterUnconfirmedCreate
          ? ["create_response_unconfirmed_readback_not_found"]
          : ["created_pending_readback"],
      evidenceRefs: readback.evidenceRef ? [readback.evidenceRef] : [],
      outputSummary: {
        readbackStatus: readback.status === "readback_verified"
          ? "readback_verified"
          : projectIdMismatch
            ? "project_id_mismatch"
            : projectNameMismatch
              ? "project_name_mismatch"
          : readbackMissAfterUnconfirmedCreate
            ? "create_unconfirmed_readback_not_found"
            : "created_pending_readback",
        objectNameSource: "launch_drafts.project_name",
        objectNameMatchesDraft: Boolean(readback.objectNameMatches),
        realPlatformReadbackCalled: true,
        realObjectIdPresent: Boolean(readback.objectId),
        readbackAttemptCount: Array.isArray(readback.readbackAttempts) ? readback.readbackAttempts.length : 0,
        createResponseConfirmed: responseConfirmed,
        projectIdMatchesCreate: readback.projectIdMatchesCreate !== false,
        recoveredByReadback,
        responseAnomalyPreserved: responseUnknown,
        userVisibleSummary: recoveredByReadback
          ? "创建响应未确认，已通过回查确认对象创建成功。"
          : projectIdMismatch
            ? "创建响应与回查项目 ID 不一致，已停止且禁止自动重试。"
            : projectNameMismatch
              ? "创建响应与回查项目名称不一致，已停止且禁止自动重试。"
          : readbackMissAfterUnconfirmedCreate
            ? "本轮创建未确认成功，已停止；重新发送需求可开启新轮次。"
            : "真实创建已调用，等待只读回查确认。",
        evidenceRef: readback.evidenceRef || ""
      }
    };
  }

  return {
    status: "locked",
    blockers: ["readback_requires_created_object_or_explicit_readback_only"],
    outputSummary: {
      readbackStatus: latestBundle.readback?.readback_status || "not_run",
      objectNameSource: "launch_drafts.project_name",
      realPlatformReadbackCalled: false
    }
  };
}
