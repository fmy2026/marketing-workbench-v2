import {
  ACTION_STD_PROJECT_CREATE,
  buildEventConfigsExecutionPlanFromBundle,
  buildSingleResourceExecutionPlanFromBundle,
  buildExecutionPlanFromBundle
} from "../src/workflows/executionPlan.mjs";
import {
  EVENT_CONFIG_BASELINE_EVENTS,
  EVENT_CONFIGS_PROVISION_ACTION,
  EVENT_ASSET_CREATE_ENDPOINT,
  EVENT_ASSET_CREATE_FIELD_NAMES,
  EVENT_ASSET_CREATE_METHOD,
  EVENT_ASSET_OFFICIAL_CREATE_SOURCE_REFS,
  OE3_REQUIRED_RESOURCE_TYPES,
  allResourceActionCapabilities,
  assertNoSensitiveLeak,
  eventAssetOfficialCreateContractHash,
  eventAssetTemplateRef,
  eventAssetTemplateHash,
  getResourceActionCapability,
  normalizeResourceSkillResult
} from "../src/workflows/skills/oe3/00-index.mjs";
import { runBackupLandingPageReadinessSkill } from "../src/workflows/skills/oe3/03-landing-page-readiness.mjs";
import { eventChainResourceReadiness } from "../src/workflows/skills/oe3/04-event-chain-readiness.mjs";

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
assert(backupCapability.manual_share_only === true, "backup_landing_page_manual_share_only_missing");
assert(backupCapability.manual_share_readback_module_ref === "src/workflows/skills/oe3/04-backup-landing-page-material-inventory.mjs", "backup_landing_page_readback_module_wrong");
assert(backupCapability.future_api_slot === "same_site_share_api_contract_required", "backup_landing_page_future_api_slot_missing");
assert(backupCapability.excluded_write_endpoint === "/open_api/2/tools/site/handsel/", "backup_landing_page_handsel_exclusion_missing");
const eventCapability = getResourceActionCapability("event_asset");
assert(eventCapability.prepare_supported === true, "event_asset_prepare_should_be_supported_when_contract_eligible");
assert(eventCapability.prepare_action_type === "ensure_resource:event_asset", "event_asset_prepare_action_missing");
assert(eventCapability.prepare_module_ref === "src/platforms/oceanengineEventAssetExecutor.mjs", "event_asset_prepare_module_ref_wrong");

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
assert(!actionTypes(videoMissingPlan).includes(ACTION_STD_PROJECT_CREATE), "resource_plan_must_not_include_std_project_create");
assert(videoMissingPlan.metadata.execution_scope.maximum_create_calls === 0, "resource_only_plan_create_calls_must_be_zero");

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

const eventMissingPlan = buildExecutionPlanFromBundle(bundleWithResources(
  allReadyResources.filter((item) => item.resource_type !== "event_asset")
));
assert(!actionTypes(eventMissingPlan).includes("ensure_resource:event_asset"), "event_asset_action_planned_without_provision_eligibility");
assert(eventMissingPlan.blockerCodes.includes("event_asset_provision_not_plan_eligible"), "event_asset_provision_guard_blocker_missing");

function eventProvisionReadyBundle() {
  const base = {
    ...bundleWithResources(allReadyResources.filter((item) => item.resource_type !== "event_asset")),
    job: {
      ...bundleWithResources([]).job,
      advertiser_id: "1871922434025472"
    },
    defaults: {
      ...bundleWithResources([]).defaults,
      objective: "AD_CONVERT_TYPE_PAY",
      deep_objective: "AD_CONVERT_TYPE_PURCHASE_ROI_7D",
      deep_bid_type: "PER_AND_SEVEN_PAY_ROI"
    },
    platformApp: {
      id: "GPA-JSZC-OE-BYTE-MINI-GAME",
      app_id: "tte95a9fe77665844607",
      app_name: "巨兽战场",
      app_type: "byte_mini_game",
      status: "active",
      metadata: {
        micro_app_instance_id: "7434750138926546994",
        micro_app_instance_id_source: "platform_app_reference"
      }
    },
    resources: allReadyResources
      .filter((item) => item.resource_type !== "event_asset")
      .map((item) => item.resource_type === "micro_app_instance"
        ? {
            ...item,
            platform_resource_id: "",
            visibility_status: "needs_confirmation",
            readback_status: "not_checked",
            metadata: {
              event_chain_readonly_contract: {
                target_instance_readback_verified: true
              }
            }
          }
        : item),
    resourceBlueprints: [{
      resource_type: "event_asset",
      metadata: {}
    }]
  };
  const provision = {
    version: "test",
    template_status: "ready",
    target_advertiser_id: base.job.advertiser_id,
    template_ref: eventAssetTemplateRef(base.job.advertiser_id),
    template_hash: eventAssetTemplateHash({ bundle: base }),
    asset_type: "MINI_PROGRAME",
    platform_app_ref: "GPA-JSZC-OE-BYTE-MINI-GAME",
    objective: "AD_CONVERT_TYPE_PAY",
    deep_objective: "AD_CONVERT_TYPE_PURCHASE_ROI_7D",
    deep_bid_type: "PER_AND_SEVEN_PAY_ROI",
    official_create_contract: {
      status: "verified",
      source_ref: EVENT_ASSET_OFFICIAL_CREATE_SOURCE_REFS[0],
      content_hash: eventAssetOfficialCreateContractHash(),
      method: EVENT_ASSET_CREATE_METHOD,
      endpoint: EVENT_ASSET_CREATE_ENDPOINT,
      request_field_manifest: [...EVENT_ASSET_CREATE_FIELD_NAMES]
    }
  };
  return {
    ...base,
    resourceBlueprints: [{
      resource_type: "event_asset",
      metadata: { event_asset_provision: provision }
    }]
  };
}

