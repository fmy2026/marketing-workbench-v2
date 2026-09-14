import { createHash } from "node:crypto";
import { createOceanEngineReadonlyClient } from "./oceanengineReadonlyClient.mjs";
import { createQiankunMonitorClient } from "./qiankunMonitorClient.mjs";
import { credentialReady, getOceanEngineCredentialSummary, readOceanEngineEnv } from "./oceanengineCredentialStore.mjs";
import { fetchWithDeadline, PLATFORM_JSON_TIMEOUT_MS } from "./httpDeadline.mjs";
import { filenameMatchesMaterialCode } from "./materialCodeMatcher.mjs";
import { videoMaterialBatchBindTransportPayload } from "./oceanengineVideoMaterialExecutor.mjs";

export const PROJECT_VIDEO_APPEND_ENDPOINT = "/open_api/v3.0/oc_project/material/create/";
export const PROJECT_VIDEO_APPEND_ACTION = "oc_project_video_append";
export const PROJECT_VIDEO_MATERIAL_PUSH_ACTION = "oc_project_video_material_push";
export const PROJECT_VIDEO_MATERIAL_PUSH_ENDPOINT = "/open_api/2/file/material/bind/";
export const PROJECT_VIDEO_APPEND_MAX_ITEMS = 100;
export const PROJECT_VIDEO_MATERIAL_PUSH_BATCH_SIZE = 50;

function clean(value) { return String(value ?? "").trim(); }
function hash(value) { return `sha256:${createHash("sha256").update(String(value)).digest("hex")}`; }
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function longId(name, value) {
  const id = clean(value);
  if (!/^\d{8,24}$/.test(id)) throw new Error(`invalid_${name}`);
  return id;
}

// OceanEngine video_id is an opaque string (commonly letters and numbers),
// unlike advertiser_id and project_id. Preserve its source value end to end.
function requiredVideoId(name, value) {
  if (typeof value !== "string") throw new Error(`invalid_${name}`);
  const id = value.trim();
  if (!id) throw new Error(`invalid_${name}`);
  return id;
}

function videoItems(payload = {}) {
  return Array.isArray(payload?.data?.list) ? payload.data.list : [];
}

function videoId(item = {}) { return clean(item.video_id || item.videoId || item.id); }

function projectSnapshotHash(videoIds = []) {
  return hash(canonical([...new Set(videoIds.map(clean).filter(Boolean))].sort()));
}

function appendPayload({ advertiserId, projectId, appendItems = [] } = {}) {
  const advertiser_id = longId("advertiser_id", advertiserId);
  const project_id = longId("project_id", projectId);
  const video_material_list = appendItems.map((item) => ({
    image_mode: "CREATIVE_IMAGE_MODE_VIDEO_VERTICAL",
    video_id: requiredVideoId("video_id", item.video_id || item.videoId)
  }));
  if (!video_material_list.length || video_material_list.length > PROJECT_VIDEO_APPEND_MAX_ITEMS) throw new Error("invalid_project_video_append_items");
  return { advertiser_id, project_id, video_material_list };
}

