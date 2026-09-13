import { createServer } from "node:net";
import { once } from "node:events";
import { createWorkbenchServer } from "../../src/server/workbenchServer.mjs";
import { PostgresRepository } from "./repository.mjs";

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
