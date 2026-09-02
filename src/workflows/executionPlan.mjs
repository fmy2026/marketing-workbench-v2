import {
  OE3_REQUIRED_RESOURCE_TYPES,
  assertNoSensitiveLeak,
  hashValue,
  sanitizeForPublic
} from "./skills/oe3/00-contracts.mjs";
import {
  FORMAL_CONFIRMED_ACTION_ORDER,
  FORMAL_RESOURCE_PREP_ACTION_ORDER,
  getResourceActionCapability
} from "./skills/oe3/04-resource-action-registry.mjs";
import {
  EVENT_ASSET_CREATE_ENDPOINT,
  EVENT_ASSET_CREATE_FIELD_NAMES,
  EVENT_ASSET_CREATE_METHOD,
  EVENT_ASSET_OFFICIAL_CREATE_SOURCE_REFS,
  EVENT_ASSET_PROVISION_ACTION,
  eventAssetOfficialCreateContractHash,
  eventAssetTemplateHash,
  evaluateEventAssetProvisionContract
} from "./skills/oe3/04-event-asset-provision-contract.mjs";
import {
  EVENT_CONFIGS_PROVISION_ACTION,
  EVENT_CONFIG_BASELINE_EVENTS,
  EVENT_CONFIG_CREATE_ACTION_TYPE,
  EVENT_CONFIG_CREATE_ENDPOINT,
  EVENT_CONFIG_CREATE_FIELD_NAMES,
  EVENT_CONFIG_CREATE_METHOD,
  EVENT_CONFIG_OFFICIAL_CREATE_SOURCE_REFS,
  EVENT_CONFIG_TRACK_TYPE,
  eventConfigBaselineTemplateHash,
  eventConfigOfficialCreateContractHash,
  evaluateEventConfigProvisionContract
} from "./skills/oe3/04-event-config-provision-contract.mjs";

export const EXECUTION_PLAN_VERSION = 1;
export const ACTION_ENSURE_MONITOR = "ensure_monitor";
export const ACTION_STD_PROJECT_CREATE = "std_project_create";
export const PLAN_KIND_MONITOR_BOOTSTRAP = "monitor_bootstrap";
export const PLAN_KIND_RESOURCE_PREPARE = "resource_prepare";
export const PLAN_KIND_STD_PROJECT_CREATE = "std_project_create";
export const PLAN_KIND_READINESS_BLOCKED = "readiness_blocked";

const SINGLE_VARIABLE_CANDIDATE_RULES = Object.freeze({
  "audience.filter_event": Object.freeze({
    defaultDirection: "single_item_to_omitted",
    allowedChangedPaths: Object.freeze([
      "name",
      "audience.filter_event",
      "audience.filter_event.[]"
    ])
  }),
  "project_materials.external_url_material_list": Object.freeze({
    defaultDirection: "omitted_to_single_item",
    allowedChangedPaths: Object.freeze([
      "name",
      "project_materials.external_url_material_list",
      "project_materials.external_url_material_list.[]"
    ])
  })
});

const READY_RESOURCE_VISIBILITY = new Set(["visible", "not_required"]);
const READY_RESOURCE_READBACK = new Set(["readback_verified", "not_required"]);

function compactAction(action) {
  return {
    action_type: action.action_type,
    target_ref: action.target_ref,
    idempotency_key: action.idempotency_key,
    status: action.status,
    module_ref: action.module_ref,
    depends_on: action.depends_on || [],
    writes_to: action.writes_to || [],
    reason: action.reason || ""
  };
}

function stablePlanInput({
  job,
  draft,
  plannedActions,
  blockerCodes,
  verificationSeries = {},
  singleVariableExperiment = {},
  successProfileSummary = {},
  planningIntent = {},
  resourceStates = []
}) {
  return {
    job_id: job.job_id,
    route_id: job.route_id,
    game_code: job.game_code,
    advertiser_id: job.advertiser_id,
    object_type: job.object_type,
    draft_id: draft?.draft_id || "",
    payload_hash: draft?.payload_hash || "",
    verification_series: verificationSeries,
    success_profile: successProfileSummary,
    planning_intent: planningIntent,
    resource_states: resourceStates,
    ...(Object.keys(singleVariableExperiment).length ? { single_variable_experiment: singleVariableExperiment } : {}),
    planned_actions: plannedActions.map(compactAction),
    blocker_codes: blockerCodes
  };
}

function planKindForActions(plannedActions = []) {
  const actionTypes = new Set(plannedActions.map((action) => action.action_type));
  if (actionTypes.has(ACTION_STD_PROJECT_CREATE)) return PLAN_KIND_STD_PROJECT_CREATE;
  if (actionTypes.size > 0) return PLAN_KIND_RESOURCE_PREPARE;
  return PLAN_KIND_READINESS_BLOCKED;
}

function clean(value) {
  return String(value ?? "").trim();
}

function monitorBootstrapPlanId(jobId, planVersion) {
  return `PLAN-${jobId}-MONITOR-V${Number(planVersion)}`;
}

function monitorContractForPlan(bundle = {}, contract = {}) {
  const target = contract.target || {};
  const readiness = bundle.monitorReadiness || {};
  const job = bundle.job || {};
  const provisionId = clean(contract.provisionId || contract.provision_id || readiness.provision_id);
  const cycleId = clean(contract.cycleId || contract.cycle_id || readiness.cycle_id);
  const cycleNo = Number(contract.cycleNo || contract.cycle_no || readiness.cycle_no || 0);
  const attemptNo = Number(contract.attemptNo || contract.attempt_no || 0);
  const createRequestHash = clean(contract.createRequestHash || contract.create_request_hash);
  const configContractHash = clean(contract.configContractHash || contract.config_contract_hash);
  const readonlyEvidenceRef = clean(contract.readonlyEvidenceRef || contract.readonly_evidence_ref || readiness.evidence_artifact_id);
  const readinessStatus = clean(readiness.readiness_status);
  const blockers = [
    ...(job.job_id ? [] : ["job_id_required"]),
    ...(job.case_id ? [] : ["monitor_bootstrap_case_id_required"]),
    ...(target.routeId && target.routeId !== job.route_id ? ["monitor_contract_route_mismatch"] : []),
    ...(target.gameCode && target.gameCode !== job.game_code ? ["monitor_contract_game_mismatch"] : []),
    ...(target.advertiserId && target.advertiserId !== job.advertiser_id ? ["monitor_contract_advertiser_mismatch"] : []),
    ...(provisionId ? [] : ["monitor_provision_id_missing"]),
    ...(cycleId && cycleNo > 0 ? [] : ["monitor_cycle_missing"]),
    ...(attemptNo > 0 && attemptNo <= 2 ? [] : ["monitor_attempt_not_plan_eligible"]),
    ...(createRequestHash.startsWith("sha256:") ? [] : ["monitor_create_request_hash_missing"]),
    ...(configContractHash.startsWith("sha256:") ? [] : ["monitor_config_contract_hash_missing"]),
    ...(readonlyEvidenceRef ? [] : ["monitor_readonly_evidence_missing"]),
    ...(readinessStatus === "needs_plan" ? [] : ["monitor_readiness_not_plan_eligible"])
  ];
  return {
    target: {
      routeId: job.route_id,
      gameCode: job.game_code,
      advertiserId: job.advertiser_id
    },
    provisionId,
    cycleId,
    cycleNo,
    attemptNo,
    createRequestHash,
    configContractHash,
    readonlyEvidenceRef,
    readinessStatus,
    blockers
  };
}

function resourceVerifierStates(bundle = {}) {
  const node = (bundle.nodes || []).find((item) => item.node_key === "account_resource_prepare");
  const checks = node?.output_summary?.checks || [];
  return new Map(checks.map((check) => [
    check.resourceType || check.resource_type || "",
    {
      status: check.prepareCapability?.status || check.prepare_capability?.status || check.status || "",
      blocker: (check.blocker_codes || check.blockers || [])[0] || "",
      blockers: check.blocker_codes || check.blockers || [],
      eventAssetProvisionPlanEligible: check.eventAssetProvisionPlanEligible === true ||
        check.event_asset_provision_plan_eligible === true,
      eventAssetProvisionStatus: check.eventAssetProvisionStatus ||
        check.event_asset_provision_status ||
        "",
      eventAssetIdentityReadbackVerified: check.eventAssetIdentityReadbackVerified === true ||
        check.event_asset_identity_readback_verified === true,
      eventConfigsReadbackVerified: check.eventConfigsReadbackVerified === true ||
        check.event_configs_readback_verified === true
    }
  ]));
}

