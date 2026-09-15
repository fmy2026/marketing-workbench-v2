import {
  classifyProjectVideoAppendItems,
  buildProjectVideoAppendPlan,
  buildProjectVideoAppendWireBody,
  buildProjectVideoMaterialPushPlan,
  executeProjectVideoAppendOnce,
  executeProjectVideoMaterialPushOnce,
  prepareProjectVideoAppendReadonly,
  readProjectVideoIds,
  recommendProjectVideoAppendProjects,
  scanOceanEngineVideoInventory,
  validateProjectVideoAppendReadback
} from "../src/platforms/oceanengineProjectVideoAppendExecutor.mjs";
import { videoMaterialBatchBindTransportPayload } from "../src/platforms/oceanengineVideoMaterialExecutor.mjs";
import { reconcileQiankunMaterialSourceVideoInventory } from "../src/workflows/skills/oe3/04-video-material-readiness.mjs";
import { exactMaterialCodePattern, filenameMatchesMaterialCode } from "../src/platforms/materialCodeMatcher.mjs";
import { launchRequestFingerprint, validateLaunchRequest } from "../src/agents/launchRequest.mjs";
import { resolveLaunchRequestIntake } from "../src/agents/conversationIntentResolver.mjs";
import { operationContract } from "../src/workflows/launchOperationContracts.mjs";
import { PostgresRepository } from "../tests/support/repository.mjs";

function assert(value, message) { if (!value) throw new Error(message); }

