# TASK-MWBV2-EVENT-CONFIG-PARTIAL-BASELINE-CLOSURE-20260901

状态：completed

## 授权来源

用户于 2026-09-01 批准“事件配置 partial baseline 最小闭环修复”并要求直接实施。

## 唯一目标

让唯一通用 Plan-bound 工作台主链在“部分 baseline 已配置、其余缺口当前 available”的真实状态下生成正确的 fresh Resource Plan，而不放宽任何写入、确认、回查或 fail-closed 边界。

## 已确认事实

- 当前 Case 的 latest runtime Job 已是 fresh Job，旧 Plan 已 `consumed`，不得复用。
- 权威只读结果为 event configs 4/6，剩余两个 baseline 事件当前 available；现有 executor 在零平台写入前错误阻断。
- `eventConfigBaselineReadiness` 已正确计算已配置集合与 available 集合的并集；executor 与事件链仍各自按 available 单独 6/6 提前判定。

## 实现范围

- 让 event-config preflight 与 Node 04 事件链只消费共享 `eventConfigBaselineReadiness` 的联合判定。
- 补充真实 preflight/executor 与事件链的 4/6、5/6、6/6、缺口不可用回归覆盖。
- 更新当前机制、数据契约、经验与启动协议中的单一分类器说明。
- 重启工作台并对当前 Case 仅执行既有“重新只读准备”，确认 fresh Job/Plan 的只读恢复结果。

## 禁止

- 所有真实平台写入、自动 confirmation、重试、action grant 或旧 Plan/confirmation/idempotency key 复用。
- OAuth refresh、标准项目创建、资源创建、预算或出价变更。
- 新增 API、Schema、View、Gate、Plan/action 类型、后台 worker 或旁路 CLI。
- 保存 token、Cookie、secret、完整 URL、raw request、raw payload、raw response 或 event ID 列表。

## 验收

- 4 configured + 2 available 产生 `needs_create`、2 个候选且零写入；5/6 + 1/6 同理；6/6 + empty available 为 no-op READY。
- 仅未配置且不可用的事件保持 `event_config_available_events_baseline_missing` 并零写入。
- 事件链只对该交集追加 available blocker；configs 6/6 后继续 optimized-goal 与 DBT 回查。
- 所有 live event、orchestrator、工作台/API、Schema/数据合同/安全和 runtime consistency 校验通过。
- 当前 Case 的恢复只创建 fresh readonly Job；新 Resource Plan 等待用户精确“确认准备资源”，本 Task 不触发真实写入。

## 停止条件

- 修复需要放宽共享分类器、Plan 绑定、确认、调用上限或权威回查规则。
- 修复需要真实平台写入、自动重试、Token 刷新或新建 Schema/API/Gate。

## 完成结果

- `oceanengineEventConfigExecutor` 的 available 读取已退回为 HTTP、解析和标准化；它与已配置 configs 齐备后只通过共享 `eventConfigBaselineReadiness` 决定 partial baseline 的候选和 blocker。
- Node 04 保留 configs 未满 6/6 的 `event_configs_baseline_missing`；仅缺失 configs 与当前 unavailable 的交集才追加 `available_events_baseline_missing`。完整 6/6 不再要求 available 保留历史已配置项。
- 新增真实组合回归：4 configured + 2 available 仅创建 2 项，5+1 仅创建 1 项，6+empty 为 no-op，未配置且不可用在写前 fail-closed；Node 04 同步覆盖只缺 configs、双 blocker 和 6/6 后 optimized-goal/DBT 继续。
- 已通过 live event、resource registry、single-confirmation、workflow/API、workbench、Schema、数据合同、安全摘要与 runtime consistency 验证；所有测试使用 mock 或 `test_run`，真实平台写入为零。
- 本机工作台已重启。当前 Case 通过精确“重新只读准备”创建 fresh runtime Job；权威 summary 为 ready `resource_prepare` Plan、零 root blocker、零 confirmation、零 platform action。Node 04 只读诊断为 4 configured / 2 available，未再产生 false available blocker。
- 新 Plan 仍只等待用户在工作台输入精确“确认准备资源”；本 Task 未确认 Plan、未创建资源或标准项目、未重试或刷新凭据。
