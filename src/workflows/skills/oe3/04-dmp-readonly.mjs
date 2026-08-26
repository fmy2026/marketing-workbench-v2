import { createOceanEngineReadonlyClient } from "../../../platforms/oceanengineReadonlyClient.mjs";
import { hashValue, sanitizeForPublic } from "./00-contracts.mjs";
import { readonlyPermissionState } from "./00-readonly-permission.mjs";
import { clean, dmpCustomAudienceIds, resource } from "./04-resource-verifiers.mjs";

function numberId(value) {
  const text = clean(value);
  if (!/^\d+$/.test(text)) return "";
  return text;
}

function unique(values = []) {
  return [...new Set(values.map(clean).filter(Boolean))];
}

function extractCustomAudienceIds(value) {
  const found = [];
  function walk(item) {
    if (Array.isArray(item)) {
      item.forEach(walk);
      return;
    }
    if (!item || typeof item !== "object") return;
    for (const [key, child] of Object.entries(item)) {
      if (["custom_audience_id", "custom_audience_ids", "audience_package_id", "retargeting_tags_exclude"].includes(key)) {
        const values = Array.isArray(child) ? child : [child];
        values.map(numberId).filter(Boolean).forEach((id) => found.push(id));
      }
      walk(child);
    }
  }
  walk(value);
  return unique(found);
}

function summarizeDmp(payload = {}) {
  const customAudienceIds = extractCustomAudienceIds(payload?.data || payload);
  return {
    customAudienceIdCount: customAudienceIds.length,
    customAudienceIds,
    dataPresent: Boolean(payload?.data)
  };
}

