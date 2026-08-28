import { buildVideoMaterialPreparePlan } from "../../../platforms/oceanengineVideoMaterialExecutor.mjs";
import { assertNoSensitiveLeak, sanitizeForPublic } from "./00-contracts.mjs";

function planStatusFromItems(items = []) {
  if (!items.length) return "blocked";
  if (items.every((item) => item.planStatus === "source_ready_target_ready")) return "ready";
  if (items.some((item) => item.planStatus === "platform_probe_failed")) return "blocked";
  return "planned";
}

function blockersFromItems(items = []) {
  return [...new Set(items.flatMap((item) => {
    if (item.planStatus === "source_ready_target_ready") return [];
    if (item.planStatus === "source_ready_target_missing") return [];
    return [`video_material_bind_plan_blocked:${item.sourceAssetId}:${item.planStatus || "unknown"}`];
  }))];
}

export async function runVideoMaterialBindPlanSkill({ bundle } = {}) {
  const plan = buildVideoMaterialPreparePlan({ bundle });
  const blockers = blockersFromItems(plan.items || []);
  const outputSummary = sanitizeForPublic({
    resourceType: "video_asset",
    planStatus: planStatusFromItems(plan.items || []),
    sourceAccountIdPresent: Boolean(plan.sourceAccount?.advertiserId),
    targetAdvertiserId: plan.targetAdvertiserId,
    selectedRequiredVideoCount: plan.selectedRequiredVideoCount,
    readyCount: plan.readyCount,
    uploadActionCount: plan.uploadActionCount,
    bindActionCount: plan.bindActionCount,
    writeGrantRequired: plan.writeGrantRequired,
    endpoint: plan.officialContract?.endpoint || "",
    requestFieldManifest: plan.officialContract?.requestFieldManifest || {},
    requestHashCount: (plan.items || []).filter((item) => item.requestHash).length,
    items: (plan.items || []).map((item) => ({
      sourceAssetId: item.sourceAssetId,
      planStatus: item.planStatus,
      actions: item.actions,
      actionRequired: item.actionRequired,
      requestHashPresent: Boolean(item.requestHash),
      sourceVideoVisible: item.sourceVideoVisible,
      targetVideoVisible: item.targetVideoVisible,
      localFilePresent: item.localFilePresent,
      localFileHashPresent: item.localFileHashPresent,
      coverMode: item.coverMode,
      nextAction: item.nextAction
    })),
    rawPayloadStored: false,
    rawResponseStored: false
  });
  const result = {
    status: blockers.length ? "blocked" : "passed",
    blockers,
    outputSummary,
    evidenceRefs: []
  };
  assertNoSensitiveLeak(result);
  return result;
}
