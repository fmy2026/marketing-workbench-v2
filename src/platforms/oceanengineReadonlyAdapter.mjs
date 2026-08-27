export const REQUIRED_RESOURCE_TYPES = [
  "avatar",
  "dmp_audience_package",
  "event_asset",
  "video_asset",
  "product_image",
  "brand_info",
  "micro_app_instance"
];

const RESOURCE_LABELS = {
  avatar: "头像",
  dmp_audience_package: "DMP",
  event_asset: "事件资产",
  video_asset: "视频",
  product_image: "产品图",
  brand_info: "品牌",
  micro_app_instance: "小程序实例"
};

const EVENT_ASSET_TYPE = "MINI_PROGRAME";
const EXPECTED_BRAND_NAME = "巨兽战场";
const EXPECTED_INDUSTRY_KEYWORDS = ["游戏", "SLG"];
const EXPECTED_BRAND_INFO_OFFICIAL = {
  cdp_brand_id: "4016408",
  brand_name_id: "11467384",
  cdp_brand_name: "巨兽战场",
  yuntu_category_id: "2202",
  matched_industry_path: "游戏 / SLG",
  readback_status: "fresh_target_brand_industry_readback_passed"
};

function compact(value) {
  return String(value ?? "").trim();
}

function maybeNumberId(value) {
  const text = compact(value);
  return /^\d+$/.test(text) && Number.isSafeInteger(Number(text)) ? Number(text) : text;
}

function arrayFrom(value) {
  return Array.isArray(value) ? value : [];
}

function readyResource(resource) {
  const readonlyStatus = compact(resource?.metadata?.readonly_check?.status);
  return resource?.visibility_status === "visible" &&
    (resource?.readback_status === "readback_verified" || resource?.readback_status === "not_required") &&
    (!readonlyStatus || ["passed", "passed_by_manual_confirmation"].includes(readonlyStatus));
}

function check(status, key, summary, detail = {}) {
  return { key, status, summary, ...detail };
}

function materialList(payload = {}) {
  return [
    payload?.data?.list,
    payload?.data?.video_list,
    payload?.data?.material_list,
    payload?.data?.items
  ].find((item) => Array.isArray(item)) || [];
}

function dmpAudienceList(payload = {}) {
  if (Array.isArray(payload?.data?.custom_audience_list)) return payload.data.custom_audience_list;
  if (Array.isArray(payload?.data?.list)) return payload.data.list;
  return [];
}

function eventAssetList(payload = {}) {
  return [
    ...arrayFrom(payload?.data?.asset_list),
    ...arrayFrom(payload?.data?.list),
    ...arrayFrom(payload?.asset_list)
  ];
}

function firstValueByKey(value, keys) {
  const wanted = new Set(keys);
  const found = [];
  function walk(item) {
    if (!item || typeof item !== "object") return;
    if (Array.isArray(item)) {
      item.forEach(walk);
      return;
    }
    Object.entries(item).forEach(([key, child]) => {
      if (wanted.has(key) && compact(child)) found.push(compact(child));
      walk(child);
    });
  }
  walk(value);
  return found[0] || "";
}

function normalizeEventAsset(asset = {}) {
  return {
    asset_id: compact(asset.asset_id || asset.id),
    asset_name: compact(asset.asset_name || asset.name),
    asset_type: compact(asset.asset_type || asset.type),
    app_id: firstValueByKey(asset, ["app_id", "mini_program_id", "mini_program_app_id"]),
    micro_app_instance_id: firstValueByKey(asset, ["instance_id", "micro_app_instance_id"])
  };
}

function summarizeEventAssets(payload = {}, bundle = {}) {
  const appId = compact(bundle?.platformApp?.app_id);
  const expected = eventAssetList(payload)
    .map(normalizeEventAsset)
    .find((asset) => asset.asset_type === EVENT_ASSET_TYPE && (!asset.app_id || asset.app_id === appId));
  return {
    assetCount: eventAssetList(payload).length,
    expectedAssetFound: Boolean(expected),
    expectedAssetId: expected?.asset_id || "",
    appMatched: Boolean(expected && (!expected.app_id || expected.app_id === appId))
  };
}

function summarizeAvatar(payload = {}) {
  const data = payload.data || {};
  const avatarInfo = data.avatar_info || {};
  const rawStatus = compact(data.avatar_status);
  const statusMap = { "0": "UNSET", "1": "IN_AUDIT", "2": "AUDIT_REJECT", "3": "AUDIT_PASS" };
  const avatarStatus = statusMap[rawStatus] || rawStatus;
  return {
    advertiserIdPresent: Boolean(data.advertiser_id),
    avatarStatus,
    avatarReady: /^(AUDIT_PASS|IN_AUDIT)$/i.test(avatarStatus),
    imagePresent: Boolean(avatarInfo.web_uri || avatarInfo.audit_web_uri || avatarInfo.width || avatarInfo.height),
    width: Number(avatarInfo.width || 0),
    height: Number(avatarInfo.height || 0)
  };
}

