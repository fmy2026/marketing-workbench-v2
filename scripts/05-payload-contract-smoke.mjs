import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import { createJob, runJob } from "../src/workflows/launchWorkflow.mjs";
import { evaluateOe3PayloadContract } from "../src/workflows/skills/oe3/05-payload-contract.mjs";
import { evaluateStdProjectCreatePreflight } from "../src/workflows/skills/oe3/05-create-preflight-diagnostics.mjs";
import { runOe3WorkflowSkills, assertNoSensitiveLeak } from "../src/workflows/skills/oe3/00-index.mjs";
import { INSTANCE_ID_WIRE_STRATEGY } from "../src/workflows/skills/oe3/05-std-project-create-wire-body.mjs";
import { SELLING_POINTS_CONTRACT } from "../src/workflows/skills/oe3/05-selling-points-contract.mjs";

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

function productSellingPointPayloadDiagnostic(points) {
  return evaluateStdProjectCreatePreflight({
    payload: {
      project_materials: {
        product_info: {
          selling_points: points
        }
      }
    }
  }).diagnostics.find((item) => item.check_id === "contract:product_selling_points");
}

function productSellingPointManifestPreflight({
  count,
  minChars,
  maxChars,
  validated = true,
  blockerCount = 0,
  source = "postgres:mwb.game_route_defaults.raw_defaults.payload_defaults.product.selling_points",
  ruleVersion = SELLING_POINTS_CONTRACT.ruleVersion
} = {}) {
  return evaluateStdProjectCreatePreflight({
    requestFieldManifest: {
      productSellingPointsSource: source,
      productSellingPointsContractRuleVersion: ruleVersion,
      productSellingPointsCount: count,
      productSellingPointsMinChars: minChars,
      productSellingPointsMaxChars: maxChars,
      productSellingPointsValidated: validated,
      productSellingPointsBlockerCount: blockerCount
    }
  }).diagnostics.find((item) => item.check_id === "manifest:product_selling_points");
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
  assert(dryInstanceEvidence.status === "passed", "runtime-derived instance create evidence should pass after wire transport verification");
  assert(!dryInstanceEvidence.blockers?.includes("instance_id_long_id_transport_not_verified"), "instance long-ID transport blocker should be removed");
  assert(dryManifest.microAppInstanceIdPresent === true, "verified instance candidate must enter payload");
  assert(dryManifest.microAppInstanceIdType === "string", "instance candidate should stay a string in memory");
  assert(dryManifest.microAppInstanceIdTransportStrategy === INSTANCE_ID_WIRE_STRATEGY, "instance candidate should use controlled wire number strategy");
  assert(dryManifest.microAppInstanceIdWireNumberTokenPresent === true, "instance candidate should be encoded as a JSON number token for create");
  assert(/^sha256:[a-f0-9]{64}$/.test(dryManifest.createWireBodyHash || ""), "create wire body hash missing");
  assert(dryManifest.createWireBodyHash === dryManifest.createRequestHash, "create request hash must match wire body hash");
  assert(dryManifest.miniProgramUrlRequired === true, "BYTE_GAME MICRO_GAME route should require mini_program_info.url");
  assert(dryManifest.miniProgramLaunchLinkPresent === true, "BYTE_GAME MICRO_GAME route should include controlled mini_program_info.url");
  assert(dryManifest.miniProgramLaunchLinkSchemeOk === true, "mini_program_info.url should use sslocal microgame scheme");
  assert(dryManifest.miniProgramLaunchLinkHashMatch === true, "mini_program_info.url hash should match controlled DB hash");
  assert(dryManifest.miniProgramLaunchLinkAppIdMatch === true, "mini_program_info.url should be bound to the active app_id");
  assert(!dryManifest.blockers?.includes("mini_game_launch_url_not_ready"), "ready BYTE_GAME MICRO_GAME route should not emit mini_game_launch_url_not_ready");
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
  assert(mockManifest.microAppInstanceIdTransportStrategy === INSTANCE_ID_WIRE_STRATEGY, "mock instance should use controlled wire number strategy");
  assert(mockManifest.microAppInstanceIdWireNumberTokenPresent === true, "mock instance should be encoded as JSON number token for create");
  ["delivery_type", "micro_promotion_type", "layer_roi_switch"].forEach((fieldPath) => {
    assert(mockFieldEvidence.omittedFieldPaths?.includes(fieldPath), `${fieldPath} should be omitted in complete-evidence fixture`);
  });
  assert(mock.contract.expectedPayloadHash === mock.bundle.draft.payload_hash, "mock payload hash is not stable");
  assert(mockManifest.advertiserIdStorageType === "string", "mock advertiser_id storage type not string");
  assert(mockManifest.advertiserIdTransportType === "number", "mock advertiser_id transport type not number");
  assert(mockManifest.advertiserIdTransportSafe === true, "mock advertiser_id transport not safe");
  assert(mockManifest.dmpRetargetingTagsExcludePresent === true, "mock DMP retargeting_tags_exclude missing");
  assert(mockManifest.dmpRetargetingTagsExcludeIntegerArray === true, "mock DMP retargeting_tags_exclude is not integer[]");
  assert(mockManifest.productSellingPointsSource === "postgres:mwb.game_route_defaults.raw_defaults.payload_defaults.product.selling_points", "mock selling_points source mismatch");
  assert(mockManifest.productSellingPointsValidated === true, "mock selling_points contract not validated");
  assert(mockManifest.productSellingPointsCount >= 1 && mockManifest.productSellingPointsCount <= 10, "mock selling_points count out of range");
  assert(mockManifest.productSellingPointsMinChars >= 6, "mock selling_points min chars out of range");
  assert(mockManifest.productSellingPointsMaxChars <= 9, "mock selling_points max chars out of range");
  assert(mockManifest.miniProgramUrlRequired === true, "mock BYTE_GAME MICRO_GAME route should require mini_program_info.url");
  assert(mockManifest.miniProgramLaunchLinkPresent === true, "mock BYTE_GAME MICRO_GAME route should include controlled mini_program_info.url");
  assert(mockManifest.miniProgramLaunchLinkHashMatch === true, "mock mini_program_info.url hash should match");
  assert(mock.bundle.readback.object_name === mock.bundle.draft.project_name, "mock readback object_name does not come from draft project_name");
  assert(mock.bundle.platformAction?.action_type === "mock_oceanengine_std_project_create", "mock execute did not use mock platform action");

  const longIdTransportPreflight = evaluateStdProjectCreatePreflight({
    requestFieldManifest: {
      requiredFieldsPresent: true,
      blockers: ["instance_id_long_id_transport_not_verified"],
      advertiserIdStorageType: "string",
      advertiserIdTransportType: "number",
      advertiserIdTransportSafe: true,
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
  assert(longIdTransportPreflight.blocker_codes.includes("instance_id_long_id_transport_not_verified"), "19-digit instance transport must remain blocked without verified wire transport");

  assert(productSellingPointPayloadDiagnostic(["开局装备全靠捡"])?.status === "passed", "valid selling_points payload should pass");
  assert(productSellingPointPayloadDiagnostic(["策略开荒"])?.blocker_code === "product_selling_points_item_length_out_of_range:0:4", "4-char selling_points payload should block");
  assert(productSellingPointPayloadDiagnostic(["五字卖点好"])?.blocker_code === "product_selling_points_item_length_out_of_range:0:5", "5-char selling_points payload should block");
  assert(productSellingPointPayloadDiagnostic(["十字卖点刚好超过限制"])?.blocker_code === "product_selling_points_item_length_out_of_range:0:10", "10-char selling_points payload should block");
  assert(productSellingPointPayloadDiagnostic([])?.blocker_code === "product_selling_points_count_out_of_range:0", "empty selling_points payload should block");
  assert(productSellingPointPayloadDiagnostic(Array.from({ length: 11 }, () => "开局装备全靠捡"))?.blocker_code === "product_selling_points_count_out_of_range:11", "over-10 selling_points payload should block");
  assert(productSellingPointPayloadDiagnostic(["开局装备全靠捡", 123])?.blocker_code === "product_selling_points_item_not_string:1", "non-string selling_points payload should block");
  assert(productSellingPointManifestPreflight({ count: 3, minChars: 7, maxChars: 8 })?.status === "passed", "valid selling_points manifest should pass");
  assert(productSellingPointManifestPreflight({ count: 3, minChars: 4, maxChars: 8 })?.blocker_code === "product_selling_points_contract_not_verified", "invalid selling_points manifest should block");

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
