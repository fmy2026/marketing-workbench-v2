import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import { buildWorkbenchView, createJob, runJob } from "../src/workflows/launchWorkflow.mjs";
import { OE3_REQUIRED_RESOURCE_TYPES, OE3_RESOURCE_LABELS } from "../src/workflows/skills/oe3/00-contracts.mjs";
import { WORKFLOW_NODES } from "../src/workflows/skills/oe3/00-workflow-node-registry.mjs";

const repo = new PostgresRepository();
const cleanupJobIds = [];

async function createDraft(sourceRecordRef) {
  const initial = await createJob(repo, {
    user_intent: "推广路线 oceanengine_3_byte_mini_game，游戏 JSZC，账户 1871922175825993",
    source_usage: "test_run",
    source_record_ref: sourceRecordRef
  });
  cleanupJobIds.push(initial.jobId);
  assertInitialWorkflow(initial);
  const dryRun = await runJob(repo, initial.jobId, { mode: "dry_run" });
  assertDryRunWorkflow(dryRun);
  return dryRun;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function workflowNodes(view) {
  return (view.phases || []).flatMap((phase) => phase.nodes || []);
}

function workflowChildren(view) {
  return workflowNodes(view).flatMap((node) => node.children || []);
}

function nodeById(view, nodeId) {
  return workflowNodes(view).find((node) => node.id === nodeId) || {};
}

function assertWorkflowShape(view) {
  const nodes = workflowNodes(view);
  const children = workflowChildren(view);
  const registryChildren = WORKFLOW_NODES.flatMap((node) => node.children || []);
  assert(nodes.length === 7, `expected 7 workflow nodes, got ${nodes.length}`);
  assert(children.length === registryChildren.length, `expected ${registryChildren.length} workflow children, got ${children.length}`);
  assert(new Set(children.map((child) => child.id)).size === registryChildren.length, "workflow child ids are not unique");
  for (const child of children) {
    assert(
      Object.keys(child).sort().join(",") === "id,label,status,statusLabel,trace",
      `workflow child public shape changed: ${child.id}`
    );
    assert(child.trace?.type && child.trace?.resolverRef, `workflow child trace missing: ${child.id}`);
  }
  const node4 = nodeById(view, "account_resource_prepare");
  const expectedNode4 = (WORKFLOW_NODES.find((node) => node.nodeKey === "account_resource_prepare")?.children || [])
    .map(({ id, label }) => ({ id, label }));
  assert(JSON.stringify(node4.children.map(({ id, label }) => ({ id, label }))) === JSON.stringify(expectedNode4), "node4 resource children mismatch");
  const node4ResourceLabels = node4.children
    .filter((child) => child.id.startsWith("resource-"))
    .map((child) => child.label);
  assert(JSON.stringify(node4ResourceLabels) === JSON.stringify(OE3_REQUIRED_RESOURCE_TYPES.map((resourceType) => OE3_RESOURCE_LABELS[resourceType])), "node4 resource child labels mismatch");
  assert(nodes.every((node) => Array.isArray(node.subflows) && node.subflows.every((item) => typeof item === "string")), "legacy subflows compatibility changed");
}

function assertWorkbenchShape(view) {
  const nodes = workflowNodes(view);
  const children = workflowChildren(view);
  const registryChildren = WORKFLOW_NODES.flatMap((node) => node.children || []);
  assert(view.state === "idle", "workbench_state_must_be_idle");
  assert((view.intake?.requiredFields || []).map((field) => field.key).join(",") === "route_id,game_code,advertiser_id", "workbench_intake_fields_mismatch");
  assert(nodes.length === WORKFLOW_NODES.length, "workbench_node_count_must_come_from_registry");
  assert(children.length === registryChildren.length, "workbench_child_count_must_come_from_registry");
  assert(nodes.every((node) => node.status === "waiting"), "idle_workbench_nodes_must_be_waiting");
  assert(children.every((child) => child.status === "waiting"), "idle_workbench_children_must_be_waiting");
}

function assertInitialWorkflow(view) {
  assertWorkflowShape(view);
  assertAwemeReadinessShape(view);
  const intake = nodeById(view, "launch_intake");
  assert(intake.status === "passed", "initial intake node must be passed");
  assert(intake.children.every((child) => child.status === "passed"), "initial intake children must be passed");
  const downstream = workflowNodes(view).filter((node) => node.id !== "launch_intake");
  assert(downstream.every((node) => node.children.every((child) => child.status === "waiting")), "initial downstream children must be waiting");
  assert(view.primaryAction?.kind === "run" && view.primaryAction?.enabled === true, "initial action must be safe dry-run");
  assert(view.caseId, "initial_view_case_id_missing");
  assert(view.isLatestCaseJob === true, "initial_view_must_be_latest_case_job");
  assert(view.caseGate?.currentGate === "run_fresh_readiness", "initial_view_case_gate_mismatch");
  assert(view.headline?.nextAction === view.caseGate?.suggestedNextAction, "headline_must_use_case_summary_next_action");
}

function expectedMonitorStatus(monitorChild) {
  const priority = ["monitor-readback", "monitor-ensure", "monitor-plan", "monitor-query"];
  const statuses = new Map((monitorChild?.trace?.skills || []).map((skill) => [
    skill.skillKey,
    skill.latestRun?.status
  ]));
  return priority.map((key) => statuses.get(key)).find(Boolean) || "waiting";
}

function assertDryRunWorkflow(view) {
  assertWorkflowShape(view);
  assertAwemeReadinessShape(view);
  const monitor = nodeById(view, "creation_context").children.find((child) => child.id === "monitor");
  assert(monitor?.status === expectedMonitorStatus(monitor), "monitor child did not use readback/ensure/plan/query priority");
  const node4 = nodeById(view, "account_resource_prepare");
  for (const resourceType of OE3_REQUIRED_RESOURCE_TYPES) {
    const child = node4.children.find((item) => item.id === `resource-${resourceType}`);
    const skill = (view.skills?.latest || []).filter((item) => item.skillKey === `resource-verify-${resourceType.replace(/_/g, "-")}`).at(-1);
    assert(child?.status === (skill?.status || node4.status), `node4 child status mismatch: ${resourceType}`);
  }
  assert(view.primaryAction?.kind !== "execute_once", "dry-run must not expose execute-once without a server grant");
}

function assertAwemeReadinessShape(view) {
  const auth = view.awemeAuthorization || {};
  ["required", "configured", "verificationStatus", "ready", "blockerCode", "nextAction", "defaultAwemeIdHash"].forEach((key) => {
    assert(Object.prototype.hasOwnProperty.call(auth, key), `aweme readiness missing ${key}`);
  });
  [
    "selectionStatus",
    "selectionPolicy",
    "activeCandidateCount",
    "selectedAwemeIdPresent",
    "selectedAwemeIdHash",
    "candidates"
  ].forEach((key) => {
    assert(!Object.prototype.hasOwnProperty.call(auth, key), `legacy aweme API field present ${key}`);
  });
}

function projectSeq(projectName) {
  const match = String(projectName || "").match(/_P(\d{2,})_(\d{8})$/);
  if (!match) throw new Error(`project sequence not found in ${projectName}`);
  return {
    seq: Number(match[1]),
    yyyymmdd: match[2]
  };
}

function assertNoSensitiveLeak(view) {
  const text = JSON.stringify(view);
  const forbidden = [
    /touchpoint_url/i,
    /raw_payload/i,
    /raw_response/i,
    /tf-api\.3k\.com/i,
    /callback\/click/i,
    /\bcookie\b/i,
    /OCEANENGINE_ACCESS_TOKEN/i,
    /OCEANENGINE_REFRESH_TOKEN/i,
    /OCEANENGINE_APP_SECRET/i,
    /Access-Token/i,
    /Bearer\s+[A-Za-z0-9._-]{20,}/i
  ];
  const matched = forbidden.find((pattern) => pattern.test(text));
  if (matched) throw new Error(`sensitive API leak matched ${matched}`);
}

function assertPayloadContract(view) {
  const gaps = view.payloadContract?.gaps || [];
  const manifest = view.draft?.fields ? view.phases
    ?.flatMap((phase) => phase.nodes || [])
    ?.find((node) => node.id === "std_project_draft_builder")
    ?.outputSummary?.requestFieldManifest || {}
    : {};
  if (view.payloadContract.status === "blocked") {
    if (!gaps.length) throw new Error("blocked payload contract did not expose gaps");
    return {
      status: "blocked",
      dmpBlocked: gaps.some((gap) => gap.key === "dmp_custom_audience_ids")
    };
  }
  if (view.payloadContract.status !== "passed") {
    throw new Error(`unexpected payload contract status ${view.payloadContract.status}`);
  }
  if (manifest.dmpRetargetingTagsExcludePresent !== true) throw new Error("DMP retargeting_tags_exclude missing from manifest");
  if (manifest.dmpRetargetingTagsExcludeIntegerArray !== true) throw new Error("DMP retargeting_tags_exclude is not integer[]");
  return {
    status: "passed",
    dmpBlocked: false,
    dmpRetargetingTagsExcludeCount: manifest.dmpRetargetingTagsExcludeCount || 0
  };
}

try {
  assertWorkbenchShape(buildWorkbenchView());
  const firstDraft = await createDraft(`smoke:api:first:${new Date().toISOString()}`);
  const secondDraft = await createDraft(`smoke:api:second:${new Date().toISOString()}`);

  const firstNodeCount = await repo.countNodeRuns(firstDraft.jobId);
  const secondNodeCount = await repo.countNodeRuns(secondDraft.jobId);
  const firstName = projectSeq(firstDraft.draft.projectName);
  const secondName = projectSeq(secondDraft.draft.projectName);
  const firstContract = assertPayloadContract(firstDraft);
  const secondContract = assertPayloadContract(secondDraft);

  if (firstNodeCount !== 7) throw new Error(`expected 7 node runs, got ${firstNodeCount}`);
  if (secondNodeCount !== 7) throw new Error(`expected 7 node runs, got ${secondNodeCount}`);
  if (!firstDraft.draft.projectName.includes("JSZC_HUNT_PAY7DROI")) throw new Error("project name style mismatch");
  if (!secondDraft.draft.projectName.includes("JSZC_HUNT_PAY7DROI")) throw new Error("project name style mismatch");
  if (firstName.yyyymmdd === "20260817" || secondName.yyyymmdd === "20260817") throw new Error("project name date is still fixed to seed date");
  if (!firstDraft.draft.payloadHash.startsWith("sha256:")) throw new Error("payload hash missing");
  if (!secondDraft.draft.payloadHash.startsWith("sha256:")) throw new Error("payload hash missing");
  if (firstDraft.touchpoint.status !== "stored_in_database") throw new Error("touchpoint status is not stored_in_database");
  if (!firstDraft.touchpoint.urlHash) throw new Error("touchpoint hash missing from API view");
  if (!["blocked", "locked"].includes(firstDraft.prewriteGate.status)) throw new Error("prewrite gate status missing");
  if ((firstDraft.skills?.runCount || 0) < 18) throw new Error("workflow skill runs were not recorded");
  if (firstDraft.execution?.objectIdPresent) throw new Error("dry_run returned created object");
  assertNoSensitiveLeak(firstDraft);
  assertNoSensitiveLeak(secondDraft);

  const firstBundle = await repo.getLaunchJobBundle(firstDraft.jobId);
  const secondBundle = await repo.getLaunchJobBundle(secondDraft.jobId);
  if (firstBundle.job.source_usage !== "test_run") throw new Error("first smoke job source_usage is not test_run");
  if (secondBundle.job.source_usage !== "test_run") throw new Error("second smoke job source_usage is not test_run");
  if (firstBundle.platformAction || secondBundle.platformAction) throw new Error("dry_run recorded platform action");
  if (firstBundle.createdObject || secondBundle.createdObject) throw new Error("dry_run recorded created object");

  console.log(JSON.stringify({
    firstJobId: firstDraft.jobId,
    secondJobId: secondDraft.jobId,
    firstNodeCount,
    secondNodeCount,
    firstProjectName: firstDraft.draft.projectName,
    secondProjectName: secondDraft.draft.projectName,
    firstProjectSeq: firstName.seq,
    secondProjectSeq: secondName.seq,
    firstPayloadHash: firstDraft.draft.payloadHash,
    secondPayloadHash: secondDraft.draft.payloadHash,
    firstSourceUsage: firstBundle.job.source_usage,
    secondSourceUsage: secondBundle.job.source_usage,
    touchpointStatus: firstDraft.touchpoint.status,
    touchpointHash: firstDraft.touchpoint.urlHash,
    payloadContract: firstContract,
    secondPayloadContract: secondContract,
    skillRunCount: firstDraft.skills?.runCount || 0,
    prewriteGateStatus: firstDraft.prewriteGate.status,
    cleanupPlanned: cleanupJobIds.length
  }, null, 2));
} finally {
  for (const jobId of cleanupJobIds.reverse()) {
    await repo.deleteTestJobCascade(jobId);
  }
}
