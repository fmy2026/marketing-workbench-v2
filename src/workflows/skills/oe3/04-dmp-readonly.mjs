import { createOceanEngineReadonlyClient } from "../../../platforms/oceanengineReadonlyClient.mjs";
import { buildDmpPushRequestPlan } from "../../../platforms/oceanengineDmpExecutor.mjs";
import { hashValue, sanitizeForPublic } from "./00-contracts.mjs";
import { readonlyPermissionState } from "./00-readonly-permission.mjs";
import { clean, dmpCustomAudienceIds, resource } from "./04-resource-verifiers.mjs";

export const DEFAULT_DMP_PACKAGE_SET_ID = "DMP-JSZC-HUNT-CONVERTED-EXCLUDE-BASELINE-001";
export const DMP_PUSH_ENDPOINT = "https://api.oceanengine.com/open_api/2/dmp/custom_audience/push_v2/";

function numberId(value) {
  const text = clean(value);
  return /^\d+$/.test(text) ? text : "";
}

function unique(values = []) {
  return [...new Set(values.map(clean).filter(Boolean))];
}

function packageSetIdFromBundle(bundle = {}) {
  const dmp = resource(bundle, "dmp_audience_package");
  const blueprint = (bundle.resourceBlueprints || []).find((item) => item.resource_type === "dmp_audience_package") || {};
  return clean(dmp.metadata?.baseline_blueprint?.source_asset_id) ||
    clean(dmp.metadata?.baseline_blueprint?.package_set_id) ||
    clean(dmp.metadata?.package_set_id) ||
    clean(blueprint.metadata?.package_set_id) ||
    clean(blueprint.source_asset_id) ||
    DEFAULT_DMP_PACKAGE_SET_ID;
}

function extractCustomAudienceIds(value) {
  const found = [];
  function walk(item) {
    if (Array.isArray(item)) {
      item.forEach(walk);
      return;
    }
    if (!item || typeof item !== "object") return;
    for (const [key, child] of Object.entries(item)) {
      if (["custom_audience_id", "custom_audience_ids", "audience_package_id", "retargeting_tags_exclude"].includes(key)) {
        const values = Array.isArray(child) ? child : [child];
        values.map(numberId).filter(Boolean).forEach((id) => found.push(id));
      }
      walk(child);
    }
  }
  walk(value);
  return unique(found);
}

function extractFieldValues(value, fieldName) {
  const found = [];
  function walk(item) {
    if (Array.isArray(item)) {
      item.forEach(walk);
      return;
    }
    if (!item || typeof item !== "object") return;
    for (const [key, child] of Object.entries(item)) {
      if (key === fieldName && child !== null && child !== undefined && child !== "") found.push(clean(child));
      walk(child);
    }
  }
  walk(value);
  return unique(found);
}

function summarizeDmp(payload = {}) {
  const customAudienceIds = extractCustomAudienceIds(payload?.data || payload);
  const deliveryStatuses = extractFieldValues(payload?.data || payload, "delivery_status");
  return {
    customAudienceIdCount: customAudienceIds.length,
    customAudienceIds,
    deliveryStatuses,
    dataPresent: Boolean(payload?.data)
  };
}

function credentialSummary(credential = {}) {
  return {
    status: credential.status || "credential_required",
    envFilePresent: Boolean(credential.envFilePresent),
    appIdPresent: Boolean(credential.appIdPresent),
    accessTokenPresent: Boolean(credential.accessTokenPresent),
    refreshTokenPresent: Boolean(credential.refreshTokenPresent),
    tokenExpired: Boolean(credential.tokenExpired),
    blockers: credential.blockers || []
  };
}

function probeDigest(probe = {}) {
  return {
    endpoint: probe.endpoint || "not_called",
    status: probe.status || "not_run",
    apiCode: probe.apiCode || "",
    httpStatus: probe.httpStatus ?? null,
    requestIdPresent: Boolean(probe.requestIdPresent),
    responseHash: probe.responseHash || "",
    customAudienceIdCount: probe.summary?.customAudienceIdCount || 0,
    customAudienceIds: probe.summary?.customAudienceIds || [],
    deliveryStatuses: probe.summary?.deliveryStatuses || []
  };
}

function memberIds(packageSet = {}) {
  return unique((packageSet.members || []).map((member) => member.custom_audience_id).filter(numberId));
}

