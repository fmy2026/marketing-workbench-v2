import { createHash } from "node:crypto";
import {
  credentialReady,
  getOceanEngineCredentialSummary,
  readOceanEngineEnv
} from "./oceanengineCredentialStore.mjs";

const API_BASE = "https://api.oceanengine.com";

const ALLOWED_ENDPOINTS = new Set([
  "std_project/list",
  "/open_api/v3.0/std_project/list/",
  "tools/event/all_assets/list",
  "tools/event/all_assets/detail",
  "https://ad.oceanengine.com/open_api/2/event_manager/available_events/get/",
  "https://ad.oceanengine.com/open_api/2/event_manager/event_configs/get/",
  "/open_api/v3.0/event_manager/optimized_goal/get/",
  "/open_api/v3.0/event_manager/dbt/get/",
  "file/video/get",
  "file/image/get",
  "dmp/custom_audience/read",
  "dmp/custom_audience/select",
  "/open_api/v3.0/dpa/brand/adv_auth/fuzzy/get/",
  "/open_api/v3.0/dpa/brand/adv_auth/industry/get/",
  "https://ad.oceanengine.com/open_api/2/advertiser/avatar/get/"
]);

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function clean(value) {
  return String(value ?? "").trim();
}

function endpointUrl(endpoint) {
  const value = clean(endpoint);
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/open_api/")) return `${API_BASE}${value}`;
  return `${API_BASE}/open_api/2/${value}/`;
}

function endpointKey(endpoint) {
  const value = clean(endpoint);
  if (value.startsWith("https://ad.oceanengine.com/open_api/2/advertiser/avatar/get/")) return "advertiser/avatar/get";
  return value.replace(/^\/open_api\/v3\.0\//, "").replace(/\/$/g, "");
}

function apiCode(payload = {}) {
  return clean(payload.code ?? payload.err_no ?? payload.error_code ?? "");
}

function requestIdPresent(payload = {}) {
  return Boolean(payload.request_id || payload.data?.request_id);
}

function dataPresent(payload = {}) {
  return Boolean(payload && typeof payload === "object" && payload.data);
}

export class OceanEngineReadonlyClient {
  constructor({
    envPath = process.env.OCEANENGINE_ENV_PATH,
    fetchImpl = globalThis.fetch
  } = {}) {
    this.envPath = envPath;
    this.fetchImpl = fetchImpl;
    this.env = null;
  }

  loadEnv() {
    if (this.env) return this.env;
    this.env = readOceanEngineEnv({ envPath: this.envPath }).env;
    return this.env;
  }

  credentialState() {
    const summary = getOceanEngineCredentialSummary({ envPath: this.envPath });
    return {
      status: credentialReady(summary) ? "ready" : "credential_required",
      envFilePresent: summary.envFilePresent,
      appIdPresent: summary.appIdPresent,
      appSecretPresent: summary.appSecretPresent,
      redirectUriPresent: summary.redirectUriPresent,
      accessTokenPresent: summary.accessTokenPresent,
      refreshTokenPresent: summary.refreshTokenPresent,
      tokenStatus: summary.tokenStatus,
      tokenExpiresAtPresent: summary.tokenExpiresAtPresent,
      tokenRefreshAfterPresent: summary.tokenRefreshAfterPresent,
      tokenExpired: summary.tokenExpired,
      tokenRefreshAfterReached: summary.tokenRefreshAfterReached,
      blockers: summary.blockers
    };
  }

  async get({ label, endpoint, query = {}, summarize = null }) {
    if (!ALLOWED_ENDPOINTS.has(endpoint)) {
      throw new Error(`readonly_endpoint_not_allowed:${endpoint}`);
    }
    const credential = this.credentialState();
    const key = endpointKey(endpoint);
    if (credential.status !== "ready") {
      return {
        label,
        endpoint: key,
        status: "credential_required",
        credential,
        httpStatus: null,
        apiCode: "",
        requestIdPresent: false,
        dataPresent: false,
        responseHash: "",
        summary: {},
        gap: `平台只读凭据不可用或已过期：${credential.blockers.join(",") || "unknown"}。`
      };
    }

    const url = new URL(endpointUrl(endpoint));
    Object.entries(query).forEach(([name, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(name, typeof value === "string" ? value : JSON.stringify(value));
      }
    });

    try {
      const response = await this.fetchImpl(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "Access-Token": this.loadEnv().OCEANENGINE_ACCESS_TOKEN
        }
      });
      const text = await response.text();
      let payload = {};
      try {
        payload = JSON.parse(text);
      } catch {
        payload = {};
      }
      const code = apiCode(payload);
      const summary = typeof summarize === "function" ? summarize(payload) : {};
      return {
        label,
        endpoint: key,
        status: response.ok && (code === "0" || code === "") ? "passed" : "blocked",
        credential: {
          status: credential.status,
          envFilePresent: credential.envFilePresent,
          appIdPresent: credential.appIdPresent,
          appSecretPresent: credential.appSecretPresent,
          redirectUriPresent: credential.redirectUriPresent,
          accessTokenPresent: credential.accessTokenPresent,
          refreshTokenPresent: credential.refreshTokenPresent,
          tokenStatus: credential.tokenStatus,
          tokenExpiresAtPresent: credential.tokenExpiresAtPresent,
          tokenRefreshAfterPresent: credential.tokenRefreshAfterPresent,
          tokenExpired: credential.tokenExpired,
          tokenRefreshAfterReached: credential.tokenRefreshAfterReached
        },
        httpStatus: response.status,
        apiCode: code,
        requestIdPresent: requestIdPresent(payload),
        dataPresent: dataPresent(payload),
        responseHash: `sha256:${sha256(text)}`,
        summary,
        gap: response.ok && (code === "0" || code === "") ? "" : "平台只读 API 返回非通过状态。"
      };
    } catch (error) {
      return {
        label,
        endpoint: key,
        status: "transport_failed",
        credential: {
          status: credential.status,
          envFilePresent: credential.envFilePresent,
          appIdPresent: credential.appIdPresent,
          appSecretPresent: credential.appSecretPresent,
          redirectUriPresent: credential.redirectUriPresent,
          accessTokenPresent: credential.accessTokenPresent,
          refreshTokenPresent: credential.refreshTokenPresent,
          tokenStatus: credential.tokenStatus,
          tokenExpiresAtPresent: credential.tokenExpiresAtPresent,
          tokenRefreshAfterPresent: credential.tokenRefreshAfterPresent,
          tokenExpired: credential.tokenExpired,
          tokenRefreshAfterReached: credential.tokenRefreshAfterReached
        },
        httpStatus: null,
        apiCode: "",
        requestIdPresent: false,
        dataPresent: false,
        responseHash: "",
        summary: {},
        gap: `平台只读请求失败：${clean(error.code || error.name || "transport_error")}`
      };
    }
  }
}

export function createOceanEngineReadonlyClient(options = {}) {
  return new OceanEngineReadonlyClient(options);
}
