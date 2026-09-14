import {
  LAUNCH_INTAKE_FIELDS,
  explicitLaunchIntakeSlotSchema,
  hasCompleteLaunchIntake,
  launchIntakeFieldValue,
  normalizeExplicitLaunchSlot,
  parseLaunchIntake
} from "./launchAgent.mjs";
import {
  createLaunchRequestDraft,
  createProjectVideoAppendRequestDraft,
  launchRequestIssue,
  normalizeLaunchRequestDraft,
  PROJECT_VIDEO_APPEND_OPERATION,
  toLaunchRequestResponse,
  validateLaunchRequest
} from "./launchRequest.mjs";
import { openAiCompatibleJsonRequestBody } from "./openaiCompatibleModelRequestProfile.mjs";

function intakeRequestError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

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

function modelAssist({ attempted = false, outcome = "not_attempted", acceptedSlots = [] } = {}) {
  return { attempted, outcome, accepted_slots: [...new Set(acceptedSlots)].filter((key) => LAUNCH_INTAKE_FIELDS.includes(key)) };
}

function providerFailureOutcome(error) {
  if (error?.name === "AbortError" || error?.code === "intent_provider_timeout") return "timeout";
  if (error?.code === "intent_provider_rejected") return "provider_rejected";
  if (error?.code === "intent_provider_non_json") return "non_json";
  return "provider_unavailable";
}

function modelAssistError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
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
  if (["确认创建", "确认创建项目", "确认创建monitor", "确认准备资源", "确认追加视频", "确认推送素材"].includes(command)) {
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
    issues: [],
    modelAssist: candidate.modelAssist
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
        const validated = validateIntent(result, { source: `llm:${selectedProvider}` });
        const outcome = validated.intent !== "unknown"
          ? "accepted_candidate"
          : (validated.issues.includes("confidence_not_accepted") || validated.issues.includes("intent_not_allowed")
            ? "intent_confidence_rejected"
            : "non_json");
        return { ...validated, modelAssist: modelAssist({ attempted: true, outcome }) };
      } catch (error) {
        return {
          ...deterministicIntent({ message }),
          source: "deterministic_fallback",
          issues: ["intent_provider_failed"],
          modelAssist: modelAssist({ attempted: true, outcome: providerFailureOutcome(error) })
        };
      }
    }
  };
}

export function createOpenAiCompatibleIntentAdapter({ apiKey, fetchFn = globalThis.fetch, timeoutMs = 10_000 } = {}) {
  const key = clean(apiKey);
  return {
    async resolve(context = {}, configuration = {}) {
      if (!key || typeof fetchFn !== "function") throw modelAssistError("intent_provider_unavailable");
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const endpoint = new URL(`${clean(configuration.apiBase).replace(/\/$/, "")}/chat/completions`);
        if (!/^https?:$/.test(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
          throw modelAssistError("intent_provider_configuration_invalid");
        }
        const response = await fetchFn(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
          body: JSON.stringify(openAiCompatibleJsonRequestBody({
            apiBase: configuration.apiBase,
            model: configuration.model,
            messages: [
              { role: "system", content: "Return JSON only: {intent,confidence,slots:{route_id:{value,evidence},game_code:{value,evidence},advertiser_id:{value,evidence}}}. intent must be one allowed intent. Every non-empty slot requires an exact evidence quote from userMessage. Never infer, default, select, or invent a missing value. Never return a Gate, Plan, action, confirmation, budget, bid, or platform instruction." },
              { role: "user", content: JSON.stringify(context) }
            ]
          })), signal: controller.signal
        });
        if (!response.ok) throw modelAssistError("intent_provider_rejected");
        let body;
        try { body = await response.json(); } catch { throw modelAssistError("intent_provider_non_json"); }
        const content = body?.choices?.[0]?.message?.content;
        if (typeof content !== "string") throw modelAssistError("intent_provider_non_json");
        try { return JSON.parse(content); } catch { throw modelAssistError("intent_provider_non_json"); }
      } finally {
        clearTimeout(timer);
      }
    }
  };
}

export async function resolveConversationIntent({ message = "", jobView = {}, resolver, allowPartialIntakeAssistance = false } = {}) {
  const effectiveResolver = resolver || createConversationIntentResolver();
  try {
    const resolved = await effectiveResolver.resolve({ message: boundedText(message), jobView, allowPartialIntakeAssistance });
    return { ...validateIntent(resolved, {
      source: effectiveResolver.provider || "resolver"
    }), modelAssist: resolved?.modelAssist };
  } catch {
    return { ...unknownIntent({ source: "deterministic_fallback", issue: "intent_resolver_failed" }), modelAssist: modelAssist({ attempted: true, outcome: "provider_unavailable" }) };
  }
}