function previousOutput(previousOutputs, key) {
  return previousOutputs?.get?.(key) || {};
}

function evidenceSummaryLine(item = {}) {
  return [
    `custom_audience_id=${item.customAudienceId || item.custom_audience_id || ""}`,
    `status=${item.status || "not_run"}`,
    `read_api=${item.read?.apiCode || ""}`,
    `select_api=${item.select?.apiCode || ""}`,
    `read_hash_present=${Boolean(item.read?.responseHash)}`,
    `select_hash_present=${Boolean(item.select?.responseHash)}`
  ].join(",");
}

async function recordDmpEvidence({ repo, bundle, stage, title, status, packageSetId = "", members = [], extra = {} }) {
  const artifactId = `EV-${bundle.job.job_id}-DMP-${stage.toUpperCase().replace(/[^A-Z0-9]+/g, "-")}`;
  const summary = [
    `status=${status}`,
    `package_set_id=${packageSetId || "none"}`,
    `member_count=${members.length}`,
    ...members.slice(0, 12).map(evidenceSummaryLine),
    "response_body_stored=false"
  ].join("; ");
  await repo.upsertEvidence({
    artifactId,
    jobId: bundle.job.job_id,
    artifactType: `dmp_${stage}`,
    title,
    summary,
    contentHash: hashValue({ stage, status, packageSetId, members, extra }),
    storageRef: `postgres:mwb.evidence_artifacts/${artifactId}`,
    sourceRef: `oceanengine:dmp/${stage}`,
    sourceUsage: bundle.job.source_usage || "runtime_truth"
  });
  return artifactId;
}

function permissionBlockedResult({ bundle, permission, stage }) {
  return {
    status: "blocked",
    blockers: permission.blockers || ["readonly_permission_required"],
    evidenceRefs: [],
    outputSummary: {
      packageSetId: packageSetIdFromBundle(bundle),
      readonlyStatus: "readonly_permission_required",
      ready: false,
      stage,
      nextAction: "在只读任务范围内开放真实平台只读依赖后重跑。"
    }
  };
}

function credentialBlockedResult({ bundle, credential, stage }) {
  return {
    status: "blocked",
    blockers: ["credential_required", ...(credential.blockers || [])],
    evidenceRefs: [],
    outputSummary: {
      packageSetId: packageSetIdFromBundle(bundle),
      readonlyStatus: "credential_required",
      credential: credentialSummary(credential),
      ready: false,
      stage,
      nextAction: "处理 v2 OceanEngine 凭据后重跑 DMP 只读核验。"
    }
  };
}

function testScopeResult({ bundle, stage }) {
  return {
    status: "passed",
    blockers: [],
    evidenceRefs: [],
    outputSummary: {
      packageSetId: packageSetIdFromBundle(bundle),
      readonlyStatus: "not_run_test_scope",
      stage,
      ready: true,
      noRealPlatformWrite: true,
      nextAction: "测试运行不调用平台。"
    }
  };
}

async function probeAudience({ client, advertiserId, customAudienceId }) {
  const safeId = numberId(customAudienceId);
  const read = await client.get({
    label: "dmp_custom_audience_read",
    endpoint: "dmp/custom_audience/read",
    query: {
      advertiser_id: advertiserId,
      custom_audience_ids: JSON.stringify([Number(safeId)])
    },
    requestFieldManifest: {
      fieldNames: ["advertiser_id", "custom_audience_ids"],
      customAudienceIdsTransportType: "json_integer_array_string"
    },
    summarize: summarizeDmp
  });
  const select = await client.get({
    label: "dmp_custom_audience_select",
    endpoint: "dmp/custom_audience/select",
    query: {
      advertiser_id: advertiserId,
      custom_audience_ids: JSON.stringify([Number(safeId)]),
      page: "1",
      page_size: "100"
    },
    requestFieldManifest: {
      fieldNames: ["advertiser_id", "custom_audience_ids", "page", "page_size"],
      customAudienceIdsTransportType: "json_integer_array_string"
    },
    summarize: summarizeDmp
  });
  const readIds = read.summary?.customAudienceIds || [];
  const selectIds = select.summary?.customAudienceIds || [];
  const idReadback = readIds.includes(safeId) || selectIds.includes(safeId);
  const passed = read.status === "passed" && select.status === "passed" && idReadback;
  return sanitizeForPublic({
    customAudienceId: safeId,
    status: passed ? "passed" : read.status === "transport_failed" || select.status === "transport_failed" ? "transport_failed" : "missing",
    read: probeDigest(read),
    select: probeDigest(select),
    idReadback,
    deliveryStatuses: unique([...(read.summary?.deliveryStatuses || []), ...(select.summary?.deliveryStatuses || [])])
  });
}

