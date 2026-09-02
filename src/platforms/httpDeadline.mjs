export const PLATFORM_JSON_TIMEOUT_MS = 15_000;
export const PLATFORM_UPLOAD_TIMEOUT_MS = 60_000;
export const STD_PROJECT_READBACK_DEADLINE_MS = 25_000;

function positiveTimeout(value, fallback) {
  const timeoutMs = Number(value);
  return Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : fallback;
}

export function platformDeadlineError({ timeoutMs } = {}) {
  const error = new Error("platform_http_deadline_exceeded");
  error.name = "PlatformDeadlineError";
  error.code = "ETIMEDOUT";
  error.timeoutMs = timeoutMs;
  error.platformDeadlineExceeded = true;
  return error;
}

export function isPlatformDeadlineError(error) {
  return error?.platformDeadlineExceeded === true ||
    (error?.name === "PlatformDeadlineError" && error?.code === "ETIMEDOUT");
}

function mergedAbortSignal(parentSignal, timeoutSignal) {
  if (!parentSignal) return timeoutSignal;
  if (typeof AbortSignal?.any === "function") return AbortSignal.any([parentSignal, timeoutSignal]);
  const controller = new AbortController();
  const abort = (event) => controller.abort(event?.target?.reason);
  parentSignal.addEventListener("abort", abort, { once: true });
  timeoutSignal.addEventListener("abort", abort, { once: true });
  return controller.signal;
}

/**
 * Bounded platform fetch with caller-signal propagation. A race is required in
 * addition to AbortController because test and third-party fetch adapters may
 * not observe AbortSignal. This helper never retries.
 */
export async function fetchWithDeadline(fetchImpl, input, options = {}, { timeoutMs = PLATFORM_JSON_TIMEOUT_MS } = {}) {
  if (typeof fetchImpl !== "function") throw new Error("fetch_impl_required");
  const boundedTimeoutMs = positiveTimeout(timeoutMs, PLATFORM_JSON_TIMEOUT_MS);
  const controller = new AbortController();
  const signal = mergedAbortSignal(options.signal, controller.signal);
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = platformDeadlineError({ timeoutMs: boundedTimeoutMs });
      controller.abort(error);
      reject(error);
    }, boundedTimeoutMs);
  });
  try {
    return await Promise.race([
      Promise.resolve(fetchImpl(input, { ...options, signal })),
      timeout
    ]);
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}
