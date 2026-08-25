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

const ALLOWED_PAYLOAD_PATHS = new Set([
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
  const unknown = paths.filter((path) => !ALLOWED_PAYLOAD_PATHS.has(path) && !FORBIDDEN_PAYLOAD_PATHS.has(path));
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
  const createField = clean(mapping.miniGameInstanceCreateFieldName);
  const optimizedGoalField = clean(mapping.optimizedGoalQueryInstanceFieldName);
  const appField = clean(mapping.optimizedGoalQueryAppFieldName);
  return diag({
    checkId: "manifest:mini_game_instance_field_mapping",
    fieldPath: "final_payload_manifest.contractMapping",
    status: createField === "instance_id" && optimizedGoalField === "micro_app_instance_id" && appField === "mini_program_id"
      ? "passed"
      : "blocked",
    expectedTypeOrRule: "create:instance_id optimized_goal_query:micro_app_instance_id app:mini_program_id",
    actualValue: {
      miniGameInstanceCreateFieldName: createField,
      optimizedGoalQueryInstanceFieldName: optimizedGoalField,
      optimizedGoalQueryAppFieldName: appField
    },
    blockerCode: "mini_game_instance_field_mapping_not_verified",
    repairHint: "按官方合同分别记录查询参数字段与创建请求字段，不允许双发实例字段。"
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
    diagnostics.push(checkInteger(payload, "instance_id"));
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
  }
  diagnostics.push(checkBusinessDefaults(requestFieldManifest));
  diagnostics.push(checkContractMapping(requestFieldManifest));
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
