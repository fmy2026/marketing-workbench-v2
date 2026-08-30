import { createOceanEngineReadonlyClient } from "../../../platforms/oceanengineReadonlyClient.mjs";
import { assertNoSensitiveLeak, hashValue, sanitizeForPublic } from "./00-contracts.mjs";
import { readonlyPermissionState } from "./00-readonly-permission.mjs";
import { clean, resource, resourceReady } from "./04-resource-verifiers.mjs";

const EVENT_ASSET_TYPE = "MINI_PROGRAME";
const MAX_EVENT_ASSET_PAGES = 20;
const MAX_EVENT_ASSET_DETAILS = 50;

function valuesByKey(value, keys) {
  const wanted = new Set(keys);
  const found = [];
  const walk = (item) => {
    if (Array.isArray(item)) {
      item.forEach(walk);
      return;
    }
    if (!item || typeof item !== "object") return;
    Object.entries(item).forEach(([key, child]) => {
      if (wanted.has(key) && clean(child)) found.push(clean(child));
      walk(child);
    });
  };
  walk(value);
  return [...new Set(found)];
}

function arraysByKey(value, keys) {
  const wanted = new Set(keys);
  const found = [];
  const walk = (item) => {
    if (Array.isArray(item)) {
      item.forEach(walk);
      return;
    }
    if (!item || typeof item !== "object") return;
    Object.entries(item).forEach(([key, child]) => {
      if (wanted.has(key) && Array.isArray(child)) found.push(...child);
      walk(child);
    });
  };
  walk(value);
  return found;
}

function eventAssets(payload = {}) {
  const direct = [
    payload.data?.asset_list,
    payload.data?.list,
    payload.asset_list,
    payload.list
  ].find(Array.isArray);
  return direct || arraysByKey(payload.data || payload, ["asset_list"]);
}

function firstByKey(value, keys) {
  return valuesByKey(value, keys)[0] || "";
}

function normalizeAsset(asset = {}) {
  return {
    id: clean(asset.asset_id || asset.id),
    type: clean(asset.asset_type || asset.type),
    appId: firstByKey(asset, ["app_id", "mini_program_id", "mini_program_app_id"]),
    shareType: clean(asset.share_type || asset.share_status || asset.sharing_status)
  };
}

function pageInfo(payload = {}) {
  const info = payload.data?.page_info || payload.page_info || {};
  const totalPage = Number(info.total_page || info.totalPage || 1);
  return Number.isInteger(totalPage) && totalPage > 0 ? totalPage : 1;
}

function appAndInstanceCandidate(bundle = {}) {
  const item = resource(bundle, "micro_app_instance");
  const app = bundle.platformApp || {};
  const sources = [
    [clean(item.platform_resource_id), resourceReady(item) ? "target_resource_record" : "account_resource_candidate"],
    [clean(item.metadata?.micro_app_instance_id), "account_resource_metadata"],
    [clean(item.metadata?.instance_id), "account_resource_metadata"],
    [clean(app.metadata?.micro_app_instance_id), clean(app.metadata?.micro_app_instance_id_source) || "platform_app_reference"]
  ].filter(([id]) => id);
  const distinct = [...new Map(sources.map(([id, source]) => [id, source])).entries()];
  return {
    appId: clean(app.app_id),
    appType: clean(app.app_type),
    appStatus: clean(app.status),
    instanceId: distinct.length === 1 ? distinct[0][0] : "",
    instanceSource: distinct.length === 1 ? distinct[0][1] : "",
    instanceCandidateCount: distinct.length,
    instanceCandidateAmbiguous: distinct.length > 1,
    instanceReferenceOnly: distinct.length === 1 && /reference|candidate/i.test(distinct[0][1])
  };
}

