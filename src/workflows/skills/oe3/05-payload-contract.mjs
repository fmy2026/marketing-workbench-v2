import { createHash } from "node:crypto";
import {
  buildStdProjectNamePrefix,
  cstYyyymmdd
} from "../../stdProjectNameBuilder.mjs";
import { buildOe3StdProjectPayload } from "./05-payload.mjs";
import { brandInfoSummary, materialItems, mockReadyBundle } from "./04-resource-verifiers.mjs";
import { INSTANCE_ID_WIRE_STRATEGY } from "./05-std-project-create-wire-body.mjs";

const REQUIRED_PAYLOAD_FIELDS = [
  "route_id",
  "game_code",
  "advertiser_id",
  "object_type",
  "project_name",
  "monitor_id",
  "platform_app_id",
  "objective",
  "deep_objective",
  "deep_bid_type",
  "budget",
  "bid",
  "roi_goal",
  "targeting_summary",
  "dmp_summary",
  "brand_info",
  "material_pack_id",
  "material_asset_refs",
  "backup_landing_page",
  "naming_prefix",
  "project_seq",
  "yyyymmdd"
];

const FORBIDDEN_KEY_PATTERN = /(^|_)(token|cookie|secret|auth_code|raw_payload|raw_response|touchpoint_url|landing_url|callback_url)($|_)/i;
const REQUIRED_BRAND_INFO_FIELDS = [
  "brand_name_id",
  "cdp_brand_id",
  "cdp_brand_name",
  "yuntu_category_id",
  "matched_industry_path",
  "readback_status"
];

const ALLOWED_HIDE_IF_CONVERTED = new Set([
  "NO_EXCLUDE",
  "EXCLUDE_CLICK",
  "EXCLUDE_CONVERT",
  "EXCLUDE_APP",
  "EXCLUDE_CUSTOMER"
]);

