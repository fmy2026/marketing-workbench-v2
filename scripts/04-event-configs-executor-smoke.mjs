import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildEventConfigsExecutionPlanFromBundle
} from "../src/workflows/executionPlan.mjs";
import {
  EVENT_CONFIGS_CONFIRM_VALUE,
  buildEventConfigCreateRequestPlans,
  ensureEventConfigsForTargetOnce,
  readEventConfigPreflight
} from "../src/platforms/oceanengineEventConfigExecutor.mjs";
import {
  EVENT_CONFIGS_PROVISION_ACTION,
  EVENT_CONFIG_BASELINE_EVENTS,
  EVENT_CONFIG_CREATE_ACTION_TYPE,
  EVENT_CONFIG_CREATE_ENDPOINT,
  EVENT_CONFIG_CREATE_METHOD,
  EVENT_CONFIG_TRACK_TYPE,
  assertNoSensitiveLeak,
  eventConfigBaselineReadiness
} from "../src/workflows/skills/oe3/00-index.mjs";

const EVENT_ASSET_ID = "1874962943118532";
const ADVERTISER_ID = "1871922434025472";
const INSTANCE_ID = "7434750138926546994";
const APP_ID = "tte95a9fe77665844607";

function eventIdFor(index) {
  return String([8, 13, 14, 160, 360, 607][index]);
}

function baselineAvailableEvents({ missingTypes = [] } = {}) {
  return EVENT_CONFIG_BASELINE_EVENTS
    .filter((item) => !missingTypes.includes(item.event_type))
    .map((item, index) => ({
      event_id: eventIdFor(EVENT_CONFIG_BASELINE_EVENTS.findIndex((baseline) => baseline.event_type === item.event_type) >= 0
        ? EVENT_CONFIG_BASELINE_EVENTS.findIndex((baseline) => baseline.event_type === item.event_type)
        : index),
      event_type: item.event_type,
      event_cn_name: item.event_cn_name,
      track_types: [EVENT_CONFIG_TRACK_TYPE]
    }));
}

function baselineConfiguredEvents(count) {
  return baselineAvailableEvents().slice(0, count);
}

function baseBundle({ jobId = "JOB-SMOKE-EVENT-CONFIGS", plan = null } = {}) {
  const bundle = {
    job: {
      job_id: jobId,
      case_id: "CASE-SMOKE-EVENT-CONFIGS",
      route_id: "oceanengine_3_byte_mini_game",
      game_code: "JSZC",
      advertiser_id: ADVERTISER_ID,
      object_type: "std_project",
      source_usage: "test_run"
    },
    case: {
      case_id: "CASE-SMOKE-EVENT-CONFIGS",
      lifecycle_status: "active"
    },
    platformApp: {
      id: "GPA-JSZC-OE-BYTE-MINI-GAME",
      app_id: APP_ID,
      app_name: "巨兽战场",
      app_type: "byte_mini_game",
      status: "active",
      metadata: {
        micro_app_instance_id: INSTANCE_ID,
        micro_app_instance_id_source: "platform_app_reference"
      }
    },
    defaults: {
      objective: "AD_CONVERT_TYPE_PAY",
      deep_objective: "AD_CONVERT_TYPE_PURCHASE_ROI_7D",
      deep_bid_type: "PER_AND_SEVEN_PAY_ROI",
      raw_defaults: {
        optimization: {
          external_action: "AD_CONVERT_TYPE_PAY",
          deep_external_action: "AD_CONVERT_TYPE_PURCHASE_ROI_7D",
          deep_bid_type: "PER_AND_SEVEN_PAY_ROI"
        },
        payload_defaults: {
          project: {
            landing_type: "MICRO_GAME",
            ad_type: "ALL",
            delivery_mode: "PROCEDURAL",
            marketing_goal: "VIDEO_AND_IMAGE"
          },
          strategy: {
            delivery_type: "NORMAL",
            delivery_medium: "BYTE_GAME",
            micro_promotion_type: "BYTE_GAME"
          }
        }
      }
    },
    draft: {
      draft_id: "DRAFT-SMOKE-EVENT-CONFIGS",
      payload_hash: "sha256:smoke-event-configs"
    },
    nodes: [],
    resources: [
      {
        resource_id: "AR-SMOKE-EVENT",
        resource_type: "event_asset",
        visibility_status: "needs_confirmation",
        readback_status: "not_checked",
        metadata: {}
      },
      {
        resource_id: "AR-SMOKE-MICRO-APP",
        resource_type: "micro_app_instance",
        visibility_status: "needs_confirmation",
        readback_status: "not_checked",
        metadata: {}
      }
    ],
    resourceBlueprints: []
  };
  const executionPlan = plan || buildEventConfigsExecutionPlanFromBundle(bundle, {
    planVersion: 3,
    assetIdHint: EVENT_ASSET_ID
  });
  return {
    ...bundle,
    executionPlan,
    executionConfirmation: {
      confirmation_id: `CONFIRM-${jobId}`,
      job_id: jobId,
      plan_id: executionPlan.planId,
      confirmation_status: "confirmed_for_execution_plan",
      metadata: {
        plan_hash: executionPlan.planHash,
        retry_allowed: false
      }
    }
  };
}

