import { OE3_RESOURCE_LABELS } from "./00-contracts.mjs";

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
  return item.visibility_status === "visible" &&
    (item.readback_status === "readback_verified" || item.readback_status === "not_required") &&
    (!readonlyStatus || ["passed", "passed_by_manual_confirmation"].includes(readonlyStatus));
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
      clean(event.metadata?.oe3_brand_event_gate?.status) === "passed" ||
      clean(event.metadata?.readonly_check?.status) === "passed");
}

export function materialItems(bundle = {}) {
  return Array.isArray(bundle.materialPack?.items) ? bundle.materialPack.items : [];
}

export function backupLandingPageReadiness(bundle = {}) {
  const asset = bundle.backupLandingPage || {};
  const item = resource(bundle, "backup_landing_page");
  const readonlyStatus = clean(item.metadata?.readonly_check?.status);
  const assetIdMatches = clean(item.source_asset_id) &&
    clean(item.source_asset_id) === clean(asset.landing_page_asset_id);
  const hashMatches = clean(asset.url_hash) &&
    clean(item.metadata?.url_hash) === clean(asset.url_hash);
  const checks = {
    defaultPresent: Boolean(clean(asset.landing_page_asset_id)),
    active: clean(asset.status) === "active",
    landingUrlPresent: asset.landing_url_present === true,
    landingUrlHttps: asset.landing_url_https === true,
    targetVisible: item.visibility_status === "visible",
    readbackVerified: item.readback_status === "readback_verified",
    readonlyPassed: ["passed", "passed_by_manual_confirmation"].includes(readonlyStatus),
    assetIdMatches,
    hashMatches
  };
  const blockers = [
    ...(!checks.defaultPresent ? ["backup_landing_page_default_missing"] : []),
    ...(checks.defaultPresent && !checks.active ? ["backup_landing_page_not_active"] : []),
    ...(checks.defaultPresent && !checks.landingUrlPresent ? ["backup_landing_page_url_missing"] : []),
    ...(checks.landingUrlPresent && !checks.landingUrlHttps ? ["backup_landing_page_url_not_https"] : []),
    ...(!item.resource_type ? ["backup_landing_page_resource_missing"] : []),
    ...(item.resource_type && !checks.targetVisible ? ["backup_landing_page_target_not_visible"] : []),
    ...(item.resource_type && !checks.readbackVerified ? ["backup_landing_page_readback_not_verified"] : []),
    ...(item.resource_type && !checks.readonlyPassed ? ["backup_landing_page_readonly_not_passed"] : []),
    ...(item.resource_type && !checks.assetIdMatches ? ["backup_landing_page_asset_mismatch"] : []),
    ...(item.resource_type && checks.landingUrlPresent && !checks.hashMatches ? ["backup_landing_page_hash_mismatch"] : [])
  ];
  return {
    status: blockers.length ? "blocked" : "passed",
    blockers,
    outputSummary: {
      resourceType: "backup_landing_page",
      label: OE3_RESOURCE_LABELS.backup_landing_page,
      landingPageAssetId: asset.landing_page_asset_id || item.source_asset_id || "",
      siteId: asset.site_id || item.platform_resource_id || "",
      siteName: asset.site_name || item.resource_name || "",
      urlHash: asset.url_hash || item.metadata?.url_hash || "",
      assetStatus: asset.status || "missing",
      visibilityStatus: item.visibility_status || "missing",
      readbackStatus: item.readback_status || "missing",
      readonlyStatus,
      ready: blockers.length === 0,
      checks,
      nextAction: blockers.length ? "只读解析真实 HTTPS URL 并验证目标账户可见性" : "无需动作"
    }
  };
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
  const instanceEvidence = defaults.raw_defaults?.official_create_field_contract?.instance_id_create_evidence;
  if (instanceEvidence) {
    Object.assign(instanceEvidence, {
      field_name_verified: true,
      create_field_type: "decimal_digit_string",
      field_type_verified: true,
      landing_type: "MICRO_GAME",
      delivery_medium: "BYTE_GAME",
      applicability_verified: true,
      long_id_transport_strategy: "decimal_digit_string",
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
          visibility_status: "visible",
          readback_status: "readback_verified",
          metadata: {
            ...(item.metadata || {}),
            url_hash: item.metadata?.url_hash || mockBackupLandingUrlHash,
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
      if (item.resource_type !== "dmp_audience_package") return item;
      return {
        ...item,
        visibility_status: "visible",
        readback_status: "readback_verified",
        metadata: {
          ...(item.metadata || {}),
          custom_audience_ids: ["100000000001"],
          readonly_check: {
            ...(item.metadata?.readonly_check || {}),
            status: "passed",
            custom_audience_ids: ["100000000001"],
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
  return {
    status: ready ? "passed" : "blocked",
    blockers: ready ? [] : [blocker],
    outputSummary: {
      resourceType,
      label: OE3_RESOURCE_LABELS[resourceType],
      visibilityStatus: item.visibility_status || "missing",
      readbackStatus: item.readback_status || "missing",
      readonlyStatus: item.metadata?.readonly_check?.status || "",
      ready,
      platformResourceIdPresent: Boolean(item.platform_resource_id),
      nextAction: ready ? "无需动作" : "补齐资源或重跑只读校验"
    }
  };
}
