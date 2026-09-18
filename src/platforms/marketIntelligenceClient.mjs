import { miError, normalizeMiOrigin, normalizeMiToken } from "../security/marketIntelligenceConnectionStore.mjs";

export const MI_ID = /^[a-fA-F0-9]{32}$/;
export function miId(value) {
  if (typeof value !== "string" || !MI_ID.test(value)) throw miError("mi_invalid_asset");
  return value;
}

export function safeMiText(value, limit = 1000) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).replace(/https?:\/\/\S+/gi, "[链接已隐藏]")
    .replace(/Bearer\s+\S+/gi, "[凭证已隐藏]").replace(/[A-Za-z0-9_-]{64,}/g, "[长标识已隐藏]")
    .replace(/(?:[A-Za-z]:\\|\/(?:Users|home|tmp|private)\/)[^\s]+/g, "[路径已隐藏]")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").slice(0, limit);
}

const LABEL_KEYS = ["视觉特效程度", "视觉风格", "属性面板", "场景", "角色", "题材", "素材类型", "视频主题", "玩家动机", "营销卖点", "美术风格", "色彩体系"];
function labels(value, depth = 0) {
  if (depth > 3 || value == null) return [];
  if (Array.isArray(value)) return value.slice(0, 24).flatMap((item) => labels(item, depth + 1));
  if (typeof value === "string") return [safeMiText(value, 160)];
  if (typeof value !== "object") return [];
  return Object.entries(value).slice(0, 32).flatMap(([name, item]) => {
    if (LABEL_KEYS.includes(name)) {
      const content = Array.isArray(item) ? item.map((v) => safeMiText(v, 80)).filter(Boolean).join("、") : safeMiText(item, 160);
      return content ? [`${name}：${content}`] : labels(item, depth + 1);
    }
    if (["创意元素", "创意策略", "creative_labels", "labels", "tags"].includes(name)) return labels(item, depth + 1);
    if (["label", "name", "value"].includes(name) && typeof item === "string") return [safeMiText(item, 160)];
    return [];
  });
}

export function projectMiAsset(value) {
  if (!value || !MI_ID.test(value.id || value.asset_hash || value.hash || "")) throw miError("mi_invalid_response", 502);
  const id = value.id || value.asset_hash || value.hash;
  return {
    id,
    title: safeMiText(value.title || value.name || value.asset_name || value.creative_name, 160) || `素材 ${id.slice(0, 8)}`,
    game: safeMiText(value.game_name || (typeof value.game === "string" ? value.game : value.game?.name), 100),
    labels: labels(value.creative_labels || value.labels || value.tags).slice(0, 20),
    updatedAt: safeMiText(value.updated_at || value.collected_at, 50)
  };
}

export function projectMiMeta(value = {}) {
  return {
    source: safeMiText(value.source, 100), caliber: safeMiText(value.caliber, 60),
    timezone: safeMiText(value.timezone, 60), queriedAt: safeMiText(value.queried_at, 50),
    updatedAt: safeMiText(value.updated_at, 50),
    total: Number.isSafeInteger(value.total) && value.total >= 0 ? value.total : null
  };
}

function analysisText(value, depth = 0) {
  if (depth > 3 || value == null) return [];
  if (typeof value === "string") return [safeMiText(value, 4000)];
  if (Array.isArray(value)) return value.slice(0, 30).flatMap((item) => analysisText(item, depth + 1));
  if (typeof value !== "object") return [];
  const allowed = ["视频内容", "时间轴", "hook", "content", "description", "text", "time", "timestamp", "timeline", "video_content", "summary"];
  return Object.entries(value).filter(([key]) => allowed.includes(key)).flatMap(([key, item]) =>
    analysisText(item, depth + 1).map((text) => `${key}：${text}`));
}

