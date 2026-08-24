import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { PostgresRepository, sqlJson, sqlLiteral } from "../src/repositories/postgresRepository.mjs";
import { createOceanEngineReadonlyClient } from "../src/platforms/oceanengineReadonlyClient.mjs";

const TARGET_JOB_ID = "JOB-MWBV2-20260824014546-851B76";
const EXPECTED_BRAND_NAME = "巨兽战场";
const EXPECTED_INDUSTRY_KEYWORDS = ["游戏", "SLG"];

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

function brandList(payload = {}) {
  const data = payload.data || {};
  return [
    ...arrayFrom(data.brand_list),
    ...arrayFrom(data.list),
    ...arrayFrom(payload.brand_list)
  ];
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
    outerBrandId: outerBrandIdFromBrand(brand),
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

function gateStatus(probe, predicate) {
  if (probe.status !== "passed") return "blocked";
  return predicate(probe.summary || {}) ? "passed" : "blocked";
}

function publicProbe(probe, status) {
  return {
    label: probe.label,
    endpoint: probe.endpoint,
    status,
    httpStatus: probe.httpStatus,
    apiCode: probe.apiCode,
    requestIdPresent: Boolean(probe.requestIdPresent),
    dataPresent: Boolean(probe.dataPresent),
    responseHashPresent: Boolean(probe.responseHash),
    summary: probe.summary || {}
  };
}

function evidenceSummary(probe, gateStatusValue, diagnosis) {
  return [
    `gate=${probe.label}`,
    `gate_status=${gateStatusValue}`,
    `endpoint=${probe.endpoint}`,
    `http=${probe.httpStatus ?? "none"}`,
    `api_code=${probe.apiCode || "none"}`,
    `request_id_present=${Boolean(probe.requestIdPresent)}`,
    `data_present=${Boolean(probe.dataPresent)}`,
    `summary_hash=sha256:${sha256(JSON.stringify(probe.summary || {}))}`,
    `response_hash_present=${Boolean(probe.responseHash)}`,
    `diagnosis=${diagnosis}`
  ].join("; ");
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

async function updateBrandResource(bundle, readonlyCheck) {
  await psql(`
    UPDATE mwb.account_resources
    SET metadata = metadata || jsonb_build_object(
          'readonly_check', (coalesce(metadata->'readonly_check', '{}'::jsonb) || ${sqlJson(readonlyCheck)}::jsonb),
          'oe3_brand_industry_repair', ${sqlJson(readonlyCheck)}::jsonb
        ),
        updated_at = now()
    WHERE route_id = ${sqlLiteral(bundle.job.route_id)}
      AND game_code = ${sqlLiteral(bundle.job.game_code)}
      AND advertiser_id = ${sqlLiteral(bundle.job.advertiser_id)}
      AND resource_type = 'brand_info';
  `);
}

async function updateNodeOutputs(gateSummary) {
  await psql(`
    UPDATE mwb.launch_node_runs
    SET output_summary = output_summary || jsonb_build_object(
          'oe3BrandIndustryRepair', ${sqlJson(gateSummary)}::jsonb
        )
    WHERE job_id = ${sqlLiteral(TARGET_JOB_ID)}
      AND node_key IN ('account_resource_prepare', 'std_project_create_executor');
  `);
}

function diagnosisForIndustryProbe(probe, variantLabel) {
  if (probe.status === "passed" && probe.summary?.industryMatched && probe.summary?.industryId) {
    return `${variantLabel}_passed`;
  }
  if (probe.httpStatus === 200 && clean(probe.apiCode) === "40000") {
    return `${variantLabel}_api_40000_parameter_or_permission_or_brand_mapping`;
  }
  if (probe.status === "credential_required") return `${variantLabel}_credential_required`;
  if (probe.status === "transport_failed") return `${variantLabel}_transport_failed`;
  return `${variantLabel}_blocked_unclassified`;
}

async function run() {
  const before = await protectedJobState();
  const bundle = await repo.getLaunchJobBundle(TARGET_JOB_ID);
  assert(bundle?.job?.job_id === TARGET_JOB_ID, "target_job_not_found");
  const advertiserId = clean(bundle.job.advertiser_id);

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
  const brandFuzzyStatus = gateStatus(brandFuzzy, (summary) => summary.uniqueValidMatched && summary.outerBrandId && summary.cdpBrandName === EXPECTED_BRAND_NAME);
  const outerBrandId = clean(brandFuzzy.summary?.outerBrandId);

  const variants = [];
  if (outerBrandId) {
    variants.push({
      label: "brand_industry_origin_req_outer_brand_id_string",
      value: outerBrandId
    });
    if (/^\d+$/.test(outerBrandId) && Number.isSafeInteger(Number(outerBrandId))) {
      variants.push({
        label: "brand_industry_origin_req_outer_brand_id_number",
        value: Number(outerBrandId)
      });
    }
  }

  const industryResults = [];
  for (const variant of variants) {
    const probe = await client.get({
      label: variant.label,
      endpoint: "/open_api/v3.0/dpa/brand/adv_auth/industry/get/",
      query: {
        account_id: advertiserId,
        origin_req: JSON.stringify({
          brand_data_source: "YUNTU",
          outer_brand_id: variant.value
        })
      },
      summarize: summarizeIndustry
    });
    const status = gateStatus(probe, (summary) => summary.industryMatched && summary.industryId);
    industryResults.push({
      variant: variant.label,
      probe,
      status,
      diagnosis: diagnosisForIndustryProbe(probe, variant.label)
    });
  }

  const anyIndustryPassed = industryResults.some((item) => item.status === "passed");
  const allIndustryApi40000 = industryResults.length > 0 && industryResults.every((item) => item.probe.httpStatus === 200 && clean(item.probe.apiCode) === "40000");
  const conclusion = anyIndustryPassed
    ? "brand_industry_readback_passed"
    : allIndustryApi40000
      ? "brand_industry_api_40000_likely_parameter_permission_or_industry_mapping"
      : "brand_industry_blocked_need_platform_error_detail_or_parameter_review";
  const status = brandFuzzyStatus === "passed" && anyIndustryPassed ? "passed" : "blocked";
  const checkedAt = new Date().toISOString();

  const gates = [
    {
      gate: "brand_fuzzy",
      status: brandFuzzyStatus,
      probe: brandFuzzy,
      diagnosis: brandFuzzyStatus === "passed" ? "unique_valid_brand_found" : "brand_fuzzy_not_unique_or_missing"
    },
    ...industryResults.map((item) => ({
      gate: item.variant,
      status: item.status,
      probe: item.probe,
      diagnosis: item.diagnosis
    }))
  ];

  for (const gate of gates) {
    const suffix = gate.gate.replace(/[^A-Za-z0-9_.:-]/g, "_").toUpperCase();
    const evidenceRef = `EV-${TARGET_JOB_ID}-OE3-BRAND-INDUSTRY-REPAIR-${suffix}`;
    await repo.upsertEvidence({
      artifactId: evidenceRef,
      jobId: TARGET_JOB_ID,
      artifactType: "oe3_brand_industry_readonly_repair",
      title: `OE3 brand industry readonly repair ${gate.gate}`,
      summary: evidenceSummary(gate.probe, gate.status, gate.diagnosis),
      contentHash: gate.probe.responseHash || `sha256:${sha256(evidenceSummary(gate.probe, gate.status, gate.diagnosis))}`,
      storageRef: `postgres:mwb.evidence_artifacts/${evidenceRef}`,
      sourceRef: `oceanengine:${gate.probe.endpoint}`,
      sourceUsage: "runtime_truth"
    });
    gate.evidenceRef = evidenceRef;
  }

  const gateSummary = {
    status,
    checkedAt,
    targetJobId: TARGET_JOB_ID,
    brandFuzzyStatus,
    brandIndustryStatus: anyIndustryPassed ? "passed" : "blocked",
    conclusion,
    outerBrandIdPresent: Boolean(outerBrandId),
    testedVariants: industryResults.map((item) => item.variant),
    evidenceRefs: gates.map((gate) => gate.evidenceRef),
    noPlatformWrite: true,
    noTokenRefresh: true
  };
  assertNoSensitiveLeak(gateSummary);

  await updateBrandResource(bundle, {
    key: "oe3_brand_industry_readonly_repair",
    status: anyIndustryPassed ? "passed" : "blocked",
    checked_at: checkedAt,
    gate_focus: "brand_info",
    gate_status: status,
    next_action: anyIndustryPassed ? "进入最终创建前 readiness 检查" : "修 brand_industry fresh readback",
    evidence_refs: gates.map((gate) => gate.evidenceRef),
    conclusion
  });
  await updateNodeOutputs(gateSummary);

  const after = await protectedJobState();
  assert(before.jobStatus === after.jobStatus, "target job_status changed");
  assert(before.currentNode === after.currentNode, "target current_node changed");
  assert(before.platformActions === after.platformActions && after.platformActions === 1, "platform_actions changed");
  assert(before.createdObjects === after.createdObjects && after.createdObjects === 0, "created_objects changed");

  const result = {
    status,
    targetJobId: TARGET_JOB_ID,
    targetJobStatus: after.jobStatus,
    targetCurrentNode: after.currentNode,
    platformActions: after.platformActions,
    createdObjects: after.createdObjects,
    noPlatformWrite: true,
    noTokenRefresh: true,
    conclusion,
    gates: gates.map((gate) => ({
      gate: gate.gate,
      status: gate.status,
      diagnosis: gate.diagnosis,
      evidenceRef: gate.evidenceRef,
      probe: publicProbe(gate.probe, gate.status)
    })),
    nextGate: anyIndustryPassed
      ? "brand_industry 已通过；继续生成最终创建前 readiness packet。"
      : "brand_industry 仍阻断；需要修参数、权限或品牌行业映射，或由用户提供平台侧错误详情。"
  };
  assertNoSensitiveLeak(result);
  console.log(JSON.stringify(result, null, 2));
}

await run();
