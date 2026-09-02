import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import { createJob, runJob } from "../src/workflows/launchWorkflow.mjs";
import { evaluateOe3PayloadContract } from "../src/workflows/skills/oe3/05-payload-contract.mjs";
import { evaluateStdProjectCreatePreflight } from "../src/workflows/skills/oe3/05-create-preflight-diagnostics.mjs";
import { runOe3WorkflowSkills, assertNoSensitiveLeak } from "../src/workflows/skills/oe3/00-index.mjs";
import { INSTANCE_ID_WIRE_STRATEGY } from "../src/workflows/skills/oe3/05-std-project-create-wire-body.mjs";
import { SELLING_POINTS_CONTRACT } from "../src/workflows/skills/oe3/05-selling-points-contract.mjs";
import {
  TITLE_MATERIAL_CONTRACT,
  evaluateTitleMaterialSourceEntries
} from "../src/workflows/skills/oe3/05-title-materials-contract.mjs";
import {
  NESTED_FIELD_CONTRACT,
  evaluateNestedFieldContract,
  nestedFieldContractManifest
} from "../src/workflows/skills/oe3/05-nested-field-contract.mjs";
import {
  JSZC_FALLBACK_AGES,
  JSZC_FALLBACK_BID,
  JSZC_FALLBACK_BUDGET,
  JSZC_FALLBACK_CALL_TO_ACTION_BUTTONS,
  JSZC_FALLBACK_GENDER,
  JSZC_FALLBACK_ROI_GOAL,
  JSZC_FALLBACK_SCHEDULE_TIME,
  JSZC_SUCCESS_PROFILE_FIXTURE_HASH,
  JSZC_SUCCESS_PROFILE_SOURCE,
  JSZC_SUCCESS_PROFILE_VERSION
} from "../src/workflows/skills/oe3/05-jszc-success-profile.mjs";

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

