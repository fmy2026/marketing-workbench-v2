import { readFile } from "node:fs/promises";
import {
  WORKBENCH_HOST,
  WORKBENCH_ORIGIN,
  WORKBENCH_PORT,
  AGENT_HUB_PATH,
  LAUNCH_CREATION_AGENT_PATH,
  agentHubUrl,
  parseWorkbenchProgressTarget,
  workbenchCaseUrl,
  workbenchHomeUrl,
  workbenchJobUrl
} from "../frontend/workbench-address.mjs";
import { buildWorkbenchView, createWorkflowCase } from "../src/workflows/launchWorkflow.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const activeCase = {
  case_id: "CASE-MWBV2-ADDRESS-SMOKE-1",
  advertiser_id: "1871922175825993",
  route_id: "oceanengine_3_byte_mini_game",
  game_code: "JSZC",
  current_gate: "resolve_case_blocker",
  root_blocker_codes: ["event_asset_provision_not_plan_eligible"],
  suggested_next_action: "resolve_root_blocker:event_asset_provision_not_plan_eligible",
  latest_job_id: "JOB-MWBV2-ADDRESS-SMOKE-1",
  latest_job_updated_at: "2026-09-01T00:00:00.000Z"
};

assert(WORKBENCH_HOST === "127.0.0.1", "workbench_host_must_be_loopback");
assert(WORKBENCH_PORT === 3000, "workbench_port_must_be_fixed");
assert(AGENT_HUB_PATH === "/agents", "agent_hub_path_mismatch");
assert(LAUNCH_CREATION_AGENT_PATH === "/agents/launch-creation", "launch_agent_path_mismatch");
assert(agentHubUrl() === `${WORKBENCH_ORIGIN}/agents`, "agent_hub_url_mismatch");
assert(workbenchHomeUrl() === "http://127.0.0.1:3000/agents/launch-creation", "workbench_home_url_mismatch");
assert(workbenchCaseUrl(activeCase.case_id) === `${WORKBENCH_ORIGIN}/agents/launch-creation?case_id=${activeCase.case_id}`, "case_url_mismatch");
assert(workbenchJobUrl(activeCase.latestJobId || activeCase.latest_job_id) === `${WORKBENCH_ORIGIN}/agents/launch-creation?job_id=${activeCase.latest_job_id}`, "job_url_mismatch");
assert(parseWorkbenchProgressTarget(`?case_id=${activeCase.case_id}`).status === "case", "case_target_parse_failed");
assert(parseWorkbenchProgressTarget(`?job_id=${activeCase.latest_job_id}`).status === "job", "job_target_parse_failed");
assert(parseWorkbenchProgressTarget(`?case_id=${activeCase.case_id}&job_id=${activeCase.latest_job_id}`).status === "invalid", "ambiguous_target_not_blocked");
assert(parseWorkbenchProgressTarget("?case_id=bad/value").status === "invalid", "invalid_case_target_not_blocked");

const workbench = buildWorkbenchView({ activeCases: [activeCase] });
assert(workbench.state === "idle", "root_workbench_must_stay_idle");
assert(workbench.activeCases.length === 1, "active_case_list_missing");
assert(workbench.activeCases[0].caseId === activeCase.case_id, "active_case_identity_changed");
assert(workbench.activeCases[0].rootBlockerCode === activeCase.root_blocker_codes[0], "active_case_gate_not_from_summary");
assert(workbench.activeCases[0].caseUrl === workbenchCaseUrl(activeCase.case_id), "active_case_url_not_canonical");

let createCalls = 0;
const reuseRepo = {
  async getCoreContext() { return { account: {} }; },
  async getWorkflowCaseByKey() { return null; },
  async getActiveRuntimeWorkflowCase() { return activeCase; },
  async createWorkflowCase() { createCalls += 1; return null; }
};
const reused = await createWorkflowCase(reuseRepo, {
  case_key: "workbench.address-smoke.reuse",
  route_id: activeCase.route_id,
  game_code: activeCase.game_code,
  advertiser_id: activeCase.advertiser_id,
  source_usage: "runtime_truth"
});
assert(reused.reusedActiveCase === true, "active_case_not_reused");
assert(reused.case_id === activeCase.case_id, "reused_case_id_changed");
assert(createCalls === 0, "reused_case_created_duplicate");

