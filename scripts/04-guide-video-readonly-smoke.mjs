import { runVideoMaterialReadonlyGate } from "../src/workflows/skills/oe3/04-video-material-readiness.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const GUIDE_VIDEO_ID = "guide-video-smoke";

function bundle({
  required = true,
  autoDetect = false,
  coverRequired = false,
  videoCount = 2,
  staleVideoGuide = false,
  canonicalGuide = false,
  canonicalGuideJobId = "",
  canonicalGuideInstanceId = "",
  canonicalGuideStatus = "passed",
  canonicalGuideBlocker = "",
  instanceSourceAsset = "APP-1"
} = {}) {
  const jobId = "JOB-GUIDE-VIDEO-READONLY-SMOKE";
  const videos = Array.from({ length: videoCount }, (_, index) => `VIDEO-${index + 1}`);
  return {
    job: {
      job_id: jobId,
      route_id: "oceanengine_3_byte_mini_game",
      game_code: "JSZC",
      advertiser_id: "8990000000000740",
      source_usage: "runtime_truth"
    },
    account: { guide_video_required: required, video_cover_required: coverRequired },
    defaults: {
      raw_defaults: {
        ...(autoDetect ? {
          official_create_field_contract: {
            nested_rules: {
              groups: {
                "project_materials.video_material_list": {
                  guide_video_policy: "fresh_readonly_auto_detect_with_account_force_required"
                }
              }
            }
          }
        } : {}),
        material_source_account: {
          advertiser_id: "8990000000000700",
          account_role: "material_source",
          target_advertiser_id: "8990000000000740"
        }
      }
    },
    materialPack: {
      items: videos.map((sourceAssetId, index) => ({
        item: { item_type: "video_asset", required: true, asset_id: sourceAssetId },
        asset: {
          asset_id: sourceAssetId,
          asset_name: sourceAssetId,
          metadata: {
            video_id: `video-id-${index + 1}`,
            video_cover_id: `cover-id-${index + 1}`
          }
        }
      }))
    },
    resources: [
      {
        resource_type: "micro_app_instance",
        source_asset_id: instanceSourceAsset,
        platform_resource_id: "7434750138926546994",
        visibility_status: "visible",
        readback_status: "readback_verified",
        metadata: {
          readonly_check: { status: "passed" },
          ...(canonicalGuide ? {
            guide_video_readiness: {
              status: canonicalGuideStatus,
              required: canonicalGuideStatus === "passed",
              guide_video_id: canonicalGuideStatus === "passed" ? GUIDE_VIDEO_ID : "",
              verified_by_job_id: canonicalGuideJobId || jobId,
              verified_instance_id: canonicalGuideInstanceId || "7434750138926546994",
              approved_gameplay_count: 1,
              distinct_guide_video_count: 1,
              request_id_present: true,
              response_hash: "sha256:guide-video-response-smoke",
              evidence_ref: "EV-GUIDE-CACHED",
              blocker: canonicalGuideBlocker
            }
          } : {})
        }
      },
      ...videos.map((sourceAssetId) => ({
        resource_type: "video_asset",
        source_asset_id: sourceAssetId,
        platform_resource_id: sourceAssetId,
        visibility_status: "visible",
        readback_status: "readback_verified",
        metadata: {
          ...(staleVideoGuide ? {
            guide_video_readiness: {
              status: "passed",
              required: true,
              guide_video_id: "stale-video-row-guide",
              verified_by_job_id: jobId
            }
          } : {}),
          readonly_check: {
            status: "passed",
            video_id_present: true,
            cover_mode: "platform_default_cover_allowed",
            plan_status: "source_ready_target_ready",
            evidence_refs: [`EV-${sourceAssetId}`]
          },
          final_material_readiness: {
            status: "passed",
            video_id_present: true,
            cover_mode: "platform_default_cover_allowed"
          }
        }
      }))
    ]
  };
}

