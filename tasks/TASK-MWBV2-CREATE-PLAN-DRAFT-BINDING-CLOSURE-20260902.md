# TASK-MWBV2-CREATE-PLAN-DRAFT-BINDING-CLOSURE-20260902

状态：completed

## 授权来源

用户于 2026-09-02 批准“Create Plan 发布、确认与终态收口最小修复”并要求直接实施。

## 唯一目标

让 ready `std_project_create` Plan 只在最终 Draft 已精确绑定 Plan ID/hash 后可确认；已确认但创建前 fail-closed 的 Plan 必须终态收口，且当前 Case 只恢复到 fresh readonly 的新确认卡。

## 已确认事实

- 当前 Case 的旧 Create Plan 已记录确认，但没有 `std_project_create` 平台 action。
- Node 04 最终已通过；执行过程中的红点来自尚未产出本轮 Skill 输出时的错误 `blocked` 投影。
- 创建被 `final_draft_not_derived_from_confirmed_plan`、hash mismatch 与 derivation status 阻断；旧 Plan 仍为 ready，造成重复确认假象。

## 实现范围

- ready Create Plan 发布前将通过校验的 Draft 绑定到 exact Plan ID/hash，并在确认前复核该绑定与稳定 Node 04。
- 修正执行中 Node 04 对未完成 Skill 的展示聚合，不把缺失输出投影为资源失败。
- 为确认已存在、创建前阻断且零平台 action 的 Create Plan 增加终态收口。
- 在同一 Case 终态收口旧 Plan 后创建 fresh runtime Job 并只运行 dry_run，停在新的确认卡。

## 禁止

- 任何真实 `std_project/create`、自动确认、重试、OAuth refresh 或资源写入。
- 删除或复用旧 Plan、confirmation、action、Draft、idempotency key 或历史记录。
- 新增 API、Schema、View、Gate、Plan/action 类型、后台 worker 或前端布局。

## 验收

- ready Create Plan 的 Draft 带 exact Plan ID/hash 与 `plan_derivation_status=passed`。
- 未绑定 Draft 时确认、平台 action 均为零。
- 执行中未完成的资源 Skill 不将已通过 Node 04 降级为 blocked；真实资源失败仍阻断。
- confirmed + zero-action 的创建前阻断 Plan 收口为 consumed，Case 不再提示重复确认。
- 当前 Case 生成 fresh Job 的新 Create Plan，确认前平台 action 为零。

## 停止条件

- 修复需要平台写入、自动确认、重试、删除历史或放宽权限。
- 修复需要新增 Schema、View、公开 API、Gate 或 Plan/action 类型。

## 完成结果

- ready Create Plan 与 final Draft 在单条原子数据库持久化中绑定；缺少 final Draft 时 Plan 不得 ready。
- confirmation 在写入前复核 Job、Node 04、Draft、payload 与 Plan/hash；零 action 的创建前阻断会消费旧 Plan 并保留审计。
- 当前 Case 已完成旧 Plan 的本地终态收口，并生成新的只读 Create Plan；其确认与平台创建 action 均为零，等待用户下一次明确确认。

## 验证

- `test:execution-plan`、`test:execution-grant`、`test:node4-progress-projection`、`test:workbench-runtime-policy`、`test:workbench-conversation`、`test:workbench-progress`、`test:workflow-case`、`validate:schemas`、`check:runtime-consistency` 均通过。
- 全部平台动作使用 mock/fake transport；本 Task 未执行真实平台创建、自动确认、重试或 OAuth refresh。
