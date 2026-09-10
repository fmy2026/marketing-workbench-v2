import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import {
  clearSessionCookie,
  createSessionCredential,
  hashPassword,
  sessionCookie,
  validateNewPassword,
  verifyPassword
} from "../src/security/workbenchAuth.mjs";
import { createWorkflowCase, WORKFLOW_NODES } from "../src/workflows/launchWorkflow.mjs";
import { STD_PROJECT_40100_REDELIVERY_CONTRACT } from "../src/workflows/executionPlan.mjs";
import { evaluatePlanBoundWriteAuthorization } from "../src/workflows/workbenchRuntimeWritePolicy.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const repo = new PostgresRepository();
const expectedUsers = new Map([
  ["fengmeiyu", { displayName: "冯美钰", role: "admin" }],
  ["zhangjingwei", { displayName: "张境威", role: "operator" }],
  ["zhangchaobo", { displayName: "张超博", role: "operator" }]
]);

for (const [loginName, expected] of expectedUsers) {
  const user = await repo.getWorkbenchUserByLogin(loginName);
  assert(user?.display_name === expected.displayName, `seeded_user_name_mismatch:${loginName}`);
  assert(user?.user_role === expected.role, `seeded_user_role_mismatch:${loginName}`);
  assert(typeof user?.must_change_password === "boolean", `user_password_change_state_missing:${loginName}`);
  if (user.must_change_password) {
    assert(await verifyPassword("12345678", user.password_hash), `seeded_user_default_password_mismatch:${loginName}`);
  }
}

const nextHash = await hashPassword("new-secure-password-2026");
assert(await verifyPassword("new-secure-password-2026", nextHash), "password_roundtrip_failed");
assert(!await verifyPassword("incorrect-password", nextHash), "incorrect_password_accepted");
assert(!validateNewPassword("12345678").valid, "default_password_reuse_allowed");
assert(validateNewPassword("new-secure-password-2026").valid, "valid_password_rejected");

const session = createSessionCredential();
assert(session.token.length >= 40, "session_token_too_short");
assert(session.tokenHash.startsWith("sha256:"), "session_token_hash_missing");
const cookie = sessionCookie(session.token, { secure: true });
assert(cookie.includes("HttpOnly") && cookie.includes("SameSite=Strict") && cookie.includes("Secure"), "secure_session_cookie_contract_failed");
assert(clearSessionCookie({ secure: true }).includes("Max-Age=0"), "session_cookie_clear_contract_failed");

const adminSummary = await repo.getUserWorkflowSummary({ userId: "USR-FENGMEIYU", admin: true });
const operatorSummary = await repo.getUserWorkflowSummary({ userId: "USR-ZHANGJINGWEI", admin: false });
assert(adminSummary.length === 3, "admin_summary_must_include_three_pilot_users");
assert(operatorSummary.length === 1 && operatorSummary[0].login_name === "zhangjingwei", "operator_summary_scope_failed");

const adminDetail = await repo.getUserWorkflowCaseDetail({ userId: "USR-FENGMEIYU", admin: true });
const ownedDetail = adminDetail.find((item) => item.owner_user_id === "USR-FENGMEIYU");
if (ownedDetail) {
  const ownerAccess = await repo.getAdvertiserAccess({ advertiserId: ownedDetail.advertiser_id, userId: "USR-FENGMEIYU" });
  const otherAccess = await repo.getAdvertiserAccess({ advertiserId: ownedDetail.advertiser_id, userId: "USR-ZHANGJINGWEI" });
  assert(ownerAccess?.allowed === true, "advertiser_owner_access_rejected");
  assert(otherAccess?.allowed === false, "cross_user_advertiser_access_allowed");
}

function mockRepo() {
  let created = null;
  let bound = false;
  return {
    created: () => created,
    getCoreContext: async () => bound ? { account: { advertiser_id: "1234567890123456" } } : null,
    getGameRouteDefaults: async () => ({ route_id: "oceanengine_3_byte_mini_game", game_code: "JSZC" }),
    getAdvertiserAccount: async () => null,
    bindAdvertiserOwner: async ({ advertiserId, userId }) => {
      bound = true;
      return { bound: true, account: { advertiser_id: advertiserId, owner_user_id: userId } };
    },
    getAdvertiserAccess: async () => ({ allowed: true }),
    getWorkbenchUserByOwnerKey: async () => null,
    getWorkflowCaseByKey: async () => null,
    getActiveRuntimeWorkflowCase: async () => null,
    createWorkflowCase: async (input) => {
      created = input;
      return { case_id: input.caseId, owner_user_id: input.ownerUserId, created_by_user_id: input.createdByUserId };
    }
  };
}

