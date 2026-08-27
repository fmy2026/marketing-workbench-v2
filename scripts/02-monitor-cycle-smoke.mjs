import assert from "node:assert/strict";
import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import {
  buildMonitorCycleId,
  monitorAttemptPolicy,
  monitorReissuePolicy
} from "../src/workflows/skills/oe3/02-monitor-cycle.mjs";
import { monitorProvisionId } from "../src/workflows/skills/oe3/02-monitor-provision.mjs";

const ROUTE_ID = "oceanengine_3_byte_mini_game";
const GAME_CODE = "JSZC";
const ADVERTISER_ID = "8990000000001201";
const TARGET = {
  routeId: ROUTE_ID,
  gameCode: GAME_CODE,
  advertiserId: ADVERTISER_ID
};

function daysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

const firstPolicy = monitorAttemptPolicy({ attemptCount: 0, latestRun: { cycle_status: "active" } });
assert.equal(firstPolicy.createEligible, true);
assert.equal(firstPolicy.nextAttemptNo, 1);
assert.equal(firstPolicy.action, "first_create");

const retryPolicy = monitorAttemptPolicy({
  attemptCount: 1,
  firstAttempt: { attempt_no: 1, error_category: "server_busy", finished_at: daysAgo(1) },
  latestAttempt: { attempt_no: 1, error_category: "server_busy" },
  latestRun: { cycle_status: "active" },
  retryElapsedSeconds: 10
});
assert.equal(retryPolicy.createEligible, true);
assert.equal(retryPolicy.nextAttemptNo, 2);
assert.equal(retryPolicy.action, "server_busy_retry");

const exhaustedPolicy = monitorAttemptPolicy({
  attemptCount: 2,
  firstAttempt: { attempt_no: 1, error_category: "server_busy" },
  latestAttempt: { attempt_no: 2, error_category: "server_busy" },
  latestRun: { cycle_status: "active" }
});
assert.equal(exhaustedPolicy.createEligible, false);
assert.ok(exhaustedPolicy.blockers.includes("monitor_create_attempt_limit_reached"));

const terminalPolicy = monitorAttemptPolicy({
  attemptCount: 1,
  firstAttempt: { attempt_no: 1, error_category: "parameter_invalid" },
  latestAttempt: { attempt_no: 1, error_category: "parameter_invalid" },
  latestRun: { cycle_status: "active" }
});
assert.equal(terminalPolicy.createEligible, false);
assert.ok(terminalPolicy.blockers.some((item) => item.startsWith("cycle_stopped_by_non_retryable_error")));

const activeReissue = monitorReissuePolicy({
  latestCycle: { provision_id: "P", cycle_id: "P-CYCLE-01", cycle_no: 1, cycle_status: "active" },
  reissueReason: "service_recovered"
});
assert.equal(activeReissue.status, "blocked");

const stoppedReissue = monitorReissuePolicy({
  latestCycle: { provision_id: "P", cycle_id: "P-CYCLE-01", cycle_no: 1, cycle_status: "stopped" },
  reissueReason: "service_recovered"
});
assert.equal(stoppedReissue.status, "passed");
assert.equal(stoppedReissue.nextCycleId, "P-CYCLE-02");

const repo = new PostgresRepository();
const provisionId = monitorProvisionId(TARGET);
const cycle01 = buildMonitorCycleId(provisionId, 1);
const cycle02 = buildMonitorCycleId(provisionId, 2);

try {
  await repo.deleteSyntheticMonitorTestContext(TARGET);
  await repo.upsertMonitorProvisionRun({
    provisionId,
    cycleId: cycle01,
    cycleNo: 1,
    cycleStatus: "active",
    routeId: ROUTE_ID,
    gameCode: GAME_CODE,
    advertiserId: ADVERTISER_ID,
    status: "planned",
    requestFingerprint: "monitor-cycle-smoke-fingerprint-01",
    technicalConfig: { source: "monitor-cycle-smoke" },
    credentialStatus: "active"
  });

  const claim1 = await repo.claimMonitorProvisionAttempt({
    provisionId,
    cycleId: cycle01,
    attemptNo: 1,
    triggerReason: "initial_create_once"
  });
  assert.equal(claim1.claimed, true);
  await repo.completeMonitorProvisionAttempt({
    attemptId: claim1.attemptId,
    attemptStatus: "failed",
    httpStatus: 200,
    apiCode: "500",
    errorCategory: "server_busy",
    errorSummary: "monitor_create_failed:500:服务器繁忙，请稍后重试(400)",
    completedAt: daysAgo(1)
  });

  const claim2 = await repo.claimMonitorProvisionAttempt({
    provisionId,
    cycleId: cycle01,
    attemptNo: 2,
    triggerReason: "server_busy_retry"
  });
  assert.equal(claim2.claimed, true);
  await repo.completeMonitorProvisionAttempt({
    attemptId: claim2.attemptId,
    attemptStatus: "failed",
    httpStatus: 200,
    apiCode: "500",
    errorCategory: "server_busy",
    errorSummary: "monitor_create_failed:500:服务器繁忙，请稍后重试(400)",
    completedAt: new Date().toISOString()
  });

  const deniedThird = await repo.claimMonitorProvisionAttempt({
    provisionId,
    cycleId: cycle01,
    attemptNo: 2,
    triggerReason: "server_busy_retry"
  });
  assert.equal(deniedThird.claimed, false);
  assert.equal(deniedThird.attemptCountBeforeClaim, 2);

  await repo.closeMonitorProvisionCycle({
    cycleId: cycle01,
    cycleStatus: "stopped",
    errorSummary: "cycle_stopped_for_reissue:service_recovered"
  });
  await repo.createMonitorProvisionCycle({
    provisionId,
    routeId: ROUTE_ID,
    gameCode: GAME_CODE,
    advertiserId: ADVERTISER_ID,
    cycleNo: 2,
    supersedesCycleId: cycle01,
    reissueReason: "service_recovered",
    requestFingerprint: "monitor-cycle-smoke-fingerprint-02",
    technicalConfig: { source: "monitor-cycle-smoke" },
    credentialStatus: "active"
  });

  const latest = await repo.getLatestMonitorProvisionRun(TARGET);
  assert.equal(latest.cycle_id, cycle02);
  assert.equal(latest.cycle_no, 2);
  assert.equal(latest.cycle_status, "active");
  assert.equal(latest.supersedes_cycle_id, cycle01);
  assert.equal(latest.reissue_reason, "service_recovered");

  const state = await repo.getMonitorProvisionAttemptState({ provisionId });
  assert.equal(state.run.cycle_id, cycle02);
  assert.equal(Number(state.attemptCount), 0);

  console.log(JSON.stringify({
    status: "passed",
    cycle01,
    cycle02,
    assertions: [
      "cycle_attempt_limit_blocks_third_attempt",
      "stopped_cycle_can_open_reissue_cycle_02",
      "latest_attempt_state_selects_active_cycle"
    ]
  }, null, 2));
} finally {
  await repo.deleteSyntheticMonitorTestContext(TARGET);
}