export async function scanOceanEngineVideoInventory({ client = createOceanEngineReadonlyClient(), advertiserId, originResourceIds = [] } = {}) {
  const account = longId("advertiser_id", advertiserId);
  const originIds = [...new Set(originResourceIds.map(clean).filter(Boolean))];
  const wanted = new Map(originIds.map((originResourceId) => [originResourceId, []]));
  const findMatches = (items = []) => {
    items.forEach((item) => {
      const filename = clean(item.filename || item.name || item.title);
      const id = videoId(item);
      originIds.forEach((originResourceId) => {
        if (id && filenameMatchesMaterialCode(filename, originResourceId)) wanted.get(originResourceId).push(id);
      });
    });
  };
  const fetchPage = (page) => client.get({
    label: `project_video_append_inventory_${page}`,
    endpoint: "file/video/get",
    query: { advertiser_id: account, page: String(page), page_size: "100" },
    requestFieldManifest: ["advertiser_id", "page", "page_size"],
    summarize: (payload) => ({
      items: videoItems(payload),
      totalPage: Number(payload?.data?.page_info?.total_page || 0)
    })
  });
  const first = await fetchPage(1);
  const totalPage = Number(first.summary?.totalPage || 0);
  if (first.status !== "passed" || !Number.isInteger(totalPage) || totalPage < 1 || totalPage > 100) {
    return { status: "blocked", blocker: "video_inventory_page_bound_invalid", items: [], responseHash: first.responseHash || "" };
  }
  findMatches(first.summary?.items || []);
  const hashes = [first.responseHash || ""];
  for (let page = 2; page <= totalPage; page += 1) {
    const result = await fetchPage(page);
    if (result.status !== "passed") return { status: "blocked", blocker: "video_inventory_page_failed", items: [], responseHash: hash(hashes) };
    findMatches(result.summary?.items || []);
    hashes.push(result.responseHash || "");
  }
  const items = originIds.map((originResourceId) => {
    const candidates = [...new Set(wanted.get(originResourceId) || [])];
    return { originResourceId, videoId: candidates.length === 1 ? candidates[0] : "", candidateCount: candidates.length };
  });
  return {
    status: items.every((item) => item.candidateCount <= 1) ? "passed" : "blocked",
    blocker: items.some((item) => item.candidateCount > 1) ? "video_origin_mapping_ambiguous" : "",
    items,
    responseHash: hash(hashes)
  };
}

export async function readProjectVideoIds({ client = createOceanEngineReadonlyClient(), advertiserId, projectId } = {}) {
  const advertiser = longId("advertiser_id", advertiserId);
  const project = longId("project_id", projectId);
  const fetchPage = (page) => client.get({
    label: `project_video_append_project_material_readonly_${page}`,
    endpoint: "/open_api/v3.0/oc_project/material/get/",
    query: {
      advertiser_id: advertiser,
      project_id: project,
      filtering: { material_type: "VIDEO" },
      page: String(page),
      page_size: "100"
    },
    requestFieldManifest: ["advertiser_id", "project_id", "filtering.material_type", "page", "page_size"],
    summarize: (payload) => ({
      videoIds: (payload?.data?.video_material_list || []).map(videoId).filter(Boolean),
      totalPage: Number(payload?.data?.page_info?.total_page || 1),
      projectIdPresent: Boolean(clean(payload?.data?.project_id || project))
    })
  });
  const first = await fetchPage(1);
  const pages = Number(first.summary?.totalPage || 0);
  if (first.status !== "passed" || !Number.isInteger(pages) || pages < 1 || pages > 100 || !first.summary?.projectIdPresent) {
    return { status: "blocked", videoIds: [], blocker: "project_material_readonly_failed", responseHash: first.responseHash || "" };
  }
  const ids = [...(first.summary?.videoIds || [])];
  const responseHashes = [first.responseHash || ""];
  for (let page = 2; page <= pages; page += 1) {
    const response = await fetchPage(page);
    if (response.status !== "passed") return { status: "blocked", videoIds: [], blocker: "project_material_readonly_failed", responseHash: hash(canonical(responseHashes)) };
    ids.push(...(response.summary?.videoIds || []));
    responseHashes.push(response.responseHash || "");
  }
  const videoIds = [...new Set(ids)].sort();
  return { status: "passed", videoIds, responseHash: hash(canonical(responseHashes)), snapshotHash: projectSnapshotHash(videoIds) };
}

