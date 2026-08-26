import { materialItems } from "./resource-verifiers.mjs";

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
    const landingPage = bundle.backupLandingPage || {};
    const passed = Boolean(landingPage.landing_page_asset_id);
    return {
      status: passed ? "passed" : "blocked",
      blockers: passed ? [] : ["backup_landing_page_default_missing"],
      outputSummary: {
        landingPageAssetId: landingPage.landing_page_asset_id || "",
        siteId: landingPage.site_id || "",
        siteName: landingPage.site_name || "",
        urlHash: landingPage.url_hash || "",
        status: landingPage.status || "missing",
        sourceUsage: landingPage.source_usage || "",
        landingUrlPresent: landingPage.landing_url_present === true,
        landingUrlHttps: landingPage.landing_url_https === true
      }
    };
  }

  throw new Error(`launch_pack_skill_not_implemented:${skillKey}`);
}
