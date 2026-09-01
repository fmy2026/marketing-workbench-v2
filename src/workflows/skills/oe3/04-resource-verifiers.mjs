import { OE3_RESOURCE_LABELS, hashValue } from "./00-contracts.mjs";
import { backupLandingPageReadiness as node3BackupLandingPageReadiness } from "./03-landing-page-readiness.mjs";
import { INSTANCE_ID_WIRE_STRATEGY } from "./05-std-project-create-wire-body.mjs";

export function clean(value) {
  return String(value ?? "").trim();
}

export function has(value) {
  return value !== null && value !== undefined && value !== "";
}

export function resource(bundle = {}, type) {
  return (bundle.resources || []).find((item) => item.resource_type === type) || {};
}

export function resourceReady(item = {}) {
  const readonlyStatus = clean(item.metadata?.readonly_check?.status);
  const productImageTargetReadback = item.resource_type === "product_image" &&
    clean(item.metadata?.product_image_target_upload_readback?.status) === "passed" &&
    item.metadata?.product_image_target_upload_readback?.image_id_present === true &&
    item.metadata?.product_image_target_upload_readback?.material_id_present === true;
  return item.visibility_status === "visible" &&
    (item.readback_status === "readback_verified" || item.readback_status === "not_required") &&
    (
      !readonlyStatus ||
      ["passed", "passed_by_manual_confirmation"].includes(readonlyStatus) ||
      productImageTargetReadback
    );
}

function existenceStatus(item = {}) {
  return item.resource_type ? "exists" : "missing";
}

function readinessStatus(ready) {
  return ready ? "ready" : "not_ready";
}

export function dmpCustomAudienceIds(bundle = {}) {
  const item = resource(bundle, "dmp_audience_package");
  const metadata = item.metadata || {};
  const candidates = [
    metadata.custom_audience_ids,
    metadata.custom_audience_id_list,
    metadata.readonly_check?.custom_audience_ids,
    metadata.readonly_check?.custom_audience_id_list
  ].flatMap((value) => Array.isArray(value) ? value : (value ? [value] : []));
  return [...new Set(candidates.map(clean).filter((value) => /^\d+$/.test(value)))];
}

export function dmpIdsReady(bundle = {}) {
  return dmpCustomAudienceIds(bundle).length > 0;
}

export function brandIndustryPassed(bundle = {}) {
  const brand = resource(bundle, "brand_info");
  const official = brand.metadata?.brand_info_official || {};
  const repair = brand.metadata?.oe3_brand_industry_repair || {};
  return ["fresh_target_brand_industry_readback_passed", "target_account_fresh_brand_industry_readback_passed"].includes(clean(official.readback_status)) ||
    clean(official.live_brand_industry_status) === "passed" ||
    clean(repair.status) === "passed";
}

export function eventChainPassed(bundle = {}) {
  const event = resource(bundle, "event_asset");
  return resourceReady(event) &&
    (clean(event.metadata?.std_project_create_readiness?.event_chain_status) === "passed" ||
      clean(event.metadata?.event_chain_readonly_contract?.status) === "passed" ||
      clean(event.metadata?.oe3_brand_event_gate?.status) === "passed" ||
      clean(event.metadata?.readonly_check?.status) === "passed");
}

export function materialItems(bundle = {}) {
  return Array.isArray(bundle.materialPack?.items) ? bundle.materialPack.items : [];
}

export function backupLandingPageReadiness(bundle = {}) {
  return node3BackupLandingPageReadiness(bundle);
}

export function brandInfoSummary(bundle = {}) {
  const official = resource(bundle, "brand_info").metadata?.brand_info_official || {};
  return {
    brand_name_id: clean(official.brand_name_id),
    cdp_brand_id: clean(official.cdp_brand_id),
    cdp_brand_name: clean(official.cdp_brand_name),
    yuntu_category_id: clean(official.yuntu_category_id),
    matched_industry_path: clean(official.matched_industry_path),
    readback_status: clean(official.readback_status),
    confirmation_status: clean(official.confirmation_status)
  };
}

