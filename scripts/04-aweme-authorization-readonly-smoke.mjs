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

function clientWithCandidates(candidates, { status = "passed" } = {}) {
  return {
    credentialState() {
      return { status: "ready", blockers: [] };
    },
    async get({ label, endpoint, summarize }) {
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
        requestFieldManifest: { fieldNames: ["advertiser_id", "filtering", "page", "page_size"], rawQueryStored: false },
        summary: status === "passed" ? summarize(payload) : {},
        gap: status === "passed" ? "" : "smoke_probe_failed"
      };
    }
  };
}

function bundle({ existingAuthorization = {} } = {}) {
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
          contract_version: "test"
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

const result = {
  status: "passed",
  singleStatus: single.outputSummary.awemeAuthorizationStatus,
  multipleBlockers: multiple.blockers,
  noActiveBlockers: none.blockers,
  inactiveBlockers: inactive.blockers,
  probeFailedBlockers: probeFailed.blockers,
  payloadAwemeBlockers: payload.blockers.filter((item) => item.includes("aweme")),
  noRealPlatformWrite: true
};
assertNoSensitiveLeak(result);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
