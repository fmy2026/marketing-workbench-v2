import { MI_ID, projectMiAsset, projectMiDetail, projectMiMeta, projectMiTrend } from "../platforms/marketIntelligenceClient.mjs";
import { miError } from "../security/marketIntelligenceConnectionStore.mjs";

const HELP = "可以问我“有哪些素材”“播放第一条”“看看这条素材最近 7 天的趋势”。也可以输入“游戏：游戏名”筛选素材。";
const UNSUPPORTED = "公共数据服务暂未提供排名、聚合统计、跨素材对比或视频内容理解。我可以查询素材、播放视频、查看单条人气值趋势和平台已有分析。";
const numeral = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
function contextOf(value) {
  return { ids: Array.isArray(value?.ids) ? value.ids.filter((id) => typeof id === "string" && MI_ID.test(id)).slice(0, 10) : [],
    selectedId: MI_ID.test(value?.selectedId || "") ? value.selectedId : "",
    page: Number.isSafeInteger(value?.page) && value.page > 0 && value.page < 10000 ? value.page : 1,
    game: typeof value?.game === "string" ? value.game.slice(0, 100) : "" };
}
function dateRange(text, now) {
  const dates = text.match(/\d{4}-\d{2}-\d{2}/g) || [];
  if (dates.length && dates.length !== 2) throw miError("mi_date_range_required");
  if (dates.length === 2) {
    if (dates.some((date) => !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) || dates[0] > dates[1] || (Date.parse(dates[1]) - Date.parse(dates[0])) / 86400000 > 365) throw miError("mi_date_range_required");
    return { from: dates[0], to: dates[1] };
  }
  const recent = text.match(/近\s*(\d+)\s*天/);
  const days = recent ? Number(recent[1]) : /近一周|近一星期/.test(text) ? 7 : /近一个月|近一月/.test(text) ? 30 : null;
  if (days === null) return {};
  if (days < 1 || days > 366) throw miError("mi_date_range_required");
  const to = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return { from: new Date(Date.parse(to) - (days - 1) * 86400000).toISOString().slice(0, 10), to };
}

export async function answerMarketIntelligence({ message, context, client, now = new Date() }) {
  if (typeof message !== "string" || message.trim().length > 2000 || !message.trim()) throw miError("mi_invalid_message");
  const text = message.trim();
  const state = contextOf(context);
  if (/排名|排行|对比|比较|覆盖率|分布|占比|热门|爆款|涨幅|跌幅|上升.*素材|下降.*素材|素材.*(上升|下降)|哪[些个].*(上升|下降|最好)|最高|最低|最多|最少|roi|roas|转化|消耗|曝光|点击|识别视频|分析视频|解读视频|转写|逐镜头|OCR|ASR/i.test(text)) return { reply: UNSUPPORTED, context: state };
  if (/^(你好|您好|帮助|你能做什么|能做什么|怎么用)[？?！!。\s]*$/.test(text)) return { reply: HELP, context: state };
  if (!client) return { reply: "先在右上角“数据连接”录入公共电脑地址与访问 Token，然后就可以开始查询。", needsConnection: true, context: state };
  if (/^(测试|检查|验证).*(连接|服务)|^(连接状态|服务状态)$/.test(text)) {
    const result = await client.json("/health");
    return { reply: "公共电脑已响应带凭证的只读请求，可以开始查询素材。", meta: projectMiMeta(result.meta), context: state };
  }
  const hashes = text.match(/\b[a-fA-F0-9]{32}\b/g) || [];
  if (hashes.length > 1) return { reply: "请一次选择一条素材查看。", context: state };
  const ordinal = text.match(/第\s*(\d+|[一二三四五六七八九十])\s*[条个]/);
  const index = ordinal ? Number(numeral[ordinal[1]] || ordinal[1]) - 1 : null;
  const id = hashes[0] || (ordinal ? state.ids[index] : /这条|这个|它|当前|选中/.test(text) ? state.selectedId : "");
  const wantsTrend = /趋势|人气|曲线|走势/.test(text);
  const wantsDetail = /播放|打开|详情|脚本|分析|标签|看看这|查看这|看这/.test(text) || hashes.length || ordinal;
  if (wantsTrend || wantsDetail) {
    if (!id) return { reply: ordinal ? "当前列表没有这条素材，请按列表序号选择。" : "请先选一条素材，例如“播放第一条”，再问“看看这条的趋势”。", context: state };
    const next = { ...state, selectedId: id };
    if (wantsTrend) {
      const result = await client.json("/stats/trend", { asset: id, ...dateRange(text, now) });
      return { reply: "这是所选素材的人气值日序列。人气值是平台指标；缺失日期保留为空，不代表投放效果。", trend: projectMiTrend(result.data), assetId: id, meta: projectMiMeta(result.meta), context: next };
    }
    const result = await client.json(`/assets/${id}`);
    return { reply: "已打开这条素材。标签和脚本来自平台已有分析。", detail: projectMiDetail(result.data, id), meta: projectMiMeta(result.meta), context: next };
  }
  if (/素材|视频|游戏[：:]|下一页|上一页/.test(text)) {
    if (/\d{4}-\d{2}-\d{2}|近\s*(\d+|一|一个)\s*(天|周|月)|标签|厂商|广告主/.test(text)) return { reply: "当前对话支持按游戏查看素材。时间范围可用于单条素材趋势；其他筛选可稍后扩展。请先说“有哪些素材”或“游戏：游戏名”。", context: state };
    const gameMatch = text.match(/游戏\s*[：:]\s*([^，。；\n]+)/) || text.match(/[“「"]([^”」"]+)[”」"]\s*(?:的)?素材/) || text.match(/^(?:请|帮我)?(?:查询|查看|看看|查|看)?\s*(.{1,40}?)(?:的素材|有哪些素材)/);
    const game = gameMatch && !/^(最近|目前|现在|全部|所有|库里|已采集|当前|我们|公共电脑)$/.test(gameMatch[1].trim()) ? gameMatch[1].trim() : /下一页|上一页/.test(text) ? state.game : "";
    const page = /下一页/.test(text) ? state.page + 1 : /上一页/.test(text) ? Math.max(1, state.page - 1) : 1;
    const result = await client.json("/assets", { game, page, page_size: 5 });
    if (!Array.isArray(result.data) || result.data.length > 100) throw miError("mi_invalid_response", 502);
    const assets = result.data.map(projectMiAsset);
    const meta = projectMiMeta(result.meta);
    return { reply: assets.length ? `${meta.total === null ? "已查到素材" : `查询范围内共 ${meta.total} 条素材`}，下面是第 ${page} 页。可以直接说“播放第一条”。` : "这个查询范围或页码暂时没有素材。", assets, meta,
      context: { ids: assets.map((asset) => asset.id), selectedId: "", page, game } };
  }
  return { reply: HELP, context: state };
}
