import { createServer } from "node:net";
import { once } from "node:events";
import { createWorkbenchServer } from "../../src/server/workbenchServer.mjs";
import { PostgresRepository } from "./repository.mjs";

function qiankunFixtureFetch(fetchImpl) {
  return async (input, options = {}) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    if (url.origin !== "https://qiankun.test") return fetchImpl(input, options);
    const accountId = new URLSearchParams(String(options.body || "")).get("accountId") || "";
    const list = url.pathname === "/tf/account_info/accountIndex" && accountId !== "1871922999999999"
      ? [{
        id: `fixture-account-${accountId}`,
        account_id: accountId,
        _media_account_id: `fixture-account-${accountId}`,
        media_master_id: "900001",
        _agent_id: "900001",
        _sso_owner: "test_admin",
        sso_owner: "test_admin",
        sso_owner_name: "Test Admin",
        advertiser_name: `Synthetic account ${accountId}`,
        account_auth_status_name: "ready",
        status: "active"
      }]
      : [];
    return new Response(JSON.stringify({ code: "0", data: { list, total: list.length } }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
}

if (process.env.MWBV2_TEST_QIANKUN_ACCOUNT_INDEX === "1") {
  globalThis.fetch = qiankunFixtureFetch(globalThis.fetch);
}

const reservation = createServer();
reservation.listen(0, "127.0.0.1");
await once(reservation, "listening");
const port = reservation.address().port;
await new Promise((resolve) => reservation.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const { server } = createWorkbenchServer({ repo: new PostgresRepository(), env: {
  WORKBENCH_BIND_HOST: "127.0.0.1", WORKBENCH_PORT: String(port), WORKBENCH_PUBLIC_ORIGIN: origin
} });
server.listen(port, "127.0.0.1");
await once(server, "listening");
process.send({ origin });
process.on("message", (message) => {
  if (message !== "close") return;
  server.closeAllConnections();
  server.close(() => process.disconnect());
});
