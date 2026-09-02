import {
  parseWorkbenchProgressTarget,
  workbenchCaseUrl
} from "./workbench-address.mjs";
import {
  latestCaseJobId,
  progressPresentation,
  progressRefreshLabel,
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
  const chatMessages = [];
  const focusedNodes = new Map();
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

  function renderActiveCases() {
    const container = document.getElementById("activeCases");
    const cases = rootHome ? (workbench?.activeCases || []) : [];
    container.innerHTML = "";
    container.hidden = cases.length === 0;
    if (!cases.length) return;
    const heading = el("div", "active-cases-heading");
    heading.append(el("strong", "", "活动账户"));
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
      const nextAction = gate.currentGate === "first_std_project_create_completed"
        ? "已完成，无需继续执行"
        : gate.suggestedNextAction;
      panel.append(el("span", "", `下一步：${nextAction}`));
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
    document.getElementById("runState").textContent = viewOnly
      ? "历史运行"
      : (job?.headline?.statusLabel || (busy ? "运行中" : "等待启动"));
  }

  function renderCommand() {
    const nodes = allNodes();
    const preview = confirmationPreview();
    document.getElementById("progressText").textContent = progressPresentation({
      nodes,
      caseGate: job?.caseGate,
      confirmationPreview: preview,
      executionAvailability: job?.executionAvailability,
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
    input.disabled = viewOnly || busy || Boolean(job && !activeCaseConversation);
    input.placeholder = activeCaseConversation
      ? job?.caseGate?.currentGate === "first_std_project_create_completed"
        ? "已完成，可输入“查看状态”..."
        : "输入“继续执行”或“查看状态”..."
      : "输入投放需求...";
    document.querySelector(".send-button").disabled = input.disabled;
    refreshIcons();
  }

  function renderAll() {
    renderIntake();
    renderActiveCases();
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
      return { caseId: draftCaseId, reusedActiveCase: workflowCase.reusedActiveCase === true };
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
    pendingConfirmation = result.interaction?.confirmationPreview || job.confirmationPreview || null;
    if (result.interaction?.message) message("agent", result.interaction.message);
    renderAll();
  }

  function bindInteractions() {
    document.getElementById("progressRefreshButton").addEventListener("click", () => {
      refreshProgressFromButton();
    });
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
    } catch (error) {
      document.getElementById("agentStatus").textContent = "加载失败";
      showError(error);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
  window.addEventListener("focus", () => {
    if (job?.jobId) refreshProgress().catch(() => {});
  });
})();