function clientFor(guideVideoIds, { missingTargetCover = "" } = {}) {
  const calls = [];
  return {
    calls,
    credentialState() {
      return { status: "ready", blockers: [] };
    },
    async get(request) {
      calls.push(request);
      let payload;
      if (request.endpoint === "/open_api/v3.0/gameplay/list/") {
        payload = {
          code: 0,
          request_id: "request-guide-video-smoke",
          data: {
            play_infos: guideVideoIds.map((guideVideoId, index) => ({
              play_id: `play-${index + 1}`,
              guide_video_id: guideVideoId
            }))
          }
        };
      } else {
        assert(["file/video/get", "file/image/get"].includes(request.endpoint), `unexpected_material_endpoint:${request.endpoint}`);
        const filtering = JSON.parse(request.query.filtering);
        const wantedId = filtering.video_ids?.[0] || filtering.image_ids?.[0] || "";
        const targetCoverMissing = request.label === `target_video_cover_${missingTargetCover}`;
        payload = {
          code: 0,
          request_id: `request-${request.label}`,
          data: {
            list: targetCoverMissing ? [] : [{
              ...(request.endpoint === "file/video/get" ? { video_id: wantedId } : { image_id: wantedId }),
              material_id: `material-${request.label}`,
              width: 100,
              height: 100
            }]
          }
        };
      }
      return {
        status: "passed",
        requestIdPresent: true,
        responseHash: "sha256:guide-video-response-smoke",
        summary: request.summarize(payload)
      };
    }
  };
}

async function run(guideVideoIds, {
  required = true,
  autoDetect = false,
  coverRequired = false,
  videoCount = 2,
  staleVideoGuide = false,
  canonicalGuide = false,
  canonicalGuideJobId = "",
  canonicalGuideInstanceId = "",
  canonicalGuideStatus = "passed",
  canonicalGuideBlocker = "",
  instanceSourceAsset = "APP-1",
  missingTargetCover = ""
} = {}) {
  const resourceWrites = [];
  const evidenceWrites = [];
  const repo = {
    async upsertEvidence(value) { evidenceWrites.push(value); },
    async mergeAccountResourceMetadataByPlatformResource(value) { resourceWrites.push(value); },
    async upsertAccountResourceReadonlyBySourceAsset() {}
  };
  const client = clientFor(guideVideoIds, { missingTargetCover });
  const result = await runVideoMaterialReadonlyGate({
    repo,
    bundle: bundle({
      required,
      autoDetect,
      coverRequired,
      videoCount,
      staleVideoGuide,
      canonicalGuide,
      canonicalGuideJobId,
      canonicalGuideInstanceId,
      canonicalGuideStatus,
      canonicalGuideBlocker,
      instanceSourceAsset
    }),
    client,
    allowReadonlyDependency: true
  });
  return { result, client, resourceWrites, evidenceWrites };
}

const unique = await run([GUIDE_VIDEO_ID]);
assert(unique.result.status === "passed", "one_distinct_guide_video_must_pass");
assert(unique.client.calls.length === 1, "required_account_must_query_gameplay_once");
assert(unique.resourceWrites.length === 1, "guide_video_readiness_must_write_one_canonical_resource");
assert(unique.resourceWrites[0].resourceType === "micro_app_instance", "guide_video_readiness_must_belong_to_micro_app_instance");
assert(unique.resourceWrites[0].resourceMetadata?.guide_video_readiness?.guide_video_id === GUIDE_VIDEO_ID, "canonical_resource_must_store_unique_guide_video_id");
assert(unique.resourceWrites[0].resourceMetadata?.guide_video_readiness?.verified_by_job_id === bundle().job.job_id, "guide_video_readiness_must_bind_to_current_job");
assert(unique.resourceWrites[0].resourceMetadata?.guide_video_readiness?.verified_instance_id === "7434750138926546994", "guide_video_readiness_must_bind_to_verified_instance");
assert(unique.result.outputSummary.videoCoverRequired === false, "guide_only_account_must_not_require_explicit_video_cover");
assert(unique.result.outputSummary.guideVideoReadiness?.required === true, "guide_only_account_must_require_canonical_guide_video");
assert(unique.result.outputSummary.guideVideoReadiness?.status === "passed", "guide_only_canonical_guide_video_must_pass");
assert(unique.result.outputSummary.guideVideoReadiness?.distinctGuideVideoCount === 1, "guide_only_canonical_guide_video_must_be_unique");
assert(unique.result.outputSummary.finalMaterialReadiness.items.every((item) =>
  item.coverMode === "platform_default_cover_allowed" && item.coverVerifiedByCurrentJob === false
), "guide_only_account_must_allow_default_cover_without_current_job_cover_readback");

const platformIdentityOnly = await run([GUIDE_VIDEO_ID], { required: false, autoDetect: true, instanceSourceAsset: "" });
assert(platformIdentityOnly.result.status === "passed", "verified_platform_instance_id_must_not_require_internal_source_asset_id");
assert(platformIdentityOnly.resourceWrites[0]?.platformResourceId === "7434750138926546994", "guide_video_readiness_must_persist_by_verified_platform_instance_id");