function clean(value) {
  return String(value ?? "").trim();
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function stablePayloadHash(value) {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

function sha256Text(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function valuePresent(value) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== null && value !== undefined && value !== "";
}

function collectForbiddenKeys(value, path = []) {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => {
    const nextPath = [...path, key];
    const own = FORBIDDEN_KEY_PATTERN.test(key) ? [nextPath.join(".")] : [];
    return [...own, ...collectForbiddenKeys(child, nextPath)];
  });
}

function normalizeDraft(draft = {}) {
  return {
    projectName: draft.projectName || draft.project_name || "",
    payloadSummary: draft.payloadSummary || draft.payload_summary || {},
    payloadHash: draft.payloadHash || draft.payload_hash || ""
  };
}

function projectNameMatches(projectName, payload) {
  const monitorId = String(payload.monitor_id || "");
  const gameCode = String(payload.game_code || "");
  const pattern = new RegExp(`^${monitorId}_N_${gameCode}_[A-Z0-9]+_[A-Z0-9]+_.+_P\\d{2,}_${payload.yyyymmdd}$`);
  return pattern.test(projectName);
}

function basePayloadSummary({ bundle, projectName, namePrefix, projectSeq, yyyymmdd }) {
  return {
    route_id: bundle.job.route_id,
    game_code: bundle.job.game_code,
    advertiser_id: bundle.job.advertiser_id,
    object_type: bundle.job.object_type,
    project_name: projectName,
    monitor_id: bundle.account.monitor_id,
    platform_app_id: bundle.platformApp?.app_id || "",
    objective: bundle.defaults?.objective || "",
    deep_objective: bundle.defaults?.deep_objective || "",
    deep_bid_type: bundle.defaults?.deep_bid_type || "",
    budget: Number(bundle.defaults?.budget || 0),
    bid: Number(bundle.defaults?.bid || 0),
    roi_goal: Number(bundle.defaults?.roi_goal || 0),
    targeting_summary: bundle.defaults?.targeting_summary || "",
    dmp_summary: bundle.defaults?.dmp_summary || "",
    brand_info: brandInfoSummary(bundle),
    material_pack_id: bundle.materialPack?.pack?.pack_id || "",
    material_asset_refs: materialItems(bundle).map((entry) => entry.item?.asset_ref).filter(Boolean),
    naming_prefix: namePrefix,
    project_seq: projectSeq,
    yyyymmdd,
    source_usage: bundle.job.source_usage || "runtime_truth",
    platform_write_allowed: false
  };
}

function draftToBundleShape(draft) {
  return {
    draft_id: draft.draftId,
    job_id: draft.jobId,
    object_type: draft.objectType,
    project_name: draft.projectName,
    payload_summary: draft.payloadSummary,
    payload_hash: draft.payloadHash,
    duplicate_status: draft.duplicateStatus,
    write_policy: draft.writePolicy
  };
}

export async function buildSkillDraft({ repo, bundle, mockReady = false, attemptNo = 1 }) {
  const effectiveBundle = mockReady ? mockReadyBundle(bundle) : bundle;
  const numericAttemptNo = Number(attemptNo || 1);
  if (!Number.isInteger(numericAttemptNo) || numericAttemptNo < 1 || numericAttemptNo > 3) {
    throw new Error("invalid_std_project_create_attempt_no");
  }
  const yyyymmdd = cstYyyymmdd(effectiveBundle.job.created_at);
  const nameContext = {
    account: effectiveBundle.account,
    game: effectiveBundle.game,
    defaults: effectiveBundle.defaults,
    materialPack: effectiveBundle.materialPack,
    yyyymmdd
  };
  const namePrefix = buildStdProjectNamePrefix(nameContext);
  const draftId = numericAttemptNo === 1
    ? `DRAFT-${effectiveBundle.job.job_id}`
    : `DRAFT-${effectiveBundle.job.job_id}-V${numericAttemptNo}`;
  const existingProjectName = clean(effectiveBundle.draft?.project_name);
  const reservation = numericAttemptNo === 1 ? await repo.reserveProjectName({
    jobId: effectiveBundle.job.job_id,
    draftId,
    routeId: effectiveBundle.job.route_id,
    gameCode: effectiveBundle.job.game_code,
    advertiserId: effectiveBundle.job.advertiser_id,
    objectType: effectiveBundle.job.object_type,
    namePrefix,
    yyyymmdd,
    sourceUsage: effectiveBundle.job.source_usage || "runtime_truth"
  }) : null;
  if (numericAttemptNo > 1 && !existingProjectName) throw new Error("corrective_attempt_project_name_missing");
  if (reservation && existingProjectName && existingProjectName !== reservation.project_name) {
    throw new Error("project_name_reservation_mismatch");
  }
  const projectSeq = reservation
    ? Number(reservation.project_seq)
    : Number(existingProjectName.match(/_P(\d+)_\d{8}$/)?.[1] || 0);
  const projectName = reservation?.project_name || existingProjectName;
  const baseSummary = basePayloadSummary({
    bundle: effectiveBundle,
    projectName,
    namePrefix,
    projectSeq,
    yyyymmdd
  });
  const touchpoint = await repo.getControlledTouchpointUrl({
    routeId: effectiveBundle.job.route_id,
    gameCode: effectiveBundle.job.game_code,
    advertiserId: effectiveBundle.job.advertiser_id,
    monitorId: effectiveBundle.account.monitor_id
  });
  const backupLandingPageUrl = mockReady
    ? {
        landing_page_asset_id: "LPA-JSZC-OE3-BACKUP-MOCK",
        site_id: "7624750304608649243",
        site_name: "Mock backup landing page",
        url_hash: "be2045c5206b29f2e3d08bc46a8ae6dd0f9588aaef11edab968de84a17594b78",
        status: "active",
        landing_url: ["https:", "", "example.invalid", "mwbv2", "mock-backup-landing-page"].join("/"),
        resource_visibility_status: "visible",
        resource_readback_status: "readback_verified",
        resource_readonly_status: "passed"
      }
    : await repo.getControlledBackupLandingPageUrl({
        routeId: effectiveBundle.job.route_id,
        gameCode: effectiveBundle.job.game_code,
        advertiserId: effectiveBundle.job.advertiser_id
      });
  const mockMiniProgramLaunchUrl = `sslocal://microgame?app_id=${effectiveBundle.platformApp?.app_id || "tt0000000000000000"}`;
  const miniProgramLaunchLink = mockReady
    ? {
        link_ref: "GRLL-JSZC-OE3-BYTE-MINI-GAME-MOCK",
        route_id: effectiveBundle.job.route_id,
        game_code: effectiveBundle.job.game_code,
        platform_app_id: effectiveBundle.platformApp?.id || "GPA-JSZC-OE-BYTE-MINI-GAME",
        app_id: effectiveBundle.platformApp?.app_id || "tt0000000000000000",
        url_hash: sha256Text(mockMiniProgramLaunchUrl),
        status: "active",
        launch_url: mockMiniProgramLaunchUrl
      }
    : await repo.getControlledGameRouteLaunchLink({
        routeId: effectiveBundle.job.route_id,
        gameCode: effectiveBundle.job.game_code,
        platformAppId: effectiveBundle.platformApp?.id || "",
        appId: effectiveBundle.platformApp?.app_id || ""
      });
  const finalBundle = {
    ...effectiveBundle,
    draft: {
      draft_id: draftId,
      job_id: effectiveBundle.job.job_id,
      object_type: effectiveBundle.job.object_type,
      project_name: projectName,
      payload_summary: baseSummary,
      payload_hash: ""
    }
  };
  const finalPayload = buildOe3StdProjectPayload({
    bundle: finalBundle,
    touchpointUrl: touchpoint?.touchpoint_url || "",
    backupLandingPageUrl: backupLandingPageUrl || {},
    miniProgramLaunchLink: miniProgramLaunchLink || {}
  });
  const payloadSummary = {
    ...baseSummary,
    create_attempt_no: numericAttemptNo,
    payload_hash_source: "final_controlled_payload",
    final_payload_hash: finalPayload.payloadHash,
    final_payload_manifest: finalPayload.requestFieldManifest,
    final_payload_blockers: finalPayload.blockers,
    backup_landing_page: {
      present: finalPayload.requestFieldManifest.backupLandingPagePresent === true,
      landing_page_asset_id: finalPayload.requestFieldManifest.backupLandingPageAssetId || "",
      site_id: finalPayload.requestFieldManifest.backupLandingPageSiteId || "",
      url_hash: finalPayload.requestFieldManifest.backupLandingPageUrlHash || "",
      https: finalPayload.requestFieldManifest.backupLandingPageHttps === true,
      target_visible: finalPayload.requestFieldManifest.backupLandingPageTargetVisible === true,
      readback_verified: finalPayload.requestFieldManifest.backupLandingPageReadbackVerified === true,
      hash_match: finalPayload.requestFieldManifest.backupLandingPageHashMatch === true
    },
    mini_program_launch_link: {
      present: finalPayload.requestFieldManifest.miniProgramLaunchLinkPresent === true,
      link_ref: finalPayload.requestFieldManifest.miniProgramLaunchLinkRef || "",
      url_hash: finalPayload.requestFieldManifest.miniProgramLaunchLinkHash || "",
      status: finalPayload.requestFieldManifest.miniProgramLaunchLinkStatus || "missing",
      scheme_ok: finalPayload.requestFieldManifest.miniProgramLaunchLinkSchemeOk === true,
      hash_match: finalPayload.requestFieldManifest.miniProgramLaunchLinkHashMatch === true,
      platform_app_id_match: finalPayload.requestFieldManifest.miniProgramLaunchLinkPlatformAppIdMatch === true,
      app_id_match: finalPayload.requestFieldManifest.miniProgramLaunchLinkAppIdMatch === true
    },
    payload_body_stored: false,
    controlled_touchpoint_stored_in_payload_summary: false
  };
  return {
    draftId,
    jobId: effectiveBundle.job.job_id,
    objectType: effectiveBundle.job.object_type,
    projectName,
    payloadSummary,
    payloadHash: finalPayload.payloadHash,
    duplicateStatus: effectiveBundle.draft?.duplicate_status || "not_checked",
    writePolicy: mockReady ? "workflow_skill_mock_execute_once_confirm_required" : "workflow_skill_execute_once_confirm_required",
    reservationId: reservation?.reservation_id || ""
  };
}

export function applyDraftToBundle(bundle, draft) {
  return {
    ...bundle,
    draft: draftToBundleShape(draft)
  };
}

export function evaluateOe3PayloadContract({ bundle, draft, touchpointVerification } = {}) {
  const normalized = normalizeDraft(draft || bundle?.draft || {});
  if (!normalized.projectName || !Object.keys(normalized.payloadSummary).length) {
    return {
      status: "waiting",
      summary: "等待草稿生成后执行 payload 合同检查。",
      checks: [],
      gaps: []
    };
  }

  const payload = normalized.payloadSummary;
  const finalManifest = payload.final_payload_manifest || {};
  const finalPayloadBlockers = Array.isArray(payload.final_payload_blockers) ? payload.final_payload_blockers : [];
  const usesFinalPayloadHash = payload.payload_hash_source === "final_controlled_payload";
  const missingFields = REQUIRED_PAYLOAD_FIELDS.filter((field) => !valuePresent(payload[field]));
  const forbiddenKeys = collectForbiddenKeys(payload);
  const brandInfo = payload.brand_info || {};
  const missingBrandInfoFields = REQUIRED_BRAND_INFO_FIELDS.filter((field) => !valuePresent(brandInfo[field]));
  const brandInfoHasEcomBrandId = Object.prototype.hasOwnProperty.call(brandInfo, "ecom_brand_id");
  const brandInfoNumericFieldsOk = ["brand_name_id", "cdp_brand_id", "yuntu_category_id"]
    .every((field) => /^\d+$/.test(String(brandInfo[field] || "")));
  const brandInfoConfirmed = ["fresh_target_brand_industry_readback_passed", "target_account_fresh_brand_industry_readback_passed"]
    .includes(String(brandInfo.readback_status || ""));
  const expectedHash = usesFinalPayloadHash && payload.final_payload_hash
    ? payload.final_payload_hash
    : stablePayloadHash(payload);
  const hashStable = normalized.payloadHash === expectedHash;
  const longIdFieldsAreStrings = ["advertiser_id", "monitor_id"]
    .every((field) => typeof payload[field] === "string" && /^[0-9]+$/.test(payload[field]));
  const advertiserIdTransportOk = !usesFinalPayloadHash ||
    (
      finalManifest.advertiserIdStorageType === "string" &&
      finalManifest.advertiserIdTransportType === "number" &&
      finalManifest.advertiserIdTransportSafe === true
    );
  const nameMatches = normalized.projectName === payload.project_name && projectNameMatches(normalized.projectName, payload);
  const readback = bundle?.readback || null;
  const objectNameConsistent = !readback || readback.object_name === normalized.projectName;
  const touchpointControlled = Boolean(touchpointVerification?.touchpointUrlPresent) &&
    forbiddenKeys.every((path) => path !== "touchpoint_url") &&
    (!usesFinalPayloadHash || finalManifest.touchpointUrlControlledPresent === true);
  const finalPayloadManifestReady = !usesFinalPayloadHash || finalManifest.kind === "oe3_std_project_final_payload_manifest";
  const finalPayloadHasNoBlockers = !usesFinalPayloadHash || finalPayloadBlockers.length === 0;
  const finalPayloadGenderOk = !usesFinalPayloadHash || finalManifest.audienceGender === "GENDER_UNLIMITED";
  const finalPayloadHideOk = !usesFinalPayloadHash ||
    (ALLOWED_HIDE_IF_CONVERTED.has(String(finalManifest.hideIfConverted || "")) && finalManifest.hideIfConverted !== payload.objective);
  const finalPayloadFilterEventOk = !usesFinalPayloadHash ||
    (Array.isArray(finalManifest.filterEvent) && finalManifest.filterEvent.includes(payload.objective));
  const finalPayloadDmpOk = !usesFinalPayloadHash ||
    (
      finalManifest.dmpRetargetingTagsExcludePresent === true &&
      finalManifest.dmpRetargetingTagsExcludeIntegerArray === true
    );
  const awemeAuthorization = finalManifest.awemeAuthorization || {};
  const finalPayloadAwemeOk = !usesFinalPayloadHash ||
    awemeAuthorization.required !== true ||
    (
      finalManifest.awemeIdPresent === true &&
      finalManifest.awemeIdValidated === true &&
      finalManifest.awemeIdFromAvatar === false &&
      finalManifest.awemeIdLooksLikeImageResource === false &&
      finalManifest.awemeIdValueShape === "digit_string" &&
      ["auto_selected", "manual_selected"].includes(String(awemeAuthorization.status || "")) &&
      awemeAuthorization.selectedActive === true &&
      awemeAuthorization.accountMatches === true &&
      Boolean(awemeAuthorization.verifiedAt) &&
      Boolean(finalManifest.awemeIdHash)
    );
  const finalPayloadBackupLandingPageOk = !usesFinalPayloadHash ||
    (
      finalManifest.backupLandingPagePresent === true &&
      finalManifest.backupLandingPageHttps === true &&
      finalManifest.backupLandingPageTargetVisible === true &&
      finalManifest.backupLandingPageReadbackVerified === true &&
      finalManifest.backupLandingPageHashMatch === true
    );
  const miniProgramLaunchLinkRequired = finalManifest.miniProgramUrlRequired === true;
  const finalPayloadMiniProgramLaunchLinkOk = !usesFinalPayloadHash ||
    !miniProgramLaunchLinkRequired ||
    (
      finalManifest.miniProgramLaunchLinkPresent === true &&
      finalManifest.miniProgramLaunchLinkSchemeOk === true &&
      finalManifest.miniProgramLaunchLinkHashMatch === true &&
      finalManifest.miniProgramLaunchLinkPlatformAppIdMatch === true &&
      finalManifest.miniProgramLaunchLinkAppIdMatch === true
    );
  const materialReadiness = finalManifest.finalMaterialReadiness || {};
  const coverReadyCount = Number(materialReadiness.coverReadyCount ?? materialReadiness.coverVerifiedCount ?? 0);
  const finalMaterialReady = !usesFinalPayloadHash ||
    (
      Number(materialReadiness.selectedRequiredVideoCount || 0) > 0 &&
      Number(materialReadiness.selectedRequiredVideoCount || 0) === Number(materialReadiness.verifiedVideoCount || 0) &&
      Number(materialReadiness.selectedRequiredVideoCount || 0) === coverReadyCount
    );
  const contractMapping = finalManifest.contractMapping || {};
  const contractMappingReady = !usesFinalPayloadHash ||
    (
      contractMapping.miniGameInstanceCandidateCreateField === "instance_id" &&
      contractMapping.optimizedGoalQueryInstanceFieldName === "micro_app_instance_id" &&
      contractMapping.optimizedGoalQueryAppFieldName === "mini_program_id"
    );
  const businessDefaultsReady = !usesFinalPayloadHash || finalManifest.businessDefaultsPresent === true;
  const finalPayloadWireBodyReady = !usesFinalPayloadHash ||
    (
      finalManifest.createWireBodyEncodingStatus === "passed" &&
      (finalManifest.miniProgramUrlRequired !== false || finalManifest.microAppInstanceIdTransportStrategy === INSTANCE_ID_WIRE_STRATEGY) &&
      (finalManifest.miniProgramUrlRequired !== false || finalManifest.microAppInstanceIdWireNumberTokenPresent === true) &&
      /^sha256:[a-f0-9]{64}$/.test(clean(finalManifest.createWireBodyHash)) &&
      finalManifest.createWireBodyHash === finalManifest.createRequestHash
    );

  const checks = [
    {
      key: "required_fields",
      status: missingFields.length ? "blocked" : "passed",
      summary: missingFields.length ? `缺少 ${missingFields.join("、")}` : "std_project payload 摘要字段齐全。"
    },
    {
      key: "forbidden_fields",
      status: forbiddenKeys.length ? "blocked" : "passed",
      summary: forbiddenKeys.length ? `禁止字段进入摘要：${forbiddenKeys.join("、")}` : "未发现禁止字段。"
    },
    {
      key: "brand_info_required",
      status: missingBrandInfoFields.length ? "blocked" : "passed",
      summary: missingBrandInfoFields.length ? `brand_info 缺少 ${missingBrandInfoFields.join("、")}` : "brand_info 官方字段齐全。"
    },
    {
      key: "brand_info_forbidden_fields",
      status: brandInfoHasEcomBrandId ? "blocked" : "passed",
      summary: brandInfoHasEcomBrandId ? "3.0 payload 禁止 brand_info.ecom_brand_id。" : "brand_info 未包含 ecom_brand_id。"
    },
    {
      key: "brand_info_numeric_fields",
      status: brandInfoNumericFieldsOk ? "passed" : "blocked",
      summary: brandInfoNumericFieldsOk ? "brand_info 数字字段可安全转为 integer。" : "brand_info 数字字段缺失或不是数字。"
    },
    {
      key: "brand_info_confirmation",
      status: brandInfoConfirmed ? "passed" : "blocked",
      summary: brandInfoConfirmed ? "brand_info readback_status 可用于创建前确认。" : "brand_info readback_status 未确认。"
    },
    {
      key: "long_numeric_ids",
      status: longIdFieldsAreStrings ? "passed" : "blocked",
      summary: longIdFieldsAreStrings ? "Postgres / Job / 摘要中的平台长数字 ID 均按字符串处理。" : "advertiser_id 或 monitor_id 在业务上下文中未按字符串处理。"
    },
    {
      key: "advertiser_id_transport_type",
      status: advertiserIdTransportOk ? "passed" : "blocked",
      summary: advertiserIdTransportOk
        ? "最终受控 create payload 中 advertiser_id 为 safe integer number。"
        : "最终受控 create payload 中 advertiser_id 未安全转换为 number。"
    },
    {
      key: "payload_hash",
      status: hashStable ? "passed" : "blocked",
      summary: hashStable
        ? (usesFinalPayloadHash ? "payload_hash 与最终受控 payload hash 稳定一致。" : "payload_hash 与规范化摘要稳定一致。")
        : (usesFinalPayloadHash ? "payload_hash 与最终受控 payload hash 不一致。" : "payload_hash 与规范化摘要不一致。")
    },
    {
      key: "project_name",
      status: nameMatches ? "passed" : "blocked",
      summary: nameMatches ? "project_name 符合 std_project 命名规则。" : "project_name 不符合命名规则或摘要不一致。"
    },
    {
      key: "touchpoint_scope",
      status: touchpointControlled ? "passed" : "blocked",
      summary: touchpointControlled ? "完整触点 URL 仅用于受控构建/校验，不进入普通摘要。" : "触点 URL 未入库或进入了非受控摘要。"
    },
    {
      key: "readback_object_name",
      status: objectNameConsistent ? "passed" : "blocked",
      summary: objectNameConsistent ? "回查 object_name 来源与 launch_drafts.project_name 一致。" : "回查 object_name 未来自草稿项目名。"
    },
    {
      key: "final_payload_manifest",
      status: finalPayloadManifestReady ? "passed" : "blocked",
      summary: finalPayloadManifestReady ? "最终 payload 字段 manifest 已生成。" : "缺少最终 payload 字段 manifest。"
    },
    {
      key: "final_payload_blockers",
      status: finalPayloadHasNoBlockers ? "passed" : "blocked",
      summary: finalPayloadHasNoBlockers ? "最终 payload 未发现硬阻断。" : `最终 payload 存在阻断：${finalPayloadBlockers.join("、")}。`
    },
    {
      key: "audience_gender",
      status: finalPayloadGenderOk ? "passed" : "blocked",
      summary: finalPayloadGenderOk ? "不限性别使用 GENDER_UNLIMITED。" : "不限性别未使用 GENDER_UNLIMITED。"
    },
    {
      key: "hide_if_converted",
      status: finalPayloadHideOk ? "passed" : "blocked",
      summary: finalPayloadHideOk ? "hide_if_converted 使用过滤范围枚举，未写入付费事件。" : "hide_if_converted 不是允许枚举或误用了付费事件。"
    },
    {
      key: "filter_event",
      status: finalPayloadFilterEventOk ? "passed" : "blocked",
      summary: finalPayloadFilterEventOk ? "filter_event 承担付费事件语义。" : "filter_event 未包含路线默认付费事件。"
    },
    {
      key: "dmp_custom_audience_ids",
      status: finalPayloadDmpOk ? "passed" : "blocked",
      summary: finalPayloadDmpOk ? "DMP custom_audience_id[] 已作为 audience.retargeting_tags_exclude integer[] 写入最终 payload。" : "DMP 缺少只读验证后的 custom_audience_id[]，或未写入 retargeting_tags_exclude integer[]。"
    },
    {
      key: "aweme_auth",
      status: finalPayloadAwemeOk ? "passed" : "blocked",
      summary: finalPayloadAwemeOk ? "aweme_id 来自账户直存的已验证抖音号授权关系。" : "aweme_id 未通过账户授权关系校验，或疑似来自头像/图片资源。"
    },
    {
      key: "backup_landing_page",
      status: finalPayloadBackupLandingPageOk ? "passed" : "blocked",
      summary: finalPayloadBackupLandingPageOk
        ? "备用网页链接已通过 HTTPS、目标账户可见性和 hash 一致性检查。"
        : "备用网页链接未通过 HTTPS、目标账户可见性或 hash 一致性检查。"
    },
    {
      key: "mini_game_launch_link",
      status: finalPayloadMiniProgramLaunchLinkOk ? "passed" : "blocked",
      summary: finalPayloadMiniProgramLaunchLinkOk
        ? "字节小游戏调起链接已通过存在性、scheme、hash 和 app_id 绑定检查。"
        : "字节小游戏调起链接缺失，或未通过 scheme、hash、platform_app_id、app_id 绑定检查。"
    },
    {
      key: "final_material_readiness",
      status: finalMaterialReady ? "passed" : "blocked",
      summary: finalMaterialReady
        ? `最终视频素材逐条回查通过：${materialReadiness.verifiedVideoCount}/${materialReadiness.selectedRequiredVideoCount}。`
        : "最终视频素材或封面策略逐条回查未完成。"
    },
    {
      key: "route_payload_defaults",
      status: businessDefaultsReady ? "passed" : "blocked",
      summary: businessDefaultsReady ? "业务默认值来自 Postgres 路线配置。" : "业务默认值缺少 Postgres 路线配置来源。"
    },
    {
      key: "create_wire_body",
      status: finalPayloadWireBodyReady ? "passed" : "blocked",
      summary: finalPayloadWireBodyReady
        ? "最终 std_project/create wire body 已绑定 hash，instance_id 采用受控 JSON number token。"
        : "最终 std_project/create wire body 或 instance_id 无损传输策略未通过。"
    },
    {
      key: "mini_game_instance_field_mapping",
      status: contractMappingReady ? "passed" : "blocked",
      summary: contractMappingReady
        ? "小游戏实例字段映射已区分查询参数与创建参数。"
        : "小游戏实例字段映射未确认，禁止猜测或双发。"
    }
  ];

  const gaps = checks
    .filter((check) => check.status !== "passed")
    .map((check) => ({ key: check.key, message: check.summary }));

  return {
    status: gaps.length ? "blocked" : "passed",
    summary: gaps.length ? `payload 合同未通过：${gaps.length} 个缺口。` : "payload 合同检查通过。",
    checks,
    gaps,
    expectedPayloadHash: expectedHash
  };
}
