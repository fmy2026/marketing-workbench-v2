import { createOceanEngineReadonlyClient } from "../../../platforms/oceanengineReadonlyClient.mjs";
import { assertNoSensitiveLeak, hashValue, sanitizeForPublic } from "./00-contracts.mjs";
import { readonlyPermissionState } from "./00-readonly-permission.mjs";

export const AWEME_AUTHORIZATION_SKILL_KEY = "aweme-authorization-readonly";
export const AWEME_AUTHORIZATION_RULE_VERSION = "2026-08-29.aweme-id-fixed-default-account-verify-v3";
export const AWEME_AUTHORIZATION_ACCEPTED_STATUSES = new Set(["AUTHRIZED"]);
export const AWEME_FIXED_DEFAULT_VERIFICATION_STRATEGY = "fixed_game_default_account_verify";
export const AWEME_AUTHORIZATION_DISCOVERY_MAX_PAGES = 5;
export const AWEME_AUTHORIZATION_DISCOVERY_PAGE_SIZE = 100;

function clean(value) {
  return String(value ?? "").trim();
}

function arrayFrom(value) {
  return Array.isArray(value) ? value : [];
}

function safeDisplayName(value) {
  return clean(value).replace(/https?:\/\/\S+/gi, "[link]").slice(0, 80);
}

function awemeBaseline(bundle = {}) {
  return bundle.defaults?.raw_defaults?.aweme_id_baseline || {};
}

function defaultAwemeId(baseline = {}) {
  return clean(baseline.default_aweme_id);
}

function defaultAuthType(baseline = {}) {
  return clean(baseline.auth_type || "AWEME_ACCOUNT");
}

function payloadNativeType(bundle = {}) {
  return clean(bundle.defaults?.raw_defaults?.payload_defaults?.project?.native_type);
}

function baselineRequiresAweme(bundle = {}) {
  const nativeType = payloadNativeType(bundle);
  const requiredNativeType = clean(awemeBaseline(bundle).required_when?.native_type || "AWEME");
  return nativeType === "AWEME" || Boolean(requiredNativeType && nativeType === requiredNativeType);
}

function awemeList(payload = {}) {
  const data = payload.data || {};
  return [
    data.list,
    data.aweme_auth_list,
    data.aweme_list,
    data.items,
    payload.list
  ].find((item) => Array.isArray(item)) || [];
}

function normalizePageInfo(payload = {}) {
  const pageInfo = payload.data?.page_info || payload.page_info || {};
  const totalPage = Number(pageInfo.total_page || pageInfo.totalPage || 0);
  const page = Number(pageInfo.page || pageInfo.current_page || pageInfo.currentPage || 0);
  return {
    page: Number.isFinite(page) ? page : 0,
    totalPage: Number.isFinite(totalPage) ? totalPage : 0
  };
}

function normalizeAuthRow(item = {}) {
  const awemeId = clean(item.aweme_id || item.id || item.awemeId);
  return {
    advertiser_id: clean(item.advertiser_id || item.advertiserId),
    aweme_id: awemeId,
    aweme_id_hash: awemeId ? hashValue(awemeId) : "",
    display_name_summary: safeDisplayName(item.aweme_name || item.name || item.nickname || item.display_name),
    auth_type: clean(item.auth_type || item.authType || ""),
    auth_status: clean(item.auth_status || item.authStatus || item.status),
    share_type_present: Boolean(clean(item.share_type || item.shareType || "")),
    expires_at: clean(item.end_time || item.expire_time || item.expires_at || item.expire_at)
  };
}

function summarizeAwemeAuthList(payload = {}) {
  const rows = awemeList(payload).map(normalizeAuthRow).filter((item) => item.aweme_id);
  return {
    resultCount: rows.length,
    pageInfo: normalizePageInfo(payload),
    rows
  };
}

