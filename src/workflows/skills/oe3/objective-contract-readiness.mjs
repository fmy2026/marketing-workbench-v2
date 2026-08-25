import { createOceanEngineReadonlyClient } from "../../../platforms/oceanengineReadonlyClient.mjs";
import { hashValue, sanitizeForPublic } from "./contracts.mjs";
import { readonlyPermissionState } from "./readonly-permission.mjs";
import { clean, eventChainPassed, resource, resourceReady } from "./resource-verifiers.mjs";

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
  return [...new Set(found)];
}

function routePayloadConfig(bundle = {}) {
  const raw = bundle.defaults?.raw_defaults || {};
  return {
    payloadDefaults: raw.payload_defaults || {},
    contractMapping: raw.contract_mapping || {}
  };
}

function metadataValue(source = {}, paths = []) {
  for (const dotted of paths) {
    let cursor = source;
    for (const part of dotted.split(".")) cursor = cursor?.[part];
    if (cursor !== undefined && cursor !== null && cursor !== "") return cursor;
  }
  return "";
}

function summarizeOptimizedGoal(payload = {}, expected = {}) {
  const externalActions = allValuesByKey(payload, ["external_action"]);
  const deepExternalActions = allValuesByKey(payload, ["deep_external_action"]);
  const assetIds = allValuesByKey(payload, ["asset_id", "asset_ids"]);
  return {
    goalCount: allValuesByKey(payload, ["optimization_name", "external_action"]).length,
    externalActionFound: externalActions.includes(expected.objective),
    deepExternalActionFound: deepExternalActions.includes(expected.deepObjective),
    assetIdReferenced: !assetIds.length || assetIds.includes(expected.assetId),
    expectedObjective: expected.objective,
    expectedDeepObjective: expected.deepObjective
  };
}

function summarizeDbt(payload = {}, expected = {}) {
  const values = allValuesByKey(payload, ["deep_bid_type"]);
  return {
    deepBidTypeCount: values.length,
    expectedDeepBidTypeFound: values.includes(expected.deepBidType),
    expectedDeepBidType: expected.deepBidType
  };
}

