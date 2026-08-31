import { createHash } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  EVENT_CONFIG_BASELINE_EVENTS,
  EVENT_CONFIG_TRACK_TYPE,
  assertNoSensitiveLeak
} from "../src/workflows/skills/oe3/00-index.mjs";
import { runBackupLandingPageSourcePrepareSkill } from "../src/workflows/skills/oe3/04-backup-landing-page-source-prepare.mjs";
import { runEventChainReadonlySkill } from "../src/workflows/skills/oe3/04-event-chain-readiness.mjs";
import { runProductImageSourcePrepareSkill } from "../src/workflows/skills/oe3/04-product-image-source-prepare.mjs";
import { runResourceVerifier } from "../src/workflows/skills/oe3/04-resource-verifiers.mjs";
import { validateOe3WorkflowSchedules, workflowSkillScheduleForMode } from "../src/workflows/skills/oe3/00-runner.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function tinyPng() {
  return Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x6c,
    0x00, 0x00, 0x00, 0x6c,
    0x08, 0x02, 0x00, 0x00, 0x00
  ]);
}

function sha256Hex(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

const root = await mkdtemp(join(tmpdir(), "mwb-node4-resource-prep-"));
const productPath = join(root, "product.png");
const productBytes = tinyPng();
await writeFile(productPath, productBytes);
const landingFolder = join(root, "backup");
await mkdir(landingFolder);
await writeFile(join(landingFolder, "scene-01.jpeg"), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

const evidence = [];
const metadataUpdates = [];
const repo = {
  async getGameAsset(assetId) {
    if (assetId !== "PI-SMOKE") return null;
    return {
      asset_id: "PI-SMOKE",
      asset_type: "product_image",
      asset_name: "smoke product image",
      asset_ref: productPath,
      asset_hash: sha256Hex(productBytes),
      metadata: {
        width: 108,
        height: 108,
        required_size: "108x108",
        aigc: false
      }
    };
  },
  async upsertEvidence(item) {
    evidence.push(item);
  },
  async mergeAccountResourceMetadata(update) {
    metadataUpdates.push(update);
  },
  async updateAccountResourceReadonly(update) {
    metadataUpdates.push(update);
  }
};

const blockedEventChainClient = {
  credentialState() {
    return { status: "ready", blockers: [] };
  },
  async get({ label, endpoint, summarize }) {
    const baselineEvents = EVENT_CONFIG_BASELINE_EVENTS.map((item, index) => ({
      event_id: String(900000 + index),
      event_type: item.event_type,
      event_cn_name: item.event_cn_name,
      track_types: [EVENT_CONFIG_TRACK_TYPE]
    }));
    const payload = label === "event_chain_asset_list"
      ? { code: "0", data: { asset_list: [{ asset_id: "800000000001", asset_type: "MINI_PROGRAME", share_type: "MY_CREATIONS" }], page_info: { total_page: 1 } } }
      : label === "event_chain_asset_detail"
        ? { code: "0", data: { asset_list: [{ asset_id: "800000000001", asset_type: "MINI_PROGRAME", app_id: "tte-smoke", share_type: "MY_CREATIONS" }] } }
        : label === "event_chain_available_events"
          ? { code: "0", data: { list: baselineEvents } }
          : label === "event_chain_event_configs"
            ? { code: "0", data: { list: baselineEvents } }
            : { code: "0", data: { list: [] } };
    return {
      label,
      endpoint: endpoint.replace(/^\/open_api\/v3\.0\//, "").replace(/\/$/g, ""),
      status: "passed",
      httpStatus: 200,
      apiCode: "0",
      requestIdPresent: true,
      dataPresent: true,
      responseHash: "sha256:smoke",
      summary: summarize(payload)
    };
  }
};

const bundle = {
  job: {
    job_id: "JOB-SMOKE-NODE4-RESOURCE-PREP",
    route_id: "oceanengine_3_byte_mini_game",
    game_code: "JSZC",
    advertiser_id: "8990000000000001",
    source_usage: "test_run"
  },
  platformApp: {
    app_id: "tte-smoke",
    app_type: "byte_mini_game",
    app_name: "巨兽战场",
    status: "active",
    metadata: {
      micro_app_instance_id: "7434750138926546994",
      micro_app_instance_id_source: "reference_only_old_project_then_stored_in_v2",
      runtime_field_status: "ready"
    }
  },
  defaults: {
    objective: "AD_CONVERT_TYPE_PAY",
    deep_objective: "AD_CONVERT_TYPE_PURCHASE_ROI_7D",
    raw_defaults: {
      optimization: {
        external_action: "AD_CONVERT_TYPE_PAY",
        deep_external_action: "AD_CONVERT_TYPE_PURCHASE_ROI_7D"
      },
      payload_defaults: {
        project: {
          landing_type: "MICRO_GAME",
          ad_type: "ALL",
          delivery_mode: "PROCEDURAL",
          marketing_goal: "VIDEO_AND_IMAGE"
        },
        strategy: {
          delivery_type: "NORMAL",
          delivery_medium: "BYTE_GAME",
          micro_promotion_type: "BYTE_GAME"
        }
      },
      official_create_field_contract: {
        instance_id_create_evidence: {
          field_name_verified: true,
          field_type_verified: true,
          applicability_verified: true,
          long_id_transport_verified: false
        }
      }
    }
  },
  backupLandingPage: {
    landing_page_asset_id: "LPA-SMOKE",
    site_id: "7624750304608649243",
    site_name: "smoke landing",
    url_hash: "hash-smoke",
    source_advertiser_id: "1760246749825031",
    status: "active",
    metadata: {
      local_material_folder: landingFolder
    }
  },
  resources: [
    {
      resource_type: "product_image",
      resource_name: "smoke product image",
      source_asset_id: "PI-SMOKE",
      visibility_status: "needs_confirmation",
      readback_status: "not_checked",
      metadata: {
        product_image_inventory: {
          candidate_count: 0,
          response_hash: "sha256:smoke"
        }
      }
    },
    {
      resource_type: "micro_app_instance",
      resource_name: "smoke micro app",
      platform_resource_id: "",
      source_asset_id: "GPA-SMOKE",
      visibility_status: "needs_confirmation",
      readback_status: "not_checked",
      metadata: {
        readonly_check: {
          status: "baseline_candidate"
        }
      }
    },
    {
      resource_type: "backup_landing_page",
      resource_name: "smoke landing",
      platform_resource_id: "7624750304608649243",
      source_asset_id: "LPA-SMOKE",
      visibility_status: "unknown",
      readback_status: "not_checked",
      metadata: {
        url_hash: "hash-smoke",
        readonly_check: {
          status: "baseline_candidate"
        }
      }
    }
  ]
};

const schedule = workflowSkillScheduleForMode("dry_run");
assert(schedule.indexOf("resource-live-readonly-reconcile") < schedule.indexOf("product-image-source-prepare"), "product_skill_after_readonly_wrong");
assert(schedule.indexOf("product-image-source-prepare") < schedule.indexOf("resource-verify-product-image"), "product_verifier_dependency_order_wrong");
assert(schedule.indexOf("resource-live-readonly-reconcile") < schedule.indexOf("micro-app-instance-authority-readonly"), "micro_app_authority_before_readonly_wrong");
assert(schedule.indexOf("micro-app-instance-authority-readonly") < schedule.indexOf("event-chain-readonly"), "event_chain_before_micro_app_authority_wrong");
assert(schedule.indexOf("event-chain-readonly") < schedule.indexOf("resource-verify-event-asset"), "event_verifier_dependency_order_wrong");
assert(schedule.indexOf("event-chain-readonly") < schedule.indexOf("resource-verify-micro-app-instance"), "micro_verifier_dependency_order_wrong");
assert(schedule.indexOf("resource-live-readonly-reconcile") < schedule.indexOf("backup-landing-page-material-inventory"), "backup_inventory_after_readonly_wrong");
assert(schedule.indexOf("backup-landing-page-material-inventory") < schedule.indexOf("backup-landing-page-source-prepare"), "backup_source_before_inventory_wrong");
assert(schedule.indexOf("backup-landing-page-source-prepare") < schedule.indexOf("resource-verify-backup-landing-page"), "backup_verifier_dependency_order_wrong");
assert(JSON.stringify(workflowSkillScheduleForMode("aweme_auth_readonly")) === JSON.stringify([
  "intake-normalize",
  "context-resolve-account",
  "launch-pack-resolve-game",
  "launch-pack-resolve-defaults",
  "aweme-authorization-readonly"
]), "aweme_auth_readonly_schedule_not_minimal");
assert(validateOe3WorkflowSchedules().status === "passed", "workflow_schedule_validation_failed");

const product = await runProductImageSourcePrepareSkill({ repo, bundle });
assert(product.status === "passed", "product_source_prepare_should_pass");
assert(product.outputSummary.direct_target_upload_default === true, "product_should_default_to_target_upload");
assert(product.outputSummary.material_account_route_allowed === false, "product_should_not_default_to_material_account");
assert(product.outputSummary.target_candidate_count === 0, "product_target_candidate_count_wrong");

const productReadbackBundle = {
  ...bundle,
  resources: bundle.resources.map((item) => item.resource_type === "product_image" ? {
    ...item,
    platform_resource_id: "1234567890123456789",
    visibility_status: "visible",
    readback_status: "readback_verified",
    metadata: {
      ...item.metadata,
      readonly_check: {
        status: "needs_confirmation"
      },
      product_image_target_upload_readback: {
        status: "passed",
        image_id_present: true,
        material_id_present: true
      }
    }
  } : item)
};
const productVerifier = runResourceVerifier({ bundle: productReadbackBundle, resourceType: "product_image" });
assert(productVerifier.status === "passed", "product_target_upload_readback_should_override_stale_inventory_confirmation");

const eventChain = await runEventChainReadonlySkill({
  repo,
  bundle,
  client: blockedEventChainClient,
  allowReadonlyDependency: true
});
assert(eventChain.status === "blocked", "event_chain_should_not_pass_without_target_objective");
assert(eventChain.blockers.includes("optimized_goal_not_available"), "event_chain_target_objective_blocker_missing");
assert(eventChain.outputSummary.targetInstanceReadbackVerified === false, "reference_candidate_must_not_be_marked_target_visible");

const backup = await runBackupLandingPageSourcePrepareSkill({ repo, bundle });
assert(backup.status === "needs_confirmation", "backup_source_ready_should_need_contract_confirmation");
assert(backup.outputSummary.flow === "local_folder_to_material_account_to_target_same_site_share", "backup_flow_wrong");
assert(backup.outputSummary.target_transport_contract_verified === false, "backup_transport_contract_should_stay_unverified");
assert(backup.blockers.includes("backup_landing_page_target_transport_contract_unverified"), "backup_contract_blocker_missing");

const backupReadbackBundle = {
  ...bundle,
  resources: bundle.resources.map((item) => item.resource_type === "backup_landing_page" ? {
    ...item,
    visibility_status: "visible",
    readback_status: "readback_verified",
    metadata: {
      ...item.metadata,
      readonly_check: {
        status: "passed",
        target_visible: true,
        target_hash_matches: true
      }
    }
  } : item)
};
const backupReadback = await runBackupLandingPageSourcePrepareSkill({ repo, bundle: backupReadbackBundle });
assert(backupReadback.status === "passed", "backup_target_readback_should_close_source_prepare");
assert(backupReadback.outputSummary.target_transport_resolved_by_readback === true, "backup_target_readback_resolution_flag_missing");
assert(!backupReadback.blockers.includes("backup_landing_page_target_transport_contract_unverified"), "backup_manual_share_readback_should_not_keep_transport_blocker");

const result = {
  status: "passed",
  newSkills: [
    "product-image-source-prepare",
    "micro-app-instance-authority-readonly",
    "event-chain-readonly",
    "backup-landing-page-material-inventory",
    "backup-landing-page-source-prepare"
  ],
  product: {
    status: product.status,
    directTargetUploadDefault: product.outputSummary.direct_target_upload_default,
    materialAccountRouteAllowed: product.outputSummary.material_account_route_allowed
  },
  eventChain: {
    status: eventChain.status,
    targetObjectiveBlocked: eventChain.blockers.includes("optimized_goal_not_available"),
    targetVisible: eventChain.outputSummary.targetInstanceReadbackVerified
  },
  backup: {
    status: backup.status,
    targetReadbackStatus: backupReadback.status,
    flow: backup.outputSummary.flow,
    targetTransportContractVerified: backup.outputSummary.target_transport_contract_verified
  },
  evidenceCount: evidence.length,
  metadataUpdateCount: metadataUpdates.length,
  noRealPlatformWrite: true,
  noTokenRefresh: true
};
assertNoSensitiveLeak(result);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
