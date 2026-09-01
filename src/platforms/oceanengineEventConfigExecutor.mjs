import {
  assertNoSensitiveLeak,
  hashValue,
  sanitizeForPublic
} from "../workflows/skills/oe3/00-contracts.mjs";
import { buildLosslessJsonWireBody } from "../workflows/skills/oe3/05-std-project-create-wire-body.mjs";
import { runEventChainReadonlySkill } from "../workflows/skills/oe3/04-event-chain-readiness.mjs";
import {
  EVENT_CONFIGS_PROVISION_ACTION,
  EVENT_CONFIG_BASELINE_EVENTS,
  EVENT_CONFIG_CREATE_ACTION_TYPE,
  EVENT_CONFIG_CREATE_ENDPOINT,
  EVENT_CONFIG_CREATE_FIELD_NAMES,
  EVENT_CONFIG_CREATE_METHOD,
  EVENT_CONFIG_TRACK_TYPE,
  buildEventConfigCreatePayload,
  eventConfigBaselineReadiness,
  eventConfigBaselineTemplateHash,
  eventConfigsFromPayload,
  normalizeEventConfig
} from "../workflows/skills/oe3/04-event-config-provision-contract.mjs";
import {
  EVENT_CONFIGS_ENSURE_CONFIRM_ENV,
  EVENT_CONFIGS_ENSURE_CONFIRM_VALUE,
  validateEventConfigsWriteScope
} from "../workflows/eventConfigExecutionScope.mjs";
import {
  credentialReady,
  getOceanEngineCredentialSummary,
  readOceanEngineEnv
} from "./oceanengineCredentialStore.mjs";
import { createOceanEngineReadonlyClient } from "./oceanengineReadonlyClient.mjs";

export const EVENT_CONFIGS_CONFIRM_ENV = EVENT_CONFIGS_ENSURE_CONFIRM_ENV;
export const EVENT_CONFIGS_CONFIRM_VALUE = EVENT_CONFIGS_ENSURE_CONFIRM_VALUE;
export const EVENT_CONFIG_CREATE_TIMEOUT_MS = 15_000;

const API_ORIGIN = "https://ad.oceanengine.com";
const EVENT_CONFIG_CREATE_FULL_ENDPOINT = `${API_ORIGIN}${EVENT_CONFIG_CREATE_ENDPOINT}`;
const EVENT_ASSET_TYPE = "MINI_PROGRAME";
const MAX_EVENT_ASSET_DETAILS = 50;

function clean(value) {
  return String(value ?? "").trim();
}

function apiCode(payload = {}) {
  return clean(payload.code ?? payload.err_no ?? payload.error_code ?? "");
}

function requestIdPresent(payload = {}) {
  return Boolean(payload.request_id || payload.data?.request_id);
}

