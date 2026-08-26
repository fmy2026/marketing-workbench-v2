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
    skillKey: "context-resolve-account",
    nodeKey: "creation_context",
    dependsOn: ["intake-normalize"],
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
    outputContract: ["objective", "deep_objective", "budget", "bid"],
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
  ...OE3_REQUIRED_RESOURCE_TYPES.map((resourceType) => ({
    skillKey: `resource-verify-${resourceType.replace(/_/g, "-")}`,
    nodeKey: "account_resource_prepare",
    dependsOn: ["launch-pack-resolve-materials"],
    inputContract: ["route_id", "game_code", "advertiser_id", resourceType],
    outputContract: resourceType === "dmp_audience_package"
      ? ["visibility_status", "readback_status", "readonly_status", "custom_audience_id[]", "audience.retargeting_tags_exclude"]
      : resourceType === "video_asset"
        ? ["selected_required_video_count", "verified_video_count", "cover_ready_count", "source_asset_id[]", "cover_mode"]
        : ["visibility_status", "readback_status", "readonly_status"],
    stopConditions: [`${resourceType}_not_ready`],
    writeScope: resourceType === "dmp_audience_package"
      ? "launch_skill_runs_account_resources_evidence_artifacts"
      : "launch_skill_runs_only"
  })),
  {
    skillKey: "payload-build",
    nodeKey: "std_project_draft_builder",
    dependsOn: OE3_REQUIRED_RESOURCE_TYPES.map((resourceType) => `resource-verify-${resourceType.replace(/_/g, "-")}`),
    inputContract: ["job", "account", "route_defaults", "material_pack", "account_resources", "controlled_touchpoint"],
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
    evidenceRefs,
    sourceUsage: bundle.job.source_usage || "runtime_truth",
    startedAt,
    finishedAt: new Date().toISOString()
  });
}
