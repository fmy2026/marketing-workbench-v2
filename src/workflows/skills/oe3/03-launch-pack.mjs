import { materialItems } from "./04-resource-verifiers.mjs";
import { runBackupLandingPageReadinessSkill } from "./03-landing-page-readiness.mjs";

export { materialItems };

export function runLaunchPackSkill({ bundle, skillKey }) {
  if (skillKey === "launch-pack-resolve-game") {
    const passed = Boolean(bundle.game?.game_code && bundle.game?.game_name);
    return {
      status: passed ? "passed" : "blocked",
      blockers: passed ? [] : ["game_master_missing"],
      outputSummary: {
        gameCode: bundle.game?.game_code || "",
        gameName: bundle.game?.game_name || "",
        productName: bundle.game?.product_name || "",
        brandName: bundle.game?.brand_name || ""
      }
    };
  }

  if (skillKey === "launch-pack-resolve-defaults") {
    const passed = Boolean(bundle.defaults?.objective && bundle.defaults?.deep_objective);
    return {
      status: passed ? "passed" : "blocked",
      blockers: passed ? [] : ["route_defaults_missing"],
      outputSummary: {
        objective: bundle.defaults?.objective || "",
        deepObjective: bundle.defaults?.deep_objective || "",
        deepBidType: bundle.defaults?.deep_bid_type || "",
        budget: Number(bundle.defaults?.budget || 0),
        bid: Number(bundle.defaults?.bid || 0)
      }
    };
  }

  if (skillKey === "launch-pack-resolve-materials") {
    const items = materialItems(bundle);
    const passed = Boolean(bundle.materialPack?.pack?.pack_id && items.length);
    return {
      status: passed ? "passed" : "blocked",
      blockers: passed ? [] : ["material_pack_missing"],
      outputSummary: {
        materialPackId: bundle.materialPack?.pack?.pack_id || "",
        materialItemCount: items.length,
        requiredVideoCount: items.filter((entry) => entry.item?.item_type === "video_asset" && entry.item?.required).length
      }
    };
  }

  if (skillKey === "launch-pack-resolve-backup-landing-page") {
    return runBackupLandingPageReadinessSkill({ bundle });
  }

  if (skillKey === "launch-pack-resolve-resource-blueprints") {
    const blueprints = Array.isArray(bundle.resourceBlueprints) ? bundle.resourceBlueprints : [];
    const requiredCount = blueprints.filter((item) => item.required === true).length;
    return {
      status: blueprints.length ? "passed" : "blocked",
      blockers: blueprints.length ? [] : ["baseline_resource_blueprints_missing"],
      outputSummary: {
        blueprintCount: blueprints.length,
        requiredBlueprintCount: requiredCount,
        resourceTypes: [...new Set(blueprints.map((item) => item.resource_type).filter(Boolean))],
        nextAction: blueprints.length ? "继续物化目标账户保底资源候选。" : "补齐游戏/路线保底资源蓝图。"
      }
    };
  }

  throw new Error(`launch_pack_skill_not_implemented:${skillKey}`);
}
