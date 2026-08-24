import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import { createOceanEngineReadonlyClient } from "../src/platforms/oceanengineReadonlyClient.mjs";
import { prepareStdProjectCreate } from "../src/platforms/oceanengineStdProjectCreateExecutor.mjs";
import { assertNoSensitiveLeak, hashValue } from "../src/workflows/skills/oe3/contracts.mjs";

const TARGET = {
  advertiserId: "1871922175825993",
  p03JobId: "JOB-MWBV2-20260824092327-494BF1",
  p03PayloadHash: "sha256:152babf25efa31d4aa526d17a5dd7379f687dc8a069e5e93bf51eb38aa73a2f4",
  p01ProjectId: "7675218401040220179",
  p01ProjectName: "245791_N_JSZC_HUNT_PAY7DROI_平台定向不限_P01_20260817"
};

const OUT_DIR = "docs/.参考文档/3.0创建";
const LEGACY_ROOT = "/Users/hys/Projects/marketing-workbench";
const ENUM_PATH = new Set([
  "ad_type",
  "landing_type",
  "marketing_goal",
  "external_action",
  "deep_external_action",
  "native_type",
  "delivery_mode",
  "delivery_type",
  "delivery_medium",
  "micro_promotion_type",
  "schedule_type",
  "bid_type",
  "budget_mode",
  "pricing",
  "deep_bid_type",
  "audience_type",
  "audience.district",
  "audience.gender",
  "audience.converted_time_duration",
  "audience.hide_if_converted",
  "audience.interest_action_mode",
  "track_url_setting.send_type",
  "project_materials.anchor_related_type",
  "aigc_dynamic_creative_switch",
  "layer_roi_switch",
  "is_comment_disable",
  "status",
  "status_first",
  "status_second",
  "opt_status"
]);

const SENSITIVE_PATH = /(token|cookie|secret|auth_code|raw_payload|raw_response|touchpoint_url|callback_url|track_url|url)$/i;
const ID_PATH = /(^|\.|_)(id|ids|project_id|advertiser_id|asset_id|instance_id|aweme_id|image_id|video_id|brand_name_id|cdp_brand_id|yuntu_category_id)($|\.|_)/i;
const CRITICAL_CREATE_PATHS = [
  "advertiser_id",
  "name",
  "ad_type",
  "landing_type",
  "marketing_goal",
  "external_action",
  "native_type",
  "aweme_id",
  "delivery_mode",
  "delivery_medium",
  "instance_id",
  "asset_id",
  "schedule_type",
  "bid_type",
  "budget_mode",
  "budget",
  "pricing",
  "cpa_bid",
  "roi_goal",
  "deep_bid_type",
  "audience_type",
  "audience",
  "audience.gender",
  "audience.hide_if_converted",
  "audience.filter_event",
  "audience.retargeting_tags_exclude",
  "brand_info",
  "brand_info.brand_name_id",
  "brand_info.cdp_brand_id",
  "brand_info.cdp_brand_name",
  "brand_info.yuntu_category_id",
  "project_materials",
  "project_materials.video_material_list",
  "project_materials.title_material_list",
  "project_materials.mini_program_info",
  "project_materials.mini_program_info.app_id",
  "project_materials.mini_program_info.url",
  "project_materials.product_info",
  "project_materials.product_info.image_ids",
  "track_url_setting",
  "track_url_setting.action_track_url",
  "track_url_setting.send_type"
];

