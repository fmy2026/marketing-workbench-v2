import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildDmpPushRequestPlan,
  dmpPushTransportPayload,
  ensureDmpBaselineForTargetOnce
} from "../src/platforms/oceanengineDmpExecutor.mjs";
import { DMP_ENSURE_CONFIRM_VALUE } from "../src/workflows/dmpExecutionScope.mjs";

function assert(value, message) {
  if (!value) throw new Error(message);
}

function response(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

const sourceAdvertiserId = "1871922153496588";
const targetAdvertiserId = "1871922346964041";
const jobId = "JOB-DMP-EXECUTOR-SMOKE";
const packageSetId = "DMP-JSZC-HUNT-CONVERTED-EXCLUDE-BASELINE-001";
const ids = [
  "482709313",
  "479197805",
  "477503385",
  "477464681",
  "477250343",
  "476398053",
  "472360629",
  "470051114",
  "465498363",
  "467421696"
];

const plans = ids.map((id) => {
  const plan = buildDmpPushRequestPlan({ sourceAdvertiserId, targetAdvertiserId, customAudienceId: id });
  return {
    push_plan_id: `DMPP-${jobId}-${id}`,
    job_id: jobId,
    package_set_id: packageSetId,
    custom_audience_id: id,
    source_advertiser_id: sourceAdvertiserId,
    target_advertiser_id: targetAdvertiserId,
    action_type: "ensure_resource:dmp_audience_package",
    endpoint: plan.endpoint,
    plan_status: "planned",
    request_hash: plan.requestHash,
    request_field_manifest: plan.requestFieldManifest,
    evidence_ref: "",
    metadata: {}
  };
});

const transportShape = dmpPushTransportPayload({
  sourceAdvertiserId,
  targetAdvertiserId,
  customAudienceId: ids[0]
});
assert(typeof transportShape.advertiser_id === "number", "dmp_transport_source_should_be_number");
assert(typeof transportShape.custom_audience_id === "number", "dmp_transport_audience_should_be_number");
assert(typeof transportShape.target_advertiser_ids[0] === "number", "dmp_transport_target_should_be_number");

function makeRepo({ statefulPlans = plans.map((item) => ({ ...item })) } = {}) {
  const actions = [];
  const resourceUpdates = [];
  const accountStates = [];
  const evidence = [];
  return {
    actions,
    resourceUpdates,
    accountStates,
    evidence,
    async getLaunchJobBundle() {
      return {
        job: {
          job_id: jobId,
          route_id: "oceanengine_3_byte_mini_game",
          game_code: "JSZC",
          advertiser_id: targetAdvertiserId,
          source_usage: "runtime_truth"
        },
        executionPlan: {
          plan_id: `PLAN-${jobId}-V1`,
          plan_hash: "sha256:plan",
          planned_actions: [{ action_type: "ensure_resource:dmp_audience_package", status: "planned" }]
        }
      };
    },
    async getLatestLaunchExecutionPlan() {
      return null;
    },
    async getDmpPackagePushPlans() {
      return statefulPlans;
    },
    async countPlatformActions() {
      return 0;
    },
    async upsertPlatformAction(value) {
      actions.push(value);
    },
    async updateDmpPackagePushPlanStatus({ pushPlanId, planStatus }) {
      const plan = statefulPlans.find((item) => item.push_plan_id === pushPlanId);
      if (plan) plan.plan_status = planStatus;
    },
    async updateDmpPackageMemberAccountReadonly(value) {
      accountStates.push(value);
    },
    async updateAccountResourceReadonly(value) {
      resourceUpdates.push(value);
    },
    async upsertEvidence(value) {
      evidence.push(value);
    }
  };
}

const credential = {
  status: "valid",
  blockers: [],
  envFilePresent: true,
  accessTokenPresent: true,
  refreshTokenPresent: true,
  tokenExpired: false
};

const dir = await mkdtemp(path.join(os.tmpdir(), "mwbv2-dmp-executor-"));
try {
  const statePath = path.join(dir, "state.json");
  const repo = makeRepo();
  await writeFile(statePath, JSON.stringify({
    guardrails: {
      platform_write_allowed: true,
      platform_write_scope: {
        target_job_id: jobId,
        target_advertiser_id: targetAdvertiserId,
        target_plan_id: `PLAN-${jobId}-V1`,
        target_plan_hash: "sha256:plan",
        allowed_actions: ["ensure_resource:dmp_audience_package"],
        maximum_actions: 1,
        maximum_platform_calls: 10,
        retry_allowed: false
      }
    }
  }));
  const blocked = await ensureDmpBaselineForTargetOnce({
    repo,
    jobId,
    confirmVariableValue: DMP_ENSURE_CONFIRM_VALUE,
    credentialSummary: credential,
    oceanEngineEnv: { OCEANENGINE_ACCESS_TOKEN: "test-token" },
    projectStatePath: statePath,
    fetchImpl: async () => { throw new Error("write_should_not_run"); },
    readonlyClient: { get: async () => ({ status: "passed", summary: { customAudienceIds: [] } }) }
  });
  assert(blocked.status === "blocked_before_dmp_write", "dmp_missing_contract_should_block_before_write");
  assert(blocked.blockers.includes("blocked_missing_official_dmp_push_contract"), "dmp_missing_contract_blocker_missing");
  assert(repo.actions.length === 0, "dmp_missing_contract_must_not_write");

  await writeFile(statePath, JSON.stringify({
    guardrails: {
      platform_write_allowed: true,
      platform_write_scope: {
        target_job_id: jobId,
        target_advertiser_id: targetAdvertiserId,
        target_plan_id: `PLAN-${jobId}-V1`,
        target_plan_hash: "sha256:plan",
        allowed_actions: ["ensure_resource:dmp_audience_package"],
        maximum_actions: 1,
        maximum_platform_calls: 10,
        retry_allowed: false,
        official_contract: {
          source_ref: "official-doc:test-only",
          content_hash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          endpoint: "/open_api/2/dmp/custom_audience/push_v2/",
          method: "POST"
        }
      }
    }
  }));
  const successRepo = makeRepo();
  const success = await ensureDmpBaselineForTargetOnce({
    repo: successRepo,
    jobId,
    confirmVariableValue: DMP_ENSURE_CONFIRM_VALUE,
    credentialSummary: credential,
    oceanEngineEnv: { OCEANENGINE_ACCESS_TOKEN: "test-token" },
    projectStatePath: statePath,
    fetchImpl: async () => response({ code: 0, request_id: "req" }),
    readonlyClient: {
      get: async ({ query }) => {
        const parsed = JSON.parse(query.custom_audience_ids);
        return {
          status: "passed",
          httpStatus: 200,
          apiCode: "0",
          requestIdPresent: true,
          responseHash: `sha256:readback-${parsed[0]}`,
          summary: { customAudienceIds: [String(parsed[0])] }
        };
      }
    }
  });
  assert(success.status === "dmp_ready", "dmp_executor_success_not_ready");
  assert(successRepo.actions.filter((item) => item.actionStatus === "started").length === 10, "dmp_executor_should_start_ten_pushes");
  assert(successRepo.actions.filter((item) => item.actionStatus === "succeeded").length === 10, "dmp_executor_should_finish_ten_pushes");
  assert(successRepo.accountStates.length === 10, "dmp_executor_should_write_ten_account_states");
  assert(successRepo.resourceUpdates.some((item) => item.readbackStatus === "readback_verified"), "dmp_executor_should_mark_resource_verified");

  const failRepo = makeRepo();
  const failed = await ensureDmpBaselineForTargetOnce({
    repo: failRepo,
    jobId,
    confirmVariableValue: DMP_ENSURE_CONFIRM_VALUE,
    credentialSummary: credential,
    oceanEngineEnv: { OCEANENGINE_ACCESS_TOKEN: "test-token" },
    projectStatePath: statePath,
    fetchImpl: async () => response({ code: 40000 }, 400),
    readonlyClient: { get: async () => ({ status: "passed", summary: { customAudienceIds: [] } }) }
  });
  assert(failed.status === "dmp_push_failed_once", "dmp_executor_push_failure_should_stop");
  assert(failRepo.actions.filter((item) => item.actionStatus === "started").length === 1, "dmp_executor_failure_should_not_continue");

  process.stdout.write(`${JSON.stringify({
    status: "passed",
    missingContract: blocked.status,
    success: success.status,
    failure: failed.status,
    rawResponseStored: false
  }, null, 2)}\n`);
} finally {
  await rm(dir, { recursive: true, force: true });
}
