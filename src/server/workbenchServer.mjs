import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createMiConnectionStore, miError, normalizeMiOrigin, normalizeMiToken } from "../security/marketIntelligenceConnectionStore.mjs";
import { createMiClient, projectMiDetail, projectMiTrend } from "../platforms/marketIntelligenceClient.mjs";
import { answerMarketIntelligence, applyMarketIntelligenceModelIntent, parseMarketIntelligenceRequest } from "../agents/marketIntelligenceConversation.mjs";
import { buildMarketIntelligenceReport, discoverMarketIntelligence, interpretMarketIntelligenceAsset, searchMarketIntelligence } from "../agents/marketIntelligenceReport.mjs";
import { createOpenAiCompatibleMarketIntelligenceModel } from "../agents/openaiCompatibleMarketIntelligenceModel.mjs";
import { PostgresRepository } from "../repositories/postgresRepository.mjs";
import {
  getPublicAgent,
  isRegisteredAgentPath,
  listPublicAgents
} from "../agents/agentRegistry.mjs";
import {
  getWorkbenchLlmCredential,
  hasWorkbenchLlmCredential,
  setWorkbenchLlmCredential,
  credentialRefFor
} from "../security/workbenchAgentModelCredentialStore.mjs";
import {
  normalizeOpenAiCompatibleModelConfig,
  testOpenAiCompatibleModelConfig
} from "../agents/openaiCompatibleModelConfigTest.mjs";
import {
  createConversationIntentResolver,
  createOpenAiCompatibleIntentAdapter,
  resolveLaunchRequestIntake
} from "../agents/conversationIntentResolver.mjs";
import { normalizeLaunchRequestFromBody, PROJECT_VIDEO_APPEND_OPERATION, validateLaunchRequest } from "../agents/launchRequest.mjs";
import { resolveWorkflowStatisticsScope } from "../agents/agentWorkspaceScopes.mjs";
import {
  buildWorkbenchView,
  createJob,
  createWorkflowCase,
  getJobView,
  runJob,
  runWorkbenchInitialReadonly
} from "../workflows/launchWorkflow.mjs";
import { executeConfirmedLaunch } from "../workflows/executeConfirmedLaunch.mjs";
import { createOceanEngineReadonlyClient } from "../platforms/oceanengineReadonlyClient.mjs";
import { handleWorkbenchCommand } from "../workflows/workbenchConversation.mjs";
import {
  WORKBENCH_ORIGIN
} from "../../frontend/workbench-address.mjs";
import {
  WORKBENCH_SESSION_COOKIE,
  WORKBENCH_SESSION_TTL_SECONDS,
  clearSessionCookie,
  createSessionCredential,
  hashPassword,
  hashSessionToken,
  normalizeLoginName,
  parseCookieHeader,
  publicUser,
  sessionCookie,
  validateNewPassword,
  verifyPassword
} from "../security/workbenchAuth.mjs";
import { resolveWorkbenchNetworkPolicy } from "../security/workbenchNetworkPolicy.mjs";
import { internalErrorDiagnostic, publicErrorResponse } from "./publicError.mjs";

export function createWorkbenchServer({ repo = new PostgresRepository(), env = process.env, marketIntelligenceFetch = globalThis.fetch, marketIntelligenceModelFetch = globalThis.fetch } = {}) {
const rootDir = normalize(join(dirname(fileURLToPath(import.meta.url)), "../.."));
const frontendDir = join(rootDir, "frontend");
const miConnections = createMiConnectionStore({ path: env.MWBV2_MI_CONNECTION_STORE_PATH });
const networkPolicy = resolveWorkbenchNetworkPolicy(env);
const { bindHost, bindPort, publicOrigin, publicOriginUrl, secureCookies } = networkPolicy;
const acceptedOrigins = new Set([
  publicOrigin,
  ...(networkPolicy.privateLanHttp ? [] : [WORKBENCH_ORIGIN])
]);
const acceptedHosts = new Set([publicOriginUrl.host.toLowerCase(), `${bindHost}:${bindPort}`]);
const securityHeaders = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  ...(secureCookies ? { "strict-transport-security": "max-age=31536000" } : {})
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function sendJson(res, statusCode, body, headers = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
    ...securityHeaders,
    ...headers
  });
  res.end(payload);
}

function sendError(res, error, { method = "", pathname = "", stage = "" } = {}) {
  const response = publicErrorResponse(error);
  if (response.statusCode >= 500) {
    console.error(JSON.stringify(internalErrorDiagnostic({ error, method, pathname, stage })));
  }
  sendJson(res, response.statusCode, response.body);
}

function requestError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function requireRegisteredAgent(agentKey) {
  const normalized = String(agentKey || "").trim().replace(/-/g, "_");
  if (!getPublicAgent(normalized)) throw requestError("agent_not_found", 404);
  return normalized;
}

function workflowReportScope({ requestedScope = "", userRole = "" } = {}) {
  return resolveWorkflowStatisticsScope({ requestedScope, userRole });
}

