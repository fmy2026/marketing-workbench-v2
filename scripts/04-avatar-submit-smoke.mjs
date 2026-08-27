import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { inspectAvatarSourceAsset, runAvatarSourcePrepareSkill } from "../src/workflows/skills/oe3/04-avatar-source-prepare.mjs";
import { buildAvatarSubmitPlan } from "../src/workflows/skills/oe3/04-avatar-submit-plan.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function pngHeader(width, height) {
  const header = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(header, 0);
  header.writeUInt32BE(13, 8);
  header.write("IHDR", 12, "ascii");
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  return header;
}

const dir = await mkdtemp(path.join(os.tmpdir(), "mwbv2-avatar-smoke-"));
try {
  const file = path.join(dir, "account-avatar-300x300.png");
  const bytes = pngHeader(300, 300);
  await writeFile(file, bytes);
  const hash = createHash("sha256").update(bytes).digest("hex");
  const asset = {
    asset_id: "AI-JSZC-ACCOUNT-AVATAR-300-001",
    asset_type: "avatar_image",
    asset_ref: file,
    asset_hash: hash,
    metadata: { width: 300, height: 300, derived_from_asset_id: "PI-JSZC-PRODUCT-IMAGE-001" }
  };
  const inspection = await inspectAvatarSourceAsset(asset);
  assert(inspection.status === "passed", "avatar_source_inspection_should_pass");
  assert(inspection.width === 300 && inspection.height === 300, "avatar_source_dimensions_missing");

  const writes = [];
  const bundle = {
    job: { job_id: "JOB-AVATAR-SMOKE", route_id: "oceanengine_3_byte_mini_game", game_code: "JSZC", advertiser_id: "1871922346964041" },
    resources: [{ resource_type: "avatar", source_asset_id: asset.asset_id, platform_resource_id: "", metadata: {} }],
    defaults: { raw_defaults: {} }
  };
  const source = await runAvatarSourcePrepareSkill({
    repo: {
      getGameAsset: async () => asset,
      mergeAccountResourceMetadata: async (value) => writes.push(value)
    },
    bundle
  });
  assert(source.status === "passed", "avatar_source_skill_should_pass");
  assert(writes.length === 1, "avatar_source_metadata_write_missing");
  const blockedPlan = buildAvatarSubmitPlan({
    bundle: {
      ...bundle,
      resources: [{ ...bundle.resources[0], metadata: { avatar_source_preparation: { status: "passed", source_hash: inspection.source_hash } } }]
    }
  });
  assert(blockedPlan.status === "passed", "avatar_plan_skill_should_pass_with_reference_contract");
  assert(blockedPlan.outputSummary.status === "planned", "avatar_plan_should_be_marked_planned");
  assert(blockedPlan.outputSummary.reference_contract_accepted === true, "avatar_reference_contract_not_accepted");
  assert(blockedPlan.outputSummary.request_field_manifest.upload.endpoint_id === "advertiser/avatar/upload", "avatar_upload_contract_missing");
  assert(blockedPlan.outputSummary.request_field_manifest.submit.endpoint_id === "advertiser/avatar/submit", "avatar_submit_contract_missing");
  assert(blockedPlan.outputSummary.platform_write_called === false, "avatar_plan_must_not_write_platform");

  process.stdout.write(`${JSON.stringify({ status: "passed", sourceInspection: inspection.status, submitPlanStatus: blockedPlan.status, noPlatformWrite: true }, null, 2)}\n`);
} finally {
  await rm(dir, { recursive: true, force: true });
}
