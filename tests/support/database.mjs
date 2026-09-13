import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertTestDatabase } from "./repository.mjs";

export function sql(value) {
  return value === null ? "NULL" : `'${String(typeof value === "object" ? JSON.stringify(value) : value).replaceAll("'", "''")}'`;
}

export function testSql(database, statement) {
  assertTestDatabase(database);
  return execFileSync("psql", ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-d", database, "-c", statement], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
}

export function insertRows(database, table, rows) {
  if (!/^[a-z_]+$/.test(table)) throw new Error("invalid_fixture_table");
  const groups = new Map();
  for (const row of rows) {
    const columns = Object.keys(row).sort();
    if (columns.some((key) => !/^[a-z_]+$/.test(key))) throw new Error("invalid_fixture_column");
    const key = columns.join(",");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(`(${columns.map((column) => sql(row[column])).join(",")})`);
  }
  for (const [columns, values] of groups) testSql(database, `INSERT INTO mwb.${table} (${columns}) VALUES ${values.join(",")};`);
}

export async function createTestDatabase() {
  const database = assertTestDatabase(`marketing_workbench_v2_test_${randomBytes(8).toString("hex")}`);
  const directory = await mkdtemp(join(tmpdir(), "mwb-test-"));
  let created = false;
  const dispose = async () => {
    try {
      if (created) {
        execFileSync("dropdb", ["--if-exists", database], { stdio: "pipe" });
        created = false;
      }
    } finally { await rm(directory, { recursive: true, force: true }); }
  };
  try {
    // Schema only: no production rows, credentials, or historical migration replay.
    const schema = execFileSync("pg_dump", ["--schema-only", "--schema=mwb", "--no-owner", "--no-acl", "-d", "marketing_workbench_v2"], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
    const fingerprintInput = schema.replace(/^.*(?:\\restrict|\\unrestrict|Dumped|Started on|Completed on).*$/gm, "");
    const schemaHash = `sha256:${createHash("sha256").update(fingerprintInput).digest("hex")}`;
    const schemaPath = join(directory, "schema.sql");
    await writeFile(schemaPath, schema, { mode: 0o600 });
    execFileSync("createdb", [database], { stdio: "pipe" });
    created = true;
    execFileSync("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", database, "-f", schemaPath], { stdio: "pipe", maxBuffer: 16 * 1024 * 1024 });
    if (testSql(database, "SELECT current_database();").trim() !== database) throw new Error("test_database_identity_mismatch");
    return { database, directory, schemaHash, dispose };
  } catch (error) { await dispose(); throw error; }
}

export async function loadConfiguration() {
  return JSON.parse(await readFile(new URL("../fixtures/config.json", import.meta.url), "utf8"));
}
