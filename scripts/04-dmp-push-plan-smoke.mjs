import {
  buildDmpPushRequestPlan,
  summarizeDmpPushPlans
} from "../src/platforms/oceanengineDmpExecutor.mjs";
import {
  runDmpBaselineResolveSkill,
  runDmpPushPlanSkill
} from "../src/workflows/skills/oe3/04-dmp-readonly.mjs";
import { assertNoSensitiveLeak } from "../src/workflows/skills/oe3/00-contracts.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const bundle = {
  job: {
    job_id: "JOB-SMOKE-DMP-PUSH-PLAN",
    route_id: "oceanengine_3_byte_mini_game",
    game_code: "JSZC",
    advertiser_id: "1871922346964041",
    source_usage: "test_run"
  },
  resourceBlueprints: [
    {
      resource_type: "dmp_audience_package",
      source_asset_id: "DMP-JSZC-HUNT-CONVERTED-EXCLUDE-BASELINE-001",
      metadata: {
        package_set_id: "DMP-JSZC-HUNT-CONVERTED-EXCLUDE-BASELINE-001"
      }
    }
  ],
  resources: [
    {
      resource_type: "dmp_audience_package",
      visibility_status: "needs_confirmation",
      readback_status: "not_checked",
      metadata: {
        baseline_blueprint: {
          source_asset_id: "DMP-JSZC-HUNT-CONVERTED-EXCLUDE-BASELINE-001"
        }
      }
    }
  ]
};

const packageSet = {
  packageSet: {
    package_set_id: "DMP-JSZC-HUNT-CONVERTED-EXCLUDE-BASELINE-001",
    semantic_key: "converted_exclude_tags",
    payload_field: "audience.retargeting_tags_exclude",
    source_advertiser_id: "1871922153496588"
  },
  members: [
    { custom_audience_id: "482709313", source_readonly_status: "passed", target_readonly_status: "missing" },
    { custom_audience_id: "479197805", source_readonly_status: "passed", target_readonly_status: "missing" }
  ]
};

const pushPlanRows = [];
const repo = {
  async getDmpPackageSet() {
    return packageSet;
  },
  async updateDmpPackageSetStatus() {},
  async updateAccountResourceReadonly() {},
  async upsertEvidence(evidence) {
    return evidence.artifactId;
  },
  async upsertDmpPackagePushPlans({ customAudienceIds, requestFieldManifest }) {
    customAudienceIds.forEach((id) => {
      pushPlanRows.push({
        push_plan_id: `DMPP-JOB-SMOKE-DMP-PUSH-PLAN-${id}`,
        custom_audience_id: id,
        plan_status: "planned",
        request_hash: buildDmpPushRequestPlan({
          sourceAdvertiserId: "1871922153496588",
          targetAdvertiserId: "1871922346964041",
          customAudienceId: id
        }).requestHash,
        request_field_manifest: requestFieldManifest
      });
    });
    return {
      plannedCount: customAudienceIds.length,
      pushPlanIds: pushPlanRows.map((row) => row.push_plan_id)
    };
  }
};

const single = buildDmpPushRequestPlan({
  sourceAdvertiserId: "1871922153496588",
  targetAdvertiserId: "1871922346964041",
  customAudienceId: "482709313"
});
assert(single.method === "POST", "dmp_push_method_wrong");
assert(single.endpoint.includes("/dmp/custom_audience/push_v2/"), "dmp_push_endpoint_wrong");
assert(single.requestHash.startsWith("sha256:"), "dmp_push_request_hash_missing");
assert(single.requestFieldManifest.fieldNames.includes("target_advertiser_ids"), "dmp_push_target_field_missing");
assert(!single.requestFieldManifest.fieldNames.includes("delivery_status"), "dmp_push_delivery_status_should_not_be_sent");
assert(single.requestFieldManifest.customAudienceIdTransportType === "number", "dmp_push_audience_transport_should_be_number");
assert(single.requestFieldManifest.targetAdvertiserIdsTransportType === "number_array", "dmp_push_target_transport_should_be_number_array");

const baseline = await runDmpBaselineResolveSkill({ repo, bundle });
assert(baseline.status === "passed", "dmp_baseline_resolve_failed");
assert(baseline.outputSummary.memberCount === 2, "dmp_member_count_wrong");

const previousOutputs = new Map([
  ["dmp-source-readonly-verify", { status: "passed", customAudienceIds: ["482709313", "479197805"] }],
  ["dmp-target-readonly-verify", { status: "blocked", customAudienceIds: [] }]
]);
const pushPlan = await runDmpPushPlanSkill({ repo, bundle, previousOutputs });
assert(pushPlan.status === "blocked", "dmp_push_plan_should_block_until_execute");
assert(pushPlan.blockers.includes("dmp_target_push_plan_pending"), "dmp_push_plan_blocker_missing");
assert(pushPlan.outputSummary.pushPlanCount === 2, "dmp_push_plan_count_wrong");
assert(pushPlan.outputSummary.requestFieldManifest.fieldNames.includes("custom_audience_id"), "dmp_push_plan_field_manifest_missing");

const summary = {
  status: "passed",
  single,
  pushPlan: pushPlan.outputSummary,
  pushPlanReport: summarizeDmpPushPlans(pushPlanRows),
  noRealPlatformWrite: true,
  noTokenRefresh: true
};
assertNoSensitiveLeak(summary);
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
