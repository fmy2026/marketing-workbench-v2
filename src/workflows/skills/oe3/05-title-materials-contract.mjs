import { hashValue } from "./00-contracts.mjs";

export const TITLE_MATERIAL_CONTRACT = Object.freeze({
  minItems: 1,
  maxItems: 30,
  minChars: 5,
  maxChars: 55,
  source: "postgres:mwb.material_packs+material_pack_items+game_assets.asset_type=title_material",
  ruleVersion: "2026-08-29.official-std-project-create-title-material-v1",
  officialCreateRef: "open.oceanengine.com-3.0-waibugei/巨量营销智擎版/创建标准项目.md:160",
  officialMaterialRef: "open.oceanengine.com-3.0-waibugei/巨量营销智擎版/调控任务/更新项目自选素材状态.md:73"
});

const FILENAME_FEATURE_PATTERN = /[\\/]|(\.(mp4|mov|m4v|avi|wmv|png|jpe?g|webp|gif|psd|ai)$)|\bMD5\s*=|^[A-Za-z0-9]+[-_+][A-Za-z0-9+_-]+$/i;

function clean(value) {
  return String(value ?? "").trim();
}

function titleCharUnits(value) {
  let total = 0;
  let englishRun = 0;
  const flushEnglish = () => {
    if (!englishRun) return;
    total += Math.ceil(englishRun / 2);
    englishRun = 0;
  };
  for (const char of String(value ?? "")) {
    if (/^[A-Za-z]$/.test(char)) {
      englishRun += 1;
    } else {
      flushEnglish();
      total += 1;
    }
  }
  flushEnglish();
  return total;
}

function summaryFromLengths(lengths = []) {
  const numeric = lengths.filter((value) => Number.isFinite(value));
  return {
    minChars: numeric.length ? Math.min(...numeric) : 0,
    maxChars: numeric.length ? Math.max(...numeric) : 0
  };
}

function titleShapeBlockers(title, index, blockerPrefix) {
  const blockers = [];
  if (FILENAME_FEATURE_PATTERN.test(title)) blockers.push(`${blockerPrefix}_item_filename_like:${index}`);
  return blockers;
}

function evaluateTitleStrings(values = [], {
  blockerPrefix = "title_material"
} = {}) {
  const blockers = [];
  if (!Array.isArray(values)) {
    return {
      status: "blocked",
      items: [],
      count: 0,
      minChars: 0,
      maxChars: 0,
      blockers: [`${blockerPrefix}_not_array`],
      ruleVersion: TITLE_MATERIAL_CONTRACT.ruleVersion
    };
  }

  if (values.length < TITLE_MATERIAL_CONTRACT.minItems || values.length > TITLE_MATERIAL_CONTRACT.maxItems) {
    blockers.push(`${blockerPrefix}_count_out_of_range:${values.length}`);
  }

  const seen = new Set();
  const items = [];
  const lengths = [];
  values.forEach((item, index) => {
    if (typeof item !== "string") {
      blockers.push(`${blockerPrefix}_item_not_string:${index}`);
      lengths.push(null);
      return;
    }
    const title = clean(item);
    const length = titleCharUnits(title);
    items.push(title);
    lengths.push(length);
    if (!title) blockers.push(`${blockerPrefix}_item_empty:${index}`);
    if (length < TITLE_MATERIAL_CONTRACT.minChars || length > TITLE_MATERIAL_CONTRACT.maxChars) {
      blockers.push(`${blockerPrefix}_item_length_out_of_range:${index}:${length}`);
    }
    if (seen.has(title)) blockers.push(`${blockerPrefix}_item_duplicate:${index}`);
    seen.add(title);
    blockers.push(...titleShapeBlockers(title, index, blockerPrefix));
  });

  const { minChars, maxChars } = summaryFromLengths(lengths);
  return {
    status: blockers.length ? "blocked" : "passed",
    items,
    count: values.length,
    minChars,
    maxChars,
    blockers,
    ruleVersion: TITLE_MATERIAL_CONTRACT.ruleVersion
  };
}

export function evaluateTitleMaterialPayloadList(value, {
  blockerPrefix = "title_material"
} = {}) {
  if (!Array.isArray(value)) {
    return evaluateTitleStrings(value, { blockerPrefix });
  }
  return evaluateTitleStrings(value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    if (!Object.hasOwn(item, "title")) return undefined;
    return item.title;
  }), { blockerPrefix });
}