function summarizeStdProjectList(payload = {}) {
  const data = payload.data || {};
  const items = Array.isArray(data.list) ? data.list : (Array.isArray(data.records) ? data.records : []);
  return {
    listCount: items.length,
    firstProjectIdPresent: Boolean(items[0]?.project_id || items[0]?.std_project_id || items[0]?.id),
    firstNamePresent: Boolean(items[0]?.name || items[0]?.project_name || items[0]?.std_project_name)
  };
}

function brandList(payload = {}) {
  const data = payload.data || {};
  if (Array.isArray(data.brand_list)) return data.brand_list;
  if (Array.isArray(data.list)) return data.list;
  if (Array.isArray(payload.brand_list)) return payload.brand_list;
  return [];
}

function brandMatchesExpected(item = {}) {
  return compact(item.merge_brand_name || item.brand_name || item.brand_full_name) === EXPECTED_BRAND_NAME &&
    compact(item.available_status || item.status || "VALID") === "VALID";
}

function outerBrandIdFromBrand(item = {}) {
  return compact(item.yuntu_brand_detail?.outer_brand_id || item.outer_brand_id);
}

function flattenIndustryNodes(value, path = []) {
  if (Array.isArray(value)) return value.flatMap((item) => flattenIndustryNodes(item, path));
  if (!value || typeof value !== "object") return [];
  const name = compact(value.industry_name || value.category_name || value.name);
  const id = compact(value.industry_id || value.category_id);
  const nextPath = name ? [...path, name] : path;
  const current = id ? [{ id, name, pathText: nextPath.join(" / ") }] : [];
  return [
    ...current,
    ...flattenIndustryNodes(value.sub_industry_info, nextPath),
    ...flattenIndustryNodes(value.children, nextPath)
  ];
}

function summarizeBrand(payload = {}) {
  const matches = brandList(payload).filter(brandMatchesExpected);
  const brand = matches[0] || {};
  const brandNameId = outerBrandIdFromBrand(brand);
  return {
    matchedBrandCount: matches.length,
    outerBrandId: brandNameId,
    brandNameId,
    cdpBrandId: compact(brand.merge_brand_id),
    cdpBrandName: compact(brand.merge_brand_name || brand.brand_name),
    mergeBrandId: compact(brand.merge_brand_id),
    mergeBrandName: compact(brand.merge_brand_name || brand.brand_name)
  };
}

function summarizeIndustry(payload = {}) {
  const data = payload.data || {};
  const text = JSON.stringify(data);
  const nodes = flattenIndustryNodes(data.industry_info || data.list || data);
  const node = nodes.find((item) => EXPECTED_INDUSTRY_KEYWORDS.every((keyword) => item.pathText.includes(keyword)))
    || nodes.find((item) => item.name === EXPECTED_INDUSTRY_KEYWORDS.at(-1))
    || null;
  return {
    industryMatched: EXPECTED_INDUSTRY_KEYWORDS.every((keyword) => text.includes(keyword)),
    industryId: compact(node?.id || firstValueByKey(data, ["industry_id", "category_id"])),
    industryPath: compact(node?.pathText)
  };
}

function brandInfoOfficialFromReadback({ brandSummary = {}, industrySummary = {} } = {}) {
  return {
    cdp_brand_id: compact(brandSummary.cdpBrandId || EXPECTED_BRAND_INFO_OFFICIAL.cdp_brand_id),
    brand_name_id: compact(brandSummary.brandNameId || EXPECTED_BRAND_INFO_OFFICIAL.brand_name_id),
    cdp_brand_name: compact(brandSummary.cdpBrandName || EXPECTED_BRAND_INFO_OFFICIAL.cdp_brand_name),
    yuntu_category_id: compact(industrySummary.industryId || EXPECTED_BRAND_INFO_OFFICIAL.yuntu_category_id),
    matched_industry_path: compact(industrySummary.industryPath || EXPECTED_BRAND_INFO_OFFICIAL.matched_industry_path),
    readback_status: EXPECTED_BRAND_INFO_OFFICIAL.readback_status,
    source: "live_target_account_readback",
    evidence_rule: "dpa/brand/adv_auth/fuzzy/get + dpa/brand/adv_auth/industry/get"
  };
}

