import { credentialStatusForDatabase, getQiankunCredentialSummary, redactedQiankunCredentialStatus } from "../../../platforms/qiankunCredentialStore.mjs";
import { createQiankunMonitorClient } from "../../../platforms/qiankunMonitorClient.mjs";
import { assertNoSensitiveLeak, hashValue, sanitizeForPublic } from "./00-contracts.mjs";

export const QIANKUN_CATE_VEST_TARGET = {
  routeId: "oceanengine_3_byte_mini_game",
  gameCode: "JSZC",
  cateId: "122",
  os: "3",
  expectedVestId: "1414"
};

export const QIANKUN_VEST_PACKAGE_TARGET = {
  routeId: "oceanengine_3_byte_mini_game",
  gameCode: "JSZC",
  vestId: "1414",
  vestName: "巨兽战场",
  os: "3",
  expectedPackageId: "36820"
};

export const QIANKUN_PACKAGE_BASE_INFO_TARGET = {
  routeId: "oceanengine_3_byte_mini_game",
  gameCode: "JSZC",
  advertiserId: "1871922346964041",
  packageId: "36820",
  os: "3",
  expectedCateId: "122",
  expectedVestId: "1414",
  expectedChannel: "dymini3k"
};

export const QIANKUN_MONITOR_TECHNICAL_COMBINATION_TARGET = {
  routeId: "oceanengine_3_byte_mini_game",
  gameCode: "JSZC",
  advertiserId: "1871922346964041",
  os: "3",
  cateId: "122",
  vestId: "1414",
  packageId: "36820",
  channel: "dymini3k",
  candidateMediaId: "310",
  candidateAgentId: "613",
  candidateMonitorApi: "toutiao_wxgame"
};

export const QIANKUN_MEDIA_CANDIDATE_DISCOVERY_TARGET = {
  ...QIANKUN_MONITOR_TECHNICAL_COMBINATION_TARGET,
  historicalMonitorId: "245791",
  qiankunAccountRecordId: "8448",
  qiankunAgentId: "613"
};

export const QIANKUN_LEVEL3_MEDIA_RESOURCE_TARGET = {
  ...QIANKUN_MONITOR_TECHNICAL_COMBINATION_TARGET,
  historicalMonitorId: "245791",
  mediaResourceId: "310",
  qiankunAccountRecordId: "8448",
  expectedAgentId: "613",
  expectedMonitorApi: "toutiao_wxgame"
};

export const QIANKUN_LEVEL3_MEDIA_RETRY_CONFIRM_ENV = "MWBV2_QK_L3_MEDIA_RETRY_CONFIRM";
export const QIANKUN_LEVEL3_MEDIA_RETRY_CONFIRM_VALUE = "RETRY_ONE_LEVEL3_MEDIA_READONLY";

export const QIANKUN_MEDIA_CATALOG_TARGET = {
  routeId: "oceanengine_3_byte_mini_game",
  gameCode: "JSZC",
  advertiserId: "1871922346964041",
  os: "3",
  mediaId: "310",
  mediaName: "通投智选（原生竞价）",
  qiankunAccountRecordId: "8448",
  expectedMonitorApi: "toutiao_wxgame",
  expectedAgentId: "613"
};

const CHANGE_CATE_ENDPOINT = "/tf/ad/changeCateId";
const CHANGE_VEST_ENDPOINT = "/tf/ad/changeVestId";
const CHANGE_PACKAGE_ENDPOINT = "/tf/ad/changePackageId";
const ACCOUNT_INDEX_ENDPOINT = "/tf/account_info/accountIndex";
const SELECT_LIST_ENDPOINT = "/ajax/selectList/getList";
const CHANGE_MEDIA_ENDPOINT = "/tf/ad/changeMediaId";
const CHANGE_MEDIA_ACCOUNT_ENDPOINT = "/tf/ad/changeMediaAccountId";

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

function stableIdPart(value) {
  return clean(value).toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "UNKNOWN";
}

function cateVestEvidenceId(target = QIANKUN_CATE_VEST_TARGET) {
  return [
    "EV-QK-CATE-VEST",
    stableIdPart(target.routeId),
    stableIdPart(target.gameCode),
    stableIdPart(target.cateId),
    stableIdPart(target.os)
  ].join("-");
}

function vestPackageEvidenceId(target = QIANKUN_VEST_PACKAGE_TARGET) {
  return [
    "EV-QK-VEST-PACKAGE",
    stableIdPart(target.routeId),
    stableIdPart(target.gameCode),
    stableIdPart(target.vestId),
    stableIdPart(target.os)
  ].join("-");
}

function packageBaseInfoEvidenceId(target = QIANKUN_PACKAGE_BASE_INFO_TARGET) {
  return [
    "EV-QK-PACKAGE-BASE-INFO",
    stableIdPart(target.routeId),
    stableIdPart(target.gameCode),
    stableIdPart(target.packageId),
    stableIdPart(target.os)
  ].join("-");
}

function technicalCombinationEvidenceId(target = QIANKUN_MONITOR_TECHNICAL_COMBINATION_TARGET) {
  return [
    "EV-QK-MONITOR-TECH-COMBO",
    stableIdPart(target.routeId),
    stableIdPart(target.gameCode),
    stableIdPart(target.advertiserId)
  ].join("-");
}

function mediaCandidateDiscoveryEvidenceId(target = QIANKUN_MEDIA_CANDIDATE_DISCOVERY_TARGET) {
  return [
    "EV-QK-MEDIA-CANDIDATE-DISCOVERY",
    stableIdPart(target.routeId),
    stableIdPart(target.gameCode),
    stableIdPart(target.advertiserId)
  ].join("-");
}

function level3MediaResourceEvidenceId(target = QIANKUN_LEVEL3_MEDIA_RESOURCE_TARGET, suffix = "") {
  const parts = [
    "EV-QK-LEVEL3-MEDIA-RESOURCE",
    stableIdPart(target.routeId),
    stableIdPart(target.gameCode),
    stableIdPart(target.advertiserId),
    stableIdPart(target.mediaResourceId)
  ];
  if (suffix) parts.push(stableIdPart(suffix));
  return parts.join("-");
}

function mediaCatalogEvidenceId(target = QIANKUN_MEDIA_CATALOG_TARGET) {
  return [
    "EV-QK-MEDIA-CATALOG",
    stableIdPart(target.routeId),
    stableIdPart(target.gameCode),
    stableIdPart(target.mediaId)
  ].join("-");
}

function monitorProvisionId(target = QIANKUN_MONITOR_TECHNICAL_COMBINATION_TARGET) {
  return [
    "MPR",
    stableIdPart(target.routeId),
    stableIdPart(target.gameCode),
    stableIdPart(target.advertiserId)
  ].join("-");
}

function hostFromBaseUrl(baseUrl = "") {
  try {
    return new URL(clean(baseUrl)).host;
  } catch {
    return "";
  }
}

function requestFingerprint({ endpoint, params }) {
  return hashValue({
    endpoint,
    params: Object.fromEntries(Object.entries(params || {}).map(([key, value]) => [key, clean(value)]))
  });
}

function normalizeOptionList(items = [], { labelValueShouldMatch = false } = {}) {
  const normalized = [];
  const invalidItems = [];
  const duplicateChildIds = [];
  const labelValueMismatches = [];
  const seen = new Set();

  items.forEach((item, index) => {
    const childId = clean(item.value);
    const childName = clean(item.label);
    const rawValueType = clean(item.rawValueType || typeof item.value);
    const problems = [
      ...(!childId ? ["value_missing"] : []),
      ...(!childName ? ["label_missing"] : []),
      ...(!["number", "string"].includes(rawValueType) ? [`value_type_changed:${rawValueType || "unknown"}`] : [])
    ];
    if (problems.length) {
      invalidItems.push({
        index,
        valuePresent: Boolean(childId),
        labelPresent: Boolean(childName),
        rawValueType,
        problems
      });
      return;
    }
    if (labelValueShouldMatch && childName !== childId) {
      labelValueMismatches.push({
        index,
        label: childName,
        value: childId
      });
    }
    if (seen.has(childId)) {
      duplicateChildIds.push(childId);
      return;
    }
    seen.add(childId);
    normalized.push({
      childId,
      childName
    });
  });

  return {
    normalized,
    invalidItems,
    duplicateChildIds: [...new Set(duplicateChildIds)],
    labelValueMismatches
  };
}

async function upsertCateVestEvidence({ repo, target, summary }) {
  if (!repo) return "";
  const safeSummary = sanitizeForPublic(summary);
  assertNoSensitiveLeak(safeSummary);
  const artifactId = cateVestEvidenceId(target);
  await repo.upsertEvidence({
    artifactId,
    jobId: null,
    artifactType: "qiankun_cate_vest_readonly",
    title: "乾坤游戏组到马甲只读同步证据",
    summary: JSON.stringify(safeSummary),
    contentHash: hashValue(safeSummary),
    storageRef: `postgres:mwb.qiankun_option_relations/${target.routeId}/${target.gameCode}/${target.cateId}/${target.os}`,
    sourceRef: `qiankun:${CHANGE_CATE_ENDPOINT}`,
    sourceUsage: "runtime_truth"
  });
  return artifactId;
}

async function upsertVestPackageEvidence({ repo, target, summary }) {
  if (!repo) return "";
  const safeSummary = sanitizeForPublic(summary);
  assertNoSensitiveLeak(safeSummary);
  const artifactId = vestPackageEvidenceId(target);
  await repo.upsertEvidence({
    artifactId,
    jobId: null,
    artifactType: "qiankun_vest_package_readonly",
    title: "乾坤马甲到融合拿包只读同步证据",
    summary: JSON.stringify(safeSummary),
    contentHash: hashValue(safeSummary),
    storageRef: `postgres:mwb.qiankun_option_relations/${target.routeId}/${target.gameCode}/${target.vestId}/${target.os}`,
    sourceRef: `qiankun:${CHANGE_VEST_ENDPOINT}`,
    sourceUsage: "runtime_truth"
  });
  return artifactId;
}

async function upsertPackageBaseInfoEvidence({ repo, target, summary }) {
  if (!repo) return "";
  const safeSummary = sanitizeForPublic(summary);
  assertNoSensitiveLeak(safeSummary);
  const artifactId = packageBaseInfoEvidenceId(target);
  await repo.upsertEvidence({
    artifactId,
    jobId: null,
    artifactType: "qiankun_package_base_info_readonly",
    title: "乾坤拿包基础信息只读核验证据",
    summary: JSON.stringify(safeSummary),
    contentHash: hashValue(safeSummary),
    storageRef: `postgres:mwb.qiankun_option_relations/${target.routeId}/${target.gameCode}/${target.packageId}/${target.os}`,
    sourceRef: `qiankun:${CHANGE_PACKAGE_ENDPOINT}`,
    sourceUsage: "runtime_truth"
  });
  return artifactId;
}

async function upsertTechnicalCombinationEvidence({ repo, target, summary }) {
  if (!repo) return "";
  const safeSummary = sanitizeForPublic(summary);
  assertNoSensitiveLeak(safeSummary);
  const artifactId = technicalCombinationEvidenceId(target);
  await repo.upsertEvidence({
    artifactId,
    jobId: null,
    artifactType: "qiankun_monitor_technical_combination_readonly",
    title: "乾坤监测技术组合只读核验证据",
    summary: JSON.stringify(safeSummary),
    contentHash: hashValue(safeSummary),
    storageRef: `postgres:mwb.advertiser_accounts/${target.advertiserId}+mwb.qiankun_option_relations/${target.routeId}/${target.gameCode}`,
    sourceRef: `qiankun:${ACCOUNT_INDEX_ENDPOINT}+${SELECT_LIST_ENDPOINT}+${CHANGE_MEDIA_ENDPOINT}+${CHANGE_MEDIA_ACCOUNT_ENDPOINT}`,
    sourceUsage: "runtime_truth"
  });
  return artifactId;
}

async function upsertMediaCandidateDiscoveryEvidence({ repo, target, summary }) {
  if (!repo) return "";
  const safeSummary = sanitizeForPublic(summary);
  assertNoSensitiveLeak(safeSummary);
  const artifactId = mediaCandidateDiscoveryEvidenceId(target);
  await repo.upsertEvidence({
    artifactId,
    jobId: null,
    artifactType: "qiankun_media_candidate_discovery_readonly",
    title: "乾坤当前媒体候选只读发现证据",
    summary: JSON.stringify(safeSummary),
    contentHash: hashValue(safeSummary),
    storageRef: `postgres:mwb.qiankun_option_relations/${target.routeId}/${target.gameCode}/${target.packageId}/${target.os}`,
    sourceRef: `qiankun:/tf/ad/index+${SELECT_LIST_ENDPOINT}+${CHANGE_MEDIA_ENDPOINT}+${CHANGE_MEDIA_ACCOUNT_ENDPOINT}`,
    sourceUsage: "runtime_truth"
  });
  return artifactId;
}

async function upsertLevel3MediaResourceEvidence({ repo, target, summary, artifactId = "", sourceRef = "" }) {
  if (!repo) return "";
  const safeSummary = sanitizeForPublic(summary);
  assertNoSensitiveLeak(safeSummary);
  const resolvedArtifactId = artifactId || level3MediaResourceEvidenceId(target);
  await repo.upsertEvidence({
    artifactId: resolvedArtifactId,
    jobId: null,
    artifactType: "qiankun_level3_media_resource_readonly",
    title: "乾坤 L3 媒体资源位只读核验证据",
    summary: JSON.stringify(safeSummary),
    contentHash: hashValue(safeSummary),
    storageRef: `postgres:mwb.qiankun_option_relations/${target.routeId}/${target.gameCode}/media_resource/${target.mediaResourceId}`,
    sourceRef: sourceRef || `qiankun:${ACCOUNT_INDEX_ENDPOINT}+/tf/ad/index+${CHANGE_MEDIA_ENDPOINT}+${CHANGE_MEDIA_ACCOUNT_ENDPOINT}`,
    sourceUsage: "runtime_truth"
  });
  return resolvedArtifactId;
}

