import { OE3_RESOURCE_LABELS } from "./00-contracts.mjs";
import { clean, resource, resourceReady } from "./04-resource-verifiers.mjs";

function metadataValue(source = {}, paths = []) {
  for (const dotted of paths) {
    let cursor = source;
    for (const part of dotted.split(".")) cursor = cursor?.[part];
    if (cursor !== undefined && cursor !== null && cursor !== "") return cursor;
  }
  return "";
}

function defaultEvidence(bundle = {}) {
  return bundle.defaults?.raw_defaults?.official_create_field_contract?.instance_id_create_evidence || {};
}

export function evaluateMicroAppInstanceReadiness({ bundle = {}, mockReady = false } = {}) {
  const item = resource(bundle, "micro_app_instance");
  const evidence = defaultEvidence(bundle);
  const instanceId = clean(metadataValue(item, [
    "metadata.micro_app_instance_id",
    "metadata.instance_id",
    "platform_resource_id"
  ]));
  const evidenceChecks = {
    fieldNameVerified: evidence.field_name_verified === true,
    fieldTypeVerified: evidence.field_type_verified === true || Boolean(evidence.create_field_type),
    applicabilityVerified: evidence.applicability_verified === true,
    longIdTransportVerified: evidence.long_id_transport_verified === true || clean(evidence.long_id_transport_strategy) === "decimal_digit_string"
  };
  const ready = mockReady || (
    Boolean(item.resource_type) &&
    Boolean(instanceId) &&
    resourceReady(item) &&
    Object.values(evidenceChecks).every(Boolean)
  );
  const blockers = ready ? [] : [
    ...(!item.resource_type ? ["micro_app_instance_missing"] : []),
    ...(item.resource_type && !instanceId ? ["micro_app_instance_id_missing"] : []),
    ...(item.resource_type && !resourceReady(item) ? ["micro_app_instance_not_ready"] : []),
    ...(!evidenceChecks.fieldNameVerified ? ["instance_id_create_field_name_not_verified"] : []),
    ...(!evidenceChecks.fieldTypeVerified ? ["instance_id_create_field_type_not_verified"] : []),
    ...(!evidenceChecks.applicabilityVerified ? ["instance_id_applicability_not_verified"] : []),
    ...(!evidenceChecks.longIdTransportVerified ? ["instance_id_long_id_transport_not_verified"] : [])
  ];

  return {
    status: blockers.length ? "blocked" : "passed",
    blockers,
    outputSummary: {
      resourceType: "micro_app_instance",
      label: OE3_RESOURCE_LABELS.micro_app_instance,
      visibilityStatus: item.visibility_status || "missing",
      readbackStatus: item.readback_status || "missing",
      readonlyStatus: item.metadata?.readonly_check?.status || "",
      ready: blockers.length === 0,
      platformResourceIdPresent: Boolean(item.platform_resource_id),
      instanceIdPresent: Boolean(instanceId),
      payloadField: "project.instance_id",
      createEvidence: {
        fieldNameVerified: evidenceChecks.fieldNameVerified,
        fieldTypeVerified: evidenceChecks.fieldTypeVerified,
        applicabilityVerified: evidenceChecks.applicabilityVerified,
        longIdTransportVerified: evidenceChecks.longIdTransportVerified,
        longIdTransportStrategy: clean(evidence.long_id_transport_strategy)
      },
      nextAction: blockers.length ? "补齐小程序实例证据或确认 instance_id 创建字段合同" : "无需动作"
    }
  };
}

export function runMicroAppInstanceReadinessSkill({ bundle, mockReady = false } = {}) {
  return evaluateMicroAppInstanceReadiness({ bundle, mockReady });
}
