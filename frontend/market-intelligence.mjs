const $ = (id) => document.getElementById(id);
const ROOT = "/api/agents/market_intelligence";
let context = {};
let busy = false;
let config = { configured: false, baseUrl: "" };
const errors = {
  mi_invalid_address: "请输入公共电脑的内网 IPv4 服务地址，例如 http://内网IP:8787。",
  mi_invalid_token: "请填写有效的访问 Token。更换服务地址时需重新录入。",
  mi_credentials_rejected: "公共电脑拒绝了此 Token，请在数据连接中更新。",
  mi_connection_failed: "暂时无法连接公共电脑，请检查地址、网络和服务是否运行。",
  mi_connection_required: "请先配置数据连接。",
  mi_http_confirmation_required: "请确认此连接用于只读验证及 HTTP 的传输方式。",
  mi_invalid_response: "公共电脑返回的数据格式不符合约定，本次未生成结果。",
  mi_not_found: "未找到这条素材，请重新查询列表。",
  mi_bad_query: "公共电脑未接受此查询条件，请简化条件后再试。",
  mi_file_not_ready: "视频尚未就绪或文件缺失，请联系公共电脑维护者。",
  mi_invalid_video: "服务返回了不支持的视频格式。",
  mi_range_invalid: "视频分段读取失败，请重新打开视频。",
  mi_rate_limited: "查询过于频繁，请稍后再试。",
  mi_service_unavailable: "公共电脑数据服务暂时不可用。",
  mi_date_range_required: "请提供两个有效日期，例如 2026-09-01 到 2026-09-18，或使用“最近 7 天”。",
  mi_connection_store_unavailable: "连接配置暂时无法保存或读取，请联系工作台维护者。",
  mi_invalid_message: "请输入不超过 2000 字的问题。",
  mi_access_denied: "此凭证无权读取请求的数据。"
};
const errorMessage = (error) => errors[error.code] || "本次请求未成功，请稍后重试。";
function el(tag, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = text;
  return node;
}
async function api(path, body) {
  const response = await fetch(`${ROOT}${path}`, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  if (response.status === 401) { location.assign("/agents"); throw { code: "authentication_required" }; }
  let value;
  try { value = await response.json(); } catch { throw { code: "mi_invalid_response" }; }
  if (!response.ok) throw { code: value.error };
  return value;
}
function updateConnection(value) {
  config = value;
  $("connectionState").textContent = value.configured ? "公共电脑只读数据 · 常用自然语言查询 · 对话仅保留在当前页面" : "尚未连接公共电脑 · 在右上角“数据连接”录入后开始验证";
  $("tokenState").textContent = value.configured ? "Token 已配置；留空沿用，保存后不会回显。" : "尚未配置 Token";
  $("removeConnection").hidden = !value.configured;
}
function openConnection() {
  $("serviceAddress").value = config.baseUrl;
  $("serviceToken").value = "";
  $("allowHttp").checked = false;
  $("connectionError").textContent = "";
  $("connectionDialog").showModal();
}
function message(role, text) {
  $("welcome").hidden = true;
  const node = el("article", `mi-message is-${role}`);
  node.append(el("p", "", text));
  $("messages").append(node);
  return node;
}
function button(text, prompt, state) {
  const node = el("button", "mi-small-button", text);
  node.type = "button";
  node.addEventListener("click", () => submit(prompt, state));
  return node;
}
function source(node, result) {
  const meta = result.meta;
  if (!meta) return;
  node.append(el("p", "mi-source", [meta.source, meta.caliber, meta.updatedAt && `数据更新 ${meta.updatedAt}`, meta.queriedAt && `查询 ${meta.queriedAt}`].filter(Boolean).join(" · ")));
}
function chart(points) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 680 200"); svg.classList.add("mi-chart"); svg.setAttribute("role", "img"); svg.setAttribute("aria-label", "素材每日人气值，空缺处断开；完整数值见下方表格");
  const values = points.filter((point) => point.value !== null).map((point) => point.value);
  if (!values.length) return el("p", "mi-small", "这个范围内暂无有效人气值。可以查看其他日期范围。");
  const referenceValues = points.flatMap((point) => Object.values(point.refline || {}));
  const max = Math.max(...values, ...referenceValues, 1);
  function shape(tag, attrs, text) { const node = document.createElementNS(svg.namespaceURI, tag); for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v); if (text) node.textContent = text; svg.append(node); return node; }
  shape("line", { x1: 45, x2: 658, y1: 168, y2: 168, stroke: "#dce6e0" });
  shape("text", { x: 5, y: 22 }, String(max)); shape("text", { x: 25, y: 170 }, "0");
  const first = Date.parse(points[0].date), last = Date.parse(points.at(-1).date);
  let segment = [], previous = null;
  const flush = () => { if (segment.length > 1) shape("polyline", { points: segment.join(" "), class: "mi-chart-line" }); segment = []; };
  for (const point of points) {
    const day = Date.parse(point.date);
    if (point.value === null || (previous !== null && day - previous > 86400000)) flush();
    if (point.value !== null) {
      const x = last === first ? 350 : 45 + (day - first) / (last - first) * 613, y = 168 - point.value / max * 145;
      segment.push(`${x},${y}`);
      const dot = shape("circle", { cx: x, cy: y, r: 2.5, fill: "#608c77" });
      const title = document.createElementNS(svg.namespaceURI, "title"); title.textContent = `${point.date}：${point.value}`; dot.append(title);
    }
    previous = day;
  }
  flush();
  const refStyles = { top1: "#a95a5a", top5: "#ba8b45", top10: "#597ea8", top50: "#8a759f" };
  for (const [key, color] of Object.entries(refStyles)) {
    const line = points.filter((point) => Number.isSafeInteger(point.refline?.[key])).map((point) => {
      const day = Date.parse(point.date), x = last === first ? 350 : 45 + (day - first) / (last - first) * 613;
      return `${x},${168 - point.refline[key] / max * 145}`;
    });
    if (line.length > 1) shape("polyline", { points: line.join(" "), fill: "none", stroke: color, "stroke-dasharray": "4 3" });
  }
  shape("text", { x: 45, y: 193 }, points[0].date); shape("text", { x: 658, y: 193, "text-anchor": "end" }, points.at(-1).date);
  return svg;
}
function render(node, result) {
  node.replaceChildren(el("p", "", result.reply));
  if (result.needsConnection) {
    const connect = el("button", "mi-small-button", "配置数据连接"); connect.type = "button";
    connect.addEventListener("click", openConnection); node.append(connect);
  }
  if (result.assets) {
    const list = el("div", "mi-asset-list");
    result.assets.forEach((asset, index) => {
      const card = el("div", "mi-asset"), info = el("div");
      info.append(el("strong", "", `${index + 1}. ${asset.title}`), el("small", "", [asset.game, asset.id.slice(0, 12)].filter(Boolean).join(" · ")));
      card.append(info, button("打开", `打开素材 ${asset.id}`, result.context)); list.append(card);
    });
    node.append(list);
    const pages = el("div", "mi-pagination");
    if (result.context.page > 1) pages.append(button("上一页", "上一页", result.context));
    if (result.assets.length && (result.meta.total === null || result.context.page * 5 < result.meta.total)) pages.append(button("下一页", "下一页", result.context));
    node.append(pages);
  }
  if (result.detail) {
    const { asset, script } = result.detail;
    node.append(el("h3", "mi-detail-title", asset.title));
    const player = el("video"); player.controls = true; player.preload = "metadata"; player.playsInline = true; player.src = `${ROOT}/files/${asset.id}`;
    const hint = el("p", "mi-error");
    player.addEventListener("error", () => { hint.textContent = "视频暂时无法播放。请检查连接、文件状态，或尝试支持此视频格式的浏览器。"; });
    node.append(player, hint, button("查看人气趋势", "看看这条素材的趋势", { ...result.context, selectedId: asset.id }));
    const tags = el("div", "mi-tags"); asset.labels.forEach((label) => tags.append(el("span", "mi-tag", label))); node.append(tags);
    if (!asset.labels.length) node.append(el("p", "mi-source", "暂无可展示的平台标签。"));
    const analysis = el("details", "mi-analysis"); analysis.append(el("summary", "", "平台已有脚本分析"), el("p", "", script || "暂无可展示的平台脚本分析。")); node.append(analysis);
    node.append(el("p", "mi-source", `素材 ${asset.id}`));
  }
  if (result.trend) {
    const points = result.trend.points;
    node.append(chart(points));
    const summary = result.trend.summary || {};
    node.append(el("p", "mi-source", [
      summary.observedFrom && summary.observedTo ? `有效观察 ${summary.observedFrom} 至 ${summary.observedTo}` : "有效观察范围未提供",
      summary.reflineFrom && summary.reflineTo ? `参考线覆盖 ${summary.reflineFrom} 至 ${summary.reflineTo}` : "参考线覆盖未提供",
      summary.popularityPoints === null ? "有效人气点数未提供" : `有效人气点 ${summary.popularityPoints}`,
      summary.pointsReturned === null ? "返回行数未提供" : `返回行 ${summary.pointsReturned}`,
      summary.netChange === null ? "净变化未提供" : `净变化 ${summary.netChange}`
    ].join(" · ")));
    const detail = el("details", "mi-analysis"); detail.append(el("summary", "", "查看逐日数值"));
    const wrap = el("div", "mi-table-wrap"), table = el("table"), head = el("thead"), tr = el("tr");
    tr.append(el("th", "", "日期"), el("th", "", "日人气值")); head.append(tr); table.append(head);
    const body = el("tbody"); points.forEach((point) => { const row = el("tr"); row.append(el("td", "", point.date), el("td", "", point.value === null ? "缺失" : String(point.value))); body.append(row); });
    table.append(body); wrap.append(table); detail.append(wrap); node.append(detail, el("p", "mi-source", `素材 ${result.assetId} · 0 为平台报告值，缺失值不补零；虚线为平台百分位参考线的日展开`));
  }
  source(node, result);
}
async function submit(text, state = context) {
  if (busy || !String(text).trim()) return;
  busy = true; $("sendButton").disabled = true; $("messageInput").disabled = true; $("connectionButton").disabled = true;
  message("user", text);
  const reply = message("agent", "正在查询…"); reply.scrollIntoView({ block: "nearest" });
  try { const result = await api("/conversation", { message: text, context: state }); context = result.context || context; render(reply, result); }
  catch (error) { reply.replaceChildren(el("p", "", errorMessage(error))); }
  finally { busy = false; $("sendButton").disabled = false; $("messageInput").disabled = false; $("connectionButton").disabled = false; $("messageInput").focus({ preventScroll: true }); }
}
$("chatForm").addEventListener("submit", (event) => { event.preventDefault(); const text = $("messageInput").value.trim(); if (!busy && text) { $("messageInput").value = ""; submit(text); } });
$("messageInput").addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); $("chatForm").requestSubmit(); } });
document.querySelectorAll("[data-prompt]").forEach((node) => node.addEventListener("click", () => submit(node.dataset.prompt)));
$("connectionButton").addEventListener("click", openConnection);
$("closeConnection").addEventListener("click", () => $("connectionDialog").close());
$("connectionDialog").addEventListener("close", () => { $("serviceToken").value = ""; });
$("connectionForm").addEventListener("submit", async (event) => {
  event.preventDefault(); $("connectionError").textContent = ""; $("saveConnection").disabled = true; $("saveConnection").textContent = "正在测试…";
  const body = { baseUrl: $("serviceAddress").value.trim(), token: $("serviceToken").value, allowHttp: $("allowHttp").checked }; $("serviceToken").value = "";
  try { updateConnection(await api("/connection", body)); context = {}; $("messages").replaceChildren(); $("welcome").hidden = false; $("connectionDialog").close(); }
  catch (error) { $("connectionError").textContent = errorMessage(error); }
  finally { body.token = ""; $("saveConnection").disabled = false; $("saveConnection").textContent = "保存并测试连接"; }
});
$("removeConnection").addEventListener("click", async () => {
  try { updateConnection(await api("/connection/remove", {})); context = {}; $("messages").replaceChildren(); $("welcome").hidden = false; $("connectionDialog").close(); }
  catch (error) { $("connectionError").textContent = errorMessage(error); }
});
try {
  const response = await fetch("/api/auth/me");
  if (!response.ok) location.replace("/agents");
  else {
    const session = await response.json();
    if (session.user?.mustChangePassword) location.replace("/agents");
    else { $("miMain").hidden = false; $("loading").hidden = true; updateConnection(await api("/connection")); }
  }
} catch { $("loading").hidden = false; $("loading").textContent = "暂时无法连接工作台，请刷新后重试。"; }
