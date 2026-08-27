import { assertNoSensitiveLeak, hashValue, sanitizeForPublic } from "./00-contracts.mjs";

export const AVATAR_REFERENCE_CONTRACT = Object.freeze({
  contract_status: "reference_accepted",
  evidence_standard: "historical_script_reference_plus_realtime_readback",
  reference_only: true,
  upload: {
    endpoint_id: "advertiser/avatar/upload",
    method: "POST",
    request_fields: ["advertiser_id", "image_file"]
  },
  submit: {
    endpoint_id: "advertiser/avatar/submit",
    method: "POST",
    request_fields: ["advertiser_id", "image_id", "source_info"],
    source_info: "巨兽战场"
  },
  readback: {
    endpoint_id: "advertiser/avatar/get",
    method: "GET",
    request_fields: ["advertiser_id"]
  }
});

function clean(value) {
  return String(value ?? "").trim();
}

function avatarResource(bundle = {}) {
  return (bundle.resources || []).find((item) => item.resource_type === "avatar") || {};
}

function acceptedContract(bundle = {}) {
  const official = bundle.defaults?.raw_defaults?.official_avatar_submit_contract || {};
  const officialFields = Array.isArray(official.request_fields) ? official.request_fields.map(clean).filter(Boolean) : [];
  const officialVerified = official.verified === true && clean(official.endpoint_id) && clean(official.method) && officialFields.length > 0;
  if (officialVerified) {
    return {
      contract: official,
      requestFields: officialFields,
      accepted: true,
      source: "official_verified"
    };
  }
  return {
    contract: AVATAR_REFERENCE_CONTRACT,
    requestFields: AVATAR_REFERENCE_CONTRACT.submit.request_fields,
    accepted: true,
    source: AVATAR_REFERENCE_CONTRACT.evidence_standard
  };
}

export function buildAvatarSubmitPlan({ bundle } = {}) {
  if (!bundle?.job) throw new Error("launch_job_bundle_required");
  const resource = avatarResource(bundle);
  const source = resource.metadata?.avatar_source_preparation || {};
  const { contract, requestFields, accepted, source: contractSource } = acceptedContract(bundle);
  const blockers = [
    ...(source.status !== "passed" ? ["avatar_source_not_ready"] : []),
    ...(!accepted ? ["avatar_submit_contract_not_accepted"] : [])
  ];
  const requestManifest = accepted ? {
    contract_status: clean(contract.contract_status || "official_verified"),
    contract_source: contractSource,
    upload: AVATAR_REFERENCE_CONTRACT.upload,
    submit: AVATAR_REFERENCE_CONTRACT.submit,
    readback: AVATAR_REFERENCE_CONTRACT.readback,
    submit_request_fields: requestFields,
    source_info: AVATAR_REFERENCE_CONTRACT.submit.source_info,
    raw_payload_stored: false
  } : null;
  const requestHash = requestManifest ? hashValue({
    advertiser_id: bundle.job.advertiser_id,
    source_asset_id: resource.source_asset_id || "",
    source_hash: source.source_hash || "",
    request_manifest: requestManifest
  }) : "";
  const planStatus = blockers.length ? "blocked" : "planned";
  const status = blockers.length ? "blocked" : "passed";
  const result = {
    status,
    blockers,
    outputSummary: sanitizeForPublic({
      status: planStatus,
      skill_status: status,
      source_asset_id: clean(resource.source_asset_id),
      official_contract_verified: contractSource === "official_verified",
      reference_contract_accepted: accepted,
      request_field_manifest: requestManifest,
      request_hash: requestHash,
      platform_write_called: false,
      next_action: planStatus === "planned" ? "等待一次性头像提交授权" : "补齐唯一阻断项"
    }),
    evidenceRefs: []
  };
  assertNoSensitiveLeak(result);
  return result;
}

export async function runAvatarSubmitPlanSkill({ repo, bundle } = {}) {
  if (!repo || !bundle?.job) throw new Error("launch_job_bundle_required");
  const result = buildAvatarSubmitPlan({ bundle });
  await repo.mergeAccountResourceMetadata({
    routeId: bundle.job.route_id,
    gameCode: bundle.job.game_code,
    advertiserId: bundle.job.advertiser_id,
    resourceType: "avatar",
    resourceMetadata: {
      avatar_submission_plan: {
        status: result.outputSummary.status,
        blockers: result.blockers,
        official_contract_verified: result.outputSummary.official_contract_verified === true,
        reference_contract_accepted: result.outputSummary.reference_contract_accepted === true,
        request_hash: result.outputSummary.request_hash || "",
        request_field_manifest: result.outputSummary.request_field_manifest || null,
        platform_write_called: false,
        checked_at: new Date().toISOString()
      }
    }
  });
  return result;
}
