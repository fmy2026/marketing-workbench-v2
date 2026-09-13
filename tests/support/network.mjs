import net from "node:net";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";

// Only ephemeral loopback HTTP fixtures can use sockets. Platform clients must
// receive explicit fake transports; an unexpected call fails even if caught.
const originalConnect = net.Socket.prototype.connect;
let unexpectedCalls = 0;
function deny() {
  unexpectedCalls += 1;
  process.exitCode = 1;
  throw new Error("unexpected_external_request_in_test");
}
function assertLoopback(host, port) {
  const allowedPort = process.env.MWBV2_TEST_ORIGIN ? new URL(process.env.MWBV2_TEST_ORIGIN).port : "";
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(host) || !(Number(port) > 1024) || Number(port) === 3000 || String(port) !== allowedPort) deny();
}
net.Socket.prototype.connect = function (...args) {
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  const options = typeof first === "object" ? first : { port: first, host: args[1] };
  assertLoopback(options.host || "localhost", options.port);
  return originalConnect.apply(this, args);
};
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, options) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  assertLoopback(url.hostname, url.port);
  return originalFetch(input, options);
};
for (const name of ["spawn", "spawnSync", "execFile", "execFileSync"]) {
  const original = childProcess[name];
  childProcess[name] = function (command, args = [], ...rest) {
    const binary = String(command).split("/").at(-1);
    if (["curl", "wget", "createdb", "dropdb", "pg_restore", "pg_dump"].includes(binary)) deny();
    if (binary === "psql") {
      const database = args[args.indexOf("-d") + 1];
      if (!process.env.MWBV2_TEST_DATABASE || database !== process.env.MWBV2_TEST_DATABASE) deny();
    }
    return original.call(this, command, args, ...rest);
  };
}
syncBuiltinESMExports();
process.on("exit", () => {
  if (unexpectedCalls) {
    process.stderr.write(`Unexpected external requests blocked: ${unexpectedCalls}\n`);
    process.exitCode = 1;
  }
});
