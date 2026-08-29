import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import { assertNoSensitiveLeak } from "../src/workflows/skills/oe3/00-index.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const repo = new PostgresRepository();
const target = {
  routeId: "oceanengine_3_byte_mini_game",
  gameCode: "JSZC",
  advertiserId: "1871922175825993"
};

const context = await repo.getCoreContext(target);
assert(context, "core_context_missing");
assert(context.defaults?.raw_defaults?.aweme_id_baseline?.source === "tools/aweme_auth_list", "aweme_baseline_missing");
assert(context.defaults.raw_defaults.aweme_id_baseline.fallback_forbidden === true, "aweme_baseline_fallback_not_forbidden");
assert(context.account && Object.prototype.hasOwnProperty.call(context.account, "aweme_authorization"), "advertiser_aweme_authorization_column_missing");

const readiness = await repo.getAdvertiserAwemeAuthorizationReadiness(target);
assert(readiness, "aweme_readiness_view_missing");
assert(readiness.aweme_id_baseline?.source === "tools/aweme_auth_list", "aweme_readiness_baseline_missing");
assert(typeof readiness.aweme_id_ready === "boolean", "aweme_readiness_boolean_missing");
assert(typeof readiness.blocker_code === "string", "aweme_readiness_blocker_missing");

const result = {
  status: "passed",
  routeId: target.routeId,
  gameCode: target.gameCode,
  advertiserId: target.advertiserId,
  baselineSource: readiness.aweme_id_baseline.source,
  selectionStatus: readiness.selection_status,
  activeCandidateCount: readiness.active_candidate_count,
  awemeIdReady: readiness.aweme_id_ready,
  blockerCode: readiness.blocker_code,
  noRealPlatformWrite: true
};
assertNoSensitiveLeak(result);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
