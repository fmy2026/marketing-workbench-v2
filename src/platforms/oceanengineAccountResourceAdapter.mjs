import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { PostgresRepository } from "../repositories/postgresRepository.mjs";
import { readOceanEngineEnv, redactedCredentialStatus } from "./oceanengineCredentialStore.mjs";
import { createJob, diagnoseJob, runJob } from "../workflows/launchWorkflow.mjs";

export const ACCOUNT_RESOURCE_TARGET = {
  routeId: "oceanengine_3_byte_mini_game",
  gameCode: "JSZC",
  advertiserId: "1871922175825993"
};

export const RESOURCE_CONFIRM = {
  avatar: {
    envName: "MWBV2_OE_AVATAR_CONFIRM",
    value: "PREPARE_ONE_ACCOUNT_AVATAR"
  },
  event_asset: {
    envName: "MWBV2_OE_EVENT_ASSET_CONFIRM",
    value: "PREPARE_ONE_EVENT_ASSET"
  },
  product_image: {
    envName: "MWBV2_OE_PRODUCT_IMAGE_CONFIRM",
    value: "PREPARE_ONE_PRODUCT_IMAGE"
  }
};

const RESOURCE_LABELS = {
  avatar: "头像",
  event_asset: "事件资产",
  product_image: "产品图",
  brand_info: "品牌信息",
  dmp_audience_package: "DMP",
  video_asset: "视频",
  micro_app_instance: "小程序实例"
};

const SCRIPT_RESOURCE_TYPES = new Set(["avatar", "event_asset", "product_image"]);
const CONFIRMABLE_RESOURCE_TYPES = new Set(["avatar", "event_asset", "product_image"]);
const PRODUCT_IMAGE_UPLOAD_ACTION = "oceanengine_file_image_ad_upload";
const PRODUCT_IMAGE_UPLOAD_ENDPOINT = "https://api.oceanengine.com/open_api/2/file/image/ad/";
const PRODUCT_IMAGE_ASSET_ID = "PI-JSZC-PRODUCT-IMAGE-001";

function sha256(value) {
  return `sha256:${createHash("sha256").update(String(value)).digest("hex")}`;
}

function hashFile(path, algorithm) {
  return createHash(algorithm).update(readFileSync(path)).digest("hex");
}

function clean(value) {
  return String(value ?? "").trim();
}

function apiCode(payload = {}) {
  return clean(payload.code ?? payload.err_no ?? payload.error_code ?? "");
}

function requestIdPresent(payload = {}) {
  return Boolean(payload.request_id || payload.data?.request_id);
}

function readyResource(resource = {}) {
  const readonlyStatus = resource.metadata?.readonly_check?.status || "";
  return resource.visibility_status === "visible" &&
    (resource.readback_status === "readback_verified" || resource.readback_status === "not_required") &&
    (!readonlyStatus || ["passed", "passed_by_manual_confirmation"].includes(readonlyStatus));
}

function isConcretePlatformId(value) {
  const text = clean(value);
  return Boolean(text && !/^(JSZC-|PI-|DMP-)/.test(text));
}

function resourceByType(resources = [], resourceType) {
  return resources.find((resource) => resource.resource_type === resourceType) || null;
}

function sourceAssetById(bundle = {}, sourceAssetId = "") {
  const target = clean(sourceAssetId);
  if (!target) return null;
  const packItems = bundle.materialPack?.items || [];
  const assets = packItems.map((entry) => entry.asset).filter(Boolean);
  const direct = assets.find((asset) => asset.asset_id === target || asset.asset_ref === target);
  if (direct) return direct;
  return null;
}