function acceptedStatuses(baseline = {}) {
  const configured = arrayFrom(baseline.accepted_auth_status)
    .map(clean)
    .filter((status) => AWEME_AUTHORIZATION_ACCEPTED_STATUSES.has(status));
  return configured.length ? configured : [...AWEME_AUTHORIZATION_ACCEPTED_STATUSES];
}

function authorizationExpired(row = {}) {
  const expiresAt = clean(row.expires_at);
  if (!expiresAt) return false;
  const timestamp = Date.parse(expiresAt);
  return Number.isFinite(timestamp) && timestamp <= Date.now();
}

function blockerForStatus(status) {
  const blockers = {
    authorized: "",
    not_authorized: "aweme_default_not_authorized",
    inactive: "aweme_default_authorization_inactive",
    scope_mismatch: "aweme_auth_account_scope_mismatch",
    default_mismatch: "aweme_default_not_returned",
    probe_failed: "aweme_auth_probe_failed",
    baseline_incomplete: "aweme_id_baseline_missing_or_incomplete",
    not_verified: "aweme_auth_not_verified"
  };
  return Object.prototype.hasOwnProperty.call(blockers, status) ? blockers[status] : "aweme_auth_not_verified";
}

function blockerForProbeFailure(probe = {}) {
  if (probe.status === "credential_required") return "credential_required";
  if (probe.status === "transport_failed") return "readonly_transport_failed";
  const httpStatus = Number(probe.httpStatus || 0);
  if ([401, 403].includes(httpStatus)) return "aweme_auth_credential_or_account_scope_failed";
  if (httpStatus === 400 || String(probe.apiCode || "").startsWith("400")) return "aweme_auth_request_parameter_rejected";
  return "aweme_auth_platform_api_failed";
}

function nextActionForBlocker(blockerCode = "") {
  return {
    credential_required: "refresh_or_restore_oceanengine_readonly_credentials_then_rerun_node4",
    readonly_transport_failed: "retry_oceanengine_readonly_connection_then_rerun_node4",
    aweme_auth_credential_or_account_scope_failed: "check_token_account_scope_and_app_permission_then_rerun_node4",
    aweme_auth_request_parameter_rejected: "fix_aweme_auth_list_request_contract_then_rerun_node4",
    aweme_auth_platform_api_failed: "inspect_oceanengine_aweme_auth_api_status_then_rerun_node4"
  }[blockerCode] || "";
}

function nextActionForStatus(status) {
  return {
    authorized: "ready_for_node5_payload_build",
    not_authorized: "authorize_default_aweme_id_for_advertiser_then_rerun_node4",
    inactive: "restore_default_aweme_id_authorization_then_rerun_node4",
    scope_mismatch: "check_advertiser_scope_and_default_aweme_authorization_then_rerun_node4",
    default_mismatch: "verify_platform_auth_query_filters_then_rerun_node4",
    probe_failed: "fix_readonly_query_or_credentials_then_rerun_node4",
    baseline_incomplete: "record_game_route_default_aweme_id",
    not_verified: "run_node4_aweme_authorization_readonly_for_default_aweme"
  }[status] || "run_node4_aweme_authorization_readonly_for_default_aweme";
}

