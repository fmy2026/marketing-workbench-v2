import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createTestDatabase, testSql } from "./support/database.mjs";
import { PostgresRepository, assertTestDatabase } from "./support/repository.mjs";

assert.throws(() => new PostgresRepository({ database: "marketing_workbench_v2" }), /isolated_test_database_required/);
assert.throws(() => assertTestDatabase("marketing_workbench_v2_test_"), /isolated_test_database_required/);
assert.throws(() => testSql("marketing_workbench_v2", "SELECT 1"), /isolated_test_database_required/);
for (const code of [
  'try { await fetch("https://example.invalid/"); } catch {}',
  'try { await fetch("http://127.0.0.1:3000/"); } catch {}',
  'import { execFileSync } from "node:child_process"; try { execFileSync("psql", ["-d", "marketing_workbench_v2", "-c", "SELECT 1"]); } catch {}'
]) {
  const result = spawnSync(process.execPath, ["--import", new URL("./support/network.mjs", import.meta.url).pathname, "--input-type=module", "-e", code], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unexpected external requests blocked: 1/);
}
const first = await createTestDatabase();
let name;
try {
  name = first.database;
  const repo = new PostgresRepository({ database: name });
  assert.throws(() => { repo.database = "marketing_workbench_v2"; }, TypeError);
  assert.match(first.schemaHash, /^sha256:[a-f0-9]{64}$/);
  assert.equal(testSql(name, "SELECT count(*) FROM information_schema.tables WHERE table_schema='mwb' AND table_type='BASE TABLE'").trim(), "38");
  assert.equal(testSql(name, "SELECT count(*) FROM mwb.launch_jobs").trim(), "0");
} finally { await first.dispose(); }
const exists = execFileSync("psql", ["-X", "-qAt", "-d", "postgres", "-c", `SELECT count(*) FROM pg_database WHERE datname='${name}'`], { encoding: "utf8" });
assert.equal(exists.trim(), "0");
console.log(JSON.stringify({ status: "passed", productionDatabaseRejected: true, schemaOnly: true, databaseRemoved: true, unexpectedExternalRequestsRejected: true }));