function asset({ id = EVENT_ASSET_ID, appId = "", instanceId = "" } = {}) {
  return {
    asset_id: id,
    asset_type: "MINI_PROGRAME",
    share_type: "MY_CREATIONS",
    ...(appId ? { micro_app_id: appId } : {}),
    ...(instanceId ? { micro_app_instance_id: instanceId } : {})
  };
}

function clientStub(state, {
  existingAll = false,
  existingConfiguredCount = 0,
  missingAvailableTypes = [],
  readyAfterCreate = true,
  assets = [asset({ appId: APP_ID, instanceId: INSTANCE_ID })]
} = {}) {
  const calls = [];
  return {
    calls,
    credentialState() { return { status: "ready", blockers: [] }; },
    async get({ label, endpoint, summarize }) {
      calls.push({ label, endpoint });
      const availableEvents = baselineAvailableEvents({ missingTypes: missingAvailableTypes });
      const createdTypes = readyAfterCreate ? [...state.createdEventTypes] : [];
      const initialExistingTypes = existingAll
        ? EVENT_CONFIG_BASELINE_EVENTS.map((item) => item.event_type)
        : EVENT_CONFIG_BASELINE_EVENTS.slice(0, existingConfiguredCount).map((item) => item.event_type);
      const existingTypes = [...new Set([...initialExistingTypes, ...createdTypes])];
      const existingConfigs = EVENT_CONFIG_BASELINE_EVENTS
        .filter((item) => existingTypes.includes(item.event_type))
        .map((item) => {
          const available = availableEvents.find((candidate) => candidate.event_type === item.event_type) || {};
          return {
            event_id: available.event_id || "",
            event_type: item.event_type,
            event_cn_name: item.event_cn_name,
            track_types: [EVENT_CONFIG_TRACK_TYPE]
          };
        });
      const payload = label.endsWith("asset_list")
        ? { code: "0", request_id: "smoke", data: { asset_list: assets, page_info: { total_page: 1 } } }
        : label.endsWith("asset_detail")
          ? { code: "0", request_id: "smoke", data: { asset_list: assets } }
          : label.includes("available_events")
            ? { code: "0", request_id: "smoke", data: { event_configs: availableEvents } }
            : label.includes("event_configs") || label.includes("existing_configs")
              ? { code: "0", request_id: "smoke", data: { event_configs: existingConfigs } }
              : label.includes("optimized_goal")
                ? { code: "0", request_id: "smoke", data: { list: [{ external_action: "AD_CONVERT_TYPE_PAY", deep_external_action: "AD_CONVERT_TYPE_PURCHASE_ROI_7D", asset_id: EVENT_ASSET_ID }] } }
                : { code: "0", request_id: "smoke", data: { list: [{ deep_bid_type: "PER_AND_SEVEN_PAY_ROI" }] } };
      return {
        label,
        endpoint,
        status: "passed",
        httpStatus: 200,
        apiCode: "0",
        requestIdPresent: true,
        responseHash: `sha256:smoke-${label}-${calls.length}`,
        summary: summarize(payload)
      };
    }
  };
}