function messageHash(payload = {}) {
  const message = clean(payload.message || payload.msg || payload.error_message || payload.error?.message || "");
  return message ? hashValue(message) : "";
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

function firstByKey(value, keys) {
  return valuesByKey(value, keys)[0] || "";
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

function normalizeAsset(asset = {}) {
  return {
    id: clean(asset.asset_id || asset.id),
    type: clean(asset.asset_type || asset.type),
    appId: firstByKey(asset, ["micro_app_id", "app_id", "mini_program_id", "mini_program_app_id"]),
    instanceId: firstByKey(asset, ["micro_app_instance_id", "instance_id", "mini_program_instance_id"]),
    shareType: clean(asset.share_type || asset.share_status || asset.sharing_status)
  };
}

function pageInfo(payload = {}) {
  const info = payload.data?.page_info || payload.page_info || {};
  const totalPage = Number(info.total_page || info.totalPage || 1);
  return Number.isInteger(totalPage) && totalPage > 0 ? totalPage : 1;
}

function assetIdHintFromBundle(bundle = {}, explicit = "") {
  return clean(
    explicit ||
    bundle.executionPlan?.metadata?.event_config_asset_id_hint ||
    bundle.executionPlan?.metadata?.planning_intent?.event_asset_id ||
    bundle.executionPlan?.metadata?.planning_intent?.asset_id_hint ||
    ""
  );
}

function compactCredential(summary = {}) {
  return {
    status: summary.status,
    env_file_present: Boolean(summary.envFilePresent),
    access_token_present: Boolean(summary.accessTokenPresent),
    refresh_token_present: Boolean(summary.refreshTokenPresent),
    token_expired: Boolean(summary.tokenExpired)
  };
}

function baselineTypes() {
  return EVENT_CONFIG_BASELINE_EVENTS.map((item) => item.event_type);
}

function plannedActionFromScope(scope = {}) {
  return scope?.action || {};
}

function childActionIdempotencyBinding({ plannedAction = {}, plan = {}, eventTypes = [] } = {}) {
  const plannedActionKey = clean(plannedAction.idempotency_key || plannedAction.idempotencyKey);
  const planId = clean(plan.plan_id || plan.planId);
  const normalizedEventTypes = eventTypes.map(clean).filter(Boolean);
  const blockers = [
    ...(!plannedActionKey ? ["event_config_planned_action_idempotency_key_missing"] : []),
    ...(!planId ? ["event_config_plan_id_missing_for_idempotency"] : []),
    ...(normalizedEventTypes.length === eventTypes.length ? [] : ["event_config_event_type_missing_for_idempotency"])
  ];
  return {
    status: blockers.length ? "blocked" : "passed",
    blockers: [...new Set(blockers)],
    keys: blockers.length
      ? new Map()
      : new Map(normalizedEventTypes.map((eventType) => [
          eventType,
          `${plannedActionKey}:${planId}:${eventType}`
        ]))
  };
}

function decimalJsonNumberArray(values = []) {
  const tokens = values.map(clean).filter((value) => /^\d+$/.test(value));
  return `[${tokens.join(",")}]`;
}

function eventConfigCreateActionId(jobId, eventType) {
  return `ACTION-${jobId}-EVENT-CONFIG-CREATE-${clean(eventType).toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;
}

function safeResponseSummary(payload = {}) {
  return sanitizeForPublic({
    api_code: apiCode(payload) || "unknown",
    request_id_present: requestIdPresent(payload),
    data_present: Boolean(payload?.data && typeof payload.data === "object"),
    message_hash: messageHash(payload),
    payload_persisted: false,
    response_persisted: false
  });
}

async function readTargetEventAsset({ bundle, client, assetIdHint = "" }) {
  const listProbe = await client.get({
    label: "event_config_asset_list",
    endpoint: "tools/event/all_assets/list",
    query: {
      advertiser_id: clean(bundle.job?.advertiser_id),
      filtering: JSON.stringify({ asset_type: EVENT_ASSET_TYPE }),
      page: "1",
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
  if (listProbe.status !== "passed") {
    return {
      status: "blocked",
      blockers: ["event_asset_inventory_readonly_failed"],
      listProbe,
      detailProbe: null,
      asset: null
    };
  }
  const candidates = (listProbe.summary?.assets || [])
    .filter((asset) => asset.id && asset.type === EVENT_ASSET_TYPE && !/EXPIRED/i.test(asset.shareType));
  const hint = clean(assetIdHint);
  let selected = null;
  let selectionSource = "";
  if (hint) {
    selected = candidates.find((asset) => asset.id === hint) || null;
    selectionSource = "plan_asset_id_hint";
  } else if (candidates.length === 1) {
    selected = candidates[0];
    selectionSource = "single_inventory_candidate";
  }
  const blockers = [
    ...(!candidates.length ? ["event_asset_target_not_found"] : []),
    ...(hint && !selected ? ["event_asset_hint_not_found_in_inventory"] : []),
    ...(!hint && candidates.length > 1 ? ["event_asset_target_ambiguous"] : []),
    ...(!selected ? ["event_asset_target_not_found"] : [])
  ];
  if (blockers.length) {
    return {
      status: "blocked",
      blockers: [...new Set(blockers)],
      listProbe,
      detailProbe: null,
      asset: null,
      candidateCount: candidates.length
    };
  }
  if (candidates.length > MAX_EVENT_ASSET_DETAILS) {
    return {
      status: "blocked",
      blockers: ["event_asset_candidate_limit_exceeded"],
      listProbe,
      detailProbe: null,
      asset: null,
      candidateCount: candidates.length
    };
  }
  const detailProbe = await client.get({
    label: "event_config_asset_detail",
    endpoint: "tools/event/all_assets/detail",
    query: {
      advertiser_id: clean(bundle.job?.advertiser_id),
      asset_ids: decimalJsonNumberArray([selected.id])
    },
    requestFieldManifest: {
      fieldNames: ["advertiser_id", "asset_ids"],
      longIdTransport: "json_decimal_number_array_query_string",
      rawQueryStored: false
    },
    summarize: (payload) => ({ assets: eventAssets(payload).map(normalizeAsset) })
  });
  if (detailProbe.status !== "passed") {
    return {
      status: "blocked",
      blockers: ["event_asset_detail_readonly_failed"],
      listProbe,
      detailProbe,
      asset: null,
      candidateCount: candidates.length
    };
  }
  const detail = (detailProbe.summary?.assets || []).find((asset) => asset.id === selected.id) || {};
  const asset = { ...selected, ...detail, id: selected.id };
  return {
    status: "passed",
    blockers: [],
    listProbe,
    detailProbe,
    asset,
    candidateCount: candidates.length,
    selectionSource
  };
}

async function readAvailableEvents({ bundle, client, assetId }) {
  const probe = await client.get({
    label: "event_config_available_events",
    endpoint: "https://ad.oceanengine.com/open_api/2/event_manager/available_events/get/",
    query: {
      advertiser_id: clean(bundle.job?.advertiser_id),
      asset_id: assetId
    },
    requestFieldManifest: {
      fieldNames: ["advertiser_id", "asset_id"],
      rawQueryStored: false
    },
    summarize: (payload) => {
      const events = eventConfigsFromPayload(payload).map(normalizeEventConfig);
      return sanitizeForPublic({
        events,
        eventCount: events.length
      });
    }
  });
  if (probe.status !== "passed") {
    return { status: "blocked", blockers: ["available_events_readonly_failed"], probe, events: [] };
  }
  return { status: "passed", blockers: [], probe, events: probe.summary?.events || [] };
}

async function readExistingEventConfigs({ bundle, client, assetId }) {
  const probe = await client.get({
    label: "event_config_existing_configs",
    endpoint: "https://ad.oceanengine.com/open_api/2/event_manager/event_configs/get/",
    query: {
      advertiser_id: clean(bundle.job?.advertiser_id),
      asset_id: assetId,
      sort_type: "DESC"
    },
    requestFieldManifest: {
      fieldNames: ["advertiser_id", "asset_id", "sort_type"],
      rawQueryStored: false
    },
    summarize: (payload) => {
      const configs = eventConfigsFromPayload(payload).map(normalizeEventConfig);
      return sanitizeForPublic({
        configs,
        eventConfigCount: configs.length
      });
    }
  });
  if (probe.status !== "passed") {
    return { status: "blocked", blockers: ["event_configs_readonly_failed"], probe, configs: [] };
  }
  return { status: "passed", blockers: [], probe, configs: probe.summary?.configs || [] };
}

export async function readEventConfigPreflight({
  bundle,
  client = createOceanEngineReadonlyClient(),
  assetIdHint = ""
} = {}) {
  if (!bundle?.job) throw new Error("event_config_preflight_bundle_required");
  const asset = await readTargetEventAsset({ bundle, client, assetIdHint });
  if (asset.status !== "passed") {
    return sanitizeForPublic({
      status: "blocked",
      blockers: asset.blockers || ["event_asset_target_not_found"],
      asset_id_present: false,
      candidate_count: Number(asset.candidateCount || 0),
      platform_write_called: false,
      payload_persisted: false,
      response_persisted: false
    });
  }
  const available = await readAvailableEvents({ bundle, client, assetId: asset.asset.id });
  const existing = await readExistingEventConfigs({ bundle, client, assetId: asset.asset.id });
  if (existing.status !== "passed") {
    return sanitizeForPublic({
      status: "blocked",
      blockers: existing.blockers,
      asset_id_present: true,
      asset_id_hash: hashValue(asset.asset.id),
      candidate_count: Number(asset.candidateCount || 0),
      platform_write_called: false,
      payload_persisted: false,
      response_persisted: false
    });
  }
  const readiness = eventConfigBaselineReadiness({
    availableEvents: available.events,
    existingConfigs: existing.configs
  });
  const alreadyConfigured = readiness.baseline_configured_count === readiness.required_event_count;
  // The shared evaluator is the only baseline classifier. Available events
  // only need to cover entries that are not yet configured; a standalone
  // available-list 6/6 check would reject valid partial recovery.
  const effectiveStatus = alreadyConfigured
    ? "passed"
    : available.status !== "passed"
      ? "blocked"
      : readiness.status;
  const effectiveBlockers = alreadyConfigured
    ? []
    : available.status !== "passed"
      ? available.blockers
      : readiness.blockers || [];
  const result = sanitizeForPublic({
    status: effectiveStatus,
    blockers: effectiveBlockers,
    asset_id: asset.asset.id,
    asset_id_hash: hashValue(asset.asset.id),
    asset_type: asset.asset.type,
    candidate_count: Number(asset.candidateCount || 0),
    selection_source: asset.selectionSource,
    required_event_count: readiness.required_event_count,
    baseline_available_count: readiness.baseline_available_count,
    baseline_configured_count: readiness.baseline_configured_count,
    missing_available_event_types: readiness.missing_available_event_types,
    missing_configured_event_types: readiness.missing_configured_event_types,
    create_candidate_count: alreadyConfigured ? 0 : readiness.create_candidate_count,
    create_candidates: alreadyConfigured ? [] : readiness.create_candidates,
    track_type: EVENT_CONFIG_TRACK_TYPE,
    list_status: asset.listProbe.status,
    detail_status: asset.detailProbe.status,
    available_events_status: available.probe.status,
    event_configs_status: existing.probe.status,
    request_id_present: Boolean(asset.listProbe.requestIdPresent || asset.detailProbe.requestIdPresent || available.probe.requestIdPresent || existing.probe.requestIdPresent),
    response_hash_present: Boolean(asset.listProbe.responseHash || asset.detailProbe.responseHash || available.probe.responseHash || existing.probe.responseHash),
    platform_write_called: false,
    token_refresh_called: false,
    payload_persisted: false,
    response_persisted: false
  });
  assertNoSensitiveLeak(result);
  return result;
}

function requestFieldManifest({ bundle = {}, assetId, candidate = {}, requestHash = "" } = {}) {
  return sanitizeForPublic({
    field_names: [...EVENT_CONFIG_CREATE_FIELD_NAMES],
    track_types: [EVENT_CONFIG_TRACK_TYPE],
    event_type: candidate.event_type || "",
    event_cn_name: candidate.event_cn_name || "",
    advertiser_id_hash: hashValue(bundle.job?.advertiser_id || ""),
    asset_id_hash: hashValue(assetId || ""),
    event_id_hash: hashValue(candidate.event_id || ""),
    long_id_wire_strategy: "decimal_bigint_json_number",
    request_hash: requestHash,
    payload_persisted: false
  });
}

export function buildEventConfigCreateRequestPlans({
  bundle = {},
  assetId = "",
  candidates = []
} = {}) {
  const requests = [];
  const blockers = [];
  for (const candidate of candidates) {
    const payload = buildEventConfigCreatePayload({
      advertiserId: bundle.job?.advertiser_id,
      assetId,
      eventId: candidate.event_id
    });
    const wire = buildLosslessJsonWireBody(payload, {
      losslessIntegerPaths: ["advertiser_id", "asset_id", "event_id"]
    });
    const requestManifest = requestFieldManifest({
      bundle,
      assetId,
      candidate,
      requestHash: wire.requestHash
    });
    if (wire.status !== "passed") blockers.push(...(wire.blockers || ["event_config_create_wire_body_blocked"]));
    if (!payload.advertiser_id) blockers.push("event_config_advertiser_id_missing");
    if (!payload.asset_id) blockers.push("event_config_asset_id_missing");
    if (!payload.event_id) blockers.push(`event_config_event_id_missing:${candidate.event_type || "unknown"}`);
    if (!payload.track_types.includes(EVENT_CONFIG_TRACK_TYPE)) blockers.push("event_config_track_type_invalid");
    requests.push({
      event_type: candidate.event_type,
      event_cn_name: candidate.event_cn_name,
      event_id_hash: hashValue(candidate.event_id || ""),
      endpoint: EVENT_CONFIG_CREATE_ENDPOINT,
      method: EVENT_CONFIG_CREATE_METHOD,
      body: wire.body,
      bodyHash: wire.bodyHash,
      requestHash: wire.requestHash,
      requestFieldManifest: requestManifest
    });
  }
  const result = sanitizeForPublic({
    status: blockers.length ? "blocked" : "passed",
    blockers: [...new Set(blockers)],
    request_count: requests.length,
    requests,
    payload_persisted: false,
    response_persisted: false
  });
  assertNoSensitiveLeak({
    ...result,
    requests: result.requests.map((item) => ({ ...item, body: "" }))
  });
  return result;
}

async function updateAction(repo, action) {
  await repo.upsertPlatformAction(action);
}

async function fetchEventConfigCreate(fetchImpl, url, options = {}, timeoutMs = EVENT_CONFIG_CREATE_TIMEOUT_MS) {
  const boundedTimeoutMs = Number.isFinite(Number(timeoutMs)) && Number(timeoutMs) > 0
    ? Number(timeoutMs)
    : EVENT_CONFIG_CREATE_TIMEOUT_MS;
  const controller = new AbortController();
  const signal = options.signal
    ? AbortSignal.any([options.signal, controller.signal])
    : controller.signal;
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error("event_config_create_timeout");
      error.name = "TimeoutError";
      error.code = "ETIMEDOUT";
      controller.abort(error);
      reject(error);
    }, boundedTimeoutMs);
  });
  try {
    return await Promise.race([
      Promise.resolve(fetchImpl(url, { ...options, signal })),
      timeout
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function callEventConfigCreate({
  repo,
  bundle,
  request,
  headers,
  metadata,
  idempotencyKey,
  fetchImpl,
  timeoutMs
}) {
  const jobId = bundle.job.job_id;
  const actionId = eventConfigCreateActionId(jobId, request.event_type);
  await updateAction(repo, {
    actionId,
    jobId,
    actionType: EVENT_CONFIG_CREATE_ACTION_TYPE,
    endpoint: EVENT_CONFIG_CREATE_ENDPOINT,
    method: EVENT_CONFIG_CREATE_METHOD,
    actionStatus: "started",
    attemptNo: 1,
    requestHash: request.requestHash,
    idempotencyKey,
    requestFieldManifest: request.requestFieldManifest,
    metadata
  });
  try {
    const response = await fetchEventConfigCreate(fetchImpl, EVENT_CONFIG_CREATE_FULL_ENDPOINT, {
      method: EVENT_CONFIG_CREATE_METHOD,
      headers,
      body: request.body
    }, timeoutMs);
    const text = await response.text();
    let payload = {};
    try { payload = JSON.parse(text); } catch { payload = {}; }
    const code = apiCode(payload);
    const passed = response.ok && (code === "0" || code === "");
    const responseHash = hashValue(text);
    await updateAction(repo, {
      actionId,
      jobId,
      actionType: EVENT_CONFIG_CREATE_ACTION_TYPE,
      endpoint: EVENT_CONFIG_CREATE_ENDPOINT,
      method: EVENT_CONFIG_CREATE_METHOD,
      actionStatus: passed ? "succeeded" : "failed_once",
      attemptNo: 1,
      requestHash: request.requestHash,
      responseHash,
      httpStatus: response.status,
      apiCode: code || "unknown",
      requestIdPresent: requestIdPresent(payload),
      objectIdPresent: false,
      errorSummary: passed ? "" : "event_config_platform_response_not_confirmed",
      errorCategory: passed ? "" : "platform_response_not_confirmed",
      idempotencyKey,
      requestFieldManifest: request.requestFieldManifest,
      responseSummary: safeResponseSummary(payload),
      metadata,
      finishedAt: new Date().toISOString()
    });
    return { actionId, passed, response, payload, responseHash, eventType: request.event_type };
  } catch (error) {
    const persistedErrorCategory = "unclassified";
    await updateAction(repo, {
      actionId,
      jobId,
      actionType: EVENT_CONFIG_CREATE_ACTION_TYPE,
      endpoint: EVENT_CONFIG_CREATE_ENDPOINT,
      method: EVENT_CONFIG_CREATE_METHOD,
      actionStatus: "failed_once",
      attemptNo: 1,
      requestHash: request.requestHash,
      responseHash: "",
      httpStatus: null,
      apiCode: "",
      requestIdPresent: false,
      objectIdPresent: false,
      errorSummary: "event_config_platform_response_unknown_readback_required",
      errorCategory: persistedErrorCategory,
      idempotencyKey,
      requestFieldManifest: request.requestFieldManifest,
      responseSummary: {
        outcome_category: "platform_response_unknown",
        response_unknown: true,
        readback_required: true,
        response_persisted: false
      },
      metadata,
      finishedAt: new Date().toISOString()
    });
    return {
      actionId,
      passed: false,
      response: null,
      payload: {},
      responseHash: "",
      eventType: request.event_type,
      errorCategory: "platform_response_unknown",
      responseUnknown: true
    };
  }
}

async function saveEventConfigsEvidence({
  repo,
  bundle,
  status,
  preflight = {},
  createResults = [],
  postReadback = {}
}) {
  if (!repo?.upsertEvidence || !bundle?.job) return "";
  const artifactId = `EV-${bundle.job.job_id}-EVENT-CONFIGS-CREATE`;
  const succeeded = createResults.filter((item) => item.passed).length;
  const summary = sanitizeForPublic({
    status,
    action_type: EVENT_CONFIG_CREATE_ACTION_TYPE,
    endpoint: EVENT_CONFIG_CREATE_ENDPOINT,
    attempted_create_count: createResults.length,
    succeeded_create_count: succeeded,
    baseline_configured_before: Number(preflight.baseline_configured_count || 0),
    baseline_missing_before: Number(preflight.create_candidate_count || 0),
    post_readback_status: postReadback.status || "not_called",
    post_readback_blocker_count: Array.isArray(postReadback.blockers) ? postReadback.blockers.length : 0,
    payload_persisted: false,
    response_persisted: false
  });
  assertNoSensitiveLeak(summary);
  await repo.upsertEvidence({
    artifactId,
    jobId: bundle.job.job_id,
    artifactType: "event_configs_create",
    title: "JSZC 事件配置 baseline API 创建",
    summary: `status=${status}; attempted=${summary.attempted_create_count}; succeeded=${summary.succeeded_create_count}; baseline_before=${summary.baseline_configured_before}/${EVENT_CONFIG_BASELINE_EVENTS.length}; post_readback_status=${summary.post_readback_status}; response_persisted=false`,
    contentHash: hashValue({
      summary,
      response_hashes_present: createResults.map((item) => Boolean(item.responseHash))
    }),
    storageRef: "postgres:evidence_artifacts:redacted_summary_only",
    sourceRef: "oceanengine:event_manager/events/create",
    sourceUsage: bundle.job.source_usage || "runtime_truth"
  });
  return artifactId;
}

export async function ensureEventConfigsForTargetOnce({
  repo,
  jobId,
  confirmVariableValue = process.env[EVENT_CONFIGS_CONFIRM_ENV] || "",
  fetchImpl = globalThis.fetch,
  readonlyClient = null,
  credentialSummary = null,
  oceanEngineEnv = null,
  projectStatePath,
  assetIdHint = "",
  allowReadonlyDependency = true,
  writeTimeoutMs = EVENT_CONFIG_CREATE_TIMEOUT_MS
} = {}) {
  if (!repo || !jobId) throw new Error("event_configs_executor_repo_and_job_required");
  let bundle = await repo.getLaunchJobBundle(jobId);
  if (!bundle?.job) throw new Error("job_not_found");
  const effectiveAssetIdHint = assetIdHintFromBundle(bundle, assetIdHint);
  const client = readonlyClient || createOceanEngineReadonlyClient({
    fetchImpl: (url, options = {}) => fetchEventConfigCreate(fetchImpl, url, options, writeTimeoutMs)
  });
  const preflight = await readEventConfigPreflight({
    bundle,
    client,
    assetIdHint: effectiveAssetIdHint
  });
  const missingCount = Number(preflight.create_candidate_count || 0);
  const preflightPassedOrNeedsCreate = preflight.status === "passed" || preflight.status === "needs_create";

  if (preflight.status === "passed" && missingCount === 0) {
    const postReadback = await runEventChainReadonlySkill({
      repo,
      bundle,
      client,
      allowReadonlyDependency
    });
    const evidenceRef = await saveEventConfigsEvidence({
      repo,
      bundle,
      status: postReadback.status === "passed" ? "passed_noop" : "post_readback_blocked_noop",
      preflight,
      createResults: [],
      postReadback
    });
    const ready = postReadback.status === "passed";
    const result = sanitizeForPublic({
      status: ready ? "event_configs_ready_noop" : "event_configs_readback_not_verified",
      jobId,
      evidence_ref: evidenceRef,
      readback_evidence_refs: postReadback.evidenceRefs || [],
      blockers: ready ? [] : postReadback.blockers || ["event_configs_post_readback_blocked"],
      baseline_event_count: EVENT_CONFIG_BASELINE_EVENTS.length,
      baseline_configured_count: preflight.baseline_configured_count,
      platform_write_called: false,
      token_refresh_called: false,
      payload_persisted: false,
      response_persisted: false
    });
    assertNoSensitiveLeak(result);
    return result;
  }

  const scope = await validateEventConfigsWriteScope({
    repo,
    bundle,
    projectStatePath,
    assetIdHint: effectiveAssetIdHint
  });
  const credential = credentialSummary || getOceanEngineCredentialSummary();
  const requestPlan = buildEventConfigCreateRequestPlans({
    bundle,
    assetId: preflight.asset_id || "",
    candidates: preflight.create_candidates || []
  });
  const plannedAction = plannedActionFromScope(scope);
  const idempotencyBinding = childActionIdempotencyBinding({
    plannedAction,
    plan: scope.plan,
    eventTypes: requestPlan.requests.map((request) => request.event_type)
  });
  const blockers = [
    ...(confirmVariableValue === EVENT_CONFIGS_CONFIRM_VALUE ? [] : ["confirm_variable_missing_or_invalid"]),
    ...(preflightPassedOrNeedsCreate ? [] : preflight.blockers || ["event_config_preflight_blocked"]),
    ...(preflight.status === "needs_create" && missingCount > 0 ? [] : ["event_config_no_missing_baseline_events_to_create"]),
    ...(scope.status === "passed" ? [] : scope.blockers),
    ...(credentialReady(credential) ? [] : credential.blockers.map((item) => `credential:${item}`)),
    ...(requestPlan.status === "passed" ? [] : requestPlan.blockers || ["event_config_create_request_plan_blocked"]),
    ...(idempotencyBinding.status === "passed" ? [] : idempotencyBinding.blockers)
  ];

  if (blockers.length) {
    const result = sanitizeForPublic({
      status: "blocked_before_event_config_write",
      jobId,
      blockers: [...new Set(blockers)],
      preflight_status: preflight.status,
      preflight_blockers: preflight.blockers || [],
      scope_status: scope.status,
      request_plan_status: requestPlan.status,
      idempotency_binding_status: idempotencyBinding.status,
      credential: compactCredential(credential),
      platform_write_called: false,
      token_refresh_called: false,
      payload_persisted: false,
      response_persisted: false
    });
    assertNoSensitiveLeak(result);
    return result;
  }

  const env = oceanEngineEnv || readOceanEngineEnv().env;
  const createResults = [];
  for (const [index, request] of requestPlan.requests.entries()) {
    const create = await callEventConfigCreate({
      repo,
      bundle,
      request,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "Access-Token": env.OCEANENGINE_ACCESS_TOKEN
      },
      metadata: {
        route_id: bundle.job.route_id,
        game_code: bundle.job.game_code,
        advertiser_id_hash: hashValue(bundle.job.advertiser_id),
        asset_id_hash: hashValue(preflight.asset_id || ""),
        event_type: request.event_type,
        event_cn_name: request.event_cn_name,
        event_id_hash: request.event_id_hash,
        track_types: [EVENT_CONFIG_TRACK_TYPE],
        baseline_template_hash: eventConfigBaselineTemplateHash({ assetIdHint: effectiveAssetIdHint }),
        idempotency_scope_hash: scope.plan?.metadata?.idempotency_scope_hash || "",
        maximum_platform_calls: EVENT_CONFIG_BASELINE_EVENTS.length,
        sequence_no: index + 1,
        retry_allowed: false,
        payload_persisted: false,
        response_persisted: false
      },
      idempotencyKey: idempotencyBinding.keys.get(request.event_type),
      fetchImpl,
      timeoutMs: writeTimeoutMs
    });
    createResults.push(create);
    if (!create.passed) {
      let responseUnknownReadback = null;
      if (create.responseUnknown === true) {
        try {
          bundle = await repo.getLaunchJobBundle(jobId);
          responseUnknownReadback = await readEventConfigPreflight({
            bundle,
            client,
            assetIdHint: effectiveAssetIdHint
          });
        } catch {
          responseUnknownReadback = {
            status: "blocked",
            blockers: ["event_config_response_unknown_readback_failed"]
          };
        }
      }
      const evidenceRef = await saveEventConfigsEvidence({
        repo,
        bundle,
        status: "failed_once",
        preflight,
        createResults,
        postReadback: responseUnknownReadback || { status: "not_called", blockers: [] }
      });
      const result = sanitizeForPublic({
        status: "event_config_create_failed_once",
        jobId,
        blockers: create.responseUnknown === true
          ? ["confirmed_resource_execution_interrupted"]
          : ["event_config_create_failed_once"],
        create_action_id: create.actionId,
        failed_event_type: create.eventType,
        evidence_ref: evidenceRef,
        http_status: create.response?.status ?? null,
        api_code: apiCode(create.payload) || "unknown",
        response_hash_present: Boolean(create.responseHash),
        attempted_create_count: createResults.length,
        response_unknown: create.responseUnknown === true,
        platform_write_called: true,
        readback_called: responseUnknownReadback !== null,
        readback_status: responseUnknownReadback?.status || "not_called",
        baseline_configured_after_unknown: Number(responseUnknownReadback?.baseline_configured_count || 0),
        token_refresh_called: false,
        payload_persisted: false,
        response_persisted: false
      });
      assertNoSensitiveLeak(result);
      return result;
    }
  }

  bundle = await repo.getLaunchJobBundle(jobId);
  const postReadback = await runEventChainReadonlySkill({
    repo,
    bundle,
    client,
    allowReadonlyDependency
  });
  const ready = postReadback.status === "passed";
  const evidenceRef = await saveEventConfigsEvidence({
    repo,
    bundle,
    status: ready ? "passed" : "post_readback_blocked",
    preflight,
    createResults,
    postReadback
  });
  const result = sanitizeForPublic({
    status: ready ? "event_configs_ready" : "event_configs_readback_not_verified",
    jobId,
    evidence_ref: evidenceRef,
    readback_evidence_refs: postReadback.evidenceRefs || [],
    blockers: ready ? [] : postReadback.blockers || ["event_configs_post_create_readback_blocked"],
    baseline_event_count: EVENT_CONFIG_BASELINE_EVENTS.length,
    baseline_configured_before: preflight.baseline_configured_count,
    attempted_create_count: createResults.length,
    succeeded_create_count: createResults.filter((item) => item.passed).length,
    event_asset_verified: postReadback.outputSummary?.eventAssetTargetReadbackVerified === true,
    event_configs_verified: postReadback.outputSummary?.eventConfigsReadbackVerified === true,
    optimized_goal_verified: postReadback.outputSummary?.objectiveFound === true &&
      postReadback.outputSummary?.deepObjectiveFound === true,
    deep_bid_type_verified: postReadback.outputSummary?.deepBidTypeFound === true,
    platform_write_called: true,
    token_refresh_called: false,
    payload_persisted: false,
    response_persisted: false
  });
  assertNoSensitiveLeak(result);
  return result;
}
