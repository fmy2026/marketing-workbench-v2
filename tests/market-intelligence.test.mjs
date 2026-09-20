import assert from "node:assert/strict";
import { createServer as reservePort } from "node:net";
import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorkbenchServer } from "../src/server/workbenchServer.mjs";
import { hashPassword, hashSessionToken, WORKBENCH_SESSION_COOKIE } from "../src/security/workbenchAuth.mjs";
import { createMiConnectionStore, normalizeMiOrigin } from "../src/security/marketIntelligenceConnectionStore.mjs";
import { createMiClient, miCompareIds, projectMiTrend } from "../src/platforms/marketIntelligenceClient.mjs";
import { answerMarketIntelligence } from "../src/agents/marketIntelligenceConversation.mjs";

const preview = process.argv.includes("--preview");
const directory = await mkdtemp(join(tmpdir(), "mwb-mi-fixture-"));
const credentialPath = join(directory, "connection.json");
const modelCredentialPath = join(directory, "model-credentials.json");
const previousModelCredentialPath = process.env.MWBV2_WORKBENCH_LLM_CREDENTIAL_PATH;
process.env.MWBV2_WORKBENCH_LLM_CREDENTIAL_PATH = modelCredentialPath;
const fixtureToken = "synthetic-fixture-token-".padEnd(64, "x");
const idA = "a".repeat(32), idB = "b".repeat(32);
const sessions = new Map();
const modelConfigs = new Map();
let modelRevision = 0;
const users = ["one", "two"].map((name) => ({ user_id: `USR-MI-TEST-${name}`, login_name: `mi_${name}`, display_name: `市场情报测试 ${name}`, user_status: "active", user_role: "operator", must_change_password: false }));
const password = "Synthetic-market-test-2026";
for (const user of users) user.password_hash = await hashPassword(password);
for (let i = 0; i < users.length; i++) sessions.set(hashSessionToken(`synthetic-session-${i}`), { user: users[i], session: { session_id: `SESSION-${i}` } });
const repo = {
  async getActiveWorkbenchSession(hash) { return sessions.get(hash); }, async touchWorkbenchSession() {},
  async countRecentFailedLogins() { return 0; }, async getWorkbenchUserByLogin(name) { return users.find((u) => u.login_name === name); },
  async createWorkbenchSession(value) { sessions.set(value.tokenHash, { user: users.find((u) => u.user_id === value.userId), session: { session_id: value.sessionId } }); },
  async insertWorkbenchAuditEvent() {}, async revokeWorkbenchSession() {},
  async getWorkbenchAgentModelConfig({ userId, agentKey }) { return modelConfigs.get(`${userId}:${agentKey}`) || null; },
  async upsertWorkbenchAgentModelConfig(value) {
    const prior = modelConfigs.get(`${value.userId}:${value.agentKey}`);
    const config = { protocol: value.protocol, modelName: value.modelName, apiBase: value.apiBase, enabled: value.enabled, testStatus: value.testStatus, testedAt: value.resetTestState === false ? prior?.testedAt || null : null, updatedAt: `2026-09-20T00:00:${String(++modelRevision).padStart(2, "0")}Z` };
    modelConfigs.set(`${value.userId}:${value.agentKey}`, config); return config;
  },
  async recordWorkbenchAgentModelConfigTest({ userId, agentKey, passed, enableOnPass, expectedUpdatedAt }) {
    const prior = modelConfigs.get(`${userId}:${agentKey}`); if (!prior || (expectedUpdatedAt && expectedUpdatedAt !== prior.updatedAt)) return null;
    const config = { ...prior, enabled: passed && enableOnPass === true, testStatus: passed ? "passed" : "failed", testedAt: `2026-09-20T00:00:${String(++modelRevision).padStart(2, "0")}Z`, updatedAt: `2026-09-20T00:00:${String(modelRevision).padStart(2, "0")}Z` };
    modelConfigs.set(`${userId}:${agentKey}`, config); return config;
  }
};
const calls = [];
let mode = "ok";
let modelTestMode = "passed";
let modelTestCalls = 0;
let modelRuntimeMode = "invalid";
const meta = { source: "隔离合成素材（测试）", caliber: "synthetic", timezone: "Asia/Shanghai", queried_at: "2026-09-18T10:00:00Z", updated_at: "2026-09-18T09:00:00Z", total: 2 };
const video = process.env.MI_TEST_VIDEO_PATH ? await readFile(process.env.MI_TEST_VIDEO_PATH) : Buffer.from("synthetic-video-bytes-for-range-test");
async function fakeFetch(input, options) {
  const url = new URL(input);
  calls.push({ path: url.pathname, params: Object.fromEntries(url.searchParams), method: options.method, redirect: options.redirect });
  assert.equal(url.origin, "http://192.168.50.2:8787");
  assert.equal(options.redirect, "error");
  assert(["GET", "HEAD"].includes(options.method));
  if (mode === "offline") throw new Error("private diagnostic must not leak");
  if (options.headers.authorization !== `Bearer ${fixtureToken}`) return new Response("secret error response", { status: 401 });
  if (mode === "bad-json") return new Response("broken raw content", { status: 200 });
  if (mode === "large") return new Response("x".repeat(1024 * 1024 + 1));
  if (url.pathname.includes("/files/")) {
    if (mode === "wrong-mime") return new Response("<script>bad</script>", { headers: { "content-type": "text/html" } });
    const range = options.headers.range;
    const mime = url.pathname.endsWith(idB) ? "video/webm" : "video/mp4";
    if (range) {
      const match = range.match(/^bytes=(\d+)-(\d*)$/);
      const start = Number(match?.[1] || 0), end = Math.min(Number(match?.[2] || video.length - 1), video.length - 1);
      if (start >= video.length) return new Response(null, { status: 416 });
      return new Response(options.method === "HEAD" ? null : video.subarray(start, end + 1), { status: 206, headers: { "content-type": mime, "content-range": `bytes ${start}-${end}/${video.length}`, "content-length": String(end - start + 1), "accept-ranges": "bytes" } });
    }
    return new Response(options.method === "HEAD" ? null : video, { headers: { "content-type": mime, "content-length": String(video.length), "accept-ranges": "bytes" } });
  }
  let data;
  if (url.pathname.endsWith("/health")) data = { status: "ok" };
  else if (url.pathname.endsWith("/assets")) data = Number(url.searchParams.get("page")) > 1 ? [] : [
    { id: idA, title: "合成样例 · 城堡挑战", game_name: "测试游戏", secret: "should-never-be-projected" },
    { id: idB, title: "合成样例 · 策略搭配", game_name: "测试游戏" }
  ];
  else if (url.pathname.includes("/assets/")) data = { asset: { id: url.pathname.split("/").at(-1), title: "合成样例 · 城堡挑战", game_name: "测试游戏", creative_labels: { 创意策略: { 营销卖点: "角色成长" } }, script_analysis: { 视频内容: "这是隔离测试用的合成分析文字。", hook: "展示挑战目标" } }, files: [{ path: "/private/do-not-expose" }], raw_payload: "should-never-be-projected" };
  else data = url.searchParams.get("from")?.startsWith("2026-08")
    ? { points: [{ date: "2026-09-15", popularity_daily: 0, top10: 80 }], summary: { popularity_points: 1, points_returned: 1, observed_from: "2026-09-15", observed_to: "2026-09-15" } }
    : { points: [{ date: "2026-09-15", popularity_daily: 0, top10: 80 }, { date: "2026-09-16", popularity_daily: null, top10: 80 }, { date: "2026-09-17", popularity_daily: 120, top10: 100 }, { date: "2026-09-18", popularity_daily: 100, top10: 100 }], summary: { popularity_points: 3, points_returned: 4, observed_from: "2026-09-15", observed_to: "2026-09-18", refline_from: "2026-09-15", refline_to: "2026-09-18", net_change: 100 } };
  return Response.json({ ok: true, data, meta });
}
async function fakeModelFetch(_input, options = {}) {
  modelTestCalls++;
  const request = JSON.parse(options.body || "{}");
  const instruction = request.messages?.[0]?.content || "";
  if (instruction.includes("{purpose,games")) {
    if (modelRuntimeMode === "failed") throw new Error("synthetic runtime failure");
    if (modelRuntimeMode === "accepted") return Response.json({ choices: [{ message: { content: JSON.stringify({ purpose: "search", games: [{ value: "测试游戏", evidence: "测试游戏" }], month: { value: "2026-09", evidence: "2026 年 9 月" } }) } }] });
    return Response.json({ choices: [{ message: { content: "{\"purpose\":\"unsupported\",\"games\":[],\"month\":{}}" } }] });
  }
  if (instruction.includes("{text}")) return Response.json({ choices: [{ message: { content: "{\"text\":\"标签呈现了明确的创意表达方向\"}" } }] });
  if (instruction.includes("{points")) {
    const samples = JSON.parse(request.messages?.[1]?.content || "{}").samples || [];
    const assetIds = samples.slice(0, 3).map((sample) => sample.id);
    return Response.json({ choices: [{ message: { content: JSON.stringify({ points: [
      { text: "素材呈现了清晰的创意表达方向", assetIds: [assetIds[0]] },
      { text: "样本中的创意标签具有可复查的共性", assetIds: [assetIds[1] || assetIds[0]] },
      { text: "观察范围支持继续追踪创意变化", assetIds: [assetIds[2] || assetIds[0]] }
    ], followUp: "继续关注后续采集的创意变化" }) } }] });
  }
  if (modelTestMode === "delayed") await new Promise((resolve) => setTimeout(resolve, 350));
  if (modelTestMode === "failed") return Response.json({ error: { message: "synthetic failure" } }, { status: 401 });
  return Response.json({ choices: [{ message: { content: '{"ok":true}' } }] });
}

