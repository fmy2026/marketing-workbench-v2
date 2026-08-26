import { credentialStatusForDatabase, redactedQiankunCredentialStatus } from "../../../platforms/qiankunCredentialStore.mjs";
import { createQiankunMonitorClient } from "../../../platforms/qiankunMonitorClient.mjs";
import { assertNoSensitiveLeak, hashValue, sanitizeForPublic } from "./contracts.mjs";
import {
  runQiankunCateVestReadonlySync,
  runQiankunLevel3MediaResourceReadonlySync,
  runQiankunMediaCatalogReadonlySync,
  runQiankunMonitorTechnicalCombinationReadonlySync,
  runQiankunPackageBaseInfoReadonlySync,
  runQiankunVestPackageReadonlySync
} from "./qiankun-option-relation-sync.mjs";

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
export const MONITOR_L3_OVERRIDE_CONFIRM_ENV = "MWBV2_MONITOR_L3_OVERRIDE_CONFIRM";
export const MONITOR_L3_OVERRIDE_CONFIRM_VALUE = "CONFIRM_MEDIA_RESOURCE_310_FOR_ONE_MONITOR";

const MONITOR_L3_MANUAL_OVERRIDE_SCOPE = {
  routeId: "oceanengine_3_byte_mini_game",
  gameCode: "JSZC",
  advertiserId: "1871922346964041",
  provisionId: "MPR-OCEANENGINE-3-BYTE-MINI-GAME-JSZC-1871922346964041",
  os: "3",
  cateId: "122",
  vestId: "1414",
  packageId: "36820",
  channel: "dymini3k",
  mediaId: "310",
  mediaName: "通投智选（原生竞价）",
  monitorApi: "toutiao_wxgame",
  agentId: "613",
  qiankunAccountRecordId: "8448"
};

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

function stableIdPart(value) {
  return clean(value).toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "UNKNOWN";
}

function manualL3OverrideEvidenceId({ routeId, gameCode, advertiserId } = MONITOR_PROVISION_TARGET) {
  return [
    "EV-QK-MANUAL-L3-CONFIRM",
    stableIdPart(routeId),
    stableIdPart(gameCode),
    clean(advertiserId),
    MONITOR_L3_MANUAL_OVERRIDE_SCOPE.mediaId
  ].join("-");
}

function manualL3OverrideState({ env = process.env, target = MONITOR_PROVISION_TARGET, provisionId = "", defaults = {} } = {}) {
  const config = defaults?.monitor_provision || {};
  const scope = MONITOR_L3_MANUAL_OVERRIDE_SCOPE;
  const confirmValuePresent = env[MONITOR_L3_OVERRIDE_CONFIRM_ENV] === MONITOR_L3_OVERRIDE_CONFIRM_VALUE;
  const checks = [
    ["provision_id", provisionId, scope.provisionId],
    ["route_id", target.routeId, scope.routeId],
    ["game_code", target.gameCode, scope.gameCode],
    ["advertiser_id", target.advertiserId, scope.advertiserId],
    ["os", config.os, scope.os],
    ["cate_id", config.cate_id, scope.cateId],
    ["vest_id", config.vest_id, scope.vestId],
    ["package_id", config.package_id, scope.packageId],
    ["channel", config.channel, scope.channel]
  ].map(([field, actual, expected]) => ({
    field,
    expected: clean(expected),
    actual: clean(actual),
    matched: clean(actual) === clean(expected)
  }));
  return {
    requiredEnv: MONITOR_L3_OVERRIDE_CONFIRM_ENV,
    expectedValue: MONITOR_L3_OVERRIDE_CONFIRM_VALUE,
    confirmValuePresent,
    scopeMatches: checks.every((item) => item.matched),
    active: false,
    evidenceArtifactId: "",
    overrideValues: {
      media_id: scope.mediaId,
      media_name: scope.mediaName,
      monitor_api: scope.monitorApi,
      agent_id: scope.agentId,
      qiankun_account_record_id: scope.qiankunAccountRecordId
    },
    scopeChecks: checks,
    source: "user_confirmed_in_qiankun_backend",
    validFor: "one_monitor_create_attempt_only"
  };
}

function applyManualL3Override(defaults = {}, manualOverride = {}) {
  if (manualOverride.active !== true) return defaults;
  return {
    ...(defaults || {}),
    monitor_provision_present: true,
    monitor_provision: {
      ...(defaults?.monitor_provision || {}),
      media_id: manualOverride.overrideValues.media_id,
      media_name: manualOverride.overrideValues.media_name,
      monitor_api: manualOverride.overrideValues.monitor_api,
      agent_id: manualOverride.overrideValues.agent_id,
      manual_l3_override_evidence_id: manualOverride.evidenceArtifactId,
      manual_l3_override_scope: "current_provision_only"
    }
  };
}