export async function resolveExplicitLaunchIntake({ message = "", resolver } = {}) {
  const deterministic = parseLaunchIntake(message);
  const values = Object.fromEntries(LAUNCH_INTAKE_FIELDS.map((key) => [key, launchIntakeFieldValue(deterministic, key)]));
  const slotSources = Object.fromEntries(LAUNCH_INTAKE_FIELDS.map((key) => [key, values[key] ? "rules" : "missing"]));
  if (deterministic.issues?.length) {
    return { ...deterministic, ...values, parseSource: "rules", slotSources, issues: deterministic.issues, modelAssist: modelAssist() };
  }
  if (hasCompleteLaunchIntake(values)) {
    return { ...deterministic, ...values, parseSource: "rules", slotSources, issues: [], modelAssist: modelAssist() };
  }
  if (!resolver) return { ...deterministic, ...values, parseSource: "rules", slotSources, issues: [], modelAssist: modelAssist() };

  const intent = await resolveConversationIntent({
    message,
    resolver,
    allowPartialIntakeAssistance: true
  });
  let accepted = false;
  const acceptedSlots = [];
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
      acceptedSlots.push(key);
    }
  }
  const failed = intent.modelAssist?.attempted === true && !accepted;
  return {
    ...deterministic,
    ...values,
    routeId: values.route_id,
    gameCode: values.game_code,
    advertiserId: values.advertiser_id,
    missing_fields: LAUNCH_INTAKE_FIELDS.filter((key) => !values[key]),
    missingFields: LAUNCH_INTAKE_FIELDS.filter((key) => !values[key]),
    parseSource: accepted ? "llm_assisted" : failed ? "rules_fallback" : "rules",
    slotSources,
    issues: [],
    modelAssist: accepted
      ? modelAssist({ attempted: true, outcome: "accepted", acceptedSlots })
      : modelAssist({ attempted: intent.modelAssist?.attempted === true, outcome: intent.modelAssist?.outcome === "accepted_candidate" ? "slot_evidence_rejected" : (intent.modelAssist?.outcome || "intent_confidence_rejected") })
  };
}

