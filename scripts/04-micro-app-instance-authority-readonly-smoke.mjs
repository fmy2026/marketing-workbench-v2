import { assertNoSensitiveLeak } from "../src/workflows/skills/oe3/00-contracts.mjs";
import { runMicroAppInstanceAuthorityReadonlySkill, eventChainResourceReadiness } from "../src/workflows/skills/oe3/04-event-chain-readiness.mjs";
import { buildEventAssetAccountProvisionContract } from "../src/workflows/skills/oe3/04-event-asset-account-contract.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function bundle({ instanceId = "700000000001", instanceSource = "reference_only_current_target" } = {}) {
  return {
    job: {
      job_id: "JOB-SMOKE-MICRO-APP-AUTHORITY",
      route_id: "oceanengine_3_byte_mini_game",
      game_code: "JSZC",
      advertiser_id: "8990000000000001",
      source_usage: "test_run"
    },
    platformApp: {
      id: "GPA-SMOKE",
      app_id: "tte-smoke-micro-game",
      app_name: "smoke micro game",
      app_type: "byte_mini_game",
      status: "active",
      metadata: {
        micro_app_instance_id: instanceId,
        micro_app_instance_id_source: instanceSource
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
      { resource_type: "event_asset", visibility_status: "needs_confirmation", readback_status: "not_checked", metadata: {} },
      { resource_type: "micro_app_instance", visibility_status: "needs_confirmation", readback_status: "not_checked", metadata: {} }
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

function clientStub({ requestIdPresent = true, goals = null } = {}) {
  const calls = [];
  return {
    calls,
    credentialState() { return { status: "ready", blockers: [] }; },
    async get({ label, endpoint, query, summarize }) {
      calls.push({ label, endpoint, query });
      const payload = {
        code: "0",
        request_id: requestIdPresent ? "smoke-request" : "",
        data: {
          list: goals === null
            ? [{ external_action: "AD_CONVERT_TYPE_PAY", deep_external_action: "AD_CONVERT_TYPE_PURCHASE_ROI_7D" }]
            : goals
        }
      };
      return {
        label,
        endpoint,
        status: "passed",
        httpStatus: 200,
        apiCode: "0",
        requestIdPresent,
        responseHash: "sha256:smoke-micro-app-authority",
        summary: summarize(payload)
      };
    }
  };
}

const passRepo = repoStub();
const passClient = clientStub();
const passBundle = bundle();
const pass = await runMicroAppInstanceAuthorityReadonlySkill({
  repo: passRepo,
  bundle: passBundle,
  client: passClient,
  allowReadonlyDependency: true
});
assert(pass.status === "passed", "authority_readonly_should_pass");
assert(pass.outputSummary.targetInstanceReadbackVerified === false, "authority_must_not_promote_target_readback");
assert(pass.outputSummary.diagnosticPassed === true, "authority_diagnostic_pass_missing");
assert(passRepo.state.updates.length === 0, "authority_must_not_update_resource_truth");
assert(passRepo.state.evidence.length === 1, "authority_evidence_missing");
assert(passClient.calls.length === 1, "authority_probe_count_wrong");
assert(!Object.hasOwn(passClient.calls[0].query, "asset_id"), "authority_probe_must_not_require_event_asset");
const instanceReadiness = eventChainResourceReadiness({ bundle: passBundle, resourceType: "micro_app_instance" });
assert(instanceReadiness.status === "blocked", "resource_skill_status_must_stay_in_persisted_enum");
assert(instanceReadiness.outputSummary.prepareCapability?.status === "waiting_on_event_asset", "instance_must_wait_for_asset_binding");
const provision = buildEventAssetAccountProvisionContract({ bundle: passBundle });
assert(provision.status === "ready_for_plan", "controlled_candidate_should_not_require_authority_probe");

const missingIdRepo = repoStub();
const missingId = await runMicroAppInstanceAuthorityReadonlySkill({
  repo: missingIdRepo,
  bundle: bundle({ instanceId: "" }),
  client: clientStub(),
  allowReadonlyDependency: true
});
assert(missingId.status === "blocked", "missing_candidate_should_block");
assert(missingId.blockers.includes("micro_app_instance_candidate_missing"), "missing_candidate_blocker_missing");
assert(missingIdRepo.state.updates.length === 0 && missingIdRepo.state.evidence.length === 1, "blocked_candidate_must_only_persist_audit_evidence");

const noRequestIdRepo = repoStub();
const noRequestId = await runMicroAppInstanceAuthorityReadonlySkill({
  repo: noRequestIdRepo,
  bundle: bundle(),
  client: clientStub({ requestIdPresent: false }),
  allowReadonlyDependency: true
});
assert(noRequestId.status === "blocked", "missing_request_id_should_block");
assert(noRequestId.blockers.includes("micro_app_instance_authority_request_id_missing"), "missing_request_id_blocker_missing");
assert(noRequestIdRepo.state.updates.length === 0 && noRequestIdRepo.state.evidence.length === 1, "failed_authority_probe_must_only_persist_audit_evidence");

const missingGoal = await runMicroAppInstanceAuthorityReadonlySkill({
  repo: repoStub(),
  bundle: bundle(),
  client: clientStub({ goals: [] }),
  allowReadonlyDependency: true
});
assert(missingGoal.blockers.includes("optimized_goal_not_available"), "missing_goal_blocker_missing");
assert(missingGoal.blockers.includes("deep_objective_not_available"), "missing_deep_goal_blocker_missing");

const output = {
  status: "passed",
  authorityPassed: pass.status === "passed",
  noAssetDependency: !Object.hasOwn(passClient.calls[0].query, "asset_id"),
  controlledCandidatePlansWithoutAuthorityEvidence: provision.status === "ready_for_plan",
  missingCandidateBlocked: missingId.blockers.includes("micro_app_instance_candidate_missing"),
  missingRequestIdBlocked: noRequestId.blockers.includes("micro_app_instance_authority_request_id_missing"),
  missingGoalsBlocked: missingGoal.blockers.includes("optimized_goal_not_available") && missingGoal.blockers.includes("deep_objective_not_available"),
  noPlatformWrite: true,
  noRawRequestOrResponse: true
};
assertNoSensitiveLeak(output);
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
