import { parseLaunchIntake } from "./launchAgent.mjs";

export const LAUNCH_REQUEST_SCHEMA_VERSION = "launch-request.v1";
export const LAUNCH_REQUEST_OPERATION = "create_std_project";
export const LAUNCH_REQUEST_ROUTE_ID = "oceanengine_3_byte_mini_game";
export const LAUNCH_REQUEST_GAME_CODE = "JSZC";
export const LAUNCH_REQUEST_FIELDS = ["schema_version", "operation", "route_id", "game_code", "advertiser_id"];
const DRAFT_FIELDS = ["route_id", "game_code", "advertiser_id"];

export class LaunchRequestError extends Error {
  constructor(message, { code, status = 400, details = null } = {}) {
    super(message);
    this.name = "LaunchRequestError";
    this.code = code;
    this.statusCode = status;
    this.details = details;
  }
}

function failure(message, code, details = null) {
  throw new LaunchRequestError(message, { code, details });
}

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) failure(`${label} 必须是对象。`, "launch_request_invalid_type");
}

function knownOnly(value, fields, label) {
  object(value, label);
  const unknown = Object.keys(value).filter((key) => !fields.includes(key));
  if (unknown.length) failure(`${label} 包含未知字段。`, "launch_request_unknown_field", { fields: unknown });
}

function routeId(value, allowEmpty = false) {
  if (typeof value !== "string") failure("route_id 必须是字符串。", "launch_request_invalid_field", { field: "route_id" });
  const normalized = value.trim().toLowerCase();
  if (!normalized && allowEmpty) return "";
  if (!/^[a-z][a-z0-9_]{2,127}$/.test(normalized)) failure("route_id 格式无效。", "launch_request_invalid_field", { field: "route_id" });
  if (normalized !== LAUNCH_REQUEST_ROUTE_ID) failure("当前仅支持 oceanengine_3_byte_mini_game 路线。", "launch_request_route_not_supported", { field: "route_id" });
  return normalized;
}

function gameCode(value, allowEmpty = false) {
  if (typeof value !== "string") failure("game_code 必须是字符串。", "launch_request_invalid_field", { field: "game_code" });
  const normalized = value.trim().toUpperCase();
  if (!normalized && allowEmpty) return "";
  if (!/^[A-Z0-9_]{2,32}$/.test(normalized)) failure("game_code 格式无效。", "launch_request_invalid_field", { field: "game_code" });
  if (normalized !== LAUNCH_REQUEST_GAME_CODE) failure("当前仅支持 JSZC 游戏。", "launch_request_game_not_supported", { field: "game_code" });
  return normalized;
}

function advertiserId(value, allowEmpty = false) {
  if (typeof value !== "string") failure("advertiser_id 必须是字符串。", "launch_request_invalid_field", { field: "advertiser_id" });
  const normalized = value.trim();
  if (!normalized && allowEmpty) return "";
  if (!/^\d{8,24}$/.test(normalized)) failure("advertiser_id 必须是 8 到 24 位数字字符串。", "launch_request_invalid_field", { field: "advertiser_id" });
  return normalized;
}

function partial(values, allowEmpty = false) {
  return {
    route_id: routeId(values.route_id, allowEmpty),
    game_code: gameCode(values.game_code, allowEmpty),
    advertiser_id: advertiserId(values.advertiser_id, allowEmpty)
  };
}

export function createLaunchRequest(values) {
  return { schema_version: LAUNCH_REQUEST_SCHEMA_VERSION, operation: LAUNCH_REQUEST_OPERATION, ...partial(values) };
}

export function createLaunchRequestDraft(values = {}) {
  return {
    schema_version: LAUNCH_REQUEST_SCHEMA_VERSION,
    operation: LAUNCH_REQUEST_OPERATION,
    route_id: String(values.route_id || ""),
    game_code: String(values.game_code || ""),
    advertiser_id: String(values.advertiser_id || "")
  };
}