function inferProductImageSourceStatus(resource = {}, bundle = {}) {
  if (isConcretePlatformId(resource.platform_resource_id)) {
    return {
      sourceStatus: "platform_image_id_present",
      sourceSummary: "已有可直接查询的平台 image_id。",
      sourceReady: true
    };
  }
  const metadataSource = resource.metadata?.product_image_source || {};
  if (
    metadataSource.asset_id === resource.source_asset_id &&
    clean(metadataSource.asset_ref) &&
    clean(metadataSource.asset_hash)
  ) {
    return {
      sourceStatus: "product_image_source_present",
      sourceSummary: "account_resources.metadata 已记录 v2 独立产品图文件来源，可生成单次上传/绑定计划。",
      sourceReady: true
    };
  }
  const sourceAsset = sourceAssetById(bundle, resource.source_asset_id);
  if (sourceAsset && ["image_asset", "product_image"].includes(sourceAsset.asset_type)) {
    return {
      sourceStatus: `${sourceAsset.asset_type}_source_present`,
      sourceSummary: `Postgres 已有 ${sourceAsset.asset_type} 来源，可生成单次上传/绑定计划。`,
      sourceReady: true
    };
  }
  return {
    sourceStatus: resource.source_asset_id ? "source_asset_not_uploadable_image" : "source_asset_missing",
    sourceSummary: resource.source_asset_id
      ? `source_asset_id=${resource.source_asset_id} 不是可上传产品图素材或可查平台 image_id。`
      : "缺少产品图 source_asset_id。",
    sourceReady: false
  };
}

function buildPlanForResource(resourceType, resource, bundle) {
  const readonlyCheck = resource?.metadata?.readonly_check || {};
  const base = {
    resourceType,
    label: RESOURCE_LABELS[resourceType] || resourceType,
    existsInPostgres: Boolean(resource),
    before: resource ? {
      visibilityStatus: resource.visibility_status,
      readbackStatus: resource.readback_status,
      readonlyStatus: readonlyCheck.status || "",
      readonlyGap: readonlyCheck.gap || "",
      sourceAssetId: resource.source_asset_id || "",
      platformResourceIdPresent: Boolean(resource.platform_resource_id),
      concretePlatformResourceIdPresent: isConcretePlatformId(resource.platform_resource_id)
    } : null,
    ready: Boolean(resource && readyResource(resource)),
    confirmationRequired: false,
    confirmEnv: RESOURCE_CONFIRM[resourceType] || null,
    action: "none",
    nextAction: "无需动作",
    blocker: ""
  };

  if (!resource) {
    return {
      ...base,
      action: "create_account_resource_record",
      nextAction: "先补齐 Postgres account_resources 记录。",
      blocker: "resource_record_missing"
    };
  }

  if (base.ready) {
    return {
      ...base,
      action: "no_op_ready",
      nextAction: `${base.label} 已通过只读回查，无需补齐。`
    };
  }

  if (resourceType === "product_image") {
    const source = inferProductImageSourceStatus(resource, bundle);
    if (source.sourceStatus === "platform_image_id_present") {
      return {
        ...base,
        ...source,
        action: "readback_product_image_once",
        confirmationRequired: false,
        nextAction: "已有平台 image_id，重跑只读 readback，不重复上传。",
        blocker: readonlyCheck.gap || "product_image_readback_required"
      };
    }
    return {
      ...base,
      ...source,
      action: source.sourceReady ? "prepare_product_image_once" : "wait_for_product_image_source",
      confirmationRequired: source.sourceReady,
      nextAction: source.sourceReady
        ? "带确认变量执行单次产品图上传/绑定脚本，然后立刻 readback。"
        : "补充可上传产品图文件或可查平台 image_id 后，再生成单次补齐动作。",
      blocker: source.sourceReady ? "" : "product_image_source_missing_or_not_uploadable"
    };
  }

  if (resourceType === "brand_info") {
    return {
      ...base,
      action: "manual_brand_industry_confirmation",
      nextAction: "确认品牌/行业只读结果；本任务不主动修改品牌信息。",
      blocker: readonlyCheck.gap || "brand_info_readback_required"
    };
  }

  if (CONFIRMABLE_RESOURCE_TYPES.has(resourceType)) {
    return {
      ...base,
      action: `prepare_${resourceType}_once`,
      confirmationRequired: true,
      nextAction: `带确认变量执行单次 ${base.label} 补齐脚本，然后立刻 readback。`,
      blocker: readonlyCheck.gap || "resource_not_ready"
    };
  }

  return {
    ...base,
    action: "readonly_confirmation_only",
    nextAction: "只读确认，不主动改动。",
    blocker: readonlyCheck.gap || "readonly_confirmation_required"
  };
}

