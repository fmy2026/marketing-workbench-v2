export const WORKBENCH_HOST = "127.0.0.1";
export const WORKBENCH_PORT = 3000;
export const WORKBENCH_ORIGIN = `http://${WORKBENCH_HOST}:${WORKBENCH_PORT}`;

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;

function requiredIdentifier(name, value) {
  const normalized = String(value ?? "").trim();
  if (!IDENTIFIER_PATTERN.test(normalized)) throw new Error(`invalid_${name}`);
  return normalized;
}

export function workbenchHomeUrl() {
  return `${WORKBENCH_ORIGIN}/`;
}

export function workbenchCaseUrl(caseId) {
  const url = new URL(workbenchHomeUrl());
  url.searchParams.set("case_id", requiredIdentifier("case_id", caseId));
  return url.toString();
}

export function workbenchJobUrl(jobId) {
  const url = new URL(workbenchHomeUrl());
  url.searchParams.set("job_id", requiredIdentifier("job_id", jobId));
  return url.toString();
}

export function parseWorkbenchProgressTarget(search = "") {
  const params = new URLSearchParams(search);
  const caseId = String(params.get("case_id") || "").trim();
  const jobId = String(params.get("job_id") || "").trim();
  if (caseId && jobId) return { status: "invalid", error: "case_and_job_target_conflict" };
  try {
    if (caseId) return { status: "case", caseId: requiredIdentifier("case_id", caseId) };
    if (jobId) return { status: "job", jobId: requiredIdentifier("job_id", jobId) };
  } catch (error) {
    return { status: "invalid", error: error.message || "invalid_workbench_target" };
  }
  return { status: "home" };
}
