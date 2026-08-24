(function () {
  let job = null;
  let busy = false;

  const DONE_STATUSES = new Set(["passed", "needs_confirmation"]);
  const REASON_STATUSES = new Set(["blocked", "repairable", "failed", "needs_confirmation"]);
  const PUBLIC_STATUS = new Set(["waiting", "running", "passed", "needs_confirmation", "blocked", "repairable", "failed", "locked"]);

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

  function currentJobPath() {
    if (!job?.jobId) return "/api/launch/jobs/latest";
    return `/api/launch/jobs/${encodeURIComponent(job.jobId)}`;
  }

  function allNodes() {
    return (job?.phases || []).flatMap((phase) => phase.nodes || []);
  }

  function progressCount(nodes) {
    return nodes.filter((node) => DONE_STATUSES.has(node.status)).length;
  }

  function currentReason() {
    const readiness = job?.createReadiness || {};
    const firstIssue = allNodes().find((node) => REASON_STATUSES.has(node.status));
    return readiness.uniqueBlocker && readiness.uniqueBlocker !== "无"
      ? readiness.uniqueBlocker
      : firstIssue?.detail || firstIssue?.summary || job?.headline?.nextAction || "等待执行";
  }

  function setBusy(nextBusy) {
    busy = nextBusy;
    renderCommand();
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
    (job?.chat || []).slice(-4).forEach((message) => {
      if (message?.text) addMessage(message.role === "user" ? "user" : "agent", message.text);
    });
  }

  function renderIntake() {
    document.getElementById("agentStatus").textContent = job?.headline?.statusLabel || job?.agent?.statusText || "等待需求";

    const intentCard = document.getElementById("intentCard");
    intentCard.innerHTML = "";
    [
      ["推广路线", job?.intake?.routeId],
      ["游戏", job?.intake?.gameCode],
      ["账户", job?.intake?.advertiserId]
    ].forEach(([label, value]) => {
      if (!value) return;
      const item = el("div", "identity-item");
      item.append(el("span", "", label));
      item.append(el("strong", "", value));
      intentCard.append(item);
    });
  }

  function nodeReason(node) {
    if (!REASON_STATUSES.has(node.status)) return "";
    if (node.status === "needs_confirmation") return "创建前已就绪";
    return node.detail || node.summary || "";
  }

  function renderWorkflow() {
    const grid = document.getElementById("workflowGrid");
    grid.innerHTML = "";

    (job?.phases || []).forEach((phase) => {
      const section = el("section", "phase-section");
      section.append(el("h3", "phase-title", phase.title || phase.phase || ""));

      const list = el("div", "node-list");
      (phase.nodes || []).forEach((node) => {
        const status = PUBLIC_STATUS.has(node.status) ? node.status : "waiting";
        const row = el("article", `node-row status-${status}`);
        row.append(el("span", "node-marker", String(node.number || "")));
        const body = el("div", "node-body");
        body.append(el("h4", "", node.name || ""));
        const reason = nodeReason(node);
        if (reason) body.append(el("p", "", reason));
        row.append(body);
        row.append(el("span", "node-state", node.statusLabel || status));
        list.append(row);
      });

      section.append(list);
      grid.append(section);
    });

    document.getElementById("workflowHint").textContent = currentReason();
    document.getElementById("runState").textContent = job?.headline?.statusLabel || "待执行";
  }

  function renderCommand() {
    const nodes = allNodes();
    document.getElementById("progressText").textContent = `进度 ${progressCount(nodes)} / ${nodes.length || 7}`;
    const button = document.getElementById("primaryAction");
    const label = document.getElementById("primaryActionText");
    const readiness = job?.createReadiness || {};
    const createAttempted = readiness.hasSingleCreateAttempt ||
      Number(readiness.platformActions || 0) > 0 ||
      job?.headline?.status === "failed_waiting_manual_review" ||
      job?.headline?.status === "created_pending_readback" ||
      job?.headline?.status === "created";
    button.disabled = busy || !job?.jobId || createAttempted;
    label.textContent = busy ? "执行中" : (createAttempted ? "禁止重试" : "开始执行");
    refreshIcons();
  }

  function renderAll() {
    renderIntake();
    renderChat();
    renderWorkflow();
    renderCommand();
    refreshIcons();
  }

  function showError(error) {
    addMessage("agent", `唯一阻断：${error.message}`);
  }

  async function refreshJob() {
    job = await api(currentJobPath());
    renderAll();
  }

  async function runWorkflow() {
    if (!job?.jobId || busy) return;
    setBusy(true);
    try {
      job = await api(`/api/launch/jobs/${encodeURIComponent(job.jobId)}/execute-once`, {
        method: "POST",
        body: JSON.stringify({ execution_intent: "EXECUTE_ONE_LAUNCH" })
      });
      renderAll();
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  }

  function bindInteractions() {
    document.getElementById("primaryAction").addEventListener("click", runWorkflow);

    document.getElementById("chatForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const input = document.getElementById("chatInput");
      const text = input.value.trim();
      if (!text || busy) return;
      addMessage("user", text);
      input.value = "";
      setBusy(true);
      try {
        const intake = await api("/api/launch/intake", {
          method: "POST",
          body: JSON.stringify({ user_intent: text })
        });
        if (intake.missingFields?.length) {
          addMessage("agent", `请补充：${intake.missingFields.join("、")}`);
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
  }

  async function init() {
    bindInteractions();
    try {
      const params = new URLSearchParams(window.location.search);
      const jobId = params.get("job_id");
      job = await api(jobId ? `/api/launch/jobs/${encodeURIComponent(jobId)}` : "/api/launch/jobs/latest");
      renderAll();
    } catch (error) {
      document.getElementById("agentStatus").textContent = "加载失败";
      showError(error);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
  window.addEventListener("focus", () => {
    refreshJob().catch(() => {});
  });
})();