async function upsertMediaCatalogEvidence({ repo, target, summary }) {
  if (!repo) return "";
  const safeSummary = sanitizeForPublic(summary);
  assertNoSensitiveLeak(safeSummary);
  const artifactId = mediaCatalogEvidenceId(target);
  await repo.upsertEvidence({
    artifactId,
    jobId: null,
    artifactType: "qiankun_media_catalog_readonly",
    title: "乾坤媒体目录只读对照证据",
    summary: JSON.stringify(safeSummary),
    contentHash: hashValue(safeSummary),
    storageRef: `postgres:mwb.evidence_artifacts/${artifactId}`,
    sourceRef: `qiankun:${SELECT_LIST_ENDPOINT}?type=mediaList`,
    sourceUsage: "runtime_truth"
  });
  return artifactId;
}

function fieldCheck({ present, actual = "", expected = "", missingStatus = "not_returned_for_os_3" }) {
  const actualText = clean(actual);
  const expectedText = clean(expected);
  return {
    present: present === true,
    actual: present === true ? actualText : "",
    expected: expectedText,
    matchesExpected: present === true && expectedText ? actualText === expectedText : null,
    status: present === true
      ? expectedText ? actualText === expectedText ? "matched" : "mismatched" : "returned"
      : missingStatus
  };
}

function relationFromValue(value, name = value) {
  const childId = clean(value);
  if (!childId) return [];
  return [{ childId, childName: clean(name) || childId }];
}

function optionListRelations(items = []) {
  const { normalized, invalidItems, duplicateChildIds, labelValueMismatches } = normalizeOptionList(items);
  return {
    relations: normalized,
    invalidItems,
    duplicateChildIds,
    labelValueMismatches
  };
}

function findOptionByValue(items = [], value = "") {
  const expected = clean(value);
  return (Array.isArray(items) ? items : []).find((item) => clean(item.value) === expected || clean(item.childId) === expected) || null;
}

function exactAccountRows(accountResult = {}, advertiserId = "") {
  const rows = Array.isArray(accountResult.summary?.list) ? accountResult.summary.list : [];
  return rows.filter((item) => clean(item.accountId) === clean(advertiserId));
}

function scopedMonitorRows(monitorResult = {}, target = QIANKUN_MEDIA_CANDIDATE_DISCOVERY_TARGET) {
  const rows = Array.isArray(monitorResult?.summary?.list) ? monitorResult.summary.list : [];
  return rows.map((item) => ({
    id: clean(item.id),
    monitorId: clean(item.monitorId),
    packageId: clean(item.packageId),
    cateId: clean(item.cateId),
    cateName: clean(item.cateName),
    vestId: clean(item.vestId),
    vestName: clean(item.vestName),
    os: clean(item.os),
    osName: clean(item.osName),
    channel: clean(item.channel),
    mediaId: clean(item.mediaId),
    mediaName: clean(item.mediaName),
    mediaIdPresent: Boolean(clean(item.mediaId)),
    mediaAccountRecordId: clean(item.mediaAccountRecordId),
    mediaAccountIdPresent: item.mediaAccountIdPresent === true || Boolean(clean(item.mediaAccountRecordId)),
    agentId: clean(item.agentId),
    agentIdPresent: item.agentIdPresent === true || Boolean(clean(item.agentId)),
    monitorApi: clean(item.monitorApi),
    monitorApiName: clean(item.monitorApiName),
    monitorApiPresent: item.monitorApiPresent === true || Boolean(clean(item.monitorApi)),
    ssoOwnerPresent: item.ssoOwnerPresent === true,
    ssoOwnerKeyPresent: Boolean(clean(item.ssoOwnerKey)),
    sameScope: [
      !clean(target.packageId) || clean(item.packageId) === clean(target.packageId),
      !clean(target.cateId) || !clean(item.cateId) || clean(item.cateId) === clean(target.cateId),
      !clean(target.vestId) || !clean(item.vestId) || clean(item.vestId) === clean(target.vestId),
      !clean(target.os) || !clean(item.os) || clean(item.os) === clean(target.os) || clean(item.osName) === clean(target.os),
      !clean(target.channel) || !clean(item.channel) || clean(item.channel) === clean(target.channel)
    ].every(Boolean)
  }));
}

function mediaOptionMap(mediaItems = []) {
  const { normalized, invalidItems, duplicateChildIds } = normalizeOptionList(mediaItems);
  return {
    options: normalized,
    byId: new Map(normalized.map((item) => [item.childId, item])),
    invalidItems,
    duplicateChildIds
  };
}

function mediaCandidatesFromHistoricalRows({ rows = [], currentMediaById = new Map(), maxMonitorIds = 5 } = {}) {
  const byMediaId = new Map();
  rows.filter((row) => row.sameScope && row.mediaIdPresent && currentMediaById.has(row.mediaId)).forEach((row) => {
    const media = currentMediaById.get(row.mediaId) || {};
    const existing = byMediaId.get(row.mediaId) || {
      mediaId: row.mediaId,
      mediaName: clean(media.childName || row.mediaName),
      historicalMonitorCount: 0,
      monitorIds: [],
      monitorApis: new Set(),
      agentIds: new Set(),
      accountRecordIds: new Set()
    };
    existing.historicalMonitorCount += 1;
    const monitorKey = clean(row.monitorId || row.id);
    if (monitorKey && existing.monitorIds.length < maxMonitorIds && !existing.monitorIds.includes(monitorKey)) {
      existing.monitorIds.push(monitorKey);
    }
    if (row.monitorApi) existing.monitorApis.add(row.monitorApi);
    if (row.agentId) existing.agentIds.add(row.agentId);
    if (row.mediaAccountRecordId) existing.accountRecordIds.add(row.mediaAccountRecordId);
    byMediaId.set(row.mediaId, existing);
  });
  return [...byMediaId.values()].map((item) => ({
    mediaId: item.mediaId,
    mediaName: item.mediaName,
    historicalMonitorCount: item.historicalMonitorCount,
    monitorIds: item.monitorIds,
    monitorApis: [...item.monitorApis].sort(),
    agentIds: [...item.agentIds].sort(),
    accountRecordIds: [...item.accountRecordIds].sort()
  })).sort((a, b) => b.historicalMonitorCount - a.historicalMonitorCount || a.mediaId.localeCompare(b.mediaId));
}

async function syncSingleRelation({
  repo,
  target,
  relationType,
  os,
  parentType,
  parentId,
  parentName = "",
  childType,
  relations,
  sourceEndpoint,
  requestFingerprint: fingerprint,
  responseHash,
  evidenceArtifactId
}) {
  if (!repo || !Array.isArray(relations) || relations.length === 0) {
    return {
      relationType,
      childType,
      inputCount: 0,
      upsertedCount: 0,
      staleCount: 0,
      currentRows: []
    };
  }
  const result = await repo.syncQiankunOptionRelations({
    relationType,
    routeId: target.routeId,
    gameCode: target.gameCode,
    os,
    parentType,
    parentId,
    parentName,
    childType,
    relations,
    validationStatus: "observed",
    sourceEndpoint,
    requestFingerprint: fingerprint,
    responseHash,
    evidenceArtifactId
  });
  return {
    relationType,
    childType,
    inputCount: relations.length,
    upsertedCount: Number(result?.upsertedCount || 0),
    staleCount: Number(result?.staleCount || 0),
    currentRows: Array.isArray(result?.currentRows) ? result.currentRows : []
  };
}

async function syncPackageRelations({
  repo,
  target,
  summary,
  requestFingerprint: fingerprint,
  responseHash,
  evidenceArtifactId
}) {
  const relationSpecs = [];
  if (summary.fieldsPresent?.channel) {
    relationSpecs.push({
      relationType: "package_to_channel",
      childType: "channel",
      relations: relationFromValue(summary.channel)
    });
  }
  if (summary.fieldsPresent?.mediaId) {
    relationSpecs.push({
      relationType: "package_to_default_media",
      childType: "media",
      relations: relationFromValue(summary.mediaId)
    });
  }
  if (summary.fieldsPresent?.agentId) {
    relationSpecs.push({
      relationType: "package_to_default_agent",
      childType: "agent",
      relations: relationFromValue(summary.agentId)
    });
  }
  if (summary.fieldsPresent?.mediaList) {
    relationSpecs.push({
      relationType: "package_to_allowed_media",
      childType: "media",
      relations: optionListRelations(summary.mediaList).relations
    });
  }
  if (summary.fieldsPresent?.accountIdList) {
    relationSpecs.push({
      relationType: "package_to_allowed_account_record",
      childType: "account_record",
      relations: optionListRelations(summary.accountIdList).relations
    });
  }
  if (summary.fieldsPresent?.monitorApiList) {
    relationSpecs.push({
      relationType: "package_to_allowed_monitor_api",
      childType: "monitor_api",
      relations: optionListRelations(summary.monitorApiList).relations
    });
  }

  const results = [];
  for (const spec of relationSpecs) {
    const result = await repo.syncQiankunOptionRelations({
      relationType: spec.relationType,
      routeId: target.routeId,
      gameCode: target.gameCode,
      os: target.os,
      parentType: "package",
      parentId: target.packageId,
      parentName: "",
      childType: spec.childType,
      relations: spec.relations,
      validationStatus: "observed",
      sourceEndpoint: CHANGE_PACKAGE_ENDPOINT,
      requestFingerprint: fingerprint,
      responseHash,
      evidenceArtifactId
    });
    results.push({
      relationType: spec.relationType,
      childType: spec.childType,
      inputCount: spec.relations.length,
      upsertedCount: Number(result?.upsertedCount || 0),
      staleCount: Number(result?.staleCount || 0),
      currentRows: Array.isArray(result?.currentRows) ? result.currentRows : []
    });
  }
  return results;
}

export async function runQiankunCateVestReadonlySync({
  repo,
  ownerKey = "",
  target = QIANKUN_CATE_VEST_TARGET
} = {}) {
  const initialCredential = redactedQiankunCredentialStatus({ ownerKey });
  const effectiveOwnerKey = selectedOwnerKey(ownerKey, initialCredential);
  const credential = redactedQiankunCredentialStatus({ ownerKey: effectiveOwnerKey });
  const allowPendingOwnerKeyBootstrap = !clean(effectiveOwnerKey) && initialCredential.pendingOwnerKeyCount === 1;
  const client = createQiankunMonitorClient({
    allowPendingOwnerKeyBootstrap,
    pendingOwnerKeyBootstrapEndpoints: [CHANGE_CATE_ENDPOINT]
  });
  const fingerprint = requestFingerprint({
    endpoint: CHANGE_CATE_ENDPOINT,
    params: { cateId: target.cateId, os: target.os }
  });
  const queryResult = await client.queryVestsByCate({
    ownerKey: effectiveOwnerKey,
    cateId: target.cateId,
    os: target.os
  });

  const blockers = [];
  const warnings = [];
  if (queryResult.status !== "passed") {
    blockers.push(`cate_vest_query_failed:${queryResult.apiCode || "unknown"}:${queryResult.apiMessage || "unknown"}`);
  }
  if (queryResult.status === "passed" && queryResult.dataPresent !== true) blockers.push("response_data_missing");
  if (queryResult.status === "passed" && queryResult.summary?.vestListPresent !== true) blockers.push("vest_list_not_array");

  const items = Array.isArray(queryResult.summary?.vestList) ? queryResult.summary.vestList : [];
  const { normalized, invalidItems, duplicateChildIds } = normalizeOptionList(items);
  if (queryResult.status === "passed" && queryResult.summary?.vestListPresent === true && items.length === 0) {
    warnings.push("vest_list_empty");
  }
  if (invalidItems.length) warnings.push("invalid_vest_items_skipped");
  if (duplicateChildIds.length) warnings.push("duplicate_vest_values_deduplicated");

  const expectedVestReturned = normalized.some((item) => item.childId === clean(target.expectedVestId));
  const publicSummary = {
    mode: "sync_cate_vest",
    target,
    relation: {
      relationType: "cate_to_vest",
      parentType: "cate",
      parentId: clean(target.cateId),
      childType: "vest",
      expectedVestId: clean(target.expectedVestId),
      expectedVestReturned
    },
    requestFingerprint: fingerprint,
    query: {
      endpoint: queryResult.endpoint || CHANGE_CATE_ENDPOINT,
      status: queryResult.status,
      httpStatus: queryResult.httpStatus,
      apiCode: queryResult.apiCode || "",
      apiMessage: queryResult.apiMessage || "",
      dataPresent: queryResult.dataPresent === true,
      vestListPresent: queryResult.summary?.vestListPresent === true,
      vestListCount: Number(queryResult.summary?.vestListCount || 0),
      normalizedCount: normalized.length,
      responseHash: queryResult.responseHash || "",
      rawRequestStored: false,
      rawResponseStored: false
    },
    normalizedVests: normalized,
    invalidItems,
    duplicateChildIds,
    credential: {
      status: credential.status,
      ownerKeyPresent: Boolean(clean(effectiveOwnerKey)),
      pendingOwnerKeyBootstrap: allowPendingOwnerKeyBootstrap,
      credentialStorePresent: credential.credentialStorePresent,
      activeCredentialCount: credential.activeCredentialCount,
      pendingOwnerKeyCount: credential.pendingOwnerKeyCount
    },
    warnings,
    blockers,
    platformWriteCalled: false,
    rawRequestStored: false,
    rawResponseStored: false
  };
  const safeSummary = sanitizeForPublic(publicSummary);
  assertNoSensitiveLeak(safeSummary);
  const evidenceArtifactId = await upsertCateVestEvidence({
    repo,
    target,
    summary: safeSummary
  });

  let writes = {
    relationRowsWritten: false,
    upsertedCount: 0,
    staleCount: 0,
    currentRows: []
  };
  if (repo && blockers.length === 0) {
    const syncResult = await repo.syncQiankunOptionRelations({
      relationType: "cate_to_vest",
      routeId: target.routeId,
      gameCode: target.gameCode,
      os: target.os,
      parentType: "cate",
      parentId: target.cateId,
      parentName: "",
      childType: "vest",
      relations: normalized,
      validationStatus: "observed",
      sourceEndpoint: CHANGE_CATE_ENDPOINT,
      requestFingerprint: fingerprint,
      responseHash: queryResult.responseHash,
      evidenceArtifactId
    });
    writes = {
      relationRowsWritten: true,
      upsertedCount: Number(syncResult?.upsertedCount || 0),
      staleCount: Number(syncResult?.staleCount || 0),
      currentRows: Array.isArray(syncResult?.currentRows) ? syncResult.currentRows : []
    };
  }

  const output = {
    ...safeSummary,
    status: blockers.length ? "blocked" : "passed",
    evidenceArtifactId,
    writes
  };
  assertNoSensitiveLeak(output);
  return output;
}

