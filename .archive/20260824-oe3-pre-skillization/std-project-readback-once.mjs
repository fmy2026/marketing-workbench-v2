import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import {
  readbackStdProjectOnce,
  TARGET_STD_PROJECT_CREATE
} from "../src/platforms/oceanengineStdProjectCreateExecutor.mjs";

const repo = new PostgresRepository();
const result = await readbackStdProjectOnce({ repo, jobId: TARGET_STD_PROJECT_CREATE.jobId });

console.log(JSON.stringify({
  status: result.status,
  jobId: TARGET_STD_PROJECT_CREATE.jobId,
  projectName: TARGET_STD_PROJECT_CREATE.projectName,
  objectId: result.objectId || "",
  objectName: result.objectName || "",
  objectStatus: result.objectStatus || "",
  objectNameMatches: Boolean(result.objectNameMatches),
  httpStatus: result.httpStatus || null,
  apiCode: result.apiCode || "",
  requestIdPresent: Boolean(result.requestIdPresent),
  evidenceRef: result.evidenceRef || "",
  blockers: result.blockers || [],
  writeActionCalled: false
}, null, 2));

if (result.status === "credential_required") process.exit(2);
if (result.status !== "readback_verified") process.exit(3);
