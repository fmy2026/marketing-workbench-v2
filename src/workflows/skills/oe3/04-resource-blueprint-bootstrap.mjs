import { sanitizeForPublic } from "./00-contracts.mjs";

export async function runResourceBlueprintBootstrapSkill({ repo, bundle } = {}) {
  const job = bundle?.job || {};
  const blueprints = Array.isArray(bundle?.resourceBlueprints) ? bundle.resourceBlueprints : [];
  if (!blueprints.length) {
    return {
      status: "blocked",
      blockers: ["baseline_resource_blueprints_missing"],
      outputSummary: {
        blueprintCount: 0,
        createdResourceCount: 0,
        existingResourceCount: 0,
        nextAction: "补齐游戏/路线保底资源蓝图。"
      }
    };
  }

  const result = await repo.bootstrapAccountResourcesFromBlueprints({
    routeId: job.route_id,
    gameCode: job.game_code,
    advertiserId: job.advertiser_id
  });
  return sanitizeForPublic({
    status: "passed",
    blockers: [],
    outputSummary: {
      blueprintCount: Number(result.blueprintCount || 0),
      createdResourceCount: Number(result.createdResourceCount || 0),
      existingResourceCount: Number(result.existingResourceCount || 0),
      inheritanceStatuses: result.inheritanceStatuses || [],
      nextAction: "保底资源候选已物化；继续执行目标账户只读核验。"
    }
  });
}
