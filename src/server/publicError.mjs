import { createHash } from "node:crypto";

function fingerprint(error = {}) {
  return `sha256:${createHash("sha256").update(String(error?.message || "internal_error")).digest("hex")}`;
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
