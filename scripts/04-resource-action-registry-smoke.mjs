import {
  ACTION_STD_PROJECT_CREATE,
  buildExecutionPlanFromBundle
} from "../src/workflows/executionPlan.mjs";
import {
  OE3_REQUIRED_RESOURCE_TYPES,
  allResourceActionCapabilities,
  assertNoSensitiveLeak,
  getResourceActionCapability,
  normalizeResourceSkillResult
} from "../src/workflows/skills/oe3/00-index.mjs";
import { runBackupLandingPageReadinessSkill } from "../src/workflows/skills/oe3/03-landing-page-readiness.mjs";
import { runMicroAppInstanceReadinessSkill } from "../src/workflows/skills/oe3/04-micro-app-instance-readiness.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readyResource(resourceType) {
  return {
    resource_id: `AR-SMOKE-${resourceType.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`,
    resource_type: resourceType,
    resource_name: `smoke ${resourceType}`,
    platform_resource_id: "100000000001",
    source_asset_id: resourceType === "backup_landing_page" ? "LPA-SMOKE" : "",
    visibility_status: "visible",
    readback_status: "readback_verified",
    required: true,
    metadata: {
      url_hash: resourceType === "backup_landing_page" ? "hash-smoke" : "",
      readonly_check: {
        status: "passed",
        video_id_present: resourceType === "video_asset",
        cover_mode: resourceType === "video_asset" ? "platform_default_cover_allowed" : "",
        custom_audience_ids: resourceType === "dmp_audience_package" ? ["100000000001"] : undefined
      }
    }
  };
}

function bundleWithResources(resources) {
  return {
    job: {
      job_id: "JOB-SMOKE-RESOURCE-ACTION-REGISTRY",
      route_id: "oceanengine_3_byte_mini_game",
      game_code: "JSZC",
      advertiser_id: "8990000000000001",
      object_type: "std_project",
      source_usage: "test_run"
    },
    account: {
      monitor_id: "245000"
    },
    touchpoint: {
      monitor_id: "245000"
    },
    draft: {
      draft_id: "DRAFT-SMOKE",
      payload_hash: "sha256:smoke"
    },
    nodes: [
      {
        node_key: "std_project_draft_builder",
        output_summary: {
          createReadiness: {
            canCreateCurrentJob: true,
            status: "ready_for_user_create_confirmation",
            payloadHashStable: true
          }
        }
      }
    ],
    backupLandingPage: {
      landing_page_asset_id: "LPA-SMOKE",
      site_id: "100000000001",
      site_name: "smoke landing page",
      url_hash: "hash-smoke",
      status: "active",
      landing_url_present: true,
      landing_url_https: true
    },
    defaults: {
      raw_defaults: {
        official_create_field_contract: {
          instance_id_create_evidence: {
            field_name_verified: true,
            field_type_verified: true,
            applicability_verified: true,
            long_id_transport_verified: true,
            long_id_transport_strategy: "decimal_bigint_json_number"
          }
        }
      }
    },
    resources
  };
}

function actionTypes(plan) {
  return (plan.plannedActions || []).map((action) => action.action_type);
}

const capabilities = allResourceActionCapabilities();
assert(capabilities.length === OE3_REQUIRED_RESOURCE_TYPES.length, "resource_capability_count_mismatch");
assert(capabilities.every((item) => item.verify_skill_key && item.verify_module_ref), "resource_capability_verify_refs_missing");
assert(getResourceActionCapability("video_asset").prepare_supported === true, "video_prepare_should_be_supported");
assert(getResourceActionCapability("video_asset").prepare_module_ref === "src/platforms/oceanengineVideoMaterialExecutor.mjs", "video_prepare_module_ref_wrong");
assert(getResourceActionCapability("dmp_audience_package").prepare_supported === true, "dmp_prepare_should_be_supported");
assert(getResourceActionCapability("dmp_audience_package").prepare_module_ref === "src/platforms/oceanengineDmpExecutor.mjs", "dmp_prepare_module_ref_wrong");
assert(getResourceActionCapability("avatar").prepare_supported === true, "avatar_prepare_should_be_supported");
assert(getResourceActionCapability("avatar").prepare_module_ref === "src/platforms/oceanengineAvatarExecutor.mjs", "avatar_prepare_module_ref_wrong");
assert(getResourceActionCapability("product_image").prepare_supported === true, "product_image_prepare_should_be_supported");
assert(getResourceActionCapability("product_image").prepare_module_ref === "src/platforms/oceanengineProductImageExecutor.mjs", "product_image_prepare_module_ref_wrong");
const backupCapability = getResourceActionCapability("backup_landing_page");
assert(backupCapability.prepare_supported === false, "backup_landing_page_prepare_must_remain_disabled");
assert(backupCapability.prepare_action_type === "", "backup_landing_page_prepare_action_must_not_be_active");
assert(backupCapability.reserved_prepare_action_type === "ensure_resource:backup_landing_page", "backup_landing_page_reserved_action_missing");
assert(backupCapability.reserved_prepare_scope === "source_material_account_to_target_account_designated_share_only", "backup_landing_page_reserved_scope_wrong");