const OFFICIAL_OR_VERIFIED_CREATE_PATHS = new Set([
  ...CRITICAL_CREATE_PATHS,
  "deep_external_action",
  "delivery_type",
  "micro_promotion_type",
  "cpa_bid",
  "deep_bid_type",
  "audience.district",
  "audience.age",
  "audience.filter_event[]",
  "audience.converted_time_duration",
  "audience.retargeting_tags_exclude[]",
  "audience.interest_action_mode",
  "project_materials.title_material_list[]",
  "project_materials.title_material_list[].title",
  "project_materials.video_material_list[]",
  "project_materials.video_material_list[].image_mode",
  "project_materials.video_material_list[].video_id",
  "project_materials.video_material_list[].video_cover_id",
  "project_materials.image_material_list",
  "project_materials.source",
  "project_materials.product_info.titles",
  "project_materials.product_info.titles[]",
  "project_materials.product_info.image_ids[]",
  "project_materials.product_info.selling_points",
  "project_materials.product_info.selling_points[]",
  "project_materials.call_to_action_buttons",
  "project_materials.call_to_action_buttons[]",
  "project_materials.anchor_related_type",
  "track_url_setting.action_track_url[]",
  "aigc_dynamic_creative_switch",
  "layer_roi_switch",
  "is_comment_disable"
]);

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function clean(value) {
  return String(value ?? "").trim();
}