function buildAuthorizationRecord({
  bundle,
  baseline,
  probe,
  verificationStatus,
  matchedRow = {},
  evidenceArtifactId = "",
  blockerCode = "",
  diagnostic = {}
}) {
  const defaultId = defaultAwemeId(baseline);
  const nextAction = nextActionForBlocker(blockerCode) || nextActionForStatus(verificationStatus);
  return sanitizeForPublic({
    rule_version: AWEME_AUTHORIZATION_RULE_VERSION,
    advertiser_id: clean(bundle.job?.advertiser_id),
    route_id: clean(bundle.job?.route_id),
    game_code: clean(bundle.job?.game_code),
    payload_path: clean(baseline.payload_path || "aweme_id"),
    source: clean(baseline.source || "tools/aweme_auth_list"),
    auth_type: clean(baseline.auth_type || "AWEME_ACCOUNT"),
    accepted_auth_status: acceptedStatuses(baseline),
    verification_strategy: AWEME_FIXED_DEFAULT_VERIFICATION_STRATEGY,
    default_aweme_id_configured: Boolean(defaultId),
    default_aweme_id_hash: defaultId ? hashValue(defaultId) : clean(baseline.default_aweme_id_hash),
    fallback_forbidden: baseline.fallback_forbidden !== false,
    verification_status: verificationStatus,
    verified_by_job_id: clean(bundle.job?.job_id),
    verified_at: new Date().toISOString(),
    expires_at: clean(matchedRow.expires_at),
    probe_profile: clean(diagnostic.probeProfile),
    http_status: diagnostic.httpStatus ?? null,
    platform_code: clean(diagnostic.platformCode),
    request_id_present: diagnostic.requestIdPresent === true,
    message_hash: clean(diagnostic.messageHash),
    response_hash: clean(probe?.responseHash),
    returned_row_count: Number(diagnostic.returnedRowCount || 0),
    primary_returned_row_count: Number(diagnostic.primaryReturnedRowCount || 0),
    discovery_returned_row_count: Number(diagnostic.discoveryReturnedRowCount || 0),
    discovery_page_count: Number(diagnostic.discoveryPageCount || 0),
    default_aweme_id_hit: diagnostic.defaultAwemeIdHit === true,
    shared_relation_seen: diagnostic.sharedRelationSeen === true,
    warning_code: clean(diagnostic.warningCode),
    evidence_artifact_id: evidenceArtifactId,
    blocker_code: blockerCode,
    next_action: nextAction,
    response_body_stored: false
  });
}

async function recordEvidence({ repo, bundle, authorization, probeSummary }) {
  const artifactId = `EV-${bundle.job.job_id}-AWEME-AUTHORIZATION-READONLY`;
  const safeAuthorization = sanitizeForPublic(authorization);
  assertNoSensitiveLeak({ safeAuthorization, probeSummary });
  await repo.upsertEvidence({
    artifactId,
    jobId: bundle.job.job_id,
    artifactType: "aweme_authorization_readonly",
    title: "Node 4 抖音号授权关系只读核验",
    summary: [
      `status=${authorization.verification_status || "not_verified"}`,
      `default_hash_present=${Boolean(authorization.default_aweme_id_hash)}`,
      `probe_profile=${authorization.probe_profile || "unknown"}`,
      `default_hit=${authorization.default_aweme_id_hit === true}`,
      `shared_seen=${authorization.shared_relation_seen === true}`,
      `response_hash_present=${Boolean(authorization.response_hash)}`,
      "raw_response_stored=false"
    ].join("; "),
    contentHash: hashValue({ authorization: safeAuthorization, probeSummary }),
    storageRef: `postgres:mwb.advertiser_accounts/${bundle.job.advertiser_id}/aweme_authorization`,
    sourceRef: "oceanengine:tools/aweme_auth_list",
    sourceUsage: bundle.job.source_usage || "runtime_truth"
  });
  return artifactId;
}

