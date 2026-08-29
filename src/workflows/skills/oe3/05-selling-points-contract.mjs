export const SELLING_POINTS_CONTRACT = Object.freeze({
  minItems: 1,
  maxItems: 10,
  minChars: 6,
  maxChars: 9,
  ruleVersion: "2026-08-29.official-std-project-create-selling-points-v1",
  officialCreateRef: "open.oceanengine.com-3.0-waibugei/创建标准项目.md:166",
  officialMaterialRef: "open.oceanengine.com-3.0-waibugei/巨量营销智擎版/调控任务/更新项目自选素材状态.md:73"
});

function clean(value) {
  return String(value ?? "").trim();
}

function unicodeLength(value) {
  return [...String(value ?? "")].length;
}

function summaryFromLengths(lengths = []) {
  const numeric = lengths.filter((value) => Number.isInteger(value));
  return {
    minChars: numeric.length ? Math.min(...numeric) : 0,
    maxChars: numeric.length ? Math.max(...numeric) : 0
  };
}

export function evaluateSellingPointsContract(value, {
  blockerPrefix = "product_selling_points"
} = {}) {
  const blockers = [];
  if (!Array.isArray(value)) {
    return {
      status: "blocked",
      items: [],
      count: 0,
      minChars: 0,
      maxChars: 0,
      blockers: [`${blockerPrefix}_not_array`],
      ruleVersion: SELLING_POINTS_CONTRACT.ruleVersion
    };
  }

  if (value.length < SELLING_POINTS_CONTRACT.minItems || value.length > SELLING_POINTS_CONTRACT.maxItems) {
    blockers.push(`${blockerPrefix}_count_out_of_range:${value.length}`);
  }

  const items = [];
  const lengths = [];
  value.forEach((item, index) => {
    if (typeof item !== "string") {
      blockers.push(`${blockerPrefix}_item_not_string:${index}`);
      lengths.push(null);
      return;
    }
    const text = clean(item);
    const length = unicodeLength(text);
    items.push(text);
    lengths.push(length);
    if (!text) blockers.push(`${blockerPrefix}_item_empty:${index}`);
    if (length < SELLING_POINTS_CONTRACT.minChars || length > SELLING_POINTS_CONTRACT.maxChars) {
      blockers.push(`${blockerPrefix}_item_length_out_of_range:${index}:${length}`);
    }
  });

  const { minChars, maxChars } = summaryFromLengths(lengths);
  return {
    status: blockers.length ? "blocked" : "passed",
    items,
    count: value.length,
    minChars,
    maxChars,
    blockers,
    ruleVersion: SELLING_POINTS_CONTRACT.ruleVersion
  };
}

export function sellingPointsManifest(value, {
  source = "postgres:mwb.game_route_defaults.raw_defaults.payload_defaults.product.selling_points",
  blockerPrefix = "product_selling_points"
} = {}) {
  const result = evaluateSellingPointsContract(value, { blockerPrefix });
  return {
    productSellingPointsSource: source,
    productSellingPointsContractRuleVersion: result.ruleVersion,
    productSellingPointsCount: result.count,
    productSellingPointsMinChars: result.minChars,
    productSellingPointsMaxChars: result.maxChars,
    productSellingPointsValidated: result.status === "passed",
    productSellingPointsBlockerCount: result.blockers.length
  };
}