function routeQuery(bundle = {}, { assetId = "", instanceId = "" } = {}) {
  const raw = bundle.defaults?.raw_defaults || {};
  const project = raw.payload_defaults?.project || {};
  const strategy = raw.payload_defaults?.strategy || {};
  const objective = clean(bundle.defaults?.objective || raw.optimization?.external_action);
  const deepObjective = clean(bundle.defaults?.deep_objective || raw.optimization?.deep_external_action);
  const deepBidType = clean(bundle.defaults?.deep_bid_type || raw.optimization?.deep_bid_type);
  return {
    query: {
      advertiser_id: clean(bundle.job?.advertiser_id),
      landing_type: clean(project.landing_type) || "MICRO_GAME",
      ad_type: clean(project.ad_type) || "ALL",
      delivery_mode: clean(project.delivery_mode) || "PROCEDURAL",
      delivery_type: clean(strategy.delivery_type) || "NORMAL",
      marketing_goal: clean(project.marketing_goal) || "VIDEO_AND_IMAGE",
      delivery_medium: clean(strategy.delivery_medium) || "BYTE_GAME",
      micro_promotion_type: clean(strategy.micro_promotion_type) || "BYTE_GAME",
      mini_program_id: appAndInstanceCandidate(bundle).appId,
      micro_app_instance_id: instanceId,
      asset_id: assetId
    },
    objective,
    deepObjective,
    deepBidType
  };
}

function summarizeGoals(payload = {}, expected = {}) {
  const externalActions = valuesByKey(payload, ["external_action"]);
  const deepExternalActions = valuesByKey(payload, ["deep_external_action"]);
  const assetIds = valuesByKey(payload, ["asset_id", "asset_ids"]);
  return {
    goalCount: valuesByKey(payload, ["optimization_name", "external_action"]).length,
    objectiveFound: externalActions.includes(expected.objective),
    deepObjectiveFound: deepExternalActions.includes(expected.deepObjective),
    assetReferenceConsistent: !assetIds.length || assetIds.includes(expected.assetId)
  };
}

function summarizeDbt(payload = {}, expected = {}) {
  return {
    deepBidTypeCount: valuesByKey(payload, ["deep_bid_type"]).length,
    deepBidTypeFound: valuesByKey(payload, ["deep_bid_type"]).includes(expected.deepBidType)
  };
}

function safeProbe(probe = {}) {
  probe = probe || {};
  return {
    endpoint: clean(probe.endpoint),
    status: clean(probe.status),
    httpStatus: probe.httpStatus ?? null,
    apiCode: clean(probe.apiCode),
    requestIdPresent: probe.requestIdPresent === true,
    responseHashPresent: Boolean(probe.responseHash)
  };
}

function eventContractFor({ status, blockers, candidate, inventory, goalProbe, goalSummary, dbtProbe, dbtSummary, instance }) {
  return sanitizeForPublic({
    status,
    blocker_codes: [...new Set(blockers)],
    event_asset_type: EVENT_ASSET_TYPE,
    inventory_page_count: inventory.pageCount,
    inventory_candidate_count: inventory.candidateCount,
    app_bound_candidate_count: inventory.appBoundCandidateCount,
    event_asset_id_present: Boolean(candidate?.id),
    event_asset_target_readback_verified: status === "passed",
    target_app_binding_verified: inventory.appBoundCandidateCount === 1,
    target_instance_candidate_present: Boolean(instance.instanceId),
    target_instance_candidate_count: instance.instanceCandidateCount,
    target_instance_reference_only: instance.instanceReferenceOnly,
    target_instance_readback_verified: status === "passed",
    optimized_goal_status: safeProbe(goalProbe).status || "not_called",
    optimized_goal: safeProbe(goalProbe),
    optimized_goal_count: Number(goalSummary?.goalCount || 0),
    objective_found: goalSummary?.objectiveFound === true,
    deep_objective_found: goalSummary?.deepObjectiveFound === true,
    event_asset_referenced: goalSummary?.assetReferenceConsistent === true,
    dbt_status: safeProbe(dbtProbe).status || "not_called",
    dbt: safeProbe(dbtProbe),
    deep_bid_type_found: dbtSummary?.deepBidTypeFound === true,
    platform_write_called: false,
    token_refresh_called: false,
    raw_request_stored: false,
    raw_response_stored: false
  });
}