const readyNormalized = normalizeResourceSkillResult({
  resourceType: "avatar",
  result: {
    status: "passed",
    blockers: [],
    outputSummary: {
      existence_status: "exists",
      readonly_status: "passed",
      readiness_status: "ready",
      avatar_status: "IN_AUDIT",
      avatar_readiness_reason: "avatar_ready",
      ready: true,
      nextAction: "无需动作"
    }
  }
});
assert(readyNormalized.outputSummary.prepare_capability.status === "ready", "resource_ready_status_wrong");
assert(readyNormalized.outputSummary.existence_status === "exists", "resource_existence_status_missing");
assert(readyNormalized.outputSummary.readonly_status === "passed", "resource_readonly_status_missing");
assert(readyNormalized.outputSummary.readiness_status === "ready", "resource_readiness_status_missing");
assert(readyNormalized.outputSummary.avatar_status === "IN_AUDIT", "avatar_status_missing_from_normalized_output");

const supportedNormalized = normalizeResourceSkillResult({
  resourceType: "video_asset",
  result: {
    status: "blocked",
    blockers: ["source_ready_target_missing"],
    outputSummary: {
      ready: false
    }
  }
});
assert(supportedNormalized.outputSummary.prepare_capability.status === "prepare_supported", "resource_prepare_supported_status_wrong");
assert(supportedNormalized.outputSummary.prepare_capability.prepare_action_type === "ensure_resource:video_asset", "resource_prepare_supported_action_wrong");
assert(supportedNormalized.outputSummary.readiness_status === "not_ready", "video_readiness_status_missing");

const unsupportedNormalized = normalizeResourceSkillResult({
  resourceType: "backup_landing_page",
  result: {
    status: "blocked",
    blockers: ["backup_landing_page_missing"],
    outputSummary: {
      ready: false
    }
  }
});
assert(unsupportedNormalized.outputSummary.prepare_capability.status === "prepare_unsupported", "resource_prepare_unsupported_status_wrong");
assert(unsupportedNormalized.outputSummary.existence_status === "missing", "backup_missing_existence_status_wrong");

const unsupportedExistingNormalized = normalizeResourceSkillResult({
  resourceType: "backup_landing_page",
  result: {
    status: "blocked",
    blockers: ["backup_landing_page_not_ready"],
    outputSummary: {
      ready: false
    }
  }
});
assert(unsupportedExistingNormalized.outputSummary.existence_status === "exists", "backup_existing_existence_status_wrong");

const allReadyResources = OE3_REQUIRED_RESOURCE_TYPES.map(readyResource);
const videoMissingPlan = buildExecutionPlanFromBundle(bundleWithResources(
  allReadyResources.filter((item) => item.resource_type !== "video_asset")
));
assert(actionTypes(videoMissingPlan).includes("ensure_resource:video_asset"), "video_missing_prepare_action_missing");
const videoAction = videoMissingPlan.plannedActions.find((action) => action.action_type === "ensure_resource:video_asset");
assert(videoAction.module_ref === "src/platforms/oceanengineVideoMaterialExecutor.mjs", "video_action_module_ref_wrong");
assert(Boolean(videoAction.idempotency_key), "video_action_idempotency_key_missing");
assert(actionTypes(videoMissingPlan).includes(ACTION_STD_PROJECT_CREATE), "std_project_create_waiting_action_missing");

