# TASK-MWBV2-WORKBENCH-REMOVE-DUPLICATE-GATE-CARD-20260902

状态：completed

## 授权来源

用户于 2026-09-02 明确批准“工作台右侧重复 Gate 卡片最小删除方案”并要求实施。

## 唯一目标

删除工作台右侧 Workflow 标题下方重复展示当前 Gate、唯一阻断和下一步的 `case-gate` 卡片；右侧保留固定 3 阶段 7 节点结构，左侧对话继续承担动态状态说明，底部进度与刷新入口保持不变。

## 精确范围

- 修改 `frontend/index.html`、`frontend/app.js`、`frontend/styles.css`。
- 更新 `scripts/00-workbench-progress-smoke.mjs` 的展示边界断言。
- 只删除重复展示，不改变 `job.caseGate`、后端 View/API、Gate Action Policy、确认卡、节点状态或刷新机制。

## 禁止

- 数据库、Schema、View、API、Intent Resolver、执行授权或平台链路变更。
- 真实平台调用、工作台命令、runtime Job 创建、confirmation 消费或凭据刷新。
- 删除底部“进度 n/7 + 刷新进度”操作栏。

## 验收

- 页面不存在 `#caseGate`，Workflow 标题后直接进入节点网格。
- 左侧对话仍显示当前 Gate、唯一阻断和下一步；确认卡不受影响。
- 底部进度、刷新、最新 Job 切换和历史只读行为保持不变。
- 前端语法、workbench progress/conversation smoke 与桌面/窄屏只读视觉检查通过。

## 完成结果

- 右侧 `#caseGate.case-gate` 容器、`renderCaseGate()` 及专用样式已删除，Workflow 标题后直接进入固定节点网格。
- 完成态“已完成，无需继续执行”已收敛到左侧 `operationalMessage()`；其他 Gate、阻断和下一步仍使用既有 `job.caseGate` 投影。
- 底部进度/刷新、确认卡、节点等待态、当前 Case/历史 Job 隔离均保持不变。
- 通过前端语法、`test:workbench-progress`、`test:workbench-conversation`、`git diff --check`，并完成根页、当前 Case、历史 Job、桌面与 390px 窄屏只读视觉验证。
- 未提交工作台命令，未创建 runtime Job，未调用外部平台，未修改数据库、Schema、View 或 API。
