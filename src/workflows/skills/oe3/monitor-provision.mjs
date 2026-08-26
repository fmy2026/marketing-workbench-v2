import { credentialStatusForDatabase, redactedQiankunCredentialStatus } from "../../../platforms/qiankunCredentialStore.mjs";
import { createQiankunMonitorClient } from "../../../platforms/qiankunMonitorClient.mjs";
import { assertNoSensitiveLeak, hashValue, sanitizeForPublic } from "./contracts.mjs";

export const MONITOR_PROVISION_TARGET = {
  routeId: "oceanengine_3_byte_mini_game",
  gameCode: "JSZC",
  advertiserId: "1871922346964041"
};

export const MONITOR_RETRY_CONFIRM_ENV = "MWBV2_MONITOR_RETRY_CONFIRM";
export const MONITOR_RETRY_CONFIRM_VALUE = "RETRY_ONE_BUSY_MONITOR_CREATE";
export const MONITOR_PROVISION_ID_ENV = "MWBV2_MONITOR_PROVISION_ID";
export const MONITOR_MAX_ATTEMPTS = 2;
export const MONITOR_RETRY_INTERVAL_SECONDS = 5;

export const MONITOR_PROVISION_STATUSES = [
  "planned",
  "account_resolved",
  "monitor_resolved",
  "touchpoint_resolved",
  "resolved",
  "failed",
  "monitor_resolved_touchpoint_pending",
  "terminal_failed"
];

export const MONITOR_CREDENTIAL_STATUSES = [
  "active",
  "expired",
  "missing",
  "mismatch"
];

function clean(value) {
  return String(value ?? "").trim();
}

function selectedOwnerKey(ownerKey = "", credential = {}) {
  const requested = clean(ownerKey);
  if (requested) return requested;
  const active = (credential.credentials || [])
    .filter((item) => item.status === "active" && clean(item.ownerKey));
  return active.length === 1 ? clean(active[0].ownerKey) : "";
}

function accountAuthStatus(account = {}) {
  const status = clean(account.authStatusName);
  if (["授权正常", "已授权", "ready", "active"].includes(status)) return "ready";
  return status || "unknown";
}

function ownedCredentialItem(credential = {}, ownerKey = "") {
  return (credential.credentials || [])
    .find((item) => clean(item.ownerKey) === clean(ownerKey)) || {};
}

export function monitorEnsureConfirmed({ env = process.env, provisionId = "" } = {}) {
  return env[MONITOR_RETRY_CONFIRM_ENV] === MONITOR_RETRY_CONFIRM_VALUE &&
    env[MONITOR_PROVISION_ID_ENV] === provisionId;
}

export function monitorProvisionId({ routeId, gameCode, advertiserId }) {
  return `MPR-${clean(routeId).toUpperCase().replace(/[^A-Z0-9]+/g, "-")}-${clean(gameCode).toUpperCase().replace(/[^A-Z0-9]+/g, "-")}-${clean(advertiserId)}`;
}

export function monitorTouchpointRef({ routeId, gameCode, advertiserId, monitorId }) {
  return `QK-MONITOR-${clean(routeId).toUpperCase().replace(/[^A-Z0-9]+/g, "-")}-${clean(gameCode).toUpperCase().replace(/[^A-Z0-9]+/g, "-")}-${clean(advertiserId)}-${clean(monitorId || "PENDING")}`;
}

export function monitorProvisionFingerprint({ routeId, gameCode, advertiserId, technicalConfig = {} }) {
  return hashValue({
    route_id: clean(routeId),
    game_code: clean(gameCode),
    advertiser_id: clean(advertiserId),
    technical_config: technicalConfig || {}
  });
}

function monitorDefaultsReadiness(defaults = {}) {
  const config = defaults.monitor_provision || {};
  const required = ["os", "package_id", "cate_id", "vest_id", "channel", "media_id", "monitor_api", "usage", "num"];
  const missing = required.filter((key) => clean(config[key]) === "");
  return {
    present: defaults.monitor_provision_present === true,
    missingFields: missing,
    readyForReadonlyReconcile: defaults.monitor_provision_present === true && missing.length === 0
  };
}

function singleExactAccountRow(accountResult = {}, advertiserId = "") {
  const rows = Array.isArray(accountResult.summary?.list) ? accountResult.summary.list : [];
  return rows.filter((item) => clean(item.accountId) === clean(advertiserId));
}

function monitorQueryParams({ account = {}, ownerKey = "", technicalConfig = {}, exact = false }) {
  const params = {
    pageNo: 1,
    pageSize: 50,
    mediaAccountId: clean(account.advertiserId || account.accountId)
  };
  if (ownerKey) params.ssoOwner = [ownerKey];
  if (!exact) return params;
  if (clean(technicalConfig.package_id)) params.packageId = clean(technicalConfig.package_id);
  if (clean(technicalConfig.os)) params.os = [technicalConfig.os];
  if (clean(technicalConfig.channel)) params.channel = [technicalConfig.channel];
  if (clean(technicalConfig.monitor_api)) params.monitorApi = [technicalConfig.monitor_api];
  if (clean(technicalConfig.usage) !== "") params.usage = technicalConfig.usage;
  return params;
}

function exactMonitorRows(monitorResult = {}, technicalConfig = {}) {
  const rows = Array.isArray(monitorResult.summary?.list) ? monitorResult.summary.list : [];
  return rows.filter((item) => {
    if (clean(technicalConfig.package_id) && clean(item.packageId) !== clean(technicalConfig.package_id)) return false;
    if (clean(technicalConfig.channel) && clean(item.channel) !== clean(technicalConfig.channel)) return false;
    if (clean(technicalConfig.media_id) && clean(item.mediaId) !== clean(technicalConfig.media_id)) return false;
    if (clean(technicalConfig.agent_id) && clean(item.agentId) !== clean(technicalConfig.agent_id)) return false;
    if (clean(technicalConfig.monitor_api) && clean(item.monitorApi) !== clean(technicalConfig.monitor_api)) return false;
    return true;
  });
}

