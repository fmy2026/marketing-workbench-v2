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
assert(context.defaults.raw_defaults.aweme_id_baseline.selection_policy === "fixed_game_default_account_verify", "jszc_aweme_fixed_default_policy_missing");
assert(context.defaults.raw_defaults.aweme_id_baseline.default_aweme_id === "57018827026", "jszc_aweme_fixed_default_id_missing");
assert(context.defaults.raw_defaults.aweme_id_baseline.default_aweme_id_hash === "sha256:6e5a979b1bb07720edf8d98ba7b065aa54bfe6bb9ba52a1b6eb3594bd42b2e0d", "jszc_aweme_fixed_default_hash_missing");
assert(context.account && Object.prototype.hasOwnProperty.call(context.account, "aweme_authorization"), "advertiser_aweme_authorization_column_missing");

const readiness = await repo.getAdvertiserAwemeAuthorizationReadiness(target);
assert(readiness, "aweme_readiness_view_missing");
assert(readiness.aweme_id_baseline?.source === "tools/aweme_auth_list", "aweme_readiness_baseline_missing");
assert(readiness.selection_policy === "fixed_game_default_account_verify", "aweme_readiness_fixed_policy_missing");
assert(readiness.fixed_default_policy === true, "aweme_readiness_fixed_flag_missing");
assert(readiness.default_aweme_id_configured === true, "aweme_readiness_default_configured_missing");
assert(readiness.default_aweme_id_hash === "sha256:6e5a979b1bb07720edf8d98ba7b065aa54bfe6bb9ba52a1b6eb3594bd42b2e0d", "aweme_readiness_default_hash_missing");
assert(typeof readiness.aweme_id_ready === "boolean", "aweme_readiness_boolean_missing");
assert(typeof readiness.blocker_code === "string", "aweme_readiness_blocker_missing");

let fixedSelectionRejected = false;
try {
  await repo.selectAdvertiserAwemeAuthorization({
    ...target,
    selectedAwemeId: "57018827026",
    selectedDisplayName: "schema smoke"
  });
} catch (error) {
  fixedSelectionRejected = error.message === "aweme_selection_forbidden_fixed_default_policy";
}
assert(fixedSelectionRejected, "fixed_aweme_policy_should_reject_manual_selection");

const result = {
  status: "passed",
  routeId: target.routeId,
  gameCode: target.gameCode,
  advertiserId: target.advertiserId,
  baselineSource: readiness.aweme_id_baseline.source,
  selectionStatus: readiness.selection_status,
  selectionPolicy: readiness.selection_policy,
  fixedDefaultPolicy: readiness.fixed_default_policy,
  defaultAwemeIdConfigured: readiness.default_aweme_id_configured,
  defaultAwemeIdHash: readiness.default_aweme_id_hash,
  activeCandidateCount: readiness.active_candidate_count,
  awemeIdReady: readiness.aweme_id_ready,
  blockerCode: readiness.blocker_code,
  fixedSelectionRejected,
  noRealPlatformWrite: true
};
assertNoSensitiveLeak(result);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