function sanitizeResourcePlan(plan = {}) {
  return {
    resourceType: plan.resourceType,
    label: plan.label,
    ready: plan.ready,
    action: plan.action,
    confirmationRequired: plan.confirmationRequired,
    confirmEnv: plan.confirmEnv,
    nextAction: plan.nextAction,
    blocker: plan.blocker,
    before: plan.before,
    sourceStatus: plan.sourceStatus || "",
    sourceSummary: plan.sourceSummary || ""
  };
}

function projectGuardrail() {
  try {
    return JSON.parse(readFileSync("project.state.json", "utf8")).guardrails || {};
  } catch {
    return {};
  }
}

function platformWriteActionAllowed(guardrails = {}, action) {
  const scope = guardrails.platform_write_scope || {};
  return guardrails.platform_write_allowed === true &&
    Array.isArray(scope.allowed_actions) &&
    scope.allowed_actions.includes(action) &&
    Number(scope.maximum_actions || 0) === 1;
}

function pngDimensions(path) {
  const buffer = readFileSync(path);
  if (
    buffer.length < 24 ||
    buffer.readUInt32BE(0) !== 0x89504e47 ||
    buffer.readUInt32BE(4) !== 0x0d0a1a0a
  ) {
    return { format: "unknown", width: 0, height: 0 };
  }
  return {
    format: "png",
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

function productImageSourceFromResource(resource = {}) {
  const source = resource.metadata?.product_image_source || {};
  return {
    assetId: clean(source.asset_id || resource.source_asset_id),
    assetRef: clean(source.asset_ref),
    assetHash: clean(source.asset_hash),
    sourceUsage: clean(source.source_usage)
  };
}

function preflightProductImageUpload({ resource }) {
  if (!resource) {
    return {
      ok: false,
      blocker: "product_image_resource_missing",
      source: {},
      file: {}
    };
  }
  const source = productImageSourceFromResource(resource);
  if (source.assetId !== PRODUCT_IMAGE_ASSET_ID) {
    return {
      ok: false,
      blocker: "unexpected_product_image_source_asset_id",
      source,
      file: {}
    };
  }
  if (!source.assetRef) {
    return {
      ok: false,
      blocker: "product_image_asset_ref_missing",
      source,
      file: {}
    };
  }
  if (!existsSync(source.assetRef)) {
    return {
      ok: false,
      blocker: "product_image_file_missing",
      source,
      file: { path: source.assetRef }
    };
  }
  const sha256Hex = hashFile(source.assetRef, "sha256");
  const md5Hex = hashFile(source.assetRef, "md5");
  const dimensions = pngDimensions(source.assetRef);
  const hashMatches = !source.assetHash || source.assetHash === sha256Hex;
  const ok = hashMatches && dimensions.format === "png" && dimensions.width > 0 && dimensions.height > 0;
  return {
    ok,
    blocker: ok ? "" : (!hashMatches ? "product_image_hash_mismatch" : "product_image_not_valid_png"),
    source,
    file: {
      path: source.assetRef,
      sha256: sha256Hex,
      md5: md5Hex,
      format: dimensions.format,
      width: dimensions.width,
      height: dimensions.height,
      hashMatches
    }
  };
}

async function uploadProductImageToOceanEngine({ advertiserId, imagePath, filename, imageSignature, fetchImpl = globalThis.fetch } = {}) {
  const credential = redactedCredentialStatus();
  if (credential.status !== "valid") {
    return {
      status: "credential_required",
      credential: {
        status: credential.status,
        tokenExpiresAt: credential.tokenExpiresAt,
        blockers: credential.blockers
      },
      writeActionCalled: false,
      apiCode: "",
      httpStatus: null,
      imageId: "",
      materialId: "",
      responseHash: "",
      requestIdPresent: false
    };
  }

  const env = readOceanEngineEnv().env;
  const form = new FormData();
  form.append("advertiser_id", advertiserId);
  form.append("upload_type", "UPLOAD_BY_FILE");
  form.append("image_signature", imageSignature);
  form.append("image_file", new Blob([readFileSync(imagePath)], { type: "image/png" }), filename);
  form.append("filename", filename);
  form.append("is_aigc", "false");

  try {
    const response = await fetchImpl(PRODUCT_IMAGE_UPLOAD_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Access-Token": env.OCEANENGINE_ACCESS_TOKEN
      },
      body: form
    });
    const text = await response.text();
    let payload = {};
    try {
      payload = JSON.parse(text);
    } catch {
      payload = {};
    }
    const code = apiCode(payload);
    const data = payload.data || {};
    const imageId = clean(data.id || data.image_id);
    const materialId = clean(data.material_id);
    return {
      status: response.ok && code === "0" && imageId ? "uploaded" : "blocked_upload_failed",
      writeActionCalled: true,
      endpoint: "file/image/ad",
      httpStatus: response.status,
      apiCode: code,
      imageId,
      materialId,
      width: Number(data.width || 0),
      height: Number(data.height || 0),
      urlPresent: Boolean(data.url),
      responseHash: sha256(text),
      requestIdPresent: requestIdPresent(payload)
    };
  } catch (error) {
    return {
      status: "upload_transport_failed",
      writeActionCalled: true,
      endpoint: "file/image/ad",
      httpStatus: null,
      apiCode: "",
      imageId: "",
      materialId: "",
      width: 0,
      height: 0,
      urlPresent: false,
      responseHash: "",
      requestIdPresent: false,
      errorCode: clean(error.code || error.name || "transport_error")
    };
  }
}

