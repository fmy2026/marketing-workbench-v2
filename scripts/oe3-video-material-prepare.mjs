import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import { runJob } from "../src/workflows/launchWorkflow.mjs";
import { assertNoSensitiveLeak } from "../src/workflows/skills/oe3/contracts.mjs";
import { buildVideoMaterialPreparePlan } from "../src/platforms/oceanengineVideoMaterialExecutor.mjs";

const DEFAULT_JOB_ID = "JOB-MWBV2-20260824151431-ECA120";

function arg(name, fallback = "") {
  const inline = process.argv.find((item) => item.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.findIndex((item) => item === `--${name}`);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

const repo = new PostgresRepository();
const jobId = arg("job-id", process.env.MWBV2_TARGET_JOB_ID || DEFAULT_JOB_ID);
const allowReadonly = hasFlag("allow-readonly");

if (allowReadonly) {
  await runJob(repo, jobId, {
    mode: "dry_run",
    allowReadonlyDependency: true,
    allowNetworkWrite: false
  });
}

const bundle = await repo.getLaunchJobBundle(jobId);
if (!bundle) throw new Error(`job_not_found:${jobId}`);
const plan = buildVideoMaterialPreparePlan({ bundle });
assertNoSensitiveLeak(plan);
console.log(JSON.stringify(plan, null, 2));