export function mockReadyBundle(bundle = {}) {
  const mockBackupLandingUrlHash = "be2045c5206b29f2e3d08bc46a8ae6dd0f9588aaef11edab968de84a17594b78";
  const mockDmpAudienceIds = Array.from({ length: 10 }, (_, index) => String(100000000001 + index));
  const resources = [...(bundle.resources || [])];
  // Test-only memory fixture: production always reads its evidence matrix from Postgres.
  const defaults = structuredClone(bundle.defaults || {});
  const fieldRules = defaults.raw_defaults?.official_create_field_contract?.field_rules;
  if (fieldRules?.instance_id) {
    fieldRules.instance_id = {
      ...fieldRules.instance_id,
      evidence_level: "official_direct",
      send_policy: "send",
      reference: "test_fixture:complete_official_create_field_evidence",
      reason: ""
    };
  }
  defaults.raw_defaults = defaults.raw_defaults || {};
  defaults.raw_defaults.aweme_id_baseline = defaults.raw_defaults.aweme_id_baseline || {
    version: "test_fixture:aweme-id-baseline",
    required_when: { native_type: "AWEME" },
    payload_path: "aweme_id",
    source: "tools/aweme_auth_list",
    auth_type: "AWEME_ACCOUNT",
    accepted_auth_status: ["AUTHRIZED", "AUTHORIZED"],
    verification_strategy: "fixed_game_default_account_verify",
    default_aweme_id: "57018827026",
    default_aweme_id_hash: hashValue("57018827026"),
    fallback_forbidden: true,
    contract_version: "test_fixture:aweme-id-fixed-default-account-verify-v2"
  };
  const awemeBaseline = defaults.raw_defaults.aweme_id_baseline;
  const mockAwemeId = clean(awemeBaseline.default_aweme_id) || "57018827026";
  const mockAwemeIdHash = clean(awemeBaseline.default_aweme_id_hash) || hashValue(mockAwemeId);
  const instanceEvidence = defaults.raw_defaults?.official_create_field_contract?.instance_id_create_evidence;
  if (instanceEvidence) {
    Object.assign(instanceEvidence, {
      field_name_verified: true,
      create_field_type: "number",
      field_type_verified: true,
      landing_type: "MICRO_GAME",
      delivery_medium: "BYTE_GAME",
      applicability_verified: true,
      long_id_transport_strategy: INSTANCE_ID_WIRE_STRATEGY,
      long_id_transport_source: "test_fixture:local_engineering_wire_encoder",
      long_id_transport_verified: true
    });
  }
  if (!resources.some((item) => item.resource_type === "backup_landing_page")) {
    resources.push({
      resource_id: "AR-MOCK-BACKUP-LANDING-PAGE",
      resource_type: "backup_landing_page",
      resource_name: "Mock backup landing page",
      platform_resource_id: "7624750304608649243",
      source_asset_id: "LPA-JSZC-OE3-BACKUP-MOCK",
      visibility_status: "visible",
      readback_status: "readback_verified",
      required: true,
      metadata: {
        site_id: "7624750304608649243",
        site_name: "Mock backup landing page",
        landing_page_asset_id: "LPA-JSZC-OE3-BACKUP-MOCK",
        url_hash: mockBackupLandingUrlHash,
        readonly_check: {
          status: "passed",
          mock: true
        }
      }
    });
  }
  return {
    ...bundle,
    defaults,
    account: {
      ...(bundle.account || {}),
      aweme_authorization: {
        rule_version: "test_fixture:aweme-id-fixed-default-account-verify-v2",
        advertiser_id: bundle.job?.advertiser_id || "",
        route_id: bundle.job?.route_id || "",
        game_code: bundle.job?.game_code || "",
        verification_strategy: "fixed_game_default_account_verify",
        default_aweme_id_configured: true,
        default_aweme_id_hash: mockAwemeIdHash,
        verification_status: "authorized",
        verified_by_job_id: bundle.job?.job_id || "",
        verified_at: new Date().toISOString(),
        expires_at: "",
        evidence_artifact_id: "",
        blocker_code: "",
        next_action: "ready_for_node5_payload_build",
        response_body_stored: false
      }
    },
    backupLandingPage: {
      ...(bundle.backupLandingPage || {}),
      landing_page_asset_id: "LPA-JSZC-OE3-BACKUP-MOCK",
      site_id: "7624750304608649243",
      site_name: "Mock backup landing page",
      url_hash: mockBackupLandingUrlHash,
      status: "active",
      source_usage: "test_run",
      landing_url_present: true,
      landing_url_https: true
    },
    resources: resources.map((item) => {
      if (item.resource_type === "backup_landing_page") {
        return {
          ...item,
          platform_resource_id: "7624750304608649243",
          source_asset_id: "LPA-JSZC-OE3-BACKUP-MOCK",
          visibility_status: "visible",
          readback_status: "readback_verified",
          metadata: {
            ...(item.metadata || {}),
            site_id: "7624750304608649243",
            site_name: "Mock backup landing page",
            landing_page_asset_id: "LPA-JSZC-OE3-BACKUP-MOCK",
            url_hash: mockBackupLandingUrlHash,
            readonly_check: {
              ...(item.metadata?.readonly_check || {}),
              status: "passed",
              mock: true
            }
          }
        };
      }
      if (item.resource_type === "video_asset") {
        return {
          ...item,
          visibility_status: "visible",
          readback_status: "readback_verified",
          metadata: {
            ...(item.metadata || {}),
            readonly_check: {
              ...(item.metadata?.readonly_check || {}),
              status: "passed",
              video_id_present: true,
              video_cover_id_present: true,
              cover_mode: "platform_default_cover_allowed",
              mock: true
            }
          }
        };
      }
      if (item.resource_type === "product_image") {
        return {
          ...item,
          platform_resource_id: item.platform_resource_id || "900000000001",
          visibility_status: "visible",
          readback_status: "readback_verified",
          metadata: {
            ...(item.metadata || {}),
            product_image_target_upload_readback: {
              status: "passed",
              image_id_present: true,
              material_id_present: true,
              mock: true
            },
            readonly_check: {
              ...(item.metadata?.readonly_check || {}),
              status: "passed",
              mock: true
            }
          }
        };
      }
      if (["event_asset", "micro_app_instance"].includes(item.resource_type)) {
        return {
          ...item,
          platform_resource_id: item.platform_resource_id || (item.resource_type === "event_asset" ? "800000000001" : "700000000001"),
          visibility_status: "visible",
          readback_status: "readback_verified",
          metadata: {
            ...(item.metadata || {}),
            readonly_check: {
              ...(item.metadata?.readonly_check || {}),
              status: "passed",
              mock: true
            },
            event_chain_readonly_contract: {
              status: "passed",
              event_asset_target_readback_verified: true,
              target_app_binding_verified: true,
              target_instance_candidate_present: true,
              target_instance_readback_verified: true,
              objective_found: true,
              deep_objective_found: true,
              deep_bid_type_found: true,
              mock: true
            }
          }
        };
      }
      if (item.resource_type !== "dmp_audience_package") return item;
      return {
        ...item,
        visibility_status: "visible",
        readback_status: "readback_verified",
        metadata: {
          ...(item.metadata || {}),
          custom_audience_ids: mockDmpAudienceIds,
          readonly_check: {
            ...(item.metadata?.readonly_check || {}),
            status: "passed",
            custom_audience_ids: mockDmpAudienceIds,
            mock: true
          }
        }
      };
    })
  };
}

