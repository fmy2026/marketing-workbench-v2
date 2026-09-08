import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import { createJob } from "../src/workflows/launchWorkflow.mjs";
import { runOe3WorkflowSkills } from "../src/workflows/skills/oe3/00-index.mjs";
import {
  canonicalGuideVideoReadiness,
  mockReadyBundle
} from "../src/workflows/skills/oe3/04-resource-verifiers.mjs";
import { hashValue } from "../src/workflows/skills/oe3/00-contracts.mjs";
import { buildOe3StdProjectPayload } from "../src/workflows/skills/oe3/05-payload.mjs";
import {
  JSZC_SUCCESS_PROFILE_GOLDEN_FIELD_SHAPE_HASH,
  JSZC_SUCCESS_PROFILE_GOLDEN_LEDGER_PATH_COUNT,
  JSZC_VIDEO_COVER_GUIDE_VIDEO_GOLDEN_FIELD_SHAPE_HASH,
  JSZC_VIDEO_COVER_GUIDE_VIDEO_GOLDEN_LEDGER_PATH_COUNT
} from "../src/workflows/skills/oe3/05-jszc-success-profile.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const repo = new PostgresRepository();
const jobs = [];

async function createTestJob(advertiserId, label) {
  const created = await createJob(repo, {
    user_intent: `推广路线 oceanengine_3_byte_mini_game，游戏 JSZC，账户 ${advertiserId}`,
    route_id: "oceanengine_3_byte_mini_game",
    game_code: "JSZC",
    advertiser_id: advertiserId,
    source_usage: "test_run",
    source_record_ref: `test:guide-video-payload:${label}:${new Date().toISOString()}`
  });
  jobs.push(created.jobId);
  await runOe3WorkflowSkills({
    repo,
    jobId: created.jobId,
    mode: "dry_run",
    mockReady: true,
    mockExecute: false
  });
  return repo.getLaunchJobBundle(created.jobId);
}

