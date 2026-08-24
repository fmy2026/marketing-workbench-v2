import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import { createOceanEngineReadonlyClient } from "../src/platforms/oceanengineReadonlyClient.mjs";
import { prepareStdProjectCreate } from "../src/platforms/oceanengineStdProjectCreateExecutor.mjs";
import { hashValue, assertNoSensitiveLeak } from "../src/workflows/skills/oe3/contracts.mjs";

const TARGET = {
  jobId: "JOB-MWBV2-20260824092327-494BF1",
  advertiserId: "1871922175825993",
  referenceProjectId: "7675218401040220179",
  referenceProjectName: "245791_N_JSZC_HUNT_PAY7DROI_平台定向不限_P01_20260817"
};

function clean(value) {
  return String(value ?? "").trim();
}

function typeName(value) {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

function dataList(payload = {}) {
  const data = payload.data || {};
  return [data.list, data.items, data.projects, data.records].find(Array.isArray) || [];
}

function projectId(item = {}) {
  return clean(item.project_id || item.std_project_id || item.id);
}

function projectName(item = {}) {
  return clean(item.name || item.project_name || item.std_project_name);
}

function projectProjection(item = {}) {
  const fields = [
    "project_id",
    "name",
    "ad_type",
    "landing_type",
    "marketing_goal",
    "delivery_mode",
    "delivery_medium",
    "native_type",
    "app_promotion_type",
    "status_first",
    "status_second",
    "opt_status",
    "bid_type",
    "budget_mode",
    "pricing",
    "aweme_id",
    "asset_id",
    "product_id",
    "product_platform_id",
    "unique_product_id"
  ];
  return Object.fromEntries(fields.map((field) => {
    const value = item[field];
    return [field, {
      present: value !== undefined && value !== null && value !== "",
      type: typeName(value),
      enum_value: ["string", "number", "boolean"].includes(typeof value) &&
        !/(id|name)$/i.test(field)
        ? clean(value)
        : undefined
    }];
  }));
}

function summarizeReferenceStdProject(payload = {}) {
  const items = dataList(payload);
  const exact = items.find((item) => projectId(item) === TARGET.referenceProjectId) ||
    items.find((item) => projectName(item) === TARGET.referenceProjectName) ||
    {};
  return {
    listCount: items.length,
    exactProjectIdMatched: projectId(exact) === TARGET.referenceProjectId,
    exactNameMatched: projectName(exact) === TARGET.referenceProjectName,
    firstProjectIdPresent: Boolean(projectId(items[0] || {})),
    referenceProjection: Object.keys(exact).length ? projectProjection(exact) : {}
  };
}

function manifestShape(manifest = {}) {
  return {
    requiredFieldsPresent: manifest.requiredFieldsPresent === true,
    advertiserIdType: clean(manifest.advertiserIdType),
    appIdPresent: manifest.appIdPresent === true,
    eventAssetIdPresent: manifest.eventAssetIdPresent === true,
    eventAssetIdType: clean(manifest.eventAssetIdType),
    microAppInstanceIdPresent: manifest.microAppInstanceIdPresent === true,
    microAppInstanceIdType: clean(manifest.microAppInstanceIdType),
    awemeIdPresent: manifest.awemeIdPresent === true,
    productImageCount: Number(manifest.productImageCount || 0),
    videoMaterialCount: Number(manifest.videoMaterialCount || 0),
    videoIdReadyCount: Number(manifest.videoIdReadyCount || 0),
    videoCoverReadyCount: Number(manifest.videoCoverReadyCount || 0),
    titleMaterialCount: Number(manifest.titleMaterialCount || 0),
    touchpointUrlControlledPresent: manifest.touchpointUrlControlledPresent === true,
    audienceGender: clean(manifest.audienceGender),
    hideIfConverted: clean(manifest.hideIfConverted),
    dmpRetargetingTagsExcludeCount: Number(manifest.dmpRetargetingTagsExcludeCount || 0),
    dmpRetargetingTagsExcludeIntegerArray: manifest.dmpRetargetingTagsExcludeIntegerArray === true,
    brandInfo: manifest.brandInfo || {},
    forbiddenFieldsPresent: manifest.forbiddenFieldsPresent === true,
    blockersCount: Array.isArray(manifest.blockers) ? manifest.blockers.length : 0
  };
}

function statusByNode(bundle = {}) {
  return Object.fromEntries((bundle.nodes || []).map((node) => [node.node_key, node.status]));
}

async function platformActionCounts(repo, jobId) {
  const state = await repo.getCreateAttemptState(jobId);
  return {
    createActionCount: Number(state.createActionCount || 0),
    confirmationCount: Number(state.confirmationCount || 0),
    createdObjectCount: Number(state.createdObjectCount || 0),
    realReadbackCount: Number(state.realReadbackCount || 0)
  };
}

function summarizeComparison({ bundle, prepared, referenceProbe, readonlyCallCount, attemptState }) {
  const contractGaps = prepared.payloadContractStatus === "passed" ? [] : ["payload_contract_not_passed"];
  const preflightBlockers = prepared.createPreflight?.blocker_codes || [];
  const provenBlockers = [...new Set([...contractGaps, ...preflightBlockers])];
  const referencePassed = referenceProbe.status === "passed" &&
    referenceProbe.summary?.exactProjectIdMatched === true &&
    referenceProbe.summary?.exactNameMatched === true;
  const excluded = [
    ...(prepared.payloadContractStatus === "passed" ? ["payload_contract_current_v2_passed"] : []),
    ...(prepared.createPreflight?.status === "passed" ? ["create_preflight_current_v2_passed"] : []),
    ...(prepared.payloadHashStable ? ["payload_hash_stable"] : []),
    ...(prepared.redactedPayloadSummary?.brand_info_present ? ["brand_info_present"] : []),
    ...(prepared.redactedPayloadSummary?.event_asset_id_present ? ["event_asset_id_present"] : []),
    ...(prepared.redactedPayloadSummary?.touchpoint_present ? ["touchpoint_controlled_present"] : []),
    ...(referencePassed ? ["reference_p01_readback_projection_matched"] : [])
  ];
  const inconclusive = [
    "p01_std_project_list_projection_is_not_original_create_payload",
    "p03_api_code_40000_raw_message_not_retained",
    "official_doc_advertiser_id_type_is_number_but_v2_keeps_long_ids_as_string_by_policy",
    ...(referenceProbe.status === "credential_required" ? ["reference_readonly_credential_required"] : []),
    ...(referenceProbe.status === "blocked" ? ["reference_readonly_not_passed"] : []),
    ...((attemptState.createActionCount || 0) === 1 ? ["p03_has_one_real_create_attempt_and_is_not_reusable"] : [])
  ];
  return {
    status: provenBlockers.length ? "blocked_by_reusable_contract_rule" : "inconclusive_no_new_reusable_blocker",
    targetJob: {
      jobId: bundle.job.job_id,
      jobStatus: bundle.job.job_status,
      currentNode: bundle.job.current_node,
      retryAllowed: false
    },
    attemptState,
    nodeStatuses: statusByNode(bundle),
    p03RequestManifest: manifestShape(prepared.payload?.requestFieldManifest || prepared.createPreflight?.requestFieldManifest || prepared.bundle?.draft?.payload_summary?.final_payload_manifest || {}),
    p03CreatePreflight: {
      status: prepared.createPreflight?.status || "not_run",
      blockerCount: Number(prepared.createPreflight?.blocker_count || 0),
      blockerCodes: preflightBlockers
    },
    p03PayloadContractStatus: prepared.payloadContractStatus,
    p03PayloadHashStable: prepared.payloadHashStable === true,
    p03RedactedPayloadSummary: prepared.redactedPayloadSummary,
    referenceReadonly: {
      status: referenceProbe.status,
      endpoint: referenceProbe.endpoint,
      httpStatus: referenceProbe.httpStatus,
      apiCode: referenceProbe.apiCode,
      requestIdPresent: referenceProbe.requestIdPresent,
      dataPresent: referenceProbe.dataPresent,
      responseHashPresent: Boolean(referenceProbe.responseHash),
      summary: referenceProbe.summary || {}
    },
    referenceCallCount: readonlyCallCount,
    contractReferences: {
      oldSuccessScript: "read_only_reference:field_allowlist_forbidden_paths_type_rules",
      officialDocs: [
        "std_project/create fields",
        "std_project/list response projection",
        "delivery_medium BYTE_GAME",
        "landing_type MICRO_GAME",
        "track_url_setting.action_track_url"
      ]
    },
    provenBlockers,
    excluded,
    inconclusive,
    exactP03RootCause: "still_unknown_without_safe_platform_error_message"
  };
}

const repo = new PostgresRepository();
const bundle = await repo.getLaunchJobBundle(TARGET.jobId);
if (!bundle) throw new Error(`target_job_not_found:${TARGET.jobId}`);
const beforeAttemptState = await platformActionCounts(repo, TARGET.jobId);
const prepared = await prepareStdProjectCreate({ repo, jobId: TARGET.jobId });

let readonlyCallCount = 0;
const client = createOceanEngineReadonlyClient({
  fetchImpl: async (url, options) => {
    readonlyCallCount += 1;
    if (readonlyCallCount > 1) throw new Error("readonly_call_limit_exceeded");
    return globalThis.fetch(url, options);
  }
});

const referenceProbe = await client.get({
  label: "reference_p01_std_project_projection",
  endpoint: "/open_api/v3.0/std_project/list/",
  query: {
    advertiser_id: TARGET.advertiserId,
    filtering: JSON.stringify({
      project_ids: [TARGET.referenceProjectId],
      name: TARGET.referenceProjectName
    }),
    page: "1",
    page_size: "20"
  },
  summarize: summarizeReferenceStdProject
});

const afterAttemptState = await platformActionCounts(repo, TARGET.jobId);
const report = summarizeComparison({
  bundle,
  prepared,
  referenceProbe,
  readonlyCallCount,
  attemptState: afterAttemptState
});

assertNoSensitiveLeak(report);

if (beforeAttemptState.createActionCount !== 1 || afterAttemptState.createActionCount !== 1) {
  throw new Error("p03_create_action_count_changed_or_invalid");
}
if (beforeAttemptState.createdObjectCount !== 0 || afterAttemptState.createdObjectCount !== 0) {
  throw new Error("p03_created_object_count_changed_or_invalid");
}
if (bundle.job.job_status !== "failed_waiting_manual_review") {
  throw new Error(`p03_job_status_changed:${bundle.job.job_status}`);
}

const artifactId = `EV-${TARGET.jobId}-REFERENCE-CONTRACT-RECONCILIATION`;
await repo.upsertEvidence({
  artifactId,
  jobId: TARGET.jobId,
  artifactType: "std_project_reference_contract_readonly_reconciliation",
  title: "P03 vs P01 reference contract readonly reconciliation",
  summary: [
    `status=${report.status}`,
    `reference_readonly=${report.referenceReadonly.status}`,
    `reference_call_count=${report.referenceCallCount}`,
    `proven_blockers=${report.provenBlockers.length}`,
    `excluded=${report.excluded.length}`,
    `inconclusive=${report.inconclusive.length}`,
    `p03_create_actions=${report.attemptState.createActionCount}`,
    `created_objects=${report.attemptState.createdObjectCount}`,
    `exact_root_cause=${report.exactP03RootCause}`,
    "raw_payload_stored=false",
    "raw_response_stored=false"
  ].join(" "),
  contentHash: hashValue(report),
  storageRef: "postgres:evidence_artifacts:redacted_summary_only",
  sourceRef: "v2:oe3-reference-contract-readonly-reconciliation",
  sourceUsage: "runtime_truth"
});

console.log(JSON.stringify({
  status: "passed",
  artifactId,
  report
}, null, 2));