export async function runQiankunVestPackageReadonlySync({
  repo,
  ownerKey = "",
  target = QIANKUN_VEST_PACKAGE_TARGET
} = {}) {
  const initialCredential = redactedQiankunCredentialStatus({ ownerKey });
  const effectiveOwnerKey = selectedOwnerKey(ownerKey, initialCredential);
  const credential = redactedQiankunCredentialStatus({ ownerKey: effectiveOwnerKey });
  const allowPendingOwnerKeyBootstrap = !clean(effectiveOwnerKey) && initialCredential.pendingOwnerKeyCount === 1;
  const client = createQiankunMonitorClient({
    allowPendingOwnerKeyBootstrap,
    pendingOwnerKeyBootstrapEndpoints: [CHANGE_VEST_ENDPOINT]
  });
  const fingerprint = requestFingerprint({
    endpoint: CHANGE_VEST_ENDPOINT,
    params: { vestId: target.vestId, os: target.os }
  });
  const queryResult = await client.queryPackagesByVest({
    ownerKey: effectiveOwnerKey,
    vestId: target.vestId,
    os: target.os
  });

  const blockers = [];
  const warnings = [];
  if (queryResult.status !== "passed") {
    blockers.push(`vest_package_query_failed:${queryResult.apiCode || "unknown"}:${queryResult.apiMessage || "unknown"}`);
  }
  if (queryResult.status === "passed" && queryResult.dataPresent !== true) blockers.push("response_data_missing");
  if (queryResult.status === "passed" && queryResult.summary?.packageListPresent !== true) blockers.push("package_list_not_array");

  const items = Array.isArray(queryResult.summary?.packageList) ? queryResult.summary.packageList : [];
  const { normalized, invalidItems, duplicateChildIds, labelValueMismatches } = normalizeOptionList(items, {
    labelValueShouldMatch: true
  });
  if (queryResult.status === "passed" && queryResult.summary?.packageListPresent === true && items.length === 0) {
    warnings.push("package_list_empty");
  }
  if (invalidItems.length) warnings.push("invalid_package_items_skipped");
  if (duplicateChildIds.length) warnings.push("duplicate_package_values_deduplicated");
  if (labelValueMismatches.length) warnings.push("package_label_value_mismatch");

  const expectedPackageHit = normalized.some((item) => item.childId === clean(target.expectedPackageId));
  const publicSummary = {
    mode: "sync_vest_package",
    target,
    relation: {
      relationType: "vest_to_package",
      parentType: "vest",
      parentId: clean(target.vestId),
      parentName: clean(target.vestName),
      childType: "package",
      expectedPackageId: clean(target.expectedPackageId),
      expectedPackageHit
    },
    requestFingerprint: fingerprint,
    query: {
      endpoint: queryResult.endpoint || CHANGE_VEST_ENDPOINT,
      status: queryResult.status,
      httpStatus: queryResult.httpStatus,
      apiCode: queryResult.apiCode || "",
      apiMessage: queryResult.apiMessage || "",
      dataPresent: queryResult.dataPresent === true,
      packageListPresent: queryResult.summary?.packageListPresent === true,
      packageListCount: Number(queryResult.summary?.packageListCount || 0),
      normalizedCount: normalized.length,
      responseHash: queryResult.responseHash || "",
      rawRequestStored: false,
      rawResponseStored: false
    },
    normalizedPackages: normalized,
    invalidItems,
    duplicateChildIds,
    labelValueMismatches,
    credential: {
      status: credential.status,
      ownerKeyPresent: Boolean(clean(effectiveOwnerKey)),
      pendingOwnerKeyBootstrap: allowPendingOwnerKeyBootstrap,
      credentialStorePresent: credential.credentialStorePresent,
      activeCredentialCount: credential.activeCredentialCount,
      pendingOwnerKeyCount: credential.pendingOwnerKeyCount
    },
    warnings,
    blockers,
    platformWriteCalled: false,
    rawRequestStored: false,
    rawResponseStored: false
  };
  const safeSummary = sanitizeForPublic(publicSummary);
  assertNoSensitiveLeak(safeSummary);
  const evidenceArtifactId = await upsertVestPackageEvidence({
    repo,
    target,
    summary: safeSummary
  });

  let writes = {
    relationRowsWritten: false,
    upsertedCount: 0,
    staleCount: 0,
    currentRows: []
  };
  if (repo && blockers.length === 0) {
    const syncResult = await repo.syncQiankunOptionRelations({
      relationType: "vest_to_package",
      routeId: target.routeId,
      gameCode: target.gameCode,
      os: target.os,
      parentType: "vest",
      parentId: target.vestId,
      parentName: target.vestName,
      childType: "package",
      relations: normalized,
      validationStatus: "observed",
      sourceEndpoint: CHANGE_VEST_ENDPOINT,
      requestFingerprint: fingerprint,
      responseHash: queryResult.responseHash,
      evidenceArtifactId
    });
    writes = {
      relationRowsWritten: true,
      upsertedCount: Number(syncResult?.upsertedCount || 0),
      staleCount: Number(syncResult?.staleCount || 0),
      currentRows: Array.isArray(syncResult?.currentRows) ? syncResult.currentRows : []
    };
  }

  const output = {
    ...safeSummary,
    status: blockers.length ? "blocked" : "passed",
    evidenceArtifactId,
    writes
  };
  assertNoSensitiveLeak(output);
  return output;
}

export async function runQiankunPackageBaseInfoReadonlySync({
  repo,
  ownerKey = "",
  target = QIANKUN_PACKAGE_BASE_INFO_TARGET
} = {}) {
  const initialCredential = redactedQiankunCredentialStatus({ ownerKey });
  const effectiveOwnerKey = selectedOwnerKey(ownerKey, initialCredential);
  const credential = redactedQiankunCredentialStatus({ ownerKey: effectiveOwnerKey });
  const allowPendingOwnerKeyBootstrap = !clean(effectiveOwnerKey) && initialCredential.pendingOwnerKeyCount === 1;
  const host = hostFromBaseUrl(getQiankunCredentialSummary({ ownerKey: effectiveOwnerKey }).apiBaseUrl);
  const client = createQiankunMonitorClient({
    allowPendingOwnerKeyBootstrap,
    pendingOwnerKeyBootstrapEndpoints: [CHANGE_PACKAGE_ENDPOINT]
  });
  const fingerprint = requestFingerprint({
    endpoint: CHANGE_PACKAGE_ENDPOINT,
    params: {
      package_id: target.packageId,
      os: target.os,
      host_present: Boolean(host)
    }
  });

  const localRun = repo ? await repo.getLatestMonitorProvisionRun({
    routeId: target.routeId,
    gameCode: target.gameCode,
    advertiserId: target.advertiserId
  }) : null;
  const localAccountRecordId = clean(localRun?.media_account_id || localRun?.technical_account_record_id);
  const localOwnerKey = clean(localRun?.owner_key || effectiveOwnerKey);
  const queryResult = await client.queryPackageBaseInfo({
    ownerKey: effectiveOwnerKey,
    packageId: target.packageId,
    os: target.os,
    host
  });

  const blockers = [];
  const warnings = [];
  if (!host) blockers.push("qiankun_api_host_unresolved");
  if (queryResult.status !== "passed") {
    blockers.push(`package_base_info_query_failed:${queryResult.apiCode || "unknown"}:${queryResult.apiMessage || "unknown"}`);
  }
  if (queryResult.status === "passed" && queryResult.dataPresent !== true) blockers.push("response_data_missing");
  if (queryResult.status === "passed" && queryResult.summary?.dataObjectPresent !== true) warnings.push("package_base_info_empty");

  const summary = queryResult.summary || {};
  const mediaOptions = optionListRelations(summary.mediaList || []);
  const accountOptions = optionListRelations(summary.accountIdList || []);
  const monitorApiOptions = optionListRelations(summary.monitorApiList || []);
  if (mediaOptions.invalidItems.length) warnings.push("invalid_media_items_skipped");
  if (accountOptions.invalidItems.length) warnings.push("invalid_account_record_items_skipped");
  if (monitorApiOptions.invalidItems.length) warnings.push("invalid_monitor_api_items_skipped");
  if (mediaOptions.duplicateChildIds.length) warnings.push("duplicate_media_values_deduplicated");
  if (accountOptions.duplicateChildIds.length) warnings.push("duplicate_account_record_values_deduplicated");
  if (monitorApiOptions.duplicateChildIds.length) warnings.push("duplicate_monitor_api_values_deduplicated");

  const accountRecordReturned = accountOptions.relations.some((item) => item.childId === localAccountRecordId);
  const publicSummary = {
    mode: "sync_package_base_info",
    target,
    requestFingerprint: fingerprint,
    query: {
      endpoint: queryResult.endpoint || CHANGE_PACKAGE_ENDPOINT,
      status: queryResult.status,
      httpStatus: queryResult.httpStatus,
      apiCode: queryResult.apiCode || "",
      apiMessage: queryResult.apiMessage || "",
      dataPresent: queryResult.dataPresent === true,
      dataObjectPresent: summary.dataObjectPresent === true,
      responseHash: queryResult.responseHash || "",
      rawRequestStored: false,
      rawResponseStored: false
    },
    fieldChecks: {
      cateId: fieldCheck({
        present: summary.fieldsPresent?.cateId,
        actual: summary.cateId,
        expected: target.expectedCateId
      }),
      vestId: fieldCheck({
        present: summary.fieldsPresent?.vestId,
        actual: summary.vestId,
        expected: target.expectedVestId
      }),
      channel: fieldCheck({
        present: summary.fieldsPresent?.channel,
        actual: summary.channel,
        expected: target.expectedChannel
      }),
      owner: fieldCheck({
        present: summary.fieldsPresent?.owner,
        actual: summary.owner,
        expected: localOwnerKey
      }),
      mediaId: fieldCheck({
        present: summary.fieldsPresent?.mediaId,
        actual: summary.mediaId
      }),
      agentId: fieldCheck({
        present: summary.fieldsPresent?.agentId,
        actual: summary.agentId
      }),
      monitorApiList: {
        present: summary.fieldsPresent?.monitorApiList === true,
        count: monitorApiOptions.relations.length,
        status: summary.fieldsPresent?.monitorApiList === true ? "returned" : "not_returned_for_os_3"
      },
      accountIdList: {
        present: summary.fieldsPresent?.accountIdList === true,
        count: accountOptions.relations.length,
        targetAccountRecordIdPresent: Boolean(localAccountRecordId),
        targetAccountRecordIdReturned: summary.fieldsPresent?.accountIdList === true ? accountRecordReturned : null,
        status: summary.fieldsPresent?.accountIdList === true ? "returned" : "not_returned_for_os_3"
      }
    },
    package_download_url_present: summary.package_download_url_present === true,
    booleanFlags: {
      isTfDepartment: summary.isTfDepartment,
      hasMonitorSerialNumber: summary.hasMonitorSerialNumber
    },
    returnedRelations: {
      packageToChannel: summary.fieldsPresent?.channel === true ? relationFromValue(summary.channel) : [],
      packageToDefaultMedia: summary.fieldsPresent?.mediaId === true ? relationFromValue(summary.mediaId) : [],
      packageToAllowedMedia: mediaOptions.relations,
      packageToDefaultAgent: summary.fieldsPresent?.agentId === true ? relationFromValue(summary.agentId) : [],
      packageToAllowedMonitorApi: monitorApiOptions.relations,
      packageToAllowedAccountRecord: accountOptions.relations
    },
    invalidItems: {
      mediaList: mediaOptions.invalidItems,
      accountIdList: accountOptions.invalidItems,
      monitorApiList: monitorApiOptions.invalidItems
    },
    duplicateChildIds: {
      mediaList: mediaOptions.duplicateChildIds,
      accountIdList: accountOptions.duplicateChildIds,
      monitorApiList: monitorApiOptions.duplicateChildIds
    },
    localContext: {
      targetAccountRecordIdPresent: Boolean(localAccountRecordId),
      ownerKeyPresent: Boolean(localOwnerKey)
    },
    credential: {
      status: credential.status,
      ownerKeyPresent: Boolean(clean(effectiveOwnerKey)),
      pendingOwnerKeyBootstrap: allowPendingOwnerKeyBootstrap,
      credentialStorePresent: credential.credentialStorePresent,
      activeCredentialCount: credential.activeCredentialCount,
      pendingOwnerKeyCount: credential.pendingOwnerKeyCount
    },
    warnings,
    blockers,
    platformWriteCalled: false,
    rawRequestStored: false,
    rawResponseStored: false
  };
  const safeSummary = sanitizeForPublic(publicSummary);
  assertNoSensitiveLeak(safeSummary);
  const evidenceArtifactId = await upsertPackageBaseInfoEvidence({
    repo,
    target,
    summary: safeSummary
  });

  let writes = {
    relationRowsWritten: false,
    relationTypesWritten: [],
    relationWriteResults: []
  };
  if (repo && blockers.length === 0) {
    const relationWriteResults = await syncPackageRelations({
      repo,
      target,
      summary,
      requestFingerprint: fingerprint,
      responseHash: queryResult.responseHash,
      evidenceArtifactId
    });
    writes = {
      relationRowsWritten: relationWriteResults.length > 0,
      relationTypesWritten: relationWriteResults.map((item) => item.relationType),
      relationWriteResults
    };
  }

  const output = {
    ...safeSummary,
    status: blockers.length ? "blocked" : "passed",
    evidenceArtifactId,
    writes
  };
  assertNoSensitiveLeak(output);
  return output;
}

