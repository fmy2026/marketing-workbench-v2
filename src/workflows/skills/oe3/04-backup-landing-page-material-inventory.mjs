import { randomBytes } from "node:crypto";
import {
  assertNoSensitiveLeak,
  hashValue,
  recordSkillRun,
  sanitizeForPublic,
  skillDefinition
} from "./00-contracts.mjs";
import { createOceanEngineReadonlyClient } from "../../../platforms/oceanengineReadonlyClient.mjs";

export const BACKUP_LANDING_PAGE_INVENTORY_SKILL_KEY = "backup-landing-page-material-inventory";
export const BACKUP_LANDING_PAGE_INVENTORY_TASK_ID = "TASK-MWBV2-OE3-BACKUP-LANDING-PAGE-MATERIAL-INVENTORY-1871922346964041";
export const CONTROLLED_BACKUP_LANDING_PAGE_ASSET_ID = "LPA-JSZC-OE3-BACKUP-001";
export const DEFAULT_BACKUP_LANDING_PAGE_SOURCE_ACCOUNT = "1760246749825031";

const SITE_GET_ENDPOINT = "https://ad.oceanengine.com/open_api/2/tools/site/get/";
const ORANGE_SITE_GET_ENDPOINT = "/open_api/v3.0/tools/orange_site/get/";
const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGES = 20;
const USABLE_SITE_STATUSES = new Set([
  "ACTIVE",
  "AUDIT_ACCEPTED",
  "AUDIT_PASS",
  "ENABLE",
  "ENABLED",
  "PASSED",
  "PASS",
  "ONLINE"
]);

function clean(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return clean(value).toUpperCase();
}

function digits(value) {
  const text = clean(value);
  return /^[0-9]+$/.test(text) ? text : "";
}

function safeJobSuffix() {
  const now = new Date();
  const yyyymmdd = now.toISOString().slice(0, 10).replace(/-/g, "");
  const hhmmss = now.toISOString().slice(11, 19).replace(/:/g, "");
  return `${yyyymmdd}${hhmmss}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

function siteUrlHash(siteId) {
  const value = digits(siteId);
  return value ? hashValue(`https://www.chengzijianzhan.com/tetris/page/${value}/`) : "";
}

function normalizedHash(value) {
  const text = clean(value);
  if (!text) return "";
  return text.startsWith("sha256:") ? text : `sha256:${text}`;
}

function siteIdFromItem(item = {}) {
  return digits(item.site_id ?? item.siteId ?? item.siteID ?? item.id);
}

function siteNameFromItem(item = {}) {
  return clean(item.site_name ?? item.siteName ?? item.name ?? item.title);
}

function siteStatusFromItem(item = {}) {
  return clean(item.status ?? item.audit_status ?? item.auditStatus ?? item.site_status ?? item.siteStatus);
}

function shareTypeFromItem(item = {}, requestedShareType = "") {
  return clean(item.share_type ?? item.shareType ?? item.source_type ?? item.sourceType ?? requestedShareType);
}

function siteUrlCandidate(item = {}) {
  return clean(item.site_url ?? item.siteUrl ?? item.url ?? item.preview_url ?? item.previewUrl);
}

function normalizeSiteItem(item = {}, requestedShareType = "") {
  const siteId = siteIdFromItem(item);
  const name = siteNameFromItem(item);
  const status = siteStatusFromItem(item);
  const urlCandidate = siteUrlCandidate(item);
  return {
    site_id: siteId,
    name_hash: name ? hashValue(name) : "",
    name_present: Boolean(name),
    status,
    status_normalized: upper(status),
    usable: USABLE_SITE_STATUSES.has(upper(status)),
    share_type: shareTypeFromItem(item, requestedShareType),
    url_hash: urlCandidate ? hashValue(urlCandidate) : siteUrlHash(siteId),
    url_hash_present: Boolean(urlCandidate || siteId)
  };
}

function payloadList(payload = {}) {
  const data = payload.data || {};
  const direct = data.list || data.site_list || data.siteList || data.items || data.records || [];
  if (Array.isArray(direct)) return direct;
  if (Array.isArray(direct.list)) return direct.list;
  return [];
}