function compactMonitorRows(monitorResult = {}) {
  const rows = Array.isArray(monitorResult.summary?.list) ? monitorResult.summary.list : [];
  return rows.map((item) => ({
    id: clean(item.id),
    monitorId: clean(item.monitorId),
    gameId: clean(item.gameId),
    packageId: clean(item.packageId),
    cateId: clean(item.cateId),
    cateName: clean(item.cateName),
    mediaAccountId: clean(item.mediaAccountId),
    mediaAccountRecordId: clean(item.mediaAccountRecordId),
    os: clean(item.os),
    osName: clean(item.osName),
    mediaId: clean(item.mediaId),
    mediaName: clean(item.mediaName),
    agentId: clean(item.agentId),
    agentName: clean(item.agentName),
    monitorApi: clean(item.monitorApi),
    monitorApiName: clean(item.monitorApiName),
    ssoOwner: clean(item.ssoOwner),
    ssoOwnerKey: clean(item.ssoOwnerKey),
    vestId: clean(item.vestId),
    vestName: clean(item.vestName),
    channel: clean(item.channel),
    departmentName: clean(item.departmentName),
    remarkPresent: item.remarkPresent === true,
    addtime: clean(item.addtime),
    touchpointUrlPresent: item.touchpointUrlPresent === true,
    touchpointUrlHash: clean(item.touchpointUrlHash)
  }));
}

async function upsertReadonlyEvidence({ repo, provisionId, summary }) {
  if (!repo) return "";
  const safeSummary = sanitizeForPublic(summary);
  assertNoSensitiveLeak(safeSummary);
  const artifactId = `EV-${provisionId}-READONLY-RECONCILE`;
  await repo.upsertEvidence({
    artifactId,
    jobId: null,
    artifactType: "qiankun_monitor_readonly_reconcile",
    title: "乾坤监测序号只读核对证据",
    summary: JSON.stringify(safeSummary),
    contentHash: hashValue(safeSummary),
    storageRef: `postgres:mwb.monitor_provision_runs/${provisionId}`,
    sourceRef: "qiankun:/tf/account_info/accountIndex+/tf/ad/index",
    sourceUsage: "runtime_truth"
  });
  return artifactId;
}

async function upsertEnsureEvidence({ repo, provisionId, summary }) {
  if (!repo) return "";
  const safeSummary = sanitizeForPublic(summary);
  assertNoSensitiveLeak(safeSummary);
  const artifactId = `EV-${provisionId}-ENSURE`;
  await repo.upsertEvidence({
    artifactId,
    jobId: null,
    artifactType: "qiankun_monitor_ensure",
    title: "乾坤监测序号 ensure 证据",
    summary: JSON.stringify(safeSummary),
    contentHash: hashValue(safeSummary),
    storageRef: `postgres:mwb.monitor_provision_runs/${provisionId}`,
    sourceRef: "qiankun:/tf/ad/monitorSerialNumberAdd+/tf/ad/index",
    sourceUsage: "runtime_truth"
  });
  return artifactId;
}

async function persistReadonlyReconcile({
  repo,
  target,
  provisionId,
  requestFingerprint,
  defaults,
  credential,
  account,
  monitor,
  status,
  errorSummary,
  evidenceArtifactId,
  createAudit = {}
}) {
  if (!repo) return { accountWritten: false, touchpointWritten: false, provisionRunWritten: false };
  const monitorId = clean(monitor?.monitorId);
  await repo.upsertAdvertiserAccount({
    advertiserId: target.advertiserId,
    routeId: target.routeId,
    gameCode: target.gameCode,
    accountName: account?.advertiserName || target.advertiserId,
    platform: "oceanengine",
    authStatus: accountAuthStatus(account || {}),
    platformStatus: account?.status || "unknown",
    ownerName: account?.ownerName || account?.ownerKey || "",
    monitorId
  });
  let touchpointWritten = false;
  const touchpointRef = monitorId ? monitorTouchpointRef({ ...target, monitorId }) : "";
  if (monitorId) {
    await repo.upsertAccountTouchpoint({
      touchpointId: touchpointRef,
      advertiserId: target.advertiserId,
      routeId: target.routeId,
      gameCode: target.gameCode,
      monitorId,
      touchpointRef,
      urlHash: monitor.touchpointUrlHash || "",
      status: monitor.touchpointUrl ? "stored_in_database" : monitor.touchpointUrlHash ? "hash_only_touchpoint_url_unverified" : "touchpoint_url_unresolved_after_monitor_list",
      source: monitor.source || "qiankun_monitor_readonly_reconcile",
      touchpointUrl: monitor.touchpointUrl || ""
    });
    touchpointWritten = true;
  }
  await repo.upsertMonitorProvisionRun({
    provisionId,
    routeId: target.routeId,
    gameCode: target.gameCode,
    advertiserId: target.advertiserId,
    status,
    requestFingerprint,
    technicalConfig: defaults?.monitor_provision || {},
    ownerKey: account?.ownerKey || "",
    ownerName: account?.ownerName || "",
    credentialStatus: credentialStatusForDatabase(credential),
    credentialUpdatedAt: ownedCredentialItem(credential, account?.ownerKey).tokenUpdatedAt || "",
    credentialExpiresAt: ownedCredentialItem(credential, account?.ownerKey).expiresAt || "",
    technicalAccountRecordId: account?.technicalAccountRecordId || "",
    mediaAccountId: account?.mediaAccountId || "",
    agentId: account?.agentId || "",
    monitorSerialId: monitor?.id || "",
    monitorId,
    touchpointRef,
    touchpointUrlHash: monitor?.touchpointUrlHash || "",
    requestHash: monitor?.requestHash || createAudit.requestHash || "",
    responseHash: monitor?.responseHash || createAudit.responseHash || "",
    errorSummary,
    evidenceArtifactId,
    createCalled: createAudit.createCalled === true || monitor?.createCalled === true,
    createAttemptNo: Number(createAudit.createAttemptNo || 0) || (createAudit.createCalled === true || monitor?.createCalled === true ? 1 : 0),
    createConfirmedAt: monitor?.createConfirmedAt || createAudit.createConfirmedAt || "",
    createCompletedAt: monitor?.createCompletedAt || createAudit.createCompletedAt || ""
  });
  return { accountWritten: true, touchpointWritten, provisionRunWritten: true };
}

