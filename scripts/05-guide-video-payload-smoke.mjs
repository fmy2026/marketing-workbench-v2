import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import { createJob } from "../src/workflows/launchWorkflow.mjs";
import { runOe3WorkflowSkills } from "../src/workflows/skills/oe3/00-index.mjs";
import {
  canonicalGuideVideoReadiness,
  mockReadyBundle
} from "../src/workflows/skills/oe3/04-resource-verifiers.mjs";
import { buildOe3StdProjectPayload } from "../src/workflows/skills/oe3/05-payload.mjs";
import {
  JSZC_GUIDE_VIDEO_GOLDEN_FIELD_SHAPE_HASH,
  JSZC_GUIDE_VIDEO_GOLDEN_LEDGER_PATH_COUNT,
  JSZC_SUCCESS_PROFILE_GOLDEN_FIELD_SHAPE_HASH,
  JSZC_SUCCESS_PROFILE_GOLDEN_LEDGER_PATH_COUNT
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
  const required = await createTestJob("1867508089433225", "required");
  const requiredManifest = required.draft?.payload_summary?.final_payload_manifest || {};
  const requiredLedger = requiredManifest.createFieldLedger || {};
  const guideEntries = (requiredLedger.entries || []).filter((entry) =>
    entry.path === "project_materials.video_material_list.[].guide_video_id" ||
    entry.path === "project_materials.video_material_list[].guide_video_id"
  );
  assert(required.account?.guide_video_required === true, "target_account_guide_video_policy_not_enabled");
  assert(requiredManifest.guideVideoRequired === true, "required_manifest_guide_video_flag_missing");
  assert(Number(requiredManifest.guideVideoReadyCount || 0) === 2, "both_required_videos_must_have_guide_video_id");
  assert(requiredLedger.checkedPathCount === JSZC_GUIDE_VIDEO_GOLDEN_LEDGER_PATH_COUNT, "required_ledger_path_count_mismatch");
  assert(requiredLedger.fieldShapeHash === JSZC_GUIDE_VIDEO_GOLDEN_FIELD_SHAPE_HASH, "required_ledger_shape_hash_mismatch");
  assert(guideEntries.length === 2, `required_payload_must_contain_two_guide_video_fields:${guideEntries.length}`);
  assert(required.draft.payload_summary.final_payload_blockers.length === 0, `required_payload_blocked:${required.draft.payload_summary.final_payload_blockers.join(",")}`);
  const requiredMockBundle = mockReadyBundle(required);
  const canonicalGuide = canonicalGuideVideoReadiness(requiredMockBundle);
  assert(canonicalGuide.status === "passed", "guide_video_fact_must_come_from_current_micro_app_instance");
  assert(required.resources.filter((item) => item.resource_type === "video_asset").every((item) => !item.metadata?.guide_video_readiness), "video_rows_must_not_store_guide_video_fact");

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
          verified_by_job_id: required.job.job_id
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

  const ordinary = await createTestJob("1871922175825993", "ordinary");
  const ordinaryManifest = ordinary.draft?.payload_summary?.final_payload_manifest || {};
  const ordinaryLedger = ordinaryManifest.createFieldLedger || {};
  const ordinaryGuideEntries = (ordinaryLedger.entries || []).filter((entry) => entry.path.includes("guide_video_id"));
  assert(ordinary.account?.guide_video_required !== true, "ordinary_account_guide_video_policy_unexpectedly_enabled");
  assert(ordinaryManifest.guideVideoRequired === false, "ordinary_manifest_guide_video_flag_must_be_false");
  assert(ordinaryLedger.checkedPathCount === JSZC_SUCCESS_PROFILE_GOLDEN_LEDGER_PATH_COUNT, "ordinary_ledger_path_count_changed");
  assert(ordinaryLedger.fieldShapeHash === JSZC_SUCCESS_PROFILE_GOLDEN_FIELD_SHAPE_HASH, "ordinary_ledger_shape_hash_changed");
  assert(ordinaryGuideEntries.length === 0, "ordinary_payload_must_omit_guide_video_id");

  console.log(JSON.stringify({
    status: "passed",
    requiredGuideVideoFieldCount: guideEntries.length,
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
