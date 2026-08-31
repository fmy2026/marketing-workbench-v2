import { sanitizeForPublic } from "../00-contracts.mjs";

// Canonical values are supplied by mwb.v_monitor_readiness through the job
// bundle. This adapter deliberately does not reproduce View/Gate logic.
export function monitorReadinessFromBundle(bundle = {}) {
  const readiness = bundle.monitorReadiness || {};
  return sanitizeForPublic({
    readinessStatus: readiness.readiness_status || "needs_readonly",
    monitorReady: readiness.monitor_ready === true,
    monitorIdPresent: readiness.monitor_id_present === true,
    touchpointRefPresent: readiness.touchpoint_ref_present === true,
    touchpointUrlPresent: readiness.touchpoint_url_present === true,
    readbackVerified: readiness.readback_verified === true,
    actionableBlockerCode: readiness.actionable_blocker_code || "",
    diagnosticCodes: readiness.diagnostic_codes || [],
    suggestedAction: readiness.suggested_action || ""
  });
}
