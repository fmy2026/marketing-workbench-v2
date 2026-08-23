import { createHash } from "node:crypto";

const DEFAULT_ROUTE_ID = "oceanengine_3_byte_mini_game";

function firstMatch(text, pattern) {
  const match = text.match(pattern);
  return match ? match[1] || match[0] : "";
}

function normalizeRouteId(text) {
  if (/oceanengine_3_byte_mini_game/i.test(text)) return DEFAULT_ROUTE_ID;
  if (/巨量|穿山甲|oceanengine/i.test(text) && /小游戏|mini\s*game/i.test(text)) return DEFAULT_ROUTE_ID;
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

export function hashText(value) {
  return createHash("sha256").update(String(value ?? "")).digest("hex");
}

export function parseLaunchIntake(userIntent = "") {
  const text = String(userIntent || "").trim();
  const routeId = normalizeRouteId(text);
  const gameCode = normalizeGameCode(text);
  const advertiserId = normalizeAdvertiserId(text);
  const missingFields = [];
  if (!routeId) missingFields.push("route_id");
  if (!gameCode) missingFields.push("game_code");
  if (!advertiserId) missingFields.push("advertiser_id");

  return {
    route_id: routeId,
    game_code: gameCode,
    advertiser_id: advertiserId,
    routeId,
    gameCode,
    advertiserId,
    missing_fields: missingFields,
    missingFields,
    source_record_ref: text ? `api:intake:${hashText(text).slice(0, 16)}` : "api:intake:empty"
  };
}
