import { parseLaunchIntake } from "./launchAgent.mjs";
import { createHash } from "node:crypto";

export const LAUNCH_REQUEST_SCHEMA_VERSION = "launch-request.v1";
export const LAUNCH_REQUEST_SCHEMA_VERSION_V2 = "launch-request.v2";
export const LAUNCH_REQUEST_OPERATION = "create_std_project";
export const PROJECT_VIDEO_APPEND_OPERATION = "append_project_videos";
export const LAUNCH_REQUEST_ROUTE_ID = "oceanengine_3_byte_mini_game";
export const LAUNCH_REQUEST_GAME_CODE = "JSZC";
export const LAUNCH_REQUEST_FIELDS = ["schema_version", "operation", "route_id", "game_code", "advertiser_id"];
export const PROJECT_VIDEO_APPEND_FIELDS = ["schema_version", "operation", "route_id", "game_code", "advertiser_id", "project_id", "origin_resource_ids"];
const DRAFT_FIELDS = ["route_id", "game_code", "advertiser_id"];

// This is the single request-contract boundary. Intent parsing may only choose
// one of these operations; workflow code decides the corresponding actions.
export const LAUNCH_OPERATION_CONTRACTS = Object.freeze({
  [LAUNCH_REQUEST_OPERATION]: Object.freeze({
    requiredFields: DRAFT_FIELDS,
    acceptedSchemaVersions: [LAUNCH_REQUEST_SCHEMA_VERSION, LAUNCH_REQUEST_SCHEMA_VERSION_V2]
  }),
  [PROJECT_VIDEO_APPEND_OPERATION]: Object.freeze({
    requiredFields: [...DRAFT_FIELDS, "project_id", "origin_resource_ids"],
    acceptedSchemaVersions: [LAUNCH_REQUEST_SCHEMA_VERSION_V2]
  })
});

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

function projectId(value, allowEmpty = false) {
  if (typeof value !== "string") failure("project_id 必须是字符串。", "launch_request_invalid_field", { field: "project_id" });
  const normalized = value.trim();
  if (!normalized && allowEmpty) return "";
  if (!/^\d{8,24}$/.test(normalized)) failure("project_id 必须是 8 到 24 位数字字符串。", "launch_request_invalid_field", { field: "project_id" });
  return normalized;
}

function originResourceIds(value, allowEmpty = false) {
  if (!Array.isArray(value)) failure("origin_resource_ids 必须是数组。", "launch_request_invalid_field", { field: "origin_resource_ids" });
  const ids = value.map((item) => {
    if (typeof item !== "string") failure("origin_resource_ids 必须只包含字符串。", "launch_request_invalid_field", { field: "origin_resource_ids" });
    const id = item.trim();
    if (!/^[A-Za-z0-9._:-]{2,128}$/.test(id)) failure("素材标识码格式无效。", "launch_request_invalid_field", { field: "origin_resource_ids" });
    return id;
  });
  const unique = [...new Set(ids)];
  if (ids.length !== unique.length) failure("素材标识码包含重复项。", "launch_request_duplicate_origin_resource_id");
  if (!unique.length && !allowEmpty) failure("至少需要一个素材标识码。", "launch_request_missing_fields", { fields: ["origin_resource_ids"] });
  if (unique.length > 100) failure("单次最多追加 100 个素材标识码，请拆分提交。", "launch_request_origin_resource_ids_exceed_limit");
  return unique;
}

function partial(values, allowEmpty = false) {
  return {
    route_id: routeId(values.route_id, allowEmpty),
    game_code: gameCode(values.game_code, allowEmpty),
    advertiser_id: advertiserId(values.advertiser_id, allowEmpty)
  };
}