function payloadTotal(payload = {}) {
  const data = payload.data || {};
  const pageInfo = data.page_info || data.pageInfo || data.pagination || {};
  const value = data.total_number ?? data.total ?? data.total_count ?? pageInfo.total_number ?? pageInfo.total ?? pageInfo.total_count;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function summarizeSitePayload(payload = {}, requestedShareType = "") {
  const list = payloadList(payload).map((item) => normalizeSiteItem(item, requestedShareType)).filter((item) => item.site_id);
  return {
    total: payloadTotal(payload),
    returned_count: list.length,
    sites: list
  };
}

async function fetchSitePages({ client, advertiserId, label, shareType = "", pageSize = DEFAULT_PAGE_SIZE }) {
  const pages = [];
  const sitesById = new Map();
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const query = {
      advertiser_id: advertiserId,
      page,
      page_size: pageSize,
      ...(shareType ? { share_type: shareType } : {})
    };
    const result = await client.get({
      label: `${label}:page:${page}`,
      endpoint: SITE_GET_ENDPOINT,
      query,
      requestFieldManifest: {
        method: "GET",
        endpoint: "tools/site/get",
        fields: ["advertiser_id", "page", "page_size", ...(shareType ? ["share_type"] : [])],
        readonly: true
      },
      summarize: (payload) => summarizeSitePayload(payload, shareType)
    });
    pages.push(result);
    for (const site of result.summary?.sites || []) sitesById.set(site.site_id, site);
    if (result.status !== "passed") break;
    const returned = Number(result.summary?.returned_count || 0);
    const total = Number(result.summary?.total || 0);
    if (returned < pageSize) break;
    if (total > 0 && page * pageSize >= total) break;
  }
  return {
    status: pages.every((page) => page.status === "passed") ? "passed" : "blocked",
    page_count: pages.length,
    site_count: sitesById.size,
    sites: [...sitesById.values()].sort((a, b) => a.site_id.localeCompare(b.site_id)),
    response_hash: hashValue(pages.map((page) => ({
      endpoint: page.endpoint,
      status: page.status,
      httpStatus: page.httpStatus,
      apiCode: page.apiCode,
      responseHash: page.responseHash,
      requestIdPresent: page.requestIdPresent,
      returnedCount: page.summary?.returned_count || 0
    }))),
    page_summaries: pages.map((page) => ({
      status: page.status,
      http_status: page.httpStatus,
      api_code: page.apiCode,
      request_id_present: page.requestIdPresent,
      response_hash_present: Boolean(page.responseHash),
      returned_count: page.summary?.returned_count || 0
    })),
    blockers: pages.flatMap((page) => page.status === "passed" ? [] : [`site_get_${label}_blocked`])
  };
}

async function fetchTargetOrangeSiteProbe({ client, advertiserId }) {
  const result = await client.get({
    label: "target:orange_site:get",
    endpoint: ORANGE_SITE_GET_ENDPOINT,
    query: {
      advertiser_id: advertiserId,
      landing_type: "EXTERNAL_URL"
    },
    requestFieldManifest: {
      method: "GET",
      endpoint: "tools/orange_site/get",
      fields: ["advertiser_id", "landing_type"],
      readonly: true,
      auxiliary_only: true
    },
    summarize: (payload) => {
      const sites = payloadList(payload).map((item) => normalizeSiteItem(item)).filter((item) => item.site_id);
      return { returned_count: sites.length, sites };
    }
  });
  return {
    status: result.status,
    http_status: result.httpStatus,
    api_code: result.apiCode,
    request_id_present: result.requestIdPresent,
    response_hash_present: Boolean(result.responseHash),
    response_hash: result.responseHash || "",
    site_count: Number(result.summary?.returned_count || 0),
    site_ids: (result.summary?.sites || []).map((item) => item.site_id).sort()
  };
}

function candidateSummary(candidate = {}, sourceSite = null, targetSite = null, targetSharedSite = null) {
  const siteId = clean(candidate.site_id);
  const name = clean(candidate.site_name);
  return {
    landing_page_asset_id: clean(candidate.landing_page_asset_id),
    site_id: siteId,
    is_default: candidate.is_default === true,
    expected_source_account_present: Boolean(clean(candidate.source_advertiser_id)),
    db_status: clean(candidate.status || "unknown"),
    db_name_hash: name ? hashValue(name) : "",
    db_name_present: Boolean(name),
    source_match: Boolean(sourceSite),
    source_status: clean(sourceSite?.status || ""),
    source_usable: sourceSite?.usable === true,
    source_name_hash: clean(sourceSite?.name_hash || ""),
    target_match: Boolean(targetSite),
    target_status: clean(targetSite?.status || ""),
    target_usable: targetSite?.usable === true,
    target_share_type: clean(targetSite?.share_type || targetSharedSite?.share_type || ""),
    target_shared_match: Boolean(targetSharedSite),
    url_hash: normalizedHash(sourceSite?.url_hash || candidate.url_hash || siteUrlHash(siteId)),
    url_hash_present: Boolean(sourceSite?.url_hash || candidate.url_hash || siteId)
  };
}