function actionGrantDefaults(actionType, actionCallLimits = {}) {
  const maximumPlatformCalls = Number(actionCallLimits[actionType] || ({
    "ensure_resource:avatar": 2,
    "ensure_resource:dmp_audience_package": 10,
    [EVENT_ASSET_PROVISION_ACTION]: 1,
    [EVENT_CONFIGS_PROVISION_ACTION]: 6,
    "ensure_resource:video_asset": 1,
    "ensure_resource:product_image": 1,
    [ACTION_STD_PROJECT_CREATE]: 1
  })[actionType] || 1);
  const officialContracts = {
    "ensure_resource:dmp_audience_package": {
      source_ref: "official:oceanengine:dmp/custom_audience/push_v2",
      content_hash: hashValue({ method: "POST", endpoint: "/open_api/v3.0/dmp/custom_audience/push_v2/" }),
      method: "POST",
      endpoint: "/open_api/v3.0/dmp/custom_audience/push_v2/"
    },
    [EVENT_ASSET_PROVISION_ACTION]: {
      source_ref: EVENT_ASSET_OFFICIAL_CREATE_SOURCE_REFS[0],
      content_hash: eventAssetOfficialCreateContractHash(),
      method: EVENT_ASSET_CREATE_METHOD,
      endpoint: EVENT_ASSET_CREATE_ENDPOINT,
      request_field_manifest: [...EVENT_ASSET_CREATE_FIELD_NAMES],
      payload_persisted: false,
      response_persisted: false
    },
    [EVENT_CONFIGS_PROVISION_ACTION]: {
      source_ref: EVENT_CONFIG_OFFICIAL_CREATE_SOURCE_REFS[0],
      content_hash: eventConfigOfficialCreateContractHash(),
      method: EVENT_CONFIG_CREATE_METHOD,
      endpoint: EVENT_CONFIG_CREATE_ENDPOINT,
      request_field_manifest: [...EVENT_CONFIG_CREATE_FIELD_NAMES],
      baseline_event_types: EVENT_CONFIG_BASELINE_EVENTS.map((item) => item.event_type),
      track_types: [EVENT_CONFIG_TRACK_TYPE],
      event_id_source: "target_asset_available_events_get",
      payload_persisted: false,
      response_persisted: false
    },
    "ensure_resource:video_asset": {
      source_ref: "official:oceanengine:file/material/bind",
      method: "POST",
      endpoint: "/open_api/v3.0/file/material/bind/"
    },
    "ensure_resource:product_image": {
      source_ref: "official:oceanengine:file/image/ad",
      upload_method: "POST",
      upload_endpoint: "/open_api/v3.0/file/image/ad/",
      readback_endpoint: "/open_api/v3.0/file/image/get/",
      required_size: "108x108"
    }
  };
  return {
    maximum_platform_calls: maximumPlatformCalls,
    retry_allowed: false,
    ...(officialContracts[actionType] ? { official_contract: officialContracts[actionType] } : {})
  };
}

function redactedSuccessProfileSummary(bundle = {}) {
  const manifest = bundle.draft?.payload_summary?.final_payload_manifest || {};
  return {
    success_profile_version: manifest.successProfileVersion || "",
    field_shape_hash: manifest.fieldShapeHash || "",
    filter_event_policy: manifest.filterEventPolicy || "",
    filter_event_present: manifest.filterEventPresent === true,
    converted_time_duration_policy: manifest.convertedTimeDurationPolicy || "",
    converted_time_duration_present: manifest.convertedTimeDurationPresent === true,
    external_url_material_list_policy: manifest.externalUrlMaterialListPolicy || "",
    external_url_material_list_count: Number(manifest.externalUrlMaterialListCount || 0)
  };
}

function planningIntentFromBundle(bundle = {}, explicit = {}) {
  if (explicit && Object.keys(explicit).length) return explicit;
  const draft = bundle.draft || {};
  const summary = draft.payload_summary || {};
  if (!draft.draft_id || !draft.project_name) return {};
  const raw = bundle.defaults?.raw_defaults || {};
  const payloadDefaults = raw.payload_defaults || {};
  const intent = {
    project_name: draft.project_name,
    reserved_draft_id: draft.draft_id,
    naming_prefix: summary.naming_prefix || "",
    yyyymmdd: summary.yyyymmdd || "",
    budget: Number(summary.budget || bundle.defaults?.budget || 0),
    cpa_bid: Number(summary.bid || bundle.defaults?.bid || 0),
    roi_goal: Number(summary.roi_goal || bundle.defaults?.roi_goal || 0),
    schedule_type: payloadDefaults.schedule_type || raw.schedule_type || "SCHEDULE_FROM_NOW",
    object_type: bundle.job?.object_type || "std_project"
  };
  return { ...intent, business_intent_hash: hashValue(intent) };
}

function fieldLedgerEntries(bundle = {}) {
  const entries = bundle.draft?.payload_summary?.final_payload_manifest?.createFieldLedger?.entries;
  return Array.isArray(entries) ? entries : [];
}

function comparableLedgerEntry(entry = {}) {
  return {
    sendPolicy: entry.sendPolicy || "",
    valueType: entry.valueType || "",
    itemCount: entry.itemCount ?? null,
    stringLength: entry.stringLength ?? null,
    enumRule: Array.isArray(entry.enumRule) ? entry.enumRule : [],
    enumMatched: entry.enumMatched ?? null,
    valueHash: entry.valueHash || "",
    preCreateStatus: entry.preCreateStatus || ""
  };
}

function ledgerIndex(entries = []) {
  const buckets = new Map();
  for (const entry of entries) {
    const path = String(entry?.path || "").trim();
    if (!path) continue;
    if (!buckets.has(path)) buckets.set(path, []);
    buckets.get(path).push(comparableLedgerEntry(entry));
  }
  return new Map([...buckets.entries()].map(([path, values]) => {
    if (values.length === 1) return [path, values[0]];
    const sortedEntries = values
      .map((value) => JSON.stringify(value))
      .sort()
      .map((value) => JSON.parse(value));
    return [path, { entryCount: sortedEntries.length, entries: sortedEntries }];
  }));
}

function singleItemArray(entry = {}) {
  return entry.sendPolicy === "send" && entry.valueType === "array" && Number(entry.itemCount) === 1;
}

function omittedField(entry = {}) {
  return entry.sendPolicy === "omit" && entry.valueType === "absent" && entry.preCreateStatus === "passed";
}

function validSha256(value = "") {
  return /^sha256:[a-f0-9]{64}$/i.test(String(value || ""));
}

function normalizeStringList(value = []) {
  return [...new Set((Array.isArray(value) ? value : []).map((item) => String(item || "").trim()).filter(Boolean))].sort();
}

