function clean(value) {
  return String(value ?? "").trim();
}

export function openAiCompatibleModelRequestProfile({ apiBase } = {}) {
  try {
    const url = new URL(clean(apiBase));
    if (url.hostname.toLowerCase() === "api.deepseek.com") {
      return { name: "deepseek_thinking_disabled", extensions: { thinking: { type: "disabled" } } };
    }
  } catch {
    // Endpoint validation remains the caller's responsibility.
  }
  return { name: "default", extensions: {} };
}

export function openAiCompatibleJsonRequestBody({ apiBase, model, messages } = {}) {
  return {
    model: clean(model),
    temperature: 0,
    response_format: { type: "json_object" },
    ...openAiCompatibleModelRequestProfile({ apiBase }).extensions,
    messages: Array.isArray(messages) ? messages : []
  };
}
