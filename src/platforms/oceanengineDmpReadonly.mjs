export const DMP_AVAILABLE_STATUS = "CUSTOM_AUDIENCE_DELIVERY_STATUS_AVAILABLE";
export const DMP_SELECT_PAGE_LIMIT = 100;
export const DMP_SELECT_MAX_PAGES = 4;
export const DMP_POST_PUSH_READBACK_DELAYS_MS = Object.freeze([0, 3000, 6000]);

function clean(value) {
  return String(value ?? "").trim();
}

function numberId(value) {
  const text = clean(value);
  return /^\d+$/.test(text) ? text : "";
}

function unique(values = []) {
  return [...new Set(values.map(clean).filter(Boolean))];
}

function audienceItemId(value = {}) {
  return numberId(value.custom_audience_id || value.id);
}

function collectAudienceItems(value, found = new Map()) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectAudienceItems(item, found));
    return found;
  }
  if (!value || typeof value !== "object") return found;
  const id = audienceItemId(value);
  if (id) {
    found.set(id, {
      customAudienceId: id,
      deliveryStatus: clean(value.delivery_status),
      status: clean(value.status),
      isDeleted: clean(value.isdel),
      pullOff: clean(value.exist_pull_off_tag),
      pushStatus: clean(value.push_status)
    });
  }
  Object.values(value).forEach((item) => collectAudienceItems(item, found));
  return found;
}

