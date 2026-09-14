import {
  classifyProjectVideoAppendItems,
  buildProjectVideoAppendPlan,
  buildProjectVideoMaterialPushPlan,
  readProjectVideoIds,
  recommendProjectVideoAppendProjects,
  scanOceanEngineVideoInventory,
  validateProjectVideoAppendReadback
} from "../src/platforms/oceanengineProjectVideoAppendExecutor.mjs";
import { reconcileQiankunMaterialSourceVideoInventory } from "../src/workflows/skills/oe3/04-video-material-readiness.mjs";
import { exactMaterialCodePattern, filenameMatchesMaterialCode } from "../src/platforms/materialCodeMatcher.mjs";
import { launchRequestFingerprint, validateLaunchRequest } from "../src/agents/launchRequest.mjs";
import { resolveLaunchRequestIntake } from "../src/agents/conversationIntentResolver.mjs";

function assert(value, message) { if (!value) throw new Error(message); }

const request = validateLaunchRequest({
  schema_version: "launch-request.v2", operation: "append_project_videos",
  route_id: "oceanengine_3_byte_mini_game", game_code: "JSZC",
  advertiser_id: "1234567890123456", project_id: "1234567890123456789",
  origin_resource_ids: ["video-A", "video-B", "video-C"]
});
assert(request.origin_resource_ids.length === 3, "append_request_not_normalized");
const structured = await resolveLaunchRequestIntake({ request });
assert(structured.request.operation === "append_project_videos" && structured.request.origin_resource_ids.length === 3, "append_structured_intake_lost_fields");
const natural = await resolveLaunchRequestIntake({
  userIntent: "巨兽战场走抖小，账户 1234567890123456，项目 1234567890123456789，追加视频标识码: video-A, video-B"
});
assert(natural.request.operation === "append_project_videos", "append_natural_operation_not_detected");
assert(natural.request.project_id === "1234567890123456789", "append_natural_project_not_detected");
assert(natural.request.origin_resource_ids.join(",") === "video-A,video-B", "append_natural_videos_not_detected");
const items = classifyProjectVideoAppendItems({
  originResourceIds: request.origin_resource_ids,
  projectVideoIds: ["target-A"],
  targetVideos: [{ originResourceId: "video-A", videoId: "target-A" }, { originResourceId: "video-B", videoId: "target-B" }],
  sourceVideos: [{ originResourceId: "video-C", videoId: "source-C" }]
});
assert(items.map((item) => item.status).join(",") === "already_in_project,append_ready,target_push_required", "item_classification_invalid");
const blocked = buildProjectVideoAppendPlan({ advertiserId: request.advertiser_id, projectId: request.project_id, items });
assert(blocked.status === "blocked", "target_push_must_block_append");
const push = buildProjectVideoMaterialPushPlan({ advertiserId: request.advertiser_id, materialAccountId: "2234567890123456", projectId: request.project_id, items: items.map((item) => item.status === "target_push_required" ? { ...item, sourceVideoId: "3000000000000001" } : item) });
assert(push.status === "ready" && push.batches.length === 1 && push.batches[0].itemCount === 1, "target_push_plan_not_ready");
const push51 = buildProjectVideoMaterialPushPlan({
  advertiserId: request.advertiser_id, materialAccountId: "2234567890123456", projectId: request.project_id,
  items: Array.from({ length: 51 }, (_, index) => ({ originResourceId: `origin-${index}`, sourceVideoId: String(3000000000000000 + index), status: "target_push_required" }))
});
assert(push51.status === "ready" && push51.batches.length === 2 && push51.batches[0].itemCount === 50 && push51.batches[1].itemCount === 1, "target_push_batches_invalid");
const ready = buildProjectVideoAppendPlan({ advertiserId: request.advertiser_id, projectId: request.project_id, items: items.slice(0, 2), projectSnapshotHash: "sha256:snapshot" });
assert(ready.status === "ready" && ready.itemCount === 1 && ready.alreadyPresentCount === 1, "append_plan_invalid");
assert(validateProjectVideoAppendReadback({ plannedOriginResourceIds: ready.originResourceIds, foundVideoIds: ["target-B"], itemMap: items }).status === "passed", "append_readback_invalid");
const projectMaterialRequests = [];
const projectVideoRead = await readProjectVideoIds({
  advertiserId: request.advertiser_id,
  projectId: request.project_id,
  client: {
    async get(query) {
      projectMaterialRequests.push(query);
      const page = Number(query.query.page);
      return {
        status: "passed",
        responseHash: `sha256:project-${page}`,
        summary: {
          projectIdPresent: true,
          totalPage: 2,
          videoIds: page === 1 ? ["target-A"] : ["target-B"]
        }
      };
    }
  }
});
assert(projectVideoRead.status === "passed" && projectVideoRead.videoIds.join(",") === "target-A,target-B", "project_material_pagination_invalid");
assert(projectMaterialRequests.length === 2 && projectMaterialRequests.every((item) => item.query.filtering?.material_type === "VIDEO"), "project_material_filtering_contract_invalid");
assert(projectMaterialRequests.every((item) => !Object.hasOwn(item.query, "material_type")), "project_material_filtering_must_not_be_flat");
const failedProjectRead = await readProjectVideoIds({
  advertiserId: request.advertiser_id,
  projectId: request.project_id,
  client: { async get() { return { status: "blocked", responseHash: "sha256:blocked", summary: {} }; } }
});
assert(failedProjectRead.status === "blocked" && failedProjectRead.blocker === "project_material_readonly_failed", "project_material_failure_not_classified");
const inventory = await scanOceanEngineVideoInventory({
  advertiserId: request.advertiser_id,
  originResourceIds: ["video-zero", "video-unique", "video-ambiguous"],
  client: {
    async get() {
      return {
        status: "passed",
        responseHash: "sha256:inventory",
        summary: {
          totalPage: 1,
          items: [
            { filename: "video-unique.mp4", video_id: "target-unique" },
            { filename: "video-ambiguous-a.mp4", video_id: "target-ambiguous-a" },
            { filename: "video-ambiguous-b.mp4", video_id: "target-ambiguous-b" }
          ]
        }
      };
    }
  }
});
assert(inventory.status === "blocked" && inventory.blocker === "video_origin_mapping_ambiguous", "video_inventory_ambiguity_not_blocked");
assert(inventory.items.map((item) => item.candidateCount).join(",") === "0,1,2", "video_inventory_candidate_counts_invalid");
assert(exactMaterialCodePattern("4iLE-2")?.flags === "", "material_code_pattern_must_be_case_sensitive");
assert(filenameMatchesMaterialCode("4iLE-2.mp4", "4iLE-2"), "exact_case_material_code_not_matched");
assert(!filenameMatchesMaterialCode("4ile-2.mp4", "4iLE-2"), "lowercase_material_code_must_not_match");
assert(!filenameMatchesMaterialCode("4iLE-20.mp4", "4iLE-2"), "material_code_prefix_must_not_match");
const exactCaseInventory = await scanOceanEngineVideoInventory({
  advertiserId: request.advertiser_id,
  originResourceIds: ["4iLE-2"],
  client: {
    async get() {
      return {
        status: "passed",
        responseHash: "sha256:exact-case",
        summary: {
          totalPage: 1,
          items: [
            { filename: "4iLE-2.mp4", video_id: "exact-uppercase" },
            { filename: "4ile-2.mp4", video_id: "lowercase-variant" },
            { filename: "4iLE-20.mp4", video_id: "prefix-variant" }
          ]
        }
      };
    }
  }
});
assert(exactCaseInventory.status === "passed" && exactCaseInventory.items[0].videoId === "exact-uppercase" && exactCaseInventory.items[0].candidateCount === 1, "append_inventory_must_match_exact_case_only");
const duplicateExactCaseInventory = await scanOceanEngineVideoInventory({
  advertiserId: request.advertiser_id,
  originResourceIds: ["4iLE-2"],
  client: {
    async get() {
      return {
        status: "passed",
        responseHash: "sha256:duplicate-exact-case",
        summary: {
          totalPage: 1,
          items: [
            { filename: "first_4iLE-2.mp4", video_id: "exact-one" },
            { filename: "second_4iLE-2.mp4", video_id: "exact-two" }
          ]
        }
      };
    }
  }
});
assert(duplicateExactCaseInventory.status === "blocked" && duplicateExactCaseInventory.items[0].candidateCount === 2, "same_case_duplicate_must_remain_blocked");
const caseDistinctRequest = validateLaunchRequest({ ...request, origin_resource_ids: ["4iLE-2", "4ile-2"] });
assert(caseDistinctRequest.origin_resource_ids.length === 2, "case_distinct_material_codes_must_not_be_deduplicated");
assert(
  launchRequestFingerprint({ ...request, origin_resource_ids: ["4iLE-2"] }) !== launchRequestFingerprint({ ...request, origin_resource_ids: ["4ile-2"] }),
  "case_distinct_material_codes_must_have_distinct_fingerprints"
);
const genericMappings = [];
const genericExactCase = await reconcileQiankunMaterialSourceVideoInventory({
  repo: {
    async updateAccountResourceQiankunVideoMapping() { throw new Error("generic_exact_case_must_not_block"); },
    async upsertAccountResourceReadonlyBySourceAsset(input) { genericMappings.push(input); }
  },
  routeId: "oceanengine_3_byte_mini_game",
  gameCode: "JSZC",
  materialAccountId: "2234567890123456",
  videos: [{ sourceAssetId: "SOURCE-4iLE-2", originResourceId: "4iLE-2" }],
  client: {
    async get() {
      return {
        status: "passed",
        responseHash: "sha256:generic-exact-case",
        summary: {
          totalPage: 1,
          totalNumber: 3,
          items: [
            { filename: "4iLE-2.mp4", id: "generic-uppercase" },
            { filename: "4ile-2.mp4", id: "generic-lowercase" },
            { filename: "4iLE-20.mp4", id: "generic-prefix" }
          ]
        }
      };
    }
  }
});
assert(genericExactCase.status === "passed" && genericMappings.length === 1 && genericMappings[0].platformResourceId === "generic-uppercase", "generic_inventory_must_match_exact_case_only");
const hundred = Array.from({ length: 100 }, (_, index) => `resource-${index}`);
assert(validateLaunchRequest({ ...request, origin_resource_ids: hundred }).origin_resource_ids.length === 100, "hundred_ids_rejected");
for (const size of [1, 50, 51]) {
  const ids = hundred.slice(0, size);
  const normalized = validateLaunchRequest({ ...request, origin_resource_ids: ids });
  assert(normalized.origin_resource_ids.length === size, `append_${size}_items_rejected`);
}
let duplicate = false;
try { validateLaunchRequest({ ...request, origin_resource_ids: ["video-A", "video-A"] }); } catch (error) { duplicate = error.code === "launch_request_duplicate_origin_resource_id"; }
const recommendation = await recommendProjectVideoAppendProjects({
  advertiserId: request.advertiser_id,
  client: { async get({ query }) { return { status: "passed", summary: { totalPage: 2, items: Number(query.page) === 1 ? [
    { project_id: "2000000000000001", name: "项目一", create_time: "2026-09-14T09:00:00Z", status: "ENABLE" }
  ] : [{ project_id: "2000000000000002", name: "项目二", create_time: "2026-09-14T10:00:00Z", status: "ENABLE" }] } }; } }
});
assert(recommendation.status === "passed" && recommendation.latest === true && recommendation.items[0].projectId === "2000000000000002", "project_recommendation_not_sorted_or_lossless");
assert(duplicate, "duplicate_ids_not_reported");
let overLimit = false;
try { validateLaunchRequest({ ...request, origin_resource_ids: [...hundred, "resource-100"] }); } catch (error) { overLimit = error.code === "launch_request_origin_resource_ids_exceed_limit"; }
assert(overLimit, "over_limit_not_rejected");
console.log(JSON.stringify({ status: "passed", appendItems: 100, realPlatformWrites: 0 }));