async function readInventory({ bundle, client }) {
  const inventory = [];
  const probes = [];
  let totalPages = 1;
  for (let page = 1; page <= totalPages && page <= MAX_EVENT_ASSET_PAGES; page += 1) {
    const probe = await client.get({
      label: "event_chain_asset_list",
      endpoint: "tools/event/all_assets/list",
      query: {
        advertiser_id: clean(bundle.job?.advertiser_id),
        filtering: JSON.stringify({ asset_type: EVENT_ASSET_TYPE }),
        page: String(page),
        page_size: "100"
      },
      requestFieldManifest: {
        fieldNames: ["advertiser_id", "filtering", "page", "page_size"],
        rawQueryStored: false
      },
      summarize: (payload) => ({
        totalPages: pageInfo(payload),
        assets: eventAssets(payload).map(normalizeAsset)
      })
    });
    probes.push(probe);
    if (probe.status !== "passed") {
      return { status: "blocked", blockers: ["event_asset_inventory_readonly_failed"], probes, items: [] };
    }
    totalPages = Number(probe.summary?.totalPages || 1);
    if (!Number.isInteger(totalPages) || totalPages < page) totalPages = page;
    inventory.push(...(probe.summary?.assets || []));
  }
  if (totalPages > MAX_EVENT_ASSET_PAGES) {
    return { status: "blocked", blockers: ["event_asset_inventory_page_limit_exceeded"], probes, items: [] };
  }
  return { status: "passed", blockers: [], probes, items: inventory };
}

async function detailCandidates({ bundle, client, candidates = [] }) {
  if (candidates.length > MAX_EVENT_ASSET_DETAILS) {
    return { details: [], probes: [], blockers: ["event_asset_candidate_limit_exceeded"] };
  }
  const details = [];
  const probes = [];
  for (const candidate of candidates) {
    const probe = await client.get({
      label: "event_chain_asset_detail",
      endpoint: "tools/event/all_assets/detail",
      query: {
        advertiser_id: clean(bundle.job?.advertiser_id),
        asset_ids: [candidate.id]
      },
      requestFieldManifest: {
        fieldNames: ["advertiser_id", "asset_ids"],
        rawQueryStored: false
      },
      summarize: (payload) => ({ assets: eventAssets(payload).map(normalizeAsset) })
    });
    probes.push(probe);
    if (probe.status !== "passed") continue;
    const detail = (probe.summary?.assets || []).find((asset) => asset.id === candidate.id) || {};
    details.push({ ...candidate, ...detail, id: candidate.id, shareType: candidate.shareType || detail.shareType });
  }
  return { details, probes, blockers: [] };
}

function classifyEventCandidate({ inventoryResult, details, appId }) {
  if (inventoryResult.status !== "passed") {
    return { candidate: null, blockers: inventoryResult.blockers || ["event_asset_inventory_readonly_failed"], inventory: { pageCount: inventoryResult.probes.length, candidateCount: 0, appBoundCandidateCount: 0 } };
  }
  const listed = inventoryResult.items.filter((asset) => asset.type === EVENT_ASSET_TYPE && asset.id && !/EXPIRED/i.test(asset.shareType));
  if (!listed.length) {
    return { candidate: null, blockers: ["event_asset_target_not_found"], inventory: { pageCount: inventoryResult.probes.length, candidateCount: 0, appBoundCandidateCount: 0 } };
  }
  const appBound = details.filter((asset) => asset.type === EVENT_ASSET_TYPE && asset.id && asset.appId === appId && !/EXPIRED/i.test(asset.shareType));
  const inventory = { pageCount: inventoryResult.probes.length, candidateCount: listed.length, appBoundCandidateCount: appBound.length };
  if (!appId) return { candidate: null, blockers: ["event_asset_app_binding_unverified"], inventory };
  if (!appBound.length) return { candidate: null, blockers: ["event_asset_app_binding_unverified"], inventory };
  if (appBound.length > 1) return { candidate: null, blockers: ["event_asset_target_ambiguous"], inventory };
  return { candidate: appBound[0], blockers: [], inventory };
}