function repoStub(initialBundle) {
  const state = {
    bundle: structuredClone(initialBundle),
    actions: [],
    evidences: [],
    updates: []
  };
  function applyResourceUpdate(update = {}) {
    state.updates.push(update);
    state.bundle.resources = state.bundle.resources.map((item) => item.resource_type === update.resourceType
      ? {
          ...item,
          platform_resource_id: update.platformResourceId || item.platform_resource_id || "",
          visibility_status: update.visibilityStatus || item.visibility_status,
          readback_status: update.readbackStatus || item.readback_status,
          inheritance_status: update.inheritanceStatus || item.inheritance_status || "",
          metadata: {
            ...(item.metadata || {}),
            readonly_check: update.metadata || {},
            ...(update.resourceMetadata || {})
          }
        }
      : item);
  }
  return {
    state,
    async getLaunchJobBundle() { return state.bundle; },
    async getLatestLaunchExecutionPlan() { return state.bundle.executionPlan; },
    async getLaunchConfirmationForPlan() { return state.bundle.executionConfirmation; },
    async countPlatformActions({ actionType }) {
      return state.actions.filter((item) => item.actionType === actionType || item.action_type === actionType).length;
    },
    async upsertPlatformAction(action) {
      const index = state.actions.findIndex((item) => item.actionId === action.actionId);
      if (index >= 0) state.actions[index] = { ...state.actions[index], ...action };
      else state.actions.push(action);
    },
    async upsertEvidence(evidence) { state.evidences.push(evidence); },
    async updateAccountResourceReadonly(update) { applyResourceUpdate(update); }
  };
}

async function statePathFor(bundle) {
  const dir = await mkdtemp(join(tmpdir(), "mwbv2-event-configs-smoke-"));
  const plan = bundle.executionPlan;
  await writeFile(join(dir, "project.state.json"), `${JSON.stringify({
    guardrails: {
      platform_write_allowed: true,
      platform_write_scope: {
        binding_mode: "single_confirmation_plan",
        target_job_id: bundle.job.job_id,
        target_advertiser_id: bundle.job.advertiser_id,
        target_plan_id: plan.planId,
        target_plan_hash: plan.planHash,
        allowed_actions: [EVENT_CONFIGS_PROVISION_ACTION],
        maximum_actions: 1,
        maximum_platform_calls: EVENT_CONFIG_BASELINE_EVENTS.length,
        retry_allowed: false
      }
    }
  }, null, 2)}\n`);
  return join(dir, "project.state.json");
}

function validCredential() {
  return {
    status: "valid",
    envFilePresent: true,
    accessTokenPresent: true,
    refreshTokenPresent: true,
    tokenExpired: false,
    blockers: []
  };
}

function fetchSuccess(state, { status = 200, failAt = 0 } = {}) {
  return async (_url, options = {}) => {
    state.createFetchCount += 1;
    assert.equal(options.method, EVENT_CONFIG_CREATE_METHOD);
    assert(String(options.body).includes(`"advertiser_id":${ADVERTISER_ID}`));
    assert(String(options.body).includes(`"asset_id":${EVENT_ASSET_ID}`));
    assert(!String(options.body).includes(`"asset_id":"${EVENT_ASSET_ID}"`));
    assert(String(options.body).includes(`"track_types":["${EVENT_CONFIG_TRACK_TYPE}"]`));
    const parsed = JSON.parse(String(options.body));
    const event = baselineAvailableEvents().find((item) => item.event_id === String(parsed.event_id));
    if (event) state.createdEventTypes.add(event.event_type);
    const failed = failAt > 0 && state.createFetchCount === failAt;
    return {
      ok: !failed && status >= 200 && status < 300,
      status: failed ? 400 : status,
      async text() {
        return JSON.stringify(failed
          ? { code: 40000, request_id: "smoke", message: "permission denied" }
          : { code: 0, request_id: "smoke", data: {} });
      }
    };
  };
}

const requestBundle = baseBundle({ jobId: "JOB-SMOKE-EVENT-CONFIGS-REQUEST" });
const requestPlan = buildEventConfigCreateRequestPlans({
  bundle: requestBundle,
  assetId: EVENT_ASSET_ID,
  candidates: baselineAvailableEvents()
});
assert.equal(requestPlan.status, "passed");
assert.equal(requestPlan.request_count, EVENT_CONFIG_BASELINE_EVENTS.length);
assert.equal(requestPlan.requests[0].endpoint, EVENT_CONFIG_CREATE_ENDPOINT);
assert(requestPlan.requests[0].body.includes(`"asset_id":${EVENT_ASSET_ID}`));
assert(!requestPlan.requests[0].body.includes(`"asset_id":"${EVENT_ASSET_ID}"`));