export async function runDmpBaselineResolveSkill({ repo, bundle } = {}) {
  const job = bundle?.job || {};
  const packageSetId = packageSetIdFromBundle(bundle);
  const packageSet = await repo.getDmpPackageSet({
    routeId: job.route_id,
    gameCode: job.game_code,
    packageSetId
  });
  const ids = memberIds(packageSet || {});
  const status = packageSet?.packageSet && ids.length ? "passed" : "blocked";
  return sanitizeForPublic({
    status,
    blockers: status === "passed" ? [] : [packageSet?.packageSet ? "dmp_baseline_members_missing" : "dmp_baseline_package_set_missing"],
    packageSetId,
    customAudienceIds: ids,
    outputSummary: {
      packageSetId,
      semanticKey: packageSet?.packageSet?.semantic_key || "",
      payloadField: packageSet?.packageSet?.payload_field || "audience.retargeting_tags_exclude",
      sourceAdvertiserId: packageSet?.packageSet?.source_advertiser_id || "",
      memberCount: ids.length,
      referenceCandidateOnly: true,
      ready: status === "passed",
      nextAction: status === "passed" ? "继续来源户 DMP 真实只读核验。" : "补齐 JSZC DMP 保底集合成员。"
    }
  });
}

async function runDmpReadonlyVerify({
  repo,
  bundle,
  client,
  allowReadonlyDependency,
  stage,
  advertiserId,
  statusColumn,
  evidenceColumn,
  title,
  mockReady = false
} = {}) {
  if (mockReady) return testScopeResult({ bundle, stage });
  if (bundle?.job?.source_usage === "test_run" && !allowReadonlyDependency) return testScopeResult({ bundle, stage });
  const permission = readonlyPermissionState({ allowReadonlyDependency });
  if (!permission.allowed) return permissionBlockedResult({ bundle, permission, stage });
  const credential = client.credentialState();
  if (credential.status !== "ready") return credentialBlockedResult({ bundle, credential, stage });

  const packageSetId = packageSetIdFromBundle(bundle);
  const packageSet = await repo.getDmpPackageSet({
    routeId: bundle.job.route_id,
    gameCode: bundle.job.game_code,
    packageSetId,
    ...(stage === "target-readonly-verify" ? { targetAdvertiserId: advertiserId } : {})
  });
  const ids = memberIds(packageSet || {});
  if (!ids.length) {
    return {
      status: "blocked",
      blockers: ["dmp_baseline_members_missing"],
      evidenceRefs: [],
      outputSummary: {
        packageSetId,
        stage,
        memberCount: 0,
        ready: false,
        nextAction: "补齐 DMP 保底集合成员。"
      }
    };
  }

  const results = [];
  for (const id of ids) {
    const result = await probeAudience({ client, advertiserId, customAudienceId: id });
    results.push(result);
  }
  const passedIds = results.filter((item) => item.status === "passed").map((item) => item.customAudienceId);
  const missingIds = ids.filter((id) => !passedIds.includes(id));
  const status = missingIds.length ? "blocked" : "passed";
  const evidenceRef = await recordDmpEvidence({
    repo,
    bundle,
    stage,
    title,
    status,
    packageSetId,
    members: results
  });
  for (const item of results) {
    await repo.updateDmpPackageMemberReadonly({
      packageSetId,
      customAudienceId: item.customAudienceId,
      ...(stage === "target-readonly-verify" ? { targetAdvertiserId: advertiserId } : {}),
      [statusColumn]: item.status === "passed" ? "passed" : item.status,
      [evidenceColumn]: evidenceRef,
      referenceStatus: item.status === "passed" && stage === "source-readonly-verify" ? "source_verified" : "",
      metadata: {
        [`${stage.replace(/-/g, "_")}_summary`]: {
          status: item.status,
          read_api_code: item.read?.apiCode || "",
          select_api_code: item.select?.apiCode || "",
          request_id_present: Boolean(item.read?.requestIdPresent || item.select?.requestIdPresent),
          response_hashes: [item.read?.responseHash || "", item.select?.responseHash || ""].filter(Boolean),
          delivery_statuses: item.deliveryStatuses || [],
          checked_at: new Date().toISOString()
        }
      }
    });
  }
  if (stage === "target-readonly-verify" && status === "passed") {
    await repo.updateDmpPackageSetStatus({
      packageSetId,
      status: "target_readonly_verified",
      metadata: { target_verified_member_count: passedIds.length }
    });
    await repo.updateAccountResourceReadonly({
      routeId: bundle.job.route_id,
      gameCode: bundle.job.game_code,
      advertiserId: bundle.job.advertiser_id,
      resourceType: "dmp_audience_package",
      visibilityStatus: "visible",
      readbackStatus: "readback_verified",
      inheritanceStatus: "target_readonly_verified",
      metadata: {
        status: "passed",
        key: "dmp_target_readonly_verified",
        custom_audience_id_count: passedIds.length,
        checked_at: new Date().toISOString(),
        evidence_refs: [evidenceRef]
      },
      resourceMetadata: {
        custom_audience_ids: passedIds,
        dmp_package_set_id: packageSetId
      }
    });
  }
  if (stage === "source-readonly-verify" && status === "passed") {
    await repo.updateDmpPackageSetStatus({
      packageSetId,
      status: "source_readonly_verified",
      metadata: { source_verified_member_count: passedIds.length }
    });
  }
  return sanitizeForPublic({
    status,
    blockers: status === "passed" ? [] : [`dmp_${stage.replace(/-/g, "_")}_blocked`],
    evidenceRefs: [evidenceRef],
    customAudienceIds: passedIds,
    outputSummary: {
      packageSetId,
      stage,
      advertiserId,
      memberCount: ids.length,
      passedCount: passedIds.length,
      missingCount: missingIds.length,
      missingIdHash: missingIds.length ? hashValue(missingIds) : "",
      ready: status === "passed",
      evidenceRef,
      rawRequestStored: false,
      rawResponseStored: false,
      nextAction: status === "passed" ? "继续下一 DMP 子节点。" : "停止于 DMP 只读缺失证据；不得猜测替代包。"
    }
  });
}

