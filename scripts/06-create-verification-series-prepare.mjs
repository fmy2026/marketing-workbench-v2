import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import { createJob, runJob } from "../src/workflows/launchWorkflow.mjs";
import { compileAndSaveExecutionPlan } from "../src/workflows/executionPlan.mjs";
import { assertNoSensitiveLeak, sanitizeForPublic } from "../src/workflows/skills/oe3/00-contracts.mjs";

function arg(name, fallback = "") {
  const inline = process.argv.find((item) => item.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.findIndex((item) => item === `--${name}`);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

function required(name) {
  const value = arg(name).trim();
  if (!value) throw new Error(`missing_required_argument:${name}`);
  return value;
}

function createReadiness(bundle = {}) {
  return (bundle.nodes || []).find((node) => node.node_key === "std_project_draft_builder")?.output_summary?.createReadiness || {};
}

function nodeStatuses(bundle = {}) {
  return Object.fromEntries((bundle.nodes || []).map((node) => [node.node_key, node.status]));
}

const repo = new PostgresRepository();
const caseId = required("case-id");
const routeId = required("route-id");
const gameCode = required("game-code").toUpperCase();
const advertiserId = required("advertiser-id");
const verificationSeriesId = required("verification-series-id");
const verificationTaskRef = required("verification-task-ref");
const createAttemptNo = Number(required("create-attempt-no"));
const maximumCreateAttempts = Number(arg("maximum-create-attempts", "3"));

if (!Number.isInteger(createAttemptNo) || createAttemptNo < 1 || createAttemptNo > 3) {
  throw new Error("invalid_create_attempt_no");
}
if (!Number.isInteger(maximumCreateAttempts) || maximumCreateAttempts < 1 || maximumCreateAttempts > 3) {
  throw new Error("invalid_maximum_create_attempts");
}

const series = await repo.getCaseCreateVerificationSeriesState({
  caseId,
  verificationSeriesId,
  maximumCreateAttempts
});
const seriesBlockers = [
  ...(Number(series.nextCreateAttemptNo || 1) === createAttemptNo ? [] : ["verification_series_attempt_not_next"]),
  ...(createAttemptNo <= maximumCreateAttempts ? [] : ["verification_series_attempt_limit_reached"]),
  ...(Number(series.createdObjectCount || 0) === 0 ? [] : ["verification_series_created_object_already_recorded"]),
  ...(Number(series.readbackVerifiedCount || 0) === 0 ? [] : ["verification_series_readback_already_verified"])
];
if (seriesBlockers.length) {
  console.error(JSON.stringify(sanitizeForPublic({
    status: "blocked_before_fresh_job",
    blockers: seriesBlockers,
    verificationSeriesId,
    nextCreateAttemptNo: Number(series.nextCreateAttemptNo || 1),
    createActionCount: Number(series.createActionCount || 0),
    createdObjectCount: Number(series.createdObjectCount || 0),
    readbackVerifiedCount: Number(series.readbackVerifiedCount || 0)
  }), null, 2));
  process.exitCode = 1;
} else {
  const sourceRecordRef = `verification-series:${verificationSeriesId}:attempt:${createAttemptNo}:${new Date().toISOString()}`;
  const job = await createJob(repo, {
    user_intent: `route_id=${routeId} game_code=${gameCode} advertiser_id=${advertiserId}`,
    route_id: routeId,
    game_code: gameCode,
    advertiser_id: advertiserId,
    case_id: caseId,
    source_usage: "runtime_truth",
    source_record_ref: sourceRecordRef
  });
  await runJob(repo, job.jobId, {
    mode: "draft_readiness",
    allowReadonlyDependency: true,
    createAttemptNo,
    verificationSeriesId,
    verificationTaskRef,
    maximumCreateAttempts
  });
  await compileAndSaveExecutionPlan({
    repo,
    jobId: job.jobId,
    planVersion: createAttemptNo,
    createAttemptNo,
    verificationSeriesId,
    verificationTaskRef,
    maximumCreateAttempts
  });
  const bundle = await repo.getLaunchJobBundle(job.jobId);
  const auditCounts = await repo.getLaunchJobAuditCounts(job.jobId);
  const readiness = createReadiness(bundle);
  const zeroWrite = Number(auditCounts.launchConfirmations || 0) === 0 &&
    Number(auditCounts.platformActions || 0) === 0 &&
    Number(auditCounts.createdObjects || 0) === 0 &&
    Number(auditCounts.readbackRecords || 0) === 0;
  const summary = sanitizeForPublic({
    status: readiness.status === "ready_for_user_create_confirmation" && zeroWrite ? "ready_for_exact_user_confirmation" : "draft_preparation_blocked",
    verificationSeriesId,
    createAttemptNo,
    maximumCreateAttempts,
    jobId: bundle.job.job_id,
    draftId: bundle.draft?.draft_id || "",
    planId: bundle.executionPlan?.plan_id || "",
    planHash: bundle.executionPlan?.plan_hash || "",
    payloadHash: bundle.draft?.payload_hash || "",
    projectName: bundle.draft?.project_name || "",
    nodeStatuses: nodeStatuses(bundle),
    createReadiness: {
      status: readiness.status || "",
      blockers: Array.isArray(readiness.blockers) ? readiness.blockers : [],
      payloadContractStatus: readiness.payloadContractStatus || "",
      createPreflightStatus: readiness.createPreflightStatus || "",
      duplicateStatus: readiness.duplicateStatus || ""
    },
    auditCounts,
    zeroPlatformWriteAudit: { passed: zeroWrite },
    rawPayloadStored: false,
    rawResponseStored: false
  });
  assertNoSensitiveLeak(summary);
  console.log(JSON.stringify(summary, null, 2));
  if (summary.status !== "ready_for_exact_user_confirmation") process.exitCode = 1;
}