function titleMaterialPayloadDiagnostic(items) {
  return evaluateStdProjectCreatePreflight({
    payload: {
      project_materials: {
        title_material_list: items
      }
    }
  }).diagnostics.find((item) => item.check_id === "contract:title_material_list");
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

function titleMaterialManifestPreflight({
  count,
  minChars,
  maxChars,
  validated = true,
  blockerCount = 0,
  source = TITLE_MATERIAL_CONTRACT.source,
  ruleVersion = TITLE_MATERIAL_CONTRACT.ruleVersion,
  assetIds = Array.from({ length: count || 0 }, (_, index) => `TM-${index}`),
  assetHashes = Array.from({ length: count || 0 }, (_, index) => `sha256:${String(index).padStart(64, "0")}`),
  packId = "MD-JSZC-HUNT-HUNTING-BASELINE-001",
  sourceTypeMismatchCount = 0,
  filenameLikeCount = 0
} = {}) {
  return evaluateStdProjectCreatePreflight({
    requestFieldManifest: {
      titleMaterialSource: source,
      titleMaterialPackId: packId,
      titleMaterialContractRuleVersion: ruleVersion,
      titleMaterialAssetIds: assetIds,
      titleMaterialAssetHashes: assetHashes,
      titleMaterialCount: count,
      titleMaterialMinChars: minChars,
      titleMaterialMaxChars: maxChars,
      titleMaterialValidated: validated,
      titleMaterialBlockerCount: blockerCount,
      titleMaterialSourceTypeMismatchCount: sourceTypeMismatchCount,
      titleMaterialFilenameLikeCount: filenameLikeCount
    }
  }).diagnostics.find((item) => item.check_id === "manifest:title_materials");
}

function createFieldContractManifestPreflight({
  deliveryEvidence = { fieldPath: "delivery_type", evidenceLevel: "official_direct", sendPolicy: "send", status: "passed" },
  layerEvidence = { fieldPath: "layer_roi_switch", evidenceLevel: "official_direct", sendPolicy: "send", status: "passed" },
  scheduleEvidence = { fieldPath: "schedule_time", evidenceLevel: "official_direct", sendPolicy: "send", status: "passed" },
  omittedFieldPaths = ["micro_promotion_type"],
  extraFields = []
} = {}) {
  return evaluateStdProjectCreatePreflight({
    requestFieldManifest: {
      officialFieldEvidence: {
        status: "passed",
        blockerCodes: [],
        omittedFieldPaths,
        fields: [deliveryEvidence, layerEvidence, scheduleEvidence, ...extraFields].filter(Boolean)
      }
    }
  }).diagnostics.find((item) => item.check_id === "manifest:create_field_contract_delivery_layer_micro");
}

function createFieldPayloadPreflight(payloadPatch = {}, requestFieldManifest = {}) {
  return evaluateStdProjectCreatePreflight({
    payload: {
      advertiser_id: 123,
      name: "245791_N_JSZC_TEST_TEST_DEMO_P01_20260829",
      asset_id: 456,
      delivery_type: "NORMAL",
      layer_roi_switch: "OFF",
      budget: JSZC_FALLBACK_BUDGET,
      cpa_bid: JSZC_FALLBACK_BID,
      roi_goal: JSZC_FALLBACK_ROI_GOAL,
      schedule_time: JSZC_FALLBACK_SCHEDULE_TIME,
      brand_info: { brand_name_id: 1, cdp_brand_id: 2, yuntu_category_id: 3 },
      audience: {
        gender: JSZC_FALLBACK_GENDER,
        age: [...JSZC_FALLBACK_AGES],
        hide_if_converted: "NO_EXCLUDE",
        retargeting_tags_exclude: Array.from({ length: 10 }, (_, index) => 123 + index)
      },
      project_materials: {
        image_material_list: [],
        product_info: { selling_points: ["开局装备全靠捡"] },
        title_material_list: [{ title: "开局一把枪，装备全靠捡，看你能射多远！" }],
        call_to_action_buttons: [...JSZC_FALLBACK_CALL_TO_ACTION_BUTTONS]
      },
      ...payloadPatch
    },
    requestFieldManifest: {
      externalUrlMaterialListPolicy: "send",
      filterEventPolicy: "omit",
      convertedTimeDurationPolicy: "omit_when_no_exclude",
      ...requestFieldManifest
    }
  });
}

function nestedFieldManifestPreflight({
  status = "passed",
  ruleVersion = NESTED_FIELD_CONTRACT.ruleVersion,
  source = NESTED_FIELD_CONTRACT.source,
  checkedPathCount = 18,
  blockerCount = 0,
  blockers = [],
  checkedGroups = ["video_materials", "product_info", "image_material_list", "external_url_material_list", "mini_program_info", "track_url_setting", "audience"],
  externalUrlMaterialListPolicy = "send",
  externalUrlMaterialListPresent = true,
  externalUrlMaterialListOmittedByContract = false,
  filterEventPolicy = "omit",
  filterEventPresent = false,
  filterEventOmittedByContract = true,
  convertedTimeDurationPolicy = "omit_when_no_exclude",
  convertedTimeDurationPresent = false,
  convertedTimeDurationOmittedByContract = true,
  rawPayloadStored = false
} = {}) {
  return evaluateStdProjectCreatePreflight({
    requestFieldManifest: {
      nestedFieldContract: {
        status,
        ruleVersion,
        source,
        checkedPathCount,
        blockerCount,
        blockers,
        checkedGroups,
        externalUrlMaterialListPolicy,
        externalUrlMaterialListPresent,
        externalUrlMaterialListOmittedByContract,
        filterEventPolicy,
        filterEventPresent,
        filterEventOmittedByContract,
        convertedTimeDurationPolicy,
        convertedTimeDurationPresent,
        convertedTimeDurationOmittedByContract,
        rawPayloadStored
      }
    }
  }).diagnostics.find((item) => item.check_id === "manifest:nested_field_contract");
}

function nestedRules(externalUrlMaterialListPolicy = "send") {
  return {
    version: NESTED_FIELD_CONTRACT.ruleVersion,
    source: NESTED_FIELD_CONTRACT.source,
    groups: {
      "project_materials.video_material_list": { reference: "open.oceanengine.com-3.0-waibugei/巨量营销智擎版/创建标准项目.md:143" },
      "project_materials.image_material_list": { reference: "open.oceanengine.com-3.0-waibugei/巨量营销智擎版/创建标准项目.md:149", send_policy: "send_empty_array" },
      "project_materials.external_url_material_list": { reference: "open.oceanengine.com-3.0-waibugei/巨量营销智擎版/创建标准项目.md:174", send_policy: externalUrlMaterialListPolicy, required_count: 1 },
      "project_materials.product_info": { reference: "open.oceanengine.com-3.0-waibugei/巨量营销智擎版/创建标准项目.md:163" },
      "project_materials.call_to_action_buttons": { reference: "open.oceanengine.com-3.0-waibugei/巨量营销智擎版/创建标准项目.md:167" },
      "project_materials.source": { reference: "open.oceanengine.com-3.0-waibugei/巨量营销智擎版/创建标准项目.md:173" },
      "project_materials.anchor_related_type": { reference: "open.oceanengine.com-3.0-waibugei/巨量营销智擎版/创建标准项目.md:168" },
      "project_materials.mini_program_info": { reference: "open.oceanengine.com-3.0-waibugei/巨量营销智擎版/创建标准项目.md:184" },
      "track_url_setting": { reference: "open.oceanengine.com-3.0-waibugei/巨量营销智擎版/创建标准项目.md" },
      "audience": {
        reference: "open.oceanengine.com-3.0-waibugei/巨量营销智擎版/创建标准项目.md",
        filter_event_policy: "omit",
        converted_time_duration_policy: "omit_when_no_exclude"
      },
      "brand_info": { reference: "open.oceanengine.com-3.0-waibugei/巨量营销智擎版/创建标准项目.md:189" }
    }
  };
}

function nestedContractCase(mutator = () => {}, { externalUrlMaterialListPolicy = "send" } = {}) {
  const payload = {
    landing_type: "MICRO_GAME",
    delivery_medium: "BYTE_GAME",
    external_action: "AD_CONVERT_TYPE_PAY",
    audience: {
      gender: JSZC_FALLBACK_GENDER,
      age: [...JSZC_FALLBACK_AGES],
      hide_if_converted: "NO_EXCLUDE",
      retargeting_tags_exclude: Array.from({ length: 10 }, (_, index) => 123 + index)
    },
    brand_info: {
      brand_name_id: 1,
      cdp_brand_id: 2,
      cdp_brand_name: "巨兽战场",
      yuntu_category_id: 3
    },
    project_materials: {
      title_material_list: [{ title: "开局一把枪，装备全靠捡，看你能射多远！" }],
      video_material_list: [{
        image_mode: "CREATIVE_IMAGE_MODE_VIDEO_VERTICAL",
        video_id: "v1",
        video_cover_id: "c1"
      }],
      image_material_list: [],
      ...(externalUrlMaterialListPolicy === "send" ? { external_url_material_list: ["https://example.invalid/backup"] } : {}),
      product_info: {
        titles: ["巨兽战场"],
        image_ids: ["789"],
        selling_points: ["开局装备全靠捡"]
      },
      call_to_action_buttons: [...JSZC_FALLBACK_CALL_TO_ACTION_BUTTONS],
      source: "巨兽战场",
      anchor_related_type: "OFF",
      mini_program_info: {
        url: "sslocal://microgame?app_id=tte95a9fe77665844607"
      }
    },
    track_url_setting: {
      send_type: "SERVER_SEND",
      action_track_url: ["https://example.invalid/touchpoint"]
    }
  };
  const bundle = {
    game: { game_name: "巨兽战场", product_name: "巨兽战场", brand_name: "巨兽战场" },
    defaults: {
      raw_defaults: {
        official_create_field_contract: { nested_rules: nestedRules(externalUrlMaterialListPolicy) },
        payload_defaults: {
          product: { call_to_action_buttons: [...JSZC_FALLBACK_CALL_TO_ACTION_BUTTONS] }
        }
      }
    },
    materialPack: {
      items: [{
        item: { item_type: "video_asset", required: true, asset_id: "VIDEO-1" },
        asset: {
          asset_id: "VIDEO-1",
          metadata: { video_id: "v1", video_cover_id: "c1" }
        }
      }]
    },
    resources: [{
      resource_type: "video_asset",
      source_asset_id: "VIDEO-1",
      visibility_status: "visible",
      readback_status: "readback_verified",
      metadata: {
        readonly_check: {
          status: "passed",
          video_id_present: true,
          cover_mode: "explicit_cover_verified",
          evidence_refs: ["EVIDENCE-VIDEO-1"]
        }
      }
    }, {
      resource_type: "product_image",
      platform_resource_id: "789",
      visibility_status: "visible",
      readback_status: "readback_verified",
      metadata: {
        product_image_target_upload_readback: {
          status: "passed",
          image_id_present: true,
          material_id_present: true
        }
      }
    }]
  };
  const miniProgramLaunchLink = {
    ready: true,
    checks: { hashMatch: true, appIdMatch: true }
  };
  mutator({ payload, bundle, miniProgramLaunchLink });
  return evaluateNestedFieldContract({
    payload,
    bundle,
    materialReadiness: { status: "passed" },
    backupLandingPage: { ready: true },
    miniProgramLaunchLink
  });
}

function titleEntry({ title = "开局一把枪，装备全靠捡，看你能射多远！", id = "TM-1", itemType = "title_material", assetType = "title_material", required = true, status = "active", sortOrder = 101 } = {}) {
  return {
    item: {
      item_type: itemType,
      required,
      status,
      sort_order: sortOrder,
      asset_id: id,
      asset_ref: id
    },
    asset: {
      asset_id: id,
      asset_type: assetType,
      asset_name: title,
      asset_ref: id,
      asset_hash: `sha256:${id.padEnd(64, "0").slice(0, 64)}`
    }
  };
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
  assert(dryManifest.externalUrlMaterialListPolicy === "send", "dry JSZC route should send external_url_material_list by contract");
  if (dryManifest.externalUrlMaterialListPresent) {
    assert(dryManifest.externalUrlMaterialListCount === 1, "ready dynamic backup page should produce exactly one external_url_material_list item");
    assert(dryManifest.backupLandingPageHttps && dryManifest.backupLandingPageTargetVisible && dryManifest.backupLandingPageReadbackVerified && dryManifest.backupLandingPageHashMatch, "sent dynamic backup page must satisfy the persisted readiness checks");
  } else {
    assert(dryManifest.externalUrlMaterialListCount === 0, "blocked dynamic backup page must produce no external_url_material_list item");
    assert((dryManifest.blockers || []).some((code) => code.startsWith("backup_landing_page_")), "blocked dynamic backup page should expose its current readiness blocker");
  }
  assert(dryManifest.externalUrlMaterialListOmittedByContract === false, "dry external_url_material_list send should be recorded");
  assert(dryManifest.filterEventPolicy === "omit", "dry JSZC route should use filter_event omit policy");
  assert(dryManifest.filterEventPresent === false, "dry payload must omit audience.filter_event");
  assert(dryManifest.filterEventOmittedByContract === true, "dry filter_event omission should be recorded");
  assert(dryManifest.convertedTimeDurationPolicy === "omit_when_no_exclude", "dry JSZC route should use converted_time_duration omission policy");
  assert(dryManifest.convertedTimeDurationPresent === false, "dry payload must omit audience.converted_time_duration");
  assert(dryManifest.convertedTimeDurationOmittedByContract === true, "dry converted_time_duration omission should be recorded");
  assert(dryManifest.successProfileVersion === JSZC_SUCCESS_PROFILE_VERSION, "dry success profile version mismatch");
  assert(dryManifest.successProfile?.source === JSZC_SUCCESS_PROFILE_SOURCE, "dry success profile source mismatch");
  assert(dryManifest.successProfile?.fixtureHash === JSZC_SUCCESS_PROFILE_FIXTURE_HASH, "dry success profile fixture mismatch");
  assert(dryManifest.budgetMatchesFallback === true && dryManifest.bidMatchesFallback === true && dryManifest.roiGoalMatchesFallback === true, "dry numeric fallback values mismatch");
  assert(dryManifest.audienceGender === JSZC_FALLBACK_GENDER && dryManifest.audienceAgeMatchesFallback === true && dryManifest.audienceAgeCount === 5, "dry gender/age fallback mismatch");
  assert(dryManifest.callToActionMatchesFallback === true && dryManifest.callToActionCount === 5, "dry incremental CTA fallback mismatch");
  assert(dryManifest.scheduleTimeLength === 336 && dryManifest.scheduleTimeBinary === true && dryManifest.scheduleTimeDigestMatches === true && dryManifest.scheduleTimeExactMatch === true, "dry schedule_time fallback contract mismatch");
  assert(/^sha256:[a-f0-9]{64}$/.test(dryManifest.fieldShapeHash || ""), "dry field shape hash missing");
  assert(dryManifest.createFieldLedger?.fieldShapeHash === dryManifest.fieldShapeHash, "dry field shape hash must match ledger");
  assert(dryManifest.createFieldLedger?.entries?.some((entry) => entry.path === "audience.converted_time_duration" && entry.sendPolicy === "omit" && entry.preCreateStatus === "passed"), "dry ledger must attest converted_time_duration omission");
  assert(dryManifest.imageMaterialListEmpty === true, "dry image_material_list should be empty");
  assert(dryFieldEvidence.fields?.some((field) => field.fieldPath === "delivery_type" && field.evidenceLevel === "official_direct" && field.sendPolicy === "send" && field.status === "passed"), "delivery_type should be sent with direct create evidence");
  assert(dryFieldEvidence.fields?.some((field) => field.fieldPath === "layer_roi_switch" && field.evidenceLevel === "official_direct" && field.sendPolicy === "send" && field.status === "passed"), "layer_roi_switch should be sent with direct create evidence");
  assert(dryFieldEvidence.omittedFieldPaths?.includes("micro_promotion_type"), "micro_promotion_type should be omitted from create payload");
  assert(!dryFieldEvidence.fields?.some((field) => field.fieldPath === "micro_promotion_type"), "micro_promotion_type should not be a sent field");
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
    assert(dryManifest.dmpRetargetingTagsExcludeCount >= 10, "DMP retargeting_tags_exclude was reduced below 10");
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
  assert(mock.contract.status === "passed", `mock payload contract did not pass:${mock.contract.gaps.map((gap) => gap.key).join(",")}:${JSON.stringify(mockManifest.blockers || [])}`);
  assert(mockFieldEvidence.status === "passed", "complete test field evidence should pass");
  assert(mockInstanceEvidence.status === "passed", "complete test instance evidence should pass");
  assert(mockManifest.microAppInstanceIdTransportStrategy === INSTANCE_ID_WIRE_STRATEGY, "mock instance should use controlled wire number strategy");
  assert(mockManifest.microAppInstanceIdWireNumberTokenPresent === true, "mock instance should be encoded as JSON number token for create");
  assert(mockFieldEvidence.fields?.some((field) => field.fieldPath === "delivery_type" && field.evidenceLevel === "official_direct" && field.sendPolicy === "send" && field.status === "passed"), "mock delivery_type should be sent with direct create evidence");
  assert(mockFieldEvidence.fields?.some((field) => field.fieldPath === "layer_roi_switch" && field.evidenceLevel === "official_direct" && field.sendPolicy === "send" && field.status === "passed"), "mock layer_roi_switch should be sent with direct create evidence");
  assert(mockFieldEvidence.omittedFieldPaths?.includes("micro_promotion_type"), "mock micro_promotion_type should be omitted from create payload");
  assert(!mockFieldEvidence.fields?.some((field) => field.fieldPath === "micro_promotion_type"), "mock micro_promotion_type should not be a sent field");
  assert(mock.contract.expectedPayloadHash === mock.bundle.draft.payload_hash, "mock payload hash is not stable");
  assert(mockManifest.advertiserIdStorageType === "string", "mock advertiser_id storage type not string");
  assert(mockManifest.advertiserIdTransportType === "number", "mock advertiser_id transport type not number");
  assert(mockManifest.advertiserIdTransportSafe === true, "mock advertiser_id transport not safe");
  assert(mockManifest.dmpRetargetingTagsExcludePresent === true, "mock DMP retargeting_tags_exclude missing");
  assert(mockManifest.dmpRetargetingTagsExcludeIntegerArray === true, "mock DMP retargeting_tags_exclude is not integer[]");
  assert(mockManifest.dmpRetargetingTagsExcludeCount >= 10, "mock DMP retargeting_tags_exclude was reduced below 10");
  assert(mockManifest.budgetMatchesFallback === true && mockManifest.bidMatchesFallback === true && mockManifest.roiGoalMatchesFallback === true, "mock numeric fallback values mismatch");
  assert(mockManifest.audienceGender === JSZC_FALLBACK_GENDER && mockManifest.audienceAgeMatchesFallback === true, "mock gender/age fallback mismatch");
  assert(mockManifest.callToActionMatchesFallback === true && mockManifest.scheduleTimeDigestMatches === true, "mock CTA/schedule fallback mismatch");
  assert(mockManifest.productSellingPointsSource === "postgres:mwb.game_route_defaults.raw_defaults.payload_defaults.product.selling_points", "mock selling_points source mismatch");
  assert(mockManifest.productSellingPointsValidated === true, "mock selling_points contract not validated");
  assert(mockManifest.productSellingPointsCount >= 1 && mockManifest.productSellingPointsCount <= 10, "mock selling_points count out of range");
  assert(mockManifest.productSellingPointsMinChars >= 6, "mock selling_points min chars out of range");
  assert(mockManifest.productSellingPointsMaxChars <= 9, "mock selling_points max chars out of range");
  assert(mockManifest.titleMaterialSource === TITLE_MATERIAL_CONTRACT.source, "mock title_material source mismatch");
  assert(mockManifest.titleMaterialValidated === true, "mock title_material contract not validated");
  assert(mockManifest.titleMaterialCount >= 1 && mockManifest.titleMaterialCount <= 30, "mock title_material count out of range");
  assert(mockManifest.titleMaterialMinChars >= 5, "mock title_material min chars out of range");
  assert(mockManifest.titleMaterialMaxChars <= 55, "mock title_material max chars out of range");
  assert(mockManifest.titleMaterialAssetIds?.length === mockManifest.titleMaterialCount, "mock title_material asset IDs not recorded");
  assert(mockManifest.titleMaterialAssetHashes?.length === mockManifest.titleMaterialCount, "mock title_material asset hashes not recorded");
  assert(!mockManifest.titleMaterialTitles, "mock manifest must not store raw title list");
  assert(mockManifest.nestedFieldContract?.status === "passed", "mock nested field contract should pass");
  assert(mockManifest.nestedFieldContract?.ruleVersion === NESTED_FIELD_CONTRACT.ruleVersion, "mock nested field contract version mismatch");
  assert(mockManifest.nestedFieldContract?.blockerCount === 0, "mock nested field contract should have no blockers");
  assert(mockManifest.nestedFieldContract?.rawPayloadStored === false, "mock nested field contract must not store raw payload");
  assert(mockManifest.miniProgramUrlRequired === true, "mock BYTE_GAME MICRO_GAME route should require mini_program_info.url");
  assert(mockManifest.miniProgramLaunchLinkPresent === true, "mock BYTE_GAME MICRO_GAME route should include controlled mini_program_info.url");
  assert(mockManifest.miniProgramLaunchLinkHashMatch === true, "mock mini_program_info.url hash should match");
  assert(mockManifest.externalUrlMaterialListPolicy === "send", "mock JSZC route should send external_url_material_list by contract");
  assert(mockManifest.externalUrlMaterialListPresent === true, "mock payload should include external_url_material_list");
  assert(mockManifest.externalUrlMaterialListCount === 1, "mock payload should include exactly one external_url_material_list item");
  assert(mockManifest.externalUrlMaterialListOmittedByContract === false, "mock external_url_material_list send should be recorded");
  assert(mockManifest.filterEventPolicy === "omit", "mock JSZC route should use filter_event omit policy");
  assert(mockManifest.filterEventPresent === false, "mock payload must omit audience.filter_event");
  assert(mockManifest.filterEventOmittedByContract === true, "mock filter_event omission should be recorded");
  assert(mockManifest.convertedTimeDurationPolicy === "omit_when_no_exclude", "mock JSZC route should use converted_time_duration omission policy");
  assert(mockManifest.convertedTimeDurationPresent === false, "mock payload must omit audience.converted_time_duration");
  assert(mockManifest.convertedTimeDurationOmittedByContract === true, "mock converted_time_duration omission should be recorded");
  assert(mockManifest.successProfileVersion === JSZC_SUCCESS_PROFILE_VERSION, "mock success profile version mismatch");
  assert(/^sha256:[a-f0-9]{64}$/.test(mockManifest.fieldShapeHash || ""), "mock field shape hash missing");
  assert(mockManifest.imageMaterialListEmpty === true, "mock image_material_list should be empty");
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
  assert(createFieldPayloadPreflight().diagnostics.find((item) => item.check_id === "enum:delivery_type")?.status === "passed", "valid delivery_type enum should pass");
  assert(createFieldPayloadPreflight().diagnostics.find((item) => item.check_id === "enum:layer_roi_switch")?.status === "passed", "valid layer_roi_switch enum should pass");
  assert(createFieldPayloadPreflight().diagnostics.find((item) => item.check_id === "contract:schedule_time")?.status === "passed", "valid 336-bit schedule_time should pass");
  assert(createFieldPayloadPreflight({ schedule_time: `${JSZC_FALLBACK_SCHEDULE_TIME.slice(0, -1)}0` }).blocker_codes.includes("schedule_time_not_jszc_fallback_contract"), "schedule_time digest drift should block");
  assert(createFieldPayloadPreflight({ schedule_time: JSZC_FALLBACK_SCHEDULE_TIME.slice(0, -1) }).blocker_codes.includes("schedule_time_not_jszc_fallback_contract"), "335-bit schedule_time should block");
  assert(createFieldPayloadPreflight({ budget: 88888 }).blocker_codes.includes("jszc_fallback_number_mismatch:budget"), "old budget fallback should block");
  assert(createFieldPayloadPreflight({ cpa_bid: 488 }).blocker_codes.includes("jszc_fallback_number_mismatch:cpa_bid"), "old bid fallback should block");
  assert(createFieldPayloadPreflight({ roi_goal: 0.088 }).blocker_codes.includes("jszc_fallback_number_mismatch:roi_goal"), "old ROI fallback should block");
  assert(createFieldPayloadPreflight({ audience: { gender: JSZC_FALLBACK_GENDER, age: [...JSZC_FALLBACK_AGES].reverse(), hide_if_converted: "NO_EXCLUDE", retargeting_tags_exclude: Array.from({ length: 10 }, (_, index) => 123 + index) } }).blocker_codes.includes("jszc_fallback_array_mismatch:audience.age"), "age order drift should block");
  assert(createFieldPayloadPreflight({ audience: { gender: JSZC_FALLBACK_GENDER, age: [...JSZC_FALLBACK_AGES], hide_if_converted: "NO_EXCLUDE", retargeting_tags_exclude: Array.from({ length: 9 }, (_, index) => 123 + index) } }).blocker_codes.includes("invalid_integer_array:audience.retargeting_tags_exclude"), "DMP exclusions below 10 should block");
  assert(createFieldPayloadPreflight({ project_materials: { image_material_list: [], product_info: { selling_points: ["开局装备全靠捡"] }, title_material_list: [{ title: "开局一把枪，装备全靠捡，看你能射多远！" }], call_to_action_buttons: ["打开游戏", "点击即玩", "进入游戏", "无需下载"] } }).blocker_codes.includes("jszc_fallback_array_mismatch:project_materials.call_to_action_buttons"), "CTA removal of 立即试玩 should block");
  assert(createFieldPayloadPreflight({ delivery_type: "BAD" }).blocker_codes.includes("invalid_enum:delivery_type"), "invalid delivery_type enum should block");
  assert(createFieldPayloadPreflight({ layer_roi_switch: "BAD" }).blocker_codes.includes("invalid_enum:layer_roi_switch"), "invalid layer_roi_switch enum should block");
  assert(createFieldPayloadPreflight({ micro_promotion_type: "BYTE_GAME" }).blocker_codes.includes("forbidden_field:micro_promotion_type"), "micro_promotion_type should be forbidden in create preflight");
  assert(createFieldPayloadPreflight().diagnostics.find((item) => item.check_id === "absent:audience.filter_event")?.status === "passed", "NO_EXCLUDE should pass only when audience.filter_event is absent");
  assert(createFieldPayloadPreflight({ audience: { gender: "GENDER_UNLIMITED", hide_if_converted: "NO_EXCLUDE", filter_event: [], retargeting_tags_exclude: [123] } }).blocker_codes.includes("filter_event_must_be_omitted_for_no_exclude"), "empty audience.filter_event should block under NO_EXCLUDE");
  assert(createFieldPayloadPreflight({ audience: { gender: "GENDER_UNLIMITED", hide_if_converted: "NO_EXCLUDE", filter_event: ["AD_CONVERT_TYPE_PAY"], retargeting_tags_exclude: [123] } }).blocker_codes.includes("filter_event_must_be_omitted_for_no_exclude"), "PAY audience.filter_event should block under NO_EXCLUDE");
  assert(createFieldPayloadPreflight().diagnostics.find((item) => item.check_id === "absent:audience.converted_time_duration")?.status === "passed", "NO_EXCLUDE should pass only when audience.converted_time_duration is absent");
  for (const invalidValue of ["SIX_MONTH", null, ""]) {
    assert(createFieldPayloadPreflight({ audience: { gender: "GENDER_UNLIMITED", hide_if_converted: "NO_EXCLUDE", converted_time_duration: invalidValue, retargeting_tags_exclude: [123] } }).blocker_codes.includes("converted_time_duration_must_be_omitted_for_no_exclude"), "present audience.converted_time_duration should block under NO_EXCLUDE");
  }
  assert(createFieldPayloadPreflight({ project_materials: { image_material_list: [] } }).diagnostics.find((item) => item.check_id === "empty_array:project_materials.image_material_list")?.status === "passed", "empty image_material_list should pass current route preflight");
  assert(createFieldPayloadPreflight({ project_materials: { image_material_list: [{ material_id: 1 }] } }).blocker_codes.includes("image_material_list_must_be_empty_for_current_route"), "nonempty image_material_list should block current route preflight");
  assert(createFieldPayloadPreflight({ project_materials: { image_material_list: [], external_url_material_list: ["https://example.invalid/backup"] } }).diagnostics.find((item) => item.check_id === "https_string_array:project_materials.external_url_material_list")?.status === "passed", "current success profile should allow exactly one HTTPS external_url_material_list item");
  assert(createFieldPayloadPreflight(
    { project_materials: { image_material_list: [], external_url_material_list: ["https://example.invalid/backup"] } },
    { externalUrlMaterialListPolicy: "send" }
  ).diagnostics.find((item) => item.check_id === "https_string_array:project_materials.external_url_material_list")?.status === "passed", "send policy should allow exactly one HTTPS external_url_material_list item");
  assert(createFieldPayloadPreflight(
    { project_materials: { image_material_list: [], external_url_material_list: [] } },
    { externalUrlMaterialListPolicy: "send" }
  ).blocker_codes.includes("invalid_https_string_array:project_materials.external_url_material_list"), "send policy should reject an empty external_url_material_list");
  assert(createFieldPayloadPreflight(
    { project_materials: { image_material_list: [], external_url_material_list: ["https://example.invalid/one", "https://example.invalid/two"] } },
    { externalUrlMaterialListPolicy: "send" }
  ).blocker_codes.includes("invalid_https_string_array:project_materials.external_url_material_list"), "send policy should reject multiple external_url_material_list items");
  assert(createFieldContractManifestPreflight()?.status === "passed", "valid delivery/layer/schedule/micro manifest should pass");
  assert(createFieldContractManifestPreflight({ deliveryEvidence: null })?.blocker_code === "create_field_contract_not_direct_send:delivery_type", "missing delivery_type direct evidence should block");
  assert(createFieldContractManifestPreflight({ layerEvidence: { fieldPath: "layer_roi_switch", evidenceLevel: "unverified", sendPolicy: "omit", status: "blocked" } })?.blocker_code === "create_field_contract_not_direct_send:layer_roi_switch", "downgraded layer_roi_switch evidence should block");
  assert(createFieldContractManifestPreflight({ omittedFieldPaths: [] })?.blocker_code === "micro_promotion_type_not_omitted_from_create_payload", "micro_promotion_type omitted evidence should be required");
  assert(createFieldContractManifestPreflight({ extraFields: [{ fieldPath: "micro_promotion_type", evidenceLevel: "official_related_endpoint", sendPolicy: "send", status: "blocked" }] })?.blocker_code === "micro_promotion_type_not_omitted_from_create_payload", "sent micro_promotion_type evidence should block");
  assert(nestedFieldManifestPreflight()?.status === "passed", "valid nested field manifest should pass");
  assert(nestedFieldManifestPreflight({ status: "blocked", blockerCount: 1, blockers: ["nested_video_image_mode_invalid:0"] })?.blocker_code === "nested_video_image_mode_invalid:0", "nested field manifest blockers should surface");
  assert(nestedFieldManifestPreflight({ ruleVersion: "old" })?.blocker_code === "nested_field_contract_not_verified", "nested field manifest version mismatch should block");
  assert(nestedFieldManifestPreflight({ externalUrlMaterialListPolicy: "send", externalUrlMaterialListPresent: true, externalUrlMaterialListOmittedByContract: false })?.status === "passed", "sent external_url_material_list manifest should pass the send route");
  assert(nestedFieldManifestPreflight({ filterEventPresent: true, filterEventOmittedByContract: false })?.blocker_code === "nested_field_contract_not_verified", "sent filter_event manifest should block under the omit route");
  assert(nestedContractCase().status === "passed", "valid nested payload should pass");
  assert(nestedFieldContractManifest(nestedContractCase()).rawPayloadStored === false, "nested manifest must not store raw payload");
  assert(nestedContractCase(({ payload }) => { payload.project_materials.video_material_list[0].image_mode = "BAD"; }).blockers.includes("nested_video_image_mode_invalid:0"), "invalid video image_mode should block");
  assert(nestedContractCase(({ payload }) => { payload.project_materials.image_material_list = [{ image_id: "IMG-1" }]; }).blockers.includes("nested_image_material_list_must_be_empty_for_current_route"), "nonempty image_material_list should block");
  assert(nestedContractCase(({ payload }) => { delete payload.project_materials.external_url_material_list; }).blockers.includes("nested_external_url_material_list_contract_invalid"), "current success profile should require external_url_material_list");
  assert(nestedContractCase(({ payload }) => {
    payload.project_materials.external_url_material_list = ["https://example.invalid/backup"];
  }, { externalUrlMaterialListPolicy: "send" }).status === "passed", "send route should allow exactly one ready external_url_material_list item");
  assert(nestedContractCase(({ payload }) => {
    payload.project_materials.external_url_material_list = ["https://example.invalid/one", "https://example.invalid/two"];
  }, { externalUrlMaterialListPolicy: "send" }).blockers.includes("nested_external_url_material_list_contract_invalid"), "send route should reject multiple external_url_material_list items");
  assert(nestedContractCase(({ payload }) => { delete payload.project_materials.video_material_list[0].video_cover_id; }).blockers.includes("nested_video_cover_contract_invalid:0"), "missing explicit video cover should block");
  assert(nestedContractCase(({ payload, bundle }) => {
    delete payload.project_materials.video_material_list[0].video_cover_id;
    bundle.resources[0].metadata.readonly_check.cover_mode = "platform_default_cover_allowed";
  }).status === "passed", "platform default video cover should pass when cover is omitted");
  assert(nestedContractCase(({ payload }) => { payload.project_materials.product_info.image_ids = ["999"]; }).blockers.includes("nested_product_image_ids_source_not_verified"), "wrong product image source should block");
  assert(nestedContractCase(({ payload }) => { payload.project_materials.product_info.titles = ["超长产品名称超长产品名称超长产品名称"]; }).blockers.includes("nested_product_titles_contract_invalid"), "overlong product title should block");
  assert(nestedContractCase(({ payload }) => { payload.project_materials.call_to_action_buttons = ["马上立刻现在试玩"]; }).blockers.includes("nested_call_to_action_contract_invalid"), "invalid CTA length should block");
  assert(nestedContractCase(({ payload }) => { payload.project_materials.anchor_related_type = "SELECT"; }).blockers.includes("nested_anchor_select_requires_readonly_contract"), "SELECT anchor should require separate readonly contract");
  assert(nestedContractCase(({ payload }) => { payload.project_materials.mini_program_info.app_id = "tte95a9fe77665844607"; }).blockers.includes("nested_mini_program_info_contract_invalid"), "mini_program_info url and app_id together should block");
  assert(nestedContractCase(({ payload }) => { payload.track_url_setting.action_track_url = []; }).blockers.includes("nested_track_url_setting_contract_invalid"), "missing controlled touchpoint should block");
  assert(nestedContractCase(({ payload }) => { payload.audience.filter_event = []; }).blockers.includes("nested_audience_contract_invalid"), "empty audience.filter_event should block when the route requires omission");
  assert(nestedContractCase(({ payload }) => { payload.audience.filter_event = ["AD_CONVERT_TYPE_PAY"]; }).blockers.includes("nested_audience_contract_invalid"), "PAY audience.filter_event should block when the route requires omission");
  assert(nestedContractCase(({ bundle }) => { delete bundle.defaults.raw_defaults.official_create_field_contract.nested_rules.groups.audience.filter_event_policy; }).blockers.includes("nested_audience_contract_invalid"), "missing explicit filter_event_policy should block");
  assert(nestedContractCase(({ payload }) => { payload.audience.converted_time_duration = "SIX_MONTH"; }).blockers.includes("nested_audience_contract_invalid"), "converted_time_duration should block under NO_EXCLUDE");
  assert(nestedContractCase(({ bundle }) => { delete bundle.defaults.raw_defaults.official_create_field_contract.nested_rules.groups.audience.converted_time_duration_policy; }).blockers.includes("nested_audience_contract_invalid"), "missing explicit converted_time_duration_policy should block");
  assert(nestedContractCase(({ payload }) => { payload.brand_info.brand_name_id = "1"; }).blockers.includes("nested_brand_info_contract_invalid"), "non-integer brand ID should block");
  assert(nestedContractCase(({ bundle }) => { delete bundle.defaults.raw_defaults.official_create_field_contract.nested_rules; }).blockers.includes("nested_field_contract_rules_missing_or_version_mismatch"), "missing nested_rules should block");
  assert(titleMaterialPayloadDiagnostic([{ title: "开局一把枪，装备全靠捡，看你能射多远！" }])?.status === "passed", "valid title_material payload should pass");
  assert(titleMaterialPayloadDiagnostic([{ title: "四字标题" }])?.blocker_code === "title_material_item_length_out_of_range:0:4", "4-char title_material payload should block");
  assert(titleMaterialPayloadDiagnostic([{ title: "a".repeat(112) }])?.blocker_code === "title_material_item_length_out_of_range:0:56", "56-char title_material payload should block");
  assert(titleMaterialPayloadDiagnostic([])?.blocker_code === "title_material_count_out_of_range:0", "empty title_material payload should block");
  assert(titleMaterialPayloadDiagnostic(Array.from({ length: 31 }, () => ({ title: "开局一把枪，装备全靠捡，看你能射多远！" })))?.blocker_code === "title_material_count_out_of_range:31", "over-30 title_material payload should block");
  assert(titleMaterialPayloadDiagnostic([{ title: 123 }])?.blocker_code === "title_material_item_not_string:0", "non-string title_material payload should block");
  assert(titleMaterialPayloadDiagnostic([{ title: "开局一把枪，装备全靠捡，看你能射多远！" }, { title: "开局一把枪，装备全靠捡，看你能射多远！" }])?.blocker_code === "title_material_item_duplicate:1", "duplicate title_material payload should block");
  assert(titleMaterialPayloadDiagnostic([{ title: "JSZC-HUNT-4GE6-14" }])?.blocker_code === "title_material_item_filename_like:0", "filename-like title_material payload should block");
  assert(titleMaterialPayloadDiagnostic([{ title: "abcdefgh" }])?.blocker_code === "title_material_item_length_out_of_range:0:4", "English half-count below 5 should block");
  assert(titleMaterialPayloadDiagnostic([{ title: "abcdefghi" }])?.status === "passed", "English half-count at 5 should pass");
  assert(titleMaterialManifestPreflight({ count: 3, minChars: 12, maxChars: 25 })?.status === "passed", "valid title_material manifest should pass");
  assert(titleMaterialManifestPreflight({ count: 3, minChars: 4, maxChars: 25 })?.blocker_code === "title_material_contract_not_verified", "invalid title_material manifest should block");
  assert(titleMaterialManifestPreflight({ count: 3, minChars: 12, maxChars: 25, filenameLikeCount: 1 })?.blocker_code === "title_material_contract_not_verified", "filename-like manifest should block");
  assert(evaluateTitleMaterialSourceEntries([
    titleEntry({ id: "TM-1", sortOrder: 101 }),
    titleEntry({ id: "TM-2", title: "3分钟上手，5分钟上头，来试试你能过多少关卡！", sortOrder: 102 }),
    titleEntry({ id: "TM-3", title: "2026超魔性的休闲策略小游戏，无需下载，点开即玩！", sortOrder: 103 })
  ]).status === "passed", "valid title_material source entries should pass");
  assert(evaluateTitleMaterialSourceEntries([
    titleEntry({ id: "VIDEO-1", itemType: "video_asset", assetType: "video_asset", title: "射击野猪+口播改MD5=荒野狙击" })
  ]).blockers.includes("route_title_material_count_out_of_range:0"), "missing title_material source should block");
  assert(evaluateTitleMaterialSourceEntries([
    titleEntry({ id: "VIDEO-1", itemType: "title_material", assetType: "video_asset", title: "射击野猪+口播改MD5=荒野狙击" })
  ]).blockers.some((item) => item.startsWith("route_title_material_asset_type_mismatch:")), "non-title asset source should block");

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
