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
