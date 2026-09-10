import {
  LAUNCH_INTAKE_FIELDS,
  explicitLaunchIntakeSlotSchema,
  hasCompleteLaunchIntake,
  launchIntakeFieldValue,
  normalizeExplicitLaunchSlot,
  parseLaunchIntake
} from "./launchAgent.mjs";

export const CONVERSATION_INTENT_SCHEMA_VERSION = "2026-09-10.conversation-intent-v2";
export const CONVERSATION_INTENTS = Object.freeze([
  "intake_update",
  "continue_workflow",
  "request_readonly_recovery",
  "request_monitor_readonly_reconcile",
  "request_status",
  "request_confirmation",
  "cancel",
  "unknown"
]);

const INTENT_SET = new Set(CONVERSATION_INTENTS);
const MIN_CONFIDENCE = 0.8;
const MAX_MESSAGE_LENGTH = 1000;

function clean(value) {
  return String(value ?? "").trim();
}

function normalizedCommand(value) {
  return clean(value)
    .replace(/[\s，。！？、；：,.!?;:]/g, "")
    .toLowerCase();
}

function boundedText(value) {
  return clean(value).slice(0, MAX_MESSAGE_LENGTH);
}

function redactForProvider(value) {
  return boundedText(value)
    .replace(/(?:https?|sslocal):\/\/[^\s]+/gi, "[url_redacted]")
    .replace(/\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|authorization|cookie|secret|password)\s*[:=]\s*[^\s,，;；]+/gi, "[credential_redacted]")
    .replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, "[credential_redacted]");
}

function safeSlots(value = {}) {
  const fields = LAUNCH_INTAKE_FIELDS;
  return Object.fromEntries(fields.map((key) => [
    key,
    boundedText(slotCandidate(value, key).value)
  ]));
}

function slotCandidate(value = {}, key = "") {
  const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  const raw = value?.[key] ?? value?.[camelKey] ?? "";
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return { value: raw.value ?? raw.id ?? "", evidence: raw.evidence ?? raw.quote ?? "" };
  }
  return { value: raw, evidence: value?.slotEvidence?.[key] ?? value?.slot_evidence?.[key] ?? "" };
}

function safeSlotEvidence(value = {}) {
  return Object.fromEntries(LAUNCH_INTAKE_FIELDS.map((key) => [key, boundedText(slotCandidate(value, key).evidence)]));
}

function unknownIntent({ source = "deterministic", issue = "unrecognized" } = {}) {
  return {
    schemaVersion: CONVERSATION_INTENT_SCHEMA_VERSION,
    intent: "unknown",
    confidence: 0,
    slots: {},
    source,
    issues: [issue]
  };
}

export function intentProviderConfig(env = process.env) {
  return {
    provider: clean(env.MWBV2_INTENT_PROVIDER) || "deterministic",
    model: clean(env.MWBV2_INTENT_MODEL),
    apiBase: clean(env.MWBV2_INTENT_API_BASE)
  };
}

export function buildIntentContext({ message = "" } = {}) {
  return {
    schemaVersion: CONVERSATION_INTENT_SCHEMA_VERSION,
    userMessage: redactForProvider(message),
    availableIntents: CONVERSATION_INTENTS,
    slots: LAUNCH_INTAKE_FIELDS,
    explicitSlotSchema: explicitLaunchIntakeSlotSchema(),
    rules: [
      "Only extract information explicitly present in userMessage.",
      "For each supplied slot, quote exact evidence from userMessage.",
      "Never infer, default, select, or invent a route, game, advertiser, budget, bid, Gate, Plan, action, confirmation, or platform instruction."
    ]
  };
}

