import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import { createJob, runJob } from "../src/workflows/launchWorkflow.mjs";
import {
  compileAndSaveExecutionPlan,
  evaluateSingleVariableLedgerDiff
} from "../src/workflows/executionPlan.mjs";
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
const baselineJobId = required("baseline-job-id");
const expectedBaselinePayloadHash = arg("baseline-payload-hash");
const preparedJobId = arg("prepared-job-id");
const candidatePath = arg("candidate-field-path", "project_materials.external_url_material_list");
const candidateDirection = arg("candidate-direction", arg("candidate-change"));
const candidateRules = {
  "audience.filter_event": "single_item_to_omitted",
  "project_materials.external_url_material_list": "omitted_to_single_item"
};

if (!Number.isInteger(createAttemptNo) || createAttemptNo < 1 || createAttemptNo > 3) {
  throw new Error("invalid_create_attempt_no");
}
if (!Number.isInteger(maximumCreateAttempts) || maximumCreateAttempts < 1 || maximumCreateAttempts > 3) {
  throw new Error("invalid_maximum_create_attempts");
}
if (!Object.hasOwn(candidateRules, candidatePath)) throw new Error("unsupported_single_variable_candidate");
if (candidateDirection && candidateDirection !== candidateRules[candidatePath]) {
  throw new Error("invalid_single_variable_candidate_direction");
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
  const baselineBundle = await repo.getLaunchJobBundle(baselineJobId);
  if (!baselineBundle) throw new Error("baseline_job_not_found");
  if (expectedBaselinePayloadHash && expectedBaselinePayloadHash !== baselineBundle.draft?.payload_hash) {
    throw new Error("baseline_payload_hash_mismatch");
  }
  if (
    baselineBundle.job?.case_id !== caseId ||
    baselineBundle.job?.route_id !== routeId ||
    baselineBundle.job?.game_code !== gameCode ||
    String(baselineBundle.job?.advertiser_id || "") !== advertiserId
  ) {
    throw new Error("baseline_job_target_mismatch");
  }
  let job;
  if (preparedJobId) {
    const existingPrepared = await repo.getLaunchJobBundle(preparedJobId);
    if (!existingPrepared?.job ||
      existingPrepared.job.case_id !== caseId ||
      existingPrepared.job.route_id !== routeId ||
      existingPrepared.job.game_code !== gameCode ||
      String(existingPrepared.job.advertiser_id || "") !== advertiserId ||
      existingPrepared.job.source_usage !== "runtime_truth" ||
      !existingPrepared.draft?.draft_id ||
      existingPrepared.executionPlan) {
      throw new Error("prepared_job_not_resumable");
    }
    job = { jobId: preparedJobId };
  } else {
    const sourceRecordRef = `verification-series:${verificationSeriesId}:attempt:${createAttemptNo}:${new Date().toISOString()}`;
    job = await createJob(repo, {
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
  }
  const preparedBundle = await repo.getLaunchJobBundle(job.jobId);
  const preparedAuditCounts = await repo.getLaunchJobAuditCounts(job.jobId);
  const readiness = createReadiness(preparedBundle);
  const fieldDiff = evaluateSingleVariableLedgerDiff({
    baselineBundle,
    freshBundle: preparedBundle,
    candidatePath,
    candidateDirection
  });
  const zeroWriteBeforePlan = Number(preparedAuditCounts.launchConfirmations || 0) === 0 &&
    Number(preparedAuditCounts.platformActions || 0) === 0 &&
    Number(preparedAuditCounts.createdObjects || 0) === 0 &&
    Number(preparedAuditCounts.readbackRecords || 0) === 0;
  const planEligible = readiness.status === "ready_for_user_create_confirmation" &&
    zeroWriteBeforePlan &&
    fieldDiff.status === "passed";
  if (planEligible) {
    await compileAndSaveExecutionPlan({
      repo,
      jobId: job.jobId,
      planVersion: createAttemptNo,
      createAttemptNo,
      verificationSeriesId,
      verificationTaskRef,
      maximumCreateAttempts,
      singleVariableExperiment: fieldDiff
    });
  }
  const bundle = await repo.getLaunchJobBundle(job.jobId);
  const auditCounts = await repo.getLaunchJobAuditCounts(job.jobId);
  const zeroWrite = Number(auditCounts.launchConfirmations || 0) === 0 &&
    Number(auditCounts.platformActions || 0) === 0 &&
    Number(auditCounts.createdObjects || 0) === 0 &&
    Number(auditCounts.readbackRecords || 0) === 0;
  const storedExperiment = bundle.executionPlan?.metadata?.single_variable_experiment || {};
  const planBound = bundle.executionPlan?.plan_status === "ready" &&
    storedExperiment.validation_status === "passed" &&
    storedExperiment.diff_hash === fieldDiff.diffHash &&
    storedExperiment.baseline_job_id === baselineJobId &&
    storedExperiment.baseline_payload_hash === fieldDiff.baselinePayloadHash &&
    storedExperiment.candidate_path === fieldDiff.candidatePath &&
    storedExperiment.candidate_direction === fieldDiff.candidateDirection;
  const summary = sanitizeForPublic({
    status: planEligible && zeroWrite && planBound
      ? "ready_for_exact_user_confirmation"
      : "draft_preparation_blocked",
    verificationSeriesId,
    createAttemptNo,
    maximumCreateAttempts,
    resumedPreparedJob: Boolean(preparedJobId),
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
    fieldDiff: {
      baselineJobId,
      baselinePayloadHash: fieldDiff.baselinePayloadHash,
      candidatePath: fieldDiff.candidatePath,
      candidateDirection: fieldDiff.candidateDirection,
      status: fieldDiff.status,
      diffHash: fieldDiff.diffHash,
      allowedChangedPaths: fieldDiff.allowedChangedPaths,
      changedPaths: fieldDiff.changedPaths,
      blockedPaths: fieldDiff.blockedPaths,
      blockers: fieldDiff.blockers,
      requiredChangedPathPresent: fieldDiff.requiredChangedPathPresent === true,
      rawPayloadStored: false
    },
    executionPlanBinding: {
      emittedAfterDiffPassed: planEligible,
      status: planBound ? "passed" : "blocked",
      diffHashBound: planBound
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