export function createLaunchRequest(values) {
  const schemaVersion = values.schema_version || values.schemaVersion || LAUNCH_REQUEST_SCHEMA_VERSION;
  if (!LAUNCH_OPERATION_CONTRACTS[LAUNCH_REQUEST_OPERATION].acceptedSchemaVersions.includes(schemaVersion)) {
    failure("创建标准项目请求的 schema_version 不受支持。", "launch_request_schema_version_not_supported", { field: "schema_version" });
  }
  return { schema_version: schemaVersion, operation: LAUNCH_REQUEST_OPERATION, ...partial(values) };
}

export function createLaunchRequestDraft(values = {}) {
  return {
    schema_version: values.schema_version === LAUNCH_REQUEST_SCHEMA_VERSION_V2 ? LAUNCH_REQUEST_SCHEMA_VERSION_V2 : LAUNCH_REQUEST_SCHEMA_VERSION,
    operation: LAUNCH_REQUEST_OPERATION,
    route_id: String(values.route_id || ""),
    game_code: String(values.game_code || ""),
    advertiser_id: String(values.advertiser_id || "")
  };
}

export function normalizeLaunchRequestDraft(value = {}) {
  const operation = value.operation || LAUNCH_REQUEST_OPERATION;
  const contract = LAUNCH_OPERATION_CONTRACTS[operation];
  if (!contract) failure("operation 当前不受支持。", "launch_request_operation_not_supported", { field: "operation" });
  knownOnly(value, operation === PROJECT_VIDEO_APPEND_OPERATION ? PROJECT_VIDEO_APPEND_FIELDS : LAUNCH_REQUEST_FIELDS, "draft");
  if (Object.hasOwn(value, "schema_version") && !contract.acceptedSchemaVersions.includes(value.schema_version)) {
    failure("draft 的 schema_version 不受支持。", "launch_request_schema_version_not_supported", { field: "schema_version" });
  }
  if (operation === PROJECT_VIDEO_APPEND_OPERATION) return createProjectVideoAppendRequestDraft(value);
  const draft = Object.fromEntries(DRAFT_FIELDS.map((field) => [field, Object.hasOwn(value, field) ? value[field] : ""]));
  return { schema_version: value.schema_version || LAUNCH_REQUEST_SCHEMA_VERSION, operation, ...partial(draft, true) };
}

export function validateLaunchRequest(request) {
  const operation = request?.operation;
  if (operation === PROJECT_VIDEO_APPEND_OPERATION) {
    return validateProjectVideoAppendRequest(request);
  }
  if (operation !== LAUNCH_REQUEST_OPERATION) failure("operation 当前不受支持。", "launch_request_operation_not_supported", { field: "operation" });
  knownOnly(request, LAUNCH_REQUEST_FIELDS, "request");
  const missing = LAUNCH_REQUEST_FIELDS.filter((field) => !Object.hasOwn(request, field));
  if (missing.length) failure("request 缺少必填字段。", "launch_request_missing_fields", { fields: missing });
  if (typeof request.schema_version !== "string" || !LAUNCH_OPERATION_CONTRACTS[LAUNCH_REQUEST_OPERATION].acceptedSchemaVersions.includes(request.schema_version)) {
    failure("创建标准项目请求的 schema_version 不受支持。", "launch_request_schema_version_not_supported", { field: "schema_version" });
  }
  if (typeof request.operation !== "string" || request.operation !== LAUNCH_REQUEST_OPERATION) {
    failure("operation 当前仅支持 create_std_project。", "launch_request_operation_not_supported", { field: "operation" });
  }
  return createLaunchRequest(request);
}

export function createProjectVideoAppendRequest(values = {}) {
  return {
    schema_version: LAUNCH_REQUEST_SCHEMA_VERSION_V2,
    operation: PROJECT_VIDEO_APPEND_OPERATION,
    route_id: routeId(values.route_id),
    game_code: gameCode(values.game_code),
    advertiser_id: advertiserId(values.advertiser_id),
    project_id: projectId(values.project_id),
    origin_resource_ids: originResourceIds(values.origin_resource_ids)
  };
}

