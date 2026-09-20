import { MI_ID, projectMiAsset, projectMiDetail, projectMiMeta, projectMiTrend, safeMiText } from "../platforms/marketIntelligenceClient.mjs";
import { miError } from "../security/marketIntelligenceConnectionStore.mjs";

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_GAMES = 5;
const CANDIDATES_PER_GAME = 40;
const RESULTS_PER_PAGE = 8;
const REPORT_SAMPLE_LIMIT = 30;

function shanghaiDay(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  return `${parts.find((part) => part.type === "year").value}-${parts.find((part) => part.type === "month").value}-${parts.find((part) => part.type === "day").value}`;
}

export function previousCompleteMonth(now = new Date()) {
  const day = shanghaiDay(now);
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(0);
  return date.toISOString().slice(0, 7);
}

export function monthRange(month, now = new Date()) {
  if (!MONTH.test(month || "")) throw miError("mi_month_required");
  const [year, monthNumber] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const currentDay = shanghaiDay(now);
  const from = `${month}-01`;
  const to = month === currentDay.slice(0, 7) ? currentDay : `${month}-${String(last).padStart(2, "0")}`;
  if (from > to) throw miError("mi_month_required");
  return { from, to, isCurrentMonth: month === currentDay.slice(0, 7) };
}

function cleanGame(value) {
  return safeMiText(value, 100).replace(/[\r\n]/g, " ").trim();
}

function normalizedGames(value) {
  if (!Array.isArray(value)) return [];
  const result = [];
  for (const item of value) {
    const game = cleanGame(item);
    if (game && !result.includes(game)) result.push(game);
  }
  if (result.length > MAX_GAMES) throw miError("mi_too_many_games");
  return result;
}

export function normalizeMarketIntelligenceFilters(value = {}, { now = new Date(), requireGames = false } = {}) {
  const games = normalizedGames(value.games || (value.game ? [value.game] : []));
  if (requireGames && !games.length) throw miError("mi_research_objects_required");
  const month = typeof value.month === "string" && value.month.trim() ? value.month.trim() : previousCompleteMonth(now);
  if (!MONTH.test(month)) throw miError("mi_month_required");
  const page = Number.isSafeInteger(value.page) && value.page > 0 && value.page <= 500 ? value.page : 1;
  const candidatePage = Number.isSafeInteger(value.candidatePage) && value.candidatePage > 0 && value.candidatePage <= 500 ? value.candidatePage : 1;
  return { games, month, page, candidatePage, ...monthRange(month, now) };
}

function hasMonthEvidence(trend, { from, to }) {
  const points = trend.points.filter((point) => point.date >= from && point.date <= to && point.value !== null);
  if (!points.length) return null;
  return {
    observedFrom: points[0].date,
    observedTo: points.at(-1).date,
    validPoints: points.length,
    points: points.map((point) => ({ date: point.date, value: point.value }))
  };
}

async function candidatesForGame(client, game, candidatePage) {
  const value = await client.json("/assets", { game, page: candidatePage, page_size: CANDIDATES_PER_GAME });
  if (!Array.isArray(value.data) || value.data.length > CANDIDATES_PER_GAME) throw miError("mi_invalid_response", 502);
  const meta = projectMiMeta(value.meta);
  return { assets: value.data.map(projectMiAsset), meta };
}