function selectConclusion({ candidates, sourceInventory, targetInventory, targetSharedInventory }) {
  const sourceById = new Map((sourceInventory.sites || []).map((item) => [item.site_id, item]));
  const targetById = new Map((targetInventory.sites || []).map((item) => [item.site_id, item]));
  const targetSharedById = new Map((targetSharedInventory.sites || []).map((item) => [item.site_id, item]));
  const candidateRows = candidates.map((candidate) => candidateSummary(
    candidate,
    sourceById.get(clean(candidate.site_id)),
    targetById.get(clean(candidate.site_id)),
    targetSharedById.get(clean(candidate.site_id))
  ));
  const defaultRows = candidateRows.filter((item) => item.landing_page_asset_id === CONTROLLED_BACKUP_LANDING_PAGE_ASSET_ID);
  const defaultRow = defaultRows[0] || null;
  const targetAlreadyUsable = defaultRows.length === 1 && defaultRow.target_match && defaultRow.target_usable;
  const defaultSourceVerified = defaultRows.length === 1 && defaultRow.source_match && defaultRow.source_usable;
  const blockers = [
    ...(candidates.length !== 4 ? ["backup_landing_page_candidate_count_unexpected"] : []),
    ...(defaultRows.length !== 1 ? ["backup_landing_page_default_candidate_not_unique"] : []),
    ...(sourceInventory.status === "passed" ? [] : sourceInventory.blockers),
    ...(targetInventory.status === "passed" ? [] : targetInventory.blockers),
    ...(defaultRows.length === 1 && !defaultRow.source_match ? ["backup_landing_page_default_source_missing"] : []),
    ...(defaultRows.length === 1 && defaultRow.source_match && !defaultRow.source_usable ? ["backup_landing_page_default_source_not_usable"] : [])
  ];
  const hasBlockingProbeOrDefaultIssue = blockers.length > 0;
  const conclusion = targetAlreadyUsable && !hasBlockingProbeOrDefaultIssue
    ? "target_already_usable"
    : defaultSourceVerified && !hasBlockingProbeOrDefaultIssue
      ? "default_source_verified"
      : "default_source_unverified";
  return {
    status: conclusion === "target_already_usable" ? "passed" : conclusion === "default_source_verified" ? "needs_confirmation" : "blocked",
    conclusion,
    blockers: [...new Set(blockers)],
    candidateRows,
    defaultRow,
    defaultSourceVerified,
    targetAlreadyUsable
  };
}

async function writeInventoryEvidence({ repo, bundle, outputSummary }) {
  if (!repo?.upsertEvidence) return "";
  const artifactId = `EV-${bundle.job.job_id}-BACKUP-LANDING-MATERIAL-INVENTORY`;
  const evidence = {
    artifactId,
    jobId: bundle.job.job_id,
    artifactType: "backup_landing_page_material_inventory_readonly",
    title: "JSZC material account backup landing page inventory",
    summary: `conclusion=${outputSummary.conclusion}; source_candidates=${outputSummary.source_candidate_count}; target_matches=${outputSummary.target_match_count}; writes=0`,
    contentHash: hashValue(outputSummary),
    storageRef: `postgres:mwb.launch_skill_runs/${bundle.job.job_id}/${BACKUP_LANDING_PAGE_INVENTORY_SKILL_KEY}`,
    sourceRef: "src/workflows/skills/oe3/04-backup-landing-page-material-inventory.mjs",
    sourceUsage: bundle.job.source_usage || "runtime_truth"
  };
  assertNoSensitiveLeak(evidence);
  await repo.upsertEvidence(evidence);
  return artifactId;
}

