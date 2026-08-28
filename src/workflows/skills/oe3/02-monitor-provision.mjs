import { credentialStatusForDatabase, redactedQiankunCredentialStatus } from "../../../platforms/qiankunCredentialStore.mjs";
import { createQiankunMonitorClient } from "../../../platforms/qiankunMonitorClient.mjs";
import { assertNoSensitiveLeak, hashValue, sanitizeForPublic } from "./00-contracts.mjs";
import { ACTION_ENSURE_MONITOR } from "../../executionPlan.mjs";
import {
  MONITOR_MAX_ATTEMPTS,
  MONITOR_RETRY_INTERVAL_SECONDS,
  buildMonitorCycleId,
  classifyMonitorCreateError,
  isServerBusy,
  monitorAttemptId,
  monitorAttemptPolicy,
  monitorReissuePolicy,
  secondsSince
} from "./02-monitor-cycle.mjs";
import {
  runQiankunCateVestReadonlySync,
  runQiankunLevel3MediaResourceReadonlySync,
  runQiankunMediaCatalogReadonlySync,
  runQiankunMonitorTechnicalCombinationReadonlySync,
  runQiankunPackageBaseInfoReadonlySync,
  runQiankunVestPackageReadonlySync
} from "./02-qiankun-option-relation-sync.mjs";

export const MONITOR_PROVISION_TARGET = {
  routeId: "oceanengine_3_byte_mini_game",
  gameCode: "JSZC",
  advertiserId: "1871922346964041"
};

export const MONITOR_RETRY_CONFIRM_ENV = "MWBV2_MONITOR_RETRY_CONFIRM";
export const MONITOR_RETRY_CONFIRM_VALUE = "RETRY_ONE_BUSY_MONITOR_CREATE";
export const MONITOR_CREATE_CONFIRM_ENV = "MWBV2_MONITOR_CREATE_CONFIRM";
export const MONITOR_CREATE_CONFIRM_VALUE = "CREATE_ONE_MONITOR";
export const MONITOR_PROVISION_ID_ENV = "MWBV2_MONITOR_PROVISION_ID";
export const MONITOR_ROUTE_ID_ENV = "MWBV2_MONITOR_ROUTE_ID";
export const MONITOR_GAME_CODE_ENV = "MWBV2_MONITOR_GAME_CODE";
export const MONITOR_ADVERTISER_ID_ENV = "MWBV2_MONITOR_ADVERTISER_ID";
export const MONITOR_CREATE_PLAN_HASH_ENV = "MWBV2_MONITOR_CREATE_PLAN_HASH";
export { MONITOR_MAX_ATTEMPTS, MONITOR_RETRY_INTERVAL_SECONDS } from "./02-monitor-cycle.mjs";
export const MONITOR_L3_OVERRIDE_CONFIRM_ENV = "MWBV2_MONITOR_L3_OVERRIDE_CONFIRM";
export const MONITOR_L3_OVERRIDE_CONFIRM_VALUE = "CONFIRM_MEDIA_RESOURCE_310_FOR_ONE_MONITOR";
export const QIANKUN_CURRENT_API_DOC_REF = "docs/.参考文档/乾坤系统/api-docs-20260827.md";
export const QIANKUN_ARCHIVED_API_DOC_20260825_REF = "docs/.参考文档/乾坤系统/.archive/api-docs-20260825.md";
const MONITOR_CREATE_EXPLICIT_EMPTY_FIELDS = new Set(["package_download_url"]);

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

