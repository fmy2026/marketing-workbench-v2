import { createHash } from "node:crypto";

export const OE3_REQUIRED_RESOURCE_TYPES = [
  "avatar",
  "dmp_audience_package",
  "event_asset",
  "video_asset",
  "product_image",
  "brand_info",
  "micro_app_instance",
  "backup_landing_page"
];

export const OE3_RESOURCE_LABELS = {
  avatar: "头像",
  dmp_audience_package: "DMP",
  event_asset: "事件资产",
  video_asset: "视频",
  product_image: "产品图",
  brand_info: "品牌",
  micro_app_instance: "小程序实例",
  backup_landing_page: "备用落地页"
};

export const OE3_SKILL_DEFINITIONS = [
  {
    skillKey: "intake-normalize",
    nodeKey: "launch_intake",
    dependsOn: [],
    inputContract: ["route_id", "game_code", "advertiser_id"],
    outputContract: ["normalized_intake", "missing_fields"],
    stopConditions: ["missing_required_field"],
    writeScope: "launch_skill_runs_only"
  },
  {
    skillKey: "monitor-query",
    nodeKey: "creation_context",
    dependsOn: ["intake-normalize"],
    inputContract: ["route_id", "game_code", "advertiser_id", "monitor_id"],
    outputContract: ["monitor_id_present", "provision_id", "plan_action_present"],
    stopConditions: ["monitor_query_blocked"],
    writeScope: "launch_skill_runs_monitor_provision_runs_evidence_artifacts",
    moduleRef: "src/workflows/skills/oe3/02-monitor-provision.mjs"
  },
  {
    skillKey: "monitor-plan",
    nodeKey: "creation_context",
    dependsOn: ["monitor-query"],
    inputContract: ["route_id", "game_code", "advertiser_id", "launch_execution_plan"],
    outputContract: ["ensure_monitor_planned", "plan_hash", "attempt_policy"],
    stopConditions: ["monitor_plan_blocked"],
    writeScope: "launch_skill_runs_monitor_provision_runs_evidence_artifacts",
    moduleRef: "src/workflows/skills/oe3/02-monitor-provision.mjs"
  },
  {
    skillKey: "monitor-ensure",
    nodeKey: "creation_context",
    dependsOn: ["monitor-plan"],
    inputContract: ["plan_id", "plan_hash", "allowed_plan_actions", "ensure_monitor"],
    outputContract: ["create_called", "attempt_no", "monitor_id_present"],
    stopConditions: ["planned_action_not_allowed:ensure_monitor", "monitor_create_attempt_limit_reached", "monitor_create_failed"],
    writeScope: "launch_skill_runs_monitor_provision_runs_monitor_provision_attempts_evidence_artifacts",
    moduleRef: "src/workflows/skills/oe3/02-monitor-provision.mjs"
  },
  {
    skillKey: "monitor-readback",
    nodeKey: "creation_context",
    dependsOn: ["monitor-ensure"],
    inputContract: ["provision_id", "monitor_id", "touchpoint_hash"],
    outputContract: ["monitor_readback_status", "monitor_id", "touchpoint_ref", "touchpoint_url_hash"],
    stopConditions: ["monitor_readback_missing", "touchpoint_url_unresolved_after_monitor_list"],
    writeScope: "launch_skill_runs_advertiser_accounts_account_touchpoints_monitor_provision_runs",
    moduleRef: "src/workflows/skills/oe3/02-monitor-provision.mjs"
  },
  {
    skillKey: "context-resolve-account",
    nodeKey: "creation_context",
    dependsOn: ["monitor-query"],
    inputContract: ["route_id", "game_code", "advertiser_id"],
    outputContract: ["account_status", "monitor_id"],
    stopConditions: ["account_missing", "account_not_ready"],
    writeScope: "launch_skill_runs_only"
  },
  {
    skillKey: "context-resolve-touchpoint",
    nodeKey: "creation_context",
    dependsOn: ["context-resolve-account"],
    inputContract: ["route_id", "game_code", "advertiser_id", "monitor_id"],
    outputContract: ["touchpoint_ref", "url_hash", "status", "hash_matches"],
    stopConditions: ["touchpoint_missing", "touchpoint_hash_mismatch"],
    writeScope: "launch_skill_runs_only"
  },
  {
    skillKey: "context-resolve-platform-app",
    nodeKey: "creation_context",
    dependsOn: ["context-resolve-account"],
    inputContract: ["route_id", "game_code"],
    outputContract: ["app_id_present", "app_type"],
    stopConditions: ["platform_app_missing"],
    writeScope: "launch_skill_runs_only"
  },
  {
    skillKey: "launch-pack-resolve-game",
    nodeKey: "game_launch_pack",
    dependsOn: ["context-resolve-platform-app"],
    inputContract: ["game_code"],
    outputContract: ["game_name", "product_name", "brand_name"],
    stopConditions: ["game_missing"],
    writeScope: "launch_skill_runs_only"
  },
  {
    skillKey: "launch-pack-resolve-defaults",
    nodeKey: "game_launch_pack",
    dependsOn: ["launch-pack-resolve-game"],
    inputContract: ["route_id", "game_code"],
    outputContract: ["objective", "deep_objective", "budget", "bid", "aweme_id_baseline"],
    stopConditions: ["route_defaults_missing"],
    writeScope: "launch_skill_runs_only"
  },
  {
    skillKey: "launch-pack-resolve-materials",
    nodeKey: "game_launch_pack",
    dependsOn: ["launch-pack-resolve-game"],
    inputContract: ["route_id", "game_code"],
    outputContract: ["material_pack_id", "material_item_count"],
    stopConditions: ["material_pack_missing"],
    writeScope: "launch_skill_runs_only"
  },
  {
    skillKey: "launch-pack-resolve-backup-landing-page",
    nodeKey: "game_launch_pack",
    dependsOn: ["launch-pack-resolve-game"],
    inputContract: ["route_id", "game_code"],
    outputContract: ["landing_page_asset_id", "site_id", "site_name", "url_hash", "status"],
    stopConditions: ["backup_landing_page_default_missing"],
    writeScope: "launch_skill_runs_only"
  },
  {
    skillKey: "launch-pack-resolve-resource-blueprints",
    nodeKey: "game_launch_pack",
    dependsOn: ["launch-pack-resolve-game"],
    inputContract: ["route_id", "game_code", "resource_blueprints"],
    outputContract: ["blueprint_count", "required_blueprint_count", "resource_type[]"],
    stopConditions: ["baseline_resource_blueprints_missing"],
    writeScope: "launch_skill_runs_only"
  },
  {
    skillKey: "aweme-authorization-readonly",
    nodeKey: "account_resource_prepare",
    dependsOn: ["launch-pack-resolve-defaults", "context-resolve-account"],
    inputContract: ["route_id", "game_code", "advertiser_id", "aweme_id_baseline", "advertiser_accounts.aweme_authorization"],
    outputContract: ["verification_status", "default_aweme_id_hash", "verified_by_job_id", "verified_at", "expires_at", "evidence_ref", "probe_profile", "default_aweme_id_hit", "shared_relation_seen", "next_action"],
    stopConditions: ["aweme_id_baseline_missing_or_incomplete", "aweme_default_aweme_id_missing_or_invalid", "aweme_default_not_authorized", "aweme_default_not_returned", "aweme_default_authorization_inactive", "aweme_auth_account_scope_mismatch", "credential_required", "readonly_transport_failed", "aweme_auth_credential_or_account_scope_failed", "aweme_auth_request_parameter_rejected", "aweme_auth_platform_api_failed"],
    writeScope: "launch_skill_runs_advertiser_accounts_evidence_artifacts",
    moduleRef: "src/workflows/skills/oe3/04-aweme-authorization-readonly.mjs"
  },
  {
    skillKey: "resource-bootstrap-from-blueprints",
    nodeKey: "account_resource_prepare",
    dependsOn: ["launch-pack-resolve-resource-blueprints"],
    inputContract: ["route_id", "game_code", "advertiser_id", "resource_blueprints"],
    outputContract: ["blueprint_count", "created_resource_count", "existing_resource_count", "inheritance_status[]"],
    stopConditions: ["baseline_resource_blueprints_missing"],
    writeScope: "launch_skill_runs_account_resources"
  },
  {
    skillKey: "resource-live-readonly-reconcile",
    nodeKey: "account_resource_prepare",
    dependsOn: ["resource-bootstrap-from-blueprints"],
    inputContract: ["route_id", "game_code", "advertiser_id", "account_resources"],
    outputContract: ["readonly_status", "probe_count", "resource_update_count", "evidence_ref"],
    stopConditions: ["credential_required", "readonly_transport_failed"],
    writeScope: "launch_skill_runs_account_resources_evidence_artifacts"
  },
  {
    skillKey: "avatar-source-prepare",
    nodeKey: "account_resource_prepare",
    dependsOn: ["resource-bootstrap-from-blueprints"],
    inputContract: ["route_id", "game_code", "advertiser_id", "avatar.source_asset_id"],
    outputContract: ["source_asset_id", "source_hash", "format", "width", "height", "source_file_present"],
    stopConditions: ["avatar_source_asset_missing", "avatar_source_file_missing", "avatar_source_hash_mismatch", "avatar_source_dimensions_invalid"],
    writeScope: "launch_skill_runs_account_resources",
    moduleRef: "src/workflows/skills/oe3/04-avatar-source-prepare.mjs"
  },
  {
    skillKey: "avatar-submit-plan",
    nodeKey: "account_resource_prepare",
    dependsOn: ["avatar-source-prepare", "resource-live-readonly-reconcile"],
    inputContract: ["advertiser_id", "avatar_source_preparation", "official_avatar_submit_contract"],
    outputContract: ["official_contract_verified", "request_field_manifest", "request_hash", "platform_write_called"],
    stopConditions: ["avatar_source_not_ready", "official_avatar_submit_contract_missing", "avatar_platform_image_id_required"],
    writeScope: "launch_skill_runs_account_resources",
    moduleRef: "src/workflows/skills/oe3/04-avatar-submit-plan.mjs"
  },
  {
    skillKey: "dmp-baseline-resolve",
    nodeKey: "account_resource_prepare",
    dependsOn: ["resource-bootstrap-from-blueprints"],
    inputContract: ["route_id", "game_code", "advertiser_id", "dmp_package_set_id"],
    outputContract: ["package_set_id", "semantic_key", "payload_field", "source_advertiser_id", "member_count"],
    stopConditions: ["dmp_baseline_package_set_missing", "dmp_baseline_members_missing"],
    writeScope: "launch_skill_runs_only",
    moduleRef: "src/workflows/skills/oe3/04-dmp-readonly.mjs"
  },
  {
    skillKey: "dmp-source-readonly-verify",
    nodeKey: "account_resource_prepare",
    dependsOn: ["dmp-baseline-resolve"],
    inputContract: ["package_set_id", "source_advertiser_id", "custom_audience_id[]"],
    outputContract: ["source_readonly_status", "source_verified_count", "evidence_ref", "custom_audience_id[]"],
    stopConditions: ["readonly_permission_required", "credential_required", "dmp_source_readonly_verify_blocked"],
    writeScope: "launch_skill_runs_dmp_package_members_evidence_artifacts",
    moduleRef: "src/workflows/skills/oe3/04-dmp-readonly.mjs"
  },
  {
    skillKey: "dmp-target-readonly-verify",
    nodeKey: "account_resource_prepare",
    dependsOn: ["dmp-baseline-resolve"],
    inputContract: ["package_set_id", "advertiser_id", "custom_audience_id[]"],
    outputContract: ["target_readonly_status", "target_verified_count", "missing_count", "evidence_ref", "custom_audience_id[]"],
    stopConditions: ["readonly_permission_required", "credential_required", "dmp_target_readonly_verify_blocked"],
    writeScope: "launch_skill_runs_dmp_package_members_account_resources_evidence_artifacts",
    moduleRef: "src/workflows/skills/oe3/04-dmp-readonly.mjs"
  },
  {
    skillKey: "dmp-push-plan",
    nodeKey: "account_resource_prepare",
    dependsOn: ["dmp-source-readonly-verify", "dmp-target-readonly-verify"],
    inputContract: ["source_verified_custom_audience_id[]", "target_verified_custom_audience_id[]", "target_advertiser_id"],
    outputContract: ["push_plan_count", "push_plan_id[]", "request_hash[]", "request_field_manifest"],
    stopConditions: ["dmp_source_readonly_not_complete", "dmp_target_push_plan_pending"],
    writeScope: "launch_skill_runs_dmp_package_push_plans_account_resources_evidence_artifacts",
    moduleRef: "src/workflows/skills/oe3/04-dmp-readonly.mjs"
  },
  {
    skillKey: "video-material-bind-plan",
    nodeKey: "account_resource_prepare",
    dependsOn: ["resource-live-readonly-reconcile"],
    inputContract: ["route_id", "game_code", "advertiser_id", "video_asset[]", "material_source_account"],
    outputContract: ["plan_status", "source_asset_id[]", "source_advertiser_id", "target_advertiser_id", "request_hash[]", "request_field_manifest", "next_action"],
    stopConditions: ["video_material_bind_plan_blocked", "source_missing_local_ready", "source_missing_local_missing", "platform_probe_failed"],
    writeScope: "launch_skill_runs_only",
    moduleRef: "src/workflows/skills/oe3/04-video-material-bind-plan.mjs"
  },
  {
    skillKey: "product-image-source-prepare",
    nodeKey: "account_resource_prepare",
    dependsOn: ["resource-live-readonly-reconcile"],
    inputContract: ["route_id", "game_code", "advertiser_id", "product_image.source_asset_id", "target file/image/get readonly summary"],
    outputContract: ["source_asset_id", "source_hash", "format", "width", "height", "required_size", "target_candidate_count", "direct_target_upload_default", "material_account_route_allowed"],
    stopConditions: ["product_image_source_asset_missing", "product_image_source_file_missing", "product_image_source_hash_mismatch", "product_image_source_format_unsupported"],
    writeScope: "launch_skill_runs_account_resources_evidence_artifacts",
    moduleRef: "src/workflows/skills/oe3/04-product-image-source-prepare.mjs"
  },
  {
    skillKey: "micro-app-instance-readonly",
    nodeKey: "account_resource_prepare",
    dependsOn: ["resource-live-readonly-reconcile"],
    inputContract: ["route_id", "game_code", "advertiser_id", "platform_app", "micro_app_instance", "official_create_field_contract"],
    outputContract: ["app_id_present", "candidate_instance_id_present", "target_instance_id_present", "field_contract_status", "material_account_route_allowed"],
    stopConditions: ["micro_app_instance_id_missing", "micro_app_instance_not_ready", "instance_id_create_field_name_not_verified", "instance_id_long_id_transport_not_verified"],
    writeScope: "launch_skill_runs_account_resources_evidence_artifacts",
    moduleRef: "src/workflows/skills/oe3/04-micro-app-instance-readiness.mjs"
  },
  {
    skillKey: "backup-landing-page-source-prepare",
    nodeKey: "account_resource_prepare",
    dependsOn: ["launch-pack-resolve-backup-landing-page", "resource-live-readonly-reconcile"],
    inputContract: ["route_id", "game_code", "advertiser_id", "backup_landing_page", "local_material_folder", "material_source_account"],
    outputContract: ["local_manifest_hash", "local_file_count", "source_account_present", "target_transport_contract_verified", "flow", "target_visible"],
    stopConditions: ["backup_landing_page_local_folder_missing", "backup_landing_page_source_account_missing", "backup_landing_page_target_transport_contract_unverified"],
    writeScope: "launch_skill_runs_account_resources_evidence_artifacts",
    moduleRef: "src/workflows/skills/oe3/04-backup-landing-page-source-prepare.mjs"
  },
  {
    skillKey: "backup-landing-page-material-inventory",
    nodeKey: "account_resource_prepare",
    dependsOn: [],
    inputContract: ["route_id", "game_code", "advertiser_id", "source_advertiser_id", "controlled_default_asset_id"],
    outputContract: ["conclusion", "candidate_count", "source_candidate_count", "target_match_count", "target_shared_match_count", "default_source_verified", "target_already_usable", "default_target_hash_matches", "cross_account_path"],
    stopConditions: ["backup_landing_page_default_source_missing", "backup_landing_page_default_source_not_usable", "backup_landing_page_default_candidate_not_unique", "backup_landing_page_target_site_missing", "backup_landing_page_target_site_not_usable", "backup_landing_page_target_url_hash_mismatch", "site_get_source_blocked", "site_get_target_blocked", "site_get_target_shared_blocked"],
    writeScope: "launch_skill_runs_account_resources_landing_page_assets_evidence_artifacts",
    moduleRef: "src/workflows/skills/oe3/04-backup-landing-page-material-inventory.mjs"
  },
  ...OE3_REQUIRED_RESOURCE_TYPES.map((resourceType) => ({
    skillKey: `resource-verify-${resourceType.replace(/_/g, "-")}`,
    nodeKey: "account_resource_prepare",
    dependsOn: ["launch-pack-resolve-materials", "resource-bootstrap-from-blueprints", "resource-live-readonly-reconcile", ...(resourceType === "avatar" ? ["avatar-source-prepare", "avatar-submit-plan"] : []), ...(resourceType === "dmp_audience_package" ? ["dmp-push-plan"] : []), ...(resourceType === "video_asset" ? ["video-material-bind-plan"] : []), ...(resourceType === "product_image" ? ["product-image-source-prepare"] : []), ...(resourceType === "micro_app_instance" ? ["micro-app-instance-readonly"] : []), ...(resourceType === "backup_landing_page" ? ["backup-landing-page-source-prepare"] : [])],
    inputContract: ["route_id", "game_code", "advertiser_id", resourceType],
    outputContract: resourceType === "dmp_audience_package"
      ? ["resource_type", "status", "existence_status", "prepare_capability", "blocker_codes", "module_ref", "evidence_refs", "next_action", "readonly_status", "readiness_status", "custom_audience_id[]", "audience.retargeting_tags_exclude"]
      : resourceType === "video_asset"
        ? ["resource_type", "status", "existence_status", "prepare_capability", "blocker_codes", "module_ref", "evidence_refs", "next_action", "readonly_status", "readiness_status", "selected_required_video_count", "verified_video_count", "cover_ready_count", "source_asset_id[]", "cover_mode"]
        : resourceType === "avatar"
          ? ["resource_type", "status", "existence_status", "prepare_capability", "blocker_codes", "module_ref", "evidence_refs", "next_action", "visibility_status", "readback_status", "readonly_status", "readiness_status", "avatar_status", "avatar_readiness_reason", "image_present"]
          : ["resource_type", "status", "existence_status", "prepare_capability", "blocker_codes", "module_ref", "evidence_refs", "next_action", "visibility_status", "readback_status", "readonly_status", "readiness_status"],
    stopConditions: [`${resourceType}_not_ready`, `resource_prepare_unsupported:${resourceType}`],
    writeScope: resourceType === "dmp_audience_package"
      ? "launch_skill_runs_account_resources_evidence_artifacts"
      : "launch_skill_runs_only"
  })),
  {
    skillKey: "payload-build",
    nodeKey: "std_project_draft_builder",
    dependsOn: ["aweme-authorization-readonly", ...OE3_REQUIRED_RESOURCE_TYPES.map((resourceType) => `resource-verify-${resourceType.replace(/_/g, "-")}`)],
    inputContract: ["job", "account", "route_defaults", "material_pack", "account_resources", "controlled_touchpoint", "controlled_mini_game_launch_link", "advertiser_accounts.aweme_authorization"],
    outputContract: ["project_name", "final_payload_hash", "request_field_manifest"],
    stopConditions: ["payload_build_blocked"],
    writeScope: "launch_drafts"
  },
  {
    skillKey: "payload-contract",
    nodeKey: "std_project_draft_builder",
    dependsOn: ["payload-build"],
    inputContract: ["final_payload_manifest", "payload_hash"],
    outputContract: ["payload_contract_status", "checks", "blockers"],
    stopConditions: ["payload_contract_blocked"],
    writeScope: "launch_skill_runs_only"
  },
  {
    skillKey: "duplicate-check",
    nodeKey: "std_project_draft_builder",
    dependsOn: ["payload-contract"],
    inputContract: ["advertiser_id", "project_name"],
    outputContract: ["status", "checked_at", "duplicate_found", "matched_object_id", "evidence_ref", "reason"],
    stopConditions: ["duplicate_check_blocked", "platform_duplicate_found"],
    writeScope: "launch_drafts_evidence_artifacts"
  },
  {
    skillKey: "create-readiness",
    nodeKey: "std_project_draft_builder",
    dependsOn: ["duplicate-check"],
    inputContract: ["all_skill_statuses", "platform_actions", "created_objects"],
    outputContract: ["create_readiness_status", "unique_blocker", "next_action"],
    stopConditions: ["not_ready_for_create"],
    writeScope: "launch_node_runs"
  },
  {
    skillKey: "create-once",
    nodeKey: "std_project_create_executor",
    dependsOn: ["create-readiness"],
    inputContract: ["job_id", "payload_hash", "single_create_confirmation"],
    outputContract: ["platform_action_summary", "object_id_present"],
    stopConditions: ["platform_write_disabled", "single_attempt_already_recorded", "create_failed"],
    writeScope: "launch_confirmations_platform_actions_created_objects"
  },
  {
    skillKey: "readback-std-project",
    nodeKey: "readback_closer",
    dependsOn: ["create-once"],
    inputContract: ["job_id", "project_name", "created_object_or_project_name"],
    outputContract: ["readback_status", "object_name_matches_draft", "evidence_ref"],
    stopConditions: ["readback_not_found_or_mismatch"],
    writeScope: "readback_records_evidence_artifacts"
  }
];