export function evaluateSingleVariableLedgerDiff({
  baselineBundle = {},
  freshBundle = {},
  candidatePath = "project_materials.external_url_material_list",
  candidateDirection = ""
} = {}) {
  const rule = SINGLE_VARIABLE_CANDIDATE_RULES[candidatePath];
  const effectiveDirection = candidateDirection || rule?.defaultDirection || "";
  const baselineLedger = ledgerIndex(fieldLedgerEntries(baselineBundle));
  const freshLedger = ledgerIndex(fieldLedgerEntries(freshBundle));
  const allowedChangedPaths = rule ? [...rule.allowedChangedPaths].sort() : [];
  const allPaths = [...new Set([...baselineLedger.keys(), ...freshLedger.keys()])];
  const changedPaths = allPaths
    .filter((path) => JSON.stringify(baselineLedger.get(path) || null) !== JSON.stringify(freshLedger.get(path) || null))
    .sort();
  const blockedPaths = changedPaths.filter((path) => !allowedChangedPaths.includes(path));
  const baselineCandidate = baselineLedger.get(candidatePath) || {};
  const freshCandidate = freshLedger.get(candidatePath) || {};
  const directionShapePassed = effectiveDirection === "single_item_to_omitted"
    ? singleItemArray(baselineCandidate) && omittedField(freshCandidate)
    : effectiveDirection === "omitted_to_single_item"
      ? omittedField(baselineCandidate) && singleItemArray(freshCandidate)
      : false;
  const baselinePayloadHash = String(baselineBundle.draft?.payload_hash || "");
  const freshPayloadHash = String(freshBundle.draft?.payload_hash || "");
  const blockers = [
    ...(!rule ? ["single_variable_candidate_not_supported"] : []),
    ...(!baselineLedger.size ? ["single_variable_baseline_ledger_missing"] : []),
    ...(!freshLedger.size ? ["single_variable_fresh_ledger_missing"] : []),
    ...(!validSha256(baselinePayloadHash) ? ["single_variable_baseline_payload_hash_invalid"] : []),
    ...(!validSha256(freshPayloadHash) ? ["single_variable_fresh_payload_hash_invalid"] : []),
    ...(!changedPaths.includes("name") ? ["single_variable_fresh_name_change_missing"] : []),
    ...(!changedPaths.includes(candidatePath) ? ["single_variable_candidate_change_missing"] : []),
    ...(!directionShapePassed ? ["single_variable_candidate_direction_not_proven"] : []),
    ...blockedPaths.map((path) => `single_variable_unapproved_changed_path:${path}`)
  ];
  const diffInput = {
    baseline_job_id: baselineBundle.job?.job_id || "",
    baseline_payload_hash: baselinePayloadHash,
    fresh_job_id: freshBundle.job?.job_id || "",
    fresh_payload_hash: freshPayloadHash,
    candidate_path: candidatePath,
    candidate_direction: effectiveDirection,
    allowed_changed_paths: allowedChangedPaths,
    changed_paths: changedPaths,
    baseline_candidate_shape: baselineCandidate,
    fresh_candidate_shape: freshCandidate
  };
  return {
    status: blockers.length ? "blocked" : "passed",
    baselineJobId: diffInput.baseline_job_id,
    baselinePayloadHash,
    freshJobId: diffInput.fresh_job_id,
    freshPayloadHash,
    candidatePath,
    candidateDirection: effectiveDirection,
    allowedChangedPaths,
    changedPaths,
    blockedPaths,
    blockers: [...new Set(blockers)],
    requiredChangedPathPresent: changedPaths.includes(candidatePath),
    directionShapePassed,
    diffHash: hashValue(diffInput),
    rawPayloadStored: false
  };
}

function normalizeSingleVariableExperiment(experiment = {}, { job, draft } = {}) {
  if (!experiment || Object.keys(experiment).length === 0) return {};
  const candidatePath = String(experiment.candidate_path || experiment.candidatePath || "").trim();
  const rule = SINGLE_VARIABLE_CANDIDATE_RULES[candidatePath];
  const candidateDirection = String(experiment.candidate_direction || experiment.candidateDirection || "").trim();
  const baselineJobId = String(experiment.baseline_job_id || experiment.baselineJobId || "").trim();
  const baselinePayloadHash = String(experiment.baseline_payload_hash || experiment.baselinePayloadHash || "").trim();
  const freshPayloadHash = String(experiment.fresh_payload_hash || experiment.freshPayloadHash || "").trim();
  const diffHash = String(experiment.diff_hash || experiment.diffHash || "").trim();
  const allowedChangedPaths = normalizeStringList(experiment.allowed_changed_paths || experiment.allowedChangedPaths);
  const changedPaths = normalizeStringList(experiment.changed_paths || experiment.changedPaths);
  const expectedAllowedPaths = rule ? [...rule.allowedChangedPaths].sort() : [];
  const validationStatus = String(experiment.status || experiment.validation_status || "").trim();
  const valid = validationStatus === "passed" &&
    Boolean(rule) &&
    candidateDirection === rule.defaultDirection &&
    Boolean(baselineJobId) &&
    baselineJobId !== job?.job_id &&
    validSha256(baselinePayloadHash) &&
    validSha256(freshPayloadHash) &&
    freshPayloadHash === draft?.payload_hash &&
    validSha256(diffHash) &&
    JSON.stringify(allowedChangedPaths) === JSON.stringify(expectedAllowedPaths) &&
    changedPaths.includes("name") &&
    changedPaths.includes(candidatePath) &&
    changedPaths.every((path) => allowedChangedPaths.includes(path));
  if (!valid) throw new Error("invalid_single_variable_experiment_binding");
  return {
    validation_status: "passed",
    baseline_job_id: baselineJobId,
    baseline_payload_hash: baselinePayloadHash,
    fresh_payload_hash: freshPayloadHash,
    candidate_path: candidatePath,
    candidate_direction: candidateDirection,
    diff_hash: diffHash,
    allowed_changed_paths: allowedChangedPaths,
    changed_paths: changedPaths
  };
}

function planId(jobId, planVersion = EXECUTION_PLAN_VERSION) {
  return `PLAN-${jobId}-V${planVersion}`;
}

function actionKey(jobId, actionType, suffix = "") {
  return `IDEMP-${jobId}-${actionType.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}${suffix ? `-${suffix}` : ""}`;
}

function monitorPresent(bundle = {}) {
  return bundle.monitorReadiness?.monitor_ready === true ||
    Boolean(bundle.account?.monitor_id || bundle.touchpoint?.monitor_id);
}

function monitorBlocker(bundle = {}) {
  if (monitorPresent(bundle)) return "";
  if (clean(bundle.monitorReadiness?.actionable_blocker_code)) {
    return clean(bundle.monitorReadiness.actionable_blocker_code);
  }
  if (["needs_readonly", "needs_touchpoint_readback"].includes(clean(bundle.monitorReadiness?.readiness_status))) {
    return "monitor_readonly_reconcile_required";
  }
  return String(bundle.monitorProvision?.blocker || "").trim() || "monitor_readiness_contract_missing";
}

function resourceReady(resource = {}) {
  return READY_RESOURCE_VISIBILITY.has(resource.visibility_status) &&
    READY_RESOURCE_READBACK.has(resource.readback_status);
}

function resourcesByType(bundle = {}) {
  const map = new Map();
  for (const resource of bundle.resources || []) {
    if (!map.has(resource.resource_type)) map.set(resource.resource_type, []);
    map.get(resource.resource_type).push(resource);
  }
  return map;
}

function eventConfigsPlannedAction({ job, dependsOnEventAsset = false, actionCallLimits = {} } = {}) {
  const actionType = EVENT_CONFIGS_PROVISION_ACTION;
  const grant = actionGrantDefaults(actionType, actionCallLimits);
  return {
    action_type: actionType,
    target_ref: `event_configs:${job.route_id}:${job.game_code}:${job.advertiser_id}:target_event_asset`,
    idempotency_key: actionKey(job.job_id, actionType, dependsOnEventAsset ? "AFTER_EVENT_ASSET" : "TARGET_EVENT_ASSET"),
    status: "planned",
    module_ref: "src/platforms/oceanengineEventConfigExecutor.mjs",
    depends_on: [
      ...(dependsOnEventAsset ? [EVENT_ASSET_PROVISION_ACTION] : []),
      "event-chain-readonly",
      "event-configs-baseline"
    ],
    writes_to: ["platform_actions", "account_resources", "launch_skill_runs", "evidence_artifacts"],
    reason: "baseline_event_configs_create_or_noop",
    maximum_platform_calls: grant.maximum_platform_calls
  };
}

function createReadiness(bundle = {}) {
  const draftNode = (bundle.nodes || []).find((node) => node.node_key === "std_project_draft_builder");
  return draftNode?.output_summary?.createReadiness || {};
}

function rootBlockerCodes(bundle = {}) {
  const readiness = createReadiness(bundle);
  const manifest = readiness.requestFieldManifest ||
    bundle.draft?.payload_summary?.final_payload_manifest || {};
  const candidates = Array.isArray(manifest.blockers) && manifest.blockers.length
    ? manifest.blockers
    : Array.isArray(readiness.blockers) ? readiness.blockers : [];
  return [...new Set(candidates.filter((code) =>
    code && !["final_payload_blockers", "payload_contract_not_passed", "draft_not_ready_for_std_project_create"].includes(code)
  ))];
}