const MONITOR_MANUAL_SUCCESS_CONTRACT = {
  sourceMonitorId: "245828",
  sourceAdvertiserId: "1871922346964041",
  sourceAccountRecordId: "8448",
  newAdvertiserId: "1871922414575753",
  newAccountRecordId: "8449",
  fixedFields: {
    os: "3",
    package_id: "36820",
    cate_id: "122",
    vest_id: "1414",
    channel: "dymini3k",
    owner: "fengmeiyu",
    media_id: "310",
    agent_id: "613",
    monitor_api: "toutiao_wxgame",
    num: "1",
    usage: "0",
    server_callback_type: "2",
    server_callback_data_types: ["active", "register", "success_order"]
  },
  optionalEmptyFields: ["package_download_url", "agent_name"]
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

function monitorClient({ fetchImpl = globalThis.fetch } = {}) {
  return createQiankunMonitorClient({ fetchImpl });
}

export function monitorEnsureConfirmed({ env = process.env, provisionId = "" } = {}) {
  return env[MONITOR_RETRY_CONFIRM_ENV] === MONITOR_RETRY_CONFIRM_VALUE &&
    env[MONITOR_PROVISION_ID_ENV] === provisionId;
}

function confirmationBindingChecks({ env = process.env, target = MONITOR_PROVISION_TARGET, provisionId = "", createPlanHash = "" } = {}) {
  return [
    ["provision_id", MONITOR_PROVISION_ID_ENV, provisionId],
    ["route_id", MONITOR_ROUTE_ID_ENV, target.routeId],
    ["game_code", MONITOR_GAME_CODE_ENV, target.gameCode],
    ["advertiser_id", MONITOR_ADVERTISER_ID_ENV, target.advertiserId],
    ["create_plan_hash", MONITOR_CREATE_PLAN_HASH_ENV, createPlanHash]
  ].map(([field, envName, expected]) => {
    const expectedValue = clean(expected);
    const actualValue = clean(env[envName]);
    return {
      field,
      envName,
      expectedPresent: Boolean(expectedValue),
      actualPresent: Boolean(actualValue),
      matched: Boolean(expectedValue) && actualValue === expectedValue
    };
  });
}

function monitorActionConfirmationState({
  env = process.env,
  target = MONITOR_PROVISION_TARGET,
  provisionId = "",
  createPlanHash = "",
  action = ""
} = {}) {
  const bindingChecks = confirmationBindingChecks({ env, target, provisionId, createPlanHash });
  const scopeBindingsMatched = bindingChecks
    .filter((item) => item.field !== "create_plan_hash")
    .every((item) => item.matched);
  const allBindingsMatched = bindingChecks.every((item) => item.matched);
  const createConfirmValuePresent = env[MONITOR_CREATE_CONFIRM_ENV] === MONITOR_CREATE_CONFIRM_VALUE;
  const retryConfirmValuePresent = env[MONITOR_RETRY_CONFIRM_ENV] === MONITOR_RETRY_CONFIRM_VALUE;
  const actionValuePresent = action === "first_create"
    ? createConfirmValuePresent
    : action === "server_busy_retry" ? retryConfirmValuePresent : false;
  return {
    action,
    requiredEnv: action === "first_create" ? MONITOR_CREATE_CONFIRM_ENV : MONITOR_RETRY_CONFIRM_ENV,
    expectedValue: action === "first_create" ? MONITOR_CREATE_CONFIRM_VALUE : MONITOR_RETRY_CONFIRM_VALUE,
    createConfirmValuePresent,
    retryConfirmValuePresent,
    actionValuePresent,
    provisionValuePresent: bindingChecks.find((item) => item.field === "provision_id")?.matched === true,
    routeValuePresent: bindingChecks.find((item) => item.field === "route_id")?.matched === true,
    gameCodeValuePresent: bindingChecks.find((item) => item.field === "game_code")?.matched === true,
    advertiserIdValuePresent: bindingChecks.find((item) => item.field === "advertiser_id")?.matched === true,
    createPlanHashValuePresent: bindingChecks.find((item) => item.field === "create_plan_hash")?.matched === true,
    scopeBindingsMatched,
    allBindingsMatched,
    confirmed: Boolean(actionValuePresent && allBindingsMatched),
    bindingChecks
  };
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

function monitorReadonlyDefaults(defaults = {}) {
  const config = monitorPlanConfig(defaults);
  const candidateFieldsApplied = ["media_id", "agent_id", "monitor_api"]
    .filter((key) => clean(defaults?.monitor_provision?.[key]) === "" && clean(config[key]) !== "");
  return {
    ...(defaults || {}),
    monitor_provision: config,
    monitor_provision_candidate_fields_applied: candidateFieldsApplied
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

export function sanitizeMonitorPublicSummary(value) {
  const redactUrls = (item) => {
    if (Array.isArray(item)) return item.map(redactUrls);
    if (item && typeof item === "object") {
      return Object.fromEntries(Object.entries(item).map(([key, child]) => [key, redactUrls(child)]));
    }
    return typeof item === "string" && /https?:\/\/\S+/i.test(item) ? "[redacted]" : item;
  };
  return sanitizeForPublic(redactUrls(value));
}

async function upsertReadonlyEvidence({ repo, provisionId, summary, jobId = "" }) {
  if (!repo) return "";
  const safeSummary = sanitizeForPublic(summary);
  assertNoSensitiveLeak(safeSummary);
  const artifactId = jobId ? `EV-${jobId}-${provisionId}-READONLY-RECONCILE` : `EV-${provisionId}-READONLY-RECONCILE`;
  await repo.upsertEvidence({
    artifactId,
    jobId: jobId || null,
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

async function upsertEnsureEvidence({ repo, provisionId, summary, jobId = "" }) {
  if (!repo) return "";
  const safeSummary = sanitizeForPublic(summary);
  assertNoSensitiveLeak(safeSummary);
  const artifactId = jobId ? `EV-${jobId}-${provisionId}-ENSURE` : `EV-${provisionId}-ENSURE`;
  await repo.upsertEvidence({
    artifactId,
    jobId: jobId || null,
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

async function upsertPlanOnlyEvidence({ repo, provisionId, summary, jobId = "" }) {
  if (!repo) return "";
  const safeSummary = sanitizeMonitorPublicSummary(summary);
  assertNoSensitiveLeak(safeSummary);
  const artifactId = jobId ? `EV-${jobId}-${provisionId}-PLAN-ONLY` : `EV-${provisionId}-PLAN-ONLY`;
  await repo.upsertEvidence({
    artifactId,
    jobId: jobId || null,
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

async function upsertAccountIndexPreflightEvidence({ repo, provisionId, summary }) {
  if (!repo) return "";
  const safeSummary = sanitizeForPublic(summary);
  assertNoSensitiveLeak(safeSummary);
  const artifactId = `EV-${provisionId}-ACCOUNTINDEX-PREFLIGHT`;
  await repo.upsertEvidence({
    artifactId,
    jobId: null,
    artifactType: "qiankun_accountindex_preflight",
    title: "乾坤 accountIndex 只读账户身份预检证据",
    summary: JSON.stringify(safeSummary),
    contentHash: hashValue(safeSummary),
    storageRef: `postgres:mwb.advertiser_accounts/${provisionId}`,
    sourceRef: `qiankun:/tf/account_info/accountIndex;api-doc:${QIANKUN_CURRENT_API_DOC_REF}`,
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
  jobId = "",
  planId = "",
  target,
  provisionId,
  cycleId = "",
  cycleNo = 1,
  cycleStatus = "active",
  supersedesCycleId = "",
  reissueReason = "",
  preflightHash = "",
  closedAt = "",
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
  if (!repo) {
    return {
      accountWritten: false,
      accountIdentityWritten: false,
      touchpointWritten: false,
      provisionRunWritten: false
    };
  }
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
    cycleId,
    cycleNo,
    cycleStatus,
    supersedesCycleId,
    reissueReason,
    preflightHash,
    jobId,
    planId,
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
    createCompletedAt: monitor?.createCompletedAt || createAudit.createCompletedAt || "",
    closedAt
  });
  return {
    accountWritten: true,
    accountIdentityWritten: Boolean(account),
    touchpointWritten,
    provisionRunWritten: true
  };
}

function monitorCreateParams({ target = MONITOR_PROVISION_TARGET, account = {}, ownerKey = "", technicalConfig = {} }) {
  const params = {
    os: technicalConfig.os,
    package_id: clean(technicalConfig.package_id),
    package_download_url: "",
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
  return Object.fromEntries(Object.entries(params).filter(([key, value]) => {
    if (MONITOR_CREATE_EXPLICIT_EMPTY_FIELDS.has(key)) return true;
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
    emptyFieldNames: Object.entries(params)
      .filter(([, value]) => !Array.isArray(value) && clean(value) === "")
      .map(([key]) => key)
      .sort(),
    explicitEmptyFieldNames: Object.keys(params)
      .filter((key) => MONITOR_CREATE_EXPLICIT_EMPTY_FIELDS.has(key) && clean(params[key]) === "")
      .sort(),
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

function comparableMonitorValue(value) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean).join("/");
  return clean(value);
}

function manualSuccessContractComparison({ target = MONITOR_PROVISION_TARGET, createParams = {} } = {}) {
  const fixedComparisons = Object.entries(MONITOR_MANUAL_SUCCESS_CONTRACT.fixedFields).map(([field, expected]) => {
    const actualValue = comparableMonitorValue(createParams[field]);
    const expectedValue = comparableMonitorValue(expected);
    return {
      field,
      expected: expectedValue,
      actual: actualValue,
      matched: actualValue === expectedValue
    };
  });
  const fixedMismatches = fixedComparisons.filter((item) => !item.matched).map((item) => item.field);
  const accountExpected = clean(target.advertiserId) === MONITOR_MANUAL_SUCCESS_CONTRACT.newAdvertiserId
    ? MONITOR_MANUAL_SUCCESS_CONTRACT.newAccountRecordId
    : "";
  const accountActual = clean(createParams.media_account_id);
  const accountComparison = {
    field: "media_account_id",
    reference: MONITOR_MANUAL_SUCCESS_CONTRACT.sourceAccountRecordId,
    expectedForTarget: accountExpected,
    actual: accountActual,
    status: accountExpected
      ? accountActual === accountExpected ? "expected_account_difference" : "target_account_record_mismatch"
      : accountActual === MONITOR_MANUAL_SUCCESS_CONTRACT.sourceAccountRecordId ? "matches_reference_account" : "account_specific_value"
  };
  const optionalFields = MONITOR_MANUAL_SUCCESS_CONTRACT.optionalEmptyFields.map((field) => ({
    field,
    status: "observed_empty_optional",
    includedInCreateParams: Object.prototype.hasOwnProperty.call(createParams, field)
  }));
  const blockers = [
    ...(fixedMismatches.length ? ["manual_contract_mismatch"] : []),
    ...(accountExpected && accountActual !== accountExpected ? ["new_account_record_mismatch"] : [])
  ];
  return {
    sourceMonitorId: MONITOR_MANUAL_SUCCESS_CONTRACT.sourceMonitorId,
    sourceAdvertiserId: MONITOR_MANUAL_SUCCESS_CONTRACT.sourceAdvertiserId,
    fixedComparisons,
    fixedMismatches,
    accountComparison,
    optionalFields,
    ready: blockers.length === 0,
    blockers
  };
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

function targetFromBundle(bundle = {}) {
  return {
    routeId: bundle.job?.route_id || "",
    gameCode: bundle.job?.game_code || "",
    advertiserId: bundle.job?.advertiser_id || ""
  };
}

function planActions(bundle = {}) {
  return bundle.executionPlan?.planned_actions || bundle.executionPlan?.plannedActions || [];
}

function ensureMonitorAction(bundle = {}) {
  return planActions(bundle).find((action) => action.action_type === ACTION_ENSURE_MONITOR) || null;
}

function monitorIdFromBundle(bundle = {}) {
  return clean(bundle.account?.monitor_id || bundle.touchpoint?.monitor_id);
}

function planIdFromBundle(bundle = {}) {
  return clean(bundle.executionPlan?.plan_id || bundle.executionPlan?.planId);
}

function planHashFromBundle(bundle = {}) {
  return clean(bundle.executionPlan?.plan_hash || bundle.executionPlan?.planHash);
}

function monitorSkillResult({ skillKey, status = "passed", blockers = [], outputSummary = {}, evidenceRefs = [] }) {
  const result = {
    status,
    blockers,
    outputSummary: {
      skillKey,
      ...outputSummary
    },
    evidenceRefs
  };
  const safe = sanitizeForPublic(result);
  assertNoSensitiveLeak(safe);
  return safe;
}

function monitorCreateConfirmationEnv({ baseEnv = process.env, target, provisionId, planHash, createPlanHash, attemptAction }) {
  const env = { ...(baseEnv || {}) };
  env[MONITOR_PROVISION_ID_ENV] = provisionId;
  env[MONITOR_ROUTE_ID_ENV] = target.routeId;
  env[MONITOR_GAME_CODE_ENV] = target.gameCode;
  env[MONITOR_ADVERTISER_ID_ENV] = target.advertiserId;
  env[MONITOR_CREATE_PLAN_HASH_ENV] = createPlanHash || planHash || "mock-plan-hash";
  if (attemptAction === "server_busy_retry") {
    env[MONITOR_RETRY_CONFIRM_ENV] = MONITOR_RETRY_CONFIRM_VALUE;
  } else {
    env[MONITOR_CREATE_CONFIRM_ENV] = MONITOR_CREATE_CONFIRM_VALUE;
  }
  return env;
}

export async function runMonitorWorkflowSkill({
  repo,
  bundle,
  skillKey,
  mode = "dry_run",
  ownerKey = "",
  allowedPlanActions = [],
  mockMonitorEnsure = false,
  fetchImpl = globalThis.fetch,
  env = process.env,
  previousOutputs = new Map()
} = {}) {
  const target = targetFromBundle(bundle);
  const jobId = bundle.job?.job_id || "";
  const provisionId = monitorProvisionId(target);
  const action = ensureMonitorAction(bundle);
  const monitorId = monitorIdFromBundle(bundle);
  const planId = planIdFromBundle(bundle);
  const planHash = planHashFromBundle(bundle);
  const planActionPresent = Boolean(action);
  const actionAllowed = Array.isArray(allowedPlanActions) && allowedPlanActions.includes(ACTION_ENSURE_MONITOR);
  const idempotencyKey = clean(action?.idempotency_key);

  if (skillKey === "monitor-query") {
    const latestRun = repo ? await repo.getLatestMonitorProvisionRun(target) : null;
    return monitorSkillResult({
      skillKey,
      outputSummary: {
        target,
        provisionId,
        monitorIdPresent: Boolean(monitorId),
        planActionPresent,
        latestRunStatus: latestRun?.status || "",
        createCalled: false,
        rawRequestStored: false,
        rawResponseStored: false
      }
    });
  }

  if (skillKey === "monitor-plan") {
    if (monitorId || !planActionPresent) {
      return monitorSkillResult({
        skillKey,
        outputSummary: {
          target,
          provisionId,
          monitorIdPresent: Boolean(monitorId),
          ensureMonitorPlanned: false,
          planId,
          planHash,
          reason: monitorId ? "monitor_id_already_present" : "ensure_monitor_not_in_execution_plan",
          createCalled: false
        }
      });
    }
    const planOnly = await runMonitorProvisionPlanOnly({
      repo,
      ownerKey,
      target,
      jobId,
      planId,
      fetchImpl
    });
    return monitorSkillResult({
      skillKey,
      status: planOnly.status,
      blockers: planOnly.blockers || [],
      outputSummary: {
        target,
        provisionId,
        ensureMonitorPlanned: true,
        planId,
        planHash,
        idempotencyKeyPresent: Boolean(idempotencyKey),
        attemptPolicy: planOnly.attemptPolicy || {},
        createPlanHash: planOnly.createPlan?.requestHash || planOnly.confirmationSnapshot?.createPlanHash || "",
        createCalled: false,
        accountApiCalled: planOnly.accountApiCalled === true,
        monitorListApiCalled: planOnly.monitorListApiCalled === true,
        evidenceArtifactId: planOnly.evidenceArtifactId || ""
      },
      evidenceRefs: planOnly.evidenceArtifactId ? [planOnly.evidenceArtifactId] : []
    });
  }

  if (skillKey === "monitor-ensure") {
    if (monitorId || !planActionPresent) {
      return monitorSkillResult({
        skillKey,
        outputSummary: {
          target,
          provisionId,
          monitorIdPresent: Boolean(monitorId),
          ensureMonitorPlanned: false,
          planId,
          planHash,
          createCalled: false,
          reason: monitorId ? "monitor_id_already_present" : "ensure_monitor_not_in_execution_plan"
        }
      });
    }
    const blockers = [];
    if (mode !== "planned_actions") blockers.push("monitor_ensure_requires_planned_actions_mode");
    if (!actionAllowed) blockers.push(`planned_action_not_allowed:${ACTION_ENSURE_MONITOR}`);
    if (mockMonitorEnsure !== true) blockers.push("mock_monitor_ensure_required_for_current_task");
    if (blockers.length) {
      return monitorSkillResult({
        skillKey,
        status: "blocked",
        blockers,
        outputSummary: {
          target,
          provisionId,
          planId,
          planHash,
          ensureMonitorPlanned: true,
          actionAllowed,
          createCalled: false
        }
      });
    }
    const planOutput = previousOutputs.get("monitor-plan") || {};
    const attemptAction = planOutput.outputSummary?.attemptPolicy?.action || "first_create";
    const createPlanHash = planOutput.outputSummary?.createPlanHash || "";
    const ensureResult = await runMonitorProvisionEnsure({
      repo,
      ownerKey,
      target,
      env: monitorCreateConfirmationEnv({
        baseEnv: env,
        target,
        provisionId,
        planHash,
        createPlanHash,
        attemptAction
      }),
      jobId,
      planId,
      idempotencyKey,
      fetchImpl
    });
    return monitorSkillResult({
      skillKey,
      status: ensureResult.status,
      blockers: ensureResult.blockers || [],
      outputSummary: {
        target,
        provisionId,
        planId,
        planHash,
        ensureMonitorPlanned: true,
        actionAllowed,
        createCalled: ensureResult.createCalled === true,
        runStatus: ensureResult.runStatus || "",
        attemptState: ensureResult.attemptState || {},
        monitorIdPresent: Boolean(ensureResult.resolvedMonitor?.monitorId),
        evidenceArtifactId: ensureResult.evidenceArtifactId || ""
      },
      evidenceRefs: ensureResult.evidenceArtifactId ? [ensureResult.evidenceArtifactId] : []
    });
  }

  if (skillKey === "monitor-readback") {
    const latestRun = repo ? await repo.getLatestMonitorProvisionRun(target) : null;
    const currentMonitorId = clean(latestRun?.monitor_id || monitorId);
    const ensureOutput = previousOutputs.get("monitor-ensure") || {};
    const blockers = [];
    if (planActionPresent && !currentMonitorId) blockers.push("monitor_readback_missing");
    if ((ensureOutput.blockers || []).length) blockers.push(...ensureOutput.blockers);
    return monitorSkillResult({
      skillKey,
      status: blockers.length ? "blocked" : "passed",
      blockers: [...new Set(blockers)],
      outputSummary: {
        target,
        provisionId,
        planId,
        planHash,
        monitorIdPresent: Boolean(currentMonitorId),
        monitorId: currentMonitorId,
        touchpointRefPresent: Boolean(latestRun?.touchpoint_ref || bundle.touchpoint?.touchpoint_ref),
        touchpointUrlHashPresent: Boolean(latestRun?.touchpoint_url_hash || bundle.touchpoint?.url_hash),
        runStatus: latestRun?.status || "",
        createCalled: latestRun?.create_called === true || ensureOutput.outputSummary?.createCalled === true,
        evidenceArtifactId: latestRun?.evidence_artifact_id || ensureOutput.outputSummary?.evidenceArtifactId || ""
      },
      evidenceRefs: latestRun?.evidence_artifact_id ? [latestRun.evidence_artifact_id] : ensureOutput.evidenceRefs || []
    });
  }

  throw new Error(`unsupported_monitor_workflow_skill:${skillKey}`);
}

export async function runMonitorProvisionReadonlyReconcile({
  repo,
  ownerKey = "",
  target = MONITOR_PROVISION_TARGET,
  jobId = "",
  planId = "",
  fetchImpl = globalThis.fetch
} = {}) {
  const provisionId = monitorProvisionId(target);
  const initialCredential = redactedQiankunCredentialStatus({ ownerKey });
  const effectiveOwnerKey = selectedOwnerKey(ownerKey, initialCredential);
  const credential = redactedQiankunCredentialStatus({ ownerKey: effectiveOwnerKey });
  const allowPendingOwnerKeyBootstrap = !clean(effectiveOwnerKey) && initialCredential.pendingOwnerKeyCount === 1;
  const client = createQiankunMonitorClient({
    fetchImpl,
    allowPendingOwnerKeyBootstrap,
    pendingOwnerKeyBootstrapEndpoints: [
      "/tf/account_info/accountIndex",
      "/tf/ad/index"
    ]
  });
  const storedDefaults = repo ? await repo.getMonitorProvisionDefaults({
    routeId: target.routeId,
    gameCode: target.gameCode
  }) : null;
  const defaults = monitorReadonlyDefaults(storedDefaults || {});
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
    mediaMasterId: clean(accountRow.mediaMasterId),
    mediaMasterName: clean(accountRow.mediaMasterName),
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
      mediaMasterId: account.mediaMasterId,
      mediaMasterNamePresent: Boolean(account.mediaMasterName),
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
      exactMonitorMatchingEnabled: readiness.readyForReadonlyReconcile,
      referenceCandidateFieldsApplied: defaults.monitor_provision_candidate_fields_applied || []
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
  const safeSummary = sanitizeMonitorPublicSummary(publicSummary);
  assertNoSensitiveLeak(safeSummary);

  const evidenceArtifactId = await upsertReadonlyEvidence({
    repo,
    provisionId,
    summary: safeSummary,
    jobId
  });
  const runStatus = monitor
    ? monitor.touchpointUrlHash ? "touchpoint_resolved" : "monitor_resolved"
    : account ? "account_resolved" : "failed";
  const cycleStatus = runStatus === "touchpoint_resolved" ? "resolved" : "active";
  const writes = await persistReadonlyReconcile({
    repo,
    jobId,
    planId,
    target,
    provisionId,
    requestFingerprint,
    cycleStatus,
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
  target = MONITOR_PROVISION_TARGET,
  jobId = "",
  planId = "",
  fetchImpl = globalThis.fetch
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
  const currentCycle = attemptState?.run || null;
  const cycleNo = Number(currentCycle?.cycle_no || 1);
  const cycleId = currentCycle?.cycle_id || buildMonitorCycleId(provisionId, cycleNo);
  const attemptCount = Number(attemptState?.attemptCount || 0);
  const attempts = Array.isArray(attemptState?.attempts) ? attemptState.attempts : [];
  const firstAttempt = attemptState?.firstAttempt || attempts.find((item) => Number(item.attempt_no) === 1) || null;
  const latestAttempt = attemptState?.latestAttempt || attempts[attempts.length - 1] || null;
  const retryElapsedSeconds = secondsSince(firstAttempt?.finished_at || firstAttempt?.completed_at || currentCycle?.create_completed_at || currentCycle?.updated_at);
  const attemptPolicy = monitorAttemptPolicy({
    attemptCount,
    firstAttempt,
    latestAttempt,
    latestRun: currentCycle,
    retryElapsedSeconds
  });

  const blockers = [];
  if (!effectiveOwnerKey) blockers.push("owner_key_missing_or_not_persisted");
  if (effectiveOwnerKey && credential.status !== "active") blockers.push(`credential_not_active:${credential.status}`);
  if (!readiness.readyForReadonlyReconcile) {
    blockers.push(readiness.present ? `monitor_plan_contract_incomplete:${readiness.missingFields.join(",")}` : "monitor_provision_defaults_missing");
  }
  if (!callbackContract.ready) blockers.push("callback_contract_missing");
  blockers.push(...attemptPolicy.blockers);

  const client = monitorClient({ fetchImpl });
  let accountResult = null;
  let account = null;
  let identityPreflight = {
    status: "not_checked",
    verified: false,
    checks: []
  };
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
        mediaMasterId: clean(accountRow.mediaMasterId),
        mediaMasterName: clean(accountRow.mediaMasterName),
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
  const createPlanHash = Object.keys(createParams).length ? hashValue(createParams) : "";
  const manualContractComparison = account
    ? manualSuccessContractComparison({ target, createParams })
    : {
      sourceMonitorId: MONITOR_MANUAL_SUCCESS_CONTRACT.sourceMonitorId,
      ready: false,
      blockers: ["account_not_resolved_for_manual_contract_compare"]
    };
  if (account) blockers.push(...manualContractComparison.blockers);
  const firstCreateAuthorization = monitorActionConfirmationState({
    env: {},
    target,
    provisionId,
    createPlanHash,
    action: attemptPolicy.action || "first_create"
  });
  const publicSummary = {
    mode: "plan_only",
    target,
    provisionId,
    cycle: {
      cycleId,
      cycleNo,
      cycleStatus: currentCycle?.cycle_status || "active",
      supersedesCycleId: currentCycle?.supersedes_cycle_id || "",
      reissueReason: currentCycle?.reissue_reason || ""
    },
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
    attemptPolicy,
    manualSuccessContractComparison: manualContractComparison,
    account: account ? {
      resolved: true,
      technicalAccountRecordId: account.technicalAccountRecordId,
      mediaAccountId: account.mediaAccountId,
      mediaMasterId: account.mediaMasterId,
      mediaMasterNamePresent: Boolean(account.mediaMasterName),
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
      requestHash: createPlanHash,
      callbackContract,
      wouldCreate: !monitor && blockers.length === 0 && attemptPolicy.createEligible === true,
      createCalled: false
    },
    firstCreateAuthorization: {
      requiredEnv: MONITOR_CREATE_CONFIRM_ENV,
      expectedValue: MONITOR_CREATE_CONFIRM_VALUE,
      requiredBindings: firstCreateAuthorization.bindingChecks.map((item) => ({
        field: item.field,
        envName: item.envName,
        expectedPresent: item.expectedPresent
      })),
      retryEnvRejectedForFirstCreate: true
    },
    confirmationSnapshot: {
      advertiserId: target.advertiserId,
      provisionId,
      cycleId,
      cycleNo,
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
      createPlanHash,
      attemptPolicyAction: attemptPolicy.action,
      nextAttemptNo: attemptPolicy.nextAttemptNo,
      currentAttemptCanBeAuthorized: blockers.length === 0 && !monitor && attemptPolicy.createEligible === true,
      attemptCount,
      firstCreateCanBeAuthorized: blockers.length === 0 && !monitor && attemptPolicy.action === "first_create",
      laterRealCreateAllowed: blockers.length === 0 && !monitor && attemptPolicy.createEligible === true
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
    summary: safeSummary,
    jobId
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
      qiankunMediaMasterId: account.mediaMasterId,
      qiankunMediaMasterName: account.mediaMasterName,
      qiankunIdentityStatus: "observed"
    });
  }
  const runStatus = monitor
    ? monitor.touchpointUrlHash ? "touchpoint_resolved" : "monitor_resolved"
    : account ? "planned" : "failed";
  const writes = await persistReadonlyReconcile({
    repo,
    jobId,
    planId,
    target,
    provisionId,
    cycleId,
    cycleNo,
    cycleStatus: monitor ? "resolved" : "active",
    preflightHash: safeSummary.createPlan?.requestHash || safeSummary.requestFingerprint || "",
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

export async function runMonitorProvisionReissuePlan({
  repo,
  ownerKey = "",
  target = MONITOR_PROVISION_TARGET,
  reissueReason = "",
  jobId = "",
  planId = "",
  fetchImpl = globalThis.fetch
} = {}) {
  const provisionId = monitorProvisionId(target);
  const latestCycle = repo ? await repo.getLatestMonitorProvisionRun(target) : null;
  const policy = monitorReissuePolicy({ latestCycle, reissueReason });
  if (policy.status !== "passed") {
    const output = {
      status: "blocked",
      mode: "reissue_plan",
      target,
      provisionId,
      previousCycleId: policy.previousCycleId,
      previousCycleNo: policy.previousCycleNo,
      cycleId: "",
      cycleNo: 0,
      reissueReason: policy.reissueReason,
      preflightStatus: "not_run",
      preflightHash: "",
      createPlanHash: "",
      attemptPolicy: {},
      existingMonitorStatus: latestCycle?.monitor_id ? "monitor_id_already_present" : "not_resolved",
      blockerCodes: policy.blockers,
      moduleRef: "src/workflows/skills/oe3/02-monitor-cycle.mjs",
      evidenceRefs: [],
      createCalled: false,
      rawRequestStored: false,
      rawResponseStored: false
    };
    const safe = sanitizeForPublic(output);
    assertNoSensitiveLeak(safe);
    return safe;
  }

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
  const requestFingerprint = monitorProvisionFingerprint({
    ...target,
    technicalConfig: planDefaults.monitor_provision || {}
  });
  if (repo) {
    await repo.createMonitorProvisionCycle({
      provisionId,
      routeId: target.routeId,
      gameCode: target.gameCode,
      advertiserId: target.advertiserId,
      cycleNo: policy.nextCycleNo,
      supersedesCycleId: policy.previousCycleId,
      reissueReason: policy.reissueReason,
      requestFingerprint,
      technicalConfig: planDefaults.monitor_provision || {},
      ownerKey: effectiveOwnerKey,
      credentialStatus: credentialStatusForDatabase(credential),
      credentialUpdatedAt: ownedCredentialItem(credential, effectiveOwnerKey).tokenUpdatedAt || "",
      credentialExpiresAt: ownedCredentialItem(credential, effectiveOwnerKey).expiresAt || "",
      jobId,
      planId
    });
  }
  const plan = await runMonitorProvisionPlanOnly({
    repo,
    ownerKey: effectiveOwnerKey,
    target,
    jobId,
    planId,
    fetchImpl
  });
  const cycle = plan.cycle || {};
  const output = {
    status: plan.status,
    mode: "reissue_plan",
    target,
    provisionId,
    previousCycleId: policy.previousCycleId,
    reissueReason: policy.reissueReason,
    cycleId: cycle.cycleId || policy.nextCycleId,
    cycleNo: cycle.cycleNo || policy.nextCycleNo,
    preflightStatus: plan.status,
    preflightHash: plan.createPlan?.requestHash || plan.requestFingerprint || "",
    createPlanHash: plan.createPlan?.requestHash || "",
    attemptPolicy: plan.attemptPolicy || {},
    existingMonitorStatus: plan.resolvedMonitor?.monitorId ? "monitor_id_already_present" : "not_found",
    blockerCodes: plan.blockers || [],
    moduleRef: "src/workflows/skills/oe3/02-monitor-cycle.mjs",
    evidenceRefs: plan.evidenceArtifactId ? [plan.evidenceArtifactId] : [],
    plan,
    createCalled: false,
    rawRequestStored: false,
    rawResponseStored: false
  };
  const safe = sanitizeForPublic(output);
  assertNoSensitiveLeak(safe);
  return safe;
}

export async function runQiankunAccountIndexReadonlyPreflight({
  repo,
  ownerKey = "",
  target = MONITOR_PROVISION_TARGET,
  fetchImpl = globalThis.fetch
} = {}) {
  const provisionId = monitorProvisionId(target);
  const credential = redactedQiankunCredentialStatus({ ownerKey });
  const effectiveOwnerKey = selectedOwnerKey(ownerKey, credential);
  const effectiveCredential = redactedQiankunCredentialStatus({ ownerKey: effectiveOwnerKey });
  const blockers = [];
  let accountIdentityWritten = false;
  let accountResult = null;
  let accountRows = [];
  let account = null;
  if (!effectiveOwnerKey) {
    blockers.push("owner_key_missing_or_not_persisted");
  }
  if (effectiveOwnerKey && effectiveCredential.status !== "active") {
    blockers.push(`credential_not_active:${effectiveCredential.status}`);
  }

  if (!blockers.length) {
    const client = monitorClient({ fetchImpl });
    accountResult = await client.queryAccountIndex({
      ownerKey: effectiveOwnerKey,
      accountId: target.advertiserId,
      pageNo: 1,
      pageSize: 10
    });
    accountRows = singleExactAccountRow(accountResult, target.advertiserId);
    if (accountResult.status !== "passed") {
      const statusCode = clean(accountResult.apiCode || accountResult.httpStatus || "unknown");
      if (["401", "403"].includes(statusCode)) blockers.push("credential_invalid");
      blockers.push(`account_query_failed:${accountResult.apiCode || "unknown"}:${accountResult.apiMessage || "unknown"}`);
    } else if (accountRows.length !== 1) {
      blockers.push(accountRows.length === 0 ? "account_identity_unresolved:zero_match" : "account_identity_unresolved:multiple_match");
    } else {
      const accountRow = accountRows[0];
      const resolvedOwnerKey = clean(accountRow.ssoOwnerKey || accountRow.ssoOwner);
      account = {
        qiankunAccountRecordId: clean(accountRow.mediaAccountRecordId || accountRow.id),
        qiankunOwnerKey: resolvedOwnerKey,
        qiankunAgentId: clean(accountRow.agentId),
        qiankunAgentName: clean(accountRow.agentName),
        qiankunMediaMasterId: clean(accountRow.mediaMasterId),
        qiankunMediaMasterName: clean(accountRow.mediaMasterName),
        accountId: clean(accountRow.accountId),
        advertiserNamePresent: Boolean(clean(accountRow.advertiserName)),
        advertiserName: clean(accountRow.advertiserName),
        authStatusName: clean(accountRow.authStatusName),
        platformStatus: clean(accountRow.status),
        ownerName: clean(accountRow.ssoOwnerName || accountRow.ssoOwner)
      };
      if (resolvedOwnerKey !== effectiveOwnerKey) blockers.push("credential_owner_mismatch");
      if (!account.qiankunAccountRecordId) blockers.push("qiankun_account_record_id_missing");
      if (!account.qiankunAgentId) blockers.push("agent_id_missing");
      if (!account.qiankunMediaMasterId) blockers.push("qiankun_media_master_id_missing");
    }
  }

  if (repo && account && blockers.length === 0) {
    await repo.updateQiankunAccountIdentity({
      advertiserId: target.advertiserId,
      routeId: target.routeId,
      gameCode: target.gameCode,
      accountName: account.advertiserName || target.advertiserId,
      authStatus: account.authStatusName || "unknown",
      platformStatus: account.platformStatus || "unknown",
      ownerName: account.ownerName || "",
      qiankunAccountRecordId: account.qiankunAccountRecordId,
      qiankunOwnerKey: account.qiankunOwnerKey,
      qiankunAgentId: account.qiankunAgentId,
      qiankunMediaMasterId: account.qiankunMediaMasterId,
      qiankunMediaMasterName: account.qiankunMediaMasterName,
      qiankunIdentityStatus: "observed"
    });
    accountIdentityWritten = true;
  }

  const output = {
    mode: "account_preflight",
    status: blockers.length ? "blocked" : "passed",
    target,
    provisionId,
    referenceApiDoc: QIANKUN_CURRENT_API_DOC_REF,
    archivedApiDoc20260825: QIANKUN_ARCHIVED_API_DOC_20260825_REF,
    credential: {
      status: effectiveCredential.status,
      ownerKeyPresent: Boolean(effectiveOwnerKey),
      credentialStorePresent: effectiveCredential.credentialStorePresent,
      activeCredentialCount: effectiveCredential.activeCredentialCount,
      pendingOwnerKeyCount: effectiveCredential.pendingOwnerKeyCount
    },
    accountIndex: accountResult ? {
      called: true,
      endpoint: "/tf/account_info/accountIndex",
      requestParams: {
        accountId: target.advertiserId,
        pageNo: 1,
        pageSize: 10
      },
      status: accountResult.status,
      httpStatus: accountResult.httpStatus,
      apiCode: accountResult.apiCode,
      apiMessage: accountResult.apiMessage || "",
      resultTotal: accountResult.summary?.resultTotal || 0,
      exactMatchCount: accountRows.length,
      responseHash: accountResult.responseHash
    } : {
      called: false,
      endpoint: "/tf/account_info/accountIndex"
    },
    account: account ? {
      qiankunAccountRecordId: account.qiankunAccountRecordId,
      qiankunOwnerKey: account.qiankunOwnerKey,
      qiankunAgentId: account.qiankunAgentId,
      qiankunAgentName: account.qiankunAgentName,
      qiankunMediaMasterId: account.qiankunMediaMasterId,
      qiankunMediaMasterNamePresent: Boolean(account.qiankunMediaMasterName),
      accountId: account.accountId,
      authStatusName: account.authStatusName,
      platformStatus: account.platformStatus,
      advertiserNamePresent: account.advertiserNamePresent
    } : {
      resolved: false
    },
    accountIdentityWritten,
    monitorListApiCalled: false,
    createCalled: false,
    attemptCreated: false,
    rawRequestStored: false,
    rawResponseStored: false,
    blockers
  };
  const safe = sanitizeForPublic(output);
  assertNoSensitiveLeak(safe);
  const evidenceArtifactId = await upsertAccountIndexPreflightEvidence({
    repo,
    provisionId,
    summary: safe
  });
  return {
    ...safe,
    evidenceArtifactId
  };
}

export async function stopMonitorProvisionCycleForReissue({
  repo,
  target = MONITOR_PROVISION_TARGET,
  reason = "manual_recheck_confirmed"
} = {}) {
  const latestCycle = repo ? await repo.getLatestMonitorProvisionRun(target) : null;
  if (!latestCycle?.cycle_id) return { status: "blocked", blockers: ["cycle_missing"] };
  await repo.closeMonitorProvisionCycle({
    cycleId: latestCycle.cycle_id,
    cycleStatus: "stopped",
    errorSummary: `cycle_stopped_for_reissue:${clean(reason)}`
  });
  return {
    status: "passed",
    provisionId: latestCycle.provision_id,
    cycleId: latestCycle.cycle_id,
    cycleNo: latestCycle.cycle_no,
    cycleStatus: "stopped"
  };
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
  planOnly = false,
  jobId = "",
  planId = "",
  idempotencyKey = "",
  fetchImpl = globalThis.fetch
} = {}) {
  if (planOnly) return runMonitorProvisionPlanOnly({ repo, ownerKey, target, jobId, planId, fetchImpl });
  const provisionId = monitorProvisionId(target);
  let actionConfirmation = monitorActionConfirmationState({ env, target, provisionId, action: "" });
  let confirmationPresent = false;
  let confirmValuePresent = false;
  let provisionValuePresent = actionConfirmation.provisionValuePresent;
  const initialCredential = redactedQiankunCredentialStatus({ ownerKey });
  const effectiveOwnerKey = selectedOwnerKey(ownerKey, initialCredential);
  const credential = redactedQiankunCredentialStatus({ ownerKey: effectiveOwnerKey });
  const storedDefaults = repo ? await repo.getMonitorProvisionDefaults({
    routeId: target.routeId,
    gameCode: target.gameCode
  }) : null;
  const compiledDefaults = {
    ...(storedDefaults || {}),
    monitor_provision_present: storedDefaults?.monitor_provision_present === true,
    monitor_provision: monitorPlanConfig(storedDefaults || {})
  };
  const manualOverrideBase = manualL3OverrideState({ env, target, provisionId, defaults: compiledDefaults });
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
  const defaults = applyManualL3Override(compiledDefaults, manualL3Override);
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
  const currentCycle = attemptState?.run || latestRun || null;
  const cycleNo = Number(currentCycle?.cycle_no || 1);
  const cycleId = currentCycle?.cycle_id || buildMonitorCycleId(provisionId, cycleNo);
  const attempts = Array.isArray(attemptState?.attempts) ? attemptState.attempts : [];
  const attemptCount = attempts.length || Number(latestRun?.create_attempt_no || 0);
  const firstAttempt = attemptState?.firstAttempt || attempts.find((item) => Number(item.attempt_no) === 1) || null;
  const latestAttempt = attemptState?.latestAttempt || attempts[attempts.length - 1] || null;
  const retryElapsedSeconds = secondsSince(firstAttempt?.finished_at || firstAttempt?.completed_at || currentCycle?.create_completed_at || currentCycle?.updated_at);
  const attemptPolicy = monitorAttemptPolicy({
    attemptCount,
    firstAttempt,
    latestAttempt,
    latestRun: currentCycle,
    retryElapsedSeconds
  });
  actionConfirmation = monitorActionConfirmationState({
    env,
    target,
    provisionId,
    action: attemptPolicy.action
  });
  confirmValuePresent = actionConfirmation.actionValuePresent;
  provisionValuePresent = actionConfirmation.provisionValuePresent;
  const createPlanHashValueProvided = clean(env[MONITOR_CREATE_PLAN_HASH_ENV]) !== "";
  const preliminaryConfirmationPresent = actionConfirmation.actionValuePresent &&
    actionConfirmation.scopeBindingsMatched &&
    createPlanHashValueProvided;

  const blockers = [];
  if (!preliminaryConfirmationPresent) blockers.push("confirm_variable_missing_or_invalid");
  if (!effectiveOwnerKey) blockers.push("owner_key_missing_or_not_persisted");
  if (effectiveOwnerKey && credential.status !== "active") blockers.push(`credential_not_active:${credential.status}`);
  if (!readiness.readyForReadonlyReconcile) {
    blockers.push(readiness.present ? `monitor_provision_defaults_incomplete:${readiness.missingFields.join(",")}` : "monitor_provision_defaults_missing");
  }
  if (!callbackContract.ready) blockers.push("callback_contract_missing");
  const qiankunIdentityVerified = storedAccount?.qiankun_identity_status === "verified" &&
    Boolean(clean(storedAccount?.qiankun_account_record_id)) &&
    Boolean(clean(storedAccount?.qiankun_owner_key));
  if (manualOverrideBase.confirmValuePresent && !manualOverrideBase.scopeMatches) blockers.push("manual_l3_override_scope_mismatch");
  if (!latestRun) blockers.push("monitor_provision_run_missing");
  blockers.push(...attemptPolicy.blockers);

  if (!preliminaryConfirmationPresent) {
    const output = {
      status: "blocked",
      mode: "ensure",
      target,
      provisionId,
      requestFingerprint,
      confirmationPresent,
      confirmValuePresent,
      provisionValuePresent,
      actionConfirmation,
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
        cycleId,
        cycleNo,
        cycleStatus: latestRun.cycle_status || "",
        status: latestRun.status,
        monitorIdPresent: Boolean(latestRun.monitor_id),
        createCalled: latestRun.create_called === true,
        createAttemptNo: Number(latestRun.create_attempt_no || 0)
      } : {
        present: false
      },
      attemptState: {
        cycleId,
        cycleNo,
        attemptCount,
        latestAttemptNo: Number(latestAttempt?.attempt_no || 0),
        firstAttemptServerBusy: firstAttempt ? isServerBusy(firstAttempt) : false,
        retryElapsedSeconds: Number.isFinite(retryElapsedSeconds) ? retryElapsedSeconds : null,
        maximumTotalAttempts: MONITOR_MAX_ATTEMPTS,
        attemptPolicy
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
      actionConfirmation,
      manualL3Override: {
        confirmValuePresent: manualL3Override.confirmValuePresent,
        scopeMatches: manualL3Override.scopeMatches,
        active: manualL3Override.active,
        evidenceArtifactId: manualL3Override.evidenceArtifactId,
        validFor: manualL3Override.validFor,
        monitorCreateApproval: false
      },
      attemptState: {
        cycleId,
        cycleNo,
        attemptCount,
        latestAttemptNo: Number(latestAttempt?.attempt_no || 0),
        firstAttemptServerBusy: firstAttempt ? isServerBusy(firstAttempt) : false,
        retryElapsedSeconds: Number.isFinite(retryElapsedSeconds) ? retryElapsedSeconds : null,
        maximumTotalAttempts: MONITOR_MAX_ATTEMPTS,
        attemptPolicy
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

  const client = monitorClient({ fetchImpl });
  let accountResult = null;
  let account = null;
  let identityPreflight = {
    status: "not_checked",
    verified: false,
    checks: []
  };
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
        mediaMasterId: clean(accountRow.mediaMasterId),
        mediaMasterName: clean(accountRow.mediaMasterName),
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
  if (account) {
    const expectedAccountRecordId = clean(target.advertiserId) === MONITOR_MANUAL_SUCCESS_CONTRACT.newAdvertiserId
      ? MONITOR_MANUAL_SUCCESS_CONTRACT.newAccountRecordId
      : "";
    const identityChecks = [
      ["advertiser_id", account.advertiserId, target.advertiserId],
      ["owner", account.ownerKey, effectiveOwnerKey],
      ["agent_id", account.agentId, defaults.monitor_provision.agent_id],
      ["auth_status", accountAuthStatus(account), "ready"],
      ...(expectedAccountRecordId ? [["qiankun_account_record_id", account.qiankunAccountRecordId, expectedAccountRecordId]] : [])
    ].map(([field, actual, expected]) => ({
      field,
      actual: clean(actual),
      expected: clean(expected),
      matched: clean(actual) === clean(expected)
    }));
    identityPreflight = {
      status: identityChecks.every((item) => item.matched) ? "preflight_verified" : "preflight_mismatch",
      verified: identityChecks.every((item) => item.matched),
      checks: identityChecks,
      persistedIdentityStatus: qiankunIdentityVerified ? "verified" : clean(storedAccount?.qiankun_identity_status || "observed")
    };
    if (!identityPreflight.verified) blockers.push("qiankun_account_identity_preflight_failed");
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
  let manualContractComparison = {
    sourceMonitorId: MONITOR_MANUAL_SUCCESS_CONTRACT.sourceMonitorId,
    ready: false,
    blockers: ["create_plan_not_compiled"]
  };
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

  if (account && readiness.readyForReadonlyReconcile) {
    createParams = monitorCreateParams({
      target,
      account,
      ownerKey: effectiveOwnerKey,
      technicalConfig: defaults.monitor_provision
    });
    createRequestHash = hashValue(createParams);
    manualContractComparison = manualSuccessContractComparison({ target, createParams });
    if (!monitor) blockers.push(...manualContractComparison.blockers);
    actionConfirmation = monitorActionConfirmationState({
      env,
      target,
      provisionId,
      createPlanHash: createRequestHash,
      action: attemptPolicy.action
    });
    confirmationPresent = actionConfirmation.confirmed;
    confirmValuePresent = actionConfirmation.actionValuePresent;
    provisionValuePresent = actionConfirmation.provisionValuePresent;
    if (!monitor && !confirmationPresent) {
      blockers.push(actionConfirmation.createPlanHashValuePresent
        ? "confirm_variable_missing_or_invalid"
        : "create_plan_hash_missing_or_invalid");
    }
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
      cycleId,
      attemptNo: attemptPolicy.nextAttemptNo,
      triggerReason: attemptPolicy.triggerReason,
      jobId,
      planId,
      idempotencyKey: idempotencyKey ? `${idempotencyKey}:attempt-${attemptPolicy.nextAttemptNo}` : "",
      scheduledAt: createConfirmedAt,
      startedAt: createConfirmedAt
    });
    if (!claimedAttempt?.claimed) {
      blockers.push(`monitor_attempt_${attemptPolicy.nextAttemptNo}_claim_failed`);
    }
  }

  if (
    confirmationPresent
    && blockers.length === 0
    && claimedAttempt?.claimed
  ) {
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
  const finalAttemptCount = createCalled ? Number(attemptPolicy.nextAttemptNo || attemptCount) : attemptCount;
  const createFailedWithServerBusy = createCalled && classifyMonitorCreateError(createResult) === "server_busy";
  const finalLifecycleSummary = monitor
    ? monitor.touchpointUrl ? "monitor_resolved" : "monitor_resolved_touchpoint_pending"
    : createFailedWithServerBusy && finalAttemptCount < MONITOR_MAX_ATTEMPTS ? "monitor_create_server_busy_retry_available"
      : finalAttemptCount >= MONITOR_MAX_ATTEMPTS ? "monitor_create_busy_retry_exhausted" : "monitor_create_terminal_failure";
  const publicSummary = {
    mode: "ensure",
    target,
    provisionId,
    cycle: {
      cycleId,
      cycleNo,
      cycleStatus: currentCycle?.cycle_status || "active",
      supersedesCycleId: currentCycle?.supersedes_cycle_id || "",
      reissueReason: currentCycle?.reissue_reason || ""
    },
    requestFingerprint,
    confirmationPresent,
    confirmValuePresent,
    provisionValuePresent,
    actionConfirmation,
    credential: {
      status: credential.status,
      ownerKeyPresent: Boolean(effectiveOwnerKey),
      credentialStorePresent: credential.credentialStorePresent,
      activeCredentialCount: credential.activeCredentialCount,
      pendingOwnerKeyCount: credential.pendingOwnerKeyCount
    },
    latestRunBeforeCreate: latestRun ? {
      cycleId,
      cycleNo,
      cycleStatus: latestRun.cycle_status || "",
      status: latestRun.status,
      monitorIdPresent: Boolean(latestRun.monitor_id),
      createCalled: latestRun.create_called === true,
      createAttemptNo: Number(latestRun.create_attempt_no || 0)
    } : {
      present: false
    },
    attemptState: {
      cycleId,
      cycleNo,
      attemptCountBeforeEnsure: attemptCount,
      attemptCountAfterEnsure: finalAttemptCount,
      firstAttemptServerBusy: firstAttempt ? isServerBusy(firstAttempt) : false,
      retryElapsedSeconds: Number.isFinite(retryElapsedSeconds) ? retryElapsedSeconds : null,
      claimedAttemptNo: Number(claimedAttempt?.attemptNo || 0),
      claimed: claimedAttempt?.claimed === true,
      maximumTotalAttempts: MONITOR_MAX_ATTEMPTS,
      attemptPolicy,
      retryAllowedAfterAttempt2: false
    },
    defaults: {
      monitorProvisionPresent: readiness.present,
      missingFields: readiness.missingFields,
      exactMonitorMatchingEnabled: readiness.readyForReadonlyReconcile,
      sourceRef: defaults?.monitor_provision?.source_ref || "",
      callbackContract
    },
    manualSuccessContractComparison: manualContractComparison,
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
      mediaMasterId: account.mediaMasterId,
      mediaMasterNamePresent: Boolean(account.mediaMasterName),
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
    identityPreflight,
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
    createPlan: {
      endpoint: "/tf/ad/monitorSerialNumberAdd",
      requestHash: createRequestHash,
      requestFieldManifest: requestFieldManifest(createParams),
      callbackContract,
      wouldCreate: !monitor && blockers.length === 0 && confirmationPresent,
      createCalled: false
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
    summary: safeSummary,
    jobId
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
      qiankunMediaMasterId: account.mediaMasterId,
      qiankunMediaMasterName: account.mediaMasterName,
      qiankunIdentityStatus: "verified",
      qiankunVerifiedAt: new Date().toISOString()
    });
  }
  if (createCalled) {
    await repo.completeMonitorProvisionAttempt({
      attemptId: claimedAttempt.attemptId || monitorAttemptId(cycleId, attemptPolicy.nextAttemptNo),
      attemptStatus: monitor ? "passed" : "failed",
      httpStatus: createResult.httpStatus,
      apiCode: createResult.apiCode || "",
      errorCategory: classifyMonitorCreateError(createResult),
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
  const finalCycleStatus = monitor
    ? "resolved"
    : finalAttemptCount >= MONITOR_MAX_ATTEMPTS ? "stopped" : "active";
  const writes = await persistReadonlyReconcile({
    repo,
    jobId,
    planId,
    target,
    provisionId,
    cycleId,
    cycleNo,
    cycleStatus: finalCycleStatus,
    preflightHash: safeSummary.createPlan?.requestHash || safeSummary.requestFingerprint || "",
    closedAt: finalCycleStatus === "active" ? "" : new Date().toISOString(),
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
  const compiledDefaults = defaults ? {
    ...defaults,
    monitor_provision_present: defaults.monitor_provision_present === true,
    monitor_provision: monitorPlanConfig(defaults)
  } : null;
  const readiness = monitorDefaultsReadiness(compiledDefaults || {});
  const fingerprint = monitorProvisionFingerprint({
    ...target,
    technicalConfig: compiledDefaults?.monitor_provision || {}
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
      monitorProvisionPresent: compiledDefaults.monitor_provision_present === true,
      monitorProvisionFieldCount: Object.keys(compiledDefaults.monitor_provision || {}).length,
      readiness
    } : {
      monitorProvisionPresent: false,
      readiness,
      error: defaultsError
    },
    latestRun: latestRun ? {
      provisionId: latestRun.provision_id,
      cycleId: latestRun.cycle_id || "",
      cycleNo: Number(latestRun.cycle_no || 0),
      cycleStatus: latestRun.cycle_status || "",
      supersedesCycleId: latestRun.supersedes_cycle_id || "",
      reissueReason: latestRun.reissue_reason || "",
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
      cycleId: attemptState.run?.cycle_id || "",
      cycleNo: Number(attemptState.run?.cycle_no || 0),
      cycleStatus: attemptState.run?.cycle_status || "",
      attemptCount: Number(attemptState.attemptCount || 0),
      latestAttemptNo: Number(attemptState.latestAttempt?.attempt_no || 0),
      latestAttemptStatus: clean(attemptState.latestAttempt?.attempt_status),
      latestAttemptApiCode: clean(attemptState.latestAttempt?.api_code),
      latestAttemptErrorCategory: clean(attemptState.latestAttempt?.error_category),
      firstAttemptServerBusy: attemptState.firstAttempt ? isServerBusy(attemptState.firstAttempt) : false,
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
  monitorIds = [],
  reissueReason = "",
  jobId = "",
  planId = "",
  idempotencyKey = "",
  fetchImpl = globalThis.fetch
} = {}) {
  const cleanMode = clean(mode) || "status";
  if (cleanMode === "status") {
    return runMonitorProvisionFoundationStatus({ repo, ownerKey, ensureScaffold, target });
  }
  if (cleanMode === "plan") {
    return runMonitorProvisionPlanOnly({ repo, ownerKey, target, jobId, planId, fetchImpl });
  }
  if (cleanMode === "account_preflight" || cleanMode === "account-preflight") {
    return runQiankunAccountIndexReadonlyPreflight({ repo, ownerKey, target, fetchImpl });
  }
  if (cleanMode === "reissue_plan" || cleanMode === "reissue-plan") {
    return runMonitorProvisionReissuePlan({ repo, ownerKey, target, reissueReason, jobId, planId, fetchImpl });
  }
  if (cleanMode === "reconcile") {
    return runMonitorProvisionReadonlyReconcile({ repo, ownerKey, target, jobId, planId, fetchImpl });
  }
  if (cleanMode === "ensure") {
    return runMonitorProvisionEnsure({ repo, ownerKey, target, env, planOnly, jobId, planId, idempotencyKey, fetchImpl });
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
