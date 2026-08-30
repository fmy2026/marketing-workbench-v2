import { hashValue } from "./00-contracts.mjs";

export const CREATE_FIELD_LEDGER_VERSION = "2026-08-30.oe3-std-project-create-field-ledger-v2";

const ALWAYS_OMITTED_PATHS = Object.freeze([
  "micro_promotion_type",
  "project_materials.mini_program_info.app_id",
  "project_materials.mini_program_info.start_path",
  "project_materials.mini_program_info.params",
  "project_materials.anchor_material_list",
  "project_materials.component_material_list"
]);

const ENUM_RULES = Object.freeze({
  ad_type: ["ALL", "SEARCH"],
  landing_type: ["MICRO_GAME"],
  marketing_goal: ["VIDEO_AND_IMAGE"],
  native_type: ["AWEME"],
  delivery_mode: ["PROCEDURAL"],
  delivery_type: ["NORMAL", "UBX_INTELLIGENT"],
  delivery_medium: ["BYTE_GAME"],
  schedule_type: ["SCHEDULE_FROM_NOW"],
  bid_type: ["CUSTOM", "NO_BID"],
  budget_mode: ["BUDGET_MODE_DAY"],
  pricing: ["PRICING_OCPM"],
  audience_type: ["CUSTOM"],
  "audience.district": ["NONE"],
  "audience.gender": ["GENDER_UNLIMITED"],
  "audience.hide_if_converted": ["NO_EXCLUDE"],
  "project_materials.anchor_related_type": ["OFF"],
  "track_url_setting.send_type": ["SERVER_SEND"],
  aigc_dynamic_creative_switch: ["OFF"],
  layer_roi_switch: ["OFF"],
  is_comment_disable: ["OFF"]
});

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function normalizedPath(parts = []) {
  return parts.map((part) => /^\d+$/.test(String(part)) ? "[]" : part).join(".");
}

function fieldGroup(path = "") {
  if (path.startsWith("audience.")) return "audience";
  if (path.startsWith("brand_info.")) return "brand";
  if (path.startsWith("project_materials.")) return "materials";
  if (path.startsWith("track_url_setting.")) return "tracking";
  if (["budget", "cpa_bid", "roi_goal", "pricing", "bid_type", "budget_mode", "schedule_type"].includes(path)) return "optimization";
  return "identity_delivery";
}

function leafEntry(path, value) {
  const isArray = Array.isArray(value);
  const valueType = isArray ? "array" : value === null ? "null" : typeof value;
  const enumValues = ENUM_RULES[path] || [];
  return {
    path,
    group: fieldGroup(path),
    sendPolicy: "send",
    valueType,
    itemCount: isArray ? value.length : null,
    stringLength: typeof value === "string" ? Array.from(value).length : null,
    enumRule: enumValues.length ? enumValues : [],
    enumMatched: enumValues.length ? enumValues.includes(value) : null,
    valueHash: hashValue(canonicalJson(value)),
    preCreateStatus: enumValues.length && !enumValues.includes(value) ? "blocked" : "passed",
    rawValueStored: false
  };
}

function collectEntries(value, parts = [], entries = []) {
  const path = normalizedPath(parts);
  if (Array.isArray(value)) {
    entries.push(leafEntry(path, value));
    value.forEach((item, index) => collectEntries(item, [...parts, String(index)], entries));
    return entries;
  }
  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, child]) => collectEntries(child, [...parts, key], entries));
    return entries;
  }
  entries.push(leafEntry(path, value));
  return entries;
}

function hasPath(value, dotted) {
  return dotted.split(".").every((part) => {
    if (!value || typeof value !== "object" || !Object.hasOwn(value, part)) return false;
    value = value[part];
    return true;
  });
}

export function evaluateCreateFieldLedger(payload = {}, {
  externalUrlMaterialListPolicy = "omit",
  filterEventPolicy = "omit"
} = {}) {
  const entries = collectEntries(payload)
    .filter((entry) => entry.path)
    .sort((left, right) => left.path.localeCompare(right.path));
  const omittedPaths = [
    ...ALWAYS_OMITTED_PATHS,
    ...(externalUrlMaterialListPolicy === "omit" ? ["project_materials.external_url_material_list"] : []),
    ...(filterEventPolicy === "omit" ? ["audience.filter_event"] : [])
  ];
  const omitted = omittedPaths.map((path) => ({
    path,
    group: fieldGroup(path),
    sendPolicy: "omit",
    valueType: "absent",
    itemCount: null,
    stringLength: null,
    enumRule: [],
    enumMatched: null,
    valueHash: "",
    preCreateStatus: hasPath(payload, path) ? "blocked" : "passed",
    rawValueStored: false
  }));
  const allEntries = [...entries, ...omitted];
  const blocked = allEntries.filter((entry) => entry.preCreateStatus !== "passed");
  return {
    status: blocked.length ? "blocked" : "passed",
    ruleVersion: CREATE_FIELD_LEDGER_VERSION,
    checkedPathCount: allEntries.length,
    blockedPathCount: blocked.length,
    groups: [...new Set(allEntries.map((entry) => entry.group))],
    entries: allEntries,
    rawPayloadStored: false
  };
}

export function createFieldLedgerManifest(ledger = {}) {
  return {
    status: ledger.status || "blocked",
    ruleVersion: ledger.ruleVersion || CREATE_FIELD_LEDGER_VERSION,
    checkedPathCount: Number(ledger.checkedPathCount || 0),
    blockedPathCount: Number(ledger.blockedPathCount || 0),
    groups: Array.isArray(ledger.groups) ? ledger.groups : [],
    entries: Array.isArray(ledger.entries) ? ledger.entries.map((entry) => ({
      path: entry.path || "",
      group: entry.group || "",
      sendPolicy: entry.sendPolicy || "",
      valueType: entry.valueType || "",
      itemCount: entry.itemCount ?? null,
      stringLength: entry.stringLength ?? null,
      enumRule: Array.isArray(entry.enumRule) ? entry.enumRule : [],
      enumMatched: entry.enumMatched ?? null,
      valueHash: entry.valueHash || "",
      preCreateStatus: entry.preCreateStatus || "blocked",
      rawValueStored: false
    })) : [],
    postCreateStatus: "manual_console_verification_required",
    rawPayloadStored: false
  };
}
