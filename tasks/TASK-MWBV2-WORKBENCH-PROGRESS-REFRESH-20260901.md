# TASK-MWBV2-WORKBENCH-PROGRESS-REFRESH-20260901

状态：completed

## 授权来源

用户于 2026-09-01 明确批准“极简工作台进度显示与服务生效”方案并要求实施。

## 唯一目标

让工作台以既有 Case / Job 只读接口清楚显示“正在处理、已暂停、待确认或已完成”，并提供可手动刷新的进度按钮；命令执行期间临时自动同步最新 Case Job。

## 精确范围

- 修改 `frontend/index.html`、`frontend/app.js`、`frontend/styles.css` 与必要的脱敏状态文案。
- 复用现有 `GET /api/workflow-cases/:case_id` 与 `GET /api/launch/jobs/:job_id`；不新增 API、Schema、View 或后台任务。
- 为已有本机 LaunchAgent 重新加载代码并只读验证当前 Case 展示。

## 禁止

- 真实平台写入、资源/项目 Plan 执行或确认消费、monitor 创建、token refresh、预算或出价变更。
- 提交“重新只读准备”或任何会创建真实 runtime Job 的工作台命令。
- 数据库 migration、`workflow_case_summary` 定义变更、浏览器持久化或敏感/raw 数据保存。

## 验收

- 当前 Case 展示 `进度 1/7 · 已暂停：平台只读凭据不可用` 与可用的“刷新进度”按钮。
- Case 刷新始终跟随 summary 的最新 Job；历史 Job 保持只读不切换。
- 前端命令与 dry-run 请求期间每 1.2 秒只读刷新，结束后停止并最终刷新；不发生重叠请求。
- 刷新失败保留上次有效状态并允许重试；无平台写入、无新 Job、无数据库 Schema 改动。

## 验证

- 前端 JavaScript 语法检查。
- 工作台地址、对话、API smoke 与新增进度展示测试。
- LaunchAgent 重启后的本地 health API 与浏览器可视化检查。

## 完成结果

- 底栏现明确展示处理、暂停、待确认、完成和历史只读状态；当前 Case 实测为 `进度 1/7 · 已暂停：平台只读凭据不可用`。
- “刷新进度”先读取 Case summary，再读取最新 Job；刷新期间保持并发互斥，前端命令与 dry-run 请求期间仅以 1.2 秒间隔执行短暂只读同步。
- 历史 Job 只刷新自身，根页没有轮询；无新增 API、Schema、View、后台任务或浏览器持久化。
- 本机 LaunchAgent 已重启并通过 health API、实际浏览器渲染、手动刷新和浏览器控制台错误检查。
- 没有提交工作台命令，没有创建 fresh Job，没有真实平台调用或写入。
- 已通过：前端语法检查、`test:workbench-progress`、`test:workbench-address`、`test:workbench-conversation`、`smoke:api`、`git diff --check`。
