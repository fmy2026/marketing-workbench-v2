import {
  OE3_REQUIRED_RESOURCE_TYPES,
  assertNoSensitiveLeak,
  hashValue,
  sanitizeForPublic
} from "./skills/oe3/00-contracts.mjs";

export const EXECUTION_PLAN_VERSION = 1;
export const ACTION_ENSURE_MONITOR = "ensure_monitor";
export const ACTION_STD_PROJECT_CREATE = "std_project_create";

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

function stablePlanInput({ job, draft, plannedActions, blockerCodes }) {
  return {
    job_id: job.job_id,
    route_id: job.route_id,
    game_code: job.game_code,
    advertiser_id: job.advertiser_id,
    object_type: job.object_type,
    draft_id: draft?.draft_id || "",
    payload_hash: draft?.payload_hash || "",
    planned_actions: plannedActions.map(compactAction),
    blocker_codes: blockerCodes
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

function compilePlannedActions(bundle = {}) {
  const job = bundle.job || {};
  const draft = bundle.draft || null;
  const actions = [];
  const blockers = [];
  const dependencyForCreate = [];

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
    const records = byType.get(resourceType) || [];
    if (records.length && records.some(resourceReady)) continue;
    const actionType = `ensure_resource:${resourceType}`;
    actions.push({
      action_type: actionType,
      target_ref: `resource:${job.route_id}:${job.game_code}:${job.advertiser_id}:${resourceType}`,
      idempotency_key: actionKey(job.job_id, actionType, resourceType.toUpperCase().replace(/[^A-Z0-9]+/g, "_")),
      status: "planned",
      module_ref: resourceType === "dmp_audience_package"
        ? "src/workflows/skills/oe3/04-dmp-readonly.mjs"
        : resourceType === "video_asset"
          ? "src/workflows/skills/oe3/04-video-material-readiness.mjs"
          : "src/workflows/skills/oe3/04-resource-verifiers.mjs",
      depends_on: ["launch_pack_resolve"],
      writes_to: ["account_resources", "launch_skill_runs", "evidence_artifacts"],
      reason: records.length ? "resource_not_ready" : "resource_missing"
    });
    dependencyForCreate.push(actionType);
  }

  if (draftReady(bundle)) {
    actions.push({
      action_type: ACTION_STD_PROJECT_CREATE,
      target_ref: `draft:${draft.draft_id}`,
      idempotency_key: actionKey(job.job_id, ACTION_STD_PROJECT_CREATE),
      status: dependencyForCreate.length ? "waiting_on_plan_actions" : "ready",
      module_ref: "src/workflows/skills/oe3/06-create-once.mjs",
      depends_on: ["payload_hash_latest", ...dependencyForCreate],
      writes_to: ["launch_confirmations", "platform_actions", "created_objects"],
      reason: "draft_ready_for_single_create"
    });
  } else {
    blockers.push("draft_not_ready_for_std_project_create");
  }

  const readiness = createReadiness(bundle);
  for (const blocker of readiness.blockers || []) blockers.push(blocker);

  return {
    plannedActions: actions.map((action) => sanitizeForPublic(action)),
    blockerCodes: [...new Set(blockers)].filter(Boolean)
  };
}

export function buildExecutionPlanFromBundle(bundle = {}, { planVersion = EXECUTION_PLAN_VERSION } = {}) {
  const job = bundle.job || {};
  if (!job.job_id) throw new Error("job_id_required");

  const { plannedActions, blockerCodes } = compilePlannedActions(bundle);
  const draft = bundle.draft || null;
  const planHash = hashValue(stablePlanInput({
    job,
    draft,
    plannedActions,
    blockerCodes
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
      route_id: job.route_id,
      game_code: job.game_code,
      object_type: job.object_type,
      compiler: "src/workflows/executionPlan.mjs",
      real_platform_write_called: false
    }
  };
  assertNoSensitiveLeak(plan);
  return plan;
}

export async function compileAndSaveExecutionPlan({ repo, jobId, bundleOverride, planVersion = EXECUTION_PLAN_VERSION } = {}) {
  if (!repo) throw new Error("repo_required");
  if (!jobId && !bundleOverride?.job?.job_id) throw new Error("job_id_required");
  const bundle = bundleOverride || await repo.getLaunchJobBundle(jobId);
  if (!bundle) throw new Error("job_not_found");
  const plan = buildExecutionPlanFromBundle(bundle, { planVersion });
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