export async function prepareProjectVideoAppendReadonly({
  advertiserId,
  projectId,
  originResourceIds = [],
  materialAccountId,
  ownerKey,
  oceanEngineClient = createOceanEngineReadonlyClient(),
  qiankunClient = createQiankunMonitorClient()
} = {}) {
  const ids = [...new Set(originResourceIds.map(clean).filter(Boolean))];
  if (!ids.length || ids.length > PROJECT_VIDEO_APPEND_MAX_ITEMS) throw new Error("invalid_project_video_append_items");
  const qiankun = await qiankunClient.queryResourceIndex({ ownerKey, originResourceIds: ids, pageNo: 1, pageSize: 100 });
  const qiankunItems = qiankun?.summary?.list || [];
  const found = new Set(qiankunItems.map((item) => clean(item.originResourceId)).filter(Boolean));
  const missing = ids.filter((id) => !found.has(id));
  if (qiankun?.status !== "passed" || missing.length) {
    return { status: "blocked", blockerCodes: [qiankun?.status !== "passed" ? "qiankun_video_lookup_failed" : "qiankun_video_not_found"], items: [], missingOriginResourceIds: missing };
  }
  const [source, target, project] = await Promise.all([
    scanOceanEngineVideoInventory({ client: oceanEngineClient, advertiserId: materialAccountId, originResourceIds: ids }),
    scanOceanEngineVideoInventory({ client: oceanEngineClient, advertiserId, originResourceIds: ids }),
    readProjectVideoIds({ client: oceanEngineClient, advertiserId, projectId })
  ]);
  const readonlyChecks = {
    source_inventory: {
      status: source.status,
      blocker: source.blocker || "",
      items: (source.items || []).map((item) => ({ originResourceId: item.originResourceId, candidateCount: Number(item.candidateCount || 0) })),
      responseHash: source.responseHash || ""
    },
    target_inventory: {
      status: target.status,
      blocker: target.blocker || "",
      items: (target.items || []).map((item) => ({ originResourceId: item.originResourceId, candidateCount: Number(item.candidateCount || 0) })),
      responseHash: target.responseHash || ""
    },
    project_materials: {
      status: project.status,
      blocker: project.blocker || "",
      itemCount: (project.videoIds || []).length,
      responseHash: project.responseHash || ""
    }
  };
  if (source.status !== "passed" || target.status !== "passed" || project.status !== "passed") {
    return {
      status: "blocked",
      blockerCodes: [source.blocker, target.blocker, project.blocker].filter(Boolean),
      items: [],
      readonlyChecks
    };
  }
  const items = classifyProjectVideoAppendItems({
    originResourceIds: ids,
    projectVideoIds: project.videoIds,
    sourceVideos: source.items,
    targetVideos: target.items
  });
  const plan = buildProjectVideoAppendPlan({
    advertiserId,
    projectId,
    items,
    projectSnapshotHash: project.snapshotHash
  });
  const pushPlan = buildProjectVideoMaterialPushPlan({
    advertiserId,
    materialAccountId,
    projectId,
    items
  });
  // A required target push owns the next Plan even if its construction is
  // blocked.  Falling back to the append Plan hides the actual push reason.
  const effectivePlan = items.some((item) => item.status === "target_push_required") ? pushPlan : plan;
  return {
    status: effectivePlan.status,
    items,
    plan,
    pushPlan,
    effectivePlan,
    projectVideoIds: project.videoIds,
    qiankunVerifiedCount: found.size,
    readonlyChecks
  };
}

