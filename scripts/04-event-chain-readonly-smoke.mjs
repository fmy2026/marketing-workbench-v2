import {
  assertNoSensitiveLeak,
  EVENT_CONFIG_BASELINE_EVENTS,
  EVENT_CONFIG_TRACK_TYPE
} from "../src/workflows/skills/oe3/00-index.mjs";
import {
  eventChainResourceReadiness,
  runEventChainReadonlySkill
} from "../src/workflows/skills/oe3/04-event-chain-readiness.mjs";
import { createOceanEngineReadonlyClient } from "../src/platforms/oceanengineReadonlyClient.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const APP_ID = "tte-smoke-event-chain";

function bundle({ instanceId = "700000000001", appId = APP_ID } = {}) {
  return {
    job: {
      job_id: "JOB-SMOKE-EVENT-CHAIN",
      route_id: "oceanengine_3_byte_mini_game",
      game_code: "JSZC",
      advertiser_id: "8990000000000001",
      source_usage: "test_run"
    },
    platformApp: {
      app_id: appId,
      app_type: "byte_mini_game",
      status: "active",
      metadata: {
        micro_app_instance_id: instanceId,
        micro_app_instance_id_source: "reference_only_old_project_then_stored_in_v2"
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
          project: { landing_type: "MICRO_GAME", ad_type: "ALL", delivery_mode: "PROCEDURAL", marketing_goal: "VIDEO_AND_IMAGE" },
          strategy: { delivery_type: "NORMAL", delivery_medium: "BYTE_GAME", micro_promotion_type: "BYTE_GAME" }
        }
      }
    },
    resources: [
      { resource_type: "event_asset", visibility_status: "needs_confirmation", readback_status: "not_checked", metadata: { readonly_check: { status: "baseline_candidate" } } },
      { resource_type: "micro_app_instance", visibility_status: "needs_confirmation", readback_status: "not_checked", metadata: { readonly_check: { status: "baseline_candidate" } } }
    ]
  };
}

function repoStub() {
  const state = { updates: [], evidence: [] };
  return {
    state,
    async updateAccountResourceReadonly(update) { state.updates.push(update); },
    async upsertEvidence(evidence) { state.evidence.push(evidence); }
  };
}

function asset(id, appId = APP_ID, instanceId = "700000000001") {
  return {
    asset_id: id,
    asset_type: "MINI_PROGRAME",
    share_type: "MY_CREATIONS",
    micro_app_id: appId,
    micro_app_instance_id: instanceId
  };
}

function baselineEvents({ missingTypes = [] } = {}) {
  return EVENT_CONFIG_BASELINE_EVENTS
    .filter((item) => !missingTypes.includes(item.event_type))
    .map((item, index) => ({
      event_id: String([8, 13, 14, 160, 360, 607][EVENT_CONFIG_BASELINE_EVENTS.findIndex((baseline) => baseline.event_type === item.event_type) >= 0
        ? EVENT_CONFIG_BASELINE_EVENTS.findIndex((baseline) => baseline.event_type === item.event_type)
        : index]),
      event_type: item.event_type,
      event_cn_name: item.event_cn_name,
      track_types: [EVENT_CONFIG_TRACK_TYPE]
    }));
}

function clientStub({ assets = [asset("800000000001")], detailAssets = assets, goals = null, dbt = null, missingAvailableTypes = [], missingConfigTypes = [] } = {}) {
  const defaultGoals = [{ optimization_name: "付费", external_action: "AD_CONVERT_TYPE_PAY", deep_external_action: "AD_CONVERT_TYPE_PURCHASE_ROI_7D" }];
  const defaultDbt = [{ deep_bid_type: "PER_AND_SEVEN_PAY_ROI" }];
  const availableEvents = baselineEvents({ missingTypes: missingAvailableTypes });
  const configuredEvents = baselineEvents({ missingTypes: missingConfigTypes });
  const calls = [];
  return {
    calls,
    credentialState() { return { status: "ready", blockers: [] }; },
    async get({ label, endpoint, query, summarize }) {
      calls.push({ label, endpoint, query });
      const payload = label === "event_chain_asset_list"
        ? { code: "0", request_id: "smoke", data: { asset_list: assets, page_info: { total_page: 1 } } }
        : label === "event_chain_asset_detail"
          ? { code: "0", request_id: "smoke", data: { asset_list: detailAssets } }
          : label === "event_chain_available_events"
            ? { code: "0", request_id: "smoke", data: { event_configs: availableEvents } }
          : label === "event_chain_event_configs"
            ? { code: "0", request_id: "smoke", data: { event_configs: configuredEvents } }
          : label === "event_chain_optimized_goal"
            ? { code: "0", request_id: "smoke", data: { list: goals === null ? defaultGoals : goals } }
            : { code: "0", request_id: "smoke", data: { list: dbt === null ? defaultDbt : dbt } };
      return {
        label,
        endpoint,
        status: "passed",
        httpStatus: 200,
        apiCode: "0",
        requestIdPresent: true,
        responseHash: `sha256:smoke-${label}`,
        summary: summarize(payload)
      };
    }
  };
}