function draftReady(bundle = {}) {
  const draft = bundle.draft || {};
  const readiness = createReadiness(bundle);
  return Boolean(
    draft.draft_id &&
    String(draft.payload_hash || "").startsWith("sha256:") &&
    (
      readiness.canCreateCurrentJob === true ||
      (readiness.status === "ready_for_user_create_confirmation" && readiness.payloadHashStable !== false)
    )
  );
}

function compilePlannedActions(bundle = {}, {
  planVersion = EXECUTION_PLAN_VERSION,
  actionCallLimits = {}
} = {}) {
  const job = bundle.job || {};
  const draft = bundle.draft || null;
  const actions = [];
  const blockers = [];
  const dependencyForCreate = [];
  const readiness = createReadiness(bundle);
  const verifierStates = resourceVerifierStates(bundle);
  const resourceStates = [];

  const unresolvedMonitorBlocker = monitorBlocker(bundle);
  if (unresolvedMonitorBlocker) blockers.push(unresolvedMonitorBlocker);

  const byType = resourcesByType(bundle);
  for (const resourceType of OE3_REQUIRED_RESOURCE_TYPES) {
    const capability = getResourceActionCapability(resourceType);
    const records = byType.get(resourceType) || [];
    const verifier = verifierStates.get(resourceType) || {};
    const verifierState = verifier.status || "";
    if (
      resourceType === "event_asset" &&
      verifier.eventAssetIdentityReadbackVerified === true &&
      verifier.eventConfigsReadbackVerified !== true
    ) {
      actions.push(eventConfigsPlannedAction({ job, actionCallLimits }));
      resourceStates.push({
        resource_type: resourceType,
        state: "PLANNED",
        action_type: EVENT_CONFIGS_PROVISION_ACTION,
        blocker: ""
      });
      dependencyForCreate.push(EVENT_CONFIGS_PROVISION_ACTION);
      continue;
    }
    if (resourceType === "micro_app_instance" &&
      ["waiting_on_event_asset", "waiting_on_event_configs"].includes(verifierState)) {
      resourceStates.push({
        resource_type: resourceType,
        state: "WAITING",
        action_type: "",
        blocker: ""
      });
      continue;
    }
    if (verifierState === "blocked" || verifierState === "prepare_unsupported") {
      const blocker = verifier.blocker || (verifierState === "blocked"
        ? `${resourceType}_readonly_or_preflight_blocked`
        : `resource_prepare_unsupported:${resourceType}`);
      resourceStates.push({ resource_type: resourceType, state: "BLOCKED", action_type: "", blocker });
      blockers.push(blocker);
      continue;
    }
    if (verifierState === "ready" || (records.length && records.some(resourceReady))) {
      resourceStates.push({ resource_type: resourceType, state: "READY", action_type: "", blocker: "" });
      continue;
    }
    if (!capability.prepare_supported) {
      const blocker = `resource_prepare_unsupported:${resourceType}`;
      resourceStates.push({ resource_type: resourceType, state: "BLOCKED", action_type: "", blocker });
      blockers.push(blocker);
      continue;
    }
    const actionType = capability.prepare_action_type;
    if (!FORMAL_RESOURCE_PREP_ACTION_ORDER.includes(actionType)) {
      const blocker = `resource_prepare_executor_not_registered:${resourceType}`;
      resourceStates.push({ resource_type: resourceType, state: "BLOCKED", action_type: "", blocker });
      blockers.push(blocker);
      continue;
    }
    if (resourceType === "event_asset" && verifier.eventAssetProvisionPlanEligible !== true) {
      const blocker = "event_asset_provision_not_plan_eligible";
      resourceStates.push({ resource_type: resourceType, state: "BLOCKED", action_type: "", blocker });
      blockers.push(blocker);
      continue;
    }
    const grant = actionGrantDefaults(actionType, actionCallLimits);
    actions.push({
      action_type: actionType,
      target_ref: `resource:${job.route_id}:${job.game_code}:${job.advertiser_id}:${resourceType}`,
      idempotency_key: actionKey(job.job_id, actionType, resourceType.toUpperCase().replace(/[^A-Z0-9]+/g, "_")),
      status: "planned",
      module_ref: capability.prepare_module_ref,
      depends_on: [capability.verify_skill_key],
      writes_to: ["account_resources", "launch_skill_runs", "evidence_artifacts"],
      reason: records.length ? "resource_not_ready" : "resource_missing",
      maximum_platform_calls: grant.maximum_platform_calls
    });
    if (resourceType === "event_asset") {
      actions.push(eventConfigsPlannedAction({
        job,
        dependsOnEventAsset: true,
        actionCallLimits
      }));
      dependencyForCreate.push(EVENT_CONFIGS_PROVISION_ACTION);
    }
    resourceStates.push({ resource_type: resourceType, state: "PLANNED", action_type: actionType, blocker: "" });
    dependencyForCreate.push(actionType);
  }

  actions.sort((left, right) =>
    FORMAL_CONFIRMED_ACTION_ORDER.indexOf(left.action_type) - FORMAL_CONFIRMED_ACTION_ORDER.indexOf(right.action_type)
  );

  const plannedResourceActionsPresent = resourceStates.some((item) => item.state === "PLANNED");
  if (draft?.draft_id && blockers.length === 0 && !plannedResourceActionsPresent) {
    for (const blocker of readiness.blockers || []) blockers.push(blocker);
  }

  // A resource-preparation confirmation must never also authorize project
  // creation. Once all prepared resources have passed their own readbacks, a
  // fresh compilation emits the separate single-create plan.
  if (blockers.length === 0 && !plannedResourceActionsPresent) {
    const grant = actionGrantDefaults(ACTION_STD_PROJECT_CREATE, actionCallLimits);
    actions.push({
      action_type: ACTION_STD_PROJECT_CREATE,
      target_ref: draft?.draft_id ? `draft:${draft.draft_id}` : `project_intent:${job.job_id}`,
      idempotency_key: actionKey(job.job_id, ACTION_STD_PROJECT_CREATE, `V${planVersion}`),
      status: dependencyForCreate.length ? "waiting_on_plan_actions" : "ready",
      module_ref: "src/workflows/skills/oe3/06-create-once.mjs",
      depends_on: ["payload_hash_latest", ...dependencyForCreate],
      writes_to: ["launch_confirmations", "platform_actions", "created_objects"],
      reason: draftReady(bundle) ? "draft_ready_for_single_create" : "final_draft_pending_confirmed_resource_actions",
      maximum_platform_calls: grant.maximum_platform_calls
    });
  } else if (blockers.length > 0 && draft?.draft_id) {
    blockers.push("draft_not_ready_for_std_project_create");
  }

  return {
    plannedActions: actions.map((action) => sanitizeForPublic(action)),
    blockerCodes: [...new Set(blockers)].filter(Boolean),
    // A ready resource plan owns the current gate. Downstream Node 5
    // readiness gaps are expected until these planned actions complete and
    // must not be projected as current Case blockers.
    rootBlockerCodes: blockers.length
      ? [blockers[0]]
      : plannedResourceActionsPresent
        ? []
        : rootBlockerCodes(bundle),
    resourceStates
  };
}