function monitorCreateParams({ target = MONITOR_PROVISION_TARGET, account = {}, ownerKey = "", technicalConfig = {} }) {
  const params = {
    os: technicalConfig.os,
    package_id: clean(technicalConfig.package_id),
    cate_id: technicalConfig.cate_id,
    vest_id: technicalConfig.vest_id,
    channel: clean(technicalConfig.channel),
    owner: clean(ownerKey),
    media_id: technicalConfig.media_id,
    agent_id: technicalConfig.agent_id,
    num: technicalConfig.num,
    usage: technicalConfig.usage,
    monitor_api: clean(technicalConfig.monitor_api),
    media_account_id: clean(account.mediaAccountId),
    remark: `mwbv2-${target.gameCode}-${target.advertiserId}`
  };
  return Object.fromEntries(Object.entries(params).filter(([, value]) => clean(value) !== ""));
}

function requestFieldManifest(params = {}) {
  return {
    fieldNames: Object.keys(params).sort(),
    requiredFieldsPresent: [
      "os",
      "package_id",
      "cate_id",
      "vest_id",
      "channel",
      "owner",
      "media_id",
      "agent_id",
      "num",
      "usage",
      "media_account_id"
    ].every((key) => clean(params[key]) !== ""),
    rawRequestStored: false
  };
}

function busyServerError(value = {}) {
  const apiCode = clean(value.apiCode || value.api_code);
  const summary = clean(value.errorSummary || value.error_summary || value.apiMessage || value.api_message);
  return apiCode === "500" && summary.includes("服务器繁忙");
}

function secondsSince(value) {
  const timestamp = Date.parse(value || "");
  if (!Number.isFinite(timestamp)) return Number.POSITIVE_INFINITY;
  return Math.floor((Date.now() - timestamp) / 1000);
}

function attemptId(provisionId, attemptNo) {
  return `${provisionId}-ATTEMPT-${String(attemptNo).padStart(2, "0")}`;
}

function createErrorCategory(result = {}) {
  if (busyServerError({ apiCode: result.apiCode, apiMessage: result.apiMessage })) return "server_busy";
  if (result.status === "passed") return "";
  return result.apiCode ? "api_failure" : "transport_failure";
}

function monitorFromRow(item = {}, { requestHash = "", responseHash = "", source = "", createCalled = false, createConfirmedAt = "", createCompletedAt = "" } = {}) {
  return {
    id: clean(item.id),
    monitorId: clean(item.monitorId),
    touchpointUrlPresent: item.touchpointUrlPresent === true,
    touchpointUrlHash: clean(item.touchpointUrlHash),
    touchpointUrl: clean(item.controlledTouchpointUrl),
    requestHash,
    responseHash,
    source,
    createCalled,
    createConfirmedAt,
    createCompletedAt
  };
}

