import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import {
  assertReadonlyReadinessInvocation,
  createOrResolveReadonlyReadinessJob,
  parseReadonlyReadinessArgs,
  summarizeReadonlyReconcileExecution
} from "./00-oe3-readonly-readiness-cli.mjs";
import { createWorkflowCase } from "../src/workflows/launchWorkflow.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const repo = new PostgresRepository();
const cleanupJobIds = [];

try {
  const workflowCase = await createWorkflowCase(repo, {
    case_key: `smoke.readonly-readiness.${Date.now()}`,
    route_id: "oceanengine_3_byte_mini_game",
    game_code: "JSZC",
    advertiser_id: "1871922346964041",
    business_goal: "Disposable readonly readiness CLI smoke.",
    source_usage: "runtime_truth"
  });
  const baseArgv = [
    "--route-id", "oceanengine_3_byte_mini_game",
    "--game-code", "JSZC",
    "--advertiser-id", "1871922346964041",
    "--case-id", workflowCase.case_id,
    "--source-record-ref", `smoke:readonly-readiness-cli:${new Date().toISOString()}`
  ];
  const args = parseReadonlyReadinessArgs(baseArgv);
  assertReadonlyReadinessInvocation({ args, env: {} });

  const created = await createOrResolveReadonlyReadinessJob({
    repo,
    args,
    sourceRecordPrefix: "smoke:readonly-readiness-cli"
  });
  cleanupJobIds.push(created.jobId);
  assert(created.created === true, "runtime_truth_job_not_created");

  const bundle = await repo.getLaunchJobBundle(created.jobId);
  assert(bundle.job.source_usage === "runtime_truth", "created_job_not_runtime_truth");
  assert(String(bundle.job.source_record_ref || "").startsWith("smoke:readonly-readiness-cli:"), "source_record_ref_not_smoke_scoped");

  const resumedArgs = parseReadonlyReadinessArgs([
    "--job-id", created.jobId,
    "--route-id", "oceanengine_3_byte_mini_game",
    "--game-code", "JSZC",
    "--advertiser-id", "1871922346964041",
    "--case-id", workflowCase.case_id
  ]);
  assertReadonlyReadinessInvocation({ args: resumedArgs, env: {} });
  const resumed = await createOrResolveReadonlyReadinessJob({ repo, args: resumedArgs });
  assert(resumed.created === false, "job_id_resume_created_duplicate");
  assert(resumed.jobId === created.jobId, "job_id_resume_mismatch");

  const audit = await repo.getLaunchJobAuditCounts(created.jobId);
  assert(Number(audit.platformActions || 0) === 0, "platform_actions_recorded_before_run");
  assert(Number(audit.launchConfirmations || 0) === 0, "launch_confirmations_recorded_before_run");
  assert(Number(audit.createdObjects || 0) === 0, "created_objects_recorded_before_run");

  let rejectedWriteFlag = false;
  try {
    assertReadonlyReadinessInvocation({
      args: parseReadonlyReadinessArgs([...baseArgv, "--execute"]),
      env: {}
    });
  } catch {
    rejectedWriteFlag = true;
  }
  assert(rejectedWriteFlag, "execute_flag_not_rejected");

  let rejectedConfirmEnv = false;
  try {
    assertReadonlyReadinessInvocation({
      args,
      env: { MWBV2_OE_STD_PROJECT_CREATE_CONFIRM: "CREATE_ONE_STD_PROJECT" }
    });
  } catch {
    rejectedConfirmEnv = true;
  }
  assert(rejectedConfirmEnv, "confirm_env_not_rejected");

  const blockedReconcile = summarizeReadonlyReconcileExecution({
    skillRuns: [{
      skill_key: "resource-live-readonly-reconcile",
      status: "blocked",
      evidence_refs: ["EV-SMOKE-NODE4"]
    }]
  });
  assert(blockedReconcile.executed === true, "blocked_reconcile_not_counted_as_executed");
  assert(blockedReconcile.result === "executed_blocked", "blocked_reconcile_result_not_preserved");
  assert(blockedReconcile.evidencePresent === true, "blocked_reconcile_evidence_not_detected");

  console.log(JSON.stringify({
    status: "passed",
    jobId: created.jobId,
    sourceUsage: bundle.job.source_usage,
    resumedSameJob: true,
    rejectedWriteFlag,
    rejectedConfirmEnv,
    blockedReconcileCountedAsExecuted: blockedReconcile.executed,
    zeroPlatformWriteAudit: {
      launchConfirmations: Number(audit.launchConfirmations || 0),
      platformActions: Number(audit.platformActions || 0),
      createdObjects: Number(audit.createdObjects || 0)
    },
    cleanupPlanned: cleanupJobIds.length
  }, null, 2));
} finally {
  for (const jobId of cleanupJobIds.reverse()) {
    await repo.deleteReadonlyReadinessSmokeJobCascade(jobId);
  }
}
