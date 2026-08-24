import { createOceanEngineReadonlyClient } from "../../../platforms/oceanengineReadonlyClient.mjs";
import { hashValue, sanitizeForPublic } from "./contracts.mjs";
import { readonlyPermissionState } from "./readonly-permission.mjs";
import { clean } from "./resource-verifiers.mjs";

function objectName(item = {}) {
  return clean(item.name || item.project_name || item.std_project_name);
}

function objectId(item = {}) {
  return clean(item.project_id || item.std_project_id || item.id);
}

function extractItems(payload = {}) {
  const data = payload.data || {};
  const list = data.list || data.items || data.projects || [];
  return Array.isArray(list) ? list : [];
}

function summarizeStdProjectList(payload = {}, projectName = "") {
  const items = extractItems(payload);
  const exact = items.find((item) => objectName(item) === projectName) || null;
  return {
    listCount: items.length,
    duplicateFound: Boolean(exact),
    matchedObjectId: exact ? objectId(exact) : "",
    matchedObjectName: exact ? objectName(exact) : "",
    checkedNamePresent: Boolean(projectName)
  };
}

async function recordDuplicateEvidence({ repo, bundle, draft, status, probe, summary }) {
  const artifactId = `EV-${bundle.job.job_id}-STD-PROJECT-DUPLICATE-READONLY`;
  const evidenceSummary = [
    `status=${status}`,
    `endpoint=${probe?.endpoint || "not_called"}`,
    `api_code=${probe?.apiCode || "none"}`,
    `http=${probe?.httpStatus ?? "none"}`,
    `request_id_present=${Boolean(probe?.requestIdPresent)}`,
    `duplicate_found=${Boolean(summary.duplicateFound)}`,
    `matched_object_id_present=${Boolean(summary.matchedObjectId)}`,
    "response_body_stored=false"
  ].join("; ");
  await repo.upsertEvidence({
    artifactId,
    jobId: bundle.job.job_id,
    artifactType: "std_project_duplicate_readonly",
    title: "std_project/list 同名查重只读证据",
    summary: evidenceSummary,
    contentHash: probe?.responseHash || hashValue({ evidenceSummary, projectName: draft.project_name }),
    storageRef: `postgres:mwb.evidence_artifacts/${artifactId}`,
    sourceRef: probe?.endpoint ? `oceanengine:${probe.endpoint}` : "project_state:guardrails",
    sourceUsage: bundle.job.source_usage || "runtime_truth"
  });
  return artifactId;
}

export async function runDuplicateReadonlyCheck({
  repo,
  bundle,
  client = createOceanEngineReadonlyClient(),
  mockReady = false,
  allowReadonlyDependency = false
} = {}) {
  const draft = bundle.draft || {};
  const projectName = clean(draft.project_name);

  if (mockReady) {
    await repo.updateDraftDuplicateStatus(draft.draft_id, "platform_not_duplicate");
    return {
      status: "passed",
      blockers: [],
      outputSummary: {
        status: "platform_not_duplicate",
        checkedAt: new Date().toISOString(),
        duplicateFound: false,
        matchedObjectId: "",
        evidenceRef: "",
        reason: "mock_ready"
      }
    };
  }

  const permission = readonlyPermissionState({ allowReadonlyDependency });
  if (!permission.allowed) {
    const evidenceRef = await recordDuplicateEvidence({
      repo,
      bundle,
      draft,
      status: permission.status,
      probe: null,
      summary: { duplicateFound: false, matchedObjectId: "" }
    });
    await repo.updateDraftDuplicateStatus(draft.draft_id, "readonly_permission_required");
    return {
      status: "blocked",
      blockers: permission.blockers,
      evidenceRefs: [evidenceRef],
      outputSummary: {
        status: "readonly_permission_required",
        checkedAt: new Date().toISOString(),
        duplicateFound: false,
        matchedObjectId: "",
        evidenceRef,
        reason: "project.state.json 未开放真实平台只读依赖"
      }
    };
  }

  const credential = client.credentialState();
  if (credential.status !== "ready") {
    const evidenceRef = await recordDuplicateEvidence({
      repo,
      bundle,
      draft,
      status: "credential_required",
      probe: null,
      summary: { duplicateFound: false, matchedObjectId: "" }
    });
    await repo.updateDraftDuplicateStatus(draft.draft_id, "credential_required");
    return {
      status: "blocked",
      blockers: ["credential_required", ...(credential.blockers || [])],
      evidenceRefs: [evidenceRef],
      outputSummary: {
        status: "credential_required",
        checkedAt: new Date().toISOString(),
        duplicateFound: false,
        matchedObjectId: "",
        evidenceRef,
        reason: "真实平台只读凭据不可用或已过期"
      }
    };
  }

  const probe = await client.get({
    label: "std_project_duplicate",
    endpoint: "/open_api/v3.0/std_project/list/",
    query: {
      advertiser_id: clean(bundle.job.advertiser_id),
      filtering: JSON.stringify({ name: projectName }),
      page: "1",
      page_size: "20"
    },
    summarize: (payload) => summarizeStdProjectList(payload, projectName)
  });
  const summary = probe.summary || {};
  const duplicateStatus = probe.status === "passed"
    ? summary.duplicateFound ? "platform_duplicate_found" : "platform_not_duplicate"
    : "platform_duplicate_check_failed";
  const evidenceRef = await recordDuplicateEvidence({
    repo,
    bundle,
    draft,
    status: duplicateStatus,
    probe,
    summary
  });
  await repo.updateDraftDuplicateStatus(draft.draft_id, duplicateStatus);

  const result = {
    status: duplicateStatus === "platform_not_duplicate" ? "passed" : "blocked",
    blockers: duplicateStatus === "platform_not_duplicate" ? [] : [
      duplicateStatus === "platform_duplicate_found"
        ? "platform_duplicate_found"
        : "duplicate_readonly_probe_not_passed"
    ],
    evidenceRefs: [evidenceRef],
    outputSummary: {
      status: duplicateStatus,
      checkedAt: new Date().toISOString(),
      duplicateFound: Boolean(summary.duplicateFound),
      matchedObjectId: summary.matchedObjectId || "",
      evidenceRef,
      reason: duplicateStatus === "platform_not_duplicate"
        ? "平台 std_project/list 未发现同名项目"
        : probe.gap || "平台 std_project/list 未确认不重复",
      httpStatus: probe.httpStatus ?? null,
      apiCode: probe.apiCode || "",
      requestIdPresent: Boolean(probe.requestIdPresent)
    }
  };
  return sanitizeForPublic(result);
}
