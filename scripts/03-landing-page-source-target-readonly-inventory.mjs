import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import {
  BACKUP_LANDING_PAGE_INVENTORY_TASK_ID,
  BACKUP_LANDING_PAGE_SHARE_READBACK_TASK_ID,
  CONTROLLED_BACKUP_LANDING_PAGE_ASSET_ID,
  DEFAULT_BACKUP_LANDING_PAGE_SOURCE_ACCOUNT,
  assertNoSensitiveLeak,
  createBackupLandingPageInventoryJob,
  runBackupLandingPageMaterialInventorySkill
} from "../src/workflows/skills/oe3/00-index.mjs";

const DEFAULTS = Object.freeze({
  routeId: "oceanengine_3_byte_mini_game",
  gameCode: "JSZC",
  advertiserId: "1871922346964041",
  sourceAdvertiserId: DEFAULT_BACKUP_LANDING_PAGE_SOURCE_ACCOUNT
});

function arg(name, fallback = "") {
  const prefix = `${name}=`;
  const item = process.argv.slice(2).find((value) => value === name || value.startsWith(prefix));
  if (!item) return fallback;
  if (item === name) return "true";
  return item.slice(prefix.length);
}

function flag(name) {
  return process.argv.slice(2).includes(name);
}

async function resolveCaseId(repo, target, explicitCaseId) {
  if (explicitCaseId) return explicitCaseId;
  const summaries = await repo.listWorkflowCaseSummaries({ sourceUsage: "runtime_truth" });
  const matches = (summaries || []).filter((item) =>
    item.route_id === target.routeId &&
    item.game_code === target.gameCode &&
    item.advertiser_id === target.advertiserId &&
    item.lifecycle_status === "active"
  );
  if (matches.length !== 1) {
    throw new Error(`workflow_case_not_unique:${matches.length}`);
  }
  return matches[0].case_id;
}

async function main() {
  const repo = new PostgresRepository();
  const target = {
    routeId: arg("--route-id", DEFAULTS.routeId),
    gameCode: arg("--game-code", DEFAULTS.gameCode),
    advertiserId: arg("--advertiser-id", DEFAULTS.advertiserId),
    sourceAdvertiserId: arg("--source-advertiser-id", DEFAULTS.sourceAdvertiserId)
  };
  const record = !flag("--no-record") && !flag("--dry-run");
  const caseId = await resolveCaseId(repo, target, arg("--case-id", ""));
  const sourceRecordRef = arg("--source-record-ref", BACKUP_LANDING_PAGE_SHARE_READBACK_TASK_ID);
  const jobId = record
    ? await createBackupLandingPageInventoryJob({
      repo,
      caseId,
      routeId: target.routeId,
      gameCode: target.gameCode,
      advertiserId: target.advertiserId,
      sourceRecordRef
    })
    : "CLI-BACKUP-LANDING-PAGE-MATERIAL-INVENTORY";

  const bundle = record
    ? await repo.getLaunchJobBundle(jobId)
    : {
      case: await repo.getWorkflowCase(caseId),
      job: {
        job_id: jobId,
        case_id: caseId,
        route_id: target.routeId,
        game_code: target.gameCode,
        advertiser_id: target.advertiserId,
        source_usage: "runtime_truth"
      }
    };

  const result = await runBackupLandingPageMaterialInventorySkill({
    repo,
    bundle,
    sourceAdvertiserId: target.sourceAdvertiserId,
    record
  });
  if (record) {
    await repo.updateJob(jobId, {
      status: "completed_readonly_inventory",
      currentNode: "4"
    });
  }

  const output = {
    taskId: sourceRecordRef,
    skillTaskId: BACKUP_LANDING_PAGE_INVENTORY_TASK_ID,
    jobId,
    caseId,
    status: result.status,
    conclusion: result.outputSummary?.conclusion || "",
    controlledDefaultAssetId: CONTROLLED_BACKUP_LANDING_PAGE_ASSET_ID,
    candidateCount: result.outputSummary?.candidate_count || 0,
    sourceCandidateCount: result.outputSummary?.source_candidate_count || 0,
    targetMatchCount: result.outputSummary?.target_match_count || 0,
    sourceInventoryStatus: result.outputSummary?.source_inventory_status || "",
    targetInventoryStatus: result.outputSummary?.target_inventory_status || "",
    targetSharedInventoryStatus: result.outputSummary?.target_shared_inventory_status || "",
    sourcePageSummaries: result.outputSummary?.source_page_summaries || [],
    targetPageSummaries: result.outputSummary?.target_page_summaries || [],
    targetSharedPageSummaries: result.outputSummary?.target_shared_page_summaries || [],
    targetOrangeSiteAuxiliary: result.outputSummary?.target_orange_site_auxiliary || {},
    defaultSourceVerified: result.outputSummary?.default_source_verified === true,
    targetAlreadyUsable: result.outputSummary?.target_already_usable === true,
    defaultTargetSeen: result.outputSummary?.default_target_seen === true,
    defaultTargetResolutionSource: result.outputSummary?.default_target_resolution_source || "",
    defaultTargetHashMatches: result.outputSummary?.default_target_hash_matches === true,
    blockers: result.blockers || [],
    default: {
      siteId: result.outputSummary?.default_site_id || "",
      sourceUsable: result.outputSummary?.default_source_verified === true,
      targetUsable: result.outputSummary?.target_already_usable === true
    },
    crossAccountPath: result.outputSummary?.cross_account_path || {},
    candidates: result.outputSummary?.candidates || [],
    evidenceRefs: result.evidenceRefs || [],
    noRealPlatformWrite: true,
    noTokenRefresh: true
  };
  assertNoSensitiveLeak(output);
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`landing_page_inventory_check_failed:${error.message}\n`);
  process.exitCode = 1;
});
