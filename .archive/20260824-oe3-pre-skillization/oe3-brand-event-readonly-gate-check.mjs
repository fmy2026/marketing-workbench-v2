import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { PostgresRepository, sqlJson, sqlLiteral } from "../src/repositories/postgresRepository.mjs";
import { createOceanEngineReadonlyClient } from "../src/platforms/oceanengineReadonlyClient.mjs";

const TARGET_JOB_ID = "JOB-MWBV2-20260824014546-851B76";
const EXPECTED_BRAND_NAME = "巨兽战场";
const EXPECTED_INDUSTRY_KEYWORDS = ["游戏", "SLG"];
const EXPECTED_OBJECTIVE = "AD_CONVERT_TYPE_PAY";
const EXPECTED_DEEP_OBJECTIVE = "AD_CONVERT_TYPE_PURCHASE_ROI_7D";
const EXPECTED_DEEP_BID_TYPE = "PER_AND_SEVEN_PAY_ROI";
const EVENT_ASSET_TYPE = "MINI_PROGRAME";
const MICRO_PROMOTION_TYPE = "BYTE_GAME";
const EVENT_AVAILABLE_ENDPOINT = "https://ad.oceanengine.com/open_api/2/event_manager/available_events/get/";
const EVENT_CONFIGS_ENDPOINT = "https://ad.oceanengine.com/open_api/2/event_manager/event_configs/get/";

const repo = new PostgresRepository();
const client = createOceanEngineReadonlyClient();

