import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";

const CONFIRM_ENV = "MWBV2_OE_FIELD_LEDGER_CONFIRM";
const CONFIRM_VALUE = "VERIFY_ALL_CREATE_FIELDS";

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || "" : "";
}

const jobId = argValue("--job-id");
const allMatched = process.argv.includes("--all-matched");
if (!jobId || !allMatched || process.env[CONFIRM_ENV] !== CONFIRM_VALUE) {
  console.error(JSON.stringify({
    status: "blocked",
    blockers: ["job_id_all_matched_and_field_ledger_confirmation_required"],
    rawPayloadStored: false
  }, null, 2));
  process.exit(1);
}

const repo = new PostgresRepository();
const result = await repo.attestCreateFieldLedger({ jobId, allMatched: true });
console.log(JSON.stringify({
  status: result.status,
  jobId,
  checkedPathCount: result.checkedPathCount,
  evidenceRef: result.evidenceRef,
  rawPayloadStored: false
}, null, 2));