export async function runQiankunMediaCatalogReadonlySync({
  repo,
  ownerKey = "",
  target = QIANKUN_MEDIA_CATALOG_TARGET
} = {}) {
  const initialCredential = redactedQiankunCredentialStatus({ ownerKey });
  const effectiveOwnerKey = selectedOwnerKey(ownerKey, initialCredential);
  const credential = redactedQiankunCredentialStatus({ ownerKey: effectiveOwnerKey });
  const allowPendingOwnerKeyBootstrap = !clean(effectiveOwnerKey) && initialCredential.pendingOwnerKeyCount === 1;
  const client = createQiankunMonitorClient({
    allowPendingOwnerKeyBootstrap,
    pendingOwnerKeyBootstrapEndpoints: [SELECT_LIST_ENDPOINT]
  });
  const blockers = [];
  const warnings = [];
  const mediaId = clean(target.mediaId);
  const mediaName = clean(target.mediaName);
  if (!mediaId) blockers.push("target_media_id_missing");
  if (!mediaName) warnings.push("target_media_name_missing");
  if (!allowPendingOwnerKeyBootstrap && credential.status !== "active") {
    blockers.push(`credential_not_active:${credential.status}`);
  }

  const mediaListFingerprint = requestFingerprint({
    endpoint: SELECT_LIST_ENDPOINT,
    params: { type: "mediaList" }
  });
  const mediaListResult = blockers.length
    ? null
    : await client.querySelectList({
      ownerKey: effectiveOwnerKey,
      type: "mediaList"
    });
  if (mediaListResult && mediaListResult.status !== "passed") {
    blockers.push(`media_list_query_failed:${mediaListResult.apiCode || "unknown"}:${mediaListResult.apiMessage || "unknown"}`);
  }

  const optionMap = mediaOptionMap(mediaListResult?.summary?.list || []);
  const valueMatches = optionMap.options.filter((item) => item.childId === mediaId);
  const exactNameMatches = mediaName
    ? optionMap.options.filter((item) => item.childName === mediaName)
    : [];
  const containsNameMatches = mediaName
    ? optionMap.options.filter((item) => item.childName.includes(mediaName) || mediaName.includes(item.childName))
    : [];
  const byValue = valueMatches[0] || null;
  const exactNameUnique = exactNameMatches.length === 1;
  const valueUnique = valueMatches.length === 1;
  const catalogSupportsManualPair = Boolean(byValue && (!mediaName || byValue.childName === mediaName));

  const publicSummary = {
    mode: "sync_media_catalog",
    target: {
      routeId: target.routeId,
      gameCode: target.gameCode,
      advertiserId: target.advertiserId,
      os: target.os,
      mediaId,
      mediaName,
      qiankunAccountRecordId: clean(target.qiankunAccountRecordId),
      expectedMonitorApi: clean(target.expectedMonitorApi),
      expectedAgentId: clean(target.expectedAgentId)
    },
    catalog: {
      called: Boolean(mediaListResult),
      status: mediaListResult?.status || "skipped",
      apiCode: mediaListResult?.apiCode || "",
      apiMessage: mediaListResult?.apiMessage || "",
      listPresent: mediaListResult?.summary?.listPresent === true,
      returnedCount: Number(mediaListResult?.summary?.listCount || 0),
      normalizedCount: optionMap.options.length,
      value310Present: valueMatches.length > 0,
      value310Unique: valueUnique,
      value310Name: byValue?.childName || "",
      expectedNameExactPresent: exactNameMatches.length > 0,
      expectedNameExactUnique: exactNameUnique,
      expectedNameValue: exactNameUnique ? exactNameMatches[0].childId : "",
      expectedNameContainsMatchCount: containsNameMatches.length,
      catalogSupportsManualPair,
      valueMatches: valueMatches.slice(0, 5),
      exactNameMatches: exactNameMatches.slice(0, 5),
      containsNameMatches: containsNameMatches.slice(0, 5),
      invalidItemCount: optionMap.invalidItems.length,
      duplicateChildIds: optionMap.duplicateChildIds.slice(0, 10)
    },
    interpretation: {
      evidenceScope: "catalog_observation_only",
      notAccountAvailabilityProof: true,
      notMonitorCreateApproval: true,
      changeMediaIdStillRequiredForAccountAndMonitorApi: true
    },
    externalCalls: {
      mediaList: Boolean(mediaListResult),
      accountIndex: false,
      historicalMonitorIndex: false,
      changeMediaId: false,
      changeMediaAccountId: false,
      monitorSerialNumberAdd: false
    },
    requestFingerprints: {
      mediaList: mediaListFingerprint
    },
    responseHashes: {
      mediaList: mediaListResult?.responseHash || ""
    },
    credential: {
      status: credential.status,
      ownerKeyPresent: Boolean(clean(effectiveOwnerKey)),
      pendingOwnerKeyBootstrap: allowPendingOwnerKeyBootstrap,
      credentialStorePresent: credential.credentialStorePresent,
      activeCredentialCount: credential.activeCredentialCount,
      pendingOwnerKeyCount: credential.pendingOwnerKeyCount
    },
    warnings,
    blockers,
    platformWriteCalled: false,
    rawRequestStored: false,
    rawResponseStored: false
  };
  const safeSummary = sanitizeForPublic(publicSummary);
  assertNoSensitiveLeak(safeSummary);
  const evidenceArtifactId = await upsertMediaCatalogEvidence({ repo, target, summary: safeSummary });
  const output = {
    ...safeSummary,
    status: blockers.length ? "blocked" : "passed",
    evidenceArtifactId,
    writes: {
      evidenceWritten: Boolean(evidenceArtifactId),
      relationRowsWritten: false,
      monitorProvisionRunUpdated: false
    }
  };
  assertNoSensitiveLeak(output);
  return output;
}