function clean(value) {
  return String(value ?? "").trim();
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function arrayFrom(value) {
  return Array.isArray(value) ? value : [];
}

function findResource(bundle, type) {
  return (bundle.resources || []).find((item) => item.resource_type === type) || {};
}

function firstValueByKey(value, keys) {
  const wanted = new Set(keys);
  const found = [];
  function walk(item) {
    if (!item || typeof item !== "object") return;
    if (Array.isArray(item)) {
      item.forEach(walk);
      return;
    }
    Object.entries(item).forEach(([key, child]) => {
      if (wanted.has(key) && clean(child)) found.push(clean(child));
      walk(child);
    });
  }
  walk(value);
  return found[0] || "";
}

function allValuesByKey(value, keys) {
  const wanted = new Set(keys);
  const found = [];
  function walk(item) {
    if (!item || typeof item !== "object") return;
    if (Array.isArray(item)) {
      item.forEach(walk);
      return;
    }
    Object.entries(item).forEach(([key, child]) => {
      if (wanted.has(key) && clean(child)) found.push(clean(child));
      walk(child);
    });
  }
  walk(value);
  return [...new Set(found)];
}

function eventList(payload = {}) {
  return [
    ...arrayFrom(payload?.data?.event_configs),
    ...arrayFrom(payload?.data?.events),
    ...arrayFrom(payload?.data?.list),
    ...arrayFrom(payload?.event_configs)
  ];
}

function eventAssetList(payload = {}) {
  return [
    ...arrayFrom(payload?.data?.asset_list),
    ...arrayFrom(payload?.data?.list),
    ...arrayFrom(payload?.asset_list)
  ];
}

function normalizeEventAsset(asset = {}) {
  return {
    asset_id: clean(asset.asset_id || asset.id),
    asset_name: clean(asset.asset_name || asset.name),
    asset_type: clean(asset.asset_type || asset.type),
    app_id: firstValueByKey(asset, ["app_id", "mini_program_id", "mini_program_app_id"]),
    micro_app_instance_id: firstValueByKey(asset, ["instance_id", "micro_app_instance_id"]),
    advertiser_id: firstValueByKey(asset, ["advertiser_id", "account_id"])
  };
}

function brandList(payload = {}) {
  const data = payload.data || {};
  if (Array.isArray(data.brand_list)) return data.brand_list;
  if (Array.isArray(data.list)) return data.list;
  if (Array.isArray(payload.brand_list)) return payload.brand_list;
  return [];
}

function brandMatchesExpected(item = {}) {
  return clean(item.merge_brand_name || item.brand_name || item.brand_full_name) === EXPECTED_BRAND_NAME &&
    clean(item.available_status || item.status || "VALID") === "VALID";
}

function outerBrandIdFromBrand(item = {}) {
  return clean(item.yuntu_brand_detail?.outer_brand_id || item.outer_brand_id);
}

function summarizeBrand(payload = {}) {
  const matches = brandList(payload).filter(brandMatchesExpected);
  const brand = matches[0] || {};
  return {
    matchedCount: matches.length,
    uniqueValidMatched: matches.length === 1,
    brandNameId: outerBrandIdFromBrand(brand),
    cdpBrandId: clean(brand.merge_brand_id),
    cdpBrandName: clean(brand.merge_brand_name || brand.brand_name),
    availableStatus: clean(brand.available_status || brand.status || "")
  };
}

function flattenIndustryNodes(value, path = []) {
  if (Array.isArray(value)) return value.flatMap((item) => flattenIndustryNodes(item, path));
  if (!value || typeof value !== "object") return [];
  const name = clean(value.industry_name || value.category_name || value.name);
  const id = clean(value.industry_id || value.category_id);
  const nextPath = name ? [...path, name] : path;
  const current = id ? [{ id, name, pathText: nextPath.join(" / ") }] : [];
  return [
    ...current,
    ...flattenIndustryNodes(value.sub_industry_info, nextPath),
    ...flattenIndustryNodes(value.children, nextPath),
    ...flattenIndustryNodes(value.industry_info, nextPath)
  ];
}

function summarizeIndustry(payload = {}) {
  const nodes = flattenIndustryNodes(payload?.data?.industry_info || payload?.data?.list || payload?.data || payload);
  const text = JSON.stringify(payload?.data || {});
  const matched = nodes.find((item) => EXPECTED_INDUSTRY_KEYWORDS.every((keyword) => item.pathText.includes(keyword)))
    || nodes.find((item) => item.name === EXPECTED_INDUSTRY_KEYWORDS.at(-1))
    || null;
  return {
    nodeCount: nodes.length,
    industryMatched: EXPECTED_INDUSTRY_KEYWORDS.every((keyword) => text.includes(keyword)) || Boolean(matched),
    industryId: clean(matched?.id || firstValueByKey(payload?.data, ["industry_id", "category_id"])),
    industryPath: clean(matched?.pathText)
  };
}

function summarizeEventAssetDetail(payload = {}, expected = {}) {
  const assets = eventAssetList(payload).map(normalizeEventAsset);
  const target = assets.find((asset) => asset.asset_id === clean(expected.eventAssetId)) || assets[0] || {};
  return {
    assetCount: assets.length,
    targetAssetFound: Boolean(target.asset_id && target.asset_id === clean(expected.eventAssetId)),
    assetType: clean(target.asset_type),
    assetTypeMatches: clean(target.asset_type) === EVENT_ASSET_TYPE,
    appMatched: !target.app_id || target.app_id === clean(expected.appId),
    microAppMatched: !target.micro_app_instance_id || target.micro_app_instance_id === clean(expected.microAppInstanceId),
    advertiserMatched: !target.advertiser_id || target.advertiser_id === clean(expected.advertiserId)
  };
}

function summarizeEvents(payload = {}) {
  const events = eventList(payload);
  const trackTypes = allValuesByKey(payload, ["track_type", "track_types", "event_type"]).join(" ");
  const eventText = JSON.stringify(events);
  const miniProgramApiFound = /MINI_PROGRAME_API|MINI_PROGRAM_API/i.test(`${trackTypes} ${eventText}`);
  return {
    eventCount: events.length,
    miniProgramApiFound,
    payEventFound: /PAY|付费|purchase/i.test(eventText),
    roiEventFound: /ROI|PURCHASE_ROI|7D/i.test(eventText)
  };
}

function summarizeOptimizedGoal(payload = {}) {
  const externalActions = allValuesByKey(payload, ["external_action"]);
  const deepExternalActions = allValuesByKey(payload, ["deep_external_action"]);
  return {
    goalCount: allValuesByKey(payload, ["optimization_name", "external_action"]).length,
    externalActionFound: externalActions.includes(EXPECTED_OBJECTIVE),
    deepExternalActionFound: deepExternalActions.includes(EXPECTED_DEEP_OBJECTIVE),
    expectedObjective: EXPECTED_OBJECTIVE,
    expectedDeepObjective: EXPECTED_DEEP_OBJECTIVE
  };
}

function summarizeDbt(payload = {}) {
  const values = allValuesByKey(payload, ["deep_bid_type"]);
  return {
    deepBidTypeCount: values.length,
    expectedDeepBidTypeFound: values.includes(EXPECTED_DEEP_BID_TYPE),
    expectedDeepBidType: EXPECTED_DEEP_BID_TYPE
  };
}

function gateStatus(probe, predicate) {
  if (probe.status !== "passed") return "blocked";
  return predicate(probe.summary || {}) ? "passed" : "blocked";
}

function evidenceSummary(probe, gateStatusValue) {
  const summary = probe.summary || {};
  return [
    `gate=${probe.label}`,
    `gate_status=${gateStatusValue}`,
    `endpoint=${probe.endpoint}`,
    `http=${probe.httpStatus ?? "none"}`,
    `api_code=${probe.apiCode || "none"}`,
    `request_id_present=${Boolean(probe.requestIdPresent)}`,
    `data_present=${Boolean(probe.dataPresent)}`,
    `summary_hash=sha256:${sha256(JSON.stringify(summary))}`,
    `response_hash_present=${Boolean(probe.responseHash)}`
  ].join("; ");
}

function publicGate(gate) {
  return {
    gate: gate.gate,
    status: gate.status,
    endpoint: gate.probe.endpoint,
    httpStatus: gate.probe.httpStatus,
    apiCode: gate.probe.apiCode,
    requestIdPresent: gate.probe.requestIdPresent,
    dataPresent: gate.probe.dataPresent,
    evidenceRef: gate.evidenceRef,
    conclusion: gate.conclusion,
    nextAction: gate.nextAction,
    summary: gate.probe.summary
  };
}

function assertNoSensitiveLeak(value) {
  const text = JSON.stringify(value);
  [
    /touchpoint_url/i,
    /raw_payload/i,
    /raw_response/i,
    /tf-api\.3k\.com/i,
    /callback\/click/i,
    /\bcookie\b/i,
    /OCEANENGINE_ACCESS_TOKEN/i,
    /OCEANENGINE_REFRESH_TOKEN/i,
    /OCEANENGINE_APP_SECRET/i,
    /Access-Token/i,
    /Bearer\s+[A-Za-z0-9._-]{20,}/i
  ].forEach((pattern) => {
    if (pattern.test(text)) throw new Error(`sensitive leak matched ${pattern}`);
  });
}

async function psql(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn("psql", [
      "-X",
      "-d",
      "marketing_workbench_v2",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      String(sql).replace(/\s+/g, " ").trim()
    ], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.trim() || `psql exited with ${code}`));
    });
  });
}

