import { assertNoSensitiveLeak, hashValue } from "../src/workflows/skills/oe3/00-index.mjs";
import { runAwemeAuthorizationReadonlySkill } from "../src/workflows/skills/oe3/04-aweme-authorization-readonly.mjs";
import { buildOe3StdProjectPayload } from "../src/workflows/skills/oe3/05-payload.mjs";
import { evaluateStdProjectCreatePreflight } from "../src/workflows/skills/oe3/05-create-preflight-diagnostics.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function makeRepo() {
  const writes = [];
  const evidence = [];
  return {
    writes,
    evidence,
    async updateAdvertiserAwemeAuthorization(item) {
      writes.push(item);
    },
    async upsertEvidence(item) {
      evidence.push(item);
    }
  };
}

function assertNoLegacySelectionState(record = {}) {
  [
    "selection_status",
    "selection_policy",
    "selected_aweme_id",
    "selected_aweme_id_hash",
    "selected_display_name_summary",
    "selection_source",
    "selected_at",
    "active_candidates",
    "active_candidate_count",
    "default_aweme_authorized",
    "default_aweme_candidate_seen"
  ].forEach((key) => {
    assert(!Object.prototype.hasOwnProperty.call(record, key), `legacy_aweme_selection_key_present:${key}`);
  });
}

function clientWithRows(rows, { status = "passed", calls = [] } = {}) {
  return {
    credentialState() {
      return { status: "ready", blockers: [] };
    },
    async get(args) {
      const { label, endpoint, summarize } = args;
      calls.push(args);
      const payload = { data: { list: rows } };
      return {
        label,
        endpoint,
        status,
        httpStatus: status === "passed" ? 200 : 500,
        apiCode: status === "passed" ? "0" : "50000",
        requestIdPresent: true,
        dataPresent: true,
        responseHash: "sha256:aweme-smoke",
        requestFieldManifest: args.requestFieldManifest || { fieldNames: ["advertiser_id", "filtering", "page", "page_size"], rawQueryStored: false },
        summary: status === "passed" ? summarize(payload) : {},
        gap: status === "passed" ? "" : "smoke_probe_failed"
      };
    }
  };
}

const jszcDefaultAwemeId = "57018827026";
const jszcDefaultAwemeIdHash = hashValue(jszcDefaultAwemeId);
const advertiserId = "8990000000000001";

function fixedBaseline(overrides = {}) {
  return {
    version: "test_fixture:aweme-id-baseline",
    required_when: { native_type: "AWEME" },
    payload_path: "aweme_id",
    source: "tools/aweme_auth_list",
    auth_type: "AWEME_ACCOUNT",
    accepted_auth_status: ["AUTHRIZED", "AUTHORIZED"],
    verification_strategy: "fixed_game_default_account_verify",
    default_aweme_id: jszcDefaultAwemeId,
    default_aweme_id_hash: jszcDefaultAwemeIdHash,
    fallback_forbidden: true,
    contract_version: "test_fixture:aweme-id-fixed-default-account-verify-v2",
    ...overrides
  };
}

