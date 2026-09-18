import assert from "node:assert/strict";
import { createServer as reservePort } from "node:net";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorkbenchServer } from "../src/server/workbenchServer.mjs";
import { hashPassword, hashSessionToken, WORKBENCH_SESSION_COOKIE } from "../src/security/workbenchAuth.mjs";
import { createMiConnectionStore, normalizeMiOrigin } from "../src/security/marketIntelligenceConnectionStore.mjs";
import { createMiClient, projectMiTrend } from "../src/platforms/marketIntelligenceClient.mjs";
import { answerMarketIntelligence } from "../src/agents/marketIntelligenceConversation.mjs";

const preview = process.argv.includes("--preview");
const directory = await mkdtemp(join(tmpdir(), "mwb-mi-fixture-"));
const credentialPath = join(directory, "connection.json");
const fixtureToken = "synthetic-fixture-token-".padEnd(64, "x");
const idA = "a".repeat(32), idB = "b".repeat(32);
const sessions = new Map();
const users = ["one", "two"].map((name) => ({ user_id: `USR-MI-TEST-${name}`, login_name: `mi_${name}`, display_name: `市场情报测试 ${name}`, user_status: "active", user_role: "operator", must_change_password: false }));
const password = "Synthetic-market-test-2026";
for (const user of users) user.password_hash = await hashPassword(password);
for (let i = 0; i < users.length; i++) sessions.set(hashSessionToken(`synthetic-session-${i}`), { user: users[i], session: { session_id: `SESSION-${i}` } });
const repo = {
  async getActiveWorkbenchSession(hash) { return sessions.get(hash); }, async touchWorkbenchSession() {},
  async countRecentFailedLogins() { return 0; }, async getWorkbenchUserByLogin(name) { return users.find((u) => u.login_name === name); },
  async createWorkbenchSession(value) { sessions.set(value.tokenHash, { user: users.find((u) => u.user_id === value.userId), session: { session_id: value.sessionId } }); },
  async insertWorkbenchAuditEvent() {}, async revokeWorkbenchSession() {}
};
const calls = [];
let mode = "ok";
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
  else data = { points: [{ date: "2026-09-15", popularity_daily: 0 }, { date: "2026-09-16", popularity_daily: null }, { date: "2026-09-17", popularity_daily: 120 }, { date: "2026-09-18", popularity_daily: 100 }], summary: { valid_points: 3, net_change: 100 } };
  return Response.json({ ok: true, data, meta });
}
let port = 3138;
if (!preview) {
  const reservation = reservePort();
  await new Promise((resolve) => reservation.listen(0, "127.0.0.1", resolve));
  port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
}
const configuredOrigin = `http://127.0.0.1:${port}`;
const { server } = createWorkbenchServer({ repo, env: { WORKBENCH_BIND_HOST: "127.0.0.1", WORKBENCH_PORT: String(port), WORKBENCH_PUBLIC_ORIGIN: configuredOrigin, MWBV2_MI_CONNECTION_STORE_PATH: credentialPath }, marketIntelligenceFetch: fakeFetch });
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
    let response = await ask("有哪些素材？");
    check(response.assets.length, 2); check(response.meta.total, 2);
    check(JSON.stringify(response).includes("should-never"), false);
    const selection = response.context;
    response = await ask("播放第一条", selection);
    check(response.detail.asset.id, idA);
    check(JSON.stringify(response).includes("/private/"), false);
    check(response.detail.asset.labels, ["营销卖点：角色成长"]);
    response = await ask("看看这条素材最近 7 天的趋势", response.context);
    check(response.trend.points.map((p) => p.value), [0, null, 120, 100]);
    check(calls.at(-1).params.asset, idA);
    check(Boolean(calls.at(-1).params.from && calls.at(-1).params.to), true);
    const count = calls.length;
    check((await ask("最近哪些素材上升最多？", selection)).reply.includes("暂未提供"), true);
    check(calls.length, count);
    check((await ask("播放第三条", selection)).reply.includes("没有这条"), true);
    await ask("最近有哪些素材？"); check(calls.at(-1).params.game, undefined);
    await ask("测试游戏有哪些素材？"); check(calls.at(-1).params.game, "测试游戏");
    response = await ask("下一页", selection); check(response.assets.length, 0); check(response.context.page, 2);
    const range = await request(`${root}/files/${idA}`, { headers: { range: "bytes=0-9" } });
    check(range.status, 206); check((await range.arrayBuffer()).byteLength, 10); check(range.headers.get("content-range"), `bytes 0-9/${video.length}`);
    const head = await request(`${root}/files/${idB}`, { method: "HEAD" }); check(head.headers.get("content-type"), "video/webm"); check(await head.text(), "");
    check((await request(`${root}/files/${idA}`, { headers: { range: "bytes=0-1,4-8" } })).status, 416);
    check((await request(`${root}/files/${idA}`, { headers: { range: "bytes=99999999-" } })).status, 416);
    mode = "wrong-mime"; check((await request(`${root}/files/${idA}`)).status, 502);
    mode = "offline"; check((await ask("有哪些素材？")).error, "mi_connection_failed");
    mode = "bad-json"; check((await ask("有哪些素材？")).error, "mi_invalid_response");
    mode = "large"; check((await ask("有哪些素材？")).error, "mi_invalid_response"); mode = "ok";
    const redirectClient = createMiClient({ ...connection, fetchImpl: async () => new Response(null, { status: 302, headers: { location: "http://outside.test" } }) });
    await assert.rejects(redirectClient.json("/health"), /mi_service_error/); checks++;
    assert.throws(() => projectMiTrend({ points: [{ date: "2026-09-18", popularity_daily: "0" }] }), /mi_invalid_response/); checks++;
    assert.throws(() => projectMiTrend({ points: [{ date: "2026-09-18", popularity_daily: 0 }, { date: "2026-09-18", popularity_daily: 1 }] }), /mi_invalid_response/); checks++;
    const parsed = await answerMarketIntelligence({ message: "你能做什么？", client: null }); check(parsed.reply.includes("播放第一条"), true);
    const catalog = await (await request("/api/agents")).json(); check(catalog.agents.map((a) => a.agentKey), ["launch_creation", "market_intelligence"]);
    check((await request("/api/agents/market-intelligence/model-config")).status, 404);
    check((await request("/agents/market-intelligence")).status, 200);
    check((await request("/agents/launch-creation")).status, 200);
    check((await request(`${root}/connection/remove`, { body: {} })).status, 200);
    check((await ask("有哪些素材？")).needsConnection, true);
    console.log(JSON.stringify({ status: "passed", checks, fixtureOnly: true, externalRequests: 0, covers: ["user isolation", "CSRF", "credential non-disclosure", "private origin", "read-only", "projection", "zero vs null", "date range", "unsupported capability", "pagination", "video range", "webm MIME", "upstream failure", "response limit", "redirect rejection"] }));
  } finally {
    server.closeAllConnections(); await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
}