async function persistEventChain({ repo, bundle, status, blockers, contract, candidate }) {
  if (!repo?.updateAccountResourceReadonly || !bundle?.job) return;
  const baseReadonly = {
    status,
    key: "event_chain_readonly",
    gap: blockers.join(","),
    next_action: status === "passed" ? "无需动作" : "完成目标账户事件资产与小游戏目标链准备后重新只读核验。",
    checked_at: new Date().toISOString(),
    evidence_refs: contract.evidence_ref ? [contract.evidence_ref] : []
  };
  await repo.updateAccountResourceReadonly({
    routeId: bundle.job.route_id,
    gameCode: bundle.job.game_code,
    advertiserId: bundle.job.advertiser_id,
    resourceType: "event_asset",
    visibilityStatus: status === "passed" ? "visible" : undefined,
    readbackStatus: status === "passed" ? "readback_verified" : undefined,
    platformResourceId: status === "passed" ? candidate?.id || "" : undefined,
    inheritanceStatus: status === "passed" ? "target_readonly_verified" : "target_readonly_blocked",
    metadata: baseReadonly,
    resourceMetadata: { event_chain_readonly_contract: contract }
  });
  await repo.updateAccountResourceReadonly({
    routeId: bundle.job.route_id,
    gameCode: bundle.job.game_code,
    advertiserId: bundle.job.advertiser_id,
    resourceType: "micro_app_instance",
    visibilityStatus: status === "passed" ? "visible" : undefined,
    readbackStatus: status === "passed" ? "readback_verified" : undefined,
    platformResourceId: status === "passed" ? appAndInstanceCandidate(bundle).instanceId : undefined,
    inheritanceStatus: status === "passed" ? "target_readonly_verified" : "target_readonly_blocked",
    metadata: baseReadonly,
    resourceMetadata: { event_chain_readonly_contract: contract }
  });
}

async function writeEvidence({ repo, bundle, contract }) {
  if (!repo?.upsertEvidence || !bundle?.job) return "";
  const artifactId = `EV-${bundle.job.job_id}-EVENT-CHAIN-READONLY`;
  const summary = [
    `status=${contract.status}`,
    `blocker_count=${contract.blocker_codes.length}`,
    `inventory_pages=${contract.inventory_page_count}`,
    `inventory_candidates=${contract.inventory_candidate_count}`,
    `app_bound_candidates=${contract.app_bound_candidate_count}`,
    `event_asset_id_present=${contract.event_asset_id_present}`,
    `instance_candidate_present=${contract.target_instance_candidate_present}`,
    `reference_candidate=${contract.target_instance_reference_only}`,
    `optimized_goal_status=${contract.optimized_goal_status}`,
    `dbt_status=${contract.dbt_status}`,
    `request_id_present=${contract.optimized_goal.requestIdPresent || contract.dbt.requestIdPresent}`,
    "raw_response_stored=false"
  ].join("; ");
  await repo.upsertEvidence({
    artifactId,
    jobId: bundle.job.job_id,
    artifactType: "event_chain_readonly",
    title: "JSZC 事件资产与小游戏实例只读链路",
    summary,
    contentHash: hashValue(contract),
    storageRef: `postgres:mwb.evidence_artifacts/${artifactId}`,
    sourceRef: "oceanengine:event_asset_detail_optimized_goal_dbt",
    sourceUsage: bundle.job.source_usage || "runtime_truth"
  });
  return artifactId;
}

