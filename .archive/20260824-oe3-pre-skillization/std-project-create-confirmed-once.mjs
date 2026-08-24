import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import {
  createStdProjectForTargetOnce,
  STD_PROJECT_CREATE_CONFIRM_ENV,
  STD_PROJECT_CREATE_CONFIRM_VALUE
} from "../src/platforms/oceanengineStdProjectCreateExecutor.mjs";

const JOB_ID_ENV = "MWBV2_OE_STD_PROJECT_CREATE_JOB_ID";
const PAYLOAD_HASH_ENV = "MWBV2_OE_STD_PROJECT_CREATE_PAYLOAD_HASH";

function clean(value) {
  return String(value ?? "").trim();
}

function assertNoSensitiveLeak(value) {
  const text = JSON.stringify(value);
  [
    /touchpoint_url/i,
    /raw_payload/i,
    /raw_response/i,
    /tf-api\.3k\.com/i,
    /callback\/click/i,
    /\bcookie\b/i,
    /OCEANENGINE_ACCESS_TOKEN/i,
    /OCEANENGINE_REFRESH_TOKEN/i,
    /OCEANENGINE_APP_SECRET/i,
    /Access-Token/i,
    /Bearer\s+[A-Za-z0-9._-]{20,}/i
  ].forEach((pattern) => {
    if (pattern.test(text)) throw new Error(`sensitive leak matched ${pattern}`);
  });
}

function sanitize(result = {}, target = {}) {
  return {
    status: result.status,
    createCalled: Boolean(result.createCalled),
    jobId: target.jobId || "",
    payloadHash: target.payloadHash || "",
    projectName: result.projectName || "",
    stdProjectId: result.stdProjectId || "",
    credentialStatus: result.credentialStatus || "",
    blockers: result.blockers || [],
    httpStatus: result.httpStatus || null,
    apiCode: result.apiCode || "",
    requestIdPresent: Boolean(result.requestIdPresent),
    evidenceRef: result.evidenceRef || "",
    readback: result.readback ? {
      status: result.readback.status,
      objectId: result.readback.objectId || "",
      objectName: result.readback.objectName || "",
      objectStatus: result.readback.objectStatus || "",
      objectNameMatches: Boolean(result.readback.objectNameMatches),
      evidenceRef: result.readback.evidenceRef || ""
    } : null,
    redactedPayloadSummary: result.redactedPayloadSummary || null,
    confirmVariableRequired: `${STD_PROJECT_CREATE_CONFIRM_ENV}=${STD_PROJECT_CREATE_CONFIRM_VALUE}`,
    writesAllowedByThisScript: result.createCalled ? 1 : 0,
    retryPolicy: "no_auto_retry",
    noTokenRefresh: true
  };
}

const repo = new PostgresRepository();
const target = {
  jobId: clean(process.env[JOB_ID_ENV]),
  payloadHash: clean(process.env[PAYLOAD_HASH_ENV])
};
const allowNetworkWrite = process.env[STD_PROJECT_CREATE_CONFIRM_ENV] === STD_PROJECT_CREATE_CONFIRM_VALUE &&
  Boolean(target.jobId) &&
  Boolean(target.payloadHash);
const missingBlockers = [
  ...(process.env[STD_PROJECT_CREATE_CONFIRM_ENV] !== STD_PROJECT_CREATE_CONFIRM_VALUE ? ["confirm_variable_missing_or_invalid"] : []),
  ...(!target.jobId ? ["create_job_id_missing"] : []),
  ...(!target.payloadHash ? ["create_payload_hash_missing"] : [])
];
const result = missingBlockers.length
  ? {
    status: "blocked_before_create",
    createCalled: false,
    blockers: missingBlockers
  }
  : await createStdProjectForTargetOnce({ repo, target, allowNetworkWrite });
const output = sanitize(result, target);
assertNoSensitiveLeak(output);
console.log(JSON.stringify(output, null, 2));

if (result.status === "blocked_before_create") process.exit(2);
if (result.status === "create_failed_stop_for_manual_review") process.exit(3);
if (!String(result.status || "").includes("readback_verified")) process.exit(4);