export async function runQiankunMediaCandidateDiscoveryReadonlySync({
  repo,
  ownerKey = "",
  target = QIANKUN_MEDIA_CANDIDATE_DISCOVERY_TARGET
} = {}) {
  const initialCredential = redactedQiankunCredentialStatus({ ownerKey });
  const effectiveOwnerKey = selectedOwnerKey(ownerKey, initialCredential);
  const credential = redactedQiankunCredentialStatus({ ownerKey: effectiveOwnerKey });
  const allowPendingOwnerKeyBootstrap = !clean(effectiveOwnerKey) && initialCredential.pendingOwnerKeyCount === 1;
  const client = createQiankunMonitorClient({
    allowPendingOwnerKeyBootstrap,
    pendingOwnerKeyBootstrapEndpoints: [
      SELECT_LIST_ENDPOINT,
      CHANGE_MEDIA_ENDPOINT,
      CHANGE_MEDIA_ACCOUNT_ENDPOINT,
      "/tf/ad/index"
    ]
  });
  const blockers = [];
  const warnings = [];
  const writes = [];
  const verifiedAt = new Date().toISOString();
  let storedAccount = null;
  try {
    storedAccount = repo ? (await repo.getCoreContext({
      routeId: target.routeId,
      gameCode: target.gameCode,
      advertiserId: target.advertiserId
    }))?.account || null : null;
  } catch {
    storedAccount = null;
  }
  const qiankunAccountRecordId = clean(target.qiankunAccountRecordId || storedAccount?.qiankun_account_record_id);
  const expectedAgentId = clean(target.qiankunAgentId || target.candidateAgentId || storedAccount?.qiankun_agent_id);
  const storedOwnerKey = clean(storedAccount?.qiankun_owner_key);
  const relationEvidenceArtifactId = mediaCandidateDiscoveryEvidenceId(target);

  if (!effectiveOwnerKey && !allowPendingOwnerKeyBootstrap) {
    blockers.push("owner_key_missing_or_ambiguous");
  }
  if (!qiankunAccountRecordId) blockers.push("qiankun_account_record_id_missing");

  const exactMonitorParams = {
    monitorId: target.historicalMonitorId,
    pageNo: 1,
    pageSize: 10
  };
  const exactMonitorFingerprint = requestFingerprint({
    endpoint: "/tf/ad/index",
    params: exactMonitorParams
  });
  const exactMonitorResult = blockers.length
    ? null
    : await client.queryMonitorIndex({ ownerKey: effectiveOwnerKey, params: exactMonitorParams });
  if (exactMonitorResult && exactMonitorResult.status !== "passed") {
    warnings.push(`historical_monitor_query_failed:${exactMonitorResult.apiCode || "unknown"}:${exactMonitorResult.apiMessage || "unknown"}`);
  }
  const exactRows = scopedMonitorRows(exactMonitorResult, target);
  if (exactMonitorResult?.status === "passed" && exactRows.length === 0) {
    warnings.push("historical_monitor_not_visible");
  }

  const scopedMonitorParams = {
    packageId: target.packageId,
    cateId: [target.cateId],
    vestId: [target.vestId],
    os: [target.os],
    channel: [target.channel],
    ssoOwner: effectiveOwnerKey ? [effectiveOwnerKey] : [],
    pageNo: 1,
    pageSize: 50
  };
  const scopedMonitorFingerprint = requestFingerprint({
    endpoint: "/tf/ad/index",
    params: {
      packageId: target.packageId,
      cateId: [target.cateId],
      vestId: [target.vestId],
      os: [target.os],
      channel: [target.channel],
      ssoOwnerPresent: Boolean(effectiveOwnerKey),
      pageNo: 1,
      pageSize: 50
    }
  });
  const scopedMonitorResult = blockers.length
    ? null
    : await client.queryMonitorIndex({ ownerKey: effectiveOwnerKey, params: scopedMonitorParams });
  if (scopedMonitorResult && scopedMonitorResult.status !== "passed") {
    blockers.push(`historical_monitor_scope_query_failed:${scopedMonitorResult.apiCode || "unknown"}:${scopedMonitorResult.apiMessage || "unknown"}`);
  }
  const scopedRows = scopedMonitorRows(scopedMonitorResult, target);

  const mediaListFingerprint = requestFingerprint({
    endpoint: SELECT_LIST_ENDPOINT,
    params: { type: "mediaList" }
  });
  const mediaListResult = blockers.length
    ? null
    : await client.querySelectList({ ownerKey: effectiveOwnerKey, type: "mediaList" });
  if (mediaListResult && mediaListResult.status !== "passed") {
    blockers.push(`media_list_query_failed:${mediaListResult.apiCode || "unknown"}:${mediaListResult.apiMessage || "unknown"}`);
  }
  const mediaItems = Array.isArray(mediaListResult?.summary?.list) ? mediaListResult.summary.list : [];
  const mediaOptions = mediaOptionMap(mediaItems);
  const allHistoricalRows = [...exactRows, ...scopedRows];
  const candidates = mediaCandidatesFromHistoricalRows({
    rows: allHistoricalRows,
    currentMediaById: mediaOptions.byId
  });

  if (mediaListResult?.status === "passed" && scopedMonitorResult?.status === "passed" && candidates.length === 0) {
    blockers.push("current_media_candidate_unresolved");
  }
  if (candidates.length > 3) {
    blockers.push(`current_media_candidate_ambiguous:${candidates.length}`);
  }

  const mediaValidationResults = [];
  if (candidates.length > 0 && candidates.length <= 3 && !blockers.some((item) => item.startsWith("historical_monitor_scope_query_failed") || item.startsWith("media_list_query_failed"))) {
    for (const candidate of candidates) {
      const mediaFingerprint = requestFingerprint({
        endpoint: CHANGE_MEDIA_ENDPOINT,
        params: { os: target.os, media_id: candidate.mediaId }
      });
      const mediaResult = await client.queryMediaInfo({
        ownerKey: effectiveOwnerKey,
        mediaId: candidate.mediaId,
        os: target.os
      });
      const accountOptions = optionListRelations(mediaResult?.summary?.accountIdList || []);
      const monitorApiOptions = optionListRelations(mediaResult?.summary?.monitorApiList || []);
      const targetAccountAllowed = accountOptions.relations.some((item) => item.childId === qiankunAccountRecordId);
      const historicalMonitorApis = new Set(candidate.monitorApis);
      const allowedHistoricalMonitorApis = monitorApiOptions.relations
        .filter((item) => !historicalMonitorApis.size || historicalMonitorApis.has(item.childId));
      const selectedMonitorApis = allowedHistoricalMonitorApis.length
        ? allowedHistoricalMonitorApis
        : monitorApiOptions.relations;
      const validation = {
        mediaId: candidate.mediaId,
        mediaName: candidate.mediaName,
        historicalMonitorCount: candidate.historicalMonitorCount,
        historicalMonitorApis: candidate.monitorApis,
        status: mediaResult.status,
        apiCode: mediaResult.apiCode || "",
        accountIdListReturned: mediaResult.summary?.fieldsPresent?.accountIdList === true,
        targetAccountAllowed,
        monitorApiListReturned: mediaResult.summary?.fieldsPresent?.monitorApiList === true,
        allowedMonitorApiCount: monitorApiOptions.relations.length,
        selectedMonitorApis: selectedMonitorApis.map((item) => item.childId),
        requestFingerprint: mediaFingerprint,
        responseHash: mediaResult.responseHash || ""
      };
      mediaValidationResults.push(validation);
      if (repo && mediaResult?.status === "passed" && targetAccountAllowed) {
        writes.push(await syncSingleRelation({
          repo,
          target,
          relationType: "media_to_allowed_account_record",
          os: target.os,
          parentType: "media",
          parentId: candidate.mediaId,
          parentName: candidate.mediaName,
          childType: "account_record",
          relations: relationFromValue(qiankunAccountRecordId),
          sourceEndpoint: CHANGE_MEDIA_ENDPOINT,
          requestFingerprint: mediaFingerprint,
          responseHash: mediaResult.responseHash,
          evidenceArtifactId: relationEvidenceArtifactId
        }));
      }
      if (repo && mediaResult?.status === "passed" && targetAccountAllowed && selectedMonitorApis.length) {
        writes.push(await syncSingleRelation({
          repo,
          target,
          relationType: "media_to_allowed_monitor_api",
          os: target.os,
          parentType: "media",
          parentId: candidate.mediaId,
          parentName: candidate.mediaName,
          childType: "monitor_api",
          relations: selectedMonitorApis,
          sourceEndpoint: CHANGE_MEDIA_ENDPOINT,
          requestFingerprint: mediaFingerprint,
          responseHash: mediaResult.responseHash,
          evidenceArtifactId: relationEvidenceArtifactId
        }));
      }
    }
  }

  const usableCandidates = mediaValidationResults.filter((item) => item.status === "passed" && item.targetAccountAllowed);
  if (candidates.length > 0 && candidates.length <= 3 && usableCandidates.length === 0) {
    blockers.push("target_qiankun_account_record_not_allowed_by_candidates");
  }
  if (usableCandidates.length > 1) {
    blockers.push(`media_candidate_ambiguous_after_account_validation:${usableCandidates.length}`);
  }

  let mediaAccountResult = null;
  let mediaAccountFingerprint = "";
  let returnedAccountAgentId = "";
  let returnedAccountAgentName = "";
  let accountAgentOptions = { relations: [] };
  let agentVerified = false;
  if (usableCandidates.length === 1 && !blockers.some((item) => item.includes("ambiguous_after_account_validation"))) {
    mediaAccountFingerprint = requestFingerprint({
      endpoint: CHANGE_MEDIA_ACCOUNT_ENDPOINT,
      params: { media_account_id_present: Boolean(qiankunAccountRecordId) }
    });
    mediaAccountResult = await client.queryMediaAccountInfo({
      ownerKey: effectiveOwnerKey,
      mediaAccountId: qiankunAccountRecordId
    });
    if (mediaAccountResult.status !== "passed") {
      blockers.push(`change_media_account_query_failed:${mediaAccountResult.apiCode || "unknown"}:${mediaAccountResult.apiMessage || "unknown"}`);
    }
    accountAgentOptions = optionListRelations(mediaAccountResult?.summary?.agentList || []);
    returnedAccountAgentId = clean(mediaAccountResult?.summary?.agentId);
    returnedAccountAgentName = clean(mediaAccountResult?.summary?.agentName || returnedAccountAgentId);
    const agentRelationCandidates = returnedAccountAgentId
      ? relationFromValue(returnedAccountAgentId, returnedAccountAgentName)
      : accountAgentOptions.relations;
    agentVerified = agentRelationCandidates.some((item) => item.childId === expectedAgentId);
    if (mediaAccountResult.status === "passed" && returnedAccountAgentId && returnedAccountAgentId !== expectedAgentId) {
      blockers.push("agent_id_mismatch");
    }
    if (mediaAccountResult.status === "passed" && !returnedAccountAgentId) {
      blockers.push("account_record_agent_not_returned");
    }
    if (repo && mediaAccountResult.status === "passed" && agentVerified) {
      writes.push(await syncSingleRelation({
        repo,
        target,
        relationType: "account_record_to_agent",
        os: target.os,
        parentType: "account_record",
        parentId: qiankunAccountRecordId,
        parentName: "",
        childType: "agent",
        relations: relationFromValue(expectedAgentId, returnedAccountAgentName || expectedAgentId),
        sourceEndpoint: CHANGE_MEDIA_ACCOUNT_ENDPOINT,
        requestFingerprint: mediaAccountFingerprint,
        responseHash: mediaAccountResult.responseHash,
        evidenceArtifactId: relationEvidenceArtifactId
      }));
      await repo.updateQiankunAccountIdentity({
        advertiserId: target.advertiserId,
        routeId: target.routeId,
        gameCode: target.gameCode,
        accountName: storedAccount?.account_name || target.advertiserId,
        authStatus: storedAccount?.auth_status || "unknown",
        platformStatus: storedAccount?.platform_status || "unknown",
        ownerName: storedAccount?.owner_name || "",
        qiankunAccountRecordId,
        qiankunOwnerKey: storedOwnerKey || effectiveOwnerKey,
        qiankunAgentId: expectedAgentId,
        qiankunIdentityStatus: "verified",
        qiankunVerifiedAt: verifiedAt
      });
    }
  }

  const uniqueReadyCandidate = usableCandidates.length === 1 && agentVerified
    ? usableCandidates[0]
    : null;
  const readinessCode = uniqueReadyCandidate
    ? "unique_media_combination_ready"
    : candidates.length === 0
      ? "current_media_candidate_unresolved"
      : "qiankun_media_candidate_unresolved";

  const publicSummary = {
    mode: "discover_media_candidates",
    target: {
      routeId: target.routeId,
      gameCode: target.gameCode,
      advertiserId: target.advertiserId,
      os: target.os,
      cateId: target.cateId,
      vestId: target.vestId,
      packageId: target.packageId,
      channel: target.channel,
      historicalMonitorId: target.historicalMonitorId,
      qiankunAccountRecordId,
      expectedAgentId
    },
    historicalMonitor: {
      exactQueryCalled: Boolean(exactMonitorResult),
      exactStatus: exactMonitorResult?.status || "skipped",
      exactApiCode: exactMonitorResult?.apiCode || "",
      exactResultTotal: Number(exactMonitorResult?.summary?.resultTotal || 0),
      exactRows: exactRows.slice(0, 3),
      scopedQueryCalled: Boolean(scopedMonitorResult),
      scopedStatus: scopedMonitorResult?.status || "skipped",
      scopedApiCode: scopedMonitorResult?.apiCode || "",
      scopedResultTotal: Number(scopedMonitorResult?.summary?.resultTotal || 0),
      scopedRowCount: scopedRows.length,
      scopedRowsWithInternalMediaId: scopedRows.filter((item) => item.sameScope && item.mediaIdPresent).length
    },
    mediaList: {
      called: Boolean(mediaListResult),
      status: mediaListResult?.status || "skipped",
      apiCode: mediaListResult?.apiCode || "",
      listCount: Number(mediaListResult?.summary?.listCount || 0),
      invalidItemCount: mediaOptions.invalidItems.length,
      duplicateMediaIdCount: mediaOptions.duplicateChildIds.length
    },
    candidates: {
      count: candidates.length,
      truncatedForValidation: candidates.length > 3,
      items: candidates.slice(0, 10)
    },
    validation: {
      changeMediaIdCallCount: mediaValidationResults.length,
      mediaResults: mediaValidationResults,
      usableCandidateCount: usableCandidates.length,
      changeMediaAccountIdCalled: Boolean(mediaAccountResult),
      mediaAccountStatus: mediaAccountResult?.status || "skipped",
      mediaAccountApiCode: mediaAccountResult?.apiCode || "",
      returnedAgentIdPresent: Boolean(returnedAccountAgentId),
      expectedAgentId,
      agentVerified
    },
    requestFingerprints: {
      exactMonitorIndex: exactMonitorFingerprint,
      scopedMonitorIndex: scopedMonitorFingerprint,
      mediaList: mediaListFingerprint,
      changeMediaAccount: mediaAccountFingerprint
    },
    responseHashes: {
      exactMonitorIndex: exactMonitorResult?.responseHash || "",
      scopedMonitorIndex: scopedMonitorResult?.responseHash || "",
      mediaList: mediaListResult?.responseHash || "",
      changeMediaAccount: mediaAccountResult?.responseHash || ""
    },
    readiness: {
      mediaCandidateDiscoveryReady: Boolean(uniqueReadyCandidate),
      readinessCode,
      uniqueCandidate: uniqueReadyCandidate ? {
        mediaId: uniqueReadyCandidate.mediaId,
        mediaName: uniqueReadyCandidate.mediaName,
        selectedMonitorApis: uniqueReadyCandidate.selectedMonitorApis
      } : null,
      monitorCreateBlockedUntilFinalReconcile: true
    },
    credential: {
      status: credential.status,
      ownerKeyPresent: Boolean(clean(effectiveOwnerKey)),
      pendingOwnerKeyBootstrap: allowPendingOwnerKeyBootstrap,
      credentialStorePresent: credential.credentialStorePresent,
      activeCredentialCount: credential.activeCredentialCount,
      pendingOwnerKeyCount: credential.pendingOwnerKeyCount
    },
    warnings,
    blockers,
    platformWriteCalled: false,
    rawRequestStored: false,
    rawResponseStored: false
  };
  const safeSummary = sanitizeForPublic(publicSummary);
  assertNoSensitiveLeak(safeSummary);
  const evidenceArtifactId = await upsertMediaCandidateDiscoveryEvidence({
    repo,
    target,
    summary: safeSummary
  });

  if (repo) {
    await repo.updateMonitorProvisionRunStatus({
      provisionId: monitorProvisionId(target),
      status: uniqueReadyCandidate ? "account_resolved" : "failed",
      requestFingerprint: hashValue({
        mode: "discover_media_candidates",
        target: {
          routeId: target.routeId,
          gameCode: target.gameCode,
          advertiserId: target.advertiserId,
          os: target.os,
          cateId: target.cateId,
          vestId: target.vestId,
          packageId: target.packageId,
          channel: target.channel,
          historicalMonitorId: target.historicalMonitorId,
          qiankunAccountRecordId
        }
      }),
      credentialStatus: credentialStatusForDatabase(credential),
      responseHash: mediaListResult?.responseHash || scopedMonitorResult?.responseHash || exactMonitorResult?.responseHash || "",
      errorSummary: uniqueReadyCandidate ? "" : `qiankun_media_candidate_unresolved:${blockers.join(";")}`,
      evidenceArtifactId
    });
  }

  const output = {
    ...safeSummary,
    status: uniqueReadyCandidate ? "passed" : "blocked",
    evidenceArtifactId,
    writes: {
      accountIdentityVerified: agentVerified,
      relationRowsWritten: writes.some((item) => item.inputCount > 0),
      relationTypesWritten: writes.filter((item) => item.inputCount > 0).map((item) => item.relationType),
      relationWriteResults: writes
    }
  };
  assertNoSensitiveLeak(output);
  return output;
}

