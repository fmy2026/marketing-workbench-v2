import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import { ensureQiankunCredentialStoreScaffold, ensureQiankunMonitorEnvScaffold } from "../src/platforms/qiankunCredentialStore.mjs";
import { MONITOR_PROVISION_TARGET, runMonitorProvisionCommand } from "../src/workflows/skills/oe3/monitor-provision.mjs";

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
const ownerKey = arg("owner-key", "");
const retryOnce = flag("retry-once");
const planOnly = flag("plan-only");
const monitorIds = arg("monitor-ids", "").split(",").map((item) => item.trim()).filter(Boolean);
const target = {
  routeId: arg("route-id", MONITOR_PROVISION_TARGET.routeId),
  gameCode: arg("game-code", MONITOR_PROVISION_TARGET.gameCode),
  advertiserId: arg("advertiser-id", MONITOR_PROVISION_TARGET.advertiserId)
};
const ensureScaffold = mode === "status";

if (ensureScaffold) {
  ensureQiankunMonitorEnvScaffold();
  ensureQiankunCredentialStoreScaffold();
}

const repo = new PostgresRepository();
const result = await runMonitorProvisionCommand({
  mode,
  repo,
  ownerKey,
  retryOnce,
  ensureScaffold,
  target,
  planOnly,
  monitorIds
});

console.log(JSON.stringify(result, null, 2));
