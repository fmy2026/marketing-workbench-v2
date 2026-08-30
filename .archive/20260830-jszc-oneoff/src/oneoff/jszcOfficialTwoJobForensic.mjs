import { PostgresRepository } from "../repositories/postgresRepository.mjs";
import { buildHistoricalTemplatePayload } from "./jszcHistoricalTemplateCreate.mjs";
import { evaluateCreateFieldLedger } from "../workflows/skills/oe3/05-create-field-ledger.mjs";
import { assertNoSensitiveLeak, sanitizeForPublic } from "../workflows/skills/oe3/00-contracts.mjs";

export const P02_BASELINE_JOB_ID = "JOB-MWBV2-20260830010824-488F0E";
export const HISTORICAL_ONEOFF_JOB_ID = "JOB-MWBV2-HISTORICAL-20260830015756-E5D9E1D9";
export const P02_BASELINE_PAYLOAD_HASH = "sha256:f2c98efc3a7279634e91501013c5009f7a39940d1aa03b6c78b0b8ce73eae104";
export const HISTORICAL_ONEOFF_PAYLOAD_HASH = "sha256:52805c0dec2e2d9139acd142569ec42cc9b5e809d3ab0cf8354e1f616e8d9ff1";

export const OFFICIAL_CONTRACT_MATRIX = Object.freeze([
  {
    path: "advertiser_id",
    officialType: "number",
    requirement: "required",
    byteGameApplicability: "direct",
    primaryReference: "official-main:request-fields:advertiser_id",
    supplementalReference: "official-rich:request-fields:advertiser_id",
    evidenceLevel: "official_direct"
  },
  {
    path: "delivery_medium",
    officialType: "string",
    requirement: "conditional",
    byteGameApplicability: "BYTE_GAME",
    primaryReference: "official-main:delivery-medium",
    supplementalReference: "official-rich:delivery-medium",
    evidenceLevel: "official_direct"
  },
  {
    path: "instance_id",
    officialType: "number",
    requirement: "conditional",
    byteGameApplicability: "micro-game-instance",
    primaryReference: "official-main:instance-id",
    supplementalReference: "official-rich:instance-id",
    evidenceLevel: "official_direct"
  },
  {
    path: "micro_promotion_type",
    officialType: "absent-from-create-contract",
    requirement: "not-defined-for-create",
    byteGameApplicability: "related-readonly-query-only",
    primaryReference: "official-main:create-contract:no-field",
    supplementalReference: "official-related:optimized-goal-query",
    evidenceLevel: "official_related_endpoint"
  },
  {
    path: "project_materials.mini_program_info.url",
    officialType: "string",
    requirement: "conditional",
    byteGameApplicability: "checked-for-correctness",
    primaryReference: "official-main:mini-program-info",
    supplementalReference: "official-rich:mini-program-info",
    evidenceLevel: "official_direct"
  },
  {
    path: "project_materials.mini_program_info.app_id",
    officialType: "string",
    requirement: "conditional",
    byteGameApplicability: "unnecessary-when-url-is-sent",
    primaryReference: "official-main:mini-program-info",
    supplementalReference: "official-rich:mini-program-info",
    evidenceLevel: "official_direct"
  },
  {
    path: "project_materials.external_url_material_list",
    officialType: "string[]",
    requirement: "conditional",
    byteGameApplicability: "trigger-and-mutual-exclusion-unspecified",
    primaryReference: "official-main:landing-links",
    supplementalReference: "official-rich:landing-links:count-1-10",
    evidenceLevel: "official_direct_condition_incomplete"
  },
  {
    path: "project_materials.image_material_list",
    officialType: "object[]",
    requirement: "optional-or-unspecified",
    byteGameApplicability: "empty-vs-omit-unspecified",
    primaryReference: "official-main:image-materials",
    supplementalReference: "official-rich:image-materials",
    evidenceLevel: "official_direct_shape_only"
  },
  {
    path: "project_materials.video_material_list.[].video_cover_id",
    officialType: "string",
    requirement: "optional",
    byteGameApplicability: "platform-default-cover-supported",
    primaryReference: "official-main:video-materials",
    supplementalReference: "official-rich:video-cover-default",
    evidenceLevel: "official_direct"
  },
  {
    path: "track_url_setting.action_track_url",
    officialType: "string[]",
    requirement: "conditional-container",
    byteGameApplicability: "macro-and-length-contract-unspecified",
    primaryReference: "official-main:tracking",
    supplementalReference: "official-rich:tracking",
    evidenceLevel: "official_direct_condition_incomplete"
  }
]);

