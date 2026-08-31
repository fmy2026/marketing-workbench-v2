import assert from "node:assert/strict";
import { buildSingleResourceExecutionPlanFromBundle } from "../src/workflows/executionPlan.mjs";
import {
  buildEventAssetAccountProvisionContract,
  syncEventAssetAccountProvisionContract
} from "../src/workflows/skills/oe3/04-event-asset-account-contract.mjs";
import { assertNoSensitiveLeak } from "../src/workflows/skills/oe3/00-contracts.mjs";

function bundle({ instanceReadbackVerified = true } = {}) {
  return {
    job: {
      job_id: "JOB-SMOKE-EVENT-ASSET-ACCOUNT-CONTRACT",
      case_id: "CASE-SMOKE-EVENT-ASSET-ACCOUNT-CONTRACT",
      route_id: "oceanengine_3_byte_mini_game",
      game_code: "JSZC",
      advertiser_id: "8990000000002201",
      object_type: "std_project",
      source_usage: "test_run"
    },
    defaults: {
      objective: "AD_CONVERT_TYPE_PAY",
      deep_objective: "AD_CONVERT_TYPE_PURCHASE_ROI_7D",
      deep_bid_type: "PER_AND_SEVEN_PAY_ROI"
    },
    platformApp: {
      id: "GPA-SMOKE-EVENT-ASSET",
      app_id: "tte-smoke-event-asset",
      app_name: "巨兽战场",
      app_type: "byte_mini_game",
      status: "active",
      metadata: {
        micro_app_instance_id: "7990000000002201",
        micro_app_instance_id_source: "readonly_target_evidence"
      }
    },
    resourceBlueprints: [{ resource_type: "event_asset", metadata: {} }],
    resources: [
      { resource_type: "event_asset", visibility_status: "needs_confirmation", readback_status: "not_checked", metadata: {} },
      {
        resource_type: "micro_app_instance",
        visibility_status: "needs_confirmation",
        readback_status: "not_checked",
        metadata: {
          event_chain_readonly_contract: {
            target_instance_readback_verified: instanceReadbackVerified
          }
        }
      }
    ]
  };
}

const verifiedBundle = bundle();
const ready = buildEventAssetAccountProvisionContract({ bundle: verifiedBundle });
assert.equal(ready.status, "ready_for_plan");
assert.equal(ready.outputSummary.contractPlanEligible, true);
assert.equal(ready.provision.target_advertiser_id, verifiedBundle.job.advertiser_id);
assert.equal(ready.provision.template_ref.includes(verifiedBundle.job.advertiser_id), true);

const planBundle = {
  ...verifiedBundle,
  resources: verifiedBundle.resources.map((item) => item.resource_type === "event_asset"
    ? { ...item, metadata: { ...item.metadata, event_asset_provision: ready.provision } }
    : item)
};
const plan = buildSingleResourceExecutionPlanFromBundle(planBundle, {
  planVersion: 2,
  resourceType: "event_asset"
});
assert.equal(plan.planStatus, "ready");
assert.deepEqual(plan.plannedActions.map((action) => action.action_type), ["ensure_resource:event_asset"]);
assert.equal(plan.metadata.execution_scope.maximum_platform_calls, 1);
assert.equal(plan.metadata.execution_scope.retry_allowed, false);

const writes = [];
const saved = await syncEventAssetAccountProvisionContract({
  repo: {
    async mergeAccountResourceMetadata(input) { writes.push(input); }
  },
  bundle: verifiedBundle
});
assert.equal(saved.status, "ready_for_plan");
assert.equal(saved.outputSummary.accountContractStored, true);
assert.equal(writes.length, 1);
assert.equal(writes[0].resourceType, "event_asset");
assert.equal(writes[0].resourceMetadata.event_asset_provision.target_advertiser_id, verifiedBundle.job.advertiser_id);

const referenceOnly = buildEventAssetAccountProvisionContract({
  bundle: bundle({ instanceReadbackVerified: false })
});
assert.equal(referenceOnly.status, "blocked");
assert(referenceOnly.blockers.includes("event_asset_provision_instance_readback_unverified"));
const noWrite = await syncEventAssetAccountProvisionContract({
  repo: {
    async mergeAccountResourceMetadata() { throw new Error("reference_only_contract_must_not_persist"); }
  },
  bundle: bundle({ instanceReadbackVerified: false })
});
assert.equal(noWrite.outputSummary.accountContractStored, false);

const output = {
  status: "passed",
  accountScopedContractReady: ready.status === "ready_for_plan",
  planIsSingleAction: plan.plannedActions.length === 1,
  referenceOnlyBlocked: referenceOnly.blockers.includes("event_asset_provision_instance_readback_unverified"),
  platformWriteCalled: false,
  rawRequestStored: false,
  rawResponseStored: false
};
assertNoSensitiveLeak(output);
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
