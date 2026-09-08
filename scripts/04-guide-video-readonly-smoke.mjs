import { runVideoMaterialReadonlyGate } from "../src/workflows/skills/oe3/04-video-material-readiness.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const GUIDE_VIDEO_ID = "guide-video-smoke";

function bundle({ required = true, videoCount = 2, staleVideoGuide = false, canonicalGuide = false } = {}) {
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
    account: { guide_video_required: required },
    materialPack: {
      items: videos.map((sourceAssetId, index) => ({
        item: { item_type: "video_asset", required: true, asset_id: sourceAssetId },
        asset: {
          asset_id: sourceAssetId,
          asset_name: sourceAssetId,
          metadata: { video_id: `video-id-${index + 1}` }
        }
      }))
    },
    resources: [
      {
        resource_type: "micro_app_instance",
        source_asset_id: "APP-1",
        platform_resource_id: "7434750138926546994",
        visibility_status: "visible",
        readback_status: "readback_verified",
        metadata: {
          readonly_check: { status: "passed" },
          ...(canonicalGuide ? {
            guide_video_readiness: {
              status: "passed",
              required: true,
              guide_video_id: GUIDE_VIDEO_ID,
              verified_by_job_id: jobId,
              verified_instance_id: "7434750138926546994",
              approved_gameplay_count: 1,
              distinct_guide_video_count: 1,
              request_id_present: true,
              response_hash: "sha256:guide-video-response-smoke",
              evidence_ref: "EV-GUIDE-CACHED"
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

function clientFor(guideVideoIds) {
  const calls = [];
  return {
    calls,
    credentialState() {
      return { status: "ready", blockers: [] };
    },
    async get(request) {
      calls.push(request);
      assert(request.endpoint === "/open_api/v3.0/gameplay/list/", "only_gameplay_list_may_be_called_for_cached_videos");
      const payload = {
        code: 0,
        request_id: "request-guide-video-smoke",
        data: {
          play_infos: guideVideoIds.map((guideVideoId, index) => ({
            play_id: `play-${index + 1}`,
            guide_video_id: guideVideoId
          }))
        }
      };
      return {
        status: "passed",
        requestIdPresent: true,
        responseHash: "sha256:guide-video-response-smoke",
        summary: request.summarize(payload)
      };
    }
  };
}

async function run(guideVideoIds, { required = true, videoCount = 2, staleVideoGuide = false, canonicalGuide = false } = {}) {
  const resourceWrites = [];
  const evidenceWrites = [];
  const repo = {
    async upsertEvidence(value) { evidenceWrites.push(value); },
    async upsertAccountResourceReadonlyBySourceAsset(value) { resourceWrites.push(value); }
  };
  const client = clientFor(guideVideoIds);
  const result = await runVideoMaterialReadonlyGate({
    repo,
    bundle: bundle({ required, videoCount, staleVideoGuide, canonicalGuide }),
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

const hundred = await run([GUIDE_VIDEO_ID], { videoCount: 100, staleVideoGuide: true });
assert(hundred.result.status === "passed", "hundred_video_case_must_resolve_one_guide_video");
assert(hundred.client.calls.length === 1, "hundred_video_case_must_query_gameplay_once");
assert(hundred.resourceWrites.length === 1, "hundred_video_case_must_write_one_canonical_resource");
assert(hundred.resourceWrites[0].resourceType === "micro_app_instance", "stale_video_metadata_must_not_become_canonical");

const cached = await run([], { canonicalGuide: true });
assert(cached.result.status === "passed", "current_job_canonical_guide_must_be_reusable");
assert(cached.client.calls.length === 0, "same_job_canonical_guide_must_not_repeat_gameplay_query");
assert(cached.resourceWrites.length === 0, "same_job_canonical_guide_must_not_repeat_resource_write");

const missing = await run([]);
assert(missing.result.status === "blocked", "zero_guide_video_candidates_must_block");
assert(missing.result.blockers.includes("guide_video_candidate_missing"), "missing_candidate_blocker_not_exposed");
assert(missing.resourceWrites.length === 0, "missing_candidate_must_not_write_video_readiness");

const ambiguous = await run([GUIDE_VIDEO_ID, "guide-video-smoke-2"]);
assert(ambiguous.result.status === "blocked", "multiple_distinct_guide_video_candidates_must_block");
assert(ambiguous.result.blockers.includes("guide_video_candidate_ambiguous"), "ambiguous_candidate_blocker_not_exposed");
assert(ambiguous.resourceWrites.length === 0, "ambiguous_candidate_must_not_write_video_readiness");

const ordinary = await run([], { required: false });
assert(ordinary.result.status === "passed", "ordinary_account_cached_video_readiness_must_remain_passed");
assert(ordinary.client.calls.length === 0, "ordinary_account_must_not_query_gameplay");
assert(ordinary.resourceWrites.length === 0, "ordinary_account_must_not_write_guide_video_metadata");

console.log(JSON.stringify({
  status: "passed",
  uniqueCandidateCalls: unique.client.calls.length,
  canonicalResourceWrites: unique.resourceWrites.length,
  hundredVideoGameplayCalls: hundred.client.calls.length,
  hundredVideoResourceWrites: hundred.resourceWrites.length,
  sameJobCachedGameplayCalls: cached.client.calls.length,
  sameJobCachedResourceWrites: cached.resourceWrites.length,
  missingBlocker: missing.result.blockers[0],
  ambiguousBlocker: ambiguous.result.blockers[0],
  ordinaryGameplayCalls: ordinary.client.calls.length,
  platformCreateCalls: 0
}, null, 2));