const partialFour = eventConfigBaselineReadiness({
  availableEvents: baselineAvailableEvents().slice(4),
  existingConfigs: baselineConfiguredEvents(4)
});
assert.equal(partialFour.status, "needs_create");
assert.equal(partialFour.baseline_configured_count, 4);
assert.equal(partialFour.create_candidate_count, 2);
assert.deepEqual(partialFour.missing_configured_event_types, ["purchase_roi_7d", "purchase_roi_30d"]);

const partialFive = eventConfigBaselineReadiness({
  availableEvents: baselineAvailableEvents().slice(5),
  existingConfigs: baselineConfiguredEvents(5)
});
assert.equal(partialFive.status, "needs_create");
assert.equal(partialFive.baseline_configured_count, 5);
assert.equal(partialFive.create_candidate_count, 1);
assert.deepEqual(partialFive.missing_configured_event_types, ["purchase_roi_30d"]);

const partialSix = eventConfigBaselineReadiness({
  availableEvents: [],
  existingConfigs: baselineConfiguredEvents(6)
});
assert.equal(partialSix.status, "passed");
assert.equal(partialSix.baseline_configured_count, 6);
assert.equal(partialSix.create_candidate_count, 0);

const partialFourState = { createFetchCount: 0, createdEventTypes: new Set() };
const partialFourBundle = baseBundle({ jobId: "JOB-SMOKE-EVENT-CONFIGS-PARTIAL-FOUR" });
const partialFourRepo = repoStub(partialFourBundle);
const partialFourUnavailableTypes = EVENT_CONFIG_BASELINE_EVENTS.slice(0, 4).map((item) => item.event_type);
const partialFourClient = clientStub(partialFourState, {
  existingConfiguredCount: 4,
  missingAvailableTypes: partialFourUnavailableTypes
});
const partialFourPreflight = await readEventConfigPreflight({ bundle: partialFourBundle, client: partialFourClient });
assert.equal(partialFourPreflight.status, "needs_create", JSON.stringify(partialFourPreflight.blockers || []));
assert.equal(partialFourPreflight.create_candidate_count, 2);
const partialFourExecute = await ensureEventConfigsForTargetOnce({
  repo: partialFourRepo,
  jobId: partialFourBundle.job.job_id,
  confirmVariableValue: EVENT_CONFIGS_CONFIRM_VALUE,
  fetchImpl: fetchSuccess(partialFourState),
  readonlyClient: partialFourClient,
  credentialSummary: validCredential(),
  oceanEngineEnv: { OCEANENGINE_ACCESS_TOKEN: "token-smoke" },
  projectStatePath: await statePathFor(partialFourBundle)
});
assert.equal(partialFourExecute.status, "event_configs_ready", JSON.stringify(partialFourExecute.blockers || []));
assert.equal(partialFourState.createFetchCount, 2);

const partialFiveState = { createFetchCount: 0, createdEventTypes: new Set() };
const partialFiveBundle = baseBundle({ jobId: "JOB-SMOKE-EVENT-CONFIGS-PARTIAL-FIVE" });
const partialFiveRepo = repoStub(partialFiveBundle);
const partialFiveUnavailableTypes = EVENT_CONFIG_BASELINE_EVENTS.slice(0, 5).map((item) => item.event_type);
const partialFiveExecute = await ensureEventConfigsForTargetOnce({
  repo: partialFiveRepo,
  jobId: partialFiveBundle.job.job_id,
  confirmVariableValue: EVENT_CONFIGS_CONFIRM_VALUE,
  fetchImpl: fetchSuccess(partialFiveState),
  readonlyClient: clientStub(partialFiveState, {
    existingConfiguredCount: 5,
    missingAvailableTypes: partialFiveUnavailableTypes
  }),
  credentialSummary: validCredential(),
  oceanEngineEnv: { OCEANENGINE_ACCESS_TOKEN: "token-smoke" },
  projectStatePath: await statePathFor(partialFiveBundle)
});
assert.equal(partialFiveExecute.status, "event_configs_ready", JSON.stringify(partialFiveExecute.blockers || []));
assert.equal(partialFiveState.createFetchCount, 1);

