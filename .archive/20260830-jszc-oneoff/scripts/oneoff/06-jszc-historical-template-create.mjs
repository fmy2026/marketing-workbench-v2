import { PostgresRepository } from "../../src/repositories/postgresRepository.mjs";
import {
  executeHistoricalTemplateOneOff,
  prepareHistoricalTemplateOneOff
} from "../../src/oneoff/jszcHistoricalTemplateCreate.mjs";

const mode = process.argv.includes("--execute") ? "execute" : "prepare";
const jobIndex = process.argv.indexOf("--job-id");
const jobId = jobIndex >= 0 ? process.argv[jobIndex + 1] || "" : "";
const repo = new PostgresRepository();

const result = mode === "execute"
  ? await executeHistoricalTemplateOneOff({ repo, jobId })
  : await prepareHistoricalTemplateOneOff({ repo });

console.log(JSON.stringify({
  status: result.status,
  caseId: result.caseId || "",
  jobId: result.jobId || jobId,
  draftId: result.draftId || "",
  planId: result.planId || "",
  planHash: result.planHash || "",
  payloadHash: result.payloadHash || "",
  projectName: result.projectName || "",
  duplicateStatus: result.duplicateStatus || "",
  createCalled: result.createCalled === true,
  httpStatus: result.httpStatus ?? null,
  apiCode: result.apiCode || "",
  requestIdPresent: result.requestIdPresent === true,
  objectIdPresent: result.objectIdPresent === true,
  readbackStatus: result.readbackStatus || "",
  blockers: result.blockers || [],
  rawPayloadStored: false,
  rawResponseStored: false
}, null, 2));

if (["blocked", "blocked_before_create", "create_failed_stop"].includes(result.status)) process.exitCode = 1;