async function verifyModelConfigBrowserFlow(origin) {
  const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const browserDirectory = await mkdtemp(join(tmpdir(), "mwb-mi-model-browser-"));
  const debugPort = 35000 + Math.floor(Math.random() * 1000);
  let chrome;
  let socket;
  try {
    await access(chromePath);
    chrome = spawn(chromePath, ["--headless=new", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${browserDirectory}`, "--no-first-run", "--no-default-browser-check", "--disable-gpu", "about:blank"], { stdio: "ignore" });
    const deadline = Date.now() + 15_000;
    let target;
    while (Date.now() < deadline && !target) {
      try { target = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find((item) => item.type === "page"); } catch { /* Chrome is still starting. */ }
      if (!target) await new Promise((resolve) => setTimeout(resolve, 80));
    }
    if (!target) throw new Error("market_intelligence_model_browser_unavailable");
    socket = new WebSocket(target.webSocketDebuggerUrl);
    let nextId = 1;
    const pending = new Map();
    socket.addEventListener("message", ({ data }) => { const message = JSON.parse(String(data)); const item = pending.get(message.id); if (!item) return; pending.delete(message.id); message.error ? item.reject(new Error(message.error.message)) : item.resolve(message.result); });
    await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
    const call = (method, params = {}) => new Promise((resolve, reject) => { const id = nextId++; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
    const evaluate = async (expression) => { const result = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.text); return result.result?.value; };
    const until = async (condition, label) => { const expires = Date.now() + 15_000; while (Date.now() < expires) { if (await condition()) return; await new Promise((resolve) => setTimeout(resolve, 80)); } throw new Error(`browser_wait_timeout:${label}`); };
    await call("Page.enable"); await call("Network.enable");
    await call("Network.setCookie", { name: WORKBENCH_SESSION_COOKIE, value: "synthetic-session-0", url: origin, httpOnly: true });
    await call("Page.navigate", { url: `${origin}/agents/market-intelligence` });
    await until(() => evaluate("Boolean(document.querySelector('#modelConfigButton'))"), "market_intelligence_page");
    await evaluate("document.querySelector('#modelConfigButton').click()");
    await until(() => evaluate("document.querySelector('#settingsDialog').open"), "model_settings");
    await evaluate(`(() => { const fill = (selector, value) => { const input = document.querySelector(selector); input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); }; fill('#modelApiBase', 'https://model.example.test/v1'); fill('#modelName', 'test-model'); document.querySelector('#modelEnabled').checked = true; document.querySelector('#modelEnabled').dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await evaluate("document.querySelector('#saveModel').click(); document.querySelector('#saveModel').click()");
    await until(() => evaluate("document.querySelector('#saveModel').disabled && document.querySelector('#modelState').textContent.includes('正在')"), "model_save_progress");
    await until(() => evaluate("!document.querySelector('#saveModel').disabled && document.querySelector('#modelState').textContent.includes('模型已启用')"), "model_save_complete");
    assert(await evaluate("document.querySelector('#modelKeyState').textContent.includes('已保存')"), "model_key_state_not_visible");
    assert(await evaluate("document.querySelector('#modelDirty').hidden"), "model_dirty_state_not_cleared");
  } finally {
    socket?.close(); chrome?.kill("SIGTERM"); await rm(browserDirectory, { recursive: true, force: true });
  }
}
let port = 3138;
if (!preview) {
  const reservation = reservePort();
  await new Promise((resolve) => reservation.listen(0, "127.0.0.1", resolve));
  port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
}
const configuredOrigin = `http://127.0.0.1:${port}`;
const { server } = createWorkbenchServer({ repo, env: { WORKBENCH_BIND_HOST: "127.0.0.1", WORKBENCH_PORT: String(port), WORKBENCH_PUBLIC_ORIGIN: configuredOrigin, MWBV2_MI_CONNECTION_STORE_PATH: credentialPath }, marketIntelligenceFetch: fakeFetch, marketIntelligenceModelFetch: fakeModelFetch, modelConfigTestFetch: fakeModelFetch });
await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
process.env.MWBV2_TEST_ORIGIN = origin;
const store = createMiConnectionStore({ path: credentialPath });
if (preview) {
  store.set(users[0].user_id, { baseUrl: "http://192.168.50.2:8787", token: fixtureToken });
  console.log(JSON.stringify({ preview: origin, login: users[0].login_name, password, synthetic: true }));
  const stop = () => { server.close(); rm(directory, { recursive: true, force: true }).finally(() => process.exit(0)); };
  process.on("SIGTERM", stop); process.on("SIGINT", stop);
} else {
  let checks = 0;
  const check = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
  async function request(path, { user = 0, body, method = body === undefined ? "GET" : "POST", headers = {} } = {}) {
    return fetch(`${origin}${path}`, { method, headers: { host: new URL(configuredOrigin).host, origin: configuredOrigin, "content-type": "application/json", ...(user === null ? {} : { cookie: `${WORKBENCH_SESSION_COOKIE}=synthetic-session-${user}` }), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  }
  const root = "/api/agents/market_intelligence";
  const ask = async (message, context = {}) => (await request(`${root}/conversation`, { body: { message, context } })).json();
  try {
    check((await request(`${root}/connection`, { user: null })).status, 401);
    check((await request(`${root}/files/${idA}`, { user: null })).status, 401);
    check((await ask("有哪些素材？")).needsConnection, true);
    const connection = { baseUrl: "http://192.168.50.2:8787", token: fixtureToken, allowHttp: true };
    check((await request(`${root}/connection`, { body: connection, headers: { origin: "http://wrong-origin.test" } })).status, 403);
    check((await request(`${root}/connection`, { body: { ...connection, allowHttp: false } })).status, 400);
    check((await request(`${root}/connection`, { body: { ...connection, token: "wrong-token-value" } })).status, 422);
    check((await request(`${root}/connection`, { body: connection })).status, 200);
    check((await stat(credentialPath)).mode & 0o777, 0o600);
    const publicConfig = await (await request(`${root}/connection`)).text();
    check(publicConfig.includes(fixtureToken), false);
    check((await (await request(`${root}/connection`, { user: 1 })).json()).configured, false);
    check((await request(`${root}/files/${idA}`, { user: 1 })).status, 409);
    check((await request(`${root}/connection`, { body: { ...connection, baseUrl: "http://192.168.50.3:8787", token: "" } })).status, 400);
    for (const url of ["http://127.0.0.1:3000", "http://169.254.169.254", "https://example.com", "http://192.168.50.2/a", "http://user:pass@192.168.50.2", "http://192.168.50.2/?token=x"]) { assert.throws(() => normalizeMiOrigin(url)); checks++; }
    let response = await ask("当前有哪些已采集游戏和素材");
    check(response.intent.kind, "discover"); check(response.discoveryPage, 1); check(response.parseSource, "rules");
    response = await ask("查看当前已采集的游戏和素材");
    check(response.intent.kind, "discover"); check(response.discoveryPage, 1);
    const discovery = await (await request(`${root}/discover`, { body: { page: 1 } })).json();
    check(discovery.games, ["测试游戏"]); check(discovery.assets.length, 2); check(discovery.canContinueDiscovery, false);
    response = await ask("看看 2026 年 9 月测试游戏的素材");
    check(response.intent.kind, "search"); check(response.filters.month, "2026-09");
    const search = async (filters) => (await request(`${root}/search`, { body: { filters } })).json();
    response = await search(response.filters);
    check(response.assets.length, 2); check(response.resultCount, 2);
    check(JSON.stringify(response).includes("should-never"), false);
    const selection = { ids: [idA, idB], filters: response.filters };
    response = await ask("播放第一条", selection);
    check(response.detail.asset.id, idA);
    check(JSON.stringify(response).includes("/private/"), false);
    check(response.detail.asset.labels, ["营销卖点：角色成长"]);
    response = await ask(`看看素材 ${idA} 最近 7 天的人气趋势`, response.context);
    check(response.trend.points.map((p) => p.value), [0, null, 120, 100]);
    check(response.trend.summary.popularityPoints, 3); check(response.trend.summary.observedFrom, "2026-09-15");
    check(response.trend.points.map((p) => p.refline.top10 || null), [80, 80, 100, 100]);
    check(calls.at(-1).params.asset, idA);
    check(Boolean(calls.at(-1).params.from && calls.at(-1).params.to), true);
    response = await ask("为什么这条素材值得关注", { ...response.context, selectedId: idA });
    check(response.intent.kind, "insight"); check(response.intent.assetId, idA);
    const insight = await (await request(`${root}/asset-insight`, { body: { assetId: idA, filters: response.filters } })).json();
    check(insight.aiStatus, "not_configured"); check(insight.observation.includes("不代表投放效果"), true);
    const unsupported = await answerMarketIntelligence({ message: "最近哪些素材上升最多？", context: selection, client: { json: async () => { throw new Error("should not query"); } } });
    check(unsupported.reply.includes("暂未提供"), true);
    check((await ask("播放第三条", selection)).reply.includes("没有这条"), true);
    response = await ask("下一页", selection); check(response.intent.kind, "search"); check(response.filters.page, 2);
    const report = await (await request(`${root}/report`, { body: { filters: { games: ["测试游戏"], month: "2026-09" } } })).json();
    check(report.sampleCount, 2); check(report.samples.some((sample) => sample.monthEvidence.points.some((point) => point.value === 0)), true);
    check(report.narrative.points.length, 3);
    check((await request(`${root}/report`, { body: { filters: { games: ["测试游戏"], month: "2026-08" } } })).status, 422);
    const range = await request(`${root}/files/${idA}`, { headers: { range: "bytes=0-9" } });
    check(range.status, 206); check((await range.arrayBuffer()).byteLength, 10); check(range.headers.get("content-range"), `bytes 0-9/${video.length}`);
    const head = await request(`${root}/files/${idB}`, { method: "HEAD" }); check(head.headers.get("content-type"), "video/webm"); check(await head.text(), "");
    check((await request(`${root}/files/${idA}`, { headers: { range: "bytes=0-1,4-8" } })).status, 416);
    check((await request(`${root}/files/${idA}`, { headers: { range: "bytes=99999999-" } })).status, 416);
    mode = "wrong-mime"; check((await request(`${root}/files/${idA}`)).status, 502);
    mode = "offline"; check((await request(`${root}/search`, { body: { filters: { games: ["测试游戏"], month: "2026-09" } } })).status, 502);
    mode = "bad-json"; check((await request(`${root}/search`, { body: { filters: { games: ["测试游戏"], month: "2026-09" } } })).status, 502);
    mode = "large"; check((await request(`${root}/search`, { body: { filters: { games: ["测试游戏"], month: "2026-09" } } })).status, 502); mode = "ok";
    const redirectClient = createMiClient({ ...connection, fetchImpl: async () => new Response(null, { status: 302, headers: { location: "http://outside.test" } }) });
    await assert.rejects(redirectClient.json("/health"), /mi_service_error/); checks++;
    assert.throws(() => projectMiTrend({ points: [{ date: "2026-09-18", popularity_daily: "0" }] }), /mi_invalid_response/); checks++;
    assert.throws(() => projectMiTrend({ points: [{ date: "2026-09-18", popularity_daily: 0 }, { date: "2026-09-18", popularity_daily: 1 }] }), /mi_invalid_response/); checks++;
    assert.throws(() => projectMiTrend({ points: [{ date: "2026-09-18", popularity_daily: 0, top10: "0" }] }), /mi_invalid_response/); checks++;
    check(miCompareIds([idA, idB]), [idA, idB]);
    assert.throws(() => miCompareIds([idA]), /mi_bad_query/); checks++;
    assert.throws(() => miCompareIds([idA, idA]), /mi_bad_query/); checks++;
    const parsed = await answerMarketIntelligence({ message: "你能做什么？", client: null }); check(parsed.reply.includes("真实游戏名称"), true);
    const catalog = await (await request("/api/agents")).json(); check(catalog.agents.map((a) => a.agentKey), ["launch_creation", "market_intelligence"]);
    check((await request("/api/agents/market-intelligence/model-config")).status, 200);
    const invalidModelConfig = await request("/api/agents/market-intelligence/model-config", { method: "PUT", body: { api_base: "not-a-url", model_name: "test-model", enabled: false } });
    check(invalidModelConfig.status, 400); check((await invalidModelConfig.json()).error, "invalid_model_api_base");
    const modelSave = await (await request("/api/agents/market-intelligence/model-config", { method: "PUT", body: { api_base: "https://model.example.test/v1", model_name: "test-model", api_key: "synthetic-model-key", enabled: false } })).json();
    check(modelSave.config.testStatus, "not_tested"); check(modelSave.config.credentialConfigured, true);
    const modelTestResponse = await request("/api/agents/market-intelligence/model-config/test", { body: { configuration_updated_at: modelSave.config.updatedAt, enabled: true } });
    check(modelTestResponse.status, 200); const modelTest = await modelTestResponse.json();
    check(modelTest.config.testStatus, "passed"); check(modelTest.config.enabled, true);
    modelRuntimeMode = "accepted";
    const modelParsed = await ask("请研究测试游戏在 2026 年 9 月的创意");
    check(modelParsed.intent.kind, "search"); check(modelParsed.parseSource, "model"); check(modelParsed.filters.games, ["测试游戏"]);
    const modelInsight = await (await request(`${root}/asset-insight`, { body: { assetId: idA, filters: { month: "2026-09" } } })).json();
    check(modelInsight.aiStatus, "used");
    const modelReport = await (await request(`${root}/report`, { body: { filters: { games: ["测试游戏"], month: "2026-09" } } })).json();
    check(modelReport.aiStatus, "used");
    modelRuntimeMode = "invalid";
    const invalidModelParse = await ask("请研究测试游戏在 2026 年 9 月的创意");
    check(invalidModelParse.parseSource, "model_fallback");
    modelRuntimeMode = "failed";
    const failedModelParse = await ask("请研究测试游戏在 2026 年 9 月的创意");
    check(failedModelParse.parseSource, "model_fallback");
    modelRuntimeMode = "invalid";
    const modelRetestResponse = await request("/api/agents/market-intelligence/model-config/test", { body: { configuration_updated_at: modelTest.config.updatedAt } });
    check(modelRetestResponse.status, 200); const modelRetest = await modelRetestResponse.json(); check(modelRetest.config.enabled, true);
    const modelToggle = await (await request("/api/agents/market-intelligence/model-config", { method: "PUT", body: { api_base: "https://model.example.test/v1", model_name: "test-model", enabled: false } })).json();
    check(modelToggle.config.testStatus, "passed"); check(modelToggle.config.testedAt, modelRetest.config.testedAt); check(modelToggle.config.enabled, false);
    const staleTest = await request("/api/agents/market-intelligence/model-config/test", { body: { configuration_updated_at: modelSave.config.updatedAt, enabled: true } });
    check(staleTest.status, 409); check((await staleTest.json()).error, "model_config_changed");
    modelTestMode = "failed";
    const failedModelTest = await request("/api/agents/market-intelligence/model-config/test", { body: { configuration_updated_at: modelToggle.config.updatedAt, enabled: true } });
    check(failedModelTest.status, 422); check((await failedModelTest.json()).error, "model_connection_test_failed");
    const failedModelConfig = await (await request("/api/agents/market-intelligence/model-config")).json(); check(failedModelConfig.config.enabled, false); check(failedModelConfig.config.testStatus, "failed"); modelTestMode = "passed";
    modelTestCalls = 0; modelTestMode = "delayed";
    await verifyModelConfigBrowserFlow(origin);
    check(modelTestCalls, 1); modelTestMode = "passed";
    check((await request("/agents/market-intelligence")).status, 200);
    check((await request("/agents/launch-creation")).status, 200);
    check((await request(`${root}/connection/remove`, { body: {} })).status, 200);
    check((await ask("有哪些素材？")).needsConnection, true);
    const clientSource = await readFile(new URL("../frontend/market-intelligence.mjs", import.meta.url), "utf8");
    const clientPage = await readFile(new URL("../frontend/market-intelligence.html", import.meta.url), "utf8");
    check(clientSource.includes('$("serviceAddress").value = config?.baseUrl || "";'), true);
    check(clientSource.includes("查看当前已采集的游戏和素材"), true); check(clientSource.includes("巨兽战场"), false);
    check(clientPage.includes('data-mi-module="overview"'), true);
    check(clientPage.includes('data-mi-module="conversation"'), true);
    check(clientPage.includes('data-mi-module="memory"'), true);
    check(clientPage.includes('data-mi-module="knowledge"'), true);
    check(clientPage.includes('data-mi-module="skills"'), true);
    check(clientPage.includes('data-mi-module="statistics"'), true);
    check(clientPage.includes("输入市场情报需求…"), true);
    check(clientPage.includes("JSON"), false);
    check(clientSource.includes("renderMemory"), true);
    check(clientSource.includes("renderStatistics"), true);
    check(clientSource.includes("pendingQuestion"), true);
    check(clientSource.includes("继续查询"), true);
    check(clientSource.includes("invalid_model_api_base"), true);
    check(clientSource.includes("正在保存配置…"), true);
    check(clientSource.includes("正在测试连接…"), true);
    check(clientSource.includes("正在确认状态…"), true);
    check(clientSource.includes("configuration_updated_at"), true);
    check(clientSource.includes("已使用规则解读"), true);
    check(clientSource.includes("已使用大模型解析"), true);
    check(clientSource.includes("大模型解析未成功，已回退规则解读"), true);
    check(clientPage.includes('id="modelApiBase" type="url" autocomplete="off" placeholder="https://…/v1" required'), true);
    check(clientPage.includes("保存并测试"), true); check(clientPage.includes('id="testModel"'), false);
    console.log(JSON.stringify({ status: "passed", checks, fixtureOnly: true, externalRequests: 0, covers: ["user isolation", "CSRF", "credential non-disclosure", "private origin", "read-only", "projection", "zero vs null", "date range", "unsupported capability", "pagination", "video range", "webm MIME", "upstream failure", "response limit", "redirect rejection", "rule source", "model request source", "model fallback source", "model content source"] }));
  } finally {
    server.closeAllConnections(); await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
    if (previousModelCredentialPath === undefined) delete process.env.MWBV2_WORKBENCH_LLM_CREDENTIAL_PATH;
    else process.env.MWBV2_WORKBENCH_LLM_CREDENTIAL_PATH = previousModelCredentialPath;
  }
}