function publicModelConfig(config, { credentialConfigured = false } = {}) {
  if (!config) {
    return {
      protocol: "openai_compatible",
      modelName: "",
      apiBase: "",
      credentialConfigured: false,
      enabled: false,
      testStatus: "not_configured",
      testedAt: null,
      updatedAt: null
    };
  }
  return {
    protocol: config.protocol,
    modelName: config.modelName,
    apiBase: config.apiBase,
    credentialConfigured: credentialConfigured === true,
    enabled: config.enabled === true && credentialConfigured === true,
    testStatus: credentialConfigured === true ? config.testStatus : "not_configured",
    testedAt: config.testedAt || null,
    updatedAt: config.updatedAt || null
  };
}

async function readCurrentUserModelConfig(userId, agentKey) {
  const config = await repo.getWorkbenchAgentModelConfig({ userId, agentKey });
  const credentialConfigured = hasWorkbenchLlmCredential({ userId, agentKey });
  return { config, credentialConfigured, publicConfig: publicModelConfig(config, { credentialConfigured }) };
}

async function resolverForCurrentUser(userId, agentKey = "launch_creation") {
  const current = await readCurrentUserModelConfig(userId, agentKey);
  if (current.publicConfig.enabled !== true || current.publicConfig.testStatus !== "passed") return undefined;
  return createConversationIntentResolver({
    provider: "openai_compatible",
    model: current.config.modelName,
    apiBase: current.config.apiBase,
    adapters: { openai_compatible: createOpenAiCompatibleIntentAdapter({ apiKey: getWorkbenchLlmCredential({ userId, agentKey }) }) }
  });
}

async function marketIntelligenceModelForCurrentUser(userId) {
  const agentKey = "market_intelligence";
  const current = await readCurrentUserModelConfig(userId, agentKey);
  if (current.publicConfig.enabled !== true || current.publicConfig.testStatus !== "passed") return undefined;
  return createOpenAiCompatibleMarketIntelligenceModel({
    apiBase: current.config.apiBase,
    modelName: current.config.modelName,
    apiKey: getWorkbenchLlmCredential({ userId, agentKey }),
    fetchFn: marketIntelligenceModelFetch
  });
}

function requireJsonMutation(req) {
  const contentType = String(req.headers["content-type"] || "").toLowerCase();
  if (!contentType.startsWith("application/json")) throw requestError("json_content_type_required", 415);
  const origin = String(req.headers.origin || "").replace(/\/$/, "");
  if (!acceptedOrigins.has(origin)) throw requestError("same_origin_workbench_request_required", 403);
}

function auditEventId() {
  return `AUDIT-${Date.now()}-${randomBytes(6).toString("hex").toUpperCase()}`;
}

async function audit({ actorUserId = "", subjectUserId = "", advertiserId = "", eventType, eventStatus, summary = {} }) {
  await repo.insertWorkbenchAuditEvent({
    auditEventId: auditEventId(), actorUserId, subjectUserId, advertiserId,
    eventType, eventStatus, summary
  });
}

async function authenticate(req) {
  const token = parseCookieHeader(req.headers.cookie || "")[WORKBENCH_SESSION_COOKIE] || "";
  if (!token) return null;
  const bundle = await repo.getActiveWorkbenchSession(hashSessionToken(token));
  if (!bundle?.user || !bundle?.session) return null;
  await repo.touchWorkbenchSession(bundle.session.session_id);
  return { user: bundle.user, session: bundle.session, token };
}

function requireAdmin(auth) {
  if (auth?.user?.user_role !== "admin") throw requestError("admin_required", 403);
}

async function requireAdvertiserOwner(user, advertiserId) {
  if (!String(advertiserId || "").trim()) throw requestError("advertiser_id_required", 400);
  const access = await repo.getAdvertiserAccess({ advertiserId, userId: user.user_id });
  if (!access?.allowed) throw requestError("advertiser_access_denied", 404);
  return access;
}

async function requireVerifiedAppendProject(user, request) {
  if (request?.operation !== PROJECT_VIDEO_APPEND_OPERATION) return null;
  const access = await repo.getAdvertiserAccess({ advertiserId: request.advertiser_id, userId: user.user_id });
  if (!access?.allowed) throw requestError("advertiser_access_denied", 404);
  const candidate = await repo.getVerifiedProjectVideoAppendCandidate({
    advertiserId: request.advertiser_id,
    projectId: request.project_id,
    userId: user.user_id
  });
  if (!candidate || candidate.routeId !== request.route_id || candidate.gameCode !== request.game_code) {
    throw requestError("project_not_verified_for_advertiser", 400);
  }
  return candidate;
}

