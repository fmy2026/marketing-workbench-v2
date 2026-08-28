import { createHash } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { assertNoSensitiveLeak } from "../src/workflows/skills/oe3/00-index.mjs";
import { runBackupLandingPageSourcePrepareSkill } from "../src/workflows/skills/oe3/04-backup-landing-page-source-prepare.mjs";
import { runMicroAppInstanceReadonlySkill } from "../src/workflows/skills/oe3/04-micro-app-instance-readiness.mjs";
import { runProductImageSourcePrepareSkill } from "../src/workflows/skills/oe3/04-product-image-source-prepare.mjs";
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
    raw_defaults: {
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
assert(schedule.indexOf("micro-app-instance-readonly") < schedule.indexOf("resource-verify-micro-app-instance"), "micro_verifier_dependency_order_wrong");
assert(schedule.indexOf("backup-landing-page-source-prepare") < schedule.indexOf("resource-verify-backup-landing-page"), "backup_verifier_dependency_order_wrong");
assert(validateOe3WorkflowSchedules().status === "passed", "workflow_schedule_validation_failed");

const product = await runProductImageSourcePrepareSkill({ repo, bundle });
assert(product.status === "passed", "product_source_prepare_should_pass");
assert(product.outputSummary.direct_target_upload_default === true, "product_should_default_to_target_upload");
assert(product.outputSummary.material_account_route_allowed === false, "product_should_not_default_to_material_account");
assert(product.outputSummary.target_candidate_count === 0, "product_target_candidate_count_wrong");

const micro = await runMicroAppInstanceReadonlySkill({ repo, bundle });
assert(micro.status === "blocked", "micro_candidate_should_not_pass_without_target_readback");
assert(micro.blockers.includes("micro_app_candidate_not_target_verified"), "micro_candidate_blocker_missing");
assert(micro.outputSummary.material_account_route_allowed === false, "micro_should_not_use_material_account_route");

const backup = await runBackupLandingPageSourcePrepareSkill({ repo, bundle });
assert(backup.status === "needs_confirmation", "backup_source_ready_should_need_contract_confirmation");
assert(backup.outputSummary.flow === "local_folder_to_material_account_to_target_account", "backup_flow_wrong");
assert(backup.outputSummary.target_transport_contract_verified === false, "backup_transport_contract_should_stay_unverified");
assert(backup.blockers.includes("backup_landing_page_target_transport_contract_unverified"), "backup_contract_blocker_missing");

const result = {
  status: "passed",
  newSkills: [
    "product-image-source-prepare",
    "micro-app-instance-readonly",
    "backup-landing-page-source-prepare"
  ],
  product: {
    status: product.status,
    directTargetUploadDefault: product.outputSummary.direct_target_upload_default,
    materialAccountRouteAllowed: product.outputSummary.material_account_route_allowed
  },
  micro: {
    status: micro.status,
    candidateNotTargetVerified: micro.blockers.includes("micro_app_candidate_not_target_verified")
  },
  backup: {
    status: backup.status,
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
