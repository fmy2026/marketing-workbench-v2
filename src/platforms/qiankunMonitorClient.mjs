import { createHash } from "node:crypto";
import {
  getQiankunCredentialSummary,
  pendingQiankunCredentialForBootstrap,
  readQiankunCredentialStore
} from "./qiankunCredentialStore.mjs";

const ALLOWED_ENDPOINTS = new Set([
  "/tf/account_info/accountIndex",
  "/tf/ad/index",
  "/tf/ad/monitorSerialNumberAdd"
]);

const WRITE_ENDPOINTS = new Set([
  "/tf/ad/monitorSerialNumberAdd"
]);

function clean(value) {
  return String(value ?? "").trim();
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function endpointUrl(baseUrl, endpoint) {
  const base = clean(baseUrl).replace(/\/+$/g, "");
  const path = clean(endpoint).startsWith("/") ? clean(endpoint) : `/${clean(endpoint)}`;
  return `${base}${path}`;
}

function endpointSet(endpoints = []) {
  return new Set((Array.isArray(endpoints) ? endpoints : [endpoints]).map(clean).filter(Boolean));
}

function appendFormValue(form, key, value) {
  if (value === undefined || value === null || value === "") return;
  if (Array.isArray(value)) {
    for (const item of value) appendFormValue(form, `${key}[]`, item);
    return;
  }
  if (typeof value === "object") {
    form.append(key, JSON.stringify(value));
    return;
  }
  form.append(key, String(value));
}

function formBody(params = {}) {
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) appendFormValue(form, key, value);
  return form;
}

function responseCode(payload = {}) {
  return clean(payload.code ?? payload.err_no ?? payload.error_code ?? "");
}

function responseMessage(payload = {}) {
  return clean(payload.msg ?? payload.message ?? payload.err_msg ?? "");
}

function dataPresent(payload = {}) {
  return Boolean(payload && typeof payload === "object" && payload.data !== undefined && payload.data !== null);
}

function compactAccountList(payload = {}) {
  const list = Array.isArray(payload.data?.list) ? payload.data.list : [];
  return list.map((item) => ({
    id: clean(item.id),
    accountId: clean(item.account_id),
    mediaAccountRecordId: clean(item._media_account_id || item.id),
    mediaMasterId: clean(item.media_master_id),
    agentId: clean(item._agent_id || item.agent_id),
    agentName: clean(item.agent_id_name || item.agent_id),
    ssoOwner: clean(item.sso_owner),
    ssoOwnerKey: clean(item._sso_owner || item.sso_owner),
    ssoOwnerName: clean(item.sso_owner_name || item.sso_owner),
    advertiserName: clean(item.advertiser_name),
    advertiserNamePresent: Boolean(clean(item.advertiser_name)),
    status: clean(item.status),
    authStatusName: clean(item.account_auth_status_name),
    accessTokenPresent: Boolean(clean(item.access_token))
  }));
}

