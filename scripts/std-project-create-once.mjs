import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import {
  createStdProjectOnce,
  STD_PROJECT_CREATE_CONFIRM_ENV,
  STD_PROJECT_CREATE_CONFIRM_VALUE,
  TARGET_STD_PROJECT_CREATE
} from "../src/platforms/oceanengineStdProjectCreateExecutor.mjs";

function sanitize(result = {}) {
  return {
    status: result.status,
    createCalled: Boolean(result.createCalled),
    jobId: TARGET_STD_PROJECT_CREATE.jobId,
    draftId: TARGET_STD_PROJECT_CREATE.draftId,
    projectName: TARGET_STD_PROJECT_CREATE.projectName,
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
    retryPolicy: "no_auto_retry"
  };
}

const repo = new PostgresRepository();
const allowNetworkWrite = process.env[STD_PROJECT_CREATE_CONFIRM_ENV] === STD_PROJECT_CREATE_CONFIRM_VALUE;
const result = await createStdProjectOnce({ repo, allowNetworkWrite });

console.log(JSON.stringify(sanitize(result), null, 2));

if (result.status === "blocked_before_create") process.exit(2);
if (result.status === "create_failed_stop_for_manual_review") process.exit(3);
if (!String(result.status || "").includes("readback_verified")) process.exit(4);