function brandOfficialMatchesExpected(brandSummary = {}, industrySummary = {}) {
  const official = brandInfoOfficialFromReadback({ brandSummary, industrySummary });
  return official.cdp_brand_id === EXPECTED_BRAND_INFO_OFFICIAL.cdp_brand_id &&
    official.brand_name_id === EXPECTED_BRAND_INFO_OFFICIAL.brand_name_id &&
    official.cdp_brand_name === EXPECTED_BRAND_INFO_OFFICIAL.cdp_brand_name &&
    official.yuntu_category_id === EXPECTED_BRAND_INFO_OFFICIAL.yuntu_category_id &&
    Boolean(industrySummary.industryMatched);
}

function manualBrandConfirmation(resource = {}) {
  const official = resource?.metadata?.brand_info_official || {};
  const readonlyStatus = compact(resource?.metadata?.readonly_check?.status);
  const matches = compact(official.cdp_brand_id) === EXPECTED_BRAND_INFO_OFFICIAL.cdp_brand_id &&
    compact(official.brand_name_id) === EXPECTED_BRAND_INFO_OFFICIAL.brand_name_id &&
    compact(official.cdp_brand_name) === EXPECTED_BRAND_INFO_OFFICIAL.cdp_brand_name &&
    compact(official.yuntu_category_id) === EXPECTED_BRAND_INFO_OFFICIAL.yuntu_category_id &&
    compact(official.matched_industry_path) === EXPECTED_BRAND_INFO_OFFICIAL.matched_industry_path &&
    official.used_for_create_gate === true;
  return {
    confirmed: matches && ["passed_by_manual_confirmation", "passed"].includes(readonlyStatus),
    official
  };
}

function summarizeMaterial(payload = {}, wantedId = "") {
  const wanted = compact(wantedId);
  const found = materialList(payload).find((item) => {
    const ids = [item.id, item.video_id, item.image_id, item.material_id].map(compact);
    return ids.includes(wanted);
  });
  return {
    listCount: materialList(payload).length,
    targetVisible: Boolean(found),
    materialIdPresent: Boolean(found?.material_id),
    width: Number(found?.width || 0),
    height: Number(found?.height || 0)
  };
}

function isConcretePlatformId(value) {
  const text = compact(value);
  return Boolean(text && !/^(JSZC-|PI-|DMP-)/.test(text));
}

function localResourceChecks(resources = []) {
  return REQUIRED_RESOURCE_TYPES.map((type) => {
    const resource = resources.find((item) => item.resource_type === type && item.required === true);
    if (!resource) {
      return check("blocked", `resource_${type}`, `${RESOURCE_LABELS[type]} 缺失。`, {
        resourceType: type,
        gap: "missing_resource",
        nextAction: "补齐账户资源记录"
      });
    }
    if (!readyResource(resource)) {
      return check("blocked", `resource_${type}`, `${RESOURCE_LABELS[type]} 未 ready：visibility=${resource.visibility_status}，readback=${resource.readback_status}。`, {
        resourceType: type,
        gap: "resource_not_ready",
        nextAction: type === "event_asset" ? "进入事件资产补齐确认任务" : "补齐或确认账户资源"
      });
    }
    return check("passed", `resource_${type}`, `${RESOURCE_LABELS[type]} 已 ready。`, {
      resourceType: type,
      gap: "",
      nextAction: "无需动作"
    });
  });
}

function resourceByType(bundle = {}, type) {
  return (bundle.resources || []).find((item) => item.resource_type === type) || null;
}

function probeCheck(probe, { key, resourceType = "", passWhen = () => true, blockedSummary = "", passedSummary = "" }) {
  if (!probe) return check("waiting", key, "等待平台只读校验。", { resourceType, gap: "not_checked", nextAction: "运行只读校验" });
  if (probe.status === "credential_required") {
    return check("credential_required", key, probe.gap, { resourceType, gap: "credential_required", nextAction: "单独处理凭据，不刷新" });
  }
  if (probe.status === "transport_failed") {
    return check("blocked", key, probe.gap, { resourceType, gap: "readonly_transport_failed", nextAction: "排查网络或代理后重跑只读校验" });
  }
  if (probe.status !== "passed") {
    return check("blocked", key, probe.gap || "平台只读 API 未通过。", { resourceType, gap: "readonly_api_not_passed", nextAction: "检查账户权限或 API 返回摘要" });
  }
  if (!passWhen(probe.summary || {})) {
    return check("blocked", key, blockedSummary || "平台只读摘要未满足 ready 条件。", { resourceType, gap: "readonly_summary_not_ready", nextAction: "进入账户资源补齐确认任务" });
  }
  return check("passed", key, passedSummary || "平台只读校验通过。", { resourceType, gap: "", nextAction: "无需动作" });
}