async function recordEvidence({ repo, bundle, gate, status, probe, summary }) {
  const artifactId = `EV-${bundle.job.job_id}-OBJECTIVE-CONTRACT-${gate.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;
  const evidenceSummary = [
    `gate=${gate}`,
    `status=${status}`,
    `endpoint=${probe?.endpoint || "not_called"}`,
    `api_code=${probe?.apiCode || "none"}`,
    `http=${probe?.httpStatus ?? "none"}`,
    `request_id_present=${Boolean(probe?.requestIdPresent)}`,
    `summary_hash=${hashValue(summary || {})}`,
    `response_hash_present=${Boolean(probe?.responseHash)}`,
    "response_body_stored=false"
  ].join("; ");
  await repo.upsertEvidence({
    artifactId,
    jobId: bundle.job.job_id,
    artifactType: "objective_contract_readiness",
    title: `OE3 objective contract readonly ${gate}`,
    summary: evidenceSummary,
    contentHash: probe?.responseHash || hashValue(evidenceSummary),
    storageRef: `postgres:mwb.evidence_artifacts/${artifactId}`,
    sourceRef: probe?.endpoint ? `oceanengine:${probe.endpoint}` : "postgres:mwb.account_resources",
    sourceUsage: bundle.job.source_usage || "runtime_truth"
  });
  return artifactId;
}

async function persistEventMetadata({ repo, bundle, status, evidenceRefs, blocker, mapping }) {
  if (bundle.job.source_usage === "test_run") return;
  await repo.updateAccountResourceReadonly({
    routeId: bundle.job.route_id,
    gameCode: bundle.job.game_code,
    advertiserId: bundle.job.advertiser_id,
    resourceType: "event_asset",
    visibilityStatus: status === "passed" ? "visible" : undefined,
    readbackStatus: status === "passed" ? "readback_verified" : undefined,
    metadata: {
      status,
      key: "oe3_optimized_goal_contract",
      gap: blocker || "",
      next_action: status === "passed" ? "无需动作" : "修正优化目标/深度目标/小游戏实例字段映射",
      checked_at: new Date().toISOString(),
      evidence_refs: evidenceRefs,
      contract_mapping: mapping
    },
    resourceMetadata: {
      std_project_create_readiness: {
        status,
        event_chain_status: status,
        optimized_goal_contract_status: status,
        next_action: status === "passed" ? "无需动作" : "修正优化目标合同只读阻断"
      }
    }
  });
}

function cachedResult({ item, status, source, evidenceRefs = [], mapping = {}, blocker = "" }) {
  const ready = status === "passed";
  return {
    status: ready ? "passed" : "blocked",
    blockers: ready ? [] : [blocker || "optimized_goal_contract_not_passed"],
    evidenceRefs,
    outputSummary: {
      resourceType: "event_asset",
      label: "事件资产",
      visibilityStatus: item.visibility_status || "missing",
      readbackStatus: item.readback_status || "missing",
      readonlyStatus: status,
      ready,
      platformResourceIdPresent: Boolean(item.platform_resource_id),
      objectiveContractStatus: status,
      objectiveContractSource: source,
      contractMapping: mapping,
      evidenceRefs,
      nextAction: ready ? "无需动作" : "修正优化目标/深度目标/小游戏实例字段映射"
    }
  };
}

export async function runObjectiveContractReadonlyGate({
  repo,
  bundle,
  client = createOceanEngineReadonlyClient(),
  mockReady = false,
  allowReadonlyDependency = false
} = {}) {
  const item = resource(bundle, "event_asset");
  const microApp = resource(bundle, "micro_app_instance");
  const { payloadDefaults, contractMapping } = routePayloadConfig(bundle);
  const mapping = {
    miniGameInstanceCreateFieldName: clean(contractMapping.mini_game_instance_create_field),
    optimizedGoalQueryInstanceFieldName: clean(contractMapping.optimized_goal_query_instance_field),
    optimizedGoalQueryAppFieldName: clean(contractMapping.optimized_goal_query_app_field)
  };
  const localReady = mockReady || resourceReady(item);
  const mappingReady = mapping.miniGameInstanceCreateFieldName === "instance_id" &&
    mapping.optimizedGoalQueryInstanceFieldName === "micro_app_instance_id" &&
    mapping.optimizedGoalQueryAppFieldName === "mini_program_id";
  if (!localReady || !mappingReady) {
    return sanitizeForPublic(cachedResult({
      item,
      status: "blocked",
      source: "postgres_precheck",
      mapping,
      blocker: !localReady ? "event_asset_not_ready" : "mini_game_instance_field_mapping_not_verified"
    }));
  }
  if (mockReady || (bundle.job.source_usage === "test_run" && eventChainPassed(bundle))) {
    return sanitizeForPublic(cachedResult({
      item,
      status: "passed",
      source: mockReady ? "mock_ready" : "postgres_readonly_metadata",
      mapping
    }));
  }

  const permission = readonlyPermissionState({ allowReadonlyDependency });
  if (!permission.allowed) {
    return sanitizeForPublic(cachedResult({
      item,
      status: eventChainPassed(bundle) ? "passed" : "blocked",
      source: "postgres_readonly_metadata",
      mapping,
      blocker: "readonly_permission_required"
    }));
  }

  const credential = client.credentialState();
  if (credential.status !== "ready") {
    return sanitizeForPublic({
      ...cachedResult({ item, status: "blocked", source: "credential_state", mapping, blocker: "credential_required" }),
      blockers: ["credential_required", ...(credential.blockers || [])]
    });
  }

  const advertiserId = clean(bundle.job.advertiser_id);
  const appId = clean(bundle.platformApp?.app_id || bundle.draft?.payload_summary?.platform_app_id);
  const eventAssetId = clean(item.platform_resource_id);
  const microAppInstanceId = clean(metadataValue(microApp, ["metadata.micro_app_instance_id", "metadata.instance_id", "platform_resource_id"]));
  const objective = clean(bundle.draft?.payload_summary?.objective || bundle.defaults?.objective);
  const deepObjective = clean(bundle.draft?.payload_summary?.deep_objective || bundle.defaults?.deep_objective);
  const deepBidType = clean(bundle.draft?.payload_summary?.deep_bid_type || bundle.defaults?.deep_bid_type);
  const project = payloadDefaults.project || {};
  const strategy = payloadDefaults.strategy || {};
  const commonQuery = {
    advertiser_id: advertiserId,
    landing_type: clean(project.landing_type),
    ad_type: clean(project.ad_type),
    delivery_mode: clean(project.delivery_mode),
    delivery_type: clean(strategy.delivery_type),
    marketing_goal: clean(project.marketing_goal),
    delivery_medium: clean(strategy.delivery_medium),
    micro_promotion_type: clean(strategy.micro_promotion_type),
    mini_program_id: appId,
    micro_app_instance_id: microAppInstanceId,
    asset_id: eventAssetId
  };
  const expected = { objective, deepObjective, deepBidType, assetId: eventAssetId };
  const optimizedGoalProbe = await client.get({
    label: "optimized_goal_contract",
    endpoint: "/open_api/v3.0/event_manager/optimized_goal/get/",
    query: commonQuery,
    summarize: (payload) => summarizeOptimizedGoal(payload, expected)
  });
  const dbtProbe = await client.get({
    label: "dbt_contract",
    endpoint: "/open_api/v3.0/event_manager/dbt/get/",
    query: {
      ...commonQuery,
      external_action: objective,
      deep_external_action: deepObjective
    },
    summarize: (payload) => summarizeDbt(payload, expected)
  });
  const optimizedPassed = optimizedGoalProbe.status === "passed" &&
    optimizedGoalProbe.summary?.externalActionFound === true &&
    optimizedGoalProbe.summary?.deepExternalActionFound === true;
  const dbtPassed = dbtProbe.status === "passed" &&
    dbtProbe.summary?.expectedDeepBidTypeFound === true;
  const status = optimizedPassed && dbtPassed ? "passed" : "blocked";
  const optimizedEvidence = await recordEvidence({
    repo,
    bundle,
    gate: "optimized_goal",
    status: optimizedPassed ? "passed" : "blocked",
    probe: optimizedGoalProbe,
    summary: optimizedGoalProbe.summary || {}
  });
  const dbtEvidence = await recordEvidence({
    repo,
    bundle,
    gate: "dbt",
    status: dbtPassed ? "passed" : "blocked",
    probe: dbtProbe,
    summary: dbtProbe.summary || {}
  });
  const evidenceRefs = [optimizedEvidence, dbtEvidence];
  await persistEventMetadata({
    repo,
    bundle,
    status,
    evidenceRefs,
    blocker: status === "passed" ? "" : "optimized_goal_or_dbt_contract_not_passed",
    mapping
  });
  return sanitizeForPublic({
    ...cachedResult({
      item,
      status,
      source: "oceanengine_readonly_probe",
      evidenceRefs,
      mapping,
      blocker: "optimized_goal_or_dbt_contract_not_passed"
    }),
    outputSummary: {
      ...cachedResult({ item, status, source: "oceanengine_readonly_probe", evidenceRefs, mapping }).outputSummary,
      optimizedGoalStatus: optimizedGoalProbe.status,
      dbtStatus: dbtProbe.status,
      optimizedGoalPassed: optimizedPassed,
      dbtPassed,
      requestIdPresent: Boolean(optimizedGoalProbe.requestIdPresent || dbtProbe.requestIdPresent)
    }
  });
}
