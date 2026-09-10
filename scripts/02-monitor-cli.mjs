import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import { assertNoSensitiveLeak, sanitizeForPublic } from "../src/workflows/skills/oe3/00-contracts.mjs";
import { explicitMonitorTarget, monitorProvisionId, runMonitorProvisionReadonlyReconcile } from "../src/workflows/skills/oe3/02-monitor/index.mjs";

function arg(name, fallback = "") {
  const inline = process.argv.find((item) => item.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.findIndex((item) => item === `--${name}`);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

function flag(name) {
  return process.argv.includes(`--${name}`);
}

const mode = arg("mode", "status");
const caseId = arg("case-id");
const repo = new PostgresRepository();
let target = {
  routeId: arg("route-id"),
  gameCode: arg("game-code"),
  advertiserId: arg("advertiser-id")
};

if (caseId) {
  const workflowCase = await repo.getWorkflowCase(caseId);
  if (!workflowCase) throw new Error("workflow_case_not_found");
  const caseTarget = {
    routeId: workflowCase.route_id,
    gameCode: workflowCase.game_code,
    advertiserId: workflowCase.advertiser_id
  };
  const mismatched = Object.entries(target).some(([key, value]) => value && value !== caseTarget[key]);
  if (mismatched) throw new Error("workflow_case_scope_mismatch");
  target = caseTarget;
}

const scope = explicitMonitorTarget(target);
if (scope.status !== "passed") {
  console.log(JSON.stringify({ status: "blocked", blockers: scope.blockers, platformWriteCalled: false }, null, 2));
  process.exitCode = 2;
} else if (mode === "status") {
  const readiness = await repo.getMonitorReadiness(scope.target);
  const detail = flag("detail")
    ? await repo.getMonitorProvisionStatusReport({ provisionId: monitorProvisionId(scope.target) })
    : [];
  const output = sanitizeForPublic({
    status: "passed",
    mode,
    target: scope.target,
    readiness,
    ...(flag("detail") ? { provisionHistory: detail } : {}),
    platformWriteCalled: false,
    rawRequestStored: false,
    rawResponseStored: false
  });
  assertNoSensitiveLeak(output);
  console.log(JSON.stringify(output, null, 2));
} else if (mode === "reconcile") {
  const output = await runMonitorProvisionReadonlyReconcile({
    repo,
    target: scope.target,
    ownerKey: arg("owner-key")
  });
  console.log(JSON.stringify(output, null, 2));
} else {
  throw new Error("unsupported_monitor_cli_mode");
}
