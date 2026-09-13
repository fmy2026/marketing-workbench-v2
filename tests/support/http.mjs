import { fork } from "node:child_process";

export async function startTestServer(database, env = {}) {
  const child = fork(new URL("./http-server.mjs", import.meta.url), [], {
    env: { ...process.env, ...env, MWBV2_TEST_DATABASE: database },
    execArgv: ["--import", new URL("./network.mjs", import.meta.url).pathname],
    stdio: ["ignore", "ignore", "pipe", "ipc"]
  });
  let errors = "";
  child.stderr.on("data", (data) => { errors += data; });
  const closed = new Promise((resolve) => child.on("exit", (code) => resolve(code)));
  const origin = await new Promise((resolve, reject) => {
    child.once("message", (message) => resolve(message.origin));
    child.once("error", reject);
    child.once("exit", () => reject(new Error(`test_server_exited_before_ready:${errors}`)));
  });
  return { origin, dispose: async () => {
    if (child.connected) child.send("close");
    const code = await closed;
    if (code !== 0) throw new Error(`test_server_failed:${errors}`);
  } };
}
