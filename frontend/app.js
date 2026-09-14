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
import {
  freezeConfirmationSubmission,
  resolveJobCommandSubmission
} from "./workbench-command-submission.mjs";

(function () {
  if (window.__MWBV2_TEST_WORKBENCH__ === true) {
    document.getElementById("testEnvironmentBanner")?.removeAttribute("hidden");
    document.documentElement.classList.add("test-workbench");
  }
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
  let activeConfirmationSubmission = null;
  let rootHome = false;
  let currentUser = null;
  let agentProfile = null;
  let modelConfig = null;
  let currentScreen = "hub";
  let activeModule = "conversation";
  let passwordChangeForced = false;
  const chatMessages = [];
  const focusedNodes = new Map();
  const expandedPhases = new Set();
  const collapsedPhases = new Set();
  const expandedNodeDetails = new Set();
  const agentModules = new Set(["overview", "conversation", "memory", "knowledge", "skills", "statistics"]);
  const draftIntake = {
    schema_version: "",
    operation: "",
    route_id: "",
    game_code: "",
    advertiser_id: "",
    project_id: "",
    origin_resource_ids: []
  };
  let intakeMode = "natural";
  let intakeIssues = [];
  let intakeParseSource = "rules";
  let intakeModelAssist = null;
  let intakeCanStart = false;
  let validatedIntakeRequest = null;
  let startupFeedback = null;
  let matchedAppendProject = null;
  let projectRecommendations = null;
  let projectRecommendationAccountId = "";
  let projectRecommendationSequence = 0;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function refreshIcons() {
    if (window.lucide) window.lucide.createIcons();
  }

  function formatVerifiedAt(value) {
    const date = new Date(value || "");
    if (Number.isNaN(date.getTime())) return "未知";
    const parts = new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
    }).formatToParts(date).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
    return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}（北京时间）`;
  }

  function resizeChatInput() {
    const input = document.getElementById("chatInput");
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 116)}px`;
  }

  async function api(path, options = {}) {
    const { diagnosticStage = "", ...requestOptions } = options;
    const response = await fetch(path, {
      ...requestOptions,
      headers: {
        "content-type": "application/json",
        ...(requestOptions.headers || {}),
        ...(diagnosticStage ? { "x-workbench-diagnostic-stage": diagnosticStage } : {})
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

  const AGENT_PREVIEWS = Object.freeze([
    Object.freeze({
      icon: "情",
      displayName: "市场情报",
      description: "整理市场、竞品与素材信息，形成有来源依据的情报摘要，为投放决策提供参考。"
    }),
    Object.freeze({
      icon: "策",
      displayName: "投放策略",
      description: "结合市场情报、业务目标与投放数据，形成投放方案和执行建议。"
    })
  ]);

  function renderPreviewCard(preview) {
    const card = el("article", "agent-card agent-card-coming-soon");
    card.append(el("span", "agent-card-icon is-muted", preview.icon));
    const heading = el("div", "agent-card-heading");
    heading.append(el("h2", "", preview.displayName));
    heading.append(el("span", "agent-availability agent-availability-preview", "筹备中"));
    card.append(heading);
    card.append(el("p", "", preview.description));
    const disabled = el("button", "agent-open-button", "敬请期待");
    disabled.type = "button";
    disabled.disabled = true;
    card.append(disabled);
    return card;
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
    AGENT_PREVIEWS.forEach((preview) => grid.append(renderPreviewCard(preview)));
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
    if ((job?.operation || job?.intake?.operation || draftIntake.operation) === "append_project_videos") {
      return [
        { key: "advertiser_id", label: "账户 ID" },
        { key: "project_id", label: "项目 ID" },
        { key: "origin_resource_ids", label: "视频标识码" }
      ];
    }
    if ((job?.operation || job?.intake?.operation || draftIntake.operation) === "create_std_project") {
      return [
        { key: "route_id", label: "推广路线" },
        { key: "game_code", label: "游戏标识" },
        { key: "advertiser_id", label: "账户 ID" }
      ];
    }
    return [];
  }

  function fieldValue(intake, key) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    return intake?.[key] || intake?.[camelKey] || "";
  }

  function activeIntake() {
    return job?.intake || draftIntake;
  }

  function missingFields() {
    return requiredFields().filter((field) => {
      const value = fieldValue(draftIntake, field.key);
      return !value || (Array.isArray(value) && value.length === 0);
    });
  }

  function canStartCurrentDraft() {
    const fields = requiredFields();
    const hasIssues = intakeIssues.length > 0;
    const modelAssistFailed = intakeModelAssist?.attempted === true && intakeModelAssist?.outcome !== "accepted";
    return !job && intakeCanStart && Boolean(validatedIntakeRequest) && fields.length > 0 &&
      missingFields().length === 0 && !hasIssues && !modelAssistFailed;
  }

  function intakeSummary() {
    if (draftIntake.operation === "append_project_videos") {
      return `追加视频 · 账户 ${draftIntake.advertiser_id} · 项目 ${draftIntake.project_id} · ${draftIntake.origin_resource_ids.length} 条。`;
    }
    return `新建标准项目 · ${draftIntake.game_code} · 账户 ${draftIntake.advertiser_id}。`;
  }

  function accountBootstrapMessage(blockers = []) {
    const blocker = String(Array.isArray(blockers) ? blockers[0] || "" : "");
    if (blocker.startsWith("account_identity_unresolved:")) return "账户索引未确认唯一的账户身份。";
    if (blocker.startsWith("account_query_failed:")) return "账户索引查询未完成。";
    if (blocker === "credential_not_active:missing") return "服务未读取到乾坤授权配置。";
    if (blocker.startsWith("credential_not_active:")) return "账户乾坤授权未处于可用状态。";
    if (blocker === "account_bootstrap_failed") return "账户预检暂未完成。";
    return "账户身份预检尚未完成。";
  }

  function accountBootstrapNextStep(blockers = []) {
    const list = Array.isArray(blockers) ? blockers : [];
    return list.includes("credential_not_active:missing")
      ? "请联系管理员修复服务配置后重新检查。"
      : "请检查账户配置或稍后重新检查。";
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
    return job.confirmationPreview || null;
  }

  function setJobView(nextJob) {
    job = nextJob || null;
    if (job && startupFeedback?.status === "starting") startupFeedback = null;
    jobRevision += 1;
  }

  function renderProjectRecommendations(stream) {
    const recommendation = projectRecommendations;
    if (!recommendation || job || draftIntake.operation !== "append_project_videos" || draftIntake.project_id) return;
    const card = el("section", "confirmation-card project-recommendation-card");
    card.append(el("strong", "", "项目推荐（只读）"));
    if (recommendation.status === "loading") {
      card.append(el("p", "", "正在读取该账户的可选项目…"));
    } else if (recommendation.status === "failed") {
      card.append(el("p", "", "项目推荐暂不可用；请稍后重试或手动发送带“项目”标签的项目 ID。"));
    } else if (recommendation.status === "empty") {
      card.append(el("p", "", "该账户暂无已验证项目记录。"));
    } else {
      card.append(el("p", "", "以下为已验证项目，按最近验证时间排序；请选择一个。"));
      const list = el("div", "project-recommendation-list");
      for (const item of recommendation.items || []) {
        const row = el("div", "project-recommendation-row");
        const details = el("div", "project-recommendation-details");
        details.append(el("strong", "", item.projectName || item.projectId));
        details.append(el("span", "", `ID：${item.projectId}`));
        details.append(el("span", "", `最近验证：${formatVerifiedAt(item.verifiedAt)}`));
        row.append(details);
        const select = el("button", "conversation-preset", "选择此项目");
        select.type = "button";
        select.disabled = busy || viewOnly;
        select.addEventListener("click", () => selectRecommendedProject(item.projectId));
        row.append(select); list.append(row);
      }
      card.append(list);
    }
    stream.append(card);
  }

  async function selectRecommendedProject(projectId) {
    if (!/^\d{8,24}$/.test(String(projectId || "")) || busy || viewOnly) return;
    message("user", `项目：${projectId}`);
    setBusy(true);
    try {
      const intake = await api("/api/launch/intake", {
        method: "POST",
        body: JSON.stringify({ user_intent: `项目：${projectId}`, draft: { ...draftIntake } })
      });
      mergeIntake(intake);
      await refreshProjectRecommendations();
      message("agent", intake.reply || "项目需要核对后再试。");
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  }

  async function refreshProjectRecommendations() {
    const eligible = !job && intakeMode === "natural" && draftIntake.operation === "append_project_videos" &&
      /^\d{8,24}$/.test(draftIntake.advertiser_id) && !draftIntake.project_id && intakeIssues.length === 0;
    if (!eligible) { projectRecommendations = null; projectRecommendationAccountId = ""; return; }
    if (projectRecommendationAccountId === draftIntake.advertiser_id && projectRecommendations?.status !== "failed") return;
    const accountId = draftIntake.advertiser_id;
    const sequence = ++projectRecommendationSequence;
    projectRecommendationAccountId = accountId;
    projectRecommendations = { status: "loading", items: [] }; renderAll();
    try {
      const result = await api(`/api/launch/project-recommendations?advertiser_id=${encodeURIComponent(draftIntake.advertiser_id)}`, { method: "GET" });
      if (sequence !== projectRecommendationSequence || projectRecommendationAccountId !== draftIntake.advertiser_id || draftIntake.project_id) return;
      projectRecommendations = result;
    } catch { projectRecommendations = { status: "failed", items: [] }; }
    renderAll();
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
      ? `${preview.actions?.length || 0} 类资源动作累计调用上限（不含只读核验）`
      : "调用上限";
    [
      ["项目", preview.projectName || "待生成"],
      ["账户", preview.advertiser || "已脱敏"],
      [callLimitLabel, `${preview.maximumPlatformCalls || 1} 次`],
      ...(preview.planKind === "std_project_create" ? [["Case 创建上限", `${preview.maximumCreateAttempts || 1} 次`]] : []),
      ...(preview.targetEmptyBrandOmit ? [["品牌模式", preview.targetEmptyBrandOmit.label]] : []),
      ...(preview.materialSummary ? [
        ["必需视频", `${preview.materialSummary.videoCount} 条`],
        ["引导视频", preview.materialSummary.guideVideoPolicy],
        ["视频封面", preview.materialSummary.coverPolicy],
        ["品牌模式", preview.materialSummary.brandMode]
      ] : []),
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
      limits.append(el("summary", "", "查看资源内容与每项调用上限"));
      const list = el("ul", "");
      for (const item of preview.actionLimits) {
        const presentation = item.presentation;
        const description = presentation?.description || "数量未记录";
        const batch = Number(presentation?.batchCount || 0) > 0 ? `，${presentation.batchCount} 批` : "";
        const row = el("li", "", `${presentation?.label || item.actionType}：${description}${batch}；平台写入调用上限 ${item.maximumPlatformCalls} 次`);
        row.append(el("small", "confirmation-action-code", `动作代码：${item.actionType}`));
        list.append(row);
      }
      limits.append(list);
      card.append(limits);
    }
    const canExecute = job?.executionAvailability?.canExecuteOnce === true;
    const submittingThisPlan = activeConfirmationSubmission?.jobId === job?.jobId &&
      activeConfirmationSubmission?.planId === preview.planId &&
      activeConfirmationSubmission?.planHash === preview.planHash;
    const button = el("button", "confirmation-button", submittingThisPlan
      ? "提交中…"
      : canExecute ? (preview.confirmationPhrase || "确认创建") : "当前 Plan 不可确认");
    button.type = "button";
    button.disabled = busy || !canExecute;
    button.setAttribute("aria-busy", submittingThisPlan ? "true" : "false");
    button.addEventListener("click", async () => {
      if (busy) return;
      const submission = freezeConfirmationSubmission({ job, preview });
      if (!submission) {
        message("agent", "确认卡已失效；已保留当前状态，请刷新后按最新确认卡操作。");
        return;
      }
      activeConfirmationSubmission = submission;
      busy = true;
      button.disabled = true;
      button.textContent = "提交中…";
      button.setAttribute("aria-busy", "true");
      try {
        await submitJobCommand(submission.message, submission);
      } catch (error) {
        showError(error, { stage: "提交确认" });
      } finally {
        activeConfirmationSubmission = null;
        busy = false;
        renderAll();
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
      return "当前 Attempt 已失败并安全结束。输入“重新只读准备”可准备下一 Attempt；生成确认卡前不会创建项目。";
    }
    const readonlyRecovery = readonlyRecoveryGuidance(gate);
    if (job.isLatestCaseJob && !viewOnly && readonlyRecovery) return readonlyRecovery.message;
    return gate.progressNarrative?.message || "流程状态正在更新，请刷新查看。";
  }

  function parserLabel(source = "rules", modelAssist = intakeModelAssist) {
    if (source === "structured_json") return "已使用标准 JSON 校验";
    if (source === "llm" || source === "llm_assisted") {
      const labels = { route_id: "推广路线", game_code: "游戏标识", advertiser_id: "账户 ID" };
      const slots = Array.isArray(modelAssist?.accepted_slots) ? modelAssist.accepted_slots.map((key) => labels[key]).filter(Boolean) : [];
      return `已使用模型辅助解析${slots.length ? `：${slots.join("、")}` : ""}`;
    }
    if (source === "rules_fallback") {
      const reasons = {
        timeout: "模型请求超时",
        provider_rejected: "模型服务拒绝请求",
        non_json: "模型未返回有效 JSON",
        intent_confidence_rejected: "模型意图或置信度未通过校验",
        slot_evidence_rejected: "模型槽位值或原文证据未通过校验",
        provider_unavailable: "模型暂不可用"
      };
      return `${reasons[modelAssist?.outcome] || "模型结果未通过校验"}，已回退规则解析`;
    }
    return "已使用规则解析";
  }

  function renderConversationPresets() {
    const container = document.getElementById("conversationPresets");
    const presets = !job && !draftIntake.operation
      ? [
          { label: "新建项目", message: "新建项目" },
          { label: "追加视频", message: "追加视频" },
          { label: "能做什么", message: "你能做什么" }
        ]
      : (agentProfile?.conversationPresets?.[job ? "active" : "intake"] || []);
    const visiblePresets = draftIntake.operation === "append_project_videos"
      ? presets.filter((preset) => !/(路线|游戏|route|game)/i.test(`${preset.label || ""} ${preset.message || ""}`))
      : presets;
    container.innerHTML = "";
    container.hidden = visiblePresets.length === 0;
    const disabled = busy || viewOnly || Boolean(job && !job.isLatestCaseJob);
    for (const preset of visiblePresets) {
      const button = el("button", "conversation-preset", preset.label);
      button.type = "button";
      button.disabled = disabled;
      button.addEventListener("click", () => submitConversationInput(preset.message));
      container.append(button);
    }
    const currentGate = String(job?.caseGate?.currentGate || "").trim();
    if (job?.isLatestCaseJob && !viewOnly && currentGate === "run_fresh_readiness") {
      const readinessButton = el("button", "conversation-preset", "开始只读核验");
      readinessButton.type = "button";
      readinessButton.disabled = disabled;
      readinessButton.addEventListener("click", () => submitJobCommand("继续执行"));
      container.append(readinessButton);
      container.hidden = false;
    } else {
      const readonlyRecovery = readonlyRecoveryGuidance(job?.caseGate);
      if (job?.isLatestCaseJob && !viewOnly && readonlyRecovery?.placeholder?.includes("重新只读准备")) {
        const recoveryButton = el("button", "conversation-preset", "重新只读准备");
        recoveryButton.type = "button";
        recoveryButton.disabled = disabled;
        recoveryButton.addEventListener("click", () => submitJobCommand("重新只读准备"));
        container.append(recoveryButton);
        container.hidden = false;
      }
    }
  }

  function renderChat() {
    const stream = document.getElementById("chatStream");
    stream.innerHTML = "";
    const messages = [...chatMessages];
    if (!messages.length && !job) {
      messages.push({ role: "agent", text: "请输入投放需求，比如新建项目、追加视频；也可以问我能做什么。" });
    }
    for (const item of messages) {
      if (item?.text) appendRenderedMessage(stream, item.role === "user" ? "user" : "agent", item.text);
    }
    const current = operationalMessage();
    if (current) appendRenderedMessage(stream, "agent", current);
    renderStartCard(stream);
    renderProjectRecommendations(stream);
    renderConfirmationCard(stream);
    stream.scrollTop = stream.scrollHeight;
  }

  function renderStartCard(stream) {
    const ready = canStartCurrentDraft();
    if (job || (!ready && !startupFeedback)) return;
    const feedback = startupFeedback || {};
    const blocked = feedback.status === "blocked";
    const starting = feedback.status === "starting";
    const card = el("section", `conversation-start-card${blocked ? " is-blocked" : ""}${starting ? " is-starting" : ""}`);
    card.setAttribute("aria-label", "流程启动检查");
    card.append(el("strong", "", blocked ? "启动受阻" : starting ? "正在启动流程" : "输入已齐全，是否开始检查？"));
    card.append(el("p", "", feedback.message || (starting ? feedback.stage : intakeSummary())));
    if (starting || ready) {
      const button = el("button", "start-button", starting ? "启动中…" : blocked ? "重新检查" : "启动流程");
      button.type = "button";
      button.disabled = starting || busy || viewOnly;
      button.addEventListener("click", () => startWorkflow());
      card.append(button);
    }
    stream.append(card);
  }

  function renderIntake() {
    const intake = activeIntake();
    const fields = requiredFields();
    const agentStatus = document.getElementById("agentStatus");
    agentStatus.textContent = viewOnly
      ? "历史运行，只读"
      : job
        ? (startupFeedback?.status === "blocked" ? "启动受阻" : (job?.caseGate?.rootBlockerCodes?.length ? "流程受阻" : (job?.caseGate?.progressNarrative?.shortLabel || "等待处理")))
        : (startupFeedback?.status === "blocked" ? "启动受阻" : startupFeedback?.status === "starting" ? "启动中" : !draftIntake.operation ? "等待输入需求" : intakeCanStart ? "待启动" : "等待补齐");

    const intentCard = document.getElementById("intentCard");
    intentCard.innerHTML = "";
    for (const field of fields) {
      const value = fieldValue(intake, field.key);
      if (!value || (Array.isArray(value) && value.length === 0)) continue;
      const item = el("div", "identity-item");
      item.append(el("span", "", field.label));
      item.append(el("strong", "", Array.isArray(value) ? `${value.length} 条` : value));
      intentCard.append(item);
    }
    if (!job && matchedAppendProject) {
      const item = el("div", "identity-item");
      item.append(el("span", "", "已匹配项目"));
      item.append(el("strong", "", `${matchedAppendProject.projectName || matchedAppendProject.projectId} · ${matchedAppendProject.gameCode || ""}`));
      intentCard.append(item);
    }

    const tip = document.getElementById("configTip");
    if (tip) tip.textContent = parserLabel(intakeParseSource);
    renderIntakeMode();
  }

  function clearDraftIntake() {
    for (const key of Object.keys(draftIntake)) draftIntake[key] = "";
    draftIntake.schema_version = "";
    draftIntake.operation = "";
    draftIntake.origin_resource_ids = [];
    intakeIssues = [];
    intakeParseSource = "rules";
    intakeModelAssist = null;
    intakeCanStart = false;
    startupFeedback = null;
    validatedIntakeRequest = null;
    matchedAppendProject = null;
    draftCaseId = "";
    draftCaseKey = "";
    projectRecommendations = null;
    projectRecommendationAccountId = "";
  }

  function renderIntakeMode() {
    const jsonMode = intakeMode === "json";
    const naturalForm = document.getElementById("chatForm");
    const jsonPanel = document.getElementById("structuredRequestPanel");
    if (naturalForm) naturalForm.hidden = jsonMode;
    if (jsonPanel) jsonPanel.hidden = !jsonMode;
    for (const button of document.querySelectorAll("[data-intake-mode]")) {
      const selected = button.dataset.intakeMode === intakeMode;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-selected", String(selected));
      button.disabled = Boolean(job) || busy || viewOnly;
    }
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
    const rail = document.getElementById("workflowRail");
    rail.hidden = !job && !startupFeedback;
    if (!job) {
      if (!startupFeedback) return;
      const blocked = startupFeedback.status === "blocked";
      document.getElementById("workflowHeading").textContent = blocked ? "启动受阻" : "启动检查";
      const grid = document.getElementById("workflowGrid");
      grid.innerHTML = "";
      const state = el("section", `workflow-startup-state${blocked ? " is-blocked" : ""}`);
      state.append(el("strong", "", blocked ? "流程尚未建立" : "正在建立流程"));
      state.append(el("p", "", startupFeedback.message || startupFeedback.stage || "正在处理启动请求。"));
      grid.append(state);
      return;
    }
    const workflowPhases = phases();
    const currentNodeNumber = Number(job?.progress?.currentNodeNumber || job?.progress?.current_node || 0);
    const currentPhaseKey = workflowPhases.find((phase) => (phase.nodes || []).some((node) => Number(node.number) === currentNodeNumber))?.id || "";
    const grid = document.getElementById("workflowGrid");
    grid.innerHTML = "";
    if (startupFeedback?.status === "blocked") {
      const state = el("section", "workflow-startup-state is-blocked");
      state.append(el("strong", "", "启动阶段未完成"));
      state.append(el("p", "", startupFeedback.message));
      grid.append(state);
    }

    for (const phase of workflowPhases) {
      const nodes = phase.nodes || [];
      const section = el("section", "phase-section");
      const title = el("div", "phase-heading");
      const complete = nodes.length > 0 && nodes.every((node) => node.status === "passed");
      const phaseKey = phase.id || phase.title || phase.phase || "";
      const activePhase = phaseKey === currentPhaseKey || (!currentPhaseKey && phase === workflowPhases.find((candidate) => (candidate.nodes || []).some((node) => node.status !== "passed")));
      const expanded = collapsedPhases.has(phaseKey) ? false : (expandedPhases.has(phaseKey) || activePhase);
      const headingButton = el("button", "phase-heading-button");
      headingButton.type = "button";
      headingButton.setAttribute("aria-expanded", String(expanded));
      headingButton.append(statusDot(complete ? "passed" : "waiting", complete ? "阶段通过" : "阶段未全部通过"));
      headingButton.append(el("h3", "phase-title", phase.title || phase.phase || ""));
      headingButton.append(el("span", "phase-toggle", expanded ? "收起" : "展开"));
      headingButton.addEventListener("click", () => {
        if (expanded) {
          expandedPhases.delete(phaseKey);
          collapsedPhases.add(phaseKey);
        } else {
          collapsedPhases.delete(phaseKey);
          expandedPhases.add(phaseKey);
        }
        renderWorkflow();
      });
      title.append(headingButton);
      section.append(title);
      if (!expanded) {
        grid.append(section);
        continue;
      }

      const flow = el("div", "node-flow");
      nodes.forEach((node, index) => {
        const displayStatus = node.status;
        if (index) flow.append(el("span", "node-arrow", "→"));
        const focused = focusNode(phase);
        const nodeButton = el("button", "node-pill");
        nodeButton.type = "button";
        nodeButton.title = statusTitle(node);
        nodeButton.setAttribute("aria-pressed", String(focused?.id === node.id));
        if (focused?.id === node.id) nodeButton.classList.add("is-selected");
        nodeButton.append(el("span", "node-marker", String(node.number || "")));
        nodeButton.append(el("span", "node-pill-label", node.name || ""));
        nodeButton.append(statusDot(displayStatus, statusTitle(node)));
        nodeButton.addEventListener("click", () => {
          focusedNodes.set(phase.id || phase.title || phase.phase || "", node.id);
          renderWorkflow();
        });
        flow.append(nodeButton);
      });
      section.append(flow);

      const focused = focusNode(phase);
      const detailsKey = `${phaseKey}:${focused?.id || ""}`;
      if (focused?.children?.length && expandedNodeDetails.has(detailsKey)) {
        const visibleChildren = focused.children;
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
      if (focused?.children?.length && !expandedNodeDetails.has(detailsKey)) {
        const details = el("button", "subnode-details-toggle", "查看检查项");
        details.type = "button";
        details.addEventListener("click", () => {
          expandedNodeDetails.add(detailsKey);
          renderWorkflow();
        });
        section.append(details);
      }
      grid.append(section);
    }

    const nodeCount = allNodes().length;
    const operation = job?.operation || job?.intake?.operation || draftIntake.operation;
    const workflowTitle = job?.caseGate?.rootBlockerCodes?.length ? "流程受阻" : (operation === "append_project_videos" ? "追加视频" : "新建项目");
    document.getElementById("workflowHeading").textContent = `${workflowTitle} · ${workflowPhases.length} 阶段 · ${nodeCount} 节点`;
  }

  function renderCommand() {
    const commandBar = document.getElementById("commandBar");
    commandBar.hidden = !job;
    if (!job) return;
    const nodes = allNodes();
    const preview = confirmationPreview();
    document.getElementById("progressText").textContent = progressPresentation({
      nodes,
      progress: job?.progress,
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
          ? "输入“重新只读准备”准备下一 Attempt，或输入“查看状态”..."
          : job?.caseGate?.currentGate === "run_fresh_readiness"
            ? "点击“开始只读核验”，或输入“继续执行”..."
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

  function showError(error, { stage = "" } = {}) {
    if (isLaunchRequestValidationError(error)) {
      message("agent", "启动参数校验失败，请重新检查后再试。");
      return;
    }
    if (error?.message === "account_bootstrap_blocked") {
      message("agent", `账户预检未通过，流程尚未建立。${accountBootstrapMessage(error.details?.blockers)} ${accountBootstrapNextStep(error.details?.blockers)}`);
      return;
    }
    if (error?.status >= 500 || error?.message === "internal_error") {
      const fingerprint = String(error.details?.diagnostic_fingerprint || "");
      const diagnosticCode = /^sha256:[a-f0-9]{64}$/.test(fingerprint) ? fingerprint : "未返回";
      message("agent", `“${stage || "服务处理"}”未完成；已刷新当前状态，请以确认卡和当前进度为准。诊断码：${diagnosticCode}。请记录诊断码后暂停重复提交。`);
      return;
    }
    const owner = error.details?.ownerDisplayName ? `；账户归属人：${error.details.ownerDisplayName}` : "";
    message("agent", `${error.message}${owner}。请输入需要修正的内容后重试。`);
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

  async function runWorkflow(jobId, { diagnosticStage = "" } = {}) {
    return withProgressPolling(async () => {
      await api(`/api/launch/jobs/${encodeURIComponent(jobId)}/run`, {
        method: "POST",
        body: JSON.stringify({ mode: "dry_run" }),
        diagnosticStage
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

  async function ensureWorkflowCase({ request, diagnosticStage = "" } = {}) {
    if (draftCaseId) return { caseId: draftCaseId, reusedActiveCase: false };
    try {
      const workflowCase = await api("/api/workflow-cases", {
        method: "POST",
        diagnosticStage,
        body: JSON.stringify({
          case_key: createCaseKey(),
          request,
          business_goal: draftIntake.operation === "append_project_videos"
            ? "从工作台启动一次受控项目视频追加流程。"
            : "从工作台启动一次受控标准项目创建流程。",
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
    if (busy || viewOnly || job || !canStartCurrentDraft()) return;
    startupFeedback = { status: "starting", stage: "正在核验账户并建立流程" };
    setBusy(true);
    let startupStage = "创建 Case";
    try {
      const request = frozenLaunchRequest();
      const selectedCase = await ensureWorkflowCase({ request, diagnosticStage: "start_workflow_create_case" });
      if (selectedCase.approvedReplacementCase && selectedCase.replacementJobId) {
        startupStage = "启动 readonly";
        setJobView(await api(jobViewPath(selectedCase.replacementJobId)));
        setActiveCaseUrl(selectedCase.caseId);
        if (selectedCase.requiresInitialReadonly) {
          message("agent", "已建立唯一的一次性替代 Case 与 fresh Job，开始重新核验视频、封面和引导视频。");
          await runWorkflow(selectedCase.replacementJobId, { diagnosticStage: "start_workflow_run_readonly" });
        }
        if (selectedCase.requiresReadonlyRecovery) {
          message("agent", "三项输入已确认；将通过既有恢复链路建立或复用 fresh Job，仅重新执行 readonly 核验，不确认或创建平台对象。");
          await submitJobCommand("重新只读准备");
        }
        await refreshProgress();
        return;
      }
      if (selectedCase.reusedActiveCase) {
        startupFeedback = null;
        window.location.assign(workbenchCaseUrl(selectedCase.caseId));
        return;
      }
      startupStage = "创建 fresh Job";
      startupFeedback = { status: "starting", stage: "账户预检已通过，正在建立运行记录" };
      renderAll();
      const created = await api("/api/launch/jobs", {
        method: "POST",
        diagnosticStage: "start_workflow_create_job",
        body: JSON.stringify({
          request,
          case_id: selectedCase.caseId,
          source_usage: "runtime_truth",
          source_record_ref: `workbench:${draftIntake.schema_version}`
        })
      });
      setJobView(created);
      setActiveCaseUrl(job.caseId);
      startupStage = "启动 readonly";
      renderAll();
      await refreshProgress();
      message("agent", "已建立 Case 与 fresh Job，开始执行 readonly workflow。");
      await runWorkflow(job.jobId, { diagnosticStage: "start_workflow_run_readonly" });
    } catch (error) {
      const validationError = isLaunchRequestValidationError(error);
      startupFeedback = {
        status: "blocked",
        stage: startupStage,
        message: error?.message === "account_bootstrap_blocked"
          ? `账户预检未通过，流程尚未建立。${accountBootstrapMessage(error.details?.blockers)} ${accountBootstrapNextStep(error.details?.blockers)}`
          : validationError
            ? "启动参数校验失败，请重新检查后再试。"
          : job
            ? `“${startupStage}”未完成；已保留当前节点进度，请查看状态后再处理。`
            : `“${startupStage}”未完成；当前未建立可继续的流程。请处理后重新检查。`
      };
      if (error?.message !== "account_bootstrap_blocked" && !validationError) showError(error, { stage: startupStage });
    } finally {
      setBusy(false);
    }
  }

  function mergeIntake(intake) {
    const request = intake?.draft || intake?.request || intake || {};
    draftIntake.schema_version = request.schema_version || "";
    draftIntake.operation = request.operation || "";
    for (const field of ["route_id", "game_code", "advertiser_id", "project_id", "origin_resource_ids"]) {
      if (Object.hasOwn(request, field)) draftIntake[field] = fieldValue(request, field);
    }
    intakeIssues = Array.isArray(intake?.issues) ? intake.issues : [];
    intakeParseSource = intake?.parse_source || intake?.parseSource || "rules";
    intakeModelAssist = intake?.model_assist || intake?.modelAssist || null;
    intakeCanStart = intake?.can_start === true;
    if (!job) startupFeedback = null;
    validatedIntakeRequest = intakeCanStart && intake?.request
      ? freezeLaunchRequestSnapshot(intake.request)
      : null;
    matchedAppendProject = intake?.project || null;
    draftCaseId = "";
    draftCaseKey = "";
  }

  function frozenLaunchRequest() {
    if (!validatedIntakeRequest) throw new Error("intake_request_not_validated");
    return validatedIntakeRequest;
  }

  function freezeLaunchRequestSnapshot(request) {
    const snapshot = { ...request };
    if (Array.isArray(request.origin_resource_ids)) {
      snapshot.origin_resource_ids = Object.freeze([...request.origin_resource_ids]);
    }
    return Object.freeze(snapshot);
  }

  function isLaunchRequestValidationError(error) {
    const fields = error?.details?.fields;
    return Array.isArray(fields) && /request (缺少必填字段|包含未知字段)/.test(String(error?.message || ""));
  }

  function setActiveCaseUrl(caseId) {
    if (!caseId) return;
    window.history.replaceState({}, "", workbenchCaseUrl(caseId));
  }

  async function submitJobCommand(text, submission = null) {
    const command = resolveJobCommandSubmission({
      job,
      preview: confirmationPreview(),
      message: text,
      submission
    });
    if (!command.jobId) throw new Error("job_command_context_missing");
    const result = await withProgressPolling(() => api(`/api/launch/jobs/${encodeURIComponent(command.jobId)}/command`, {
      method: "POST",
      body: JSON.stringify({
        message: command.message,
        expected_plan_id: command.planId,
        expected_plan_hash: command.planHash
      })
    }));
    setJobView(result.view || job);
    if (result.view?.caseId && result.view.caseId !== draftCaseId) {
      draftCaseId = result.view.caseId;
      setActiveCaseUrl(result.view.caseId);
    }
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
      resizeChatInput();
      await submitConversationInput(text);
    });
    const chatInput = document.getElementById("chatInput");
    chatInput.addEventListener("input", () => {
      resizeChatInput();
      if (intakeMode !== "natural" || job || !canStartCurrentDraft()) return;
      intakeCanStart = false;
      validatedIntakeRequest = null;
      matchedAppendProject = null;
      startupFeedback = null;
      renderAll();
    });
    chatInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
      event.preventDefault();
      document.getElementById("chatForm").requestSubmit();
    });
    for (const button of document.querySelectorAll("[data-intake-mode]")) {
      button.addEventListener("click", () => {
        if (busy || viewOnly || job) return;
        intakeMode = button.dataset.intakeMode || "natural";
        clearDraftIntake();
        document.getElementById("structuredRequestInput").value = intakeMode === "json" ? JSON.stringify(launchRequestTemplate(), null, 2) : "";
        renderAll();
      });
    }
    for (const button of document.querySelectorAll("[data-request-operation]")) {
      button.addEventListener("click", () => {
        if (busy || viewOnly || job) return;
        draftIntake.operation = button.dataset.requestOperation || "create_std_project";
        draftIntake.schema_version = draftIntake.operation === "append_project_videos" ? "launch-request.v2" : "launch-request.v1";
        draftIntake.project_id = "";
        draftIntake.origin_resource_ids = [];
        intakeCanStart = false;
        for (const item of document.querySelectorAll("[data-request-operation]")) item.classList.toggle("is-active", item === button);
        document.getElementById("structuredRequestInput").value = JSON.stringify(launchRequestTemplate(), null, 2);
        renderAll();
      });
    }
    document.getElementById("submitStructuredRequest").addEventListener("click", async () => {
      const input = document.getElementById("structuredRequestInput");
      let request;
      try {
        request = JSON.parse(input.value);
      } catch {
        clearDraftIntake();
        message("agent", "JSON 格式无效；请粘贴完整的标准请求后重新校验。");
        renderAll();
        return;
      }
      await submitStructuredRequest(request);
    });
    document.getElementById("structuredRequestInput").addEventListener("input", () => {
      if (intakeMode !== "json" || job) return;
      intakeCanStart = false;
      validatedIntakeRequest = null;
      matchedAppendProject = null;
      startupFeedback = null;
      renderAll();
    });
  }

  function launchRequestTemplate() {
    if (draftIntake.operation === "append_project_videos") {
      return {
        schema_version: "launch-request.v2",
        operation: "append_project_videos",
        advertiser_id: "填写本人账户ID",
        project_id: "填写目标项目ID",
        origin_resource_ids: ["视频标识码A"]
      };
    }
    return {
      schema_version: "launch-request.v1",
      operation: "create_std_project",
      route_id: "oceanengine_3_byte_mini_game",
      game_code: "JSZC",
      advertiser_id: "填写本人新账户ID"
    };
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
          body: JSON.stringify({ user_intent: normalized, draft: { ...draftIntake } })
        });
        mergeIntake(intake);
        await refreshProjectRecommendations();
        message("agent", intake.reply || "输入需要修正后再试。");
      } catch (error) {
        clearDraftIntake();
        showError(error);
      } finally {
        setBusy(false);
      }
  }

  async function submitStructuredRequest(request) {
    if (busy || viewOnly || job) return;
    clearDraftIntake();
    setBusy(true);
    try {
      const intake = await api("/api/launch/intake", {
        method: "POST",
        body: JSON.stringify({ request })
      });
      mergeIntake(intake);
      message("agent", intake.reply || "已完成标准 JSON 校验；请核对后启动流程。");
    } catch (error) {
      clearDraftIntake();
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
