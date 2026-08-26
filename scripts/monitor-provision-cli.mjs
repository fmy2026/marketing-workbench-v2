import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import { ensureQiankunCredentialStoreScaffold, ensureQiankunMonitorEnvScaffold } from "../src/platforms/qiankunCredentialStore.mjs";
import { runMonitorProvisionCommand } from "../src/workflows/skills/oe3/monitor-provision.mjs";

function arg(name, fallback = "") {
  const inline = process.argv.find((item) => item.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.findIndex((item) => item === `--${name}`);
  return index >= 0 ? process.argv[index + 1] || "" : fallback;
}

const mode = arg("mode", "status");
const ownerKey = arg("owner-key", "");
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
  ensureScaffold
});

console.log(JSON.stringify(result, null, 2));
