import { assertNoSensitiveLeak, hashValue, OE3_RESOURCE_LABELS, sanitizeForPublic } from "./00-contracts.mjs";
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
  const readonlyContract = item.metadata?.micro_app_instance_readonly_contract || {};
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
      readonlyContractStatus: clean(readonlyContract.status || "not_run"),
      readonly_contract_status: clean(readonlyContract.status || "not_run"),
      candidateInstanceIdPresent: readonlyContract.candidate_instance_id_present === true,
      candidate_instance_id_present: readonlyContract.candidate_instance_id_present === true,
      materialAccountRouteAllowed: readonlyContract.material_account_route_allowed === true,
      material_account_route_allowed: readonlyContract.material_account_route_allowed === true,
      readonlyEvidenceRef: clean(readonlyContract.evidence_ref),
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

function platformAppCandidate(bundle = {}) {
  const app = bundle.platformApp || {};
  const candidateInstanceId = clean(app.metadata?.micro_app_instance_id);
  return {
    app_id: clean(app.app_id),
    app_name: clean(app.app_name),
    app_type: clean(app.app_type),
    status: clean(app.status),
    candidate_instance_id_present: Boolean(candidateInstanceId),
    candidate_instance_id_source: clean(app.metadata?.micro_app_instance_id_source),
    runtime_field_status: clean(app.metadata?.runtime_field_status),
    source_usage: "reference_candidate"
  };
}

async function writeEvidence(repo, bundle, outputSummary) {
  const artifactId = `EV-${bundle.job.job_id}-MICRO-APP-INSTANCE-READONLY`;
  const evidence = {
    artifactId,
    jobId: bundle.job.job_id,
    artifactType: "micro_app_instance_readonly_contract",
    title: "小程序实例目标户只读与字段合同摘要",
    summary: `target_instance_present=${outputSummary.target_instance_id_present}; candidate_instance_present=${outputSummary.candidate_instance_id_present}; field_contract=${outputSummary.field_contract_status}`,
    contentHash: hashValue(outputSummary),
    storageRef: `postgres:mwb.launch_skill_runs/${bundle.job.job_id}/micro-app-instance-readonly`,
    sourceRef: "src/workflows/skills/oe3/04-micro-app-instance-readiness.mjs",
    sourceUsage: bundle.job.source_usage || "runtime_truth"
  };
  assertNoSensitiveLeak(evidence);
  await repo.upsertEvidence(evidence);
  return artifactId;
}

export async function runMicroAppInstanceReadonlySkill({ repo, bundle, mockReady = false } = {}) {
  if (!repo || !bundle?.job) throw new Error("launch_job_bundle_required");
  const item = resource(bundle, "micro_app_instance");
  const evidence = defaultEvidence(bundle);
  const readiness = evaluateMicroAppInstanceReadiness({ bundle, mockReady });
  const targetInstanceId = clean(metadataValue(item, [
    "metadata.micro_app_instance_id",
    "metadata.instance_id",
    "platform_resource_id"
  ]));
  const appCandidate = platformAppCandidate(bundle);
  const fieldChecks = readiness.outputSummary.createEvidence || {};
  const fieldContractStatus = Object.values({
    fieldNameVerified: fieldChecks.fieldNameVerified === true,
    fieldTypeVerified: fieldChecks.fieldTypeVerified === true,
    applicabilityVerified: fieldChecks.applicabilityVerified === true,
    longIdTransportVerified: fieldChecks.longIdTransportVerified === true
  }).every(Boolean) ? "verified" : "incomplete";
  const targetReady = readiness.status === "passed";
  const blockers = targetReady ? [] : [
    ...(readiness.blockers || []),
    ...(!appCandidate.app_id ? ["micro_app_platform_app_missing"] : []),
    ...(appCandidate.candidate_instance_id_present && !targetInstanceId ? ["micro_app_candidate_not_target_verified"] : [])
  ];
  const status = targetReady ? "passed" : "blocked";
  const outputSummary = sanitizeForPublic({
    status,
    resource_type: "micro_app_instance",
    app_id_present: Boolean(appCandidate.app_id),
    app_type: appCandidate.app_type,
    app_status: appCandidate.status,
    candidate_instance_id_present: appCandidate.candidate_instance_id_present,
    candidate_instance_id_source: appCandidate.candidate_instance_id_source,
    target_instance_id_present: Boolean(targetInstanceId),
    target_visible: item.visibility_status === "visible",
    target_readback_verified: item.readback_status === "readback_verified",
    readonly_status: item.metadata?.readonly_check?.status || "",
    field_contract_status: fieldContractStatus,
    field_name_verified: evidence.field_name_verified === true,
    field_type_verified: fieldChecks.fieldTypeVerified === true,
    applicability_verified: fieldChecks.applicabilityVerified === true,
    long_id_transport_verified: fieldChecks.longIdTransportVerified === true,
    payload_field: "project.instance_id",
    material_account_route_allowed: false,
    material_account_route_reason: "micro_app_instance_is_target_account_asset_not_material_account_asset",
    platform_write_called: false,
    next_action: targetReady
      ? "无需动作"
      : "运行目标账户小游戏实例只读核验，并补齐 instance_id 字段合同证据。"
  });
  const evidenceRef = await writeEvidence(repo, bundle, outputSummary);

  if (item.resource_type) {
    await repo.mergeAccountResourceMetadata({
      routeId: bundle.job.route_id,
      gameCode: bundle.job.game_code,
      advertiserId: bundle.job.advertiser_id,
      resourceType: "micro_app_instance",
      resourceMetadata: {
        micro_app_instance_readonly_contract: {
          ...outputSummary,
          blockers,
          evidence_ref: evidenceRef,
          checked_at: new Date().toISOString()
        }
      }
    });
  }

  const result = { status, blockers: [...new Set(blockers)], outputSummary: { ...outputSummary, evidenceRef, evidence_ref: evidenceRef }, evidenceRefs: [evidenceRef] };
  assertNoSensitiveLeak(result);
  return result;
}