export function eventChainResourceReadiness({ bundle = {}, resourceType }) {
  const item = resource(bundle, resourceType);
  const contract = item.metadata?.event_chain_readonly_contract || {};
  const passed = contract.status === "passed" && resourceReady(item);
  const fallback = resourceType === "event_asset" ? "event_asset_target_not_found" : "micro_app_instance_target_unverified";
  const blockers = passed ? [] : (contract.blocker_codes?.length ? contract.blocker_codes : [fallback]);
  return sanitizeForPublic({
    status: passed ? "passed" : "blocked",
    blockers,
    evidenceRefs: item.metadata?.readonly_check?.evidence_refs || [],
    outputSummary: {
      resourceType,
      label: resourceType === "event_asset" ? "事件资产" : "小程序实例",
      visibilityStatus: item.visibility_status || "missing",
      readbackStatus: item.readback_status || "missing",
      readonlyStatus: clean(item.metadata?.readonly_check?.status || contract.status || "not_run"),
      ready: passed,
      platformResourceIdPresent: Boolean(item.platform_resource_id),
      eventChainStatus: clean(contract.status || "not_run"),
      eventAssetTargetReadbackVerified: contract.event_asset_target_readback_verified === true,
      targetAppBindingVerified: contract.target_app_binding_verified === true,
      targetInstanceCandidatePresent: contract.target_instance_candidate_present === true,
      targetInstanceReferenceOnly: contract.target_instance_reference_only === true,
      targetInstanceReadbackVerified: contract.target_instance_readback_verified === true,
      objectiveFound: contract.objective_found === true,
      deepObjectiveFound: contract.deep_objective_found === true,
      deepBidTypeFound: contract.deep_bid_type_found === true,
      nextAction: passed ? "无需动作" : "完成目标账户事件资产、小游戏实例与优化目标链准备后重新只读核验。"
    }
  });
}