const request = validateLaunchRequest({
  schema_version: "launch-request.v2", operation: "append_project_videos",
  route_id: "oceanengine_3_byte_mini_game", game_code: "JSZC",
  advertiser_id: "1234567890123456", project_id: "1234567890123456789",
  origin_resource_ids: ["video-A", "video-B", "video-C"]
});
assert(request.origin_resource_ids.length === 3, "append_request_not_normalized");
const appendPresentation = operationContract("append_project_videos");
assert(appendPresentation.nodeChildren.std_project_draft_builder.length === 0 && appendPresentation.nodeSubflows.std_project_draft_builder.length === 0, "append_plan_node_must_not_show_create_project_checks");
const structured = await resolveLaunchRequestIntake({ request });
assert(structured.request.operation === "append_project_videos" && structured.request.origin_resource_ids.length === 3, "append_structured_intake_lost_fields");
const natural = await resolveLaunchRequestIntake({
  userIntent: "巨兽战场走抖小，账户 1234567890123456，项目 1234567890123456789，追加视频标识码: video-A, video-B"
});
assert(natural.request.operation === "append_project_videos", "append_natural_operation_not_detected");
assert(natural.request.project_id === "1234567890123456789", "append_natural_project_not_detected");
assert(natural.request.origin_resource_ids.join(",") === "video-A,video-B", "append_natural_videos_not_detected");
const items = classifyProjectVideoAppendItems({
  originResourceIds: request.origin_resource_ids,
  projectVideoIds: ["target-A"],
  targetVideos: [{ originResourceId: "video-A", videoId: "target-A" }, { originResourceId: "video-B", videoId: "target-B" }],
  sourceVideos: [{ originResourceId: "video-C", videoId: "source-C" }]
});
assert(items.map((item) => item.status).join(",") === "already_in_project,append_ready,target_push_required", "item_classification_invalid");
const blocked = buildProjectVideoAppendPlan({ advertiserId: request.advertiser_id, projectId: request.project_id, items });
assert(blocked.status === "blocked", "target_push_must_block_append");
const opaqueVideoId = "v02033g11111d03jhjnog65p1u6b6mr0";
const push = buildProjectVideoMaterialPushPlan({ advertiserId: request.advertiser_id, materialAccountId: "2234567890123456", projectId: request.project_id, items: items.map((item) => item.status === "target_push_required" ? { ...item, sourceVideoId: opaqueVideoId } : item) });
assert(push.status === "ready" && push.batches.length === 1 && push.batches[0].itemCount === 1, "target_push_plan_not_ready");
assert(push.batches[0].sourceVideoIds[0] === opaqueVideoId, "target_push_plan_lost_opaque_video_id");
const pushReadbacks = [];
const pushActionFinishes = [];
let pushWire = "";
const pushResult = await executeProjectVideoMaterialPushOnce({
  repo: {
    async claimPlannedExecutionAction() { return { claimed: true }; },
    async finishPlannedExecutionAction(input) { pushActionFinishes.push(input); },
    async upsertReadbackRecord(input) { pushReadbacks.push(input); }
  },
  bundle: {
    job: { job_id: "JOB-PUSH-READBACK", advertiser_id: request.advertiser_id },
    case: { target_project_id: request.project_id },
    executionPlan: {
      plan_id: "PLAN-PUSH-READBACK", plan_hash: "sha256:push-readback", plan_status: "executing",
      metadata: {
        material_account_id: "2234567890123456",
        project_id: request.project_id,
        push_batches: [{ batch_index: 1, origin_resource_ids: ["video-C"], source_video_ids: [opaqueVideoId] }]
      }
    }
  },
  confirmationId: "CONFIRM-PUSH-READBACK",
  allowNetworkWrite: true,
  credentialSummary: { status: "valid", blockers: [] },
  credentialEnv: { OCEANENGINE_ACCESS_TOKEN: "test-token" },
  readonlyClient: {
    async get() {
      return { status: "passed", responseHash: "sha256:push-readback", summary: { totalPage: 1, items: [{ filename: "video-C.mp4", video_id: opaqueVideoId }] } };
    }
  },
  fetchImpl: async (_url, options) => {
    pushWire = options.body;
    return new Response(JSON.stringify({ code: 0 }), { status: 200 });
  }
});
assert(pushResult.status === "readback_verified" && pushResult.writeCalled === true, "material_push_readback_not_verified");
assert(JSON.parse(pushWire).video_ids[0] === opaqueVideoId, "material_push_request_lost_opaque_video_id");
assert(pushActionFinishes.length === 1 && pushActionFinishes[0].actionStatus === "succeeded", "material_push_action_not_recorded");
assert(pushReadbacks.length === 1 && pushReadbacks[0].readbackStatus === "readback_verified" && pushReadbacks[0].fieldDiffSummary.unresolved_count === 0, "material_push_verified_readback_not_recorded");
const unconfirmedPushReadbacks = [];
const unconfirmedPush = await executeProjectVideoMaterialPushOnce({
  repo: {
    async claimPlannedExecutionAction() { return { claimed: true }; },
    async finishPlannedExecutionAction() {},
    async upsertReadbackRecord(input) { unconfirmedPushReadbacks.push(input); }
  },
  bundle: {
    job: { job_id: "JOB-PUSH-UNCONFIRMED", advertiser_id: request.advertiser_id },
    case: { target_project_id: request.project_id },
    executionPlan: {
      plan_id: "PLAN-PUSH-UNCONFIRMED", plan_hash: "sha256:push-unconfirmed", plan_status: "executing",
      metadata: { material_account_id: "2234567890123456", project_id: request.project_id, push_batches: [{ batch_index: 1, origin_resource_ids: ["video-C"], source_video_ids: [opaqueVideoId] }] }
    }
  },
  confirmationId: "CONFIRM-PUSH-UNCONFIRMED",
  allowNetworkWrite: true,
  credentialSummary: { status: "valid", blockers: [] },
  credentialEnv: { OCEANENGINE_ACCESS_TOKEN: "test-token" },
  readonlyClient: { async get() { return { status: "passed", responseHash: "sha256:push-unconfirmed", summary: { totalPage: 1, items: [] } }; } },
  fetchImpl: async () => new Response(JSON.stringify({ code: 0 }), { status: 200 })
});
assert(unconfirmedPush.status === "failed_or_unconfirmed" && unconfirmedPushReadbacks[0]?.readbackStatus === "not_found_or_mismatch", "material_push_unconfirmed_readback_not_recorded");
const opaqueVideoTransport = videoMaterialBatchBindTransportPayload({ sourceAdvertiserId: "2234567890123456", targetAdvertiserId: request.advertiser_id, videoIds: [opaqueVideoId] });
assert(typeof opaqueVideoTransport.video_ids[0] === "string" && opaqueVideoTransport.video_ids[0] === opaqueVideoId, "target_push_transport_must_keep_opaque_video_id_string");
const caseVariant = opaqueVideoId.replace("v020", "V020");
assert(videoMaterialBatchBindTransportPayload({ sourceAdvertiserId: "2234567890123456", targetAdvertiserId: request.advertiser_id, videoIds: [opaqueVideoId, caseVariant] }).video_ids.length === 2, "video_id_case_must_remain_distinct");
const invalidPush = buildProjectVideoMaterialPushPlan({ advertiserId: request.advertiser_id, materialAccountId: "2234567890123456", projectId: request.project_id, items: [{ originResourceId: "invalid-video", sourceVideoId: "", status: "target_push_required" }] });
assert(invalidPush.status === "blocked" && invalidPush.blockerCodes[0] === "source_video_id_invalid_for_material_push", "invalid_push_must_keep_actual_blocker");
assert(invalidPush.actionType === "oc_project_video_material_push", "blocked_push_must_keep_its_plan_kind");
const appendSnapshot = await readProjectVideoIds({
  advertiserId: request.advertiser_id,
  projectId: request.project_id,
  client: { async get() { return { status: "passed", responseHash: "sha256:before", summary: { projectIdPresent: true, totalPage: 1, videoIds: [] } }; } }
});
const appendWireContract = buildProjectVideoAppendWireBody({
  advertiserId: request.advertiser_id,
  projectId: request.project_id,
  appendItems: [{ origin_resource_id: "opaque-code", video_id: opaqueVideoId }]
});
assert(appendWireContract.status === "passed", "append_wire_body_not_built");
assert(appendWireContract.body.includes(`\"advertiser_id\":${request.advertiser_id}`), "append_advertiser_id_must_be_lossless_json_integer");
assert(appendWireContract.body.includes(`\"project_id\":${request.project_id}`), "append_project_id_must_be_lossless_json_integer");
assert(appendWireContract.body.includes(`\"video_id\":\"${opaqueVideoId}\"`), "append_video_id_must_remain_json_string");
let appendInventoryReads = 0;
let appendWire = "";
const appendActionFinishes = [];
const appendResult = await executeProjectVideoAppendOnce({
  repo: {
    async claimPlannedExecutionAction() { return { claimed: true }; },
    async finishPlannedExecutionAction(input) { appendActionFinishes.push(input); },
    async upsertReadbackRecord() {}
  },
  bundle: {
    job: { job_id: "JOB-OPAQUE-VIDEO", advertiser_id: request.advertiser_id },
    case: { target_project_id: request.project_id },
    executionPlan: {
      plan_id: "PLAN-OPAQUE-VIDEO", plan_hash: "sha256:opaque", plan_status: "executing",
      planned_actions: [{ action_type: "oc_project_video_append", idempotency_key: "append:opaque" }],
      metadata: { project_id: request.project_id, project_snapshot_hash: appendSnapshot.snapshotHash, append_items: [{ origin_resource_id: "opaque-code", video_id: opaqueVideoId }] }
    }
  },
  confirmationId: "CONFIRM-OPAQUE-VIDEO",
  allowNetworkWrite: true,
  credentialSummary: { status: "valid", blockers: [] },
  credentialEnv: { OCEANENGINE_ACCESS_TOKEN: "test-token" },
  readonlyClient: { async get() {
    appendInventoryReads += 1;
    return { status: "passed", responseHash: appendInventoryReads === 1 ? "sha256:before" : "sha256:after", summary: { projectIdPresent: true, totalPage: 1, videoIds: appendInventoryReads === 1 ? [] : [opaqueVideoId] } };
  } },
  fetchImpl: async (_url, options) => {
    appendWire = options.body;
    return new Response(JSON.stringify({ code: 0 }), { status: 200 });
  }
});
assert(appendResult.status === "readback_verified" && appendResult.appendCalled === true, "opaque_video_append_not_verified");
assert(JSON.parse(appendWire).video_material_list[0].video_id === opaqueVideoId, "append_request_lost_opaque_video_id");
assert(appendWire.includes(`\"advertiser_id\":${request.advertiser_id}`) && appendWire.includes(`\"project_id\":${request.project_id}`), "append_execution_must_send_lossless_integer_ids");
assert(appendActionFinishes[0]?.httpStatus === 200 && appendActionFinishes[0]?.apiCode === "0" && appendActionFinishes[0]?.requestHash === appendWireContract.requestHash, "append_action_audit_must_record_wire_result");
const push51 = buildProjectVideoMaterialPushPlan({
  advertiserId: request.advertiser_id, materialAccountId: "2234567890123456", projectId: request.project_id,
  items: Array.from({ length: 51 }, (_, index) => ({ originResourceId: `origin-${index}`, sourceVideoId: String(3000000000000000 + index), status: "target_push_required" }))
});
assert(push51.status === "ready" && push51.batches.length === 2 && push51.batches[0].itemCount === 50 && push51.batches[1].itemCount === 1, "target_push_batches_invalid");
const ready = buildProjectVideoAppendPlan({ advertiserId: request.advertiser_id, projectId: request.project_id, items: items.slice(0, 2), projectSnapshotHash: "sha256:snapshot" });
assert(ready.status === "ready" && ready.itemCount === 1 && ready.alreadyPresentCount === 1, "append_plan_invalid");
assert(validateProjectVideoAppendReadback({ plannedOriginResourceIds: ready.originResourceIds, foundVideoIds: ["target-B"], itemMap: items }).status === "passed", "append_readback_invalid");
const projectMaterialRequests = [];
const projectVideoRead = await readProjectVideoIds({
  advertiserId: request.advertiser_id,
  projectId: request.project_id,
  client: {
    async get(query) {
      projectMaterialRequests.push(query);
      const page = Number(query.query.page);
      return {
        status: "passed",
        responseHash: `sha256:project-${page}`,
        summary: {
          projectIdPresent: true,
          totalPage: 2,
          videoIds: page === 1 ? ["target-A"] : ["target-B"]
        }
      };
    }
  }
});
assert(projectVideoRead.status === "passed" && projectVideoRead.videoIds.join(",") === "target-A,target-B", "project_material_pagination_invalid");
assert(projectMaterialRequests.length === 2 && projectMaterialRequests.every((item) => item.query.filtering?.material_type === "VIDEO"), "project_material_filtering_contract_invalid");
assert(projectMaterialRequests.every((item) => !Object.hasOwn(item.query, "material_type")), "project_material_filtering_must_not_be_flat");
const failedProjectRead = await readProjectVideoIds({
  advertiserId: request.advertiser_id,
  projectId: request.project_id,
  client: { async get() { return { status: "blocked", responseHash: "sha256:blocked", summary: {} }; } }
});
assert(failedProjectRead.status === "blocked" && failedProjectRead.blocker === "project_material_readonly_failed", "project_material_failure_not_classified");
const inventory = await scanOceanEngineVideoInventory({
  advertiserId: request.advertiser_id,
  originResourceIds: ["video-zero", "video-unique", "video-ambiguous"],
  client: {
    async get() {
      return {
        status: "passed",
        responseHash: "sha256:inventory",
        summary: {
          totalPage: 1,
          items: [
            { filename: "video-unique.mp4", video_id: "target-unique" },
            { filename: "video-ambiguous-a.mp4", video_id: "target-ambiguous-a" },
            { filename: "video-ambiguous-b.mp4", video_id: "target-ambiguous-b" }
          ]
        }
      };
    }
  }
});
assert(inventory.status === "blocked" && inventory.blocker === "video_origin_mapping_ambiguous", "video_inventory_ambiguity_not_blocked");
assert(inventory.items.map((item) => item.candidateCount).join(",") === "0,1,2", "video_inventory_candidate_counts_invalid");
assert(exactMaterialCodePattern("4iLE-2")?.flags === "", "material_code_pattern_must_be_case_sensitive");
assert(filenameMatchesMaterialCode("4iLE-2.mp4", "4iLE-2"), "exact_case_material_code_not_matched");
assert(!filenameMatchesMaterialCode("4ile-2.mp4", "4iLE-2"), "lowercase_material_code_must_not_match");
assert(!filenameMatchesMaterialCode("4iLE-20.mp4", "4iLE-2"), "material_code_prefix_must_not_match");
const exactCaseInventory = await scanOceanEngineVideoInventory({
  advertiserId: request.advertiser_id,
  originResourceIds: ["4iLE-2"],
  client: {
    async get() {
      return {
        status: "passed",
        responseHash: "sha256:exact-case",
        summary: {
          totalPage: 1,
          items: [
            { filename: "4iLE-2.mp4", video_id: "exact-uppercase" },
            { filename: "4ile-2.mp4", video_id: "lowercase-variant" },
            { filename: "4iLE-20.mp4", video_id: "prefix-variant" }
          ]
        }
      };
    }
  }
});
assert(exactCaseInventory.status === "passed" && exactCaseInventory.items[0].videoId === "exact-uppercase" && exactCaseInventory.items[0].candidateCount === 1, "append_inventory_must_match_exact_case_only");
const duplicateExactCaseInventory = await scanOceanEngineVideoInventory({
  advertiserId: request.advertiser_id,
  originResourceIds: ["4iLE-2"],
  client: {
    async get() {
      return {
        status: "passed",
        responseHash: "sha256:duplicate-exact-case",
        summary: {
          totalPage: 1,
          items: [
            { filename: "first_4iLE-2.mp4", video_id: "exact-one" },
            { filename: "second_4iLE-2.mp4", video_id: "exact-two" }
          ]
        }
      };
    }
  }
});
assert(duplicateExactCaseInventory.status === "blocked" && duplicateExactCaseInventory.items[0].candidateCount === 2, "same_case_duplicate_must_remain_blocked");
const caseDistinctRequest = validateLaunchRequest({ ...request, origin_resource_ids: ["4iLE-2", "4ile-2"] });
assert(caseDistinctRequest.origin_resource_ids.length === 2, "case_distinct_material_codes_must_not_be_deduplicated");
assert(
  launchRequestFingerprint({ ...request, origin_resource_ids: ["4iLE-2"] }) !== launchRequestFingerprint({ ...request, origin_resource_ids: ["4ile-2"] }),
  "case_distinct_material_codes_must_have_distinct_fingerprints"
);
const genericMappings = [];
const genericExactCase = await reconcileQiankunMaterialSourceVideoInventory({
  repo: {
    async updateAccountResourceQiankunVideoMapping() { throw new Error("generic_exact_case_must_not_block"); },
    async upsertAccountResourceReadonlyBySourceAsset(input) { genericMappings.push(input); }
  },
  routeId: "oceanengine_3_byte_mini_game",
  gameCode: "JSZC",
  materialAccountId: "2234567890123456",
  videos: [{ sourceAssetId: "SOURCE-4iLE-2", originResourceId: "4iLE-2" }],
  client: {
    async get() {
      return {
        status: "passed",
        responseHash: "sha256:generic-exact-case",
        summary: {
          totalPage: 1,
          totalNumber: 3,
          items: [
            { filename: "4iLE-2.mp4", id: "generic-uppercase" },
            { filename: "4ile-2.mp4", id: "generic-lowercase" },
            { filename: "4iLE-20.mp4", id: "generic-prefix" }
          ]
        }
      };
    }
  }
});
assert(genericExactCase.status === "passed" && genericMappings.length === 1 && genericMappings[0].platformResourceId === "generic-uppercase", "generic_inventory_must_match_exact_case_only");
const hundred = Array.from({ length: 100 }, (_, index) => `resource-${index}`);
assert(validateLaunchRequest({ ...request, origin_resource_ids: hundred }).origin_resource_ids.length === 100, "hundred_ids_rejected");
for (const size of [1, 50, 51]) {
  const ids = hundred.slice(0, size);
  const normalized = validateLaunchRequest({ ...request, origin_resource_ids: ids });
  assert(normalized.origin_resource_ids.length === size, `append_${size}_items_rejected`);
}
let duplicate = false;
try { validateLaunchRequest({ ...request, origin_resource_ids: ["video-A", "video-A"] }); } catch (error) { duplicate = error.code === "launch_request_duplicate_origin_resource_id"; }
const recommendation = await recommendProjectVideoAppendProjects({
  advertiserId: request.advertiser_id,
  client: { async get({ query }) { return { status: "passed", summary: { totalPage: 2, items: Number(query.page) === 1 ? [
    { project_id: "2000000000000001", name: "项目一", create_time: "2026-09-14T09:00:00Z", status: "ENABLE" }
  ] : [{ project_id: "2000000000000002", name: "项目二", create_time: "2026-09-14T10:00:00Z", status: "ENABLE" }] } }; } }
});
assert(recommendation.status === "passed" && recommendation.latest === true && recommendation.items[0].projectId === "2000000000000002", "project_recommendation_not_sorted_or_lossless");
assert(duplicate, "duplicate_ids_not_reported");
let overLimit = false;
try { validateLaunchRequest({ ...request, origin_resource_ids: [...hundred, "resource-100"] }); } catch (error) { overLimit = error.code === "launch_request_origin_resource_ids_exceed_limit"; }
assert(overLimit, "over_limit_not_rejected");
const repository = new PostgresRepository();
const testScope = {
  routeId: "oceanengine_3_byte_mini_game",
  gameCode: "JSZC",
  advertiserId: "9000000000000001"
};
async function createPushClosureFixture(suffix) {
  const caseId = `CASE-TEST-PUSH-CLOSURE-${suffix}`;
  const jobId = `JOB-TEST-PUSH-CLOSURE-${suffix}`;
  const planId = `PLAN-TEST-PUSH-CLOSURE-${suffix}`;
  const planHash = `sha256:${suffix === "VERIFIED" ? "a".repeat(64) : "b".repeat(64)}`;
  await repository.createWorkflowCase({
    caseId,
    caseKey: `test-push-closure-${suffix.toLowerCase()}`,
    ...testScope,
    sourceUsage: "test_run",
    operation: "append_project_videos",
    targetProjectId: "9000000000000002",
    originResourceIds: ["video-C"]
  });
  await repository.createLaunchJob({
    jobId,
    caseId,
    ...testScope,
    objectType: "std_project",
    sourceUsage: "test_run",
    sourceRecordRef: `test:push-closure:${suffix}`
  });
  await repository.upsertLaunchExecutionPlan({
    planId,
    jobId,
    planVersion: 1,
    planKind: "project_video_material_push",
    planStatus: "ready",
    planHash,
    plannedActions: [{ action_type: "oc_project_video_material_push", status: "ready", maximum_platform_calls: 1 }],
    blockerCodes: [],
    sourceUsage: "test_run",
    metadata: { plan_kind: "project_video_material_push", execution_scope: { binding_mode: "single_confirmation_plan" } }
  });
  const confirmationId = `CONFIRM-TEST-PUSH-CLOSURE-${suffix}`;
  const confirmation = await repository.claimLaunchExecutionPlanConfirmation({
    confirmationId,
    jobId,
    draftId: "",
    objectType: "oc_project_video_material_push",
    objectName: "project_video_material_push",
    payloadHash: "",
    confirmationStatus: "confirmed_for_execution_plan",
    confirmVariable: "TEST=CONFIRM",
    confirmedBy: "test",
    planId,
    metadata: { plan_kind: "project_video_material_push", plan_hash: planHash }
  });
  assert(confirmation.claimed === true, `push_closure_confirmation_not_claimed:${suffix}`);
  await repository.upsertPlatformAction({
    actionId: `ACTION-TEST-PUSH-CLOSURE-${suffix}`,
    jobId,
    confirmationId,
    planId,
    actionType: "oc_project_video_material_push",
    endpoint: "test:material/bind",
    method: "POST",
    actionStatus: "succeeded",
    attemptNo: 1,
    idempotencyKey: `test-push-closure:${suffix}`
  });
  return { jobId, planId };
}
const verifiedClosure = await createPushClosureFixture("VERIFIED");
await repository.upsertReadbackRecord({
  readbackId: `READBACK-${verifiedClosure.jobId}-PROJECT-VIDEO-MATERIAL-PUSH`,
  jobId: verifiedClosure.jobId,
  objectType: "oc_project_video_material_push",
  objectId: testScope.advertiserId,
  objectName: "project_video_material_push",
  readbackStatus: "readback_verified",
  fieldDiffSummary: { requested_count: 1, verified_count: 1, unresolved_count: 0, blocker: "" },
  evidenceRef: `EV-${verifiedClosure.jobId}-PUSH-READBACK`
});
const verifiedFinalization = await repository.finalizeConfirmedProjectVideoMaterialPushPlan(verifiedClosure);
assert(verifiedFinalization.consumed === true && verifiedFinalization.readbackVerified === true, "verified_push_finalization_must_require_readback");
assert((await repository.getLaunchJobBundle(verifiedClosure.jobId))?.job?.job_status === "running", "verified_push_must_keep_job_ready_for_followup_readonly");
assert((await repository.getWorkflowCaseSummary(`CASE-TEST-PUSH-CLOSURE-VERIFIED`))?.current_gate === "run_fresh_readiness", "verified_push_must_resume_followup_readonly_gate");
const unresolvedClosure = await createPushClosureFixture("UNCONFIRMED");
const unresolvedFinalization = await repository.finalizeConfirmedProjectVideoMaterialPushPlan(unresolvedClosure);
const unresolvedBundle = await repository.getLaunchJobBundle(unresolvedClosure.jobId);
assert(unresolvedFinalization.consumed === true && unresolvedFinalization.readbackVerified === false, "unconfirmed_push_must_not_be_marked_readback_verified");
assert(unresolvedBundle?.job?.job_status === "blocked", "unconfirmed_push_must_stop_for_readonly_recovery");
assert(unresolvedBundle?.executionPlan?.metadata?.root_blocker_codes?.[0] === "project_video_material_push_readback_unresolved", "unconfirmed_push_must_keep_real_blocker");
const unresolvedSummary = await repository.getWorkflowCaseSummary("CASE-TEST-PUSH-CLOSURE-UNCONFIRMED");
assert(unresolvedSummary?.current_gate === "resolve_case_blocker" && unresolvedSummary.root_blocker_codes?.[0] === "project_video_material_push_readback_unresolved", "unconfirmed_push_summary_must_project_real_blocker");
const appendReadbackCaseId = "CASE-TEST-APPEND-READBACK";
const appendReadbackJobId = "JOB-TEST-APPEND-READBACK";
const appendReadbackPlanId = "PLAN-TEST-APPEND-READBACK";
await repository.createWorkflowCase({
  caseId: appendReadbackCaseId,
  caseKey: "test-append-readback",
  ...testScope,
  sourceUsage: "test_run",
  operation: "append_project_videos",
  targetProjectId: "9000000000000002",
  originResourceIds: ["video-C"]
});
await repository.createLaunchJob({
  jobId: appendReadbackJobId,
  caseId: appendReadbackCaseId,
  ...testScope,
  objectType: "std_project",
  sourceUsage: "test_run",
  sourceRecordRef: "test:append-readback"
});
await repository.upsertLaunchExecutionPlan({
  planId: appendReadbackPlanId,
  jobId: appendReadbackJobId,
  planVersion: 1,
  planKind: "project_video_append",
  planStatus: "consumed",
  planHash: `sha256:${"c".repeat(64)}`,
  plannedActions: [{ action_type: "oc_project_video_append", status: "consumed", maximum_platform_calls: 1 }],
  blockerCodes: ["project_video_append_readback_pending"],
  sourceUsage: "test_run",
  metadata: {
    plan_kind: "project_video_append",
    append_items: [{ origin_resource_id: "video-C", video_id: opaqueVideoId }],
    root_blocker_codes: ["project_video_append_readback_pending"],
    execution_scope: { binding_mode: "single_confirmation_plan" }
  }
});
const appendReadbackFinalization = await repository.finalizeProjectVideoAppendReadback({
  jobId: appendReadbackJobId,
  planId: appendReadbackPlanId,
  verified: false,
  blocker: "project_video_append_readback_pending"
});
assert(appendReadbackFinalization.jobFinalized === true && appendReadbackFinalization.verified === false, "append_readback_must_finalize_unverified_job_without_replay");
const appendReadbackSummary = await repository.getWorkflowCaseSummary(appendReadbackCaseId);
assert(appendReadbackSummary?.current_gate === "run_project_video_append_readback" && appendReadbackSummary.root_blocker_codes?.[0] === "project_video_append_readback_pending", "append_readback_gate_must_remain_readonly");
console.log(JSON.stringify({ status: "passed", appendItems: 100, realPlatformWrites: 0 }));
