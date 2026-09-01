import { PostgresRepository } from "../../src/repositories/postgresRepository.mjs";
import { createOceanEngineReadonlyClient } from "../../src/platforms/oceanengineReadonlyClient.mjs";
import { hashValue, sanitizeForPublic } from "../../src/workflows/skills/oe3/00-contracts.mjs";

const RECONCILE_INTENT = "RECONCILE_EXACT_LOSSLESS_STD_PROJECT_ID";
const USABLE_PROJECT_STATUS = /(^|_)(ENABLE|ACTIVE|DELIVERING)$/;

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || "").trim() : "";
}

function requireDecimal(name, value) {
  if (!/^\d+$/.test(value)) throw new Error(`${name}_must_be_decimal`);
  return value;
}

function clean(value) {
  return String(value ?? "").trim();
}

function extractItems(payload = {}) {
  const data = payload.data || {};
  const list = data.list || data.items || data.projects || [];
  return Array.isArray(list) ? list : [];
}

function summarizeExactProject(payload = {}, projectName, expectedProjectId) {
  const matchingItems = extractItems(payload)
    .filter((item) => clean(item.name || item.project_name || item.std_project_name) === projectName)
    .map((item) => ({
      id: clean(item.project_id || item.std_project_id || item.id),
      status: clean(item.status || item.project_status || item.opt_status).toUpperCase()
    }));
  const exactMatches = matchingItems.filter((item) => item.id === expectedProjectId);
  return {
    matchingProjectCount: matchingItems.length,
    exactProjectIdMatchCount: exactMatches.length,
    exactProjectIdMatches: exactMatches.length === 1,
    usableStatus: exactMatches.length === 1 && USABLE_PROJECT_STATUS.test(exactMatches[0].status)
  };
}

function sameAuditCounts(before = {}, after = {}) {
  return ["launchConfirmations", "platformActions", "createdObjects", "readbackRecords"]
    .every((key) => Number(before[key] || 0) === Number(after[key] || 0));
}

async function main() {
  const jobId = argValue("--job-id");
  const advertiserId = requireDecimal("advertiser_id", argValue("--advertiser-id"));
  const expectedProjectId = requireDecimal("expected_project_id", argValue("--expected-project-id"));
  const legacyProjectId = requireDecimal("legacy_project_id", argValue("--legacy-project-id"));
  const stalePlanId = argValue("--stale-plan-id");
  if (!jobId) throw new Error("job_id_required");
  if (argValue("--reconcile-intent") !== RECONCILE_INTENT) throw new Error("reconcile_intent_required");
  if (expectedProjectId === legacyProjectId) throw new Error("reconciliation_requires_distinct_ids");

  const repo = new PostgresRepository();
  const bundle = await repo.getLaunchJobBundle(jobId);
  const auditBefore = await repo.getLaunchJobAuditCounts(jobId);
  const historicalRecordMatches = clean(bundle?.job?.advertiser_id) === advertiserId &&
    clean(bundle?.createdObject?.object_type) === "std_project" &&
    clean(bundle?.createdObject?.object_id) === legacyProjectId &&
    clean(bundle?.readback?.object_type) === "std_project" &&
    clean(bundle?.readback?.object_id) === legacyProjectId &&
    clean(bundle?.readback?.readback_status) === "readback_verified" &&
    Number(auditBefore.createdObjects || 0) === 1 &&
    Number(auditBefore.readbackRecords || 0) === 1;
  const projectName = clean(bundle?.createdObject?.object_name);
  if (!historicalRecordMatches || !projectName) throw new Error("historical_std_project_reconciliation_precondition_failed");

  const client = createOceanEngineReadonlyClient();
  const probe = await client.get({
    label: "std_project_id_lossless_reconcile",
    endpoint: "/open_api/v3.0/std_project/list/",
    query: {
      advertiser_id: advertiserId,
      filtering: JSON.stringify({ name: projectName }),
      page: "1",
      page_size: "20"
    },
    summarize: (payload) => summarizeExactProject(payload, projectName, expectedProjectId)
  });
  const readonlyVerified = probe.status === "passed" &&
    probe.summary?.matchingProjectCount === 1 &&
    probe.summary?.exactProjectIdMatches === true &&
    probe.summary?.usableStatus === true;
  if (!readonlyVerified) {
    process.stdout.write(`${JSON.stringify(sanitizeForPublic({
      status: "blocked",
      blocker: "fresh_std_project_readonly_not_exactly_verified",
      readonlyStatus: probe.status,
      httpStatus: probe.httpStatus ?? null,
      apiCode: probe.apiCode || "",
      matchingProjectCount: Number(probe.summary?.matchingProjectCount || 0),
      exactProjectIdMatches: probe.summary?.exactProjectIdMatches === true,
      usableStatus: probe.summary?.usableStatus === true,
      platformWriteCalled: false,
      databaseWriteCalled: false
    }), null, 2)}\n`);
    process.exitCode = 1;
    return;
  }

  const evidenceRef = `EV-${jobId}-STD-PROJECT-ID-LOSSLESS-RECONCILE`;
  await repo.upsertEvidence({
    artifactId: evidenceRef,
    jobId,
    artifactType: "std_project_id_lossless_reconcile",
    title: "std_project/list 无损项目 ID 回查修复证据",
    summary: "fresh_readonly_passed=true; exact_project_id_match=true; project_status_usable=true; response_body_stored=false",
    contentHash: probe.responseHash || hashValue({ jobId, expectedProjectId }),
    storageRef: "postgres:mwb.evidence_artifacts:redacted_summary_only",
    sourceRef: "oceanengine:std_project/list",
    sourceUsage: clean(bundle?.job?.source_usage) || "runtime_truth"
  });

  const reconciliation = await repo.reconcileStdProjectObjectId({
    jobId,
    legacyObjectId: legacyProjectId,
    verifiedObjectId: expectedProjectId
  });
  const auditAfter = await repo.getLaunchJobAuditCounts(jobId);
  if (reconciliation.status !== "reconciled" ||
    reconciliation.object_id_matches_verified !== true ||
    reconciliation.readback_id_matches_verified !== true ||
    !sameAuditCounts(auditBefore, auditAfter)) {
    throw new Error("std_project_id_reconciliation_postcondition_failed");
  }

  const stalePlan = stalePlanId
    ? await repo.staleExecutionPlanForContractChange({
      planId: stalePlanId,
      blockerCode: "std_project_id_lossless_response_contract_updated"
    })
    : null;

  process.stdout.write(`${JSON.stringify(sanitizeForPublic({
    status: "passed",
    readonlyVerified: true,
    idPreservedExactly: true,
    auditCountsUnchanged: true,
    stalePlanMarked: Boolean(stalePlan?.plan_id),
    platformWriteCalled: false,
    rawResponseStored: false
  }), null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({
    status: "blocked",
    blocker: clean(error.message || "std_project_id_lossless_reconcile_failed"),
    platformWriteCalled: false
  })}\n`);
  process.exitCode = 1;
});
