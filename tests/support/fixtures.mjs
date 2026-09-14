import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { hashPassword } from "../../src/security/workbenchAuth.mjs";
import { insertRows, loadConfiguration } from "./database.mjs";

const route = "oceanengine_3_byte_mini_game";
const game = "JSZC";
export const TEST_CASE_ID = "CASE-TEST-BASELINE";
export const TEST_JOB_ID = "JOB-TEST-BASELINE";
export const TEST_VERIFIED_PROJECT_ID = "9000000000000001";
export const TEST_PASSWORD = "12345678";
const hash = (value) => createHash("sha256").update(value).digest("hex");

export async function seedTestDatabase(database) {
  const configuration = await loadConfiguration();
  insertRows(database, "platform_routes", configuration.platform_routes);
  insertRows(database, "games", configuration.games);
  const users = [
    ["TEST-ADMIN", "test_admin", "Test Admin", "admin"],
    ["TEST-OPERATOR", "test_operator", "Test Operator", "operator"],
    ["TEST-OTHER", "test_other", "Test Other", "operator"]
  ];
  const passwordHash = await hashPassword(TEST_PASSWORD);
  insertRows(database, "workbench_users", users.map(([id, login, display, role]) => ({
    user_id: `USR-${id}`, login_name: login, display_name: display, qiankun_owner_key: login,
    user_role: role, user_status: "active", password_hash: passwordHash, must_change_password: true
  })));
  // IDs used in existing boundary tests are identifiers in this synthetic
  // dataset, never rows copied from a real account or execution.
  const source = JSON.stringify(configuration) + (await Promise.all((await readdir(new URL("../../scripts/", import.meta.url)))
    .filter((name) => name.endsWith("smoke.mjs"))
    .map((name) => readFile(new URL(`../../scripts/${name}`, import.meta.url), "utf8")))).join("\n");
  const accountIds = [...new Set([...source.matchAll(/\b1[78]\d{14}\b/g)].map(([id]) => id))];
  accountIds.push("9000000000000001", "9000000000000002");
  insertRows(database, "advertiser_accounts", accountIds.map((advertiserId, index) => ({
    advertiser_id: advertiserId, route_id: route, game_code: game, account_name: `Synthetic account ${index}`,
    platform: "oceanengine", auth_status: "ready", platform_status: "active", owner_name: "Test Admin",
    monitor_id: "245828", qiankun_account_record_id: `fixture-account-${index}`, qiankun_agent_id: "900001",
    qiankun_identity_status: "verified", qiankun_owner_key: "test_admin", owner_user_id: "USR-TEST-ADMIN"
  })));
  for (const [table, rows] of Object.entries(configuration)) {
    if (!["platform_routes", "games"].includes(table)) insertRows(database, table, rows);
  }
  const landing = configuration.landing_page_assets.find((item) => item.is_default && item.status === "active");
  const blueprints = configuration.game_route_resource_blueprints.filter((item) => item.required);
  const resources = [];
  const monitorRuns = [];
  for (const advertiserId of accountIds) {
    const url = `https://fixture.invalid/touchpoint/${advertiserId}`;
    insertRows(database, "account_touchpoints", [{
      touchpoint_id: `TP-TEST-${advertiserId}`, advertiser_id: advertiserId, route_id: route, game_code: game,
      monitor_id: "245828", touchpoint_ref: `TEST-TP-${advertiserId}`, url_hash: hash(url), status: "stored_in_database", source: "test_fixture", touchpoint_url: url
    }]);
    monitorRuns.push({ provision_id: `MP-TEST-${advertiserId}`, cycle_id: `MC-TEST-${advertiserId}`, cycle_no: 1,
      route_id: route, game_code: game, advertiser_id: advertiserId, status: "touchpoint_resolved", cycle_status: "resolved",
      request_fingerprint: hash(`monitor-${advertiserId}`), monitor_id: "245828", touchpoint_ref: `TEST-TP-${advertiserId}`,
      touchpoint_url_hash: hash(url), evidence_artifact_id: `EV-TEST-MONITOR-${advertiserId}` });
    for (const [index, blueprint] of blueprints.entries()) {
      const type = blueprint.resource_type;
      const resource = {
        resource_id: `AR-TEST-${advertiserId}-${index}`, advertiser_id: advertiserId, route_id: route, game_code: game,
        resource_type: type, resource_name: `Synthetic ${type}`, source_asset_id: blueprint.source_asset_id,
        platform_resource_id: blueprint.candidate_platform_resource_id || String(900000000000 + index),
        visibility_status: "visible", readback_status: "readback_verified", required: true,
        blueprint_id: blueprint.blueprint_id, inheritance_status: "target_readonly_verified",
        metadata: { readonly_check: { status: "passed", evidence_refs: ["test_fixture:readonly"] } }
      };
      if (type === "brand_info") resource.metadata.brand_info_official = {
        brand_name_id: "11467384", cdp_brand_id: "4016408", cdp_brand_name: "巨兽战场", yuntu_category_id: "2202",
        matched_industry_path: "游戏 / SLG", readback_status: "fresh_target_brand_industry_readback_passed"
      };
      if (type === "event_asset") resource.metadata.event_chain_readonly_contract = { status: "passed" };
      if (type === "micro_app_instance") resource.platform_resource_id = "7434750138926546994";
      if (type === "dmp_audience_package") {
        resource.platform_resource_id = "100000000001";
        resource.metadata.custom_audience_ids = Array.from({ length: 10 }, (_, i) => String(100000000001 + i));
      }
      if (type === "product_image") resource.metadata.product_image_target_upload_readback = { status: "passed", image_id_present: true, material_id_present: true };
      if (type === "video_asset") {
        resource.metadata.oceanengine_video_mapping = { status: "verified", oceanengine_video_id: resource.platform_resource_id };
        Object.assign(resource.metadata.readonly_check, { video_id_present: true, source_video_visible: true, target_video_visible: true, cover_mode: "platform_default_cover_allowed", plan_status: "source_ready_target_ready" });
      }
      if (type === "backup_landing_page" && landing) {
        resource.source_asset_id = landing.landing_page_asset_id;
        resource.platform_resource_id = landing.site_id;
        resource.metadata.url_hash = landing.url_hash;
        resource.metadata.readonly_check.target_hash_matches = true;
      }
      resources.push(resource);
    }
  }
  insertRows(database, "account_resources", resources);
  insertRows(database, "evidence_artifacts", accountIds.map((advertiserId) => ({
    artifact_id: `EV-TEST-MONITOR-${advertiserId}`, artifact_type: "monitor_readonly", title: "Synthetic monitor observation",
    summary: "Synthetic verified touchpoint fixture", content_hash: `sha256:${hash(advertiserId)}`, storage_ref: "test_fixture:monitor", source_ref: "test_fixture:monitor"
  })));
  insertRows(database, "monitor_provision_runs", monitorRuns);
  // A synthetic terminal case supplies HTTP/report ownership fixtures, without
  // introducing an active case into the scopes used by workflow tests.
  insertRows(database, "workflow_cases", [{ case_id: TEST_CASE_ID, case_key: "test-baseline", route_id: route, game_code: game,
    advertiser_id: "1871922175825993", lifecycle_status: "cancelled", source_usage: "runtime_truth", owner_user_id: "USR-TEST-ADMIN", created_by_user_id: "USR-TEST-ADMIN" }]);
  insertRows(database, "launch_jobs", [{ job_id: TEST_JOB_ID, case_id: TEST_CASE_ID, route_id: route, game_code: game,
    advertiser_id: "1871922175825993", object_type: "std_project", job_status: "blocked", current_node: "1", source_usage: "runtime_truth", source_record_ref: "test_fixture:baseline" }]);
  insertRows(database, "workflow_cases", [{
    case_id: "CASE-TEST-VERIFIED-PROJECT", case_key: "test-verified-project", route_id: route, game_code: game,
    advertiser_id: "1871922175825993", lifecycle_status: "completed", source_usage: "runtime_truth",
    owner_user_id: "USR-TEST-ADMIN", created_by_user_id: "USR-TEST-ADMIN"
  }]);
  insertRows(database, "launch_jobs", [{
    job_id: "JOB-TEST-VERIFIED-PROJECT", case_id: "CASE-TEST-VERIFIED-PROJECT", route_id: route, game_code: game,
    advertiser_id: "1871922175825993", object_type: "std_project", job_status: "completed", current_node: "7",
    source_usage: "runtime_truth", source_record_ref: "test_fixture:verified_project"
  }]);
  insertRows(database, "created_objects", [{
    created_object_id: "OBJ-TEST-VERIFIED-PROJECT", job_id: "JOB-TEST-VERIFIED-PROJECT", object_type: "std_project",
    object_id: TEST_VERIFIED_PROJECT_ID, object_name: "Synthetic verified project", object_status: "ENABLE",
    readback_status: "readback_verified", evidence_ref: "test_fixture:verified_project"
  }]);
  insertRows(database, "readback_records", [{
    readback_id: "RB-TEST-VERIFIED-PROJECT", job_id: "JOB-TEST-VERIFIED-PROJECT", object_type: "std_project",
    object_id: TEST_VERIFIED_PROJECT_ID, object_name: "Synthetic verified project", readback_status: "readback_verified",
    evidence_ref: "test_fixture:verified_project"
  }]);
  const additionalVerified = Array.from({ length: 5 }, (_, index) => {
    const suffix = String(index + 2).padStart(16, "0");
    return { projectId: `9${suffix.slice(1)}`, caseId: `CASE-TEST-VERIFIED-PROJECT-${index + 2}`, jobId: `JOB-TEST-VERIFIED-PROJECT-${index + 2}` };
  });
  insertRows(database, "workflow_cases", additionalVerified.map((item) => ({
    case_id: item.caseId, case_key: item.caseId.toLowerCase(), route_id: route, game_code: game,
    advertiser_id: "1871922175825993", lifecycle_status: "completed", source_usage: "runtime_truth",
    owner_user_id: "USR-TEST-ADMIN", created_by_user_id: "USR-TEST-ADMIN"
  })));
  insertRows(database, "launch_jobs", additionalVerified.map((item) => ({
    job_id: item.jobId, case_id: item.caseId, route_id: route, game_code: game, advertiser_id: "1871922175825993",
    object_type: "std_project", job_status: "completed", current_node: "7", source_usage: "runtime_truth", source_record_ref: "test_fixture:verified_project"
  })));
  insertRows(database, "created_objects", additionalVerified.map((item) => ({
    created_object_id: `OBJ-${item.jobId}`, job_id: item.jobId, object_type: "std_project", object_id: item.projectId,
    object_name: `Synthetic verified project ${item.projectId}`, object_status: "ENABLE", readback_status: "readback_verified", evidence_ref: "test_fixture:verified_project"
  })));
  insertRows(database, "readback_records", additionalVerified.map((item) => ({
    readback_id: `RB-${item.jobId}`, job_id: item.jobId, object_type: "std_project", object_id: item.projectId,
    object_name: `Synthetic verified project ${item.projectId}`, readback_status: "readback_verified", evidence_ref: "test_fixture:verified_project"
  })));
}