const noopState = { createFetchCount: 0, createdEventTypes: new Set() };
const noopBundle = baseBundle({ jobId: "JOB-SMOKE-EVENT-CONFIGS-NOOP" });
const noopRepo = repoStub(noopBundle);
const noop = await ensureEventConfigsForTargetOnce({
  repo: noopRepo,
  jobId: noopBundle.job.job_id,
  confirmVariableValue: "",
  fetchImpl: fetchSuccess(noopState),
  readonlyClient: clientStub(noopState, {
    existingAll: true,
    missingAvailableTypes: EVENT_CONFIG_BASELINE_EVENTS.map((item) => item.event_type)
  }),
  credentialSummary: validCredential(),
  oceanEngineEnv: { OCEANENGINE_ACCESS_TOKEN: "token-smoke" },
  projectStatePath: await statePathFor(noopBundle)
});
assert.equal(noop.status, "event_configs_ready_noop", JSON.stringify(noop.blockers || []));
assert.equal(noopState.createFetchCount, 0);

const bindingMismatchState = { createFetchCount: 0, createdEventTypes: new Set() };
const bindingMismatchBundle = baseBundle({ jobId: "JOB-SMOKE-EVENT-CONFIGS-BINDING-MISMATCH" });
const bindingMismatchRepo = repoStub(bindingMismatchBundle);
const bindingMismatch = await ensureEventConfigsForTargetOnce({
  repo: bindingMismatchRepo,
  jobId: bindingMismatchBundle.job.job_id,
  confirmVariableValue: "",
  fetchImpl: fetchSuccess(bindingMismatchState),
  readonlyClient: clientStub(bindingMismatchState, {
    existingAll: true,
    assets: [asset({ appId: APP_ID, instanceId: "7434750138926546995" })]
  }),
  credentialSummary: validCredential(),
  oceanEngineEnv: { OCEANENGINE_ACCESS_TOKEN: "token-smoke" },
  projectStatePath: await statePathFor(bindingMismatchBundle)
});
assert.equal(bindingMismatch.status, "event_configs_readback_not_verified");
assert(bindingMismatch.blockers.includes("micro_app_instance_binding_readback_failed"));
assert.equal(bindingMismatchState.createFetchCount, 0);

const createState = { createFetchCount: 0, createdEventTypes: new Set() };
const createBundle = baseBundle({ jobId: "JOB-SMOKE-EVENT-CONFIGS-CREATE" });
const createRepo = repoStub(createBundle);
const created = await ensureEventConfigsForTargetOnce({
  repo: createRepo,
  jobId: createBundle.job.job_id,
  confirmVariableValue: EVENT_CONFIGS_CONFIRM_VALUE,
  fetchImpl: fetchSuccess(createState),
  readonlyClient: clientStub(createState),
  credentialSummary: validCredential(),
  oceanEngineEnv: { OCEANENGINE_ACCESS_TOKEN: "token-smoke" },
  projectStatePath: await statePathFor(createBundle)
});
assert.equal(created.status, "event_configs_ready", JSON.stringify(created.blockers || []));
assert.equal(createState.createFetchCount, EVENT_CONFIG_BASELINE_EVENTS.length);
assert.equal(createRepo.state.actions.filter((item) => item.actionType === EVENT_CONFIG_CREATE_ACTION_TYPE).length, EVENT_CONFIG_BASELINE_EVENTS.length);
assert(createRepo.state.updates.some((item) => item.resourceType === "event_asset" && item.visibilityStatus === "visible" && item.readbackStatus === "readback_verified"));
assert(createRepo.state.updates.some((item) => item.resourceType === "micro_app_instance" && item.visibilityStatus === "visible" && item.readbackStatus === "readback_verified"));