export async function runQiankunLevel3MediaResourceReadonlySync({
  repo,
  ownerKey = "",
  target = QIANKUN_LEVEL3_MEDIA_RESOURCE_TARGET,
  retryOnce = false,
  env = process.env
} = {}) {
  const retryMode = retryOnce === true;
  const initialCredential = redactedQiankunCredentialStatus({ ownerKey });
  const effectiveOwnerKey = selectedOwnerKey(ownerKey, initialCredential);
  const credential = redactedQiankunCredentialStatus({ ownerKey: effectiveOwnerKey });
  const allowPendingOwnerKeyBootstrap = !clean(effectiveOwnerKey) && initialCredential.pendingOwnerKeyCount === 1;
  const client = createQiankunMonitorClient({
    allowPendingOwnerKeyBootstrap,
    pendingOwnerKeyBootstrapEndpoints: retryMode ? [
      CHANGE_MEDIA_ENDPOINT,
      CHANGE_MEDIA_ACCOUNT_ENDPOINT
    ] : [
      ACCOUNT_INDEX_ENDPOINT,
      "/tf/ad/index",
      CHANGE_MEDIA_ENDPOINT,
      CHANGE_MEDIA_ACCOUNT_ENDPOINT
    ]
  });
  const blockers = [];
  const warnings = [];
  const writes = [];
  const verifiedAt = new Date().toISOString();
  const mediaResourceId = clean(target.mediaResourceId || target.candidateMediaId);
  const expectedAccountRecordId = clean(target.qiankunAccountRecordId);
  const expectedAgentId = clean(target.expectedAgentId || target.qiankunAgentId || target.candidateAgentId);
  const expectedMonitorApi = clean(target.expectedMonitorApi || target.candidateMonitorApi);
  const evidenceArtifactId = level3MediaResourceEvidenceId(target, retryMode ? "R02" : "");

  if (!mediaResourceId) blockers.push("level3_media_resource_id_missing");
  if (!expectedAccountRecordId) blockers.push("qiankun_account_record_id_missing");
  if (!expectedAgentId) blockers.push("expected_agent_id_missing");

  if (retryMode) {
    const confirmValuePresent = env[QIANKUN_LEVEL3_MEDIA_RETRY_CONFIRM_ENV] === QIANKUN_LEVEL3_MEDIA_RETRY_CONFIRM_VALUE;
    if (!confirmValuePresent) {
      const output = {
        status: "blocked",
        mode: "sync_level3_media_resource",
        retryOnce: true,
        target: {
          routeId: target.routeId,
          gameCode: target.gameCode,
          advertiserId: target.advertiserId,
          os: target.os,
          mediaResourceId,
          qiankunAccountRecordId: expectedAccountRecordId,
          expectedAgentId,
          expectedMonitorApi
        },
        confirmation: {
          requiredEnv: QIANKUN_LEVEL3_MEDIA_RETRY_CONFIRM_ENV,
          expectedValue: QIANKUN_LEVEL3_MEDIA_RETRY_CONFIRM_VALUE,
          present: false
        },
        externalCalls: {
          accountIndex: false,
          historicalMonitorIndex: false,
          mediaList: false,
          changeMediaId: false,
          changeMediaAccountId: false,
          monitorSerialNumberAdd: false
        },
        blockers: ["level3_media_retry_confirm_missing_or_invalid"],
        rawRequestStored: false,
        rawResponseStored: false
      };
      const safe = sanitizeForPublic(output);
      assertNoSensitiveLeak(safe);
      return safe;
    }

    if (!allowPendingOwnerKeyBootstrap && credential.status !== "active") {
      blockers.push(`credential_not_active:${credential.status}`);
    }

    const mediaFingerprint = requestFingerprint({
      endpoint: CHANGE_MEDIA_ENDPOINT,
      params: { os: target.os, media_id: mediaResourceId }
    });
    let mediaResult = null;
    if (blockers.length === 0) {
      mediaResult = await client.queryMediaInfo({
        ownerKey: effectiveOwnerKey,
        mediaId: mediaResourceId,
        os: target.os
      });
      if (mediaResult.status !== "passed") {
        blockers.push(`change_media_query_failed:${mediaResult.apiCode || "unknown"}:${mediaResult.apiMessage || "unknown"}`);
      }
    }

    const accountOptions = optionListRelations(mediaResult?.summary?.accountIdList || []);
    const monitorApiOptions = optionListRelations(mediaResult?.summary?.monitorApiList || []);
    const targetAccountAllowed = accountOptions.relations.some((item) => item.childId === expectedAccountRecordId);
    const expectedMonitorApiAllowed = expectedMonitorApi
      ? monitorApiOptions.relations.some((item) => item.childId === expectedMonitorApi)
      : monitorApiOptions.relations.length > 0;

    if (mediaResult?.status === "passed" && mediaResult.summary?.fieldsPresent?.accountIdList !== true) {
      blockers.push("media_resource_account_id_list_not_returned");
    }
    if (mediaResult?.status === "passed" && mediaResult.summary?.fieldsPresent?.accountIdList === true && !targetAccountAllowed) {
      blockers.push("level3_media_resource_not_available_for_target_account");
    }
    if (mediaResult?.status === "passed" && mediaResult.summary?.fieldsPresent?.monitorApiList !== true) {
      blockers.push("media_resource_monitor_api_list_not_returned");
    }
    if (mediaResult?.status === "passed" && mediaResult.summary?.fieldsPresent?.monitorApiList === true && !expectedMonitorApiAllowed) {
      blockers.push("expected_monitor_api_not_allowed_by_media_resource");
    }

    const writes = [];
    if (repo && mediaResult?.status === "passed" && targetAccountAllowed) {
      writes.push(await syncSingleRelation({
        repo,
        target,
        relationType: "media_resource_to_allowed_account_record",
        os: target.os,
        parentType: "media_resource",
        parentId: mediaResourceId,
        parentName: mediaResult.summary?.mediaName || "",
        childType: "account_record",
        relations: relationFromValue(expectedAccountRecordId),
        sourceEndpoint: CHANGE_MEDIA_ENDPOINT,
        requestFingerprint: mediaFingerprint,
        responseHash: mediaResult.responseHash,
        evidenceArtifactId
      }));
    }
    if (repo && mediaResult?.status === "passed" && targetAccountAllowed && monitorApiOptions.relations.length) {
      writes.push(await syncSingleRelation({
        repo,
        target,
        relationType: "media_resource_to_allowed_monitor_api",
        os: target.os,
        parentType: "media_resource",
        parentId: mediaResourceId,
        parentName: mediaResult.summary?.mediaName || "",
        childType: "monitor_api",
        relations: monitorApiOptions.relations,
        sourceEndpoint: CHANGE_MEDIA_ENDPOINT,
        requestFingerprint: mediaFingerprint,
        responseHash: mediaResult.responseHash,
        evidenceArtifactId
      }));
    }

    let mediaAccountResult = null;
    let mediaAccountFingerprint = "";
    let returnedAccountAgentId = "";
    let agentVerified = false;
    if (targetAccountAllowed && expectedMonitorApiAllowed && blockers.length === 0) {
      mediaAccountFingerprint = requestFingerprint({
        endpoint: CHANGE_MEDIA_ACCOUNT_ENDPOINT,
        params: { media_account_id: expectedAccountRecordId }
      });
      mediaAccountResult = await client.queryMediaAccountInfo({
        ownerKey: effectiveOwnerKey,
        mediaAccountId: expectedAccountRecordId
      });
      if (mediaAccountResult.status !== "passed") {
        blockers.push(`change_media_account_query_failed:${mediaAccountResult.apiCode || "unknown"}:${mediaAccountResult.apiMessage || "unknown"}`);
      }
      returnedAccountAgentId = clean(mediaAccountResult?.summary?.agentId);
      const accountAgentOptions = optionListRelations(mediaAccountResult?.summary?.agentList || []);
      const agentRelations = returnedAccountAgentId
        ? relationFromValue(returnedAccountAgentId, mediaAccountResult?.summary?.agentName || returnedAccountAgentId)
        : accountAgentOptions.relations;
      agentVerified = agentRelations.some((item) => item.childId === expectedAgentId);
      if (mediaAccountResult.status === "passed" && returnedAccountAgentId && returnedAccountAgentId !== expectedAgentId) {
        blockers.push("agent_id_mismatch");
      }
      if (mediaAccountResult.status === "passed" && !returnedAccountAgentId) {
        blockers.push("account_record_agent_not_returned");
      }
      if (repo && mediaAccountResult.status === "passed" && agentVerified) {
        writes.push(await syncSingleRelation({
          repo,
          target,
          relationType: "account_record_to_agent",
          os: target.os,
          parentType: "account_record",
          parentId: expectedAccountRecordId,
          childType: "agent",
          relations: relationFromValue(expectedAgentId, mediaAccountResult?.summary?.agentName || expectedAgentId),
          sourceEndpoint: CHANGE_MEDIA_ACCOUNT_ENDPOINT,
          requestFingerprint: mediaAccountFingerprint,
          responseHash: mediaAccountResult.responseHash,
          evidenceArtifactId
        }));
      }
    }

    const ready = [
      mediaResult?.status === "passed",
      targetAccountAllowed,
      expectedMonitorApiAllowed,
      mediaAccountResult?.status === "passed",
      agentVerified
    ].every(Boolean);
    const publicSummary = {
      mode: "sync_level3_media_resource",
      retryOnce: true,
      target: {
        routeId: target.routeId,
        gameCode: target.gameCode,
        advertiserId: target.advertiserId,
        os: target.os,
        channel: target.channel,
        historicalMonitorId: target.historicalMonitorId,
        mediaResourceId,
        qiankunAccountRecordId: expectedAccountRecordId,
        expectedAgentId,
        expectedMonitorApi
      },
      semantics: {
        osMeaning: "qiankun_mini_game_technical_system_type",
        businessMeaningDecision: "platform_media_mediaId_monitorApi_channel_combined",
        routeBusinessInterpretation: "oceanengine_toutiao_wxgame_dymini3k"
      },
      mediaResource: {
        called: Boolean(mediaResult),
        status: mediaResult?.status || "skipped",
        apiCode: mediaResult?.apiCode || "",
        apiMessage: mediaResult?.apiMessage || "",
        accountIdListReturned: mediaResult?.summary?.fieldsPresent?.accountIdList === true,
        allowedAccountRecordCount: accountOptions.relations.length,
        targetAccountAllowed,
        monitorApiListReturned: mediaResult?.summary?.fieldsPresent?.monitorApiList === true,
        allowedMonitorApiCount: monitorApiOptions.relations.length,
        expectedMonitorApiAllowed
      },
      mediaAccount: {
        called: Boolean(mediaAccountResult),
        status: mediaAccountResult?.status || "skipped",
        apiCode: mediaAccountResult?.apiCode || "",
        returnedAgentIdPresent: Boolean(returnedAccountAgentId),
        agentVerified
      },
      externalCalls: {
        accountIndex: false,
        historicalMonitorIndex: false,
        mediaList: false,
        changeMediaId: Boolean(mediaResult),
        changeMediaAccountId: Boolean(mediaAccountResult),
        monitorSerialNumberAdd: false
      },
      requestFingerprints: {
        changeMediaId: mediaFingerprint,
        changeMediaAccountId: mediaAccountFingerprint
      },
      responseHashes: {
        changeMediaId: mediaResult?.responseHash || "",
        changeMediaAccountId: mediaAccountResult?.responseHash || ""
      },
      readiness: {
        level3MediaResourceReady: ready,
        readinessCode: ready
          ? "level3_media_resource_verified"
          : targetAccountAllowed === false && mediaResult?.status === "passed"
            ? "level3_media_resource_not_available_for_target_account"
            : "level3_media_resource_not_available",
        monitorCreateBlockedUntilFinalReconcile: true
      },
      credential: {
        status: credential.status,
        ownerKeyPresent: Boolean(clean(effectiveOwnerKey)),
        pendingOwnerKeyBootstrap: allowPendingOwnerKeyBootstrap,
        credentialStorePresent: credential.credentialStorePresent,
        activeCredentialCount: credential.activeCredentialCount,
        pendingOwnerKeyCount: credential.pendingOwnerKeyCount
      },
      warnings,
      blockers,
      monitorProvisionRunUpdated: false,
      platformWriteCalled: false,
      rawRequestStored: false,
      rawResponseStored: false
    };
    const safeSummary = sanitizeForPublic(publicSummary);
    assertNoSensitiveLeak(safeSummary);
    await upsertLevel3MediaResourceEvidence({
      repo,
      target,
      summary: safeSummary,
      artifactId: evidenceArtifactId,
      sourceRef: mediaAccountResult
        ? `qiankun:${CHANGE_MEDIA_ENDPOINT}+${CHANGE_MEDIA_ACCOUNT_ENDPOINT}`
        : `qiankun:${CHANGE_MEDIA_ENDPOINT}`
    });
    const output = {
      ...safeSummary,
      status: ready ? "passed" : "blocked",
      evidenceArtifactId,
      writes: {
        relationRowsWritten: writes.some((item) => item.inputCount > 0),
        relationTypesWritten: writes.filter((item) => item.inputCount > 0).map((item) => item.relationType),
        relationWriteResults: writes
      }
    };
    assertNoSensitiveLeak(output);
    return output;
  }

  const accountFingerprint = requestFingerprint({
    endpoint: ACCOUNT_INDEX_ENDPOINT,
    params: { accountId: target.advertiserId, pageNo: 1, pageSize: 10 }
  });
  const accountResult = blockers.length
    ? null
    : await client.queryAccountIndex({
      ownerKey: effectiveOwnerKey,
      accountId: target.advertiserId,
      pageNo: 1,
      pageSize: 10
    });
  if (accountResult && accountResult.status !== "passed") {
    blockers.push(`account_index_query_failed:${accountResult.apiCode || "unknown"}:${accountResult.apiMessage || "unknown"}`);
  }
  const accountRows = exactAccountRows(accountResult, target.advertiserId);
  if (accountResult?.status === "passed" && accountRows.length !== 1) {
    blockers.push(`account_index_exact_match_count:${accountRows.length}`);
  }
  const accountRow = accountRows[0] || {};
  const qiankunAccountRecordId = clean(accountRow.mediaAccountRecordId || accountRow.id || expectedAccountRecordId);
  const qiankunOwnerKey = clean(accountRow.ssoOwnerKey || accountRow.ssoOwner || effectiveOwnerKey);
  const accountAgentId = clean(accountRow.agentId);
  const mediaMasterId = clean(accountRow.mediaMasterId);
  const mediaMasterName = clean(accountRow.mediaMasterName);
  if (accountRows.length === 1 && qiankunAccountRecordId !== expectedAccountRecordId) {
    blockers.push("qiankun_account_record_id_mismatch");
  }
  if (accountRows.length === 1 && !mediaMasterId) {
    warnings.push("account_index_media_master_id_not_returned");
  }
  if (repo && accountRows.length === 1 && qiankunAccountRecordId && qiankunOwnerKey) {
    await repo.updateQiankunAccountIdentity({
      advertiserId: target.advertiserId,
      routeId: target.routeId,
      gameCode: target.gameCode,
      accountName: accountRow.advertiserName || target.advertiserId,
      authStatus: accountRow.authStatusName || "unknown",
      platformStatus: accountRow.status || "unknown",
      ownerName: accountRow.ssoOwnerName || accountRow.ssoOwner || "",
      qiankunAccountRecordId,
      qiankunOwnerKey,
      qiankunAgentId: accountAgentId || expectedAgentId,
      qiankunMediaMasterId: mediaMasterId,
      qiankunMediaMasterName: mediaMasterName,
      qiankunIdentityStatus: "observed",
      qiankunVerifiedAt: verifiedAt
    });
  }

  const historicalMonitorParams = {
    monitorId: target.historicalMonitorId,
    pageNo: 1,
    pageSize: 10
  };
  const historicalMonitorFingerprint = requestFingerprint({
    endpoint: "/tf/ad/index",
    params: historicalMonitorParams
  });
  const historicalMonitorResult = blockers.length
    ? null
    : await client.queryMonitorIndex({
      ownerKey: effectiveOwnerKey,
      params: historicalMonitorParams
    });
  if (historicalMonitorResult && historicalMonitorResult.status !== "passed") {
    blockers.push(`historical_monitor_query_failed:${historicalMonitorResult.apiCode || "unknown"}:${historicalMonitorResult.apiMessage || "unknown"}`);
  }
  const historicalRows = scopedMonitorRows(historicalMonitorResult, target);
  const historicalMediaResourceRows = historicalRows.filter((item) => clean(item.mediaId) === mediaResourceId);
  if (historicalMonitorResult?.status === "passed" && historicalMediaResourceRows.length === 0) {
    blockers.push("historical_level3_media_resource_not_visible");
  }
  const historicalMonitorApiMatched = !expectedMonitorApi ||
    historicalMediaResourceRows.some((item) => clean(item.monitorApi) === expectedMonitorApi);
  if (historicalMediaResourceRows.length && !historicalMonitorApiMatched) {
    warnings.push("historical_monitor_api_differs_from_expected");
  }

  const mediaFingerprint = requestFingerprint({
    endpoint: CHANGE_MEDIA_ENDPOINT,
    params: { os: target.os, media_id: mediaResourceId }
  });
  const mediaResult = blockers.length
    ? null
    : await client.queryMediaInfo({
      ownerKey: effectiveOwnerKey,
      mediaId: mediaResourceId,
      os: target.os
    });
  if (mediaResult && mediaResult.status !== "passed") {
    blockers.push(`change_media_query_failed:${mediaResult.apiCode || "unknown"}:${mediaResult.apiMessage || "unknown"}`);
  }
  const accountOptions = optionListRelations(mediaResult?.summary?.accountIdList || []);
  const monitorApiOptions = optionListRelations(mediaResult?.summary?.monitorApiList || []);
  const targetAccountAllowed = accountOptions.relations.some((item) => item.childId === expectedAccountRecordId);
  const expectedMonitorApiAllowed = expectedMonitorApi
    ? monitorApiOptions.relations.some((item) => item.childId === expectedMonitorApi)
    : monitorApiOptions.relations.length > 0;
  if (mediaResult?.status === "passed" && mediaResult.summary?.fieldsPresent?.accountIdList !== true) {
    blockers.push("media_resource_account_id_list_not_returned");
  }
  if (mediaResult?.status === "passed" && mediaResult.summary?.fieldsPresent?.accountIdList === true && !targetAccountAllowed) {
    blockers.push("level3_media_resource_not_available_for_target_account");
  }
  if (mediaResult?.status === "passed" && mediaResult.summary?.fieldsPresent?.monitorApiList !== true) {
    blockers.push("media_resource_monitor_api_list_not_returned");
  }
  if (mediaResult?.status === "passed" && mediaResult.summary?.fieldsPresent?.monitorApiList === true && !expectedMonitorApiAllowed) {
    blockers.push("expected_monitor_api_not_allowed_by_media_resource");
  }
  if (repo && mediaResult?.status === "passed" && targetAccountAllowed) {
    writes.push(await syncSingleRelation({
      repo,
      target,
      relationType: "media_resource_to_allowed_account_record",
      os: target.os,
      parentType: "media_resource",
      parentId: mediaResourceId,
      parentName: mediaResult.summary?.mediaName || historicalMediaResourceRows[0]?.mediaName || "",
      childType: "account_record",
      relations: relationFromValue(expectedAccountRecordId),
      sourceEndpoint: CHANGE_MEDIA_ENDPOINT,
      requestFingerprint: mediaFingerprint,
      responseHash: mediaResult.responseHash,
      evidenceArtifactId
    }));
  }
  if (repo && mediaResult?.status === "passed" && targetAccountAllowed && monitorApiOptions.relations.length) {
    writes.push(await syncSingleRelation({
      repo,
      target,
      relationType: "media_resource_to_allowed_monitor_api",
      os: target.os,
      parentType: "media_resource",
      parentId: mediaResourceId,
      parentName: mediaResult.summary?.mediaName || historicalMediaResourceRows[0]?.mediaName || "",
      childType: "monitor_api",
      relations: monitorApiOptions.relations,
      sourceEndpoint: CHANGE_MEDIA_ENDPOINT,
      requestFingerprint: mediaFingerprint,
      responseHash: mediaResult.responseHash,
      evidenceArtifactId
    }));
  }

  let mediaAccountResult = null;
  let mediaAccountFingerprint = "";
  let returnedAccountAgentId = "";
  let agentVerified = false;
  if (targetAccountAllowed && blockers.length === 0) {
    mediaAccountFingerprint = requestFingerprint({
      endpoint: CHANGE_MEDIA_ACCOUNT_ENDPOINT,
      params: { media_account_id_present: Boolean(expectedAccountRecordId) }
    });
    mediaAccountResult = await client.queryMediaAccountInfo({
      ownerKey: effectiveOwnerKey,
      mediaAccountId: expectedAccountRecordId
    });
    if (mediaAccountResult.status !== "passed") {
      blockers.push(`change_media_account_query_failed:${mediaAccountResult.apiCode || "unknown"}:${mediaAccountResult.apiMessage || "unknown"}`);
    }
    returnedAccountAgentId = clean(mediaAccountResult?.summary?.agentId);
    const accountAgentOptions = optionListRelations(mediaAccountResult?.summary?.agentList || []);
    const agentRelations = returnedAccountAgentId
      ? relationFromValue(returnedAccountAgentId, mediaAccountResult?.summary?.agentName || returnedAccountAgentId)
      : accountAgentOptions.relations;
    agentVerified = agentRelations.some((item) => item.childId === expectedAgentId);
    if (mediaAccountResult.status === "passed" && returnedAccountAgentId && returnedAccountAgentId !== expectedAgentId) {
      blockers.push("agent_id_mismatch");
    }
    if (mediaAccountResult.status === "passed" && !returnedAccountAgentId) {
      blockers.push("account_record_agent_not_returned");
    }
    if (repo && mediaAccountResult.status === "passed" && agentVerified) {
      writes.push(await syncSingleRelation({
        repo,
        target,
        relationType: "account_record_to_agent",
        os: target.os,
        parentType: "account_record",
        parentId: expectedAccountRecordId,
        childType: "agent",
        relations: relationFromValue(expectedAgentId, mediaAccountResult?.summary?.agentName || expectedAgentId),
        sourceEndpoint: CHANGE_MEDIA_ACCOUNT_ENDPOINT,
        requestFingerprint: mediaAccountFingerprint,
        responseHash: mediaAccountResult.responseHash,
        evidenceArtifactId
      }));
      await repo.updateQiankunAccountIdentity({
        advertiserId: target.advertiserId,
        routeId: target.routeId,
        gameCode: target.gameCode,
        accountName: accountRow.advertiserName || target.advertiserId,
        authStatus: accountRow.authStatusName || "unknown",
        platformStatus: accountRow.status || "unknown",
        ownerName: accountRow.ssoOwnerName || accountRow.ssoOwner || "",
        qiankunAccountRecordId: expectedAccountRecordId,
        qiankunOwnerKey,
        qiankunAgentId: expectedAgentId,
        qiankunMediaMasterId: mediaMasterId,
        qiankunMediaMasterName: mediaMasterName,
        qiankunIdentityStatus: "verified",
        qiankunVerifiedAt: verifiedAt
      });
    }
  }

  const ready = [
    accountRows.length === 1,
    qiankunAccountRecordId === expectedAccountRecordId,
    historicalMediaResourceRows.length > 0,
    mediaResult?.status === "passed",
    targetAccountAllowed,
    expectedMonitorApiAllowed,
    mediaAccountResult?.status === "passed",
    agentVerified
  ].every(Boolean);

  const publicSummary = {
    mode: "sync_level3_media_resource",
    target: {
      routeId: target.routeId,
      gameCode: target.gameCode,
      advertiserId: target.advertiserId,
      os: target.os,
      historicalMonitorId: target.historicalMonitorId,
      mediaResourceId,
      qiankunAccountRecordId: expectedAccountRecordId,
      expectedAgentId,
      expectedMonitorApi
    },
    account: {
      called: Boolean(accountResult),
      status: accountResult?.status || "skipped",
      apiCode: accountResult?.apiCode || "",
      exactMatchCount: accountRows.length,
      qiankunAccountRecordIdPresent: Boolean(qiankunAccountRecordId),
      mediaMasterIdPresent: Boolean(mediaMasterId),
      mediaMasterNamePresent: Boolean(mediaMasterName),
      agentIdPresent: Boolean(accountAgentId)
    },
    historicalMonitor: {
      called: Boolean(historicalMonitorResult),
      status: historicalMonitorResult?.status || "skipped",
      apiCode: historicalMonitorResult?.apiCode || "",
      resultTotal: Number(historicalMonitorResult?.summary?.resultTotal || 0),
      mediaResourceIdFound: historicalMediaResourceRows.length > 0,
      matchedRows: historicalMediaResourceRows.slice(0, 3)
    },
    mediaResource: {
      called: Boolean(mediaResult),
      status: mediaResult?.status || "skipped",
      apiCode: mediaResult?.apiCode || "",
      accountIdListReturned: mediaResult?.summary?.fieldsPresent?.accountIdList === true,
      allowedAccountRecordCount: accountOptions.relations.length,
      targetAccountAllowed,
      monitorApiListReturned: mediaResult?.summary?.fieldsPresent?.monitorApiList === true,
      allowedMonitorApiCount: monitorApiOptions.relations.length,
      expectedMonitorApiAllowed
    },
    mediaAccount: {
      called: Boolean(mediaAccountResult),
      status: mediaAccountResult?.status || "skipped",
      apiCode: mediaAccountResult?.apiCode || "",
      returnedAgentIdPresent: Boolean(returnedAccountAgentId),
      agentVerified
    },
    requestFingerprints: {
      accountIndex: accountFingerprint,
      historicalMonitorIndex: historicalMonitorFingerprint,
      changeMediaId: mediaFingerprint,
      changeMediaAccountId: mediaAccountFingerprint
    },
    responseHashes: {
      accountIndex: accountResult?.responseHash || "",
      historicalMonitorIndex: historicalMonitorResult?.responseHash || "",
      changeMediaId: mediaResult?.responseHash || "",
      changeMediaAccountId: mediaAccountResult?.responseHash || ""
    },
    readiness: {
      level3MediaResourceReady: ready,
      readinessCode: ready ? "level3_media_resource_verified" : "level3_media_resource_not_available",
      monitorCreateBlockedUntilFinalReconcile: true
    },
    credential: {
      status: credential.status,
      ownerKeyPresent: Boolean(clean(effectiveOwnerKey)),
      pendingOwnerKeyBootstrap: allowPendingOwnerKeyBootstrap,
      credentialStorePresent: credential.credentialStorePresent,
      activeCredentialCount: credential.activeCredentialCount,
      pendingOwnerKeyCount: credential.pendingOwnerKeyCount
    },
    warnings,
    blockers,
    platformWriteCalled: false,
    rawRequestStored: false,
    rawResponseStored: false
  };
  const safeSummary = sanitizeForPublic(publicSummary);
  assertNoSensitiveLeak(safeSummary);
  await upsertLevel3MediaResourceEvidence({ repo, target, summary: safeSummary });

  const output = {
    ...safeSummary,
    status: ready ? "passed" : "blocked",
    evidenceArtifactId,
    writes: {
      accountIdentityWritten: Boolean(repo && accountRows.length === 1 && qiankunAccountRecordId),
      accountIdentityVerified: agentVerified,
      monitorProvisionRunUpdated: false,
      relationRowsWritten: writes.some((item) => item.inputCount > 0),
      relationTypesWritten: writes.filter((item) => item.inputCount > 0).map((item) => item.relationType),
      relationWriteResults: writes
    }
  };
  assertNoSensitiveLeak(output);
  return output;
}