const SENSITIVE_KEY = /((^|[_-])(touchpoint_url|landing_url|raw_payload|raw_response|raw_request|request_header|access_token|refresh_token|passport_token|x_passport_token|app_secret|secret|auth_code|cookie|access-token|x-passport-token)([_-]|$)|controlledTouchpointUrl|touchpointUrl(?!Present|Hash|ControlledPresent))/i;
const SENSITIVE_VALUE = /(tf-api\.3k\.com|callback\/click|sslocal:\/\/|Bearer\s+[A-Za-z0-9._-]{20,}|X-Passport-Token:\s*\S{8,}|OCEANENGINE_(ACCESS|REFRESH)_TOKEN|OCEANENGINE_APP_SECRET)/i;

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

export function hashValue(value) {
  return `sha256:${sha256(typeof value === "string" ? value : canonicalJson(value))}`;
}

export function sanitizeForPublic(value) {
  if (Array.isArray(value)) return value.map((item) => sanitizeForPublic(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !SENSITIVE_KEY.test(key))
        .map(([key, item]) => [key, sanitizeForPublic(item)])
    );
  }
  if (typeof value === "string" && SENSITIVE_VALUE.test(value)) return "[redacted]";
  return value;
}

export function assertNoSensitiveLeak(value) {
  let leaked = false;
  const visit = (item) => {
    if (leaked) return;
    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }
    if (item && typeof item === "object") {
      Object.entries(item).forEach(([key, child]) => {
        if (SENSITIVE_KEY.test(key)) {
          leaked = true;
          return;
        }
        visit(child);
      });
      return;
    }
    if (typeof item === "string" && SENSITIVE_VALUE.test(item)) leaked = true;
  };
  visit(value);
  if (leaked) {
    throw new Error("sensitive_summary_leak_detected");
  }
}

