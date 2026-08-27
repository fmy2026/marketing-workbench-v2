import { hashValue, sanitizeForPublic } from "../workflows/skills/oe3/00-contracts.mjs";

export const DMP_PUSH_V2_ENDPOINT = "https://api.oceanengine.com/open_api/2/dmp/custom_audience/push_v2/";

function clean(value) {
  return String(value ?? "").trim();
}

function assertNumericId(name, value) {
  const text = clean(value);
  if (!/^\d+$/.test(text)) throw new Error(`invalid_${name}`);
  return text;
}

export function buildDmpPushRequestPlan({
  sourceAdvertiserId,
  targetAdvertiserId,
  customAudienceId,
  deliveryStatus = "ON"
} = {}) {
  const source = assertNumericId("source_advertiser_id", sourceAdvertiserId);
  const target = assertNumericId("target_advertiser_id", targetAdvertiserId);
  const audienceId = assertNumericId("custom_audience_id", customAudienceId);
  const requestShape = {
    advertiser_id: source,
    custom_audience_id: audienceId,
    target_advertiser_ids: [target],
    delivery_status: clean(deliveryStatus) || "ON"
  };
  return sanitizeForPublic({
    endpoint: DMP_PUSH_V2_ENDPOINT,
    method: "POST",
    requestHash: hashValue(requestShape),
    requestFieldManifest: {
      fieldNames: ["advertiser_id", "custom_audience_id", "target_advertiser_ids", "delivery_status"],
      advertiserIdRole: "source_advertiser_id",
      targetAdvertiserIdsRole: "target_advertiser_ids",
      targetAdvertiserIdsTransportType: "string_array",
      customAudienceIdTransportType: "number_string",
      deliveryStatusPolicy: "planned_on",
      rawRequestStored: false
    },
    outputSummary: {
      sourceAdvertiserId: source,
      targetAdvertiserId: target,
      customAudienceIdPresent: Boolean(audienceId),
      requestHash: hashValue(requestShape),
      rawRequestStored: false,
      rawResponseStored: false
    }
  });
}

export function summarizeDmpPushPlans(plans = []) {
  return sanitizeForPublic({
    planCount: plans.length,
    requestHashCount: plans.filter((plan) => plan.request_hash || plan.requestHash).length,
    endpoint: DMP_PUSH_V2_ENDPOINT,
    fieldNames: ["advertiser_id", "custom_audience_id", "target_advertiser_ids", "delivery_status"],
    noPlatformWriteCalled: true,
    rawRequestStored: false,
    rawResponseStored: false
  });
}
