import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { assertNoSensitiveLeak, hashValue, sanitizeForPublic } from "./00-contracts.mjs";

const DEFAULT_LOCAL_FOLDER_BY_GAME = Object.freeze({
  JSZC: "/Users/hys/ProjectAssets/marketing-workbench-v2/JSZC/backup_landing_page"
});

function clean(value) {
  return String(value ?? "").trim();
}

function landingResource(bundle = {}) {
  return (bundle.resources || []).find((item) => item.resource_type === "backup_landing_page") || null;
}

function sha256Buffer(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function inspectLocalFolder(folderPath) {
  const blockers = [];
  let entries = [];
  try {
    entries = await readdir(folderPath);
  } catch {
    return {
      status: "blocked",
      blockers: ["backup_landing_page_local_folder_missing"],
      file_count: 0,
      manifest_hash: "",
      asset_file_names: [],
      raw_folder_path_stored: false
    };
  }

  const files = [];
  for (const name of entries.filter((item) => !item.startsWith(".")).sort()) {
    const fullPath = join(folderPath, name);
    const info = await stat(fullPath);
    if (!info.isFile()) continue;
    const bytes = await readFile(fullPath);
    files.push({
      name,
      size: info.size,
      sha256: sha256Buffer(bytes)
    });
  }
  if (!files.length) blockers.push("backup_landing_page_local_files_missing");
  const manifestHash = files.length ? hashValue(files) : "";
  return {
    status: blockers.length ? "blocked" : "passed",
    blockers,
    file_count: files.length,
    manifest_hash: manifestHash,
    asset_file_names: files.map((item) => item.name),
    raw_folder_path_stored: false
  };
}

async function writeEvidence(repo, bundle, outputSummary) {
  const artifactId = `EV-${bundle.job.job_id}-BACKUP-LANDING-SOURCE-PREP`;
  const evidence = {
    artifactId,
    jobId: bundle.job.job_id,
    artifactType: "backup_landing_page_source_prepare",
    title: "备用落地页本地素材与流转合同摘要",
    summary: `local_status=${outputSummary.status}; source_account_present=${outputSummary.source_account_present}; target_visible=${outputSummary.target_visible}`,
    contentHash: hashValue(outputSummary),
    storageRef: `postgres:mwb.launch_skill_runs/${bundle.job.job_id}/backup-landing-page-source-prepare`,
    sourceRef: "src/workflows/skills/oe3/04-backup-landing-page-source-prepare.mjs",
    sourceUsage: bundle.job.source_usage || "runtime_truth"
  };
  assertNoSensitiveLeak(evidence);
  await repo.upsertEvidence(evidence);
  return artifactId;
}

export async function runBackupLandingPageSourcePrepareSkill({ repo, bundle } = {}) {
  if (!repo || !bundle?.job) throw new Error("launch_job_bundle_required");
  const item = landingResource(bundle);
  const asset = bundle.backupLandingPage || {};
  const localFolder = clean(asset.metadata?.local_material_folder) || DEFAULT_LOCAL_FOLDER_BY_GAME[bundle.job.game_code] || "";
  const local = localFolder
    ? await inspectLocalFolder(localFolder)
    : {
      status: "blocked",
      blockers: ["backup_landing_page_local_folder_ref_missing"],
      file_count: 0,
      manifest_hash: "",
      asset_file_names: [],
      raw_folder_path_stored: false
    };
  const sourceAccountPresent = Boolean(clean(asset.source_advertiser_id || item?.metadata?.baseline_blueprint?.source_advertiser_id));
  const defaultPresent = Boolean(clean(asset.landing_page_asset_id || item?.source_asset_id));
  const targetVisible = item?.visibility_status === "visible";
  const targetReadbackVerified = item?.readback_status === "readback_verified";
  const blockers = [
    ...local.blockers,
    ...(!defaultPresent ? ["backup_landing_page_default_missing"] : []),
    ...(!sourceAccountPresent ? ["backup_landing_page_source_account_missing"] : []),
    ...(!targetVisible ? ["backup_landing_page_target_not_visible"] : []),
    ...(!targetReadbackVerified ? ["backup_landing_page_readback_not_verified"] : []),
    "backup_landing_page_target_transport_contract_unverified"
  ];
  const status = blockers.filter((item) => ![
    "backup_landing_page_target_not_visible",
    "backup_landing_page_readback_not_verified",
    "backup_landing_page_target_transport_contract_unverified"
  ].includes(item)).length ? "blocked" : "needs_confirmation";

  const outputSummary = sanitizeForPublic({
    status,
    resource_type: "backup_landing_page",
    local_material_folder_present: Boolean(localFolder),
    local_file_count: local.file_count,
    local_manifest_hash: local.manifest_hash,
    asset_file_names: local.asset_file_names,
    source_account_present: sourceAccountPresent,
    source_account_id_present: sourceAccountPresent,
    source_publish_stage_required: true,
    target_push_or_authorization_required: true,
    target_transport_contract_verified: false,
    landing_page_asset_id_present: defaultPresent,
    site_id_present: Boolean(clean(asset.site_id || item?.platform_resource_id)),
    url_hash_present: Boolean(clean(asset.url_hash || item?.metadata?.url_hash)),
    target_visible: targetVisible,
    target_readback_verified: targetReadbackVerified,
    platform_write_called: false,
    flow: "local_folder_to_material_account_to_target_account",
    next_action: "确认备用落地页官方发布/推送/授权合同后，再建立单次写入与目标户回查任务。",
    raw_folder_path_stored: false,
    full_url_stored: false
  });
  const evidenceRef = await writeEvidence(repo, bundle, outputSummary);

  if (item) {
    await repo.mergeAccountResourceMetadata({
      routeId: bundle.job.route_id,
      gameCode: bundle.job.game_code,
      advertiserId: bundle.job.advertiser_id,
      resourceType: "backup_landing_page",
      resourceMetadata: {
        backup_landing_page_source_preparation: {
          ...outputSummary,
          blockers,
          evidence_ref: evidenceRef,
          checked_at: new Date().toISOString()
        }
      }
    });
  }

  const result = { status, blockers: [...new Set(blockers)], outputSummary: { ...outputSummary, evidenceRef, evidence_ref: evidenceRef }, evidenceRefs: [evidenceRef] };
  assertNoSensitiveLeak(result);
  return result;
}
