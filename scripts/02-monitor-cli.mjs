import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import { assertNoSensitiveLeak, sanitizeForPublic } from "../src/workflows/skills/oe3/00-contracts.mjs";
import { explicitMonitorTarget, monitorProvisionId, runMonitorProvisionReadonlyReconcile } from "../src/workflows/skills/oe3/02-monitor/index.mjs";
import {
  QIANKUN_CATE_VEST_TARGET,
  QIANKUN_LEVEL3_MEDIA_RESOURCE_TARGET,
  QIANKUN_MEDIA_CATALOG_TARGET,
  QIANKUN_MONITOR_TECHNICAL_COMBINATION_TARGET,
  QIANKUN_PACKAGE_BASE_INFO_TARGET,
  QIANKUN_VEST_PACKAGE_TARGET,
  runQiankunCateVestReadonlySync,
  runQiankunLevel3MediaResourceReadonlySync,
  runQiankunMediaCatalogReadonlySync,
  runQiankunMonitorTechnicalCombinationReadonlySync,
  runQiankunPackageBaseInfoReadonlySync,
  runQiankunVestPackageReadonlySync
} from "../src/workflows/skills/oe3/02-monitor/config-sync.mjs";

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
} else if (mode === "config-sync") {
  const configScope = arg("scope", "all");
  const runners = {
    "cate-vest": [runQiankunCateVestReadonlySync, QIANKUN_CATE_VEST_TARGET],
    "vest-package": [runQiankunVestPackageReadonlySync, QIANKUN_VEST_PACKAGE_TARGET],
    "package-base": [runQiankunPackageBaseInfoReadonlySync, QIANKUN_PACKAGE_BASE_INFO_TARGET],
    "technical-combination": [runQiankunMonitorTechnicalCombinationReadonlySync, QIANKUN_MONITOR_TECHNICAL_COMBINATION_TARGET],
    "level3-media": [runQiankunLevel3MediaResourceReadonlySync, QIANKUN_LEVEL3_MEDIA_RESOURCE_TARGET],
    "media-catalog": [runQiankunMediaCatalogReadonlySync, QIANKUN_MEDIA_CATALOG_TARGET]
  };
  const names = configScope === "all" ? Object.keys(runners) : [configScope];
  if (names.some((name) => !runners[name])) throw new Error("unsupported_monitor_config_sync_scope");
  const results = [];
  for (const name of names) {
    const [runner, defaultTarget] = runners[name];
    results.push({ name, result: await runner({ repo, ownerKey: arg("owner-key"), target: { ...defaultTarget, ...scope.target } }) });
  }
  const output = sanitizeForPublic({
    status: results.every((item) => item.result?.status === "passed") ? "passed" : "blocked",
    mode,
    scope: configScope,
    results,
    platformWriteCalled: false,
    rawRequestStored: false,
    rawResponseStored: false
  });
  assertNoSensitiveLeak(output);
  console.log(JSON.stringify(output, null, 2));
} else {
  throw new Error("unsupported_monitor_cli_mode");
}