export function withDmpCustomAudienceIds(bundle = {}, customAudienceIds = []) {
  if (!customAudienceIds.length) return bundle;
  return {
    ...bundle,
    resources: (bundle.resources || []).map((item) => {
      if (item.resource_type !== "dmp_audience_package") return item;
      return {
        ...item,
        visibility_status: "visible",
        readback_status: "readback_verified",
        metadata: {
          ...(item.metadata || {}),
          custom_audience_ids: customAudienceIds,
          readonly_check: {
            ...(item.metadata?.readonly_check || {}),
            status: "passed",
            custom_audience_ids: customAudienceIds,
            source: "current_workflow_memory"
          }
        }
      };
    })
  };
}

export function runResourceVerifier({ bundle, resourceType, mockReady = false }) {
  if (resourceType === "backup_landing_page" && !mockReady) {
    return backupLandingPageReadiness(bundle);
  }
  const item = resource(bundle, resourceType);
  const ready = mockReady || resourceReady(item);
  const blocker = !item.resource_type ? `${resourceType}_missing` : `${resourceType}_not_ready`;
  const avatarDiagnostic = resourceType === "avatar" ? (item.metadata?.avatar_readonly_diagnostic || {}) : {};
  const productImagePreparation = resourceType === "product_image" ? (item.metadata?.product_image_source_preparation || {}) : {};
  const readonlyStatus = item.metadata?.readonly_check?.status || "";
  const avatarReadinessReason = clean(avatarDiagnostic.avatar_readiness_reason || item.metadata?.readonly_check?.avatar_readiness_reason);
  return {
    status: ready ? "passed" : "blocked",
    blockers: ready ? [] : [blocker],
    outputSummary: {
      resourceType,
      label: OE3_RESOURCE_LABELS[resourceType],
      existenceStatus: existenceStatus(item),
      existence_status: existenceStatus(item),
      visibilityStatus: item.visibility_status || "missing",
      readbackStatus: item.readback_status || "missing",
      readonlyStatus,
      readonly_status: readonlyStatus,
      readinessStatus: readinessStatus(ready),
      readiness_status: readinessStatus(ready),
      ready,
      platformResourceIdPresent: Boolean(item.platform_resource_id),
      ...(resourceType === "avatar" ? {
        avatarStatus: clean(avatarDiagnostic.avatar_status || item.metadata?.readonly_check?.avatar_status || "unknown"),
        avatar_status: clean(avatarDiagnostic.avatar_status || item.metadata?.readonly_check?.avatar_status || "unknown"),
        avatarReadinessReason,
        avatar_readiness_reason: avatarReadinessReason,
        imagePresent: avatarDiagnostic.image_present === true || item.metadata?.readonly_check?.image_present === true,
        image_present: avatarDiagnostic.image_present === true || item.metadata?.readonly_check?.image_present === true,
        width: Number(avatarDiagnostic.width || 0),
        height: Number(avatarDiagnostic.height || 0),
        responseHashPresent: Boolean(avatarDiagnostic.response_hash),
        evidenceRef: clean(avatarDiagnostic.evidence_ref)
      } : {}),
      ...(resourceType === "product_image" ? {
        sourcePreparationStatus: clean(productImagePreparation.status || "not_run"),
        source_preparation_status: clean(productImagePreparation.status || "not_run"),
        sourceFilePresent: productImagePreparation.source_file_present === true,
        source_file_present: productImagePreparation.source_file_present === true,
        sourceHashPresent: Boolean(productImagePreparation.source_hash),
        source_hash_present: Boolean(productImagePreparation.source_hash),
        targetCandidateCount: Number(productImagePreparation.target_candidate_count || item.metadata?.product_image_inventory?.candidate_count || 0),
        target_candidate_count: Number(productImagePreparation.target_candidate_count || item.metadata?.product_image_inventory?.candidate_count || 0),
        directTargetUploadDefault: productImagePreparation.direct_target_upload_default === true,
        direct_target_upload_default: productImagePreparation.direct_target_upload_default === true,
        materialAccountRouteAllowed: productImagePreparation.material_account_route_allowed === true,
        material_account_route_allowed: productImagePreparation.material_account_route_allowed === true,
        preparationEvidenceRef: clean(productImagePreparation.evidence_ref)
      } : {}),
      nextAction: ready
        ? "无需动作"
        : resourceType === "avatar" && avatarReadinessReason === "avatar_unset"
          ? "建立头像准备机制或单次提交任务"
          : resourceType === "avatar" && avatarReadinessReason === "avatar_audit_rejected"
            ? "更换头像素材后另建单次提交任务"
            : "补齐资源或重跑只读校验"
    }
  };
}
