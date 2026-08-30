import { PostgresRepository } from "../../src/repositories/postgresRepository.mjs";
import { buildHistoricalTemplatePayload } from "../../src/oneoff/jszcHistoricalTemplateCreate.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const repo = new PostgresRepository();
const bundle = await repo.getLaunchJobBundle("JOB-MWBV2-20260830010824-488F0E");
assert(bundle, "target_account_reference_bundle_missing");
const touchpoint = await repo.getControlledTouchpointUrl({
  routeId: bundle.job.route_id,
  gameCode: bundle.job.game_code,
  advertiserId: bundle.job.advertiser_id,
  monitorId: bundle.account.monitor_id
});
const launchLink = await repo.getControlledGameRouteLaunchLink({
  routeId: bundle.job.route_id,
  gameCode: bundle.job.game_code,
  platformAppId: bundle.platformApp.id,
  appId: bundle.platformApp.app_id
});
const compiled = buildHistoricalTemplatePayload({ bundle, touchpointUrl: touchpoint.touchpoint_url, launchLink });
const payload = compiled.payload;

assert(compiled.blockers.length === 0, `historical_template_blocked:${compiled.blockers.join(",")}`);
assert(payload.advertiser_id === "1871922346964041", "target_advertiser_not_used");
assert(payload.budget === 88888 && payload.cpa_bid === 488 && payload.roi_goal === 0.088, "historical_business_values_changed");
assert(payload.schedule_time.length === 336, "historical_schedule_changed");
assert(Object.keys(payload.project_materials.mini_program_info).sort().join(",") === "app_id,url", "historical_mini_program_shape_changed");
assert(!Object.hasOwn(payload.project_materials, "external_url_material_list"), "historical_external_url_omission_changed");
assert(payload.project_materials.video_material_list.length === 2 && payload.project_materials.video_material_list.every((item) => item.video_id && item.video_cover_id), "current_target_video_or_cover_missing");
assert(!Object.hasOwn(payload.audience, "filter_event"), "historical_unsubmitted_filter_event_present");

console.log(JSON.stringify({
  status: "passed",
  payloadHash: compiled.payloadHash,
  rawPayloadStored: false,
  rawResponseStored: false
}, null, 2));
