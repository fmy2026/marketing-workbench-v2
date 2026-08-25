import { OE3_RESOURCE_LABELS } from "./contracts.mjs";

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
  return {
    ...bundle,
    resources: (bundle.resources || []).map((item) => {
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