export async function runQiankunMonitorTechnicalCombinationReadonlySync({
  repo,
  ownerKey = "",
  target = QIANKUN_MONITOR_TECHNICAL_COMBINATION_TARGET
} = {}) {
  const initialCredential = redactedQiankunCredentialStatus({ ownerKey });
  const effectiveOwnerKey = selectedOwnerKey(ownerKey, initialCredential);
  const credential = redactedQiankunCredentialStatus({ ownerKey: effectiveOwnerKey });
  const allowPendingOwnerKeyBootstrap = !clean(effectiveOwnerKey) && initialCredential.pendingOwnerKeyCount === 1;
  const client = createQiankunMonitorClient({
    allowPendingOwnerKeyBootstrap,
    pendingOwnerKeyBootstrapEndpoints: [
      ACCOUNT_INDEX_ENDPOINT,
      SELECT_LIST_ENDPOINT,
      CHANGE_MEDIA_ENDPOINT,
      CHANGE_MEDIA_ACCOUNT_ENDPOINT
    ]
  });
  const blockers = [];
  const warnings = [];
  const writes = [];
  const verifiedAt = new Date().toISOString();

  const accountFingerprint = requestFingerprint({
    endpoint: ACCOUNT_INDEX_ENDPOINT,
    params: { accountId: target.advertiserId, pageNo: 1, pageSize: 10 }
  });
  const accountResult = await client.queryAccountIndex({
    ownerKey: effectiveOwnerKey,
    accountId: target.advertiserId,
    pageNo: 1,
    pageSize: 10
  });
  if (accountResult.status !== "passed") {
    blockers.push(`account_index_query_failed:${accountResult.apiCode || "unknown"}:${accountResult.apiMessage || "unknown"}`);
  }
  const accountRows = exactAccountRows(accountResult, target.advertiserId);
  if (accountResult.status === "passed" && accountRows.length !== 1) {
    blockers.push(`account_index_exact_match_count:${accountRows.length}`);
  }
  const accountRow = accountRows[0] || {};
  const qiankunAccountRecordId = clean(accountRow.mediaAccountRecordId || accountRow.id);
  const qiankunOwnerKey = clean(accountRow.ssoOwnerKey || accountRow.ssoOwner || effectiveOwnerKey);
  const accountAgentId = clean(accountRow.agentId);
  if (accountRows.length === 1 && !qiankunAccountRecordId) blockers.push("qiankun_account_record_id_missing");
  if (accountRows.length === 1 && !qiankunOwnerKey) blockers.push("qiankun_owner_key_missing");

  if (repo && accountRows.length === 1 && qiankunAccountRecordId && qiankunOwnerKey) {
    await repo.updateQiankunAccountIdentity({
      advertiserId: target.advertiserId,
      routeId: target.routeId,
      gameCode: target.gameCode,
      accountName: accountRow.advertiserName || target.advertiserId,
      authStatus: accountRow.authStatusName || "unknown",
      platformStatus: accountRow.status || "unknown",
      ownerName: accountRow.ssoOwnerName || accountRow.ssoOwner || "",
      qiankunAccountRecordId,
      qiankunOwnerKey,
      qiankunAgentId: accountAgentId,
      qiankunIdentityStatus: "observed",
      qiankunVerifiedAt: verifiedAt
    });
  }

  const cateFingerprint = requestFingerprint({
    endpoint: SELECT_LIST_ENDPOINT,
    params: { type: "cateList" }
  });
  const cateListResult = blockers.length
    ? null
    : await client.querySelectList({ ownerKey: effectiveOwnerKey, type: "cateList" });
  const cateItems = Array.isArray(cateListResult?.summary?.list) ? cateListResult.summary.list : [];
  const cateOptions = normalizeOptionList(cateItems);
  const cateMatch = findOptionByValue(cateItems, target.cateId);
  const cateUniqueMatch = cateOptions.normalized.filter((item) => item.childId === clean(target.cateId)).length === 1;
  if (cateListResult && cateListResult.status !== "passed") {
    warnings.push(`cate_list_query_failed:${cateListResult.apiCode || "unknown"}:${cateListResult.apiMessage || "unknown"}`);
  }
  if (cateListResult?.status === "passed" && !cateUniqueMatch) warnings.push("cate_id_not_uniquely_confirmed_from_select_list");

  const mediaListFingerprint = requestFingerprint({
    endpoint: SELECT_LIST_ENDPOINT,
    params: { type: "mediaList" }
  });
  const mediaListResult = blockers.length
    ? null
    : await client.querySelectList({ ownerKey: effectiveOwnerKey, type: "mediaList" });
  const mediaItems = Array.isArray(mediaListResult?.summary?.list) ? mediaListResult.summary.list : [];
  const mediaOptions = normalizeOptionList(mediaItems);
  const mediaMatch = findOptionByValue(mediaItems, target.candidateMediaId);
  const mediaCandidatePresent = mediaOptions.normalized.some((item) => item.childId === clean(target.candidateMediaId));
  if (mediaListResult && mediaListResult.status !== "passed") {
    blockers.push(`media_list_query_failed:${mediaListResult.apiCode || "unknown"}:${mediaListResult.apiMessage || "unknown"}`);
  }
  if (mediaListResult?.status === "passed" && !mediaCandidatePresent) {
    blockers.push("candidate_media_id_not_returned");
  }

  const mediaFingerprint = requestFingerprint({
    endpoint: CHANGE_MEDIA_ENDPOINT,
    params: { os: target.os, media_id: target.candidateMediaId }
  });
  const mediaResult = blockers.length
    ? null
    : await client.queryMediaInfo({
      ownerKey: effectiveOwnerKey,
      mediaId: target.candidateMediaId,
      os: target.os
    });
  if (mediaResult && mediaResult.status !== "passed") {
    blockers.push(`change_media_query_failed:${mediaResult.apiCode || "unknown"}:${mediaResult.apiMessage || "unknown"}`);
  }
  const accountOptions = optionListRelations(mediaResult?.summary?.accountIdList || []);
  const monitorApiOptions = optionListRelations(mediaResult?.summary?.monitorApiList || []);
  const targetAccountAllowed = accountOptions.relations.some((item) => item.childId === qiankunAccountRecordId);
  const candidateMonitorApiAllowed = monitorApiOptions.relations.some((item) => item.childId === clean(target.candidateMonitorApi));
  if (mediaResult?.status === "passed" && mediaResult.summary?.fieldsPresent?.accountIdList !== true) {
    blockers.push("media_account_id_list_not_returned");
  }
  if (mediaResult?.status === "passed" && mediaResult.summary?.fieldsPresent?.accountIdList === true && !targetAccountAllowed) {
    blockers.push("target_qiankun_account_record_not_allowed_by_media");
  }
  if (mediaResult?.status === "passed" && mediaResult.summary?.fieldsPresent?.monitorApiList !== true) {
    blockers.push("media_monitor_api_list_not_returned");
  }
  if (mediaResult?.status === "passed" && mediaResult.summary?.fieldsPresent?.monitorApiList === true && !candidateMonitorApiAllowed) {
    blockers.push("candidate_monitor_api_not_allowed_by_media");
  }

  const mediaAccountFingerprint = requestFingerprint({
    endpoint: CHANGE_MEDIA_ACCOUNT_ENDPOINT,
    params: { media_account_id_present: Boolean(qiankunAccountRecordId) }
  });
  const mediaAccountResult = blockers.length
    ? null
    : await client.queryMediaAccountInfo({
      ownerKey: effectiveOwnerKey,
      mediaAccountId: qiankunAccountRecordId
    });
  if (mediaAccountResult && mediaAccountResult.status !== "passed") {
    blockers.push(`change_media_account_query_failed:${mediaAccountResult.apiCode || "unknown"}:${mediaAccountResult.apiMessage || "unknown"}`);
  }
  const accountAgentOptions = optionListRelations(mediaAccountResult?.summary?.agentList || []);
  const returnedAccountAgentId = clean(mediaAccountResult?.summary?.agentId);
  const agentRelationCandidates = returnedAccountAgentId
    ? relationFromValue(returnedAccountAgentId, mediaAccountResult?.summary?.agentName || returnedAccountAgentId)
    : accountAgentOptions.relations;
  const candidateAgentAllowed = agentRelationCandidates.some((item) => item.childId === clean(target.candidateAgentId));
  const accountIndexAgentConsistent = !accountAgentId || !returnedAccountAgentId || accountAgentId === returnedAccountAgentId;
  if (mediaAccountResult?.status === "passed" && !returnedAccountAgentId && accountAgentOptions.relations.length === 0) {
    blockers.push("account_record_agent_not_returned");
  }
  if (mediaAccountResult?.status === "passed" && !accountIndexAgentConsistent) {
    blockers.push("account_index_agent_mismatch_change_media_account");
  }
  if (mediaAccountResult?.status === "passed" && !candidateAgentAllowed) {
    blockers.push("candidate_agent_id_not_confirmed_for_account_record");
  }

  const technicalCombinationReady = [
    accountRows.length === 1,
    Boolean(qiankunAccountRecordId),
    Boolean(qiankunOwnerKey),
    mediaCandidatePresent,
    targetAccountAllowed,
    candidateMonitorApiAllowed,
    candidateAgentAllowed,
    accountIndexAgentConsistent
  ].every(Boolean);

  const publicSummary = {
    mode: "sync_technical_combination",
    target,
    account: {
      exactMatchCount: accountRows.length,
      qiankunAccountRecordIdPresent: Boolean(qiankunAccountRecordId),
      ownerKeyPresent: Boolean(qiankunOwnerKey),
      agentIdPresent: Boolean(accountAgentId),
      candidateAgentId: clean(target.candidateAgentId),
      accountIndexCandidateAgentMatches: accountAgentId ? accountAgentId === clean(target.candidateAgentId) : null
    },
    selectLists: {
      cateList: {
        called: Boolean(cateListResult),
        status: cateListResult?.status || "skipped",
        apiCode: cateListResult?.apiCode || "",
        listCount: Number(cateListResult?.summary?.listCount || 0),
        candidateCateId: clean(target.cateId),
        candidateCateReturned: Boolean(cateMatch),
        uniqueCandidateCateReturned: cateUniqueMatch
      },
      mediaList: {
        called: Boolean(mediaListResult),
        status: mediaListResult?.status || "skipped",
        apiCode: mediaListResult?.apiCode || "",
        listCount: Number(mediaListResult?.summary?.listCount || 0),
        candidateMediaId: clean(target.candidateMediaId),
        candidateMediaReturned: mediaCandidatePresent,
        candidateMediaName: clean(mediaMatch?.label)
      }
    },
    media: {
      called: Boolean(mediaResult),
      status: mediaResult?.status || "skipped",
      apiCode: mediaResult?.apiCode || "",
      accountIdListReturned: mediaResult?.summary?.fieldsPresent?.accountIdList === true,
      allowedAccountRecordCount: accountOptions.relations.length,
      targetAccountAllowed,
      monitorApiListReturned: mediaResult?.summary?.fieldsPresent?.monitorApiList === true,
      allowedMonitorApiCount: monitorApiOptions.relations.length,
      candidateMonitorApi: clean(target.candidateMonitorApi),
      candidateMonitorApiAllowed
    },
    mediaAccount: {
      called: Boolean(mediaAccountResult),
      status: mediaAccountResult?.status || "skipped",
      apiCode: mediaAccountResult?.apiCode || "",
      agentIdReturned: Boolean(returnedAccountAgentId),
      agentListReturned: mediaAccountResult?.summary?.fieldsPresent?.agentList === true,
      agentCandidateCount: agentRelationCandidates.length,
      candidateAgentAllowed,
      accountIndexAgentConsistent
    },
    requestFingerprints: {
      accountIndex: accountFingerprint,
      cateList: cateFingerprint,
      mediaList: mediaListFingerprint,
      changeMedia: mediaFingerprint,
      changeMediaAccount: mediaAccountFingerprint
    },
    responseHashes: {
      accountIndex: accountResult.responseHash || "",
      cateList: cateListResult?.responseHash || "",
      mediaList: mediaListResult?.responseHash || "",
      changeMedia: mediaResult?.responseHash || "",
      changeMediaAccount: mediaAccountResult?.responseHash || ""
    },
    readiness: {
      technicalCombinationReady,
      monitorCreateBlockedUntilReady: !technicalCombinationReady,
      unreadyCode: technicalCombinationReady ? "" : "qiankun_monitor_config_unverified"
    },
    credential: {
      status: credential.status,
      ownerKeyPresent: Boolean(clean(effectiveOwnerKey)),
      pendingOwnerKeyBootstrap: allowPendingOwnerKeyBootstrap,
      credentialStorePresent: credential.credentialStorePresent,
      activeCredentialCount: credential.activeCredentialCount,
      pendingOwnerKeyCount: credential.pendingOwnerKeyCount
    },
    warnings,
    blockers,
    platformWriteCalled: false,
    rawRequestStored: false,
    rawResponseStored: false
  };
  const safeSummary = sanitizeForPublic(publicSummary);
  assertNoSensitiveLeak(safeSummary);
  const evidenceArtifactId = await upsertTechnicalCombinationEvidence({
    repo,
    target,
    summary: safeSummary
  });

  if (repo && blockers.length) {
    const sessionInvalid = accountResult.status !== "passed" && clean(accountResult.apiCode) === "302";
    const accountIdentityUnresolved = blockers.some((item) => [
      "account_index_query_failed",
      "account_index_exact_match_count",
      "qiankun_account_record_id_missing",
      "qiankun_owner_key_missing"
    ].some((prefix) => item.startsWith(prefix)));
    const errorPrefix = sessionInvalid
      ? "qiankun_session_invalid"
      : accountIdentityUnresolved
        ? "qiankun_account_identity_unresolved"
        : "qiankun_media_candidate_unresolved";
    await repo.updateMonitorProvisionRunStatus({
      provisionId: monitorProvisionId(target),
      status: "failed",
      requestFingerprint: hashValue({
        mode: "sync_technical_combination",
        target: {
          routeId: target.routeId,
          gameCode: target.gameCode,
          advertiserId: target.advertiserId,
          os: target.os,
          cateId: target.cateId,
          vestId: target.vestId,
          packageId: target.packageId,
          channel: target.channel,
          candidateMediaId: target.candidateMediaId,
          candidateAgentId: target.candidateAgentId,
          candidateMonitorApi: target.candidateMonitorApi
        }
      }),
      credentialStatus: credentialStatusForDatabase(credential),
      responseHash: accountResult.responseHash || "",
      errorSummary: `${errorPrefix}:${blockers.join(";")}`,
      evidenceArtifactId
    });
  }

  if (repo && accountRows.length === 1 && qiankunAccountRecordId && qiankunOwnerKey) {
    await repo.updateQiankunAccountIdentity({
      advertiserId: target.advertiserId,
      routeId: target.routeId,
      gameCode: target.gameCode,
      accountName: accountRow.advertiserName || target.advertiserId,
      authStatus: accountRow.authStatusName || "unknown",
      platformStatus: accountRow.status || "unknown",
      ownerName: accountRow.ssoOwnerName || accountRow.ssoOwner || "",
      qiankunAccountRecordId,
      qiankunOwnerKey,
      qiankunAgentId: returnedAccountAgentId || accountAgentId,
      qiankunIdentityStatus: technicalCombinationReady ? "verified" : blockers.some((item) => item.includes("mismatch")) ? "mismatch" : "observed",
      qiankunVerifiedAt: verifiedAt
    });
  }

  if (repo && cateUniqueMatch) {
    writes.push(await syncSingleRelation({
      repo,
      target,
      relationType: "game_to_cate",
      os: target.os,
      parentType: "game",
      parentId: target.gameCode,
      parentName: target.gameCode,
      childType: "cate",
      relations: relationFromValue(target.cateId, cateMatch?.label || target.cateId),
      sourceEndpoint: SELECT_LIST_ENDPOINT,
      requestFingerprint: cateFingerprint,
      responseHash: cateListResult.responseHash,
      evidenceArtifactId
    }));
  }

  if (repo && mediaResult?.status === "passed" && targetAccountAllowed) {
    writes.push(await syncSingleRelation({
      repo,
      target,
      relationType: "media_to_allowed_account_record",
      os: target.os,
      parentType: "media",
      parentId: target.candidateMediaId,
      parentName: mediaMatch?.label || "",
      childType: "account_record",
      relations: relationFromValue(qiankunAccountRecordId),
      sourceEndpoint: CHANGE_MEDIA_ENDPOINT,
      requestFingerprint: mediaFingerprint,
      responseHash: mediaResult.responseHash,
      evidenceArtifactId
    }));
  }

  if (repo && mediaResult?.status === "passed" && targetAccountAllowed && monitorApiOptions.relations.length) {
    writes.push(await syncSingleRelation({
      repo,
      target,
      relationType: "media_to_allowed_monitor_api",
      os: target.os,
      parentType: "media",
      parentId: target.candidateMediaId,
      parentName: mediaMatch?.label || "",
      childType: "monitor_api",
      relations: monitorApiOptions.relations,
      sourceEndpoint: CHANGE_MEDIA_ENDPOINT,
      requestFingerprint: mediaFingerprint,
      responseHash: mediaResult.responseHash,
      evidenceArtifactId
    }));
  }

  if (repo && mediaAccountResult?.status === "passed" && agentRelationCandidates.length && accountIndexAgentConsistent) {
    writes.push(await syncSingleRelation({
      repo,
      target,
      relationType: "account_record_to_agent",
      os: target.os,
      parentType: "account_record",
      parentId: qiankunAccountRecordId,
      parentName: "",
      childType: "agent",
      relations: agentRelationCandidates,
      sourceEndpoint: CHANGE_MEDIA_ACCOUNT_ENDPOINT,
      requestFingerprint: mediaAccountFingerprint,
      responseHash: mediaAccountResult.responseHash,
      evidenceArtifactId
    }));
  }

  const output = {
    ...safeSummary,
    status: blockers.length ? "blocked" : "passed",
    evidenceArtifactId,
    writes: {
      accountIdentityWritten: Boolean(repo && accountRows.length === 1 && qiankunAccountRecordId && qiankunOwnerKey),
      relationRowsWritten: writes.some((item) => item.inputCount > 0),
      relationTypesWritten: writes.filter((item) => item.inputCount > 0).map((item) => item.relationType),
      relationWriteResults: writes
    }
  };
  assertNoSensitiveLeak(output);
  return output;
}
