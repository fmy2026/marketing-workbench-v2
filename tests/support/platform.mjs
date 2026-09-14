// Explicit synthetic transport. Unconfigured endpoints fail immediately.
export function createStdProjectTransport({
  projectId,
  listProjectId = projectId,
  createApiCode = "0",
  createObjectIdPresent = true,
  createResponses = [],
  listMatch = true,
  createMessage = "",
  createTransportThrows = false,
  createTimeoutThrows = false,
  numericProjectIdTokens = false
}) {
  const calls = [];
  let createdProjectName = "";
  async function fakeFetch(url, options = {}) {
    const href = String(url);
    const bodyText = String(options.body || "");
    calls.push({
      href,
      method: options.method || "GET",
      ...(href.includes("/std_project/create/") ? {
        instanceIdJsonNumberTokenPresent: /"instance_id":7434750138926546994/.test(bodyText),
        instanceIdQuotedStringPresent: /"instance_id":"7434750138926546994"/.test(bodyText),
        instanceIdScientificNotationPresent: /7\.434750138926547e\+18/i.test(bodyText)
      } : {})
    });
    if (href.includes("/std_project/create/")) {
      try {
        const createPayload = JSON.parse(bodyText);
        createdProjectName = createPayload.name || createdProjectName;
      } catch {
        // The actual create contract owns parsing; the test transport only
        // needs its already-sent draft name for a subsequent ID readback.
      }
      if (createTransportThrows) throw new Error("synthetic_create_transport_error");
      if (createTimeoutThrows) {
        const error = new Error("synthetic_create_timeout");
        error.name = "PlatformDeadlineError";
        error.code = "ETIMEDOUT";
        error.platformDeadlineExceeded = true;
        throw error;
      }
      const responseIndex = calls.filter((call) => call.href.includes("/std_project/create/")).length - 1;
      const configured = createResponses[responseIndex] || createResponses.at(-1) || {};
      const effectiveCode = configured.apiCode ?? createApiCode;
      const effectiveProjectId = configured.projectId ?? projectId;
      const effectiveObjectIdPresent = configured.objectIdPresent ?? createObjectIdPresent;
      const effectiveMessage = configured.message ?? createMessage;
      if (typeof configured.rawBody === "string") {
        return new Response(configured.rawBody, { status: 200, headers: { "content-type": "application/json" } });
      }
      if (numericProjectIdTokens && createObjectIdPresent) {
        return new Response(`{"code":${JSON.stringify(effectiveCode)},"request_id":"fake-request-create","data":{"project_id":${String(effectiveProjectId)}}}`,
          { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({
        code: effectiveCode,
        request_id: "fake-request-create",
        ...(effectiveMessage ? { message: effectiveMessage } : {}),
        data: effectiveObjectIdPresent ? { project_id: effectiveProjectId } : {}
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (href.includes("/std_project/list/")) {
      const filtering = new URL(href).searchParams.get("filtering") || "{}";
      let name = "";
      try {
        const parsedFiltering = JSON.parse(filtering);
        name = parsedFiltering.name || (Array.isArray(parsedFiltering.project_ids) ? createdProjectName : "");
      } catch {
        name = "";
      }
      if (numericProjectIdTokens && listMatch) {
        return new Response(`{"code":"0","request_id":"fake-request-list","data":{"list":[{"project_id":${String(listProjectId)},"name":${JSON.stringify(name)},"status":"ENABLE"}]}}`,
          { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({
        code: "0",
        request_id: "fake-request-list",
        data: {
          list: listMatch ? [
            { project_id: listProjectId, name, status: "ENABLE" }
          ] : []
        }
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error(`unexpected_fake_fetch_url:${href}`);
  }
  fakeFetch.calls = calls;
  return fakeFetch;
}

// Explicit, credential-gated read-only transport for workflow fixtures. It
// deliberately has no POST handlers: tests that need a write must provide a
// separate write transport and assert that call themselves.
export function createSyntheticOe3ReadonlyTransport() {
  const calls = [];
  async function fakeFetch(url, options = {}) {
    const href = String(url);
    const method = String(options.method || "GET").toUpperCase();
    calls.push({ href, method });
    if (method !== "GET") throw new Error(`unexpected_synthetic_write:${method}:${href}`);
    const body = { code: "0", request_id: "synthetic-readonly-request", data: {} };
    if (href.includes("file/video/get")) body.data = {
      list: Array.from({ length: 100 }, (_, index) => ({
        video_id: String(900000000000 + index), material_id: String(900000000000 + index), width: 1080, height: 1920
      })), page_info: { total_page: 1 }
    };
    if (href.includes("file/image/get")) body.data = { list: [{ image_id: "900000000100", material_id: "900000000100", width: 1080, height: 1920 }] };
    if (href.includes("advertiser/avatar/get")) body.data = { advertiser_id: "9000000000000001", avatar_status: "3", avatar_info: { width: 108, height: 108 } };
    if (href.includes("aweme_auth_list")) body.data = { list: [{ aweme_id: "57018827026", status: "AUTHRIZED", auth_status: "AUTHRIZED" }] };
    if (href.includes("brand/adv_auth/fuzzy/get")) body.data = { brand_list: [{ merge_brand_name: "巨兽战场", merge_brand_id: "4016408", available_status: "VALID", yuntu_brand_detail: { outer_brand_id: "11467384" } }] };
    if (href.includes("brand/adv_auth/industry/get")) body.data = { industry_info: { industry_id: "2202", industry_name: "游戏", children: [{ industry_id: "2203", industry_name: "SLG" }] } };
    if (href.includes("available_events/get") || href.includes("event_configs/get")) body.data = {
      list: ["active", "active_register", "active_pay", "purchase_roi", "purchase_roi_7d", "purchase_roi_30d"]
        .map((event_type, index) => ({ event_id: String(900000000600 + index), event_type, track_types: ["MINI_PROGRAME_API"] }))
    };
    if (href.includes("optimized_goal/get")) body.data = {
      list: [{ external_action: "AD_CONVERT_TYPE_PAY", deep_external_action: "AD_CONVERT_TYPE_PURCHASE_ROI_7D", asset_id: "900000000555" }]
    };
    if (href.includes("event_manager/dbt/get")) body.data = { list: [{ deep_bid_type: "PER_AND_SEVEN_PAY_ROI" }] };
    if (href.includes("gameplay/list")) body.data = { list: [{ gameplay_id: "900000000777", status: "ENABLE", guide_video_id: "900000000001" }] };
    if (href.includes("tools/site/get") || href.includes("tools/orange_site/get")) {
      const query = new URL(href).searchParams;
      const site = {
        site_id: "7624750304608649243",
        site_name: "Synthetic backup landing page",
        site_url: "https://fixture.invalid/e3b588eedffd0c6d",
        status: "ENABLE",
        ...(query.get("share_type") === "SHARE" ? { share_type: "SHARE" } : {})
      };
      body.data = { list: [site], total: 1, page_info: { total: 1 } };
    }
    if (href.includes("dmp/custom_audience")) body.data = {
      list: ["472360629", "477464681", "476398053", "482709313", "477503385", "477250343", "465498363", "479197805", "470051114", "467421696"].map((custom_audience_id) => ({
        custom_audience_id,
        delivery_status: "CUSTOM_AUDIENCE_DELIVERY_STATUS_AVAILABLE",
        status: "1", isdel: "0", exist_pull_off_tag: "0"
      })), total_num: 10
    };
    if (href.includes("all_assets/list") || href.includes("all_assets/detail")) body.data = {
      asset_list: [{ asset_id: "900000000555", asset_type: "MINI_PROGRAME", micro_app_id: "tte95a9fe77665844607", micro_app_instance_id: "7434750138926546994" }]
    };
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }
  fakeFetch.calls = calls;
  return fakeFetch;
}

// The test runner writes these opaque values only into a per-process temporary
// file.  They satisfy the credential *shape* needed to exercise the real
// readonly client, while the transport above remains the only network edge.
export async function writeSyntheticOceanEngineEnv(envPath) {
  const { writeFile } = await import("node:fs/promises");
  await writeFile(envPath, [
    "OCEANENGINE_APP_ID=test-app-id",
    "OCEANENGINE_APP_SECRET=test-app-secret",
    "OCEANENGINE_REDIRECT_URI=https://fixture.invalid/callback",
    "OCEANENGINE_ACCESS_TOKEN=test-access-token",
    "OCEANENGINE_REFRESH_TOKEN=test-refresh-token",
    "OCEANENGINE_TOKEN_STATUS=valid"
  ].join("\n") + "\n", { mode: 0o600 });
}