export async function executeProjectVideoAppendOnce({
  repo,
  bundle,
  confirmationId,
  fetchImpl = globalThis.fetch,
  credentialSummary = getOceanEngineCredentialSummary(),
  credentialEnv = readOceanEngineEnv().env,
  readonlyClient = createOceanEngineReadonlyClient({ fetchImpl }),
  allowNetworkWrite = false
} = {}) {
  const plan = bundle?.executionPlan || {};
  const metadata = plan.metadata || {};
  const appendItems = Array.isArray(metadata.append_items) ? metadata.append_items : [];
  const action = (plan.planned_actions || []).find((item) => item.action_type === PROJECT_VIDEO_APPEND_ACTION) || {};
  const projectId = clean(metadata.project_id || bundle?.case?.target_project_id);
  const advertiserId = clean(bundle?.job?.advertiser_id);
  const blockers = [
    ...(allowNetworkWrite ? [] : ["network_write_not_enabled_by_caller"]),
    ...(!credentialReady(credentialSummary) ? credentialSummary.blockers.map((item) => `credential:${item}`) : []),
    ...(plan.plan_status === "executing" ? [] : ["project_video_append_plan_not_executing"]),
    ...(action.action_type === PROJECT_VIDEO_APPEND_ACTION ? [] : ["project_video_append_action_missing"]),
    ...(appendItems.length >= 1 && appendItems.length <= PROJECT_VIDEO_APPEND_MAX_ITEMS ? [] : ["project_video_append_items_missing"])
  ];
  let before = null;
  if (!blockers.length) {
    before = await readProjectVideoIds({ client: readonlyClient, advertiserId, projectId });
    if (before.status !== "passed") blockers.push(before.blocker || "project_material_readonly_failed_before_append");
    if (before?.snapshotHash !== clean(metadata.project_snapshot_hash)) blockers.push("project_material_set_drifted_before_append");
  }
  const actionId = `ACTION-${bundle.job.job_id}-PROJECT-VIDEO-APPEND`;
  const idempotencyKey = clean(action.idempotency_key) || `append:${plan.plan_hash || ""}`;
  if (blockers.length) {
    return { status: "blocked_before_append", appendCalled: false, blockers, actionId, idempotencyKey };
  }
  const claim = await repo.claimPlannedExecutionAction({
    actionId, jobId: bundle.job.job_id, confirmationId, planId: plan.plan_id,
    actionType: PROJECT_VIDEO_APPEND_ACTION, idempotencyKey
  });
  if (!claim.claimed) return { status: "already_consumed", appendCalled: false, blockers: ["project_video_append_action_already_recorded"], actionId, idempotencyKey };
  const payload = appendPayload({ advertiserId, projectId, appendItems });
  const wire = JSON.stringify(payload);
  const requestHash = hash(canonical(payload));
  let responseHash = "";
  let httpStatus = null;
  let apiCode = "";
  let success = false;
  let errorCategory = "";
  try {
    const response = await fetchWithDeadline(fetchImpl, `https://api.oceanengine.com${PROJECT_VIDEO_APPEND_ENDPOINT}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "Access-Token": credentialEnv.OCEANENGINE_ACCESS_TOKEN },
      body: wire
    }, { timeoutMs: PLATFORM_JSON_TIMEOUT_MS });
    const text = await response.text();
    responseHash = hash(text);
    httpStatus = response.status;
    let parsed = {};
    try { parsed = JSON.parse(text); } catch { errorCategory = "platform_response_not_json"; }
    apiCode = clean(parsed.code ?? parsed.err_no ?? parsed.error_code);
    success = response.ok && apiCode === "0";
    if (!success && !errorCategory) errorCategory = "platform_rejected";
  } catch (error) {
    errorCategory = error?.name === "PlatformDeadlineError" ? "platform_timeout" : "platform_transport_failed";
  }
  // A rejected, timed-out, or malformed response is never retried. It still
  // gets one authoritative readback because the platform may have consumed it.
  const after = await readProjectVideoIds({ client: readonlyClient, advertiserId, projectId });
  const plannedVideoIds = appendItems.map((item) => clean(item.video_id || item.videoId));
  const readback = validateProjectVideoAppendReadback({ plannedOriginResourceIds: appendItems.map((item) => clean(item.origin_resource_id || item.originResourceId)), foundVideoIds: after.videoIds || [], itemMap: appendItems.map((item) => ({ originResourceId: item.origin_resource_id || item.originResourceId, videoId: item.video_id || item.videoId })) });
  const actionStatus = after.status === "passed" && readback.status === "passed" ? "succeeded" : "failed_or_unconfirmed";
  await repo.finishPlannedExecutionAction({ actionId, jobId: bundle.job.job_id, confirmationId, planId: plan.plan_id, actionType: PROJECT_VIDEO_APPEND_ACTION, idempotencyKey, actionStatus, metadata: { platform_write_called: true, platform_response_confirmed: success, error_category: success ? "" : (errorCategory || "platform_rejected"), readback_status: readback.status, verified_count: readback.verifiedCount, planned_video_count: plannedVideoIds.length, raw_payload_stored: false, raw_response_stored: false } });
  if (typeof repo.upsertReadbackRecord === "function") {
    await repo.upsertReadbackRecord({
      readbackId: `READBACK-${bundle.job.job_id}-PROJECT-VIDEO-APPEND`, jobId: bundle.job.job_id,
      objectType: "oc_project_video_append", objectId: projectId, objectName: "project_video_append",
      readbackStatus: actionStatus === "succeeded" ? "readback_verified" : "not_found_or_mismatch",
      fieldDiffSummary: { requested_count: plannedVideoIds.length, verified_count: readback.verifiedCount, unresolved_count: readback.unresolvedOriginResourceIds.length, raw_response_stored: false },
      evidenceRef: `EV-${bundle.job.job_id}-PROJECT-VIDEO-APPEND-READBACK`
    });
  }
  return { status: actionStatus === "succeeded" ? "readback_verified" : "failed_or_unconfirmed", appendCalled: true, actionId, idempotencyKey, requestHash, responseHash, httpStatus, apiCode, ...(success ? {} : { blockers: [errorCategory || "platform_rejected"] }), readback };
}

export function classifyProjectVideoAppendItems({ originResourceIds = [], projectVideoIds = [], targetVideos = [], sourceVideos = [] } = {}) {
  const project = new Set((projectVideoIds || []).map(clean));
  const targetByOrigin = new Map((targetVideos || []).map((item) => [clean(item.originResourceId), clean(item.videoId)]));
  const sourceByOrigin = new Map((sourceVideos || []).map((item) => [clean(item.originResourceId), clean(item.videoId)]));
  return [...new Set(originResourceIds.map(clean).filter(Boolean))].map((originResourceId) => {
    const targetVideoId = targetByOrigin.get(originResourceId) || "";
    const sourceVideoId = sourceByOrigin.get(originResourceId) || "";
    const videoId = targetVideoId || sourceVideoId;
    const status = targetVideoId && project.has(targetVideoId)
      ? "already_in_project"
      : targetVideoId ? "append_ready"
        : sourceVideoId ? "target_push_required"
          : "source_prepare_required";
    return { originResourceId, videoId, targetVideoId, sourceVideoId, status };
  });
}

export function buildProjectVideoAppendPlan({ advertiserId, projectId, items = [], projectSnapshotHash = "" } = {}) {
  const advertiser_id = longId("advertiser_id", advertiserId);
  const project_id = longId("project_id", projectId);
  const selected = (items || []).filter((item) => item?.status === "append_ready");
  const blockers = (items || []).filter((item) => ["target_push_required", "source_prepare_required"].includes(item?.status));
  if (selected.length > PROJECT_VIDEO_APPEND_MAX_ITEMS) throw new Error("project_video_append_items_exceed_limit");
  if (blockers.length) return { status: "blocked", blockerCodes: [...new Set(blockers.map((item) => item.status))], items: selected, blockedItems: blockers };
  if (!selected.length) return { status: "not_required", blockerCodes: [], items: [], alreadyPresentCount: (items || []).filter((item) => item?.status === "already_in_project").length };
  const video_material_list = selected.map((item) => ({ image_mode: "CREATIVE_IMAGE_MODE_VIDEO_VERTICAL", video_id: clean(item.videoId), video_hp_visibility: "HIDE_VIDEO_ON_HP" }));
  const payload = { advertiser_id, project_id, video_material_list };
  return {
    status: "ready",
    actionType: PROJECT_VIDEO_APPEND_ACTION,
    endpoint: PROJECT_VIDEO_APPEND_ENDPOINT,
    method: "POST",
    itemCount: selected.length,
    alreadyPresentCount: (items || []).filter((item) => item?.status === "already_in_project").length,
    originResourceIds: selected.map((item) => item.originResourceId),
    requestHash: hash(canonical(payload)),
    projectSnapshotHash: clean(projectSnapshotHash),
    requestFieldManifest: { fieldNames: ["advertiser_id", "project_id", "video_material_list"], maximumItems: PROJECT_VIDEO_APPEND_MAX_ITEMS, rawPayloadStored: false },
    rawPayloadStored: false,
    rawResponseStored: false
  };
}

// This plan is deliberately separate from the project-append plan.  The bind
// endpoint changes account material availability; after it succeeds we repeat
// readonly discovery and create a fresh append plan from that result.
export function buildProjectVideoMaterialPushPlan({ advertiserId, materialAccountId, projectId, items = [] } = {}) {
  const advertiser_id = longId("advertiser_id", advertiserId);
  const material_account_id = longId("material_account_id", materialAccountId);
  const project_id = longId("project_id", projectId);
  const selected = (items || []).filter((item) => item?.status === "target_push_required");
  if (!selected.length) return { status: "not_required", items: [] };
  if (selected.length > PROJECT_VIDEO_APPEND_MAX_ITEMS) throw new Error("project_video_material_push_items_exceed_limit");
  const invalid = selected.filter((item) => {
    try {
      requiredVideoId("source_video_id", item.sourceVideoId);
      return false;
    } catch {
      return true;
    }
  });
  if (invalid.length) return {
    status: "blocked",
    actionType: PROJECT_VIDEO_MATERIAL_PUSH_ACTION,
    blockerCodes: ["source_video_id_invalid_for_material_push"],
    items: selected
  };
  const batches = [];
  for (let index = 0; index < selected.length; index += PROJECT_VIDEO_MATERIAL_PUSH_BATCH_SIZE) {
    const batchItems = selected.slice(index, index + PROJECT_VIDEO_MATERIAL_PUSH_BATCH_SIZE);
    let payload;
    try {
      payload = videoMaterialBatchBindTransportPayload({
        sourceAdvertiserId: material_account_id,
        targetAdvertiserId: advertiser_id,
        videoIds: batchItems.map((item) => requiredVideoId("source_video_id", item.sourceVideoId))
      });
    } catch (error) {
      const reason = String(error?.message || "");
      const blocker = [
        "source_advertiser_id_outside_safe_integer_range",
        "target_advertiser_id_outside_safe_integer_range",
        "video_ids_required",
        "video_ids_exceed_official_batch_limit"
      ].includes(reason) ? reason : "material_push_transport_shape_invalid";
      return { status: "blocked", blockerCodes: [blocker], items: selected };
    }
    batches.push({
      batchIndex: batches.length + 1,
      originResourceIds: batchItems.map((item) => item.originResourceId),
      sourceVideoIds: batchItems.map((item) => item.sourceVideoId),
      requestHash: hash(canonical(payload)),
      itemCount: batchItems.length
    });
  }
  return {
    status: "ready", actionType: PROJECT_VIDEO_MATERIAL_PUSH_ACTION,
    endpoint: PROJECT_VIDEO_MATERIAL_PUSH_ENDPOINT, method: "POST",
    advertiserId: advertiser_id, materialAccountId: material_account_id, projectId: project_id,
    items: selected, batches,
    requestHash: hash(canonical(batches.map((batch) => batch.requestHash))),
    requestFieldManifest: { fieldNames: ["advertiser_id", "target_advertiser_ids", "video_ids"], maximumItemsPerBatch: PROJECT_VIDEO_MATERIAL_PUSH_BATCH_SIZE, maximumBatches: 2, rawPayloadStored: false },
    rawPayloadStored: false, rawResponseStored: false
  };
}

function materialPushPayload({ materialAccountId, advertiserId, sourceVideoIds = [] } = {}) {
  return videoMaterialBatchBindTransportPayload({
    sourceAdvertiserId: longId("material_account_id", materialAccountId),
    targetAdvertiserId: longId("advertiser_id", advertiserId),
    videoIds: sourceVideoIds.map(clean)
  });
}

export async function executeProjectVideoMaterialPushOnce({ repo, bundle, confirmationId, fetchImpl = globalThis.fetch, credentialSummary = getOceanEngineCredentialSummary(), credentialEnv = readOceanEngineEnv().env, readonlyClient = createOceanEngineReadonlyClient({ fetchImpl }), allowNetworkWrite = false } = {}) {
  const plan = bundle?.executionPlan || {};
  const metadata = plan.metadata || {};
  const batches = Array.isArray(metadata.push_batches) ? metadata.push_batches : [];
  const advertiserId = clean(bundle?.job?.advertiser_id);
  const materialAccountId = clean(metadata.material_account_id);
  const projectId = clean(metadata.project_id || bundle?.case?.target_project_id);
  const actionIdPrefix = `ACTION-${bundle?.job?.job_id || "UNKNOWN"}-PROJECT-VIDEO-PUSH`;
  const blockers = [
    ...(allowNetworkWrite ? [] : ["network_write_not_enabled_by_caller"]),
    ...(!credentialReady(credentialSummary) ? credentialSummary.blockers.map((item) => `credential:${item}`) : []),
    ...(plan.plan_status === "executing" ? [] : ["project_video_material_push_plan_not_executing"]),
    ...(batches.length >= 1 && batches.length <= 2 ? [] : ["project_video_material_push_batches_invalid"])
  ];
  if (blockers.length) return { status: "blocked_before_material_push", writeCalled: false, blockers };
  for (const batch of batches) {
    const actionId = `${actionIdPrefix}-${batch.batch_index || batch.batchIndex}`;
    const claim = await repo.claimPlannedExecutionAction({ actionId, jobId: bundle.job.job_id, confirmationId, planId: plan.plan_id, actionType: PROJECT_VIDEO_MATERIAL_PUSH_ACTION, idempotencyKey: `append-push:${plan.plan_hash || ""}:${batch.batch_index || batch.batchIndex}` });
    if (!claim.claimed) return { status: "already_consumed", writeCalled: false, blockers: ["project_video_material_push_action_already_recorded"] };
    let responseHash = ""; let httpStatus = null; let apiCode = ""; let errorCategory = ""; let passed = false;
    try {
      const payload = materialPushPayload({ materialAccountId, advertiserId, sourceVideoIds: batch.source_video_ids || batch.sourceVideoIds || [] });
      const response = await fetchWithDeadline(fetchImpl, `https://api.oceanengine.com${PROJECT_VIDEO_MATERIAL_PUSH_ENDPOINT}`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", "Access-Token": credentialEnv.OCEANENGINE_ACCESS_TOKEN }, body: JSON.stringify(payload) }, { timeoutMs: PLATFORM_JSON_TIMEOUT_MS });
      const text = await response.text(); responseHash = hash(text); httpStatus = response.status;
      let parsed = {}; try { parsed = JSON.parse(text); } catch { errorCategory = "platform_response_not_json"; }
      apiCode = clean(parsed.code ?? parsed.err_no ?? parsed.error_code);
      const failedIds = new Set((parsed?.data?.fail_list || parsed?.fail_list || []).map((item) => clean(item.video_id || item.videoId)).filter(Boolean));
      passed = response.ok && (apiCode === "0" || apiCode === "") && !(batch.source_video_ids || batch.sourceVideoIds || []).some((id) => failedIds.has(clean(id)));
      if (!passed && !errorCategory) errorCategory = "platform_rejected";
    } catch (error) { errorCategory = error?.name === "PlatformDeadlineError" ? "platform_timeout" : "platform_transport_failed"; }
    await repo.finishPlannedExecutionAction({ actionId, jobId: bundle.job.job_id, confirmationId, planId: plan.plan_id, actionType: PROJECT_VIDEO_MATERIAL_PUSH_ACTION, idempotencyKey: `append-push:${plan.plan_hash || ""}:${batch.batch_index || batch.batchIndex}`, actionStatus: passed ? "succeeded" : "failed_or_unconfirmed", metadata: { platform_write_called: true, platform_response_confirmed: passed, error_category: passed ? "" : errorCategory, batch_index: batch.batch_index || batch.batchIndex, raw_payload_stored: false, raw_response_stored: false }, responseHash, httpStatus, apiCode });
    if (!passed) return { status: "failed_or_unconfirmed", writeCalled: true, blockers: [errorCategory || "platform_rejected"], stoppedAfterBatch: batch.batch_index || batch.batchIndex };
  }
  const wanted = batches.flatMap((batch) => batch.origin_resource_ids || batch.originResourceIds || []);
  const target = await scanOceanEngineVideoInventory({ client: readonlyClient, advertiserId, originResourceIds: wanted });
  const unresolved = (target.items || []).filter((item) => !item.videoId).map((item) => item.originResourceId);
  return unresolved.length || target.status !== "passed"
    ? { status: "failed_or_unconfirmed", writeCalled: true, blockers: [target.blocker || "project_video_material_push_readback_unresolved"], unresolvedOriginResourceIds: unresolved }
    : { status: "readback_verified", writeCalled: true, pushedCount: wanted.length, projectId };
}

