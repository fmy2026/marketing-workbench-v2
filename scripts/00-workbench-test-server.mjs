import { createServer } from "node:net";
import { once } from "node:events";
import { join } from "node:path";
import { createTestDatabase } from "../tests/support/database.mjs";
import { seedTestDatabase } from "../tests/support/fixtures.mjs";
import { PostgresRepository } from "../tests/support/repository.mjs";
import { createWorkbenchServer } from "../src/server/workbenchServer.mjs";

const requestedPort = Number(process.env.WORKBENCH_TEST_PORT || 3100);
if (!Number.isInteger(requestedPort) || requestedPort < 1024 || requestedPort > 65535) throw new Error("workbench_test_port_invalid");

// Test workbench must never become an alternative business execution path.
globalThis.fetch = async () => { throw new Error("test_external_network_disabled"); };

const database = await createTestDatabase();
await seedTestDatabase(database.database);
const origin = `http://127.0.0.1:${requestedPort}`;
const testRoot = database.directory;
const { server } = createWorkbenchServer({
  repo: new PostgresRepository({ database: database.database }),
  env: {
    ...process.env,
    MWBV2_TEST_WORKBENCH: "true",
    WORKBENCH_BIND_HOST: "127.0.0.1",
    WORKBENCH_PORT: String(requestedPort),
    WORKBENCH_PUBLIC_ORIGIN: origin,
    MWBV2_WORKBENCH_LLM_CREDENTIAL_PATH: join(testRoot, "workbench-llm-credentials.json"),
    OCEANENGINE_ENV_PATH: join(testRoot, "oceanengine.env"),
    QIANKUN_MONITOR_ENV_PATH: join(testRoot, "qiankun.env")
  }
});

const reservation = createServer();
reservation.listen(requestedPort, "127.0.0.1");
await once(reservation, "listening");
await new Promise((resolve) => reservation.close(resolve));
server.listen(requestedPort, "127.0.0.1");
await once(server, "listening");
console.log(JSON.stringify({ status: "ready", test: true, url: origin, database: "isolated", external_network: "blocked" }));

let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await database.dispose();
}
process.on("SIGINT", () => { close().then(() => process.exit(0)); });
process.on("SIGTERM", () => { close().then(() => process.exit(0)); });