async function recordProductImageUploadEvidence({ repo, jobId, preflight, upload }) {
  const artifactId = `EV-${jobId}-PRODUCT-IMAGE-UPLOAD-ONCE`;
  await repo.upsertEvidence({
    artifactId,
    jobId,
    artifactType: "platform_write_once",
    title: "产品图单次上传脱敏证据",
    summary: [
      `status=${upload.status}`,
      `endpoint=file/image/ad`,
      `write_action_called=${upload.writeActionCalled === true}`,
      `image_id_present=${Boolean(upload.imageId)}`,
      `api_code=${upload.apiCode || ""}`,
      `http_status=${upload.httpStatus || ""}`
    ].join("; "),
    contentHash: upload.responseHash || sha256(JSON.stringify({ preflight, upload })),
    storageRef: `postgres:mwb.evidence_artifacts/${artifactId}`,
    sourceRef: "script:resource:product-image-once"
  });
  return artifactId;
}

export async function runAccountResourceDiagnosis({ repo = new PostgresRepository(), persistPlanEvidence = true } = {}) {
  const credential = redactedCredentialStatus();
  if (credential.status !== "valid") {
    return {
      status: "credential_required",
      credential,
      target: ACCOUNT_RESOURCE_TARGET,
      jobId: "",
      prewriteGateStatus: "not_run",
      platformReadonlyStatus: "not_run",
      resourcePlans: [],
      blockers: credential.blockers || [],
      writeActionsCalled: false
    };
  }

  const created = await createJob(repo, {
    user_intent: `推广路线 ${ACCOUNT_RESOURCE_TARGET.routeId}，游戏 ${ACCOUNT_RESOURCE_TARGET.gameCode}，账户 ${ACCOUNT_RESOURCE_TARGET.advertiserId}`
  });
  await diagnoseJob(repo, created.jobId);
  const view = await runJob(repo, created.jobId);
  const bundle = await repo.getLaunchJobBundle(view.jobId);
  const resources = bundle.resources || [];
  const resourceTypes = [
    "avatar",
    "event_asset",
    "product_image",
    "brand_info",
    "video_asset",
    "dmp_audience_package",
    "micro_app_instance"
  ];
  const resourcePlans = resourceTypes.map((type) => buildPlanForResource(type, resourceByType(resources, type), bundle));
  const blockers = resourcePlans.filter((plan) => !plan.ready && plan.blocker).map((plan) => ({
    resourceType: plan.resourceType,
    blocker: plan.blocker,
    nextAction: plan.nextAction
  }));

  const result = {
    status: blockers.length ? "blocked" : "ready",
    target: ACCOUNT_RESOURCE_TARGET,
    credential: {
      status: credential.status,
      tokenExpiresAt: credential.tokenExpiresAt,
      blockers: credential.blockers
    },
    jobId: view.jobId,
    projectName: view.draft?.projectName || "",
    platformReadonlyStatus: view.platformReadonly?.status || "unknown",
    credentialStatus: view.platformReadonly?.credentialStatus || "unknown",
    prewriteGateStatus: view.prewriteGate?.status || "unknown",
    blockedResourceTypes: view.prewriteGate?.blockedResourceTypes || [],
    platformEvidenceCount: (bundle.evidence || []).filter((item) => item.artifact_type === "platform_readonly_probe").length,
    nodeStatuses: (bundle.nodes || []).map((node) => ({
      nodeKey: node.node_key,
      status: node.status,
      platformReadonlyStatus: node.output_summary?.platformReadonlyStatus || "",
      credentialStatus: node.output_summary?.credentialStatus || ""
    })),
    resourcePlans: resourcePlans.map(sanitizeResourcePlan),
    blockers,
    writeActionsCalled: false
  };

  if (persistPlanEvidence) {
    const artifactId = `EV-${view.jobId}-ACCOUNT-RESOURCE-PLAN`;
    const summary = [
      `status=${result.status}`,
      `blocked=${result.blockers.map((item) => item.resourceType).join(",") || "none"}`,
      `write_actions_called=false`
    ].join("; ");
    await repo.upsertEvidence({
      artifactId,
      jobId: view.jobId,
      artifactType: "account_resource_plan",
      title: "账户资源补齐计划",
      summary,
      contentHash: sha256(JSON.stringify(result.resourcePlans)),
      storageRef: `postgres:mwb.evidence_artifacts/${artifactId}`,
      sourceRef: "script:resource:diagnose"
    });
  }

  return result;
}

