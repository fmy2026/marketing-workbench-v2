import { createHash } from "node:crypto";

const REQUIRED_PAYLOAD_FIELDS = [
  "route_id",
  "game_code",
  "advertiser_id",
  "object_type",
  "project_name",
  "monitor_id",
  "platform_app_id",
  "objective",
  "deep_objective",
  "deep_bid_type",
  "budget",
  "bid",
  "roi_goal",
  "targeting_summary",
  "dmp_summary",
  "brand_info",
  "material_pack_id",
  "material_asset_refs",
  "naming_prefix",
  "project_seq",
  "yyyymmdd"
];

const FORBIDDEN_KEY_PATTERN = /(^|_)(token|cookie|secret|auth_code|raw_payload|raw_response|touchpoint_url|callback_url)($|_)/i;
const REQUIRED_BRAND_INFO_FIELDS = [
  "brand_name_id",
  "cdp_brand_id",
  "cdp_brand_name",
  "yuntu_category_id",
  "matched_industry_path",
  "readback_status"
];

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function stablePayloadHash(value) {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

function valuePresent(value) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== null && value !== undefined && value !== "";
}

function collectForbiddenKeys(value, path = []) {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => {
    const nextPath = [...path, key];
    const own = FORBIDDEN_KEY_PATTERN.test(key) ? [nextPath.join(".")] : [];
    return [...own, ...collectForbiddenKeys(child, nextPath)];
  });
}

function normalizeDraft(draft = {}) {
  return {
    projectName: draft.projectName || draft.project_name || "",
    payloadSummary: draft.payloadSummary || draft.payload_summary || {},
    payloadHash: draft.payloadHash || draft.payload_hash || ""
  };
}

function projectNameMatches(projectName, payload) {
  const monitorId = String(payload.monitor_id || "");
  const gameCode = String(payload.game_code || "");
  const pattern = new RegExp(`^${monitorId}_N_${gameCode}_[A-Z0-9]+_[A-Z0-9]+_.+_P\\d{2,}_${payload.yyyymmdd}$`);
  return pattern.test(projectName);
}

export function evaluateStdProjectPayloadContract({ bundle, draft, touchpointVerification } = {}) {
  const normalized = normalizeDraft(draft || bundle?.draft || {});
  if (!normalized.projectName || !Object.keys(normalized.payloadSummary).length) {
    return {
      status: "waiting",
      summary: "等待草稿生成后执行 payload 合同检查。",
      checks: [],
      gaps: []
    };
  }

  const payload = normalized.payloadSummary;
  const missingFields = REQUIRED_PAYLOAD_FIELDS.filter((field) => !valuePresent(payload[field]));
  const forbiddenKeys = collectForbiddenKeys(payload);
  const brandInfo = payload.brand_info || {};
  const missingBrandInfoFields = REQUIRED_BRAND_INFO_FIELDS.filter((field) => !valuePresent(brandInfo[field]));
  const brandInfoHasEcomBrandId = Object.prototype.hasOwnProperty.call(brandInfo, "ecom_brand_id");
  const brandInfoNumericFieldsOk = ["brand_name_id", "cdp_brand_id", "yuntu_category_id"]
    .every((field) => /^\d+$/.test(String(brandInfo[field] || "")));
  const brandInfoConfirmed = ["fresh_target_brand_industry_readback_passed", "target_account_fresh_brand_industry_readback_passed"]
    .includes(String(brandInfo.readback_status || ""));
  const expectedHash = stablePayloadHash(payload);
  const hashStable = normalized.payloadHash === expectedHash;
  const longIdFieldsAreStrings = ["advertiser_id", "monitor_id"]
    .every((field) => typeof payload[field] === "string" && /^[0-9]+$/.test(payload[field]));
  const nameMatches = normalized.projectName === payload.project_name && projectNameMatches(normalized.projectName, payload);
  const readback = bundle?.readback || null;
  const objectNameConsistent = !readback || readback.object_name === normalized.projectName;
  const touchpointControlled = Boolean(touchpointVerification?.touchpointUrlPresent) && forbiddenKeys.every((path) => path !== "touchpoint_url");

  const checks = [
    {
      key: "required_fields",
      status: missingFields.length ? "blocked" : "passed",
      summary: missingFields.length ? `缺少 ${missingFields.join("、")}` : "std_project payload 摘要字段齐全。"
    },
    {
      key: "forbidden_fields",
      status: forbiddenKeys.length ? "blocked" : "passed",
      summary: forbiddenKeys.length ? `禁止字段进入摘要：${forbiddenKeys.join("、")}` : "未发现禁止字段。"
    },
    {
      key: "brand_info_required",
      status: missingBrandInfoFields.length ? "blocked" : "passed",
      summary: missingBrandInfoFields.length ? `brand_info 缺少 ${missingBrandInfoFields.join("、")}` : "brand_info 官方字段齐全。"
    },
    {
      key: "brand_info_forbidden_fields",
      status: brandInfoHasEcomBrandId ? "blocked" : "passed",
      summary: brandInfoHasEcomBrandId ? "3.0 payload 禁止 brand_info.ecom_brand_id。" : "brand_info 未包含 ecom_brand_id。"
    },
    {
      key: "brand_info_numeric_fields",
      status: brandInfoNumericFieldsOk ? "passed" : "blocked",
      summary: brandInfoNumericFieldsOk ? "brand_info 数字字段可安全转为 integer。" : "brand_info 数字字段缺失或不是数字。"
    },
    {
      key: "brand_info_confirmation",
      status: brandInfoConfirmed ? "passed" : "blocked",
      summary: brandInfoConfirmed ? "brand_info readback_status 可用于创建前确认。" : "brand_info readback_status 未确认。"
    },
    {
      key: "long_numeric_ids",
      status: longIdFieldsAreStrings ? "passed" : "blocked",
      summary: longIdFieldsAreStrings ? "平台长数字 ID 均按字符串处理。" : "advertiser_id 或 monitor_id 未按字符串处理。"
    },
    {
      key: "payload_hash",
      status: hashStable ? "passed" : "blocked",
      summary: hashStable ? "payload_hash 与规范化摘要稳定一致。" : "payload_hash 与规范化摘要不一致。"
    },
    {
      key: "project_name",
      status: nameMatches ? "passed" : "blocked",
      summary: nameMatches ? "project_name 符合 std_project 命名规则。" : "project_name 不符合命名规则或摘要不一致。"
    },
    {
      key: "touchpoint_scope",
      status: touchpointControlled ? "passed" : "blocked",
      summary: touchpointControlled ? "完整触点 URL 仅用于受控构建/校验，不进入普通摘要。" : "触点 URL 未入库或进入了非受控摘要。"
    },
    {
      key: "readback_object_name",
      status: objectNameConsistent ? "passed" : "blocked",
      summary: objectNameConsistent ? "回查 object_name 来源与 launch_drafts.project_name 一致。" : "回查 object_name 未来自草稿项目名。"
    }
  ];

  const gaps = checks
    .filter((check) => check.status !== "passed")
    .map((check) => ({ key: check.key, message: check.summary }));

  return {
    status: gaps.length ? "blocked" : "passed",
    summary: gaps.length ? `payload 合同未通过：${gaps.length} 个缺口。` : "payload 合同检查通过。",
    checks,
    gaps,
    expectedPayloadHash: expectedHash
  };
}