async function psqlJson(sql) {
  const output = await psql(`COPY (${sql}) TO STDOUT;`);
  return JSON.parse(output.trim() || "null");
}

async function updateResourceGateMetadata(bundle, resourceType, readonlyCheck) {
  await psql(`
    UPDATE mwb.account_resources
    SET metadata = metadata || jsonb_build_object(
          'readonly_check', (coalesce(metadata->'readonly_check', '{}'::jsonb) || ${sqlJson(readonlyCheck)}::jsonb),
          'oe3_brand_event_gate', ${sqlJson(readonlyCheck)}::jsonb
        ),
        updated_at = now()
    WHERE route_id = ${sqlLiteral(bundle.job.route_id)}
      AND game_code = ${sqlLiteral(bundle.job.game_code)}
      AND advertiser_id = ${sqlLiteral(bundle.job.advertiser_id)}
      AND resource_type = ${sqlLiteral(resourceType)};
  `);
}

async function updateNodeGateOutput(jobId, gateSummary) {
  await psql(`
    UPDATE mwb.launch_node_runs
    SET output_summary = output_summary || jsonb_build_object('oe3BrandEventReadonlyGate', ${sqlJson(gateSummary)}::jsonb)
    WHERE job_id = ${sqlLiteral(jobId)}
      AND node_key IN ('account_resource_prepare', 'std_project_create_executor');
  `);
}