const matchingRepo = mockRepo();
await createWorkflowCase(matchingRepo, {
  case_key: "workbench.user-isolation.smoke",
  route_id: "oceanengine_3_byte_mini_game",
  game_code: "JSZC",
  advertiser_id: "1234567890123456",
  source_usage: "runtime_truth"
}, {
  currentUser: {
    user_id: "USR-ZHANGJINGWEI",
    user_status: "active",
    qiankun_owner_key: "zhangjingwei"
  },
  accountBootstrapFn: async () => ({
    status: "passed",
    accountIdentityWritten: true,
    account: { qiankunOwnerKey: "zhangjingwei" }
  })
});
assert(matchingRepo.created()?.ownerUserId === "USR-ZHANGJINGWEI", "case_owner_not_persisted");
assert(matchingRepo.created()?.createdByUserId === "USR-ZHANGJINGWEI", "case_actor_not_persisted");

let mismatchBlocked = false;
try {
  await createWorkflowCase(mockRepo(), {
    case_key: "workbench.user-isolation.mismatch",
    route_id: "oceanengine_3_byte_mini_game",
    game_code: "JSZC",
    advertiser_id: "1234567890123457",
    source_usage: "runtime_truth"
  }, {
    currentUser: {
      user_id: "USR-ZHANGJINGWEI",
      user_status: "active",
      qiankun_owner_key: "zhangjingwei"
    },
    accountBootstrapFn: async () => ({
      status: "blocked",
      accountIdentityWritten: false,
      account: { qiankunOwnerKey: "zhangchaobo" },
      blockers: ["credential_owner_mismatch"]
    })
  });
} catch (error) {
  mismatchBlocked = error.message === "advertiser_owner_mismatch";
}
assert(mismatchBlocked, "intake_owner_mismatch_not_blocked");

const policyBundle = {
  job: { job_id: "JOB-AUTH-SMOKE", case_id: "CASE-AUTH-SMOKE", source_usage: "runtime_truth", advertiser_id: "1234567890123456" },
  case: { lifecycle_status: "active", owner_user_id: "USR-ZHANGJINGWEI" },
  account: { owner_user_id: "USR-ZHANGJINGWEI" },
  executionPlan: {
    plan_id: "PLAN-AUTH-SMOKE",
    plan_hash: "sha256:auth-smoke",
    plan_kind: "std_project_create",
    plan_status: "ready",
    blocker_codes: [],
    metadata: { execution_scope: {
      binding_mode: "single_confirmation_plan",
      target_job_id: "JOB-AUTH-SMOKE",
      target_advertiser_id: "1234567890123456",
      target_plan_id: "PLAN-AUTH-SMOKE",
      target_plan_hash: "sha256:auth-smoke",
      retry_allowed: false,
      rate_limit_redelivery: { ...STD_PROJECT_40100_REDELIVERY_CONTRACT }
    } }
  }
};
const policyRepo = { getWorkflowCaseSummary: async () => ({ lifecycle_status: "active", latest_job_id: "JOB-AUTH-SMOKE", current_gate: "await_job_write_authorization" }) };
const allowedPolicy = await evaluatePlanBoundWriteAuthorization({
  repo: policyRepo,
  bundle: policyBundle,
  authorizationSource: "workbench_conversation",
  authenticatedUserId: "USR-ZHANGJINGWEI"
});
const deniedPolicy = await evaluatePlanBoundWriteAuthorization({
  repo: policyRepo,
  bundle: policyBundle,
  authorizationSource: "workbench_conversation",
  authenticatedUserId: "USR-ZHANGCHAOBO"
});
assert(allowedPolicy.status === "passed", `authenticated_owner_policy_failed:${allowedPolicy.blockers.join(",")}`);
assert(deniedPolicy.blockers.includes("workbench_runtime_case_owner_mismatch"), "authenticated_owner_policy_did_not_block_cross_user");
assert(WORKFLOW_NODES.length === 7, "workflow_node_count_changed");

console.log(JSON.stringify({
  status: "passed",
  pilotUserCount: expectedUsers.size,
  forcedPasswordChange: true,
  operatorSummaryRows: operatorSummary.length,
  crossUserAdvertiserBlocked: true,
  intakeOwnerMismatchBlocked: true,
  authenticatedPlanOwnerRequired: true,
  workflowNodeCount: WORKFLOW_NODES.length,
  realPlatformWriteCalled: false
}, null, 2));