async function settledMap(values, mapper, concurrency = 4) {
  const output = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor++;
      try { output[index] = { status: "fulfilled", value: await mapper(values[index], index) }; }
      catch (reason) { output[index] = { status: "rejected", reason }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return output;
}

export async function searchMarketIntelligence({ client, filters, now = new Date() } = {}) {
  if (!client) throw miError("mi_connection_required", 409);
  const normalized = normalizeMarketIntelligenceFilters(filters, { now });
  const researchObjects = normalized.games.length ? normalized.games : [""];
  const groups = await settledMap(researchObjects, async (game) => {
    const candidate = await candidatesForGame(client, game, normalized.candidatePage);
    const projected = await settledMap(candidate.assets, async (asset) => {
      const response = await client.json("/stats/trend", { asset: asset.id, from: normalized.from, to: normalized.to });
      const trend = projectMiTrend(response.data);
      return { asset, evidence: hasMonthEvidence(trend, normalized), meta: projectMiMeta(response.meta) };
    });
    const valid = [];
    const failures = [];
    for (let index = 0; index < projected.length; index++) {
      const result = projected[index];
      if (result.status === "fulfilled") {
        if (result.value.evidence) valid.push({ ...result.value.asset, monthEvidence: result.value.evidence });
      } else failures.push(candidate.assets[index]?.id || "");
    }
    const total = candidate.meta.total;
    return {
      game: game || "全部游戏",
      assets: valid,
      candidateCount: candidate.assets.length,
      candidateTotal: total,
      queryComplete: total === null ? candidate.assets.length < CANDIDATES_PER_GAME : normalized.candidatePage * CANDIDATES_PER_GAME >= total,
      failedTrendCount: failures.length,
      meta: candidate.meta
    };
  });
  const completeGroups = groups.filter((item) => item.status === "fulfilled").map((item) => item.value);
  if (!completeGroups.length) throw miError("mi_query_failed", 502);
  const all = completeGroups.flatMap((group) => group.assets).sort((a, b) => a.game.localeCompare(b.game, "zh-CN") || a.title.localeCompare(b.title, "zh-CN"));
  const start = (normalized.page - 1) * RESULTS_PER_PAGE;
  const pageAssets = all.slice(start, start + RESULTS_PER_PAGE);
  const firstMeta = completeGroups.find((group) => group.meta)?.meta || {};
  return {
    filters: { games: normalized.games, month: normalized.month, page: normalized.page, candidatePage: normalized.candidatePage, from: normalized.from, to: normalized.to, isCurrentMonth: normalized.isCurrentMonth },
    assets: pageAssets,
    resultCount: all.length,
    pageSize: RESULTS_PER_PAGE,
    hasPreviousPage: normalized.page > 1,
    hasNextPage: start + RESULTS_PER_PAGE < all.length,
    canContinueSearch: completeGroups.some((group) => !group.queryComplete),
    loadedCandidateCount: completeGroups.reduce((sum, group) => sum + group.candidateCount, 0),
    failedTrendCount: completeGroups.reduce((sum, group) => sum + group.failedTrendCount, 0),
    researchObjects: completeGroups.map(({ game, candidateCount, candidateTotal, queryComplete, failedTrendCount }) => ({ game, candidateCount, candidateTotal, queryComplete, failedTrendCount })),
    meta: firstMeta
  };
}

function roundRobinSamples(groups, limit) {
  const pools = groups.map((group) => [...group.assets]);
  const selected = [];
  while (selected.length < limit) {
    let added = false;
    for (const pool of pools) {
      if (selected.length >= limit) break;
      const item = pool.shift();
      if (item) { selected.push(item); added = true; }
    }
    if (!added) break;
  }
  return selected;
}

function noUnsafeReportText(value, limit = 240) {
  const text = safeMiText(value, limit).replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
  return text;
}

export function deterministicReportNarrative({ filters, samples, detailFailures = 0 }) {
  const games = filters.games.join("、");
  const scope = `${filters.month}${filters.isCurrentMonth ? `（截至 ${filters.to}）` : ""}`;
  const zeros = samples.filter((sample) => sample.monthEvidence.points.some((point) => point.value === 0)).length;
  return {
    points: [
      { text: `本次基于 ${scope} 的有效观察，纳入 ${samples.length} 条已采集样本，覆盖 ${games}。`, assetIds: samples.slice(0, 3).map((sample) => sample.id) },
      { text: zeros ? `${zeros} 条样本在观察期内出现平台报告值为 0；0 仍属于有效观察，不能据此推断投放效果。` : "样本均以目标月份内的有效人气观察作为纳入依据；缺失日期没有补为 0。", assetIds: samples.slice(0, 3).map((sample) => sample.id) },
      { text: detailFailures ? `其中 ${detailFailures} 条素材的平台分析详情暂未取得；报告只展示已取得的标签与脚本。` : "代表素材的标签和脚本来自平台已有分析，结论只关联本次有效样本。", assetIds: samples.slice(0, 3).map((sample) => sample.id) }
    ],
    followUp: "继续关注后续采集是否补齐观察日期，并在具备效果数据后另行评估投放表现。"
  };
}

function validNarrative(candidate, samples) {
  if (!candidate || !Array.isArray(candidate.points) || candidate.points.length !== 3 || typeof candidate.followUp !== "string") return null;
  const ids = new Set(samples.map((sample) => sample.id));
  const points = [];
  for (const point of candidate.points) {
    if (!point || typeof point.text !== "string" || !Array.isArray(point.assetIds)) return null;
    const text = noUnsafeReportText(point.text);
    const assetIds = point.assetIds.filter((id) => typeof id === "string" && ids.has(id));
    if (!text || !assetIds.length || /\d/.test(text) || /https?:|roi|roas|预算|出价|忽略|执行|打开设置|调用|指令|token|密码|访问/i.test(text)) return null;
    points.push({ text, assetIds: [...new Set(assetIds)].slice(0, 5) });
  }
  const followUp = noUnsafeReportText(candidate.followUp);
  if (!followUp || /https?:|roi|roas|预算|出价|忽略|执行|打开设置|调用|指令|token|密码|访问/i.test(followUp)) return null;
  return { points, followUp };
}

export async function buildMarketIntelligenceReport({ client, filters, now = new Date(), model } = {}) {
  const normalized = normalizeMarketIntelligenceFilters(filters, { now, requireGames: true });
  const result = await searchMarketIntelligence({ client, filters: { ...normalized, page: 1 }, now });
  const groups = normalized.games.map((game) => ({ game, assets: result.assets.filter((asset) => asset.game === game) }));
  // The search endpoint holds one bounded candidate set. Re-read every research object so report selection is not limited by its first visible page.
  const fullGroups = await settledMap(normalized.games, async (game) => {
    const candidate = await candidatesForGame(client, game, normalized.candidatePage);
    const rows = await settledMap(candidate.assets, async (asset) => {
      const response = await client.json("/stats/trend", { asset: asset.id, from: normalized.from, to: normalized.to });
      const trend = projectMiTrend(response.data);
      const evidence = hasMonthEvidence(trend, normalized);
      return evidence ? { ...asset, monthEvidence: evidence } : null;
    });
    return { game, assets: rows.filter((row) => row.status === "fulfilled" && row.value).map((row) => row.value), meta: candidate.meta };
  });
  const availableGroups = fullGroups.filter((row) => row.status === "fulfilled").map((row) => row.value);
  const samples = roundRobinSamples(availableGroups, REPORT_SAMPLE_LIMIT);
  if (!samples.length) throw miError("mi_report_no_valid_samples", 422);
  const detailRows = await settledMap(samples, async (sample) => {
    const response = await client.json(`/assets/${sample.id}`);
    return projectMiDetail(response.data, sample.id);
  });
  let detailFailures = 0;
  const reportSamples = samples.map((sample, index) => {
    const detail = detailRows[index];
    if (detail.status !== "fulfilled") { detailFailures++; return { ...sample, script: "", detailAvailable: false }; }
    return { ...sample, labels: detail.value.asset.labels, script: detail.value.script, detailAvailable: true };
  });
  const deterministic = deterministicReportNarrative({ filters: normalized, samples: reportSamples, detailFailures });
  let narrative = deterministic;
  let aiStatus = "not_configured";
  if (model?.summarizeReport) {
    try {
      const candidate = await model.summarizeReport({
        research: { month: normalized.month, games: normalized.games, sampleCount: reportSamples.length },
        samples: reportSamples.map((sample) => ({ id: sample.id, game: sample.game, labels: sample.labels, script: sample.script, observedFrom: sample.monthEvidence.observedFrom, observedTo: sample.monthEvidence.observedTo }))
      });
      const accepted = validNarrative(candidate, reportSamples);
      if (accepted) { narrative = accepted; aiStatus = "used"; }
      else aiStatus = "invalid_output";
    } catch { aiStatus = "unavailable"; }
  }
  return {
    type: "market_intelligence_monthly_report",
    filters: { games: normalized.games, month: normalized.month, from: normalized.from, to: normalized.to, isCurrentMonth: normalized.isCurrentMonth },
    sampleCount: reportSamples.length,
    sampleLimit: REPORT_SAMPLE_LIMIT,
    sampleSelection: "每个研究对象轮流选取已采集候选中的有效样本，最多 30 条。",
    queryComplete: availableGroups.every((group) => group.meta.total === null || normalized.candidatePage * CANDIDATES_PER_GAME >= group.meta.total),
    partialFailures: detailFailures,
    narrative,
    aiStatus,
    samples: reportSamples,
    source: result.meta,
    limitations: [
      "本报告基于已采集样本，不等同于研究对象的全量素材库。",
      "0 为平台报告值；缺失日期未补零。",
      "没有投放效果数据，本报告不评价 ROI 或投放归因。"
    ]
  };
}

export const MARKET_INTELLIGENCE_REPORT_LIMITS = Object.freeze({ CANDIDATES_PER_GAME, RESULTS_PER_PAGE, REPORT_SAMPLE_LIMIT });