function rawJsonResponse(text, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return text; }
  };
}

function readonlyHttpFixture(text) {
  const client = createOceanEngineReadonlyClient({
    fetchImpl: async () => rawJsonResponse(text)
  });
  client.credentialState = () => ({ status: "ready", blockers: [] });
  client.loadEnv = () => ({ OCEANENGINE_ACCESS_TOKEN: "token-smoke" });
  return client;
}

function persistedBundle(original, updates) {
  return {
    ...original,
    resources: original.resources.map((item) => {
      const update = updates.find((candidate) => candidate.resourceType === item.resource_type);
      return update ? {
        ...item,
        platform_resource_id: update.platformResourceId || "",
        visibility_status: update.visibilityStatus || item.visibility_status,
        readback_status: update.readbackStatus || item.readback_status,
        metadata: { ...item.metadata, readonly_check: update.metadata, ...(update.resourceMetadata || {}) }
      } : item;
    })
  };
}

const passBundle = bundle();
const passRepo = repoStub();
const passClient = clientStub();
const pass = await runEventChainReadonlySkill({ repo: passRepo, bundle: passBundle, client: passClient, allowReadonlyDependency: true });
assert(pass.status === "passed", "complete_event_chain_should_pass");
assert(passRepo.state.updates.length === 2, "two_resource_projections_required");
assert(passClient.calls.filter((item) => item.label === "event_chain_available_events").length === 1, "available_events_must_run_once");
assert(passClient.calls.filter((item) => item.label === "event_chain_event_configs").length === 1, "event_configs_must_run_once");
assert(passClient.calls.filter((item) => item.label === "event_chain_optimized_goal").length === 1, "optimized_goal_must_run_once");
assert(passClient.calls.filter((item) => item.label === "event_chain_dbt").length === 1, "dbt_must_run_once");
const optimizedGoalCall = passClient.calls.find((item) => item.label === "event_chain_optimized_goal");
assert(optimizedGoalCall?.query?.asset_id === "800000000001", "optimized_goal_must_use_verified_asset_id");
const passedProjection = persistedBundle(passBundle, passRepo.state.updates);
assert(eventChainResourceReadiness({ bundle: passedProjection, resourceType: "event_asset" }).status === "passed", "event_projection_should_pass");
assert(eventChainResourceReadiness({ bundle: passedProjection, resourceType: "micro_app_instance" }).status === "passed", "instance_projection_should_pass");

const losslessInstanceId = "7434750138926546994";
const losslessDetail = await readonlyHttpFixture(`{"code":"0","data":{"asset_list":[{"asset_id":1874962943118532,"asset_type":"MINI_PROGRAME","micro_app_id":"${APP_ID}","micro_app_instance_id":${losslessInstanceId},"unrelated_numeric":9007199254740993}]}}`).get({
  label: "lossless_event_asset_detail",
  endpoint: "tools/event/all_assets/detail",
  summarize: (payload) => {
    const item = payload.data?.asset_list?.[0] || {};
    return {
      assetId: item.asset_id,
      appId: item.micro_app_id,
      instanceId: item.micro_app_instance_id,
      assetIdType: typeof item.asset_id,
      instanceIdType: typeof item.micro_app_instance_id,
      unrelatedNumericType: typeof item.unrelated_numeric
    };
  }
});
assert(losslessDetail.status === "passed", "lossless_detail_http_fixture_must_pass");
assert(losslessDetail.summary.assetId === "1874962943118532", "asset_id_must_remain_lossless_string");
assert(losslessDetail.summary.appId === APP_ID, "micro_app_id_must_be_available");
assert(losslessDetail.summary.instanceId === losslessInstanceId, "micro_app_instance_id_must_remain_lossless_string");
assert(losslessDetail.summary.assetIdType === "string", "asset_id_type_must_be_string");
assert(losslessDetail.summary.instanceIdType === "string", "instance_id_type_must_be_string");
assert(losslessDetail.summary.unrelatedNumericType === "number", "non_allowlisted_numbers_must_keep_existing_parse_semantics");