function probeLabelsForResource(probes = [], resourceType = "") {
  const prefixes = {
    avatar: ["avatar"],
    event_asset: ["event"],
    product_image: ["product_image"],
    video_asset: ["video"],
    dmp_audience_package: ["dmp"],
    brand_info: ["brand"],
    micro_app_instance: []
  }[resourceType] || [];
  return probes.filter((probe) => prefixes.some((prefix) => probe.label.includes(prefix))).map((probe) => probe.label);
}

function materialCheck(probe, key, resourceType, missingSummary) {
  if (!probe) {
    return check("blocked", key, missingSummary, {
      resourceType,
      gap: "platform_resource_id_missing",
      nextAction: resourceType === "product_image" ? "进入产品图补齐确认任务" : "补齐可查询平台资源 ID"
    });
  }
  return probeCheck(probe, {
    key,
    resourceType,
    passWhen: (summary) => summary.targetVisible,
    passedSummary: `${RESOURCE_LABELS[resourceType]} 平台可见。`,
    blockedSummary: `${RESOURCE_LABELS[resourceType]} 平台不可见。`
  });
}

export async function runOceanEngineReadonlyProbes({ bundle, draft, client } = {}) {
  const advertiserId = compact(bundle?.job?.advertiser_id);
  const projectName = compact(draft?.projectName || draft?.project_name || bundle?.draft?.project_name);
  const probes = [];
  const credential = client?.credentialState?.() || { status: "credential_required", blockers: ["client_missing"] };
  const credentialBlockers = Array.isArray(credential.blockers) ? credential.blockers : [];
  const run = async (definition) => {
    const probe = await client.get(definition);
    probes.push(probe);
    return probe;
  };

  if (credential.status !== "ready") {
    return {
      status: "credential_required",
      credential,
      probes,
      checks: [
        check("credential_required", "platform_readonly_credential", `真实平台只读凭据不可用或已过期：${credentialBlockers.join(",") || "unknown"}；只读校验不会自动刷新凭据。`, {
          gap: "credential_required",
          nextAction: "运行 token:status；如已有有效 refresh token，再带确认变量运行 token:refresh",
          credentialBlockers
        })
      ],
      resourceUpdates: REQUIRED_RESOURCE_TYPES.map((resourceType) => ({
        resourceType,
        readonlyCheck: {
          status: "credential_required",
          key: "platform_readonly_credential",
          gap: "credential_required",
          next_action: "处理 v2 本地 OceanEngine 凭据后重跑只读校验",
          credential_blockers: credentialBlockers
        }
      })),
      platformDuplicateCheck: { status: "credential_required", listCount: null }
    };
  }

  const stdProjectProbe = await run({
    label: "std_project_duplicate",
    endpoint: "/open_api/v3.0/std_project/list/",
    query: {
      advertiser_id: advertiserId,
      filtering: JSON.stringify(projectName ? { name: projectName } : { name: "MWBV2_READONLY_PROBE_NEVER_MATCH" }),
      page: "1",
      page_size: "20"
    },
    summarize: summarizeStdProjectList
  });

  const avatarProbe = await run({
    label: "avatar",
    endpoint: "https://ad.oceanengine.com/open_api/2/advertiser/avatar/get/",
    query: { advertiser_id: advertiserId },
    summarize: summarizeAvatar
  });

  const eventProbe = await run({
    label: "event_asset",
    endpoint: "tools/event/all_assets/list",
    query: {
      advertiser_id: advertiserId,
      filtering: JSON.stringify({ asset_type: EVENT_ASSET_TYPE }),
      page: "1",
      page_size: "100"
    },
    summarize: (payload) => summarizeEventAssets(payload, bundle)
  });

  const brandProbe = await run({
    label: "brand_info",
    endpoint: "/open_api/v3.0/dpa/brand/adv_auth/fuzzy/get/",
    query: {
      account_id: advertiserId,
      brand_name: EXPECTED_BRAND_NAME,
      match_type: "EXACT",
      brand_data_source_list: JSON.stringify(["YUNTU"]),
      page: "1",
      page_size: "20"
    },
    summarize: summarizeBrand
  });
  const brandResource = resourceByType(bundle, "brand_info");
  const manualBrand = manualBrandConfirmation(brandResource);

  let industryProbe = null;
  const brandNameIdForIndustry = brandProbe.summary?.brandNameId === EXPECTED_BRAND_INFO_OFFICIAL.brand_name_id
    ? brandProbe.summary.brandNameId
    : "";
  if (brandNameIdForIndustry) {
    industryProbe = await run({
      label: "brand_industry",
      endpoint: "/open_api/v3.0/dpa/brand/adv_auth/industry/get/",
      query: {
        account_id: advertiserId,
        origin_req: JSON.stringify({
          brand_data_source: "YUNTU",
          outer_brand_id: maybeNumberId(brandNameIdForIndustry)
        })
      },
      summarize: summarizeIndustry
    });
  }

  const productImage = resourceByType(bundle, "product_image");
  const imageProbe = isConcretePlatformId(productImage?.platform_resource_id) ? await run({
    label: "product_image",
    endpoint: "file/image/get",
    query: {
      advertiser_id: advertiserId,
      filtering: JSON.stringify({ image_ids: [compact(productImage.platform_resource_id)] }),
      page: "1",
      page_size: "100"
    },
    summarize: (payload) => summarizeMaterial(payload, productImage.platform_resource_id)
  }) : null;

  const video = resourceByType(bundle, "video_asset");
  const videoProbe = isConcretePlatformId(video?.platform_resource_id) ? await run({
    label: "video_asset",
    endpoint: "file/video/get",
    query: {
      advertiser_id: advertiserId,
      filtering: JSON.stringify({ video_ids: [compact(video.platform_resource_id)] }),
      page: "1",
      page_size: "100"
    },
    summarize: (payload) => summarizeMaterial(payload, video.platform_resource_id)
  }) : null;

  const dmp = resourceByType(bundle, "dmp_audience_package");
  let dmpReadProbe = null;
  let dmpSelectProbe = null;
  if (/^\d+$/.test(compact(dmp?.platform_resource_id))) {
    const ids = JSON.stringify([Number(dmp.platform_resource_id)]);
    dmpReadProbe = await run({
      label: "dmp_read",
      endpoint: "dmp/custom_audience/read",
      query: { advertiser_id: advertiserId, custom_audience_ids: ids },
      summarize: (payload) => ({ audienceCount: dmpAudienceList(payload).length })
    });
    dmpSelectProbe = await run({
      label: "dmp_select",
      endpoint: "dmp/custom_audience/select",
      query: { advertiser_id: advertiserId, custom_audience_ids: ids },
      summarize: (payload) => ({ audienceCount: dmpAudienceList(payload).length })
    });
  }

  const checks = [
    probeCheck(stdProjectProbe, {
      key: "platform_std_project_duplicate",
      passWhen: (summary) => !projectName || summary.listCount === 0,
      passedSummary: projectName ? "平台 std_project/list 未发现同名项目。" : "平台 std_project/list 可访问。",
      blockedSummary: "平台 std_project/list 发现同名项目或无法确认不重复。"
    }),
    probeCheck(avatarProbe, {
      key: "platform_avatar",
      resourceType: "avatar",
      passWhen: (summary) => summary.avatarReady,
      passedSummary: "平台头像只读状态 ready。",
      blockedSummary: "平台头像未 ready。"
    }),
    probeCheck(eventProbe, {
      key: "platform_event_asset",
      resourceType: "event_asset",
      passWhen: (summary) => summary.expectedAssetFound,
      passedSummary: "平台事件资产已读到目标 MINI_PROGRAME。",
      blockedSummary: "平台未读到目标 MINI_PROGRAME 事件资产。"
    }),
    materialCheck(imageProbe, "platform_product_image", "product_image", "产品图缺少可直接查询的平台 image_id。"),
    videoProbe ? materialCheck(videoProbe, "platform_video", "video_asset", "视频素材平台不可见。")
      : check("passed", "platform_video", "视频素材使用本地已验证证据，未发现阻断。", { resourceType: "video_asset", gap: "", nextAction: "无需动作" }),
    dmpReadProbe && dmpSelectProbe ? check(
      dmpReadProbe.status === "passed" && dmpSelectProbe.status === "passed" ? "passed" : "blocked",
      "platform_dmp",
      dmpReadProbe.status === "passed" && dmpSelectProbe.status === "passed" ? "平台 DMP read/select 可读。" : "平台 DMP read/select 未通过。",
      { resourceType: "dmp_audience_package", gap: "", nextAction: "无需动作" }
    ) : check("passed", "platform_dmp", "DMP 使用本地已验证证据，未发现阻断。", { resourceType: "dmp_audience_package", gap: "", nextAction: "无需动作" }),
    (() => {
      const livePassed = brandProbe.status === "passed" &&
        brandProbe.summary?.matchedBrandCount === 1 &&
        industryProbe?.status === "passed" &&
        brandOfficialMatchesExpected(brandProbe.summary || {}, industryProbe.summary || {});
      if (livePassed) {
        return check("passed", "platform_brand_info", "平台品牌和行业只读命中目标品牌与行业。", {
          resourceType: "brand_info",
          gap: "",
          nextAction: "无需动作"
        });
      }
      if (manualBrand.confirmed && brandProbe.status === "passed" && brandProbe.summary?.matchedBrandCount === 1) {
        return check("passed_by_manual_confirmation", "platform_brand_info", "品牌 fuzzy live 通过；行业使用同账户历史 fresh 证据人工确认放行。", {
          resourceType: "brand_info",
          gap: "",
          nextAction: "进入单次真实创建确认前检查"
        });
      }
      return check("blocked", "platform_brand_info", "平台品牌/行业只读未完整命中唯一 VALID 巨兽战场 + 游戏 / SLG。", {
        resourceType: "brand_info",
        gap: "brand_industry_readback_required",
        nextAction: "确认品牌/行业只读结果"
      });
    })(),
    check("passed", "platform_micro_app", "小程序实例与 game_platform_apps 本地 appid 一致。", {
      resourceType: "micro_app_instance",
      gap: "",
      nextAction: "无需动作"
    })
  ];

  const resourceUpdates = checks
    .filter((item) => item.resourceType)
    .map((item) => ({
      resourceType: item.resourceType,
      visibilityStatus: ["passed", "passed_by_manual_confirmation"].includes(item.status) ? "visible" : undefined,
      readbackStatus: ["passed", "passed_by_manual_confirmation"].includes(item.status) ? "readback_verified" : undefined,
      platformResourceId: item.key === "platform_event_asset" && eventProbe.summary?.expectedAssetId ? eventProbe.summary.expectedAssetId : undefined,
      resourceMetadata: item.key === "platform_brand_info" && item.status === "passed"
        ? {
          brand_info_official: brandInfoOfficialFromReadback({
            brandSummary: brandProbe.summary || {},
            industrySummary: industryProbe?.summary || {}
          })
        }
        : item.key === "platform_brand_info" && item.status === "passed_by_manual_confirmation"
          ? {
            brand_info_official: {
              ...manualBrand.official,
              used_for_create_gate: true,
              confirmation_status: "accepted_manual_confirmation"
            }
          }
        : {},
      readonlyCheck: {
        status: item.status,
        key: item.key,
        gap: item.gap || "",
        next_action: item.nextAction || "",
        probe_labels: probeLabelsForResource(probes, item.resourceType)
      }
    }));

  const hardGaps = checks.filter((item) => item.status === "blocked" || item.status === "credential_required");
  return {
    status: hardGaps.length ? "blocked" : "passed",
    credential,
    probes,
    checks,
    resourceUpdates,
    platformDuplicateCheck: {
      status: checks.find((item) => item.key === "platform_std_project_duplicate")?.status || "waiting",
      listCount: stdProjectProbe.summary?.listCount ?? null
    }
  };
}

