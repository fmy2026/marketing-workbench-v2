# TASK-MWBV2-CASE-GATE-TRUTH-UI-ACCOUNT-CONTRACT-20260831

状态：completed

## 目标

修复 Case Gate 的前置依赖排序、节点状态落账和工作台状态表达；把 JSZC event asset 的单账户代码常量收敛为账户级受控合同。该任务不执行任何真实平台写入。

## 范围

- `workflow_case_summary` 以 monitor / 上下文优先于 Node 4 资源的顺序输出唯一 root blocker。
- Execution Plan、Node 聚合和 UI 使用同一依赖语义，展示可操作的 blocker 说明。
- 修复 Skill 已运行而 Node 仍为 waiting 的持久化缺口。
- event asset 只在当前账户拥有匹配的本地合同、模板和只读前提时允许生成单资源计划。

## 禁止

- monitor 创建、event asset 创建、素材上传、DMP push、标准项目创建、预算或出价修改。
- OAuth token 刷新。
- 保存 token、Cookie、完整 URL、raw request、raw payload 或 raw response。

## 验收

- 当前 Case 的 root blocker 为 `monitor_create_busy_retry_exhausted`。
- monitor 未解析或历史周期 terminal_failed 时，工作台不得显示绿色。
- 运行中止后已完成的 Node 状态仍可从 Postgres 正确读取。
- event asset 无目标账户合同保持 fail-closed；合同完整时才可生成其单次 Plan。
- smoke 与 schema 检查均不产生平台写入。

## 停止条件

- 任何改动要求扩大平台写权限，或无法维持旧 Plan 不可复用时停止。
- 数据库迁移或回归测试暴露既有 Case Gate 语义无法兼容时停止并报告。

## 执行结果

- 新增 `061_case_gate_monitor_dependency_priority.sql`；当前目标 Case 的唯一 root blocker 已投影为 `monitor_create_busy_retry_exhausted`，结构性资源 blocker 保持可审计。
- Job bundle 提供脱敏 monitor 生命周期摘要；Plan、View 与工作台均据此识别未解决或 terminal-failed monitor。
- Runner 每个 Skill 后保存 Node 快照，并在异常路径保存已完成节点。
- event asset 改为验证当前账户的 `target_advertiser_id`、动态 `template_ref` 和 template hash；跨账户合同继续 fail-closed。
- 未执行 monitor、事件资产、素材、DMP 或标准项目的平台写入。

## 验证

`test:event-asset-provision-contract`、`test:execution-plan`、`test:resource-action-registry`、`test:workflow-case`、`test:workbench-conversation`、`validate:schemas`、`smoke:api`、`test:event-asset-executor`、`test:node4-resource-prep-contracts`、`smoke:workflow-skills` 与 `git diff --check` 均通过。