export async function runDmpSourceReadonlyVerifySkill({
  repo,
  bundle,
  client = createOceanEngineReadonlyClient(),
  mockReady = false,
  allowReadonlyDependency = false
} = {}) {
  const packageSet = await repo.getDmpPackageSet({
    routeId: bundle.job.route_id,
    gameCode: bundle.job.game_code,
    packageSetId: packageSetIdFromBundle(bundle)
  });
  const sourceAdvertiserId = clean(packageSet?.packageSet?.source_advertiser_id);
  if (!sourceAdvertiserId) {
    return {
      status: "blocked",
      blockers: ["dmp_source_advertiser_id_missing"],
      evidenceRefs: [],
      outputSummary: {
        packageSetId: packageSetIdFromBundle(bundle),
        ready: false,
        nextAction: "补齐 DMP 保底集合来源户。"
      }
    };
  }
  return runDmpReadonlyVerify({
    repo,
    bundle,
    client,
    allowReadonlyDependency,
    mockReady,
    stage: "source-readonly-verify",
    advertiserId: sourceAdvertiserId,
    statusColumn: "sourceReadonlyStatus",
    evidenceColumn: "sourceEvidenceRef",
    title: "DMP 来源户保底人群包只读核验"
  });
}

export async function runDmpTargetReadonlyVerifySkill({
  repo,
  bundle,
  client = createOceanEngineReadonlyClient(),
  mockReady = false,
  allowReadonlyDependency = false
} = {}) {
  return runDmpReadonlyVerify({
    repo,
    bundle,
    client,
    allowReadonlyDependency,
    mockReady,
    stage: "target-readonly-verify",
    advertiserId: clean(bundle.job.advertiser_id),
    statusColumn: "targetReadonlyStatus",
    evidenceColumn: "targetEvidenceRef",
    title: "DMP 目标户保底人群包只读核验"
  });
}