const exhaustedCase = {
  ...activeCase,
  case_id: "CASE-MWBV2-ADDRESS-EXHAUSTED-1",
  owner_user_id: "USR-ZHANGJINGWEI",
  source_usage: "runtime_truth",
  lifecycle_status: "active",
  maximum_create_attempts: 3,
  metadata: { manual_review: { approved: true, fix_version: "video_cover_binding_v1" } }
};
const replacementCase = {
  ...exhaustedCase,
  case_id: "CASE-MWBV2-ADDRESS-REPLACEMENT-1",
  case_key: "replacement.case-mwbv2-address-exhausted-1",
  maximum_create_attempts: 1,
  metadata: {
    created_via: "approved_manual_review_replacement",
    replacement_for_case_id: exhaustedCase.case_id,
    manual_review_fix_version: "video_cover_binding_v1"
  }
};
let selectedActiveCase = exhaustedCase;
let replacementCreateCalls = 0;
let replacementJobStatus = "created";
let replacementBlocker = "credential_required";
const replacementRepo = {
  async getCoreContext() { return { account: {} }; },
  async getAdvertiserAccount() {
    return {
      advertiser_id: exhaustedCase.advertiser_id,
      route_id: exhaustedCase.route_id,
      game_code: exhaustedCase.game_code,
      owner_user_id: exhaustedCase.owner_user_id
    };
  },
  async bindAdvertiserOwner() { return { bound: true }; },
  async getWorkflowCaseByKey() { return null; },
  async getActiveRuntimeWorkflowCase() { return selectedActiveCase; },
  async getWorkflowCaseSummary(caseId) {
    return caseId === exhaustedCase.case_id
      ? {
          latest_job_id: "JOB-MWBV2-ADDRESS-EXHAUSTED-3",
          current_gate: "manual_review_after_attempt_limit",
          root_blocker_codes: ["std_project_create_attempt_limit_reached"]
        }
      : {
          lifecycle_status: "active",
          current_gate: "resolve_case_blocker",
          root_blocker_codes: [replacementBlocker],
          latest_job_id: "JOB-MWBV2-ADDRESS-REPLACEMENT-1",
          latest_job_status: replacementJobStatus,
          monitor_resolved: replacementBlocker !== "monitor_create_busy_retry_exhausted"
        };
  },
  async getLaunchJobBundle(jobId) {
    return {
      job: {
        job_id: jobId,
        case_id: jobId.includes("REPLACEMENT") ? replacementCase.case_id : exhaustedCase.case_id,
        job_status: jobId.includes("REPLACEMENT") ? replacementJobStatus : "failed_waiting_manual_review"
      }
    };
  },
  async getWorkflowCase(caseId) { return caseId === replacementCase.case_id ? replacementCase : null; },
  async createWorkflowCase() { throw new Error("approved_replacement_must_not_create_ordinary_case"); }
};
const currentUser = {
  user_id: exhaustedCase.owner_user_id,
  user_status: "active",
  qiankun_owner_key: "zhangjingwei"
};
const replacementOptions = {
  currentUser,
  replacementCredentialStateFn: () => ({ status: "ready", blockers: [] }),
  accountBootstrapFn: async () => ({
    status: "passed",
    accountIdentityWritten: true,
    account: { qiankunOwnerKey: currentUser.qiankun_owner_key }
  }),
  createApprovedReplacementCaseAndJobFn: async (_repo, predecessor, user) => {
    replacementCreateCalls += 1;
    assert(predecessor.job_id === "JOB-MWBV2-ADDRESS-EXHAUSTED-3", "replacement_predecessor_changed");
    assert(user.user_id === currentUser.user_id, "replacement_owner_not_bound");
    selectedActiveCase = replacementCase;
    return {
      created: true,
      caseId: replacementCase.case_id,
      jobId: "JOB-MWBV2-ADDRESS-REPLACEMENT-1",
      maximumCreateAttempts: 1
    };
  }
};
const replacementStarted = await createWorkflowCase(replacementRepo, {
  case_key: "workbench.address-smoke.approved-replacement",
  route_id: exhaustedCase.route_id,
  game_code: exhaustedCase.game_code,
  advertiser_id: exhaustedCase.advertiser_id,
  source_usage: "runtime_truth"
}, replacementOptions);
assert(replacementStarted.case_id === replacementCase.case_id, "approved_intake_did_not_select_replacement_case");
assert(replacementStarted.replacementJobId === "JOB-MWBV2-ADDRESS-REPLACEMENT-1", "approved_intake_replacement_job_missing");
assert(replacementStarted.requiresInitialReadonly === true, "approved_intake_must_request_readonly_only");
assert(replacementStarted.requiresReadonlyRecovery === false, "initial_replacement_must_not_request_recovery");
const replacementRepeated = await createWorkflowCase(replacementRepo, {
  case_key: "workbench.address-smoke.approved-replacement.repeat",
  route_id: exhaustedCase.route_id,
  game_code: exhaustedCase.game_code,
  advertiser_id: exhaustedCase.advertiser_id,
  source_usage: "runtime_truth"
}, replacementOptions);
assert(replacementRepeated.case_id === replacementCase.case_id, "repeated_intake_did_not_return_same_replacement_case");
assert(replacementCreateCalls === 1, "repeated_intake_created_second_replacement_case");

