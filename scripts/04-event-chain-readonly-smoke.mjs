import { assertNoSensitiveLeak } from "../src/workflows/skills/oe3/00-index.mjs";
import {
  eventChainResourceReadiness,
  runEventChainReadonlySkill
} from "../src/workflows/skills/oe3/04-event-chain-readiness.mjs";

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

function asset(id, appId = APP_ID) {
  return { asset_id: id, asset_type: "MINI_PROGRAME", share_type: "MY_CREATIONS", app_id: appId };
}

function clientStub({ assets = [asset("800000000001")], detailAssets = assets, goals = null, dbt = null } = {}) {
  const defaultGoals = [{ optimization_name: "付费", external_action: "AD_CONVERT_TYPE_PAY", deep_external_action: "AD_CONVERT_TYPE_PURCHASE_ROI_7D" }];
  const defaultDbt = [{ deep_bid_type: "PER_AND_SEVEN_PAY_ROI" }];
  const calls = [];
  return {
    calls,
    credentialState() { return { status: "ready", blockers: [] }; },
    async get({ label, endpoint, summarize }) {
      calls.push({ label, endpoint });
      const payload = label === "event_chain_asset_list"
        ? { code: "0", request_id: "smoke", data: { asset_list: assets, page_info: { total_page: 1 } } }
        : label === "event_chain_asset_detail"
          ? { code: "0", request_id: "smoke", data: { asset_list: detailAssets } }
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
assert(passClient.calls.filter((item) => item.label === "event_chain_optimized_goal").length === 1, "optimized_goal_must_run_once");
assert(passClient.calls.filter((item) => item.label === "event_chain_dbt").length === 1, "dbt_must_run_once");
const passedProjection = persistedBundle(passBundle, passRepo.state.updates);
assert(eventChainResourceReadiness({ bundle: passedProjection, resourceType: "event_asset" }).status === "passed", "event_projection_should_pass");
assert(eventChainResourceReadiness({ bundle: passedProjection, resourceType: "micro_app_instance" }).status === "passed", "instance_projection_should_pass");

const noAsset = await runEventChainReadonlySkill({ repo: repoStub(), bundle: bundle(), client: clientStub({ assets: [] }), allowReadonlyDependency: true });
assert(noAsset.blockers.includes("event_asset_target_not_found"), "missing_asset_blocker_required");

const appMismatch = await runEventChainReadonlySkill({ repo: repoStub(), bundle: bundle(), client: clientStub({ detailAssets: [asset("800000000001", "tte-other")] }), allowReadonlyDependency: true });
assert(appMismatch.blockers.includes("event_asset_app_binding_unverified"), "app_binding_blocker_required");

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
  noAssetBlocked: noAsset.blockers.includes("event_asset_target_not_found"),
  appMismatchBlocked: appMismatch.blockers.includes("event_asset_app_binding_unverified"),
  ambiguousBlocked: ambiguous.blockers.includes("event_asset_target_ambiguous"),
  referenceCandidateNotPromoted: noInstance.outputSummary.targetInstanceReadbackVerified === false,
  noGoalBlocked: noGoal.blockers.includes("optimized_goal_not_available"),
  noDeepGoalBlocked: noDeepGoal.blockers.includes("deep_objective_not_available"),
  noDeepBidBlocked: noDeepBid.blockers.includes("deep_bid_type_not_available"),
  noPlatformWrite: true,
  noRawRequestOrResponse: true
};
assertNoSensitiveLeak(output);
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
