import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import { createOceanEngineReadonlyClient } from "../src/platforms/oceanengineReadonlyClient.mjs";

const ROUTE_ID = "oceanengine_3_byte_mini_game";
const GAME_CODE = "JSZC";
const SOURCE_ADVERTISER_ID = "1760246749825031";
const TARGET_ADVERTISER_ID = "1871922175825993";
const SITE_LIST_ENDPOINT = "https://ad.oceanengine.com/open_api/2/tools/site/get/";
const ORANGE_SITE_ENDPOINT = "/open_api/v3.0/tools/orange_site/get/";

const OFFICIAL_ROOTS = [
  "/Users/hys/knowledge/01-个人本地知识库/01-官方文档/open.oceanengine.com-3.0",
  "/Users/hys/knowledge/01-个人本地知识库/01-官方文档/open.oceanengine.com-3.0-waibugei",
  "/Users/hys/knowledge/01-个人本地知识库/01-官方文档/open.oceanengine.com-2.0",
  "/Users/hys/knowledge/01-个人本地知识库/01-官方文档/open.oceanengine.com-2.0-copy"
];

const CREATE_DOCS = [
  "/Users/hys/knowledge/01-个人本地知识库/01-官方文档/open.oceanengine.com-3.0-waibugei/巨量营销智擎版/创建标准项目.md",
  "/Users/hys/knowledge/01-个人本地知识库/01-官方文档/open.oceanengine.com-3.0-waibugei/巨量营销智擎版/更新标准项目.md",
  "/Users/hys/knowledge/01-个人本地知识库/01-官方文档/open.oceanengine.com-2.0/15-建站管理.md",
  "/Users/hys/knowledge/01-个人本地知识库/01-官方文档/open.oceanengine.com-2.0-copy/13-建站管理.md"
];

const HISTORICAL_CANDIDATES = [
  {
    landingPageAssetId: "LPA-JSZC-OE3-BACKUP-001",
    siteId: "7624750304608649243",
    siteName: "巨兽战场-抖音小游戏-狙击狩猎",
    isDefault: true
  },
  {
    landingPageAssetId: "LPA-JSZC-OE3-BACKUP-002",
    siteId: "7450371049210462218",
    siteName: "巨兽战场-抖音小游戏-吃肉",
    isDefault: false
  },
  {
    landingPageAssetId: "LPA-JSZC-OE3-BACKUP-003",
    siteId: "7450398108389376051",
    siteName: "巨兽战场-抖音小游戏-螺丝",
    isDefault: false
  },
  {
    landingPageAssetId: "LPA-JSZC-OE3-BACKUP-004",
    siteId: "7582805366296346662",
    siteName: "巨兽战场-抖小-狙击",
    isDefault: false
  }
];

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function clean(value) {
  return String(value ?? "").trim();
}