function touchpointUrlCandidate(item = {}) {
  const candidates = [
    item.touchpoint_url,
    item.monitor_url,
    item.track_url,
    item.tracking_url,
    item.click_url,
    item.wxgame_click_url,
    item.active_click_url,
    item.url
  ].map(clean).filter(Boolean);
  const first = candidates.find((value) => /^https:\/\//i.test(value)) || "";
  return first ? { present: true, hash: `sha256:${sha256(first)}`, value: first } : { present: false, hash: "", value: "" };
}

function compactMonitorList(payload = {}, { includeControlledTouchpointUrl = false } = {}) {
  const list = Array.isArray(payload.data?.list) ? payload.data.list : [];
  return list.map((item) => {
    const touchpoint = touchpointUrlCandidate(item);
    const summary = {
      id: clean(item.id),
      monitorId: clean(item.monitor_id),
      gameId: clean(item.game_id),
      packageId: clean(item.package_id),
      cateId: clean(item._cate_id || item.cate_id),
      cateName: clean(item.cate_id),
      mediaAccountId: clean(item.media_account_id),
      mediaAccountRecordId: clean(item._media_account_id),
      mediaAccountIdPresent: Boolean(clean(item.media_account_id)),
      os: clean(item._os_name || item.os),
      osName: clean(item.os_name),
      mediaId: clean(item._media_id || item.media_id),
      mediaName: clean(item.media_id),
      mediaIdPresent: Boolean(clean(item.media_id)),
      agentId: clean(item._agent_id || item.agent_id),
      agentName: clean(item.agent_id),
      agentIdPresent: Boolean(clean(item.agent_id)),
      monitorApi: clean(item._monitor_api || item.monitor_api),
      monitorApiName: clean(item.monitor_api),
      monitorApiPresent: Boolean(clean(item.monitor_api)),
      ssoOwner: clean(item.sso_owner),
      ssoOwnerKey: clean(item._sso_owner),
      ssoOwnerPresent: Boolean(clean(item.sso_owner)),
      vestId: clean(item._vest_id || item.vest_id),
      vestName: clean(item.vest_id),
      channel: clean(item.channel),
      departmentName: clean(item.department_name),
      remarkPresent: Boolean(clean(item.remark)),
      addtime: clean(item.addtime),
      touchpointUrlPresent: touchpoint.present,
      touchpointUrlHash: touchpoint.hash
    };
    if (includeControlledTouchpointUrl) summary.controlledTouchpointUrl = touchpoint.value;
    return summary;
  });
}

function endpointSummary(endpoint, payload = {}, options = {}) {
  if (endpoint === "/tf/account_info/accountIndex") {
    return {
      resultTotal: Number(payload.data?.resultTotal || 0),
      list: compactAccountList(payload)
    };
  }
  if (endpoint === "/tf/ad/index") {
    return {
      resultTotal: Number(payload.data?.resultTotal || 0),
      list: compactMonitorList(payload, options),
      columnNames: Array.isArray(payload.data?.columns) ? payload.data.columns.map((item) => clean(item.name)).filter(Boolean) : []
    };
  }
  return {
    dataPresent: dataPresent(payload)
  };
}

export class QiankunMonitorClient {
  constructor({
    envPath = process.env.QIANKUN_MONITOR_ENV_PATH,
    storePath,
    fetchImpl = globalThis.fetch,
    allowPendingOwnerKeyBootstrap = false,
    pendingOwnerKeyBootstrapEndpoints = ["/tf/account_info/accountIndex"]
  } = {}) {
    this.envPath = envPath;
    this.storePath = storePath;
    this.fetchImpl = fetchImpl;
    this.allowPendingOwnerKeyBootstrap = allowPendingOwnerKeyBootstrap;
    this.pendingOwnerKeyBootstrapEndpoints = endpointSet(pendingOwnerKeyBootstrapEndpoints);
  }

  credentialState(ownerKey = "", { endpoint = "" } = {}) {
    const summary = getQiankunCredentialSummary({ ownerKey, envPath: this.envPath, storePath: this.storePath });
    if (
      !clean(ownerKey)
      && this.allowPendingOwnerKeyBootstrap
      && this.pendingOwnerKeyBootstrapEndpoints.has(clean(endpoint))
    ) {
      const pending = pendingQiankunCredentialForBootstrap({ envPath: this.envPath, storePath: this.storePath });
      if (pending.status === "active") {
        return {
          status: "ready",
          ownerKey: "",
          ownerName: pending.ownerName,
          pendingOwnerKeyBootstrap: true,
          envFilePresent: summary.envFilePresent,
          credentialStorePresent: summary.credentialStorePresent,
          apiBaseUrl: summary.apiBaseUrl,
          credentialStorePathPresent: summary.credentialStorePathPresent,
          activeCredentialCount: summary.activeCredentialCount,
          credentialCount: summary.credentialCount,
          blockers: pending.blockers
        };
      }
    }
    return {
      status: summary.status === "active" ? "ready" : "credential_required",
      ownerKey: summary.matchedOwnerKey,
      ownerName: summary.matchedOwnerName,
      pendingOwnerKeyBootstrap: false,
      envFilePresent: summary.envFilePresent,
      credentialStorePresent: summary.credentialStorePresent,
      apiBaseUrl: summary.apiBaseUrl,
      credentialStorePathPresent: summary.credentialStorePathPresent,
      activeCredentialCount: summary.activeCredentialCount,
      credentialCount: summary.credentialCount,
      blockers: summary.blockers
    };
  }

  passportTokenForOwner(ownerKey) {
    if (!clean(ownerKey) && this.allowPendingOwnerKeyBootstrap) {
      const pending = pendingQiankunCredentialForBootstrap({ envPath: this.envPath, storePath: this.storePath });
      if (pending.status === "active") return pending.passportToken;
    }
    const store = readQiankunCredentialStore({ envPath: this.envPath, storePath: this.storePath });
    const owner = clean(ownerKey);
    const item = (store.credentials || []).find((credential) => clean(credential.owner_key) === owner);
    return clean(item?.passport_token);
  }

  async postForm({ endpoint, ownerKey, params = {}, allowWrite = false, label = "", includeControlledTouchpointUrl = false }) {
    const cleanEndpoint = clean(endpoint);
    if (!ALLOWED_ENDPOINTS.has(cleanEndpoint)) throw new Error(`qiankun_endpoint_not_allowed:${cleanEndpoint}`);
    if (WRITE_ENDPOINTS.has(cleanEndpoint) && allowWrite !== true) {
      throw new Error(`qiankun_write_endpoint_requires_explicit_confirmation:${cleanEndpoint}`);
    }
    if (WRITE_ENDPOINTS.has(cleanEndpoint) && !clean(ownerKey)) {
      throw new Error(`qiankun_write_requires_confirmed_owner_key:${cleanEndpoint}`);
    }
    const credential = this.credentialState(ownerKey, { endpoint: cleanEndpoint });
    if (credential.status !== "ready") {
      return {
        label,
        endpoint: cleanEndpoint,
        status: "credential_required",
        credential,
        httpStatus: null,
        apiCode: "",
        dataPresent: false,
        responseHash: "",
        summary: {},
        rawResponseStored: false,
        gap: `乾坤技术 API 凭据不可用或 owner 不匹配：${credential.blockers.join(",") || "unknown"}。`
      };
    }

    const url = endpointUrl(credential.apiBaseUrl, cleanEndpoint);
    const response = await this.fetchImpl(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Passport-Token": this.passportTokenForOwner(ownerKey)
      },
      body: formBody(params)
    });
    const text = await response.text();
    let payload = {};
    try {
      payload = JSON.parse(text);
    } catch {
      payload = {};
    }
    const code = responseCode(payload);
    const message = responseMessage(payload);
    return {
      label,
      endpoint: cleanEndpoint,
      status: response.ok && code === "0" ? "passed" : "blocked",
      credential: {
        status: credential.status,
        ownerKey: credential.ownerKey,
        ownerName: credential.ownerName,
        pendingOwnerKeyBootstrap: credential.pendingOwnerKeyBootstrap,
        envFilePresent: credential.envFilePresent,
        credentialStorePresent: credential.credentialStorePresent,
        credentialStorePathPresent: credential.credentialStorePathPresent
      },
      httpStatus: response.status,
      apiCode: code,
      apiMessage: message,
      dataPresent: dataPresent(payload),
      responseHash: `sha256:${sha256(text)}`,
      summary: endpointSummary(cleanEndpoint, payload, { includeControlledTouchpointUrl }),
      rawResponseStored: false,
      gap: response.ok && code === "0" ? "" : "乾坤技术 API 返回非通过状态。"
    };
  }

  queryAccountIndex({ ownerKey, accountId, pageNo = 1, pageSize = 10 }) {
    return this.postForm({
      label: "qiankun_account_index",
      endpoint: "/tf/account_info/accountIndex",
      ownerKey,
      params: { accountId, pageNo, pageSize }
    });
  }

  queryMonitorIndex({ ownerKey, params = {}, includeControlledTouchpointUrl = false }) {
    return this.postForm({
      label: "qiankun_monitor_index",
      endpoint: "/tf/ad/index",
      ownerKey,
      params: { pageNo: 1, pageSize: 50, ...params },
      includeControlledTouchpointUrl
    });
  }

  createMonitorSerialNumber({ ownerKey, params = {} }) {
    return this.postForm({
      label: "qiankun_monitor_serial_create",
      endpoint: "/tf/ad/monitorSerialNumberAdd",
      ownerKey,
      params,
      allowWrite: true
    });
  }
}

export function createQiankunMonitorClient(options = {}) {
  return new QiankunMonitorClient(options);
}
