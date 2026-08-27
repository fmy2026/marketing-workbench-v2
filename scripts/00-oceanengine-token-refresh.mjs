import { refreshOceanEngineToken } from "../src/platforms/oceanengineTokenRefresh.mjs";

const { exitCode, result } = await refreshOceanEngineToken();
console.log(JSON.stringify(result, null, 2));
process.exitCode = exitCode;
