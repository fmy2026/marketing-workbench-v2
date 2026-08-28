import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import { createJob, runJob } from "../src/workflows/launchWorkflow.mjs";
import { evaluateOe3PayloadContract } from "../src/workflows/skills/oe3/05-payload-contract.mjs";
import { evaluateStdProjectCreatePreflight } from "../src/workflows/skills/oe3/05-create-preflight-diagnostics.mjs";
import { runOe3WorkflowSkills, assertNoSensitiveLeak } from "../src/workflows/skills/oe3/00-index.mjs";

const repo = new PostgresRepository();
const cleanupJobIds = [];
const TARGET = Object.freeze({
  routeId: "oceanengine_3_byte_mini_game",
  gameCode: "JSZC",
  advertiserId: "1871922175825993"
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function createTestJob(sourceRecordRef) {
  const view = await createJob(repo, {
    user_intent: `推广路线 ${TARGET.routeId}，游戏 ${TARGET.gameCode}，账户 ${TARGET.advertiserId}`,
    route_id: TARGET.routeId,
    game_code: TARGET.gameCode,
    advertiser_id: TARGET.advertiserId,
    source_usage: "test_run",
    source_record_ref: sourceRecordRef
  });
  cleanupJobIds.push(view.jobId);
  return view;
}

async function contractForJob(jobId) {
  const bundle = await repo.getLaunchJobBundle(jobId);
  const touchpointVerification = await repo.getTouchpointVerification({
    routeId: bundle.job.route_id,
    gameCode: bundle.job.game_code,
    advertiserId: bundle.job.advertiser_id,
    monitorId: bundle.account.monitor_id
  });
  return {
    bundle,
    touchpointVerification,
    contract: evaluateOe3PayloadContract({
      bundle,
      draft: bundle.draft,
      touchpointVerification
    })
  };
}

try {
  const dryCreated = await createTestJob(`test:payload-contract:dry-run:${new Date().toISOString()}`);
  const dryView = await runJob(repo, dryCreated.jobId, { mode: "dry_run" });
  const dry = await contractForJob(dryCreated.jobId);
  const dryGapKeys = dry.contract.gaps.map((gap) => gap.key);
  const dryManifest = dry.bundle.draft.payload_summary.final_payload_manifest || {};
  const dryFieldEvidence = dryManifest.officialFieldEvidence || {};
  const dryInstanceEvidence = dryManifest.instanceIdCreateEvidence || {};

  assert(dry.touchpointVerification.touchpointUrlPresent, "touchpoint URL not present");
  assert(dry.touchpointVerification.urlHashMatches, "touchpoint URL hash mismatch");
  assert(dry.bundle.job.source_usage === "test_run", "dry payload contract job source_usage is not test_run");
  assert(dryInstanceEvidence.status === "blocked", "runtime-derived instance create evidence should block");
  assert(dryInstanceEvidence.blockers?.includes("instance_id_long_id_transport_not_verified"), "instance long-ID transport blocker missing");
  assert(dryManifest.microAppInstanceIdPresent === false, "unverified instance candidate must not enter payload");
  assert(dryManifest.miniProgramUrlRequired === false, "BYTE_GAME MICRO_GAME route should not require mini_program_info.url");
  assert(!dryManifest.blockers?.includes("mini_program_url_missing"), "BYTE_GAME MICRO_GAME route should not emit mini_program_url_missing");
  ["delivery_type", "micro_promotion_type", "layer_roi_switch"].forEach((fieldPath) => {
    assert(dryFieldEvidence.omittedFieldPaths?.includes(fieldPath), `${fieldPath} should be omitted without direct create evidence`);
  });
  assert(dry.bundle.draft.payload_summary.payload_hash_source === "final_controlled_payload", "dry payload hash source is not final payload");
  assert(dry.contract.expectedPayloadHash === dry.bundle.draft.payload_hash, "dry payload hash is not stable");
  assert(typeof dry.bundle.draft.payload_summary.advertiser_id === "string", "dry advertiser_id storage summary is not string");
  if (dry.contract.status === "blocked") {
    assert(dryGapKeys.length > 0, "dry payload contract blocked without gaps");
  } else {
    assert(dry.contract.status === "passed", `unexpected dry payload contract status ${dry.contract.status}`);
    assert(dryManifest.advertiserIdStorageType === "string", "dry advertiser_id storage type not string");
    assert(dryManifest.advertiserIdTransportType === "number", "dry advertiser_id transport type not number");
    assert(dryManifest.advertiserIdTransportSafe === true, "dry advertiser_id transport not safe");
    assert(dryManifest.dmpRetargetingTagsExcludePresent === true, "DMP retargeting_tags_exclude missing");
    assert(dryManifest.dmpRetargetingTagsExcludeIntegerArray === true, "DMP retargeting_tags_exclude is not integer[]");
  }
  assert(dryView.prewriteGate.canCreate === false, "dry prewrite gate must not allow real create");
  assert(!dry.bundle.platformAction, "dry run recorded platform action");

  const mockCreated = await createTestJob(`test:payload-contract:execute-mock:${new Date().toISOString()}`);
  await runOe3WorkflowSkills({
    repo,
    jobId: mockCreated.jobId,
    mode: "execute_once",
    mockReady: true,
    mockExecute: true
  });
  const mock = await contractForJob(mockCreated.jobId);
  const mockManifest = mock.bundle.draft.payload_summary.final_payload_manifest || {};
  const mockFieldEvidence = mockManifest.officialFieldEvidence || {};
  const mockInstanceEvidence = mockManifest.instanceIdCreateEvidence || {};

  assert(mock.bundle.job.source_usage === "test_run", "mock payload contract job source_usage is not test_run");
  assert(typeof mock.bundle.draft.payload_summary.advertiser_id === "string", "mock advertiser_id storage summary is not string");
  assert(mock.contract.status === "passed", "mock payload contract did not pass");
  assert(mockFieldEvidence.status === "passed", "complete test field evidence should pass");
  assert(mockInstanceEvidence.status === "passed", "complete test instance evidence should pass");
  ["delivery_type", "micro_promotion_type", "layer_roi_switch"].forEach((fieldPath) => {
    assert(mockFieldEvidence.omittedFieldPaths?.includes(fieldPath), `${fieldPath} should be omitted in complete-evidence fixture`);
  });
  assert(mock.contract.expectedPayloadHash === mock.bundle.draft.payload_hash, "mock payload hash is not stable");
  assert(mockManifest.advertiserIdStorageType === "string", "mock advertiser_id storage type not string");
  assert(mockManifest.advertiserIdTransportType === "number", "mock advertiser_id transport type not number");
  assert(mockManifest.advertiserIdTransportSafe === true, "mock advertiser_id transport not safe");
  assert(mockManifest.dmpRetargetingTagsExcludePresent === true, "mock DMP retargeting_tags_exclude missing");
  assert(mockManifest.dmpRetargetingTagsExcludeIntegerArray === true, "mock DMP retargeting_tags_exclude is not integer[]");
  assert(mockManifest.miniProgramUrlRequired === false, "mock BYTE_GAME MICRO_GAME route should not require mini_program_info.url");
  assert(mock.bundle.readback.object_name === mock.bundle.draft.project_name, "mock readback object_name does not come from draft project_name");
  assert(mock.bundle.platformAction?.action_type === "mock_oceanengine_std_project_create", "mock execute did not use mock platform action");

  const longIdTransportPreflight = evaluateStdProjectCreatePreflight({
    requestFieldManifest: {
      instanceIdCreateEvidence: {
        status: "blocked",
        candidateField: "instance_id",
        fieldNameVerified: true,
        createFieldType: "number",
        fieldTypeVerified: true,
        applicabilityVerified: true,
        longIdTransportVerified: false,
        longPlatformId: true,
        blockers: ["instance_id_long_id_transport_not_verified"]
      }
    }
  });
  assert(longIdTransportPreflight.blocker_codes.includes("instance_id_long_id_transport_not_verified"), "19-digit instance transport must remain blocked without an official JSON transport contract");

  const result = {
    dryRun: {
      jobId: dry.bundle.job.job_id,
      sourceUsage: dry.bundle.job.source_usage,
      projectName: dry.bundle.draft.project_name,
      payloadHash: dry.bundle.draft.payload_hash,
      payloadContractStatus: dry.contract.status,
      advertiserIdStorageType: typeof dry.bundle.draft.payload_summary.advertiser_id,
      advertiserIdTransportType: dryManifest.advertiserIdTransportType || "",
      advertiserIdTransportSafe: dryManifest.advertiserIdTransportSafe === true,
      dmpBlocked: dryGapKeys.includes("dmp_custom_audience_ids"),
      dmpRetargetingTagsExcludeCount: dryManifest.dmpRetargetingTagsExcludeCount || 0,
      prewriteGateStatus: dryView.prewriteGate.status
    },
    executeMock: {
      jobId: mock.bundle.job.job_id,
      sourceUsage: mock.bundle.job.source_usage,
      projectName: mock.bundle.draft.project_name,
      payloadHash: mock.bundle.draft.payload_hash,
      payloadContractStatus: mock.contract.status,
      advertiserIdStorageType: typeof mock.bundle.draft.payload_summary.advertiser_id,
      advertiserIdTransportType: mockManifest.advertiserIdTransportType || "",
      advertiserIdTransportSafe: mockManifest.advertiserIdTransportSafe === true,
      dmpRetargetingTagsExcludeCount: mockManifest.dmpRetargetingTagsExcludeCount || 0,
      readbackStatus: mock.bundle.readback.readback_status
    },
    cleanupPlanned: cleanupJobIds.length
  };
  assertNoSensitiveLeak(result);
  console.log(JSON.stringify(result, null, 2));
} finally {
  for (const jobId of cleanupJobIds.reverse()) {
    await repo.deleteTestJobCascade(jobId);
  }
}
