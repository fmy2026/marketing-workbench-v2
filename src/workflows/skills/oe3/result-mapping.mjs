function createOutput(create = {}) {
  return create.outputSummary || {};
}

function readbackOutput(readback = {}) {
  return readback.outputSummary || {};
}

export function createNodeStatusFromSkill({ create = {}, mode = "dry_run" } = {}) {
  const output = {
    createNodeStatus: mode === "execute_once" ? "locked" : "dry_run_locked",
    createCalled: false,
    realPlatformWriteCalled: false,
    retryAllowed: false,
    ...(createOutput(create))
  };

  if (create.status === "mock_passed") {
    return {
      status: "passed",
      summary: "execute_once mock 创建已通过；未调用真实平台。",
      diagnosticLevel: "info",
      outputSummary: output
    };
  }

  if (create.status === "passed") {
    return {
      status: "passed",
      summary: output.realPlatformWriteCalled
        ? "真实 std_project/create 已单次执行，已返回对象 ID，等待或执行回查。"
        : "创建 Skill 已通过。",
      diagnosticLevel: "info",
      outputSummary: output
    };
  }

  if (create.status === "failed") {
    return {
      status: "failed",
      summary: "单次 std_project/create 已调用但平台未确认成功；禁止自动重试。",
      diagnosticLevel: "error",
      outputSummary: output
    };
  }

  if (create.status === "blocked") {
    return {
      status: "blocked",
      summary: "创建前 gate 阻断；未调用真实平台。",
      diagnosticLevel: "error",
      outputSummary: output
    };
  }

  return {
    status: "locked",
    summary: "创建节点锁定；本任务禁止真实平台写入。",
    diagnosticLevel: "warning",
    outputSummary: output
  };
}

export function readbackNodeStatusFromSkill({ readback = {}, mode = "dry_run" } = {}) {
  const output = {
    readbackStatus: mode === "dry_run" ? "not_applicable" : "not_run",
    realPlatformReadbackCalled: false,
    ...(readbackOutput(readback))
  };

  if (readback.status === "mock_passed") {
    return {
      status: "passed",
      summary: "execute_once mock 回查已收口。",
      diagnosticLevel: "info",
      outputSummary: output
    };
  }

  if (readback.status === "passed") {
    return {
      status: "passed",
      summary: output.recoveredByReadback === true
        ? "创建响应未确认，已通过回查确认对象创建成功。"
        : output.readbackStatus === "readback_verified"
        ? "真实对象名与对象 ID 回查一致，已完成收口。"
        : "真实回查已通过。",
      diagnosticLevel: "info",
      outputSummary: output
    };
  }

  if (readback.status === "blocked") {
    return {
      status: "repairable",
      summary: "已创建但尚未回查确认；禁止再次创建，等待只读回查修复。",
      diagnosticLevel: "warning",
      outputSummary: output
    };
  }

  if (readback.status === "failed") {
    return {
      status: "failed",
      summary: output.readbackStatus === "create_unconfirmed_readback_not_found"
        ? "本轮创建未确认成功，已停止；重新发送需求可开启新轮次。"
        : "真实回查失败，等待人工复盘。",
      diagnosticLevel: "error",
      outputSummary: output
    };
  }

  if (readback.status === "locked") {
    return {
      status: "locked",
      summary: "回查等待创建对象或显式 readback_only。",
      diagnosticLevel: "pending",
      outputSummary: output
    };
  }

  return {
    status: "waiting",
    summary: mode === "dry_run" ? "dry_run 不执行回查。" : "等待上游创建结果。",
    diagnosticLevel: "pending",
    outputSummary: output
  };
}

export function workflowJobUpdateFromSkillResults({ mode = "dry_run", create = {}, readback = {} } = {}) {
  if (readback.status === "passed" || readback.status === "mock_passed") {
    return { status: "created", currentNode: "7" };
  }
  if (create.status === "failed") {
    return { status: "failed_waiting_manual_review", currentNode: "6" };
  }
  if (create.status === "passed") {
    return { status: "created_pending_readback", currentNode: "7" };
  }
  if (mode === "dry_run" || mode === "execute_once") {
    return { status: "draft_ready", currentNode: "5" };
  }
  return null;
}

export function workflowNoRealPlatformWrite({ create = {} } = {}) {
  const output = createOutput(create);
  return !(output.realPlatformWriteCalled === true || (output.createCalled === true && output.mockCreateCalled !== true));
}

export function workflowCreateCalled({ create = {} } = {}) {
  const output = createOutput(create);
  return output.createCalled === true && output.mockCreateCalled !== true;
}

export function workflowCreateCalledFromView(view = {}) {
  const createSkill = (view.skills?.latest || []).find((run) => run.skillKey === "create-once") || {};
  return workflowCreateCalled({ create: { outputSummary: createSkill.outputSummary || {} } });
}
