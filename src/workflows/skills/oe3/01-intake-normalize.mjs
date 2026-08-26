import { has } from "./04-resource-verifiers.mjs";

export function runIntakeNormalizeSkill({ bundle }) {
  const missingFields = ["route_id", "game_code", "advertiser_id"].filter((field) => !has(bundle.job?.[field]));
  return {
    status: missingFields.length ? "blocked" : "passed",
    blockers: missingFields.map((field) => `missing_${field}`),
    outputSummary: {
      routeId: bundle.job.route_id || "",
      gameCode: bundle.job.game_code || "",
      advertiserId: bundle.job.advertiser_id || "",
      missingFields
    }
  };
}
