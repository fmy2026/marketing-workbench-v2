function clean(value) {
  return String(value || "").trim();
}

function freezeSubmission({ jobId = "", planId = "", planHash = "", message = "", readbackMode = "", readbackAttemptIndex = null } = {}) {
  return Object.freeze({
    jobId: clean(jobId),
    planId: clean(planId),
    planHash: clean(planHash),
    message: clean(message),
    readbackMode: clean(readbackMode),
    readbackAttemptIndex: Number.isInteger(Number(readbackAttemptIndex)) ? Number(readbackAttemptIndex) : null
  });
}

export function freezeConfirmationSubmission({ job = null, preview = null } = {}) {
  const submission = freezeSubmission({
    jobId: job?.jobId,
    planId: preview?.planId || job?.materialPushReadback?.planId,
    planHash: preview?.planHash || job?.materialPushReadback?.planHash,
    message: preview?.confirmationPhrase || "确认创建"
  });
  return submission.jobId && submission.planId && submission.planHash && submission.message
    ? submission
    : null;
}

export function resolveJobCommandSubmission({ job = null, preview = null, message = "", submission = null } = {}) {
  if (submission) {
    return freezeSubmission(submission);
  }
  return freezeSubmission({
    jobId: job?.jobId,
    planId: preview?.planId,
    planHash: preview?.planHash,
    message
  });
}