const eventEligibleBundle = eventProvisionReadyBundle();
const eventEligibleNormalized = normalizeResourceSkillResult({
  resourceType: "event_asset",
  result: eventChainResourceReadiness({
    bundle: eventEligibleBundle,
    resourceType: "event_asset"
  })
});
assert(eventEligibleNormalized.outputSummary.prepare_capability.status === "prepare_supported", "event_asset_contract_ready_should_be_prepare_supported");
assert(eventEligibleNormalized.outputSummary.eventAssetProvisionPlanEligible === true, "event_asset_provision_eligible_not_exposed");
const eventSinglePlan = buildSingleResourceExecutionPlanFromBundle(eventEligibleBundle, {
  planVersion: 2,
  resourceType: "event_asset"
});
assert(eventSinglePlan.planStatus === "ready", "event_single_resource_plan_should_be_ready");
assert(JSON.stringify(actionTypes(eventSinglePlan)) === JSON.stringify([
  "ensure_resource:event_asset",
  EVENT_CONFIGS_PROVISION_ACTION
]), "event_single_resource_plan_must_include_event_asset_then_baseline_configs");
assert(eventSinglePlan.plannedActions[1]?.depends_on?.includes("ensure_resource:event_asset"), "event_configs_action_must_depend_on_event_asset");
assert(eventSinglePlan.metadata.execution_scope.maximum_platform_calls === 1 + EVENT_CONFIG_BASELINE_EVENTS.length, "event_single_resource_plan_call_limit_wrong");

const dmpSinglePlan = buildSingleResourceExecutionPlanFromBundle(eventEligibleBundle, {
  planVersion: 2,
  resourceType: "dmp_audience_package",
  actionCallLimits: { "ensure_resource:dmp_audience_package": 10 }
});
assert(dmpSinglePlan.planStatus === "ready", "dmp_single_resource_plan_should_be_ready");
assert(JSON.stringify(actionTypes(dmpSinglePlan)) === JSON.stringify(["ensure_resource:dmp_audience_package"]), "dmp_single_resource_plan_must_only_contain_dmp_action");
assert(dmpSinglePlan.metadata.execution_scope.maximum_platform_calls === 10, "dmp_single_resource_plan_call_limit_wrong");
const dmpSinglePlanWithoutPushPlans = buildSingleResourceExecutionPlanFromBundle(eventEligibleBundle, {
  planVersion: 2,
  resourceType: "dmp_audience_package",
  actionCallLimits: { "ensure_resource:dmp_audience_package": 0 }
});
assert(dmpSinglePlanWithoutPushPlans.planStatus === "blocked", "dmp_single_resource_plan_without_push_plans_must_block");
assert(dmpSinglePlanWithoutPushPlans.blockerCodes.includes("dmp_push_plan_missing"), "dmp_single_resource_plan_missing_push_blocker_wrong");

const eventConfigsPlan = buildEventConfigsExecutionPlanFromBundle(eventEligibleBundle, {
  planVersion: 3,
  assetIdHint: "1874962943118532"
});
assert(eventConfigsPlan.planStatus === "ready", "event_configs_plan_should_be_ready");
assert(JSON.stringify(actionTypes(eventConfigsPlan)) === JSON.stringify([EVENT_CONFIGS_PROVISION_ACTION]), "event_configs_plan_must_only_contain_baseline_action");
assert(eventConfigsPlan.metadata.execution_scope.maximum_platform_calls === 6, "event_configs_call_limit_wrong");

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
  result: eventChainResourceReadiness({
    bundle: {
      ...bundleWithResources(allReadyResources.filter((item) => item.resource_type !== "micro_app_instance")),
      defaults: {}
    },
    resourceType: "micro_app_instance"
  })
});
assert(microBlocked.blockers.includes("micro_app_instance_candidate_missing"), "micro_app_instance_candidate_blocker_missing");
assert(microBlocked.outputSummary.readinessStatus === "blocked", "missing_micro_app_instance_candidate_should_block");
assert(microBlocked.outputSummary.module_ref === "src/workflows/skills/oe3/04-event-chain-readiness.mjs", "micro_app_instance_module_ref_wrong");

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
  eventAssetPrepareAction: eventCapability.prepare_action_type,
  eventAssetProvisionGuardBlocker: "event_asset_provision_not_plan_eligible",
  eventSingleResourcePlan: eventSinglePlan.planId,
  dmpSingleResourcePlan: dmpSinglePlan.planId,
  eventConfigsPlan: eventConfigsPlan.planId,
  backupLandingPageBlockers: backupBlocked.blockers,
  microAppInstanceBlockers: microBlocked.blockers,
  noRealPlatformWrite: true,
  noTokenRefresh: true
};
assertNoSensitiveLeak(result);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
