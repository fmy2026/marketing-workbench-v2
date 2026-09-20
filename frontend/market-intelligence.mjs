const $ = (id) => document.getElementById(id);
const ROOT = "/api/agents/market_intelligence";
const MODEL_ROOT = "/api/agents/market-intelligence/model-config";
const PRESETS = Object.freeze({
  discover: "查看当前已采集的游戏和素材",
  insight: "解读当前素材",
  report: "生成市场情报月报",
  help: "你能做什么？"
});
const state = {
  connection: { configured: false, baseUrl: "" }, model: null, filters: null, query: "", result: null,
  report: null, discoveryPage: 1, busy: false, ids: [], selectedId: "", activeModule: "conversation", currentUser: null, pendingQuestion: ""
};
const errors = {
  mi_invalid_address: "请输入公共电脑的内网 IPv4 服务地址。", mi_invalid_token: "请填写有效的访问 Token。",
  mi_credentials_rejected: "公共电脑拒绝了此 Token。", mi_connection_failed: "暂时无法连接公共电脑。",
  mi_connection_required: "请先连接公共电脑。", mi_http_confirmation_required: "请确认 HTTP 只读连接。",
  mi_invalid_response: "公共电脑返回的数据格式不符合约定。", mi_bad_query: "查询条件未被接受。",
  mi_file_not_ready: "视频尚未就绪或文件缺失。", mi_invalid_video: "服务返回了不支持的视频格式。",
  mi_range_invalid: "视频分段读取失败。", mi_rate_limited: "查询过于频繁，请稍后再试。",
  mi_service_unavailable: "公共电脑数据服务暂时不可用。", mi_month_required: "请选择有效月份。",
  mi_research_objects_required: "请先说明要研究哪些游戏。", mi_report_no_valid_samples: "该月份没有可纳入报告的有效样本。",
  mi_query_failed: "本次候选素材都未能完成趋势核验。", model_config_test_required: "请先测试通过模型配置。",
  model_connection_test_failed: "模型测试未通过。请检查 API Base、模型名称、API Key 及服务商是否兼容 OpenAI 接口。",
  model_config_not_ready_for_test: "请先保存模型连接。", invalid_model_api_base: "请输入兼容 API 的 Base 地址，例如 https://…/v1；不要填 /chat/completions。",
  invalid_model_name: "模型名称只能使用字母、数字、点、下划线、冒号、斜杠和连字符。", model_protocol_not_supported: "当前只支持 OpenAI 兼容接口。",
  invalid_model_api_key: "请填写有效的 API Key。", model_credential_store_unavailable: "工作台无法安全保存 API Key，请联系管理员检查本机凭据存储。"
};
const errorMessage = (error) => errors[error?.code] || "本次请求未成功，请稍后再试。";
function el(tag, className = "", text = "") { const node = document.createElement(tag); if (className) node.className = className; node.textContent = text; return node; }
function button(text, className = "mi-subtle-button") { const node = el("button", className, text); node.type = "button"; return node; }
async function api(path, { body, method = body === undefined ? "GET" : "POST", root = ROOT } = {}) {
  const response = await fetch(`${root}${path}`, { method, headers: body === undefined ? {} : { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  if (response.status === 401) { location.assign("/agents"); throw { code: "authentication_required" }; }
  let value; try { value = await response.json(); } catch { throw { code: "mi_invalid_response" }; }
  if (!response.ok) throw { code: value.error || "mi_service_error" };
  return value;
}
function setBusy(value, status = "") {
  state.busy = value;
  $("sendButton").disabled = value; $("messageInput").disabled = value;
  document.querySelectorAll("[data-mi-preset]").forEach((node) => { node.disabled = value; });
  if (status) $("agentStatus").textContent = status;
  else if (!value) $("agentStatus").textContent = "等待输入需求";
}
function gamesValue(value) { return String(value || "").split(/[、,，]/).map((part) => part.trim()).filter(Boolean).slice(0, 5); }
function sourceLine(meta) { return [meta?.source, meta?.caliber, meta?.updatedAt && `全库更新 ${meta.updatedAt}`].filter(Boolean).join(" · "); }
function modelReady() { return state.model?.enabled === true && state.model?.testStatus === "passed" && state.model?.credentialConfigured === true; }
function appendMessage(role, text, { loading = false } = {}) {
  const row = el("div", `mi-chat-message is-${role}`); const bubble = el("div", `mi-message-bubble${loading ? " mi-message-loading" : ""}`, text); const avatar = el("span", "mi-message-avatar", role === "user" ? "我" : "情");
  row.append(role === "user" ? bubble : avatar, role === "user" ? avatar : bubble); $("chatStream").append(row);
  $("conversationScroll").scrollTop = $("conversationScroll").scrollHeight;
  return bubble;
}
function beginTurn(text, status) { state.query = String(text || "").slice(0, 2000); appendMessage("user", state.query); setBusy(true, status); return appendMessage("agent", status, { loading: true }); }
function finishTurn(node, text) { if (!node) return; node.classList.remove("mi-message-loading"); node.textContent = text || "已完成。"; $("conversationScroll").scrollTop = $("conversationScroll").scrollHeight; }
function workspaceBase() { return document.createDocumentFragment(); }
function renderStatus(text, { action = null } = {}) {
  const wrap = workspaceBase(); wrap.append(el("p", "mi-empty", text));
  if (action) { const actions = el("div", "mi-clarify-actions"); const run = button(action.label, action.primary ? "mi-primary-button" : "mi-subtle-button"); run.addEventListener("click", action.run); actions.append(run); wrap.append(actions); }
  $("workspace").replaceChildren(wrap); renderSideModules();
}
function renderOverview() {
  const node = $("overviewConfigStatus"); node.replaceChildren();
  node.append(el("span", "mi-status-chip", state.connection.configured ? "数据连接：已配置" : "数据连接：未配置"));
  node.append(el("span", "mi-status-chip", modelReady() ? "模型：已启用" : "模型：可选"));
}
function renderMemory() {
  const node = $("memoryContent"); node.replaceChildren();
  const games = state.filters?.games || state.report?.filters?.games || [];
  const rows = [["研究对象", games.join("、") || "当前暂无研究上下文"], ["观察月份", state.filters?.month || state.report?.filters?.month || "未选择"], ["当前素材", state.selectedId ? "已选择 1 条素材" : "未选择"], ["报告草稿", state.report ? "可继续编辑和下载" : "暂无"]];
  rows.forEach(([label, value]) => { const row = el("p", ""); row.append(el("strong", "", `${label}：`), document.createTextNode(value)); node.append(row); });
}
function renderStatistics() {
  const node = $("statisticsContent"); node.replaceChildren();
  if (!state.result && !state.report) { node.append(el("p", "mi-empty", "完成查询后展示。")); return; }
  const result = state.result || {}; const report = state.report || {};
  const values = [
    [result.loadedCandidateCount ?? report.sampleCount ?? 0, "已返回候选"],
    [result.resultCount ?? report.sampleCount ?? 0, "有效样本"],
    [state.filters?.month || report.filters?.month || "未提供", "观察月份"],
    [result.failedTrendCount ?? 0, "未完成核验"]
  ];
  values.forEach(([value, label]) => { const card = el("div", "mi-stat"); card.append(el("strong", "", String(value)), el("span", "", label)); node.append(card); });
}
function renderSideModules() { renderOverview(); renderMemory(); renderStatistics(); }
function selectModule(key) {
  state.activeModule = key;
  document.querySelectorAll("[data-mi-module-content]").forEach((node) => { node.hidden = node.dataset.miModuleContent !== key; });
  document.querySelectorAll("[data-mi-module]").forEach((node) => { const active = node.dataset.miModule === key; node.classList.toggle("is-active", active); node.setAttribute("aria-current", active ? "page" : "false"); });
  if (key === "conversation") setTimeout(() => $("messageInput").focus(), 0);
  renderSideModules();
}
async function openSettings(section = "connection") {
  try {
    await refreshSettings(); $("connectionSettingsPanel").open = section !== "model"; $("modelSettingsPanel").open = section === "model";
    $("settingsDialog").showModal(); (section === "model" ? $("modelApiBase") : $("serviceAddress")).focus();
  } catch (error) { renderStatus(errorMessage(error)); }
}
function modelNudge(aiStatus = "not_configured") {
  if (aiStatus === "used") return null;
  const message = aiStatus === "not_configured" && !modelReady() ? "可选：配置并测试模型，可获得更自然的证据解读。" : "AI 解读暂不可用，已保留公共电脑的事实说明。";
  const box = el("section", "mi-model-nudge"); const action = button("配置模型"); action.addEventListener("click", () => openSettings("model")); box.append(el("span", "", message), action); return box;
}
function renderClarification(response) {
  const wrap = workspaceBase(); wrap.append(el("p", "mi-empty", response.reply || "请先查看当前已采集的游戏和素材。"));
  const actions = el("div", "mi-clarify-actions"); const discover = button("查看真实游戏和素材", "mi-primary-button"); discover.addEventListener("click", () => runPreset("discover")); actions.append(discover);
  if (response.modelConfigurationSuggested) { const configure = button("配置模型"); configure.addEventListener("click", () => openSettings("model")); actions.append(configure); }
  wrap.append(actions); $("workspace").replaceChildren(wrap); renderSideModules();
}
function renderDiscovery(result) {
  state.discoveryPage = result.candidatePage; state.result = result; state.report = null; state.ids = result.assets.map((asset) => asset.id); state.selectedId = "";
  const wrap = workspaceBase(); const head = el("section", "mi-result-head"); head.append(el("span", "mi-mark", "情"), el("h2", "", result.assets.length ? "当前已读取的候选素材" : "这一组候选没有素材"), el("span", "mi-small", `第 ${result.candidatePage} 组 · ${result.loadedCandidateCount} 条`)); wrap.append(head, el("p", "mi-status", "本组已读取候选；游戏名称仅来自本次公共电脑响应。"));
  if (result.games.length) { const games = el("section", "mi-game-chips"); result.games.forEach((game) => { const chip = button(game, "mi-game-chip"); chip.addEventListener("click", () => runSearchForGame(game)); games.append(chip); }); wrap.append(games); }
  if (result.assets.length) { const grid = el("section", "mi-grid"); result.assets.forEach((asset) => grid.append(assetCard(asset))); wrap.append(grid); }
  const pager = el("div", "mi-pagination"); const previous = button("上一组"); previous.disabled = !result.hasPreviousPage; previous.addEventListener("click", () => loadDiscovery(result.candidatePage - 1)); const right = el("div", ""); if (result.canContinueDiscovery) { const more = button("继续发现"); more.addEventListener("click", () => loadDiscovery(result.candidatePage + 1)); right.append(more); } pager.append(previous, el("span", "", `已读取第 ${result.candidatePage} 组候选`), right); wrap.append(pager); if (sourceLine(result.meta)) wrap.append(el("p", "mi-status", sourceLine(result.meta))); $("workspace").replaceChildren(wrap); renderSideModules();
}
async function loadDiscovery(page, { pending = null, reply = "已读取当前候选素材。" } = {}) {
  if (!pending) setBusy(true, "正在读取素材");
  try { renderDiscovery(await api("/discover", { body: { page } })); finishTurn(pending, reply); }
  catch (error) { const text = errorMessage(error); finishTurn(pending, text); renderStatus(text, { action: { label: "重试", run: () => loadDiscovery(page), primary: true } }); }
  finally { setBusy(false); }
}
function renderSearch(result) {
  state.result = result; state.report = null; state.filters = result.filters; state.ids = result.assets.map((asset) => asset.id); state.selectedId = "";
  const wrap = workspaceBase(); const head = el("section", "mi-result-head"); head.append(el("span", "mi-mark", "情"), el("h2", "", result.resultCount ? `已找到 ${result.resultCount} 条素材` : "没有找到有效素材"), el("span", "mi-small", `${result.filters.month}${result.filters.isCurrentMonth ? ` · 截至 ${result.filters.to}` : ""}`)); wrap.append(head);
  const filters = el("form", "mi-filters"); const games = document.createElement("input"); games.value = result.filters.games.join("、"); games.placeholder = "研究对象，多个用顿号分隔"; games.setAttribute("aria-label", "研究对象"); const month = document.createElement("input"); month.type = "month"; month.value = result.filters.month; month.setAttribute("aria-label", "观察月份"); const apply = button("查询"); apply.type = "submit"; filters.append(games, month, apply, el("span", "mi-filter-note", `已加载 ${result.loadedCandidateCount} 条候选`)); filters.addEventListener("submit", (event) => { event.preventDefault(); loadSearch({ games: gamesValue(games.value), month: month.value, page: 1, candidatePage: 1 }); }); wrap.append(filters);
  if (result.assets.length) { const grid = el("section", "mi-grid"); result.assets.forEach((asset) => grid.append(assetCard(asset))); wrap.append(grid); } else wrap.append(el("p", "mi-empty", "已核验的候选素材中没有目标月份的有效观察。可修改月份或继续查询。"));
  const pager = el("div", "mi-pagination"); const previous = button("上一页"); previous.disabled = !result.hasPreviousPage; previous.addEventListener("click", () => loadSearch({ ...result.filters, page: result.filters.page - 1 })); const right = el("div", ""); const next = button("下一页"); next.disabled = !result.hasNextPage; next.addEventListener("click", () => loadSearch({ ...result.filters, page: result.filters.page + 1 })); right.append(next); if (result.canContinueSearch) { const more = button("继续查询"); more.addEventListener("click", () => loadSearch({ ...result.filters, page: 1, candidatePage: result.filters.candidatePage + 1 })); right.append(more); } pager.append(previous, el("span", "", `第 ${result.filters.page} 页`), right); wrap.append(pager);
  if (result.failedTrendCount) wrap.append(el("p", "mi-status", `${result.failedTrendCount} 条候选未完成趋势核验，未计入结果。`)); if (sourceLine(result.meta)) wrap.append(el("p", "mi-status", sourceLine(result.meta))); $("workspace").replaceChildren(wrap); renderSideModules();
}
async function runSearchForGame(game) { const pending = beginTurn(`查看 ${game} 的素材`, "正在核验观察范围"); await loadSearch({ games: [game], month: state.filters?.month || "", page: 1, candidatePage: 1 }, { pending, reply: `已按 ${game} 的当前观察月份查询。` }); }
async function loadSearch(filters, { pending = null, reply = "已按当前条件读取素材。" } = {}) {
  if (!pending) setBusy(true, "正在核验观察范围");
  try { renderSearch(await api("/search", { body: { filters } })); finishTurn(pending, reply); }
  catch (error) { const text = errorMessage(error); finishTurn(pending, text); renderStatus(text, { action: { label: "重试", run: () => loadSearch(filters), primary: true } }); }
  finally { setBusy(false); }
}
function assetCard(asset) {
  const card = el("button", "mi-card"); card.type = "button"; card.setAttribute("aria-label", `打开素材：${asset.title}`); const placeholder = el("div", "mi-placeholder"); placeholder.append(el("span", "", asset.game || "素材"), el("strong", "", asset.title)); const body = el("div", "mi-card-body"); const tags = el("div", "mi-tags"); asset.labels.slice(0, 2).forEach((label) => tags.append(el("span", "mi-tag", label))); body.append(el("div", "mi-card-game", asset.game || "未提供游戏"), el("h3", "mi-card-title", asset.title), tags); card.append(placeholder, body); card.addEventListener("click", () => openDetail(asset)); return card;
}
function chart(points) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.setAttribute("viewBox", "0 0 680 190"); svg.classList.add("mi-chart"); svg.setAttribute("role", "img"); svg.setAttribute("aria-label", "每日人气值曲线；缺失日期断开");
  const values = points.filter((point) => point.value !== null).map((point) => point.value); if (!values.length) return el("p", "mi-small", "这个范围内暂无有效人气值。"); const max = Math.max(...values, ...points.flatMap((point) => Object.values(point.refline || {})), 1); const first = Date.parse(points[0].date), last = Date.parse(points.at(-1).date);
  const shape = (tag, attributes, text = "") => { const node = document.createElementNS(svg.namespaceURI, tag); Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value)); node.textContent = text; svg.append(node); return node; }; shape("line", { x1:45, x2:658, y1:160, y2:160, stroke:"#e2e8f0" }); shape("text", { x:5, y:20, fill:"#64748b", "font-size":11 }, String(max));
  let segment = [], previous = null; const flush = () => { if (segment.length > 1) shape("polyline", { points:segment.join(" "), fill:"none", stroke:"#4f46e5", "stroke-width":2 }); segment = []; };
  for (const point of points) { const day = Date.parse(point.date); if (point.value === null || (previous !== null && day - previous > 86400000)) flush(); if (point.value !== null) { const x = first === last ? 350 : 45 + (day - first) / (last - first) * 613, y = 160 - point.value / max * 135; segment.push(`${x},${y}`); shape("circle", { cx:x, cy:y, r:2.5, fill:"#4f46e5" }); } previous = day; } flush(); shape("text", { x:45, y:184, fill:"#64748b", "font-size":10 }, points[0].date); shape("text", { x:658, y:184, fill:"#64748b", "font-size":10, "text-anchor":"end" }, points.at(-1).date); return svg;
}
function trendText(summary = {}) { return [summary.observedFrom && summary.observedTo ? `有效观察 ${summary.observedFrom} 至 ${summary.observedTo}` : "有效观察范围未提供", summary.popularityPoints === null ? "有效点数未提供" : `有效点 ${summary.popularityPoints}`, "0 为平台报告值，缺失未补零"].join(" · "); }
function showDetail(detail) {
  state.selectedId = detail.asset.id; renderSideModules(); const node = el("section", "mi-detail"); const player = document.createElement("video"); player.controls = true; player.preload = "none"; player.src = `${ROOT}/files/${detail.asset.id}`; player.setAttribute("aria-label", detail.asset.title); const tags = el("div", "mi-tags"); detail.asset.labels.forEach((label) => tags.append(el("span", "mi-tag", label))); const actions = el("div", "mi-detail-actions"); const trendButton = button("查看趋势"); trendButton.addEventListener("click", async () => { trendButton.disabled = true; try { const response = await api("/conversation", { body: { message: `看看素材 ${detail.asset.id} 的人气趋势`, context: { selectedId: detail.asset.id, ids: [detail.asset.id], filters: state.filters } } }); if (!response.trend) throw { code: "mi_invalid_response" }; node.append(chart(response.trend.points), el("p", "mi-small", trendText(response.trend.summary))); } catch (error) { node.append(el("p", "mi-error", errorMessage(error))); } finally { trendButton.remove(); } }); const insightButton = button("解读素材", "mi-primary-button"); insightButton.addEventListener("click", () => loadInsight(detail.asset.id)); actions.append(trendButton, insightButton); const evidence = document.createElement("details"); evidence.append(el("summary", "", "来源与详细依据"), el("p", "", detail.script || "未提供平台脚本分析。")); node.append(el("h2", "", detail.asset.title), el("p", "", detail.asset.game || "未提供游戏"), player, tags, actions, evidence); $("detailContent").replaceChildren(node); $("detailDialog").showModal();
}
async function openDetail(asset) { try { const response = await api("/conversation", { body: { message: `打开素材 ${asset.id}`, context: { selectedId: asset.id, ids: [asset.id], filters: state.filters } } }); if (!response.detail) throw { code: "mi_invalid_response" }; showDetail(response.detail); } catch (error) { renderStatus(errorMessage(error)); } }
function renderTrend(trend, assetId) { const wrap = workspaceBase(); const head = el("section", "mi-result-head"); head.append(el("span", "mi-mark", "情"), el("h2", "", "素材人气趋势")); const reopen = button("打开素材详情"); reopen.addEventListener("click", () => openDetail({ id: assetId })); wrap.append(head, chart(trend.points), el("p", "mi-status", trendText(trend.summary)), reopen); $("workspace").replaceChildren(wrap); }
function renderInsight(insight) { const wrap = workspaceBase(); const head = el("section", "mi-result-head"); head.append(el("span", "mi-mark", "情"), el("h2", "", "基于证据的素材解读"), el("span", "mi-small", insight.filters.month)); const card = el("section", "mi-insight"); const tags = el("div", "mi-tags"); insight.asset.labels.forEach((label) => tags.append(el("span", "mi-tag", label))); const evidence = document.createElement("details"); evidence.append(el("summary", "", "来源与详细依据"), el("p", "", insight.script || "未提供平台脚本分析。")); card.append(el("h3", "", insight.asset.title), el("p", "mi-status", insight.asset.game || "未提供游戏"), el("p", "mi-insight-observation", insight.observation), chart(insight.trend.points), el("p", "mi-small", trendText(insight.trend.summary)), tags, evidence); wrap.append(head, card); const nudge = modelNudge(insight.aiStatus); if (nudge) wrap.append(nudge); wrap.append(el("p", "mi-status", insight.limitations.join(" "))); if (sourceLine(insight.source)) wrap.append(el("p", "mi-status", sourceLine(insight.source))); $("workspace").replaceChildren(wrap); renderSideModules(); }
async function loadInsight(assetId, { pending = null, reply = "已根据已采集证据整理素材解读。" } = {}) { if (!pending) setBusy(true, "正在整理证据"); try { if ($("detailDialog").open) $("detailDialog").close(); renderInsight(await api("/asset-insight", { body: { assetId, filters: state.filters || {} } })); finishTurn(pending, reply); } catch (error) { const text = errorMessage(error); finishTurn(pending, text); renderStatus(text); } finally { setBusy(false); } }
function reportFacts(report) { return `${report.filters.month}${report.filters.isCurrentMonth ? ` · 截至 ${report.filters.to}` : ""} · ${report.sampleCount} 条已采集样本`; }
function reportPaper(report, { download = false } = {}) {
  const paper = el("article", "mi-paper"); const top = el("div", "mi-paper-top"); top.append(el("span", "", "市场情报"), el("span", "", download ? "离线 HTML" : reportFacts(report))); paper.append(top, el("h1", "", `${report.filters.month} 市场情报`), el("p", "mi-subtitle", `${report.filters.games.join("、")} · ${reportFacts(report)}`)); paper.append(el("h2", "", "三个重点")); const observations = el("section", "mi-observations"); report.narrative.points.forEach((point, index) => { const item = el("div", "mi-observation"); item.append(el("b", "", String(index + 1).padStart(2, "0")), el("div", "", point.text)); observations.append(item); }); paper.append(observations); paper.append(el("h2", "", "研究对象")); const table = el("table", "mi-report-table"), head = document.createElement("thead"), row = document.createElement("tr"); ["对象", "样本", "有效观察范围"].forEach((value) => row.append(el("th", "", value))); head.append(row); table.append(head); const body = document.createElement("tbody"); report.filters.games.forEach((game) => { const samples = report.samples.filter((sample) => sample.game === game); const dates = samples.flatMap((sample) => [sample.monthEvidence.observedFrom, sample.monthEvidence.observedTo]).filter(Boolean).sort(); const tr = document.createElement("tr"); tr.append(el("td", "", game), el("td", "", String(samples.length)), el("td", "", dates.length ? `${dates[0]} 至 ${dates.at(-1)}` : "未提供")); body.append(tr); }); table.append(body); paper.append(table); paper.append(el("h2", "", "代表素材")); const cases = el("section", "mi-case-grid"); report.samples.slice(0, 4).forEach((sample) => { const item = el("article", "mi-case"); item.append(el("h3", "", sample.title), el("p", "", `${sample.game} · ${sample.monthEvidence.observedFrom} 至 ${sample.monthEvidence.observedTo}`), el("p", "", sample.labels.slice(0, 2).join(" · ") || "未提供创意标签")); cases.append(item); }); paper.append(cases); paper.append(el("h2", "", "继续关注"), el("p", "", report.narrative.followUp), el("footer", "mi-paper-footer", `${report.sampleSelection} ${report.limitations.join(" ")} ${sourceLine(report.source)}`)); return paper;
}
function renderReport(report) {
  state.report = report; state.filters = { ...report.filters, page: state.filters?.page || 1, candidatePage: state.filters?.candidatePage || 1 }; const wrap = workspaceBase(); const layout = el("section", "mi-report"); const toolbar = el("div", "mi-report-toolbar"); const left = el("span", "mi-small", report.aiStatus === "used" ? "AI 摘要已结合样本证据" : "已保留事实摘要"); const actions = el("div", ""); const back = button("返回素材"); const edit = button("编辑摘要"); const download = button("下载 HTML", "mi-primary-button"); actions.append(back, edit, download); toolbar.append(left, actions); const paper = reportPaper(report); layout.append(toolbar, paper); const nudge = modelNudge(report.aiStatus); wrap.append(layout); if (nudge) wrap.append(nudge); $("workspace").replaceChildren(wrap); back.addEventListener("click", () => loadSearch(state.filters)); edit.addEventListener("click", () => openSummaryEditor(report, paper)); download.addEventListener("click", () => downloadReport(report)); renderSideModules();
}
function openSummaryEditor(report, paper) { const current = report.narrative.points.map((point) => point.text).join("\n"); const editor = document.createElement("textarea"); editor.className = "mi-summary-editor"; editor.value = current; const save = button("保存", "mi-primary-button"), cancel = button("取消"); const controls = el("p", "mi-detail-actions"); controls.append(cancel, save); paper.querySelector(".mi-observations").replaceWith(editor); editor.after(controls); cancel.addEventListener("click", () => renderReport(report)); save.addEventListener("click", () => { const lines = editor.value.split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 3); if (!lines.length) return; report.narrative.points = lines.map((text, index) => ({ text, assetIds: report.narrative.points[index]?.assetIds || [] })); renderReport(report); }); }
function downloadReport(report) { const documentCopy = document.implementation.createHTMLDocument(`${report.filters.month} 市场情报`); const style = documentCopy.createElement("style"); style.textContent = "body{margin:0;background:#f8fafc;color:#172033;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif}.mi-paper{max-width:850px;margin:40px auto;background:#fff;border:1px solid #e2e8f0;padding:45px 52px;box-sizing:border-box}.mi-paper-top{font-size:9px;letter-spacing:1.8px;color:#64748b;display:flex;justify-content:space-between}.mi-paper h1{font-size:31px;font-weight:600;margin:24px 0 10px}.mi-subtitle{font-size:11px;line-height:1.9;color:#64748b;border-bottom:1px solid #e2e8f0;padding-bottom:23px}.mi-paper h2{font-size:15px;margin:25px 0 14px}.mi-observation{display:flex;gap:12px;font-size:12px;line-height:1.9;color:#475569}.mi-observation b{color:#818cf8}.mi-report-table{width:100%;border-collapse:collapse;font-size:11px;color:#475569}.mi-report-table th,.mi-report-table td{padding:10px 8px;text-align:left;border-bottom:1px solid #e2e8f0}.mi-report-table th{font-weight:650;color:#64748b}.mi-case-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.mi-case{border:1px solid #e2e8f0;border-radius:7px;padding:13px}.mi-case h3{font-size:12px;margin:0 0 7px}.mi-case p{font-size:10px;line-height:1.8;color:#64748b;margin:0}.mi-paper-footer{border-top:1px solid #e2e8f0;margin-top:28px;padding-top:13px;font-size:10px;line-height:1.8;color:#64748b}@media(max-width:600px){.mi-paper{margin:0;border:0;padding:28px 22px}.mi-case-grid{grid-template-columns:1fr}}"; documentCopy.head.append(style); documentCopy.body.append(documentCopy.importNode(reportPaper(report, { download: true }), true)); const blob = new Blob([`<!doctype html>${documentCopy.documentElement.outerHTML}`], { type:"text/html;charset=utf-8" }); const url = URL.createObjectURL(blob), link = document.createElement("a"); link.href = url; link.download = `${report.filters.month}-市场情报.html`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1500); }
async function loadReport(filters, { pending = null, reply = "已按当前研究对象整理月报。" } = {}) { if (!pending) setBusy(true, "正在整理报告"); try { renderReport(await api("/report", { body: { filters } })); finishTurn(pending, reply); } catch (error) { const text = errorMessage(error); finishTurn(pending, text); renderStatus(text, { action: { label: "返回素材", run: () => state.filters && loadSearch(state.filters) } }); } finally { setBusy(false); } }
function updateConnection(config) { state.connection = config; $("serviceAddress").value = config?.baseUrl || ""; $("connectionError").textContent = ""; $("tokenState").textContent = config.configured ? "Token 已配置；保存后不会回显。" : "尚未配置 Token"; $("removeConnection").hidden = !config.configured; renderSideModules(); }
function updateModel(config, { justSaved = false } = {}) { state.model = config; $("modelApiBase").value = config?.apiBase || ""; $("modelName").value = config?.modelName || ""; $("modelEnabled").checked = config?.enabled === true; $("modelState").textContent = !config?.credentialConfigured ? "尚未配置 API Key" : justSaved && config.testStatus !== "passed" ? "配置已保存。请点击“测试”；通过后再勾选“启用模型摘要”并保存。" : `测试状态：${config.testStatus === "passed" ? "已通过" : "未通过或未测试"}`; renderSideModules(); }
async function refreshSettings() { updateConnection(await api("/connection")); updateModel((await api("", { root: MODEL_ROOT })).config); }
async function handleMessage(text) {
  const pending = beginTurn(text, "正在理解需求");
  try {
    const response = await api("/conversation", { body: { message: text, context: { filters: state.filters || {}, ids: state.ids || [], selectedId: state.selectedId || "", discoveryPage: state.discoveryPage } } });
    if (response.needsConnection) { state.pendingQuestion = text; finishTurn(pending, response.reply || "请先连接公共电脑。"); renderStatus(response.reply || "请先连接公共电脑。", { action: { label: "配置数据连接", run: () => openSettings("connection"), primary: true } }); await openSettings("connection"); }
    else if (response.intent?.kind === "discover") await loadDiscovery(response.discoveryPage, { pending, reply: response.reply || "正在读取当前已采集的候选素材。" });
    else if (response.intent?.kind === "search") await loadSearch(response.filters, { pending, reply: response.reply || "已按当前条件查询素材。" });
    else if (response.intent?.kind === "report") await loadReport(response.filters, { pending, reply: response.reply || "正在整理当前研究对象的月报。" });
    else if (response.intent?.kind === "detail" && response.detail) { showDetail(response.detail); finishTurn(pending, response.reply || "已打开素材详情。"); }
    else if (response.intent?.kind === "trend" && response.trend) { renderTrend(response.trend, response.intent.assetId); finishTurn(pending, response.reply || "已显示素材趋势。"); }
    else if (response.intent?.kind === "insight") await loadInsight(response.intent.assetId, { pending, reply: response.reply || "已根据当前证据整理解读。" });
    else { renderClarification(response); finishTurn(pending, response.reply || "请先查看当前已采集的游戏和素材。"); }
  } catch (error) { const textValue = errorMessage(error); finishTurn(pending, textValue); renderStatus(textValue); }
  finally { setBusy(false); $("messageInput").focus(); }
}
function runPreset(key) { selectModule("conversation"); const message = PRESETS[key]; if (key === "insight" && !state.selectedId) { handleMessage(message); return; } handleMessage(message); }
function updateUserPresentation(user) { state.currentUser = user; const displayName = user?.displayName || user?.display_name || user?.loginName || user?.login_name || "当前用户"; const login = user?.loginName || user?.login_name || ""; const avatar = displayName.slice(0, 1); $("operatorName").textContent = displayName; $("operatorAvatar").textContent = avatar; $("userMenuAvatar").textContent = avatar; $("userMenuDisplayName").textContent = displayName; $("userMenuLoginName").textContent = login; }
function closeUserMenu() { $("userMenu").hidden = true; $("userMenuButton").setAttribute("aria-expanded", "false"); }
$("chatForm").addEventListener("submit", (event) => { event.preventDefault(); const text = $("messageInput").value.trim(); if (!text || state.busy) return; $("messageInput").value = ""; handleMessage(text); });
$("messageInput").addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); $("chatForm").requestSubmit(); } });
document.querySelectorAll("[data-mi-module]").forEach((node) => node.addEventListener("click", () => selectModule(node.dataset.miModule)));
document.querySelectorAll("[data-mi-preset]").forEach((node) => node.addEventListener("click", () => runPreset(node.dataset.miPreset)));
$("sidebarCollapseButton").addEventListener("click", () => $("miMain").classList.toggle("is-sidebar-collapsed"));
$("dataConnectionButton").addEventListener("click", () => openSettings("connection")); $("modelConfigButton").addEventListener("click", () => openSettings("model")); $("closeSettings").addEventListener("click", () => $("settingsDialog").close()); $("settingsDialog").addEventListener("close", () => { $("serviceToken").value = ""; $("modelApiKey").value = ""; }); $("closeDetail").addEventListener("click", () => $("detailDialog").close());
$("connectionForm").addEventListener("submit", async (event) => { event.preventDefault(); $("connectionError").textContent = ""; try { const config = await api("/connection", { body: { baseUrl: $("serviceAddress").value.trim(), token: $("serviceToken").value, allowHttp: $("allowHttp").checked } }); $("serviceToken").value = ""; updateConnection(config); $("settingsDialog").close(); if (state.pendingQuestion) renderStatus("数据连接已保存。", { action: { label: "继续查询", run: () => { const question = state.pendingQuestion; state.pendingQuestion = ""; handleMessage(question); }, primary: true } }); } catch (error) { $("connectionError").textContent = errorMessage(error); } });
$("removeConnection").addEventListener("click", async () => { try { updateConnection(await api("/connection/remove", { body: {} })); } catch (error) { $("connectionError").textContent = errorMessage(error); } });
$("modelForm").addEventListener("submit", async (event) => { event.preventDefault(); $("modelError").textContent = ""; const apiBase = $("modelApiBase").value.trim(); const modelName = $("modelName").value.trim(); if (/\/chat\/completions\/?$/i.test(apiBase)) { $("modelError").textContent = errors.invalid_model_api_base; return; } const changingConnection = !state.model?.apiBase || state.model.apiBase.replace(/\/$/, "") !== apiBase.replace(/\/$/, "") || state.model.modelName !== modelName || Boolean($("modelApiKey").value.trim()); if ($("modelEnabled").checked && (changingConnection || state.model?.testStatus !== "passed")) { $("modelError").textContent = "请先保存连接并测试通过，再启用模型摘要。"; return; } try { const value = await api("", { root: MODEL_ROOT, method: "PUT", body: { api_base: apiBase, model_name: modelName, api_key: $("modelApiKey").value, enabled: $("modelEnabled").checked } }); $("modelApiKey").value = ""; updateModel(value.config, { justSaved: true }); } catch (error) { $("modelError").textContent = errorMessage(error); } });
$("testModel").addEventListener("click", async () => { $("modelError").textContent = ""; try { updateModel((await api("/test", { root: MODEL_ROOT, body: {} })).config); } catch (error) { $("modelError").textContent = errorMessage(error); } });
$("userMenuButton").addEventListener("click", (event) => { event.stopPropagation(); const opening = $("userMenu").hidden; $("userMenu").hidden = !opening; $("userMenuButton").setAttribute("aria-expanded", String(opening)); }); $("userMenu").addEventListener("click", (event) => event.stopPropagation()); document.addEventListener("click", closeUserMenu); document.addEventListener("keydown", (event) => { if (event.key === "Escape") { closeUserMenu(); if ($("settingsDialog").open) $("settingsDialog").close(); if ($("detailDialog").open) $("detailDialog").close(); } });
$("backToAgents").addEventListener("click", () => location.assign("/agents")); $("logoutButton").addEventListener("click", async () => { await api("/api/auth/logout", { root: "", method: "POST", body: {} }).catch(() => {}); location.assign("/agents"); });
try { const auth = await fetch("/api/auth/me"); if (!auth.ok) location.assign("/agents"); else { const session = await auth.json(); if (session.user?.mustChangePassword) location.assign("/agents"); else { updateUserPresentation(session.user); $("miMain").hidden = false; $("loading").hidden = true; await refreshSettings(); appendMessage("agent", state.connection.configured ? "可以先看看公共电脑已采集的素材，再选择游戏查看趋势、整理月度情报。" : "请先连接公共电脑，再查看已采集的素材。" ); renderStatus(state.connection.configured ? "发送问题后，将从公共电脑读取真实候选素材。" : "请先连接公共电脑。", state.connection.configured ? {} : { action: { label: "配置数据连接", run: () => openSettings("connection"), primary: true } }); } } } catch { $("loading").textContent = "暂时无法连接工作台，请刷新后重试。"; }
