import { createOceanEngineReadonlyClient } from "../../../platforms/oceanengineReadonlyClient.mjs";
import { assertNoSensitiveLeak, hashValue, sanitizeForPublic } from "./00-contracts.mjs";
import { readonlyPermissionState } from "./00-readonly-permission.mjs";
import { clean, resource, resourceReady } from "./04-resource-verifiers.mjs";
import { evaluateEventAssetProvisionContract } from "./04-event-asset-provision-contract.mjs";
import {
  EVENT_CONFIG_BASELINE_EVENTS,
  EVENT_CONFIG_TRACK_TYPE,
  eventConfigBaselineReadiness,
  eventConfigsFromPayload,
  normalizeEventConfig
} from "./04-event-config-provision-contract.mjs";

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
    instanceId: firstByKey(asset, ["instance_id", "micro_app_instance_id", "mini_program_instance_id"]),
    shareType: clean(asset.share_type || asset.share_status || asset.sharing_status)
  };
}

function decimalJsonNumberArray(values = []) {
  const tokens = values.map(clean).filter((value) => /^\d+$/.test(value));
  return `[${tokens.join(",")}]`;
}

function summarizeAvailableEvents(payload = {}) {
  const events = eventConfigsFromPayload(payload).map(normalizeEventConfig);
  const readiness = eventConfigBaselineReadiness({ availableEvents: events, existingConfigs: [] });
  return sanitizeForPublic({
    eventCount: events.length,
    baselineAvailableCount: readiness.baseline_available_count,
    missingBaselineEventTypes: readiness.missing_available_event_types,
    baselineEventTypes: EVENT_CONFIG_BASELINE_EVENTS.map((item) => item.event_type),
    trackType: EVENT_CONFIG_TRACK_TYPE,
    readbackVerified: readiness.missing_available_event_types.length === 0
  });
}