export function skillDefinition(skillKey) {
  const definition = OE3_SKILL_DEFINITIONS.find((item) => item.skillKey === skillKey);
  if (!definition) throw new Error(`skill_not_registered:${skillKey}`);
  return definition;
}

export function moduleRefForSkill(skillKey) {
  if (skillKey === "intake-normalize") return "src/workflows/skills/oe3/01-intake-normalize.mjs";
  if (skillKey.startsWith("monitor-")) return "src/workflows/skills/oe3/02-monitor-provision.mjs";
  if (skillKey.startsWith("context-resolve-")) return "src/workflows/skills/oe3/02-context-resolvers.mjs";
  if (skillKey.startsWith("launch-pack-resolve-")) return "src/workflows/skills/oe3/03-launch-pack.mjs";
  if (skillKey === "aweme-authorization-readonly") return "src/workflows/skills/oe3/04-aweme-authorization-readonly.mjs";
  if (skillKey === "resource-bootstrap-from-blueprints") return "src/workflows/skills/oe3/04-resource-blueprint-bootstrap.mjs";
  if (skillKey === "resource-live-readonly-reconcile") return "src/workflows/skills/oe3/04-platform-readonly-reconcile.mjs";
  if (skillKey === "avatar-source-prepare") return "src/workflows/skills/oe3/04-avatar-source-prepare.mjs";
  if (skillKey === "avatar-submit-plan") return "src/workflows/skills/oe3/04-avatar-submit-plan.mjs";
  if (skillKey.startsWith("dmp-")) return "src/workflows/skills/oe3/04-dmp-readonly.mjs";
  if (skillKey === "video-material-bind-plan") return "src/workflows/skills/oe3/04-video-material-bind-plan.mjs";
  if (skillKey === "product-image-source-prepare") return "src/workflows/skills/oe3/04-product-image-source-prepare.mjs";
  if (skillKey === "micro-app-instance-readonly") return "src/workflows/skills/oe3/04-micro-app-instance-readiness.mjs";
  if (skillKey === "backup-landing-page-source-prepare") return "src/workflows/skills/oe3/04-backup-landing-page-source-prepare.mjs";
  if (skillKey === "backup-landing-page-material-inventory") return "src/workflows/skills/oe3/04-backup-landing-page-material-inventory.mjs";
  if (skillKey === "resource-verify-dmp-audience-package") return "src/workflows/skills/oe3/04-dmp-readonly.mjs";
  if (skillKey === "resource-verify-event-asset") return "src/workflows/skills/oe3/05-objective-contract-readiness.mjs";
  if (skillKey === "resource-verify-video-asset") return "src/workflows/skills/oe3/04-video-material-readiness.mjs";
  if (skillKey === "resource-verify-micro-app-instance") return "src/workflows/skills/oe3/04-micro-app-instance-readiness.mjs";
  if (skillKey === "resource-verify-backup-landing-page") return "src/workflows/skills/oe3/03-landing-page-readiness.mjs";
  if (skillKey.startsWith("resource-verify-")) return "src/workflows/skills/oe3/04-resource-verifiers.mjs";
  if (skillKey === "payload-build") return "src/workflows/skills/oe3/05-payload-contract.mjs";
  if (skillKey === "payload-contract") return "src/workflows/skills/oe3/05-payload-contract.mjs";
  if (skillKey === "duplicate-check") return "src/workflows/skills/oe3/05-duplicate-readonly.mjs";
  if (skillKey === "create-readiness") return "src/workflows/skills/oe3/05-create-preflight-diagnostics.mjs";
  if (skillKey === "create-once") return "src/workflows/skills/oe3/06-create-once.mjs";
  if (skillKey === "readback-std-project") return "src/workflows/skills/oe3/07-readback.mjs";
  return "src/workflows/skills/oe3/00-runner.mjs";
}