export async function runMonitorProvisionReadonlyReconcile({
  repo,
  ownerKey = "",
  target = MONITOR_PROVISION_TARGET
} = {}) {
  const provisionId = monitorProvisionId(target);
  const initialCredential = redactedQiankunCredentialStatus({ ownerKey });
  const effectiveOwnerKey = selectedOwnerKey(ownerKey, initialCredential);
  const credential = redactedQiankunCredentialStatus({ ownerKey: effectiveOwnerKey });
  const allowPendingOwnerKeyBootstrap = !clean(effectiveOwnerKey) && initialCredential.pendingOwnerKeyCount === 1;
  const client = createQiankunMonitorClient({
    allowPendingOwnerKeyBootstrap,
    pendingOwnerKeyBootstrapEndpoints: [
      "/tf/account_info/accountIndex",
      "/tf/ad/index"
    ]
  });
  const defaults = repo ? await repo.getMonitorProvisionDefaults({
    routeId: target.routeId,
    gameCode: target.gameCode
  }) : null;
  const readiness = monitorDefaultsReadiness(defaults || {});
  const requestFingerprint = monitorProvisionFingerprint({
    ...target,
    technicalConfig: defaults?.monitor_provision || {}
  });

  const blockers = [];
  const accountResult = await client.queryAccountIndex({
    ownerKey: effectiveOwnerKey,
    accountId: target.advertiserId,
    pageNo: 1,
    pageSize: 10
  });
  const accountRows = singleExactAccountRow(accountResult, target.advertiserId);
  if (accountResult.status !== "passed") {
    blockers.push(`account_query_failed:${accountResult.apiCode || "unknown"}:${accountResult.apiMessage || "unknown"}`);
  }
  if (accountResult.status === "passed" && accountRows.length !== 1) {
    blockers.push(accountRows.length === 0 ? "account_exact_match_missing" : "account_exact_match_ambiguous");
  }

  const accountRow = accountRows[0] || null;
  const resolvedOwnerKey = clean(accountRow?.ssoOwnerKey || accountRow?.ssoOwner);
  const account = accountRow ? {
    technicalAccountRecordId: clean(accountRow.id),
    accountId: clean(accountRow.accountId),
    advertiserId: clean(accountRow.accountId),
    mediaAccountId: clean(accountRow.mediaAccountRecordId || accountRow.id),
    agentId: clean(accountRow.agentId),
    agentName: clean(accountRow.agentName),
    ownerKey: resolvedOwnerKey,
    ownerName: clean(accountRow.ssoOwnerName || accountRow.ssoOwner),
    advertiserName: clean(accountRow.advertiserName),
    authStatusName: clean(accountRow.authStatusName),
    status: clean(accountRow.status),
    accessTokenPresent: accountRow.accessTokenPresent === true
  } : null;

  if (account && clean(effectiveOwnerKey) && clean(effectiveOwnerKey) !== resolvedOwnerKey) {
    blockers.push("credential_owner_mismatch");
  }
  if (account && !clean(effectiveOwnerKey) && allowPendingOwnerKeyBootstrap) {
    blockers.push("owner_key_resolved_but_not_persisted");
  }
  if (!readiness.readyForReadonlyReconcile) {
    blockers.push(readiness.present ? `monitor_provision_defaults_incomplete:${readiness.missingFields.join(",")}` : "monitor_provision_defaults_missing");
  }

  let monitorResult = null;
  let monitorRows = [];
  let exactRows = [];
  let monitor = null;
  if (account && accountResult.status === "passed") {
    const exactMatchingEnabled = readiness.readyForReadonlyReconcile;
    const params = monitorQueryParams({
      account,
      ownerKey: resolvedOwnerKey,
      technicalConfig: defaults?.monitor_provision || {},
      exact: exactMatchingEnabled
    });
    monitorResult = await client.queryMonitorIndex({ ownerKey: effectiveOwnerKey, params });
    monitorRows = compactMonitorRows(monitorResult);
    exactRows = exactMatchingEnabled ? exactMonitorRows(monitorResult, defaults?.monitor_provision || {}) : [];
    if (monitorResult.status !== "passed") {
      blockers.push(`monitor_list_query_failed:${monitorResult.apiCode || "unknown"}:${monitorResult.apiMessage || "unknown"}`);
    } else if (exactMatchingEnabled && exactRows.length !== 1) {
      blockers.push(exactRows.length === 0 ? "monitor_exact_match_missing" : "monitor_exact_match_ambiguous");
    } else if (exactMatchingEnabled) {
      const item = exactRows[0];
      monitor = {
        id: clean(item.id),
        monitorId: clean(item.monitorId),
        touchpointUrlPresent: item.touchpointUrlPresent === true,
        touchpointUrlHash: clean(item.touchpointUrlHash),
        requestHash: hashValue(params),
        responseHash: monitorResult.responseHash
      };
      if (!monitor.touchpointUrlHash) blockers.push("touchpoint_url_unresolved_after_monitor_list");
    }
  }

  const publicSummary = {
    mode: "reconcile",
    target,
    provisionId,
    requestFingerprint,
    credential: {
      status: credential.status,
      ownerKeyPresent: Boolean(clean(effectiveOwnerKey)),
      pendingOwnerKeyBootstrap: allowPendingOwnerKeyBootstrap,
      credentialStorePresent: credential.credentialStorePresent,
      activeCredentialCount: credential.activeCredentialCount,
      pendingOwnerKeyCount: credential.pendingOwnerKeyCount
    },
    account: account ? {
      resolved: true,
      technicalAccountRecordId: account.technicalAccountRecordId,
      mediaAccountId: account.mediaAccountId,
      agentId: account.agentId,
      agentName: account.agentName,
      ownerKey: account.ownerKey,
      ownerName: account.ownerName,
      advertiserNamePresent: Boolean(account.advertiserName),
      authStatusName: account.authStatusName,
      status: account.status,
      accessTokenPresent: account.accessTokenPresent
    } : {
      resolved: false,
      resultTotal: accountResult.summary?.resultTotal || 0
    },
    defaults: {
      monitorProvisionPresent: readiness.present,
      missingFields: readiness.missingFields,
      exactMonitorMatchingEnabled: readiness.readyForReadonlyReconcile
    },
    monitorList: monitorResult ? {
      called: true,
      status: monitorResult.status,
      httpStatus: monitorResult.httpStatus,
      apiCode: monitorResult.apiCode,
      apiMessage: monitorResult.apiMessage || "",
      resultTotal: monitorResult.summary?.resultTotal || 0,
      rowCount: monitorRows.length,
      exactMatchCount: exactRows.length,
      rows: monitorRows.slice(0, 10),
      responseHash: monitorResult.responseHash
    } : {
      called: false
    },
    resolvedMonitor: monitor ? {
      monitorSerialId: monitor.id,
      monitorId: monitor.monitorId,
      touchpointUrlPresent: monitor.touchpointUrlPresent,
      touchpointUrlHashPresent: Boolean(monitor.touchpointUrlHash)
    } : null,
    blockers,
    createCalled: false,
    rawRequestStored: false,
    rawResponseStored: false
  };
  const safeSummary = sanitizeForPublic(publicSummary);
  assertNoSensitiveLeak(safeSummary);

  const evidenceArtifactId = await upsertReadonlyEvidence({
    repo,
    provisionId,
    summary: safeSummary
  });
  const runStatus = monitor
    ? monitor.touchpointUrlHash ? "touchpoint_resolved" : "monitor_resolved"
    : account ? "account_resolved" : "failed";
  const writes = await persistReadonlyReconcile({
    repo,
    target,
    provisionId,
    requestFingerprint,
    defaults,
    credential,
    account,
    monitor,
    status: runStatus,
    errorSummary: blockers.join(";"),
    evidenceArtifactId
  });

  const output = {
    ...safeSummary,
    status: blockers.length ? "blocked" : "passed",
    runStatus,
    evidenceArtifactId,
    writes
  };
  assertNoSensitiveLeak(output);
  return output;
}