export async function buildAccountResourceOncePlan(resourceType, { repo = new PostgresRepository(), env = process.env } = {}) {
  if (!SCRIPT_RESOURCE_TYPES.has(resourceType)) {
    throw new Error(`unsupported_resource_type:${resourceType}`);
  }
  const diagnosis = await runAccountResourceDiagnosis({ repo, persistPlanEvidence: false });
  const plan = diagnosis.resourcePlans.find((item) => item.resourceType === resourceType) || null;
  const confirm = RESOURCE_CONFIRM[resourceType];
  const confirmed = env[confirm.envName] === confirm.value;
  const guardrails = projectGuardrail();
  const platformWriteAllowed = guardrails.platform_write_allowed === true;
  const productImageWriteAllowed = platformWriteActionAllowed(guardrails, PRODUCT_IMAGE_UPLOAD_ACTION);

  if (!plan) {
    return {
      status: "blocked",
      resourceType,
      reason: "resource_plan_missing",
      confirmed,
      platformWriteAllowed,
      writeActionCalled: false,
      diagnosisJobId: diagnosis.jobId
    };
  }

  if (!confirmed) {
    return {
      status: "dry_run",
      resourceType,
      confirmed: false,
      requiredConfirmVariable: `${confirm.envName}=${confirm.value}`,
      platformWriteAllowed,
      productImageWriteAllowed,
      writeActionCalled: false,
      diagnosisJobId: diagnosis.jobId,
      plan
    };
  }

  if (!platformWriteAllowed) {
    return {
      status: "blocked_by_project_guardrail",
      resourceType,
      confirmed: true,
      requiredConfirmVariable: `${confirm.envName}=${confirm.value}`,
      platformWriteAllowed,
      productImageWriteAllowed,
      writeActionCalled: false,
      diagnosisJobId: diagnosis.jobId,
      plan,
      reason: "project.state.json guardrails.platform_write_allowed is false"
    };
  }

  if (plan.ready) {
    return {
      status: "no_op_ready",
      resourceType,
      confirmed: true,
      platformWriteAllowed,
      productImageWriteAllowed,
      writeActionCalled: false,
      diagnosisJobId: diagnosis.jobId,
      plan
    };
  }

  if (resourceType !== "product_image") {
    return {
      status: "blocked_action_not_allowed_in_current_task",
      resourceType,
      confirmed: true,
      platformWriteAllowed,
      productImageWriteAllowed,
      writeActionCalled: false,
      diagnosisJobId: diagnosis.jobId,
      plan,
      reason: "当前任务只允许 OceanEngine 产品图上传一次。"
    };
  }

  if (!productImageWriteAllowed) {
    return {
      status: "blocked_by_write_scope",
      resourceType,
      confirmed: true,
      requiredConfirmVariable: `${confirm.envName}=${confirm.value}`,
      platformWriteAllowed,
      productImageWriteAllowed,
      writeActionCalled: false,
      diagnosisJobId: diagnosis.jobId,
      plan,
      reason: `project.state.json 未允许 ${PRODUCT_IMAGE_UPLOAD_ACTION} 或 maximum_actions 不是 1`
    };
  }

  if (plan.action === "readback_product_image_once") {
    return {
      status: "readback_required_not_uploading_again",
      resourceType,
      confirmed: true,
      platformWriteAllowed,
      productImageWriteAllowed,
      writeActionCalled: false,
      diagnosisJobId: diagnosis.jobId,
      plan,
      reason: "已有平台 image_id，本脚本不会重复上传；请运行 npm run resource:readback。"
    };
  }

  const bundle = await repo.getCoreContext(ACCOUNT_RESOURCE_TARGET);
  const resource = resourceByType(bundle?.resources || [], "product_image");
  const preflight = preflightProductImageUpload({ resource });
  if (!preflight.ok) {
    return {
      status: "blocked_preflight_failed",
      resourceType,
      confirmed: true,
      platformWriteAllowed,
      productImageWriteAllowed,
      writeActionCalled: false,
      diagnosisJobId: diagnosis.jobId,
      plan,
      preflight,
      reason: preflight.blocker
    };
  }

  const upload = await uploadProductImageToOceanEngine({
    advertiserId: ACCOUNT_RESOURCE_TARGET.advertiserId,
    imagePath: preflight.file.path,
    filename: `${PRODUCT_IMAGE_ASSET_ID}.png`,
    imageSignature: preflight.file.md5
  });
  const evidenceRef = await recordProductImageUploadEvidence({
    repo,
    jobId: diagnosis.jobId,
    preflight: {
      assetId: preflight.source.assetId,
      sha256: preflight.file.sha256,
      format: preflight.file.format,
      width: preflight.file.width,
      height: preflight.file.height,
      hashMatches: preflight.file.hashMatches
    },
    upload
  });

  if (upload.status === "uploaded" && upload.imageId) {
    await repo.updateAccountResourcePlatformResource({
      ...ACCOUNT_RESOURCE_TARGET,
      resourceType: "product_image",
      platformResourceId: upload.imageId,
      visibilityStatus: "visible",
      readbackStatus: "pending",
      metadata: {
        product_image_upload: {
          status: "uploaded",
          endpoint: "file/image/ad",
          image_id_present: true,
          material_id_present: Boolean(upload.materialId),
          http_status: upload.httpStatus,
          api_code: upload.apiCode,
          response_hash: upload.responseHash,
          request_id_present: upload.requestIdPresent,
          source_asset_id: PRODUCT_IMAGE_ASSET_ID,
          source_sha256: preflight.file.sha256,
          uploaded_at: new Date().toISOString(),
          evidence_ref: evidenceRef
        }
      }
    });
  }

  return {
    status: upload.status,
    resourceType,
    confirmed: true,
    platformWriteAllowed,
    productImageWriteAllowed,
    writeActionCalled: upload.writeActionCalled,
    diagnosisJobId: diagnosis.jobId,
    evidenceRef,
    preflight: {
      assetId: preflight.source.assetId,
      filePresent: true,
      sha256: preflight.file.sha256,
      format: preflight.file.format,
      width: preflight.file.width,
      height: preflight.file.height,
      hashMatches: preflight.file.hashMatches
    },
    upload: {
      status: upload.status,
      endpoint: upload.endpoint,
      httpStatus: upload.httpStatus,
      apiCode: upload.apiCode,
      imageId: upload.imageId,
      imageIdPresent: Boolean(upload.imageId),
      materialIdPresent: Boolean(upload.materialId),
      width: upload.width,
      height: upload.height,
      urlPresent: upload.urlPresent,
      responseHash: upload.responseHash,
      requestIdPresent: upload.requestIdPresent,
      errorCode: upload.errorCode || ""
    },
    nextAction: upload.status === "uploaded"
      ? "立刻运行 npm run resource:readback，确认 file/image/get 可查。"
      : "产品图上传未通过；不要重复上传，先根据脱敏状态排查。"
  };

  return {
    status: "blocked_write_path_not_enabled_in_this_task",
    resourceType,
    confirmed: true,
    platformWriteAllowed,
    writeActionCalled: false,
    diagnosisJobId: diagnosis.jobId,
    plan,
    reason: "本任务只生成受控 once 入口和补齐计划，真实写入需单独打开 guardrail。"
  };
}