export async function runDmpPushPlanSkill({ repo, bundle, previousOutputs } = {}) {
  const packageSetId = packageSetIdFromBundle(bundle);
  const packageSet = await repo.getDmpPackageSet({
    routeId: bundle.job.route_id,
    gameCode: bundle.job.game_code,
    packageSetId,
    targetAdvertiserId: bundle.job.advertiser_id
  });
  const ids = memberIds(packageSet || {});
  const sourceOutput = previousOutput(previousOutputs, "dmp-source-readonly-verify");
  const targetOutput = previousOutput(previousOutputs, "dmp-target-readonly-verify");
  if (sourceOutput.outputSummary?.readonlyStatus === "not_run_test_scope" || targetOutput.outputSummary?.readonlyStatus === "not_run_test_scope") {
    return sanitizeForPublic({
      status: "passed",
      blockers: [],
      evidenceRefs: [],
      outputSummary: {
        packageSetId,
        pushPlanCount: 0,
        ready: true,
        noRealPlatformWrite: true,
        nextAction: "测试运行不生成真实 DMP 推送计划。"
      }
    });
  }
  const sourcePassedIds = ids.filter((id) =>
    (packageSet.members || []).some((member) => member.custom_audience_id === id && member.source_readonly_status === "passed")
  );
  const targetPassedIds = ids.filter((id) =>
    (packageSet.members || []).some((member) => member.custom_audience_id === id && member.target_readonly_status === "passed")
  );
  const missingTargetIds = ids.filter((id) => sourcePassedIds.includes(id) && !targetPassedIds.includes(id));
  const sourceComplete = ids.length > 0 && sourcePassedIds.length === ids.length;
  const targetComplete = ids.length > 0 && targetPassedIds.length === ids.length;
  if (!sourceComplete) {
    const evidenceRef = await recordDmpEvidence({
      repo,
      bundle,
      stage: "push-plan",
      title: "DMP 逐包推送计划",
      status: "blocked",
      packageSetId,
      members: ids.map((id) => ({ customAudienceId: id, status: sourcePassedIds.includes(id) ? "passed" : "source_missing" }))
    });
    await repo.updateDmpPackageSetStatus({
      packageSetId,
      status: "blocked",
      metadata: { push_plan_blocker: "source_readonly_not_complete", evidence_ref: evidenceRef }
    });
    await repo.updateAccountResourceReadonly({
      routeId: bundle.job.route_id,
      gameCode: bundle.job.game_code,
      advertiserId: bundle.job.advertiser_id,
      resourceType: "dmp_audience_package",
      visibilityStatus: "needs_confirmation",
      readbackStatus: "not_checked",
      inheritanceStatus: "target_readonly_blocked",
      metadata: {
        status: "blocked",
        key: "dmp_source_readonly_not_complete",
        source_verified_custom_audience_id_count: sourcePassedIds.length,
        target_verified_custom_audience_id_count: targetPassedIds.length,
        push_plan_count: 0,
        checked_at: new Date().toISOString(),
        evidence_refs: [evidenceRef]
      },
      resourceMetadata: {
        dmp_package_set_id: packageSetId
      }
    });
    return sanitizeForPublic({
      status: "blocked",
      blockers: ["dmp_source_readonly_not_complete"],
      evidenceRefs: [evidenceRef],
      outputSummary: {
        packageSetId,
        sourcePassedCount: sourcePassedIds.length,
        targetPassedCount: targetPassedIds.length,
        pushPlanCount: 0,
        ready: false,
        nextAction: "先修复来源户 DMP 包只读缺失。"
      }
    });
  }
  if (targetComplete) {
    return sanitizeForPublic({
      status: "passed",
      blockers: [],
      evidenceRefs: targetOutput.evidenceRefs || [],
      outputSummary: {
        packageSetId,
        sourcePassedCount: sourcePassedIds.length,
        targetPassedCount: targetPassedIds.length,
        pushPlanCount: 0,
        ready: true,
        nextAction: "目标户 DMP 已全部可用，无需推送。"
      }
    });
  }
  const plans = missingTargetIds.map((id) => buildDmpPushRequestPlan({
    sourceAdvertiserId: packageSet.packageSet.source_advertiser_id,
    targetAdvertiserId: bundle.job.advertiser_id,
    customAudienceId: id
  }));
  const evidenceRef = await recordDmpEvidence({
    repo,
    bundle,
    stage: "push-plan",
    title: "DMP 逐包推送计划",
    status: "planned",
    packageSetId,
    members: missingTargetIds.map((id) => ({ customAudienceId: id, status: "push_planned" })),
    extra: { requestHashes: plans.map((plan) => plan.requestHash) }
  });
  const result = await repo.upsertDmpPackagePushPlans({
    jobId: bundle.job.job_id,
    packageSetId,
    sourceAdvertiserId: packageSet.packageSet.source_advertiser_id,
    targetAdvertiserId: bundle.job.advertiser_id,
    customAudienceIds: missingTargetIds,
    endpoint: DMP_PUSH_ENDPOINT,
    requestFieldManifest: plans[0]?.requestFieldManifest || {},
    evidenceRef,
    metadata: {
      generated_by_skill: "dmp-push-plan",
      no_platform_write_called: true
    }
  });
  await repo.updateDmpPackageSetStatus({
    packageSetId,
    status: "push_plan_pending",
    metadata: { pending_push_plan_count: result.plannedCount || 0, evidence_ref: evidenceRef }
  });
  await repo.updateAccountResourceReadonly({
    routeId: bundle.job.route_id,
    gameCode: bundle.job.game_code,
    advertiserId: bundle.job.advertiser_id,
    resourceType: "dmp_audience_package",
    visibilityStatus: "needs_confirmation",
    readbackStatus: "not_checked",
    inheritanceStatus: "write_plan_pending",
    metadata: {
      status: "blocked",
      key: "dmp_target_push_plan_pending",
      source_verified_custom_audience_id_count: sourcePassedIds.length,
      target_verified_custom_audience_id_count: targetPassedIds.length,
      push_plan_count: result.plannedCount || 0,
      checked_at: new Date().toISOString(),
      evidence_refs: [evidenceRef]
    },
    resourceMetadata: {
      dmp_package_set_id: packageSetId,
      dmp_push_plan_ids: result.pushPlanIds || []
    }
  });
  return sanitizeForPublic({
    status: "blocked",
    blockers: ["dmp_target_push_plan_pending"],
    evidenceRefs: [evidenceRef],
    customAudienceIds: [],
    outputSummary: {
      packageSetId,
      sourcePassedCount: sourcePassedIds.length,
      targetPassedCount: targetPassedIds.length,
      missingTargetCount: missingTargetIds.length,
      missingTargetIdHash: hashValue(missingTargetIds),
      pushPlanCount: result.plannedCount || 0,
      pushPlanIds: result.pushPlanIds || [],
      requestHashCount: plans.length,
      requestFieldManifest: plans[0]?.requestFieldManifest || {},
      ready: false,
      rawRequestStored: false,
      rawResponseStored: false,
      nextAction: "另建 DMP 默认集合逐包单次推送与回查任务。"
    }
  });
}

