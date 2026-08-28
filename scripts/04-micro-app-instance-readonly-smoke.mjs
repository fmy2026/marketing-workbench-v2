import { runOceanEngineBaselineResourceProbes } from "../src/platforms/oceanengineReadonlyAdapter.mjs";
import {
  evaluateMicroAppInstanceReadiness,
  runMicroAppInstanceReadonlySkill
} from "../src/workflows/skills/oe3/04-micro-app-instance-readiness.mjs";
import { evaluateStdProjectCreatePreflight } from "../src/workflows/skills/oe3/05-create-preflight-diagnostics.mjs";
import { assertNoSensitiveLeak } from "../src/workflows/skills/oe3/00-index.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readyResource(resourceType, overrides = {}) {
  return {
    resource_id: `AR-SMOKE-${resourceType}`,
    resource_type: resourceType,
    resource_name: `smoke ${resourceType}`,
    platform_resource_id: "100000000001",
    source_asset_id: `ASSET-${resourceType}`,
    visibility_status: "visible",
    readback_status: "readback_verified",
    required: true,
    metadata: {
      readonly_check: { status: "passed" }
    },
    ...overrides
  };
}

function bundle({ candidateId = "7434750138926546994", microResource = null } = {}) {
  return {
    job: {
      job_id: "JOB-SMOKE-MICRO-APP-READONLY",
      route_id: "oceanengine_3_byte_mini_game",
      game_code: "JSZC",
      advertiser_id: "1871922346964041",
      source_usage: "test_run"
    },
    account: { auth_status: "ready" },
    platformApp: {
      app_id: "tte95a9fe77665844607",
      app_name: "巨兽战场",
      app_type: "byte_mini_game",
      status: "active",
      metadata: {
        micro_app_instance_id: candidateId,
        micro_app_instance_id_source: "reference_only_old_project_then_stored_in_v2",
        runtime_field_status: "ready"
      }
    },
    defaults: {
      objective: "AD_CONVERT_TYPE_PAY",
      deep_objective: "AD_CONVERT_TYPE_PURCHASE_ROI_7D",
      raw_defaults: {
        optimization: {
          external_action: "AD_CONVERT_TYPE_PAY",
          deep_external_action: "AD_CONVERT_TYPE_PURCHASE_ROI_7D"
        },
        payload_defaults: {
          project: {
            landing_type: "MICRO_GAME",
            ad_type: "ALL",
            delivery_mode: "PROCEDURAL",
            marketing_goal: "VIDEO_AND_IMAGE"
          },
          strategy: {
            delivery_type: "NORMAL",
            delivery_medium: "BYTE_GAME",
            micro_promotion_type: "BYTE_GAME"
          }
        },
        official_create_field_contract: {
          instance_id_create_evidence: {
            field_name_verified: true,
            field_type_verified: true,
            applicability_verified: true,
            long_id_transport_verified: false,
            long_id_transport_strategy: "unverified"
          }
        }
      }
    },
    resources: [
      readyResource("event_asset"),
      microResource || readyResource("micro_app_instance", {
        platform_resource_id: "",
        visibility_status: "needs_confirmation",
        readback_status: "not_checked",
        metadata: {
          readonly_check: { status: "baseline_candidate" }
        }
      })
    ]
  };
}

function repoStub() {
  const state = { resourceUpdates: [], evidence: [] };
  return {
    state,
    async upsertEvidence(evidence) {
      state.evidence.push(evidence);
    },
    async updateAccountResourceReadonly(update) {
      state.resourceUpdates.push(update);
    }
  };
}

