import { createServer } from "node:http";
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
import { handleWorkbenchCommand } from "../workflows/workbenchConversation.mjs";
import {
  WORKBENCH_HOST,
  WORKBENCH_ORIGIN,
  WORKBENCH_PORT
} from "../../frontend/workbench-address.mjs";

const rootDir = normalize(join(dirname(fileURLToPath(import.meta.url)), "../.."));
const frontendDir = join(rootDir, "frontend");
const repo = new PostgresRepository();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function sendJson(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload)
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

function requireLocalJsonMutation(req) {
  const contentType = String(req.headers["content-type"] || "").toLowerCase();
  if (!contentType.startsWith("application/json")) throw requestError("json_content_type_required", 415);
  const origin = String(req.headers.origin || "").replace(/\/$/, "");
  if (origin !== WORKBENCH_ORIGIN) throw requestError("same_origin_workbench_request_required", 403);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
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
    res.writeHead(200, { "content-type": mimeTypes[extname(safePath)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not Found");
  }
}

async function handleApi(req, res, url) {
  const pathname = url.pathname;
  if (req.method === "POST") requireLocalJsonMutation(req);
  if (req.method === "GET" && pathname === "/api/launch/workbench") {
    const activeCases = await repo.listWorkflowCaseSummaries({
      sourceUsage: "runtime_truth",
      lifecycleStatus: "active"
    });
    return sendJson(res, 200, buildWorkbenchView({ activeCases }));
  }

  if (req.method === "POST" && pathname === "/api/launch/intake") {
    const body = await readBody(req);
    return sendJson(res, 200, parseLaunchIntake(body.user_intent || body.userIntent || ""));
  }

  if (req.method === "POST" && pathname === "/api/launch/jobs") {
    const body = await readBody(req);
    return sendJson(res, 201, await createJob(repo, body));
  }

  if (req.method === "GET" && pathname === "/api/workflow-cases") {
    const activeOnly = url.searchParams.get("active") === "1";
    return sendJson(res, 200, {
      cases: await repo.listWorkflowCaseSummaries(activeOnly
        ? { sourceUsage: "runtime_truth", lifecycleStatus: "active" }
        : {})
    });
  }

  if (req.method === "POST" && pathname === "/api/workflow-cases") {
    const body = await readBody(req);
    const workflowCase = await createWorkflowCase(repo, body);
    return sendJson(res, workflowCase.reusedActiveCase === true ? 200 : 201, workflowCase);
  }

  const workflowCaseMatch = pathname.match(/^\/api\/workflow-cases\/([^/]+)$/);
  if (req.method === "GET" && workflowCaseMatch) {
    const caseId = decodeURIComponent(workflowCaseMatch[1]);
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
      ? await runWorkbenchInitialReadonly(repo, jobId, { mode })
      : await runJob(repo, jobId, { mode });
    return sendJson(res, 200, view);
  }
  if (req.method === "POST" && action === "command") {
    const body = await readBody(req);
    return sendJson(res, 200, await handleWorkbenchCommand({
      repo,
      jobId,
      message: body.message || body.user_intent || body.userIntent || "",
      expectedPlanId: body.expected_plan_id || body.expectedPlanId || "",
      expectedPlanHash: body.expected_plan_hash || body.expectedPlanHash || ""
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
    if (host && host !== `${WORKBENCH_HOST}:${WORKBENCH_PORT}`) {
      res.writeHead(308, { location: new URL(requestUrl, WORKBENCH_ORIGIN).toString() });
      res.end();
      return;
    }
    const url = new URL(requestUrl, WORKBENCH_ORIGIN);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }
    await serveStatic(req, res, url.pathname);
  } catch (error) {
    sendError(res, error);
  }
});

server.listen(WORKBENCH_PORT, WORKBENCH_HOST, () => {
  console.log(`marketing-workbench-v2 listening on ${WORKBENCH_ORIGIN}/`);
});
