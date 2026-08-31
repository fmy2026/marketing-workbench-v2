import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildSingleResourceExecutionPlanFromBundle
} from "../src/workflows/executionPlan.mjs";
import {
  EVENT_ASSET_CONFIRM_VALUE,
  buildEventAssetCreateRequestPlan,
  ensureEventAssetForTargetOnce
} from "../src/platforms/oceanengineEventAssetExecutor.mjs";
import {
  EVENT_ASSET_CREATE_ACTION_TYPE,
  EVENT_ASSET_CREATE_ENDPOINT,
  EVENT_ASSET_CREATE_FIELD_NAMES,
  EVENT_ASSET_CREATE_METHOD,
  EVENT_ASSET_OFFICIAL_CREATE_SOURCE_REFS,
  assertNoSensitiveLeak,
  EVENT_CONFIG_BASELINE_EVENTS,
  EVENT_CONFIG_TRACK_TYPE,
  eventAssetOfficialCreateContractHash,
  eventAssetTemplateRef,
  eventAssetTemplateHash
} from "../src/workflows/skills/oe3/00-index.mjs";

function provisionFor(base) {
  return {
    version: "2026-08-30.event-asset-api-create-v2",
    template_status: "ready",
    target_advertiser_id: base.job.advertiser_id,
    template_ref: eventAssetTemplateRef(base.job.advertiser_id),
    template_hash: eventAssetTemplateHash({ bundle: base }),
    asset_type: "MINI_PROGRAME",
    platform_app_ref: "GPA-JSZC-OE-BYTE-MINI-GAME",
    objective: "AD_CONVERT_TYPE_PAY",
    deep_objective: "AD_CONVERT_TYPE_PURCHASE_ROI_7D",
    deep_bid_type: "PER_AND_SEVEN_PAY_ROI",
    official_create_contract: {
      status: "verified",
      source_ref: EVENT_ASSET_OFFICIAL_CREATE_SOURCE_REFS[0],
      content_hash: eventAssetOfficialCreateContractHash(),
      method: EVENT_ASSET_CREATE_METHOD,
      endpoint: EVENT_ASSET_CREATE_ENDPOINT,
      request_field_manifest: [...EVENT_ASSET_CREATE_FIELD_NAMES]
    }
  };
}

function baseBundle({ jobId = "JOB-SMOKE-EVENT-ASSET-EXECUTOR", resources = null } = {}) {
  const base = {
    job: {
      job_id: jobId,
      case_id: "CASE-SMOKE-EVENT-ASSET",
      route_id: "oceanengine_3_byte_mini_game",
      game_code: "JSZC",
      advertiser_id: "1871922434025472",
      object_type: "std_project",
      source_usage: "test_run"
    },
    case: {
      case_id: "CASE-SMOKE-EVENT-ASSET",
      lifecycle_status: "active"
    },
    platformApp: {
      id: "GPA-JSZC-OE-BYTE-MINI-GAME",
      app_id: "tte95a9fe77665844607",
      app_name: "巨兽战场",
      app_type: "byte_mini_game",
      status: "active",
      metadata: {
        micro_app_instance_id: "7434750138926546994",
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
      draft_id: "DRAFT-SMOKE-EVENT-ASSET",
      payload_hash: "sha256:smoke-event-asset"
    },
    nodes: [],
    resources: resources || [
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
        metadata: {
          event_chain_readonly_contract: {
            target_instance_readback_verified: true
          }
        }
      }
    ],
    resourceBlueprints: []
  };
  const provision = provisionFor(base);
  const bundle = {
    ...base,
    resourceBlueprints: [{
      resource_type: "event_asset",
      metadata: { event_asset_provision: provision }
    }]
  };
  const plan = buildSingleResourceExecutionPlanFromBundle(bundle, {
    planVersion: 2,
    resourceType: "event_asset"
  });
  return {
    ...bundle,
    executionPlan: plan,
    executionConfirmation: {
      confirmation_id: `CONFIRM-${jobId}`,
      job_id: jobId,
      plan_id: plan.planId,
      confirmation_status: "confirmed_for_execution_plan",
      metadata: {
        plan_hash: plan.planHash,
        retry_allowed: false
      }
    }
  };
}