export function buildExecutionPlanFromBundle(bundle = {}, {
  planVersion = EXECUTION_PLAN_VERSION,
  createAttemptNo = planVersion,
  verificationSeriesId = "",
  verificationTaskRef = "",
  maximumCreateAttempts = 3,
  singleVariableExperiment = {},
  planningIntent = {},
  actionCallLimits = {}
} = {}) {
  const job = bundle.job || {};
  if (!job.job_id) throw new Error("job_id_required");

  const effectivePlanningIntent = planningIntentFromBundle(bundle, planningIntent);
  const { plannedActions, blockerCodes, rootBlockerCodes, resourceStates } = compilePlannedActions(bundle, {
    planVersion,
    actionCallLimits
  });
  const draft = bundle.draft || null;
  const numericAttemptNo = Number(createAttemptNo || 1);
  const numericMaximumAttempts = Number(maximumCreateAttempts || 3);
  if (!Number.isInteger(numericAttemptNo) || numericAttemptNo < 1 || numericAttemptNo > 3) {
    throw new Error("invalid_std_project_create_attempt_no");
  }
  if (!Number.isInteger(numericMaximumAttempts) || numericMaximumAttempts < 1 || numericMaximumAttempts > 3) {
    throw new Error("invalid_std_project_create_maximum_attempts");
  }
  const verificationSeries = verificationSeriesId ? {
    verification_series_id: verificationSeriesId,
    task_ref: verificationTaskRef || "",
    maximum_create_attempts: numericMaximumAttempts,
    create_attempt_no: numericAttemptNo
  } : {};
  const normalizedExperiment = normalizeSingleVariableExperiment(singleVariableExperiment, { job, draft });
  const successProfileSummary = redactedSuccessProfileSummary(bundle);
  const planHash = hashValue(stablePlanInput({
    job,
    draft,
    plannedActions,
    blockerCodes,
    verificationSeries,
    singleVariableExperiment: normalizedExperiment,
    successProfileSummary,
    planningIntent: effectivePlanningIntent,
    resourceStates
  }));
  const hasCreateAction = plannedActions.some((action) => action.action_type === ACTION_STD_PROJECT_CREATE);
  if (hasCreateAction && !draftReady(bundle) && !blockerCodes.includes("draft_not_ready_for_std_project_create")) {
    blockerCodes.push("draft_not_ready_for_std_project_create");
  }
  const planStatus = blockerCodes.length
    ? "blocked"
    : plannedActions.length
      ? "ready"
      : "blocked";
  const plan = {
    planId: planId(job.job_id, planVersion),
    jobId: job.job_id,
    planVersion,
    planKind: planKindForActions(plannedActions),
    planStatus,
    planHash,
    plannedActions,
    blockerCodes,
    draftId: draft?.draft_id || "",
    payloadHash: draft?.payload_hash || "",
    sourceUsage: job.source_usage || "runtime_truth",
    metadata: {
      case_id: job.case_id || "",
      route_id: job.route_id,
      game_code: job.game_code,
      object_type: job.object_type,
      compiler: "src/workflows/executionPlan.mjs",
      plan_kind: planKindForActions(plannedActions),
      create_attempt_no: numericAttemptNo,
      maximum_create_attempts: numericMaximumAttempts,
      confirmation_model: "one_plan_one_confirmation_many_bounded_actions",
      planning_intent: effectivePlanningIntent,
      resource_states: resourceStates,
      success_profile: successProfileSummary,
      ...verificationSeries,
      ...(Object.keys(normalizedExperiment).length ? { single_variable_experiment: normalizedExperiment } : {}),
      execution_scope: {
        binding_mode: "single_confirmation_plan",
        target_job_id: job.job_id,
        target_advertiser_id: job.advertiser_id,
        target_draft_id: draft?.draft_id || "",
        target_payload_hash: draft?.payload_hash || "",
        target_plan_id: planId(job.job_id, planVersion),
        target_plan_hash: planHash,
        target_attempt_no: numericAttemptNo,
        maximum_total_attempts: numericMaximumAttempts,
        ...verificationSeries,
        ...(Object.keys(normalizedExperiment).length ? { single_variable_experiment: normalizedExperiment } : {}),
        allowed_actions: plannedActions.map((action) => action.action_type),
        allowed_plan_actions: plannedActions.map((action) => action.action_type),
        maximum_actions: plannedActions.length,
        action_grants: Object.fromEntries(plannedActions.map((action) => [
          action.action_type,
          actionGrantDefaults(action.action_type, actionCallLimits)
        ])),
        maximum_create_calls: hasCreateAction ? 1 : 0,
        retry_allowed: false
      },
      root_blocker_codes: rootBlockerCodes,
      unique_root_blocker: rootBlockerCodes[0] || "",
      real_platform_write_called: false
    }
  };
  assertNoSensitiveLeak(plan);
  return plan;
}

export function buildSingleResourceExecutionPlanFromBundle(bundle = {}, {
  planVersion = 2,
  resourceType = "event_asset",
  planningIntent = {},
  actionCallLimits = {}
} = {}) {
  const job = bundle.job || {};
  if (!job.job_id) throw new Error("job_id_required");
  if (!resourceType) throw new Error("resource_type_required");
  const capability = getResourceActionCapability(resourceType);
  const actionType = capability.prepare_action_type;
  const blockers = [
    ...(capability.prepare_supported ? [] : [`resource_prepare_unsupported:${resourceType}`]),
    ...(actionType && FORMAL_RESOURCE_PREP_ACTION_ORDER.includes(actionType)
      ? []
      : [`resource_prepare_executor_not_registered:${resourceType}`]),
    ...(resourceType === "dmp_audience_package" && Object.hasOwn(actionCallLimits, actionType) && Number(actionCallLimits[actionType]) < 1
      ? ["dmp_push_plan_missing"]
      : [])
  ];

  let provision = null;
  let templateHash = "";
  if (resourceType === "event_asset") {
    provision = evaluateEventAssetProvisionContract({ bundle });
    templateHash = provision.outputSummary?.expectedTemplateHash || eventAssetTemplateHash({ bundle });
    if (job.route_id !== "oceanengine_3_byte_mini_game" || job.game_code !== "JSZC") {
      blockers.push("event_asset_single_plan_scope_not_jszc");
    }
    if (provision.status !== "ready_for_plan") {
      blockers.push(...(provision.blockers || ["event_asset_provision_not_plan_eligible"]));
    }
  }

  const uniqueBlockers = [...new Set(blockers)].filter(Boolean);
  const grant = actionGrantDefaults(actionType, actionCallLimits);
  const idempotencyScope = resourceType === "event_asset"
    ? hashValue({
      route_id: job.route_id,
      game_code: job.game_code,
      advertiser_id: job.advertiser_id,
      template_hash: templateHash
    })
    : hashValue({
      route_id: job.route_id,
      game_code: job.game_code,
      advertiser_id: job.advertiser_id,
      resource_type: resourceType
    });
  const plannedActions = uniqueBlockers.length ? [] : [
    {
      action_type: actionType,
      target_ref: `resource:${job.route_id}:${job.game_code}:${job.advertiser_id}:${resourceType}`,
      idempotency_key: actionKey(job.job_id, actionType, idempotencyScope.replace(/^sha256:/, "").slice(0, 32).toUpperCase()),
      status: "ready",
      module_ref: capability.prepare_module_ref,
      depends_on: [capability.verify_skill_key],
      writes_to: ["platform_actions", "account_resources", "launch_skill_runs", "evidence_artifacts"],
      reason: resourceType === "event_asset"
        ? "single_resource_event_asset_api_create_or_noop"
        : "single_resource_prepare_or_noop",
      maximum_platform_calls: grant.maximum_platform_calls
    },
    ...(resourceType === "event_asset"
      ? [eventConfigsPlannedAction({ job, dependsOnEventAsset: true, actionCallLimits })]
      : [])
  ];
  const resourceStates = [{
    resource_type: resourceType,
    state: uniqueBlockers.length ? "BLOCKED" : "PLANNED",
    action_type: uniqueBlockers.length ? "" : actionType,
    blocker: uniqueBlockers[0] || ""
  }];
  const effectivePlanningIntent = planningIntent && Object.keys(planningIntent).length
    ? planningIntent
    : {
      mode: "single_resource_remediation",
      target_resource_type: resourceType,
      no_std_project_create: true
    };
  const draft = bundle.draft || null;
  const targetPlanId = planId(job.job_id, planVersion);
  const planHash = hashValue(stablePlanInput({
    job,
    draft,
    plannedActions,
    blockerCodes: uniqueBlockers,
    planningIntent: effectivePlanningIntent,
    resourceStates
  }));
  const plan = {
    planId: targetPlanId,
    jobId: job.job_id,
    planVersion,
    planKind: PLAN_KIND_RESOURCE_PREPARE,
    planStatus: uniqueBlockers.length ? "blocked" : "ready",
    planHash,
    plannedActions,
    blockerCodes: uniqueBlockers,
    draftId: draft?.draft_id || "",
    payloadHash: draft?.payload_hash || "",
    sourceUsage: job.source_usage || "runtime_truth",
    metadata: {
      case_id: job.case_id || "",
      route_id: job.route_id,
      game_code: job.game_code,
      object_type: job.object_type,
      compiler: "src/workflows/executionPlan.mjs#buildSingleResourceExecutionPlanFromBundle",
      plan_kind: PLAN_KIND_RESOURCE_PREPARE,
      confirmation_model: "one_plan_one_confirmation_ordered_bounded_resource_actions",
      planning_intent: effectivePlanningIntent,
      remediation_scope: {
        target_resource_type: resourceType,
        target_account_readonly_precheck: true,
        create_if_missing_only: true,
        post_write_readback_required: true,
        ...(resourceType === "event_asset" ? { event_configs_baseline_included: true } : {}),
        recompile_fresh_job_after_success: true
      },
      resource_states: resourceStates,
      ...(resourceType === "event_asset" ? {
        event_asset_provision: provision?.outputSummary || {},
        event_asset_template_hash: templateHash,
        idempotency_scope_hash: idempotencyScope
      } : {}),
      execution_scope: {
        binding_mode: "single_confirmation_plan",
        target_job_id: job.job_id,
        target_advertiser_id: job.advertiser_id,
        target_draft_id: draft?.draft_id || "",
        target_payload_hash: draft?.payload_hash || "",
        target_plan_id: targetPlanId,
        target_plan_hash: planHash,
        allowed_actions: plannedActions.map((action) => action.action_type),
        allowed_plan_actions: plannedActions.map((action) => action.action_type),
        maximum_actions: plannedActions.length,
        maximum_platform_calls: plannedActions.reduce((sum, action) => sum + Number(action.maximum_platform_calls || 0), 0),
        action_grants: Object.fromEntries(plannedActions.map((action) => [
          action.action_type,
          actionGrantDefaults(action.action_type, { [action.action_type]: Number(action.maximum_platform_calls || 1) })
        ])),
        maximum_create_calls: 0,
        retry_allowed: false
      },
      root_blocker_codes: uniqueBlockers.slice(0, 1),
      unique_root_blocker: uniqueBlockers[0] || "",
      real_platform_write_called: false,
      payload_persisted: false,
      response_persisted: false
    }
  };
  assertNoSensitiveLeak(plan);
  return plan;
}

