(function () {
  const job = window.mockLaunchJob;

  const statusLabels = {
    done: "完成",
    attention: "需关注",
    ready: "可生成",
    locked: "已锁定",
    waiting: "等待"
  };

  const diagnosticLabels = {
    passed: "通过",
    repairable: "可修复",
    needs_confirmation: "需确认",
    blocked: "阻断",
    waiting: "等待",
    failed: "失败"
  };

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function renderAgent() {
    document.getElementById("agentStatus").textContent = `${job.agent.name} · ${job.agent.statusText}`;
    document.getElementById("runState").textContent = job.agent.mode;

    const intentCard = document.getElementById("intentCard");
    intentCard.innerHTML = "";

    [
      ["路线", job.intake.routeId],
      ["游戏", job.intake.gameSlug],
      ["账户", job.intake.advertiserId],
      ["写入策略", job.agent.writePolicy]
    ].forEach(([label, value]) => {
      const item = el("div", "intent-item");
      item.append(el("span", "", label));
      item.append(el("strong", "", value));
      intentCard.append(item);
    });
  }

  function renderChat() {
    const stream = document.getElementById("chatStream");
    stream.innerHTML = "";
    job.chat.forEach((message) => addMessage(message.role, message.text));
  }

  function addMessage(role, text) {
    const stream = document.getElementById("chatStream");
    const message = el("div", `chat-message is-${role}`);
    const bubble = el("div", "message-bubble", text);
    message.append(bubble);
    stream.append(message);
    stream.scrollTop = stream.scrollHeight;
  }

  function renderWorkflow() {
    const grid = document.getElementById("workflowGrid");
    grid.innerHTML = "";

    job.phases.forEach((phase, phaseIndex) => {
      const phaseCard = el("article", "phase-card");
      const heading = el("div", "phase-heading");
      heading.append(el("span", "phase-index", String(phaseIndex + 1)));
      const titleWrap = el("div");
      titleWrap.append(el("h3", "", phase.title));
      titleWrap.append(el("p", "", phase.summary));
      heading.append(titleWrap);
      phaseCard.append(heading);

      const nodeList = el("div", "node-list");
      phase.nodes.forEach((node) => {
        const nodeCard = el("section", `node-card status-${node.status}`);
        const top = el("div", "node-top");
        top.append(el("span", "node-number", String(node.number)));
        const nameWrap = el("div", "node-name-wrap");
        nameWrap.append(el("h4", "", node.name));
        nameWrap.append(el("p", "", node.output));
        top.append(nameWrap);
        top.append(el("span", "node-status", statusLabels[node.status] || node.status));
        nodeCard.append(top);

        nodeCard.append(el("p", "node-detail", node.detail));

        const tags = el("div", "subflow-tags");
        node.subflows.forEach((tag) => tags.append(el("span", "subflow-tag", tag)));
        nodeCard.append(tags);
        nodeList.append(nodeCard);
      });

      phaseCard.append(nodeList);
      grid.append(phaseCard);
    });
  }

  function renderSummaries() {
    document.getElementById("diagnosticSummary").textContent = job.diagnostics.summary;
    document.getElementById("draftPolicy").textContent = job.draft.writePolicy;

    const fields = document.getElementById("draftFields");
    fields.innerHTML = "";
    job.draft.fields.forEach((field) => {
      const item = el("div", "draft-field");
      item.append(el("span", "", field.label));
      item.append(el("strong", "", field.value));
      fields.append(item);
    });

    const hashItem = el("div", "draft-field is-wide");
    hashItem.append(el("span", "", "草稿 Hash"));
    hashItem.append(el("strong", "", job.draft.payloadHash));
    fields.append(hashItem);
  }

  function renderDiagnostics() {
    document.getElementById("diagnosticMeta").textContent = `${job.jobId} · ${job.updatedAt}`;
    const rows = document.getElementById("diagnosticRows");
    rows.innerHTML = "";

    job.diagnostics.items.forEach((item) => {
      const row = document.createElement("tr");
      row.append(el("td", "", item.phase));
      row.append(el("td", "", item.node));

      const statusCell = document.createElement("td");
      statusCell.append(el("span", `diagnostic-status status-${item.status}`, diagnosticLabels[item.status] || item.status));
      row.append(statusCell);

      row.append(el("td", "", item.problem));
      row.append(el("td", "", item.action));
      rows.append(row);
    });
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

    document.getElementById("chatForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const input = document.getElementById("chatInput");
      const text = input.value.trim();
      if (!text) return;
      addMessage("user", text);
      input.value = "";
      window.setTimeout(() => {
        addMessage("agent", "已接收，需求信息已更新。");
      }, 250);
    });

    const dialog = document.getElementById("diagnosticDialog");
    document.getElementById("diagnosticButton").addEventListener("click", () => dialog.showModal());
    document.getElementById("closeDialogButton").addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
  }

  function init() {
    if (!job) {
      document.body.textContent = "页面资源未加载";
      return;
    }
    renderAgent();
    renderChat();
    renderWorkflow();
    renderSummaries();
    renderDiagnostics();
    bindInteractions();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