function resultFromIds({ item, customAudienceIds, candidateAudienceIds = [], source, evidenceRef = "", blocker = "" }) {
  const ready = customAudienceIds.length > 0;
  return {
    status: ready ? "passed" : "blocked",
    blockers: ready ? [] : [blocker || (candidateAudienceIds.length ? "dmp_candidate_selection_required" : "dmp_custom_audience_ids_missing")],
    evidenceRefs: evidenceRef ? [evidenceRef] : [],
    customAudienceIds,
    outputSummary: {
      resourceType: "dmp_audience_package",
      label: "DMP",
      visibilityStatus: item.visibility_status || "missing",
      readbackStatus: item.readback_status || "missing",
      readonlyStatus: ready ? "passed" : (item.metadata?.readonly_check?.status || "blocked"),
      ready,
      platformResourceIdPresent: Boolean(item.platform_resource_id),
      semanticPlatformResourceIdExcludedFromPayload: !/^\d+$/.test(clean(item.platform_resource_id)),
      dmpCustomAudienceIdsPresent: ready,
      dmpCustomAudienceIdCount: customAudienceIds.length,
      dmpCandidateAudienceCount: candidateAudienceIds.length,
      automaticSelection: false,
      customAudienceIdSource: source,
      payloadField: "audience.retargeting_tags_exclude",
      evidenceRef,
      nextAction: ready ? "无需动作" : "执行 DMP 保底集合来源/目标只读核验并生成逐包推送计划"
    }
  };
}