function bundle({ existingAuthorization = {}, awemeBaseline = fixedBaseline() } = {}) {
  return {
    job: {
      job_id: "JOB-SMOKE-AWEME-AUTHORIZATION",
      route_id: "oceanengine_3_byte_mini_game",
      game_code: "JSZC",
      advertiser_id: advertiserId,
      source_usage: "test_run",
      object_type: "std_project"
    },
    account: {
      advertiser_id: advertiserId,
      monitor_id: "245791",
      aweme_authorization: existingAuthorization
    },
    defaults: {
      objective: "AD_CONVERT_TYPE_PAY",
      deep_objective: "AD_CONVERT_TYPE_PURCHASE_ROI_7D",
      deep_bid_type: "ROI_COEFFICIENT",
      budget: 300,
      bid: 10,
      roi_goal: 1.2,
      raw_defaults: {
        payload_defaults: {
          project: {
            native_type: "AWEME",
            ad_type: "ALL",
            landing_type: "MICRO_GAME",
            marketing_goal: "VIDEO_AND_IMAGE",
            delivery_mode: "PROCEDURAL"
          },
          strategy: {
            delivery_type: "NORMAL",
            delivery_medium: "BYTE_GAME",
            micro_promotion_type: "BYTE_GAME",
            bid_type: "NO_BID",
            budget_mode: "BUDGET_MODE_DAY",
            pricing: "PRICING_OCPM",
            audience_type: "CUSTOM"
          },
          schedule: {
            schedule_type: "SCHEDULE_FROM_NOW"
          },
          targeting: {
            district: "NONE",
            gender: "GENDER_UNLIMITED",
            age: [],
            converted_time_duration: "SIX_MONTH",
            hide_if_converted: "NO_EXCLUDE",
            interest_action_mode: "UNLIMITED"
          },
          product: {
            selling_points: ["快速开荒"],
            call_to_action_buttons: ["立即试玩"],
            anchor_related_type: "AUTO"
          },
          contract_mapping: {
            optimized_goal_query_instance_field: "micro_app_instance_id",
            optimized_goal_query_app_field: "mini_program_id",
            mini_game_instance_candidate_create_field: "instance_id"
          }
        },
        aweme_id_baseline: awemeBaseline,
        official_create_field_contract: {
          field_rules: {
            aweme_id: { evidence_level: "official_direct", send_policy: "send" }
          }
        }
      }
    },
    game: {
      game_name: "JSZC",
      product_name: "JSZC",
      brand_name: "JSZC"
    },
    platformApp: {
      id: "GPA-JSZC-OE-BYTE-MINI-GAME",
      app_id: "tt0000000000000000"
    },
    draft: {
      project_name: "245791_N_JSZC_HUNT_PAY7DROI_平台定向不限_P01_20260829",
      payload_summary: {
        advertiser_id: advertiserId,
        project_name: "245791_N_JSZC_HUNT_PAY7DROI_平台定向不限_P01_20260829",
        objective: "AD_CONVERT_TYPE_PAY",
        deep_objective: "AD_CONVERT_TYPE_PURCHASE_ROI_7D"
      }
    },
    resources: []
  };
}

async function runCase(name, rows, expectedStatus, expectedBlocker = "") {
  const repo = makeRepo();
  const calls = [];
  const result = await runAwemeAuthorizationReadonlySkill({
    repo,
    bundle: bundle(),
    client: clientWithRows(rows, { calls }),
    allowReadonlyDependency: true
  });
  const record = repo.writes.at(-1).authorization;
  assert(result.outputSummary.verificationStatus === expectedStatus, `${name}_summary_status_mismatch`);
  assert(record.verification_status === expectedStatus, `${name}_record_status_mismatch`);
  assertNoLegacySelectionState(record);
  assert(calls.length === 1, `${name}_should_query_once`);
  const filtering = JSON.parse(calls[0].query.filtering);
  assert(Array.isArray(filtering.aweme_ids), `${name}_filtering_aweme_ids_missing`);
  assert(filtering.aweme_ids[0] === jszcDefaultAwemeId, `${name}_filtering_default_id_mismatch`);
  assert(filtering.auth_type === "AWEME_ACCOUNT", `${name}_filtering_auth_type_missing`);
  if (expectedBlocker) assert(result.blockers.includes(expectedBlocker), `${name}_blocker_missing`);
  return { result, record, calls };
}

const authorized = await runCase("authorized", [{
  advertiser_id: advertiserId,
  aweme_id: jszcDefaultAwemeId,
  aweme_name: "JSZC default aweme",
  auth_type: "AWEME_ACCOUNT",
  auth_status: "AUTHRIZED"
}], "authorized");

await runCase("not_authorized", [], "not_authorized", "aweme_default_not_authorized");

await runCase("inactive", [{
  advertiser_id: advertiserId,
  aweme_id: jszcDefaultAwemeId,
  aweme_name: "JSZC default aweme",
  auth_type: "AWEME_ACCOUNT",
  auth_status: "INVALID"
}], "inactive", "aweme_default_authorization_inactive");

await runCase("scope_mismatch", [{
  advertiser_id: "8990000000000099",
  aweme_id: jszcDefaultAwemeId,
  aweme_name: "JSZC default aweme",
  auth_type: "AWEME_ACCOUNT",
  auth_status: "AUTHORIZED"
}], "scope_mismatch", "aweme_auth_account_scope_mismatch");

await runCase("default_mismatch", [{
  advertiser_id: advertiserId,
  aweme_id: "1000000000000000001",
  aweme_name: "other aweme",
  auth_type: "AWEME_ACCOUNT",
  auth_status: "AUTHORIZED"
}], "default_mismatch", "aweme_default_not_returned");

