import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import { ensureQiankunCredentialStoreScaffold, ensureQiankunMonitorEnvScaffold } from "../src/platforms/qiankunCredentialStore.mjs";
import { EXPLICIT_ACCOUNT_SCOPE_BLOCKER, runMonitorProvisionCommand } from "../src/workflows/skills/oe3/02-monitor-provision.mjs";

function arg(name, fallback = "") {
  const inline = process.argv.find((item) => item.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.findIndex((item) => item === `--${name}`);
  return index >= 0 ? process.argv[index + 1] || "" : fallback;
}

function flag(name) {
  return process.argv.includes(`--${name}`);
}

const mode = arg("mode", "status");
const caseId = arg("case-id", "");
const ownerKey = arg("owner-key", "");
const reissueReason = arg("reissue-reason", "");
const retryOnce = flag("retry-once");
const planOnly = flag("plan-only");
const monitorIds = arg("monitor-ids", "").split(",").map((item) => item.trim()).filter(Boolean);
const ensureScaffold = mode === "status";
const repo = new PostgresRepository();
let target = {
  routeId: arg("route-id", ""),
  gameCode: arg("game-code", ""),
  advertiserId: arg("advertiser-id", "")
};

if (caseId) {
  const workflowCase = await repo.getWorkflowCase(caseId);
  if (!workflowCase) {
    console.log(JSON.stringify({ status: "blocked", blockers: ["workflow_case_not_found"], caseId }, null, 2));
    process.exitCode = 2;
  } else {
    const caseTarget = {
      routeId: workflowCase.route_id,
      gameCode: workflowCase.game_code,
      advertiserId: workflowCase.advertiser_id
    };
    const supplied = Object.values(target).some(Boolean);
    const mismatched = supplied && Object.entries(target).some(([key, value]) => value && value !== caseTarget[key]);
    if (mismatched) {
      console.log(JSON.stringify({ status: "blocked", blockers: ["workflow_case_scope_mismatch"], caseId }, null, 2));
      process.exitCode = 2;
    } else {
      target = caseTarget;
    }
  }
}

if (!process.exitCode && (!target.routeId || !target.gameCode || !target.advertiserId)) {
  console.log(JSON.stringify({ status: "blocked", blockers: [EXPLICIT_ACCOUNT_SCOPE_BLOCKER], caseIdPresent: Boolean(caseId) }, null, 2));
  process.exitCode = 2;
}

if (!process.exitCode) {
  if (ensureScaffold) {
    ensureQiankunMonitorEnvScaffold();
    ensureQiankunCredentialStoreScaffold();
  }
  const result = await runMonitorProvisionCommand({
    mode, repo, ownerKey, retryOnce, ensureScaffold, target, planOnly, monitorIds, reissueReason
  });
  console.log(JSON.stringify(result, null, 2));
}
