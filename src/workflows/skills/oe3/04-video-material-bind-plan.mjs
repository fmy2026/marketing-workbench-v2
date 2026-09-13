import { buildVideoMaterialPreparePlan } from "../../../platforms/oceanengineVideoMaterialExecutor.mjs";
import { assertNoSensitiveLeak, sanitizeForPublic } from "./00-contracts.mjs";

export async function runVideoMaterialBindPlanSkill({ bundle } = {}) {
  const plan = buildVideoMaterialPreparePlan({ bundle });
  const blockers = plan.contractBlockers || [];
  const outputSummary = sanitizeForPublic({
    resourceType: "video_asset",
    planStatus: plan.contractStatus,
    contractStatus: plan.contractStatus,
    contractBlockers: blockers,
    canPrepare: plan.canPrepare === true,
    sourceAccountIdPresent: Boolean(plan.sourceAccount?.advertiserId),
    targetAdvertiserId: plan.targetAdvertiserId,
    selectedRequiredVideoCount: plan.selectedRequiredVideoCount,
    readyCount: plan.readyCount,
    uploadActionCount: plan.uploadActionCount,
    bindActionCount: plan.bindActionCount,
    bindBatchCount: plan.bindBatchCount,
    bindBatchRequestHash: plan.bindBatchRequestHash,
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
      originResourceId: item.originResourceId || "",
      materialSourceVideoIdPresent: item.videoIdPresent === true,
      coverMode: item.coverMode,
      nextAction: item.nextAction
    })),
    rawPayloadStored: false,
    rawResponseStored: false
  });
  const result = {
    status: plan.contractStatus === "blocked" ? "blocked" : "passed",
    blockers,
    outputSummary,
    evidenceRefs: []
  };
  assertNoSensitiveLeak(result);
  return result;
}
