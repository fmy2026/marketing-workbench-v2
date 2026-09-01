# TASK-MWBV2-WORKBENCH-READONLY-RECOVERY-FRESH-JOB-20260901

状态：completed

## 授权来源

用户于 2026-09-01 明确批准“最小版：最新账户首次标准项目创建与唯一底层机制加固”并要求实施。

## 唯一目标

为工作台增加精确“重新只读准备”恢复入口：当活动 Case 的已确认资源 Plan 因凭据等原因停止时，只创建同一 Case 的 fresh runtime Job 并运行既有只读就绪链；不复用旧 Plan、确认、授权或平台动作。

## 精确范围

- 目标 Case：`CASE-MWBV2-5B75EB40E6F9AF2469` 的恢复路径，以及同合同下的通用活动 Case 行为。
- 允许修改：Intent Resolver、Gate Action Policy、workbench command、Postgres repository 的 Case 级原子 fresh-Job helper、脱敏工作台提示、文档和测试。
- 不新增页面、API 路由、数据库表、View、Gate、Plan 类型或 Node/Skill 语义。

## 禁止

- 所有真实平台写入、资源 Plan 执行、`std_project/create`、monitor 创建、token refresh、预算或出价变更。
- 消费真实 Case 的 confirmation，或修改其 Plan/action/resource 真值。
- 自动开启 `project.state.json` 平台写入权限，或允许对话绕过 Plan/hash/confirmation。
- 数据库 migration、Schema 或 `workflow_case_summary` 定义修改。
- 保存 token、secret、Cookie、完整 URL、raw request、raw payload 或 raw response。

## 验收

- 只有活动 Case 的最新 Job、`resolve_case_blocker` 才能接受精确恢复短语；终态 monitor 继续使用既有专用短语。
- `blocked_confirmed_resource_plan` 在本地凭据 ready 时原子创建一个 fresh Job 并执行 `dry_run`；并发调用只生成一个。
- 普通只读 blocker 重跑当前 Job 的 `dry_run`，不创建平台写入或确认。
- fresh Job 不继承旧 Plan、confirmation、grant 或 action；旧 Job 改为历史只读。
- 全部测试使用 mock/test_run；任务结束时 `platform_write_allowed=false` 且 `active_task=null`。

## 完成结果

- 新增精确“重新只读准备”意图；只在活动 Case 的最新 `resolve_case_blocker` Job 生效，终态 monitor 仍只接受既有专用回查短语。
- 已确认资源 Plan 停止时，先检查脱敏本地凭据状态；ready 后以 Case advisory lock 和确定性恢复引用原子创建 fresh Job，再运行既有 `dry_run`。普通 blocker 只重跑当前 Job 的 `dry_run`。
- fresh Job 只初始化既有 7 Node，不复制旧 Plan、confirmation、grant、action 或 idempotency key；并发返回同一个恢复 Job，只有创建者运行 readonly。
- 未调用真实平台写入、未消费真实 Case confirmation、未创建真实资源或标准项目；`platform_write_allowed` 保持 `false`。
- 已通过：运行时语法检查、`npm run test:workbench-conversation`、原子 SQL 无写入探测、`npm run smoke:api`、`npm run test:workflow-case`、`git diff --check`。
- `npm run test:execution-grant` 在本机数据库 fixture 环境中单实例超过两分钟未输出完成，已中止；清理了其留下的 42 条明确 `test_run` fixture，并复核残留数为 0。该测试不记为通过。