function clientStub({ goalPassed = true } = {}) {
  return {
    credentialState() {
      return { status: "ready", blockers: [] };
    },
    async get({ label, endpoint, summarize }) {
      const payload = goalPassed ? {
        data: {
          list: [
            {
              optimization_name: "付费",
              external_action: "AD_CONVERT_TYPE_PAY",
              deep_external_action: "AD_CONVERT_TYPE_PURCHASE_ROI_7D"
            }
          ]
        },
        code: "0",
        request_id: "smoke-request"
      } : {
        data: { list: [] },
        code: "0",
        request_id: "smoke-request"
      };
      return {
        label,
        endpoint: endpoint.replace(/^\/open_api\/v3\.0\//, "").replace(/\/$/g, ""),
        status: "passed",
        httpStatus: 200,
        apiCode: "0",
        requestIdPresent: true,
        dataPresent: true,
        responseHash: "sha256:smoke",
        summary: summarize(payload)
      };
    }
  };
}

function baselineClientStub() {
  return {
    credentialState() {
      return { status: "ready", blockers: [] };
    },
    async get({ label, endpoint, summarize }) {
      const payload = {
        data: {
          list: [],
          advertiser_avatar: { status: "AUDIT_PASS", width: 300, height: 300 },
          image_list: [],
          infos: []
        },
        code: "0",
        request_id: "smoke-request"
      };
      return {
        label,
        endpoint,
        status: "passed",
        httpStatus: 200,
        apiCode: "0",
        requestIdPresent: true,
        dataPresent: true,
        responseHash: "sha256:smoke",
        summary: typeof summarize === "function" ? summarize(payload) : {}
      };
    }
  };
}

const passRepo = repoStub();
const passResult = await runMicroAppInstanceReadonlySkill({
  repo: passRepo,
  bundle: bundle(),
  client: clientStub(),
  allowReadonlyDependency: true
});
assert(passResult.status === "passed", "target optimized_goal hit should pass");
assert(passRepo.state.resourceUpdates[0].visibilityStatus === "visible", "target hit should mark visible");
assert(passRepo.state.resourceUpdates[0].readbackStatus === "readback_verified", "target hit should mark readback_verified");
assert(passRepo.state.resourceUpdates[0].platformResourceId === "7434750138926546994", "target hit should store candidate id as platform resource id");
assert(passResult.outputSummary.node5_create_transport_blocked === true, "Node 5 transport blocker should remain visible in summary");

const missingRepo = repoStub();
const missingResult = await runMicroAppInstanceReadonlySkill({
  repo: missingRepo,
  bundle: bundle({ candidateId: "" }),
  client: clientStub(),
  allowReadonlyDependency: true
});
assert(missingResult.status === "blocked", "missing candidate should block");
assert(missingResult.blockers.includes("micro_app_instance_id_missing"), "missing candidate blocker should be present");
assert(!missingRepo.state.resourceUpdates[0]?.visibilityStatus, "missing candidate should not mark visible");

const noGoalRepo = repoStub();
const noGoalResult = await runMicroAppInstanceReadonlySkill({
  repo: noGoalRepo,
  bundle: bundle(),
  client: clientStub({ goalPassed: false }),
  allowReadonlyDependency: true
});
assert(noGoalResult.status === "blocked", "missing optimized goal should block");
assert(noGoalResult.blockers.includes("micro_app_objective_not_available"), "objective blocker should be present");
assert(!noGoalRepo.state.resourceUpdates[0]?.visibilityStatus, "missing goal should not mark visible");

const readyWithoutLongIdContract = evaluateMicroAppInstanceReadiness({
  bundle: bundle({
    microResource: readyResource("micro_app_instance", {
      platform_resource_id: "7434750138926546994"
    })
  })
});
assert(readyWithoutLongIdContract.status === "passed", "Node 4 resource readiness should not require JSON number transport proof");
assert(readyWithoutLongIdContract.outputSummary.node5CreateTransportBlocked === true, "transport gap should remain a Node 5 summary fact");

const longIdTransportPreflight = evaluateStdProjectCreatePreflight({
  requestFieldManifest: {
    instanceIdCreateEvidence: {
      status: "blocked",
      candidateField: "instance_id",
      fieldNameVerified: true,
      createFieldType: "number",
      fieldTypeVerified: true,
      applicabilityVerified: true,
      longIdTransportVerified: false,
      longPlatformId: true,
      blockers: ["instance_id_long_id_transport_not_verified"]
    }
  }
});
assert(longIdTransportPreflight.blocker_codes.includes("instance_id_long_id_transport_not_verified"), "Node 5 must still block 19-digit JSON number transport");

const baseline = await runOceanEngineBaselineResourceProbes({
  bundle: {
    ...bundle(),
    resources: [
      readyResource("avatar"),
      readyResource("event_asset"),
      readyResource("product_image"),
      readyResource("brand_info"),
      readyResource("micro_app_instance", {
        platform_resource_id: "",
        visibility_status: "needs_confirmation",
        readback_status: "not_checked"
      })
    ]
  },
  client: baselineClientStub()
});
assert(!baseline.resourceUpdates.some((item) => item.resourceType === "micro_app_instance"), "baseline probes must not update micro_app_instance from local app_id");

const output = {
  status: "passed",
  targetHitUpdatesResource: true,
  missingCandidateBlocked: true,
  missingGoalBlocked: true,
  baselineLocalAppIdFalsePositiveRemoved: true,
  node4ResourceSplitFromNode5Transport: true,
  noRealPlatformWrite: true,
  noTokenRefresh: true
};
assertNoSensitiveLeak(output);
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