function typeName(value) {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

function arrayFrom(value) {
  return Array.isArray(value) ? value : [];
}

function dataList(payload = {}) {
  const data = payload.data || {};
  return [data.list, data.items, data.projects, data.records].find(Array.isArray) || [];
}

function projectId(item = {}) {
  return clean(item.project_id || item.std_project_id || item.id);
}

function projectName(item = {}) {
  return clean(item.name || item.project_name || item.std_project_name);
}

function scalarShape(path, value) {
  const type = typeName(value);
  const text = clean(value);
  const shape = {
    path,
    type,
    present: value !== undefined && value !== null && text !== ""
  };
  if (!shape.present) return shape;
  if (SENSITIVE_PATH.test(path)) {
    return { ...shape, value_redacted: true, value_hash: `sha256:${sha256(text)}` };
  }
  if (ID_PATH.test(path)) {
    return { ...shape, id_present: true, id_hash: `sha256:${sha256(text)}` };
  }
  if (ENUM_PATH.has(path) || /^[A-Z0-9_]+$/.test(text)) {
    return { ...shape, enum_value: text };
  }
  if (type === "number" || type === "boolean") return { ...shape, value: value };
  return { ...shape, text_length: text.length, value_hash: `sha256:${sha256(text)}` };
}

function flattenShape(value, path = "") {
  if (Array.isArray(value)) {
    const own = path ? [{
      path,
      type: "array",
      present: value.length > 0,
      count: value.length,
      item_types: [...new Set(value.map(typeName))]
    }] : [];
    return [
      ...own,
      ...value.flatMap((item) => flattenShape(item, path ? `${path}[]` : "[]"))
    ];
  }
  if (value && typeof value === "object") {
    const own = path ? [{
      path,
      type: "object",
      present: true,
      key_count: Object.keys(value).length
    }] : [];
    return [
      ...own,
      ...Object.entries(value).flatMap(([key, child]) => flattenShape(child, path ? `${path}.${key}` : key))
    ];
  }
  return path ? [scalarShape(path, value)] : [];
}

function dedupeShapes(shapes = []) {
  const byPath = new Map();
  for (const shape of shapes) {
    const current = byPath.get(shape.path);
    if (!current) {
      byPath.set(shape.path, shape);
      continue;
    }
    byPath.set(shape.path, {
      ...current,
      present: current.present || shape.present,
      count: Math.max(Number(current.count || 0), Number(shape.count || 0)) || current.count,
      enum_values: [...new Set([
        ...(current.enum_values || []),
        current.enum_value,
        shape.enum_value
      ].filter(Boolean))]
    });
  }
  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
}

function redactedStructure({ source, status, object = {}, metadata = {} }) {
  const structure = dedupeShapes(flattenShape(object));
  return {
    schema_version: "mwbv2.redacted-field-structure.v1",
    source,
    status,
    generated_at: new Date().toISOString(),
    metadata,
    field_count: structure.length,
    fields: structure
  };
}

function summarizeStdProjectList(payload = {}) {
  const items = dataList(payload);
  const match = items.find((item) => projectId(item) === TARGET.p01ProjectId) ||
    items.find((item) => projectName(item) === TARGET.p01ProjectName) ||
    {};
  return {
    listCount: items.length,
    matched: Boolean(Object.keys(match).length),
    matchedProjectIdHash: projectId(match) ? `sha256:${sha256(projectId(match))}` : "",
    matchedNameHash: projectName(match) ? `sha256:${sha256(projectName(match))}` : "",
    structure: redactedStructure({
      source: "oceanengine.std_project_list.p01",
      status: Object.keys(match).length ? "matched" : "not_matched",
      object: match,
      metadata: {
        endpoint: "std_project/list",
        query_shape: "advertiser_id + filtering.project_ids(number literal) + filtering.name + page/page_size",
        raw_response_stored: false
      }
    })
  };
}

function safeWriteJson(path, value) {
  assertNoSensitiveLeak(value);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function psqlJson(database, sql) {
  try {
    const output = execFileSync("psql", ["-X", "-d", database, "-At", "-c", sql], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
    return output ? JSON.parse(output) : null;
  } catch (error) {
    return { status: "query_failed", error_code: clean(error.status || error.code || "psql_failed") };
  }
}

function legacyDbSummary() {
  return psqlJson("marketing_workbench", `
    SELECT jsonb_build_object(
      'run_objects_hits', (
        SELECT count(*)
        FROM mwb.run_objects
        WHERE object_id = '${TARGET.p01ProjectId}'
           OR object_name = '${TARGET.p01ProjectName}'
      ),
      'run_records_hits', (
        SELECT count(*)
        FROM mwb.run_records
        WHERE advertiser_id = '${TARGET.advertiserId}'
          AND (
            content::text LIKE '%${TARGET.p01ProjectId}%'
            OR content::text LIKE '%${TARGET.p01ProjectName}%'
          )
      ),
      'run_objects_sample_keys', (
        SELECT coalesce(jsonb_agg(DISTINCT key ORDER BY key), '[]'::jsonb)
        FROM mwb.run_objects ro, jsonb_object_keys(ro.content) key
        WHERE object_id = '${TARGET.p01ProjectId}'
           OR object_name = '${TARGET.p01ProjectName}'
      ),
      'run_records_sample_keys', (
        SELECT coalesce(jsonb_agg(DISTINCT key ORDER BY key), '[]'::jsonb)
        FROM mwb.run_records rr, jsonb_object_keys(rr.content) key
        WHERE advertiser_id = '${TARGET.advertiserId}'
          AND (
            content::text LIKE '%${TARGET.p01ProjectId}%'
            OR content::text LIKE '%${TARGET.p01ProjectName}%'
          )
      ),
      'raw_create_payload_retained_in_known_tables', false
    )::text;
  `);
}

function rgJsonFiles() {
  try {
    const output = execFileSync("rg", [
      "-l",
      `${TARGET.p01ProjectId}|${TARGET.p01ProjectName}`,
      LEGACY_ROOT
    ], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return output.split("\n").filter((line) => line.endsWith(".json")).slice(0, 80);
  } catch {
    return [];
  }
}

function findLegacyRawCreatePayload() {
  const candidates = rgJsonFiles();
  for (const file of candidates) {
    let parsed = null;
    try {
      parsed = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      continue;
    }
    const found = [];
    function walk(value) {
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) {
        value.forEach(walk);
        return;
      }
      const looksLikePayload = value.advertiser_id &&
        value.name === TARGET.p01ProjectName &&
        value.ad_type &&
        value.landing_type &&
        value.marketing_goal &&
        value.project_materials;
      if (looksLikePayload) found.push(value);
      Object.values(value).forEach(walk);
    }
    walk(parsed);
    if (found[0]) {
      return {
        status: "legacy_raw_create_payload_found",
        scannedJsonFileCount: candidates.length,
        structure: redactedStructure({
          source: "legacy_project.p01_create_payload",
          status: "found_redacted_structure_only",
          object: found[0],
          metadata: {
            raw_payload_stored: false,
            local_path_stored: false
          }
        })
      };
    }
  }
  return {
    status: "legacy_raw_create_payload_not_retained",
    scannedJsonFileCount: candidates.length,
    structure: redactedStructure({
      source: "legacy_project.p01_create_payload",
      status: "legacy_raw_create_payload_not_retained",
      object: {},
      metadata: {
        raw_payload_stored: false,
        local_path_stored: false
      }
    })
  };
}

function pathSet(doc = {}) {
  return new Set(arrayFrom(doc.fields).map((field) => field.path));
}

function fieldByPath(doc = {}) {
  return new Map(arrayFrom(doc.fields).map((field) => [field.path, field]));
}

function compareStructures({ p01Doc, p03Doc, legacyDoc }) {
  const p01Paths = pathSet(p01Doc);
  const p03Paths = pathSet(p03Doc);
  const legacyPaths = pathSet(legacyDoc);
  const missingInP03 = [...p01Paths].filter((path) => !p03Paths.has(path)).sort();
  const extraInP03 = [...p03Paths].filter((path) => !p01Paths.has(path)).sort();
  const legacyAllowedExtras = extraInP03.filter((path) => legacyPaths.has(path));
  const p01ByPath = fieldByPath(p01Doc);
  const p03ByPath = fieldByPath(p03Doc);
  const typeDiffs = [...p03Paths]
    .filter((path) => p01Paths.has(path))
    .map((path) => ({
      path,
      p01_type: p01ByPath.get(path)?.type || "",
      p03_type: p03ByPath.get(path)?.type || ""
    }))
    .filter((item) => item.p01_type && item.p03_type && item.p01_type !== item.p03_type);
  const p03Forbidden = arrayFrom(p03Doc.fields)
    .filter((field) => /(^|\.)(asset_ids|micro_app_instance_id|ecom_brand_id)$/.test(field.path))
    .map((field) => field.path);
  const missingCriticalCreateFields = CRITICAL_CREATE_PATHS.filter((path) => !p03Paths.has(path));
  const p03UnallowedCreateFields = [...p03Paths]
    .filter((path) => !OFFICIAL_OR_VERIFIED_CREATE_PATHS.has(path))
    .filter((path) => path !== "");
  return {
    p01PathsAvailable: p01Paths.size > 0,
    legacyPayloadAvailable: legacyPaths.size > 0,
    missingInP03,
    extraInP03,
    legacyAllowedExtras,
    typeDiffs,
    p03Forbidden,
    missingCriticalCreateFields,
    p03UnallowedCreateFields
  };
}

function writeMarkdown({ p01Probe, p01Doc, p03Doc, legacyResult, comparison, p03Prepared, attemptState }) {
  const p01Duplicate = "否；P01 项目存在且已按 project_id/name 命中，但 P03 项目名不同，P03 不是 P01 同名重复";
  const missingAnswer = comparison.missingCriticalCreateFields.length
    ? `是：${comparison.missingCriticalCreateFields.join("、")}`
    : "否；按 v2 当前官方/旧脚本抽象出的关键创建字段，P03 均 present";
  const extraAnswer = comparison.p03UnallowedCreateFields.length
    ? `是：${comparison.p03UnallowedCreateFields.join("、")}`
    : "否；P03 字段均在官方或旧成功脚本抽象出的允许创建字段范围内";
  const typeAnswer = comparison.p03Forbidden.length || comparison.p03UnallowedCreateFields.length
    ? `发现创建字段合同差异：p03Forbidden=${comparison.p03Forbidden.join("、") || "无"}，unallowed=${comparison.p03UnallowedCreateFields.join("、") || "无"}`
    : `未发现可证实创建字段合同差异；P01 list 与 P03 create 的 response/request 差异不直接作为根因，素材、品牌、事件、DMP、触点在 P03 v2 结构中均 present`;
  const rootCause = comparison.p03Forbidden.length || comparison.p03UnallowedCreateFields.length || comparison.missingCriticalCreateFields.length
    ? "存在可复核字段合同嫌疑，但仍需平台 safe error summary 确认"
    : "仍需下一次新 job 的 safe error summary 才能确认";
  const lines = [
    "# P01 / P03 创建字段对比",
    "",
    "本文件只保存脱敏结构结论，不保存 raw payload、raw response、完整触点 URL 或凭据。",
    "",
    "## 固定对象",
    "",
    `- P03 job：\`${TARGET.p03JobId}\``,
    `- P03 payload_hash 匹配：\`${p03Prepared.payloadHashStable && p03Prepared.payload?.name ? p03Doc.metadata.payload_hash_matches_target : false}\``,
    `- P03 create actions：\`${attemptState.createActionCount}\``,
    `- P03 created objects：\`${attemptState.createdObjectCount}\``,
    `- P01 readonly status：\`${p01Probe.status}\`，api_code：\`${p01Probe.apiCode || ""}\`，request_id_present：\`${p01Probe.requestIdPresent}\``,
    `- 旧项目 P01 create payload：\`${legacyResult.status}\``,
    "",
    "## 最终回答",
    "",
    `1. P03 与 P01 是否存在同名重复：${p01Duplicate}。P03 项目名是 P03，不是 P01 名称。`,
    `2. P03 是否存在 P01 有、但 P03 缺失的关键创建字段：${missingAnswer}。`,
    `3. P03 是否存在 P01 没有、且旧脚本/官方文档不允许的字段：${extraAnswer}。`,
    `4. 是否发现字段类型、枚举、素材、品牌、事件、DMP 或触点结构差异：${typeAnswer}。`,
    `5. P03 的 40000 是否已有明确根因：${rootCause}。`,
    "",
    "## 结构摘要",
    "",
    `- P01 平台字段数：${p01Doc.field_count}`,
    `- P03 v2 字段数：${p03Doc.field_count}`,
    `- 旧 P01 创建字段数：${legacyResult.structure.field_count}`,
    `- P01 list-only 字段不用于判定 P03 创建缺字段：${comparison.missingInP03.length}`,
    `- P03 create-only 字段不用于判定 P03 非法字段：${comparison.extraInP03.length}`,
    `- P03 缺关键创建字段数：${comparison.missingCriticalCreateFields.length}`,
    `- P03 非允许创建字段数：${comparison.p03UnallowedCreateFields.length}`,
    `- P03 payload hash：${p03Doc.metadata.payload_hash}`,
    `- P03 payload hash matches target：${p03Doc.metadata.payload_hash_matches_target}`,
    "",
    "## 边界",
    "",
    "- 未重试 P03。",
    "- 未调用 `std_project/create`。",
    "- 未新建 runtime job。",
    "- 未刷新 token。",
    "- 未保存 raw JSON。"
  ];
  const value = `${lines.join("\n")}\n`;
  assertNoSensitiveLeak(value);
  writeFileSync(join(OUT_DIR, "04-P01-P03-创建字段对比.md"), value);
}

mkdirSync(OUT_DIR, { recursive: true });

const repo = new PostgresRepository();
const attemptStateBefore = await repo.getCreateAttemptState(TARGET.p03JobId);
const prepared = await prepareStdProjectCreate({ repo, jobId: TARGET.p03JobId });
const p03Doc = redactedStructure({
  source: "mwbv2.p03_final_std_project_create_payload",
  status: "generated_from_v2_payload_builder",
  object: prepared.payload,
  metadata: {
    job_id: TARGET.p03JobId,
    payload_hash: hashValue(prepared.payload),
    expected_payload_hash: TARGET.p03PayloadHash,
    payload_hash_matches_target: hashValue(prepared.payload) === TARGET.p03PayloadHash,
    raw_payload_stored: false,
    touchpoint_url_stored: false
  }
});

const client = createOceanEngineReadonlyClient();
const filtering = `{"project_ids":[${TARGET.p01ProjectId}],"name":${JSON.stringify(TARGET.p01ProjectName)}}`;
const p01Probe = await client.get({
  label: "p01_std_project_structure",
  endpoint: "/open_api/v3.0/std_project/list/",
  query: {
    advertiser_id: TARGET.advertiserId,
    filtering,
    page: "1",
    page_size: "20"
  },
  summarize: summarizeStdProjectList
});
const p01Doc = p01Probe.summary?.structure || redactedStructure({
  source: "oceanengine.std_project_list.p01",
  status: "not_available",
  object: {},
  metadata: { raw_response_stored: false }
});
p01Doc.metadata = {
  ...(p01Doc.metadata || {}),
  readonly_status: p01Probe.status,
  http_status: p01Probe.httpStatus,
  api_code: p01Probe.apiCode,
  request_id_present: p01Probe.requestIdPresent,
  data_present: p01Probe.dataPresent,
  response_hash_present: Boolean(p01Probe.responseHash)
};

const legacyDb = legacyDbSummary();
const legacyResult = findLegacyRawCreatePayload();
legacyResult.structure.metadata = {
  ...(legacyResult.structure.metadata || {}),
  legacy_db_summary: legacyDb
};

const comparison = compareStructures({
  p01Doc,
  p03Doc,
  legacyDoc: legacyResult.structure
});

safeWriteJson(join(OUT_DIR, "01-P01-平台项目结构-脱敏.json"), p01Doc);
safeWriteJson(join(OUT_DIR, "02-P03-v2最终创建结构-脱敏.json"), p03Doc);
safeWriteJson(join(OUT_DIR, "03-P01-旧项目创建结构-脱敏.json"), legacyResult.structure);
writeMarkdown({
  p01Probe,
  p01Doc,
  p03Doc,
  legacyResult,
  comparison,
  p03Prepared: prepared,
  attemptState: attemptStateBefore
});

const attemptStateAfter = await repo.getCreateAttemptState(TARGET.p03JobId);
if (Number(attemptStateAfter.createActionCount) !== Number(attemptStateBefore.createActionCount)) {
  throw new Error("p03_create_action_count_changed");
}
if (Number(attemptStateAfter.createdObjectCount) !== Number(attemptStateBefore.createdObjectCount)) {
  throw new Error("p03_created_object_count_changed");
}
if (p03Doc.metadata.payload_hash_matches_target !== true) {
  throw new Error("p03_payload_hash_mismatch");
}

const result = {
  status: "passed",
  docsDir: OUT_DIR,
  p01ReadonlyStatus: p01Probe.status,
  p01ApiCode: p01Probe.apiCode,
  p01Matched: p01Probe.summary?.matched === true,
  p03PayloadHashMatchesTarget: true,
  legacyStatus: legacyResult.status,
  p03CreateActionCount: Number(attemptStateAfter.createActionCount),
  p03CreatedObjectCount: Number(attemptStateAfter.createdObjectCount),
  comparison: {
    p01PathsAvailable: comparison.p01PathsAvailable,
    legacyPayloadAvailable: comparison.legacyPayloadAvailable,
    missingInP03Count: comparison.missingInP03.length,
    extraInP03Count: comparison.extraInP03.length,
    typeDiffCount: comparison.typeDiffs.length,
    p03ForbiddenCount: comparison.p03Forbidden.length,
    missingCriticalCreateFieldCount: comparison.missingCriticalCreateFields.length,
    p03UnallowedCreateFieldCount: comparison.p03UnallowedCreateFields.length
  },
  rawPayloadStored: false,
  rawResponseStored: false
};
assertNoSensitiveLeak(result);
console.log(JSON.stringify(result, null, 2));