function monitorDefaultsReadiness(defaults = {}) {
  const config = defaults.monitor_provision || {};
  const required = ["os", "package_id", "cate_id", "vest_id", "channel", "media_id", "agent_id", "monitor_api", "usage", "num"];
  const missing = required.filter((key) => clean(config[key]) === "");
  return {
    present: defaults.monitor_provision_present === true,
    missingFields: missing,
    readyForReadonlyReconcile: defaults.monitor_provision_present === true && missing.length === 0
  };
}

function monitorPlanConfig(defaults = {}) {
  const config = defaults.monitor_provision || {};
  const candidates = defaults.monitor_provision_reference_candidates || {};
  return {
    ...config,
    ...(clean(config.media_id) ? {} : { media_id: clean(candidates.media_id) }),
    ...(clean(config.agent_id) ? {} : { agent_id: clean(candidates.agent_id) }),
    ...(clean(config.monitor_api) ? {} : { monitor_api: clean(candidates.monitor_api) }),
    reference_candidate_status: clean(candidates.status),
    reference_candidate_source_ref: clean(candidates.source_ref)
  };
}

function callbackDataTypes(config = {}) {
  if (Array.isArray(config.server_callback_data_types)) {
    return config.server_callback_data_types.map(clean).filter(Boolean);
  }
  const text = clean(config.server_callback_data_types);
  if (!text) return [];
  return text.split(",").map(clean).filter(Boolean);
}

