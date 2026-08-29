import { createHash } from "node:crypto";
import { buildOe3StdProjectPayload } from "../src/workflows/skills/oe3/05-payload.mjs";
import { assertNoSensitiveLeak } from "../src/workflows/skills/oe3/00-contracts.mjs";
import { NESTED_FIELD_CONTRACT } from "../src/workflows/skills/oe3/05-nested-field-contract.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256Text(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

const routeId = "oceanengine_3_byte_mini_game";
const gameCode = "JSZC";
const platformAppId = "GPA-JSZC-OE-BYTE-MINI-GAME";
const appId = "tte95a9fe77665844607";
const launchUrl = `sslocal://microgame?app_id=${appId}`;

function readyResource(resourceType, extra = {}) {
  return {
    resource_type: resourceType,
    visibility_status: "visible",
    readback_status: "readback_verified",
    platform_resource_id: extra.platformResourceId || "1001",
    source_asset_id: extra.sourceAssetId || "",
    metadata: {
      readonly_check: { status: "passed" },
      ...(extra.metadata || {})
    }
  };
}

function bundle() {
  return {
    job: {
      job_id: "JOB-LAUNCH-LINK-SMOKE",
      route_id: routeId,
      game_code: gameCode,
      advertiser_id: "1871922175825993",
      object_type: "std_project",
      source_usage: "test_run"
    },
    route: { route_id: routeId },
    game: { game_code: gameCode, game_name: "巨兽战场", product_name: "巨兽战场", brand_name: "巨兽战场" },
    account: { advertiser_id: "1871922175825993", monitor_id: "245791" },
    platformApp: { id: platformAppId, app_id: appId },
    defaults: {
      objective: "AD_CONVERT_TYPE_PAY",
      deep_objective: "AD_CONVERT_TYPE_PURCHASE_ROI_7D",
      deep_bid_type: "DEEP_BID_DEFAULT",
      budget: 300,
      bid: 30,
      roi_goal: 1,
      raw_defaults: {
        contract_mapping: {
          mini_game_instance_candidate_create_field: "instance_id",
          optimized_goal_query_instance_field: "micro_app_instance_id",
          optimized_goal_query_app_field: "mini_program_id"
        },
        official_create_field_contract: {
          nested_rules: {
            version: NESTED_FIELD_CONTRACT.ruleVersion,
            source: NESTED_FIELD_CONTRACT.source,
            groups: {
              "project_materials.video_material_list": { reference: "open.oceanengine.com-3.0-waibugei/巨量营销智擎版/创建标准项目.md:143" },
              "project_materials.image_material_list": { reference: "open.oceanengine.com-3.0-waibugei/巨量营销智擎版/创建标准项目.md:149", send_policy: "send_empty_array" },
              "project_materials.external_url_material_list": { reference: "open.oceanengine.com-3.0-waibugei/巨量营销智擎版/创建标准项目.md:174", send_policy: "omit" },
              "project_materials.product_info": { reference: "open.oceanengine.com-3.0-waibugei/巨量营销智擎版/创建标准项目.md:163" },
              "project_materials.call_to_action_buttons": { reference: "open.oceanengine.com-3.0-waibugei/巨量营销智擎版/创建标准项目.md:167" },
              "project_materials.source": { reference: "open.oceanengine.com-3.0-waibugei/巨量营销智擎版/创建标准项目.md:173" },
              "project_materials.anchor_related_type": { reference: "open.oceanengine.com-3.0-waibugei/巨量营销智擎版/创建标准项目.md:168" },
              "project_materials.mini_program_info": { reference: "open.oceanengine.com-3.0-waibugei/巨量营销智擎版/创建标准项目.md:184" },
              "track_url_setting": { reference: "open.oceanengine.com-3.0-waibugei/巨量营销智擎版/创建标准项目.md" },
              "audience": { reference: "open.oceanengine.com-3.0-waibugei/巨量营销智擎版/创建标准项目.md" },
              "brand_info": { reference: "open.oceanengine.com-3.0-waibugei/巨量营销智擎版/创建标准项目.md:189" }
            }
          },
          instance_id_create_evidence: {
            status: "passed",
            candidate_create_field: "instance_id",
            field_name_verified: true,
            create_field_type: "number",
            field_type_verified: true,
            applicability_verified: true,
            long_id_transport_verified: true,
            long_id_transport_strategy: "decimal_bigint_json_number"
          },
          field_rules: {
            instance_id: { evidence_level: "official_direct", send_policy: "send" },
            delivery_type: { evidence_level: "official_direct", send_policy: "send" },
            layer_roi_switch: { evidence_level: "official_direct", send_policy: "send" },
            micro_promotion_type: { evidence_level: "official_related_endpoint", send_policy: "omit" }
          }
        },
        payload_defaults: {
          project: { ad_type: "ALL", landing_type: "MICRO_GAME", marketing_goal: "VIDEO_AND_IMAGE", native_type: "AWEME", delivery_mode: "MANUAL" },
          strategy: { delivery_type: "NORMAL", delivery_medium: "BYTE_GAME", micro_promotion_type: "BYTE_GAME", bid_type: "NO_BID", budget_mode: "BUDGET_MODE_DAY", pricing: "PRICING_OCPM", audience_type: "CUSTOM", layer_roi_switch: "OFF", aigc_dynamic_creative_switch: "OFF", is_comment_disable: "OFF" },
          track_url_setting: { send_type: "SERVER_SEND" },
          schedule: { schedule_type: "SCHEDULE_START_END" },
          targeting: { district: "CITY", gender: "GENDER_UNLIMITED", age: [], converted_time_duration: "SIX_MONTH", hide_if_converted: "NO_EXCLUDE", interest_action_mode: "CUSTOM" },
          product: { selling_points: ["开局装备全靠捡"], call_to_action_buttons: ["立即下载"], anchor_related_type: "OFF" }
        }
      }
    },
    materialPack: {
      items: [{
        item: { item_type: "video_asset", required: true, asset_id: "VIDEO-1" },
        asset: { asset_id: "VIDEO-1", asset_name: "巨兽战场福利开局", metadata: { video_id: "v1", video_cover_id: "c1" } }
      }, {
        item: { item_type: "title_material", required: true, status: "active", asset_id: "TITLE-1", asset_ref: "TITLE-1" },
        asset: { asset_id: "TITLE-1", asset_type: "title_material", asset_name: "巨兽战场福利开局", asset_ref: "TITLE-1", asset_hash: "sha256:title" }
      }]
    },
    backupLandingPage: {
      landing_page_asset_id: "LPA-JSZC-OE3-BACKUP-001",
      site_id: "7624750304608649243",
      url_hash: sha256Text("https://example.invalid/backup"),
      status: "active"
    },
    draft: {
      payload_summary: {
        platform_app_id: appId,
        project_name: "245791_N_JSZC_TEST_TEST_DEMO_P01_20260828",
        brand_info: {
          brand_name_id: "1",
          cdp_brand_id: "2",
          cdp_brand_name: "巨兽战场",
          yuntu_category_id: "3"
        }
      },
      project_name: "245791_N_JSZC_TEST_TEST_DEMO_P01_20260828"
    },
    resources: [
      readyResource("avatar", { platformResourceId: "65276361673", metadata: { aweme_id: "65276361673" } }),
      readyResource("dmp_audience_package", { metadata: { custom_audience_ids: ["123"] } }),
      readyResource("event_asset", { platformResourceId: "456" }),
      readyResource("product_image", { platformResourceId: "789", metadata: { product_image_target_upload_readback: { status: "passed", image_id_present: true, material_id_present: true } } }),
      readyResource("brand_info", { metadata: { brand_info_official: { brand_name_id: "1", cdp_brand_id: "2", cdp_brand_name: "巨兽战场", yuntu_category_id: "3" } } }),
      readyResource("micro_app_instance", { platformResourceId: "7434750138926546994", metadata: { micro_app_instance_id: "7434750138926546994" } }),
      readyResource("backup_landing_page", { platformResourceId: "7624750304608649243" }),
      readyResource("video_asset", { sourceAssetId: "VIDEO-1", platformResourceId: "VIDEO-1", metadata: { final_material_readiness: { cover_mode: "explicit_cover_verified" }, readonly_check: { status: "passed", video_id_present: true, cover_mode: "explicit_cover_verified" } } })
    ]
  };
}

