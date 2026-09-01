import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import { readbackVideoMaterialTargetOnce } from "../src/platforms/oceanengineVideoMaterialExecutor.mjs";
import { assertNoSensitiveLeak, sanitizeForPublic } from "../src/workflows/skills/oe3/00-contracts.mjs";

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || "" : "";
}

function argValues(name) {
  const values = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === name && process.argv[index + 1]) values.push(process.argv[index + 1]);
  }
  return values;
}

function splitList(value = "") {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

const jobId = argValue("--job-id");
const actionId = argValue("--action-id");
const expectedTargetAdvertiserId = argValue("--target-advertiser-id");
const expectedSourceAdvertiserId = argValue("--source-advertiser-id");
const expectedSourceAssetIds = [
  ...argValues("--source-asset-id"),
  ...splitList(argValue("--source-asset-ids"))
];

if (!jobId || !actionId) {
  const output = sanitizeForPublic({
    status: "blocked",
    blockers: [
      ...(!jobId ? ["job_id_required"] : []),
      ...(!actionId ? ["action_id_required"] : [])
    ],
    platformWriteCalled: false,
    tokenRefreshCalled: false
  });
  console.error(JSON.stringify(output, null, 2));
  process.exit(1);
}

const repo = new PostgresRepository();
const result = await readbackVideoMaterialTargetOnce({
  repo,
  jobId,
  actionId,
  expectedTargetAdvertiserId,
  expectedSourceAdvertiserId,
  expectedSourceAssetIds
});
const output = sanitizeForPublic({
  ...result,
  platformWriteCalled: false,
  tokenRefreshCalled: false,
  writeScopeRequired: false
});
assertNoSensitiveLeak(output);
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
process.exit(["readback_verified", "readback_pending"].includes(output.status) ? 0 : 1);