const failedRepo = makeRepo();
const failed = await runAwemeAuthorizationReadonlySkill({
  repo: failedRepo,
  bundle: bundle(),
  client: clientWithRows([], { status: "blocked" }),
  allowReadonlyDependency: true
});
assert(failed.status === "blocked", "probe_failure_should_block");
assert(failed.blockers.includes("aweme_auth_probe_failed"), "probe_failure_blocker_missing");
assert(failedRepo.writes.at(-1).authorization.verification_status === "probe_failed", "probe_failure_status_mismatch");
assertNoLegacySelectionState(failedRepo.writes.at(-1).authorization);

const missingBaselineRepo = makeRepo();
const missingBaseline = await runAwemeAuthorizationReadonlySkill({
  repo: missingBaselineRepo,
  bundle: bundle({ awemeBaseline: fixedBaseline({ default_aweme_id: "", default_aweme_id_hash: "" }) }),
  client: clientWithRows([]),
  allowReadonlyDependency: true
});
assert(missingBaseline.status === "blocked", "missing_default_should_block");
assert(missingBaseline.blockers.includes("aweme_id_baseline_missing_or_incomplete"), "missing_default_blocker_missing");
assert(missingBaselineRepo.writes.at(-1).authorization.verification_status === "baseline_incomplete", "missing_default_status_mismatch");
assertNoLegacySelectionState(missingBaselineRepo.writes.at(-1).authorization);

const fixedPayload = buildOe3StdProjectPayload({
  bundle: bundle({ existingAuthorization: authorized.record })
});
assert(fixedPayload.payload.aweme_id === jszcDefaultAwemeId, "payload_should_use_game_default_aweme_id");
assert(!fixedPayload.blockers.some((item) => item.includes("aweme")), "payload_should_have_no_aweme_blockers");
assert(fixedPayload.requestFieldManifest.awemeIdSource === "postgres:mwb.game_route_defaults.raw_defaults.aweme_id_baseline.default_aweme_id", "aweme_source_should_be_game_default");
assert(fixedPayload.requestFieldManifest.awemeAuthorization.status === "authorized", "manifest_authorization_status_mismatch");
assert(fixedPayload.requestFieldManifest.awemeAuthorization.defaultHashMatches === true, "manifest_default_hash_mismatch");

const staleJobPayload = buildOe3StdProjectPayload({
  bundle: bundle({
    existingAuthorization: {
      ...authorized.record,
      verified_by_job_id: "JOB-SMOKE-OTHER"
    }
  })
});
assert(!staleJobPayload.payload.aweme_id, "stale_job_payload_should_omit_aweme_id");
assert(staleJobPayload.blockers.includes("aweme_auth_job_scope_mismatch"), "stale_job_should_block");

const hashMismatchPayload = buildOe3StdProjectPayload({
  bundle: bundle({
    existingAuthorization: {
      ...authorized.record,
      default_aweme_id_hash: hashValue("1000000000000000001")
    }
  })
});
assert(!hashMismatchPayload.payload.aweme_id, "hash_mismatch_payload_should_omit_aweme_id");
assert(hashMismatchPayload.blockers.includes("aweme_default_hash_mismatch"), "hash_mismatch_should_block");

const fixedPreflight = evaluateStdProjectCreatePreflight({
  requestFieldManifest: fixedPayload.requestFieldManifest,
  payloadContractStatus: "blocked"
});
assert(!fixedPreflight.blocker_codes.some((item) => item.includes("aweme")), "preflight_should_accept_authorized_default_manifest");

const stalePreflight = evaluateStdProjectCreatePreflight({
  requestFieldManifest: staleJobPayload.requestFieldManifest,
  payloadContractStatus: "blocked"
});
assert(stalePreflight.blocker_codes.includes("aweme_auth_job_scope_mismatch"), "preflight_should_reject_stale_job_authorization");

const result = {
  status: "passed",
  authorizedStatus: authorized.result.outputSummary.verificationStatus,
  fixedDefaultQueryCount: authorized.calls.length,
  fixedPayloadAwemeIdHash: fixedPayload.requestFieldManifest.awemeIdHash,
  staleJobBlockers: staleJobPayload.blockers.filter((item) => item.includes("aweme")),
  hashMismatchBlockers: hashMismatchPayload.blockers.filter((item) => item.includes("aweme")),
  noRealPlatformWrite: true
};
assertNoSensitiveLeak(result);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