export async function runMonitorProvisionEnsure({
  repo,
  ownerKey = "",
  target = MONITOR_PROVISION_TARGET,
  env = process.env
} = {}) {
  const provisionId = monitorProvisionId(target);
  const confirmationPresent = monitorEnsureConfirmed({ env, provisionId });
  const confirmValuePresent = env[MONITOR_RETRY_CONFIRM_ENV] === MONITOR_RETRY_CONFIRM_VALUE;
  const provisionValuePresent = env[MONITOR_PROVISION_ID_ENV] === provisionId;
  const initialCredential = redactedQiankunCredentialStatus({ ownerKey });
  const effectiveOwnerKey = selectedOwnerKey(ownerKey, initialCredential);
  const credential = redactedQiankunCredentialStatus({ ownerKey: effectiveOwnerKey });
  const defaults = repo ? await repo.getMonitorProvisionDefaults({
    routeId: target.routeId,
    gameCode: target.gameCode
  }) : null;
  const readiness = monitorDefaultsReadiness(defaults || {});
  const requestFingerprint = monitorProvisionFingerprint({
    ...target,
    technicalConfig: defaults?.monitor_provision || {}
  });
  const latestRun = repo ? await repo.getLatestMonitorProvisionRun({
    routeId: target.routeId,
    gameCode: target.gameCode,
    advertiserId: target.advertiserId
  }) : null;
  const attemptState = repo ? await repo.getMonitorProvisionAttemptState({ provisionId }) : null;
  const attempts = Array.isArray(attemptState?.attempts) ? attemptState.attempts : [];
  const attemptCount = attempts.length || Number(latestRun?.create_attempt_no || 0);
  const firstAttempt = attemptState?.firstAttempt || attempts.find((item) => Number(item.attempt_no) === 1) || null;
  const latestAttempt = attemptState?.latestAttempt || attempts[attempts.length - 1] || null;
  const retryElapsedSeconds = secondsSince(firstAttempt?.completed_at || latestRun?.create_completed_at || latestRun?.updated_at);

  const blockers = [];
  if (!confirmationPresent) {
    if (!confirmValuePresent || !provisionValuePresent) blockers.push("confirm_variable_missing_or_invalid");
  }
  if (!effectiveOwnerKey) blockers.push("owner_key_missing_or_not_persisted");
  if (effectiveOwnerKey && credential.status !== "active") blockers.push(`credential_not_active:${credential.status}`);
  if (!readiness.readyForReadonlyReconcile) {
    blockers.push(readiness.present ? `monitor_provision_defaults_incomplete:${readiness.missingFields.join(",")}` : "monitor_provision_defaults_missing");
  }
  if (!latestRun) blockers.push("monitor_provision_run_missing");
  if (attemptCount === 0) blockers.push("monitor_first_attempt_missing");
  if (attemptCount >= MONITOR_MAX_ATTEMPTS) blockers.push("monitor_create_attempt_limit_reached");
  if (firstAttempt && !busyServerError(firstAttempt)) blockers.push("first_attempt_not_server_busy");
  if (firstAttempt && retryElapsedSeconds < MONITOR_RETRY_INTERVAL_SECONDS) blockers.push("retry_interval_not_elapsed");
  if (latestRun?.monitor_id) blockers.push("monitor_id_already_resolved_no_create_needed");

  if (!confirmationPresent) {
    const output = {
      status: "blocked",
      mode: "ensure",
      target,
      provisionId,
      requestFingerprint,
      confirmationPresent,
      confirmValuePresent,
      provisionValuePresent,
      credential: {
        status: credential.status,
        ownerKeyPresent: Boolean(effectiveOwnerKey),
        credentialStorePresent: credential.credentialStorePresent,
        activeCredentialCount: credential.activeCredentialCount,
        pendingOwnerKeyCount: credential.pendingOwnerKeyCount
      },
      defaults: {
        monitorProvisionPresent: readiness.present,
        missingFields: readiness.missingFields,
        exactMonitorMatchingEnabled: readiness.readyForReadonlyReconcile
      },
      latestRunBeforeCreate: latestRun ? {
        status: latestRun.status,
        monitorIdPresent: Boolean(latestRun.monitor_id),
        createCalled: latestRun.create_called === true,
        createAttemptNo: Number(latestRun.create_attempt_no || 0)
      } : {
        present: false
      },
      attemptState: {
        attemptCount,
        latestAttemptNo: Number(latestAttempt?.attempt_no || 0),
        firstAttemptServerBusy: firstAttempt ? busyServerError(firstAttempt) : false,
        retryElapsedSeconds: Number.isFinite(retryElapsedSeconds) ? retryElapsedSeconds : null,
        maximumTotalAttempts: MONITOR_MAX_ATTEMPTS
      },
      blockers,
      accountApiCalled: false,
      monitorListApiCalled: false,
      createCalled: false,
      retryAllowed: false,
      rawRequestStored: false,
      rawResponseStored: false
    };
    const safe = sanitizeForPublic(output);
    assertNoSensitiveLeak(safe);
    return safe;
  }

  const hardBlockers = blockers.filter((blocker) => blocker !== "confirm_variable_missing_or_invalid");
  if (hardBlockers.length) {
    const output = {
      status: "blocked",
      mode: "ensure",
      target,
      provisionId,
      requestFingerprint,
      confirmationPresent,
      confirmValuePresent,
      provisionValuePresent,
      attemptState: {
        attemptCount,
        latestAttemptNo: Number(latestAttempt?.attempt_no || 0),
        firstAttemptServerBusy: firstAttempt ? busyServerError(firstAttempt) : false,
        retryElapsedSeconds: Number.isFinite(retryElapsedSeconds) ? retryElapsedSeconds : null,
        maximumTotalAttempts: MONITOR_MAX_ATTEMPTS
      },
      blockers,
      accountApiCalled: false,
      monitorListApiCalled: false,
      createCalled: false,
      retryAllowed: false,
      rawRequestStored: false,
      rawResponseStored: false
    };
    const safe = sanitizeForPublic(output);
    assertNoSensitiveLeak(safe);
    return safe;
  }

  const client = createQiankunMonitorClient();
  let accountResult = null;
  let account = null;
  if (effectiveOwnerKey && credential.status === "active") {
    accountResult = await client.queryAccountIndex({
      ownerKey: effectiveOwnerKey,
      accountId: target.advertiserId,
      pageNo: 1,
      pageSize: 10
    });
    const accountRows = singleExactAccountRow(accountResult, target.advertiserId);
    if (accountResult.status !== "passed") {
      blockers.push(`account_query_failed:${accountResult.apiCode || "unknown"}:${accountResult.apiMessage || "unknown"}`);
    } else if (accountRows.length !== 1) {
      blockers.push(accountRows.length === 0 ? "account_exact_match_missing" : "account_exact_match_ambiguous");
    } else {
      const accountRow = accountRows[0];
      const resolvedOwnerKey = clean(accountRow.ssoOwnerKey || accountRow.ssoOwner);
      account = {
        technicalAccountRecordId: clean(accountRow.id),
        accountId: clean(accountRow.accountId),
        advertiserId: clean(accountRow.accountId),
        mediaAccountId: clean(accountRow.mediaAccountRecordId || accountRow.id),
        agentId: clean(accountRow.agentId),
        agentName: clean(accountRow.agentName),
        ownerKey: resolvedOwnerKey,
        ownerName: clean(accountRow.ssoOwnerName || accountRow.ssoOwner),
        advertiserName: clean(accountRow.advertiserName),
        authStatusName: clean(accountRow.authStatusName),
        status: clean(accountRow.status),
        accessTokenPresent: accountRow.accessTokenPresent === true
      };
      if (resolvedOwnerKey !== effectiveOwnerKey) blockers.push("credential_owner_mismatch");
    }
  }

  let preflightMonitorResult = null;
  let preflightRows = [];
  let preflightExactRows = [];
  if (account && readiness.readyForReadonlyReconcile) {
    const params = monitorQueryParams({
      account,
      ownerKey: effectiveOwnerKey,
      technicalConfig: defaults.monitor_provision,
      exact: true
    });
    preflightMonitorResult = await client.queryMonitorIndex({
      ownerKey: effectiveOwnerKey,
      params,
      includeControlledTouchpointUrl: true
    });
    preflightRows = compactMonitorRows(preflightMonitorResult);
    preflightExactRows = exactMonitorRows(preflightMonitorResult, defaults.monitor_provision);
    if (preflightMonitorResult.status !== "passed") {
      blockers.push(`preflight_monitor_query_failed:${preflightMonitorResult.apiCode || "unknown"}:${preflightMonitorResult.apiMessage || "unknown"}`);
    } else if (preflightExactRows.length > 1) {
      blockers.push("preflight_monitor_exact_match_ambiguous");
    }
  }

  let createResult = null;
  let readbackResult = null;
  let readbackRows = [];
  let readbackExactRows = [];
  let monitor = null;
  let createParams = {};
  let createRequestHash = "";
  let createCompletedAt = "";
  let claimedAttempt = null;
  const createConfirmedAt = new Date().toISOString();

  if (preflightExactRows.length === 1) {
    const existing = preflightExactRows[0];
    monitor = monitorFromRow(existing, {
      requestHash: hashValue(monitorQueryParams({ account, ownerKey: effectiveOwnerKey, technicalConfig: defaults.monitor_provision, exact: true })),
      responseHash: preflightMonitorResult.responseHash,
      source: "qiankun_monitor_preflight_existing"
    });
    if (!monitor.touchpointUrlHash || !monitor.touchpointUrl) blockers.push("touchpoint_url_unresolved_after_monitor_list");
  }

  if (
    confirmationPresent
    && blockers.length === 0
    && account
    && readiness.readyForReadonlyReconcile
    && preflightExactRows.length === 0
  ) {
    claimedAttempt = await repo.claimMonitorProvisionAttempt({
      provisionId,
      attemptNo: 2,
      triggerReason: "server_busy_retry",
      scheduledAt: createConfirmedAt,
      startedAt: createConfirmedAt
    });
    if (!claimedAttempt?.claimed) {
      blockers.push("monitor_second_attempt_claim_failed");
    }
  }

  if (
    confirmationPresent
    && blockers.length === 0
    && claimedAttempt?.claimed
  ) {
    createParams = monitorCreateParams({
      target,
      account,
      ownerKey: effectiveOwnerKey,
      technicalConfig: defaults.monitor_provision
    });
    createRequestHash = hashValue(createParams);
    createResult = await client.createMonitorSerialNumber({
      ownerKey: effectiveOwnerKey,
      params: createParams
    });
    createCompletedAt = new Date().toISOString();
    if (createResult.status !== "passed") {
      blockers.push(`monitor_create_failed:${createResult.apiCode || "unknown"}:${createResult.apiMessage || "unknown"}`);
    }

    const readbackParams = monitorQueryParams({
      account,
      ownerKey: effectiveOwnerKey,
      technicalConfig: defaults.monitor_provision,
      exact: true
    });
    readbackResult = await client.queryMonitorIndex({
      ownerKey: effectiveOwnerKey,
      params: readbackParams,
      includeControlledTouchpointUrl: true
    });
    readbackRows = compactMonitorRows(readbackResult);
    readbackExactRows = exactMonitorRows(readbackResult, defaults.monitor_provision);
    if (readbackResult.status !== "passed") {
      blockers.push(`post_create_monitor_readback_failed:${readbackResult.apiCode || "unknown"}:${readbackResult.apiMessage || "unknown"}`);
    } else if (readbackExactRows.length !== 1) {
      blockers.push(readbackExactRows.length === 0 ? "post_create_monitor_readback_missing" : "post_create_monitor_readback_ambiguous");
    } else {
      monitor = monitorFromRow(readbackExactRows[0], {
        requestHash: createRequestHash,
        responseHash: readbackResult.responseHash,
        source: "qiankun_monitor_ensure_readback",
        createCalled: true,
        createConfirmedAt,
        createCompletedAt
      });
      if (!monitor.touchpointUrlHash || !monitor.touchpointUrl) blockers.push("touchpoint_url_unresolved_after_monitor_list");
    }
  }

  const createCalled = Boolean(createResult);
  const finalAttemptCount = createCalled ? 2 : attemptCount;
  const finalLifecycleSummary = monitor
    ? monitor.touchpointUrl ? "monitor_resolved" : "monitor_resolved_touchpoint_pending"
    : finalAttemptCount >= MONITOR_MAX_ATTEMPTS ? "monitor_create_busy_retry_exhausted" : "monitor_create_terminal_failure";
  const publicSummary = {
    mode: "ensure",
    target,
    provisionId,
    requestFingerprint,
    confirmationPresent,
    confirmValuePresent,
    provisionValuePresent,
    credential: {
      status: credential.status,
      ownerKeyPresent: Boolean(effectiveOwnerKey),
      credentialStorePresent: credential.credentialStorePresent,
      activeCredentialCount: credential.activeCredentialCount,
      pendingOwnerKeyCount: credential.pendingOwnerKeyCount
    },
    latestRunBeforeCreate: latestRun ? {
      status: latestRun.status,
      monitorIdPresent: Boolean(latestRun.monitor_id),
      createCalled: latestRun.create_called === true,
      createAttemptNo: Number(latestRun.create_attempt_no || 0)
    } : {
      present: false
    },
    attemptState: {
      attemptCountBeforeEnsure: attemptCount,
      attemptCountAfterEnsure: finalAttemptCount,
      firstAttemptServerBusy: firstAttempt ? busyServerError(firstAttempt) : false,
      retryElapsedSeconds: Number.isFinite(retryElapsedSeconds) ? retryElapsedSeconds : null,
      claimedAttemptNo: Number(claimedAttempt?.attemptNo || 0),
      claimed: claimedAttempt?.claimed === true,
      maximumTotalAttempts: MONITOR_MAX_ATTEMPTS,
      retryAllowedAfterAttempt2: false
    },
    defaults: {
      monitorProvisionPresent: readiness.present,
      missingFields: readiness.missingFields,
      exactMonitorMatchingEnabled: readiness.readyForReadonlyReconcile,
      sourceRef: defaults?.monitor_provision?.source_ref || ""
    },
    account: account ? {
      resolved: true,
      technicalAccountRecordId: account.technicalAccountRecordId,
      mediaAccountId: account.mediaAccountId,
      accountId: account.accountId,
      agentId: account.agentId,
      agentName: account.agentName,
      ownerKey: account.ownerKey,
      ownerName: account.ownerName,
      authStatus: accountAuthStatus(account),
      authStatusName: account.authStatusName,
      platformStatus: account.status,
      advertiserNamePresent: Boolean(account.advertiserName),
      accessTokenPresent: account.accessTokenPresent
    } : {
      resolved: false,
      resultTotal: accountResult?.summary?.resultTotal || 0
    },
    preflightMonitorList: preflightMonitorResult ? {
      status: preflightMonitorResult.status,
      httpStatus: preflightMonitorResult.httpStatus,
      apiCode: preflightMonitorResult.apiCode,
      apiMessage: preflightMonitorResult.apiMessage || "",
      resultTotal: preflightMonitorResult.summary?.resultTotal || 0,
      rowCount: preflightRows.length,
      exactMatchCount: preflightExactRows.length,
      rows: preflightRows.slice(0, 10),
      responseHash: preflightMonitorResult.responseHash
    } : {
      called: false
    },
    createAttempt: createResult ? {
      called: true,
      endpoint: createResult.endpoint,
      httpStatus: createResult.httpStatus,
      apiCode: createResult.apiCode,
      apiMessage: createResult.apiMessage || "",
      requestHash: createRequestHash,
      responseHash: createResult.responseHash,
      requestFieldManifest: requestFieldManifest(createParams),
      rawRequestStored: false,
      rawResponseStored: false
    } : {
      called: false
    },
    postCreateReadback: readbackResult ? {
      status: readbackResult.status,
      httpStatus: readbackResult.httpStatus,
      apiCode: readbackResult.apiCode,
      apiMessage: readbackResult.apiMessage || "",
      resultTotal: readbackResult.summary?.resultTotal || 0,
      rowCount: readbackRows.length,
      exactMatchCount: readbackExactRows.length,
      rows: readbackRows.slice(0, 10),
      responseHash: readbackResult.responseHash
    } : {
      called: false
    },
    resolvedMonitor: monitor ? {
      monitorSerialId: monitor.id,
      monitorId: monitor.monitorId,
      touchpointUrlPresent: Boolean(monitor.touchpointUrl),
      touchpointUrlHashPresent: Boolean(monitor.touchpointUrlHash)
    } : null,
    blockers,
    createCalled,
    retryAllowed: finalAttemptCount < MONITOR_MAX_ATTEMPTS && !monitor,
    rawRequestStored: false,
    rawResponseStored: false
  };
  const safeSummary = sanitizeForPublic(publicSummary);
  assertNoSensitiveLeak(safeSummary);
  const evidenceArtifactId = await upsertEnsureEvidence({
    repo,
    provisionId,
    summary: safeSummary
  });
  if (createCalled) {
    await repo.completeMonitorProvisionAttempt({
      attemptId: claimedAttempt.attemptId || attemptId(provisionId, 2),
      attemptStatus: monitor ? "passed" : "failed",
      httpStatus: createResult.httpStatus,
      apiCode: createResult.apiCode || "",
      errorCategory: createErrorCategory(createResult),
      errorSummary: createResult.status === "passed" ? "monitor_create_passed" : `monitor_create_failed:${createResult.apiCode || "unknown"}:${createResult.apiMessage || "unknown"}`,
      requestHash: createRequestHash,
      responseHash: createResult.responseHash,
      evidenceArtifactId,
      completedAt: createCompletedAt
    });
  }
  const runStatus = monitor
    ? monitor.touchpointUrl ? "resolved" : "monitor_resolved_touchpoint_pending"
    : finalAttemptCount >= MONITOR_MAX_ATTEMPTS ? "terminal_failed" : account ? "account_resolved" : "failed";
  const writes = await persistReadonlyReconcile({
    repo,
    target,
    provisionId,
    requestFingerprint,
    defaults,
    credential,
    account,
    monitor,
    status: runStatus,
    errorSummary: finalLifecycleSummary,
    evidenceArtifactId,
    createAudit: {
      createCalled,
      createAttemptNo: finalAttemptCount,
      requestHash: createRequestHash,
      responseHash: createResult?.responseHash || "",
      createConfirmedAt,
      createCompletedAt
    }
  });

  const output = {
    ...safeSummary,
    status: blockers.length ? "blocked" : "passed",
    runStatus,
    evidenceArtifactId,
    writes
  };
  assertNoSensitiveLeak(output);
  return output;
}

