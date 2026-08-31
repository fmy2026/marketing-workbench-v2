# TASK-MWBV2-MONITOR-SINGLE-PLAN-CHAIN-20260831

状态：completed

## 目标

将 monitor 收敛为 Node 02 唯一的 Plan-bound bootstrap 能力，删除旧 CLI 环境变量写入口和重复 smoke；不调用真实平台写接口。

## 范围

- 为 `launch_execution_plans` 引入 `plan_kind`，支持只含 `ensure_monitor` 的 `monitor_bootstrap` Plan。
- 复用 confirmation、action grant、platform_actions 与 runner，完成 monitor Plan 编译、确认预览和 mock-safe executor。
- 将 monitor implementation 迁入一个 Node 02 module package；CLI 仅保留状态、readonly reconcile、config sync。
- 删除旧 monitor CLI、独立 ensure/plan/reissue 命令与重复 smoke。

## 禁止

- 真实 monitor、资源、广告项目平台写入，或 token refresh。
- 通过 env variable 绕过 Plan、confirmation、Guardrail 或 action grant。
- 删除历史 migration、monitor cycle/attempt 事实或保存敏感数据。

## 验收

- `monitor_bootstrap` Plan 只有 `ensure_monitor`，并完全通过已有 Plan-bound 授权校验。
- 普通广告 Plan 不再混入 monitor action；旧 CLI 无真实写入口。
- Guardrail/Plan/hash/confirmation/action grant 任一失败时零写入。
- 所有 monitor 逻辑只有一个 facade 与一个回归入口。

## 执行结果

- `launch_execution_plans` 已增加受限的 `plan_kind`；`monitor_bootstrap` 只能含一个 `ensure_monitor` 动作，且只在 canonical readiness 为 `needs_plan` 时可进入确认 Gate。
- Monitor 创建现只可经现有 Plan、confirmation、action grant、原子 action claim、单次执行和权威 readonly 回查链路完成；环境变量不再构成写入授权。
- Node 02 已收敛到 `02-monitor/` package。长期 CLI 仅保留 `monitor:status`、`monitor:reconcile` 与 `monitor:config-sync`；旧 CLI、旧写入口和五个重复 smoke 已删除。
- 工作台确认文案区分为“确认创建 monitor”；Monitor Bootstrap 成功后不自动推进 Node 03–07。

## 验证

`validate:schemas`、`test:monitor`、`test:execution-plan`、`test:execution-grant`、`test:workflow-case`、`test:workbench-conversation`、`smoke:workflow-skills`、`smoke:api` 与 `git diff --check` 已通过。

最终只读核验：三个真实账户的 canonical readiness 分别为 READY、READY、`terminal_failed`；当前 Case `CASE-MWBV2-5B75EB40E6F9AF2469` 的唯一根阻断为 `monitor_create_busy_retry_exhausted`。`test_run` Job 为 0，runtime `ensure_monitor` 平台动作数为 0。
