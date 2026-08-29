(function () {
  let job = null;
  let busy = false;
  let viewOnly = false;
  let polling = false;

  const DONE_STATUSES = new Set(["passed"]);
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

  function allNodes() {
    return (job?.phases || []).flatMap((phase) => phase.nodes || []);
  }

  function progressCount(nodes) {
    return nodes.filter((node) => DONE_STATUSES.has(node.status)).length;
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
    if (!job) return;
    (job?.chat || []).slice(-4).forEach((message) => {
      if (message?.text) addMessage(message.role === "user" ? "user" : "agent", message.text);
    });
  }

  function renderAwemeAuthorization() {
    const panel = document.getElementById("awemePanel");
    panel.innerHTML = "";
    if (!job?.awemeAuthorization) return;
    const auth = job.awemeAuthorization;
    const header = el("div", "aweme-panel-header");
    header.append(el("strong", "", "抖音号授权关系"));
    header.append(el("span", `status-chip status-${auth.selectionStatus || "waiting"}`, auth.selectionStatus || "not_verified"));
    panel.append(header);

    const meta = el("div", "aweme-meta");
    [
      ["候选", String(auth.activeCandidateCount || 0)],
      ["已选", auth.selectedAwemeIdPresent ? "是" : "否"],
      ["核验", auth.verifiedAt ? "已核验" : "未核验"]
    ].forEach(([label, value]) => {
      const item = el("span", "aweme-meta-item");
      item.append(el("em", "", label));
      item.append(el("b", "", value));
      meta.append(item);
    });
    panel.append(meta);

    const candidates = auth.candidates || [];
    if (candidates.length > 1) {
      const list = el("div", "aweme-candidate-list");
      candidates.forEach((candidate) => {
        const button = el("button", "aweme-candidate", candidate.displayNameSummary || candidate.awemeIdHash || "未命名抖音号");
        button.type = "button";
        button.disabled = busy;
        button.title = candidate.awemeIdHash || "";
        button.addEventListener("click", async () => {
          if (busy) return;
          setBusy(true);
          try {
            await api(`/api/advertisers/${encodeURIComponent(auth.advertiserId)}/aweme-authorization`, {
              method: "POST",
              body: JSON.stringify({
                route_id: auth.routeId,
                game_code: auth.gameCode,
                selected_aweme_id: candidate.awemeId,
                selected_display_name: candidate.displayNameSummary
              })
            });
            await refreshJob();
          } catch (error) {
            showError(error);
          } finally {
            setBusy(false);
          }
        });
        list.append(button);
      });
      panel.append(list);
    }
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

  function renderWorkflow() {
    const grid = document.getElementById("workflowGrid");
    grid.innerHTML = "";

    (job?.phases || []).forEach((phase) => {
      const section = el("section", "phase-section");
      section.append(el("h3", "phase-title", phase.title || phase.phase || ""));

      const list = el("div", `node-card-grid node-count-${(phase.nodes || []).length}`);
      (phase.nodes || []).forEach((node) => {
        const status = PUBLIC_STATUS.has(node.status) ? node.status : "waiting";
        const card = el("article", `node-card status-${status}`);
        const header = el("div", "node-card-header");
        header.append(el("span", "node-marker", String(node.number || "")));
        header.append(el("h4", "node-card-name", node.name || ""));
        const nodeDot = el("span", "status-dot");
        nodeDot.setAttribute("aria-label", node.statusLabel || status);
        nodeDot.title = node.statusLabel || status;
        header.append(nodeDot);
        card.append(header);

        const children = el("div", "child-list");
        (node.children || []).forEach((child) => {
          const childStatus = PUBLIC_STATUS.has(child.status) ? child.status : "waiting";
          const item = el("div", `child-item status-${childStatus}`);
          const childDot = el("span", "status-dot");
          childDot.setAttribute("aria-label", child.statusLabel || childStatus);
          childDot.title = child.statusLabel || childStatus;
          item.append(childDot);
          item.append(el("span", "child-label", child.label || ""));
          children.append(item);
        });
        card.append(children);
        list.append(card);
      });

      section.append(list);
      grid.append(section);
    });

    if (!job) {
      grid.append(el("p", "empty-workflow", "等待新的投放需求"));
    }

    document.getElementById("runState").textContent = job?.headline?.statusLabel || "空闲";
  }

  function renderCommand() {
    const nodes = allNodes();
    document.getElementById("progressText").textContent = `进度 ${progressCount(nodes)} / ${nodes.length || 7}`;
    const button = document.getElementById("primaryAction");
    const label = document.getElementById("primaryActionText");
    const primaryAction = job?.primaryAction || { kind: "disabled", label: "开始执行", enabled: false };
    button.disabled = busy || !job?.jobId || viewOnly || primaryAction.enabled !== true;
    label.textContent = busy ? "执行中" : (viewOnly ? "查看记录" : primaryAction.label);
    document.getElementById("chatInput").disabled = viewOnly;
    document.querySelector(".send-button").disabled = viewOnly;
    refreshIcons();
  }

  function renderAll() {
    renderIntake();
    renderAwemeAuthorization();
    renderChat();
    renderWorkflow();
    renderCommand();
    refreshIcons();
  }

  function showError(error) {
    addMessage("agent", `唯一阻断：${error.message}`);
  }

  async function refreshJob() {
    if (!job?.jobId || polling) return;
    polling = true;
    try {
      job = await api(`/api/launch/jobs/${encodeURIComponent(job.jobId)}`);
      renderAll();
    } finally {
      polling = false;
    }
  }

  async function runWorkflow() {
    if (!job?.jobId || busy || viewOnly) return;
    const primaryAction = job.primaryAction || {};
    if (primaryAction.enabled !== true) return;
    setBusy(true);
    const jobId = job.jobId;
    const refreshTimer = window.setInterval(() => {
      refreshJob().catch(() => {});
    }, 1200);
    try {
      const endpoint = primaryAction.kind === "execute_once" ? "execute-once" : "run";
      const body = primaryAction.kind === "execute_once"
        ? { execution_intent: "EXECUTE_ONE_LAUNCH" }
        : { mode: "dry_run" };
      job = await api(`/api/launch/jobs/${encodeURIComponent(jobId)}/${endpoint}`, {
        method: "POST",
        body: JSON.stringify(body)
      });
      renderAll();
    } catch (error) {
      showError(error);
    } finally {
      window.clearInterval(refreshTimer);
      setBusy(false);
    }
  }

  function bindInteractions() {
    document.getElementById("primaryAction").addEventListener("click", runWorkflow);

    document.getElementById("chatForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const input = document.getElementById("chatInput");
      const text = input.value.trim();
      if (!text || busy || viewOnly) return;
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
      viewOnly = Boolean(jobId);
      if (jobId) {
        job = await api(`/api/launch/jobs/${encodeURIComponent(jobId)}`);
      } else {
        await api("/api/launch/workbench");
      }
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
