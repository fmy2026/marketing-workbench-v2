import {
  EXPLICIT_ACCOUNT_SCOPE_BLOCKER,
  explicitMonitorTarget,
  manualL3OverrideState,
  monitorProvisionId,
  runMonitorProvisionCommand
} from "../src/workflows/skills/oe3/02-monitor-provision.mjs";

const ROUTE_ID = "oceanengine_3_byte_mini_game";
const GAME_CODE = "JSZC";
const FIRST_ACCOUNT = "899900000000011";
const SECOND_ACCOUNT = "899900000000012";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const missingScope = await runMonitorProvisionCommand({ mode: "report", target: {} });
assert(missingScope.status === "blocked", "missing_scope_not_blocked");
assert(missingScope.blockers.includes(EXPLICIT_ACCOUNT_SCOPE_BLOCKER), "missing_scope_blocker_missing");

const firstTarget = explicitMonitorTarget({ routeId: ROUTE_ID, gameCode: GAME_CODE, advertiserId: FIRST_ACCOUNT });
const secondTarget = explicitMonitorTarget({ route_id: ROUTE_ID, game_code: GAME_CODE, advertiser_id: SECOND_ACCOUNT });
assert(firstTarget.status === "passed" && secondTarget.status === "passed", "explicit_scopes_not_accepted");

const firstReport = await runMonitorProvisionCommand({ mode: "report", target: firstTarget.target });
const secondReport = await runMonitorProvisionCommand({ mode: "report", target: secondTarget.target });
assert(firstReport.provisionId === monitorProvisionId(firstTarget.target), "first_provision_scope_mismatch");
assert(secondReport.provisionId === monitorProvisionId(secondTarget.target), "second_provision_scope_mismatch");
assert(firstReport.provisionId !== secondReport.provisionId, "accounts_share_monitor_provision_id");
assert(firstReport.target.advertiserId === FIRST_ACCOUNT, "first_account_not_preserved");
assert(secondReport.target.advertiserId === SECOND_ACCOUNT, "second_account_not_preserved");

const evidence = {
  artifactId: "EV-SYNTHETIC-EXACT-SCOPE",
  target: { ...firstTarget.target, provisionId: firstReport.provisionId },
  manualConfirm: {
    mediaId: "310",
    mediaName: "synthetic",
    monitorApi: "toutiao_wxgame",
    agentId: "613",
    qiankunAccountRecordId: "QK-SYNTHETIC",
    validFor: "one_monitor_create_attempt_only",
    expiresAt: "2099-01-01T00:00:00.000Z"
  }
};
const exactOverride = manualL3OverrideState({ target: firstTarget.target, provisionId: firstReport.provisionId, evidence });
const mismatchOverride = manualL3OverrideState({ target: secondTarget.target, provisionId: secondReport.provisionId, evidence });
const expiredOverride = manualL3OverrideState({
  target: firstTarget.target,
  provisionId: firstReport.provisionId,
  evidence: { ...evidence, manualConfirm: { ...evidence.manualConfirm, expiresAt: "2020-01-01T00:00:00.000Z" } }
});
assert(exactOverride.active === true, "exact_manual_evidence_not_active");
assert(mismatchOverride.active === false, "mismatched_manual_evidence_active");
assert(expiredOverride.active === false && expiredOverride.expired === true, "expired_manual_evidence_active");

console.log(JSON.stringify({
  status: "passed",
  missingScopeBlocked: true,
  distinctAccountsRemainScoped: true,
  manualEvidence: {
    exactScopeActive: exactOverride.active,
    mismatchedScopeInactive: !mismatchOverride.active,
    expiredInactive: !expiredOverride.active
  },
  noRealPlatformWrite: true,
  noTokenRefresh: true
}, null, 2));