export function createProjectVideoAppendRequestDraft(values = {}) {
  return {
    schema_version: LAUNCH_REQUEST_SCHEMA_VERSION_V2,
    operation: PROJECT_VIDEO_APPEND_OPERATION,
    route_id: String(values.route_id || "").trim(),
    game_code: String(values.game_code || "").trim(),
    advertiser_id: String(values.advertiser_id || "").trim(),
    project_id: String(values.project_id || "").trim(),
    origin_resource_ids: Array.isArray(values.origin_resource_ids)
      ? values.origin_resource_ids.map((item) => String(item || "").trim()).filter(Boolean)
      : []
  };
}

export function validateProjectVideoAppendRequest(request) {
  knownOnly(request, PROJECT_VIDEO_APPEND_FIELDS, "request");
  const missing = PROJECT_VIDEO_APPEND_FIELDS.filter((field) => !Object.hasOwn(request, field));
  if (missing.length) failure("request 缺少必填字段。", "launch_request_missing_fields", { fields: missing });
  if (request.schema_version !== LAUNCH_REQUEST_SCHEMA_VERSION_V2) {
    failure("追加素材请求必须使用 launch-request.v2。", "launch_request_schema_version_not_supported", { field: "schema_version" });
  }
  if (request.operation !== PROJECT_VIDEO_APPEND_OPERATION) {
    failure("当前追加事项仅支持 append_project_videos。", "launch_request_operation_not_supported", { field: "operation" });
  }
  return createProjectVideoAppendRequest(request);
}

// Intake may receive a concise append request. It is never a runnable
// LaunchRequest until the authenticated server resolves the target project
// and supplies its verified route/game context.
export function validateProjectVideoAppendIntakeRequest(request) {
  knownOnly(request, PROJECT_VIDEO_APPEND_FIELDS, "request");
  const required = ["schema_version", "operation", "advertiser_id", "project_id", "origin_resource_ids"];
  const missing = required.filter((field) => !Object.hasOwn(request, field));
  if (missing.length) failure("request 缺少必填字段。", "launch_request_missing_fields", { fields: missing });
  if (request.schema_version !== LAUNCH_REQUEST_SCHEMA_VERSION_V2) {
    failure("追加素材请求必须使用 launch-request.v2。", "launch_request_schema_version_not_supported", { field: "schema_version" });
  }
  if (request.operation !== PROJECT_VIDEO_APPEND_OPERATION) {
    failure("当前追加事项仅支持 append_project_videos。", "launch_request_operation_not_supported", { field: "operation" });
  }
  return {
    schema_version: LAUNCH_REQUEST_SCHEMA_VERSION_V2,
    operation: PROJECT_VIDEO_APPEND_OPERATION,
    route_id: Object.hasOwn(request, "route_id") ? routeId(request.route_id, true) : "",
    game_code: Object.hasOwn(request, "game_code") ? gameCode(request.game_code, true) : "",
    advertiser_id: advertiserId(request.advertiser_id),
    project_id: projectId(request.project_id),
    origin_resource_ids: originResourceIds(request.origin_resource_ids)
  };
}

