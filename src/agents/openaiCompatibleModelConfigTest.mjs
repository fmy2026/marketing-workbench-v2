const PROTOCOL = "openai_compatible";

function clean(value) {
  return String(value ?? "").trim();
}

export function normalizeOpenAiCompatibleModelConfig({ protocol = PROTOCOL, apiBase, modelName } = {}) {
  if (protocol !== PROTOCOL) throw new Error("model_protocol_not_supported");
  const model = clean(modelName);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(model)) throw new Error("invalid_model_name");
  let url;
  try {
    url = new URL(clean(apiBase));
  } catch {
    throw new Error("invalid_model_api_base");
  }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || !url.hostname) {
    throw new Error("invalid_model_api_base");
  }
  const path = url.pathname.replace(/\/+$/, "");
  url.pathname = path || "/v1";
  return { protocol: PROTOCOL, apiBase: url.toString().replace(/\/$/, ""), modelName: model };
}

export async function testOpenAiCompatibleModelConfig({ apiBase, modelName, apiKey, fetchFn = globalThis.fetch, timeoutMs = 10_000 } = {}) {
  const config = normalizeOpenAiCompatibleModelConfig({ apiBase, modelName });
  const key = clean(apiKey);
  if (!key) return { status: "failed", reason: "credential_not_configured" };
  if (typeof fetchFn !== "function") return { status: "failed", reason: "provider_unavailable" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const endpoint = new URL(`${config.apiBase.replace(/\/$/, "")}/chat/completions`);
    const response = await fetchFn(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: config.modelName,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Return only a JSON object matching the fixed schema {\\\"ok\\\": true}." },
          { role: "user", content: "Return the fixed schema now." }
        ]
      }),
      signal: controller.signal
    });
    if (!response.ok) return { status: "failed", reason: "provider_rejected" };
    const body = await response.json();
    const content = body?.choices?.[0]?.message?.content;
    const parsed = typeof content === "string" ? JSON.parse(content) : content;
    return parsed?.ok === true ? { status: "passed", reason: "fixed_schema_accepted" } : { status: "failed", reason: "fixed_schema_invalid" };
  } catch {
    return { status: "failed", reason: "provider_unavailable" };
  } finally {
    clearTimeout(timer);
  }
}