function summarizeEventConfigs(payload = {}) {
  const configs = eventConfigsFromPayload(payload).map(normalizeEventConfig);
  const configured = configs.filter((item) =>
    EVENT_CONFIG_BASELINE_EVENTS.some((baseline) => baseline.event_type === item.event_type) &&
    item.track_types.includes(EVENT_CONFIG_TRACK_TYPE)
  );
  const missing = EVENT_CONFIG_BASELINE_EVENTS
    .map((item) => item.event_type)
    .filter((eventType) => !configured.some((item) => item.event_type === eventType));
  return sanitizeForPublic({
    eventConfigCount: configs.length,
    baselineConfiguredCount: EVENT_CONFIG_BASELINE_EVENTS.length - missing.length,
    missingBaselineEventTypes: missing,
    baselineEventTypes: EVENT_CONFIG_BASELINE_EVENTS.map((item) => item.event_type),
    trackType: EVENT_CONFIG_TRACK_TYPE,
    readbackVerified: missing.length === 0
  });
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

function microAppInstanceAuthorityReadbackVerified(bundle = {}) {
  const item = resource(bundle, "micro_app_instance");
  return resourceReady(item) || item.metadata?.event_chain_readonly_contract?.target_instance_readback_verified === true ||
    item.metadata?.micro_app_instance_authority_readonly_contract?.target_instance_readback_verified === true;
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
      ...(assetId ? { asset_id: assetId } : {})
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

function microAppInstanceAuthorityContract({ status, blockers = [], instance, probe, goalSummary = {}, evidenceRef = "" } = {}) {
  return sanitizeForPublic({
    status,
    blocker_codes: [...new Set(blockers)].filter(Boolean),
    target_instance_candidate_present: Boolean(instance?.instanceId),
    target_instance_candidate_count: Number(instance?.instanceCandidateCount || 0),
    target_instance_reference_only: instance?.instanceReferenceOnly === true,
    target_instance_readback_verified: status === "passed",
    platform_app_ready: Boolean(instance?.appId) && instance?.appType === "byte_mini_game" && instance?.appStatus === "active",
    optimized_goal_status: safeProbe(probe).status || "not_called",
    optimized_goal: safeProbe(probe),
    optimized_goal_count: Number(goalSummary?.goalCount || 0),
    objective_found: goalSummary?.objectiveFound === true,
    deep_objective_found: goalSummary?.deepObjectiveFound === true,
    evidence_ref: clean(evidenceRef),
    platform_write_called: false,
    token_refresh_called: false,
    raw_request_stored: false,
    raw_response_stored: false
  });
}

async function writeMicroAppInstanceAuthorityEvidence({ repo, bundle, contract }) {
  if (!repo?.upsertEvidence || !bundle?.job) return "";
  const artifactId = `EV-${bundle.job.job_id}-MICRO-APP-INSTANCE-AUTHORITY-READONLY`;
  const summary = [
    `status=${contract.status}`,
    `candidate_present=${contract.target_instance_candidate_present}`,
    `candidate_count=${contract.target_instance_candidate_count}`,
    `objective_found=${contract.objective_found}`,
    `deep_objective_found=${contract.deep_objective_found}`,
    `request_id_present=${contract.optimized_goal?.requestIdPresent === true}`,
    "raw_response_stored=false"
  ].join("; ");
  await repo.upsertEvidence({
    artifactId,
    jobId: bundle.job.job_id,
    artifactType: "micro_app_instance_authority_readonly",
    title: "JSZC 小游戏实例独立权威只读回查",
    summary,
    contentHash: hashValue(contract),
    storageRef: `postgres:mwb.evidence_artifacts/${artifactId}`,
    sourceRef: "oceanengine:optimized_goal:get:micro_app_instance_authority",
    sourceUsage: bundle.job.source_usage || "runtime_truth"
  });
  return artifactId;
}

export async function runMicroAppInstanceAuthorityReadonlySkill({
  repo,
  bundle,
  client = createOceanEngineReadonlyClient(),
  allowReadonlyDependency = false,
  mockReady = false
} = {}) {
  if (!repo || !bundle?.job) throw new Error("launch_job_bundle_required");
  if (mockReady) {
    return sanitizeForPublic({
      status: "mock_passed",
      blockers: [],
      outputSummary: {
        targetInstanceReadbackVerified: true,
        objectiveFound: true,
        deepObjectiveFound: true,
        platformWriteCalled: false,
        tokenRefreshCalled: false,
        rawRequestStored: false,
        rawResponseStored: false
      }
    });
  }
  const permission = readonlyPermissionState({ allowReadonlyDependency });
  if (!permission.allowed) {
    return sanitizeForPublic({
      status: "blocked",
      blockers: ["readonly_permission_required"],
      outputSummary: { targetInstanceReadbackVerified: false, platformWriteCalled: false, tokenRefreshCalled: false, rawRequestStored: false, rawResponseStored: false }
    });
  }
  const credential = client.credentialState();
  if (credential.status !== "ready") {
    return sanitizeForPublic({
      status: "blocked",
      blockers: ["credential_required", ...(credential.blockers || [])],
      outputSummary: { targetInstanceReadbackVerified: false, platformWriteCalled: false, tokenRefreshCalled: false, rawRequestStored: false, rawResponseStored: false }
    });
  }

  const instance = appAndInstanceCandidate(bundle);
  const blockers = [
    ...(bundle.job.route_id === "oceanengine_3_byte_mini_game" && bundle.job.game_code === "JSZC" ? [] : ["micro_app_instance_authority_scope_invalid"]),
    ...(instance.appId && instance.appType === "byte_mini_game" && instance.appStatus === "active" ? [] : ["micro_app_platform_app_unverified"]),
    ...(instance.instanceCandidateAmbiguous ? ["micro_app_instance_candidate_ambiguous"] : []),
    ...(instance.instanceId ? [] : ["micro_app_instance_candidate_missing"])
  ];
  let probe = null;
  let goalSummary = {};
  if (!blockers.length) {
    const route = routeQuery(bundle, { instanceId: instance.instanceId });
    probe = await client.get({
      label: "micro_app_instance_authority_optimized_goal",
      endpoint: "/open_api/v3.0/event_manager/optimized_goal/get/",
      query: route.query,
      requestFieldManifest: {
        fieldNames: Object.keys(route.query).filter((key) => key !== "asset_id"),
        longIdTransport: "http_get_query_string",
        rawQueryStored: false
      },
      summarize: (payload) => summarizeGoals(payload, {
        objective: route.objective,
        deepObjective: route.deepObjective,
        assetId: ""
      })
    });
    goalSummary = probe.summary || {};
    if (probe.status !== "passed") blockers.push("micro_app_instance_authority_readonly_failed");
    if (probe.status === "passed" && probe.requestIdPresent !== true) blockers.push("micro_app_instance_authority_request_id_missing");
    if (probe.status === "passed" && goalSummary.objectiveFound !== true) blockers.push("optimized_goal_not_available");
    if (probe.status === "passed" && goalSummary.deepObjectiveFound !== true) blockers.push("deep_objective_not_available");
  }

  const status = blockers.length ? "blocked" : "passed";
  let contract = microAppInstanceAuthorityContract({ status, blockers, instance, probe, goalSummary });
  if (status === "passed") {
    const evidenceRef = await writeMicroAppInstanceAuthorityEvidence({ repo, bundle, contract });
    contract = microAppInstanceAuthorityContract({ status, blockers, instance, probe, goalSummary, evidenceRef });
    await repo.updateAccountResourceReadonly({
      routeId: bundle.job.route_id,
      gameCode: bundle.job.game_code,
      advertiserId: bundle.job.advertiser_id,
      resourceType: "micro_app_instance",
      visibilityStatus: "visible",
      readbackStatus: "readback_verified",
      platformResourceId: instance.instanceId,
      inheritanceStatus: "target_readonly_verified",
      metadata: {
        status: "passed",
        key: "micro_app_instance_authority_readonly",
        gap: "",
        next_action: "实例权威只读回查已通过；可继续事件资产账户合同核验。",
        checked_at: new Date().toISOString(),
        evidence_refs: evidenceRef ? [evidenceRef] : []
      },
      resourceMetadata: { micro_app_instance_authority_readonly_contract: contract }
    });
  }
  const result = sanitizeForPublic({
    status,
    blockers: contract.blocker_codes,
    evidenceRefs: contract.evidence_ref ? [contract.evidence_ref] : [],
    outputSummary: {
      targetInstanceCandidatePresent: contract.target_instance_candidate_present,
      targetInstanceReferenceOnly: contract.target_instance_reference_only,
      targetInstanceReadbackVerified: contract.target_instance_readback_verified,
      objectiveFound: contract.objective_found,
      deepObjectiveFound: contract.deep_objective_found,
      optimizedGoalStatus: contract.optimized_goal_status,
      requestIdPresent: contract.optimized_goal?.requestIdPresent === true,
      evidenceRef: contract.evidence_ref,
      platformWriteCalled: false,
      tokenRefreshCalled: false,
      rawRequestStored: false,
      rawResponseStored: false
    }
  });
  assertNoSensitiveLeak(result);
  return result;
}

function eventContractFor({
  status,
  blockers,
  identityVerified = false,
  candidate,
  inventory,
  availableProbe,
  availableSummary,
  configProbe,
  configSummary,
  goalProbe,
  goalSummary,
  dbtProbe,
  dbtSummary,
  instance,
  priorInstanceReadbackVerified = false
}) {
  return sanitizeForPublic({
    status,
    blocker_codes: [...new Set(blockers)],
    event_asset_type: EVENT_ASSET_TYPE,
    inventory_page_count: inventory.pageCount,
    inventory_candidate_count: inventory.candidateCount,
    app_bound_candidate_count: inventory.appBoundCandidateCount,
    instance_bound_candidate_count: Number(inventory.instanceBoundCandidateCount ?? inventory.appBoundCandidateCount ?? 0),
    instance_binding_observable: inventory.instanceBindingObservable === true,
    app_binding_observable: inventory.appBindingObservable === true,
    candidate_selection_source: inventory.candidateSelectionSource || "",
    event_asset_id_present: Boolean(candidate?.id),
    event_asset_identity_readback_verified: identityVerified === true,
    event_asset_target_readback_verified: status === "passed",
    target_app_binding_verified: identityVerified === true,
    target_instance_candidate_present: Boolean(instance.instanceId),
    target_instance_candidate_count: instance.instanceCandidateCount,
    target_instance_reference_only: instance.instanceReferenceOnly,
    target_instance_readback_verified: (status === "passed" &&
      (inventory.instanceBindingObservable !== true || Number(inventory.instanceBoundCandidateCount || 0) === 1)) ||
      priorInstanceReadbackVerified === true,
    available_events_status: safeProbe(availableProbe).status || "not_called",
    available_events: safeProbe(availableProbe),
    available_event_count: Number(availableSummary?.eventCount || 0),
    baseline_available_event_count: Number(availableSummary?.baselineAvailableCount || 0),
    available_events_readback_verified: availableSummary?.readbackVerified === true,
    available_events_missing_types: availableSummary?.missingBaselineEventTypes || [],
    event_configs_status: safeProbe(configProbe).status || "not_called",
    event_configs: safeProbe(configProbe),
    event_config_count: Number(configSummary?.eventConfigCount || 0),
    baseline_configured_event_count: Number(configSummary?.baselineConfiguredCount || 0),
    event_configs_readback_verified: configSummary?.readbackVerified === true,
    event_configs_missing_types: configSummary?.missingBaselineEventTypes || [],
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
        asset_ids: decimalJsonNumberArray([candidate.id])
      },
      requestFieldManifest: {
        fieldNames: ["advertiser_id", "asset_ids"],
        longIdTransport: "json_decimal_number_array_query_string",
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

function classifyEventCandidate({ inventoryResult, details, appId, instanceId = "" }) {
  if (inventoryResult.status !== "passed") {
    return { candidate: null, blockers: inventoryResult.blockers || ["event_asset_inventory_readonly_failed"], inventory: { pageCount: inventoryResult.probes.length, candidateCount: 0, appBoundCandidateCount: 0, instanceBoundCandidateCount: 0, instanceBindingObservable: false, appBindingObservable: false, candidateSelectionSource: "" } };
  }
  const listed = inventoryResult.items.filter((asset) => asset.type === EVENT_ASSET_TYPE && asset.id && !/EXPIRED/i.test(asset.shareType));
  if (!listed.length) {
    return { candidate: null, blockers: ["event_asset_target_not_found"], inventory: { pageCount: inventoryResult.probes.length, candidateCount: 0, appBoundCandidateCount: 0, instanceBoundCandidateCount: 0, instanceBindingObservable: false, appBindingObservable: false, candidateSelectionSource: "" } };
  }
  const appBindingObservable = details.some((asset) => clean(asset.appId));
  const appBound = details.filter((asset) => asset.type === EVENT_ASSET_TYPE && asset.id && asset.appId === appId && !/EXPIRED/i.test(asset.shareType));
  const instanceBindingObservable = appBound.some((asset) => clean(asset.instanceId));
  const instanceBound = instanceBindingObservable
    ? appBound.filter((asset) => clean(asset.instanceId) === clean(instanceId))
    : appBound;
  const inventory = {
    pageCount: inventoryResult.probes.length,
    candidateCount: listed.length,
    appBoundCandidateCount: appBound.length,
    instanceBoundCandidateCount: instanceBound.length,
    instanceBindingObservable,
    appBindingObservable,
    candidateSelectionSource: ""
  };
  if (!appId) return { candidate: null, blockers: ["event_asset_app_binding_unverified"], inventory };
  if (!appBound.length && appBindingObservable) return { candidate: null, blockers: ["event_asset_app_binding_unverified"], inventory };
  if (!appBound.length && listed.length === 1) {
    return {
      candidate: listed[0],
      blockers: [],
      inventory: {
        ...inventory,
        candidateSelectionSource: "single_mini_program_inventory_candidate_without_detail_app_field"
      }
    };
  }
  if (!appBound.length) return { candidate: null, blockers: ["event_asset_target_ambiguous"], inventory };
  if (instanceBindingObservable && !instanceId) return { candidate: null, blockers: ["micro_app_instance_candidate_missing"], inventory };
  if (instanceBindingObservable && !instanceBound.length) return { candidate: null, blockers: ["event_asset_instance_binding_unverified"], inventory };
  if (instanceBound.length > 1) return { candidate: null, blockers: ["event_asset_target_ambiguous"], inventory };
  return {
    candidate: instanceBound[0],
    blockers: [],
    inventory: {
      ...inventory,
      candidateSelectionSource: instanceBindingObservable ? "detail_app_and_instance_bound" : "detail_app_bound"
    }
  };
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
    platformResourceId: contract.event_asset_identity_readback_verified === true ? candidate?.id || "" : undefined,
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
    `available_events_status=${contract.available_events_status}`,
    `baseline_available_events=${contract.baseline_available_event_count}/${EVENT_CONFIG_BASELINE_EVENTS.length}`,
    `event_configs_status=${contract.event_configs_status}`,
    `baseline_event_configs=${contract.baseline_configured_event_count}/${EVENT_CONFIG_BASELINE_EVENTS.length}`,
    `optimized_goal_status=${contract.optimized_goal_status}`,
    `dbt_status=${contract.dbt_status}`,
    `request_id_present=${contract.available_events.requestIdPresent || contract.event_configs.requestIdPresent || contract.optimized_goal.requestIdPresent || contract.dbt.requestIdPresent}`,
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
  const instanceAuthorityPassed = resourceType === "micro_app_instance" && microAppInstanceAuthorityReadbackVerified(bundle);
  const passed = (contract.status === "passed" && resourceReady(item)) || instanceAuthorityPassed;
  const fallback = resourceType === "event_asset" ? "event_asset_target_not_found" : "micro_app_instance_target_unverified";
  const provision = resourceType === "event_asset" ? evaluateEventAssetProvisionContract({ bundle }) : null;
  const blockers = passed
    ? []
    : [...new Set([
      ...(contract.blocker_codes?.length ? contract.blocker_codes : [fallback]),
      ...(provision?.blockers || [])
    ])];
  return sanitizeForPublic({
    status: passed ? "passed" : "blocked",
    blockers,
    evidenceRefs: item.metadata?.readonly_check?.evidence_refs || [],
    outputSummary: {
      resourceType,
      label: resourceType === "event_asset" ? "事件资产" : "小程序实例",
      visibilityStatus: item.visibility_status || "missing",
      readbackStatus: item.readback_status || "missing",
      readonlyStatus: clean(item.metadata?.readonly_check?.status || contract.status || (instanceAuthorityPassed ? "passed" : "not_run")),
      ready: passed,
      platformResourceIdPresent: Boolean(item.platform_resource_id),
      eventChainStatus: clean(contract.status || (instanceAuthorityPassed ? "instance_authority_readonly_passed" : "not_run")),
      eventAssetTargetReadbackVerified: contract.event_asset_target_readback_verified === true,
      eventAssetIdentityReadbackVerified: contract.event_asset_identity_readback_verified === true,
      event_asset_identity_readback_verified: contract.event_asset_identity_readback_verified === true,
      targetAppBindingVerified: contract.target_app_binding_verified === true,
      targetInstanceCandidatePresent: contract.target_instance_candidate_present === true,
      instanceBindingObservable: contract.instance_binding_observable === true,
      instanceBoundCandidateCount: Number(contract.instance_bound_candidate_count || 0),
      targetInstanceReferenceOnly: contract.target_instance_reference_only === true,
      targetInstanceReadbackVerified: microAppInstanceAuthorityReadbackVerified(bundle),
      availableEventsStatus: contract.available_events_status || "not_run",
      available_events_status: contract.available_events_status || "not_run",
      baselineAvailableEventCount: Number(contract.baseline_available_event_count || 0),
      baseline_available_event_count: Number(contract.baseline_available_event_count || 0),
      availableEventsReadbackVerified: contract.available_events_readback_verified === true,
      available_events_readback_verified: contract.available_events_readback_verified === true,
      eventConfigsStatus: contract.event_configs_status || "not_run",
      event_configs_status: contract.event_configs_status || "not_run",
      baselineConfiguredEventCount: Number(contract.baseline_configured_event_count || 0),
      baseline_configured_event_count: Number(contract.baseline_configured_event_count || 0),
      eventConfigsReadbackVerified: contract.event_configs_readback_verified === true,
      event_configs_readback_verified: contract.event_configs_readback_verified === true,
      objectiveFound: contract.objective_found === true,
      deepObjectiveFound: contract.deep_objective_found === true,
      deepBidTypeFound: contract.deep_bid_type_found === true,
      ...(provision ? {
        eventAssetProvisionStatus: provision.status,
        event_asset_provision_status: provision.status,
        eventAssetProvisionPlanEligible: provision.outputSummary?.planEligible === true,
        event_asset_provision_plan_eligible: provision.outputSummary?.planEligible === true,
        eventAssetProvisionTemplateStatus: provision.outputSummary?.templateStatus || "missing",
        event_asset_provision_template_status: provision.outputSummary?.templateStatus || "missing",
        eventAssetCreateContractStatus: provision.outputSummary?.officialCreateContractStatus || "missing",
        event_asset_create_contract_status: provision.outputSummary?.officialCreateContractStatus || "missing"
      } : {}),
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
  const event = classifyEventCandidate({
    inventoryResult,
    details: detailResult.details,
    appId: instance.appId,
    instanceId: instance.instanceId
  });
  let blockers = [...event.blockers, ...(detailResult.blockers || [])];
  if (!instance.appId || instance.appType !== "byte_mini_game" || instance.appStatus !== "active") {
    blockers.push("micro_app_platform_app_unverified");
  }
  if (instance.instanceCandidateAmbiguous) blockers.push("micro_app_instance_candidate_ambiguous");
  if (!instance.instanceId) blockers.push("micro_app_instance_candidate_missing");
  const identityVerified = blockers.length === 0 && Boolean(event.candidate?.id);

  let goalProbe = null;
  let dbtProbe = null;
  let availableProbe = null;
  let configProbe = null;
  let goalSummary = {};
  let dbtSummary = {};
  let availableSummary = {};
  let configSummary = {};
  let availableBlockers = [];
  if (!blockers.length && event.candidate) {
    availableProbe = await client.get({
      label: "event_chain_available_events",
      endpoint: "https://ad.oceanengine.com/open_api/2/event_manager/available_events/get/",
      query: {
        advertiser_id: clean(bundle.job?.advertiser_id),
        asset_id: event.candidate.id
      },
      requestFieldManifest: {
        fieldNames: ["advertiser_id", "asset_id"],
        rawQueryStored: false
      },
      summarize: summarizeAvailableEvents
    });
    availableSummary = availableProbe.summary || {};
    if (availableProbe.status !== "passed") availableBlockers.push("available_events_readonly_failed");
    if (availableProbe.status === "passed" && availableSummary.readbackVerified !== true) {
      availableBlockers.push("available_events_baseline_missing");
    }
  }
  if (!blockers.length && event.candidate) {
    configProbe = await client.get({
      label: "event_chain_event_configs",
      endpoint: "https://ad.oceanengine.com/open_api/2/event_manager/event_configs/get/",
      query: {
        advertiser_id: clean(bundle.job?.advertiser_id),
        asset_id: event.candidate.id,
        sort_type: "DESC"
      },
      requestFieldManifest: {
        fieldNames: ["advertiser_id", "asset_id", "sort_type"],
        rawQueryStored: false
      },
      summarize: summarizeEventConfigs
    });
    configSummary = configProbe.summary || {};
    if (configProbe.status !== "passed") blockers.push("event_configs_readonly_failed");
    if (configProbe.status === "passed" && configSummary.readbackVerified !== true) {
      blockers.push("event_configs_baseline_missing");
      blockers.push(...availableBlockers);
    }
    if (configProbe.status !== "passed") {
      blockers.push(...availableBlockers);
    }
  }
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
  const priorInstanceReadbackVerified = microAppInstanceAuthorityReadbackVerified(bundle);
  const contract = eventContractFor({
    status,
    blockers,
    identityVerified,
    candidate: event.candidate,
    inventory: event.inventory,
    availableProbe,
    availableSummary,
    configProbe,
    configSummary,
    goalProbe,
    goalSummary,
    dbtProbe,
    dbtSummary,
    instance,
    priorInstanceReadbackVerified
  });
  const evidenceRef = await writeEvidence({ repo, bundle, contract });
  const contractWithEvidence = { ...contract, evidence_ref: evidenceRef };
  await persistEventChain({ repo, bundle, status, blockers, contract: contractWithEvidence, candidate: event.candidate });
  const result = {
    status,
    blockers,
    runtimeEventAssetId: identityVerified ? event.candidate?.id || "" : "",
    evidenceRefs: evidenceRef ? [evidenceRef] : [],
    outputSummary: {
      eventChainStatus: status,
      blockerCount: blockers.length,
      eventAssetCandidateCount: contract.inventory_candidate_count,
      appBoundCandidateCount: contract.app_bound_candidate_count,
      eventAssetTargetReadbackVerified: contract.event_asset_target_readback_verified,
      eventAssetIdentityReadbackVerified: contract.event_asset_identity_readback_verified,
      targetInstanceCandidatePresent: contract.target_instance_candidate_present,
      targetInstanceReferenceOnly: contract.target_instance_reference_only,
      targetInstanceReadbackVerified: contract.target_instance_readback_verified,
      availableEventsStatus: contract.available_events_status,
      baselineAvailableEventCount: contract.baseline_available_event_count,
      availableEventsReadbackVerified: contract.available_events_readback_verified,
      availableEventsMissingTypes: contract.available_events_missing_types,
      eventConfigsStatus: contract.event_configs_status,
      baselineConfiguredEventCount: contract.baseline_configured_event_count,
      eventConfigsReadbackVerified: contract.event_configs_readback_verified,
      eventConfigsMissingTypes: contract.event_configs_missing_types,
      objectiveFound: contract.objective_found,
      deepObjectiveFound: contract.deep_objective_found,
      deepBidTypeFound: contract.deep_bid_type_found,
      optimizedGoalStatus: contract.optimized_goal_status,
      deepBidTypeStatus: contract.dbt_status,
      optimizedGoalApiCode: contract.optimized_goal.apiCode,
      requestIdPresent: contract.available_events.requestIdPresent ||
        contract.event_configs.requestIdPresent ||
        contract.optimized_goal.requestIdPresent ||
        contract.dbt.requestIdPresent,
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