function mockAuthorization(bundle = {}) {
  const baseline = awemeBaseline(bundle);
  const awemeId = defaultAwemeId(baseline) || "57018827026";
  return {
    rule_version: AWEME_AUTHORIZATION_RULE_VERSION,
    advertiser_id: bundle.job?.advertiser_id || "",
    route_id: bundle.job?.route_id || "",
    game_code: bundle.job?.game_code || "",
    payload_path: "aweme_id",
    source: "test_fixture:tools/aweme_auth_list",
    auth_type: "AWEME_ACCOUNT",
    accepted_auth_status: acceptedStatuses(baseline),
    verification_strategy: AWEME_FIXED_DEFAULT_VERIFICATION_STRATEGY,
    default_aweme_id_configured: true,
    default_aweme_id_hash: hashValue(awemeId),
    fallback_forbidden: true,
    verification_status: "authorized",
    verified_by_job_id: bundle.job?.job_id || "",
    verified_at: new Date().toISOString(),
    expires_at: "",
    probe_profile: "mock_ready",
    http_status: 200,
    platform_code: "0",
    request_id_present: true,
    message_hash: "",
    response_hash: "sha256:mock-aweme-authorization",
    returned_row_count: 1,
    primary_returned_row_count: 1,
    discovery_returned_row_count: 0,
    discovery_page_count: 0,
    default_aweme_id_hit: true,
    shared_relation_seen: false,
    warning_code: "",
    evidence_artifact_id: "",
    blocker_code: "",
    next_action: "ready_for_node5_payload_build",
    response_body_stored: false
  };
}

function evaluateProbeRows({ rows = [], baseline = {}, bundle = {} }) {
  const expectedAwemeId = defaultAwemeId(baseline);
  const expectedAdvertiserId = clean(bundle.job?.advertiser_id);
  const expectedAuthType = defaultAuthType(baseline);
  const accepted = new Set(acceptedStatuses(baseline));
  const matchingDefault = rows.filter((row) => clean(row.aweme_id) === expectedAwemeId);
  const scoped = matchingDefault.filter((row) => !row.advertiser_id || row.advertiser_id === expectedAdvertiserId);
  const authTypeMatched = scoped.filter((row) => !row.auth_type || row.auth_type === expectedAuthType);
  const active = authTypeMatched.filter((row) => accepted.has(row.auth_status) && !authorizationExpired(row));

  if (active.length) return { verificationStatus: "authorized", matchedRow: active[0] };
  if (matchingDefault.length && !scoped.length) return { verificationStatus: "scope_mismatch", matchedRow: matchingDefault[0] };
  if (matchingDefault.length && !active.length) return { verificationStatus: "inactive", matchedRow: authTypeMatched[0] || scoped[0] || matchingDefault[0] };
  if (rows.length) return { verificationStatus: "default_mismatch", matchedRow: rows[0] };
  return { verificationStatus: "not_authorized", matchedRow: {} };
}

function buildProbeDiagnostic({ probe = {}, probeProfile = "", rows = [], primaryRows = [], discoveryRows = [], discoveryPageCount = 0, expectedAwemeId = "", warningCode = "", blockerCode = "" }) {
  const hitRows = rows.filter((row) => clean(row.aweme_id) === expectedAwemeId);
  return sanitizeForPublic({
    probeProfile,
    httpStatus: probe.httpStatus ?? null,
    platformCode: clean(probe.apiCode),
    requestIdPresent: probe.requestIdPresent === true,
    messageHash: clean(probe.messageHash),
    returnedRowCount: rows.length,
    primaryReturnedRowCount: primaryRows.length,
    discoveryReturnedRowCount: discoveryRows.length,
    discoveryPageCount,
    defaultAwemeIdHit: hitRows.length > 0,
    sharedRelationSeen: hitRows.some((row) => row.share_type_present === true),
    warningCode,
    blockerCode,
    responseHashPresent: Boolean(probe.responseHash)
  });
}

async function persistAuthorization({ repo, bundle, baseline, probe = {}, verificationStatus, matchedRow = {}, probeSummary = {}, blockerCode = "", diagnostic = {} }) {
  const resolvedBlockerCode = blockerCode || blockerForStatus(verificationStatus);
  const authorization = buildAuthorizationRecord({
    bundle,
    baseline,
    probe,
    verificationStatus,
    matchedRow,
    evidenceArtifactId: "",
    blockerCode: resolvedBlockerCode,
    diagnostic
  });
  const artifactId = await recordEvidence({ repo, bundle, authorization, probeSummary });
  authorization.evidence_artifact_id = artifactId;
  await repo.updateAdvertiserAwemeAuthorization({
    advertiserId: bundle.job.advertiser_id,
    routeId: bundle.job.route_id,
    gameCode: bundle.job.game_code,
    authorization
  });
  return { authorization, artifactId };
}

