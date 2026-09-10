import {
  AGENT_HUB_PATH,
  LAUNCH_CREATION_AGENT_PATH,
  agentHubUrl,
  parseWorkbenchProgressTarget,
  workbenchCaseUrl
} from "./workbench-address.mjs";
import {
  latestCaseJobId,
  progressPresentation,
  progressRefreshLabel,
  readonlyRecoveryGuidance,
  PROGRESS_REFRESH_INTERVAL_MS
} from "./workbench-progress.mjs";

(function () {
  let job = null;
  let workbench = null;
  let busy = false;
  let viewOnly = false;
  let polling = false;
  let progressRefreshing = false;
  let progressRefreshFailed = false;
  let jobRevision = 0;
  let draftCaseId = "";
  let draftCaseKey = "";
  let pendingConfirmation = null;
  let rootHome = false;
  let currentUser = null;
  let agentProfile = null;
  let modelConfig = null;
  let currentScreen = "hub";
  let activeModule = "conversation";
  let passwordChangeForced = false;
  const chatMessages = [];
  const focusedNodes = new Map();
  const agentModules = new Set(["overview", "conversation", "memory", "knowledge", "skills", "statistics"]);
  const draftIntake = {
    route_id: "",
    game_code: "",
    advertiser_id: ""
  };

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function refreshIcons() {
    if (window.lucide) window.lucide.createIcons();
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: {
        "content-type": "application/json",
        ...(options.headers || {})
      }
    });
    const body = await response.json();
    if (!response.ok) {
      const error = new Error(body.error || "执行失败");
      error.details = body.details;
      error.status = response.status;
      throw error;
    }
    return body;
  }

  function roleLabel(role) {
    return role === "admin" ? "管理员" : "普通用户";
  }

  function moduleFromLocation() {
    const requested = String(new URLSearchParams(window.location.search).get("module") || "conversation").trim();
    return agentModules.has(requested) ? requested : "conversation";
  }

  function workspacePath({ module = activeModule, keepProgressTarget = true } = {}) {
    const url = new URL(window.location.href);
    url.pathname = LAUNCH_CREATION_AGENT_PATH;
    if (!keepProgressTarget) {
      url.searchParams.delete("case_id");
      url.searchParams.delete("job_id");
    }
    if (module && module !== "conversation") url.searchParams.set("module", module);
    else url.searchParams.delete("module");
    return `${url.pathname}${url.search}`;
  }

  function setCurrentUrl(path, { replace = false } = {}) {
    const method = replace ? "replaceState" : "pushState";
    window.history[method]({}, "", path);
  }

  function closeUserMenu() {
    const menu = document.getElementById("userMenu");
    const trigger = document.getElementById("userMenuButton");
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  }

  function updateUserPresentation() {
    const displayName = currentUser?.displayName || currentUser?.loginName || "当前用户";
    const avatar = displayName.slice(0, 1);
    document.getElementById("operatorName").textContent = displayName;
    document.getElementById("operatorAvatar").textContent = avatar;
    document.getElementById("userMenuAvatar").textContent = avatar;
    document.getElementById("userMenuDisplayName").textContent = displayName;
    document.getElementById("userMenuLoginName").textContent = currentUser?.loginName || "";
    document.getElementById("userMenuRole").textContent = roleLabel(currentUser?.role);
    document.getElementById("userAdminButton").hidden = currentUser?.role !== "admin";
  }

  function renderAgentOverview() {
    if (!agentProfile) return;
    document.getElementById("overviewDescription").textContent = agentProfile.positioning || agentProfile.description || "投放创建 Agent";
    const metrics = document.getElementById("capabilityMetrics");
    metrics.innerHTML = "";
    const summary = agentProfile.capabilitySummary || {};
    [
      [summary.workflowNodeCount || 0, "Workflow Node"],
      [summary.resourceTypeCount || 0, "资源类别"],
      [summary.planKindCount || 0, "可确认 Plan"]
    ].forEach(([value, label]) => {
      const metric = el("div", "capability-metric");
      metric.append(el("strong", "", String(value)));
      metric.append(el("span", "", label));
      metrics.append(metric);
    });
    const modelStatus = document.getElementById("overviewModelStatus");
    if (modelStatus) {
      modelStatus.textContent = modelConfig?.enabled === true
        ? `模型配置：已启用（${modelTestLabel(modelConfig.testStatus)}）。`
        : `模型配置：未启用（${modelTestLabel(modelConfig?.testStatus || "not_configured")}）；仍可完整使用规则解析。`;
    }
  }

  function valueOf(record, snakeCase, camelCase = "") {
    return record?.[snakeCase] ?? (camelCase ? record?.[camelCase] : undefined) ?? "";
  }

  function formatMoment(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN", { hour12: false });
  }

  function emptyModule(container, text) {
    container.innerHTML = "";
    container.append(el("p", "readonly-empty", text));
  }

  function appendRecordField(grid, label, value) {
    const field = el("span", "");
    field.append(el("strong", "", `${label}：`));
    field.append(document.createTextNode(String(value || "-")));
    grid.append(field);
  }

  async function renderMemory() {
    const container = document.getElementById("memoryContent");
    if (!container) return;
    emptyModule(container, "正在读取本人结构化业务记录…");
    try {
      const result = await api("/api/agents/launch_creation/memory");
      const cases = result.cases || [];
      if (!cases.length) return emptyModule(container, "尚无可展示的本人 Case。启动流程后，结构化记录会在这里出现。");
      container.innerHTML = "";
      for (const item of cases) {
        const record = el("article", "readonly-record");
        const heading = el("div", "readonly-record-heading");
        heading.append(el("h3", "", `Case ${String(valueOf(item, "case_id", "caseId")).replace(/^(.{0,8}).*$/, "$1")}`));
        heading.append(el("span", "readonly-tag", valueOf(item, "lifecycle_status", "lifecycleStatus") || "未知状态"));
        record.append(heading);
        const grid = el("div", "readonly-record-grid");
        appendRecordField(grid, "账户", valueOf(item, "advertiser_masked", "advertiserMasked"));
        appendRecordField(grid, "游戏", valueOf(item, "game_code", "gameCode"));
        appendRecordField(grid, "路线", valueOf(item, "route_id", "routeId"));
        appendRecordField(grid, "当前 Gate", valueOf(item, "current_gate", "currentGate"));
        appendRecordField(grid, "唯一阻断", valueOf(item, "root_blocker_code", "rootBlockerCode") || "无");
        appendRecordField(grid, "更新时间", formatMoment(valueOf(item, "latest_job_updated_at", "latestJobUpdatedAt") || valueOf(item, "updated_at", "updatedAt")));
        record.append(grid);
        const evidenceRefs = valueOf(item, "evidence_refs", "evidenceRefs") || [];
        const tags = el("div", "readonly-tags");
        if (evidenceRefs.length) {
          tags.append(...evidenceRefs.slice(0, 3).map((ref) => el("span", "readonly-tag", `证据：${ref}`)));
        } else {
          tags.append(el("span", "readonly-tag", "暂无可展示的证据引用"));
        }
        record.append(tags);
        const caseId = valueOf(item, "case_id", "caseId");
        const open = el("button", "memory-open-button", "恢复最新 Job");
        open.type = "button";
        open.disabled = !caseId || !valueOf(item, "latest_job_id", "latestJobId");
        open.addEventListener("click", () => window.location.assign(workbenchCaseUrl(caseId)));
        record.append(open);
        container.append(record);
      }
    } catch {
      emptyModule(container, "结构化业务记录暂时不可用；未读取或写入任何对话原文。");
    }
  }

  function renderKnowledge() {
    const container = document.getElementById("knowledgeContent");
    if (!container) return;
    const topics = agentProfile?.knowledgeTopics || [];
    if (!topics.length) return emptyModule(container, "公开知识说明加载中…");
    container.innerHTML = "";
    for (const topic of topics) {
      const record = el("article", "readonly-record");
      record.append(el("h3", "", topic.title || String(topic)));
      record.append(el("p", "", topic.description || "共享只读能力说明。"));
      container.append(record);
    }
  }

  function renderSkills() {
    const container = document.getElementById("skillsContent");
    if (!container) return;
    const nodes = agentProfile?.workflowNodes || [];
    if (!nodes.length) return emptyModule(container, "固定 Workflow 技能说明加载中…");
    container.innerHTML = "";
    for (const node of nodes) {
      const record = el("article", "readonly-record");
      record.append(el("h3", "", `${node.number}. ${node.name}`));
      record.append(el("p", "", `${node.phase} · ${node.statusMeaning || "状态由当前 Case 的只读投影决定。"}`));
      const grid = el("div", "readonly-record-grid");
      appendRecordField(grid, "技能组", (node.skillGroup || []).join("、"));
      appendRecordField(grid, "输入", (node.inputs || []).join("、"));
      appendRecordField(grid, "输出", (node.outputs || []).join("、"));
      record.append(grid);
      container.append(record);
    }
  }

  async function renderStatistics(requestedScope = "") {
    const container = document.getElementById("statisticsContent");
    const label = document.getElementById("statisticsScopeLabel");
    const selector = document.getElementById("statisticsScope");
    if (!container || !label || !selector) return;
    const isAdmin = currentUser?.role === "admin";
    const scope = isAdmin && (requestedScope || selector.value) === "all" ? "all" : "self";
    label.hidden = !isAdmin;
    selector.value = scope;
    emptyModule(container, "正在读取 Workflow 统计投影…");
    try {
      const suffix = scope === "all" ? "?scope=all" : "?scope=self";
      const [summaryResult, detailResult] = await Promise.all([
        api(`/api/reports/workflow-summary${suffix}`),
        api(`/api/reports/workflow-detail${suffix}`)
      ]);
      container.innerHTML = "";
      const summaries = summaryResult.users || [];
      const details = detailResult.cases || [];
      if (!summaries.length && !details.length) return emptyModule(container, "当前范围内暂无 Workflow 统计记录。");
      container.append(table(
        ["人员", "账户", "Case", "已验证成功", "进行中", "阻断", "未成功终态"],
        summaries.map((item) => [
          `${valueOf(item, "display_name", "displayName")} (${valueOf(item, "login_name", "loginName")})`,
          valueOf(item, "advertiser_count", "advertiserCount") || 0,
          valueOf(item, "case_count", "caseCount") || 0,
          valueOf(item, "verified_success_count", "verifiedSuccessCount") || 0,
          valueOf(item, "active_case_count", "activeCaseCount") || 0,
          valueOf(item, "blocked_case_count", "blockedCaseCount") || 0,
          valueOf(item, "terminal_unsuccessful_count", "terminalUnsuccessfulCount") || 0
        ])
      ));
      container.append(table(
        ["归属人", "账户", "游戏", "状态", "当前 Gate", "唯一阻断"],
        details.map((item) => [
          valueOf(item, "owner_display_name", "ownerDisplayName") || "待核实",
          valueOf(item, "advertiser_id", "advertiserId") || "-",
          valueOf(item, "game_code", "gameCode") || "-",
          valueOf(item, "lifecycle_status", "lifecycleStatus") || "-",
          valueOf(item, "current_gate", "currentGate") || "-",
          (valueOf(item, "root_blocker_codes", "rootBlockerCodes") || [])[0] || ""
        ])
      ));
    } catch {
      emptyModule(container, "统计投影暂时不可用；当前没有执行或修改任何投放账户。");
    }
  }

  async function renderModuleData(module = activeModule) {
    if (module === "memory") return renderMemory();
    if (module === "knowledge") return renderKnowledge();
    if (module === "skills") return renderSkills();
    if (module === "statistics") return renderStatistics();
    return undefined;
  }

  function renderAgentCards(agents = []) {
    const grid = document.getElementById("agentCardGrid");
    grid.innerHTML = "";
    for (const agent of agents) {
      const card = el("article", "agent-card");
      card.append(el("span", "agent-card-icon", "投"));
      const heading = el("div", "agent-card-heading");
      heading.append(el("h2", "", agent.displayName));
      heading.append(el("span", "agent-availability", "在线"));
      card.append(heading);
      card.append(el("p", "", agent.description));
      const metrics = el("div", "agent-card-metrics");
      const summary = agent.capabilitySummary || {};
      [
        [summary.workflowNodeCount || 0, "Workflow Node"],
        [summary.resourceTypeCount || 0, "资源"],
        [summary.planKindCount || 0, "Plan"]
      ].forEach(([value, label]) => {
        const metric = el("span", "");
        metric.append(el("strong", "", String(value)));
        metric.append(document.createTextNode(` ${label}`));
        metrics.append(metric);
      });
      card.append(metrics);
      const open = el("button", "agent-open-button", "进入 Agent");
      open.type = "button";
      open.addEventListener("click", async () => {
        setCurrentUrl(workspacePath({ module: "conversation", keepProgressTarget: false }));
        showAgentWorkspace();
        await loadAgentWorkspace();
      });
      card.append(open);
      grid.append(card);
    }
    const comingSoon = el("article", "agent-card agent-card-coming-soon");
    comingSoon.append(el("span", "agent-card-icon is-muted", "＋"));
    comingSoon.append(el("h2", "", "即将上线"));
    comingSoon.append(el("p", "", "更多数字员工正在接入中。"));
    const disabled = el("button", "agent-open-button", "敬请期待");
    disabled.type = "button";
    disabled.disabled = true;
    comingSoon.append(disabled);
    grid.append(comingSoon);
  }

  async function loadAgentHub() {
    const result = await api("/api/agents");
    renderAgentCards(result.agents || []);
  }

  async function loadAgentProfile() {
    const result = await api("/api/agents/launch_creation");
    agentProfile = result.agent || null;
    renderAgentOverview();
    await renderModuleData(activeModule);
  }

  function selectModule(module, { updateAddress = false } = {}) {
    activeModule = agentModules.has(module) ? module : "conversation";
    document.querySelectorAll("[data-module-content]").forEach((section) => {
      section.hidden = section.dataset.moduleContent !== activeModule;
    });
    document.querySelectorAll(".agent-module-button").forEach((button) => {
      const selected = button.dataset.module === activeModule;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-current", selected ? "page" : "false");
    });
    if (updateAddress) setCurrentUrl(workspacePath({ module: activeModule }));
    renderModuleData(activeModule).catch(() => {});
  }

  function modelTestLabel(status) {
    return {
      passed: "已通过固定 Schema 测试",
      failed: "连接测试失败",
      not_tested: "配置已变更，等待测试",
      not_configured: "尚未配置 API Key"
    }[status] || "尚未验证";
  }

  function renderModelConfig(config = modelConfig) {
    modelConfig = config || null;
    const visible = config || {
      protocol: "openai_compatible", modelName: "", apiBase: "", credentialConfigured: false,
      enabled: false, testStatus: "not_configured"
    };
    document.getElementById("modelProtocol").value = visible.protocol || "openai_compatible";
    document.getElementById("modelApiBase").value = visible.apiBase || "";
    document.getElementById("modelName").value = visible.modelName || "";
    document.getElementById("modelApiKey").value = "";
    document.getElementById("modelCredentialState").textContent = `API Key：${visible.credentialConfigured ? "已配置（不会展示）" : "未配置"}`;
    document.getElementById("modelTestState").textContent = modelTestLabel(visible.testStatus);
    const enabled = document.getElementById("modelEnabled");
    enabled.checked = visible.enabled === true;
    enabled.disabled = visible.testStatus !== "passed";
    document.getElementById("modelConfigError").textContent = "";
    renderAgentOverview();
  }

  function closeModelConfig() {
    document.getElementById("modelConfigModal").hidden = true;
    document.getElementById("modelApiKey").value = "";
  }

  async function loadModelConfig() {
    const result = await api("/api/agents/launch_creation/model-config");
    renderModelConfig(result.config);
    return result.config;
  }

  function modelConfigPayload({ preserveEnabled = false } = {}) {
    const key = document.getElementById("modelApiKey").value;
    return {
      protocol: "openai_compatible",
      api_base: document.getElementById("modelApiBase").value.trim(),
      model_name: document.getElementById("modelName").value.trim(),
      ...(key ? { api_key: key } : {}),
      enabled: preserveEnabled ? document.getElementById("modelEnabled").checked : false
    };
  }

  async function saveModelConfig({ preserveEnabled = true } = {}) {
    const result = await api("/api/agents/launch_creation/model-config", {
      method: "PUT",
      body: JSON.stringify(modelConfigPayload({ preserveEnabled }))
    });
    renderModelConfig(result.config);
    return result.config;
  }

  function phases() {
    return job?.phases || workbench?.phases || [];
  }

  function allNodes() {
    return phases().flatMap((phase) => phase.nodes || []);
  }

  function requiredFields() {
    return job?.intake?.requiredFields || workbench?.intake?.requiredFields || [];
  }

  function fieldValue(intake, key) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    return intake?.[key] || intake?.[camelKey] || "";
  }

  function activeIntake() {
    return job?.intake || draftIntake;
  }

  function missingFields() {
    return requiredFields().filter((field) => !fieldValue(draftIntake, field.key));
  }

  function message(role, text) {
    chatMessages.push({ role, text });
    renderChat();
  }

  function appendRenderedMessage(stream, role, text) {
    const messageNode = el("div", `chat-message is-${role}`);
    messageNode.append(el("div", "message-bubble", text));
    stream.append(messageNode);
  }

  function confirmationPreview() {
    if (viewOnly || !job?.isLatestCaseJob) return null;
    return pendingConfirmation || job.confirmationPreview || null;
  }

  function setJobView(nextJob) {
    job = nextJob || null;
    pendingConfirmation = job?.confirmationPreview || null;
    jobRevision += 1;
  }

  function renderConfirmationCard(stream) {
    const preview = confirmationPreview();
    if (!preview) return;
    const card = el("section", "confirmation-card");
    card.setAttribute("aria-label", "受控 Plan 确认");
    card.append(el("strong", "", "受控 Plan 确认"));
    card.append(el("p", "", preview.actionLabel || "创建 1 个广告项目"));
    const facts = el("dl", "confirmation-facts");
    const callLimitLabel = preview.planKind === "resource_prepare"
      ? "六项资源动作累计调用上限"
      : "调用上限";
    [
      ["项目", preview.projectName || "待生成"],
      ["账户", preview.advertiser || "已脱敏"],
      [callLimitLabel, `${preview.maximumPlatformCalls || 1} 次`],
      ...(preview.planKind === "std_project_create" ? [["Case 创建上限", `${preview.maximumCreateAttempts || 1} 次`]] : []),
      ["自动重试", preview.retryAllowed ? "允许" : "禁止"],
      ["Plan", preview.planId || "未生成"],
      ["Hash", preview.planHash || "未生成"]
    ].forEach(([label, value]) => {
      facts.append(el("dt", "", label));
      facts.append(el("dd", "", value));
    });
    card.append(facts);
    if (preview.planKind === "resource_prepare" && preview.actionLimits?.length) {
      const limits = el("details", "confirmation-action-limits");
      limits.append(el("summary", "", "查看每项调用上限"));
      const list = el("ul", "");
      for (const item of preview.actionLimits) {
        list.append(el("li", "", `${item.actionType}：${item.maximumPlatformCalls} 次`));
      }
      limits.append(list);
      card.append(limits);
    }
    const canExecute = job?.executionAvailability?.canExecuteOnce === true;
    const button = el("button", "confirmation-button", canExecute ? (preview.confirmationPhrase || "确认创建") : "当前 Plan 不可确认");
    button.type = "button";
    button.disabled = busy || !canExecute;
    button.addEventListener("click", async () => {
      if (busy) return;
      setBusy(true);
      try {
        await submitJobCommand(preview.confirmationPhrase || "确认创建");
      } catch (error) {
        showError(error);
      } finally {
        setBusy(false);
      }
    });
    card.append(button);
    stream.append(card);
  }

  function operationalMessage() {
    const execution = job?.execution || {};
    if (execution.status === "started" && execution.latestDeliveryStatus === "rate_limited") {
      const nextDelivery = Math.min(Number(execution.deliveryCount || 0) + 1, Number(execution.maximumDeliveryCalls || 3));
      return `平台限流，正在等待第 ${nextDelivery}/${Number(execution.maximumDeliveryCalls || 3)} 次错峰投递。`;
    }
    if (!job?.caseGate?.currentGate) return "";
    const gate = job.caseGate;
    if (job.isLatestCaseJob && !viewOnly && gate.currentGate === "manual_review_after_attempt_limit") {
      const attempts = `${gate.attemptsUsed || 0}/${gate.maximumCreateAttempts || 3}`;
      return gate.manualReviewApproved
        ? `创建尝试已耗尽（${attempts}），复盘已批准。请仅输入“重新只读准备”建立一次替代验证；不会自动创建。`
        : `创建尝试已耗尽（${attempts}），未创建项目且禁止重试。等待人工复盘；当前只能查看状态或刷新进度。`;
    }
    if (job.isLatestCaseJob && !viewOnly && gate.currentGate === "prepare_corrective_attempt") {
      return "当前 Attempt 已失败并安全结束。输入“继续执行”可重新只读准备下一 Attempt；生成确认卡前不会创建项目。";
    }
    const readonlyRecovery = readonlyRecoveryGuidance(gate);
    if (job.isLatestCaseJob && !viewOnly && readonlyRecovery) return readonlyRecovery.message;
    return gate.progressNarrative?.message || "流程状态正在更新，请刷新查看。";
  }

  function parserLabel(source = "rules") {
    if (source === "llm" || source === "llm_assisted") return "已使用模型辅助解析";
    if (source === "rules_fallback") return "模型不可用或结果未通过校验，已回退规则解析";
    return "已使用规则解析";
  }

  function renderConversationPresets() {
    const container = document.getElementById("conversationPresets");
    const presets = agentProfile?.conversationPresets?.[job ? "active" : "intake"] || [];
    container.innerHTML = "";
    container.hidden = presets.length === 0;
    const disabled = busy || viewOnly || Boolean(job && !job.isLatestCaseJob);
    for (const preset of presets) {
      const button = el("button", "conversation-preset", preset.label);
      button.type = "button";
      button.disabled = disabled;
      button.addEventListener("click", () => submitConversationInput(preset.message));
      container.append(button);
    }
  }

  function renderChat() {
    const stream = document.getElementById("chatStream");
    stream.innerHTML = "";
    const messages = [...chatMessages];
    if (!messages.length && workbench?.intake?.prompt) {
      messages.push({ role: "agent", text: workbench.intake.prompt });
    }
    for (const item of messages) {
      if (item?.text) appendRenderedMessage(stream, item.role === "user" ? "user" : "agent", item.text);
    }
    const current = operationalMessage();
    if (current) appendRenderedMessage(stream, "agent", current);
    renderConfirmationCard(stream);
    stream.scrollTop = stream.scrollHeight;
  }

  function renderIntake() {
    const intake = activeIntake();
    const fields = requiredFields();
    const agentStatus = document.getElementById("agentStatus");
    const missing = job ? [] : missingFields();
    agentStatus.textContent = viewOnly
      ? "历史运行，只读"
      : job
        ? (job?.caseGate?.progressNarrative?.shortLabel || "等待处理")
        : (missing.length ? "等待补齐" : "已规范化");

    const intentCard = document.getElementById("intentCard");
    intentCard.innerHTML = "";
    for (const field of fields) {
      const value = fieldValue(intake, field.key);
      if (!value) continue;
      const item = el("div", "identity-item");
      item.append(el("span", "", field.label));
      item.append(el("strong", "", value));
      intentCard.append(item);
    }

    const startButton = document.getElementById("startWorkflowButton");
    const hint = document.getElementById("intakeHint");
    const action = document.getElementById("intakeAction");
    const isDraftReady = !job && fields.length > 0 && missing.length === 0;
    action.hidden = Boolean(job);
    startButton.disabled = !isDraftReady || busy || viewOnly;
    hint.textContent = isDraftReady
      ? "输入已规范化，确认后启动只读流程。"
      : (missing.length ? `请补充：${missing.map((field) => field.label).join("、")}` : "等待规范化输入。");
  }

  function renderActiveCases() {
    const container = document.getElementById("activeCases");
    const cases = rootHome ? (workbench?.activeCases || []) : [];
    container.innerHTML = "";
    container.hidden = cases.length === 0;
    if (!cases.length) return;
    const heading = el("div", "active-cases-heading");
    heading.append(el("strong", "", "进行中的流程"));
    heading.append(el("span", "", `${cases.length} 个`));
    container.append(heading);
    const list = el("div", "active-cases-list");
    for (const item of cases) {
      const row = el("div", "active-case-row");
      const details = el("div", "active-case-details");
      details.append(el("strong", "", `账户 ${item.advertiserId || "-"}`));
      details.append(el("span", "", `Gate：${item.currentGate || "-"}`));
      if (item.rootBlockerCode) details.append(el("span", "", `阻断：${item.rootBlockerCode}`));
      const resume = el("button", "active-case-resume", "继续");
      resume.type = "button";
      resume.addEventListener("click", () => {
        window.location.assign(item.caseUrl || workbenchCaseUrl(item.caseId));
      });
      row.append(details, resume);
      list.append(row);
    }
    container.append(list);
  }

  function statusTitle(item) {
    return item?.statusLabel || item?.status || "等待";
  }

  function statusDot(status, title) {
    const dot = el("span", `status-dot${status === "passed" ? " status-passed" : ""}${["blocked", "failed"].includes(status) ? " status-blocked" : ""}${status === "needs_confirmation" ? " status-needs-confirmation" : ""}`);
    dot.setAttribute("aria-label", title);
    dot.title = title;
    return dot;
  }

  function focusNode(phase) {
    const nodes = phase.nodes || [];
    const key = phase.id || phase.title || phase.phase || "";
    const selected = nodes.find((node) => node.id === focusedNodes.get(key));
    if (selected) return selected;
    return nodes.find((node) => node.status !== "passed") || nodes.at(-1) || null;
  }

  function renderWorkflow() {
    const workflowPhases = phases();
    const grid = document.getElementById("workflowGrid");
    grid.innerHTML = "";

    for (const phase of workflowPhases) {
      const nodes = phase.nodes || [];
      const section = el("section", "phase-section");
      const title = el("div", "phase-heading");
      const complete = nodes.length > 0 && nodes.every((node) => node.status === "passed");
      title.append(statusDot(complete ? "passed" : "waiting", complete ? "阶段通过" : "阶段未全部通过"));
      title.append(el("h3", "phase-title", phase.title || phase.phase || ""));
      section.append(title);

      const flow = el("div", "node-flow");
      nodes.forEach((node, index) => {
        const resourcePlanWaiting = confirmationPreview()?.planKind === "resource_prepare" &&
          job?.caseGate?.currentGate === "await_job_write_authorization" &&
          Number(node.number) >= 5;
        const displayStatus = resourcePlanWaiting ? "waiting" : node.status;
        if (index) flow.append(el("span", "node-arrow", "→"));
        const focused = focusNode(phase);
        const nodeButton = el("button", "node-pill");
        nodeButton.type = "button";
        const waitingLabel = Number(node.number) === 5 ? "等待资源回查后复核" : "等待资源 Plan 完成";
        nodeButton.title = resourcePlanWaiting ? waitingLabel : statusTitle(node);
        nodeButton.setAttribute("aria-pressed", String(focused?.id === node.id));
        if (focused?.id === node.id) nodeButton.classList.add("is-selected");
        nodeButton.append(el("span", "node-marker", String(node.number || "")));
        nodeButton.append(el("span", "node-pill-label", node.name || ""));
        nodeButton.append(statusDot(displayStatus, resourcePlanWaiting ? waitingLabel : statusTitle(node)));
        nodeButton.addEventListener("click", () => {
          focusedNodes.set(phase.id || phase.title || phase.phase || "", node.id);
          renderWorkflow();
        });
        flow.append(nodeButton);
      });
      section.append(flow);

      const focused = focusNode(phase);
      if (focused?.children?.length) {
        const resourcePlanWaiting = confirmationPreview()?.planKind === "resource_prepare" &&
          job?.caseGate?.currentGate === "await_job_write_authorization" &&
          Number(focused.number) >= 5;
        const visibleChildren = resourcePlanWaiting
          ? Number(focused.number) === 5
            ? [{ id: "resource-readback-dependency", label: "等待资源回查后复核", status: "waiting", statusLabel: "等待" }]
            : focused.children.map((child) => ({ ...child, status: "waiting", statusLabel: "等待" }))
          : focused.children;
        const children = el("div", "subnode-panel");
        const subnodeTitle = el("div", "subnode-heading");
        subnodeTitle.append(el("span", "", focused.name));
        subnodeTitle.append(el("span", "subnode-count", `${visibleChildren.length} 项`));
        children.append(subnodeTitle);
        const childList = el("div", "subnode-list");
        for (const child of visibleChildren) {
          const childItem = el("div", "subnode-item");
          childItem.title = statusTitle(child);
          childItem.append(statusDot(child.status, statusTitle(child)));
          childItem.append(el("span", "", child.label || ""));
          childList.append(childItem);
        }
        children.append(childList);
        section.append(children);
      }
      grid.append(section);
    }

    const nodeCount = allNodes().length;
    document.getElementById("workflowHeading").textContent = `Workflow · ${workflowPhases.length} 阶段 · ${nodeCount} 节点`;
  }

  function renderCommand() {
    const nodes = allNodes();
    const preview = confirmationPreview();
    document.getElementById("progressText").textContent = progressPresentation({
      nodes,
      caseGate: job?.caseGate,
      confirmationPreview: preview,
      executionAvailability: job?.executionAvailability,
      execution: job?.execution,
      headline: job?.headline,
      busy,
      viewOnly
    });
    const progressButton = document.getElementById("progressRefreshButton");
    progressButton.textContent = progressRefreshLabel({
      busy,
      refreshing: progressRefreshing,
      failed: progressRefreshFailed,
      viewOnly,
      hasJob: Boolean(job?.jobId)
    });
    progressButton.disabled = !job?.jobId || busy || progressRefreshing;
    const activeCaseConversation = job?.isLatestCaseJob === true && !viewOnly;
    const input = document.getElementById("chatInput");
    const readonlyRecovery = readonlyRecoveryGuidance(job?.caseGate);
    input.disabled = viewOnly || busy || Boolean(job && !activeCaseConversation);
    input.placeholder = activeCaseConversation
      ? job?.caseGate?.currentGate === "first_std_project_create_completed"
        ? "已完成，可输入“查看状态”..."
        : job?.caseGate?.currentGate === "manual_review_after_attempt_limit"
          ? job?.caseGate?.manualReviewApproved
            ? "复盘已批准；输入“重新只读准备”..."
            : "等待人工复盘；可输入“查看状态”..."
        : job?.caseGate?.currentGate === "prepare_corrective_attempt"
          ? "输入“继续执行”重新准备下一 Attempt，或输入“查看状态”..."
          : readonlyRecovery
            ? readonlyRecovery.placeholder
          : "输入“继续执行”或“查看状态”..."
      : "输入投放需求...";
    document.querySelector(".send-button").disabled = input.disabled;
    refreshIcons();
  }

  function renderAll() {
    renderIntake();
    renderActiveCases();
    renderChat();
    renderConversationPresets();
    renderWorkflow();
    renderCommand();
    refreshIcons();
  }

  function setBusy(nextBusy) {
    busy = nextBusy;
    renderAll();
  }

  function showError(error) {
    const owner = error.details?.ownerDisplayName ? `；账户归属人：${error.details.ownerDisplayName}` : "";
    message("agent", `唯一阻断：${error.message}${owner}`);
  }

  async function refreshProgress() {
    if (!job?.jobId || polling) return;
    polling = true;
    const revision = jobRevision;
    try {
      const activeCaseId = String(job.caseId || draftCaseId || "").trim();
      let nextJobId = job.jobId;
      if (!viewOnly && activeCaseId) {
        const caseView = await api(`/api/workflow-cases/${encodeURIComponent(activeCaseId)}`);
        nextJobId = latestCaseJobId(caseView) || nextJobId;
      }
      const nextJob = await api(jobViewPath(nextJobId));
      if (revision !== jobRevision) return;
      setJobView(nextJob);
      progressRefreshFailed = false;
      renderAll();
    } finally {
      polling = false;
    }
  }

  async function refreshProgressFromButton() {
    if (!job?.jobId || busy || progressRefreshing) return;
    progressRefreshing = true;
    progressRefreshFailed = false;
    renderAll();
    try {
      await refreshProgress();
    } catch {
      progressRefreshFailed = true;
    } finally {
      progressRefreshing = false;
      renderAll();
    }
  }

  async function withProgressPolling(work) {
    const refreshTimer = window.setInterval(() => {
      refreshProgress().catch(() => {});
    }, PROGRESS_REFRESH_INTERVAL_MS);
    try {
      return await work();
    } finally {
      window.clearInterval(refreshTimer);
      await refreshProgress().catch(() => {});
    }
  }

  function jobViewPath(jobId) {
    const view = viewOnly ? "?view=history" : "";
    return `/api/launch/jobs/${encodeURIComponent(jobId)}${view}`;
  }

  async function runWorkflow(jobId) {
    return withProgressPolling(async () => {
      await api(`/api/launch/jobs/${encodeURIComponent(jobId)}/run`, {
        method: "POST",
        body: JSON.stringify({ mode: "dry_run" })
      });
    });
  }

  function createCaseKey() {
    if (draftCaseKey) return draftCaseKey;
    const scope = [draftIntake.route_id, draftIntake.game_code.toLowerCase(), draftIntake.advertiser_id]
      .map((value) => String(value).replace(/[^A-Za-z0-9._-]/g, ""))
      .join(".");
    const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "");
    const nonce = window.crypto?.randomUUID?.().replace(/-/g, "").slice(0, 12) || Math.random().toString(36).slice(2, 14);
    draftCaseKey = `workbench.${scope}.${stamp}.${nonce}`.slice(0, 127);
    return draftCaseKey;
  }

  async function ensureWorkflowCase() {
    if (draftCaseId) return { caseId: draftCaseId, reusedActiveCase: false };
    try {
      const workflowCase = await api("/api/workflow-cases", {
        method: "POST",
        body: JSON.stringify({
          case_key: createCaseKey(),
          route_id: draftIntake.route_id,
          game_code: draftIntake.game_code,
          advertiser_id: draftIntake.advertiser_id,
          business_goal: "从工作台启动一次受控标准项目创建流程。",
          source_usage: "runtime_truth"
        })
      });
      draftCaseId = workflowCase.case_id;
      return {
        caseId: draftCaseId,
        reusedActiveCase: workflowCase.reusedActiveCase === true,
        approvedReplacementCase: workflowCase.approvedReplacementCase === true,
        replacementJobId: String(workflowCase.replacementJobId || "").trim(),
        requiresInitialReadonly: workflowCase.requiresInitialReadonly === true,
        requiresReadonlyRecovery: workflowCase.requiresReadonlyRecovery === true
      };
    } catch (error) {
      if (error.message === "workflow_case_key_already_exists" && error.details?.caseId) {
        draftCaseId = error.details.caseId;
        return { caseId: draftCaseId, reusedActiveCase: true };
      }
      throw error;
    }
  }

  async function startWorkflow() {
    if (busy || viewOnly || job || missingFields().length) return;
    setBusy(true);
    try {
      const selectedCase = await ensureWorkflowCase();
      if (selectedCase.approvedReplacementCase && selectedCase.replacementJobId) {
        setJobView(await api(jobViewPath(selectedCase.replacementJobId)));
        setActiveCaseUrl(selectedCase.caseId);
        if (selectedCase.requiresInitialReadonly) {
          message("agent", "已建立唯一的一次性替代 Case 与 fresh Job，开始重新核验视频、封面和引导视频。");
          await runWorkflow(selectedCase.replacementJobId);
        }
        if (selectedCase.requiresReadonlyRecovery) {
          message("agent", "三项输入已确认；将通过既有恢复链路建立或复用 fresh Job，仅重新执行 readonly 核验，不确认或创建平台对象。");
          await submitJobCommand("重新只读准备");
        }
        await refreshProgress();
        return;
      }
      if (selectedCase.reusedActiveCase) {
        window.location.assign(workbenchCaseUrl(selectedCase.caseId));
        return;
      }
      const created = await api("/api/launch/jobs", {
        method: "POST",
        body: JSON.stringify({
          route_id: draftIntake.route_id,
          game_code: draftIntake.game_code,
          advertiser_id: draftIntake.advertiser_id,
          case_id: selectedCase.caseId,
          source_usage: "runtime_truth",
          source_record_ref: "workbench:normalized-input"
        })
      });
      setJobView(created);
      setActiveCaseUrl(job.caseId);
      await refreshProgress();
      message("agent", "已建立 Case 与 fresh Job，开始执行 readonly workflow。");
      await runWorkflow(job.jobId);
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  }

  function mergeIntake(intake) {
    for (const field of requiredFields()) {
      const value = fieldValue(intake, field.key);
      if (value) draftIntake[field.key] = value;
    }
  }

  function setActiveCaseUrl(caseId) {
    if (!caseId) return;
    window.history.replaceState({}, "", workbenchCaseUrl(caseId));
  }

  async function submitJobCommand(text) {
    const preview = confirmationPreview();
    const result = await withProgressPolling(() => api(`/api/launch/jobs/${encodeURIComponent(job.jobId)}/command`, {
      method: "POST",
      body: JSON.stringify({
        message: text,
        expected_plan_id: preview?.planId || "",
        expected_plan_hash: preview?.planHash || ""
      })
    }));
    setJobView(result.view || job);
    if (result.view?.caseId && result.view.caseId !== draftCaseId) {
      draftCaseId = result.view.caseId;
      setActiveCaseUrl(result.view.caseId);
    }
    pendingConfirmation = Object.prototype.hasOwnProperty.call(result.interaction || {}, "confirmationPreview")
      ? result.interaction.confirmationPreview
      : job.confirmationPreview || null;
    if (result.interaction?.parserSource) {
      message("agent", `${parserLabel(result.interaction.parserSource)}。`);
    }
    if (result.interaction?.message) message("agent", result.interaction.message);
    renderAll();
  }

  function showLogin() {
    currentUser = null;
    document.getElementById("authGate").hidden = false;
    document.getElementById("loginForm").hidden = false;
    document.getElementById("passwordModal").hidden = true;
    document.getElementById("appShell").hidden = true;
    document.getElementById("agentHub").hidden = true;
    document.getElementById("workbenchShell").hidden = true;
  }

  function showPasswordChange({ forced = currentUser?.mustChangePassword === true } = {}) {
    passwordChangeForced = forced;
    document.getElementById("authGate").hidden = true;
    document.getElementById("passwordModal").hidden = false;
    if (forced) document.getElementById("appShell").hidden = true;
    document.getElementById("changePasswordTitle").textContent = forced ? "修改初始密码" : "修改密码";
    document.getElementById("changePasswordHint").textContent = forced ? "首次登录后才能进入数字员工广场" : "修改后其他会话会自动退出";
    document.getElementById("savePasswordButton").textContent = forced ? "保存并进入" : "保存新密码";
    document.getElementById("cancelPasswordChangeButton").hidden = forced;
    document.getElementById("changePasswordError").textContent = "";
    document.getElementById("currentPassword").value = "";
    document.getElementById("newPassword").value = "";
    document.getElementById("confirmPassword").value = "";
  }

  function showAgentHub({ updateAddress = false } = {}) {
    document.getElementById("authGate").hidden = true;
    document.getElementById("passwordModal").hidden = true;
    document.getElementById("appShell").hidden = false;
    document.getElementById("agentHub").hidden = false;
    document.getElementById("workbenchShell").hidden = true;
    document.getElementById("backToAgentsButton").hidden = true;
    document.getElementById("agentHeaderTitle").hidden = true;
    document.getElementById("modelConfigButton").hidden = true;
    currentScreen = "hub";
    updateUserPresentation();
    closeUserMenu();
    if (updateAddress) setCurrentUrl(AGENT_HUB_PATH, { replace: true });
  }

  function showAgentWorkspace() {
    document.getElementById("authGate").hidden = true;
    document.getElementById("passwordModal").hidden = true;
    document.getElementById("appShell").hidden = false;
    document.getElementById("agentHub").hidden = true;
    document.getElementById("workbenchShell").hidden = false;
    document.getElementById("backToAgentsButton").hidden = false;
    document.getElementById("agentHeaderTitle").hidden = false;
    document.getElementById("modelConfigButton").hidden = false;
    currentScreen = "workspace";
    activeModule = moduleFromLocation();
    selectModule(activeModule);
    updateUserPresentation();
    closeUserMenu();
  }

  function table(headers, rows) {
    const tableNode = el("table", "management-table");
    const head = el("thead", "");
    const headRow = el("tr", "");
    headers.forEach((header) => headRow.append(el("th", "", header)));
    head.append(headRow);
    tableNode.append(head);
    const body = el("tbody", "");
    rows.forEach((cells) => {
      const row = el("tr", "");
      cells.forEach((cell) => {
        const td = el("td", "");
        if (cell instanceof Node) td.append(cell);
        else td.textContent = String(cell ?? "");
        row.append(td);
      });
      body.append(row);
    });
    tableNode.append(body);
    return tableNode;
  }

  function openManagement(title, hint) {
    document.getElementById("managementTitle").textContent = title;
    document.getElementById("managementHint").textContent = hint;
    document.getElementById("managementContent").innerHTML = "";
    document.getElementById("managementPanel").hidden = false;
  }

  async function renderReports() {
    openManagement("创建流程统计", currentUser?.role === "admin" ? "全部试用人员汇总" : "仅统计本人归属账户");
    const [summaryResult, detailResult] = await Promise.all([
      api("/api/reports/workflow-summary"),
      api("/api/reports/workflow-detail")
    ]);
    const content = document.getElementById("managementContent");
    content.append(table(
      ["人员", "账户", "Case", "已验证成功", "进行中", "阻断", "未成功终态"],
      (summaryResult.users || []).map((item) => [
        `${item.display_name || item.displayName} (${item.login_name || item.loginName})`,
        item.advertiser_count ?? item.advertiserCount ?? 0,
        item.case_count ?? item.caseCount ?? 0,
        item.verified_success_count ?? item.verifiedSuccessCount ?? 0,
        item.active_case_count ?? item.activeCaseCount ?? 0,
        item.blocked_case_count ?? item.blockedCaseCount ?? 0,
        item.terminal_unsuccessful_count ?? item.terminalUnsuccessfulCount ?? 0
      ])
    ));
    content.append(table(
      ["归属人", "账户", "游戏", "状态", "当前 Gate", "唯一阻断"],
      (detailResult.cases || []).map((item) => [
        item.owner_display_name || "待核实",
        item.advertiser_id || "-",
        item.game_code || "-",
        item.lifecycle_status || "-",
        item.current_gate || "-",
        (item.root_blocker_codes || [])[0] || ""
      ])
    ));
  }

  async function renderUserAdmin() {
    openManagement("用户管理", "管理员可启停用户或重置为初始密码；不能代操作账户。");
    const result = await api("/api/admin/users");
    const rows = (result.users || []).map((item) => {
      const actions = el("div", "");
      const statusButton = el("button", "topbar-action", item.status === "active" ? "停用" : "启用");
      statusButton.disabled = item.userId === currentUser?.userId;
      statusButton.addEventListener("click", async () => {
        await api(`/api/admin/users/${encodeURIComponent(item.userId)}/status`, {
          method: "POST",
          body: JSON.stringify({ status: item.status === "active" ? "disabled" : "active" })
        });
        await renderUserAdmin();
      });
      const resetButton = el("button", "topbar-action", "重置密码");
      resetButton.disabled = item.userId === currentUser?.userId;
      resetButton.addEventListener("click", async () => {
        await api(`/api/admin/users/${encodeURIComponent(item.userId)}/reset-password`, {
          method: "POST",
          body: "{}"
        });
        await renderUserAdmin();
      });
      actions.append(statusButton, resetButton);
      return [
        `${item.displayName} (${item.loginName})`,
        item.role,
        item.status,
        item.mustChangePassword ? "是" : "否",
        actions
      ];
    });
    document.getElementById("managementContent").append(table(["用户", "角色", "状态", "需改密", "操作"], rows));
  }

  function bindAuthInteractions() {
    document.getElementById("loginForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const errorNode = document.getElementById("loginError");
      errorNode.textContent = "";
      try {
        const result = await api("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({
            login_name: document.getElementById("loginName").value,
            password: document.getElementById("loginPassword").value
          })
        });
        currentUser = result.user;
        if (currentUser.mustChangePassword) showPasswordChange();
        else {
          showAgentHub({ updateAddress: true });
          await loadAgentHub();
        }
      } catch (error) {
        errorNode.textContent = error.message === "login_temporarily_locked" ? "登录失败次数过多，请稍后再试。" : "账号或密码错误。";
      }
    });
    document.getElementById("changePasswordForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const errorNode = document.getElementById("changePasswordError");
      const nextPassword = document.getElementById("newPassword").value;
      if (nextPassword !== document.getElementById("confirmPassword").value) {
        errorNode.textContent = "两次新密码不一致。";
        return;
      }
      try {
        const result = await api("/api/auth/change-password", {
          method: "POST",
          body: JSON.stringify({
            current_password: document.getElementById("currentPassword").value,
            new_password: nextPassword
          })
        });
        currentUser = result.user;
        document.getElementById("passwordModal").hidden = true;
        if (passwordChangeForced || currentScreen === "hub") {
          showAgentHub({ updateAddress: passwordChangeForced });
          await loadAgentHub();
        } else {
          showAgentWorkspace();
          if (job || workbench) renderAll();
          else await loadAgentWorkspace();
        }
      } catch (error) {
        errorNode.textContent = error.message === "current_password_invalid" ? "当前密码错误。" : "新密码至少 8 位，且不能继续使用初始密码。";
      }
    });
    document.getElementById("logoutButton").addEventListener("click", async () => {
      await api("/api/auth/logout", { method: "POST", body: "{}" }).catch(() => {});
      window.location.assign(agentHubUrl());
    });
    document.getElementById("changePasswordButton").addEventListener("click", () => {
      closeUserMenu();
      showPasswordChange({ forced: false });
    });
    document.getElementById("cancelPasswordChangeButton").addEventListener("click", () => {
      document.getElementById("passwordModal").hidden = true;
    });
    document.getElementById("userAdminButton").addEventListener("click", async () => {
      closeUserMenu();
      if (currentScreen !== "workspace") {
        setCurrentUrl(workspacePath({ module: "overview", keepProgressTarget: false }));
        showAgentWorkspace();
        await loadAgentWorkspace();
      }
      renderUserAdmin().catch(showError);
    });
    document.getElementById("managementCloseButton").addEventListener("click", () => {
      document.getElementById("managementPanel").hidden = true;
    });
  }

  function bindInteractions() {
    document.getElementById("progressRefreshButton").addEventListener("click", () => {
      refreshProgressFromButton();
    });
    document.getElementById("chatForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const input = document.getElementById("chatInput");
      const text = input.value.trim();
      input.value = "";
      await submitConversationInput(text);
    });
    document.getElementById("startWorkflowButton").addEventListener("click", () => {
      startWorkflow();
    });
  }

  async function submitConversationInput(text) {
      const normalized = String(text || "").trim();
      if (!normalized || busy || viewOnly) return;
      message("user", normalized);
      setBusy(true);
      try {
        if (job) {
          await submitJobCommand(normalized);
          return;
        }
        const intake = await api("/api/launch/intake", {
          method: "POST",
          body: JSON.stringify({ user_intent: normalized })
        });
        mergeIntake(intake);
        const missing = missingFields();
        const label = parserLabel(intake.parseSource);
        const identified = requiredFields().length - missing.length;
        message("agent", identified === 0
          ? "我只处理推广路线、游戏标识和账户 ID；请补充所需信息。"
          : (missing.length
            ? `${label}，已识别 ${identified}/${requiredFields().length} 项；请补充：${missing.map((field) => field.label).join("、")}`
            : `${label}，三项输入已规范化；请核对后点击“启动流程”。`));
      } catch (error) {
        showError(error);
      } finally {
        setBusy(false);
      }
  }

  function bindShellInteractions() {
    document.getElementById("brandHomeButton").addEventListener("click", async () => {
      showAgentHub({ updateAddress: true });
      await loadAgentHub();
    });
    document.getElementById("backToAgentsButton").addEventListener("click", async () => {
      showAgentHub({ updateAddress: true });
      await loadAgentHub();
    });
    document.getElementById("userMenuButton").addEventListener("click", (event) => {
      event.stopPropagation();
      const menu = document.getElementById("userMenu");
      const opening = menu.hidden;
      menu.hidden = !opening;
      document.getElementById("userMenuButton").setAttribute("aria-expanded", String(opening));
    });
    document.getElementById("userMenu").addEventListener("click", (event) => event.stopPropagation());
    document.addEventListener("click", closeUserMenu);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeUserMenu();
        if (!passwordChangeForced) document.getElementById("passwordModal").hidden = true;
        closeModelConfig();
      }
    });
    document.getElementById("modelConfigButton").addEventListener("click", async () => {
      try {
        await loadModelConfig();
        document.getElementById("modelConfigModal").hidden = false;
      } catch (error) {
        showError(error);
      }
    });
    document.getElementById("modelConfigCloseButton").addEventListener("click", closeModelConfig);
    document.getElementById("modelConfigCancelButton").addEventListener("click", closeModelConfig);
    document.getElementById("modelConfigForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await saveModelConfig({ preserveEnabled: true });
        closeModelConfig();
      } catch (error) {
        document.getElementById("modelConfigError").textContent = error.message === "model_config_test_required"
          ? "请先完成连接测试，再启用模型解析。"
          : "配置格式无效，或当前配置无法保存。";
      }
    });
    document.getElementById("modelTestButton").addEventListener("click", async () => {
      const errorNode = document.getElementById("modelConfigError");
      errorNode.textContent = "";
      try {
        await saveModelConfig({ preserveEnabled: true });
        const result = await api("/api/agents/launch_creation/model-config/test", {
          method: "POST",
          body: "{}"
        });
        renderModelConfig(result.config);
      } catch (error) {
        errorNode.textContent = error.message === "model_connection_test_failed"
          ? "连接测试未通过，请检查配置后重试。"
          : "请先填写 API Base、模型名，并配置 API Key。";
        await loadModelConfig().catch(() => {});
      }
    });
    document.querySelectorAll(".agent-module-button").forEach((button) => {
      button.addEventListener("click", () => selectModule(button.dataset.module, { updateAddress: true }));
    });
    document.getElementById("statisticsScope").addEventListener("change", (event) => {
      renderStatistics(event.target.value).catch(() => {});
    });
    document.getElementById("sidebarCollapseButton").addEventListener("click", () => {
      const workspace = document.getElementById("workbenchShell");
      const collapsed = workspace.classList.toggle("sidebar-is-collapsed");
      const button = document.getElementById("sidebarCollapseButton");
      button.textContent = collapsed ? "›" : "‹";
      button.setAttribute("aria-label", collapsed ? "展开模块导航" : "收起模块导航");
    });
  }

  async function loadWorkspace() {
    const target = parseWorkbenchProgressTarget(window.location.search);
    if (target.status === "invalid") throw new Error(target.error);
    rootHome = target.status === "home";
    viewOnly = target.status === "job";
    if (target.status === "job") {
      setJobView(await api(jobViewPath(target.jobId)));
    } else if (target.status === "case") {
      const caseView = await api(`/api/workflow-cases/${encodeURIComponent(target.caseId)}`);
      const latestJobId = caseView.summary?.latest_job_id || "";
      if (latestJobId) {
        draftCaseId = target.caseId;
        setJobView(await api(jobViewPath(latestJobId)));
      } else {
        workbench = await api("/api/launch/workbench");
      }
    } else {
      workbench = await api("/api/launch/workbench");
    }
    renderAll();
  }

  async function loadAgentWorkspace() {
    await Promise.all([loadAgentProfile(), loadWorkspace(), loadModelConfig().catch(() => null)]);
    renderAgentOverview();
    await renderModuleData(activeModule);
  }

  async function init() {
    bindInteractions();
    bindAuthInteractions();
    bindShellInteractions();
    try {
      const session = await api("/api/auth/me");
      currentUser = session.user;
      if (currentUser.mustChangePassword) {
        showPasswordChange();
        return;
      }
      if (window.location.pathname === LAUNCH_CREATION_AGENT_PATH) {
        showAgentWorkspace();
        await loadAgentWorkspace();
      } else {
        showAgentHub({ updateAddress: window.location.pathname !== AGENT_HUB_PATH });
        await loadAgentHub();
      }
    } catch (error) {
      if (error.status === 401) {
        showLogin();
        return;
      }
      document.getElementById("agentStatus").textContent = "加载失败";
      showAgentWorkspace();
      showError(error);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
  window.addEventListener("focus", () => {
    if (job?.jobId) refreshProgress().catch(() => {});
  });
})();