replacementJobStatus = "blocked_confirmed_resource_plan";
const resourceRecovery = await createWorkflowCase(replacementRepo, {
  case_key: "workbench.address-smoke.approved-replacement.resource-recovery",
  route_id: exhaustedCase.route_id,
  game_code: exhaustedCase.game_code,
  advertiser_id: exhaustedCase.advertiser_id,
  source_usage: "runtime_truth"
}, replacementOptions);
assert(resourceRecovery.case_id === replacementCase.case_id, "resource_recovery_case_changed");
assert(resourceRecovery.requiresInitialReadonly === false, "stopped_resource_plan_must_not_run_old_job");
assert(resourceRecovery.requiresReadonlyRecovery === true, "stopped_resource_plan_must_request_fresh_readonly_recovery");

replacementJobStatus = "blocked_confirmed_monitor_plan";
replacementBlocker = "monitor_plan_required";
const monitorRecovery = await createWorkflowCase(replacementRepo, {
  case_key: "workbench.address-smoke.approved-replacement.monitor-recovery",
  route_id: exhaustedCase.route_id,
  game_code: exhaustedCase.game_code,
  advertiser_id: exhaustedCase.advertiser_id,
  source_usage: "runtime_truth"
}, replacementOptions);
assert(monitorRecovery.requiresReadonlyRecovery === true, "stopped_monitor_plan_must_request_fresh_readonly_recovery");

replacementJobStatus = "blocked";
replacementBlocker = "backup_landing_page_target_not_visible";
const ordinaryBlocker = await createWorkflowCase(replacementRepo, {
  case_key: "workbench.address-smoke.approved-replacement.ordinary-blocker",
  route_id: exhaustedCase.route_id,
  game_code: exhaustedCase.game_code,
  advertiser_id: exhaustedCase.advertiser_id,
  source_usage: "runtime_truth"
}, replacementOptions);
assert(ordinaryBlocker.requiresReadonlyRecovery === false, "ordinary_blocker_must_not_create_fresh_recovery_job");

replacementJobStatus = "blocked_confirmed_monitor_plan";
replacementBlocker = "monitor_create_busy_retry_exhausted";
const terminalMonitor = await createWorkflowCase(replacementRepo, {
  case_key: "workbench.address-smoke.approved-replacement.terminal-monitor",
  route_id: exhaustedCase.route_id,
  game_code: exhaustedCase.game_code,
  advertiser_id: exhaustedCase.advertiser_id,
  source_usage: "runtime_truth"
}, replacementOptions);
assert(terminalMonitor.requiresReadonlyRecovery === false, "terminal_monitor_must_keep_its_dedicated_readonly_path");
assert(replacementCreateCalls === 1, "recovery_intake_created_second_replacement_case");

const clientSource = await readFile(new URL("../frontend/app.js", import.meta.url), "utf8");
assert(!/localStorage|sessionStorage/.test(clientSource), "active_account_browser_persistence_present");
assert(clientSource.includes("approvedReplacementCase") && clientSource.includes("requiresInitialReadonly") && clientSource.includes("requiresReadonlyRecovery"), "replacement_start_frontend_bridge_missing");
assert(clientSource.includes('submitJobCommand("重新只读准备")'), "recovery_bridge_must_use_existing_readonly_command");

console.log(JSON.stringify({
  status: "passed",
  origin: WORKBENCH_ORIGIN,
  canonicalCaseUrl: workbenchCaseUrl(activeCase.case_id),
  canonicalJobUrl: workbenchJobUrl(activeCase.latest_job_id),
  activeCaseReuse: reused.reusedActiveCase,
  browserPersistence: false,
  approvedReplacementCaseId: replacementStarted.case_id,
  repeatedReplacementCaseId: replacementRepeated.case_id,
  replacementCreateCalls,
  platformCreateCalls: 0
}, null, 2));
