import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import { assertNoSensitiveLeak, sanitizeForPublic } from "../src/workflows/skills/oe3/00-contracts.mjs";
import { runAvatarSourcePrepareSkill } from "../src/workflows/skills/oe3/04-avatar-source-prepare.mjs";
import { runAvatarSubmitPlanSkill } from "../src/workflows/skills/oe3/04-avatar-submit-plan.mjs";

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || "" : "";
}

const advertiserId = argValue("--advertiser-id");
const routeId = argValue("--route-id") || "oceanengine_3_byte_mini_game";
const gameCode = argValue("--game-code") || "JSZC";
const executeRequested = process.argv.includes("--execute");

if (!advertiserId) {
  console.error(JSON.stringify({ status: "blocked", blockers: ["advertiser_id_required"] }, null, 2));
  process.exit(1);
}

const repo = new PostgresRepository();
const core = await repo.getCoreContext({ routeId, gameCode, advertiserId });
if (!core) {
  console.error(JSON.stringify({ status: "blocked", blockers: ["launch_context_not_found"] }, null, 2));
  process.exit(1);
}

const bundle = {
  ...core,
  job: {
    job_id: `AVATAR-DRY-RUN-${advertiserId}`,
    route_id: routeId,
    game_code: gameCode,
    advertiser_id: advertiserId,
    source_usage: "runtime_truth"
  }
};
const source = await runAvatarSourcePrepareSkill({ repo, bundle });
const refreshed = await repo.getCoreContext({ routeId, gameCode, advertiserId });
const plan = await runAvatarSubmitPlanSkill({
  repo,
  bundle: { ...refreshed, job: bundle.job }
});
const result = sanitizeForPublic({
  status: executeRequested ? "blocked" : plan.status,
  mode: "dry_run_only",
  advertiser_id: advertiserId,
  source: source.outputSummary,
  plan: plan.outputSummary,
  blockers: [...(source.blockers || []), ...(plan.blockers || []), ...(executeRequested ? ["avatar_platform_execute_not_implemented"] : [])],
  platform_write_called: false,
  token_refresh_called: false
});
assertNoSensitiveLeak(result);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