export async function runEventChainReadonlySkill({
  repo,
  bundle,
  client = createOceanEngineReadonlyClient(),
  allowReadonlyDependency = false,
  mockReady = false
} = {}) {
  if (!repo || !bundle?.job) throw new Error("launch_job_bundle_required");
  if (mockReady) {
    return {
      status: "mock_passed",
      blockers: [],
      outputSummary: {
        eventChainStatus: "mock_passed",
        platformWriteCalled: false,
        tokenRefreshCalled: false,
        rawResponseStored: false
      }
    };
  }
  const permission = readonlyPermissionState({ allowReadonlyDependency });
  if (!permission.allowed) {
    return {
      status: "blocked",
      blockers: ["readonly_permission_required"],
      outputSummary: { eventChainStatus: "blocked", platformWriteCalled: false, tokenRefreshCalled: false }
    };
  }
  const credential = client.credentialState();
  if (credential.status !== "ready") {
    return {
      status: "blocked",
      blockers: ["credential_required", ...(credential.blockers || [])],
      outputSummary: { eventChainStatus: "blocked", platformWriteCalled: false, tokenRefreshCalled: false }
    };
  }

  const instance = appAndInstanceCandidate(bundle);
  const inventoryResult = await readInventory({ bundle, client });
  const detailResult = inventoryResult.status === "passed"
    ? await detailCandidates({ bundle, client, candidates: inventoryResult.items.filter((asset) => asset.type === EVENT_ASSET_TYPE && asset.id && !/EXPIRED/i.test(asset.shareType)) })
    : { details: [], probes: [], blockers: [] };
  const event = classifyEventCandidate({ inventoryResult, details: detailResult.details, appId: instance.appId });
  let blockers = [...event.blockers, ...(detailResult.blockers || [])];
  if (!instance.appId || instance.appType !== "byte_mini_game" || instance.appStatus !== "active") {
    blockers.push("micro_app_platform_app_unverified");
  }
  if (instance.instanceCandidateAmbiguous) blockers.push("micro_app_instance_candidate_ambiguous");
  if (!instance.instanceId) blockers.push("micro_app_instance_candidate_missing");

  let goalProbe = null;
  let dbtProbe = null;
  let goalSummary = {};
  let dbtSummary = {};
  if (!blockers.length && event.candidate) {
    const route = routeQuery(bundle, { assetId: event.candidate.id, instanceId: instance.instanceId });
    goalProbe = await client.get({
      label: "event_chain_optimized_goal",
      endpoint: "/open_api/v3.0/event_manager/optimized_goal/get/",
      query: route.query,
      requestFieldManifest: { fieldNames: Object.keys(route.query), longIdTransport: "http_get_query_string", rawQueryStored: false },
      summarize: (payload) => summarizeGoals(payload, { objective: route.objective, deepObjective: route.deepObjective, assetId: event.candidate.id })
    });
    goalSummary = goalProbe.summary || {};
    if (goalProbe.status !== "passed") blockers.push("optimized_goal_readonly_failed");
    if (goalProbe.status === "passed" && !goalSummary.objectiveFound) blockers.push("optimized_goal_not_available");
    if (goalProbe.status === "passed" && !goalSummary.deepObjectiveFound) blockers.push("deep_objective_not_available");
    if (goalProbe.status === "passed" && goalSummary.assetReferenceConsistent !== true) blockers.push("event_asset_goal_reference_unverified");
    if (!blockers.length) {
      dbtProbe = await client.get({
        label: "event_chain_dbt",
        endpoint: "/open_api/v3.0/event_manager/dbt/get/",
        query: { ...route.query, external_action: route.objective, deep_external_action: route.deepObjective },
        requestFieldManifest: { fieldNames: [...Object.keys(route.query), "external_action", "deep_external_action"], rawQueryStored: false },
        summarize: (payload) => summarizeDbt(payload, { deepBidType: route.deepBidType })
      });
      dbtSummary = dbtProbe.summary || {};
      if (dbtProbe.status !== "passed") blockers.push("deep_bid_type_readonly_failed");
      if (dbtProbe.status === "passed" && !dbtSummary.deepBidTypeFound) blockers.push("deep_bid_type_not_available");
    }
  }

  blockers = [...new Set(blockers)];
  const status = blockers.length ? "blocked" : "passed";
  const contract = eventContractFor({
    status,
    blockers,
    candidate: event.candidate,
    inventory: event.inventory,
    goalProbe,
    goalSummary,
    dbtProbe,
    dbtSummary,
    instance
  });
  const evidenceRef = await writeEvidence({ repo, bundle, contract });
  const contractWithEvidence = { ...contract, evidence_ref: evidenceRef };
  await persistEventChain({ repo, bundle, status, blockers, contract: contractWithEvidence, candidate: event.candidate });
  const result = {
    status,
    blockers,
    evidenceRefs: evidenceRef ? [evidenceRef] : [],
    outputSummary: {
      eventChainStatus: status,
      blockerCount: blockers.length,
      eventAssetCandidateCount: contract.inventory_candidate_count,
      appBoundCandidateCount: contract.app_bound_candidate_count,
      eventAssetTargetReadbackVerified: contract.event_asset_target_readback_verified,
      targetInstanceCandidatePresent: contract.target_instance_candidate_present,
      targetInstanceReferenceOnly: contract.target_instance_reference_only,
      targetInstanceReadbackVerified: contract.target_instance_readback_verified,
      objectiveFound: contract.objective_found,
      deepObjectiveFound: contract.deep_objective_found,
      deepBidTypeFound: contract.deep_bid_type_found,
      optimizedGoalStatus: contract.optimized_goal_status,
      deepBidTypeStatus: contract.dbt_status,
      optimizedGoalApiCode: contract.optimized_goal.apiCode,
      requestIdPresent: contract.optimized_goal.requestIdPresent || contract.dbt.requestIdPresent,
      evidenceRef,
      platformWriteCalled: false,
      tokenRefreshCalled: false,
      rawRequestStored: false,
      rawResponseStored: false
    }
  };
  assertNoSensitiveLeak(result);
  return sanitizeForPublic(result);
}
