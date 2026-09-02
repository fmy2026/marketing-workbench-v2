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

const readbackOnly = aggregateNodeRuns({
  bundle: {
    ...bundle,
    draft: {
      project_name: "JSZC_NODE_PROGRESS_READBACK_SMOKE",
      payload_hash: "sha256:node-progress"
    },
    platformAction: {
      action_status: "succeeded",
      object_id_present: true
    },
    createdObject: {
      object_id: "7680763113444425770",
      evidence_ref: "EV-NODE-PROGRESS-CREATE"
    },
    nodes: [
      ...bundle.nodes,
      {
        node_key: "std_project_draft_builder",
        status: "needs_confirmation",
        output_summary: { createReadiness: { canCreateCurrentJob: true } }
      },
      {
        node_key: "std_project_create_executor",
        status: "passed",
        output_summary: { createCalled: true, realPlatformWriteCalled: true }
      }
    ]
  },
  mode: "readback_only",
  skillOutputs: new Map([
    ["readback-std-project", {
      status: "blocked",
      blockers: ["created_pending_readback"],
      outputSummary: {
        readbackStatus: "created_pending_readback",
        realPlatformReadbackCalled: true
      }
    }]
  ])
});
assert(node(readbackOnly, "std_project_draft_builder").status === "passed", "readback_only_must_preserve_node5_after_confirmed_create");
assert(node(readbackOnly, "std_project_create_executor").status === "passed", "readback_only_must_preserve_node6_after_created_object");
assert(node(readbackOnly, "readback_closer").status === "repairable", "readback_only_must_leave_node7_pending");
assert(readbackOnly.filter((item) => item.status === "passed").length === 6, "created_pending_readback_must_project_six_of_seven");

console.log(JSON.stringify({
  status: "passed",
  pendingNode4Status: node(pending, "account_resource_prepare").status,
  realBlockerNode4Status: node(failed, "account_resource_prepare").status,
  readbackOnlyPassedNodes: readbackOnly.filter((item) => item.status === "passed").length
}, null, 2));
