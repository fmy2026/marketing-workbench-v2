import { getPublicAgent } from "../src/agents/agentRegistry.mjs";
import { resolveWorkflowStatisticsScope } from "../src/agents/agentWorkspaceScopes.mjs";
import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const profile = getPublicAgent("launch_creation");
assert(profile?.modules?.map((item) => item.key).join(",") === "overview,conversation,memory,knowledge,skills,statistics", "agent_module_projection_changed");
assert(profile.capabilitySummary.workflowNodeCount === 7, "workflow_node_count_changed");
assert(profile.capabilitySummary.resourceTypeCount === 8, "resource_type_count_changed");
assert(profile.capabilitySummary.planKindCount === 3, "plan_kind_count_changed");
assert(profile.knowledgeTopics.length === 4 && profile.knowledgeTopics.every((topic) => topic.title && topic.description), "knowledge_projection_incomplete");
assert(profile.workflowNodes.every((node) => node.skillGroup.length && node.inputs.length && node.outputs.length && node.statusMeaning), "skill_projection_incomplete");
assert(!JSON.stringify(profile).includes("src/"), "public_agent_projection_leaks_internal_paths");

assert(resolveWorkflowStatisticsScope({ requestedScope: "all", userRole: "admin" }) === "all", "admin_all_scope_not_allowed");
assert(resolveWorkflowStatisticsScope({ requestedScope: "all", userRole: "operator" }) === "self", "operator_all_scope_not_blocked");
assert(resolveWorkflowStatisticsScope({ requestedScope: "anything", userRole: "admin" }) === "self", "invalid_scope_not_defaulted_to_self");

const repo = new PostgresRepository();
const operator = await repo.getWorkbenchUserByLogin("zhangjingwei");
assert(operator?.user_id, "operator_fixture_missing");
const memory = await repo.getUserWorkflowMemory({ userId: operator.user_id });
assert(memory.every((item) => !Object.hasOwn(item, "advertiser_id")), "memory_exposes_full_advertiser_id");
assert(memory.every((item) => !item.advertiser_masked || /^\*{4}/.test(item.advertiser_masked)), "memory_advertiser_not_masked");
assert(memory.every((item) => Array.isArray(item.evidence_refs)), "memory_evidence_refs_not_projected");

console.log(JSON.stringify({
  status: "passed",
  publicModules: profile.modules.length,
  workflowNodes: profile.workflowNodes.length,
  operatorAllScopeBlocked: true,
  memoryRecords: memory.length,
  realPlatformWriteCalled: false
}, null, 2));
