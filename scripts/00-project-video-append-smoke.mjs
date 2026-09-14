import {
  classifyProjectVideoAppendItems,
  buildProjectVideoAppendPlan,
  buildProjectVideoMaterialPushPlan,
  recommendProjectVideoAppendProjects,
  validateProjectVideoAppendReadback
} from "../src/platforms/oceanengineProjectVideoAppendExecutor.mjs";
import { validateLaunchRequest } from "../src/agents/launchRequest.mjs";
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
