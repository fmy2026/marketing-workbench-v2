export const MONITOR_MAX_ATTEMPTS = 2;
export const MONITOR_RETRY_INTERVAL_SECONDS = 5;

export const MONITOR_REISSUE_REASONS = new Set([
  "technical_fix",
  "parameter_corrected",
  "credential_recovered",
  "service_recovered",
  "manual_recheck_confirmed"
]);

export const MONITOR_RETRYABLE_ERROR_CATEGORIES = new Set([
  "server_busy",
  "temporary_network_failure"
]);

export const MONITOR_NON_RETRYABLE_ERROR_CATEGORIES = new Set([
  "parameter_invalid",
  "callback_contract_invalid",
  "credential_invalid",
  "relation_unresolved"
]);

function clean(value) {
  return String(value ?? "").trim();
}

export function buildMonitorCycleId(provisionId, cycleNo = 1) {
  return `${clean(provisionId)}-CYCLE-${String(Number(cycleNo || 1)).padStart(2, "0")}`;
}

export function monitorAttemptId(cycleId, attemptNo) {
  return `${clean(cycleId)}-ATTEMPT-${String(Number(attemptNo || 0)).padStart(2, "0")}`;
}

export function isServerBusy(value = {}) {
  const apiCode = clean(value.apiCode || value.api_code);
  const summary = clean(value.errorSummary || value.error_summary || value.apiMessage || value.api_message);
  return apiCode === "500" && summary.includes("服务器繁忙");
}

export function secondsSince(value) {
  const timestamp = Date.parse(value || "");
  if (!Number.isFinite(timestamp)) return Number.POSITIVE_INFINITY;
  return Math.floor((Date.now() - timestamp) / 1000);
}

export function classifyMonitorCreateError(result = {}) {
  if (isServerBusy({ apiCode: result.apiCode, apiMessage: result.apiMessage })) return "server_busy";
  if (result?.name === "AbortError") return "temporary_network_failure";
  if (result.status === "passed") return "";
  const apiCode = clean(result.apiCode);
  if (apiCode === "401" || apiCode === "403") return "credential_invalid";
  if (apiCode === "400" || apiCode === "422") return "parameter_invalid";
  return apiCode ? "api_failure" : "temporary_network_failure";
}

function latestAttemptTerminalError(latestAttempt = null) {
  return clean(latestAttempt?.error_category || latestAttempt?.errorCategory);
}

export function monitorCycleStatusFromRun(run = {}, attempts = []) {
  if (clean(run.monitor_id)) return "resolved";
  const count = attempts.length || Number(run.create_attempt_no || 0);
  const latestAttempt = attempts[attempts.length - 1] || {};
  const latestError = latestAttemptTerminalError(latestAttempt);
  if (count >= MONITOR_MAX_ATTEMPTS) return "stopped";
  if (MONITOR_NON_RETRYABLE_ERROR_CATEGORIES.has(latestError)) return "stopped";
  if (clean(run.cycle_status)) return clean(run.cycle_status);
  if (run.status === "terminal_failed") return "stopped";
  if (run.status === "resolved") return "resolved";
  return "active";
}

export function monitorAttemptPolicy({
  attemptCount = 0,
  firstAttempt = null,
  latestAttempt = null,
  latestRun = null,
  retryElapsedSeconds = Number.POSITIVE_INFINITY
} = {}) {
  const count = Number(attemptCount || 0);
  const latestError = latestAttemptTerminalError(latestAttempt);
  const firstError = latestAttemptTerminalError(firstAttempt);
  const blockers = [];
  let action = "";
  let nextAttemptNo = 0;
  let triggerReason = "";
  let confirmationKind = "";

  if (clean(latestRun?.monitor_id)) blockers.push("monitor_id_already_resolved_no_create_needed");
  if (clean(latestRun?.cycle_status) && clean(latestRun.cycle_status) !== "active") blockers.push(`cycle_not_active:${latestRun.cycle_status}`);
  if (MONITOR_NON_RETRYABLE_ERROR_CATEGORIES.has(latestError)) blockers.push(`cycle_stopped_by_non_retryable_error:${latestError}`);
  if (count >= MONITOR_MAX_ATTEMPTS) blockers.push("monitor_create_attempt_limit_reached");

  if (!blockers.length && count === 0) {
    action = "first_create";
    nextAttemptNo = 1;
    triggerReason = "initial_create_once";
    confirmationKind = "first_create";
  } else if (!blockers.length && count === 1) {
    if (!firstAttempt) {
      blockers.push("first_attempt_record_missing");
    } else if (!MONITOR_RETRYABLE_ERROR_CATEGORIES.has(firstError)) {
      blockers.push(`first_attempt_not_retryable:${firstError || "missing"}`);
    } else if (retryElapsedSeconds < MONITOR_RETRY_INTERVAL_SECONDS) {
      blockers.push("retry_interval_not_elapsed");
    } else {
      action = firstError === "server_busy" ? "server_busy_retry" : "temporary_network_retry";
      nextAttemptNo = 2;
      triggerReason = action;
      confirmationKind = action;
    }
  } else if (!blockers.length) {
    blockers.push("monitor_create_attempt_state_invalid");
  }

  return {
    action,
    nextAttemptNo,
    triggerReason,
    confirmationKind,
    attemptCount: count,
    latestAttemptNo: Number(latestAttempt?.attempt_no || 0),
    latestErrorCategory: latestError,
    firstAttemptRetryable: firstAttempt ? MONITOR_RETRYABLE_ERROR_CATEGORIES.has(firstError) : false,
    firstAttemptServerBusy: firstAttempt ? isServerBusy(firstAttempt) || firstError === "server_busy" : false,
    retryElapsedSeconds: Number.isFinite(retryElapsedSeconds) ? retryElapsedSeconds : null,
    blockers,
    createEligible: blockers.length === 0 && nextAttemptNo > 0,
    retryAllowed: nextAttemptNo === 2,
    maximumTotalAttempts: MONITOR_MAX_ATTEMPTS
  };
}

export function monitorReissuePolicy({ latestCycle = null, reissueReason = "" } = {}) {
  const reason = clean(reissueReason);
  const blockers = [];
  if (!latestCycle?.cycle_id) blockers.push("previous_cycle_missing");
  if (!reason) blockers.push("reissue_reason_required");
  if (reason && !MONITOR_REISSUE_REASONS.has(reason)) blockers.push(`reissue_reason_invalid:${reason}`);
  const latestStatus = clean(latestCycle?.cycle_status);
  if (latestCycle?.cycle_id && !["stopped", "failed"].includes(latestStatus)) {
    blockers.push(`previous_cycle_not_stopped:${latestStatus || "unknown"}`);
  }
  const previousCycleNo = Number(latestCycle?.cycle_no || 0);
  const nextCycleNo = previousCycleNo + 1;
  return {
    status: blockers.length ? "blocked" : "passed",
    blockers,
    previousCycleId: clean(latestCycle?.cycle_id),
    previousCycleNo,
    nextCycleNo,
    nextCycleId: latestCycle?.provision_id ? buildMonitorCycleId(latestCycle.provision_id, nextCycleNo) : "",
    reissueReason: reason
  };
}
