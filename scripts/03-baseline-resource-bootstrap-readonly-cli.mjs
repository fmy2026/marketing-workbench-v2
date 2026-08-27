import { fileURLToPath } from "node:url";
import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import {
  assertReadonlyReadinessInvocation,
  parseReadonlyReadinessArgs,
  runReadonlyReadiness
} from "./00-oe3-readonly-readiness-cli.mjs";
import { assertNoSensitiveLeak, sanitizeForPublic } from "../src/workflows/skills/oe3/00-contracts.mjs";

function resourceSummary(bundle = {}) {
  return (bundle.resources || [])
    .filter((item) => item.blueprint_id)
    .map((item) => ({
      resourceType: item.resource_type,
      blueprintId: item.blueprint_id,
      sourceAssetId: item.source_asset_id || "",
      inheritanceStatus: item.inheritance_status || "",
      visibilityStatus: item.visibility_status || "",
      readbackStatus: item.readback_status || "",
      readonlyStatus: item.metadata?.readonly_check?.status || ""
    }));
}

function executionPlanSummary(plan = {}) {
  return {
    planId: plan.plan_id || "",
    planStatus: plan.plan_status || "",
    blockerCodes: plan.blocker_codes || [],
    plannedActionTypes: (plan.planned_actions || []).map((item) => item.action_type).filter(Boolean)
  };
}

export async function runBaselineResourceReadonlyBootstrap({ repo = new PostgresRepository(), args, env = process.env } = {}) {
  assertReadonlyReadinessInvocation({ args, env });
  if (args.jobId) throw new Error("baseline_resource_bootstrap_requires_fresh_job");
  const readiness = await runReadonlyReadiness({
    repo,
    args,
    env,
    sourceRecordPrefix: "resource:bootstrap-readonly"
  });
  const bundle = await repo.getLaunchJobBundle(readiness.jobId);
  const plan = await repo.getLatestLaunchExecutionPlan(readiness.jobId);
  const result = sanitizeForPublic({
    ...readiness,
    baselineResourceBootstrap: {
      resourceCount: resourceSummary(bundle).length,
      resources: resourceSummary(bundle),
      executionPlan: executionPlanSummary(plan),
      platformWriteAllowed: false,
      tokenRefreshCalled: false
    }
  });
  assertNoSensitiveLeak(result);
  return result;
}

async function main() {
  const args = parseReadonlyReadinessArgs();
  try {
    const result = await runBaselineResourceReadonlyBootstrap({ args });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      status: "failed",
      error: error.message || "baseline_resource_bootstrap_readonly_failed",
      rawRequestStored: false,
      rawResponseStored: false,
      rawPayloadStored: false
    }, null, 2));
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
