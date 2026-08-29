import { assertNoSensitiveLeak } from "../src/workflows/skills/oe3/00-index.mjs";
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

function clientWithCandidates(candidates, { status = "passed", calls = [] } = {}) {
  return {
    credentialState() {
      return { status: "ready", blockers: [] };
    },
    async get(args) {
      const { label, endpoint, summarize } = args;
      calls.push(args);
      const payload = { data: { list: candidates } };
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

function bundle({ existingAuthorization = {}, awemeBaseline = {} } = {}) {
  return {
    job: {
      job_id: "JOB-SMOKE-AWEME-AUTHORIZATION",
      route_id: "oceanengine_3_byte_mini_game",
      game_code: "JSZC",
      advertiser_id: "8990000000000001",
      source_usage: "test_run",
      object_type: "std_project"
    },
    account: {
      advertiser_id: "8990000000000001",
      aweme_authorization: existingAuthorization
    },
    defaults: {
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
          }
        },
        aweme_id_baseline: {
          required_when: { native_type: "AWEME" },
          payload_path: "aweme_id",
          source: "tools/aweme_auth_list",
          auth_type: "AWEME_ACCOUNT",
          accepted_auth_status: ["AUTHRIZED", "AUTHORIZED"],
          selection_policy: "single_active_auto_select_else_manual_select",
          fallback_forbidden: true,
          contract_version: "test",
          ...awemeBaseline
        },
        official_create_field_contract: {
          field_rules: {
            aweme_id: { evidence_level: "official_direct", send_policy: "send" }
          }
        }
      }
    },
    draft: {
      project_name: "245791_N_JSZC_HUNT_PAY7DROI_平台定向不限_P01_20260829",
      payload_summary: {
        advertiser_id: "8990000000000001",
        project_name: "245791_N_JSZC_HUNT_PAY7DROI_平台定向不限_P01_20260829",
        objective: "AD_CONVERT_TYPE_PAY",
        deep_objective: "AD_CONVERT_TYPE_PURCHASE_ROI_7D"
      }
    },
    resources: [
      {
        resource_type: "avatar",
        platform_resource_id: "web.business.image/smoke-avatar",
        visibility_status: "visible",
        readback_status: "readback_verified",
        metadata: {
          default_aweme_id: "web.business.image/smoke-avatar"
        }
      }
    ]
  };
}

const activeOne = [{
  aweme_id: "1000000000000000001",
  aweme_name: "smoke aweme",
  auth_type: "AWEME_ACCOUNT",
  auth_status: "AUTHRIZED"
}];
const activeTwo = [
  ...activeOne,
  {
    aweme_id: "1000000000000000002",
    aweme_name: "smoke aweme 2",
    auth_type: "AWEME_ACCOUNT",
    auth_status: "AUTHORIZED"
  }
];
const jszcDefaultAwemeId = "57018827026";
const fixedBaseline = {
  selection_policy: "fixed_game_default_account_verify",
  default_aweme_id: jszcDefaultAwemeId,
  default_aweme_id_hash: "sha256:6e5a979b1bb07720edf8d98ba7b065aa54bfe6bb9ba52a1b6eb3594bd42b2e0d",
  contract_version: "test-fixed"
};
const fixedDefaultCandidate = [{
  aweme_id: jszcDefaultAwemeId,
  aweme_name: "JSZC default aweme",
  auth_type: "AWEME_ACCOUNT",
  auth_status: "AUTHRIZED"
}];

const singleRepo = makeRepo();
const single = await runAwemeAuthorizationReadonlySkill({
  repo: singleRepo,
  bundle: bundle(),
  client: clientWithCandidates(activeOne),
  allowReadonlyDependency: true
});
assert(single.status === "passed", "single_candidate_should_pass");
assert(singleRepo.writes.at(-1).authorization.selection_status === "auto_selected", "single_candidate_should_auto_select");

const multipleRepo = makeRepo();
const multiple = await runAwemeAuthorizationReadonlySkill({
  repo: multipleRepo,
  bundle: bundle(),
  client: clientWithCandidates(activeTwo),
  allowReadonlyDependency: true
});
assert(multiple.status === "blocked", "multiple_candidates_should_block");
assert(multiple.blockers.includes("aweme_auth_manual_selection_required"), "manual_selection_blocker_missing");

