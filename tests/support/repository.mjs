import { PostgresRepository as RuntimeRepository } from "../../src/repositories/postgresRepository.mjs";

export function assertTestDatabase(database) {
  if (!/^marketing_workbench_v2_test_[a-z0-9_]{8,30}$/.test(String(database || ""))) {
    throw new Error("isolated_test_database_required");
  }
  return database;
}

// Tests must opt into an explicitly created database. No production fallback.
export class PostgresRepository extends RuntimeRepository {
  constructor({ database = process.env.MWBV2_TEST_DATABASE } = {}) {
    super({ database: assertTestDatabase(database) });
    Object.defineProperty(this, "database", { value: database, writable: false });
  }
}

export { canonicalAccountAuthStatus } from "../../src/repositories/postgresRepository.mjs";