// This compiler is deliberately pure. A fresh readonly reconcile is responsible
// for producing the redacted, account-bound monitor contract consumed here; the
// compiler must never query the platform or create a monitor as a side effect.
export function buildMonitorBootstrapExecutionPlanFromBundle(bundle = {}, {
  planVersion = EXECUTION_PLAN_VERSION,
  monitorContract = {},
  planningIntent = {}
} = {}) {
  const job = bundle.job || {};
  if (!job.job_id) throw new Error("job_id_required");
  const contract = monitorContractForPlan(bundle, monitorContract);
  const targetPlanId = monitorBootstrapPlanId(job.job_id, planVersion);
  const blockerCodes = [...new Set(contract.blockers)].filter(Boolean);
  const plannedActions = blockerCodes.length ? [] : [{
    action_type: ACTION_ENSURE_MONITOR,
    target_ref: `monitor:${contract.provisionId}:cycle:${contract.cycleId}`,
    idempotency_key: actionKey(job.job_id, ACTION_ENSURE_MONITOR, `${contract.cycleNo}-${contract.attemptNo}`),
    status: "ready",
    module_ref: "src/workflows/skills/oe3/02-monitor/executor.mjs",
    depends_on: ["monitor-readonly-reconcile"],
    writes_to: ["platform_actions", "monitor_provision_attempts", "monitor_provision_runs", "account_touchpoints", "evidence_artifacts"],
    reason: "single_confirmed_monitor_bootstrap",
    maximum_platform_calls: 1
  }];
  const effectivePlanningIntent = Object.keys(planningIntent || {}).length ? planningIntent : {
    mode: PLAN_KIND_MONITOR_BOOTSTRAP,
    no_resource_prepare: true,
    no_std_project_create: true
  };
  const monitorMetadata = {
    provision_id: contract.provisionId,
    cycle_id: contract.cycleId,
    cycle_no: contract.cycleNo,
    attempt_no: contract.attemptNo,
    create_request_hash: contract.createRequestHash,
    config_contract_hash: contract.configContractHash,
    readonly_evidence_ref: contract.readonlyEvidenceRef,
    readiness_status: contract.readinessStatus
  };
  const planHash = hashValue({
    plan_kind: PLAN_KIND_MONITOR_BOOTSTRAP,
    job_id: job.job_id,
    case_id: job.case_id || "",
    route_id: job.route_id,
    game_code: job.game_code,
    advertiser_id: job.advertiser_id,
    monitor: monitorMetadata,
    planning_intent: effectivePlanningIntent,
    planned_actions: plannedActions.map(compactAction),
    blocker_codes: blockerCodes
  });
  const plan = {
    planId: targetPlanId,
    jobId: job.job_id,
    planVersion,
    planKind: PLAN_KIND_MONITOR_BOOTSTRAP,
    planStatus: blockerCodes.length ? "blocked" : "ready",
    planHash,
    plannedActions,
    blockerCodes,
    draftId: "",
    payloadHash: "",
    sourceUsage: job.source_usage || "runtime_truth",
    metadata: {
      case_id: job.case_id || "",
      route_id: job.route_id,
      game_code: job.game_code,
      object_type: job.object_type,
      plan_kind: PLAN_KIND_MONITOR_BOOTSTRAP,
      compiler: "src/workflows/executionPlan.mjs#buildMonitorBootstrapExecutionPlanFromBundle",
      confirmation_model: "one_plan_one_confirmation_single_monitor_bootstrap",
      planning_intent: effectivePlanningIntent,
      monitor_bootstrap: monitorMetadata,
      execution_scope: {
        binding_mode: "single_confirmation_plan",
        target_job_id: job.job_id,
        target_advertiser_id: job.advertiser_id,
        target_plan_id: targetPlanId,
        target_plan_hash: planHash,
        allowed_actions: plannedActions.map((action) => action.action_type),
        allowed_plan_actions: plannedActions.map((action) => action.action_type),
        maximum_actions: plannedActions.length,
        maximum_platform_calls: 1,
        maximum_create_calls: 0,
        retry_allowed: false,
        action_grants: {
          [ACTION_ENSURE_MONITOR]: {
            maximum_platform_calls: 1,
            retry_allowed: false,
            target_ref: plannedActions[0]?.target_ref || "",
            create_request_hash: contract.createRequestHash,
            config_contract_hash: contract.configContractHash,
            payload_persisted: false,
            response_persisted: false
          }
        }
      },
      root_blocker_codes: blockerCodes.slice(0, 1),
      unique_root_blocker: blockerCodes[0] || "",
      real_platform_write_called: false,
      payload_persisted: false,
      response_persisted: false
    }
  };
  assertNoSensitiveLeak(plan);
  return plan;
}

export async function compileAndSaveMonitorBootstrapExecutionPlan({
  repo,
  jobId,
  bundleOverride,
  planVersion = null,
  monitorContract,
  expectedPlanId = "",
  expectedPlanHash = "",
  planningIntent = null
} = {}) {
  if (!repo) throw new Error("repo_required");
  if (!jobId && !bundleOverride?.job?.job_id) throw new Error("job_id_required");
  const bundle = bundleOverride || await repo.getLaunchJobBundle(jobId);
  if (!bundle) throw new Error("job_not_found");
  const latest = typeof repo.getLatestLaunchExecutionPlan === "function"
    ? await repo.getLatestLaunchExecutionPlan(bundle.job.job_id)
    : null;
  const effectivePlanVersion = Number(planVersion || Number(latest?.plan_version || latest?.planVersion || 0) + 1 || 1);
  const targetPlanId = monitorBootstrapPlanId(bundle.job.job_id, effectivePlanVersion);
  const existingConfirmation = typeof repo.getLaunchConfirmationForPlan === "function"
    ? await repo.getLaunchConfirmationForPlan(targetPlanId)
    : null;
  if (existingConfirmation?.confirmation_status === "confirmed_for_execution_plan") {
    throw new Error("confirmed_execution_plan_immutable");
  }
  const plan = buildMonitorBootstrapExecutionPlanFromBundle(bundle, {
    planVersion: effectivePlanVersion,
    monitorContract,
    planningIntent: planningIntent || {}
  });
  if (expectedPlanId && plan.planId !== expectedPlanId) throw new Error("confirmed_plan_id_drift");
  if (expectedPlanHash && plan.planHash !== expectedPlanHash) {
    throw new Error("confirmed_plan_hash_drift");
  }
  await repo.upsertLaunchExecutionPlan(plan);
  const stored = await repo.getLaunchExecutionPlan(plan.planId);
  assertNoSensitiveLeak(stored || plan);
  return { plan, stored };
}

