(function () {
  let job = null;
  let busy = false;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
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
      const error = new Error(body.error || "api_error");
      error.details = body.details;
      throw error;
    }
    return body;
  }

  function currentJobPath() {
    if (!job?.jobId) return "/api/launch/jobs/latest";
    return `/api/launch/jobs/${encodeURIComponent(job.jobId)}`;
  }

  async function refreshJob() {
    job = await api(currentJobPath());
    renderAll();
  }

  function setBusy(nextBusy) {
    busy = nextBusy;
    renderActions();
  }

  function addMessage(role, text) {
    const stream = document.getElementById("chatStream");
    const message = el("div", `chat-message is-${role}`);
    message.append(el("div", "message-bubble", text));
    stream.append(message);
    stream.scrollTop = stream.scrollHeight;
  }

  function renderChat() {
    const stream = document.getElementById("chatStream");
    stream.innerHTML = "";
    (job.chat || []).forEach((message) => addMessage(message.role, message.text));
  }

  function renderAgent() {
    document.getElementById("agentStatus").textContent = job.headline?.statusLabel || job.agent?.statusText || "";
    document.getElementById("runState").textContent = job.headline?.nextAction || "";

    const intentCard = document.getElementById("intentCard");
    intentCard.innerHTML = "";
    [
      ["路线", job.intake?.routeId],
      ["游戏", job.intake?.gameCode],
      ["账户", job.intake?.advertiserId],
      ["状态", job.headline?.statusLabel]
    ].forEach(([label, value]) => {
      const item = el("div", "intent-item");
      item.append(el("span", "", label));
      item.append(el("strong", "", value || ""));
      intentCard.append(item);
    });
  }

  function renderWorkflow() {
    const grid = document.getElementById("workflowGrid");
    grid.innerHTML = "";

    (job.workflow || []).forEach((phase, phaseIndex) => {
      const phaseCard = el("article", "phase-card");
      const heading = el("div", "phase-heading");
      heading.append(el("span", "phase-index", String(phaseIndex + 1)));
      const titleWrap = el("div");
      titleWrap.append(el("h3", "", phase.phase));
      heading.append(titleWrap);
      phaseCard.append(heading);

      const nodeList = el("div", "node-list");
      (phase.nodes || []).forEach((node) => {
        const nodeCard = el("section", `node-card status-${node.status}`);
        const top = el("div", "node-top");
        top.append(el("span", "node-number", String(node.number)));
        const nameWrap = el("div", "node-name-wrap");
        nameWrap.append(el("h4", "", node.name));
        top.append(nameWrap);
        top.append(el("span", "node-status", node.statusLabel || node.status));
        nodeCard.append(top);
        nodeList.append(nodeCard);
      });

      phaseCard.append(nodeList);
      grid.append(phaseCard);
    });
  }

  function renderActions() {
    if (!job) return;
    const actionWrap = document.getElementById("workflowActions");
    actionWrap.innerHTML = "";
    (job.actions || []).forEach((action) => {
      const button = el("button", `action-button${action.dangerous ? " is-danger" : ""}`, action.label);
      button.type = "button";
      button.disabled = busy || !action.enabled;
      button.addEventListener("click", () => runAction(action));
      actionWrap.append(button);
    });
  }

  function renderSummaries() {
    document.getElementById("diagnosticSummary").textContent = job.headline?.nextAction || "";
    document.getElementById("draftPolicy").textContent = job.execution?.statusLabel || "";

    const fields = document.getElementById("draftFields");
    fields.innerHTML = "";
    [
      ["项目名", job.draft?.projectName],
      ["payload hash", job.draft?.payloadHash],
      ["查重状态", job.draft?.duplicateStatus],
      ["执行状态", job.execution?.statusLabel],
      ["api_code", job.execution?.apiCode || ""],
      ["readback", job.execution?.readbackStatusLabel || job.execution?.readbackStatus],
      ["对象 ID", job.execution?.objectIdPresent ? "已返回" : "未返回"],
      ["允许重试", job.execution?.retryAllowed ? "是" : "否"]
    ].forEach(([label, value]) => {
      const item = el("div", "draft-field");
      item.append(el("span", "", label));
      item.append(el("strong", "", value || ""));
      fields.append(item);
    });
  }

  function renderDiagnostics() {
    document.getElementById("diagnosticMeta").textContent = `${job.jobId} · ${job.updatedAt}`;
    const rows = document.getElementById("diagnosticRows");
    rows.innerHTML = "";

    (job.diagnostics?.items || []).forEach((item) => {
      const row = document.createElement("tr");
      row.append(el("td", "", item.phase));
      row.append(el("td", "", item.node));
      const statusCell = document.createElement("td");
      statusCell.append(el("span", `diagnostic-status status-${item.status}`, item.statusLabel || item.status));
      row.append(statusCell);
      row.append(el("td", "", item.problem));
      row.append(el("td", "", item.action));
      rows.append(row);
    });
  }

  function renderAll() {
    renderAgent();
    renderChat();
    renderWorkflow();
    renderSummaries();
    renderDiagnostics();
    renderActions();
  }

  function showError(error) {
    addMessage("agent", `执行失败：${error.message}`);
  }

  async function runAction(action) {
    if (!job || busy || !action.enabled) return;
    if (action.key === "diagnostics") {
      document.getElementById("diagnosticDialog").showModal();
      return;
    }
    setBusy(true);
    try {
      if (action.key === "refresh_view") {
        await refreshJob();
      } else if (["diagnose", "run", "confirm", "readback"].includes(action.key)) {
        job = await api(`/api/launch/jobs/${encodeURIComponent(job.jobId)}/${action.key}`, {
          method: "POST",
          body: "{}"
        });
        renderAll();
      }
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  }

  function bindInteractions() {
    const popover = document.getElementById("configPopover");
    const configButton = document.getElementById("configButton");
    configButton.addEventListener("click", () => {
      const shouldOpen = popover.hidden;
      popover.hidden = !shouldOpen;
      configButton.setAttribute("aria-expanded", String(shouldOpen));
    });

    document.addEventListener("click", (event) => {
      if (!popover.hidden && !popover.contains(event.target) && event.target !== configButton) {
        popover.hidden = true;
        configButton.setAttribute("aria-expanded", "false");
      }
    });

    document.getElementById("chatForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const input = document.getElementById("chatInput");
      const text = input.value.trim();
      if (!text) return;
      addMessage("user", text);
      input.value = "";
      setBusy(true);
      try {
        const intake = await api("/api/launch/intake", {
          method: "POST",
          body: JSON.stringify({ user_intent: text })
        });
        if (intake.missingFields.length) {
          addMessage("agent", `缺少字段：${intake.missingFields.join("、")}`);
          return;
        }
        job = await api("/api/launch/jobs", {
          method: "POST",
          body: JSON.stringify({
            user_intent: text,
            route_id: intake.route_id,
            game_code: intake.game_code,
            advertiser_id: intake.advertiser_id
          })
        });
        renderAll();
      } catch (error) {
        showError(error);
      } finally {
        setBusy(false);
      }
    });

    const dialog = document.getElementById("diagnosticDialog");
    document.getElementById("diagnosticButton").addEventListener("click", () => dialog.showModal());
    document.getElementById("closeDialogButton").addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
  }

  async function init() {
    bindInteractions();
    try {
      const params = new URLSearchParams(window.location.search);
      const jobId = params.get("job_id");
      job = await api(jobId ? `/api/launch/jobs/${encodeURIComponent(jobId)}` : "/api/launch/jobs/latest");
      renderAll();
    } catch (error) {
      document.getElementById("agentStatus").textContent = "Agent 状态加载失败";
      showError(error);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
