const CST_TIME_ZONE = "Asia/Shanghai";

function text(value) {
  return String(value ?? "").trim();
}

function compactPart(value, fallback) {
  const normalized = text(value).replace(/\s+/g, "");
  return normalized || fallback;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function directionCode(materialPack) {
  const direction = text(materialPack?.pack?.summary?.direction || materialPack?.pack?.pack_name);
  if (/狩猎|hunt/i.test(direction)) return "HUNT";
  const ascii = direction.toUpperCase().replace(/[^A-Z0-9]+/g, "");
  return ascii.slice(0, 8) || "BASE";
}

function optCode(defaults) {
  const deepObjective = text(defaults?.deep_objective);
  if (/PURCHASE_ROI_7D|ROI_7D/i.test(deepObjective)) return "PAY7DROI";
  const objective = text(defaults?.objective);
  if (/PAY/i.test(objective)) return "PAY";
  return "OPT";
}

function unitSeq(value = 1) {
  const numeric = Number(value || 1);
  const safe = Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : 1;
  return String(safe).padStart(2, "0");
}

export function cstYyyymmdd(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(safeDate);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}${byType.month}${byType.day}`;
}

export function buildStdProjectNameParts({
  account,
  game,
  defaults,
  materialPack,
  yyyymmdd
}) {
  const monitorId = compactPart(account?.monitor_id, "MONITOR");
  const gameCode = compactPart(game?.game_code, "GAME");
  const targetLabel = compactPart(defaults?.targeting_summary, "平台定向不限");
  return {
    monitorId,
    projectScope: "N",
    gameCode,
    directionCode: directionCode(materialPack),
    optCode: optCode(defaults),
    targetLabel,
    yyyymmdd: compactPart(yyyymmdd, cstYyyymmdd())
  };
}

export function buildStdProjectNamePrefix(input) {
  const nameParts = buildStdProjectNameParts(input);
  return [
    nameParts.monitorId,
    nameParts.projectScope,
    nameParts.gameCode,
    nameParts.directionCode,
    nameParts.optCode,
    nameParts.targetLabel
  ].join("_");
}

export function allocateProjectSequence({ namePrefix, yyyymmdd, occupiedNames = [] }) {
  const pattern = new RegExp(`^${escapeRegExp(namePrefix)}_P(\\d{2,})_${escapeRegExp(yyyymmdd)}$`);
  const used = new Set(
    (Array.isArray(occupiedNames) ? occupiedNames : [])
      .map((name) => String(name || "").match(pattern))
      .filter(Boolean)
      .map((match) => Number(match[1]))
      .filter((value) => Number.isFinite(value) && value > 0)
  );
  let next = 1;
  while (used.has(next)) next += 1;
  return next;
}

export function buildStdProjectName({
  account,
  game,
  defaults,
  materialPack,
  sequence = 1,
  projectSeq,
  yyyymmdd
}) {
  const nameParts = buildStdProjectNameParts({
    account,
    game,
    defaults,
    materialPack,
    yyyymmdd
  });

  return [
    nameParts.monitorId,
    nameParts.projectScope,
    nameParts.gameCode,
    nameParts.directionCode,
    nameParts.optCode,
    nameParts.targetLabel,
    `P${unitSeq(projectSeq ?? sequence)}`,
    nameParts.yyyymmdd
  ].join("_");
}
