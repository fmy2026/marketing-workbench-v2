import { createOceanEngineReadonlyClient } from "../../../platforms/oceanengineReadonlyClient.mjs";
import { runOceanEngineBaselineResourceProbes } from "../../../platforms/oceanengineReadonlyAdapter.mjs";
import { assertNoSensitiveLeak, hashValue, sanitizeForPublic } from "./00-contracts.mjs";
import { readonlyPermissionState } from "./00-readonly-permission.mjs";

function safeCredential(credential = {}) {
  return {
    status: credential.status || "credential_required",
    envFilePresent: Boolean(credential.envFilePresent),
    appIdPresent: Boolean(credential.appIdPresent),
    accessTokenPresent: Boolean(credential.accessTokenPresent),
    refreshTokenPresent: Boolean(credential.refreshTokenPresent),
    tokenExpired: Boolean(credential.tokenExpired),
    blockers: credential.blockers || []
  };
}

async function recordEvidence({ repo, bundle, result }) {
  const artifactId = `EV-${bundle.job.job_id}-NODE4-BASELINE-READONLY`;
  const probes = result.probes || [];
  const probeSummary = probes.map((probe) => ({
    label: probe.label || "",
    endpoint: probe.endpoint || "",
    status: probe.status || "",
    httpStatus: probe.httpStatus ?? null,
    apiCode: probe.apiCode || "",
    requestIdPresent: Boolean(probe.requestIdPresent),
    responseHashPresent: Boolean(probe.responseHash),
    responseHash: String(probe.label || "").includes("avatar") ? probe.responseHash || "" : "",
    avatarDiagnostic: String(probe.label || "").includes("avatar") ? sanitizeForPublic({
      avatar_status: probe.summary?.avatarStatus || "unknown",
      avatar_ready: probe.summary?.avatarReady === true,
      avatar_readiness_reason: probe.summary?.avatarReadinessReason || "",
      image_present: probe.summary?.imagePresent === true,
      width: Number(probe.summary?.width || 0),
      height: Number(probe.summary?.height || 0)
    }) : null,
    requestFieldManifest: probe.requestFieldManifest || null
  }));
  const requestFieldSummary = probeSummary
    .filter((probe) => probe.requestFieldManifest)
    .map((probe) => {
      const manifest = probe.requestFieldManifest || {};
      return `${probe.label}_fields=${(manifest.fieldNames || []).join(",")}; ` +
        `origin_req_fields=${(manifest.originReqFieldNames || []).join(",")}; ` +
        `forbidden_top_level=${(manifest.forbiddenTopLevelFieldNames || []).join(",")}`;
    });
  const avatarDiagnosticSummary = probeSummary
    .filter((probe) => probe.avatarDiagnostic)
    .map((probe) => {
      const diagnostic = probe.avatarDiagnostic || {};
      return `${probe.label}_avatar_status=${diagnostic.avatar_status || "unknown"}; ` +
        `avatar_ready=${diagnostic.avatar_ready === true}; ` +
        `image_present=${diagnostic.image_present === true}; ` +
        `avatar_readiness_reason=${diagnostic.avatar_readiness_reason || ""}`;
    });
  const summary = [
    `status=${result.status || "not_run"}`,
    `probe_count=${probeSummary.length}`,
    `request_id_present_count=${probeSummary.filter((item) => item.requestIdPresent).length}`,
    `response_hash_present_count=${probeSummary.filter((item) => item.responseHashPresent).length}`,
    ...avatarDiagnosticSummary,
    ...requestFieldSummary,
    "response_body_stored=false"
  ].join("; ");
  await repo.upsertEvidence({
    artifactId,
    jobId: bundle.job.job_id,
    artifactType: "baseline_resource_readonly_reconcile",
    title: "Node 4 JSZC 保底资源目标账户只读核验",
    summary,
    contentHash: hashValue({ status: result.status || "not_run", probes: probeSummary }),
    storageRef: `postgres:mwb.evidence_artifacts/${artifactId}`,
    sourceRef: "oceanengine:baseline_resource_readonly",
    sourceUsage: bundle.job.source_usage || "runtime_truth"
  });
  return { artifactId, probeSummary };
}

export async function runPlatformReadonlyReconcileSkill({
  repo,
  bundle,
  client = createOceanEngineReadonlyClient(),
  allowReadonlyDependency = false,
  mockReady = false
} = {}) {
  if (mockReady) {
    return {
      status: "passed",
      blockers: [],
      outputSummary: {
        readonlyStatus: "mock_not_run",
        probeCount: 0,
        resourceUpdateCount: 0,
        permissionStatus: "mock_ready",
        nextAction: "测试夹具不调用平台。"
      }
    };
  }
  if (bundle?.job?.source_usage === "test_run" && !allowReadonlyDependency) {
    return {
      status: "passed",
      blockers: [],
      outputSummary: {
        readonlyStatus: "not_run_test_scope",
        probeCount: 0,
        resourceUpdateCount: 0,
        permissionStatus: "test_scope_no_external_dependency",
        nextAction: "测试运行不调用平台。"
      }
    };
  }
  const permission = readonlyPermissionState({ allowReadonlyDependency });
  if (!permission.allowed) {
    return {
      status: "passed",
      blockers: [],
      outputSummary: {
        readonlyStatus: "not_run",
        probeCount: 0,
        resourceUpdateCount: 0,
        permissionStatus: permission.status,
        nextAction: "等待显式真实只读授权。"
      }
    };
  }

  const result = await runOceanEngineBaselineResourceProbes({ bundle, client });
  const { artifactId, probeSummary } = await recordEvidence({ repo, bundle, result });
  for (const update of result.resourceUpdates || []) {
    const checkedAt = new Date().toISOString();
    const resourceMetadata = sanitizeForPublic({
      ...(update.resourceMetadata || {}),
      ...(update.resourceType === "avatar"
        ? {
          avatar_readonly_diagnostic: {
            ...((update.resourceMetadata || {}).avatar_readonly_diagnostic || {}),
            checked_at: checkedAt,
            evidence_ref: artifactId
          }
        }
        : {})
    });
    await repo.updateAccountResourceReadonly({
      routeId: bundle.job.route_id,
      gameCode: bundle.job.game_code,
      advertiserId: bundle.job.advertiser_id,
      resourceType: update.resourceType,
      visibilityStatus: update.visibilityStatus,
      readbackStatus: update.readbackStatus,
      platformResourceId: update.platformResourceId,
      inheritanceStatus: update.inheritanceStatus,
      metadata: {
        ...(update.readonlyCheck || {}),
        checked_at: checkedAt,
        evidence_refs: [artifactId]
      },
      resourceMetadata
    });
  }
  const output = sanitizeForPublic({
    status: result.status || "blocked",
    blockers: result.blockers || [],
    evidenceRefs: [artifactId],
    outputSummary: {
      readonlyStatus: result.status || "blocked",
      probeCount: probeSummary.length,
      resourceUpdateCount: (result.resourceUpdates || []).length,
      credential: safeCredential(result.credential),
      checks: result.checks || [],
      probes: probeSummary,
      evidenceRef: artifactId,
      rawRequestStored: false,
      rawResponseStored: false
    }
  });
  assertNoSensitiveLeak(output);
  return output;
}