const avatarMissingPlan = buildExecutionPlanFromBundle(bundleWithResources(
  allReadyResources.filter((item) => item.resource_type !== "avatar")
));
assert(actionTypes(avatarMissingPlan).includes("ensure_resource:avatar"), "avatar_missing_prepare_action_missing");
assert(avatarMissingPlan.plannedActions.find((item) => item.action_type === "ensure_resource:avatar").module_ref === "src/platforms/oceanengineAvatarExecutor.mjs", "avatar_action_module_ref_wrong");

const dmpMissingPlan = buildExecutionPlanFromBundle(bundleWithResources(
  allReadyResources.filter((item) => item.resource_type !== "dmp_audience_package")
));
assert(actionTypes(dmpMissingPlan).includes("ensure_resource:dmp_audience_package"), "dmp_missing_prepare_action_missing");
assert(dmpMissingPlan.plannedActions.find((item) => item.action_type === "ensure_resource:dmp_audience_package").module_ref === "src/platforms/oceanengineDmpExecutor.mjs", "dmp_action_module_ref_wrong");

const productMissingPlan = buildExecutionPlanFromBundle(bundleWithResources(
  allReadyResources.filter((item) => item.resource_type !== "product_image")
));
assert(actionTypes(productMissingPlan).includes("ensure_resource:product_image"), "product_image_missing_prepare_action_missing");
assert(productMissingPlan.plannedActions.find((item) => item.action_type === "ensure_resource:product_image").module_ref === "src/platforms/oceanengineProductImageExecutor.mjs", "product_image_action_module_ref_wrong");
assert(!productMissingPlan.blockerCodes.includes("resource_prepare_unsupported:product_image"), "supported_product_image_blocker_present");

const backupMissingPlan = buildExecutionPlanFromBundle(bundleWithResources(
  allReadyResources.filter((item) => item.resource_type !== "backup_landing_page")
));
assert(!actionTypes(backupMissingPlan).includes("ensure_resource:backup_landing_page"), "reserved_backup_landing_page_action_planned_without_contract");
assert(backupMissingPlan.blockerCodes.includes("resource_prepare_unsupported:backup_landing_page"), "unsupported_backup_landing_page_blocker_missing");

const backupBlocked = normalizeResourceSkillResult({
  resourceType: "backup_landing_page",
  result: runBackupLandingPageReadinessSkill({
    bundle: {
      ...bundleWithResources(allReadyResources.filter((item) => item.resource_type !== "backup_landing_page")),
      backupLandingPage: {}
    }
  })
});
assert(backupBlocked.blockers.includes("backup_landing_page_default_missing"), "backup_landing_page_blocker_missing");
assert(backupBlocked.outputSummary.module_ref === "src/workflows/skills/oe3/03-landing-page-readiness.mjs", "backup_landing_page_module_ref_wrong");

const microBlocked = normalizeResourceSkillResult({
  resourceType: "micro_app_instance",
  result: runMicroAppInstanceReadinessSkill({
    bundle: {
      ...bundleWithResources(allReadyResources.filter((item) => item.resource_type !== "micro_app_instance")),
      defaults: {}
    }
  })
});
assert(microBlocked.blockers.includes("micro_app_instance_missing"), "micro_app_instance_blocker_missing");
assert(microBlocked.outputSummary.module_ref === "src/workflows/skills/oe3/04-micro-app-instance-readiness.mjs", "micro_app_instance_module_ref_wrong");

const result = {
  status: "passed",
  capabilityCount: capabilities.length,
  supportedPrepareActions: capabilities.filter((item) => item.prepare_supported).map((item) => item.prepare_action_type),
  resourceReady: readyNormalized.outputSummary.prepare_capability.status,
  resourcePrepareSupported: supportedNormalized.outputSummary.prepare_capability.status,
  resourcePrepareUnsupported: unsupportedNormalized.outputSummary.prepare_capability.status,
  videoPlanAction: videoAction.action_type,
  productPrepareAction: "ensure_resource:product_image",
  backupLandingPageReservedAction: backupCapability.reserved_prepare_action_type,
  backupLandingPageUnsupportedBlocker: "resource_prepare_unsupported:backup_landing_page",
  backupLandingPageBlockers: backupBlocked.blockers,
  microAppInstanceBlockers: microBlocked.blockers,
  noRealPlatformWrite: true,
  noTokenRefresh: true
};
assertNoSensitiveLeak(result);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
