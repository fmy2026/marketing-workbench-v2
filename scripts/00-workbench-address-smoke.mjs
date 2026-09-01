import { readFile } from "node:fs/promises";
import {
  WORKBENCH_HOST,
  WORKBENCH_ORIGIN,
  WORKBENCH_PORT,
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
assert(workbenchHomeUrl() === "http://127.0.0.1:3000/", "workbench_home_url_mismatch");
assert(workbenchCaseUrl(activeCase.case_id) === `${WORKBENCH_ORIGIN}/?case_id=${activeCase.case_id}`, "case_url_mismatch");
assert(workbenchJobUrl(activeCase.latest_job_id) === `${WORKBENCH_ORIGIN}/?job_id=${activeCase.latest_job_id}`, "job_url_mismatch");
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

const clientSource = await readFile(new URL("../frontend/app.js", import.meta.url), "utf8");
assert(!/localStorage|sessionStorage/.test(clientSource), "active_account_browser_persistence_present");

console.log(JSON.stringify({
  status: "passed",
  origin: WORKBENCH_ORIGIN,
  canonicalCaseUrl: workbenchCaseUrl(activeCase.case_id),
  canonicalJobUrl: workbenchJobUrl(activeCase.latest_job_id),
  activeCaseReuse: reused.reusedActiveCase,
  browserPersistence: false
}, null, 2));