export async function compileAndSaveSingleResourceExecutionPlan({
  repo,
  jobId,
  bundleOverride,
  planVersion = 2,
  resourceType = "event_asset",
  expectedPlanId = "",
  expectedPlanHash = "",
  planningIntent = null,
  actionCallLimits = null
} = {}) {
  if (!repo) throw new Error("repo_required");
  if (!jobId && !bundleOverride?.job?.job_id) throw new Error("job_id_required");
  const bundle = bundleOverride || await repo.getLaunchJobBundle(jobId);
  if (!bundle) throw new Error("job_not_found");
  const targetPlanId = planId(bundle.job.job_id, planVersion);
  const existingConfirmation = typeof repo.getLaunchConfirmationForPlan === "function"
    ? await repo.getLaunchConfirmationForPlan(targetPlanId)
    : null;
  if (existingConfirmation?.confirmation_status === "confirmed_for_execution_plan") {
    throw new Error("confirmed_execution_plan_immutable");
  }
  const dmpPushPlans = resourceType === "dmp_audience_package" && typeof repo.getDmpPackagePushPlans === "function"
    ? await repo.getDmpPackagePushPlans(bundle.job.job_id)
    : [];
  const effectiveActionCallLimits = actionCallLimits || (resourceType === "dmp_audience_package"
    ? { "ensure_resource:dmp_audience_package": Number(dmpPushPlans?.length || 0) }
    : {});
  const plan = buildSingleResourceExecutionPlanFromBundle(bundle, {
    planVersion,
    resourceType,
    planningIntent: planningIntent || {},
    actionCallLimits: effectiveActionCallLimits
  });
  if (expectedPlanId && plan.planId !== expectedPlanId) {
    throw new Error("confirmed_plan_id_drift");
  }
  if (expectedPlanHash && plan.planHash !== expectedPlanHash) throw new Error("confirmed_plan_hash_drift");
  await repo.upsertLaunchExecutionPlan(plan);
  const stored = await repo.getLaunchExecutionPlan(plan.planId);
  assertNoSensitiveLeak(stored || plan);
  return { plan, stored };
}

export function buildEventConfigsExecutionPlanFromBundle(bundle = {}, {
  planVersion = 3,
  assetIdHint = "",
  planningIntent = {}
} = {}) {
  const job = bundle.job || {};
  if (!job.job_id) throw new Error("job_id_required");
  const provision = evaluateEventConfigProvisionContract({ bundle, assetIdHint });
  const blockers = [
    ...(provision.status === "ready_for_plan" ? [] : provision.blockers || ["event_config_provision_not_plan_eligible"])
  ];
  const uniqueBlockers = [...new Set(blockers)].filter(Boolean);
  const templateHash = eventConfigBaselineTemplateHash({ assetIdHint });
  const idempotencyScope = hashValue({
    route_id: job.route_id,
    game_code: job.game_code,
    advertiser_id: job.advertiser_id,
    asset_id_hint: assetIdHint || "",
    baseline_template_hash: templateHash
  });
  const grant = actionGrantDefaults(EVENT_CONFIGS_PROVISION_ACTION, {
    [EVENT_CONFIGS_PROVISION_ACTION]: EVENT_CONFIG_BASELINE_EVENTS.length
  });
  const plannedActions = uniqueBlockers.length ? [] : [{
    action_type: EVENT_CONFIGS_PROVISION_ACTION,
    target_ref: `event_configs:${job.route_id}:${job.game_code}:${job.advertiser_id}:${assetIdHint || "target_event_asset"}`,
    idempotency_key: actionKey(job.job_id, EVENT_CONFIGS_PROVISION_ACTION, idempotencyScope.replace(/^sha256:/, "").slice(0, 32).toUpperCase()),
    status: "ready",
    module_ref: "src/platforms/oceanengineEventConfigExecutor.mjs",
    depends_on: ["event-chain-readonly", "event-configs-baseline"],
    writes_to: ["platform_actions", "account_resources", "launch_skill_runs", "evidence_artifacts"],
    reason: "baseline_event_configs_create_or_noop",
    maximum_platform_calls: grant.maximum_platform_calls
  }];
  const resourceStates = [{
    resource_type: "event_asset",
    state: uniqueBlockers.length ? "BLOCKED" : "PLANNED",
    action_type: uniqueBlockers.length ? "" : EVENT_CONFIGS_PROVISION_ACTION,
    blocker: uniqueBlockers[0] || ""
  }];
  const effectivePlanningIntent = planningIntent && Object.keys(planningIntent).length
    ? planningIntent
    : {
      mode: "single_event_chain_remediation",
      target_resource_type: "event_asset",
      event_config_action: EVENT_CONFIGS_PROVISION_ACTION,
      no_std_project_create: true,
      no_other_resource_actions: true
    };
  const draft = bundle.draft || null;
  const targetPlanId = planId(job.job_id, planVersion);
  const planHash = hashValue(stablePlanInput({
    job,
    draft,
    plannedActions,
    blockerCodes: uniqueBlockers,
    planningIntent: effectivePlanningIntent,
    resourceStates
  }));
  const plan = {
    planId: targetPlanId,
    jobId: job.job_id,
    planVersion,
    planKind: PLAN_KIND_RESOURCE_PREPARE,
    planStatus: uniqueBlockers.length ? "blocked" : "ready",
    planHash,
    plannedActions,
    blockerCodes: uniqueBlockers,
    draftId: draft?.draft_id || "",
    payloadHash: draft?.payload_hash || "",
    sourceUsage: job.source_usage || "runtime_truth",
    metadata: {
      case_id: job.case_id || "",
      route_id: job.route_id,
      game_code: job.game_code,
      object_type: job.object_type,
      compiler: "src/workflows/executionPlan.mjs#buildEventConfigsExecutionPlanFromBundle",
      plan_kind: PLAN_KIND_RESOURCE_PREPARE,
      confirmation_model: "one_plan_one_confirmation_single_bounded_event_config_action",
      planning_intent: effectivePlanningIntent,
      event_config_provision: provision.outputSummary || {},
      event_config_baseline_template_hash: templateHash,
      event_config_asset_id_hint: assetIdHint || "",
      idempotency_scope_hash: idempotencyScope,
      remediation_scope: {
        target_resource_type: "event_asset",
        event_config_action: EVENT_CONFIGS_PROVISION_ACTION,
        target_account_readonly_precheck: true,
        create_missing_event_configs_only: true,
        post_write_readback_required: true,
        recompile_fresh_job_after_success: true
      },
      resource_states: resourceStates,
      execution_scope: {
        binding_mode: "single_confirmation_plan",
        target_job_id: job.job_id,
        target_advertiser_id: job.advertiser_id,
        target_draft_id: draft?.draft_id || "",
        target_payload_hash: draft?.payload_hash || "",
        target_plan_id: targetPlanId,
        target_plan_hash: planHash,
        allowed_actions: plannedActions.map((action) => action.action_type),
        allowed_plan_actions: plannedActions.map((action) => action.action_type),
        maximum_actions: plannedActions.length,
        maximum_platform_calls: plannedActions.reduce((sum, action) => sum + Number(action.maximum_platform_calls || 0), 0),
        action_grants: Object.fromEntries(plannedActions.map((action) => [
          action.action_type,
          actionGrantDefaults(action.action_type, { [action.action_type]: Number(action.maximum_platform_calls || 1) })
        ])),
        maximum_create_calls: 0,
        retry_allowed: false
      },
      root_blocker_codes: uniqueBlockers.slice(0, 1),
      unique_root_blocker: uniqueBlockers[0] || "",
      real_platform_write_called: false,
      payload_persisted: false,
      response_persisted: false
    }
  };
  assertNoSensitiveLeak(plan);
  return plan;
}

