import { createOceanEngineReadonlyClient } from "../../../platforms/oceanengineReadonlyClient.mjs";
import { hashValue, sanitizeForPublic } from "./00-contracts.mjs";
import { readonlyPermissionState } from "./00-readonly-permission.mjs";
import { clean } from "./04-resource-verifiers.mjs";

const SEMANTIC_FIELDS = Object.freeze([
  "asset_id",
  "landing_type",
  "native_type",
  "delivery_medium",
  "marketing_goal",
  "external_action",
  "deep_external_action",
  "deep_bid_type",
  "bid_type"
]);
const SEMANTIC_PAGE_SIZE = 100;
const SEMANTIC_MAX_PAGES = 20;

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

function normalizeValue(value) {
  return clean(value);
}

function semanticContract(bundle = {}) {
  const raw = bundle.defaults?.raw_defaults || {};
  const contract = raw.duplicate_semantic_contract || {};
  const fields = Array.isArray(contract.field_paths) ? contract.field_paths : [];
  return {
    statusFirst: clean(contract.status_first),
    fields,
    valid: clean(contract.version) && clean(contract.status_first) === "ALL_EXCEPT_DELETE" &&
      JSON.stringify(fields) === JSON.stringify(SEMANTIC_FIELDS)
  };
}

function semanticTarget(bundle = {}, fields = []) {
  const payloadDefaults = bundle.defaults?.raw_defaults?.payload_defaults || {};
  const project = payloadDefaults.project || {};
  const strategy = payloadDefaults.strategy || {};
  const eventAsset = (bundle.resources || []).find((resource) => resource.resource_type === "event_asset") || {};
  const valuesByField = {
    asset_id: eventAsset.platform_resource_id,
    landing_type: project.landing_type,
    native_type: project.native_type,
    delivery_medium: strategy.delivery_medium,
    marketing_goal: project.marketing_goal,
    external_action: bundle.defaults?.objective,
    deep_external_action: bundle.defaults?.deep_objective,
    deep_bid_type: bundle.defaults?.deep_bid_type,
    bid_type: strategy.bid_type
  };
  const values = Object.fromEntries(fields.map((field) => [field, normalizeValue(valuesByField[field])]));
  return {
    values,
    complete: fields.every((field) => Boolean(values[field]))
  };
}

function semanticCandidate(item = {}, fields = []) {
  const values = Object.fromEntries(fields.map((field) => [field, normalizeValue(item[field])]));
  return {
    objectId: objectId(item),
    objectName: objectName(item),
    values,
    complete: Boolean(objectId(item)) && fields.every((field) => Boolean(values[field]))
  };
}

function sameSemanticTarget(candidate = {}, target = {}, fields = []) {
  return candidate.complete && target.complete && fields.every((field) => candidate.values[field] === target.values[field]);
}

