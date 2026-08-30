import {
  OE3_REQUIRED_RESOURCE_TYPES,
  assertNoSensitiveLeak,
  hashValue,
  sanitizeForPublic
} from "./skills/oe3/00-contracts.mjs";
import { getResourceActionCapability } from "./skills/oe3/04-resource-action-registry.mjs";

export const EXECUTION_PLAN_VERSION = 1;
export const ACTION_ENSURE_MONITOR = "ensure_monitor";
export const ACTION_STD_PROJECT_CREATE = "std_project_create";

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
  singleVariableExperiment = {}
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
    ...(Object.keys(singleVariableExperiment).length ? { single_variable_experiment: singleVariableExperiment } : {}),
    planned_actions: plannedActions.map(compactAction),
    blocker_codes: blockerCodes
  };
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
  return Boolean(bundle.account?.monitor_id || bundle.touchpoint?.monitor_id);
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

function compilePlannedActions(bundle = {}, { planVersion = EXECUTION_PLAN_VERSION } = {}) {
  const job = bundle.job || {};
  const draft = bundle.draft || null;
  const actions = [];
  const blockers = [];
  const dependencyForCreate = [];
  const readiness = createReadiness(bundle);

  if (!monitorPresent(bundle)) {
    actions.push({
      action_type: ACTION_ENSURE_MONITOR,
      target_ref: `monitor:${job.route_id}:${job.game_code}:${job.advertiser_id}`,
      idempotency_key: actionKey(job.job_id, ACTION_ENSURE_MONITOR),
      status: "planned",
      module_ref: "src/workflows/skills/oe3/02-monitor-provision.mjs",
      depends_on: ["account_resolve", "monitor_query", "monitor_plan"],
      writes_to: ["monitor_provision_runs", "monitor_provision_attempts", "account_touchpoints"],
      reason: "account_monitor_missing"
    });
    dependencyForCreate.push(ACTION_ENSURE_MONITOR);
  }

  const byType = resourcesByType(bundle);
  for (const resourceType of OE3_REQUIRED_RESOURCE_TYPES) {
    const capability = getResourceActionCapability(resourceType);
    const records = byType.get(resourceType) || [];
    if (records.length && records.some(resourceReady)) continue;
    if (!capability.prepare_supported) {
      blockers.push(`resource_prepare_unsupported:${resourceType}`);
      continue;
    }
    const actionType = capability.prepare_action_type;
    actions.push({
      action_type: actionType,
      target_ref: `resource:${job.route_id}:${job.game_code}:${job.advertiser_id}:${resourceType}`,
      idempotency_key: actionKey(job.job_id, actionType, resourceType.toUpperCase().replace(/[^A-Z0-9]+/g, "_")),
      status: "planned",
      module_ref: capability.prepare_module_ref,
      depends_on: [capability.verify_skill_key],
      writes_to: ["account_resources", "launch_skill_runs", "evidence_artifacts"],
      reason: records.length ? "resource_not_ready" : "resource_missing"
    });
    dependencyForCreate.push(actionType);
  }

  for (const blocker of readiness.blockers || []) blockers.push(blocker);

  if (draftReady(bundle) && blockers.length === 0) {
    actions.push({
      action_type: ACTION_STD_PROJECT_CREATE,
      target_ref: `draft:${draft.draft_id}`,
      idempotency_key: actionKey(job.job_id, ACTION_STD_PROJECT_CREATE, `V${planVersion}`),
      status: dependencyForCreate.length ? "waiting_on_plan_actions" : "ready",
      module_ref: "src/workflows/skills/oe3/06-create-once.mjs",
      depends_on: ["payload_hash_latest", ...dependencyForCreate],
      writes_to: ["launch_confirmations", "platform_actions", "created_objects"],
      reason: "draft_ready_for_single_create"
    });
  } else {
    blockers.push("draft_not_ready_for_std_project_create");
  }

  return {
    plannedActions: actions.map((action) => sanitizeForPublic(action)),
    blockerCodes: [...new Set(blockers)].filter(Boolean),
    rootBlockerCodes: rootBlockerCodes(bundle)
  };
}

export function buildExecutionPlanFromBundle(bundle = {}, {
  planVersion = EXECUTION_PLAN_VERSION,
  createAttemptNo = planVersion,
  verificationSeriesId = "",
  verificationTaskRef = "",
  maximumCreateAttempts = 3,
  singleVariableExperiment = {}
} = {}) {
  const job = bundle.job || {};
  if (!job.job_id) throw new Error("job_id_required");

  const { plannedActions, blockerCodes, rootBlockerCodes } = compilePlannedActions(bundle, { planVersion });
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
  const planHash = hashValue(stablePlanInput({
    job,
    draft,
    plannedActions,
    blockerCodes,
    verificationSeries,
    singleVariableExperiment: normalizedExperiment
  }));
  const hasCreateAction = plannedActions.some((action) => action.action_type === ACTION_STD_PROJECT_CREATE);
  const createActionReady = plannedActions.some((action) =>
    action.action_type === ACTION_STD_PROJECT_CREATE && action.status === "ready"
  );
  const planStatus = hasCreateAction && createActionReady && blockerCodes.length === 0
    ? "ready"
    : plannedActions.length
      ? "planned"
      : "blocked";
  const plan = {
    planId: planId(job.job_id, planVersion),
    jobId: job.job_id,
    planVersion,
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
      create_attempt_no: numericAttemptNo,
      maximum_create_attempts: numericMaximumAttempts,
      ...verificationSeries,
      ...(Object.keys(normalizedExperiment).length ? { single_variable_experiment: normalizedExperiment } : {}),
      execution_scope: {
        target_job_id: job.job_id,
        target_draft_id: draft?.draft_id || "",
        target_payload_hash: draft?.payload_hash || "",
        target_plan_id: planId(job.job_id, planVersion),
        target_plan_hash: planHash,
        target_attempt_no: numericAttemptNo,
        maximum_total_attempts: numericMaximumAttempts,
        ...verificationSeries,
        ...(Object.keys(normalizedExperiment).length ? { single_variable_experiment: normalizedExperiment } : {}),
        allowed_actions: ["oceanengine_std_project_create"],
        allowed_plan_actions: plannedActions.map((action) => action.action_type),
        maximum_actions: 1,
        retry_allowed: false
      },
      root_blocker_codes: rootBlockerCodes,
      real_platform_write_called: false
    }
  };
  assertNoSensitiveLeak(plan);
  return plan;
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
  expectedPlanHash = ""
} = {}) {
  if (!repo) throw new Error("repo_required");
  if (!jobId && !bundleOverride?.job?.job_id) throw new Error("job_id_required");
  const bundle = bundleOverride || await repo.getLaunchJobBundle(jobId);
  if (!bundle) throw new Error("job_not_found");
  const plan = buildExecutionPlanFromBundle(bundle, {
    planVersion,
    createAttemptNo,
    verificationSeriesId,
    verificationTaskRef,
    maximumCreateAttempts,
    singleVariableExperiment
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
