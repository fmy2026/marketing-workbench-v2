import { OE3_RESOURCE_LABELS } from "./00-contracts.mjs";

function clean(value) {
  return String(value ?? "").trim();
}

function resource(bundle = {}, type) {
  return (bundle.resources || []).find((item) => item.resource_type === type) || {};
}

export function resolveBackupLandingPageDefault(bundle = {}) {
  const asset = bundle.backupLandingPage || {};
  const checks = {
    defaultPresent: Boolean(clean(asset.landing_page_asset_id)),
    active: clean(asset.status) === "active",
    landingUrlPresent: asset.landing_url_present === true,
    landingUrlHttps: asset.landing_url_https === true
  };
  const blockers = [
    ...(!checks.defaultPresent ? ["backup_landing_page_default_missing"] : []),
    ...(checks.defaultPresent && !checks.active ? ["backup_landing_page_not_active"] : []),
    ...(checks.defaultPresent && !checks.landingUrlPresent ? ["backup_landing_page_url_missing"] : []),
    ...(checks.landingUrlPresent && !checks.landingUrlHttps ? ["backup_landing_page_url_not_https"] : [])
  ];
  return {
    status: blockers.length ? "blocked" : "passed",
    blockers,
    outputSummary: {
      scope: "game_route_default",
      resourceType: "backup_landing_page",
      label: OE3_RESOURCE_LABELS.backup_landing_page,
      landingPageAssetId: asset.landing_page_asset_id || "",
      siteId: asset.site_id || "",
      siteName: asset.site_name || "",
      urlHash: asset.url_hash || "",
      assetStatus: asset.status || "missing",
      defaultReady: blockers.length === 0,
      checks,
      nextAction: blockers.length ? "补齐游戏级备用落地页默认配置" : "继续由 Node 4 核验目标账户可见性"
    }
  };
}

export function backupLandingPageReadiness(bundle = {}) {
  const defaultResult = resolveBackupLandingPageDefault(bundle);
  const asset = bundle.backupLandingPage || {};
  const item = resource(bundle, "backup_landing_page");
  const readonlyStatus = clean(item.metadata?.readonly_check?.status);
  const assetIdMatches = clean(item.source_asset_id) &&
    clean(item.source_asset_id) === clean(asset.landing_page_asset_id);
  const hashMatches = clean(asset.url_hash) &&
    clean(item.metadata?.url_hash) === clean(asset.url_hash);
  const checks = {
    ...(defaultResult.outputSummary.checks || {}),
    targetVisible: item.visibility_status === "visible",
    readbackVerified: item.readback_status === "readback_verified",
    readonlyPassed: ["passed", "passed_by_manual_confirmation"].includes(readonlyStatus),
    assetIdMatches,
    hashMatches
  };
  const blockers = [
    ...defaultResult.blockers,
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
      scope: "target_account_readiness",
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

export function runBackupLandingPageReadinessSkill({ bundle } = {}) {
  return backupLandingPageReadiness(bundle);
}

export function runBackupLandingPageDefaultSkill({ bundle } = {}) {
  return resolveBackupLandingPageDefault(bundle);
}
