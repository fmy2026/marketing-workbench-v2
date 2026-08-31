# TASK-MWBV2-MONITOR-TERMINAL-READONLY-RECONCILE-20260831

状态：completed

## 目标

为终态失败的 monitor Case 增加精确工作台指令“重新只读回查 monitor”；只执行 fresh readonly reconcile，零平台写入。

## 范围

- 新增 allowlist 对话意图与后端 Gate Action Policy 分流。
- 仅允许 active Case 的最新 Job、`resolve_case_blocker`、唯一 `monitor_create_busy_retry_exhausted` blocker、`monitor_resolved=false`。
- 复用现有 Node 02 readonly reconcile 与脱敏输出，补齐工作台回归测试和静态机制文档。

## 禁止

- monitor、资源、广告项目、预算/出价平台写入或 token refresh。
- 修改 `workflow_case_summary`、新增 Plan/confirmation/action grant、重试或改写历史 cycle/attempt/Plan。
- 保存 raw request/response、完整触点 URL 或凭证。

## 验收

- 精确指令只触发一次 readonly reconcile；创建调用次数为 0。
- “继续执行”、历史 Job、非 active Case 和其他 blocker 不能触发回查。
- 找到 monitor 时刷新既有 Case 投影；未找到或失败时保留原 blocker。

## 执行结果

- 工作台新增精确指令“重新只读回查 monitor”，仅对 active Case 的最新 Job、`resolve_case_blocker`、唯一 `monitor_create_busy_retry_exhausted` blocker 和未 resolved monitor 生效。
- 通用“继续执行”保持 blocker 提示，并显示精确只读指令；历史 Job 和其他 blocker 仍无法触发回查。
- 回查继续复用现有 Node 02 readonly reconcile；结果文案明确不会创建或重试，且未找到时要求新的 `monitor_bootstrap` Task/Plan。

## 验证

`test:workbench-conversation`、`test:workflow-case`、`test:monitor`、`smoke:api` 和 `git diff --check` 通过。最终 `test_run` Job 为 0，runtime `ensure_monitor` 平台动作数为 0；当前 Case Gate 与唯一 root blocker 保持不变。
