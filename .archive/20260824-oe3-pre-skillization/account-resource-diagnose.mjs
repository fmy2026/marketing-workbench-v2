import { runAccountResourceDiagnosis } from "../src/platforms/oceanengineAccountResourceAdapter.mjs";

const result = await runAccountResourceDiagnosis();
console.log(JSON.stringify(result, null, 2));
if (result.status === "credential_required") process.exitCode = 1;
