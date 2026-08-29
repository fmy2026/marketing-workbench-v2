import { createOceanEngineReadonlyClient } from "../../../platforms/oceanengineReadonlyClient.mjs";
import { assertNoSensitiveLeak, hashValue, sanitizeForPublic } from "./00-contracts.mjs";
import { readonlyPermissionState } from "./00-readonly-permission.mjs";

export const AWEME_AUTHORIZATION_SKILL_KEY = "aweme-authorization-readonly";
export const AWEME_AUTHORIZATION_RULE_VERSION = "2026-08-29.aweme-id-fixed-default-account-verify-v2";
export const AWEME_AUTHORIZATION_ACCEPTED_STATUSES = new Set(["AUTHRIZED", "AUTHORIZED"]);
export const AWEME_FIXED_DEFAULT_VERIFICATION_STRATEGY = "fixed_game_default_account_verify";

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

function normalizeAuthRow(item = {}) {
  const awemeId = clean(item.aweme_id || item.id || item.awemeId);
  return {
    advertiser_id: clean(item.advertiser_id || item.advertiserId),
    aweme_id: awemeId,
    aweme_id_hash: awemeId ? hashValue(awemeId) : "",
    display_name_summary: safeDisplayName(item.aweme_name || item.name || item.nickname || item.display_name),
    auth_type: clean(item.auth_type || item.authType || ""),
    auth_status: clean(item.auth_status || item.authStatus || item.status),
    expires_at: clean(item.end_time || item.expire_time || item.expires_at || item.expire_at)
  };
}

function summarizeAwemeAuthList(payload = {}) {
  const rows = awemeList(payload).map(normalizeAuthRow).filter((item) => item.aweme_id);
  return {
    resultCount: rows.length,
    rows
  };
}

function acceptedStatuses(baseline = {}) {
  const configured = arrayFrom(baseline.accepted_auth_status).map(clean).filter(Boolean);
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
  blockerCode = ""
}) {
  const defaultId = defaultAwemeId(baseline);
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
    response_hash: clean(probe?.responseHash),
    evidence_artifact_id: evidenceArtifactId,
    blocker_code: blockerCode,
    next_action: nextActionForStatus(verificationStatus),
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
    response_hash: "sha256:mock-aweme-authorization",
    evidence_artifact_id: "",
    blocker_code: "",
    next_action: "ready_for_node5_payload_build",
    response_body_stored: false
  };
}

function evaluateProbeRows({ rows = [], baseline = {}, bundle = {} }) {
  const expectedAwemeId = defaultAwemeId(baseline);
  const expectedAdvertiserId = clean(bundle.job?.advertiser_id);
  const expectedAuthType = clean(baseline.auth_type || "AWEME_ACCOUNT");
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

async function persistAuthorization({ repo, bundle, baseline, probe = {}, verificationStatus, matchedRow = {}, probeSummary = {} }) {
  const blockerCode = blockerForStatus(verificationStatus);
  const authorization = buildAuthorizationRecord({
    bundle,
    baseline,
    probe,
    verificationStatus,
    matchedRow,
    evidenceArtifactId: "",
    blockerCode
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

  const probe = await client.get({
    label: "aweme_authorization_default_verify",
    endpoint: "tools/aweme_auth_list",
    query: {
      advertiser_id: bundle.job.advertiser_id,
      filtering: JSON.stringify({
        auth_type: baseline.auth_type || "AWEME_ACCOUNT",
        auth_status: acceptedStatuses(baseline),
        aweme_ids: [expectedAwemeId]
      }),
      page: "1",
      page_size: "10"
    },
    requestFieldManifest: {
      fieldNames: ["advertiser_id", "filtering", "page", "page_size"],
      filteringFieldNames: ["auth_type", "auth_status", "aweme_ids"],
      endpointId: "tools/aweme_auth_list",
      defaultAwemeIdHash: hashValue(expectedAwemeId),
      rawQueryStored: false
    },
    summarize: summarizeAwemeAuthList
  });

  if (probe.status !== "passed") {
    const blockers = [probe.status === "credential_required" ? "credential_required" : "aweme_auth_probe_failed"];
    const { authorization, artifactId } = await persistAuthorization({
      repo,
      bundle,
      baseline,
      probe,
      verificationStatus: "probe_failed",
      probeSummary: sanitizeForPublic(probe)
    });
    return {
      status: "blocked",
      blockers,
      evidenceRefs: [artifactId],
      outputSummary: {
        awemeAuthorizationStatus: authorization.verification_status,
        verificationStatus: authorization.verification_status,
        required: true,
        configured: true,
        defaultAwemeIdHash: hashValue(expectedAwemeId),
        responseHashPresent: Boolean(probe.responseHash),
        evidenceRef: artifactId,
        rawResponseStored: false,
        nextAction: authorization.next_action
      }
    };
  }

  const rows = arrayFrom(probe.summary?.rows);
  const { verificationStatus, matchedRow } = evaluateProbeRows({ rows, baseline, bundle });
  const { authorization, artifactId } = await persistAuthorization({
    repo,
    bundle,
    baseline,
    probe,
    verificationStatus,
    matchedRow,
    probeSummary: {
      status: probe.status,
      responseHashPresent: Boolean(probe.responseHash),
      returnedRowCount: rows.length,
      defaultAwemeIdHash: hashValue(expectedAwemeId)
    }
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
      responseHashPresent: Boolean(authorization.response_hash),
      evidenceRef: artifactId,
      rawResponseStored: false,
      nextAction: passed ? "ready_for_node5_payload_build" : authorization.next_action
    }
  };
  assertNoSensitiveLeak(output);
  return output;
}