function credentialSummary(credential = {}) {
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

async function recordDmpEvidence({ repo, bundle, status, probe, customAudienceIds }) {
  const artifactId = `EV-${bundle.job.job_id}-DMP-CUSTOM-AUDIENCE-READONLY`;
  const summary = [
    `status=${status}`,
    `endpoint=${probe?.endpoint || "not_called"}`,
    `api_code=${probe?.apiCode || "none"}`,
    `http=${probe?.httpStatus ?? "none"}`,
    `request_id_present=${Boolean(probe?.requestIdPresent)}`,
    `custom_audience_id_count=${customAudienceIds.length}`,
    "response_body_stored=false"
  ].join("; ");
  await repo.upsertEvidence({
    artifactId,
    jobId: bundle.job.job_id,
    artifactType: "dmp_readonly_gate",
    title: "DMP custom_audience_id[] 只读 gate",
    summary,
    contentHash: probe?.responseHash || hashValue({ summary, customAudienceIdCount: customAudienceIds.length }),
    storageRef: `postgres:mwb.evidence_artifacts/${artifactId}`,
    sourceRef: probe?.endpoint ? `oceanengine:${probe.endpoint}` : "postgres:mwb.account_resources",
    sourceUsage: bundle.job.source_usage || "runtime_truth"
  });
  return artifactId;
}

async function persistDmpMetadata({ repo, bundle, status, customAudienceIds, evidenceRef, blocker }) {
  if (bundle.job.source_usage === "test_run") return;
  await repo.updateAccountResourceReadonly({
    routeId: bundle.job.route_id,
    gameCode: bundle.job.game_code,
    advertiserId: bundle.job.advertiser_id,
    resourceType: "dmp_audience_package",
    visibilityStatus: status === "passed" ? "visible" : undefined,
    readbackStatus: status === "passed" ? "readback_verified" : undefined,
    metadata: {
      status,
      key: "platform_dmp_custom_audience",
      gap: blocker || "",
      next_action: status === "passed" ? "无需动作" : "补齐或确认平台 DMP custom_audience_id[]",
      custom_audience_ids: customAudienceIds,
      checked_at: new Date().toISOString(),
      evidence_refs: [evidenceRef].filter(Boolean)
    },
    resourceMetadata: {
      custom_audience_ids: customAudienceIds
    }
  });
}

function resultFromIds({ item, customAudienceIds, source, evidenceRef = "" }) {
  const ready = customAudienceIds.length > 0;
  return {
    status: ready ? "passed" : "blocked",
    blockers: ready ? [] : ["dmp_custom_audience_ids_missing"],
    evidenceRefs: evidenceRef ? [evidenceRef] : [],
    customAudienceIds,
    outputSummary: {
      resourceType: "dmp_audience_package",
      label: "DMP",
      visibilityStatus: item.visibility_status || "missing",
      readbackStatus: item.readback_status || "missing",
      readonlyStatus: ready ? "passed" : (item.metadata?.readonly_check?.status || "blocked"),
      ready,
      platformResourceIdPresent: Boolean(item.platform_resource_id),
      semanticPlatformResourceIdExcludedFromPayload: !/^\d+$/.test(clean(item.platform_resource_id)),
      dmpCustomAudienceIdsPresent: ready,
      dmpCustomAudienceIdCount: customAudienceIds.length,
      customAudienceIdSource: source,
      payloadField: "audience.retargeting_tags_exclude",
      evidenceRef,
      nextAction: ready ? "无需动作" : "补齐平台 custom_audience_id[] 并只读验证"
    }
  };
}

export async function runDmpReadonlyGate({
  repo,
  bundle,
  client = createOceanEngineReadonlyClient(),
  mockReady = false,
  allowReadonlyDependency = false
} = {}) {
  const item = resource(bundle, "dmp_audience_package");
  if (!item.resource_type) {
    return resultFromIds({ item, customAudienceIds: [], source: "missing_account_resource" });
  }

  const existingIds = mockReady ? ["100000000001"] : dmpCustomAudienceIds(bundle);
  const requiresFreshReadonly = bundle.job.source_usage === "runtime_truth" && !mockReady;
  if (existingIds.length && !requiresFreshReadonly) {
    const evidenceRef = await recordDmpEvidence({
      repo,
      bundle,
      status: "passed",
      probe: null,
      customAudienceIds: existingIds
    });
    await persistDmpMetadata({
      repo,
      bundle,
      status: "passed",
      customAudienceIds: existingIds,
      evidenceRef
    });
    return resultFromIds({
      item,
      customAudienceIds: existingIds,
      source: mockReady ? "mock_ready" : "postgres_readonly_metadata",
      evidenceRef
    });
  }

  const permission = readonlyPermissionState({ allowReadonlyDependency });
  if (!permission.allowed) {
    const evidenceRef = await recordDmpEvidence({
      repo,
      bundle,
      status: "readonly_permission_required",
      probe: null,
      customAudienceIds: []
    });
    await persistDmpMetadata({
      repo,
      bundle,
      status: "blocked",
      customAudienceIds: [],
      evidenceRef,
      blocker: "readonly_permission_required"
    });
    return {
      status: "blocked",
      blockers: permission.blockers,
      evidenceRefs: [evidenceRef],
      customAudienceIds: [],
      outputSummary: {
        resourceType: "dmp_audience_package",
        label: "DMP",
        visibilityStatus: item.visibility_status || "missing",
        readbackStatus: item.readback_status || "missing",
        readonlyStatus: "readonly_permission_required",
        ready: false,
        platformResourceIdPresent: Boolean(item.platform_resource_id),
        dmpCustomAudienceIdsPresent: false,
        dmpCustomAudienceIdCount: 0,
        payloadField: "audience.retargeting_tags_exclude",
        evidenceRef,
        nextAction: "在 project.state.json.guardrails 中仅开放真实平台只读依赖后重跑"
      }
    };
  }

  const credential = client.credentialState();
  if (credential.status !== "ready") {
    const evidenceRef = await recordDmpEvidence({
      repo,
      bundle,
      status: "credential_required",
      probe: null,
      customAudienceIds: []
    });
    await persistDmpMetadata({
      repo,
      bundle,
      status: "credential_required",
      customAudienceIds: [],
      evidenceRef,
      blocker: "credential_required"
    });
    return {
      status: "blocked",
      blockers: ["credential_required", ...credential.blockers],
      evidenceRefs: [evidenceRef],
      customAudienceIds: [],
      outputSummary: {
        resourceType: "dmp_audience_package",
        label: "DMP",
        visibilityStatus: item.visibility_status || "missing",
        readbackStatus: item.readback_status || "missing",
        readonlyStatus: "credential_required",
        ready: false,
        platformResourceIdPresent: Boolean(item.platform_resource_id),
        dmpCustomAudienceIdsPresent: false,
        dmpCustomAudienceIdCount: 0,
        credential: credentialSummary(credential),
        payloadField: "audience.retargeting_tags_exclude",
        evidenceRef,
        nextAction: "处理 v2 OceanEngine 凭据后重跑只读 DMP gate"
      }
    };
  }

  const advertiserId = clean(bundle.job.advertiser_id);
  const preferredId = numberId(item.platform_resource_id);
  const probe = await client.get({
    label: "dmp_custom_audience",
    endpoint: "dmp/custom_audience/select",
    query: {
      advertiser_id: advertiserId,
      ...(preferredId && Number.isSafeInteger(Number(preferredId))
        ? { custom_audience_ids: JSON.stringify([Number(preferredId)]) }
        : {}),
      page: "1",
      page_size: "100"
    },
    summarize: summarizeDmp
  });
  const customAudienceIds = probe.status === "passed" ? (probe.summary?.customAudienceIds || []) : [];
  const status = customAudienceIds.length ? "passed" : "blocked";
  const evidenceRef = await recordDmpEvidence({
    repo,
    bundle,
    status,
    probe,
    customAudienceIds
  });
  await persistDmpMetadata({
    repo,
    bundle,
    status,
    customAudienceIds,
    evidenceRef,
    blocker: status === "passed" ? "" : "dmp_custom_audience_ids_missing"
  });
  const result = resultFromIds({
    item,
    customAudienceIds,
    source: "oceanengine_readonly_probe",
    evidenceRef
  });
  if (status !== "passed") {
    result.blockers = [probe.status === "passed" ? "dmp_custom_audience_ids_missing" : "dmp_readonly_probe_not_passed"];
    result.outputSummary.readonlyStatus = probe.status || "blocked";
    result.outputSummary.apiCode = probe.apiCode || "";
    result.outputSummary.httpStatus = probe.httpStatus ?? null;
    result.outputSummary.requestIdPresent = Boolean(probe.requestIdPresent);
  }
  return sanitizeForPublic(result);
}
