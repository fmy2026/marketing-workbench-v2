import { INSTANCE_ID_WIRE_STRATEGY, buildStdProjectCreateWireBody } from "./05-std-project-create-wire-body.mjs";

function clean(value) {
  return String(value ?? "").trim();
}

function typeName(value) {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

function valueAt(value, path) {
  return path.split(".").reduce((cursor, key) => cursor?.[key], value);
}

export const OE3_STD_PROJECT_ALLOWED_PAYLOAD_PATHS = new Set([
  "advertiser_id",
  "name",
  "ad_type",
  "landing_type",
  "marketing_goal",
  "external_action",
  "deep_external_action",
  "native_type",
  "aweme_id",
  "delivery_mode",
  "delivery_type",
  "delivery_medium",
  "micro_promotion_type",
  "instance_id",
  "asset_id",
  "schedule_type",
  "bid_type",
  "budget_mode",
  "budget",
  "pricing",
  "cpa_bid",
  "roi_goal",
  "deep_bid_type",
  "audience_type",
  "audience",
  "audience.district",
  "audience.gender",
  "audience.age",
  "audience.filter_event[]",
  "audience.converted_time_duration",
  "audience.hide_if_converted",
  "audience.filter_event",
  "audience.retargeting_tags_exclude",
  "audience.retargeting_tags_exclude[]",
  "audience.interest_action_mode",
  "brand_info",
  "brand_info.brand_name_id",
  "brand_info.cdp_brand_id",
  "brand_info.cdp_brand_name",
  "brand_info.yuntu_category_id",
  "project_materials",
  "project_materials.title_material_list",
  "project_materials.title_material_list[]",
  "project_materials.title_material_list[].title",
  "project_materials.video_material_list",
  "project_materials.video_material_list[]",
  "project_materials.video_material_list[].image_mode",
  "project_materials.video_material_list[].video_id",
  "project_materials.video_material_list[].video_cover_id",
  "project_materials.image_material_list",
  "project_materials.external_url_material_list",
  "project_materials.external_url_material_list[]",
  "project_materials.source",
  "project_materials.mini_program_info",
  "project_materials.mini_program_info.app_id",
  "project_materials.mini_program_info.url",
  "project_materials.product_info",
  "project_materials.product_info.titles",
  "project_materials.product_info.titles[]",
  "project_materials.product_info.image_ids",
  "project_materials.product_info.image_ids[]",
  "project_materials.product_info.selling_points",
  "project_materials.product_info.selling_points[]",
  "project_materials.call_to_action_buttons",
  "project_materials.call_to_action_buttons[]",
  "project_materials.anchor_related_type",
  "track_url_setting",
  "track_url_setting.send_type",
  "track_url_setting.action_track_url",
  "track_url_setting.action_track_url[]",
  "aigc_dynamic_creative_switch",
  "layer_roi_switch",
  "is_comment_disable"
]);

const FORBIDDEN_PAYLOAD_PATHS = new Set([
  "asset_ids",
  "delivery_range",
  "delivery_setting",
  "inventory_catalog",
  "micro_app_instance_id",
  "product_info",
  "app_id",
  "project_materials.dynamic_creative_switch",
  "project_materials.aigc_dynamic_creative_switch",
  "project_materials.video_material_list[].material_id",
  "project_materials.image_material_list[].material_id",
  "project_materials.image_material_list[].width",
  "project_materials.image_material_list[].height",
  "brand_info.ecom_brand_id"
]);

function present(value) {
  return value !== undefined && value !== null && value !== "" && (!Array.isArray(value) || value.length > 0);
}

function diag({
  checkId,
  fieldPath,
  status,
  expectedTypeOrRule,
  actualValue,
  source = "v2_preflight",
  blockerCode = "",
  repairHint = ""
}) {
  return {
    check_id: checkId,
    field_path: fieldPath,
    status,
    expected_type_or_rule: expectedTypeOrRule,
    actual_shape: {
      type: typeName(actualValue),
      present: present(actualValue),
      count: Array.isArray(actualValue) ? actualValue.length : undefined
    },
    source,
    blocker_code: status === "blocked" ? blockerCode : "",
    repair_hint: status === "blocked" ? repairHint : ""
  };
}

function checkRequired(payload, path) {
  const value = valueAt(payload, path);
  return diag({
    checkId: `required:${path}`,
    fieldPath: path,
    status: present(value) ? "passed" : "blocked",
    expectedTypeOrRule: "present_non_empty",
    actualValue: value,
    blockerCode: `missing_required_field:${path}`,
    repairHint: `补齐 ${path} 后再进入 std_project/create。`
  });
}

function checkType(payload, path, expectedType) {
  const value = valueAt(payload, path);
  return diag({
    checkId: `type:${path}`,
    fieldPath: path,
    status: typeName(value) === expectedType ? "passed" : "blocked",
    expectedTypeOrRule: expectedType,
    actualValue: value,
    blockerCode: `invalid_field_type:${path}`,
    repairHint: `${path} 类型应为 ${expectedType}。`
  });
}

function checkInteger(payload, path, { blockerCode = `invalid_integer_field:${path}` } = {}) {
  const value = valueAt(payload, path);
  return diag({
    checkId: `integer:${path}`,
    fieldPath: path,
    status: Number.isSafeInteger(value) ? "passed" : "blocked",
    expectedTypeOrRule: "safe_integer",
    actualValue: value,
    blockerCode,
    repairHint: `${path} 必须由受控资源 ID 转为安全 integer。`
  });
}

function checkIntegerOrDigitString(payload, path, { blockerCode = `invalid_integer_or_digit_string_field:${path}` } = {}) {
  const value = valueAt(payload, path);
  const ok = Number.isSafeInteger(value) || (typeof value === "string" && /^\d+$/.test(value));
  return diag({
    checkId: `integer_or_digit_string:${path}`,
    fieldPath: path,
    status: ok ? "passed" : "blocked",
    expectedTypeOrRule: "safe_integer_number_or_controlled_decimal_string_for_wire_number_token",
    actualValue: value,
    blockerCode,
    repairHint: `${path} 必须是安全 integer；超过 JS 安全整数范围的平台长 ID 必须保持数字字符串，并由受控 wire encoder 写成 JSON number token。`
  });
}

function checkIntegerArray(payload, path) {
  const value = valueAt(payload, path);
  const ok = Array.isArray(value) && value.length > 0 && value.every((item) => Number.isInteger(item));
  return diag({
    checkId: `integer_array:${path}`,
    fieldPath: path,
    status: ok ? "passed" : "blocked",
    expectedTypeOrRule: "non_empty_integer_array",
    actualValue: value,
    blockerCode: `invalid_integer_array:${path}`,
    repairHint: `${path} 必须是非空 integer[]。`
  });
}

function checkHttpsStringArray(payload, path) {
  const value = valueAt(payload, path);
  const ok = Array.isArray(value) && value.length === 1 && value.every((item) => typeof item === "string" && /^https:\/\//.test(item));
  return diag({
    checkId: `https_string_array:${path}`,
    fieldPath: path,
    status: ok ? "passed" : "blocked",
    expectedTypeOrRule: "single_https_url_string_array",
    actualValue: value,
    blockerCode: `invalid_https_string_array:${path}`,
    repairHint: `${path} 必须且只能包含一个已验证 HTTPS 备用网页链接。`
  });
}

function checkEnum(payload, path, allowedValues) {
  const value = clean(valueAt(payload, path));
  return diag({
    checkId: `enum:${path}`,
    fieldPath: path,
    status: allowedValues.includes(value) ? "passed" : "blocked",
    expectedTypeOrRule: `one_of:${allowedValues.join("|")}`,
    actualValue: value,
    blockerCode: `invalid_enum:${path}`,
    repairHint: `${path} 必须使用平台枚举值。`
  });
}

function normalizedPaths(value, prefix = "") {
  const own = prefix ? [prefix] : [];
  if (Array.isArray(value)) {
    return [
      ...own,
      ...value.flatMap((item) => normalizedPaths(item, prefix ? `${prefix}[]` : "[]"))
    ];
  }
  if (value && typeof value === "object") {
    return [
      ...own,
      ...Object.entries(value).flatMap(([key, child]) => normalizedPaths(child, prefix ? `${prefix}.${key}` : key))
    ];
  }
  return own;
}

function checkAllowedFields(payload = {}) {
  const paths = [...new Set(normalizedPaths(payload))];
  const forbidden = paths.filter((path) => FORBIDDEN_PAYLOAD_PATHS.has(path));
    const unknown = paths.filter((path) => !OE3_STD_PROJECT_ALLOWED_PAYLOAD_PATHS.has(path) && !FORBIDDEN_PAYLOAD_PATHS.has(path));
  return [
    ...forbidden.map((path) => diag({
      checkId: `forbidden_field:${path}`,
      fieldPath: path,
      status: "blocked",
      expectedTypeOrRule: "forbidden_for_std_project_create",
      actualValue: valueAt(payload, path.replace(/\[\]/g, "")),
      blockerCode: `forbidden_field:${path}`,
      repairHint: `移除 ${path}，该字段不进入 v2 std_project/create 受控 payload。`
    })),
    ...unknown.map((path) => diag({
      checkId: `unknown_field:${path}`,
      fieldPath: path,
      status: "blocked",
      expectedTypeOrRule: "official_or_verified_adapter_allowlist",
      actualValue: valueAt(payload, path.replace(/\[\]/g, "")),
      blockerCode: `unknown_field:${path}`,
      repairHint: `将 ${path} 对照官方文档或成功合同确认后再加入白名单。`
    }))
  ];
}

function checkFinalMaterialReadiness(manifest = {}) {
  const readiness = manifest.finalMaterialReadiness || {};
  const selected = Number(readiness.selectedRequiredVideoCount || 0);
  const verified = Number(readiness.verifiedVideoCount || 0);
  const covers = Number(readiness.coverReadyCount ?? readiness.coverVerifiedCount ?? 0);
  return diag({
    checkId: "manifest:final_material_readiness",
    fieldPath: "final_payload_manifest.finalMaterialReadiness",
    status: selected > 0 && selected === verified && selected === covers ? "passed" : "blocked",
    expectedTypeOrRule: "selected_required_video_count === verified_video_count === cover_ready_count",
    actualValue: { selectedRequiredVideoCount: selected, verifiedVideoCount: verified, coverReadyCount: covers },
    blockerCode: "final_material_readiness_not_passed",
    repairHint: "两条最终视频必须在目标账户可读；封面需显式验证或允许平台默认封面。"
  });
}

function checkBusinessDefaults(manifest = {}) {
  return diag({
    checkId: "manifest:business_defaults_source",
    fieldPath: "final_payload_manifest.businessDefaultsPresent",
    status: manifest.businessDefaultsPresent === true ? "passed" : "blocked",
    expectedTypeOrRule: "postgres_route_payload_defaults_present",
    actualValue: {
      present: manifest.businessDefaultsPresent === true,
      source: manifest.businessDefaultsSource || ""
    },
    blockerCode: "route_payload_defaults_missing",
    repairHint: "将路线业务默认值写入 mwb.game_route_defaults.raw_defaults.payload_defaults。"
  });
}

function checkContractMapping(manifest = {}) {
  const mapping = manifest.contractMapping || {};
  const candidateField = clean(mapping.miniGameInstanceCandidateCreateField);
  const optimizedGoalField = clean(mapping.optimizedGoalQueryInstanceFieldName);
  const appField = clean(mapping.optimizedGoalQueryAppFieldName);
  return diag({
    checkId: "manifest:mini_game_instance_field_mapping",
    fieldPath: "final_payload_manifest.contractMapping",
    status: candidateField === "instance_id" && optimizedGoalField === "micro_app_instance_id" && appField === "mini_program_id"
      ? "passed"
      : "blocked",
    expectedTypeOrRule: "create_candidate:instance_id optimized_goal_query:micro_app_instance_id app:mini_program_id",
    actualValue: {
      miniGameInstanceCandidateCreateField: candidateField,
      optimizedGoalQueryInstanceFieldName: optimizedGoalField,
      optimizedGoalQueryAppFieldName: appField
    },
    blockerCode: "mini_game_instance_field_mapping_invalid",
    repairHint: "查询参数与创建候选字段必须分开记录；候选字段仍需通过官方创建合同验证。"
  });
}

function checkInstanceIdCreateEvidence(manifest = {}) {
  const evidence = manifest.instanceIdCreateEvidence || {};
  const blockers = Array.isArray(evidence.blockers) ? evidence.blockers : [];
  return diag({
    checkId: "manifest:instance_id_create_evidence",
    fieldPath: "final_payload_manifest.instanceIdCreateEvidence",
    status: evidence.status === "passed" && blockers.length === 0 ? "passed" : "blocked",
    expectedTypeOrRule: "official_direct_field_name + type + MICRO_GAME_BYTE_GAME_condition + verified_engineering_wire_transport",
    actualValue: {
      status: evidence.status || "missing",
      candidateField: evidence.candidateField || "",
      fieldNameVerified: evidence.fieldNameVerified === true,
      fieldTypeVerified: evidence.fieldTypeVerified === true,
      applicabilityVerified: evidence.applicabilityVerified === true,
      longIdTransportVerified: evidence.longIdTransportVerified === true,
      longIdTransportStrategy: evidence.longIdTransportStrategy || "",
      longPlatformId: evidence.longPlatformId === true
    },
    blockerCode: blockers[0] || "instance_id_create_contract_not_verified",
    repairHint: "字段名、类型和 BYTE_GAME 适用性来自本机官方创建文档；19 位 number 传输必须由本地受控 wire encoder 验证后才发送。"
  });
}

function checkCreateWireBody(payload = {}) {
  const wireBody = buildStdProjectCreateWireBody(payload);
  return diag({
    checkId: "wire_body:std_project_create",
    fieldPath: "std_project_create.request_body",
    status: wireBody.status,
    expectedTypeOrRule: `canonical_json_body_with_top_level_instance_id:${INSTANCE_ID_WIRE_STRATEGY}`,
    actualValue: {
      requestHashPresent: Boolean(wireBody.requestHash),
      instanceIdPresent: wireBody.instanceIdPresent === true,
      instanceIdWireNumberTokenPresent: wireBody.instanceIdWireNumberTokenPresent === true,
      instanceIdTransportStrategy: wireBody.instanceIdTransportStrategy || "",
      rawBodyStored: false
    },
    blockerCode: wireBody.blockers[0] || "std_project_create_wire_body_invalid",
    repairHint: "仅顶层 instance_id 可由数字字符串编码为 JSON number token；请求体只用于发送和 hash，不保存原文。"
  });
}

function checkCreateWireBodyManifest(manifest = {}) {
  const requiresInstanceId = manifest.miniProgramUrlRequired === false;
  const blockers = Array.isArray(manifest.createWireBodyBlockers) ? manifest.createWireBodyBlockers : [];
  const passed = manifest.createWireBodyEncodingStatus === "passed" &&
    (!requiresInstanceId || manifest.microAppInstanceIdTransportStrategy === INSTANCE_ID_WIRE_STRATEGY) &&
    (!requiresInstanceId || manifest.microAppInstanceIdWireNumberTokenPresent === true) &&
    /^sha256:[a-f0-9]{64}$/.test(clean(manifest.createWireBodyHash)) &&
    clean(manifest.createWireBodyHash) === clean(manifest.createRequestHash);
  return diag({
    checkId: "manifest:create_wire_body",
    fieldPath: "final_payload_manifest.createWireBodyHash",
    status: passed ? "passed" : "blocked",
    expectedTypeOrRule: `hash_present_and_instance_id_strategy:${INSTANCE_ID_WIRE_STRATEGY}`,
    actualValue: {
      encodingStatus: manifest.createWireBodyEncodingStatus || "",
      hashPresent: Boolean(clean(manifest.createWireBodyHash)),
      requestHashMatches: clean(manifest.createWireBodyHash) === clean(manifest.createRequestHash),
      instanceIdTransportStrategy: manifest.microAppInstanceIdTransportStrategy || "",
      instanceIdWireNumberTokenPresent: manifest.microAppInstanceIdWireNumberTokenPresent === true,
      rawBodyStored: false
    },
    blockerCode: blockers[0] || "std_project_create_wire_body_not_verified",
    repairHint: "重新生成 Node 5 草稿，确认 payload_hash 与最终 create wire body hash 绑定。"
  });
}

function checkPayloadAwemeId(payload = {}) {
  const value = clean(payload.aweme_id);
  const required = clean(payload.native_type) === "AWEME";
  const shape = !value ? "missing" : /^https?:\/\//i.test(value) ? "url" : /^web\.business\.image\//i.test(value) ? "web_business_image_uri" : /^\d+$/.test(value) ? "digit_string" : "unknown_string";
  return diag({
    checkId: "payload:aweme_id",
    fieldPath: "aweme_id",
    status: !required || shape === "digit_string" ? "passed" : "blocked",
    expectedTypeOrRule: "required_when_native_type_AWEME_and_decimal_string_from_account_authorization",
    actualValue: { required, shape },
    blockerCode: shape === "web_business_image_uri" ? "aweme_id_avatar_image_uri_rejected" : `aweme_id_invalid_shape:${shape}`,
    repairHint: "aweme_id 必须来自账户授权关系，不得来自头像、图片 URI 或任意 avatar 字段。"
  });
}

function checkAwemeAuthorizationManifest(manifest = {}) {
  const authorization = manifest.awemeAuthorization || {};
  const blockers = Array.isArray(authorization.blockers) ? authorization.blockers : [];
  const required = authorization.required === true;
  const statusAllowed = authorization.fixedDefaultPolicy === true
    ? authorization.status === "default_authorized"
    : ["auto_selected", "manual_selected"].includes(authorization.status);
  const passed = !required || (
    manifest.awemeIdPresent === true &&
    manifest.awemeIdValidated === true &&
    manifest.awemeIdFromAvatar === false &&
    manifest.awemeIdLooksLikeImageResource === false &&
    manifest.awemeIdValueShape === "digit_string" &&
    statusAllowed &&
    authorization.selectedActive === true &&
    authorization.accountMatches === true &&
    (
      authorization.fixedDefaultPolicy !== true ||
      (
        authorization.defaultAwemeIdConfigured === true &&
        authorization.defaultAwemeAuthorized === true &&
        authorization.selectedMatchesDefault === true &&
        Boolean(authorization.defaultAwemeIdHash)
      )
    ) &&
    Boolean(authorization.verifiedAt) &&
    Boolean(manifest.awemeIdHash)
  );
  return diag({
    checkId: "manifest:aweme_authorization",
    fieldPath: "final_payload_manifest.awemeAuthorization",
    status: passed ? "passed" : "blocked",
    expectedTypeOrRule: "selected_aweme_id_from_verified_advertiser_account_authorization",
    actualValue: {
      required,
      awemeIdPresent: manifest.awemeIdPresent === true,
      awemeIdValidated: manifest.awemeIdValidated === true,
      awemeIdValueShape: manifest.awemeIdValueShape || "",
      awemeIdFromAvatar: manifest.awemeIdFromAvatar === true,
      awemeIdLooksLikeImageResource: manifest.awemeIdLooksLikeImageResource === true,
      status: authorization.status || "missing",
      selectionPolicy: authorization.selectionPolicy || "",
      selectedActive: authorization.selectedActive === true,
      accountMatches: authorization.accountMatches === true,
      fixedDefaultPolicy: authorization.fixedDefaultPolicy === true,
      defaultAwemeIdConfigured: authorization.defaultAwemeIdConfigured === true,
      defaultAwemeAuthorized: authorization.defaultAwemeAuthorized === true,
      selectedMatchesDefault: authorization.selectedMatchesDefault === true,
      candidateCount: Number(authorization.candidateCount || 0),
      verifiedAtPresent: Boolean(authorization.verifiedAt),
      evidenceRefPresent: Boolean(authorization.evidenceRef),
      blockers
    },
    blockerCode: blockers[0] || (manifest.awemeIdLooksLikeImageResource ? "aweme_id_avatar_image_uri_rejected" : "aweme_auth_not_verified"),
    repairHint: "先在 Node 4 只读核验账户抖音号授权关系；固定默认策略必须确认该账户拥有默认 aweme_id 后，Node 5 才能生成 aweme_id。"
  });
}

function checkOfficialFieldEvidence(manifest = {}) {
  const evidence = manifest.officialFieldEvidence || {};
  const blockers = Array.isArray(evidence.blockerCodes) ? evidence.blockerCodes : [];
  const fields = Array.isArray(evidence.fields) ? evidence.fields : [];
  const sentUnverified = fields.filter((field) => field.status !== "passed").map((field) => field.fieldPath);
  return diag({
    checkId: "manifest:official_field_evidence",
    fieldPath: "final_payload_manifest.officialFieldEvidence",
    status: evidence.status === "passed" && blockers.length === 0 ? "passed" : "blocked",
    expectedTypeOrRule: "all_sent_fields_have_official_direct_create_evidence_and_send_policy",
    actualValue: {
      status: evidence.status || "missing",
      blockerCount: blockers.length,
      sentUnverified
    },
    blockerCode: blockers[0] || "official_field_evidence_missing_or_blocked",
    repairHint: "仅发送具有本机官方创建字段依据的字段；查询接口依据不能替代创建字段依据。"
  });
}

export function evaluateStdProjectCreatePreflight({
  payload = null,
  requestFieldManifest = {},
  payloadContractStatus = "not_run"
} = {}) {
  const diagnostics = [];
  if (payload) {
    [
      "advertiser_id",
      "name",
      "ad_type",
      "landing_type",
      "marketing_goal",
      "external_action",
      "native_type",
      "delivery_mode",
      "schedule_type",
      "bid_type",
      "budget_mode",
      "pricing",
      "audience_type",
      "audience",
      "project_materials",
      "track_url_setting",
      "brand_info"
    ].forEach((path) => diagnostics.push(checkRequired(payload, path)));
    diagnostics.push(checkInteger(payload, "advertiser_id", {
      blockerCode: "advertiser_id_not_safe_integer_for_platform_payload"
    }));
    diagnostics.push(checkType(payload, "name", "string"));
    diagnostics.push(checkInteger(payload, "asset_id"));
    if (Object.hasOwn(payload, "instance_id")) {
      diagnostics.push(checkIntegerOrDigitString(payload, "instance_id", {
        blockerCode: "invalid_lossless_platform_id:instance_id"
      }));
    }
    diagnostics.push(checkCreateWireBody(payload));
    diagnostics.push(checkPayloadAwemeId(payload));
    diagnostics.push(checkInteger(payload, "brand_info.brand_name_id"));
    diagnostics.push(checkInteger(payload, "brand_info.cdp_brand_id"));
    diagnostics.push(checkInteger(payload, "brand_info.yuntu_category_id"));
    diagnostics.push(checkEnum(payload, "audience.gender", ["GENDER_UNLIMITED"]));
    diagnostics.push(checkEnum(payload, "audience.hide_if_converted", [
      "NO_EXCLUDE",
      "EXCLUDE_CLICK",
      "EXCLUDE_CONVERT",
      "EXCLUDE_APP",
      "EXCLUDE_CUSTOMER"
    ]));
    diagnostics.push(checkIntegerArray(payload, "audience.retargeting_tags_exclude"));
    diagnostics.push(checkHttpsStringArray(payload, "project_materials.external_url_material_list"));
    diagnostics.push(...checkAllowedFields(payload));
  } else {
    const blockers = Array.isArray(requestFieldManifest.blockers) ? requestFieldManifest.blockers : [];
    diagnostics.push(diag({
      checkId: "manifest:required_fields",
      fieldPath: "final_payload_manifest.requiredFieldsPresent",
      status: requestFieldManifest.requiredFieldsPresent === true ? "passed" : "blocked",
      expectedTypeOrRule: "true",
      actualValue: requestFieldManifest.requiredFieldsPresent,
      blockerCode: "final_payload_required_fields_missing",
      repairHint: "重新生成最终受控 payload manifest。"
    }));
    diagnostics.push(diag({
      checkId: "manifest:field_blockers",
      fieldPath: "final_payload_manifest.blockers",
      status: blockers.length ? "blocked" : "passed",
      expectedTypeOrRule: "empty_array",
      actualValue: blockers,
      blockerCode: blockers[0] || "final_payload_manifest_blocked",
      repairHint: "按 manifest blockers 修复资源或字段形态。"
    }));
    diagnostics.push(diag({
      checkId: "manifest:advertiser_id_transport",
      fieldPath: "final_payload_manifest.advertiserIdTransportType",
      status: requestFieldManifest.advertiserIdStorageType === "string" &&
        requestFieldManifest.advertiserIdTransportType === "number" &&
        requestFieldManifest.advertiserIdTransportSafe === true
        ? "passed"
        : "blocked",
      expectedTypeOrRule: "storage:string transport:number safe_integer:true",
      actualValue: {
        storageType: requestFieldManifest.advertiserIdStorageType || "",
        transportType: requestFieldManifest.advertiserIdTransportType || "",
        transportSafe: requestFieldManifest.advertiserIdTransportSafe === true
      },
      blockerCode: "advertiser_id_not_safe_integer_for_platform_payload",
      repairHint: "Postgres/Job 保持 string，仅最终受控 create payload 转为 safe integer number。"
    }));
    diagnostics.push(diag({
      checkId: "contract:payload_contract",
      fieldPath: "payload_contract.status",
      status: payloadContractStatus === "passed" ? "passed" : "blocked",
      expectedTypeOrRule: "passed",
      actualValue: payloadContractStatus,
      blockerCode: "payload_contract_not_passed",
      repairHint: "先修复 payload contract gaps。"
    }));
    diagnostics.push(diag({
      checkId: "manifest:backup_landing_page",
      fieldPath: "final_payload_manifest.backupLandingPagePresent",
      status: requestFieldManifest.backupLandingPagePresent === true &&
        requestFieldManifest.backupLandingPageHttps === true &&
        requestFieldManifest.backupLandingPageTargetVisible === true &&
        requestFieldManifest.backupLandingPageReadbackVerified === true &&
        requestFieldManifest.backupLandingPageHashMatch === true
        ? "passed"
        : "blocked",
      expectedTypeOrRule: "present + https + target_visible + readback_verified + hash_match",
      actualValue: {
        present: requestFieldManifest.backupLandingPagePresent === true,
        siteId: requestFieldManifest.backupLandingPageSiteId || "",
        assetId: requestFieldManifest.backupLandingPageAssetId || "",
        urlHashPresent: Boolean(requestFieldManifest.backupLandingPageUrlHash),
        https: requestFieldManifest.backupLandingPageHttps === true,
        targetVisible: requestFieldManifest.backupLandingPageTargetVisible === true,
        readbackVerified: requestFieldManifest.backupLandingPageReadbackVerified === true,
        hashMatch: requestFieldManifest.backupLandingPageHashMatch === true
      },
      blockerCode: "backup_landing_page_not_ready",
      repairHint: "解析默认备用网页 HTTPS URL，并确认目标账户可见、回查通过、hash 一致。"
    }));
  }
  diagnostics.push(checkBusinessDefaults(requestFieldManifest));
  diagnostics.push(checkContractMapping(requestFieldManifest));
  diagnostics.push(checkInstanceIdCreateEvidence(requestFieldManifest));
  diagnostics.push(checkCreateWireBodyManifest(requestFieldManifest));
  diagnostics.push(checkAwemeAuthorizationManifest(requestFieldManifest));
  diagnostics.push(checkOfficialFieldEvidence(requestFieldManifest));
  diagnostics.push(checkFinalMaterialReadiness(requestFieldManifest));

  const blocked = diagnostics.filter((item) => item.status === "blocked");
  return {
    status: blocked.length ? "blocked" : "passed",
    blocker_codes: [...new Set(blocked.map((item) => item.blocker_code).filter(Boolean))],
    blocker_count: blocked.length,
    diagnostics,
    summary: blocked.length
      ? `创建前校验未通过：请修复 ${blocked.length} 项字段合同问题。`
      : "创建前字段合同校验通过。"
  };
}
