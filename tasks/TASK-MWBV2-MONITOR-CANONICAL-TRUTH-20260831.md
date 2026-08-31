# TASK-MWBV2-MONITOR-CANONICAL-TRUTH-20260831

状态：completed

## 目标

建立唯一 monitor readiness 投影，修复已 resolved monitor 被误选为 Case root blocker 的问题；不执行平台写入。

## 范围

- 新增 account-grain `mwb.v_monitor_readiness`，并让 monitor blocker report、Case summary、Job bundle 与 UI 消费它。
- 保留历史 cycle/attempt/error 诊断，但只输出未 ready 状态的可行动 blocker。
- 增加 `run_monitor_readonly` Gate 和对应工作台安全只读分流。

## 禁止

- monitor、资源、广告项目或预算/出价的平台写入。
- token refresh、保存敏感信息、修改历史 attempts 或删除历史真值。

## 验收

- 已 resolved 的真实账户不再显示 `monitor_id_already_resolved_no_create_needed` root blocker。
- `1871922414575753` 保持 `monitor_create_busy_retry_exhausted`。
- root blocker 仍为零或一个，UI 与 API 消费相同 readiness 状态。

## 执行结果

- 新增 `mwb.v_monitor_readiness`，将 current readiness 与历史诊断拆分。
- 已 resolved 的 monitor cycle 不再向 blocker report 输出重复创建或 cycle 停止诊断。
- `workflow_case_summary` 只消费 canonical actionable blocker；真实账户投影已验证。
- 工作台 monitor 子项改读 `monitorReadiness`；`run_monitor_readonly` 只触发 fresh readonly reconcile。

## 验证

`test:workflow-case`、`test:workbench-conversation`、`smoke:api`、`validate:schemas`、直接 Postgres 投影校验和 `git diff --check` 均通过；`test_run` Job 数为 0，未调用平台写接口。