function camel(field) {
  return field.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function directFieldsPresent(body) {
  return [...DRAFT_FIELDS, "project_id", "origin_resource_ids", "operation", "schema_version"]
    .some((field) => Object.hasOwn(body, field) || Object.hasOwn(body, camel(field)));
}

function pick(body, field) {
  return Object.hasOwn(body, field) ? body[field] : body[camel(field)];
}

export function normalizeLaunchRequestFromBody(body = {}, { allowNatural = true } = {}) {
  object(body, "请求体");
  const hasRequest = Object.hasOwn(body, "request");
  const hasDirect = directFieldsPresent(body);
  const userIntent = String(body.user_intent || body.userIntent || "").trim();
  if (!hasRequest && !hasDirect && !userIntent) failure("请提供 request 或投放执行输入。", "launch_request_input_required");
  // Legacy job callers carry a human-readable business_goal beside the three
  // canonical fields. The fields remain the sole source of the request; only
  // a structured request mixed with another request source is ambiguous.
  if (hasRequest && (hasDirect || userIntent)) failure("一次提交只能使用一种投放执行输入。", "launch_request_input_conflict");
  if (hasRequest) return { request: validateLaunchRequest(body.request), source: "structured_json" };
  if (hasDirect) {
    const operation = pick(body, "operation") || LAUNCH_REQUEST_OPERATION;
    if (!LAUNCH_OPERATION_CONTRACTS[operation]) failure("operation 当前不受支持。", "launch_request_operation_not_supported", { field: "operation" });
    if (operation === PROJECT_VIDEO_APPEND_OPERATION) {
      return {
        request: validateProjectVideoAppendRequest(Object.fromEntries(PROJECT_VIDEO_APPEND_FIELDS
          .map((field) => [field, field === "operation" ? operation : field === "schema_version" ? (pick(body, field) || LAUNCH_REQUEST_SCHEMA_VERSION_V2) : pick(body, field)]))),
        source: "legacy_fields"
      };
    }
    return { request: validateLaunchRequest({
      schema_version: pick(body, "schema_version") || LAUNCH_REQUEST_SCHEMA_VERSION,
      operation,
      ...Object.fromEntries(DRAFT_FIELDS.map((field) => [field, pick(body, field)]))
    }), source: "legacy_fields" };
  }
  if (!allowNatural) failure("此入口只接受标准 request。", "launch_request_input_required");
  const parsed = parseLaunchIntake(userIntent);
  if (parsed.issues?.length) failure("当前输入需要澄清，不能创建投放任务。", "launch_request_needs_clarification", { codes: parsed.issues });
  return { request: createLaunchRequest(parsed), source: "legacy_natural_language" };
}

export function missingLaunchRequestFields(request) {
  const fields = LAUNCH_OPERATION_CONTRACTS[request?.operation || LAUNCH_REQUEST_OPERATION]?.requiredFields || DRAFT_FIELDS;
  return fields.filter((field) => !request[field] || (Array.isArray(request[field]) && request[field].length === 0));
}

export function toLaunchRequestResponse({ draft, parseSource, source, slotSources = {}, modelAssist, issues = [] }) {
  const request = draft?.operation === PROJECT_VIDEO_APPEND_OPERATION
    ? createProjectVideoAppendRequestDraft(draft)
    : createLaunchRequestDraft(draft);
  return {
    request,
    route_id: request.route_id,
    game_code: request.game_code,
    advertiser_id: request.advertiser_id,
    ...(request.operation === PROJECT_VIDEO_APPEND_OPERATION ? {
      project_id: request.project_id,
      origin_resource_ids: request.origin_resource_ids
    } : {}),
    missing_fields: missingLaunchRequestFields(request),
    parse_source: parseSource,
    slot_sources: slotSources,
    ...(modelAssist ? { model_assist: modelAssist } : {}),
    source,
    issues
  };
}

export function launchRequestFingerprint(request = {}) {
  const normalized = validateLaunchRequest(request);
  const canonical = normalized.operation === PROJECT_VIDEO_APPEND_OPERATION
    ? { ...normalized, origin_resource_ids: [...normalized.origin_resource_ids].sort() }
    : normalized;
  return `sha256:${createHash("sha256").update(JSON.stringify(canonical)).digest("hex")}`;
}

export function launchRequestIssue(code) {
  const messages = {
    operation_not_supported: "当前仅支持新建标准项目或给已有项目追加视频；修改 ROI、出价、时段和其他既有配置暂未开放。",
    multiple_advertiser_ids: "检测到多个账户 ID，请只保留一个账户后重试。",
    operation_ambiguous: "未能确定是新建项目还是追加视频，请明确说明事项。",
    operation_conflict: "同一句包含多个执行事项，请拆分后分别提交。"
  };
  return { code, message: messages[code] || "当前输入需要澄清。" };
}