export async function resolveLaunchRequestIntake({ userIntent, request, draft, resolver } = {}) {
  const hasRequest = request !== undefined;
  const hasNatural = typeof userIntent === "string" && userIntent.trim().length > 0;
  if (hasRequest && hasNatural) throw intakeRequestError("一次提交只能使用一种投放创建输入。");
  if (hasRequest) {
    const normalized = validateLaunchRequest(request);
    return toLaunchRequestResponse({
      draft: normalized,
      parseSource: "structured_json",
      source: "structured_json",
      slotSources: Object.fromEntries(LAUNCH_INTAKE_FIELDS.map((field) => [field, "structured_json"]))
    });
  }
  if (!hasNatural) throw intakeRequestError("请输入投放创建需求。");
  const text = String(userIntent);
  if (text.length > 20_000) throw intakeRequestError("输入过长，请将视频标识码分批粘贴（每次最多 100 条）。");
  const hasAppendWords = /(?:追加|添加|新增|增加)(?:[^。；，,\n]{0,20})(?:视频|素材)|(?:项目|project)[^。；，,\n]{0,20}(?:视频|素材)/i.test(text);
  const negatesAppend = /(?:不|不要|无需|别)(?:[^。；，,\n]{0,8})(?:追加|添加|新增|增加)(?:[^。；，,\n]{0,20})(?:视频|素材)?/i.test(text);
  const hasCreateWords = /(?:新建|创建|从零建|建立)(?:[^。；，,\n]{0,20})(?:项目|投放|广告)/i.test(text);
  const hasUnsupportedWords = /(?:只改|修改|调整|变更)(?:[^。；，,\n]{0,20})(?:roi|出价|预算|时段|定向|配置)/i.test(text);
  if (hasUnsupportedWords) {
    return toLaunchRequestResponse({
      draft: createLaunchRequestDraft(),
      parseSource: "rules",
      source: "natural_language",
      slotSources: {},
      modelAssist: modelAssist(),
      issues: [launchRequestIssue("operation_not_supported")]
    });
  }
  if ((hasAppendWords && hasCreateWords) || (hasAppendWords && negatesAppend && hasCreateWords)) {
    return toLaunchRequestResponse({
      draft: createLaunchRequestDraft(), parseSource: "rules", source: "natural_language",
      slotSources: {}, modelAssist: modelAssist(), issues: [launchRequestIssue("operation_conflict")]
    });
  }
  if (negatesAppend && !hasCreateWords) {
    return toLaunchRequestResponse({
      draft: createLaunchRequestDraft(), parseSource: "rules", source: "natural_language",
      slotSources: {}, modelAssist: modelAssist(), issues: [launchRequestIssue("operation_ambiguous")]
    });
  }
  const explicitOperation = hasAppendWords ? PROJECT_VIDEO_APPEND_OPERATION : hasCreateWords ? "create_std_project" : "";
  const appendIntent = explicitOperation === PROJECT_VIDEO_APPEND_OPERATION || (!explicitOperation && draft?.operation === PROJECT_VIDEO_APPEND_OPERATION);
  if (appendIntent) {
    // An explicit switch starts a fresh operation draft. A follow-up only
    // merges labelled fields, so a project ID can never become an account ID.
    const prior = explicitOperation ? createProjectVideoAppendRequestDraft() : createProjectVideoAppendRequestDraft(draft || {});
    const advertiserMatches = [...text.matchAll(/(?:advertiser_id|广告账户|账户|账号|advertiser)\s*[:：]?\s*(\d{8,24})/gi)].map((match) => match[1]);
    const projectMatches = [...text.matchAll(/(?:project_id|项目)\s*[:：]?\s*(\d{8,24})/gi)].map((match) => match[1]);
    const advertiser = advertiserMatches.length === 1 ? advertiserMatches[0] : "";
    const project = projectMatches.length === 1 ? projectMatches[0] : "";
    const route = /巨量|穿山甲|字节|oe3|oceanengine|抖小/i.test(text) && /小游戏|mini\s*game|抖小/i.test(text)
      ? "oceanengine_3_byte_mini_game" : "";
    const game = /\bJSZC\b/i.test(text) || /巨兽战场/i.test(text) ? "JSZC" : "";
    const marked = text.match(/(?:视频标识码|素材标识码|视频码)\s*[:：]?\s*([^。；;]{1,20000})/i)?.[1] || "";
    const rawIds = marked ? marked.split(/[\s,，]+/).map((item) => item.trim()).filter(Boolean) : [];
    const invalidIds = rawIds.filter((item) => !/^[A-Za-z0-9._:-]{2,128}$/.test(item));
    const suppliedIds = rawIds.filter((item) => /^[A-Za-z0-9._:-]{2,128}$/.test(item));
    const next = createProjectVideoAppendRequestDraft({
      ...prior,
      route_id: route || prior.route_id,
      game_code: game || prior.game_code,
      advertiser_id: advertiser || prior.advertiser_id,
      project_id: project || prior.project_id,
      origin_resource_ids: suppliedIds.length ? suppliedIds : prior.origin_resource_ids
    });
    const duplicates = rawIds.length !== new Set(rawIds).size;
    const issues = [
      ...(advertiserMatches.length > 1 ? [launchRequestIssue("multiple_advertiser_ids")] : []),
      ...(projectMatches.length > 1 ? [{ code: "multiple_project_ids", message: "检测到多个项目 ID，请只保留一个项目后重试。" }] : []),
      ...(invalidIds.length ? [{ code: "launch_request_invalid_origin_resource_id", message: "素材标识码格式无效，未采用本次列表。" }] : []),
      ...(duplicates ? [{ code: "launch_request_duplicate_origin_resource_id", message: "素材标识码包含重复项。" }] : []),
      ...(rawIds.length > 100 ? [{ code: "launch_request_origin_resource_ids_exceed_limit", message: "单次最多追加 100 个素材标识码，请拆分提交。" }] : [])
    ];
    if (issues.length) {
      next.origin_resource_ids = prior.origin_resource_ids;
      if (advertiserMatches.length > 1) next.advertiser_id = "";
      if (projectMatches.length > 1) next.project_id = "";
    }
    return toLaunchRequestResponse({
      draft: next,
      parseSource: "rules",
      source: "natural_language",
      slotSources: {
        route_id: next.route_id ? "rules" : "missing",
        game_code: next.game_code ? "rules" : "missing",
        advertiser_id: next.advertiser_id ? "rules" : "missing",
        project_id: next.project_id ? "rules" : "missing",
        origin_resource_ids: next.origin_resource_ids.length ? "rules" : "missing"
      },
      modelAssist: modelAssist(),
      issues
    });
  }
  const prior = explicitOperation ? createLaunchRequestDraft() : normalizeLaunchRequestDraft(draft || {});
  const resolved = await resolveExplicitLaunchIntake({ message: userIntent, resolver });
  const issueCodes = resolved.issues || [];
  let next = { ...prior };
  if (issueCodes.includes("operation_not_supported")) {
    next = createLaunchRequestDraft();
  } else {
    for (const field of LAUNCH_INTAKE_FIELDS) if (resolved[field]) next[field] = resolved[field];
    if (issueCodes.includes("multiple_advertiser_ids")) next.advertiser_id = "";
  }
  return toLaunchRequestResponse({
    draft: next,
    parseSource: resolved.parseSource,
    source: "natural_language",
    slotSources: resolved.slotSources,
    modelAssist: resolved.modelAssist,
    issues: issueCodes.map(launchRequestIssue)
  });
}

export function isExplicitCreateConfirmation(message = "") {
  return ["确认创建", "确认创建项目", "确认创建monitor", "确认准备资源", "确认追加视频", "确认推送素材"].includes(normalizedCommand(message));
}
