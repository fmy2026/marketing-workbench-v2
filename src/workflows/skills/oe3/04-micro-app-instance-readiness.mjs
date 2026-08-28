import { createOceanEngineReadonlyClient } from "../../../platforms/oceanengineReadonlyClient.mjs";
import { assertNoSensitiveLeak, hashValue, OE3_RESOURCE_LABELS, sanitizeForPublic } from "./00-contracts.mjs";
import { readonlyPermissionState } from "./00-readonly-permission.mjs";
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

function allValuesByKey(value, keys) {
  const wanted = new Set(keys);
  const found = [];
  function walk(item) {
    if (Array.isArray(item)) {
      item.forEach(walk);
      return;
    }
    if (!item || typeof item !== "object") return;
    Object.entries(item).forEach(([key, child]) => {
      if (wanted.has(key) && clean(child)) found.push(clean(child));
      walk(child);
    });
  }
  walk(value);
  return [...new Set(found.map(clean).filter(Boolean))];
}

function routePayloadConfig(bundle = {}) {
  const raw = bundle.defaults?.raw_defaults || {};
  return {
    payloadDefaults: raw.payload_defaults || {},
    optimization: raw.optimization || {}
  };
}

function microAppInstanceIdCandidate(bundle = {}) {
  const item = resource(bundle, "micro_app_instance");
  const app = bundle.platformApp || {};
  return clean(metadataValue(item, [
    "metadata.micro_app_instance_id",
    "metadata.instance_id",
    "platform_resource_id"
  ])) || clean(app.metadata?.micro_app_instance_id);
}