export async function runMonitorProvisionFoundationStatus({
  repo,
  ownerKey = "",
  ensureScaffold = false,
  target = MONITOR_PROVISION_TARGET
} = {}) {
  const credential = redactedQiankunCredentialStatus({ ownerKey, ensure: ensureScaffold });
  const credentialStatus = credentialStatusForDatabase(credential);
  let defaults = null;
  let defaultsError = "";
  let latestRun = null;
  let latestRunError = "";
  let attemptState = null;
  let attemptStateError = "";
  if (repo) {
    try {
      defaults = await repo.getMonitorProvisionDefaults({
        routeId: target.routeId,
        gameCode: target.gameCode
      });
    } catch (error) {
      defaultsError = clean(error.message || error.code || "defaults_read_failed");
    }
    try {
      latestRun = await repo.getLatestMonitorProvisionRun({
        routeId: target.routeId,
        gameCode: target.gameCode,
        advertiserId: target.advertiserId
      });
    } catch (error) {
      latestRunError = clean(error.message || error.code || "latest_run_read_failed");
    }
    try {
      attemptState = await repo.getMonitorProvisionAttemptState({ provisionId: monitorProvisionId(target) });
    } catch (error) {
      attemptStateError = clean(error.message || error.code || "attempt_state_read_failed");
    }
  }
  const readiness = monitorDefaultsReadiness(defaults || {});
  const fingerprint = monitorProvisionFingerprint({
    ...target,
    technicalConfig: defaults?.monitor_provision || {}
  });
  const output = {
    status: "foundation_ready",
    target,
    provisionId: monitorProvisionId(target),
    requestFingerprint: fingerprint,
    credentialStatus,
    credential,
    defaults: defaults ? {
      routeId: defaults.route_id,
      gameCode: defaults.game_code,
      monitorProvisionPresent: defaults.monitor_provision_present === true,
      monitorProvisionFieldCount: Object.keys(defaults.monitor_provision || {}).length,
      readiness
    } : {
      monitorProvisionPresent: false,
      readiness,
      error: defaultsError
    },
    latestRun: latestRun ? {
      provisionId: latestRun.provision_id,
      status: latestRun.status,
      credentialStatus: latestRun.credential_status,
      monitorIdPresent: Boolean(latestRun.monitor_id),
      touchpointRefPresent: Boolean(latestRun.touchpoint_ref),
      touchpointUrlHashPresent: Boolean(latestRun.touchpoint_url_hash),
      createCalled: latestRun.create_called === true,
      createAttemptNo: Number(latestRun.create_attempt_no || 0),
      createConfirmedAtPresent: Boolean(latestRun.create_confirmed_at),
      createCompletedAtPresent: Boolean(latestRun.create_completed_at),
      updatedAt: latestRun.updated_at
    } : {
      present: false,
      error: latestRunError
    },
    attemptState: attemptState ? {
      attemptCount: Number(attemptState.attemptCount || 0),
      latestAttemptNo: Number(attemptState.latestAttempt?.attempt_no || 0),
      latestAttemptStatus: clean(attemptState.latestAttempt?.attempt_status),
      latestAttemptApiCode: clean(attemptState.latestAttempt?.api_code),
      latestAttemptErrorCategory: clean(attemptState.latestAttempt?.error_category),
      firstAttemptServerBusy: attemptState.firstAttempt ? busyServerError(attemptState.firstAttempt) : false,
      maximumTotalAttempts: MONITOR_MAX_ATTEMPTS
    } : {
      present: false,
      error: attemptStateError
    },
    createAllowedInCurrentTask: false,
    createConfirmationPresent: monitorEnsureConfirmed({ provisionId: monitorProvisionId(target) }),
    allowedReadonlyEndpoints: [
      "POST /tf/account_info/accountIndex",
      "POST /tf/ad/index"
    ],
    blockedWriteEndpoint: "POST /tf/ad/monitorSerialNumberAdd",
    rawRequestStored: false,
    rawResponseStored: false
  };
  const safe = sanitizeForPublic(output);
  assertNoSensitiveLeak(safe);
  return safe;
}

export async function runMonitorProvisionCommand({
  mode = "status",
  repo,
  ownerKey = "",
  ensureScaffold = false,
  target = MONITOR_PROVISION_TARGET,
  env = process.env
} = {}) {
  const cleanMode = clean(mode) || "status";
  if (cleanMode === "status") {
    return runMonitorProvisionFoundationStatus({ repo, ownerKey, ensureScaffold, target });
  }
  if (cleanMode === "reconcile") {
    return runMonitorProvisionReadonlyReconcile({ repo, ownerKey, target });
  }
  if (cleanMode === "ensure") {
    return runMonitorProvisionEnsure({ repo, ownerKey, target, env });
  }
  if (cleanMode === "report") {
    const provisionId = monitorProvisionId(target);
    const result = {
      status: "passed",
      mode: cleanMode,
      target,
      provisionId,
      statusReport: repo ? await repo.getMonitorProvisionStatusReport({ provisionId }) : [],
      blockerReport: repo ? await repo.getMonitorProvisionBlockerReport({ provisionId }) : []
    };
    const safe = sanitizeForPublic(result);
    assertNoSensitiveLeak(safe);
    return safe;
  }
  throw new Error(`unsupported_monitor_provision_mode:${cleanMode}`);
}
