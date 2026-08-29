import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import {
  awemeAuthorizationReadinessOnly,
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
  assert(args.scope === "", "default_scope_should_be_empty");

  const awemeScopeArgs = parseReadonlyReadinessArgs([
    ...baseArgv,
    "--scope", "aweme_authorization"
  ]);
  assert(awemeScopeArgs.scope === "aweme_authorization", "aweme_scope_not_parsed");
  assertReadonlyReadinessInvocation({ args: awemeScopeArgs, env: {} });
  const awemeReadinessOutput = awemeAuthorizationReadinessOnly({
    advertiser_id: "1871922346964041",
    route_id: "oceanengine_3_byte_mini_game",
    game_code: "JSZC",
    required: true,
    configured: true,
    verification_status: "authorized",
    ready: true,
    blocker_code: "",
    next_action: "ready_for_node5_payload_build",
    default_aweme_id_hash: "sha256:smoke",
    verified_at: "2026-08-29T00:00:00.000Z",
    expires_at: null,
    evidence_ref: "EV-SMOKE",
    candidate_count: 1,
    job_id: "JOB-SHOULD-NOT-LEAK"
  });
  assert(JSON.stringify(Object.keys(awemeReadinessOutput)) === JSON.stringify([
    "required",
    "configured",
    "verification_status",
    "ready",
    "blocker_code",
    "next_action",
    "default_aweme_id_hash",
    "verified_at",
    "expires_at",
    "evidence_ref"
  ]), "aweme_readiness_output_fields_not_minimal");
  assert(!Object.prototype.hasOwnProperty.call(awemeReadinessOutput, "job_id"), "aweme_readiness_output_leaked_job_id");
  assert(!Object.prototype.hasOwnProperty.call(awemeReadinessOutput, "candidate_count"), "aweme_readiness_output_leaked_candidate_count");

  let rejectedAwemeScopeResume = false;
  try {
    assertReadonlyReadinessInvocation({
      args: parseReadonlyReadinessArgs([
        "--scope", "aweme_authorization",
        "--job-id", "JOB-MWBV2-SMOKE-EXISTING",
        "--route-id", "oceanengine_3_byte_mini_game",
        "--game-code", "JSZC",
        "--advertiser-id", "1871922346964041",
        "--case-id", workflowCase.case_id
      ]),
      env: {}
    });
  } catch {
    rejectedAwemeScopeResume = true;
  }
  assert(rejectedAwemeScopeResume, "aweme_scope_job_id_resume_not_rejected");

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
    rejectedAwemeScopeResume,
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