async function hydrateAppendIntake(user, intake) {
  if (intake?.draft?.operation !== PROJECT_VIDEO_APPEND_OPERATION) return intake;
  const draft = intake.draft;
  if (!draft.advertiser_id || !draft.project_id) return intake;
  const access = await repo.getAdvertiserAccess({ advertiserId: draft.advertiser_id, userId: user.user_id });
  if (!access?.allowed) {
    return { ...intake, request: null, can_start: false, project: null,
      issues: [{ code: "advertiser_access_denied", message: "账户不可用，请核对本人账户 ID。" }],
      reply: "账户不可用，请核对本人账户 ID。" };
  }
  const project = await repo.getVerifiedProjectVideoAppendCandidate({ advertiserId: draft.advertiser_id, projectId: draft.project_id, userId: user.user_id });
  if (!project) {
    return { ...intake, request: null, can_start: false, project: null,
      issues: [{ code: "project_not_verified_for_advertiser", message: "该账户下未找到已验证项目，请从推荐列表选择或核对项目 ID。" }],
      reply: "该账户下未找到已验证项目，请从推荐列表选择或核对项目 ID。" };
  }
  if ((draft.route_id && draft.route_id !== project.routeId) || (draft.game_code && draft.game_code !== project.gameCode)) {
    return { ...intake, request: null, can_start: false, project: null,
      issues: [{ code: "project_context_conflict", message: "项目的路线或游戏与输入不一致，请删除冲突字段后重试。" }],
      reply: "项目的路线或游戏与输入不一致，请删除冲突字段后重试。" };
  }
  const hydratedDraft = { schema_version: "launch-request.v2", ...draft, route_id: project.routeId, game_code: project.gameCode };
  if ((intake.issues || []).length) {
    return {
      ...intake,
      draft: hydratedDraft,
      request: null,
      can_start: false,
      project,
      reply: intake.reply || "输入需要修正后再试。"
    };
  }
  const missing = intake.missing_fields || [];
  const request = missing.length ? null : validateLaunchRequest(hydratedDraft);
  return {
    ...intake,
    draft: hydratedDraft,
    request,
    can_start: missing.length === 0 && !(intake.issues || []).length,
    project,
    reply: missing.length
      ? `已匹配项目“${project.projectName || project.projectId}”及所属游戏；请补充：视频标识码。`
      : `已匹配项目“${project.projectName || project.projectId}”及所属游戏；已记录 ${draft.origin_resource_ids.length} 条视频标识码，可启动流程。`
  };
}

async function requireCaseOwner(user, caseId) {
  if (!String(caseId || "").trim()) throw requestError("case_id_required", 400);
  const access = await repo.getWorkflowCaseAccess({ caseId, userId: user.user_id });
  if (!access?.allowed) throw requestError("workflow_case_not_found", 404);
  return access;
}

async function requireJobOwner(user, jobId) {
  if (!String(jobId || "").trim()) throw requestError("job_id_required", 400);
  const access = await repo.getLaunchJobAccess({ jobId, userId: user.user_id });
  if (!access?.allowed) throw requestError("job_not_found", 404);
  return access;
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 64 * 1024) throw requestError("request_body_too_large", 413);
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw requestError("invalid_json_body", 400);
  }
}

