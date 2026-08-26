import { createHash } from "node:crypto";
import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import { createOceanEngineReadonlyClient } from "../src/platforms/oceanengineReadonlyClient.mjs";

const ROUTE_ID = "oceanengine_3_byte_mini_game";
const GAME_CODE = "JSZC";
const ADVERTISER_ID = "1871922175825993";
const DEFAULT_ASSET_ID = "LPA-JSZC-OE3-BACKUP-001";
const OPTIMIZED_GOAL_ENDPOINT = "/open_api/v3.0/event_manager/optimized_goal/get/";

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function clean(value) {
  return String(value ?? "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function resource(resources = [], type) {
  return asArray(resources).find((item) => item.resource_type === type) || {};
}

function metadataValue(source = {}, paths = []) {
  for (const dotted of paths) {
    let cursor = source;
    for (const part of dotted.split(".")) cursor = cursor?.[part];
    if (cursor !== undefined && cursor !== null && cursor !== "") return cursor;
  }
  return "";
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
  return [...new Set(found)];
}

function containsUrl(value = {}) {
  return /https?:\/\//i.test(JSON.stringify(value));
}

function summarizeOptimizedGoal(payload = {}, expected = {}) {
  const assetTypes = allValuesByKey(payload, ["asset_types", "asset_type"]).flatMap((item) => {
    try {
      const parsed = JSON.parse(item);
      return Array.isArray(parsed) ? parsed.map(clean) : [clean(parsed)];
    } catch {
      return [clean(item)];
    }
  }).filter(Boolean);
  const siteIds = allValuesByKey(payload, ["site_id", "site_ids", "orange_site_id"]);
  const siteNames = allValuesByKey(payload, ["site_name", "orange_site_name"]);
  const externalActions = allValuesByKey(payload, ["external_action"]);
  const deepExternalActions = allValuesByKey(payload, ["deep_external_action"]);
  return {
    goalCount: allValuesByKey(payload, ["optimization_name", "external_action"]).length,
    expectedObjectiveFound: externalActions.includes(expected.objective),
    expectedDeepObjectiveFound: deepExternalActions.includes(expected.deepObjective),
    orangeAssetTypeFound: assetTypes.includes("ORANGE"),
    thirdpartyAssetTypeFound: assetTypes.includes("THIRDPARTY"),
    byteGameAssetTypeFound: assetTypes.includes("MINI_PROGRAM") || assetTypes.includes("BYTE_GAME"),
    siteIdFound: siteIds.includes(expected.siteId),
    siteNameFound: siteNames.includes(expected.siteName),
    directUrlPresentInReadonlyResponse: containsUrl(payload)
  };
}

function buildCommonQuery(context = {}) {
  const raw = context.defaults?.raw_defaults || {};
  const payloadDefaults = raw.payload_defaults || {};
  const project = payloadDefaults.project || {};
  const strategy = payloadDefaults.strategy || {};
  const eventAsset = resource(context.resources, "event_asset");
  const microApp = resource(context.resources, "micro_app_instance");
  return {
    advertiser_id: ADVERTISER_ID,
    landing_type: clean(project.landing_type),
    ad_type: clean(project.ad_type),
    delivery_mode: clean(project.delivery_mode),
    delivery_type: clean(strategy.delivery_type),
    marketing_goal: clean(project.marketing_goal),
    delivery_medium: clean(strategy.delivery_medium),
    micro_promotion_type: clean(strategy.micro_promotion_type),
    mini_program_id: clean(context.platformApp?.app_id),
    micro_app_instance_id: clean(metadataValue(microApp, ["metadata.micro_app_instance_id", "metadata.instance_id", "platform_resource_id"])),
    asset_id: clean(eventAsset.platform_resource_id)
  };
}

async function main() {
  const repo = new PostgresRepository();
  const context = await repo.getCoreContext({
    routeId: ROUTE_ID,
    gameCode: GAME_CODE,
    advertiserId: ADVERTISER_ID
  });
  const candidates = await repo.getBackupLandingPageCandidates({
    routeId: ROUTE_ID,
    gameCode: GAME_CODE
  });
  const candidate = asArray(candidates).find((item) => item.landing_page_asset_id === DEFAULT_ASSET_ID);
  if (!candidate) throw new Error("default_backup_landing_page_candidate_missing");

  const expected = {
    objective: clean(context.defaults?.objective || context.defaults?.raw_defaults?.payload_defaults?.conversion?.external_action),
    deepObjective: clean(context.defaults?.deep_objective || context.defaults?.raw_defaults?.payload_defaults?.conversion?.deep_external_action),
    siteId: clean(candidate.site_id),
    siteName: clean(candidate.site_name)
  };
  const query = buildCommonQuery(context);
  const client = createOceanEngineReadonlyClient();
  const optimizedGoalProbe = await client.get({
    label: "backup_landing_page_optimized_goal_linkage",
    endpoint: OPTIMIZED_GOAL_ENDPOINT,
    query,
    summarize: (payload) => summarizeOptimizedGoal(payload, expected)
  });

  const summary = optimizedGoalProbe.summary || {};
  const status = optimizedGoalProbe.status === "passed" &&
    summary.expectedObjectiveFound === true &&
    summary.expectedDeepObjectiveFound === true
    ? "blocked_backend_landing_linkage_contract_not_materialized"
    : "blocked_optimized_goal_contract_not_verified";
  const evidenceId = `EV-OE3-BACKUP-LANDING-OPTIMIZED-GOAL-${ADVERTISER_ID}-${candidate.site_id}`;
  const evidenceSummary = [
    `status=${status}`,
    `asset_id=${DEFAULT_ASSET_ID}`,
    `site_id=${candidate.site_id}`,
    `optimized_goal_status=${optimizedGoalProbe.status}`,
    `optimized_goal_api_code=${optimizedGoalProbe.apiCode || "none"}`,
    `request_id_present=${Boolean(optimizedGoalProbe.requestIdPresent)}`,
    `objective_found=${Boolean(summary.expectedObjectiveFound)}`,
    `deep_objective_found=${Boolean(summary.expectedDeepObjectiveFound)}`,
    `orange_asset_type_found=${Boolean(summary.orangeAssetTypeFound)}`,
    `direct_url_expected=false`,
    `direct_url_present=${Boolean(summary.directUrlPresentInReadonlyResponse)}`,
    `raw_response_stored=false`,
    `full_url_stored=false`
  ].join("; ");

  await repo.upsertEvidence({
    artifactId: evidenceId,
    jobId: null,
    artifactType: "backup_landing_page_optimized_goal_linkage",
    title: "OE3 backup landing page optimized goal linkage",
    summary: evidenceSummary,
    contentHash: sha256(JSON.stringify({
      status,
      siteId: candidate.site_id,
      optimizedGoalResponseHash: optimizedGoalProbe.responseHash || "",
      summary
    })),
    storageRef: `postgres:mwb.evidence_artifacts/${evidenceId}`,
    sourceRef: `oceanengine:${OPTIMIZED_GOAL_ENDPOINT}`,
    sourceUsage: "runtime_truth"
  });

  await repo.upsertAccountResourceReadonlyBySourceAsset({
    routeId: ROUTE_ID,
    gameCode: GAME_CODE,
    advertiserId: ADVERTISER_ID,
    resourceType: "backup_landing_page",
    sourceAssetId: DEFAULT_ASSET_ID,
    resourceName: clean(candidate.site_name),
    platformResourceId: clean(candidate.site_id),
    visibilityStatus: "needs_confirmation",
    readbackStatus: "needs_confirmation",
    required: true,
    metadata: {
      key: "backup_landing_page_optimized_goal_linkage",
      status,
      gap: status,
      next_action: "固化媒体后台自动联动的橙子落地页字段合同；不要拼接或要求人工提供直接 URL",
      evidence_refs: [evidenceId],
      site_id: clean(candidate.site_id),
      site_name: clean(candidate.site_name),
      direct_url_expected: false
    },
    resourceMetadata: {
      site_id: clean(candidate.site_id),
      site_name: clean(candidate.site_name),
      landing_page_asset_id: DEFAULT_ASSET_ID,
      url_hash: ""
    }
  });

  console.log(JSON.stringify({
    status,
    routeId: ROUTE_ID,
    gameCode: GAME_CODE,
    advertiserId: ADVERTISER_ID,
    landingPageAssetId: DEFAULT_ASSET_ID,
    siteId: clean(candidate.site_id),
    siteName: clean(candidate.site_name),
    optimizedGoalProbe: {
      status: optimizedGoalProbe.status,
      httpStatus: optimizedGoalProbe.httpStatus,
      apiCode: optimizedGoalProbe.apiCode || "",
      requestIdPresent: optimizedGoalProbe.requestIdPresent,
      responseHashPresent: Boolean(optimizedGoalProbe.responseHash),
      summary
    },
    directUrlExpected: false,
    directUrlStored: false,
    nextGate: "resolve_backend_landing_linkage_contract_before_fresh_job"
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    status: "failed",
    error: clean(error.message || error.name || "unknown_error")
  }, null, 2));
  process.exitCode = 1;
});
