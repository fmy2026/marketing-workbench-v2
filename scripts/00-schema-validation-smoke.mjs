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
assert(context.defaults.raw_defaults.aweme_id_baseline.verification_strategy === "fixed_game_default_account_verify", "jszc_aweme_fixed_default_strategy_missing");
assert(!Object.prototype.hasOwnProperty.call(context.defaults.raw_defaults.aweme_id_baseline, "selection_policy"), "aweme_baseline_legacy_selection_policy_present");
assert(context.defaults.raw_defaults.aweme_id_baseline.default_aweme_id === "57018827026", "jszc_aweme_fixed_default_id_missing");
assert(context.defaults.raw_defaults.aweme_id_baseline.default_aweme_id_hash === "sha256:6e5a979b1bb07720edf8d98ba7b065aa54bfe6bb9ba52a1b6eb3594bd42b2e0d", "jszc_aweme_fixed_default_hash_missing");
assert(context.account && Object.prototype.hasOwnProperty.call(context.account, "aweme_authorization"), "advertiser_aweme_authorization_column_missing");

const readiness = await repo.getAdvertiserAwemeAuthorizationReadiness(target);
assert(readiness, "aweme_readiness_view_missing");
assert(readiness.required === true, "aweme_readiness_required_missing");
assert(readiness.configured === true, "aweme_readiness_configured_missing");
assert(readiness.default_aweme_id_hash === "sha256:6e5a979b1bb07720edf8d98ba7b065aa54bfe6bb9ba52a1b6eb3594bd42b2e0d", "aweme_readiness_default_hash_missing");
assert(typeof readiness.ready === "boolean", "aweme_readiness_boolean_missing");
assert(typeof readiness.blocker_code === "string", "aweme_readiness_blocker_missing");
[
  "aweme_id_baseline",
  "selection_status",
  "selection_policy",
  "fixed_default_policy",
  "active_candidate_count",
  "selected_aweme_id_present",
  "selected_aweme_id_hash",
  "default_aweme_account_authorized"
].forEach((key) => {
  assert(!Object.prototype.hasOwnProperty.call(readiness, key), `legacy_aweme_readiness_field_present:${key}`);
});
assert(typeof repo.selectAdvertiserAwemeAuthorization === "undefined", "legacy_aweme_selection_repository_method_present");

const result = {
  status: "passed",
  routeId: target.routeId,
  gameCode: target.gameCode,
  advertiserId: target.advertiserId,
  required: readiness.required,
  configured: readiness.configured,
  verificationStatus: readiness.verification_status,
  defaultAwemeIdHash: readiness.default_aweme_id_hash,
  awemeIdReady: readiness.ready,
  blockerCode: readiness.blocker_code,
  noRealPlatformWrite: true
};
assertNoSensitiveLeak(result);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
