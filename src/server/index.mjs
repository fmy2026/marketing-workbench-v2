import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { PostgresRepository } from "../repositories/postgresRepository.mjs";
import { parseLaunchIntake } from "../agents/launchAgent.mjs";
import { buildLaunchJobView, confirmJob, createJob, diagnoseJob, readbackJob, runJob } from "../workflows/launchWorkflow.mjs";

const rootDir = normalize(join(dirname(fileURLToPath(import.meta.url)), "../.."));
const frontendDir = join(rootDir, "frontend");
const port = Number(process.env.PORT || process.env.MWBV2_PORT || 3000);
const repo = new PostgresRepository();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
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

async function handleApi(req, res, pathname) {
  if (req.method === "GET" && pathname === "/api/launch/jobs/latest") {
    const jobId = await repo.latestJobId();
    const bundle = await repo.getLaunchJobBundle(jobId);
    if (!bundle) return sendJson(res, 404, { error: "job_not_found" });
    return sendJson(res, 200, buildLaunchJobView(bundle));
  }

  if (req.method === "POST" && pathname === "/api/launch/intake") {
    const body = await readBody(req);
    return sendJson(res, 200, parseLaunchIntake(body.user_intent || body.userIntent || ""));
  }

  if (req.method === "POST" && pathname === "/api/launch/jobs") {
    const body = await readBody(req);
    return sendJson(res, 201, await createJob(repo, body));
  }

  const jobMatch = pathname.match(/^\/api\/launch\/jobs\/([^/]+)(?:\/([^/]+))?$/);
  if (!jobMatch) return sendJson(res, 404, { error: "not_found" });

  const jobId = decodeURIComponent(jobMatch[1]);
  const action = jobMatch[2] || "";
  if (req.method === "GET" && !action) {
    const bundle = await repo.getLaunchJobBundle(jobId);
    if (!bundle) return sendJson(res, 404, { error: "job_not_found" });
    return sendJson(res, 200, buildLaunchJobView(bundle));
  }
  if (req.method === "POST" && action === "diagnose") return sendJson(res, 200, await diagnoseJob(repo, jobId));
  if (req.method === "POST" && action === "run") return sendJson(res, 200, await runJob(repo, jobId));
  if (req.method === "POST" && action === "confirm") return sendJson(res, 200, await confirmJob(repo, jobId));
  if (req.method === "POST" && action === "readback") return sendJson(res, 200, await readbackJob(repo, jobId));
  return sendJson(res, 404, { error: "not_found" });
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url.pathname);
      return;
    }
    await serveStatic(req, res, url.pathname);
  } catch (error) {
    sendError(res, error);
  }
});

server.listen(port, () => {
  console.log(`marketing-workbench-v2 listening on http://127.0.0.1:${port}`);
});