async function protectedJobState() {
  return psqlJson(`
    SELECT jsonb_build_object(
      'jobStatus', job_status,
      'currentNode', current_node,
      'platformActions', (
        SELECT count(*)
        FROM mwb.platform_actions
        WHERE job_id = '${TARGET_JOB_ID}'
      ),
      'createdObjects', (
        SELECT count(*)
        FROM mwb.created_objects
        WHERE job_id = '${TARGET_JOB_ID}'
      )
    )::text
    FROM mwb.launch_jobs
    WHERE job_id = '${TARGET_JOB_ID}'
  `);
}

async function run() {
  const before = await protectedJobState();
  const bundle = await repo.getLaunchJobBundle(TARGET_JOB_ID);
  assert(bundle?.job?.job_id === TARGET_JOB_ID, "target_job_not_found");

  const advertiserId = clean(bundle.job.advertiser_id);
  const eventAsset = findResource(bundle, "event_asset");
  const microApp = findResource(bundle, "micro_app_instance");
  const eventAssetId = clean(eventAsset.platform_resource_id);
  const microAppInstanceId = clean(microApp.platform_resource_id || microApp.metadata?.micro_app_instance_id || microApp.metadata?.instance_id);
  const appId = clean(bundle.platformApp?.app_id || bundle.draft?.payload_summary?.platform_app_id);
  assert(/^\d+$/.test(eventAssetId), "event_asset_platform_resource_id_missing_or_not_numeric");

  const brandFuzzy = await client.get({
    label: "brand_fuzzy",
    endpoint: "/open_api/v3.0/dpa/brand/adv_auth/fuzzy/get/",
    query: {
      account_id: advertiserId,
      brand_name: EXPECTED_BRAND_NAME,
      match_type: "EXACT",
      brand_data_source_list: JSON.stringify(["YUNTU"]),
      page: "1",
      page_size: "20"
    },
    summarize: summarizeBrand
  });
  const brandNameId = clean(brandFuzzy.summary?.brandNameId || bundle.draft?.payload_summary?.brand_info?.brand_name_id);

  const brandIndustry = await client.get({
    label: "brand_industry",
    endpoint: "/open_api/v3.0/dpa/brand/adv_auth/industry/get/",
    query: {
      account_id: advertiserId,
      origin_req: JSON.stringify({
        brand_data_source: "YUNTU",
        outer_brand_id: brandNameId
      })
    },
    summarize: summarizeIndustry
  });

  const eventAssetDetail = await client.get({
    label: "event_asset_detail",
    endpoint: "tools/event/all_assets/detail",
    query: {
      advertiser_id: advertiserId,
      asset_ids: JSON.stringify([Number(eventAssetId)])
    },
    summarize: (payload) => summarizeEventAssetDetail(payload, { eventAssetId, appId, microAppInstanceId, advertiserId })
  });

  const availableEvents = await client.get({
    label: "available_events",
    endpoint: EVENT_AVAILABLE_ENDPOINT,
    query: {
      advertiser_id: advertiserId,
      asset_id: eventAssetId
    },
    summarize: summarizeEvents
  });

  const eventConfigs = await client.get({
    label: "event_configs",
    endpoint: EVENT_CONFIGS_ENDPOINT,
    query: {
      advertiser_id: advertiserId,
      asset_id: eventAssetId
    },
    summarize: summarizeEvents
  });

  const optimizedGoal = await client.get({
    label: "optimized_goal",
    endpoint: "/open_api/v3.0/event_manager/optimized_goal/get/",
    query: {
      advertiser_id: advertiserId,
      landing_type: "MICRO_GAME",
      ad_type: "ALL",
      delivery_mode: "PROCEDURAL",
      marketing_goal: "VIDEO_AND_IMAGE",
      delivery_medium: "BYTE_GAME",
      micro_promotion_type: MICRO_PROMOTION_TYPE,
      mini_program_id: appId,
      micro_app_instance_id: microAppInstanceId,
      asset_id: eventAssetId
    },
    summarize: summarizeOptimizedGoal
  });

  const dbt = await client.get({
    label: "dbt",
    endpoint: "/open_api/v3.0/event_manager/dbt/get/",
    query: {
      advertiser_id: advertiserId,
      external_action: EXPECTED_OBJECTIVE,
      deep_external_action: EXPECTED_DEEP_OBJECTIVE,
      landing_type: "MICRO_GAME",
      ad_type: "ALL",
      delivery_mode: "PROCEDURAL",
      marketing_goal: "VIDEO_AND_IMAGE",
      delivery_medium: "BYTE_GAME",
      micro_promotion_type: MICRO_PROMOTION_TYPE,
      mini_program_id: appId,
      micro_app_instance_id: microAppInstanceId,
      asset_id: eventAssetId
    },
    summarize: summarizeDbt
  });

  const gateDefinitions = [
    {
      gate: "brand_fuzzy",
      probe: brandFuzzy,
      status: gateStatus(brandFuzzy, (summary) => summary.uniqueValidMatched && summary.brandNameId && summary.cdpBrandId && summary.cdpBrandName === EXPECTED_BRAND_NAME),
      conclusion: "唯一 VALID 巨兽战场品牌可投检查",
      nextAction: "如失败，修 brand_fuzzy 参数、权限或品牌映射"
    },
    {
      gate: "brand_industry",
      probe: brandIndustry,
      status: gateStatus(brandIndustry, (summary) => summary.industryMatched && summary.industryId),
      conclusion: "fresh target-account 行业必须命中 游戏 / SLG",
      nextAction: "如失败，修 brand_industry 参数、权限或行业映射"
    },
    {
      gate: "event_asset_detail",
      probe: eventAssetDetail,
      status: gateStatus(eventAssetDetail, (summary) => summary.targetAssetFound && summary.assetTypeMatches && summary.appMatched && summary.advertiserMatched),
      conclusion: "目标账户 MINI_PROGRAME event asset detail",
      nextAction: "如失败，先修事件资产映射或目标账户资产"
    },
    {
      gate: "available_events",
      probe: availableEvents,
      status: gateStatus(availableEvents, (summary) => summary.eventCount > 0 && summary.miniProgramApiFound),
      conclusion: "目标事件资产可创建 MINI_PROGRAME_API 事件",
      nextAction: "如失败，停止在 event configs 前，补事件链能力"
    },
    {
      gate: "event_configs",
      probe: eventConfigs,
      status: gateStatus(eventConfigs, (summary) => summary.eventCount > 0 && summary.miniProgramApiFound),
      conclusion: "目标事件资产已有事件配置",
      nextAction: "如失败，准备 event configs 补齐任务，仍禁止本任务创建"
    },
    {
      gate: "optimized_goal",
      probe: optimizedGoal,
      status: gateStatus(optimizedGoal, (summary) => summary.externalActionFound && summary.deepExternalActionFound),
      conclusion: "优化目标支持 PAY + 7D ROI",
      nextAction: "如失败，检查事件配置和 optimized_goal 参数"
    },
    {
      gate: "dbt",
      probe: dbt,
      status: gateStatus(dbt, (summary) => summary.expectedDeepBidTypeFound),
      conclusion: "深度优化方式支持 PER_AND_SEVEN_PAY_ROI",
      nextAction: "如失败，检查 optimized_goal/dbt 参数或事件配置"
    }
  ];

  const gates = [];
  for (const gate of gateDefinitions) {
    const evidenceRef = `EV-${TARGET_JOB_ID}-OE3-BRAND-EVENT-GATE-${gate.gate.toUpperCase()}`;
    await repo.upsertEvidence({
      artifactId: evidenceRef,
      jobId: TARGET_JOB_ID,
      artifactType: "oe3_brand_event_readonly_gate",
      title: `OE3 brand/event readonly gate ${gate.gate}`,
      summary: evidenceSummary(gate.probe, gate.status),
      contentHash: gate.probe.responseHash || `sha256:${sha256(evidenceSummary(gate.probe, gate.status))}`,
      storageRef: `postgres:mwb.evidence_artifacts/${evidenceRef}`,
      sourceRef: `oceanengine:${gate.probe.endpoint}`,
      sourceUsage: "runtime_truth"
    });
    gates.push({ ...gate, evidenceRef });
  }

  const gateSummary = {
    status: gates.every((gate) => gate.status === "passed") ? "passed" : "blocked",
    checkedAt: new Date().toISOString(),
    gates: gates.map(publicGate),
    noPlatformWrite: true,
    noTokenRefresh: true,
    targetJobId: TARGET_JOB_ID
  };
  assertNoSensitiveLeak(gateSummary);

  const brandGate = gates.find((gate) => gate.gate === "brand_industry");
  const eventGateBlocked = gates.some((gate) => ["event_asset_detail", "available_events", "event_configs", "optimized_goal", "dbt"].includes(gate.gate) && gate.status !== "passed");
  await updateResourceGateMetadata(bundle, "brand_info", {
    status: brandGate?.status || "blocked",
    key: "oe3_brand_event_readonly_gate",
    gate_status: gateSummary.status,
    gate_focus: "brand_info",
    evidence_refs: gates.filter((gate) => gate.gate.startsWith("brand_")).map((gate) => gate.evidenceRef),
    next_action: brandGate?.status === "passed" ? "无需动作" : "修 brand_industry fresh readback",
    checked_at: gateSummary.checkedAt
  });
  await updateResourceGateMetadata(bundle, "event_asset", {
    status: eventGateBlocked ? "blocked" : "passed",
    key: "oe3_brand_event_readonly_gate",
    gate_status: gateSummary.status,
    gate_focus: "event_chain",
    evidence_refs: gates.filter((gate) => !gate.gate.startsWith("brand_")).map((gate) => gate.evidenceRef),
    next_action: eventGateBlocked ? "补事件链配置或修只读参数" : "无需动作",
    checked_at: gateSummary.checkedAt
  });
  await updateNodeGateOutput(TARGET_JOB_ID, {
    status: gateSummary.status,
    checkedAt: gateSummary.checkedAt,
    gateStatuses: Object.fromEntries(gates.map((gate) => [gate.gate, gate.status])),
    evidenceRefs: gates.map((gate) => gate.evidenceRef),
    nextGate: brandGate?.status !== "passed"
      ? "修 brand_industry readback"
      : eventGateBlocked
        ? "补事件链配置或修只读参数"
        : "进入 std_project/create payload official diff"
  });

  const after = await protectedJobState();
  assert(before.jobStatus === after.jobStatus, "target job_status changed");
  assert(before.currentNode === after.currentNode, "target current_node changed");
  assert(before.platformActions === after.platformActions && after.platformActions === 1, "platform_actions changed");
  assert(before.createdObjects === after.createdObjects && after.createdObjects === 0, "created_objects changed");

  const result = {
    status: gateSummary.status,
    targetJobId: TARGET_JOB_ID,
    targetJobStatus: after.jobStatus,
    targetCurrentNode: after.currentNode,
    platformActions: after.platformActions,
    createdObjects: after.createdObjects,
    noPlatformWrite: true,
    noTokenRefresh: true,
    gates: gates.map(publicGate),
    nextGate: gateSummary.status === "passed"
      ? "brand + event 全通过；下一步进入 std_project/create payload official diff，不直接重试创建。"
      : brandGate?.status !== "passed"
        ? "修 brand_industry readback。"
        : "补事件链配置或修事件链只读参数。"
  };
  assertNoSensitiveLeak(result);
  console.log(JSON.stringify(result, null, 2));
}

await run();