const manualRepo = makeRepo();
const manual = await runAwemeAuthorizationReadonlySkill({
  repo: manualRepo,
  bundle: bundle({
    existingAuthorization: {
      selected_aweme_id: "1000000000000000002",
      selection_status: "manual_selected"
    }
  }),
  client: clientWithCandidates(activeTwo),
  allowReadonlyDependency: true
});
assert(manual.status === "passed", "manual_selected_active_candidate_should_pass");
assert(manualRepo.writes.at(-1).authorization.selection_status === "manual_selected", "manual_selection_should_be_preserved");

const noneRepo = makeRepo();
const none = await runAwemeAuthorizationReadonlySkill({
  repo: noneRepo,
  bundle: bundle(),
  client: clientWithCandidates([]),
  allowReadonlyDependency: true
});
assert(none.status === "blocked", "no_active_candidate_should_block");
assert(none.blockers.includes("aweme_auth_no_active"), "no_active_blocker_missing");

const inactiveRepo = makeRepo();
const inactive = await runAwemeAuthorizationReadonlySkill({
  repo: inactiveRepo,
  bundle: bundle({
    existingAuthorization: {
      selected_aweme_id: "1000000000000099999",
      selection_status: "manual_selected"
    }
  }),
  client: clientWithCandidates(activeTwo),
  allowReadonlyDependency: true
});
assert(inactive.status === "blocked", "inactive_selection_should_block");
assert(inactive.blockers.includes("aweme_auth_selected_inactive"), "selected_inactive_blocker_missing");

const probeRepo = makeRepo();
const probeFailed = await runAwemeAuthorizationReadonlySkill({
  repo: probeRepo,
  bundle: bundle(),
  client: clientWithCandidates(activeOne, { status: "blocked" }),
  allowReadonlyDependency: true
});
assert(probeFailed.status === "blocked", "probe_failure_should_block");
assert(probeFailed.blockers.includes("aweme_auth_probe_failed"), "probe_failure_blocker_missing");

const fixedCalls = [];
const fixedRepo = makeRepo();
const fixedDefault = await runAwemeAuthorizationReadonlySkill({
  repo: fixedRepo,
  bundle: bundle({ awemeBaseline: fixedBaseline }),
  client: clientWithCandidates(fixedDefaultCandidate, { calls: fixedCalls }),
  allowReadonlyDependency: true
});
assert(fixedDefault.status === "passed", "fixed_default_authorized_should_pass");
assert(fixedDefault.outputSummary.awemeAuthorizationStatus === "default_authorized", "fixed_default_status_should_be_default_authorized");
assert(fixedRepo.writes.at(-1).authorization.selected_aweme_id === jszcDefaultAwemeId, "fixed_default_selected_id_mismatch");
assert(fixedRepo.writes.at(-1).authorization.default_aweme_authorized === true, "fixed_default_authorized_flag_missing");
assert(fixedCalls.length === 1, "fixed_default_should_query_once");
const fixedFiltering = JSON.parse(fixedCalls[0].query.filtering);
assert(Array.isArray(fixedFiltering.aweme_ids), "fixed_default_filtering_aweme_ids_missing");
assert(fixedFiltering.aweme_ids[0] === jszcDefaultAwemeId, "fixed_default_filtering_aweme_id_mismatch");
assert(fixedFiltering.auth_type === "AWEME_ACCOUNT", "fixed_default_filtering_auth_type_missing");

const fixedOtherRepo = makeRepo();
const fixedOther = await runAwemeAuthorizationReadonlySkill({
  repo: fixedOtherRepo,
  bundle: bundle({ awemeBaseline: fixedBaseline }),
  client: clientWithCandidates(activeOne),
  allowReadonlyDependency: true
});
assert(fixedOther.status === "blocked", "fixed_default_other_candidate_should_block");
assert(fixedOther.blockers.includes("aweme_default_not_returned"), "fixed_default_not_returned_blocker_missing");
assert(fixedOtherRepo.writes.at(-1).authorization.selection_status === "default_not_authorized", "fixed_other_status_should_be_not_authorized");