async function persistInventory({ repo, bundle, candidates, conclusion, outputSummary, evidenceRef, sourceAdvertiserId }) {
  if (!repo) return;
  for (const row of conclusion.candidateRows) {
    const candidate = candidates.find((item) => clean(item.landing_page_asset_id) === row.landing_page_asset_id) || {};
    if (repo.upsertLandingPageAsset && row.source_match) {
      await repo.upsertLandingPageAsset({
        landingPageAssetId: row.landing_page_asset_id,
        routeId: bundle.job.route_id,
        gameCode: bundle.job.game_code,
        siteId: row.site_id,
        siteName: clean(candidate.site_name || row.site_id),
        landingUrl: null,
        sourceAdvertiserId,
        shareScope: clean(candidate.share_scope || "organization_accounts"),
        isDefault: row.is_default,
        status: row.source_usable ? "active" : "reference_candidate",
        sourceUsage: bundle.job.source_usage || "runtime_truth",
        metadata: {
          material_inventory_readonly: {
            status: row.source_usable ? "source_verified" : "source_seen_not_usable",
            checked_at_present: true,
            response_hash_present: Boolean(outputSummary.source_response_hash),
            evidence_ref: evidenceRef
          }
        }
      });
    }
    if (repo.upsertAccountResourceReadonlyBySourceAsset && row.is_default) {
      await repo.upsertAccountResourceReadonlyBySourceAsset({
        routeId: bundle.job.route_id,
        gameCode: bundle.job.game_code,
        advertiserId: bundle.job.advertiser_id,
        resourceType: "backup_landing_page",
        sourceAssetId: row.landing_page_asset_id,
        resourceName: clean(candidate.site_name || row.site_id),
        platformResourceId: row.site_id,
        visibilityStatus: row.target_usable ? "visible" : "unknown",
        readbackStatus: row.target_usable ? "readback_verified" : "not_checked",
        required: true,
        metadata: {
          status: row.target_usable ? "passed" : outputSummary.conclusion,
          source_verified: row.source_usable,
          target_visible: row.target_match,
          target_shared_match: row.target_shared_match,
          response_hash_present: true,
          evidence_ref: evidenceRef
        },
        resourceMetadata: {
          url_hash: row.url_hash,
          backup_landing_page_material_inventory: outputSummary
        }
      });
    }
  }
}

