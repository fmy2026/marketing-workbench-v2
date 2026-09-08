import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { PostgresRepository } from "../repositories/postgresRepository.mjs";
import { parseLaunchIntake } from "../agents/launchAgent.mjs";
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

const rootDir = normalize(join(dirname(fileURLToPath(import.meta.url)), "../.."));
const frontendDir = join(rootDir, "frontend");
const repo = new PostgresRepository();
const networkPolicy = resolveWorkbenchNetworkPolicy(process.env);
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

function sendError(res, error) {
  sendJson(res, error.statusCode || 500, {
    error: error.message || "internal_error",
    details: error.details || null
  });
}

function requestError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
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
  return JSON.parse(raw);
}

async function serveStatic(req, res, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const safePath = normalize(join(frontendDir, requested));
  if (!safePath.startsWith(frontendDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const data = await readFile(safePath);
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
    return sendJson(res, 200, {
      cases: await repo.getUserWorkflowCaseDetail({
        userId: auth.user.user_id,
        admin: auth.user.user_role === "admin"
      })
    });
  }
  if (req.method === "GET" && pathname === "/api/reports/workflow-summary") {
    return sendJson(res, 200, {
      users: await repo.getUserWorkflowSummary({
        userId: auth.user.user_id,
        admin: auth.user.user_role === "admin"
      })
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

  if (req.method === "POST" && pathname === "/api/launch/intake") {
    const body = await readBody(req);
    return sendJson(res, 200, parseLaunchIntake(body.user_intent || body.userIntent || ""));
  }

  if (req.method === "POST" && pathname === "/api/launch/jobs") {
    const body = await readBody(req);
    await requireCaseOwner(auth.user, body.case_id || body.caseId || "");
    await requireAdvertiserOwner(auth.user, body.advertiser_id || body.advertiserId || "");
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
      currentUser: auth.user
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
  try {
    const requestUrl = req.url || "/";
    const host = String(req.headers.host || "").toLowerCase();
    if (host && !acceptedHosts.has(host)) throw requestError("workbench_host_not_allowed", 421);
    const url = new URL(requestUrl, publicOrigin);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }
    await serveStatic(req, res, url.pathname);
  } catch (error) {
    sendError(res, error);
  }
});

server.listen(bindPort, bindHost, () => {
  console.log(`marketing-workbench-v2 listening on ${networkPolicy.bindOrigin}/ for ${publicOrigin}/`);
});
