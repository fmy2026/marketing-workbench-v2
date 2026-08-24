import { runAccountResourceDiagnosis } from "../src/platforms/oceanengineAccountResourceAdapter.mjs";

const result = await runAccountResourceDiagnosis();
console.log(JSON.stringify({
  status: result.status,
  jobId: result.jobId,
  platformReadonlyStatus: result.platformReadonlyStatus,
  credentialStatus: result.credentialStatus,
  prewriteGateStatus: result.prewriteGateStatus,
  blockedResourceTypes: result.blockedResourceTypes,
  platformEvidenceCount: result.platformEvidenceCount,
  resources: result.resourcePlans.map((plan) => ({
    resourceType: plan.resourceType,
    ready: plan.ready,
    readonlyStatus: plan.before?.readonlyStatus || "",
    readonlyGap: plan.before?.readonlyGap || "",
    nextAction: plan.nextAction
  })),
  writeActionsCalled: false
}, null, 2));
if (result.status === "credential_required") process.exitCode = 1;
