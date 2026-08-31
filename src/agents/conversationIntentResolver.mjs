import { parseLaunchIntake } from "./launchAgent.mjs";

export const CONVERSATION_INTENT_SCHEMA_VERSION = "2026-08-31.conversation-intent-v1";
export const CONVERSATION_INTENTS = Object.freeze([
  "intake_update",
  "continue_workflow",
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
    .replace(/\b(?:access[_-]?token|refresh[_-]?token|token|authorization|cookie|secret)\s*[:=]\s*[^\s,，;；]+/gi, "[credential_redacted]");
}

function maskIdentifier(value) {
  const text = clean(value);
  if (!text) return "";
  if (text.length <= 4) return "****";
  return `****${text.slice(-4)}`;
}

function safeSlots(value = {}) {
  const fields = ["route_id", "game_code", "advertiser_id"];
  return Object.fromEntries(fields.map((key) => [
    key,
    boundedText(value[key] || value[key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())])
  ]));
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

export function buildIntentContext({ message = "", jobView = {} } = {}) {
  const gate = jobView.caseGate || {};
  return {
    schemaVersion: CONVERSATION_INTENT_SCHEMA_VERSION,
    userMessage: redactForProvider(message),
    availableIntents: CONVERSATION_INTENTS,
    case: {
      currentGate: clean(gate.currentGate),
      suggestedNextAction: clean(gate.suggestedNextAction),
      rootBlockerCode: clean((gate.rootBlockerCodes || [])[0]),
      lifecycleStatus: clean(gate.lifecycleStatus)
    },
    job: {
      jobId: clean(jobView.jobId),
      caseId: clean(jobView.caseId),
      latestCaseJob: jobView.isLatestCaseJob === true,
      status: clean(jobView.headline?.status)
    },
    draft: {
      projectName: clean(jobView.draft?.projectName),
      advertiser: maskIdentifier(jobView.intake?.advertiserId)
    }
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
  if (["确认创建", "确认创建项目"].includes(command)) {
    return { schemaVersion: CONVERSATION_INTENT_SCHEMA_VERSION, intent: "request_confirmation", confidence: 1, slots: {}, source: "deterministic", issues: [] };
  }
  if (/^(状态|当前状态|查看状态|进度|卡点|查看卡点)$/.test(command)) {
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
  return {
    schemaVersion: CONVERSATION_INTENT_SCHEMA_VERSION,
    intent,
    confidence,
    slots: safeSlots(candidate.slots || {}),
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
      async resolve({ message, jobView }) {
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

export async function resolveConversationIntent({ message = "", jobView = {}, resolver } = {}) {
  const effectiveResolver = resolver || createConversationIntentResolver();
  try {
    return validateIntent(await effectiveResolver.resolve({ message: boundedText(message), jobView }), {
      source: effectiveResolver.provider || "resolver"
    });
  } catch {
    return unknownIntent({ source: "deterministic_fallback", issue: "intent_resolver_failed" });
  }
}

export function isExplicitCreateConfirmation(message = "") {
  return ["确认创建", "确认创建项目"].includes(normalizedCommand(message));
}