export async function runBackupLandingPageMaterialInventorySkill({
  repo,
  bundle,
  readonlyClient = createOceanEngineReadonlyClient(),
  sourceAdvertiserId = DEFAULT_BACKUP_LANDING_PAGE_SOURCE_ACCOUNT,
  pageSize = DEFAULT_PAGE_SIZE,
  record = true
} = {}) {
  if (!repo || !bundle?.job) throw new Error("launch_job_bundle_required");
  const startedAt = new Date().toISOString();
  const candidates = (await repo.getBackupLandingPageCandidates({
    routeId: bundle.job.route_id,
    gameCode: bundle.job.game_code
  }) || []).filter((item) => clean(item.source_advertiser_id) === clean(sourceAdvertiserId));

  const sourceInventory = await fetchSitePages({
    client: readonlyClient,
    advertiserId: sourceAdvertiserId,
    label: "source",
    pageSize
  });
  const targetInventory = await fetchSitePages({
    client: readonlyClient,
    advertiserId: bundle.job.advertiser_id,
    label: "target",
    pageSize
  });
  const targetSharedInventory = await fetchSitePages({
    client: readonlyClient,
    advertiserId: bundle.job.advertiser_id,
    label: "target_shared",
    shareType: "SHARE",
    pageSize
  });
  const orangeProbe = await fetchTargetOrangeSiteProbe({
    client: readonlyClient,
    advertiserId: bundle.job.advertiser_id
  });
  const conclusion = selectConclusion({ candidates, sourceInventory, targetInventory, targetSharedInventory });
  const defaultSiteId = clean(conclusion.defaultRow?.site_id || "");
  const outputSummary = sanitizeForPublic({
    task_id: BACKUP_LANDING_PAGE_INVENTORY_TASK_ID,
    resource_type: "backup_landing_page",
    conclusion: conclusion.conclusion,
    controlled_default_asset_id: CONTROLLED_BACKUP_LANDING_PAGE_ASSET_ID,
    source_advertiser_id: clean(sourceAdvertiserId),
    target_advertiser_id_present: Boolean(clean(bundle.job.advertiser_id)),
    candidate_count: candidates.length,
    source_candidate_count: conclusion.candidateRows.filter((item) => item.source_match).length,
    target_match_count: conclusion.candidateRows.filter((item) => item.target_match).length,
    target_shared_match_count: conclusion.candidateRows.filter((item) => item.target_shared_match).length,
    default_site_id: defaultSiteId,
    default_source_verified: conclusion.defaultSourceVerified,
    target_already_usable: conclusion.targetAlreadyUsable,
    source_page_count: sourceInventory.page_count,
    target_page_count: targetInventory.page_count,
    source_site_count: sourceInventory.site_count,
    target_site_count: targetInventory.site_count,
    source_inventory_status: sourceInventory.status,
    target_inventory_status: targetInventory.status,
    target_shared_inventory_status: targetSharedInventory.status,
    source_page_summaries: sourceInventory.page_summaries,
    target_page_summaries: targetInventory.page_summaries,
    target_shared_page_summaries: targetSharedInventory.page_summaries,
    source_response_hash: sourceInventory.response_hash,
    target_response_hash: targetInventory.response_hash,
    target_shared_response_hash: targetSharedInventory.response_hash,
    target_orange_site_auxiliary: {
      status: orangeProbe.status,
      http_status: orangeProbe.http_status,
      api_code: orangeProbe.api_code,
      request_id_present: orangeProbe.request_id_present,
      response_hash_present: orangeProbe.response_hash_present,
      site_count: orangeProbe.site_count,
      auxiliary_only: true
    },
    candidates: conclusion.candidateRows,
    cross_account_path: {
      source_chain: "local_folder_to_material_account_to_target_account",
      local_folder_required_for_this_inventory: false,
      handsel_contract_present: true,
      copy_contract_present: true,
      handsel_content_retention_safe: false,
      write_allowed_this_cycle: false,
      next_action: "Review content-preserving official contract and create a separately authorized handsel/copy task before any platform write."
    },
    platform_write_called: false,
    create_called: false,
    push_called: false,
    token_refresh_called: false,
    raw_request_stored: false,
    raw_response_stored: false,
    full_url_stored: false,
    prepare_supported: false
  });
  let evidenceRef = "";
  if (record) {
    evidenceRef = await writeInventoryEvidence({ repo, bundle, outputSummary });
    const outputWithEvidence = { ...outputSummary, evidence_ref: evidenceRef, evidenceRef };
    await persistInventory({
      repo,
      bundle,
      candidates,
      conclusion,
      outputSummary: outputWithEvidence,
      evidenceRef,
      sourceAdvertiserId
    });
    const resultForRecord = {
      status: conclusion.status,
      blockers: conclusion.blockers,
      outputSummary: outputWithEvidence,
      evidenceRefs: evidenceRef ? [evidenceRef] : []
    };
    await recordSkillRun({
      repo,
      bundle,
      definition: skillDefinition(BACKUP_LANDING_PAGE_INVENTORY_SKILL_KEY),
      input: {
        route_id: bundle.job.route_id,
        game_code: bundle.job.game_code,
        advertiser_id: bundle.job.advertiser_id,
        source_advertiser_id: sourceAdvertiserId,
        controlled_default_asset_id: CONTROLLED_BACKUP_LANDING_PAGE_ASSET_ID,
        readonly: true
      },
      result: resultForRecord,
      startedAt
    });
    const result = resultForRecord;
    assertNoSensitiveLeak(result);
    return result;
  }
  const result = {
    status: conclusion.status,
    blockers: conclusion.blockers,
    outputSummary,
    evidenceRefs: []
  };
  assertNoSensitiveLeak(result);
  return result;
}

export async function createBackupLandingPageInventoryJob({
  repo,
  caseId,
  routeId,
  gameCode,
  advertiserId,
  sourceUsage = "runtime_truth",
  sourceRecordRef = BACKUP_LANDING_PAGE_INVENTORY_TASK_ID
}) {
  const jobId = `JOB-MWBV2-BACKUP-LANDING-INVENTORY-${safeJobSuffix()}`;
  await repo.createLaunchJob({
    jobId,
    caseId,
    routeId,
    gameCode,
    advertiserId,
    objectType: "resource_readonly_inventory",
    sourceRecordRef,
    sourceUsage
  });
  return jobId;
}