function totalNum(payload = {}) {
  const value = Number(payload?.data?.total_num ?? payload?.data?.totalNum ?? 0);
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function apiProbeDigest(probe = {}) {
  return {
    status: probe.status || "not_run",
    httpStatus: probe.httpStatus ?? null,
    apiCode: probe.apiCode || "",
    requestIdPresent: Boolean(probe.requestIdPresent),
    responseHash: probe.responseHash || ""
  };
}

function selectVerificationStatus({ visible, available }) {
  return visible.status === "passed" && available.status === "passed" ? "passed" : "degraded";
}

export function summarizeDmpAudiencePayload(payload = {}) {
  const items = [...collectAudienceItems(payload?.data || payload).values()];
  return {
    customAudienceIdCount: items.length,
    customAudienceIds: items.map((item) => item.customAudienceId),
    audienceItems: items,
    totalNum: totalNum(payload),
    dataPresent: Boolean(payload?.data)
  };
}

export function isDmpAudienceAvailable(item = {}) {
  const delivery = clean(item.deliveryStatus || item.delivery_status);
  const deleted = clean(item.isDeleted || item.isdel);
  const pullOff = clean(item.pullOff || item.exist_pull_off_tag);
  const status = clean(item.status);
  return delivery === DMP_AVAILABLE_STATUS && !["true", "1"].includes(deleted) &&
    !["true", "1"].includes(pullOff) && !["3", "CUSTOM_AUDIENCE_STATUS_DELETED"].includes(status);
}

export function dmpReadRequest({ advertiserId, customAudienceIds }) {
  const ids = unique(customAudienceIds).map((id) => Number(id));
  return {
    query: { advertiser_id: advertiserId, custom_audience_ids: ids },
    requestFieldManifest: {
      fieldNames: ["advertiser_id", "custom_audience_ids"],
      customAudienceIdsTransportType: "number_array"
    }
  };
}

export function dmpSelectRequest({ advertiserId, selectType, offset }) {
  return {
    query: {
      advertiser_id: advertiserId,
      select_type: String(selectType),
      offset: String(offset),
      limit: String(DMP_SELECT_PAGE_LIMIT)
    },
    requestFieldManifest: {
      fieldNames: ["advertiser_id", "select_type", "offset", "limit"],
      selectType: String(selectType),
      pageLimit: DMP_SELECT_PAGE_LIMIT,
      maximumPages: DMP_SELECT_MAX_PAGES
    }
  };
}

async function selectAudiencePages({ client, advertiserId, selectType, label }) {
  const items = new Map();
  const probes = [];
  let total = 0;
  for (let page = 0; page < DMP_SELECT_MAX_PAGES; page += 1) {
    const request = dmpSelectRequest({ advertiserId, selectType, offset: page * DMP_SELECT_PAGE_LIMIT });
    const probe = await client.get({
      label: `${label}_${selectType}_${page + 1}`,
      endpoint: "dmp/custom_audience/select",
      ...request,
      summarize: summarizeDmpAudiencePayload
    });
    probes.push(probe);
    (probe.summary?.audienceItems || []).forEach((item) => items.set(item.customAudienceId, item));
    total = Math.max(total, Number(probe.summary?.totalNum || 0));
    if (probe.status !== "passed" || (total && (page + 1) * DMP_SELECT_PAGE_LIMIT >= total)) break;
    if (!total && (probe.summary?.customAudienceIdCount || 0) < DMP_SELECT_PAGE_LIMIT) break;
  }
  const failed = probes.find((probe) => probe.status !== "passed");
  return {
    status: failed?.status || "passed",
    pages: probes.length,
    totalNum: total,
    items,
    probes: probes.map(apiProbeDigest)
  };
}

export async function probeDmpAudienceSet({ client, advertiserId, customAudienceIds, label = "dmp_custom_audience" } = {}) {
  const ids = unique(customAudienceIds).map(numberId).filter(Boolean);
  const readRequest = dmpReadRequest({ advertiserId, customAudienceIds: ids });
  const read = await client.get({
    label: `${label}_read`,
    endpoint: "dmp/custom_audience/read",
    ...readRequest,
    summarize: summarizeDmpAudiencePayload
  });
  const [visible, available] = await Promise.all([
    selectAudiencePages({ client, advertiserId, selectType: 0, label: `${label}_select` }),
    selectAudiencePages({ client, advertiserId, selectType: 1, label: `${label}_select` })
  ]);
  const readItems = new Map((read.summary?.audienceItems || []).map((item) => [item.customAudienceId, item]));
  const apiStatus = [read.status, visible.status, available.status].includes("transport_failed")
    ? "transport_failed"
    : [read.status, visible.status, available.status].every((status) => status === "passed") ? "passed" : "blocked";
  const selectVerification = selectVerificationStatus({ visible, available });
  const members = ids.map((id) => {
    const readItem = readItems.get(id);
    const visibleItem = visible.items.get(id);
    const availableItem = available.items.get(id);
    const item = availableItem || readItem || visibleItem || {};
    const readHit = Boolean(readItem);
    const visibleHit = Boolean(visibleItem);
    const availableHit = Boolean(availableItem);
    const readSucceeded = read.status === "passed";
    const usable = apiStatus === "passed" && readHit && visibleHit && availableHit && isDmpAudienceAvailable(item);
    const readConfirmedMissing = readSucceeded && !readHit && !visibleHit && !availableHit;
    return {
      customAudienceId: id,
      // `read` is authoritative for absence of an explicitly requested ID.  A
      // degraded `select` probe is retained as evidence, but must not turn a
      // confirmed absence into an unclassified/blocked member.
      status: !readSucceeded ? read.status === "transport_failed" ? "transport_failed" : "blocked"
        : readConfirmedMissing ? "missing"
          : usable ? "passed"
            : "visible_not_available",
      readHit,
      visibleHit,
      availableHit,
      selectVerification,
      deliveryStatus: clean(item.deliveryStatus),
      pushStatus: clean(item.pushStatus),
      isDeleted: clean(item.isDeleted),
      pullOff: clean(item.pullOff)
    };
  });
  return {
    status: apiStatus,
    members,
    read: apiProbeDigest(read),
    selectVerification,
    selectVisible: { status: visible.status, pages: visible.pages, totalNum: visible.totalNum, probes: visible.probes },
    selectAvailable: { status: available.status, pages: available.pages, totalNum: available.totalNum, probes: available.probes }
  };
}

function delay(ms) {
  return Number(ms) > 0 ? new Promise((resolve) => setTimeout(resolve, Number(ms))) : Promise.resolve();
}

export async function pollDmpAudienceSet({ client, advertiserId, customAudienceIds, label, delaysMs = DMP_POST_PUSH_READBACK_DELAYS_MS } = {}) {
  const attempts = [];
  let elapsedMs = 0;
  let result = null;
  for (const targetDelay of delaysMs) {
    const waitMs = Math.max(0, Number(targetDelay) - elapsedMs);
    await delay(waitMs);
    elapsedMs = Number(targetDelay);
    result = await probeDmpAudienceSet({ client, advertiserId, customAudienceIds, label: `${label}_${elapsedMs}ms` });
    const ready = result.status === "passed" && result.members.every((item) => item.status === "passed");
    attempts.push({ waitedMs: elapsedMs, ready, status: result.status, passedCount: result.members.filter((item) => item.status === "passed").length });
    if (ready) return { ready: true, result, attempts };
  }
  return { ready: false, result, attempts };
}
