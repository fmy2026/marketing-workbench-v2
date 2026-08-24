import { ensureOceanEngineEnvScaffold, redactedCredentialStatus } from "../src/platforms/oceanengineCredentialStore.mjs";

ensureOceanEngineEnvScaffold();

console.log(JSON.stringify(redactedCredentialStatus(), null, 2));