export function skillRunId({ jobId, skillKey, attemptNo = 1 }) {
  return `SKILL-${jobId}-${skillKey.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}-${String(attemptNo).padStart(2, "0")}`;
}

export async function recordSkillRun({ repo, bundle, definition, input, result, startedAt }) {
  const outputSummary = sanitizeForPublic(result.outputSummary || {});
  const blockers = sanitizeForPublic(result.blockers || []);
  const evidenceRefs = sanitizeForPublic(result.evidenceRefs || []);
  assertNoSensitiveLeak({ outputSummary, blockers, evidenceRefs });
  await repo.upsertLaunchSkillRun({
    skillRunId: skillRunId({
      jobId: bundle.job.job_id,
      skillKey: definition.skillKey,
      attemptNo: result.attemptNo || 1
    }),
    jobId: bundle.job.job_id,
    nodeKey: definition.nodeKey,
    skillKey: definition.skillKey,
    attemptNo: result.attemptNo || 1,
    status: result.status || "passed",
    inputHash: hashValue(sanitizeForPublic(input || {})),
    outputSummary,
    blockers,
    blockerCodes: blockers,
    errorCode: result.errorCode || blockers[0] || "",
    moduleRef: definition.moduleRef || moduleRefForSkill(definition.skillKey),
    evidenceRefs,
    sourceUsage: bundle.job.source_usage || "runtime_truth",
    startedAt,
    finishedAt: new Date().toISOString()
  });
}