const actualFieldWins = await runEventChainReadonlySkill({
  repo: repoStub(),
  bundle: bundle({ instanceId: losslessInstanceId }),
  client: clientStub({
    assets: [asset("800000000001", APP_ID, losslessInstanceId)],
    detailAssets: [{
      ...asset("800000000001", APP_ID, losslessInstanceId),
      instance_id: "legacy-value-must-not-override-micro-field"
    }]
  }),
  allowReadonlyDependency: true
});
assert(actualFieldWins.status === "passed", "micro_app_instance_id_must_take_priority_over_legacy_instance_alias");

const malformedDetail = await readonlyHttpFixture("not-json").get({
  label: "malformed_event_asset_detail",
  endpoint: "tools/event/all_assets/detail"
});
assert(malformedDetail.status === "blocked", "malformed_detail_must_fail_closed");

const noAsset = await runEventChainReadonlySkill({ repo: repoStub(), bundle: bundle(), client: clientStub({ assets: [] }), allowReadonlyDependency: true });
assert(noAsset.blockers.includes("event_asset_target_not_found"), "missing_asset_blocker_required");

const appMismatch = await runEventChainReadonlySkill({ repo: repoStub(), bundle: bundle(), client: clientStub({ detailAssets: [asset("800000000001", "tte-other")] }), allowReadonlyDependency: true });
assert(appMismatch.blockers.includes("micro_app_instance_binding_readback_failed"), "app_instance_binding_blocker_required");
assert(appMismatch.outputSummary.eventConfigsStatus === "not_called", "binding_failure_must_stop_before_configs");

const missingApp = await runEventChainReadonlySkill({ repo: repoStub(), bundle: bundle(), client: clientStub({ detailAssets: [asset("800000000001", "")] }), allowReadonlyDependency: true });
assert(missingApp.blockers.includes("micro_app_instance_binding_readback_failed"), "missing_detail_app_must_block");

const missingDetailInstance = await runEventChainReadonlySkill({ repo: repoStub(), bundle: bundle(), client: clientStub({ detailAssets: [asset("800000000001", APP_ID, "")] }), allowReadonlyDependency: true });
assert(missingDetailInstance.blockers.includes("micro_app_instance_binding_readback_failed"), "missing_detail_instance_must_block");

const ambiguous = await runEventChainReadonlySkill({
  repo: repoStub(),
  bundle: bundle(),
  client: clientStub({ assets: [asset("800000000001"), asset("800000000002")], detailAssets: [asset("800000000001"), asset("800000000002")] }),
  allowReadonlyDependency: true
});
assert(ambiguous.blockers.includes("event_asset_target_ambiguous"), "ambiguous_asset_blocker_required");

const noInstance = await runEventChainReadonlySkill({ repo: repoStub(), bundle: bundle({ instanceId: "" }), client: clientStub(), allowReadonlyDependency: true });
assert(noInstance.blockers.includes("micro_app_instance_candidate_missing"), "missing_candidate_blocker_required");
assert(noInstance.outputSummary.targetInstanceReadbackVerified === false, "reference_candidate_must_not_be_target_truth");

const noAvailable = await runEventChainReadonlySkill({ repo: repoStub(), bundle: bundle(), client: clientStub({ missingAvailableTypes: ["purchase_roi_7d"] }), allowReadonlyDependency: true });
assert(noAvailable.status === "passed", "available_events_can_be_empty_after_event_configs_are_configured");
assert(noAvailable.outputSummary.availableEventsReadbackVerified === false, "available_events_post_configured_gap_must_stay_visible");
assert(noAvailable.outputSummary.eventConfigsReadbackVerified === true, "configured_event_configs_should_drive_post_create_readback");