async function serveStatic(req, res, pathname) {
  const requested = pathname.replace(/\/$/, "") === "/agents/market-intelligence" ? "/market-intelligence.html"
    : pathname === "/" || isRegisteredAgentPath(pathname) ? "/index.html" : pathname;
  const safePath = normalize(join(frontendDir, requested));
  if (!safePath.startsWith(frontendDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    let data = await readFile(safePath);
    if (requested === "/index.html" && env.MWBV2_TEST_WORKBENCH === "true") {
      data = Buffer.from(data.toString("utf8").replace("</head>", "<script>window.__MWBV2_TEST_WORKBENCH__=true;</script></head>"));
    }
    res.writeHead(200, {
      "content-type": mimeTypes[extname(safePath)] || "application/octet-stream",
      "cache-control": "no-store",
      ...securityHeaders
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not Found");
  }
}

async function createAndStoreSession(user) {
  const credential = createSessionCredential();
  const expiresAt = new Date(Date.now() + WORKBENCH_SESSION_TTL_SECONDS * 1000).toISOString();
  await repo.createWorkbenchSession({
    sessionId: credential.sessionId,
    userId: user.user_id,
    tokenHash: credential.tokenHash,
    expiresAt
  });
  return { ...credential, expiresAt };
}

async function handleApi(req, res, url) {
  const pathname = url.pathname;
  if (req.method === "POST") requireJsonMutation(req);

  if (req.method === "POST" && pathname === "/api/auth/login") {
    const body = await readBody(req);
    const loginName = normalizeLoginName(body.login_name || body.loginName || "");
    const recentFailures = await repo.countRecentFailedLogins(loginName);
    if (recentFailures >= 5) throw requestError("login_temporarily_locked", 429);
    const user = await repo.getWorkbenchUserByLogin(loginName);
    const valid = user?.user_status === "active" && await verifyPassword(body.password || "", user.password_hash || "");
    if (!valid) {
      await audit({ eventType: "login", eventStatus: "failed", summary: { loginName } });
      throw requestError("invalid_login", 401);
    }
    const session = await createAndStoreSession(user);
    await audit({ actorUserId: user.user_id, subjectUserId: user.user_id, eventType: "login", eventStatus: "passed" });
    return sendJson(res, 200, { user: publicUser(user), expiresAt: session.expiresAt }, {
      "set-cookie": sessionCookie(session.token, { secure: secureCookies })
    });
  }

  const auth = await authenticate(req);
  if (!auth) throw requestError("authentication_required", 401);

  if (req.method === "GET" && pathname === "/api/auth/me") {
    return sendJson(res, 200, { user: publicUser(auth.user) });
  }
  if (req.method === "POST" && pathname === "/api/auth/logout") {
    await repo.revokeWorkbenchSession(auth.session.session_id);
    await audit({ actorUserId: auth.user.user_id, subjectUserId: auth.user.user_id, eventType: "logout", eventStatus: "passed" });
    return sendJson(res, 200, { status: "logged_out" }, {
      "set-cookie": clearSessionCookie({ secure: secureCookies })
    });
  }
  if (req.method === "POST" && pathname === "/api/auth/change-password") {
    const body = await readBody(req);
    const currentValid = await verifyPassword(body.current_password || body.currentPassword || "", auth.user.password_hash || "");
    if (!currentValid) throw requestError("current_password_invalid", 403);
    const nextPassword = body.new_password || body.newPassword || "";
    const validation = validateNewPassword(nextPassword);
    if (!validation.valid) {
      const error = requestError("new_password_invalid", 400);
      error.details = { blockers: validation.blockers };
      throw error;
    }
    const nextHash = await hashPassword(nextPassword);
    await repo.updateWorkbenchUserPassword({
      userId: auth.user.user_id,
      passwordHash: nextHash,
      mustChangePassword: false
    });
    await repo.revokeWorkbenchUserSessions(auth.user.user_id);
    const nextUser = await repo.getWorkbenchUserById(auth.user.user_id);
    const session = await createAndStoreSession(nextUser);
    await audit({ actorUserId: auth.user.user_id, subjectUserId: auth.user.user_id, eventType: "password_change", eventStatus: "passed" });
    return sendJson(res, 200, { user: publicUser(nextUser), expiresAt: session.expiresAt }, {
      "set-cookie": sessionCookie(session.token, { secure: secureCookies })
    });
  }

  if (auth.user.must_change_password === true) throw requestError("password_change_required", 403);

  // Generic model-config routes must stay reachable for market intelligence.
  if (pathname.startsWith("/api/agents/market_intelligence/") && !pathname.startsWith("/api/agents/market_intelligence/model-config")) {
    try {
      const route = pathname.slice("/api/agents/market_intelligence".length);
      const userId = auth.user.user_id;
      if (route === "/connection" && req.method === "GET") return sendJson(res, 200, miConnections.status(userId));
      if (route === "/connection" && req.method === "POST") {
        const body = await readBody(req);
        const baseUrl = normalizeMiOrigin(body.baseUrl);
        if (baseUrl.startsWith("http:") && body.allowHttp !== true) throw miError("mi_http_confirmation_required");
        const previous = miConnections.get(userId);
        const token = normalizeMiToken(body.token || (previous?.baseUrl === baseUrl ? previous.token : ""));
        await createMiClient({ baseUrl, token, fetchImpl: marketIntelligenceFetch }).json("/health");
        return sendJson(res, 200, miConnections.set(userId, { baseUrl, token }));
      }
      if (route === "/connection/remove" && req.method === "POST") return sendJson(res, 200, miConnections.remove(userId));
      if (route === "/conversation" && req.method === "POST") {
        const body = await readBody(req);
        const connection = miConnections.get(userId);
        const client = connection ? createMiClient({ ...connection, fetchImpl: marketIntelligenceFetch }) : null;
        let parsed = parseMarketIntelligenceRequest({ message: body.message, context: body.context });
        let model;
        if (parsed.purpose === "unknown") {
          model = await marketIntelligenceModelForCurrentUser(userId);
          if (model?.parseRequest) {
            try { parsed = applyMarketIntelligenceModelIntent({ message: body.message, parsed, intent: await model.parseRequest({ message: body.message }) }); }
            catch { /* Rules retain the safe clarification path. */ }
          }
        }
        if (["discover", "search", "report", "page", "detail", "trend", "interpret"].includes(parsed.purpose) && !client) {
          return sendJson(res, 200, { reply: "请先在设置中配置数据连接，再开始查询。", needsConnection: true, intent: { kind: "connection" }, context: { filters: parsed.filters } });
        }
        if (parsed.needsCompetitor) {
          return sendJson(res, 200, { reply: "请说明要一起查看的竞品名称；我不会自动补充竞品名单。", intent: { kind: "clarify" }, context: { filters: parsed.filters } });
        }
        if (parsed.purpose === "report" && !parsed.filters.games.length) {
          return sendJson(res, 200, { reply: "请先从已发现的真实游戏名称中选择研究对象，再生成市场情报月报。", intent: { kind: "clarify" }, context: { filters: parsed.filters } });
        }
        if (parsed.purpose === "discover") {
          return sendJson(res, 200, { reply: "正在读取公共电脑当前候选素材。", intent: { kind: "discover" }, discoveryPage: parsed.discoveryPage, context: { discoveryPage: parsed.discoveryPage, filters: parsed.filters } });
        }
        if (["detail", "trend", "interpret"].includes(parsed.purpose)) {
          if (!parsed.assetId) return sendJson(res, 200, { reply: "请先从当前素材列表打开一条素材，再继续查看。", intent: { kind: "clarify" }, context: { filters: parsed.filters } });
          const context = { selectedId: parsed.assetId, filters: parsed.filters };
          if (parsed.purpose === "interpret") return sendJson(res, 200, { reply: "正在依据公共电脑的已核验数据整理说明。", intent: { kind: "insight", assetId: parsed.assetId }, filters: parsed.filters, context });
          if (parsed.purpose === "trend") {
            const trend = await client.json("/stats/trend", { asset: parsed.assetId, ...(parsed.range.from ? parsed.range : { from: parsed.filters.from, to: parsed.filters.to }) });
            return sendJson(res, 200, { reply: "这是所选素材的公共电脑人气值日序列。", intent: { kind: "trend", assetId: parsed.assetId }, trend: projectMiTrend(trend.data), context });
          }
          const detail = await client.json(`/assets/${parsed.assetId}`);
          return sendJson(res, 200, { reply: "已打开这条素材。", intent: { kind: "detail", assetId: parsed.assetId }, detail: projectMiDetail(detail.data, parsed.assetId), context });
        }
        if (["search", "report", "page"].includes(parsed.purpose)) {
          return sendJson(res, 200, {
            reply: parsed.purpose === "report" ? "已确认报告范围，正在整理已采集样本。" : "已更新查询条件。",
            intent: { kind: parsed.purpose === "report" ? "report" : "search" },
            filters: parsed.filters,
            context: { filters: parsed.filters }
          });
        }
        const fallback = await answerMarketIntelligence({ message: body.message, context: body.context, client });
        return sendJson(res, 200, { ...fallback, intent: { kind: "clarify" }, modelConfigurationSuggested: parsed.purpose === "unknown" && !model });
      }
      if (route === "/discover" && req.method === "POST") {
        const body = await readBody(req);
        const connection = miConnections.get(userId);
        if (!connection) throw miError("mi_connection_required", 409);
        return sendJson(res, 200, await discoverMarketIntelligence({ client: createMiClient({ ...connection, fetchImpl: marketIntelligenceFetch }), page: body.page || 1 }));
      }
      if (route === "/search" && req.method === "POST") {
        const body = await readBody(req);
        const connection = miConnections.get(userId);
        if (!connection) throw miError("mi_connection_required", 409);
        const result = await searchMarketIntelligence({ client: createMiClient({ ...connection, fetchImpl: marketIntelligenceFetch }), filters: body.filters });
        return sendJson(res, 200, result);
      }
      if (route === "/report" && req.method === "POST") {
        const body = await readBody(req);
        const connection = miConnections.get(userId);
        if (!connection) throw miError("mi_connection_required", 409);
        const report = await buildMarketIntelligenceReport({
          client: createMiClient({ ...connection, fetchImpl: marketIntelligenceFetch }),
          filters: body.filters,
          model: await marketIntelligenceModelForCurrentUser(userId)
        });
        return sendJson(res, 200, report);
      }
      if (route === "/asset-insight" && req.method === "POST") {
        const body = await readBody(req);
        const connection = miConnections.get(userId);
        if (!connection) throw miError("mi_connection_required", 409);
        return sendJson(res, 200, await interpretMarketIntelligenceAsset({
          client: createMiClient({ ...connection, fetchImpl: marketIntelligenceFetch }), assetId: body.assetId, filters: body.filters,
          model: await marketIntelligenceModelForCurrentUser(userId)
        }));
      }
      const file = route.match(/^\/files\/([a-fA-F0-9]{32})$/);
      if (file && ["GET", "HEAD"].includes(req.method)) {
        const connection = miConnections.get(userId);
        if (!connection) throw miError("mi_connection_required", 409);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 120000);
        const stop = () => controller.abort();
        res.once("close", stop);
        try {
          const response = await createMiClient({ ...connection, fetchImpl: marketIntelligenceFetch }).video(file[1], {
            method: req.method, range: String(req.headers.range || ""), signal: controller.signal
          });
          const headers = { ...securityHeaders, "cache-control": "private, no-store" };
          for (const name of ["content-type", "content-length", "content-range", "accept-ranges"]) {
            if (response.headers.has(name)) headers[name] = response.headers.get(name);
          }
          res.writeHead(response.status, headers);
          if (req.method === "HEAD" || !response.body) { await response.body?.cancel(); res.end(); }
          else await pipeline(Readable.fromWeb(response.body), res);
        } finally { clearTimeout(timer); res.removeListener("close", stop); controller.abort(); }
        return;
      }
      return sendJson(res, 404, { error: "mi_not_found" });
    } catch (error) {
      if (res.headersSent) { res.destroy(); return; }
      // Never forward upstream error text, request bodies, or credential values.
      const code = /^mi_[a-z_]+$/.test(error.message || "") ? error.message : "mi_service_error";
      return sendJson(res, error.statusCode || 502, { error: code });
    }
  }

  if (req.method === "GET" && pathname === "/api/agents") {
    return sendJson(res, 200, { agents: listPublicAgents() });
  }
  const agentMatch = pathname.match(/^\/api\/agents\/([^/]+)$/);
  if (req.method === "GET" && agentMatch) {
    const agent = getPublicAgent(decodeURIComponent(agentMatch[1]).replace(/-/g, "_"));
    if (!agent) return sendJson(res, 404, { error: "agent_not_found" });
    return sendJson(res, 200, { agent });
  }
  const agentMemoryMatch = pathname.match(/^\/api\/agents\/([^/]+)\/memory$/);
  if (req.method === "GET" && agentMemoryMatch) {
    const agentKey = requireRegisteredAgent(decodeURIComponent(agentMemoryMatch[1]));
    if (agentKey !== "launch_creation") return sendJson(res, 404, { error: "agent_memory_not_available" });
    return sendJson(res, 200, {
      cases: await repo.getUserWorkflowMemory({ userId: auth.user.user_id })
    });
  }
  const agentModelConfigMatch = pathname.match(/^\/api\/agents\/([^/]+)\/model-config$/);
  if (agentModelConfigMatch) {
    const agentKey = requireRegisteredAgent(decodeURIComponent(agentModelConfigMatch[1]));
    if (!getPublicAgent(agentKey).modelConfigurable) throw requestError("agent_model_not_available", 404);
    if (req.method === "GET") {
      const current = await readCurrentUserModelConfig(auth.user.user_id, agentKey);
      return sendJson(res, 200, { config: current.publicConfig });
    }
    if (req.method === "PUT") {
      const body = await readBody(req);
      const normalized = normalizeOpenAiCompatibleModelConfig({
        protocol: body.protocol || "openai_compatible",
        apiBase: body.api_base || body.apiBase,
        modelName: body.model_name || body.modelName
      });
      const current = await readCurrentUserModelConfig(auth.user.user_id, agentKey);
      const apiKey = String(body.api_key ?? body.apiKey ?? "").trim();
      const configurationChanged = !current.config ||
        current.config.protocol !== normalized.protocol ||
        current.config.modelName !== normalized.modelName ||
        current.config.apiBase !== normalized.apiBase ||
        Boolean(apiKey);
      const credentialConfigured = Boolean(apiKey) || current.credentialConfigured;
      const testStatus = configurationChanged
        ? (credentialConfigured ? "not_tested" : "not_configured")
        : current.publicConfig.testStatus;
      const enabledRequested = body.enabled === true;
      const enabled = configurationChanged ? false : enabledRequested;
      if (enabled && testStatus !== "passed") throw requestError("model_config_test_required", 409);
      if (apiKey) setWorkbenchLlmCredential({ userId: auth.user.user_id, agentKey, apiKey });
      const config = await repo.upsertWorkbenchAgentModelConfig({
        userId: auth.user.user_id,
        agentKey,
        protocol: normalized.protocol,
        modelName: normalized.modelName,
        apiBase: normalized.apiBase,
        credentialRef: credentialRefFor(auth.user.user_id, agentKey),
        enabled,
        testStatus
      });
      const nextCredentialConfigured = hasWorkbenchLlmCredential({ userId: auth.user.user_id, agentKey });
      await audit({
        actorUserId: auth.user.user_id,
        subjectUserId: auth.user.user_id,
        eventType: "agent_model_config_update",
        eventStatus: "passed",
        summary: { agentKey, testStatus, enabled: config.enabled === true }
      });
      return sendJson(res, 200, { config: publicModelConfig(config, { credentialConfigured: nextCredentialConfigured }) });
    }
  }
  const agentModelConfigTestMatch = pathname.match(/^\/api\/agents\/([^/]+)\/model-config\/test$/);
  if (req.method === "POST" && agentModelConfigTestMatch) {
    const agentKey = requireRegisteredAgent(decodeURIComponent(agentModelConfigTestMatch[1]));
    if (!getPublicAgent(agentKey).modelConfigurable) throw requestError("agent_model_not_available", 404);
    const current = await readCurrentUserModelConfig(auth.user.user_id, agentKey);
    if (!current.config || !current.credentialConfigured) throw requestError("model_config_not_ready_for_test", 409);
    const test = await testOpenAiCompatibleModelConfig({
      apiBase: current.config.apiBase,
      modelName: current.config.modelName,
      apiKey: getWorkbenchLlmCredential({ userId: auth.user.user_id, agentKey })
    });
    const config = await repo.recordWorkbenchAgentModelConfigTest({
      userId: auth.user.user_id,
      agentKey,
      passed: test.status === "passed"
    });
    await audit({
      actorUserId: auth.user.user_id,
      subjectUserId: auth.user.user_id,
      eventType: "agent_model_config_test",
      eventStatus: test.status === "passed" ? "passed" : "failed",
      summary: { agentKey, result: test.status }
    });
    if (test.status !== "passed") throw requestError("model_connection_test_failed", 422);
    return sendJson(res, 200, { config: publicModelConfig(config, { credentialConfigured: true }) });
  }

  if (req.method === "GET" && pathname === "/api/admin/users") {
    requireAdmin(auth);
    return sendJson(res, 200, { users: await repo.listWorkbenchUsers() });
  }
  const adminStatusMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/status$/);
  if (req.method === "POST" && adminStatusMatch) {
    requireAdmin(auth);
    const userId = decodeURIComponent(adminStatusMatch[1]);
    const body = await readBody(req);
    if (userId === auth.user.user_id && body.status === "disabled") throw requestError("admin_cannot_disable_self", 409);
    const user = await repo.updateWorkbenchUserStatus({ userId, userStatus: body.status });
    if (!user) throw requestError("user_not_found", 404);
    await audit({ actorUserId: auth.user.user_id, subjectUserId: userId, eventType: "user_status_change", eventStatus: "passed", summary: { status: body.status } });
    return sendJson(res, 200, { user: publicUser(user) });
  }
  const adminResetMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/reset-password$/);
  if (req.method === "POST" && adminResetMatch) {
    requireAdmin(auth);
    const userId = decodeURIComponent(adminResetMatch[1]);
    const target = await repo.getWorkbenchUserById(userId);
    if (!target) throw requestError("user_not_found", 404);
    await repo.updateWorkbenchUserPassword({
      userId,
      passwordHash: await hashPassword("12345678"),
      mustChangePassword: true
    });
    await repo.revokeWorkbenchUserSessions(userId);
    await audit({ actorUserId: auth.user.user_id, subjectUserId: userId, eventType: "password_reset", eventStatus: "passed" });
    return sendJson(res, 200, { status: "password_reset", mustChangePassword: true });
  }
  if (req.method === "GET" && pathname === "/api/reports/workflow-detail") {
    const scope = workflowReportScope({
      requestedScope: url.searchParams.get("scope") || "",
      userRole: auth.user.user_role
    });
    return sendJson(res, 200, {
      cases: await repo.getUserWorkflowCaseDetail({
        userId: auth.user.user_id,
        admin: scope === "all"
      }),
      scope
    });
  }
  if (req.method === "GET" && pathname === "/api/reports/workflow-summary") {
    const scope = workflowReportScope({
      requestedScope: url.searchParams.get("scope") || "",
      userRole: auth.user.user_role
    });
    return sendJson(res, 200, {
      users: await repo.getUserWorkflowSummary({
        userId: auth.user.user_id,
        admin: scope === "all"
      }),
      scope
    });
  }

  if (req.method === "GET" && pathname === "/api/launch/workbench") {
    const activeCases = await repo.listWorkflowCaseSummaries({
      sourceUsage: "runtime_truth",
      lifecycleStatus: "active",
      ownerUserId: auth.user.user_id
    });
    return sendJson(res, 200, { ...buildWorkbenchView({ activeCases }), user: publicUser(auth.user) });
  }

  if (req.method === "GET" && pathname === "/api/launch/project-recommendations") {
    const advertiserId = String(url.searchParams.get("advertiser_id") || "").trim();
    await requireAdvertiserOwner(auth.user, advertiserId);
    const result = await repo.listVerifiedProjectVideoAppendCandidates({ advertiserId, userId: auth.user.user_id });
    return sendJson(res, 200, result);
  }

  if (req.method === "POST" && pathname === "/api/launch/intake") {
    const body = await readBody(req);
    const resolver = await resolverForCurrentUser(auth.user.user_id);
    const intake = await resolveLaunchRequestIntake({
      userIntent: body.user_intent || body.userIntent || "",
      request: body.request,
      draft: body.draft,
      resolver
    });
    return sendJson(res, 200, await hydrateAppendIntake(auth.user, intake));
  }

  if (req.method === "POST" && pathname === "/api/launch/jobs") {
    const body = await readBody(req);
    const normalizedRequest = normalizeLaunchRequestFromBody(body);
    await requireCaseOwner(auth.user, body.case_id || body.caseId || "");
    await requireAdvertiserOwner(auth.user, normalizedRequest.request.advertiser_id);
    await requireVerifiedAppendProject(auth.user, normalizedRequest.request);
    return sendJson(res, 201, await createJob(repo, body));
  }

  if (req.method === "GET" && pathname === "/api/workflow-cases") {
    const activeOnly = url.searchParams.get("active") === "1";
    return sendJson(res, 200, {
      cases: await repo.listWorkflowCaseSummaries(activeOnly
        ? { sourceUsage: "runtime_truth", lifecycleStatus: "active", ownerUserId: auth.user.user_id }
        : { sourceUsage: "runtime_truth", ownerUserId: auth.user.user_id })
    });
  }

  if (req.method === "POST" && pathname === "/api/workflow-cases") {
    const body = await readBody(req);
    const normalizedRequest = normalizeLaunchRequestFromBody(body, { allowNatural: false });
    await requireVerifiedAppendProject(auth.user, normalizedRequest.request);
    let workflowCase;
    try {
      workflowCase = await createWorkflowCase(repo, body, {
        currentUser: auth.user,
        replacementCredentialStateFn: () => createOceanEngineReadonlyClient().credentialState()
      });
    } catch (error) {
      if (["advertiser_owner_mismatch", "advertiser_owner_binding_conflict"].includes(error.message)) {
        await audit({
          actorUserId: auth.user.user_id,
          advertiserId: body.advertiser_id || body.advertiserId || "",
          eventType: "advertiser_owner_conflict",
          eventStatus: "blocked",
          summary: { ownerDisplayNamePresent: Boolean(error.details?.ownerDisplayName) }
        });
      }
      throw error;
    }
    return sendJson(res, workflowCase.reusedActiveCase === true ? 200 : 201, workflowCase);
  }

  const workflowCaseMatch = pathname.match(/^\/api\/workflow-cases\/([^/]+)$/);
  if (req.method === "GET" && workflowCaseMatch) {
    const caseId = decodeURIComponent(workflowCaseMatch[1]);
    await requireCaseOwner(auth.user, caseId);
    const [workflowCase, summary, jobs] = await Promise.all([
      repo.getWorkflowCase(caseId),
      repo.getWorkflowCaseSummary(caseId),
      repo.listWorkflowCaseJobs(caseId)
    ]);
    if (!workflowCase || !summary) return sendJson(res, 404, { error: "workflow_case_not_found" });
    return sendJson(res, 200, { case: workflowCase, summary, jobs });
  }

  const jobMatch = pathname.match(/^\/api\/launch\/jobs\/([^/]+)(?:\/([^/]+))?$/);
  if (!jobMatch) return sendJson(res, 404, { error: "not_found" });

  const jobId = decodeURIComponent(jobMatch[1]);
  const action = jobMatch[2] || "";
  await requireJobOwner(auth.user, jobId);
  if (req.method === "GET" && !action) {
    const view = await getJobView(repo, jobId, {
      currentCaseReadiness: url.searchParams.get("view") !== "history"
    });
    if (!view) return sendJson(res, 404, { error: "job_not_found" });
    return sendJson(res, 200, view);
  }
  if (req.method === "POST" && action === "run") {
    const body = await readBody(req);
    const bundle = await repo.getLaunchJobBundle(jobId);
    if (!bundle?.job) return sendJson(res, 404, { error: "job_not_found" });
    const mode = body.mode || "dry_run";
    const runtimeReadonlyModes = new Set(["dry_run", "draft_readiness", "readback_only", "aweme_auth_readonly"]);
    if (bundle.job.source_usage === "runtime_truth" && !runtimeReadonlyModes.has(mode)) {
      return sendJson(res, 403, { error: "runtime_truth_run_mode_readonly_only" });
    }
    const view = bundle.job.source_usage === "runtime_truth" && mode === "dry_run"
      ? await runWorkbenchInitialReadonly(repo, jobId, {
        mode,
        qiankunOwnerKey: auth.user.qiankun_owner_key
      })
      : await runJob(repo, jobId, {
        mode,
        qiankunOwnerKey: auth.user.qiankun_owner_key
      });
    return sendJson(res, 200, view);
  }
  if (req.method === "POST" && action === "command") {
    const body = await readBody(req);
    return sendJson(res, 200, await handleWorkbenchCommand({
      repo,
      jobId,
      message: body.message || body.user_intent || body.userIntent || "",
      expectedPlanId: body.expected_plan_id || body.expectedPlanId || "",
      expectedPlanHash: body.expected_plan_hash || body.expectedPlanHash || "",
      currentUser: auth.user,
      resolver: await resolverForCurrentUser(auth.user.user_id)
    }));
  }
  if (req.method === "POST" && action === "execute-once") {
    const bundle = await repo.getLaunchJobBundle(jobId);
    if (!bundle?.job) return sendJson(res, 404, { error: "job_not_found" });
    if (bundle.job.source_usage === "runtime_truth") {
      return sendJson(res, 410, { error: "runtime_truth_legacy_execution_route_disabled" });
    }
    const body = await readBody(req);
    return sendJson(res, 200, await executeConfirmedLaunch({
      repo,
      jobId,
      grantSource: "workbench_click",
      executionIntent: body.execution_intent || body.executionIntent || "",
      confirmedByUserId: auth.user.user_id,
      expectedPlanId: body.expected_plan_id || body.expectedPlanId || "",
      expectedPlanHash: body.expected_plan_hash || body.expectedPlanHash || ""
    }));
  }
  if (req.method === "POST" && action === "confirm-create") {
    const bundle = await repo.getLaunchJobBundle(jobId);
    if (!bundle?.job) return sendJson(res, 404, { error: "job_not_found" });
    if (bundle.job.source_usage === "runtime_truth") {
      return sendJson(res, 410, { error: "runtime_truth_legacy_execution_route_disabled" });
    }
    const body = await readBody(req);
    return sendJson(res, 200, await executeConfirmedLaunch({
      repo,
      jobId,
      grantSource: "workbench_click",
      executionIntent: body.execution_intent || body.executionIntent || "",
      confirmedByUserId: auth.user.user_id,
      expectedPlanId: body.expected_plan_id || body.expectedPlanId || "",
      expectedPlanHash: body.expected_plan_hash || body.expectedPlanHash || ""
    }));
  }
  return sendJson(res, 404, { error: "not_found" });
}

const server = createServer(async (req, res) => {
  let pathname = "";
  try {
    const requestUrl = req.url || "/";
    const host = String(req.headers.host || "").toLowerCase();
    if (host && !acceptedHosts.has(host)) throw requestError("workbench_host_not_allowed", 421);
    const url = new URL(requestUrl, publicOrigin);
    pathname = url.pathname;
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }
    if (url.pathname === "/" && (url.searchParams.has("case_id") || url.searchParams.has("job_id"))) {
      res.writeHead(302, {
        location: `/agents/launch-creation${url.search}`,
        "cache-control": "no-store",
        ...securityHeaders
      });
      res.end();
      return;
    }
    await serveStatic(req, res, url.pathname);
  } catch (error) {
    sendError(res, error, {
      method: req.method,
      pathname,
      stage: String(req.headers["x-workbench-diagnostic-stage"] || "")
    });
  }
});

return { server, networkPolicy };
}

export { resolveWorkflowStatisticsScope as workflowReportScope };