const duplicateState = { createFetchCount: 0, createdEventTypes: new Set() };
const duplicateBundle = baseBundle({ jobId: "JOB-SMOKE-EVENT-CONFIGS-DUPLICATE" });
const duplicateRepo = repoStub(duplicateBundle);
await duplicateRepo.upsertPlatformAction({
  actionId: "ACTION-DUPLICATE",
  jobId: duplicateBundle.job.job_id,
  actionType: EVENT_CONFIG_CREATE_ACTION_TYPE
});
const duplicate = await ensureEventConfigsForTargetOnce({
  repo: duplicateRepo,
  jobId: duplicateBundle.job.job_id,
  confirmVariableValue: EVENT_CONFIGS_CONFIRM_VALUE,
  fetchImpl: fetchSuccess(duplicateState),
  readonlyClient: clientStub(duplicateState),
  credentialSummary: validCredential(),
  oceanEngineEnv: { OCEANENGINE_ACCESS_TOKEN: "token-smoke" },
  projectStatePath: await statePathFor(duplicateBundle)
});
assert.equal(duplicate.status, "blocked_before_event_config_write");
assert(duplicate.blockers.includes("event_config_platform_action_already_recorded_for_job"));
assert.equal(duplicateState.createFetchCount, 0);

const missingAvailableState = { createFetchCount: 0, createdEventTypes: new Set() };
const missingAvailableBundle = baseBundle({ jobId: "JOB-SMOKE-EVENT-CONFIGS-MISSING-AVAILABLE" });
const missingAvailableRepo = repoStub(missingAvailableBundle);
const missingAvailable = await ensureEventConfigsForTargetOnce({
  repo: missingAvailableRepo,
  jobId: missingAvailableBundle.job.job_id,
  confirmVariableValue: EVENT_CONFIGS_CONFIRM_VALUE,
  fetchImpl: fetchSuccess(missingAvailableState),
  readonlyClient: clientStub(missingAvailableState, { missingAvailableTypes: ["purchase_roi_7d"] }),
  credentialSummary: validCredential(),
  oceanEngineEnv: { OCEANENGINE_ACCESS_TOKEN: "token-smoke" },
  projectStatePath: await statePathFor(missingAvailableBundle)
});
assert.equal(missingAvailable.status, "blocked_before_event_config_write");
assert(missingAvailable.blockers.includes("event_config_available_events_baseline_missing"));
assert.equal(missingAvailableState.createFetchCount, 0);

const partialUnavailableState = { createFetchCount: 0, createdEventTypes: new Set() };
const partialUnavailableBundle = baseBundle({ jobId: "JOB-SMOKE-EVENT-CONFIGS-PARTIAL-UNAVAILABLE" });
const partialUnavailable = await ensureEventConfigsForTargetOnce({
  repo: repoStub(partialUnavailableBundle),
  jobId: partialUnavailableBundle.job.job_id,
  confirmVariableValue: EVENT_CONFIGS_CONFIRM_VALUE,
  fetchImpl: fetchSuccess(partialUnavailableState),
  readonlyClient: clientStub(partialUnavailableState, {
    existingConfiguredCount: 4,
    missingAvailableTypes: [
      ...EVENT_CONFIG_BASELINE_EVENTS.slice(0, 4).map((item) => item.event_type),
      "purchase_roi_30d"
    ]
  }),
  credentialSummary: validCredential(),
  oceanEngineEnv: { OCEANENGINE_ACCESS_TOKEN: "token-smoke" },
  projectStatePath: await statePathFor(partialUnavailableBundle)
});
assert.equal(partialUnavailable.status, "blocked_before_event_config_write");
assert(partialUnavailable.blockers.includes("event_config_available_events_baseline_missing"));
assert.equal(partialUnavailableState.createFetchCount, 0);

const readbackFailState = { createFetchCount: 0, createdEventTypes: new Set() };
const readbackFailBundle = baseBundle({ jobId: "JOB-SMOKE-EVENT-CONFIGS-READBACK-FAIL" });
const readbackFailRepo = repoStub(readbackFailBundle);
const readbackFail = await ensureEventConfigsForTargetOnce({
  repo: readbackFailRepo,
  jobId: readbackFailBundle.job.job_id,
  confirmVariableValue: EVENT_CONFIGS_CONFIRM_VALUE,
  fetchImpl: fetchSuccess(readbackFailState),
  readonlyClient: clientStub(readbackFailState, { readyAfterCreate: false }),
  credentialSummary: validCredential(),
  oceanEngineEnv: { OCEANENGINE_ACCESS_TOKEN: "token-smoke" },
  projectStatePath: await statePathFor(readbackFailBundle)
});
assert.equal(readbackFail.status, "event_configs_readback_not_verified");
assert(readbackFail.blockers.includes("event_configs_baseline_missing"));
assert.equal(readbackFailState.createFetchCount, EVENT_CONFIG_BASELINE_EVENTS.length);