const noEventConfig = await runEventChainReadonlySkill({ repo: repoStub(), bundle: bundle(), client: clientStub({ missingConfigTypes: ["purchase_roi_7d"] }), allowReadonlyDependency: true });
assert(noEventConfig.blockers.includes("event_configs_baseline_missing"), "missing_event_config_blocker_required");
assert(noEventConfig.outputSummary.optimizedGoalStatus === "not_called", "optimized_goal_must_wait_for_event_configs");

const noAvailableAndNoEventConfig = await runEventChainReadonlySkill({
  repo: repoStub(),
  bundle: bundle(),
  client: clientStub({
    missingAvailableTypes: ["purchase_roi_7d"],
    missingConfigTypes: ["purchase_roi_7d"]
  }),
  allowReadonlyDependency: true
});
assert(noAvailableAndNoEventConfig.blockers.includes("available_events_baseline_missing"), "missing_available_event_blocker_required_when_config_missing");
assert(noAvailableAndNoEventConfig.blockers.includes("event_configs_baseline_missing"), "missing_config_blocker_required_when_available_missing");
assert(noAvailableAndNoEventConfig.outputSummary.optimizedGoalStatus === "not_called", "optimized_goal_must_wait_for_missing_event_configs");

const noGoal = await runEventChainReadonlySkill({ repo: repoStub(), bundle: bundle(), client: clientStub({ goals: [] }), allowReadonlyDependency: true });
assert(noGoal.blockers.includes("optimized_goal_not_available"), "missing_goal_blocker_required");

const noDeepGoal = await runEventChainReadonlySkill({
  repo: repoStub(),
  bundle: bundle(),
  client: clientStub({ goals: [{ external_action: "AD_CONVERT_TYPE_PAY" }] }),
  allowReadonlyDependency: true
});
assert(noDeepGoal.blockers.includes("deep_objective_not_available"), "missing_deep_goal_blocker_required");

const noDeepBid = await runEventChainReadonlySkill({ repo: repoStub(), bundle: bundle(), client: clientStub({ dbt: [] }), allowReadonlyDependency: true });
assert(noDeepBid.blockers.includes("deep_bid_type_not_available"), "missing_deep_bid_blocker_required");

const output = {
  status: "passed",
  fullChainPassed: pass.status === "passed",
  losslessHttpDetailPassed: losslessDetail.status === "passed" && losslessDetail.summary.instanceId === losslessInstanceId,
  actualFieldPriorityPassed: actualFieldWins.status === "passed",
  malformedHttpDetailBlocked: malformedDetail.status === "blocked",
  noAssetBlocked: noAsset.blockers.includes("event_asset_target_not_found"),
  appMismatchBlocked: appMismatch.blockers.includes("micro_app_instance_binding_readback_failed"),
  missingDetailAppBlocked: missingApp.blockers.includes("micro_app_instance_binding_readback_failed"),
  missingDetailInstanceBlocked: missingDetailInstance.blockers.includes("micro_app_instance_binding_readback_failed"),
  ambiguousBlocked: ambiguous.blockers.includes("event_asset_target_ambiguous"),
  referenceCandidateNotPromoted: noInstance.outputSummary.targetInstanceReadbackVerified === false,
  availableGapIgnoredAfterConfigured: noAvailable.status === "passed",
  noAvailableBlockedWhenConfigMissing: noAvailableAndNoEventConfig.blockers.includes("available_events_baseline_missing"),
  noEventConfigBlocked: noEventConfig.blockers.includes("event_configs_baseline_missing"),
  noGoalBlocked: noGoal.blockers.includes("optimized_goal_not_available"),
  noDeepGoalBlocked: noDeepGoal.blockers.includes("deep_objective_not_available"),
  noDeepBidBlocked: noDeepBid.blockers.includes("deep_bid_type_not_available"),
  optimizedGoalUsesAssetId: optimizedGoalCall?.query?.asset_id === "800000000001",
  noPlatformWrite: true,
  noRawRequestOrResponse: true
};
assertNoSensitiveLeak(output);
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
