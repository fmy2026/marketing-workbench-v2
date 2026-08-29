import { createOceanEngineReadonlyClient } from "../../../platforms/oceanengineReadonlyClient.mjs";
import { assertNoSensitiveLeak, hashValue, sanitizeForPublic } from "./00-contracts.mjs";
import { readonlyPermissionState } from "./00-readonly-permission.mjs";

export const AWEME_AUTHORIZATION_SKILL_KEY = "aweme-authorization-readonly";
export const AWEME_AUTHORIZATION_RULE_VERSION = "2026-08-29.aweme-id-account-auth-v1";
export const AWEME_AUTHORIZATION_ACCEPTED_STATUSES = new Set(["AUTHRIZED", "AUTHORIZED"]);

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

function payloadNativeType(bundle = {}) {
  return clean(bundle.defaults?.raw_defaults?.payload_defaults?.project?.native_type);
}

function baselineRequiresAweme(bundle = {}) {
  const baseline = awemeBaseline(bundle);
  const requiredNativeType = clean(baseline.required_when?.native_type);
  return Boolean(requiredNativeType && payloadNativeType(bundle) === requiredNativeType);
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

function normalizeCandidate(item = {}) {
  const awemeId = clean(item.aweme_id || item.id || item.awemeId);
  const authStatus = clean(item.auth_status || item.authStatus || item.status);
  const authType = clean(item.auth_type || item.authType || "");
  return {
    aweme_id: awemeId,
    aweme_id_hash: awemeId ? hashValue(awemeId) : "",
    display_name_summary: safeDisplayName(item.aweme_name || item.name || item.nickname || item.display_name),
    auth_type: authType,
    auth_status: authStatus,
    sub_status: clean(item.sub_status || item.subStatus),
    auth_scenarios: arrayFrom(item.auth_scenarios || item.authScenarios).map(clean).filter(Boolean).slice(0, 20),
    authorized_at: clean(item.auth_time || item.authorized_at || item.start_time || item.start_at),
    expires_at: clean(item.end_time || item.expire_time || item.expires_at || item.expire_at)
  };
}

function summarizeAwemeAuthList(payload = {}) {
  const candidates = awemeList(payload).map(normalizeCandidate).filter((item) => item.aweme_id);
  return {
    totalCandidateCount: candidates.length,
    candidates
  };
}

function activeCandidates({ candidates = [], baseline = {} } = {}) {
  const acceptedStatuses = new Set(arrayFrom(baseline.accepted_auth_status).map(clean).filter(Boolean));
  if (!acceptedStatuses.size) {
    AWEME_AUTHORIZATION_ACCEPTED_STATUSES.forEach((status) => acceptedStatuses.add(status));
  }
  const expectedAuthType = clean(baseline.auth_type || "AWEME_ACCOUNT");
  return candidates.filter((candidate) =>
    /^\d+$/.test(candidate.aweme_id) &&
    acceptedStatuses.has(clean(candidate.auth_status)) &&
    (!expectedAuthType || clean(candidate.auth_type) === expectedAuthType || !clean(candidate.auth_type))
  );
}

function selectedStillActive({ previousSelectedAwemeId = "", candidates = [] } = {}) {
  return Boolean(previousSelectedAwemeId && candidates.some((candidate) => candidate.aweme_id === previousSelectedAwemeId));
}

function buildAuthorizationRecord({
  bundle,
  baseline,
  probe,
  active,
  selectionStatus,
  selectedAwemeId = "",
  selectedDisplayName = "",
  evidenceArtifactId = "",
  blockers = []
}) {
  const selected = clean(selectedAwemeId);
  const expiresAt = active.find((candidate) => candidate.aweme_id === selected)?.expires_at || "";
  return sanitizeForPublic({
    rule_version: AWEME_AUTHORIZATION_RULE_VERSION,
    advertiser_id: bundle.job.advertiser_id,
    route_id: bundle.job.route_id,
    game_code: bundle.job.game_code,
    payload_path: baseline.payload_path || "aweme_id",
    source: baseline.source || "tools/aweme_auth_list",
    auth_type: baseline.auth_type || "AWEME_ACCOUNT",
    accepted_auth_status: arrayFrom(baseline.accepted_auth_status).length ? baseline.accepted_auth_status : ["AUTHRIZED", "AUTHORIZED"],
    selection_policy: baseline.selection_policy || "single_active_auto_select_else_manual_select",
    fallback_forbidden: baseline.fallback_forbidden !== false,
    selected_aweme_id: selected,
    selected_aweme_id_hash: selected ? hashValue(selected) : "",
    selected_display_name_summary: selectedDisplayName,
    active_candidates: active,
    active_candidate_count: active.length,
    selection_status: selectionStatus,
    verified_at: new Date().toISOString(),
    expires_at: expiresAt,
    response_hash: clean(probe?.responseHash),
    evidence_artifact_id: evidenceArtifactId,
    blockers,
    response_body_stored: false
  });
}

async function recordEvidence({ repo, bundle, authorization, probeSummary }) {
  const artifactId = `EV-${bundle.job.job_id}-AWEME-AUTHORIZATION-READONLY`;
  const safeAuthorization = sanitizeForPublic({
    ...authorization,
    selected_aweme_id: authorization.selected_aweme_id ? "[stored_on_account]" : "",
    active_candidates: (authorization.active_candidates || []).map((candidate) => ({
      ...candidate,
      aweme_id: "[candidate_id_stored_on_account]"
    }))
  });
  assertNoSensitiveLeak({ safeAuthorization, probeSummary });
  await repo.upsertEvidence({
    artifactId,
    jobId: bundle.job.job_id,
    artifactType: "aweme_authorization_readonly",
    title: "Node 4 抖音号授权关系只读核验",
    summary: [
      `status=${authorization.selection_status || "not_verified"}`,
      `candidate_count=${authorization.active_candidate_count || 0}`,
      `selected_present=${Boolean(authorization.selected_aweme_id)}`,
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
  const awemeId = "1000000000000000001";
  return {
    rule_version: AWEME_AUTHORIZATION_RULE_VERSION,
    advertiser_id: bundle.job?.advertiser_id || "",
    route_id: bundle.job?.route_id || "",
    game_code: bundle.job?.game_code || "",
    payload_path: "aweme_id",
    source: "test_fixture:tools/aweme_auth_list",
    auth_type: "AWEME_ACCOUNT",
    accepted_auth_status: ["AUTHRIZED", "AUTHORIZED"],
    selection_policy: "single_active_auto_select_else_manual_select",
    fallback_forbidden: true,
    selected_aweme_id: awemeId,
    selected_aweme_id_hash: hashValue(awemeId),
    selected_display_name_summary: "mock aweme",
    active_candidates: [{
      aweme_id: awemeId,
      aweme_id_hash: hashValue(awemeId),
      display_name_summary: "mock aweme",
      auth_type: "AWEME_ACCOUNT",
      auth_status: "AUTHRIZED",
      sub_status: "",
      auth_scenarios: [],
      authorized_at: "",
      expires_at: ""
    }],
    active_candidate_count: 1,
    selection_status: "auto_selected",
    verified_at: new Date().toISOString(),
    expires_at: "",
    response_hash: "sha256:mock-aweme-authorization",
    evidence_artifact_id: "",
    blockers: [],
    response_body_stored: false
  };
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
        required: false,
        payloadPath: baseline.payload_path || "aweme_id",
        nextAction: "当前路线 native_type 不需要 aweme_id。"
      }
    };
  }
  if (!baseline.source || baseline.fallback_forbidden !== true) {
    return {
      status: "blocked",
      blockers: ["aweme_id_baseline_missing_or_incomplete"],
      outputSummary: {
        awemeAuthorizationStatus: "baseline_incomplete",
        required: true,
        payloadPath: baseline.payload_path || "aweme_id",
        nextAction: "补齐 game_route_defaults.raw_defaults.aweme_id_baseline。"
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
        awemeAuthorizationStatus: authorization.selection_status,
        required: true,
        activeCandidateCount: 1,
        selectedAwemeIdPresent: true,
        selectedAwemeIdHash: authorization.selected_aweme_id_hash,
        verifiedAt: authorization.verified_at,
        evidenceRef: "",
        rawResponseStored: false
      }
    };
  }

  if (bundle?.job?.source_usage === "test_run" && !allowReadonlyDependency) {
    return {
      status: "passed",
      blockers: [],
      outputSummary: {
        awemeAuthorizationStatus: "not_run_test_scope",
        required: true,
        activeCandidateCount: 0,
        selectedAwemeIdPresent: Boolean(bundle.account?.aweme_authorization?.selected_aweme_id),
        nextAction: "测试运行不调用平台；Node 5 会基于账户授权关系状态决定是否阻断。"
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
        required: true,
        permissionStatus: permission.status,
        nextAction: "等待显式真实只读授权。"
      }
    };
  }

  let allCandidates = [];
  let responseHashes = [];
  let lastProbe = null;
  const pageSize = 100;
  for (let page = 1; page <= 20; page += 1) {
    const probe = await client.get({
      label: `aweme_authorization_page_${page}`,
      endpoint: "tools/aweme_auth_list",
      query: {
        advertiser_id: bundle.job.advertiser_id,
        filtering: JSON.stringify({
          auth_type: baseline.auth_type || "AWEME_ACCOUNT"
        }),
        page: String(page),
        page_size: String(pageSize)
      },
      requestFieldManifest: {
        fieldNames: ["advertiser_id", "filtering", "page", "page_size"],
        filteringFieldNames: ["auth_type"],
        endpointId: "tools/aweme_auth_list",
        rawQueryStored: false
      },
      summarize: summarizeAwemeAuthList
    });
    lastProbe = probe;
    if (probe.status !== "passed") {
      const authorization = buildAuthorizationRecord({
        bundle,
        baseline,
        probe,
        active: [],
        selectionStatus: "probe_failed",
        evidenceArtifactId: "",
        blockers: [probe.status === "credential_required" ? "credential_required" : "aweme_auth_probe_failed"]
      });
      const artifactId = await recordEvidence({ repo, bundle, authorization, probeSummary: sanitizeForPublic(probe) });
      authorization.evidence_artifact_id = artifactId;
      await repo.updateAdvertiserAwemeAuthorization({
        advertiserId: bundle.job.advertiser_id,
        routeId: bundle.job.route_id,
        gameCode: bundle.job.game_code,
        authorization
      });
      return {
        status: "blocked",
        blockers: authorization.blockers,
        evidenceRefs: [artifactId],
        outputSummary: {
          awemeAuthorizationStatus: authorization.selection_status,
          required: true,
          activeCandidateCount: 0,
          selectedAwemeIdPresent: false,
          responseHashPresent: Boolean(probe.responseHash),
          evidenceRef: artifactId,
          rawResponseStored: false
        }
      };
    }
    const candidates = arrayFrom(probe.summary?.candidates);
    allCandidates = [...allCandidates, ...candidates];
    if (probe.responseHash) responseHashes.push(probe.responseHash);
    if (candidates.length < pageSize) break;
  }

  const active = activeCandidates({ candidates: allCandidates, baseline });
  const previousSelectedAwemeId = clean(bundle.account?.aweme_authorization?.selected_aweme_id);
  let selectionStatus = "selection_required";
  let selectedAwemeId = "";
  let selectedDisplayName = "";
  const blockers = [];
  if (active.length === 0) {
    selectionStatus = "no_active_authorization";
    blockers.push("aweme_auth_no_active");
  } else if (active.length === 1) {
    selectionStatus = "auto_selected";
    selectedAwemeId = active[0].aweme_id;
    selectedDisplayName = active[0].display_name_summary;
  } else if (selectedStillActive({ previousSelectedAwemeId, candidates: active })) {
    selectionStatus = clean(bundle.account?.aweme_authorization?.selection_status) === "manual_selected"
      ? "manual_selected"
      : "auto_selected";
    selectedAwemeId = previousSelectedAwemeId;
    selectedDisplayName = active.find((candidate) => candidate.aweme_id === selectedAwemeId)?.display_name_summary || "";
  } else if (previousSelectedAwemeId) {
    selectionStatus = "selected_inactive";
    blockers.push("aweme_auth_selected_inactive");
  } else {
    selectionStatus = "selection_required";
    blockers.push("aweme_auth_manual_selection_required");
  }

  const authorization = buildAuthorizationRecord({
    bundle,
    baseline,
    probe: {
      responseHash: responseHashes.length === 1 ? responseHashes[0] : hashValue(responseHashes)
    },
    active,
    selectionStatus,
    selectedAwemeId,
    selectedDisplayName,
    evidenceArtifactId: "",
    blockers
  });
  const artifactId = await recordEvidence({ repo, bundle, authorization, probeSummary: { pageCount: responseHashes.length, lastProbeStatus: lastProbe?.status || "" } });
  authorization.evidence_artifact_id = artifactId;
  await repo.updateAdvertiserAwemeAuthorization({
    advertiserId: bundle.job.advertiser_id,
    routeId: bundle.job.route_id,
    gameCode: bundle.job.game_code,
    authorization
  });
  const passed = blockers.length === 0;
  const output = {
    status: passed ? "passed" : "blocked",
    blockers,
    evidenceRefs: [artifactId],
    outputSummary: {
      awemeAuthorizationStatus: selectionStatus,
      required: true,
      activeCandidateCount: active.length,
      selectedAwemeIdPresent: Boolean(selectedAwemeId),
      selectedAwemeIdHash: selectedAwemeId ? hashValue(selectedAwemeId) : "",
      verifiedAt: authorization.verified_at,
      expiresAt: authorization.expires_at,
      responseHashPresent: Boolean(authorization.response_hash),
      evidenceRef: artifactId,
      rawResponseStored: false,
      nextAction: passed ? "Node 5 可从账户授权关系生成 aweme_id。" : blockers[0]
    }
  };
  assertNoSensitiveLeak(output);
  return output;
}