const IMPORTANT_PATHS = Object.freeze(OFFICIAL_CONTRACT_MATRIX.map((item) => item.path));
const SHARED_ACCEPTANCE_PATHS = Object.freeze([
  "aweme_id",
  "asset_id",
  "instance_id",
  "audience.retargeting_tags_exclude",
  "brand_info.yuntu_category_id",
  "brand_info.cdp_brand_id",
  "brand_info.brand_name_id",
  "brand_info.cdp_brand_name",
  "project_materials.video_material_list.[].video_id",
  "project_materials.product_info.image_ids",
  "project_materials.mini_program_info.url",
  "track_url_setting.action_track_url"
]);
const LOCAL_ERROR_CATEGORIES = new Set([
  "invalid_field",
  "permission_denied",
  "resource_not_eligible",
  "landing_url_invalid",
  "unclassified"
]);

function clean(value) {
  return String(value ?? "").trim();
}

function unique(values = []) {
  return [...new Set(values)];
}

function stableSort(values = []) {
  return [...values].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function strictSafetyCheck(value) {
  assertNoSensitiveLeak(value);
  const serialized = JSON.stringify(value);
  if (/(?:https?|sslocal):\/\//i.test(serialized)) throw new Error("complete_link_literal_forbidden");
  if (/\b(?:Bearer|Access-Token|X-Passport-Token)\b/i.test(serialized)) throw new Error("credential_literal_forbidden");
  if (/\"requestId\"\s*:/i.test(serialized)) throw new Error("complete_request_id_forbidden");
  return value;
}

function ledgerEntries(ledger = {}) {
  return Array.isArray(ledger.entries) ? ledger.entries : [];
}

function entrySignature(entry = {}) {
  return {
    sendPolicy: clean(entry.sendPolicy),
    valueType: clean(entry.valueType),
    itemCount: entry.itemCount ?? null,
    stringLength: entry.stringLength ?? null,
    valueHash: clean(entry.valueHash)
  };
}

function indexLedger(ledger = {}) {
  const indexed = new Map();
  for (const entry of ledgerEntries(ledger)) {
    const path = clean(entry.path);
    if (!path) continue;
    const list = indexed.get(path) || [];
    list.push(entrySignature(entry));
    indexed.set(path, list);
  }
  for (const [path, values] of indexed) indexed.set(path, stableSort(values));
  return indexed;
}

function sentEntriesForPath(ledger = {}, path = "") {
  return ledgerEntries(ledger).filter((entry) => entry.path === path && entry.sendPolicy === "send");
}

function omittedEntriesForPath(ledger = {}, path = "") {
  return ledgerEntries(ledger).filter((entry) => entry.path === path && entry.sendPolicy === "omit");
}

export function summarizeFieldShape(ledger = {}, path = "") {
  const sent = sentEntriesForPath(ledger, path);
  const omitted = omittedEntriesForPath(ledger, path);
  return {
    path,
    presence: sent.length ? "sent" : omitted.length ? "omitted" : "not_recorded",
    sentEntryCount: sent.length,
    omittedEntryCount: omitted.length,
    valueTypes: unique(sent.map((entry) => clean(entry.valueType)).filter(Boolean)).sort(),
    itemCounts: unique(sent.map((entry) => entry.itemCount).filter((value) => value !== null && value !== undefined)).sort((a, b) => a - b),
    stringLengths: unique(sent.map((entry) => entry.stringLength).filter((value) => value !== null && value !== undefined)).sort((a, b) => a - b),
    valueHashes: sent.map((entry) => clean(entry.valueHash)).filter(Boolean).sort(),
    valuesPersisted: false
  };
}

export function compareFieldLedgers(leftLedger = {}, rightLedger = {}) {
  const left = indexLedger(leftLedger);
  const right = indexLedger(rightLedger);
  const paths = unique([...left.keys(), ...right.keys()]).sort();
  const exactPaths = [];
  const changedPaths = [];
  for (const path of paths) {
    const leftSignature = left.get(path) || [];
    const rightSignature = right.get(path) || [];
    if (JSON.stringify(leftSignature) === JSON.stringify(rightSignature)) {
      exactPaths.push(path);
    } else {
      changedPaths.push({
        path,
        left: summarizeFieldShape(leftLedger, path),
        right: summarizeFieldShape(rightLedger, path)
      });
    }
  }
  return {
    pathCount: paths.length,
    exactPathCount: exactPaths.length,
    changedPathCount: changedPaths.length,
    exactPaths,
    changedPaths
  };
}

export function validateSingleVariableLedgerDiff({
  baselineLedger = {},
  candidateLedger = {},
  candidatePath = "",
  allowedNonBusinessPaths = ["name"]
} = {}) {
  const comparison = compareFieldLedgers(baselineLedger, candidateLedger);
  const changedPaths = comparison.changedPaths.map((item) => item.path);
  const allowed = new Set([...allowedNonBusinessPaths, candidatePath].filter(Boolean));
  const unexpectedPaths = changedPaths.filter((path) => !allowed.has(path));
  const candidateChanged = Boolean(candidatePath && changedPaths.includes(candidatePath));
  return {
    status: candidateChanged && unexpectedPaths.length === 0 ? "passed" : "blocked",
    candidatePath,
    candidateChanged,
    changedPaths,
    unexpectedPaths,
    allowedNonBusinessPaths: [...allowedNonBusinessPaths],
    payloadBodyPersisted: false
  };
}

export function classifySafePlatformFailure(action = {}) {
  const category = clean(action.error_category || action.errorCategory);
  const fieldPath = clean(action.offending_field_path || action.offendingFieldPath);
  return {
    category: LOCAL_ERROR_CATEGORIES.has(category) ? category : "unclassified",
    fieldPathPresent: Boolean(fieldPath),
    causalityStatus: fieldPath ? "platform_field_path_recorded" : "local_safe_category_only",
    fieldRootCauseProven: Boolean(fieldPath),
    responseBodyPersisted: false
  };
}

export function selectSingleVariableCandidate({
  miniProgram = {},
  tracking = {},
  resource = {},
  externalPage = {},
  commonStructural = {}
} = {}) {
  if (miniProgram.status === "mismatch" && miniProgram.verifiedReplacementPresent === true) {
    return {
      status: "selected",
      candidatePath: "project_materials.mini_program_info.url",
      reason: "target_account_mini_program_binding_mismatch_with_verified_replacement",
      futureCreateAllowed: false
    };
  }
  if (tracking.status === "invalid" && tracking.verifiedReplacementPresent === true) {
    return {
      status: "selected",
      candidatePath: "track_url_setting.action_track_url",
      reason: "tracking_contract_invalid_with_verified_replacement",
      futureCreateAllowed: false
    };
  }
  if (resource.status === "ineligible" && resource.verifiedReplacementPresent === true && clean(resource.candidatePath)) {
    return {
      status: "selected",
      candidatePath: clean(resource.candidatePath),
      reason: "target_resource_ineligible_with_existing_verified_replacement",
      futureCreateAllowed: false
    };
  }
  const allSharedBindingsPassed = miniProgram.status === "passed" &&
    tracking.status === "passed" &&
    resource.status === "passed" &&
    externalPage.status === "passed";
  if (allSharedBindingsPassed && commonStructural.imageEmptyArrayShared === true) {
    return {
      status: "selected",
      candidatePath: "project_materials.image_material_list",
      reason: "official_optional_empty_vs_omit_structural_test",
      futureCreateAllowed: false
    };
  }
  return {
    status: "blocked_no_verified_single_variable",
    candidatePath: "",
    reason: "shared_link_or_resource_acceptance_not_authoritatively_resolved",
    futureCreateAllowed: false
  };
}

function p02Ledger(bundle = {}) {
  const ledger = bundle.draft?.payload_summary?.final_payload_manifest?.createFieldLedger || {};
  if (!Array.isArray(ledger.entries)) throw new Error("p02_create_field_ledger_missing");
  return ledger;
}

function safeAction(action = {}) {
  return {
    actionStatus: clean(action.action_status),
    attemptNo: Number(action.attempt_no || 0),
    method: clean(action.method),
    endpointPath: clean(action.endpoint),
    requestHash: clean(action.request_hash),
    responseHash: clean(action.response_hash),
    httpStatus: action.http_status ?? null,
    apiCode: clean(action.api_code),
    requestIdPresent: action.request_id_present === true,
    objectIdPresent: action.object_id_present === true,
    failure: classifySafePlatformFailure(action),
    payloadBodyPersisted: false,
    responseBodyPersisted: false
  };
}

function safeReadback(readback = {}) {
  const summary = readback.field_diff_summary || {};
  const attempts = Array.isArray(summary.readback_attempts) ? summary.readback_attempts : [];
  return {
    status: clean(readback.readback_status),
    attemptCount: attempts.length,
    delaysMs: attempts.map((item) => Number(item.delay_ms ?? item.delayMs ?? 0)),
    results: attempts.map((item) => ({
      httpStatus: item.http_status ?? item.httpStatus ?? null,
      apiCode: clean(item.api_code ?? item.apiCode),
      requestIdPresent: item.request_id_present === true || item.requestIdPresent === true,
      responseHashPresent: Boolean(item.response_hash || item.responseHash),
      objectFound: item.object_found === true || item.objectFound === true,
      nameMatched: item.name_matched === true || item.nameMatched === true
    })),
    objectConfirmed: summary.create_response_confirmed === true || summary.object_name_matches_draft === true,
    responseBodyPersisted: false
  };
}

function numericAudit(audit = {}) {
  return {
    drafts: Number(audit.drafts || 0),
    executionPlans: Number(audit.executionPlans || 0),
    readbackRecords: Number(audit.readbackRecords || 0),
    launchConfirmations: Number(audit.launchConfirmations || 0),
    platformActions: Number(audit.platformActions || 0),
    createdObjects: Number(audit.createdObjects || 0),
    evidenceArtifacts: Number(audit.evidenceArtifacts || 0),
    nodeRuns: Number(audit.nodeRuns || 0),
    skillRuns: Number(audit.skillRuns || 0)
  };
}

function safeJobSnapshot({ bundle = {}, audit = {}, action = {}, expectedHash = "" } = {}) {
  const plan = bundle.executionPlan || {};
  const draft = bundle.draft || {};
  const hashChecks = {
    draftMatchesExpected: clean(draft.payload_hash) === expectedHash,
    planMatchesDraft: clean(plan.payload_hash) === clean(draft.payload_hash),
    actionMatchesDraft: clean(action.request_hash) === clean(draft.payload_hash)
  };
  return {
    jobId: clean(bundle.job?.job_id),
    caseId: clean(bundle.job?.case_id),
    jobStatus: clean(bundle.job?.job_status),
    currentNode: clean(bundle.job?.current_node),
    sourceUsage: clean(bundle.job?.source_usage),
    projectName: clean(draft.project_name),
    draftId: clean(draft.draft_id),
    payloadHash: clean(draft.payload_hash),
    planId: clean(plan.plan_id),
    planStatus: clean(plan.plan_status),
    planHash: clean(plan.plan_hash),
    duplicateStatus: clean(draft.duplicate_status),
    hashChecks,
    hashChainPassed: Object.values(hashChecks).every(Boolean),
    audit: numericAudit(audit),
    action: safeAction(action),
    readback: safeReadback(bundle.readback || {}),
    valuesPersistedInDiagnostic: false
  };
}

function evidenceTypes(bundle = {}) {
  return unique((bundle.evidence || []).map((item) => clean(item.artifact_type)).filter(Boolean)).sort();
}

function persistedCoverage(bundle = {}) {
  const manifest = bundle.draft?.payload_summary?.final_payload_manifest || {};
  const resources = bundle.resources || [];
  const requiredResources = resources.filter((item) => item.required === true);
  const resourcePassedCount = requiredResources.filter((item) =>
    item.visibility_status === "visible" &&
    item.readback_status === "readback_verified" &&
    ["passed", "passed_by_manual_confirmation"].includes(clean(item.metadata?.readonly_check?.status))
  ).length;
  const types = evidenceTypes(bundle);
  return {
    optimizedGoal: {
      status: types.includes("objective_contract_readiness") ? "passed" : "not_recorded",
      evidenceLevel: "job_local_readonly_artifact"
    },
    miniProgram: {
      status: manifest.miniProgramLaunchLinkHashMatch === true &&
        manifest.miniProgramLaunchLinkAppIdMatch === true &&
        manifest.miniProgramLaunchLinkPlatformAppIdMatch === true &&
        manifest.instanceIdCreateEvidence?.status === "passed"
        ? "partial"
        : "unresolved",
      localHashMatch: manifest.miniProgramLaunchLinkHashMatch === true,
      appBindingMatch: manifest.miniProgramLaunchLinkAppIdMatch === true,
      platformAppBindingMatch: manifest.miniProgramLaunchLinkPlatformAppIdMatch === true,
      relatedGoalReadbackPassed: types.includes("objective_contract_readiness"),
      correctnessEndpointAvailable: false,
      verifiedReplacementPresent: false,
      evidenceLevel: "local_binding_plus_related_endpoint_not_create_url_acceptance"
    },
    tracking: {
      status: manifest.touchpointUrlControlledPresent === true ? "partial" : "unresolved",
      controlledValuePresent: manifest.touchpointUrlControlledPresent === true,
      macroContractVerified: false,
      verifiedReplacementPresent: false,
      evidenceLevel: "controlled_hash_only"
    },
    resource: {
      status: requiredResources.length > 0 && resourcePassedCount === requiredResources.length ? "passed" : "unresolved",
      requiredCount: requiredResources.length,
      passedCount: resourcePassedCount,
      verifiedReplacementPresent: false,
      candidatePath: "",
      evidenceLevel: "target_account_readback"
    },
    externalPage: {
      status: manifest.backupLandingPagePresent === true &&
        manifest.backupLandingPageHttps === true &&
        manifest.backupLandingPageTargetVisible === true &&
        manifest.backupLandingPageReadbackVerified === true &&
        manifest.backupLandingPageHashMatch === true
        ? "partial"
        : "unresolved",
      resourcePassed: manifest.backupLandingPageReadbackVerified === true,
      byteGameApplicabilityVerified: false,
      evidenceLevel: "resource_readback_without_route_trigger_contract"
    },
    evidenceTypes: types
  };
}

function historicalContractFindings(historicalLedger = {}) {
  const advertiser = summarizeFieldShape(historicalLedger, "advertiser_id");
  const microPromotion = summarizeFieldShape(historicalLedger, "micro_promotion_type");
  const miniApp = summarizeFieldShape(historicalLedger, "project_materials.mini_program_info.app_id");
  return [
    {
      path: "advertiser_id",
      status: advertiser.valueTypes.includes("string") ? "confirmed_direct_contract_deviation" : "not_observed",
      reason: "official_number_but_historical_wire_string",
      causalFor40000: false
    },
    {
      path: "micro_promotion_type",
      status: microPromotion.presence === "sent" ? "confirmed_sent_not_defined_in_create_contract" : "not_observed",
      reason: "field_defined_by_related_optimized_goal_query_not_create_contract",
      causalFor40000: false
    },
    {
      path: "project_materials.mini_program_info.app_id",
      status: miniApp.presence === "sent" ? "over_specified_unproven" : "not_observed",
      reason: "official_says_unnecessary_when_url_is_sent_but_does_not_forbid_coexistence",
      causalFor40000: false
    }
  ];
}

function lifecycleProjection(bundle = {}, summary = {}) {
  const actionFailed = bundle.platformAction?.action_status === "failed_or_unconfirmed";
  const readbackFailed = bundle.readback?.readback_status === "not_found_after_create";
  const projectionStillAwaitingAuthorization = summary.current_gate === "await_job_write_authorization";
  return {
    status: actionFailed && readbackFailed && projectionStillAwaitingAuthorization ? "inconsistent_separate_audit_issue" : "consistent_or_not_applicable",
    latestJobStatus: clean(summary.latest_job_status),
    currentGate: clean(summary.current_gate),
    suggestedNextAction: clean(summary.suggested_next_action),
    payloadRootCauseImpact: "none",
    remediationBundledIntoCandidate: false
  };
}

function importantMatrix(p02 = {}, historical = {}) {
  return OFFICIAL_CONTRACT_MATRIX.map((rule) => ({
    ...rule,
    p02: summarizeFieldShape(p02, rule.path),
    historical: summarizeFieldShape(historical, rule.path)
  }));
}

function wireTransportEvidence({ p02Bundle = {}, historicalPayload = {}, historicalWire = {} } = {}) {
  const p02Manifest = p02Bundle.draft?.payload_summary?.final_payload_manifest || {};
  return {
    advertiserId: {
      officialType: "number",
      p02StorageType: clean(p02Manifest.advertiserIdStorageType),
      p02WireType: clean(p02Manifest.advertiserIdTransportType),
      p02WireSafe: p02Manifest.advertiserIdTransportSafe === true,
      historicalPayloadType: typeof historicalPayload.advertiser_id,
      historicalWireType: typeof historicalPayload.advertiser_id,
      historicalDeviationConfirmed: typeof historicalPayload.advertiser_id === "string"
    },
    instanceId: {
      officialType: "number",
      p02StorageType: clean(p02Manifest.microAppInstanceIdType),
      p02WireType: p02Manifest.microAppInstanceIdWireNumberTokenPresent === true ? "number_token" : "unverified",
      p02Lossless: p02Manifest.microAppInstanceIdTransportLossless === true,
      historicalStorageType: typeof historicalPayload.instance_id,
      historicalWireType: historicalWire.instanceIdWireNumberTokenPresent === true ? "number_token" : "unverified",
      historicalLossless: historicalWire.status === "passed" &&
        historicalWire.instanceIdWireNumberTokenPresent === true
    },
    payloadBodyPersisted: false
  };
}

export async function analyzeJszcOfficialTwoJobForensic({
  repo = new PostgresRepository(),
  p02JobId = P02_BASELINE_JOB_ID,
  historicalJobId = HISTORICAL_ONEOFF_JOB_ID
} = {}) {
  if (p02JobId !== P02_BASELINE_JOB_ID) throw new Error("unsupported_p02_baseline_job");
  if (historicalJobId !== HISTORICAL_ONEOFF_JOB_ID) throw new Error("unsupported_historical_job");

  const [p02Bundle, historicalBundle, p02Audit, historicalAudit] = await Promise.all([
    repo.getLaunchJobBundle(p02JobId),
    repo.getLaunchJobBundle(historicalJobId),
    repo.getLaunchJobAuditCounts(p02JobId),
    repo.getLaunchJobAuditCounts(historicalJobId)
  ]);
  if (!p02Bundle?.job || !historicalBundle?.job) throw new Error("target_job_bundle_missing");

  const [p02Action, historicalAction, p02CaseSummary, touchpoint, launchLink] = await Promise.all([
    repo.getPlatformAction(p02Bundle.platformAction?.action_id || ""),
    repo.getPlatformAction(historicalBundle.platformAction?.action_id || ""),
    repo.getWorkflowCaseSummary(p02Bundle.job.case_id),
    repo.getControlledTouchpointUrl({
      routeId: historicalBundle.job.route_id,
      gameCode: historicalBundle.job.game_code,
      advertiserId: historicalBundle.job.advertiser_id,
      monitorId: historicalBundle.account?.monitor_id || ""
    }),
    repo.getControlledGameRouteLaunchLink({
      routeId: historicalBundle.job.route_id,
      gameCode: historicalBundle.job.game_code,
      platformAppId: historicalBundle.platformApp?.id || "",
      appId: historicalBundle.platformApp?.app_id || ""
    })
  ]);

  const compiledHistorical = buildHistoricalTemplatePayload({
    bundle: historicalBundle,
    touchpointUrl: touchpoint?.touchpoint_url || "",
    launchLink: launchLink || {}
  });
  if (compiledHistorical.payloadHash !== HISTORICAL_ONEOFF_PAYLOAD_HASH) {
    throw new Error("historical_deterministic_recompile_hash_mismatch");
  }

  const p02 = p02Ledger(p02Bundle);
  const historical = evaluateCreateFieldLedger(compiledHistorical.payload, {
    externalUrlMaterialListPolicy: "omit"
  });
  const comparison = compareFieldLedgers(p02, historical);
  const coverage = persistedCoverage(p02Bundle);
  const candidate = selectSingleVariableCandidate({
    miniProgram: coverage.miniProgram,
    tracking: coverage.tracking,
    resource: coverage.resource,
    externalPage: coverage.externalPage,
    commonStructural: {
      imageEmptyArrayShared: summarizeFieldShape(p02, "project_materials.image_material_list").itemCounts.includes(0) &&
        summarizeFieldShape(historical, "project_materials.image_material_list").itemCounts.includes(0)
    }
  });

  const output = sanitizeForPublic({
    status: "completed_readonly_forensic",
    target: {
      advertiserId: p02Bundle.job.advertiser_id,
      routeId: p02Bundle.job.route_id,
      gameCode: p02Bundle.job.game_code,
      futureBaseline: "p02_full_contract_chain"
    },
    jobs: {
      p02: safeJobSnapshot({ bundle: p02Bundle, audit: p02Audit, action: p02Action || {}, expectedHash: P02_BASELINE_PAYLOAD_HASH }),
      historical: safeJobSnapshot({ bundle: historicalBundle, audit: historicalAudit, action: historicalAction || {}, expectedHash: HISTORICAL_ONEOFF_PAYLOAD_HASH })
    },
    contractMatrix: importantMatrix(p02, historical),
    wireTransport: wireTransportEvidence({
      p02Bundle,
      historicalPayload: compiledHistorical.payload,
      historicalWire: compiledHistorical.wire
    }),
    comparison: {
      pathCount: comparison.pathCount,
      exactPathCount: comparison.exactPathCount,
      changedPathCount: comparison.changedPathCount,
      exactImportantPaths: comparison.exactPaths.filter((path) => IMPORTANT_PATHS.includes(path)),
      importantDifferences: comparison.changedPaths.filter((item) => IMPORTANT_PATHS.includes(item.path)),
      exactSharedAcceptancePaths: comparison.exactPaths.filter((path) => SHARED_ACCEPTANCE_PATHS.includes(path)),
      changedSharedAcceptancePaths: comparison.changedPaths
        .map((item) => item.path)
        .filter((path) => SHARED_ACCEPTANCE_PATHS.includes(path)),
      jobsAreSingleVariableControl: false
    },
    p02ContractChain: {
      nodeRunCount: (p02Bundle.nodes || []).length,
      skillRunCount: (p02Bundle.skillRuns || []).length,
      ledgerEntryCount: ledgerEntries(p02).length,
      ledgerBlockedCount: Number(p02.blockedPathCount || 0),
      nestedContractPassed: p02Bundle.draft?.payload_summary?.final_payload_manifest?.nestedFieldContract?.status === "passed",
      fullChainBaseline: true
    },
    historicalContractChain: {
      nodeRunCount: (historicalBundle.nodes || []).length,
      skillRunCount: (historicalBundle.skillRuns || []).length,
      persistedNestedLedgerPresent: false,
      deterministicRecompileHashMatched: true,
      fullChainBaseline: false,
      findings: historicalContractFindings(historical)
    },
    commonMainIssue: {
      status: "acceptance_gap_not_field_root_cause",
      statement: "The target-account BYTE_GAME landing, launch, tracking and resource combination has not been accepted by create.",
      evidence: "Both requests failed with no field path and no list-confirmed object while sharing core link and resource hashes.",
      causalFieldProven: false
    },
    persistedReadonlyCoverage: coverage,
    candidate,
    futureExperiment: {
      enabled: false,
      baselineJobId: p02JobId,
      baselinePayloadHash: P02_BASELINE_PAYLOAD_HASH,
      candidatePath: candidate.candidatePath,
      allowedNonBusinessPaths: ["name"],
      maximumCreateActions: 0,
      reason: candidate.status === "selected"
        ? "A separate Task and exact user confirmation are still required."
        : "No authoritative replacement value or all-pass shared-binding proof exists.",
      promotionAllowed: false,
      resourceWriteAllowed: false,
      credentialRefreshAllowed: false
    },
    lifecycleProjection: lifecycleProjection(p02Bundle, p02CaseSummary || {}),
    safety: {
      databaseWriteCalled: false,
      platformWriteCalled: false,
      platformReadCalledByThisAnalysis: false,
      payloadBodyPersisted: false,
      responseBodyPersisted: false,
      completeLinkPersisted: false,
      completeRequestIdPersisted: false
    }
  });
  return strictSafetyCheck(output);
}

export function assertForensicOutputSafe(value) {
  return strictSafetyCheck(value);
}