const hundred = await run([GUIDE_VIDEO_ID], { videoCount: 100, staleVideoGuide: true });
assert(hundred.result.status === "passed", "hundred_video_case_must_resolve_one_guide_video");
assert(hundred.client.calls.length === 1, "hundred_video_case_must_query_gameplay_once");
assert(hundred.resourceWrites.length === 1, "hundred_video_case_must_write_one_canonical_resource");
assert(hundred.resourceWrites[0].resourceType === "micro_app_instance", "stale_video_metadata_must_not_become_canonical");

const cached = await run([], { canonicalGuide: true });
assert(cached.result.status === "passed", "current_job_canonical_guide_must_be_reusable");
assert(cached.client.calls.length === 0, "same_job_canonical_guide_must_not_repeat_gameplay_query");
assert(cached.resourceWrites.length === 0, "same_job_canonical_guide_must_not_repeat_resource_write");

const staleJobPassed = await run([GUIDE_VIDEO_ID], {
  canonicalGuide: true,
  canonicalGuideJobId: "JOB-GUIDE-VIDEO-READONLY-PREVIOUS"
});
assert(staleJobPassed.result.status === "passed", "previous_job_passed_cache_must_refresh");
assert(staleJobPassed.client.calls.length === 1, "previous_job_passed_cache_must_query_gameplay_once");
assert(staleJobPassed.resourceWrites.length === 1, "previous_job_passed_cache_must_persist_current_job");
assert(staleJobPassed.result.outputSummary.guideVideoReadiness?.source === "fresh_gameplay_readonly", "previous_job_passed_cache_must_not_report_current_job_cache");

const staleJobBlocked = await run([GUIDE_VIDEO_ID], {
  canonicalGuide: true,
  canonicalGuideJobId: "JOB-GUIDE-VIDEO-READONLY-PREVIOUS",
  canonicalGuideStatus: "blocked",
  canonicalGuideBlocker: "guide_video_capability_probe_failed"
});
assert(staleJobBlocked.result.status === "passed", "previous_job_blocked_cache_must_refresh");
assert(staleJobBlocked.client.calls.length === 1, "previous_job_blocked_cache_must_query_gameplay_once");
assert(staleJobBlocked.resourceWrites.length === 1, "previous_job_blocked_cache_must_persist_current_job");

const staleInstance = await run([GUIDE_VIDEO_ID], {
  canonicalGuide: true,
  canonicalGuideInstanceId: "7434750138926546995"
});
assert(staleInstance.result.status === "passed", "wrong_instance_cache_must_refresh");
assert(staleInstance.client.calls.length === 1, "wrong_instance_cache_must_query_gameplay_once");
assert(staleInstance.resourceWrites.length === 1, "wrong_instance_cache_must_persist_current_job");

const cachedNotRequired = await run([], {
  required: false,
  autoDetect: true,
  canonicalGuide: true,
  canonicalGuideStatus: "not_required"
});
assert(cachedNotRequired.result.status === "passed", "current_job_not_required_cache_must_be_reusable");
assert(cachedNotRequired.client.calls.length === 0, "current_job_not_required_cache_must_not_repeat_gameplay_query");
assert(cachedNotRequired.resourceWrites.length === 0, "current_job_not_required_cache_must_not_repeat_resource_write");

const cachedBlocked = await run([], {
  canonicalGuide: true,
  canonicalGuideStatus: "blocked",
  canonicalGuideBlocker: "guide_video_capability_probe_failed"
});
assert(cachedBlocked.result.status === "blocked", "current_job_blocked_cache_must_be_reused");
assert(cachedBlocked.result.blockers.includes("guide_video_capability_probe_failed"), "current_job_blocked_cache_must_keep_blocker");
assert(cachedBlocked.client.calls.length === 0, "current_job_blocked_cache_must_not_repeat_gameplay_query");
assert(cachedBlocked.resourceWrites.length === 0, "current_job_blocked_cache_must_not_repeat_resource_write");

const missing = await run([]);
assert(missing.result.status === "blocked", "zero_guide_video_candidates_must_block");
assert(missing.result.blockers.includes("guide_video_candidate_missing"), "missing_candidate_blocker_not_exposed");
assert(missing.resourceWrites.length === 1, "missing_candidate_must_persist_current_job_readiness");

const ambiguous = await run([GUIDE_VIDEO_ID, "guide-video-smoke-2"]);
assert(ambiguous.result.status === "blocked", "multiple_distinct_guide_video_candidates_must_block");
assert(ambiguous.result.blockers.includes("guide_video_candidate_ambiguous"), "ambiguous_candidate_blocker_not_exposed");
assert(ambiguous.resourceWrites.length === 1, "ambiguous_candidate_must_persist_current_job_readiness");