function summarizeOptimizedGoal(payload = {}, expected = {}) {
  const externalActions = allValuesByKey(payload, ["external_action"]);
  const deepExternalActions = allValuesByKey(payload, ["deep_external_action"]);
  const assetIds = allValuesByKey(payload, ["asset_id", "asset_ids"]);
  return {
    goalCount: allValuesByKey(payload, ["optimization_name", "external_action"]).length,
    externalActionFound: externalActions.includes(expected.objective),
    deepExternalActionFound: deepExternalActions.includes(expected.deepObjective),
    assetIdReferenced: !expected.assetId || !assetIds.length || assetIds.includes(expected.assetId),
    expectedObjective: expected.objective,
    expectedDeepObjective: expected.deepObjective
  };
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
    resourceReady(item)
  );
  const blockers = ready ? [] : [
    ...(!item.resource_type ? ["micro_app_instance_missing"] : []),
    ...(item.resource_type && !instanceId ? ["micro_app_instance_id_missing"] : []),
    ...(item.resource_type && !resourceReady(item) ? ["micro_app_instance_not_ready"] : [])
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
      node4ResourceReady: blockers.length === 0,
      node5CreateTransportBlocked: !evidenceChecks.longIdTransportVerified,
      createEvidence: {
        fieldNameVerified: evidenceChecks.fieldNameVerified,
        fieldTypeVerified: evidenceChecks.fieldTypeVerified,
        applicabilityVerified: evidenceChecks.applicabilityVerified,
        longIdTransportVerified: evidenceChecks.longIdTransportVerified,
        longIdTransportStrategy: clean(evidence.long_id_transport_strategy)
      },
      nextAction: blockers.length ? "运行目标账户小游戏实例只读核验" : "进入 Node 5 创建字段传输合同校验"
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

function buildEligibilityQuery(bundle = {}) {
  const eventAsset = resource(bundle, "event_asset");
  const { payloadDefaults, optimization } = routePayloadConfig(bundle);
  const project = payloadDefaults.project || {};
  const strategy = payloadDefaults.strategy || {};
  const advertiserId = clean(bundle.job?.advertiser_id);
  const appId = clean(bundle.platformApp?.app_id || bundle.draft?.payload_summary?.platform_app_id);
  const instanceId = microAppInstanceIdCandidate(bundle);
  const eventAssetId = clean(eventAsset.platform_resource_id);
  const objective = clean(bundle.draft?.payload_summary?.objective || bundle.defaults?.objective || optimization.external_action);
  const deepObjective = clean(bundle.draft?.payload_summary?.deep_objective || bundle.defaults?.deep_objective || optimization.deep_external_action);
  const query = {
    advertiser_id: advertiserId,
    landing_type: clean(project.landing_type) || "MICRO_GAME",
    ad_type: clean(project.ad_type) || "ALL",
    delivery_mode: clean(project.delivery_mode) || "PROCEDURAL",
    delivery_type: clean(strategy.delivery_type) || "NORMAL",
    marketing_goal: clean(project.marketing_goal) || "VIDEO_AND_IMAGE",
    delivery_medium: clean(strategy.delivery_medium) || "BYTE_GAME",
    micro_promotion_type: clean(strategy.micro_promotion_type) || "BYTE_GAME",
    mini_program_id: appId,
    micro_app_instance_id: instanceId,
    asset_id: eventAssetId
  };
  return {
    query,
    expected: { objective, deepObjective, assetId: eventAssetId },
    required: { advertiserId, appId, instanceId, objective, deepObjective },
    routeScope: {
      landingType: query.landing_type,
      deliveryMedium: query.delivery_medium,
      microPromotionType: query.micro_promotion_type
    }
  };
}

async function runEligibilityProbe({ bundle, client }) {
  const request = buildEligibilityQuery(bundle);
  const missing = Object.entries(request.required)
    .filter(([, value]) => !clean(value))
    .map(([key]) => `micro_app_${key}_missing`);
  const routeBlockers = [
    ...(request.routeScope.landingType === "MICRO_GAME" ? [] : ["micro_app_landing_type_not_micro_game"]),
    ...(request.routeScope.deliveryMedium === "BYTE_GAME" ? [] : ["micro_app_delivery_medium_not_byte_game"]),
    ...(request.routeScope.microPromotionType === "BYTE_GAME" ? [] : ["micro_app_promotion_type_not_byte_game"])
  ];
  if (missing.length || routeBlockers.length) {
    return {
      probe: null,
      blockers: [...missing, ...routeBlockers],
      summary: {
        status: "blocked_precheck",
        appIdPresent: Boolean(request.required.appId),
        candidateInstanceIdPresent: Boolean(request.required.instanceId),
        objectivePresent: Boolean(request.required.objective),
        deepObjectivePresent: Boolean(request.required.deepObjective),
        routeScope: request.routeScope
      }
    };
  }
  const probe = await client.get({
    label: "micro_app_instance_optimized_goal",
    endpoint: "/open_api/v3.0/event_manager/optimized_goal/get/",
    query: request.query,
    requestFieldManifest: {
      fieldNames: Object.keys(request.query),
      longIdTransport: "http_get_query_string",
      rawQueryStored: false
    },
    summarize: (payload) => summarizeOptimizedGoal(payload, request.expected)
  });
  const summary = probe.summary || {};
  const blockers = [
    ...(probe.status === "passed" ? [] : ["micro_app_optimized_goal_readonly_not_passed"]),
    ...(summary.externalActionFound === true ? [] : ["micro_app_objective_not_available"]),
    ...(summary.deepExternalActionFound === true ? [] : ["micro_app_deep_objective_not_available"]),
    ...(summary.assetIdReferenced === true ? [] : ["micro_app_event_asset_not_referenced"])
  ];
  return { probe, blockers, summary };
}

export async function runMicroAppInstanceReadonlySkill({
  repo,
  bundle,
  client = createOceanEngineReadonlyClient(),
  allowReadonlyDependency = false,
  mockReady = false
} = {}) {
  if (!repo || !bundle?.job) throw new Error("launch_job_bundle_required");
  const item = resource(bundle, "micro_app_instance");
  const evidence = defaultEvidence(bundle);
  const appCandidate = platformAppCandidate(bundle);
  const candidateInstanceId = microAppInstanceIdCandidate(bundle);
  let eligibility = { probe: null, blockers: [], summary: {} };
  let eligibilitySource = "not_run";
  if (mockReady) {
    eligibilitySource = "mock_ready";
  } else if (bundle.job.source_usage === "test_run" && !allowReadonlyDependency) {
    eligibility = {
      probe: null,
      blockers: ["test_scope_target_readonly_not_run"],
      summary: { status: "not_run_test_scope" }
    };
    eligibilitySource = "test_scope_no_external_dependency";
  } else {
    const permission = readonlyPermissionState({ allowReadonlyDependency });
    if (!permission.allowed) {
      eligibility = {
        probe: null,
        blockers: ["readonly_permission_required"],
        summary: { status: "readonly_permission_required" }
      };
      eligibilitySource = "permission_state";
    } else {
      const credential = client.credentialState();
      if (credential.status !== "ready") {
        eligibility = {
          probe: null,
          blockers: ["credential_required", ...(credential.blockers || [])],
          summary: { status: "credential_required" }
        };
        eligibilitySource = "credential_state";
      } else {
        eligibility = await runEligibilityProbe({ bundle, client });
        eligibilitySource = "oceanengine_optimized_goal_readonly";
      }
    }
  }
  const targetReady = mockReady || (
    Boolean(item.resource_type) &&
    Boolean(candidateInstanceId) &&
    eligibility.blockers.length === 0
  );
  const normalizedItem = targetReady ? {
    ...item,
    platform_resource_id: clean(item.platform_resource_id) || candidateInstanceId,
    visibility_status: "visible",
    readback_status: "readback_verified",
    metadata: {
      ...(item.metadata || {}),
      readonly_check: { status: "passed" }
    }
  } : item;
  const readiness = evaluateMicroAppInstanceReadiness({
    bundle: {
      ...bundle,
      resources: (bundle.resources || []).map((resourceItem) =>
        resourceItem.resource_type === "micro_app_instance" ? normalizedItem : resourceItem
      )
    },
    mockReady
  });
  const fieldChecks = readiness.outputSummary.createEvidence || {};
  const fieldContractStatus = Object.values({
    fieldNameVerified: fieldChecks.fieldNameVerified === true,
    fieldTypeVerified: fieldChecks.fieldTypeVerified === true,
    applicabilityVerified: fieldChecks.applicabilityVerified === true,
    longIdTransportVerified: fieldChecks.longIdTransportVerified === true
  }).every(Boolean) ? "verified" : "incomplete";
  const blockers = targetReady ? [] : [
    ...(readiness.blockers || []),
    ...(eligibility.blockers || []),
    ...(!appCandidate.app_id ? ["micro_app_platform_app_missing"] : []),
    ...(appCandidate.candidate_instance_id_present && !candidateInstanceId ? ["micro_app_candidate_missing"] : [])
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
    target_instance_id_present: Boolean(candidateInstanceId),
    target_visible: targetReady || item.visibility_status === "visible",
    target_readback_verified: targetReady || item.readback_status === "readback_verified",
    readonly_status: status,
    eligibility_source: eligibilitySource,
    optimized_goal_readonly_status: eligibility.probe?.status || eligibility.summary?.status || "not_called",
    optimized_goal_endpoint: eligibility.probe?.endpoint || "event_manager/optimized_goal/get",
    optimized_goal_http_status: eligibility.probe?.httpStatus ?? null,
    optimized_goal_api_code: eligibility.probe?.apiCode || "",
    optimized_goal_request_id_present: Boolean(eligibility.probe?.requestIdPresent),
    optimized_goal_response_hash_present: Boolean(eligibility.probe?.responseHash),
    optimized_goal_response_hash: eligibility.probe?.responseHash || "",
    optimized_goal_summary_hash: hashValue(eligibility.summary || {}),
    optimized_goal_count: Number(eligibility.summary?.goalCount || 0),
    objective_found: eligibility.summary?.externalActionFound === true,
    deep_objective_found: eligibility.summary?.deepExternalActionFound === true,
    event_asset_referenced: eligibility.summary?.assetIdReferenced === true,
    field_contract_status: fieldContractStatus,
    field_name_verified: evidence.field_name_verified === true,
    field_type_verified: fieldChecks.fieldTypeVerified === true,
    applicability_verified: fieldChecks.applicabilityVerified === true,
    long_id_transport_verified: fieldChecks.longIdTransportVerified === true,
    node4_resource_ready: targetReady,
    node5_create_transport_blocked: fieldChecks.longIdTransportVerified !== true,
    payload_field: "project.instance_id",
    material_account_route_allowed: false,
    material_account_route_reason: "micro_app_instance_is_target_account_asset_not_material_account_asset",
    platform_write_called: false,
    no_real_platform_write: true,
    no_token_refresh: true,
    next_action: targetReady
      ? "进入 Node 5 创建字段传输合同校验"
      : "运行目标账户小游戏实例只读核验。"
  });
  const evidenceRef = await writeEvidence(repo, bundle, outputSummary);

  if (item.resource_type) {
    await repo.updateAccountResourceReadonly({
      routeId: bundle.job.route_id,
      gameCode: bundle.job.game_code,
      advertiserId: bundle.job.advertiser_id,
      resourceType: "micro_app_instance",
      visibilityStatus: targetReady ? "visible" : undefined,
      readbackStatus: targetReady ? "readback_verified" : undefined,
      platformResourceId: targetReady ? candidateInstanceId : undefined,
      metadata: {
        status,
        key: "micro_app_instance_optimized_goal_readonly",
        gap: targetReady ? "" : [...new Set(blockers)].join(","),
        next_action: outputSummary.next_action,
        checked_at: new Date().toISOString(),
        evidence_refs: [evidenceRef],
        request_id_present: outputSummary.optimized_goal_request_id_present,
        response_hash_present: outputSummary.optimized_goal_response_hash_present
      },
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
