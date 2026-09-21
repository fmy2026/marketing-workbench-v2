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
  validateLaunchRequest,
  validateProjectVideoAppendIntakeRequest
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
  "request_append_reprepare",
  "request_monitor_readonly_reconcile",
  "request_status",
  "request_confirmation",
  "cancel",
  "unknown"
]);

const INTENT_SET = new Set(CONVERSATION_INTENTS);
const MIN_CONFIDENCE = 0.8;
const MAX_MESSAGE_LENGTH = 1000;
const INTAKE_HELP_REPLY = "当前支持 OE3 字节小游戏、JSZC 的新建项目，以及为已有项目追加视频。可直接说“新建项目，路线 oceanengine_3_byte_mini_game，游戏 JSZC，账户 1234567890123456”，或“给项目 1234567890123456 追加视频，账户 1234567890123456，视频标识码：video-A”。";
const VIDEO_IDENTIFIER_PATTERN = /^[A-Za-z0-9._:-]{2,128}$/;
const VIDEO_IDENTIFIER_SEPARATOR = /[\s,，、;；]+/;
const NEXT_INTAKE_FIELD_LABEL = /(?:账户|账号|广告账户|advertiser(?:_id)?|项目|project(?:_id)?|路线|游戏)\s*[:：]/i;

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

function emptyIntakeDraft(values = {}) {
  const operation = ["create_std_project", PROJECT_VIDEO_APPEND_OPERATION].includes(values.operation) ? values.operation : "";
  return {
    operation,
    route_id: String(values.route_id || "").trim() === "oceanengine_3_byte_mini_game" ? "oceanengine_3_byte_mini_game" : "",
    game_code: String(values.game_code || "").trim().toUpperCase() === "JSZC" ? "JSZC" : "",
    advertiser_id: /^\d{8,24}$/.test(String(values.advertiser_id || "").trim()) ? String(values.advertiser_id).trim() : "",
    project_id: operation === PROJECT_VIDEO_APPEND_OPERATION ? String(values.project_id || "").trim() : "",
    origin_resource_ids: operation === PROJECT_VIDEO_APPEND_OPERATION && Array.isArray(values.origin_resource_ids)
      ? values.origin_resource_ids.map((item) => String(item || "").trim()).filter(Boolean) : []
  };
}

function intakeDraft(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return emptyIntakeDraft();
  return emptyIntakeDraft(value);
}

function intakeFields(operation = "") {
  return operation === PROJECT_VIDEO_APPEND_OPERATION
    ? ["advertiser_id", "project_id", "origin_resource_ids"]
    : operation === "create_std_project" ? ["route_id", "game_code", "advertiser_id"] : [];
}

function intakeMissing(draft) {
  return intakeFields(draft.operation).filter((field) => !draft[field] || (Array.isArray(draft[field]) && draft[field].length === 0));
}

function buildIntakeResponse({ draft, reply, issues = [], parseSource = "rules", slotSources = {}, modelAssist = null, source = "natural_language" }) {
  const normalizedDraft = emptyIntakeDraft(draft);
  const missing = intakeMissing(normalizedDraft);
  const appendContextReady = normalizedDraft.operation !== PROJECT_VIDEO_APPEND_OPERATION ||
    Boolean(normalizedDraft.route_id && normalizedDraft.game_code);
  const canStart = Boolean(normalizedDraft.operation) && missing.length === 0 && appendContextReady && issues.length === 0;
  let request = null;
  if (canStart) {
    request = normalizedDraft.operation === PROJECT_VIDEO_APPEND_OPERATION
      ? validateLaunchRequest({ schema_version: "launch-request.v2", ...normalizedDraft })
      : validateLaunchRequest({
          schema_version: "launch-request.v1",
          operation: "create_std_project",
          route_id: normalizedDraft.route_id,
          game_code: normalizedDraft.game_code,
          advertiser_id: normalizedDraft.advertiser_id
        });
  }
  return {
    draft: normalizedDraft,
    request,
    can_start: canStart,
    reply,
    missing_fields: missing,
    parse_source: parseSource,
    slot_sources: slotSources,
    ...(modelAssist ? { model_assist: modelAssist } : {}),
    source,
    issues
  };
}

function isHelpQuestion(text = "") {
  return /(?:能做什么|可以做什么|怎么使用|如何使用|能.*(?:追加视频|新建项目)|支持什么)/i.test(text);
}

function splitVideoIdentifiers(value = "") {
  return String(value || "").split(VIDEO_IDENTIFIER_SEPARATOR).map((item) => item.trim()).filter(Boolean);
}

