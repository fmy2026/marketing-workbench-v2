import { sanitizeForPublic } from "../00-contracts.mjs";

export function monitorReadbackFromBundle(bundle = {}) {
  const readiness = bundle.monitorReadiness || {};
  return sanitizeForPublic({
    monitorReady: readiness.monitor_ready === true,
    monitorIdPresent: readiness.monitor_id_present === true,
    touchpointRefPresent: readiness.touchpoint_ref_present === true,
    touchpointUrlPresent: readiness.touchpoint_url_present === true,
    readbackVerified: readiness.readback_verified === true,
    evidenceArtifactId: readiness.evidence_artifact_id || ""
  });
}