function landingUrlForSiteId(siteId) {
  return `https://www.chengzijianzhan.com/tetris/page/${clean(siteId)}`;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function resource(resources = [], type) {
  return asArray(resources).find((item) => item.resource_type === type) || {};
}

function metadataValue(source = {}, paths = []) {
  for (const dotted of paths) {
    let cursor = source;
    for (const part of dotted.split(".")) cursor = cursor?.[part];
    if (cursor !== undefined && cursor !== null && cursor !== "") return cursor;
  }
  return "";
}

function allObjects(value) {
  const out = [];
  function walk(item) {
    if (Array.isArray(item)) {
      item.forEach(walk);
      return;
    }
    if (!item || typeof item !== "object") return;
    out.push(item);
    Object.values(item).forEach(walk);
  }
  walk(value);
  return out;
}

function siteIdOf(item = {}) {
  return clean(item.site_id ?? item.siteId ?? item.id);
}

function siteNameOf(item = {}) {
  return clean(item.name ?? item.site_name ?? item.siteName);
}

function summarizeSiteProbe(payload = {}, expectedSiteIds = []) {
  const expected = new Set(expectedSiteIds.map(clean));
  const sites = allObjects(payload)
    .map((item) => ({
      siteId: siteIdOf(item),
      siteName: siteNameOf(item),
      status: clean(item.status),
      siteType: clean(item.site_type ?? item.siteType),
      functionType: clean(item.function_type),
      urlPresent: Boolean(clean(item.url))
    }))
    .filter((item) => item.siteId && expected.has(item.siteId));
  return {
    matchedCount: sites.length,
    matchedSiteIds: [...new Set(sites.map((item) => item.siteId))],
    matchedNames: [...new Set(sites.map((item) => item.siteName).filter(Boolean))],
    matchedStatuses: [...new Set(sites.map((item) => item.status).filter(Boolean))],
    matchedUrlPresent: sites.some((item) => item.urlPresent),
    expectedCount: expected.size
  };
}

function summarizeOrangeSiteProbe(payload = {}, expectedSiteIds = []) {
  const base = summarizeSiteProbe(payload, expectedSiteIds);
  const sites = allObjects(payload)
    .filter((item) => expectedSiteIds.map(clean).includes(siteIdOf(item)))
    .map((item) => ({
      siteId: siteIdOf(item),
      urlPresent: Boolean(clean(item.url)),
      externalAction: clean(item.optimize_goal?.external_action ?? item.external_action),
      deepExternalAction: clean(item.optimize_goal?.deep_external_action ?? item.deep_external_action)
    }));
  return {
    ...base,
    optimizeGoalMatched: sites.some((item) => item.externalAction || item.deepExternalAction),
    directUrlPresentInReadonlyResponse: sites.some((item) => item.urlPresent)
  };
}

function arg(name) {
  const prefix = `${name}=`;
  const item = process.argv.slice(2).find((value) => value === name || value.startsWith(prefix));
  if (!item) return "";
  if (item === name) return "true";
  return item.slice(prefix.length);
}

async function safeRead(path) {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

async function listFiles(root) {
  const out = [];
  async function walk(dir) {
    let entries = [];
    try {
      entries = await readdir(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry);
      let info;
      try {
        info = await stat(path);
      } catch {
        continue;
      }
      if (info.isDirectory()) {
        await walk(path);
      } else if (info.isFile()) {
        out.push(path);
      }
    }
  }
  await walk(root);
  return out;
}

async function findLocalSiteListDocs() {
  const files = (await Promise.all(OFFICIAL_ROOTS.map(listFiles))).flat();
  return files
    .filter((path) => /橙子|建站|站点|site|landing|444/i.test(basename(path)))
    .filter((path) => /获取橙子建站站点列表|橙子建站站点列表|site|landing|444/i.test(path));
}

async function inspectOfficialDocs() {
  const docs = [];
  for (const path of CREATE_DOCS) {
    const text = await safeRead(path);
    docs.push({
      path,
      present: Boolean(text),
      hash: text ? `sha256:${sha256(text)}` : "",
      externalUrlMaterialListFound: /external\\_url\\_material\\_list|external_url_material_list/.test(text),
      orangeSiteListReferenceFound: /获取橙子建站站点列表/.test(text),
      optimizedGoalLandingReferenceFound: /通过优化目标获取橙子落地页站点信息/.test(text),
      siteGetEndpointFound: text.includes(SITE_LIST_ENDPOINT),
      orangeSiteEndpointFound: text.includes("https://api.oceanengine.com/open_api/v3.0/tools/orange_site/get/"),
      siteUrlConstructAllowed: /建站地址可由如下格式拼装得到/.test(text) && /chengzijianzhan\.com\/tetris\/page/.test(text),
      siteGetReturnsUrl: /该接口当前还不会返回建站地址/.test(text) ? false : /站点url链接|\\burl\\b/.test(text)
    });
  }

  const localSiteListDocs = await findLocalSiteListDocs();
  const directDocConfirmsSiteGet = docs.some((item) => item.siteGetEndpointFound);
  return {
    docs,
    localSiteListDocPresent: localSiteListDocs.length > 0 || directDocConfirmsSiteGet,
    localSiteListDocPaths: [...new Set([
      ...localSiteListDocs.slice(0, 12),
      ...docs.filter((item) => item.siteGetEndpointFound).map((item) => item.path)
    ])],
    localSiteListEndpointVerified: directDocConfirmsSiteGet,
    siteUrlConstructAllowed: docs.some((item) => item.siteUrlConstructAllowed),
    orangeSiteEndpointVerified: docs.some((item) => item.orangeSiteEndpointFound)
  };
}

function buildStatus(official = {}) {
  const createDocHasLandingField = official.docs?.some((item) => item.externalUrlMaterialListFound);
  const createDocReferencesSource = official.docs?.some((item) =>
    item.orangeSiteListReferenceFound || item.optimizedGoalLandingReferenceFound
  );
  const blockers = [
    ...(!createDocHasLandingField ? ["external_url_material_list_create_contract_missing"] : []),
    ...(!createDocReferencesSource ? ["landing_page_source_reference_missing"] : []),
    ...(!official.localSiteListDocPresent ? ["local_official_site_list_doc_missing"] : []),
    ...(!official.localSiteListEndpointVerified ? ["local_official_site_list_endpoint_missing"] : []),
    ...(!official.siteUrlConstructAllowed ? ["landing_page_url_construct_contract_missing"] : []),
    ...(!official.orangeSiteEndpointVerified ? ["orange_site_endpoint_contract_missing"] : [])
  ];
  return {
    status: blockers.length ? "blocked_local_official_landing_page_contract_missing" : "ready_for_source_readonly_probe",
    blockers
  };
}

function evidenceSummaryLines({ status, official, candidateCount }) {
  return [
    `status=${status.status}`,
    `route_id=${ROUTE_ID}`,
    `game_code=${GAME_CODE}`,
    `source_advertiser_id=${SOURCE_ADVERTISER_ID}`,
    `target_advertiser_id=${TARGET_ADVERTISER_ID}`,
    `candidate_count=${candidateCount}`,
    `create_doc_external_url_material_list_found=${official.docs?.some((item) => item.externalUrlMaterialListFound) === true}`,
    `optimized_goal_landing_reference_found=${official.docs?.some((item) => item.optimizedGoalLandingReferenceFound) === true}`,
    `orange_site_list_reference_found=${official.docs?.some((item) => item.orangeSiteListReferenceFound) === true}`,
    `local_site_list_doc_present=${official.localSiteListDocPresent === true}`,
    `local_site_list_endpoint_verified=${official.localSiteListEndpointVerified === true}`,
    `controlled_landing_url_supported=${official.siteUrlConstructAllowed === true}`,
    `full_url_output=false`,
    `raw_response_stored=false`
  ].join("; ");
}

function buildOrangeSiteQuery(context = {}, siteId) {
  const raw = context.defaults?.raw_defaults || {};
  const payloadDefaults = raw.payload_defaults || {};
  const project = payloadDefaults.project || {};
  const eventAsset = resource(context.resources, "event_asset");
  const microApp = resource(context.resources, "micro_app_instance");
  const externalAction = clean(context.defaults?.objective || payloadDefaults.conversion?.external_action);
  const deepExternalAction = clean(context.defaults?.deep_objective || payloadDefaults.conversion?.deep_external_action);
  return {
    advertiser_id: TARGET_ADVERTISER_ID,
    page: 1,
    page_size: 50,
    status: "SITE_ONLINE",
    filtering: {
      search: clean(siteId),
      micro_app_instance_id: clean(metadataValue(microApp, [
        "metadata.micro_app_instance_id",
        "metadata.instance_id",
        "platform_resource_id"
      ]))
    },
    optimize_goal: {
      external_action: externalAction || clean(project.external_action),
      deep_external_action: deepExternalAction
    },
    asset_id: clean(eventAsset.platform_resource_id)
  };
}

async function runReadonlyProbes({ repo, official }) {
  if (!official.localSiteListEndpointVerified || !official.orangeSiteEndpointVerified) {
    return {
      attempted: false,
      sourceSiteList: null,
      targetSiteList: null,
      targetOrangeSite: null
    };
  }
  const context = await repo.getCoreContext({
    routeId: ROUTE_ID,
    gameCode: GAME_CODE,
    advertiserId: TARGET_ADVERTISER_ID
  });
  const expectedSiteIds = HISTORICAL_CANDIDATES.map((item) => item.siteId);
  const defaultSiteId = HISTORICAL_CANDIDATES[0].siteId;
  const client = createOceanEngineReadonlyClient();
  const sourceSiteList = await client.get({
    label: "landing_page_source_site_list",
    endpoint: SITE_LIST_ENDPOINT,
    query: {
      advertiser_id: SOURCE_ADVERTISER_ID,
      page: 1,
      page_size: 20,
      share_type: "MY_CREATIONS",
      filtering: { search: defaultSiteId }
    },
    summarize: (payload) => summarizeSiteProbe(payload, expectedSiteIds)
  });
  const targetSiteList = await client.get({
    label: "landing_page_target_site_list",
    endpoint: SITE_LIST_ENDPOINT,
    query: {
      advertiser_id: TARGET_ADVERTISER_ID,
      page: 1,
      page_size: 20,
      status: "SITE_ONLINE",
      share_type: "SHARE",
      filtering: { search: defaultSiteId }
    },
    summarize: (payload) => summarizeSiteProbe(payload, expectedSiteIds)
  });
  const targetOrangeSite = await client.get({
    label: "landing_page_target_orange_site_goal",
    endpoint: ORANGE_SITE_ENDPOINT,
    query: buildOrangeSiteQuery(context, defaultSiteId),
    summarize: (payload) => summarizeOrangeSiteProbe(payload, [defaultSiteId])
  });
  return {
    attempted: true,
    sourceSiteList,
    targetSiteList,
    targetOrangeSite
  };
}

function statusFromProbes(contractStatus, probes = {}) {
  if (contractStatus.blockers.length) return contractStatus;
  if (!probes.attempted) return contractStatus;
  const sourcePassed = probes.sourceSiteList?.status === "passed";
  const targetPassed = probes.targetSiteList?.status === "passed";
  const orangePassed = probes.targetOrangeSite?.status === "passed";
  const sourceFound = probes.sourceSiteList?.summary?.matchedSiteIds?.includes(HISTORICAL_CANDIDATES[0].siteId);
  const targetFound = probes.targetSiteList?.summary?.matchedSiteIds?.includes(HISTORICAL_CANDIDATES[0].siteId);
  const orangeFound = probes.targetOrangeSite?.summary?.matchedSiteIds?.includes(HISTORICAL_CANDIDATES[0].siteId);
  const blockers = [
    ...(!sourcePassed ? ["source_site_list_probe_not_passed"] : []),
    ...(sourcePassed && !sourceFound ? ["default_landing_page_not_found_in_source_account"] : []),
    ...(!targetPassed ? ["target_site_list_probe_not_passed"] : []),
    ...(targetPassed && !targetFound ? ["default_landing_page_not_visible_in_target_account"] : []),
    ...(!orangePassed ? ["target_orange_site_probe_not_passed"] : []),
    ...(orangePassed && !orangeFound ? ["default_landing_page_not_matched_by_orange_site_goal"] : [])
  ];
  return {
    status: blockers.length ? "blocked_landing_page_target_readonly_not_verified" : "ready_default_landing_page_active",
    blockers
  };
}

async function recordInventory({ repo, official, status, probes }) {
  const safeEvidenceContent = {
    status: status.status,
    blockers: status.blockers,
    routeId: ROUTE_ID,
    gameCode: GAME_CODE,
    sourceAdvertiserId: SOURCE_ADVERTISER_ID,
    targetAdvertiserId: TARGET_ADVERTISER_ID,
    candidateSiteIds: HISTORICAL_CANDIDATES.map((item) => item.siteId),
    docs: official.docs,
    localSiteListDocPresent: official.localSiteListDocPresent,
    siteUrlConstructAllowed: official.siteUrlConstructAllowed,
    probes: {
      attempted: probes?.attempted === true,
      sourceSiteList: probes?.sourceSiteList ? {
        status: probes.sourceSiteList.status,
        httpStatus: probes.sourceSiteList.httpStatus,
        apiCode: probes.sourceSiteList.apiCode || "",
        requestIdPresent: probes.sourceSiteList.requestIdPresent,
        responseHashPresent: Boolean(probes.sourceSiteList.responseHash),
        summary: probes.sourceSiteList.summary || {}
      } : null,
      targetSiteList: probes?.targetSiteList ? {
        status: probes.targetSiteList.status,
        httpStatus: probes.targetSiteList.httpStatus,
        apiCode: probes.targetSiteList.apiCode || "",
        requestIdPresent: probes.targetSiteList.requestIdPresent,
        responseHashPresent: Boolean(probes.targetSiteList.responseHash),
        summary: probes.targetSiteList.summary || {}
      } : null,
      targetOrangeSite: probes?.targetOrangeSite ? {
        status: probes.targetOrangeSite.status,
        httpStatus: probes.targetOrangeSite.httpStatus,
        apiCode: probes.targetOrangeSite.apiCode || "",
        requestIdPresent: probes.targetOrangeSite.requestIdPresent,
        responseHashPresent: Boolean(probes.targetOrangeSite.responseHash),
        summary: probes.targetOrangeSite.summary || {}
      } : null
    }
  };
  const sourceEvidenceId = "EV-OE3-LANDING-PAGE-SOURCE-INVENTORY-1760246749825031-JSZC";
  const targetEvidenceId = "EV-OE3-LANDING-PAGE-TARGET-INVENTORY-1871922175825993-JSZC";
  const summary = evidenceSummaryLines({
    status,
    official,
    candidateCount: HISTORICAL_CANDIDATES.length
  });

  await repo.upsertEvidence({
    artifactId: sourceEvidenceId,
    jobId: null,
    artifactType: "oceanengine_landing_page_source_readonly",
    title: "OE3 landing page source inventory readonly evidence",
    summary,
    contentHash: sha256(JSON.stringify({ ...safeEvidenceContent, side: "source" })),
    storageRef: `postgres:mwb.evidence_artifacts/${sourceEvidenceId}`,
    sourceRef: "local_official_docs:oe3_landing_page_source_inventory",
    sourceUsage: "reference_only"
  });
  await repo.upsertEvidence({
    artifactId: targetEvidenceId,
    jobId: null,
    artifactType: "oceanengine_landing_page_target_readonly",
    title: "OE3 landing page target visibility readonly evidence",
    summary,
    contentHash: sha256(JSON.stringify({ ...safeEvidenceContent, side: "target" })),
    storageRef: `postgres:mwb.evidence_artifacts/${targetEvidenceId}`,
    sourceRef: "local_official_docs:oe3_landing_page_target_inventory",
    sourceUsage: "reference_only"
  });

  const defaultReady = status.status === "ready_default_landing_page_active";
  for (const candidate of HISTORICAL_CANDIDATES) {
    const candidateIsDefault = candidate.isDefault === true;
    const landingUrl = official.siteUrlConstructAllowed ? landingUrlForSiteId(candidate.siteId) : "";
    await repo.upsertLandingPageAsset({
      landingPageAssetId: candidate.landingPageAssetId,
      routeId: ROUTE_ID,
      gameCode: GAME_CODE,
      siteId: candidate.siteId,
      siteName: candidate.siteName,
      landingUrl,
      sourceAdvertiserId: SOURCE_ADVERTISER_ID,
      isDefault: candidate.isDefault,
      status: candidateIsDefault && defaultReady ? "active" : "resolved",
      sourceUsage: candidateIsDefault && defaultReady ? "runtime_truth" : "reference_only",
      metadata: {
        source_note: "historical_candidate_reference_only",
        source_inventory_status: status.status,
        evidence_refs: [sourceEvidenceId],
        url_known: Boolean(landingUrl),
        url_hash: landingUrl ? sha256(landingUrl) : "",
        site_url_constructed_from_official_2p0_contract: Boolean(landingUrl),
        active_without_url_allowed: false
      }
    });
    await repo.upsertAccountResourceReadonlyBySourceAsset({
      routeId: ROUTE_ID,
      gameCode: GAME_CODE,
      advertiserId: TARGET_ADVERTISER_ID,
      resourceType: "backup_landing_page",
      sourceAssetId: candidate.landingPageAssetId,
      resourceName: candidate.siteName,
      platformResourceId: candidate.siteId,
      visibilityStatus: candidateIsDefault && defaultReady ? "visible" : "unknown",
      readbackStatus: candidateIsDefault && defaultReady ? "readback_verified" : "not_checked",
      required: candidate.isDefault,
      metadata: {
        key: "landing_page_source_target_readonly_inventory",
        status: status.status,
        gap: status.blockers[0] || "unknown",
        next_action: defaultReady ? "默认备用落地页可进入 fresh runtime job gate" : "按阻断项补齐目标账户可见性或优化目标关联证据后重跑只读盘点",
        evidence_refs: [sourceEvidenceId, targetEvidenceId],
        url_hash: landingUrl ? sha256(landingUrl) : "",
        source_probe_status: probes?.sourceSiteList?.status || "",
        target_probe_status: probes?.targetSiteList?.status || "",
        orange_site_probe_status: probes?.targetOrangeSite?.status || "",
        controlled_url_column_stored: Boolean(landingUrl),
        full_url_output: false,
        raw_response_stored: false
      },
      resourceMetadata: {
        site_id: candidate.siteId,
        site_name: candidate.siteName,
        landing_page_asset_id: candidate.landingPageAssetId,
        url_hash: landingUrl ? sha256(landingUrl) : ""
      }
    });
  }

  return { sourceEvidenceId, targetEvidenceId };
}

async function main() {
  const shouldRecord = arg("--record") === "true";
  const official = await inspectOfficialDocs();
  const contractStatus = buildStatus(official);
  const repo = new PostgresRepository();
  const probes = contractStatus.blockers.length ? {
    attempted: false,
    sourceSiteList: null,
    targetSiteList: null,
    targetOrangeSite: null
  } : await runReadonlyProbes({ repo, official });
  const status = statusFromProbes(contractStatus, probes);
  let record = null;
  if (shouldRecord) {
    record = await recordInventory({ repo, official, status, probes });
  }
  const candidates = await repo.getBackupLandingPageCandidates({
    routeId: ROUTE_ID,
    gameCode: GAME_CODE
  });
  console.log(JSON.stringify({
    status: status.status,
    routeId: ROUTE_ID,
    gameCode: GAME_CODE,
    sourceAdvertiserId: SOURCE_ADVERTISER_ID,
    targetAdvertiserId: TARGET_ADVERTISER_ID,
    blockers: status.blockers,
    officialEvidence: {
      docs: official.docs,
      localSiteListDocPresent: official.localSiteListDocPresent,
      localSiteListDocPaths: official.localSiteListDocPaths,
      localSiteListEndpointVerified: official.localSiteListEndpointVerified,
      siteUrlConstructAllowed: official.siteUrlConstructAllowed,
      orangeSiteEndpointVerified: official.orangeSiteEndpointVerified
    },
    readonlyProbe: {
      attempted: probes.attempted === true,
      sourceSiteList: probes.sourceSiteList ? {
        status: probes.sourceSiteList.status,
        endpoint: probes.sourceSiteList.endpoint,
        httpStatus: probes.sourceSiteList.httpStatus,
        apiCode: probes.sourceSiteList.apiCode || "",
        requestIdPresent: probes.sourceSiteList.requestIdPresent,
        responseHashPresent: Boolean(probes.sourceSiteList.responseHash),
        summary: probes.sourceSiteList.summary || {}
      } : null,
      targetSiteList: probes.targetSiteList ? {
        status: probes.targetSiteList.status,
        endpoint: probes.targetSiteList.endpoint,
        httpStatus: probes.targetSiteList.httpStatus,
        apiCode: probes.targetSiteList.apiCode || "",
        requestIdPresent: probes.targetSiteList.requestIdPresent,
        responseHashPresent: Boolean(probes.targetSiteList.responseHash),
        summary: probes.targetSiteList.summary || {}
      } : null,
      targetOrangeSite: probes.targetOrangeSite ? {
        status: probes.targetOrangeSite.status,
        endpoint: probes.targetOrangeSite.endpoint,
        httpStatus: probes.targetOrangeSite.httpStatus,
        apiCode: probes.targetOrangeSite.apiCode || "",
        requestIdPresent: probes.targetOrangeSite.requestIdPresent,
        responseHashPresent: Boolean(probes.targetOrangeSite.responseHash),
        summary: probes.targetOrangeSite.summary || {}
      } : null
    },
    candidateCount: Array.isArray(candidates) ? candidates.length : 0,
    historicalCandidateSiteIds: HISTORICAL_CANDIDATES.map((item) => item.siteId),
    postgresRecorded: Boolean(record),
    evidenceRefs: record ? [record.sourceEvidenceId, record.targetEvidenceId] : [],
    platformCalls: probes.attempted ? 3 : 0,
    platformWrites: 0,
    tokenRefresh: false,
    fullUrlOutput: false,
    rawResponseStored: false,
    nextGate: status.blockers.length
      ? "按 blockers 补齐物料户/目标账户可见性或优化目标关联证据后重跑。"
      : "默认备用落地页已具备 fresh runtime job 前置条件。"
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    status: "failed",
    error: clean(error.message || error.name || "unknown_error")
  }, null, 2));
  process.exitCode = 1;
});