function callbackContractState(config = {}) {
  const requiredTypes = ["active", "register", "success_order"];
  const required = config.server_callback_required === true || clean(config.server_callback_required) === "true";
  const type = clean(config.server_callback_type);
  const dataTypes = callbackDataTypes(config);
  const missing = [];
  if (required && !type) missing.push("server_callback_type");
  if (required) {
    for (const item of requiredTypes) {
      if (!dataTypes.includes(item)) missing.push(`server_callback_data_types:${item}`);
    }
  }
  return {
    required,
    type,
    dataTypes,
    requiredTypes,
    missing,
    ready: !required || missing.length === 0,
    contractHash: hashValue({
      server_callback_required: required,
      server_callback_type: type,
      server_callback_data_types: dataTypes
    })
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

async function upsertPlanOnlyEvidence({ repo, provisionId, summary }) {
  if (!repo) return "";
  const safeSummary = sanitizeForPublic(summary);
  assertNoSensitiveLeak(safeSummary);
  const artifactId = `EV-${provisionId}-PLAN-ONLY`;
  await repo.upsertEvidence({
    artifactId,
    jobId: null,
    artifactType: "qiankun_monitor_plan_only",
    title: "乾坤监测序号 plan-only 证据",
    summary: JSON.stringify(safeSummary),
    contentHash: hashValue(safeSummary),
    storageRef: `postgres:mwb.monitor_provision_runs/${provisionId}`,
    sourceRef: "qiankun:/tf/account_info/accountIndex+/tf/ad/index",
    sourceUsage: "runtime_truth"
  });
  return artifactId;
}

async function upsertMonitorIdsReadonlyEvidence({ repo, artifactId, summary }) {
  if (!repo) return "";
  const safeSummary = sanitizeForPublic(summary);
  assertNoSensitiveLeak(safeSummary);
  await repo.upsertEvidence({
    artifactId,
    jobId: null,
    artifactType: "qiankun_monitor_ids_readonly",
    title: "乾坤监测序号 monitor_id 只读核验证据",
    summary: JSON.stringify(safeSummary),
    contentHash: hashValue(safeSummary),
    storageRef: `postgres:mwb.evidence_artifacts/${artifactId}`,
    sourceRef: "qiankun:/tf/ad/index",
    sourceUsage: "reference_only"
  });
  return artifactId;
}

async function upsertManualL3OverrideEvidence({ repo, target, provisionId, manualOverride }) {
  if (!repo || manualOverride.confirmValuePresent !== true || manualOverride.scopeMatches !== true) return "";
  const artifactId = manualL3OverrideEvidenceId(target);
  const safeSummary = sanitizeForPublic({
    artifactType: "qiankun_manual_l3_confirm",
    target: {
      routeId: target.routeId,
      gameCode: target.gameCode,
      advertiserId: target.advertiserId,
      provisionId
    },
    manualConfirm: {
      source: manualOverride.source,
      mediaId: manualOverride.overrideValues.media_id,
      mediaName: manualOverride.overrideValues.media_name,
      monitorApi: manualOverride.overrideValues.monitor_api,
      agentId: manualOverride.overrideValues.agent_id,
      qiankunAccountRecordId: manualOverride.overrideValues.qiankun_account_record_id,
      validFor: manualOverride.validFor,
      changeMediaIdStatus: "server_busy_unverified"
    },
    safeguards: {
      globalRelationWritten: false,
      gameRouteDefaultsModified: false,
      monitorCreateApproval: false,
      rawRequestStored: false,
      rawResponseStored: false
    },
    scopeChecks: manualOverride.scopeChecks
  });
  assertNoSensitiveLeak(safeSummary);
  await repo.upsertEvidence({
    artifactId,
    jobId: null,
    artifactType: "qiankun_manual_l3_confirm",
    title: "乾坤 L3 资源位人工确认覆盖证据",
    summary: JSON.stringify(safeSummary),
    contentHash: hashValue(safeSummary),
    storageRef: `postgres:mwb.monitor_provision_runs/${provisionId}`,
    sourceRef: "user:qiankun_backend_manual_confirmation",
    sourceUsage: "runtime_truth"
  });
  return artifactId;
}

async function syncManualL3ConfirmedRelations({
  repo,
  target,
  defaults,
  account,
  evidenceArtifactId,
  requestFingerprint,
  responseHash
}) {
  if (!repo || !account || !evidenceArtifactId) return [];
  const config = defaults?.monitor_provision || {};
  const os = clean(config.os);
  const mediaId = clean(config.media_id);
  const mediaName = clean(config.media_name);
  const monitorApi = clean(config.monitor_api);
  const accountRecordId = clean(account.qiankunAccountRecordId || account.technicalAccountRecordId || account.mediaAccountId);
  const agentId = clean(config.agent_id || account.agentId);
  const relationSpecs = [
    {
      relationType: "media_resource_to_allowed_account_record",
      parentType: "media_resource",
      parentId: mediaId,
      parentName: mediaName,
      childType: "account_record",
      relations: accountRecordId ? [{ childId: accountRecordId, childName: accountRecordId }] : []
    },
    {
      relationType: "media_resource_to_allowed_monitor_api",
      parentType: "media_resource",
      parentId: mediaId,
      parentName: mediaName,
      childType: "monitor_api",
      relations: monitorApi ? [{ childId: monitorApi, childName: monitorApi }] : []
    },
    {
      relationType: "account_record_to_agent",
      parentType: "account_record",
      parentId: accountRecordId,
      parentName: account.ownerName || "",
      childType: "agent",
      relations: agentId ? [{ childId: agentId, childName: account.agentName || agentId }] : []
    }
  ];

  const results = [];
  for (const spec of relationSpecs) {
    if (!os || !spec.parentId || spec.relations.length === 0) continue;
    const result = await repo.syncQiankunOptionRelations({
      relationType: spec.relationType,
      routeId: target.routeId,
      gameCode: target.gameCode,
      os,
      parentType: spec.parentType,
      parentId: spec.parentId,
      parentName: spec.parentName,
      childType: spec.childType,
      relations: spec.relations,
      validationStatus: "observed",
      sourceEndpoint: "/tf/ad/index",
      requestFingerprint,
      responseHash,
      evidenceArtifactId
    });
    results.push({
      relationType: spec.relationType,
      inputCount: spec.relations.length,
      upsertedCount: Number(result?.upsertedCount || 0),
      staleCount: Number(result?.staleCount || 0)
    });
  }
  return results;
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
    media_account_id: clean(account.qiankunAccountRecordId || account.technicalAccountRecordId || account.mediaAccountId),
    server_callback_type: clean(technicalConfig.server_callback_type),
    server_callback_data_types: callbackDataTypes(technicalConfig),
    remark: `mwbv2-${target.gameCode}-${target.advertiserId}`
  };
  return Object.fromEntries(Object.entries(params).filter(([, value]) => {
    if (Array.isArray(value)) return value.length > 0;
    return clean(value) !== "";
  }));
}

function requestFieldManifest(params = {}) {
  const callbackContract = callbackContractState({
    server_callback_required: Boolean(params.server_callback_type || params.server_callback_data_types),
    server_callback_type: params.server_callback_type,
    server_callback_data_types: params.server_callback_data_types
  });
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
    callbackContract: {
      required: callbackContract.required,
      typePresent: Boolean(callbackContract.type),
      dataTypes: callbackContract.dataTypes,
      missing: callbackContract.missing,
      ready: callbackContract.ready,
      contractHash: callbackContract.contractHash
    },
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

export async function runMonitorProvisionPlanOnly({
  repo,
  ownerKey = "",
  target = MONITOR_PROVISION_TARGET
} = {}) {
  const provisionId = monitorProvisionId(target);
  const initialCredential = redactedQiankunCredentialStatus({ ownerKey });
  const effectiveOwnerKey = selectedOwnerKey(ownerKey, initialCredential);
  const credential = redactedQiankunCredentialStatus({ ownerKey: effectiveOwnerKey });
  const storedDefaults = repo ? await repo.getMonitorProvisionDefaults({
    routeId: target.routeId,
    gameCode: target.gameCode
  }) : null;
  const planDefaults = {
    ...(storedDefaults || {}),
    monitor_provision_present: storedDefaults?.monitor_provision_present === true,
    monitor_provision: monitorPlanConfig(storedDefaults || {})
  };
  const readiness = monitorDefaultsReadiness(planDefaults || {});
  const callbackContract = callbackContractState(planDefaults.monitor_provision || {});
  const requestFingerprint = monitorProvisionFingerprint({
    ...target,
    technicalConfig: planDefaults.monitor_provision || {}
  });
  const attemptState = repo ? await repo.getMonitorProvisionAttemptState({ provisionId }) : null;
  const attemptCount = Number(attemptState?.attemptCount || 0);

  const blockers = [];
  if (!effectiveOwnerKey) blockers.push("owner_key_missing_or_not_persisted");
  if (effectiveOwnerKey && credential.status !== "active") blockers.push(`credential_not_active:${credential.status}`);
  if (!readiness.readyForReadonlyReconcile) {
    blockers.push(readiness.present ? `monitor_plan_contract_incomplete:${readiness.missingFields.join(",")}` : "monitor_provision_defaults_missing");
  }
  if (!callbackContract.ready) blockers.push("callback_contract_missing");

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
      const qiankunAccountRecordId = clean(accountRow.mediaAccountRecordId || accountRow.id);
      const resolvedOwnerKey = clean(accountRow.ssoOwnerKey || accountRow.ssoOwner);
      account = {
        technicalAccountRecordId: qiankunAccountRecordId,
        qiankunAccountRecordId,
        accountId: clean(accountRow.accountId),
        advertiserId: clean(accountRow.accountId),
        mediaAccountId: qiankunAccountRecordId,
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
      if (clean(planDefaults.monitor_provision.agent_id) && clean(accountRow.agentId) && clean(accountRow.agentId) !== clean(planDefaults.monitor_provision.agent_id)) {
        blockers.push("reference_candidate_agent_id_mismatch");
      }
    }
  }

  let monitorResult = null;
  let monitorRows = [];
  let exactRows = [];
  let monitor = null;
  if (account && readiness.readyForReadonlyReconcile) {
    const params = monitorQueryParams({
      account,
      ownerKey: account.ownerKey || effectiveOwnerKey,
      technicalConfig: planDefaults.monitor_provision,
      exact: true
    });
    monitorResult = await client.queryMonitorIndex({
      ownerKey: effectiveOwnerKey,
      params,
      includeControlledTouchpointUrl: true
    });
    monitorRows = compactMonitorRows(monitorResult);
    exactRows = exactMonitorRows(monitorResult, planDefaults.monitor_provision);
    if (monitorResult.status !== "passed") {
      blockers.push(`monitor_list_query_failed:${monitorResult.apiCode || "unknown"}:${monitorResult.apiMessage || "unknown"}`);
    } else if (exactRows.length > 1) {
      blockers.push("monitor_exact_match_ambiguous");
    } else if (exactRows.length === 1) {
      monitor = monitorFromRow(exactRows[0], {
        requestHash: hashValue(params),
        responseHash: monitorResult.responseHash,
        source: "qiankun_monitor_plan_existing"
      });
      if (!monitor.touchpointUrlHash || !monitor.touchpointUrl) blockers.push("touchpoint_url_unresolved_after_monitor_list");
    }
  }

  const createParams = account ? monitorCreateParams({
    target,
    account,
    ownerKey: account.ownerKey || effectiveOwnerKey,
    technicalConfig: planDefaults.monitor_provision
  }) : {};
  const createPlanManifest = requestFieldManifest(createParams);
  const publicSummary = {
    mode: "plan_only",
    target,
    provisionId,
    requestFingerprint,
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
      exactMonitorMatchingEnabled: readiness.readyForReadonlyReconcile,
      sourceRef: planDefaults?.monitor_provision?.source_ref || "",
      referenceCandidateStatus: clean(planDefaults?.monitor_provision?.reference_candidate_status),
      referenceCandidateSourceRef: clean(planDefaults?.monitor_provision?.reference_candidate_source_ref),
      callbackContract
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
    createPlan: {
      endpoint: "/tf/ad/monitorSerialNumberAdd",
      requestFieldManifest: createPlanManifest,
      requestHash: Object.keys(createParams).length ? hashValue(createParams) : "",
      callbackContract,
      wouldCreate: !monitor && blockers.length === 0,
      createCalled: false
    },
    confirmationSnapshot: {
      advertiserId: target.advertiserId,
      existingMonitor: Boolean(monitor),
      monitorId: monitor?.monitorId || "",
      gameCode: target.gameCode,
      cateId: clean(planDefaults.monitor_provision.cate_id),
      vestId: clean(planDefaults.monitor_provision.vest_id),
      packageId: clean(planDefaults.monitor_provision.package_id),
      channel: clean(planDefaults.monitor_provision.channel),
      mediaId: clean(planDefaults.monitor_provision.media_id),
      agentId: clean(planDefaults.monitor_provision.agent_id),
      monitorApi: clean(planDefaults.monitor_provision.monitor_api),
      owner: account?.ownerKey || "",
      usage: clean(planDefaults.monitor_provision.usage),
      callbackType: callbackContract.type,
      callbackDataTypes: callbackContract.dataTypes,
      callbackContractHash: callbackContract.contractHash,
      attemptCount,
      laterRealCreateAllowed: blockers.length === 0 && !monitor
    },
    resolvedMonitor: monitor ? {
      monitorSerialId: monitor.id,
      monitorId: monitor.monitorId,
      touchpointUrlPresent: Boolean(monitor.touchpointUrl),
      touchpointUrlHashPresent: Boolean(monitor.touchpointUrlHash)
    } : null,
    blockers,
    accountApiCalled: Boolean(accountResult),
    monitorListApiCalled: Boolean(monitorResult),
    createCalled: false,
    rawRequestStored: false,
    rawResponseStored: false
  };
  const safeSummary = sanitizeForPublic(publicSummary);
  assertNoSensitiveLeak(safeSummary);
  const evidenceArtifactId = await upsertPlanOnlyEvidence({
    repo,
    provisionId,
    summary: safeSummary
  });
  if (repo && account) {
    await repo.updateQiankunAccountIdentity({
      advertiserId: target.advertiserId,
      routeId: target.routeId,
      gameCode: target.gameCode,
      accountName: account.advertiserName || target.advertiserId,
      authStatus: account.authStatusName || "unknown",
      platformStatus: account.status || "unknown",
      ownerName: account.ownerName || "",
      qiankunAccountRecordId: account.qiankunAccountRecordId,
      qiankunOwnerKey: account.ownerKey,
      qiankunAgentId: account.agentId,
      qiankunIdentityStatus: "observed"
    });
  }
  const runStatus = monitor
    ? monitor.touchpointUrlHash ? "touchpoint_resolved" : "monitor_resolved"
    : account ? "planned" : "failed";
  const writes = await persistReadonlyReconcile({
    repo,
    target,
    provisionId,
    requestFingerprint,
    defaults: planDefaults,
    credential,
    account,
    monitor,
    status: runStatus,
    errorSummary: blockers.join(";"),
    evidenceArtifactId,
    createAudit: {
      createCalled: false,
      createAttemptNo: 0
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

export async function runMonitorIdsReadonlyVerify({
  repo,
  ownerKey = "",
  monitorIds = [],
  target = MONITOR_PROVISION_TARGET
} = {}) {
  const ids = (Array.isArray(monitorIds) ? monitorIds : [monitorIds])
    .map(clean)
    .filter(Boolean);
  const uniqueIds = [...new Set(ids)];
  const initialCredential = redactedQiankunCredentialStatus({ ownerKey });
  const effectiveOwnerKey = selectedOwnerKey(ownerKey, initialCredential);
  const credential = redactedQiankunCredentialStatus({ ownerKey: effectiveOwnerKey });
  const defaults = repo ? await repo.getMonitorProvisionDefaults({
    routeId: target.routeId,
    gameCode: target.gameCode
  }) : null;
  const planDefaults = {
    ...(defaults || {}),
    monitor_provision_present: defaults?.monitor_provision_present === true,
    monitor_provision: monitorPlanConfig(defaults || {})
  };
  const requestFingerprint = monitorProvisionFingerprint({
    ...target,
    technicalConfig: planDefaults.monitor_provision || {}
  });
  const blockers = [];
  if (!uniqueIds.length) blockers.push("monitor_ids_missing");
  if (!effectiveOwnerKey) blockers.push("owner_key_missing_or_not_persisted");
  if (effectiveOwnerKey && credential.status !== "active") blockers.push(`credential_not_active:${credential.status}`);

  const client = createQiankunMonitorClient();
  const results = [];
  if (!blockers.length) {
    for (const monitorId of uniqueIds) {
      const params = { pageNo: 1, pageSize: 10, monitorId };
      const result = await client.queryMonitorIndex({
        ownerKey: effectiveOwnerKey,
        params,
        includeControlledTouchpointUrl: false
      });
      const rows = compactMonitorRows(result);
      results.push({
        monitorId,
        requestHash: hashValue(params),
        status: result.status,
        httpStatus: result.httpStatus,
        apiCode: result.apiCode,
        apiMessage: result.apiMessage || "",
        resultTotal: result.summary?.resultTotal || 0,
        rowCount: rows.length,
        rows,
        callbackFieldsVisible: false,
        callbackVisibilityNote: "tf_ad_index_summary_does_not_expose_callback_fields",
        responseHash: result.responseHash
      });
      if (result.status !== "passed") {
        blockers.push(`monitor_id_query_failed:${monitorId}:${result.apiCode || "unknown"}:${result.apiMessage || "unknown"}`);
      }
    }
  }

  const summary = {
    mode: "monitor_ids_readonly",
    target,
    requestFingerprint,
    monitorIds: uniqueIds,
    credential: {
      status: credential.status,
      ownerKeyPresent: Boolean(effectiveOwnerKey),
      credentialStorePresent: credential.credentialStorePresent,
      activeCredentialCount: credential.activeCredentialCount,
      pendingOwnerKeyCount: credential.pendingOwnerKeyCount
    },
    results,
    blockers,
    createCalled: false,
    rawRequestStored: false,
    rawResponseStored: false
  };
  const safeSummary = sanitizeForPublic(summary);
  assertNoSensitiveLeak(safeSummary);
  const artifactId = `EV-QK-MONITOR-IDS-READONLY-${uniqueIds.map(stableIdPart).join("-") || "UNKNOWN"}`;
  const evidenceArtifactId = await upsertMonitorIdsReadonlyEvidence({
    repo,
    artifactId,
    summary: safeSummary
  });
  const accountWritebacks = [];
  if (repo && evidenceArtifactId) {
    for (const result of results) {
      if (result.status !== "passed") continue;
      const matchingRows = result.rows.filter((row) => {
        if (clean(row.mediaAccountId) !== clean(target.advertiserId)) return false;
        return exactMonitorRows({ summary: { list: [row] } }, planDefaults.monitor_provision).length === 1;
      });
      if (matchingRows.length !== 1) continue;
      const row = matchingRows[0];
      const account = {
        technicalAccountRecordId: row.mediaAccountRecordId,
        qiankunAccountRecordId: row.mediaAccountRecordId,
        accountId: row.mediaAccountId,
        advertiserId: row.mediaAccountId,
        mediaAccountId: row.mediaAccountRecordId,
        agentId: row.agentId,
        agentName: row.agentName,
        ownerKey: row.ssoOwnerKey,
        ownerName: row.ssoOwner,
        advertiserName: row.mediaAccountId,
        authStatusName: "readonly_monitor_found",
        status: "unknown",
        accessTokenPresent: false
      };
      const monitor = monitorFromRow(row, {
        requestHash: result.requestHash,
        responseHash: result.responseHash,
        source: "qiankun_monitor_ids_readonly"
      });
      const writes = await persistReadonlyReconcile({
        repo,
        target,
        provisionId: monitorProvisionId(target),
        requestFingerprint,
        defaults: planDefaults,
        credential,
        account,
        monitor,
        status: monitor.touchpointUrlHash ? "touchpoint_resolved" : "monitor_resolved",
        errorSummary: "monitor_resolved_by_monitor_id_readonly",
        evidenceArtifactId,
        createAudit: {
          createCalled: false,
          createAttemptNo: 0
        }
      });
      accountWritebacks.push({
        monitorId: row.monitorId,
        advertiserId: row.mediaAccountId,
        monitorMatchedTarget: true,
        writes
      });
    }
  }
  const output = {
    ...safeSummary,
    status: blockers.length ? "blocked" : "passed",
    evidenceArtifactId,
    accountWritebacks
  };
  assertNoSensitiveLeak(output);
  return output;
}

export async function runMonitorProvisionEnsure({
  repo,
  ownerKey = "",
  target = MONITOR_PROVISION_TARGET,
  env = process.env,
  planOnly = false
} = {}) {
  if (planOnly) return runMonitorProvisionPlanOnly({ repo, ownerKey, target });
  const provisionId = monitorProvisionId(target);
  const confirmationPresent = monitorEnsureConfirmed({ env, provisionId });
  const confirmValuePresent = env[MONITOR_RETRY_CONFIRM_ENV] === MONITOR_RETRY_CONFIRM_VALUE;
  const provisionValuePresent = env[MONITOR_PROVISION_ID_ENV] === provisionId;
  const initialCredential = redactedQiankunCredentialStatus({ ownerKey });
  const effectiveOwnerKey = selectedOwnerKey(ownerKey, initialCredential);
  const credential = redactedQiankunCredentialStatus({ ownerKey: effectiveOwnerKey });
  const storedDefaults = repo ? await repo.getMonitorProvisionDefaults({
    routeId: target.routeId,
    gameCode: target.gameCode
  }) : null;
  const manualOverrideBase = manualL3OverrideState({ env, target, provisionId, defaults: storedDefaults || {} });
  const manualOverrideEvidenceArtifactId = await upsertManualL3OverrideEvidence({
    repo,
    target,
    provisionId,
    manualOverride: manualOverrideBase
  });
  const manualL3Override = {
    ...manualOverrideBase,
    evidenceArtifactId: manualOverrideEvidenceArtifactId,
    active: manualOverrideBase.confirmValuePresent === true &&
      manualOverrideBase.scopeMatches === true &&
      Boolean(manualOverrideEvidenceArtifactId)
  };
  const defaults = applyManualL3Override(storedDefaults || {}, manualL3Override);
  const readiness = monitorDefaultsReadiness(defaults || {});
  const callbackContract = callbackContractState(defaults?.monitor_provision || {});
  const requestFingerprint = monitorProvisionFingerprint({
    ...target,
    technicalConfig: defaults?.monitor_provision || {}
  });
  const latestRun = repo ? await repo.getLatestMonitorProvisionRun({
    routeId: target.routeId,
    gameCode: target.gameCode,
    advertiserId: target.advertiserId
  }) : null;
  let storedAccount = null;
  try {
    const core = repo ? await repo.getCoreContext({
      routeId: target.routeId,
      gameCode: target.gameCode,
      advertiserId: target.advertiserId
    }) : null;
    storedAccount = core?.account || null;
  } catch {
    storedAccount = null;
  }
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
  if (!callbackContract.ready) blockers.push("callback_contract_missing");
  const qiankunIdentityVerified = storedAccount?.qiankun_identity_status === "verified" &&
    Boolean(clean(storedAccount?.qiankun_account_record_id)) &&
    Boolean(clean(storedAccount?.qiankun_owner_key));
  const qiankunIdentityAccepted = qiankunIdentityVerified || manualL3Override.active;
  if (!qiankunIdentityAccepted) {
    blockers.push(manualOverrideBase.confirmValuePresent && !manualOverrideBase.scopeMatches
      ? "manual_l3_override_scope_mismatch"
      : "qiankun_monitor_config_unverified");
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
        exactMonitorMatchingEnabled: readiness.readyForReadonlyReconcile,
        qiankunMonitorConfigStatus: qiankunIdentityVerified ? "verified" : "qiankun_monitor_config_unverified",
        callbackContract
      },
      manualL3Override: {
        confirmValuePresent: manualL3Override.confirmValuePresent,
        scopeMatches: manualL3Override.scopeMatches,
        active: manualL3Override.active,
        evidenceArtifactId: manualL3Override.evidenceArtifactId,
        validFor: manualL3Override.validFor,
        monitorCreateApproval: false
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
      qiankunMonitorConfigStatus: qiankunIdentityVerified ? "verified" : "qiankun_monitor_config_unverified",
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
      manualL3Override: {
        confirmValuePresent: manualL3Override.confirmValuePresent,
        scopeMatches: manualL3Override.scopeMatches,
        active: manualL3Override.active,
        evidenceArtifactId: manualL3Override.evidenceArtifactId,
        validFor: manualL3Override.validFor,
        monitorCreateApproval: false
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
      const qiankunAccountRecordId = clean(storedAccount?.qiankun_account_record_id || accountRow.mediaAccountRecordId || accountRow.id);
      account = {
        technicalAccountRecordId: qiankunAccountRecordId,
        qiankunAccountRecordId,
        accountId: clean(accountRow.accountId),
        advertiserId: clean(accountRow.accountId),
        mediaAccountId: qiankunAccountRecordId,
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
      if (manualL3Override.active && qiankunAccountRecordId !== manualL3Override.overrideValues.qiankun_account_record_id) {
        blockers.push("manual_l3_override_account_record_mismatch");
      }
      if (manualL3Override.active && clean(accountRow.agentId) && clean(accountRow.agentId) !== manualL3Override.overrideValues.agent_id) {
        blockers.push("manual_l3_override_agent_id_mismatch");
      }
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
      sourceRef: defaults?.monitor_provision?.source_ref || "",
      callbackContract
    },
    manualL3Override: {
      confirmValuePresent: manualL3Override.confirmValuePresent,
      scopeMatches: manualL3Override.scopeMatches,
      active: manualL3Override.active,
      evidenceArtifactId: manualL3Override.evidenceArtifactId,
      validFor: manualL3Override.validFor,
      monitorCreateApproval: createCalled === true,
      overrideFieldsApplied: manualL3Override.active ? ["media_id", "media_name", "monitor_api", "agent_id"] : []
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
  const relationWriteResults = monitor && manualL3Override.active
    ? await syncManualL3ConfirmedRelations({
      repo,
      target,
      defaults,
      account,
      evidenceArtifactId,
      requestFingerprint,
      responseHash: readbackResult?.responseHash || preflightMonitorResult?.responseHash || ""
    })
    : [];
  if (repo && monitor && manualL3Override.active && account) {
    await repo.updateQiankunAccountIdentity({
      advertiserId: target.advertiserId,
      routeId: target.routeId,
      gameCode: target.gameCode,
      accountName: account.advertiserName || target.advertiserId,
      authStatus: account.authStatusName || "unknown",
      platformStatus: account.status || "unknown",
      ownerName: account.ownerName || "",
      qiankunAccountRecordId: manualL3Override.overrideValues.qiankun_account_record_id,
      qiankunOwnerKey: account.ownerKey,
      qiankunAgentId: manualL3Override.overrideValues.agent_id,
      qiankunIdentityStatus: "verified",
      qiankunVerifiedAt: new Date().toISOString()
    });
  }
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
    writes: {
      ...writes,
      manualL3RelationWriteResults: relationWriteResults,
      manualL3RelationsWritten: relationWriteResults.some((item) => item.inputCount > 0)
    }
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
  retryOnce = false,
  ensureScaffold = false,
  target = MONITOR_PROVISION_TARGET,
  env = process.env,
  planOnly = false,
  monitorIds = []
} = {}) {
  const cleanMode = clean(mode) || "status";
  if (cleanMode === "status") {
    return runMonitorProvisionFoundationStatus({ repo, ownerKey, ensureScaffold, target });
  }
  if (cleanMode === "reconcile") {
    return runMonitorProvisionReadonlyReconcile({ repo, ownerKey, target });
  }
  if (cleanMode === "ensure") {
    return runMonitorProvisionEnsure({ repo, ownerKey, target, env, planOnly });
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
  if (cleanMode === "monitor_ids_readonly") {
    return runMonitorIdsReadonlyVerify({ repo, ownerKey, monitorIds, target });
  }
  if (cleanMode === "sync_cate_vest") {
    return runQiankunCateVestReadonlySync({ repo, ownerKey });
  }
  if (cleanMode === "sync_vest_package") {
    return runQiankunVestPackageReadonlySync({ repo, ownerKey });
  }
  if (cleanMode === "sync_package_base_info") {
    return runQiankunPackageBaseInfoReadonlySync({ repo, ownerKey });
  }
  if (cleanMode === "sync_technical_combination") {
    return runQiankunMonitorTechnicalCombinationReadonlySync({ repo, ownerKey });
  }
  if (cleanMode === "sync_level3_media_resource") {
    return runQiankunLevel3MediaResourceReadonlySync({ repo, ownerKey, retryOnce, env });
  }
  if (cleanMode === "sync_media_catalog") {
    return runQiankunMediaCatalogReadonlySync({ repo, ownerKey });
  }
  throw new Error(`unsupported_monitor_provision_mode:${cleanMode}`);
}