const apiFailState = { createFetchCount: 0, createdEventTypes: new Set() };
const apiFailBundle = baseBundle({ jobId: "JOB-SMOKE-EVENT-CONFIGS-API-FAIL" });
const apiFailRepo = repoStub(apiFailBundle);
const apiFail = await ensureEventConfigsForTargetOnce({
  repo: apiFailRepo,
  jobId: apiFailBundle.job.job_id,
  confirmVariableValue: EVENT_CONFIGS_CONFIRM_VALUE,
  fetchImpl: fetchSuccess(apiFailState, { failAt: 2 }),
  readonlyClient: clientStub(apiFailState),
  credentialSummary: validCredential(),
  oceanEngineEnv: { OCEANENGINE_ACCESS_TOKEN: "token-smoke" },
  projectStatePath: await statePathFor(apiFailBundle)
});
assert.equal(apiFail.status, "event_config_create_failed_once");
assert.equal(apiFailState.createFetchCount, 2);

const timeoutState = { createFetchCount: 0, createdEventTypes: new Set() };
const timeoutBundle = baseBundle({ jobId: "JOB-SMOKE-EVENT-CONFIGS-TIMEOUT" });
const timeoutRepo = repoStub(timeoutBundle);
const timeoutResult = await ensureEventConfigsForTargetOnce({
  repo: timeoutRepo,
  jobId: timeoutBundle.job.job_id,
  confirmVariableValue: EVENT_CONFIGS_CONFIRM_VALUE,
  fetchImpl: async () => {
    timeoutState.createFetchCount += 1;
    return new Promise(() => {});
  },
  readonlyClient: clientStub(timeoutState),
  credentialSummary: validCredential(),
  oceanEngineEnv: { OCEANENGINE_ACCESS_TOKEN: "token-smoke" },
  projectStatePath: await statePathFor(timeoutBundle),
  writeTimeoutMs: 20
});
assert.equal(timeoutResult.status, "event_config_create_failed_once");
assert(timeoutResult.blockers.includes("confirmed_resource_execution_interrupted"));
assert.equal(timeoutResult.response_unknown, true);
assert.equal(timeoutResult.readback_called, true);
assert.equal(timeoutState.createFetchCount, 1);
const timeoutAction = timeoutRepo.state.actions.find((item) => item.actionType === EVENT_CONFIG_CREATE_ACTION_TYPE);
assert.equal(timeoutAction.actionStatus, "failed_once");
assert.equal(timeoutAction.errorCategory, "unclassified");
assert.equal(timeoutAction.responseSummary?.outcome_category, "platform_response_unknown");

const output = {
  status: "passed",
  requestPlanPassed: requestPlan.status === "passed",
  partialFourCandidateCount: partialFour.create_candidate_count,
  partialFiveCandidateCount: partialFive.create_candidate_count,
  partialSixCandidateCount: partialSix.create_candidate_count,
  partialFourExecutorCreateCount: partialFourState.createFetchCount,
  partialFiveExecutorCreateCount: partialFiveState.createFetchCount,
  noopStatus: noop.status,
  createStatus: created.status,
  bindingMismatchBlocked: bindingMismatch.blockers.includes("micro_app_instance_binding_readback_failed"),
  duplicateBlocked: duplicate.blockers.includes("event_config_platform_action_already_recorded_for_job"),
  missingAvailableBlocked: missingAvailable.blockers.includes("event_config_available_events_baseline_missing"),
  partialUnavailableBlocked: partialUnavailable.blockers.includes("event_config_available_events_baseline_missing"),
  postCreateReadbackBlocked: readbackFail.status === "event_configs_readback_not_verified",
  apiFailureBlocked: apiFail.status === "event_config_create_failed_once",
  timeoutClosedWithReadonly: timeoutResult.response_unknown === true && timeoutResult.readback_called === true,
  maxCreateCallsObserved: Math.max(
    noopState.createFetchCount,
    createState.createFetchCount,
    duplicateState.createFetchCount,
    missingAvailableState.createFetchCount,
    readbackFailState.createFetchCount,
    apiFailState.createFetchCount,
    timeoutState.createFetchCount
  ),
  noTokenRefresh: true,
  payloadPersisted: false,
  responsePersisted: false
};
assertNoSensitiveLeak(output);
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