try {
  // The persisted bundle is a normal test fixture. Capability-on behavior below is
  // constructed in memory so runtime correctness never depends on a production account.
  const ordinary = await createTestJob("1871922175825993", "ordinary");
  const ordinaryManifest = ordinary.draft?.payload_summary?.final_payload_manifest || {};
  const ordinaryLedger = ordinaryManifest.createFieldLedger || {};
  const ordinaryGuideEntries = (ordinaryLedger.entries || []).filter((entry) => entry.path.includes("guide_video_id"));
  assert(ordinary.account?.guide_video_required !== true, "ordinary_account_guide_video_policy_unexpectedly_enabled");
  assert(ordinary.account?.video_cover_required !== true, "ordinary_account_video_cover_policy_unexpectedly_enabled");
  assert(ordinaryManifest.guideVideoRequired === false, "ordinary_manifest_guide_video_flag_must_be_false");
  assert(ordinaryManifest.videoCoverRequired === false, "ordinary_manifest_video_cover_flag_must_be_false");
  assert(ordinaryLedger.checkedPathCount === JSZC_SUCCESS_PROFILE_GOLDEN_LEDGER_PATH_COUNT, "ordinary_ledger_path_count_changed");
  assert(ordinaryLedger.fieldShapeHash === JSZC_SUCCESS_PROFILE_GOLDEN_FIELD_SHAPE_HASH, "ordinary_ledger_shape_hash_changed");
  assert(ordinaryGuideEntries.length === 0, "ordinary_payload_must_omit_guide_video_id");

  const capabilityFixture = structuredClone(ordinary);
  capabilityFixture.account = {
    ...(capabilityFixture.account || {}),
    guide_video_required: true,
    video_cover_required: true
  };
  const requiredMockBundle = mockReadyBundle(capabilityFixture);
  requiredMockBundle.materialPack = {
    ...requiredMockBundle.materialPack,
    items: (requiredMockBundle.materialPack?.items || []).map((entry, index) => entry.item?.item_type === "video_asset"
      ? {
          ...entry,
          asset: {
            ...(entry.asset || {}),
            metadata: {
              ...(entry.asset?.metadata || {}),
              video_cover_id: entry.asset?.metadata?.video_cover_id || `test-cover-${index + 1}`
            }
          }
        }
      : entry)
  };
  const microAppTemplate = requiredMockBundle.resources.find((item) => item.resource_type === "micro_app_instance");
  assert(microAppTemplate, "ordinary_fixture_micro_app_instance_missing");
  const fixtureInstanceId = "700000000001";
  requiredMockBundle.resources = [
    ...requiredMockBundle.resources.filter((item) => item.resource_type !== "micro_app_instance"),
    {
      ...microAppTemplate,
      source_asset_id: microAppTemplate.source_asset_id || "MIA-CAPABILITY-FIXTURE",
      platform_resource_id: fixtureInstanceId,
      visibility_status: "visible",
      readback_status: "readback_verified",
      metadata: {
        ...(microAppTemplate.metadata || {}),
        guide_video_readiness: {
          status: "passed",
          required: true,
          guide_video_id: "guide-video-test",
          guide_video_id_present: true,
          verified_by_job_id: requiredMockBundle.job.job_id,
          verified_instance_id: fixtureInstanceId,
          raw_response_stored: false
        },
        readonly_check: {
          ...(microAppTemplate.metadata?.readonly_check || {}),
          status: "passed",
          mock: true
        }
      }
    }
  ];
  const fixtureBackupLandingUrl = "https://example.invalid/mwbv2/mock-backup-landing-page";
  const fixtureMiniProgramLaunchUrl = `sslocal://microgame?app_id=${requiredMockBundle.platformApp?.app_id || "tt0000000000000000"}`;
  const requiredBuild = buildOe3StdProjectPayload({
    bundle: requiredMockBundle,
    touchpointUrl: "https://example.invalid/mwbv2/mock-touchpoint",
    backupLandingPageUrl: {
      landing_page_asset_id: "LPA-JSZC-OE3-BACKUP-MOCK",
      site_id: "7624750304608649243",
      status: "active",
      landing_url: fixtureBackupLandingUrl,
      url_hash: hashValue(fixtureBackupLandingUrl).replace(/^sha256:/, ""),
      resource_visibility_status: "visible",
      resource_readback_status: "readback_verified",
      resource_readonly_status: "passed"
    },
    miniProgramLaunchLink: {
      link_ref: "GRLL-JSZC-OE3-BYTE-MINI-GAME-MOCK",
      platform_app_id: requiredMockBundle.platformApp?.id || "GPA-JSZC-OE-BYTE-MINI-GAME",
      app_id: requiredMockBundle.platformApp?.app_id || "tt0000000000000000",
      status: "active",
      launch_url: fixtureMiniProgramLaunchUrl,
      url_hash: hashValue(fixtureMiniProgramLaunchUrl).replace(/^sha256:/, "")
    }
  });
  const requiredManifest = requiredBuild.requestFieldManifest || {};
  const requiredLedger = requiredManifest.createFieldLedger || {};
  const guideEntries = (requiredLedger.entries || []).filter((entry) =>
    entry.path === "project_materials.video_material_list.[].guide_video_id" ||
    entry.path === "project_materials.video_material_list[].guide_video_id"
  );
  const coverEntries = (requiredLedger.entries || []).filter((entry) =>
    entry.path === "project_materials.video_material_list.[].video_cover_id" ||
    entry.path === "project_materials.video_material_list[].video_cover_id"
  );
  assert(requiredMockBundle.account?.guide_video_required === true, "capability_fixture_guide_video_policy_not_enabled");
  assert(requiredMockBundle.account?.video_cover_required === true, "capability_fixture_video_cover_policy_not_enabled");
  assert(requiredManifest.guideVideoRequired === true, "required_manifest_guide_video_flag_missing");
  assert(requiredManifest.videoCoverRequired === true, "required_manifest_video_cover_flag_missing");
  assert(Number(requiredManifest.guideVideoReadyCount || 0) === 2, "both_required_videos_must_have_guide_video_id");
  assert(
    requiredLedger.checkedPathCount === JSZC_VIDEO_COVER_GUIDE_VIDEO_GOLDEN_LEDGER_PATH_COUNT,
    `required_ledger_path_count_mismatch:${requiredLedger.checkedPathCount}`
  );
  assert(
    requiredLedger.fieldShapeHash === JSZC_VIDEO_COVER_GUIDE_VIDEO_GOLDEN_FIELD_SHAPE_HASH,
    `required_ledger_shape_hash_mismatch:${requiredLedger.fieldShapeHash}`
  );
  assert(guideEntries.length === 2, `required_payload_must_contain_two_guide_video_fields:${guideEntries.length}`);
  assert(coverEntries.length === 2, `required_payload_must_contain_two_video_cover_fields:${coverEntries.length}`);
  assert(requiredManifest.finalMaterialReadiness.items.every((item) =>
    item.videoCoverVerifiedByCurrentJob === true && item.coverMode === "explicit_cover_verified"
  ), "required_payload_covers_must_be_fresh_verified");
  assert(requiredBuild.blockers.length === 0, `required_payload_blocked:${requiredBuild.blockers.join(",")}`);
  const canonicalGuide = canonicalGuideVideoReadiness(requiredMockBundle);
  assert(canonicalGuide.status === "passed", "guide_video_fact_must_come_from_current_micro_app_instance");
  assert(requiredMockBundle.resources.filter((item) => item.resource_type === "video_asset").every((item) => !item.metadata?.guide_video_readiness), "video_rows_must_not_store_guide_video_fact");

  const staleVideoBundle = structuredClone(requiredMockBundle);
  staleVideoBundle.resources
    .filter((item) => item.resource_type === "video_asset")
    .forEach((item) => {
      item.metadata = {
        ...(item.metadata || {}),
        guide_video_readiness: {
          status: "passed",
          required: true,
          guide_video_id: "stale-video-row-guide",
          verified_by_job_id: requiredMockBundle.job.job_id
        }
      };
    });
  const staleVideoBuild = buildOe3StdProjectPayload({ bundle: staleVideoBundle });
  assert(staleVideoBuild.payload.project_materials.video_material_list.every((item) => item.guide_video_id === canonicalGuide.guideVideoId), "stale_video_metadata_must_be_ignored");

  const hundredVideoBundle = structuredClone(requiredMockBundle);
  const videoTemplate = hundredVideoBundle.materialPack.items.find((entry) => entry.item?.item_type === "video_asset");
  const videoResourceTemplate = hundredVideoBundle.resources.find((item) => item.resource_type === "video_asset");
  const nonVideoItems = hundredVideoBundle.materialPack.items.filter((entry) => entry.item?.item_type !== "video_asset");
  const nonVideoResources = hundredVideoBundle.resources.filter((item) => item.resource_type !== "video_asset");
  hundredVideoBundle.materialPack.items = [
    ...nonVideoItems,
    ...Array.from({ length: 100 }, (_, index) => {
      const entry = structuredClone(videoTemplate);
      const sourceAssetId = `VIDEO-HUNDRED-${index + 1}`;
      entry.item.asset_id = sourceAssetId;
      entry.asset.asset_id = sourceAssetId;
      entry.asset.metadata.video_id = `video-id-hundred-${index + 1}`;
      entry.asset.metadata.platform_video_id = `video-id-hundred-${index + 1}`;
      return entry;
    })
  ];
  hundredVideoBundle.resources = [
    ...nonVideoResources,
    ...Array.from({ length: 100 }, (_, index) => ({
      ...structuredClone(videoResourceTemplate),
      resource_id: `AR-HUNDRED-${index + 1}`,
      source_asset_id: `VIDEO-HUNDRED-${index + 1}`,
      platform_resource_id: `VIDEO-HUNDRED-${index + 1}`
    }))
  ];
  const hundredVideoBuild = buildOe3StdProjectPayload({ bundle: hundredVideoBundle });
  assert(hundredVideoBuild.payload.project_materials.video_material_list.length === 100, "hundred_video_payload_count_mismatch");
  assert(hundredVideoBuild.payload.project_materials.video_material_list.every((item) => item.guide_video_id === canonicalGuide.guideVideoId), "hundred_video_payload_must_share_canonical_guide_video");
  assert(hundredVideoBuild.payload.project_materials.video_material_list.every((item) => item.video_cover_id), "hundred_video_payload_must_send_explicit_cover_ids");

  console.log(JSON.stringify({
    status: "passed",
    requiredGuideVideoFieldCount: guideEntries.length,
    requiredVideoCoverFieldCount: coverEntries.length,
    requiredLedgerPathCount: requiredLedger.checkedPathCount,
    canonicalGuideResourceType: canonicalGuide.instanceResource?.resource_type || "",
    hundredVideoGuideFieldCount: hundredVideoBuild.payload.project_materials.video_material_list.filter((item) => item.guide_video_id).length,
    staleVideoMetadataIgnored: true,
    ordinaryGuideVideoFieldCount: ordinaryGuideEntries.length,
    ordinaryLedgerPathCount: ordinaryLedger.checkedPathCount,
    platformCreateCalls: 0
  }, null, 2));
} finally {
  for (const jobId of jobs.reverse()) await repo.deleteTestJobCascade(jobId);
}
