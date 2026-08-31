# TASK-MWBV2-WORKBENCH-DUAL-PANE-TRUTH-SYNC-20260831

状态：completed

## 目标

把工作台收敛为唯一机制的最小消费面：左侧完成多轮规范化输入与显式启动；右侧从唯一节点注册表和运行真值展示极简状态。

```text
对话输入
→ /api/launch/intake 规范化
→ route_id + game_code + advertiser_id 完整确认
→ workflow_case
→ runtime_truth Job(case_id)
→ dry_run
→ Job Node/Skill 状态 + workflow_case_summary Gate
→ 工作台只读展示
```

## 范围

- 前端累计三项规范化字段，显式“启动流程”，不再自动创建 Job。
- 启动时严格使用既有 Case → Job → dry-run 链路，且 runtime Job 必带 `case_id`。
- 空闲工作台从唯一节点注册表渲染 3 阶段、7 节点；右侧仅以绿点表示 `passed`，其他所有状态均为灰点。
- Job 视图增加 Case Gate 的只读投影；节点事实保留 Job 范围，Case Gate 仅来自 `mwb.workflow_case_summary`。

## 禁止范围

- 任何 OceanEngine 或其他平台写入、资源准备、项目创建、预算或出价变更。
- 新建数据库表、View、WebSocket、聊天记录持久化、Node/Skill 状态语义。
- 把动态 Case、Job、资源或完整 URL/secret/raw request-response 写入 Markdown、前端或日志。

## 验收

- 分三条消息输入可累计并规范化三字段；字段齐全前无 Case/Job/运行记录创建，字段齐全后仍需显式点击启动。
- 启动链路创建一个 Case、一个携带 `case_id` 的 `runtime_truth` Job，并仅运行一次 dry-run；不发生平台写入。
- 空闲与 Job 页面均由节点注册表和后端状态投影驱动，无硬编码 3/7。
- `passed` 显示绿点，所有非 `passed` 状态显示灰点，tooltip 仍保留真实状态。
- 历史 Job 的节点状态与 Case 当前 Gate 分域显示，不再把 Job 局部 next action 当成 Case 当前下一步。

## Solution Link

- source：用户确认的“工作台双栏最小一致性修正”方案；`docs/Solution Design.md`；`docs/project-现在的逻辑图.md`；`docs/project-数据与报表契约.md`。
- objective：让前端严格消费唯一节点注册表、Job 运行记录与 `workflow_case_summary`，同时修复 Case 绑定启动缺口。
- current truth：Postgres `mwb.workflow_case_summary`、`launch_jobs`、`launch_node_runs`、`launch_skill_runs`；当前代码与本 Manifest。
- stop condition：任何实现需要平台写入、改变 Node/Skill 状态语义、复制 current Gate、或无法保持历史 Job/当前 Case 分域时停止。

## 完成结果

- 左侧现在累计每次 `/api/launch/intake` 的规范化结果；三字段齐全后才允许显式启动。
- 启动路径严格为 Case → 带 `case_id` 的 runtime Job → 一次 dry-run；未新增平台写入口。
- 空闲页面和 Job 页面都由同一节点注册表投影；右侧仅 `passed` 为绿点，其余均为灰点。
- Job View 已显式返回 Case Gate；历史 Job 只读状态与当前 Case Gate 分域显示。

## 验证结果

- `npm run smoke:api`、`npm run test:workflow-case`、`npm run smoke:workflow-skills` 通过。
- 静态检查、差异空白检查和本地浏览器只读验证通过；浏览器无 warning/error。
