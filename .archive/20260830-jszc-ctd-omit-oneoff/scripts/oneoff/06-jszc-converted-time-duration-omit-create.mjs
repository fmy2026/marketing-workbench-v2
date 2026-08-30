import { PostgresRepository } from "../../src/repositories/postgresRepository.mjs";
import {
  authorizeConvertedTimeDurationOmitOneOff,
  executeConvertedTimeDurationOmitOneOff,
  prepareConvertedTimeDurationOmitOneOff,
  readbackConvertedTimeDurationOmitOneOff
} from "../../src/oneoff/jszcConvertedTimeDurationOmitCreate.mjs";

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || "" : "";
}

const mode = argValue("--mode") || "prepare";
const jobId = argValue("--job-id");
const repo = new PostgresRepository();

let result;
if (mode === "prepare") {
  result = await prepareConvertedTimeDurationOmitOneOff({ repo });
} else if (mode === "authorize") {
  result = await authorizeConvertedTimeDurationOmitOneOff({ repo, jobId });
} else if (mode === "execute") {
  result = await executeConvertedTimeDurationOmitOneOff({ repo, jobId });
} else if (mode === "readback") {
  result = await readbackConvertedTimeDurationOmitOneOff({ repo, jobId });
} else {
  result = { status: "blocked", blockers: [`unknown_mode:${mode}`] };
}

console.log(JSON.stringify(result, null, 2));
if (result.status === "blocked" || result.status === "blocked_before_create") process.exit(1);