function buildWith(link) {
  return buildOe3StdProjectPayload({
    bundle: bundle(),
    touchpointUrl: "https://example.invalid/touchpoint",
    backupLandingPageUrl: {
      landing_page_asset_id: "LPA-JSZC-OE3-BACKUP-001",
      site_id: "7624750304608649243",
      site_name: "backup",
      url_hash: sha256Text("https://example.invalid/backup"),
      status: "active",
      landing_url: "https://example.invalid/backup",
      resource_visibility_status: "visible",
      resource_readback_status: "readback_verified",
      resource_readonly_status: "passed"
    },
    miniProgramLaunchLink: link
  });
}

const ready = buildWith({
  link_ref: "GRLL-JSZC-OE3-BYTE-MINI-GAME",
  route_id: routeId,
  game_code: gameCode,
  platform_app_id: platformAppId,
  app_id: appId,
  url_hash: sha256Text(launchUrl),
  status: "active",
  launch_url: launchUrl
});
assert(ready.requestFieldManifest.miniProgramUrlRequired === true, "mini game route must require launch link");
assert(ready.requestFieldManifest.miniProgramLaunchLinkPresent === true, "ready launch link should enter final payload only");
assert(ready.requestFieldManifest.miniProgramLaunchLinkHashMatch === true, "ready launch link should hash-match");
assert(ready.requestFieldManifest.nestedFieldContract?.status === "passed", "ready payload nested field contract should pass");
assert(ready.requestFieldManifest.externalUrlMaterialListPolicy === "omit", "ready payload should omit external_url_material_list by current route contract");
assert(ready.requestFieldManifest.externalUrlMaterialListPresent === false, "ready payload must not include external_url_material_list");
assert(!ready.blockers.includes("mini_game_launch_url_not_ready"), "ready launch link should not block");

