import { createHash } from "node:crypto";

function fingerprint(error = {}) {
  return `sha256:${createHash("sha256").update(String(error?.message || "internal_error")).digest("hex")}`;
}

const diagnosticStages = new Set([
  "start_workflow_create_case",
  "start_workflow_create_job",
  "start_workflow_run_readonly"
]);

function safeErrorCode(error = {}) {
  const value = String(error?.code || "").trim();
  return /^[A-Za-z0-9_-]{1,64}$/.test(value) ? value : "";
}

function safeStackFrames(error = {}) {
  return String(error?.stack || "")
    .split("\n")
    .slice(1)
    .filter((line) => /^\s*at\s/.test(line))
    .slice(0, 4)
    .map((line) => line.replace(/\?.*$/, "").slice(0, 500));
}

export function internalErrorDiagnostic({ error = {}, method = "", pathname = "", stage = "" } = {}) {
  const normalizedStage = diagnosticStages.has(stage) ? stage : "";
  return {
    event: "workbench_internal_request_error",
    method: String(method || "").toUpperCase().slice(0, 16),
    pathname: String(pathname || "").split("?")[0].slice(0, 512),
    stage: normalizedStage,
    diagnostic_fingerprint: fingerprint(error),
    error_code: safeErrorCode(error),
    stack_frames: safeStackFrames(error)
  };
}

export function publicErrorResponse(error = {}) {
  const statusCode = Number(error?.statusCode || 500);
  if (Number.isInteger(statusCode) && statusCode >= 400 && statusCode < 500) {
    return {
      statusCode,
      body: {
        error: String(error?.message || "request_rejected"),
        details: error?.details || null
      }
    };
  }
  return {
    statusCode: Number.isInteger(statusCode) && statusCode >= 500 ? statusCode : 500,
    body: {
      error: "internal_error",
      details: { diagnostic_fingerprint: fingerprint(error) }
    }
  };
}
