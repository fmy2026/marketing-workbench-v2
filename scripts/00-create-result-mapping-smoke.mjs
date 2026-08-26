import {
  createNodeStatusFromSkill,
  readbackNodeStatusFromSkill,
  workflowCreateCalledFromView,
  workflowJobUpdateFromSkillResults,
  workflowNoRealPlatformWrite
} from "../src/workflows/skills/oe3/00-result-mapping.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function createSkill(status, outputSummary = {}) {
  return {
    status,
    blockers: outputSummary.blockers || [],
    outputSummary: {
      createCalled: false,
      mockCreateCalled: false,
      realPlatformWriteCalled: false,
      retryAllowed: false,
      ...outputSummary
    }
  };
}

function readbackSkill(status, outputSummary = {}) {
  return {
    status,
    blockers: outputSummary.blockers || [],
    outputSummary: {
      readbackStatus: "not_run",
      realPlatformReadbackCalled: false,
      ...outputSummary
    }
  };
}

const blockedCreate = createSkill("blocked", {
  createNodeStatus: "blocked_before_create",
  blockers: ["network_write_not_enabled_by_caller"]
});
const blockedReadback = readbackSkill("locked");
assert(createNodeStatusFromSkill({ create: blockedCreate, mode: "execute_once" }).status === "blocked", "blocked create should map node 6 to blocked");
assert(readbackNodeStatusFromSkill({ readback: blockedReadback, mode: "execute_once" }).status === "locked", "blocked-before-create should keep node 7 locked");
assert(workflowJobUpdateFromSkillResults({ mode: "execute_once", create: blockedCreate, readback: blockedReadback }).status === "draft_ready", "blocked-before-create job should remain draft_ready");
assert(workflowNoRealPlatformWrite({ create: blockedCreate }) === true, "blocked-before-create should not count platform write");

const createdPending = createSkill("passed", {
  createNodeStatus: "created_pending_readback",
  createCalled: true,
  realPlatformWriteCalled: true,
  objectIdPresent: true
});
const readbackPending = readbackSkill("blocked", {
  readbackStatus: "created_pending_readback",
  realPlatformReadbackCalled: true,
  blockers: ["created_pending_readback"]
});
assert(createNodeStatusFromSkill({ create: createdPending, mode: "execute_once" }).status === "passed", "created pending should map node 6 to passed");
assert(readbackNodeStatusFromSkill({ readback: readbackPending, mode: "execute_once" }).status === "repairable", "created pending should map node 7 to repairable");
assert(workflowJobUpdateFromSkillResults({ mode: "execute_once", create: createdPending, readback: readbackPending }).status === "created_pending_readback", "created pending job status mismatch");
assert(workflowNoRealPlatformWrite({ create: createdPending }) === false, "created pending should count platform write");
assert(createNodeStatusFromSkill({ create: createdPending, mode: "execute_once" }).outputSummary.retryAllowed === false, "created pending should forbid retry");

const readbackPassed = readbackSkill("passed", {
  readbackStatus: "readback_verified",
  objectNameSource: "launch_drafts.project_name",
  objectNameMatchesDraft: true,
  realPlatformReadbackCalled: true
});
assert(readbackNodeStatusFromSkill({ readback: readbackPassed, mode: "execute_once" }).status === "passed", "readback verified should map node 7 to passed");
assert(workflowJobUpdateFromSkillResults({ mode: "execute_once", create: createdPending, readback: readbackPassed }).status === "created", "readback verified job status mismatch");
assert(workflowCreateCalledFromView({
  skills: {
    latest: [
      {
        skillKey: "create-once",
        outputSummary: createdPending.outputSummary
      }
    ]
  }
}) === true, "API view createCalled should be true for real create");

const failedCreate = createSkill("failed", {
  createNodeStatus: "create_failed_stop_for_manual_review",
  createCalled: true,
  realPlatformWriteCalled: true,
  apiCode: "40000",
  requestIdPresent: true,
  stdProjectIdPresent: false
});
assert(createNodeStatusFromSkill({ create: failedCreate, mode: "execute_once" }).status === "failed", "failed create should map node 6 to failed");
assert(workflowJobUpdateFromSkillResults({ mode: "execute_once", create: failedCreate, readback: readbackSkill("locked") }).status === "failed_waiting_manual_review", "failed create job status mismatch");
assert(createNodeStatusFromSkill({ create: failedCreate, mode: "execute_once" }).outputSummary.retryAllowed === false, "failed create should forbid retry");

console.log(JSON.stringify({
  status: "passed",
  cases: [
    "blocked_before_create",
    "created_pending_readback",
    "created_and_readback_verified",
    "create_failed_stop_for_manual_review"
  ],
  realPlatformCalled: false,
  runtimeTruthWritten: false
}, null, 2));