const missing = buildWith({});
assert(missing.blockers.includes("mini_game_launch_url_not_ready"), "missing launch link must block");
assert(missing.blockers.includes("nested_mini_program_info_contract_invalid"), "missing launch link must block nested mini_program_info contract");
assert(missing.requestFieldManifest.miniProgramLaunchLinkPresent === false, "missing launch link must not enter payload");

const wrongApp = buildWith({
  link_ref: "GRLL-JSZC-OE3-BYTE-MINI-GAME",
  route_id: routeId,
  game_code: gameCode,
  platform_app_id: platformAppId,
  app_id: "ttWRONG000000000",
  url_hash: sha256Text(launchUrl),
  status: "active",
  launch_url: launchUrl
});
assert(wrongApp.blockers.includes("mini_game_launch_url_not_ready"), "app_id mismatch must block");
assert(wrongApp.blockers.includes("nested_mini_program_info_contract_invalid"), "app_id mismatch must block nested mini_program_info contract");
assert(wrongApp.requestFieldManifest.miniProgramLaunchLinkAppIdMatch === false, "app_id mismatch should be visible in manifest");

const publicSummary = {
  status: "passed",
  readyManifest: ready.requestFieldManifest,
  missingBlockers: missing.blockers,
  wrongAppBlockers: wrongApp.blockers,
  rawPayloadStored: false,
  rawResponseStored: false
};
assertNoSensitiveLeak(publicSummary);
console.log(JSON.stringify({
  status: "passed",
  readyLinkHashPresent: /^sha256:?[a-f0-9]{64}$/.test(`sha256:${ready.requestFieldManifest.miniProgramLaunchLinkHash}`),
  missingBlocked: missing.blockers.includes("mini_game_launch_url_not_ready"),
  mismatchBlocked: wrongApp.blockers.includes("mini_game_launch_url_not_ready"),
  rawPayloadStored: false
}, null, 2));