export async function runAwemeAuthorizationReadonlySkill({
  repo,
  bundle,
  client = createOceanEngineReadonlyClient(),
  allowReadonlyDependency = false,
  mockReady = false
} = {}) {
  const baseline = awemeBaseline(bundle);
  const required = baselineRequiresAweme(bundle);
  if (!required) {
    return {
      status: "passed",
      blockers: [],
      outputSummary: {
        awemeAuthorizationStatus: "not_required",
        verificationStatus: "not_required",
        required: false,
        payloadPath: baseline.payload_path || "aweme_id",
        nextAction: "当前路线 native_type 不需要 aweme_id。"
      }
    };
  }

  const expectedAwemeId = defaultAwemeId(baseline);
  const baselineComplete = baseline.source === "tools/aweme_auth_list" &&
    baseline.fallback_forbidden === true &&
    /^\d+$/.test(expectedAwemeId);
  if (!baselineComplete) {
    const authorization = buildAuthorizationRecord({
      bundle,
      baseline,
      probe: {},
      verificationStatus: "baseline_incomplete",
      blockerCode: "aweme_id_baseline_missing_or_incomplete"
    });
    await repo.updateAdvertiserAwemeAuthorization({
      advertiserId: bundle.job.advertiser_id,
      routeId: bundle.job.route_id,
      gameCode: bundle.job.game_code,
      authorization
    });
    return {
      status: "blocked",
      blockers: ["aweme_id_baseline_missing_or_incomplete"],
      outputSummary: {
        awemeAuthorizationStatus: "baseline_incomplete",
        verificationStatus: "baseline_incomplete",
        required: true,
        configured: false,
        defaultAwemeIdConfigured: Boolean(expectedAwemeId),
        defaultAwemeIdHash: expectedAwemeId ? hashValue(expectedAwemeId) : "",
        payloadPath: baseline.payload_path || "aweme_id",
        nextAction: "补齐 game_route_defaults.raw_defaults.aweme_id_baseline.default_aweme_id。"
      }
    };
  }

  if (mockReady) {
    const authorization = mockAuthorization(bundle);
    await repo.updateAdvertiserAwemeAuthorization({
      advertiserId: bundle.job.advertiser_id,
      routeId: bundle.job.route_id,
      gameCode: bundle.job.game_code,
      authorization
    });
    return {
      status: "passed",
      blockers: [],
      outputSummary: {
        awemeAuthorizationStatus: authorization.verification_status,
        verificationStatus: authorization.verification_status,
        required: true,
        configured: true,
        defaultAwemeIdHash: authorization.default_aweme_id_hash || "",
        verifiedAt: authorization.verified_at,
        evidenceRef: "",
        rawResponseStored: false,
        nextAction: "ready_for_node5_payload_build"
      }
    };
  }

  if (bundle?.job?.source_usage === "test_run" && !allowReadonlyDependency) {
    return {
      status: "passed",
      blockers: [],
      outputSummary: {
        awemeAuthorizationStatus: "not_run_test_scope",
        verificationStatus: "not_run_test_scope",
        required: true,
        configured: true,
        defaultAwemeIdHash: hashValue(expectedAwemeId),
        nextAction: "测试运行不调用平台；Node 5 会基于账户授权核验状态决定是否阻断。"
      }
    };
  }

  const permission = readonlyPermissionState({ allowReadonlyDependency });
  if (!permission.allowed) {
    return {
      status: "passed",
      blockers: [],
      outputSummary: {
        awemeAuthorizationStatus: "not_run",
        verificationStatus: "not_run",
        required: true,
        configured: true,
        permissionStatus: permission.status,
        defaultAwemeIdHash: hashValue(expectedAwemeId),
        nextAction: "等待显式真实只读授权。"
      }
    };
  }

  const primaryProbe = await client.get({
    label: "aweme_authorization_default_verify_minimal",
    endpoint: "tools/aweme_auth_list",
    query: {
      advertiser_id: bundle.job.advertiser_id,
      filtering: JSON.stringify({
        auth_type: [defaultAuthType(baseline)],
        aweme_ids: [expectedAwemeId]
      }),
      page: "1",
      page_size: "10"
    },
    requestFieldManifest: {
      fieldNames: ["advertiser_id", "filtering", "page", "page_size"],
      filteringFieldNames: ["auth_type[]", "aweme_ids"],
      endpointId: "tools/aweme_auth_list",
      probeProfile: "minimal_precise_default",
      defaultAwemeIdHash: hashValue(expectedAwemeId),
      rawQueryStored: false
    },
    summarize: summarizeAwemeAuthList
  });

  if (primaryProbe.status !== "passed") {
    const blockerCode = blockerForProbeFailure(primaryProbe);
    const diagnostic = buildProbeDiagnostic({
      probe: primaryProbe,
      probeProfile: "primary_failed",
      expectedAwemeId,
      blockerCode
    });
    const { authorization, artifactId } = await persistAuthorization({
      repo,
      bundle,
      baseline,
      probe: primaryProbe,
      verificationStatus: "probe_failed",
      probeSummary: diagnostic,
      blockerCode,
      diagnostic
    });
    return {
      status: "blocked",
      blockers: [blockerCode],
      evidenceRefs: [artifactId],
      outputSummary: {
        awemeAuthorizationStatus: authorization.verification_status,
        verificationStatus: authorization.verification_status,
        required: true,
        configured: true,
        defaultAwemeIdHash: hashValue(expectedAwemeId),
        probeProfile: authorization.probe_profile,
        blockerCode,
        httpStatus: authorization.http_status,
        platformCode: authorization.platform_code,
        requestIdPresent: authorization.request_id_present,
        messageHashPresent: Boolean(authorization.message_hash),
        responseHashPresent: Boolean(primaryProbe.responseHash),
        evidenceRef: artifactId,
        rawResponseStored: false,
        nextAction: authorization.next_action
      }
    };
  }

  const primaryRows = arrayFrom(primaryProbe.summary?.rows);
  let rows = primaryRows;
  let probe = primaryProbe;
  let probeProfile = "primary_precise";
  let warningCode = "";
  let discoveryPageCount = 0;
  let discoveryRows = [];
  let evaluation = evaluateProbeRows({ rows, baseline, bundle });

  if (!primaryRows.some((row) => clean(row.aweme_id) === expectedAwemeId)) {
    probeProfile = "discovery_after_primary_miss";
    let page = 1;
    let totalPage = 1;
    while (page <= Math.min(totalPage || 1, AWEME_AUTHORIZATION_DISCOVERY_MAX_PAGES)) {
      const discoveryProbe = await client.get({
        label: "aweme_authorization_discovery_active",
        endpoint: "tools/aweme_auth_list",
        query: {
          advertiser_id: bundle.job.advertiser_id,
          filtering: JSON.stringify({
            auth_type: [defaultAuthType(baseline)]
          }),
          page: String(page),
          page_size: String(AWEME_AUTHORIZATION_DISCOVERY_PAGE_SIZE)
        },
        requestFieldManifest: {
          fieldNames: ["advertiser_id", "filtering", "page", "page_size"],
          filteringFieldNames: ["auth_type[]"],
          endpointId: "tools/aweme_auth_list",
          probeProfile: "active_discovery",
          defaultAwemeIdHash: hashValue(expectedAwemeId),
          rawQueryStored: false
        },
        summarize: summarizeAwemeAuthList
      });
      probe = discoveryProbe;
      discoveryPageCount += 1;

      if (discoveryProbe.status !== "passed") {
        const blockerCode = blockerForProbeFailure(discoveryProbe);
        const diagnostic = buildProbeDiagnostic({
          probe: discoveryProbe,
          probeProfile: "discovery_failed",
          rows: discoveryRows,
          primaryRows,
          discoveryRows,
          discoveryPageCount,
          expectedAwemeId,
          blockerCode
        });
        const { authorization, artifactId } = await persistAuthorization({
          repo,
          bundle,
          baseline,
          probe: discoveryProbe,
          verificationStatus: "probe_failed",
          probeSummary: diagnostic,
          blockerCode,
          diagnostic
        });
        return {
          status: "blocked",
          blockers: [blockerCode],
          evidenceRefs: [artifactId],
          outputSummary: {
            awemeAuthorizationStatus: authorization.verification_status,
            verificationStatus: authorization.verification_status,
            required: true,
            configured: true,
            defaultAwemeIdHash: hashValue(expectedAwemeId),
            probeProfile: authorization.probe_profile,
            blockerCode,
            returnedRowCount: authorization.returned_row_count,
            primaryReturnedRowCount: authorization.primary_returned_row_count,
            discoveryReturnedRowCount: authorization.discovery_returned_row_count,
            evidenceRef: artifactId,
            rawResponseStored: false,
            nextAction: authorization.next_action
          }
        };
      }

      const pageRows = arrayFrom(discoveryProbe.summary?.rows);
      discoveryRows = [...discoveryRows, ...pageRows];
      const pageInfo = discoveryProbe.summary?.pageInfo || {};
      totalPage = Number(pageInfo.totalPage || totalPage || 1);
      if (pageRows.some((row) => clean(row.aweme_id) === expectedAwemeId)) break;
      page += 1;
    }
    rows = discoveryRows;
    evaluation = evaluateProbeRows({ rows, baseline, bundle });
    if (evaluation.verificationStatus === "authorized") {
      probeProfile = "discovery_fallback_authorized";
      warningCode = "aweme_auth_precise_filter_contract_mismatch";
    } else if (rows.length) {
      probeProfile = "discovery_default_not_visible";
    } else {
      probeProfile = "discovery_no_active_authorization";
    }
  }

  const diagnostic = buildProbeDiagnostic({
    probe,
    probeProfile,
    rows,
    primaryRows,
    discoveryRows,
    discoveryPageCount,
    expectedAwemeId,
    warningCode
  });
  const { verificationStatus, matchedRow } = evaluation;
  const { authorization, artifactId } = await persistAuthorization({
    repo,
    bundle,
    baseline,
    probe,
    verificationStatus,
    matchedRow,
    probeSummary: diagnostic,
    diagnostic
  });
  const passed = verificationStatus === "authorized";
  const blockers = passed ? [] : [authorization.blocker_code || blockerForStatus(verificationStatus)];
  const output = {
    status: passed ? "passed" : "blocked",
    blockers,
    evidenceRefs: [artifactId],
    outputSummary: {
      awemeAuthorizationStatus: verificationStatus,
      verificationStatus,
      required: true,
      configured: true,
      defaultAwemeIdHash: hashValue(expectedAwemeId),
      verifiedAt: authorization.verified_at,
      expiresAt: authorization.expires_at,
      probeProfile: authorization.probe_profile,
      returnedRowCount: authorization.returned_row_count,
      defaultAwemeIdHit: authorization.default_aweme_id_hit,
      sharedRelationSeen: authorization.shared_relation_seen,
      warningCode: authorization.warning_code,
      responseHashPresent: Boolean(authorization.response_hash),
      evidenceRef: artifactId,
      rawResponseStored: false,
      nextAction: passed ? "ready_for_node5_payload_build" : authorization.next_action
    }
  };
  assertNoSensitiveLeak(output);
  return output;
}