function markedVideoIdentifierList(text = "") {
  const marker = /(?:视频标识码|素材标识码|视频码)\s*[:：]?\s*/i.exec(text);
  if (!marker) return { marked: false, ids: [] };
  const tail = text.slice(marker.index + marker[0].length);
  const nextField = NEXT_INTAKE_FIELD_LABEL.exec(tail);
  const list = (nextField ? tail.slice(0, nextField.index) : tail).split(/[。！？]/, 1)[0];
  return { marked: true, ids: splitVideoIdentifiers(list) };
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
  if (["重新只读准备", "检查推送结果"].includes(command)) {
    return { schemaVersion: CONVERSATION_INTENT_SCHEMA_VERSION, intent: "request_readonly_recovery", confidence: 1, slots: {}, source: "deterministic", issues: [] };
  }
  if (command === "重新准备追加") {
    return { schemaVersion: CONVERSATION_INTENT_SCHEMA_VERSION, intent: "request_append_reprepare", confidence: 1, slots: {}, source: "deterministic", issues: [] };
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
  if (hasRequest && hasNatural) throw intakeRequestError("一次提交只能使用一种投放执行输入。");
  if (hasRequest) {
    const normalized = request?.operation === PROJECT_VIDEO_APPEND_OPERATION
      ? validateProjectVideoAppendIntakeRequest(request)
      : validateLaunchRequest(request);
    const response = buildIntakeResponse({
      draft: normalized, reply: normalized.operation === PROJECT_VIDEO_APPEND_OPERATION ? "" : "已完成新建项目 JSON 校验；请核对路线、游戏和账户后启动流程。",
      parseSource: "structured_json", source: "structured_json",
      slotSources: Object.fromEntries(intakeFields(normalized.operation).map((field) => [field, "structured_json"]))
    });
    if (normalized.operation === PROJECT_VIDEO_APPEND_OPERATION) {
      response.reply = response.missing_fields.length
        ? `已读取追加视频 JSON；请补充：${response.missing_fields.map((field) => ({ advertiser_id: "账户 ID", project_id: "项目 ID", origin_resource_ids: "视频标识码" })[field]).join("、")}。`
        : "已读取账户、项目和视频标识码，正在核对项目所属游戏。";
    }
    return response;
  }
  if (!hasNatural) throw intakeRequestError("请输入投放执行需求。");
  const text = String(userIntent);
  if (text.length > 20_000) throw intakeRequestError("输入过长，请将视频标识码分批粘贴（每次最多 100 条）。");
  const priorDraft = intakeDraft(draft);
  if (isHelpQuestion(text)) {
    return buildIntakeResponse({ draft: priorDraft, reply: INTAKE_HELP_REPLY });
  }
  const hasAppendWords = /(?:追加|添加|新增|增加)(?:[^。；，,\n]{0,20})(?:视频|素材)|(?:项目|project)[^。；，,\n]{0,20}(?:视频|素材)/i.test(text);
  const negatesAppend = /(?:不|不要|无需|别)(?:[^。；，,\n]{0,8})(?:追加|添加|新增|增加)(?:[^。；，,\n]{0,20})(?:视频|素材)?/i.test(text);
  const hasCreateWords = /(?:新建|创建|从零建|建立)(?:[^。；，,\n]{0,20})(?:项目|投放|广告)/i.test(text);
  const hasUnsupportedWords = /(?:只改|修改|调整|变更)(?:[^。；，,\n]{0,20})(?:roi|出价|预算|时段|定向|配置)/i.test(text);
  if (hasUnsupportedWords) {
    const issue = launchRequestIssue("operation_not_supported");
    return buildIntakeResponse({ draft: emptyIntakeDraft(), reply: issue.message, issues: [issue], modelAssist: modelAssist() });
  }
  if ((hasAppendWords && hasCreateWords) || (hasAppendWords && negatesAppend && hasCreateWords)) {
    const issue = launchRequestIssue("operation_conflict");
    return buildIntakeResponse({ draft: emptyIntakeDraft(), reply: issue.message, issues: [issue], modelAssist: modelAssist() });
  }
  if (negatesAppend && !hasCreateWords) {
    const issue = launchRequestIssue("operation_ambiguous");
    return buildIntakeResponse({ draft: emptyIntakeDraft(), reply: issue.message, issues: [issue], modelAssist: modelAssist() });
  }
  const explicitOperation = hasAppendWords ? PROJECT_VIDEO_APPEND_OPERATION : hasCreateWords ? "create_std_project" : "";
  const selectedOperation = explicitOperation || priorDraft.operation;
  const switchingOperation = Boolean(explicitOperation && priorDraft.operation && priorDraft.operation !== explicitOperation);
  const appendIntent = selectedOperation === PROJECT_VIDEO_APPEND_OPERATION;
  if (appendIntent) {
    // An explicit switch starts a fresh operation draft. A follow-up only
    // merges labelled fields, so a project ID can never become an account ID.
    const prior = switchingOperation ? createProjectVideoAppendRequestDraft() : createProjectVideoAppendRequestDraft({ ...priorDraft, operation: PROJECT_VIDEO_APPEND_OPERATION });
    const advertiserMatches = [...text.matchAll(/(?:advertiser_id|广告账户|账户|账号|advertiser)\s*[:：]?\s*(\d{8,24})/gi)].map((match) => match[1]);
    const projectMatches = [...text.matchAll(/(?:project_id|项目)\s*[:：]?\s*(\d{8,24})/gi)].map((match) => match[1]);
    const advertiser = advertiserMatches.length === 1 ? advertiserMatches[0] : "";
    const project = projectMatches.length === 1 ? projectMatches[0] : "";
    const route = /oceanengine_3_byte_mini_game/i.test(text) ||
      (/巨量|穿山甲|字节|oe3|oceanengine|抖小/i.test(text) && /小游戏|mini\s*game|抖小/i.test(text))
      ? "oceanengine_3_byte_mini_game" : "";
    const game = /\bJSZC\b/i.test(text) || /巨兽战场/i.test(text) ? "JSZC" : "";
    const markedVideoList = markedVideoIdentifierList(text);
    const bareVideoListAllowed = !markedVideoList.marked && !explicitOperation &&
      Boolean(prior.advertiser_id && prior.project_id) && !prior.origin_resource_ids.length &&
      !advertiserMatches.length && !projectMatches.length && !NEXT_INTAKE_FIELD_LABEL.test(text);
    const rawIds = markedVideoList.marked ? markedVideoList.ids : bareVideoListAllowed ? splitVideoIdentifiers(text) : [];
    const bareNumericIdsAmbiguous = bareVideoListAllowed && rawIds.length > 0 && rawIds.every((item) => /^\d+$/.test(item));
    const invalidIds = rawIds.filter((item) => !VIDEO_IDENTIFIER_PATTERN.test(item));
    const suppliedIds = rawIds.filter((item) => VIDEO_IDENTIFIER_PATTERN.test(item));
    const advertiserChanged = Boolean(advertiser && prior.advertiser_id && advertiser !== prior.advertiser_id);
    const next = createProjectVideoAppendRequestDraft({
      ...prior,
      route_id: route || (advertiserChanged ? "" : prior.route_id),
      game_code: game || (advertiserChanged ? "" : prior.game_code),
      advertiser_id: advertiser || prior.advertiser_id,
      project_id: project || (advertiserChanged ? "" : prior.project_id),
      origin_resource_ids: suppliedIds.length ? suppliedIds : prior.origin_resource_ids
    });
    const duplicates = rawIds.length !== new Set(rawIds).size;
    const issues = [
      ...(advertiserMatches.length > 1 ? [launchRequestIssue("multiple_advertiser_ids")] : []),
      ...(projectMatches.length > 1 ? [{ code: "multiple_project_ids", message: "检测到多个项目 ID，请只保留一个项目后重试。" }] : []),
      ...(bareNumericIdsAmbiguous ? [{ code: "ambiguous_bare_numeric_video_identifier", message: "纯数字输入无法区分账户、项目或视频标识码，请加“视频标识码：”标签。" }] : []),
      ...(invalidIds.length ? [{ code: "launch_request_invalid_origin_resource_id", message: "素材标识码格式无效，未采用本次列表。" }] : []),
      ...(duplicates ? [{ code: "launch_request_duplicate_origin_resource_id", message: "素材标识码包含重复项。" }] : []),
      ...(rawIds.length > 100 ? [{ code: "launch_request_origin_resource_ids_exceed_limit", message: "单次最多追加 100 个素材标识码，请拆分提交。" }] : [])
    ];
    if (issues.length) {
      next.origin_resource_ids = prior.origin_resource_ids;
      if (advertiserMatches.length > 1) next.advertiser_id = "";
      if (projectMatches.length > 1) next.project_id = "";
    }
    const normalized = buildIntakeResponse({
      draft: next,
      reply: issues.length ? issues.map((item) => item.message).join(" ") : "",
      parseSource: "rules", source: "natural_language",
      slotSources: {
        route_id: next.route_id ? "rules" : "missing",
        game_code: next.game_code ? "rules" : "missing",
        advertiser_id: next.advertiser_id ? "rules" : "missing",
        project_id: next.project_id ? "rules" : "missing",
        origin_resource_ids: next.origin_resource_ids.length ? "rules" : "missing"
      },
      modelAssist: modelAssist(), issues
    });
    if (!normalized.reply) {
      normalized.reply = normalized.can_start
        ? rawIds.length ? `已识别 ${next.origin_resource_ids.length} 条视频标识码，可启动流程。` : "已记录追加视频所需信息，可启动流程。"
        : normalized.missing_fields.length
          ? rawIds.length
            ? `已识别 ${next.origin_resource_ids.length} 条视频标识码；请补充：${normalized.missing_fields.map((field) => ({ advertiser_id: "账户 ID", project_id: "项目 ID", origin_resource_ids: "视频标识码" })[field]).join("、")}。`
            : `已记录${explicitOperation ? "追加视频事项" : "输入"}；请补充：${normalized.missing_fields.map((field) => ({ advertiser_id: "账户 ID", project_id: "项目 ID", origin_resource_ids: "视频标识码" })[field]).join("、")}。`
          : "已记录账户、项目和视频标识码，正在核对项目所属游戏。";
    }
    return normalized;
  }
  const prior = switchingOperation ? createLaunchRequestDraft() : createLaunchRequestDraft({ ...priorDraft, operation: "create_std_project" });
  const mergeCreateDraft = (resolved) => {
    const issueCodes = resolved.issues || [];
    const invalidGame = Boolean(resolved.game_code && resolved.game_code !== "JSZC");
    let next = { ...prior };
    if (issueCodes.includes("operation_not_supported")) {
      next = createLaunchRequestDraft();
    } else {
      for (const field of LAUNCH_INTAKE_FIELDS) if (resolved[field] && !(field === "game_code" && invalidGame)) next[field] = resolved[field];
      if (issueCodes.includes("multiple_advertiser_ids")) next.advertiser_id = "";
    }
    return { next, issueCodes, invalidGame };
  };
  let resolved = await resolveExplicitLaunchIntake({ message: userIntent });
  let { next, issueCodes, invalidGame } = mergeCreateDraft(resolved);
  const hasRuleIssue = issueCodes.length > 0 || invalidGame;
  if (selectedOperation && !hasRuleIssue && intakeMissing(next).length > 0 && resolver) {
    resolved = await resolveExplicitLaunchIntake({ message: userIntent, resolver });
    ({ next, issueCodes, invalidGame } = mergeCreateDraft(resolved));
  }
  if (!selectedOperation) {
    next.operation = "";
    next.schema_version = "";
  }
  const normalized = buildIntakeResponse({
    draft: next, reply: "", parseSource: resolved.parseSource, source: "natural_language",
    slotSources: Object.fromEntries(LAUNCH_INTAKE_FIELDS.map((field) => [
      field,
      !next[field] ? "missing" : resolved.slotSources?.[field] === "llm" ? "llm" : "rules"
    ])),
    modelAssist: resolved.modelAssist,
    issues: [
      ...issueCodes.map(launchRequestIssue),
      ...(invalidGame ? [{ code: "game_not_supported", message: "当前仅支持 JSZC 游戏，请更正游戏标识。" }] : [])
    ]
  });
  if (!normalized.reply) {
    const labels = { route_id: "推广路线", game_code: "游戏标识", advertiser_id: "账户 ID" };
    const recorded = Object.entries(normalized.draft).filter(([key, value]) => ["route_id", "game_code", "advertiser_id"].includes(key) && value).map(([key]) => labels[key]);
    normalized.reply = normalized.issues.length
      ? normalized.issues.map((item) => item.message).join(" ")
      : !normalized.draft.operation
        ? (recorded.length ? `已记录${recorded.join("、")}。你想新建项目，还是给已有项目追加视频？` : "请说明投放需求：新建项目或追加视频；也可以问我能做什么。")
        : normalized.can_start
          ? "已记录新建项目所需信息，可启动流程。"
          : `已记录${explicitOperation ? "新建项目事项" : "输入"}；请补充：${normalized.missing_fields.map((field) => labels[field]).join("、")}。`;
  }
  return normalized;
}

export function isExplicitCreateConfirmation(message = "") {
  return ["确认创建", "确认创建项目", "确认创建monitor", "确认准备资源", "确认追加视频", "确认推送素材"].includes(normalizedCommand(message));
}