export function projectMiDetail(data, id) {
  if (!data?.asset || typeof data.asset !== "object") throw miError("mi_invalid_response", 502);
  const asset = projectMiAsset({ ...data.asset, id: data.asset.id || id, creative_labels: data.asset.creative_labels || data.creative_labels });
  if (asset.id !== id) throw miError("mi_invalid_response", 502);
  return { asset, script: analysisText(data.asset.script_analysis || data.script_analysis).join("\n").slice(0, 10000) };
}

export function projectMiTrend(data) {
  if (!Array.isArray(data?.points) || data.points.length > 400) throw miError("mi_invalid_response", 502);
  const seen = new Set();
  const points = data.points.map((point) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(point?.date || "") || !Number.isFinite(Date.parse(point.date)) || new Date(point.date).toISOString().slice(0, 10) !== point.date || seen.has(point.date) ||
      !(point.popularity_daily === null || (Number.isSafeInteger(point.popularity_daily) && point.popularity_daily >= 0))) throw miError("mi_invalid_response", 502);
    seen.add(point.date);
    return { date: point.date, value: point.popularity_daily };
  }).sort((a, b) => a.date.localeCompare(b.date));
  // Do not derive rankings or replace the upstream summary with client statistics.
  const summary = data.summary || {};
  return { points, summary: {
    validPoints: Number.isSafeInteger(summary.valid_points) ? summary.valid_points : null,
    from: safeMiText(summary.from || summary.start_date || summary.first_date, 20),
    to: safeMiText(summary.to || summary.end_date || summary.last_date, 20),
    netChange: typeof summary.net_change === "number" && Number.isFinite(summary.net_change) ? summary.net_change : null
  } };
}

const STATUS_CODES = { 400: "mi_bad_query", 401: "mi_credentials_rejected", 403: "mi_access_denied", 404: "mi_not_found", 409: "mi_file_not_ready", 416: "mi_range_invalid", 429: "mi_rate_limited", 503: "mi_service_unavailable" };
export function createMiClient({ baseUrl, token, fetchImpl = globalThis.fetch } = {}) {
  const origin = normalizeMiOrigin(baseUrl);
  const credential = normalizeMiToken(token);
  async function request(path, { params = {}, method = "GET", range = "", signal } = {}) {
    if (!/^\/(health|assets|assets\/[a-fA-F0-9]{32}|stats\/trend|files\/[a-fA-F0-9]{32})$/.test(path) || !["GET", "HEAD"].includes(method)) throw miError("mi_bad_query");
    if (range && !/^bytes=(?:\d+-\d*|-\d+)$/.test(range)) throw miError("mi_range_invalid", 416);
    const url = new URL(`/api/v1${path}`, origin);
    for (const [name, value] of Object.entries(params)) if (value !== "" && value != null) url.searchParams.set(name, String(value));
    let response;
    try {
      response = await fetchImpl(url, { method, redirect: "error", headers: { authorization: `Bearer ${credential}`, ...(range ? { range } : {}) },
        signal: signal || AbortSignal.timeout(10000) });
    } catch { throw miError("mi_connection_failed", 502); }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      const code = STATUS_CODES[response.status] || "mi_service_error";
      throw miError(code, response.status === 416 ? 416 : response.status === 401 ? 422 : 502);
    }
    return response;
  }
  return {
    async json(path, params) {
      const response = await request(path, { params });
      let size = 0;
      const chunks = [];
      try {
        for await (const chunk of response.body) {
          size += chunk.byteLength;
          if (size > 1024 * 1024) throw new Error();
          chunks.push(Buffer.from(chunk));
        }
        const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (value?.ok !== true || !Object.hasOwn(value, "data")) throw new Error();
        return value;
      } catch { throw miError("mi_invalid_response", 502); }
    },
    async video(id, options = {}) {
      const response = await request(`/files/${miId(id)}`, options);
      const mime = (response.headers.get("content-type") || "").split(";")[0].trim();
      if (!["video/mp4", "video/webm"].includes(mime)) {
        await response.body?.cancel().catch(() => {});
        throw miError("mi_invalid_video", 502);
      }
      return response;
    }
  };
}
