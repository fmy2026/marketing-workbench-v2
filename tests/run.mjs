import { spawn } from "node:child_process";
import { readFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { createTestDatabase } from "./support/database.mjs";
import { seedTestDatabase, TEST_PASSWORD } from "./support/fixtures.mjs";
import { startTestServer } from "./support/http.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(await readFile(new URL("./suites.json", import.meta.url), "utf8"));
const args = process.argv.slice(2);
const fileIndex = args.indexOf("--file");
const suite = fileIndex >= 0 ? "individual" : (args[0] || "unit");
const files = fileIndex >= 0 ? [args[fileIndex + 1]] : manifest[suite];
if (!Array.isArray(files) || !files.length) throw new Error("unknown_or_empty_test_suite");
const extraArgs = fileIndex >= 0 ? args.slice(fileIndex + 2).filter((arg) => arg !== "--") : [];
const results = [];
let failed = false;
for (const file of files) {
  if (!/^scripts\/[a-z0-9-]+\.mjs$/.test(file) && !/^tests\/[a-z0-9-]+\.test\.mjs$/.test(file)) throw new Error("invalid_test_entry");
  const source = await readFile(resolve(root, file), "utf8");
  const httpTest = /00-workbench-(auth|cross-user)-http-smoke|00-workbench-client-pages-smoke/.test(file);
  const databaseTest = source.includes('tests/support/repository.mjs') || httpTest;
  const started = performance.now();
  let database;
  let server;
  const directory = await mkdtemp(join(tmpdir(), "mwb-test-process-"));
  try {
    const qiankunCredentialStorePath = join(directory, "qiankun-passport-credentials.json");
    if (databaseTest) {
      database = await createTestDatabase();
      await seedTestDatabase(database.database);
    }
    if (httpTest) server = await startTestServer(database.database, {
      OCEANENGINE_ENV_PATH: join(directory, "oceanengine.env"), QIANKUN_MONITOR_ENV_PATH: join(directory, "qiankun.env"),
      QIANKUN_CREDENTIAL_STORE_PATH: qiankunCredentialStorePath
    });
    const env = { ...process.env, OCEANENGINE_ENV_PATH: join(directory, "oceanengine.env"), QIANKUN_MONITOR_ENV_PATH: join(directory, "qiankun.env"),
      QIANKUN_CREDENTIAL_STORE_PATH: qiankunCredentialStorePath,
      NODE_OPTIONS: `${process.env.NODE_OPTIONS || ""} --import=${resolve(root, "tests/support/network.mjs")}`.trim(),
      MWBV2_TEST_DATABASE: database?.database || "", MWBV2_TEST_ORIGIN: server?.origin || "",
      MWBV2_TEST_LOGIN_NAME: "test_admin", MWBV2_TEST_ADMIN_LOGIN: "test_admin", MWBV2_TEST_OPERATOR_LOGIN: "test_operator",
      MWBV2_TEST_PASSWORD: TEST_PASSWORD, MWBV2_TEST_NEW_PASSWORD: "isolated-admin-password", MWBV2_TEST_ADMIN_NEW_PASSWORD: "isolated-admin-password", MWBV2_TEST_OPERATOR_NEW_PASSWORD: "isolated-operator-password"
    };
    delete env.MWBV2_AUTH_HTTP_ASSERTIONS_ONLY;
    const outcome = await new Promise((resolveRun, reject) => {
      const child = spawn(process.execPath, ["--import", resolve(root, "tests/support/network.mjs"), resolve(root, file), ...extraArgs], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
      const timer = setTimeout(() => child.kill("SIGTERM"), 900000);
      let output = "";
      child.stdout.on("data", (chunk) => { output += chunk; });
      child.stderr.on("data", (chunk) => { output += chunk; });
      child.on("error", reject);
      child.on("close", (code) => { clearTimeout(timer); resolveRun({ code, output }); });
    });
    const result = { file, status: outcome.code === 0 ? "passed" : "failed", durationMs: Math.round(performance.now() - started), schemaHash: database?.schemaHash || null };
    results.push(result);
    console.log(JSON.stringify(result));
    if (outcome.code !== 0) {
      failed = true;
      console.error(outcome.output.slice(-16000));
    }
  } catch (error) {
    failed = true;
    results.push({ file, status: "failed", error: error.message });
    console.error(`${file}: ${error.message}`);
  } finally {
    try {
      if (server) await server.dispose();
    } catch (error) {
      failed = true;
      results.push({ file, status: "failed", error: error.message });
    } finally {
      if (database) await database.dispose();
      await rm(directory, { recursive: true, force: true });
    }
  }
}
const report = { suite, status: failed ? "failed" : "passed", total: results.length, passed: results.filter((r) => r.status === "passed").length, results };
if (process.env.MWBV2_TEST_REPORT_PATH) await writeFile(process.env.MWBV2_TEST_REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ suite, status: report.status, total: report.total, passed: report.passed }));
process.exitCode = failed ? 1 : 0;
