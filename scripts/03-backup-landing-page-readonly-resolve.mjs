import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import { runBackupLandingPageReadinessSkill } from "../src/workflows/skills/oe3/03-landing-page-readiness.mjs";
import { normalizeResourceSkillResult } from "../src/workflows/skills/oe3/04-resource-action-registry.mjs";
import { assertNoSensitiveLeak } from "../src/workflows/skills/oe3/00-index.mjs";

const DEFAULTS = Object.freeze({
  routeId: "oceanengine_3_byte_mini_game",
  gameCode: "JSZC",
  advertiserId: "1871922175825993"
});

function arg(name, fallback = "") {
  const prefix = `${name}=`;
  const item = process.argv.slice(2).find((value) => value === name || value.startsWith(prefix));
  if (!item) return fallback;
  if (item === name) return "true";
  return item.slice(prefix.length);
}

async function main() {
  const target = {
    routeId: arg("--route-id", DEFAULTS.routeId),
    gameCode: arg("--game-code", DEFAULTS.gameCode),
    advertiserId: arg("--advertiser-id", DEFAULTS.advertiserId)
  };
  const repo = new PostgresRepository();
  const context = await repo.getCoreContext(target);
  const result = normalizeResourceSkillResult({
    resourceType: "backup_landing_page",
    result: runBackupLandingPageReadinessSkill({
      bundle: {
        ...context,
        job: {
          job_id: "CLI-BACKUP-LANDING-PAGE-READINESS",
          route_id: target.routeId,
          game_code: target.gameCode,
          advertiser_id: target.advertiserId,
          source_usage: "reference_only"
        }
      }
    })
  });
  const output = {
    status: result.status,
    blockers: result.blockers || [],
    outputSummary: result.outputSummary,
    noRealPlatformWrite: true,
    noTokenRefresh: true
  };
  assertNoSensitiveLeak(output);
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`backup_landing_page_readiness_check_failed:${error.message}\n`);
  process.exitCode = 1;
});