const autoUnique = await run([GUIDE_VIDEO_ID], { required: false, autoDetect: true });
assert(autoUnique.result.status === "passed", "auto_detect_unique_candidate_must_pass");
assert(autoUnique.client.calls.length === 1, "auto_detect_must_query_gameplay_once");
assert(autoUnique.result.outputSummary.guideVideoReadiness?.required === true, "auto_detect_unique_candidate_must_require_guide_video");
assert(autoUnique.resourceWrites[0]?.resourceMetadata?.guide_video_readiness?.verified_by_job_id === bundle({ required: false, autoDetect: true }).job.job_id, "auto_detect_readiness_must_bind_current_job");

const autoEmpty = await run([], { required: false, autoDetect: true });
assert(autoEmpty.result.status === "passed", "auto_detect_empty_list_must_allow_omit");
assert(autoEmpty.result.outputSummary.guideVideoReadiness?.status === "not_required", "auto_detect_empty_list_must_be_not_required");
assert(autoEmpty.resourceWrites[0]?.resourceMetadata?.guide_video_readiness?.required === false, "auto_detect_empty_list_must_persist_not_required");

const forcedEmpty = await run([], { required: true, autoDetect: true });
assert(forcedEmpty.result.status === "blocked", "account_force_required_must_not_downgrade_empty_list");
assert(forcedEmpty.result.blockers.includes("guide_video_candidate_missing"), "account_force_required_empty_list_blocker_missing");

const ordinary = await run([], { required: false });
assert(ordinary.result.status === "passed", "ordinary_account_cached_video_readiness_must_remain_passed");
assert(ordinary.client.calls.length === 0, "ordinary_account_must_not_query_gameplay");
assert(ordinary.resourceWrites.length === 0, "ordinary_account_must_not_write_guide_video_metadata");

const explicitCovers = await run([GUIDE_VIDEO_ID], { coverRequired: true });
assert(explicitCovers.result.status === "passed", "fresh_explicit_video_covers_must_pass");
assert(explicitCovers.client.calls.length === 9, "cover_required_job_must_fresh_read_gameplay_and_two_source_target_video_cover_pairs");
assert(explicitCovers.result.outputSummary.videoCoverRequired === true, "cover_required_summary_flag_missing");
assert(explicitCovers.result.outputSummary.finalMaterialReadiness.items.every((item) =>
  item.coverMode === "explicit_cover_verified" && item.coverVerifiedByCurrentJob === true
), "both_explicit_covers_must_be_verified_by_current_job");

const missingCover = await run([GUIDE_VIDEO_ID], { coverRequired: true, missingTargetCover: "VIDEO-1" });
assert(missingCover.result.status === "blocked", "missing_target_cover_must_block_before_confirmation");
assert(missingCover.result.outputSummary.finalMaterialReadiness.items.some((item) => item.coverVerifiedByCurrentJob !== true), "missing_cover_current_job_evidence_not_exposed");

console.log(JSON.stringify({
  status: "passed",
  uniqueCandidateCalls: unique.client.calls.length,
  canonicalResourceWrites: unique.resourceWrites.length,
  hundredVideoGameplayCalls: hundred.client.calls.length,
  hundredVideoResourceWrites: hundred.resourceWrites.length,
  sameJobCachedGameplayCalls: cached.client.calls.length,
  sameJobCachedResourceWrites: cached.resourceWrites.length,
  staleJobGameplayCalls: staleJobPassed.client.calls.length,
  staleInstanceGameplayCalls: staleInstance.client.calls.length,
  sameJobNotRequiredGameplayCalls: cachedNotRequired.client.calls.length,
  sameJobBlockedGameplayCalls: cachedBlocked.client.calls.length,
  missingBlocker: missing.result.blockers[0],
  ambiguousBlocker: ambiguous.result.blockers[0],
  ordinaryGameplayCalls: ordinary.client.calls.length,
  autoDetectEmptyStatus: autoEmpty.result.outputSummary.guideVideoReadiness?.status || "",
  guideOnlyDefaultCoverMode: unique.result.outputSummary.finalMaterialReadiness.items[0]?.coverMode || "",
  explicitCoverReadonlyCalls: explicitCovers.client.calls.length,
  missingCoverStatus: missingCover.result.status,
  platformCreateCalls: 0
}, null, 2));