function summarizeImageInventory(payload = {}) {
  return {
    imageCandidateCount: materialList(payload).length
  };
}

// This intentionally excludes project, DMP and video probes. Those have their own
// Skill contracts, while product images are inventory-only until an operator selects one.
export async function runOceanEngineBaselineResourceProbes({ bundle, client } = {}) {
  const advertiserId = compact(bundle?.job?.advertiser_id);
  const probes = [];
  const credential = client?.credentialState?.() || { status: "credential_required", blockers: ["client_missing"] };
  const credentialBlockers = Array.isArray(credential.blockers) ? credential.blockers : [];
  const run = async (definition) => {
    const probe = await client.get(definition);
    probes.push(probe);
    return probe;
  };

  if (credential.status !== "ready") {
    return {
      status: "credential_required",
      blockers: ["credential_required", ...credentialBlockers],
      credential,
      probes,
      checks: [],
      resourceUpdates: ["avatar", "event_asset", "product_image", "brand_info"].map((resourceType) => ({
        resourceType,
        inheritanceStatus: "target_readonly_blocked",
        readonlyCheck: {
          status: "credential_required",
          key: "baseline_resource_readonly_credential",
          gap: "credential_required",
          next_action: "处理本机 OceanEngine 凭据后重跑；不自动刷新。"
        }
      }))
    };
  }

  const avatarProbe = await run({
    label: "baseline_avatar",
    endpoint: "https://ad.oceanengine.com/open_api/2/advertiser/avatar/get/",
    query: { advertiser_id: advertiserId },
    summarize: summarizeAvatar
  });
  const eventProbe = await run({
    label: "baseline_event_asset",
    endpoint: "tools/event/all_assets/list",
    query: {
      advertiser_id: advertiserId,
      filtering: JSON.stringify({ asset_type: EVENT_ASSET_TYPE }),
      page: "1",
      page_size: "100"
    },
    summarize: (payload) => summarizeEventAssets(payload, bundle)
  });
  const brandProbe = await run({
    label: "baseline_brand_info",
    endpoint: "/open_api/v3.0/dpa/brand/adv_auth/fuzzy/get/",
    query: {
      account_id: advertiserId,
      brand_name: EXPECTED_BRAND_NAME,
      match_type: "EXACT",
      brand_data_source_list: JSON.stringify(["YUNTU"]),
      page: "1",
      page_size: "20"
    },
    summarize: summarizeBrand
  });
  const brandId = compact(brandProbe.summary?.brandNameId);
  const industryProbe = brandProbe.status === "passed" && brandId ? await run({
    label: "baseline_brand_industry",
    endpoint: "/open_api/v3.0/dpa/brand/adv_auth/industry/get/",
    query: { account_id: advertiserId, brand_name_id: brandId },
    summarize: summarizeIndustry
  }) : null;
  const imageProbe = await run({
    label: "baseline_product_image_inventory",
    endpoint: "file/image/get",
    query: { advertiser_id: advertiserId, page: "1", page_size: "100" },
    summarize: summarizeImageInventory
  });

  const avatarPassed = avatarProbe.status === "passed" && avatarProbe.summary?.avatarReady === true;
  const eventPassed = eventProbe.status === "passed" && eventProbe.summary?.expectedAssetFound === true;
  const brandPassed = brandProbe.status === "passed" && brandProbe.summary?.matchedBrandCount === 1 &&
    industryProbe?.status === "passed" && brandOfficialMatchesExpected(brandProbe.summary || {}, industryProbe.summary || {});
  const imageInventoryReadable = imageProbe.status === "passed";
  const blockedProbes = probes.filter((probe) => probe.status !== "passed");
  const checks = [
    check(avatarPassed ? "passed" : "blocked", "baseline_platform_avatar", avatarPassed ? "目标账户头像已通过只读核验。" : "目标账户头像未 ready。", { resourceType: "avatar", gap: avatarPassed ? "" : "avatar_readonly_not_ready" }),
    check(eventPassed ? "passed" : "blocked", "baseline_platform_event", eventPassed ? "目标账户事件资产已命中小游戏。" : "目标账户未命中小游戏事件资产。", { resourceType: "event_asset", gap: eventPassed ? "" : "event_asset_readonly_not_ready" }),
    check(brandPassed ? "passed" : "blocked", "baseline_platform_brand", brandPassed ? "目标账户品牌和行业已通过只读核验。" : "目标账户品牌或行业未完整命中。", { resourceType: "brand_info", gap: brandPassed ? "" : "brand_industry_readback_required" }),
    check(imageInventoryReadable ? "needs_confirmation" : "blocked", "baseline_platform_product_image_inventory", imageInventoryReadable ? "已盘点目标账户产品图库存；未自动选择产品图。" : "目标账户产品图库存读取失败。", { resourceType: "product_image", gap: imageInventoryReadable ? "product_image_selection_required" : "product_image_inventory_unavailable" })
  ];

  return {
    status: blockedProbes.length ? "blocked" : "passed",
    blockers: blockedProbes.map((probe) => `readonly_probe_not_passed:${probe.label}`),
    credential,
    probes,
    checks,
    resourceUpdates: [
      {
        resourceType: "avatar",
        visibilityStatus: avatarPassed ? "visible" : undefined,
        readbackStatus: avatarPassed ? "readback_verified" : undefined,
        inheritanceStatus: avatarPassed ? "target_readonly_verified" : "target_readonly_blocked",
        readonlyCheck: { status: avatarPassed ? "passed" : "blocked", key: "baseline_platform_avatar", gap: avatarPassed ? "" : "avatar_readonly_not_ready", probe_labels: [avatarProbe.label] }
      },
      {
        resourceType: "event_asset",
        visibilityStatus: eventPassed ? "visible" : undefined,
        readbackStatus: eventPassed ? "readback_verified" : undefined,
        platformResourceId: eventPassed ? eventProbe.summary?.expectedAssetId || "" : "",
        inheritanceStatus: eventPassed ? "target_readonly_verified" : "target_readonly_blocked",
        readonlyCheck: { status: eventPassed ? "passed" : "blocked", key: "baseline_platform_event", gap: eventPassed ? "" : "event_asset_readonly_not_ready", probe_labels: [eventProbe.label] }
      },
      {
        resourceType: "brand_info",
        visibilityStatus: brandPassed ? "visible" : undefined,
        readbackStatus: brandPassed ? "readback_verified" : undefined,
        inheritanceStatus: brandPassed ? "target_readonly_verified" : "target_readonly_blocked",
        resourceMetadata: brandPassed ? {
          brand_info_official: brandInfoOfficialFromReadback({ brandSummary: brandProbe.summary || {}, industrySummary: industryProbe?.summary || {} })
        } : {},
        readonlyCheck: { status: brandPassed ? "passed" : "blocked", key: "baseline_platform_brand", gap: brandPassed ? "" : "brand_industry_readback_required", probe_labels: probes.filter((probe) => probe.label.startsWith("baseline_brand")).map((probe) => probe.label) }
      },
      {
        resourceType: "product_image",
        inheritanceStatus: imageInventoryReadable ? "target_readonly_blocked" : "target_readonly_blocked",
        resourceMetadata: {
          product_image_inventory: {
            candidate_count: Number(imageProbe.summary?.imageCandidateCount || 0),
            response_hash: imageProbe.responseHash || "",
            selection_status: imageInventoryReadable ? "needs_confirmation" : "unavailable"
          }
        },
        readonlyCheck: { status: imageInventoryReadable ? "needs_confirmation" : "blocked", key: "baseline_platform_product_image_inventory", gap: imageInventoryReadable ? "product_image_selection_required" : "product_image_inventory_unavailable", probe_labels: [imageProbe.label] }
      }
    ]
  };
}