function asset(id, { appId = "tte95a9fe77665844607", instanceId = "7434750138926546994" } = {}) {
  return {
    asset_id: id,
    asset_type: "MINI_PROGRAME",
    share_type: "MY_CREATIONS",
    app_id: appId,
    instance_id: instanceId
  };
}

function baselineEvents() {
  return EVENT_CONFIG_BASELINE_EVENTS.map((item, index) => ({
    event_id: String([8, 13, 14, 160, 360, 607][index]),
    event_type: item.event_type,
    event_cn_name: item.event_cn_name,
    track_types: [EVENT_CONFIG_TRACK_TYPE]
  }));
}

function clientStub(state, {
  readyBeforeCreate = false,
  readyAfterCreate = true,
  assets = null,
  detailAssets = null
} = {}) {
  const calls = [];
  return {
    calls,
    credentialState() { return { status: "ready", blockers: [] }; },
    async get({ label, endpoint, summarize }) {
      calls.push({ label, endpoint });
      const shouldBeReady = readyBeforeCreate || (state.createFetchCount > 0 && readyAfterCreate);
      const currentAssets = assets !== null
        ? assets
        : shouldBeReady ? [asset("1874999999999999")] : [];
      const currentDetails = detailAssets !== null ? detailAssets : currentAssets;
      const payload = label === "event_chain_asset_list"
        ? { code: "0", request_id: "smoke", data: { asset_list: currentAssets, page_info: { total_page: 1 } } }
        : label === "event_chain_asset_detail"
          ? { code: "0", request_id: "smoke", data: { asset_list: currentDetails } }
          : label === "event_chain_available_events"
            ? { code: "0", request_id: "smoke", data: { event_configs: baselineEvents() } }
          : label === "event_chain_event_configs"
            ? { code: "0", request_id: "smoke", data: { event_configs: shouldBeReady ? baselineEvents() : [] } }
          : label === "event_chain_optimized_goal"
            ? { code: "0", request_id: "smoke", data: { list: [{ external_action: "AD_CONVERT_TYPE_PAY", deep_external_action: "AD_CONVERT_TYPE_PURCHASE_ROI_7D" }] } }
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
  const dir = await mkdtemp(join(tmpdir(), "mwbv2-event-asset-smoke-"));
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
        allowed_actions: ["ensure_resource:event_asset"],
        maximum_actions: 1,
        maximum_platform_calls: 1,
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

function fetchSuccess(state, { status = 200, payload = { code: 0, request_id: "smoke", data: {} } } = {}) {
  return async (_url, options = {}) => {
    state.createFetchCount += 1;
    assert.equal(options.method, EVENT_ASSET_CREATE_METHOD);
    assert(String(options.body).includes('"advertiser_id":1871922434025472'));
    assert(String(options.body).includes('"instance_id":7434750138926546994'));
    assert(!String(options.body).includes('"instance_id":"7434750138926546994"'));
    return {
      ok: status >= 200 && status < 300,
      status,
      async text() {
        return JSON.stringify(payload);
      }
    };
  };
}

const requestPlanBundle = baseBundle();
const requestPlan = buildEventAssetCreateRequestPlan({ bundle: requestPlanBundle });
assert.equal(requestPlan.status, "passed");
assert.equal(requestPlan.endpoint, EVENT_ASSET_CREATE_ENDPOINT);
assert(requestPlan.body.includes('"mini_program_asset"'));
assert(requestPlan.body.includes('"instance_id":7434750138926546994'));
assert(!requestPlan.body.includes('"instance_id":"7434750138926546994"'));

const noopState = { createFetchCount: 0 };
const noopBundle = baseBundle({ jobId: "JOB-SMOKE-EVENT-ASSET-NOOP" });
const noopRepo = repoStub(noopBundle);
const noop = await ensureEventAssetForTargetOnce({
  repo: noopRepo,
  jobId: noopBundle.job.job_id,
  confirmVariableValue: "",
  fetchImpl: fetchSuccess(noopState),
  readonlyClient: clientStub(noopState, { readyBeforeCreate: true }),
  credentialSummary: validCredential(),
  oceanEngineEnv: { OCEANENGINE_ACCESS_TOKEN: "token-smoke" },
  projectStatePath: await statePathFor(noopBundle)
});
assert.equal(noop.status, "event_asset_ready_noop");
assert.equal(noopState.createFetchCount, 0);

const createState = { createFetchCount: 0 };
const createBundle = baseBundle({ jobId: "JOB-SMOKE-EVENT-ASSET-CREATE" });
const createRepo = repoStub(createBundle);
const created = await ensureEventAssetForTargetOnce({
  repo: createRepo,
  jobId: createBundle.job.job_id,
  confirmVariableValue: EVENT_ASSET_CONFIRM_VALUE,
  fetchImpl: fetchSuccess(createState),
  readonlyClient: clientStub(createState),
  credentialSummary: validCredential(),
  oceanEngineEnv: { OCEANENGINE_ACCESS_TOKEN: "token-smoke" },
  projectStatePath: await statePathFor(createBundle)
});
assert.equal(created.status, "event_asset_ready", JSON.stringify(created.blockers || []));
assert.equal(createState.createFetchCount, 1);
assert.equal(createRepo.state.actions.filter((item) => item.actionType === EVENT_ASSET_CREATE_ACTION_TYPE).length, 1);
assert(createRepo.state.updates.some((item) => item.resourceType === "event_asset" && item.visibilityStatus === "visible" && item.readbackStatus === "readback_verified"));
assert(createRepo.state.updates.some((item) => item.resourceType === "micro_app_instance" && item.visibilityStatus === "visible" && item.readbackStatus === "readback_verified"));

const repeated = await ensureEventAssetForTargetOnce({
  repo: createRepo,
  jobId: createBundle.job.job_id,
  confirmVariableValue: EVENT_ASSET_CONFIRM_VALUE,
  fetchImpl: fetchSuccess(createState),
  readonlyClient: clientStub(createState, { readyBeforeCreate: true }),
  credentialSummary: validCredential(),
  oceanEngineEnv: { OCEANENGINE_ACCESS_TOKEN: "token-smoke" },
  projectStatePath: await statePathFor(createBundle)
});
assert.equal(repeated.status, "event_asset_ready_noop");
assert.equal(createState.createFetchCount, 1);

const duplicateState = { createFetchCount: 0 };
const duplicateBundle = baseBundle({ jobId: "JOB-SMOKE-EVENT-ASSET-DUPLICATE" });
const duplicateRepo = repoStub(duplicateBundle);
await duplicateRepo.upsertPlatformAction({
  actionId: "ACTION-DUPLICATE",
  jobId: duplicateBundle.job.job_id,
  actionType: EVENT_ASSET_CREATE_ACTION_TYPE
});
const duplicate = await ensureEventAssetForTargetOnce({
  repo: duplicateRepo,
  jobId: duplicateBundle.job.job_id,
  confirmVariableValue: EVENT_ASSET_CONFIRM_VALUE,
  fetchImpl: fetchSuccess(duplicateState),
  readonlyClient: clientStub(duplicateState, { readyAfterCreate: false }),
  credentialSummary: validCredential(),
  oceanEngineEnv: { OCEANENGINE_ACCESS_TOKEN: "token-smoke" },
  projectStatePath: await statePathFor(duplicateBundle)
});
assert.equal(duplicate.status, "blocked_before_event_asset_write");
assert(duplicate.blockers.includes("event_asset_platform_action_already_recorded_for_job"));
assert.equal(duplicateState.createFetchCount, 0);

const mismatchState = { createFetchCount: 0 };
const mismatchBundle = baseBundle({ jobId: "JOB-SMOKE-EVENT-ASSET-MISMATCH" });
const mismatchRepo = repoStub(mismatchBundle);
const mismatch = await ensureEventAssetForTargetOnce({
  repo: mismatchRepo,
  jobId: mismatchBundle.job.job_id,
  confirmVariableValue: EVENT_ASSET_CONFIRM_VALUE,
  fetchImpl: fetchSuccess(mismatchState),
  readonlyClient: clientStub(mismatchState, {
    assets: [asset("1874999999999998", { appId: "tte-other" })],
    detailAssets: [asset("1874999999999998", { appId: "tte-other" })]
  }),
  credentialSummary: validCredential(),
  oceanEngineEnv: { OCEANENGINE_ACCESS_TOKEN: "token-smoke" },
  projectStatePath: await statePathFor(mismatchBundle)
});
assert.equal(mismatch.status, "blocked_before_event_asset_write");
assert(mismatch.blockers.includes("event_asset_app_binding_unverified"));
assert.equal(mismatchState.createFetchCount, 0);

const readbackFailState = { createFetchCount: 0 };
const readbackFailBundle = baseBundle({ jobId: "JOB-SMOKE-EVENT-ASSET-READBACK-FAIL" });
const readbackFailRepo = repoStub(readbackFailBundle);
const readbackFail = await ensureEventAssetForTargetOnce({
  repo: readbackFailRepo,
  jobId: readbackFailBundle.job.job_id,
  confirmVariableValue: EVENT_ASSET_CONFIRM_VALUE,
  fetchImpl: fetchSuccess(readbackFailState),
  readonlyClient: clientStub(readbackFailState, { readyAfterCreate: false }),
  credentialSummary: validCredential(),
  oceanEngineEnv: { OCEANENGINE_ACCESS_TOKEN: "token-smoke" },
  projectStatePath: await statePathFor(readbackFailBundle)
});
assert.equal(readbackFail.status, "event_asset_readback_not_verified");
assert(readbackFail.blockers.includes("event_asset_target_not_found"));
assert.equal(readbackFailState.createFetchCount, 1);

const failedState = { createFetchCount: 0 };
const failedBundle = baseBundle({ jobId: "JOB-SMOKE-EVENT-ASSET-API-FAIL" });
const failedRepo = repoStub(failedBundle);
const failed = await ensureEventAssetForTargetOnce({
  repo: failedRepo,
  jobId: failedBundle.job.job_id,
  confirmVariableValue: EVENT_ASSET_CONFIRM_VALUE,
  fetchImpl: fetchSuccess(failedState, { status: 400, payload: { code: 40000, request_id: "smoke", message: "permission denied" } }),
  readonlyClient: clientStub(failedState, { readyAfterCreate: false }),
  credentialSummary: validCredential(),
  oceanEngineEnv: { OCEANENGINE_ACCESS_TOKEN: "token-smoke" },
  projectStatePath: await statePathFor(failedBundle)
});
assert.equal(failed.status, "event_asset_create_failed_once");
assert.equal(failedState.createFetchCount, 1);

const output = {
  status: "passed",
  requestPlanPassed: requestPlan.status === "passed",
  noopStatus: noop.status,
  createStatus: created.status,
  duplicateBlocked: duplicate.blockers.includes("event_asset_platform_action_already_recorded_for_job"),
  appMismatchBlocked: mismatch.blockers.includes("event_asset_app_binding_unverified"),
  postCreateReadbackBlocked: readbackFail.status === "event_asset_readback_not_verified",
  apiFailureBlocked: failed.status === "event_asset_create_failed_once",
  maxCreateCallsObserved: Math.max(
    noopState.createFetchCount,
    createState.createFetchCount,
    duplicateState.createFetchCount,
    mismatchState.createFetchCount,
    readbackFailState.createFetchCount,
    failedState.createFetchCount
  ),
  noTokenRefresh: true,
  payloadPersisted: false,
  responsePersisted: false
};
assertNoSensitiveLeak(output);
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
