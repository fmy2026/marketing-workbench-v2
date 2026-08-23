# TASK-MWBV2-FRONTEND-SHELL

状态：completed

更新时间：2026-08-23 CST

## 目标

实现 `marketing-workbench-v2` 第一阶段的工作台前端页面效果：左侧对话入口 + 右侧 3 阶段 7 节点 Workflow 看板。

## 范围

| 类型 | 内容 |
| --- | --- |
| 目标 | 静态前端页面、集中 mock 数据、诊断摘要、草稿摘要 |
| 非目标 | 不接 Postgres、不接真实平台、不做真实创建、不刷新凭据 |
| 预览 | 直接用浏览器打开 `frontend/index.html` |

## 已完成

- 新建 `frontend/index.html`，作为可直接打开的静态入口。
- 新建 `frontend/styles.css`，实现桌面稳定布局和窄屏响应式布局。
- 新建 `frontend/app.js`，从 mock 数据渲染对话、Workflow、诊断明细和草稿摘要。
- 新建 `frontend/mock-launch-job.js`，集中存放节点状态、子流程、诊断摘要和草稿摘要。
- 新建任务上下文清单 `tasks-context-manifests/TASK-MWBV2-FRONTEND-SHELL.json`。
- 更新 `project.state.json`，关闭当前任务并指向下一步 gate。

## 验收

| 标准 | 结果 |
| --- | --- |
| 左侧能看到对话入口、需求输入框、发送按钮、LLM 配置入口、Agent 状态 | passed |
| 右侧能看到 `准备阶段`、`就绪阶段`、`创建执行` | passed |
| Workflow 固定展示 7 个节点 | passed |
| 节点状态、诊断摘要、草稿摘要来自 `frontend/mock-launch-job.js` | passed |
| 不接 Postgres | passed |
| 不新增真实平台写入逻辑 | passed |
| 不写入 token、Cookie、secret、完整触点 URL、raw payload、raw response | passed |

## 下一步

建立 Postgres 最小真值表，并填入一个账户、一款游戏、一条路线的样例数据。