export function deterministicIntent({ message = "" } = {}) {
  const text = boundedText(message);
  const command = normalizedCommand(text);
  if (!command) return unknownIntent({ issue: "empty_message" });
  if (["取消", "停止", "不继续", "先不做"].includes(command)) {
    return { schemaVersion: CONVERSATION_INTENT_SCHEMA_VERSION, intent: "cancel", confidence: 1, slots: {}, source: "deterministic", issues: [] };
  }
  if (["继续", "继续执行", "下一步", "继续流程", "开始执行"].includes(command)) {
    return { schemaVersion: CONVERSATION_INTENT_SCHEMA_VERSION, intent: "continue_workflow", confidence: 1, slots: {}, source: "deterministic", issues: [] };
  }
  if (command === "重新只读准备") {
    return { schemaVersion: CONVERSATION_INTENT_SCHEMA_VERSION, intent: "request_readonly_recovery", confidence: 1, slots: {}, source: "deterministic", issues: [] };
  }
  if (command === "重新只读回查monitor") {
    return { schemaVersion: CONVERSATION_INTENT_SCHEMA_VERSION, intent: "request_monitor_readonly_reconcile", confidence: 1, slots: {}, source: "deterministic", issues: [] };
  }
  if (["确认创建", "确认创建项目", "确认创建monitor", "确认准备资源"].includes(command)) {
    return { schemaVersion: CONVERSATION_INTENT_SCHEMA_VERSION, intent: "request_confirmation", confidence: 1, slots: {}, source: "deterministic", issues: [] };
  }
  if (/^(状态|当前状态|查看状态|进度|卡点|查看卡点|现在到哪一步了|为什么卡住|下一步是什么|还缺什么)$/.test(command)) {
    return { schemaVersion: CONVERSATION_INTENT_SCHEMA_VERSION, intent: "request_status", confidence: 1, slots: {}, source: "deterministic", issues: [] };
  }
  const intake = parseLaunchIntake(text);
  if (intake.route_id || intake.game_code || intake.advertiser_id) {
    return {
      schemaVersion: CONVERSATION_INTENT_SCHEMA_VERSION,
      intent: "intake_update",
      confidence: 1,
      slots: safeSlots(intake),
      source: "deterministic",
      issues: []
    };
  }
  if (["确认", "好的", "好", "可以", "同意"].includes(command)) {
    return { schemaVersion: CONVERSATION_INTENT_SCHEMA_VERSION, intent: "request_confirmation", confidence: 0.7, slots: {}, source: "deterministic", issues: ["ambiguous_confirmation"] };
  }
  return unknownIntent({ issue: "unrecognized" });
}

export function validateIntent(candidate, { source = "adapter" } = {}) {
  if (!candidate || typeof candidate !== "object") return unknownIntent({ source, issue: "invalid_adapter_result" });
  const intent = clean(candidate.intent || candidate.name);
  const confidence = Number(candidate.confidence);
  if (!INTENT_SET.has(intent)) return unknownIntent({ source, issue: "intent_not_allowed" });
  if (!Number.isFinite(confidence) || confidence < MIN_CONFIDENCE || confidence > 1) {
    return unknownIntent({ source, issue: "confidence_not_accepted" });
  }
  const rawSlots = candidate.slots || candidate;
  const slotEvidence = safeSlotEvidence({
    ...rawSlots,
    slotEvidence: candidate.slotEvidence || candidate.slot_evidence || rawSlots.slotEvidence || rawSlots.slot_evidence || {}
  });
  return {
    schemaVersion: CONVERSATION_INTENT_SCHEMA_VERSION,
    intent,
    confidence,
    slots: safeSlots(rawSlots),
    slotEvidence,
    source: clean(candidate.source) || source,
    issues: []
  };
}

export function createConversationIntentResolver({ provider, model, apiBase, adapters = {}, env = process.env } = {}) {
  const configured = intentProviderConfig(env);
  const selectedProvider = clean(provider || configured.provider) || "deterministic";
  const configuration = {
    provider: selectedProvider,
    model: clean(model || configured.model),
    apiBase: clean(apiBase || configured.apiBase)
  };
  if (selectedProvider === "deterministic") {
    return {
      provider: "deterministic",
      configuration,
      async resolve({ message }) {
        return deterministicIntent({ message });
      }
    };
  }
  const adapter = adapters[selectedProvider];
  if (!adapter || typeof adapter.resolve !== "function") {
    return {
      provider: selectedProvider,
      configuration,
      async resolve({ message }) {
        return {
          ...deterministicIntent({ message }),
          source: "deterministic_fallback",
          issues: ["intent_provider_unavailable"]
        };
      }
    };
  }
  return {
    provider: selectedProvider,
    configuration,
    async resolve({ message, jobView, allowPartialIntakeAssistance = false }) {
      const deterministic = deterministicIntent({ message });
      const partialIntake = deterministic.intent === "intake_update" &&
        !hasCompleteLaunchIntake(deterministic.slots) &&
        LAUNCH_INTAKE_FIELDS.some((key) => Boolean(launchIntakeFieldValue(deterministic.slots, key)));
      if (deterministic.confidence === 1 && !(allowPartialIntakeAssistance && partialIntake)) return deterministic;
      try {
        const result = await adapter.resolve(buildIntentContext({ message, jobView }), configuration);
        return validateIntent(result, { source: `llm:${selectedProvider}` });
      } catch {
        return {
          ...deterministicIntent({ message }),
          source: "deterministic_fallback",
          issues: ["intent_provider_failed"]
        };
      }
    }
  };
}

