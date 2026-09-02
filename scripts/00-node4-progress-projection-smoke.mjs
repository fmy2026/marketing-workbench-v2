import { aggregateNodeRuns } from "../src/workflows/skills/oe3/00-runner.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function node(nodes, nodeKey) {
  return nodes.find((item) => item.nodeKey === nodeKey) || {};
}

const bundle = {
  job: { job_id: "JOB-NODE4-PROGRESS-SMOKE" },
  nodes: [{ node_key: "account_resource_prepare", status: "passed" }]
};

const pending = aggregateNodeRuns({
  bundle,
  mode: "execute_once",
  skillOutputs: new Map()
});
assert(node(pending, "account_resource_prepare").status === "passed", "pending_resource_skills_must_preserve_stable_node4_passed");

const failed = aggregateNodeRuns({
  bundle,
  mode: "execute_once",
  skillOutputs: new Map([
    ["resource-verify-avatar", {
      status: "blocked",
      blockers: ["avatar_readback_failed"],
      outputSummary: { resourceType: "avatar", prepareCapability: { status: "blocked" } }
    }]
  ])
});
assert(node(failed, "account_resource_prepare").status === "blocked", "real_resource_blocker_must_block_node4");

console.log(JSON.stringify({
  status: "passed",
  pendingNode4Status: node(pending, "account_resource_prepare").status,
  realBlockerNode4Status: node(failed, "account_resource_prepare").status
}, null, 2));
