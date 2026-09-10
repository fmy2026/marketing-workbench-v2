import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  LAUNCH_CREATION_MODULE_KEYS,
  getPublicAgent,
  isRegisteredAgentPath,
  listPublicAgents
} from "../src/agents/agentRegistry.mjs";
import { STD_PROJECT_40100_REDELIVERY_CONTRACT } from "../src/workflows/executionPlan.mjs";
import { evaluatePlanBoundWriteAuthorization } from "../src/workflows/workbenchRuntimeWritePolicy.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const agents = listPublicAgents();
assert(agents.length === 1, "p0_must_expose_one_available_agent");
const launch = agents[0];
assert(launch.agentKey === "launch_creation", "launch_creation_agent_missing");
assert(launch.status === "available", "launch_creation_agent_not_available");
assert(launch.modelConfigurable === true, "launch_creation_model_config_flag_missing");
assert(launch.capabilitySummary.workflowNodeCount === 7, "workflow_node_count_mismatch");
assert(launch.capabilitySummary.resourceTypeCount === 8, "resource_type_count_mismatch");
assert(launch.capabilitySummary.planKindCount === 3, "plan_kind_count_mismatch");
assert(LAUNCH_CREATION_MODULE_KEYS.join(",") === "overview,conversation,memory,knowledge,skills,statistics", "agent_module_contract_mismatch");
assert(isRegisteredAgentPath("/agents"), "agent_hub_spa_path_missing");
assert(isRegisteredAgentPath("/agents/launch-creation"), "launch_agent_spa_path_missing");
assert(!isRegisteredAgentPath("/agents/not-registered"), "unknown_agent_path_must_not_be_spa");

const detail = getPublicAgent("launch_creation");
assert(detail?.workflowNodes?.length === 7, "agent_detail_workflow_missing");
assert(detail?.plans?.length === 3, "agent_detail_plan_summary_missing");
const publicText = JSON.stringify({ agents, detail });
assert(!/(credential|token|secret|advertiser_id|src\/|\.mjs)/i.test(publicText), "agent_catalog_leaks_internal_or_sensitive_data");

const [serverSource, appSource, html] = await Promise.all([
  readFile(new URL("../src/server/index.mjs", import.meta.url), "utf8"),
  readFile(new URL("../frontend/app.js", import.meta.url), "utf8"),
  readFile(new URL("../frontend/index.html", import.meta.url), "utf8")
]);
assert(serverSource.includes('pathname === "/" && (url.searchParams.has("case_id") || url.searchParams.has("job_id"))'), "legacy_case_job_redirect_missing");
assert(serverSource.includes("isRegisteredAgentPath(pathname)"), "registered_agent_spa_guard_missing");
assert(html.includes('href="/styles.css"') && !html.includes('href="./styles.css"'), "deep_link_stylesheet_must_use_root_path");
assert(html.includes('src="/app.js"') && !html.includes('src="./app.js"'), "deep_link_module_must_use_root_path");
assert(appSource.includes("passwordChangeForced") && appSource.includes("Escape"), "password_or_menu_interaction_missing");
assert(html.includes("数字员工广场") && html.includes("数据统计") && !html.includes(">SOP<"), "agent_shell_labels_incorrect");

const policyDirectory = await mkdtemp(join(tmpdir(), "mwbv2-agent-hub-policy-"));
const policyStatePath = join(policyDirectory, "project.state.json");
const policyOwnerId = "USR-AGENT-HUB-OWNER";
const policyJobId = "JOB-AGENT-HUB-POLICY";
const policyPlanId = "PLAN-AGENT-HUB-POLICY";
const policyPlanHash = `sha256:${"a".repeat(64)}`;
try {
  await writeFile(policyStatePath, `${JSON.stringify({
    guardrails: {
      platform_write_allowed: false,
      workbench_runtime_write_policy: {
        enabled: true,
        mode: "authenticated_lan_plan_bound_confirmation_only",
        origin: "configured:WORKBENCH_PUBLIC_ORIGIN",
        require_authenticated_owner: true,
        allowed_source_usage: ["runtime_truth"],
        allowed_plan_kinds: ["std_project_create"],
        require_active_case: true,
        require_latest_case_job: true,
        require_exact_plan_binding: true,
        require_exact_confirmation_phrase: true,
        maximum_confirmations_per_plan: 1,
        retry_allowed: false
      }
    }
  }, null, 2)}\n`);
  const policyBundle = {
    job: { job_id: policyJobId, case_id: "CASE-AGENT-HUB-POLICY", source_usage: "runtime_truth", advertiser_id: "1234567890123456" },
    case: { lifecycle_status: "active", owner_user_id: policyOwnerId },
    account: { owner_user_id: policyOwnerId },
    executionPlan: {
      plan_id: policyPlanId,
      plan_hash: policyPlanHash,
      plan_kind: "std_project_create",
      plan_status: "ready",
      blocker_codes: [],
      metadata: { execution_scope: {
        binding_mode: "single_confirmation_plan",
        target_job_id: policyJobId,
        target_advertiser_id: "1234567890123456",
        target_plan_id: policyPlanId,
        target_plan_hash: policyPlanHash,
        retry_allowed: false,
        rate_limit_redelivery: { ...STD_PROJECT_40100_REDELIVERY_CONTRACT }
      } }
    }
  };
  const policyRepo = {
    async getWorkflowCaseSummary() {
      return { lifecycle_status: "active", latest_job_id: policyJobId, current_gate: "await_job_write_authorization" };
    }
  };
  const ownerPolicy = await evaluatePlanBoundWriteAuthorization({
    repo: policyRepo,
    bundle: policyBundle,
    projectStatePath: policyStatePath,
    authorizationSource: "workbench_conversation",
    authenticatedUserId: policyOwnerId
  });
  const otherPolicy = await evaluatePlanBoundWriteAuthorization({
    repo: policyRepo,
    bundle: policyBundle,
    projectStatePath: policyStatePath,
    authorizationSource: "workbench_conversation",
    authenticatedUserId: "USR-AGENT-HUB-OTHER"
  });
  assert(ownerPolicy.status === "passed", `owner_plan_policy_failed:${ownerPolicy.blockers.join(",")}`);
  assert(otherPolicy.blockers.includes("workbench_runtime_case_owner_mismatch"), "cross_user_case_owner_must_block");
  assert(otherPolicy.blockers.includes("workbench_runtime_account_owner_mismatch"), "cross_user_account_owner_must_block");
} finally {
  await rm(policyDirectory, { recursive: true, force: true });
}

console.log(JSON.stringify({
  status: "passed",
  availableAgents: agents.map((agent) => agent.agentKey),
  moduleCount: LAUNCH_CREATION_MODULE_KEYS.length,
  workflowNodes: detail.workflowNodes.length,
  legacyRedirect: true,
  authenticatedOwnerRequired: true,
  publicCatalogSensitiveData: false
}, null, 2));