export function validateProjectVideoAppendReadback({ plannedOriginResourceIds = [], foundVideoIds = [], itemMap = [] } = {}) {
  const planned = new Set(plannedOriginResourceIds.map(clean));
  const found = new Set(foundVideoIds.map(clean));
  const unresolved = (itemMap || []).filter((item) => planned.has(clean(item.originResourceId)) && !found.has(clean(item.videoId))).map((item) => clean(item.originResourceId));
  return { status: unresolved.length ? "blocked" : "passed", unresolvedOriginResourceIds: unresolved, verifiedCount: planned.size - unresolved.length };
}

function projectRows(payload = {}) {
  const list = payload?.data?.list || payload?.data?.project_list || [];
  return Array.isArray(list) ? list : [];
}
function projectCreatedAt(item = {}) {
  return clean(item.create_time || item.create_at || item.created_at || item.createTime || item.createdAt);
}
function projectRow(item = {}) {
  return {
    projectId: clean(item.project_id || item.std_project_id || item.id),
    projectName: clean(item.name || item.project_name || item.projectName) || "未命名项目",
    createdAt: projectCreatedAt(item),
    status: clean(item.status || item.project_status || item.opt_status) || "unknown"
  };
}

export async function recommendProjectVideoAppendProjects({ client = createOceanEngineReadonlyClient(), advertiserId } = {}) {
  const account = longId("advertiser_id", advertiserId);
  const fetchPage = (page) => client.get({
    label: `project_video_append_recommendations_${page}`,
    endpoint: "std_project/list",
    query: { advertiser_id: account, page: String(page), page_size: "100" },
    requestFieldManifest: ["advertiser_id", "page", "page_size"],
    summarize: (payload) => ({ items: projectRows(payload), totalPage: Number(payload?.data?.page_info?.total_page || 1) })
  });
  const first = await fetchPage(1);
  const totalPage = Number(first.summary?.totalPage || 0);
  if (first.status !== "passed" || !Number.isInteger(totalPage) || totalPage < 1 || totalPage > 100) {
    return { status: "failed", items: [], latest: false, reason: "project_recommendation_readonly_failed" };
  }
  const rows = [...(first.summary?.items || [])];
  for (let page = 2; page <= totalPage; page += 1) {
    const result = await fetchPage(page);
    if (result.status !== "passed") return { status: "failed", items: [], latest: false, reason: "project_recommendation_readonly_failed" };
    rows.push(...(result.summary?.items || []));
  }
  const candidates = rows.map(projectRow).filter((item) => /^\d{8,24}$/.test(item.projectId));
  const dated = candidates.filter((item) => item.createdAt);
  const latest = dated.length === candidates.length;
  const ordered = latest ? candidates.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : candidates;
  return { status: ordered.length ? "passed" : "empty", items: ordered.slice(0, 5), latest, reason: "" };
}