export async function runDmpReadonlyGate({
  bundle,
  mockReady = false,
  allowReadonlyDependency = false,
  previousOutputs
} = {}) {
  const item = resource(bundle, "dmp_audience_package");
  const pushPlan = previousOutput(previousOutputs, "dmp-push-plan");
  const target = previousOutput(previousOutputs, "dmp-target-readonly-verify");
  if (target.status === "passed" && Array.isArray(target.customAudienceIds) && target.customAudienceIds.length) {
    return resultFromIds({
      item,
      customAudienceIds: target.customAudienceIds,
      source: "dmp_target_readonly_pipeline",
      evidenceRef: target.evidenceRefs?.[0] || ""
    });
  }
  if (pushPlan.status === "blocked" && (pushPlan.blockers || []).includes("dmp_target_push_plan_pending")) {
    return sanitizeForPublic({
      status: "blocked",
      blockers: ["dmp_target_push_plan_pending"],
      evidenceRefs: pushPlan.evidenceRefs || [],
      customAudienceIds: [],
      outputSummary: {
        resourceType: "dmp_audience_package",
        label: "DMP",
        existenceStatus: item.resource_type ? "exists" : "missing",
        existence_status: item.resource_type ? "exists" : "missing",
        visibilityStatus: item.visibility_status || "missing",
        readbackStatus: item.readback_status || "missing",
        readonlyStatus: "push_plan_pending",
        readonly_status: "push_plan_pending",
        readinessStatus: "not_ready",
        readiness_status: "not_ready",
        ready: false,
        platformResourceIdPresent: Boolean(item.platform_resource_id),
        dmpCustomAudienceIdsPresent: false,
        dmpCustomAudienceIdCount: 0,
        pushPlanCount: pushPlan.outputSummary?.pushPlanCount || 0,
        payloadField: "audience.retargeting_tags_exclude",
        evidenceRef: pushPlan.evidenceRefs?.[0] || "",
        nextAction: "另建 DMP 默认集合逐包单次推送与回查任务。"
      }
    });
  }
  if (pushPlan.status === "blocked" && (pushPlan.blockers || []).includes("dmp_source_readonly_not_complete")) {
    return sanitizeForPublic({
      status: "blocked",
      blockers: ["dmp_source_readonly_not_complete"],
      evidenceRefs: pushPlan.evidenceRefs || [],
      customAudienceIds: [],
      outputSummary: {
        resourceType: "dmp_audience_package",
        label: "DMP",
        existenceStatus: item.resource_type ? "exists" : "missing",
        existence_status: item.resource_type ? "exists" : "missing",
        visibilityStatus: item.visibility_status || "missing",
        readbackStatus: item.readback_status || "missing",
        readonlyStatus: "source_readonly_not_complete",
        readonly_status: "source_readonly_not_complete",
        readinessStatus: "not_ready",
        readiness_status: "not_ready",
        ready: false,
        platformResourceIdPresent: Boolean(item.platform_resource_id),
        dmpCustomAudienceIdsPresent: false,
        dmpCustomAudienceIdCount: 0,
        sourcePassedCount: pushPlan.outputSummary?.sourcePassedCount || 0,
        targetPassedCount: pushPlan.outputSummary?.targetPassedCount || 0,
        payloadField: "audience.retargeting_tags_exclude",
        evidenceRef: pushPlan.evidenceRefs?.[0] || "",
        nextAction: "先修复来源户 DMP 包只读缺失。"
      }
    });
  }
  if (!item.resource_type) {
    return resultFromIds({ item, customAudienceIds: [], source: "missing_account_resource", blocker: "dmp_audience_package_missing" });
  }

  const existingIds = mockReady ? ["100000000001"] : dmpCustomAudienceIds(bundle);
  const requiresFreshReadonly = bundle.job.source_usage === "runtime_truth" && !mockReady;
  if (existingIds.length && !requiresFreshReadonly) {
    return resultFromIds({
      item,
      customAudienceIds: existingIds,
      source: mockReady ? "mock_ready" : "postgres_readonly_metadata"
    });
  }
  if (bundle.job.source_usage === "test_run" && !allowReadonlyDependency) {
    return resultFromIds({
      item,
      customAudienceIds: existingIds.length ? existingIds : ["100000000001"],
      source: "test_scope_fixture"
    });
  }
  return resultFromIds({
    item,
    customAudienceIds: [],
    source: "dmp_pipeline_required",
    blocker: "dmp_pipeline_outputs_missing"
  });
}
