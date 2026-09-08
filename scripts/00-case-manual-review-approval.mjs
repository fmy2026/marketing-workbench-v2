import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";

const REQUIRED_CONFIRMATION = "APPROVE_CASE_MANUAL_REVIEW";

function valueFor(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? String(process.argv[index + 1] || "").trim() : "";
}

function required(flag) {
  const value = valueFor(flag);
  if (!value) throw new Error(`missing_${flag.slice(2).replaceAll("-", "_")}`);
  return value;
}

if (process.env.MWBV2_MANUAL_REVIEW_APPROVAL !== REQUIRED_CONFIRMATION) {
  throw new Error("manual_review_approval_confirmation_required");
}

const repo = new PostgresRepository();
const result = await repo.approveExhaustedCaseManualReview({
  caseId: required("--case-id"),
  jobId: required("--job-id"),
  fixVersion: required("--fix-version"),
  diagnosisCategory: required("--diagnosis-category"),
  reviewerRef: required("--reviewer-ref")
});

if (result?.approved !== true) {
  throw new Error(result?.blockedReason || "manual_review_approval_not_recorded");
}

process.stdout.write(`${JSON.stringify({
  status: "approved",
  caseId: result.caseId,
  jobId: result.jobId,
  evidenceArtifactId: result.evidenceArtifactId,
  rawPlatformResponseStored: false,
  platformWrites: 0
}, null, 2)}\n`);