export function normalizeLaunchRequestDraft(value = {}) {
  knownOnly(value, LAUNCH_REQUEST_FIELDS, "draft");
  if (Object.hasOwn(value, "schema_version") && value.schema_version !== LAUNCH_REQUEST_SCHEMA_VERSION) {
    failure("draft 的 schema_version 必须为 launch-request.v1。", "launch_request_schema_version_not_supported", { field: "schema_version" });
  }
  if (Object.hasOwn(value, "operation") && value.operation !== LAUNCH_REQUEST_OPERATION) {
    failure("draft 的 operation 当前仅支持 create_std_project。", "launch_request_operation_not_supported", { field: "operation" });
  }
  const draft = Object.fromEntries(DRAFT_FIELDS.map((field) => [field, Object.hasOwn(value, field) ? value[field] : ""]));
  return partial(draft, true);
}

export function validateLaunchRequest(request) {
  knownOnly(request, LAUNCH_REQUEST_FIELDS, "request");
  const missing = LAUNCH_REQUEST_FIELDS.filter((field) => !Object.hasOwn(request, field));
  if (missing.length) failure("request 缺少必填字段。", "launch_request_missing_fields", { fields: missing });
  if (typeof request.schema_version !== "string" || request.schema_version !== LAUNCH_REQUEST_SCHEMA_VERSION) {
    failure("schema_version 必须为 launch-request.v1。", "launch_request_schema_version_not_supported", { field: "schema_version" });
  }
  if (typeof request.operation !== "string" || request.operation !== LAUNCH_REQUEST_OPERATION) {
    failure("operation 当前仅支持 create_std_project。", "launch_request_operation_not_supported", { field: "operation" });
  }
  return createLaunchRequest(request);
}

function camel(field) {
  return field.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function directFieldsPresent(body) {
  return DRAFT_FIELDS.some((field) => Object.hasOwn(body, field) || Object.hasOwn(body, camel(field)));
}

function pick(body, field) {
  return Object.hasOwn(body, field) ? body[field] : body[camel(field)];
}

export function normalizeLaunchRequestFromBody(body = {}, { allowNatural = true } = {}) {
  object(body, "请求体");
  const hasRequest = Object.hasOwn(body, "request");
  const hasDirect = directFieldsPresent(body);
  const userIntent = String(body.user_intent || body.userIntent || "").trim();
  const sourceCount = Number(hasRequest) + Number(hasDirect) + Number(Boolean(userIntent));
  if (!sourceCount) failure("请提供 request 或投放创建输入。", "launch_request_input_required");
  if (sourceCount > 1) failure("一次提交只能使用一种投放创建输入。", "launch_request_input_conflict");
  if (hasRequest) return { request: validateLaunchRequest(body.request), source: "structured_json" };
  if (hasDirect) return { request: createLaunchRequest(Object.fromEntries(DRAFT_FIELDS.map((field) => [field, pick(body, field)]))), source: "legacy_fields" };
  if (!allowNatural) failure("此入口只接受标准 request。", "launch_request_input_required");
  const parsed = parseLaunchIntake(userIntent);
  if (parsed.issues?.length) failure("当前输入需要澄清，不能创建投放任务。", "launch_request_needs_clarification", { codes: parsed.issues });
  return { request: createLaunchRequest(parsed), source: "legacy_natural_language" };
}

export function missingLaunchRequestFields(request) {
  return DRAFT_FIELDS.filter((field) => !request[field]);
}

export function toLaunchRequestResponse({ draft, parseSource, source, slotSources = {}, issues = [] }) {
  const request = createLaunchRequestDraft(draft);
  return {
    request,
    route_id: request.route_id,
    game_code: request.game_code,
    advertiser_id: request.advertiser_id,
    missing_fields: missingLaunchRequestFields(request),
    parse_source: parseSource,
    slot_sources: slotSources,
    source,
    issues
  };
}

export function launchRequestIssue(code) {
  const messages = {
    operation_not_supported: "当前仅支持新建标准项目；修改 ROI、追加素材和修改既有配置暂未开放。",
    multiple_advertiser_ids: "检测到多个账户 ID，请只保留一个账户后重试。"
  };
  return { code, message: messages[code] || "当前输入需要澄清。" };
}