export function evaluateTitleMaterialSourceEntries(entries = [], {
  blockerPrefix = "route_title_material"
} = {}) {
  const blockers = [];
  if (!Array.isArray(entries)) {
    return {
      status: "blocked",
      items: [],
      count: 0,
      minChars: 0,
      maxChars: 0,
      assetIds: [],
      assetHashes: [],
      sourceTypeMismatchCount: 0,
      filenameLikeCount: 0,
      blockers: [`${blockerPrefix}_source_not_array`],
      ruleVersion: TITLE_MATERIAL_CONTRACT.ruleVersion
    };
  }

  let sourceTypeMismatchCount = 0;
  const selected = [];
  entries.forEach((entry, index) => {
    const itemType = clean(entry?.item?.item_type);
    const assetType = clean(entry?.asset?.asset_type);
    if (itemType === "title_material" && assetType !== "title_material") {
      sourceTypeMismatchCount += 1;
      blockers.push(`${blockerPrefix}_asset_type_mismatch:${index}:${assetType || "missing"}`);
    }
    if (itemType !== "title_material" && assetType === "title_material") {
      sourceTypeMismatchCount += 1;
      blockers.push(`${blockerPrefix}_item_type_mismatch:${index}:${itemType || "missing"}`);
    }
    if (itemType === "title_material" && clean(entry?.item?.status || "active") === "active" && entry?.item?.required === true) {
      selected.push({ entry, index });
    }
  });

  const titleResult = evaluateTitleStrings(selected.map(({ entry }) => entry?.asset?.asset_name), { blockerPrefix });
  const sourceAssetBlockers = selected.flatMap(({ entry, index }) => {
    const itemAssetId = clean(entry?.item?.asset_id);
    const assetId = clean(entry?.asset?.asset_id);
    const itemRef = clean(entry?.item?.asset_ref);
    const assetRef = clean(entry?.asset?.asset_ref);
    return [
      ...(!assetId ? [`${blockerPrefix}_asset_id_missing:${index}`] : []),
      ...(itemAssetId && assetId && itemAssetId !== assetId ? [`${blockerPrefix}_asset_id_mismatch:${index}`] : []),
      ...(assetId && !itemRef ? [`${blockerPrefix}_asset_ref_missing:${index}`] : []),
      ...(assetRef && itemRef && assetRef !== itemRef ? [`${blockerPrefix}_asset_ref_mismatch:${index}`] : [])
    ];
  });
  const combinedBlockers = [...blockers, ...sourceAssetBlockers, ...titleResult.blockers];
  const titles = titleResult.items;
  const assetIds = selected.map(({ entry }) => clean(entry?.asset?.asset_id || entry?.item?.asset_id)).filter(Boolean);
  const assetHashes = selected
    .map(({ entry }, index) => clean(entry?.asset?.asset_hash) || hashValue(titles[index] || ""))
    .filter(Boolean);
  return {
    status: combinedBlockers.length ? "blocked" : "passed",
    items: titles.map((title) => ({ title })),
    count: titleResult.count,
    minChars: titleResult.minChars,
    maxChars: titleResult.maxChars,
    assetIds,
    assetHashes,
    sourceTypeMismatchCount,
    filenameLikeCount: titleResult.blockers.filter((blocker) => blocker.includes("_item_filename_like:")).length,
    blockers: combinedBlockers,
    ruleVersion: TITLE_MATERIAL_CONTRACT.ruleVersion
  };
}

export function titleMaterialsManifest(result = {}) {
  return {
    titleMaterialSource: TITLE_MATERIAL_CONTRACT.source,
    titleMaterialPackId: clean(result.packId),
    titleMaterialContractRuleVersion: result.ruleVersion || TITLE_MATERIAL_CONTRACT.ruleVersion,
    titleMaterialAssetIds: Array.isArray(result.assetIds) ? result.assetIds : [],
    titleMaterialAssetHashes: Array.isArray(result.assetHashes) ? result.assetHashes : [],
    titleMaterialCount: Number(result.count || 0),
    titleMaterialMinChars: Number(result.minChars || 0),
    titleMaterialMaxChars: Number(result.maxChars || 0),
    titleMaterialValidated: result.status === "passed",
    titleMaterialBlockerCount: Array.isArray(result.blockers) ? result.blockers.length : 0,
    titleMaterialSourceTypeMismatchCount: Number(result.sourceTypeMismatchCount || 0),
    titleMaterialFilenameLikeCount: Number(result.filenameLikeCount || 0)
  };
}
