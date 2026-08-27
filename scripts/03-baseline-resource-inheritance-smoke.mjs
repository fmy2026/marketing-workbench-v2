import { runOceanEngineBaselineResourceProbes } from "../src/platforms/oceanengineReadonlyAdapter.mjs";
import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import { runDmpReadonlyGate } from "../src/workflows/skills/oe3/04-dmp-readonly.mjs";
import { runLaunchPackSkill } from "../src/workflows/skills/oe3/03-launch-pack.mjs";
import { runBaselineResourceReadonlyBootstrap } from "./03-baseline-resource-bootstrap-readonly-cli.mjs";

const TARGET = Object.freeze({
  routeId: "oceanengine_3_byte_mini_game",
  gameCode: "JSZC",
  advertiserId: "1871922346964041"
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function fakeReadonlyClient() {
  return {
    credentialState: () => ({ status: "ready", blockers: [] }),
    async get({ label, endpoint }) {
      const summaries = {
        baseline_avatar: { avatarReady: true },
        baseline_event_asset: { expectedAssetFound: true, expectedAssetId: "100000000001" },
        baseline_brand_info: {
          matchedBrandCount: 1,
          brandNameId: "11467384",
          cdpBrandId: "4016408",
          cdpBrandName: "巨兽战场"
        },
        baseline_brand_industry: { industryMatched: true, industryId: "2202", industryPath: "游戏 / SLG" },
        baseline_product_image_inventory: { imageCandidateCount: 3 },
        dmp_custom_audience: { customAudienceIds: ["100000000001", "100000000002"] }
      };
      return {
        label,
        endpoint,
        status: "passed",
        httpStatus: 200,
        apiCode: "0",
        requestIdPresent: true,
        responseHash: `sha256:smoke-${label}`,
        summary: summaries[label] || {}
      };
    }
  };
}

const repo = new PostgresRepository();
const targetBundle = await repo.getCoreContext(TARGET);
const blueprints = targetBundle.resourceBlueprints || [];

assert(blueprints.length === 9, "jszc_blueprint_count_mismatch");
assert(new Set(blueprints.map((item) => item.resource_type)).size === 8, "jszc_blueprint_resource_type_coverage_mismatch");
assert(blueprints.filter((item) => item.resource_type === "video_asset").length === 2, "jszc_video_blueprint_count_mismatch");
assert(blueprints.some((item) => item.resource_type === "backup_landing_page" && item.source_asset_id === "LPA-JSZC-OE3-BACKUP-001"), "jszc_backup_landing_blueprint_missing");
assert(!Object.hasOwn(targetBundle.defaults?.raw_defaults?.material_source_account || {}, "target_advertiser_id"), "legacy_target_advertiser_id_not_removed");

const pack = runLaunchPackSkill({ bundle: targetBundle, skillKey: "launch-pack-resolve-resource-blueprints" });
assert(pack.status === "passed", "blueprint_launch_pack_skill_not_passed");

const probes = await runOceanEngineBaselineResourceProbes({ bundle: targetBundle, client: fakeReadonlyClient() });
const productUpdate = probes.resourceUpdates.find((item) => item.resourceType === "product_image") || {};
assert(probes.status === "passed", "baseline_probe_fixture_not_passed");
assert(productUpdate.readonlyCheck?.status === "needs_confirmation", "product_image_inventory_was_auto_selected");
assert(!productUpdate.platformResourceId, "product_image_platform_id_was_auto_selected");
assert(productUpdate.resourceMetadata?.product_image_inventory?.candidate_count === 3, "product_image_inventory_count_missing");

const dmpWrites = [];
const dmpBundle = {
  ...targetBundle,
  job: {
    job_id: "JOB-SMOKE-JSZC-DMP-CANDIDATE",
    route_id: TARGET.routeId,
    game_code: TARGET.gameCode,
    advertiser_id: TARGET.advertiserId,
    source_usage: "runtime_truth"
  },
  resources: [{
    resource_type: "dmp_audience_package",
    visibility_status: "needs_confirmation",
    readback_status: "not_checked",
    platform_resource_id: "",
    metadata: { readonly_check: { status: "baseline_candidate" } }
  }]
};
const dmpResult = await runDmpReadonlyGate({
  repo: {
    async upsertEvidence() {},
    async updateAccountResourceReadonly(input) { dmpWrites.push(input); }
  },
  bundle: dmpBundle,
  client: fakeReadonlyClient(),
  allowReadonlyDependency: true
});
assert(dmpResult.status === "blocked", "dmp_inventory_was_auto_selected");
assert(dmpResult.blockers.includes("dmp_candidate_selection_required"), "dmp_candidate_selection_blocker_missing");
assert(dmpResult.customAudienceIds.length === 0, "dmp_candidate_leaked_into_payload_selection");
assert(dmpResult.outputSummary.dmpCandidateAudienceCount === 2, "dmp_candidate_count_missing");
assert(!Object.hasOwn(dmpWrites[0]?.resourceMetadata || {}, "custom_audience_ids"), "dmp_candidate_persisted_as_selection");

let resumeRejected = false;
try {
  await runBaselineResourceReadonlyBootstrap({
    repo,
    env: {},
    args: {
      routeId: TARGET.routeId,
      gameCode: TARGET.gameCode,
      advertiserId: TARGET.advertiserId,
      jobId: "JOB-NOT-ALLOWED-FOR-BASELINE-BOOTSTRAP",
      expectedMonitorId: "245828",
      sourceRecordRef: "",
      flags: [],
      argv: []
    }
  });
} catch (error) {
  resumeRejected = error.message === "baseline_resource_bootstrap_requires_fresh_job";
}
assert(resumeRejected, "baseline_resource_bootstrap_job_resume_not_rejected");

process.stdout.write(`${JSON.stringify({
  status: "passed",
  blueprintCount: blueprints.length,
  resourceTypeCount: new Set(blueprints.map((item) => item.resource_type)).size,
  productImagePolicy: productUpdate.readonlyCheck?.status,
  dmpPolicy: dmpResult.blockers[0],
  freshRuntimeJobRequired: resumeRejected,
  noOceanEngineNetwork: true,
  noPlatformWrite: true
}, null, 2)}\n`);
