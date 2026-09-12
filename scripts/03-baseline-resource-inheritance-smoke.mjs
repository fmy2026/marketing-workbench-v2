import {
  runOceanEngineBaselineResourceProbes,
  runOceanEngineReadonlyProbes
} from "../src/platforms/oceanengineReadonlyAdapter.mjs";
import { runPlatformReadonlyReconcileSkill } from "../src/workflows/skills/oe3/04-platform-readonly-reconcile.mjs";
import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import { runDmpReadonlyGate } from "../src/workflows/skills/oe3/04-dmp-readonly.mjs";
import { runLaunchPackSkill } from "../src/workflows/skills/oe3/03-launch-pack.mjs";
import {
  runBackupLandingPageDefaultSkill,
  runBackupLandingPageReadinessSkill
} from "../src/workflows/skills/oe3/03-landing-page-readiness.mjs";
import { runBaselineResourceReadonlyBootstrap } from "./03-baseline-resource-bootstrap-readonly-cli.mjs";

const TARGET = Object.freeze({
  routeId: "oceanengine_3_byte_mini_game",
  gameCode: "JSZC",
  advertiserId: "1871922346964041"
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function fakeReadonlyClient(calls = []) {
  return {
    credentialState: () => ({ status: "ready", blockers: [] }),
    async get({ label, endpoint, query = {}, requestFieldManifest = null }) {
      calls.push({ label, endpoint, query, requestFieldManifest });
      const summaries = {
        std_project_duplicate: { listCount: 0 },
        avatar: { avatarStatus: "AUDIT_PASS", avatarReady: true, avatarReadinessReason: "avatar_ready", imagePresent: true, width: 300, height: 300 },
        event_asset: { expectedAssetFound: true, expectedAssetId: "100000000001" },
        brand_info: {
          brandListCount: 1,
          matchedBrandCount: 1,
          outerBrandId: "11467384",
          brandNameId: "11467384",
          cdpBrandId: "4016408",
          cdpBrandName: "巨兽战场"
        },
        brand_industry: { industryMatched: true, industryId: "2202", industryPath: "游戏 / SLG" },
        baseline_avatar: { avatarStatus: "IN_AUDIT", avatarReady: true, avatarReadinessReason: "avatar_ready", imagePresent: true, width: 300, height: 300 },
        baseline_event_asset: { expectedAssetFound: true, expectedAssetId: "100000000001" },
        baseline_brand_info: {
          brandListCount: 1,
          matchedBrandCount: 1,
          outerBrandId: "11467384",
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

function assertIndustryQueryShape(call, label) {
  assert(call, `${label}_call_missing`);
  assert(call.query.account_id === TARGET.advertiserId, `${label}_account_id_missing`);
  assert(!Object.hasOwn(call.query, "brand_name_id"), `${label}_top_level_brand_name_id_present`);
  assert(Object.hasOwn(call.query, "origin_req"), `${label}_origin_req_missing`);
  const originReq = JSON.parse(call.query.origin_req);
  assert(originReq.brand_data_source === "YUNTU", `${label}_origin_req_brand_data_source_mismatch`);
  assert(String(originReq.outer_brand_id) === "11467384", `${label}_origin_req_outer_brand_id_mismatch`);
  assert(call.requestFieldManifest?.fieldNames?.includes("account_id"), `${label}_field_manifest_account_id_missing`);
  assert(call.requestFieldManifest?.fieldNames?.includes("origin_req"), `${label}_field_manifest_origin_req_missing`);
  assert(call.requestFieldManifest?.originReqFieldNames?.includes("brand_data_source"), `${label}_origin_manifest_brand_data_source_missing`);
  assert(call.requestFieldManifest?.originReqFieldNames?.includes("outer_brand_id"), `${label}_origin_manifest_outer_brand_id_missing`);
  assert(call.requestFieldManifest?.forbiddenTopLevelFieldNames?.includes("brand_name_id"), `${label}_forbidden_manifest_missing`);
}

const repo = new PostgresRepository();
const targetBundle = await repo.getCoreContext(TARGET);
const targetRuntimeBundle = {
  ...targetBundle,
  job: {
    ...(targetBundle.job || {}),
    job_id: "JOB-SMOKE-JSZC-BASELINE-RESOURCE",
    route_id: TARGET.routeId,
    game_code: TARGET.gameCode,
    advertiser_id: TARGET.advertiserId,
    source_usage: "test_run"
  }
};
const blueprints = targetBundle.resourceBlueprints || [];
const requiredBlueprints = blueprints.filter((item) => item.required === true);
const requiredVideoBlueprints = requiredBlueprints.filter((item) => item.resource_type === "video_asset");
const requiredResourceKeys = requiredBlueprints.map((item) => `${item.resource_type}:${item.source_asset_id}`);
const requiredActiveVideoPackAssetIds = (targetBundle.materialPack?.items || [])
  .filter((entry) => entry.item?.item_type === "video_asset" && entry.item?.required === true && (entry.item?.status || "active") === "active")
  .map((entry) => String(entry.item?.asset_id || entry.asset?.asset_id || "").trim())
  .filter(Boolean)
  .sort();
const requiredVideoBlueprintAssetIds = requiredVideoBlueprints
  .map((item) => String(item.source_asset_id || "").trim())
  .filter(Boolean)
  .sort();
const duplicateVideoSource = "JSZC-HUNT-4IG2-3";

assert(new Set(blueprints.map((item) => item.resource_type)).size === 8, "jszc_blueprint_resource_type_coverage_mismatch");
assert(new Set(requiredResourceKeys).size === requiredResourceKeys.length, "required_blueprint_resource_key_not_unique");
assert(blueprints.filter((item) => item.resource_type === "video_asset" && item.source_asset_id === duplicateVideoSource).length === 2, "retired_duplicate_video_fixture_missing");
assert(requiredVideoBlueprints.filter((item) => item.source_asset_id === duplicateVideoSource).length === 1, "retired_duplicate_video_not_excluded");
assert(new Set(requiredActiveVideoPackAssetIds).size === requiredActiveVideoPackAssetIds.length, "required_active_material_pack_video_source_asset_not_unique");
assert(JSON.stringify(requiredVideoBlueprintAssetIds) === JSON.stringify(requiredActiveVideoPackAssetIds), "required_video_blueprints_do_not_match_active_required_material_pack");
assert(blueprints.some((item) => item.resource_type === "backup_landing_page" && item.source_asset_id === "LPA-JSZC-OE3-BACKUP-001"), "jszc_backup_landing_blueprint_missing");
assert(!Object.hasOwn(targetBundle.defaults?.raw_defaults?.material_source_account || {}, "target_advertiser_id"), "legacy_target_advertiser_id_not_removed");

const pack = runLaunchPackSkill({ bundle: targetBundle, skillKey: "launch-pack-resolve-resource-blueprints" });
assert(pack.status === "passed", "blueprint_launch_pack_skill_not_passed");

const landingDefaultFixture = {
  backupLandingPage: {
    landing_page_asset_id: "LPA-JSZC-OE3-BACKUP-001",
    site_id: "7624750304608649243",
    site_name: "JSZC backup",
    url_hash: "sha256:smoke-backup-landing",
    status: "active",
    landing_url_present: true,
    landing_url_https: true
  },
  resources: []
};
const node3LandingDefault = runBackupLandingPageDefaultSkill({ bundle: landingDefaultFixture });
const node4LandingWithoutCandidate = runBackupLandingPageReadinessSkill({ bundle: landingDefaultFixture });
const node4LandingCandidate = runBackupLandingPageReadinessSkill({
  bundle: {
    ...landingDefaultFixture,
    resources: [{
      resource_type: "backup_landing_page",
      source_asset_id: "LPA-JSZC-OE3-BACKUP-001",
      visibility_status: "unknown",
      readback_status: "not_checked",
      metadata: {
        url_hash: "sha256:smoke-backup-landing",
        readonly_check: { status: "baseline_candidate" }
      }
    }]
  }
});
assert(node3LandingDefault.status === "passed", "node3_static_landing_default_not_passed");
assert(!node3LandingDefault.blockers.includes("backup_landing_page_resource_missing"), "node3_landing_default_depends_on_account_resource");
assert(node4LandingWithoutCandidate.blockers.includes("backup_landing_page_resource_missing"), "node4_missing_candidate_not_detected");
assert(!node4LandingCandidate.blockers.includes("backup_landing_page_resource_missing"), "node4_candidate_not_consumed");
assert(node4LandingCandidate.blockers.includes("backup_landing_page_target_not_visible"), "node4_target_visibility_not_enforced");

const baselineCalls = [];
const baselineInventoryBundle = {
  ...targetRuntimeBundle,
  resources: (targetRuntimeBundle.resources || []).filter((item) => item.resource_type !== "product_image").concat([{
    resource_type: "product_image",
    visibility_status: "needs_confirmation",
    readback_status: "not_checked",
    metadata: { readonly_check: { status: "baseline_candidate" } }
  }])
};
const probes = await runOceanEngineBaselineResourceProbes({ bundle: baselineInventoryBundle, client: fakeReadonlyClient(baselineCalls) });
assertIndustryQueryShape(baselineCalls.find((item) => item.label === "baseline_brand_industry"), "baseline_brand_industry");
const avatarUpdate = probes.resourceUpdates.find((item) => item.resourceType === "avatar") || {};
const productUpdate = probes.resourceUpdates.find((item) => item.resourceType === "product_image") || {};
assert(probes.status === "passed", "baseline_probe_fixture_not_passed");
assert(avatarUpdate.resourceMetadata?.avatar_readonly_diagnostic?.avatar_status === "IN_AUDIT", "avatar_diagnostic_status_missing");
assert(avatarUpdate.resourceMetadata?.avatar_readonly_diagnostic?.image_present === true, "avatar_diagnostic_image_missing");
assert(avatarUpdate.readonlyCheck?.avatar_readiness_reason === "avatar_ready", "avatar_readiness_reason_missing");
assert(productUpdate.readonlyCheck?.status === "needs_confirmation", "product_image_inventory_was_auto_selected");
assert(!productUpdate.platformResourceId, "product_image_platform_id_was_auto_selected");
assert(productUpdate.resourceMetadata?.product_image_inventory?.candidate_count === 3, "product_image_inventory_count_missing");

const emptyBrandCalls = [];
const emptyBrandClient = fakeReadonlyClient(emptyBrandCalls);
const baseGet = emptyBrandClient.get.bind(emptyBrandClient);
emptyBrandClient.get = async (definition) => {
  if (definition.label !== "baseline_brand_info") return baseGet(definition);
  emptyBrandCalls.push(definition);
  return {
    label: definition.label,
    endpoint: definition.endpoint,
    status: "passed",
    httpStatus: 200,
    apiCode: "0",
    requestIdPresent: true,
    responseHash: "sha256:smoke-empty-brand",
    summary: { brandListCount: 0, matchedBrandCount: 0, outerBrandId: "", brandNameId: "", cdpBrandId: "", cdpBrandName: "" }
  };
};
const targetEmptyOmitBundle = {
  ...baselineInventoryBundle,
  job: { ...baselineInventoryBundle.job, case_id: "CASE-SMOKE-BRAND-EMPTY" },
  case: { case_id: "CASE-SMOKE-BRAND-EMPTY", metadata: {} }
};
const targetEmptyOmitProbe = await runOceanEngineBaselineResourceProbes({ bundle: targetEmptyOmitBundle, client: emptyBrandClient });
const targetEmptyOmitBrand = targetEmptyOmitProbe.resourceUpdates.find((item) => item.resourceType === "brand_info") || {};
assert(targetEmptyOmitBrand.visibilityStatus === "not_required", "target_empty_brand_must_not_be_presented_as_visible");
assert(targetEmptyOmitBrand.readbackStatus === "not_required", "target_empty_brand_must_not_be_presented_as_readback_verified");
assert(targetEmptyOmitBrand.readonlyCheck?.status === "passed", "target_empty_brand_should_be_target_readonly_verified");
assert(targetEmptyOmitBrand.resourceMetadata?.brand_info_official?.source === "live_target_account_empty_brand_list", "target_empty_omit_source_missing");
assert(targetEmptyOmitBrand.resourceMetadata?.brand_info_official?.brand_list_count === 0, "target_empty_omit_evidence_missing");
assert(!emptyBrandCalls.some((item) => item.label === "baseline_brand_industry"), "empty_target_brand_should_not_probe_industry_without_outer_brand_id");

const nonEmptyUnmatchedClient = fakeReadonlyClient();
const nonEmptyBaseGet = nonEmptyUnmatchedClient.get.bind(nonEmptyUnmatchedClient);
nonEmptyUnmatchedClient.get = async (definition) => definition.label === "baseline_brand_info"
  ? { label: definition.label, endpoint: definition.endpoint, status: "passed", httpStatus: 200, apiCode: "0", requestIdPresent: true, responseHash: "sha256:smoke-nonempty-brand", summary: { brandListCount: 1, matchedBrandCount: 0 } }
  : nonEmptyBaseGet(definition);
const nonEmptyUnmatchedProbe = await runOceanEngineBaselineResourceProbes({ bundle: targetEmptyOmitBundle, client: nonEmptyUnmatchedClient });
assert(nonEmptyUnmatchedProbe.checks.find((item) => item.key === "baseline_platform_brand")?.status === "blocked", "nonempty_unmatched_brand_must_not_be_treated_as_empty");

const batchWrites = [];
const reconcile = await runPlatformReadonlyReconcileSkill({
  repo: {
    async upsertEvidence() {},
    async updateAccountResourcesReadonlyBatch(input) { batchWrites.push(input); }
  },
  bundle: targetEmptyOmitBundle,
  client: emptyBrandClient,
  allowReadonlyDependency: true
});
assert(reconcile.status === "passed", "target_empty_reconcile_not_passed");
assert(batchWrites.length === 1, "baseline_readonly_updates_must_use_one_atomic_batch");
assert(batchWrites[0].updates.length === 3, "baseline_readonly_batch_resource_count_mismatch");
assert(batchWrites[0].updates.find((item) => item.resourceType === "brand_info")?.inheritanceStatus === "target_readonly_verified", "atomic_batch_target_empty_brand_status_mismatch");

const snapshot = (bundle, resourceType) => (bundle.resources || []).find((item) => item.resource_type === resourceType) || null;
const beforeRejectedBatch = await repo.getCoreContext(TARGET);
let invalidBatchRejected = false;
try {
  await repo.updateAccountResourcesReadonlyBatch({
    ...TARGET,
    updates: [
      { resourceType: "avatar", inheritanceStatus: "baseline_candidate", metadata: { status: "test" }, resourceMetadata: { test_marker: "must_rollback" } },
      { resourceType: "brand_info", inheritanceStatus: "invalid_inheritance_status", metadata: { status: "test" }, resourceMetadata: { test_marker: "must_rollback" } },
      { resourceType: "product_image", inheritanceStatus: "baseline_candidate", metadata: { status: "test" }, resourceMetadata: { test_marker: "must_rollback" } }
    ]
  });
} catch (error) {
  invalidBatchRejected = String(error.message || "").includes("account_resources_inheritance_status_check");
}
assert(invalidBatchRejected, "invalid_inheritance_status_must_be_rejected_by_database_check");
const afterRejectedBatch = await repo.getCoreContext(TARGET);
for (const resourceType of ["avatar", "brand_info", "product_image"]) {
  assert(JSON.stringify(snapshot(beforeRejectedBatch, resourceType)) === JSON.stringify(snapshot(afterRejectedBatch, resourceType)), `invalid_batch_must_not_partially_update:${resourceType}`);
}

const genericCalls = [];
await runOceanEngineReadonlyProbes({
  bundle: targetRuntimeBundle,
  draft: { projectName: "MWBV2_SMOKE_BRAND_QUERY_SHAPE" },
  client: fakeReadonlyClient(genericCalls)
});
assertIndustryQueryShape(genericCalls.find((item) => item.label === "brand_industry"), "brand_industry");

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
assert(dmpResult.blockers.includes("dmp_pipeline_outputs_missing"), "dmp_pipeline_required_blocker_missing");
assert(dmpResult.customAudienceIds.length === 0, "dmp_candidate_leaked_into_payload_selection");
assert(dmpResult.outputSummary.dmpCandidateAudienceCount === 0, "dmp_final_verifier_should_not_scan_inventory");
assert(dmpWrites.length === 0, "dmp_final_verifier_should_not_persist_candidate_selection");

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
  brandIndustryQueryContract: "account_id_plus_origin_req",
  node3LandingScope: node3LandingDefault.outputSummary.scope,
  node4LandingScope: node4LandingCandidate.outputSummary.scope,
  freshRuntimeJobRequired: resumeRejected,
  atomicReadonlyBatch: batchWrites.length === 1,
  invalidBatchRolledBack: invalidBatchRejected,
  noOceanEngineNetwork: true,
  noPlatformWrite: true
}, null, 2)}\n`);
