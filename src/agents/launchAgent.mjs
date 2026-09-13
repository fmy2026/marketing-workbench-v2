import { createHash } from "node:crypto";

const DEFAULT_ROUTE_ID = "oceanengine_3_byte_mini_game";

export const LAUNCH_INTAKE_FIELDS = Object.freeze(["route_id", "game_code", "advertiser_id"]);

const MODEL_EXPLICIT_ALIASES = Object.freeze({
  route_id: Object.freeze([
    Object.freeze({ value: DEFAULT_ROUTE_ID, aliases: Object.freeze(["抖小", "OE3", "OE3字节小游戏", "字节小游戏", "巨量小游戏", "穿山甲小游戏", "oceanengine_3_byte_mini_game"]) })
  ]),
  game_code: Object.freeze([
    Object.freeze({ value: "JSZC", aliases: Object.freeze(["巨兽战场", "JSZC", "jushou hunt", "jushou-hunt"]) })
  ])
});

function normalizedText(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function firstMatch(text, pattern) {
  const match = text.match(pattern);
  return match ? match[1] || match[0] : "";
}

function normalizeRouteId(text) {
  if (/oceanengine_3_byte_mini_game/i.test(text)) return DEFAULT_ROUTE_ID;
  if (/巨量|穿山甲|字节|oe3|oceanengine/i.test(text) && /小游戏|mini\s*game/i.test(text)) return DEFAULT_ROUTE_ID;
  return firstMatch(text, /\b([a-z][a-z0-9]+(?:_[a-z0-9]+){2,})\b/i);
}

function normalizeGameCode(text) {
  if (/\bJSZC\b/i.test(text) || /巨兽战场|jushou[-_ ]?hunt/i.test(text)) return "JSZC";
  const labelled = firstMatch(text, /(?:game_code|游戏标识|游戏|game)\s*[:：]?\s*([A-Za-z0-9_]{2,16})/i);
  return labelled ? labelled.toUpperCase() : "";
}

function normalizeAdvertiserId(text) {
  return firstMatch(text, /(?:advertiser_id|广告账户|账户|账号|advertiser)\s*[:：]?\s*(\d{8,24})/i) || firstMatch(text, /\b(\d{12,24})\b/);
}

function extractAdvertiserIds(text) {
  const values = new Set();
  const labelled = String(text || "").matchAll(/(?:advertiser_id|广告账户|账户|账号|advertiser)\s*[:：]?\s*(\d{8,24})/gi);
  for (const match of labelled) values.add(match[1]);
  if (!values.size) {
    for (const value of String(text || "").match(/\b\d{12,24}\b/g) || []) values.add(value);
  }
  return [...values];
}

export function detectUnsupportedLaunchOperation(text) {
  const value = String(text || "");
  if (!value.trim()) return "";
  if (
    /(?:只|仅)?(?:修改|调整|改)(?:[^。；，,\n]{0,20})(?:roi|出价|系数|配置)/i.test(value)
    || /(?:新增|增加|追加|上传)(?:[^。；，,\n]{0,12})(?:素材|视频|图片)/i.test(value)
    || /(?:已有|现有)(?:[^。；，,\n]{0,12})(?:项目|计划|投放)/i.test(value)
    || /(?:不要|不)(?:[^。；，,\n]{0,8})(?:新建|创建)/i.test(value)
  ) return "operation_not_supported";
  return "";
}

function camelKey(key) {
  return String(key).replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function messageIncludesEvidence(message = "", evidence = "") {
  const source = normalizedText(message);
  const quoted = normalizedText(evidence);
  return Boolean(source && quoted && source.includes(quoted));
}

export function explicitLaunchIntakeSlotSchema() {
  return Object.freeze({
    route_id: MODEL_EXPLICIT_ALIASES.route_id.map((entry) => ({ value: entry.value, aliases: [...entry.aliases] })),
    game_code: MODEL_EXPLICIT_ALIASES.game_code.map((entry) => ({ value: entry.value, aliases: [...entry.aliases] })),
    advertiser_id: { pattern: "8-24 digits explicitly present in the user message" }
  });
}

export function normalizeExplicitLaunchSlot({ key = "", value = "", evidence = "", message = "" } = {}) {
  const slot = String(key || "").trim();
  const candidate = String(value || "").trim();
  const quoted = String(evidence || "").trim();
  if (!LAUNCH_INTAKE_FIELDS.includes(slot) || !messageIncludesEvidence(message, quoted)) return "";
  if (slot === "advertiser_id") {
    const ids = String(message).match(/\b\d{8,24}\b/g) || [];
    return /^\d{8,24}$/.test(candidate) && ids.includes(candidate) && quoted === candidate ? candidate : "";
  }
  const entry = (MODEL_EXPLICIT_ALIASES[slot] || []).find((item) =>
    item.aliases.some((alias) => normalizedText(alias) === normalizedText(quoted))
  );
  return entry?.value === candidate ? candidate : "";
}

export function launchIntakeFieldValue(intake = {}, key = "") {
  return String(intake?.[key] || intake?.[camelKey(key)] || "").trim();
}

export function hasCompleteLaunchIntake(intake = {}) {
  return LAUNCH_INTAKE_FIELDS.every((key) => Boolean(launchIntakeFieldValue(intake, key)));
}

export function hashText(value) {
  return createHash("sha256").update(String(value ?? "")).digest("hex");
}

export function parseLaunchIntake(userIntent = "") {
  const text = String(userIntent || "").trim();
  const routeId = normalizeRouteId(text);
  const gameCode = normalizeGameCode(text);
  const advertiserIds = extractAdvertiserIds(text);
  const unsupportedOperation = detectUnsupportedLaunchOperation(text);
  const issues = [];
  if (unsupportedOperation) issues.push(unsupportedOperation);
  if (advertiserIds.length > 1) issues.push("multiple_advertiser_ids");
  const advertiserId = advertiserIds.length === 1 ? advertiserIds[0] : "";
  const missingFields = [];
  const values = unsupportedOperation
    ? { routeId: "", gameCode: "", advertiserId: "" }
    : { routeId, gameCode, advertiserId };
  if (!values.routeId) missingFields.push("route_id");
  if (!values.gameCode) missingFields.push("game_code");
  if (!values.advertiserId) missingFields.push("advertiser_id");

  return {
    route_id: values.routeId,
    game_code: values.gameCode,
    advertiser_id: values.advertiserId,
    routeId: values.routeId,
    gameCode: values.gameCode,
    advertiserId: values.advertiserId,
    issues,
    missing_fields: missingFields,
    missingFields,
    source_record_ref: text ? `api:intake:${hashText(text).slice(0, 16)}` : "api:intake:empty"
  };
}