function summarizeNamePage(payload = {}, projectName = "") {
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

function summarizeSemanticPage(payload = {}, fields = []) {
  const items = extractItems(payload);
  return {
    listCount: items.length,
    candidates: items.map((item) => semanticCandidate(item, fields))
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
    `name_duplicate_found=${Boolean(summary.nameDuplicateFound)}`,
    `semantic_duplicate_found=${Boolean(summary.semanticDuplicateFound)}`,
    `semantic_candidate_count=${Number(summary.semanticCandidateCount || 0)}`,
    `semantic_candidate_incomplete_count=${Number(summary.semanticCandidateIncompleteCount || 0)}`,
    `matched_object_id_present=${Boolean(summary.matchedObjectId)}`,
    "response_body_stored=false"
  ].join("; ");
  await repo.upsertEvidence({
    artifactId,
    jobId: bundle.job.job_id,
    artifactType: "std_project_duplicate_readonly",
    title: "std_project/list 同名与语义查重只读证据",
    summary: evidenceSummary,
    contentHash: probe?.responseHash || hashValue({ evidenceSummary, projectName: draft.project_name }),
    storageRef: `postgres:mwb.evidence_artifacts/${artifactId}`,
    sourceRef: probe?.endpoint ? `oceanengine:${probe.endpoint}` : "project_state:guardrails",
    sourceUsage: bundle.job.source_usage || "runtime_truth"
  });
  return artifactId;
}

async function failClosed({ repo, bundle, draft, status, probe = null, summary = {}, blockers, reason }) {
  const evidenceRef = await recordDuplicateEvidence({ repo, bundle, draft, status, probe, summary });
  await repo.updateDraftDuplicateStatus(draft.draft_id, status);
  return sanitizeForPublic({
    status: "blocked",
    blockers,
    evidenceRefs: [evidenceRef],
    outputSummary: {
      status,
      checkedAt: new Date().toISOString(),
      duplicateFound: Boolean(summary.nameDuplicateFound || summary.semanticDuplicateFound),
      matchMode: summary.matchMode || "",
      matchedObjectId: summary.matchedObjectId || "",
      semanticCandidateCount: Number(summary.semanticCandidateCount || 0),
      semanticCandidateIncompleteCount: Number(summary.semanticCandidateIncompleteCount || 0),
      evidenceRef,
      reason,
      httpStatus: probe?.httpStatus ?? null,
      apiCode: probe?.apiCode || "",
      requestIdPresent: Boolean(probe?.requestIdPresent)
    }
  });
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
    return failClosed({
      repo, bundle, draft,
      status: "readonly_permission_required",
      summary: {},
      blockers: permission.blockers,
      reason: "project.state.json 未开放真实平台只读依赖"
    });
  }

  const credential = client.credentialState();
  if (credential.status !== "ready") {
    return failClosed({
      repo, bundle, draft,
      status: "credential_required",
      summary: {},
      blockers: ["credential_required", ...(credential.blockers || [])],
      reason: "真实平台只读凭据不可用或已过期"
    });
  }

  const contract = semanticContract(bundle);
  const target = semanticTarget(bundle, contract.fields);
  if (!contract.valid || !target.complete) {
    return failClosed({
      repo, bundle, draft,
      status: "semantic_duplicate_contract_invalid",
      summary: {},
      blockers: ["semantic_duplicate_contract_invalid"],
      reason: "路线语义查重合同或当前 Draft 标的字段不完整"
    });
  }

  const nameProbe = await client.get({
    label: "std_project_duplicate_name",
    endpoint: "/open_api/v3.0/std_project/list/",
    query: {
      advertiser_id: clean(bundle.job.advertiser_id),
      filtering: JSON.stringify({ name: projectName, status_first: contract.statusFirst }),
      page: "1",
      page_size: "20"
    },
    summarize: (payload) => summarizeNamePage(payload, projectName)
  });
  const nameSummary = nameProbe.summary || {};
  if (nameProbe.status !== "passed") {
    return failClosed({
      repo, bundle, draft,
      status: "platform_duplicate_check_failed",
      probe: nameProbe,
      summary: {},
      blockers: ["duplicate_readonly_probe_not_passed"],
      reason: nameProbe.gap || "平台同名查重未确认通过"
    });
  }

  if (nameSummary.duplicateFound) {
    return failClosed({
      repo, bundle, draft,
      status: "platform_duplicate_found",
      probe: nameProbe,
      summary: {
        nameDuplicateFound: true,
        matchedObjectId: nameSummary.matchedObjectId || "",
        matchMode: "name"
      },
      blockers: ["platform_duplicate_found"],
      reason: "平台 std_project/list 发现未删除同名项目"
    });
  }

  const candidates = [];
  let semanticProbe = null;
  let semanticPageComplete = false;
  for (let page = 1; page <= SEMANTIC_MAX_PAGES; page += 1) {
    semanticProbe = await client.get({
      label: "std_project_duplicate_semantic",
      endpoint: "/open_api/v3.0/std_project/list/",
      query: {
        advertiser_id: clean(bundle.job.advertiser_id),
        filtering: JSON.stringify({ status_first: contract.statusFirst }),
        page: String(page),
        page_size: String(SEMANTIC_PAGE_SIZE)
      },
      summarize: (payload) => summarizeSemanticPage(payload, contract.fields)
    });
    if (semanticProbe.status !== "passed") {
      return failClosed({
        repo, bundle, draft,
        status: "platform_duplicate_check_failed",
        probe: semanticProbe,
        summary: { semanticCandidateCount: candidates.length },
        blockers: ["duplicate_readonly_probe_not_passed"],
        reason: semanticProbe.gap || "平台语义查重未确认通过"
      });
    }
    const pageCandidates = semanticProbe.summary?.candidates || [];
    candidates.push(...pageCandidates);
    if (pageCandidates.length < SEMANTIC_PAGE_SIZE) {
      semanticPageComplete = true;
      break;
    }
  }

  const incompleteCandidates = candidates.filter((candidate) => !candidate.complete);
  const semanticMatch = candidates.find((candidate) => sameSemanticTarget(candidate, target, contract.fields)) || null;
  const semanticSummary = {
    semanticCandidateCount: candidates.length,
    semanticCandidateIncompleteCount: incompleteCandidates.length,
    semanticDuplicateFound: Boolean(semanticMatch),
    matchedObjectId: semanticMatch?.objectId || "",
    matchMode: semanticMatch ? "semantic" : ""
  };
  if (!semanticPageComplete || incompleteCandidates.length) {
    return failClosed({
      repo, bundle, draft,
      status: "platform_duplicate_check_failed",
      probe: semanticProbe,
      summary: semanticSummary,
      blockers: ["semantic_duplicate_readonly_incomplete"],
      reason: !semanticPageComplete
        ? "标准项目列表超过受控分页上限，无法确认语义不重复"
        : "标准项目列表缺少语义查重合同字段"
    });
  }
  if (semanticMatch) {
    return failClosed({
      repo, bundle, draft,
      status: "platform_duplicate_found",
      probe: semanticProbe,
      summary: semanticSummary,
      blockers: ["platform_duplicate_found"],
      reason: "平台 std_project/list 发现未删除同语义标的与竞价策略项目"
    });
  }

  const evidenceRef = await recordDuplicateEvidence({
    repo,
    bundle,
    draft,
    status: "platform_not_duplicate",
    probe: semanticProbe,
    summary: semanticSummary
  });
  await repo.updateDraftDuplicateStatus(draft.draft_id, "platform_not_duplicate");
  return sanitizeForPublic({
    status: "passed",
    blockers: [],
    evidenceRefs: [evidenceRef],
    outputSummary: {
      status: "platform_not_duplicate",
      checkedAt: new Date().toISOString(),
      duplicateFound: false,
      matchMode: "",
      matchedObjectId: "",
      semanticCandidateCount: candidates.length,
      semanticCandidateIncompleteCount: 0,
      evidenceRef,
      reason: "平台 std_project/list 未发现未删除同名或同语义标的项目",
      httpStatus: semanticProbe?.httpStatus ?? null,
      apiCode: semanticProbe?.apiCode || "",
      requestIdPresent: Boolean(semanticProbe?.requestIdPresent)
    }
  });
}
