(function () {
  let job = null;
  let workbench = null;
  let busy = false;
  let viewOnly = false;
  let polling = false;
  let draftCaseId = "";
  let draftCaseKey = "";
  let pendingConfirmation = null;
  const chatMessages = [];
  const focusedNodes = new Map();
  const draftIntake = {
    route_id: "",
    game_code: "",
    advertiser_id: ""
  };

  const DONE_STATUSES = new Set(["passed"]);

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
      throw error;
    }
    return body;
  }

  function phases() {
    return job?.phases || workbench?.phases || [];
  }

  function allNodes() {
    return phases().flatMap((phase) => phase.nodes || []);
  }

  function progressCount(nodes) {
    return nodes.filter((node) => DONE_STATUSES.has(node.status)).length;
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

  function renderConfirmationCard(stream) {
    const preview = confirmationPreview();
    if (!preview) return;
    const card = el("section", "confirmation-card");
    card.setAttribute("aria-label", "单次创建确认");
    card.append(el("strong", "", "单次创建确认"));
    card.append(el("p", "", preview.actionLabel || "创建 1 个广告项目"));
    const facts = el("dl", "confirmation-facts");
    [
      ["项目", preview.projectName || "待生成"],
      ["账户", preview.advertiser || "已脱敏"],
      ["调用上限", `${preview.maximumPlatformCalls || 1} 次`],
      ["自动重试", preview.retryAllowed ? "允许" : "禁止"],
      ["Plan", preview.planId || "未生成"],
      ["Hash", preview.planHash || "未生成"]
    ].forEach(([label, value]) => {
      facts.append(el("dt", "", label));
      facts.append(el("dd", "", value));
    });
    card.append(facts);
    const canExecute = job?.executionAvailability?.canExecuteOnce === true;
    const button = el("button", "confirmation-button", canExecute ? "确认创建" : "等待平台写授权");
    button.type = "button";
    button.disabled = busy || !canExecute;
    button.addEventListener("click", async () => {
      if (busy) return;
      setBusy(true);
      try {
        await submitJobCommand("确认创建");
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
    if (!job?.caseGate?.currentGate) return "";
    const gate = job.caseGate;
    const blocker = gate.rootBlockerCodes?.[0] ? `；唯一阻断：${gate.rootBlockerCodes[0]}` : "";
    if (job.isLatestCaseJob && !viewOnly) {
      return `当前 Gate：${gate.currentGate}${blocker}；下一步：${gate.suggestedNextAction || "等待后端更新"}`;
    }
    return `历史运行，只读查看。当前 Case Gate：${gate.currentGate}${blocker}`;
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
      : job?.headline?.statusLabel || (missing.length ? "等待补齐" : "已规范化");

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

  function renderCaseGate() {
    const panel = document.getElementById("caseGate");
    panel.innerHTML = "";
    if (!job?.caseGate?.currentGate) {
      panel.hidden = true;
      return;
    }
    panel.hidden = false;
    const gate = job.caseGate;
    const currentCaseView = job.isLatestCaseJob && !viewOnly;
    const scope = currentCaseView ? "当前 Case" : "历史 Job · 当前 Case";
    panel.append(el("strong", "", `${scope} Gate：${gate.currentGate}`));
    if (gate.rootBlockerCodes?.[0]) {
      panel.append(el("span", "", `唯一阻断：${gate.rootBlocker?.title || gate.rootBlockerCodes[0]}（${gate.rootBlockerCodes[0]}）`));
      if (gate.rootBlocker?.reason) panel.append(el("span", "", gate.rootBlocker.reason));
      if (gate.rootBlocker?.nextActionLabel) panel.append(el("span", "", `处理建议：${gate.rootBlocker.nextActionLabel}`));
    }
    if (currentCaseView && gate.suggestedNextAction) {
      panel.append(el("span", "", `下一步：${gate.suggestedNextAction}`));
    }
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
        if (index) flow.append(el("span", "node-arrow", "→"));
        const focused = focusNode(phase);
        const nodeButton = el("button", "node-pill");
        nodeButton.type = "button";
        nodeButton.title = statusTitle(node);
        nodeButton.setAttribute("aria-pressed", String(focused?.id === node.id));
        if (focused?.id === node.id) nodeButton.classList.add("is-selected");
        nodeButton.append(el("span", "node-marker", String(node.number || "")));
        nodeButton.append(el("span", "node-pill-label", node.name || ""));
        nodeButton.append(statusDot(node.status, statusTitle(node)));
        nodeButton.addEventListener("click", () => {
          focusedNodes.set(phase.id || phase.title || phase.phase || "", node.id);
          renderWorkflow();
        });
        flow.append(nodeButton);
      });
      section.append(flow);

      const focused = focusNode(phase);
      if (focused?.children?.length) {
        const children = el("div", "subnode-panel");
        const subnodeTitle = el("div", "subnode-heading");
        subnodeTitle.append(el("span", "", focused.name));
        subnodeTitle.append(el("span", "subnode-count", `${focused.children.length} 项`));
        children.append(subnodeTitle);
        const childList = el("div", "subnode-list");
        for (const child of focused.children) {
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
    document.getElementById("runState").textContent = viewOnly
      ? "历史运行"
      : (job?.headline?.statusLabel || (busy ? "运行中" : "等待启动"));
  }

  function renderCommand() {
    const nodes = allNodes();
    document.getElementById("progressText").textContent = `进度 ${progressCount(nodes)} / ${nodes.length}`;
    document.getElementById("runModeText").textContent = busy
      ? "只读流程执行中"
      : (viewOnly ? "历史 Job · 只读" : (job ? "状态已由后端同步" : (missingFields().length ? "等待规范化输入" : "等待启动流程")));
    const activeCaseConversation = job?.isLatestCaseJob === true && !viewOnly;
    const input = document.getElementById("chatInput");
    input.disabled = viewOnly || busy || Boolean(job && !activeCaseConversation);
    input.placeholder = activeCaseConversation ? "输入“继续执行”或“查看状态”..." : "输入投放需求...";
    document.querySelector(".send-button").disabled = input.disabled;
    refreshIcons();
  }

  function renderAll() {
    renderIntake();
    renderChat();
    renderCaseGate();
    renderWorkflow();
    renderCommand();
    refreshIcons();
  }

  function setBusy(nextBusy) {
    busy = nextBusy;
    renderAll();
  }

  function showError(error) {
    message("agent", `唯一阻断：${error.message}`);
  }

  async function refreshJob() {
    if (!job?.jobId || polling) return;
    polling = true;
    try {
      job = await api(`/api/launch/jobs/${encodeURIComponent(job.jobId)}`);
      pendingConfirmation = job.confirmationPreview || null;
      renderAll();
    } finally {
      polling = false;
    }
  }

  async function runWorkflow(jobId) {
    const refreshTimer = window.setInterval(() => {
      refreshJob().catch(() => {});
    }, 1200);
    try {
      await api(`/api/launch/jobs/${encodeURIComponent(jobId)}/run`, {
        method: "POST",
        body: JSON.stringify({ mode: "dry_run" })
      });
      await refreshJob();
    } finally {
      window.clearInterval(refreshTimer);
    }
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
    if (draftCaseId) return draftCaseId;
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
      return draftCaseId;
    } catch (error) {
      if (error.message === "workflow_case_key_already_exists" && error.details?.caseId) {
        draftCaseId = error.details.caseId;
        return draftCaseId;
      }
      throw error;
    }
  }

  async function startWorkflow() {
    if (busy || viewOnly || job || missingFields().length) return;
    setBusy(true);
    try {
      const caseId = await ensureWorkflowCase();
      const created = await api("/api/launch/jobs", {
        method: "POST",
        body: JSON.stringify({
          route_id: draftIntake.route_id,
          game_code: draftIntake.game_code,
          advertiser_id: draftIntake.advertiser_id,
          case_id: caseId,
          source_usage: "runtime_truth",
          source_record_ref: "workbench:normalized-input"
        })
      });
      job = created;
      pendingConfirmation = job.confirmationPreview || null;
      setActiveCaseUrl(job.caseId);
      await refreshJob();
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
    const url = new URL(window.location.href);
    url.searchParams.delete("job_id");
    url.searchParams.set("case_id", caseId);
    window.history.replaceState({}, "", url);
  }

  async function submitJobCommand(text) {
    const preview = confirmationPreview();
    const result = await api(`/api/launch/jobs/${encodeURIComponent(job.jobId)}/command`, {
      method: "POST",
      body: JSON.stringify({
        message: text,
        expected_plan_id: preview?.planId || "",
        expected_plan_hash: preview?.planHash || ""
      })
    });
    job = result.view || job;
    pendingConfirmation = result.interaction?.confirmationPreview || job.confirmationPreview || null;
    if (result.interaction?.message) message("agent", result.interaction.message);
    renderAll();
  }

  function bindInteractions() {
    document.getElementById("chatForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const input = document.getElementById("chatInput");
      const text = input.value.trim();
      if (!text || busy || viewOnly) return;
      input.value = "";
      message("user", text);
      setBusy(true);
      try {
        if (job) {
          await submitJobCommand(text);
          return;
        }
        const intake = await api("/api/launch/intake", {
          method: "POST",
          body: JSON.stringify({ user_intent: text })
        });
        mergeIntake(intake);
        const missing = missingFields();
        message("agent", missing.length
          ? `已识别 ${requiredFields().length - missing.length}/${requiredFields().length} 项；请补充：${missing.map((field) => field.label).join("、")}`
          : "三项输入已规范化；请核对后点击“启动流程”。");
      } catch (error) {
        showError(error);
      } finally {
        setBusy(false);
      }
    });
    document.getElementById("startWorkflowButton").addEventListener("click", () => {
      startWorkflow();
    });
  }

  async function init() {
    bindInteractions();
    try {
      const params = new URLSearchParams(window.location.search);
      const jobId = params.get("job_id");
      const caseId = params.get("case_id");
      viewOnly = Boolean(jobId);
      if (jobId) {
        job = await api(`/api/launch/jobs/${encodeURIComponent(jobId)}`);
      } else if (caseId) {
        const caseView = await api(`/api/workflow-cases/${encodeURIComponent(caseId)}`);
        const latestJobId = caseView.summary?.latest_job_id || "";
        if (latestJobId) {
          draftCaseId = caseId;
          job = await api(`/api/launch/jobs/${encodeURIComponent(latestJobId)}`);
        } else {
          workbench = await api("/api/launch/workbench");
        }
      } else {
        workbench = await api("/api/launch/workbench");
      }
      pendingConfirmation = job?.confirmationPreview || null;
      renderAll();
    } catch (error) {
      document.getElementById("agentStatus").textContent = "加载失败";
      showError(error);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
  window.addEventListener("focus", () => {
    if (job?.jobId) refreshJob().catch(() => {});
  });
})();