const fixedInactiveRepo = makeRepo();
const fixedInactive = await runAwemeAuthorizationReadonlySkill({
  repo: fixedInactiveRepo,
  bundle: bundle({ awemeBaseline: fixedBaseline }),
  client: clientWithCandidates([{
    ...fixedDefaultCandidate[0],
    auth_status: "INVALID"
  }]),
  allowReadonlyDependency: true
});
assert(fixedInactive.status === "blocked", "fixed_default_inactive_should_block");
assert(fixedInactive.blockers.includes("aweme_default_authorization_inactive"), "fixed_inactive_blocker_missing");

const fixedPayload = buildOe3StdProjectPayload({
  bundle: bundle({
    awemeBaseline: fixedBaseline,
    existingAuthorization: fixedRepo.writes.at(-1).authorization
  })
});
assert(fixedPayload.payload.aweme_id === jszcDefaultAwemeId, "fixed_payload_should_use_default_aweme_id");
assert(!fixedPayload.blockers.some((item) => item.includes("aweme")), "fixed_payload_should_have_no_aweme_blockers");

const fixedBypass = buildOe3StdProjectPayload({
  bundle: bundle({
    awemeBaseline: fixedBaseline,
    existingAuthorization: {
      ...fixedRepo.writes.at(-1).authorization,
      selected_aweme_id: "1000000000000000001",
      selected_aweme_id_hash: "sha256:wrong",
      active_candidates: activeOne,
      default_aweme_authorized: true,
      selection_status: "default_authorized",
      verified_at: new Date().toISOString()
    }
  })
});
assert(fixedBypass.payload.aweme_id === undefined || fixedBypass.payload.aweme_id === "", "fixed_bypass_payload_should_omit_aweme_id");
assert(fixedBypass.blockers.includes("aweme_default_selected_mismatch"), "fixed_bypass_should_block_default_mismatch");

const payload = buildOe3StdProjectPayload({
  bundle: bundle({
    existingAuthorization: {
      selected_aweme_id: "web.business.image/smoke-avatar",
      selection_status: "manual_selected",
      verified_at: new Date().toISOString(),
      active_candidates: [{ aweme_id: "web.business.image/smoke-avatar" }]
    }
  })
});
assert(payload.requestFieldManifest.awemeIdFromAvatar === false, "aweme_manifest_should_mark_not_from_avatar");
assert(payload.requestFieldManifest.awemeIdLooksLikeImageResource === true, "image_resource_shape_should_be_detected");
assert(payload.blockers.includes("aweme_id_invalid_shape:web_business_image_uri"), "image_resource_aweme_blocker_missing");

const preflight = evaluateStdProjectCreatePreflight({
  requestFieldManifest: payload.requestFieldManifest,
  payloadContractStatus: "blocked"
});
assert(preflight.blocker_codes.includes("aweme_id_invalid_shape:web_business_image_uri"), "preflight_aweme_shape_blocker_missing");

const fixedPreflight = evaluateStdProjectCreatePreflight({
  requestFieldManifest: fixedPayload.requestFieldManifest,
  payloadContractStatus: "blocked"
});
assert(!fixedPreflight.blocker_codes.some((item) => item.includes("aweme")), "fixed_preflight_should_accept_default_authorized_manifest");

const result = {
  status: "passed",
  singleStatus: single.outputSummary.awemeAuthorizationStatus,
  fixedDefaultStatus: fixedDefault.outputSummary.awemeAuthorizationStatus,
  fixedDefaultQueryCount: fixedCalls.length,
  fixedDefaultBlockers: fixedOther.blockers,
  fixedInactiveBlockers: fixedInactive.blockers,
  fixedPayloadAwemeIdHash: fixedPayload.requestFieldManifest.awemeIdHash,
  multipleBlockers: multiple.blockers,
  noActiveBlockers: none.blockers,
  inactiveBlockers: inactive.blockers,
  probeFailedBlockers: probeFailed.blockers,
  payloadAwemeBlockers: payload.blockers.filter((item) => item.includes("aweme")),
  noRealPlatformWrite: true
};
assertNoSensitiveLeak(result);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