export function createOpenAiCompatibleIntentAdapter({ apiKey, fetchFn = globalThis.fetch, timeoutMs = 10_000 } = {}) {
  const key = clean(apiKey);
  return {
    async resolve(context = {}, configuration = {}) {
      if (!key || typeof fetchFn !== "function") throw new Error("intent_provider_unavailable");
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const endpoint = new URL(`${clean(configuration.apiBase).replace(/\/$/, "")}/chat/completions`);
        if (!/^https?:$/.test(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
          throw new Error("intent_provider_configuration_invalid");
        }
        const response = await fetchFn(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
          body: JSON.stringify({
            model: clean(configuration.model), temperature: 0, response_format: { type: "json_object" },
            messages: [
              { role: "system", content: "Return JSON only: {intent,confidence,slots:{route_id:{value,evidence},game_code:{value,evidence},advertiser_id:{value,evidence}}}. intent must be one allowed intent. Every non-empty slot requires an exact evidence quote from userMessage. Never infer, default, select, or invent a missing value. Never return a Gate, Plan, action, confirmation, budget, bid, or platform instruction." },
              { role: "user", content: JSON.stringify(context) }
            ]
          }), signal: controller.signal
        });
        if (!response.ok) throw new Error("intent_provider_rejected");
        const body = await response.json();
        const content = body?.choices?.[0]?.message?.content;
        return typeof content === "string" ? JSON.parse(content) : content;
      } finally {
        clearTimeout(timer);
      }
    }
  };
}

export async function resolveConversationIntent({ message = "", jobView = {}, resolver, allowPartialIntakeAssistance = false } = {}) {
  const effectiveResolver = resolver || createConversationIntentResolver();
  try {
    return validateIntent(await effectiveResolver.resolve({ message: boundedText(message), jobView, allowPartialIntakeAssistance }), {
      source: effectiveResolver.provider || "resolver"
    });
  } catch {
    return unknownIntent({ source: "deterministic_fallback", issue: "intent_resolver_failed" });
  }
}

export async function resolveExplicitLaunchIntake({ message = "", resolver } = {}) {
  const deterministic = parseLaunchIntake(message);
  const values = Object.fromEntries(LAUNCH_INTAKE_FIELDS.map((key) => [key, launchIntakeFieldValue(deterministic, key)]));
  const slotSources = Object.fromEntries(LAUNCH_INTAKE_FIELDS.map((key) => [key, values[key] ? "rules" : "missing"]));
  if (hasCompleteLaunchIntake(values)) {
    return { ...deterministic, ...values, parseSource: "rules", slotSources };
  }
  if (!resolver) return { ...deterministic, ...values, parseSource: "rules", slotSources };

  const intent = await resolveConversationIntent({
    message,
    resolver,
    allowPartialIntakeAssistance: true
  });
  let accepted = false;
  if (intent.intent === "intake_update" && intent.source.startsWith("llm:")) {
    for (const key of LAUNCH_INTAKE_FIELDS) {
      if (values[key]) continue;
      const normalized = normalizeExplicitLaunchSlot({
        key,
        value: intent.slots?.[key],
        evidence: intent.slotEvidence?.[key],
        message
      });
      if (!normalized) continue;
      values[key] = normalized;
      slotSources[key] = "llm";
      accepted = true;
    }
  }
  const failed = intent.source === "deterministic_fallback" ||
    (intent.source.startsWith("llm:") && !accepted);
  return {
    ...deterministic,
    ...values,
    routeId: values.route_id,
    gameCode: values.game_code,
    advertiserId: values.advertiser_id,
    missing_fields: LAUNCH_INTAKE_FIELDS.filter((key) => !values[key]),
    missingFields: LAUNCH_INTAKE_FIELDS.filter((key) => !values[key]),
    parseSource: accepted ? "llm_assisted" : failed ? "rules_fallback" : "rules",
    slotSources
  };
}

export function isExplicitCreateConfirmation(message = "") {
  return ["确认创建", "确认创建项目", "确认创建monitor", "确认准备资源"].includes(normalizedCommand(message));
}