export async function compileAndSaveEventConfigsExecutionPlan({
  repo,
  jobId,
  bundleOverride,
  planVersion = 3,
  assetIdHint = "",
  expectedPlanId = "",
  expectedPlanHash = "",
  planningIntent = null
} = {}) {
  if (!repo) throw new Error("repo_required");
  if (!jobId && !bundleOverride?.job?.job_id) throw new Error("job_id_required");
  const bundle = bundleOverride || await repo.getLaunchJobBundle(jobId);
  if (!bundle) throw new Error("job_not_found");
  const targetPlanId = planId(bundle.job.job_id, planVersion);
  const existingConfirmation = typeof repo.getLaunchConfirmationForPlan === "function"
    ? await repo.getLaunchConfirmationForPlan(targetPlanId)
    : null;
  if (existingConfirmation?.confirmation_status === "confirmed_for_execution_plan") {
    throw new Error("confirmed_execution_plan_immutable");
  }
  const plan = buildEventConfigsExecutionPlanFromBundle(bundle, {
    planVersion,
    assetIdHint,
    planningIntent: planningIntent || {}
  });
  if (expectedPlanId && plan.planId !== expectedPlanId) {
    throw new Error("confirmed_plan_id_drift");
  }
  if (expectedPlanHash && plan.planHash !== expectedPlanHash) {
    throw new Error("confirmed_plan_hash_drift");
  }
  await repo.upsertLaunchExecutionPlan(plan);
  const stored = await repo.getLaunchExecutionPlan(plan.planId);
  assertNoSensitiveLeak(stored || plan);
  return { plan, stored };
}

export async function compileAndSaveExecutionPlan({
  repo,
  jobId,
  bundleOverride,
  planVersion = EXECUTION_PLAN_VERSION,
  createAttemptNo = planVersion,
  verificationSeriesId = "",
  verificationTaskRef = "",
  maximumCreateAttempts = 3,
  singleVariableExperiment = {},
  expectedPlanId = "",
  expectedPlanHash = "",
  planningIntent = null
} = {}) {
  if (!repo) throw new Error("repo_required");
  if (!jobId && !bundleOverride?.job?.job_id) throw new Error("job_id_required");
  const bundle = bundleOverride || await repo.getLaunchJobBundle(jobId);
  if (!bundle) throw new Error("job_not_found");
  const targetPlanId = planId(bundle.job.job_id, planVersion);
  const existingConfirmation = typeof repo.getLaunchConfirmationForPlan === "function"
    ? await repo.getLaunchConfirmationForPlan(targetPlanId)
    : null;
  if (existingConfirmation?.confirmation_status === "confirmed_for_execution_plan") {
    throw new Error("confirmed_execution_plan_immutable");
  }
  const dmpPushPlans = typeof repo.getDmpPackagePushPlans === "function"
    ? await repo.getDmpPackagePushPlans(bundle.job.job_id)
    : [];
  const preliminary = buildExecutionPlanFromBundle(bundle, {
    planVersion,
    createAttemptNo,
    verificationSeriesId,
    verificationTaskRef,
    maximumCreateAttempts,
    singleVariableExperiment,
    planningIntent: planningIntent || {},
    actionCallLimits: {
      "ensure_resource:dmp_audience_package": Math.max(1, Number(dmpPushPlans?.length || 0))
    }
  });
  let effectivePlanningIntent = planningIntent || preliminary.metadata?.planning_intent || {};
  if (
    preliminary.planStatus === "ready" &&
    preliminary.plannedActions.some((action) => action.action_type === ACTION_STD_PROJECT_CREATE) &&
    !effectivePlanningIntent.project_name
  ) {
    const { reserveStdProjectPlanningIntent } = await import("./skills/oe3/05-payload-contract.mjs");
    effectivePlanningIntent = await reserveStdProjectPlanningIntent({ repo, bundle, attemptNo: createAttemptNo });
  }
  const plan = buildExecutionPlanFromBundle(bundle, {
    planVersion,
    createAttemptNo,
    verificationSeriesId,
    verificationTaskRef,
    maximumCreateAttempts,
    singleVariableExperiment,
    planningIntent: effectivePlanningIntent,
    actionCallLimits: {
      "ensure_resource:dmp_audience_package": Math.max(1, Number(dmpPushPlans?.length || 0))
    }
  });
  if (expectedPlanId && plan.planId !== expectedPlanId) {
    throw new Error("confirmed_plan_id_drift");
  }
  if (expectedPlanHash && plan.planHash !== expectedPlanHash) {
    throw new Error("confirmed_plan_hash_drift");
  }
  if (plan.planStatus === "ready" && plan.planKind === PLAN_KIND_STD_PROJECT_CREATE) {
    const draft = bundle.draft || {};
    const draftSummary = draft.payload_summary || draft.payloadSummary || {};
    const derivation = evaluateConfirmedPlanDraftDerivation({
      plan,
      draft: {
        ...draft,
        payload_summary: {
          ...draftSummary,
          derived_from_plan_id: "",
          derived_from_plan_hash: "",
          plan_derivation_status: "not_applicable",
          plan_derivation_blockers: []
        }
      }
    });
    const scope = plan.metadata?.execution_scope || {};
    const bindingBlockers = [
      ...(derivation.status === "passed" ? [] : derivation.blockers),
      ...(draft.draft_id === plan.draftId && draft.draft_id === scope.target_draft_id ? [] : ["ready_create_plan_draft_id_mismatch"]),
      ...(draft.payload_hash === plan.payloadHash && draft.payload_hash === scope.target_payload_hash ? [] : ["ready_create_plan_payload_hash_mismatch"])
    ];
    if (bindingBlockers.length) throw new Error(`ready_create_plan_draft_binding_invalid:${bindingBlockers[0]}`);
    await repo.upsertReadyStdProjectCreatePlanWithDraftBinding(plan, {
      derivationHash: derivation.derivationHash
    });
  } else {
    await repo.upsertLaunchExecutionPlan(plan);
  }
  const stored = await repo.getLaunchExecutionPlan(plan.planId);
  assertNoSensitiveLeak(stored || plan);
  return { plan, stored };
}

export function validateExecutionPlanActionScope({ plan, allowedActions = [] } = {}) {
  const planned = new Set((plan?.plannedActions || plan?.planned_actions || []).map((action) => action.action_type));
  const allowed = new Set(allowedActions);
  const extraAllowed = [...allowed].filter((action) => !planned.has(action));
  const notAllowed = [...planned].filter((action) => !allowed.has(action));
  return {
    status: extraAllowed.length || notAllowed.length ? "blocked" : "passed",
    plannedActions: [...planned],
    allowedActions: [...allowed],
    blockers: [
      ...extraAllowed.map((action) => `action_not_planned:${action}`),
      ...notAllowed.map((action) => `planned_action_not_allowed:${action}`)
    ]
  };
}

export function evaluateConfirmedPlanDraftDerivation({ plan = {}, draft = {} } = {}) {
  const planningIntent = plan.metadata?.planning_intent || {};
  const summary = draft.payloadSummary || draft.payload_summary || {};
  const projectName = draft.projectName || draft.project_name || "";
  const planIdValue = plan.planId || plan.plan_id || "";
  const planHashValue = plan.planHash || plan.plan_hash || "";
  const blockers = [
    ...(planningIntent.project_name === projectName ? [] : ["confirmed_plan_project_name_derivation_mismatch"]),
    ...(Number(planningIntent.budget) === Number(summary.budget) ? [] : ["confirmed_plan_budget_derivation_mismatch"]),
    ...(Number(planningIntent.cpa_bid) === Number(summary.bid) ? [] : ["confirmed_plan_bid_derivation_mismatch"]),
    ...(Number(planningIntent.roi_goal) === Number(summary.roi_goal) ? [] : ["confirmed_plan_roi_derivation_mismatch"]),
    ...(summary.derived_from_plan_id && summary.derived_from_plan_id !== planIdValue ? ["final_draft_not_derived_from_confirmed_plan"] : []),
    ...(summary.derived_from_plan_hash && summary.derived_from_plan_hash !== planHashValue ? ["final_draft_confirmed_plan_hash_mismatch"] : [])
  ];
  return {
    status: blockers.length ? "blocked" : "passed",
    blockers,
    planId: planIdValue,
    planHash: planHashValue,
    derivationHash: hashValue({
      plan_id: planIdValue,
      plan_hash: planHashValue,
      business_intent_hash: planningIntent.business_intent_hash || "",
      project_name: projectName,
      payload_hash: draft.payloadHash || draft.payload_hash || ""
    })
  };
}