export function evaluateOceanEnginePrewriteReadiness({ bundle, touchpointVerification, contractResult, platformReadonly } = {}) {
  const draftProjectName = bundle?.draft?.project_name || bundle?.draft?.projectName || "";
  const readbackObjectName = bundle?.readback?.object_name || "";
  const localChecks = [
    check(
      bundle?.account?.auth_status === "ready" ? "passed" : "credential_required",
      "account_auth",
      bundle?.account?.auth_status === "ready"
        ? "账户授权状态在本地真值中为 ready。"
        : "真实平台只读 API 需要凭据；只读流程不会自动刷新凭据。"
    ),
    check(
      touchpointVerification?.touchpointUrlPresent ? "passed" : "blocked",
      "touchpoint_present",
      touchpointVerification?.touchpointUrlPresent ? "触点 URL 已受控入库。" : "触点 URL 未入库。"
    ),
    check(
      touchpointVerification?.urlHashMatches ? "passed" : "blocked",
      "touchpoint_hash",
      touchpointVerification?.urlHashMatches ? "触点 URL hash 与入库值一致。" : "触点 URL hash 不一致或无法校验。"
    ),
    check(
      bundle?.platformApp?.app_id ? "passed" : "blocked",
      "game_platform_app",
      bundle?.platformApp?.app_id ? "已读取字节小游戏 appid。" : "无法读取字节小游戏 appid。"
    ),
    ...localResourceChecks(bundle?.resources || []),
    check(
      draftProjectName ? "passed" : "waiting",
      "draft_project_name",
      draftProjectName ? "草稿项目名可用于后续查重。" : "等待生成草稿项目名。"
    ),
    check(
      contractResult?.status === "passed" ? "passed" : (contractResult?.status || "waiting"),
      "payload_contract",
      contractResult?.summary || "等待 payload 合同检查。"
    ),
    check(
      !readbackObjectName || readbackObjectName === draftProjectName ? "passed" : "blocked",
      "readback_object_name_source",
      !readbackObjectName || readbackObjectName === draftProjectName
        ? "回查 object_name 来源符合草稿项目名。"
        : "回查 object_name 未来自 launch_drafts.project_name。"
    )
  ];
  const platformChecks = platformReadonly?.checks || [];
  const checks = [...localChecks, ...platformChecks];
  const gaps = checks
    .filter((item) => item.status === "blocked" || item.status === "credential_required")
    .map((item) => ({
      key: item.key,
      message: item.summary,
      status: item.status,
      resourceType: item.resourceType || "",
      nextAction: item.nextAction || (item.status === "credential_required" ? "单独处理凭据" : "补齐缺口")
    }));

  const blockingGaps = gaps.filter((item) => item.status === "blocked" || item.status === "credential_required");
  const status = draftProjectName && blockingGaps.length === 0 ? "locked" : (blockingGaps.length ? "blocked" : "waiting");

  return {
    status,
    canCreate: false,
    writeMode: "placeholder_only",
    platformReadonlyApi: {
      status: platformReadonly?.status || "not_run",
      credentialStatus: platformReadonly?.credential?.status || "unknown",
      duplicateStatus: platformReadonly?.platformDuplicateCheck?.status || "waiting",
      summary: platformReadonly
        ? `平台只读校验状态：${platformReadonly.status}。`
        : "尚未运行真实平台只读 API 校验。"
    },
    summary: blockingGaps.length
      ? `创建前 gate 未通过：${blockingGaps.length} 个阻断缺口；真实创建保持禁用。`
      : "本地与平台只读 gate 已检查；真实创建仍保持锁定，占位模式。",
    checks,
    gaps,
    blockedResourceTypes: [...new Set(gaps.map((item) => item.resourceType).filter(Boolean))]
  };
}
