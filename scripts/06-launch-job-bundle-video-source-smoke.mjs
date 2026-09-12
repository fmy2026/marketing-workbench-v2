import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import { buildVideoMaterialPreparePlan } from "../src/platforms/oceanengineVideoMaterialExecutor.mjs";
import { requiredVerifiedVideoMaterialEntries, requiredActiveVideoMaterialItems } from "../src/workflows/skills/oe3/04-resource-verifiers.mjs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function clean(value) {
  return String(value || "").trim();
}

function getArg(name, fallback = "") {
  const prefix = `--${name}=`;
  const inline = process.argv.find((item) => item.startsWith(prefix));
  if (inline) return clean(inline.slice(prefix.length));
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? clean(process.argv[index + 1] || "") : fallback;
}

function uniqueSorted(items = []) {
  return [...new Set(items)].sort();
}

const caseId = getArg("case-id", "CASE-MWBV2-F13F365AA0B98E01C8");
if (!caseId) {
  throw new Error("case_id_required");
}

const repo = new PostgresRepository();
const latestJob = await repo.getLatestLaunchJobByCase(caseId);
assert(latestJob?.job_id, "latest_job_missing");

const bundle = await repo.getLaunchJobBundle(latestJob.job_id);
assert(bundle?.job?.job_id, "bundle_missing");

const requiredEntries = requiredActiveVideoMaterialItems(bundle);
assert(requiredEntries.length > 0, "required_video_entries_missing");

const sourceVideos = Array.isArray(bundle.materialSourceResources)
  ? bundle.materialSourceResources.filter((item) => item.resource_type === "video_asset")
  : [];
assert(Array.isArray(bundle.materialSourceResources), "materialSourceResources_not_array");

const resolvedEntries = requiredVerifiedVideoMaterialEntries(bundle);
assert(resolvedEntries.length === requiredEntries.length, "required_video_entries_mapping_count_mismatch");
assert(resolvedEntries.every((entry) => entry.mappingStatus === "verified"), "required_video_mapping_status_not_all_verified");
assert(resolvedEntries.every((entry) => entry.videoIdPresent === true), "required_video_video_id_not_resolved");

for (const entry of requiredEntries) {
  const sourceAssetId = clean(entry.item?.asset_id || entry.asset?.asset_id);
  const matches = sourceVideos.filter((item) => clean(item.source_asset_id) === sourceAssetId);
  assert(matches.length > 0, `material_source_video_resource_missing:${sourceAssetId}`);
  const verified = matches.filter((item) => clean(item.metadata?.oceanengine_video_mapping?.status) === "verified");
  assert(verified.length > 0, `material_source_video_mapping_not_verified:${sourceAssetId}`);
  assert(clean(verified[0]?.metadata?.oceanengine_video_mapping?.oceanengine_video_id), `verified_video_id_missing:${sourceAssetId}`);
}

const materialPlan = buildVideoMaterialPreparePlan({ bundle });
assert(materialPlan.selectedRequiredVideoCount === requiredEntries.length, "plan_required_count_mismatch");
assert(materialPlan.items?.every((item) => item.videoIdPresent === true), "plan_items_video_id_not_present");
assert(materialPlan.items?.every((item) => item.requestHash || item.actions.includes("oceanengine_material_bind_target") || item.actions.length === 0), "plan_items_request_context_incomplete");

const readonlyStatusSet = new Set((materialPlan.items || []).map((item) => item.planStatus || "not_checked"));
const bindActionCount = (materialPlan.items || []).filter((item) => item.actions.includes("oceanengine_material_bind_target")).length;
const readyActionCount = (materialPlan.items || []).filter((item) => item.planStatus === "source_ready_target_ready").length;

console.log(JSON.stringify({
  caseId,
  jobId: latestJob.job_id,
  routeId: bundle.job.route_id,
  gameCode: bundle.job.game_code,
  targetAdvertiserId: bundle.job.advertiser_id,
  requiredVideoCount: resolvedEntries.length,
  verifiedSourceVideoCount: resolvedEntries.filter((entry) => entry.videoIdPresent).length,
  materialPlanBindActionCount: bindActionCount,
  materialPlanBindBatchCount: materialPlan.bindBatchCount,
  readyActionCount,
  planReadableStatuses: [...readonlyStatusSet].sort(),
  sourceVideoResourceIds: uniqueSorted(sourceVideos.map((item) => clean(item.source_asset_id)).slice(0, 20))
}, null, 2));
