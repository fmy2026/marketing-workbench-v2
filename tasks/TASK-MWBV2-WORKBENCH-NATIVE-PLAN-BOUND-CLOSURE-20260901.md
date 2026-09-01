# TASK-MWBV2-WORKBENCH-NATIVE-PLAN-BOUND-CLOSURE-20260901

状态：completed

## 授权来源

用户于 2026-09-01 明确批准“工作台原生闭环：用户无需 Codex 完成首次项目创建”并要求实施。

## 唯一目标

让本机单用户从工作台完成只读准备、Resource Plan 确认与回查、fresh Job、Create Plan 确认、单次创建和权威回查；运行时不依赖 Codex 修改仓库 scope。

## 实现范围

- 增加固定 loopback Plan-bound runtime policy，并集中校验 active Case 最新 Job、Plan kind/status/hash、确认短语、动作与调用上限。
- command 成为唯一正式 runtime 写入口；收紧 `/run` 和旧 execute 路由。
- confirmation 原子单次消费；并发确认只允许一个执行者。
- 统一工作台授权、确认、执行、回查、完成和下游依赖状态文案。
- 更新 AGENTS、Solution Design、逻辑图、数据契约及 mock/test_run smoke。

## 禁止

- 本 Task 消费当前真实 Resource Plan、写入真实 confirmation、调用任何平台写接口或创建标准项目。
- 新增数据库表、View、Gate、Plan 类型或旁路 executor。
- 自动确认、自动重试、自动 token refresh、预算或出价变更。
- 保存 token、Cookie、secret、完整触点 URL、raw request、raw payload 或 raw response。

## 验收

- 策略关闭时所有 runtime Plan 确认 fail-closed；策略开启时只有当前 loopback command 的精确确认可用。
- 历史 Job、非最新 Job、非 active Case、Plan/hash 漂移、错误短语、并发重复均零平台动作。
- Resource 成功 mock 自动生成 fresh Job；其 Create Plan 只含一次 `std_project_create`。
- 前端不再出现“已暂停：无阻断”或“等待 Codex 授权”。
- 当前真实 Case 只读展示可确认，但 confirmation/action/object 仍为 0。

## 完成摘要

- 已启用 loopback-only `workbench_runtime_write_policy`；`platform_write_allowed` 仍为 `false`。
- Resource、monitor 与 Create 共用同一 Plan-bound 运行时授权解析；confirmation 使用 Postgres 原子首次 claim。
- runtime `/run` 限制为只读模式，旧 execute 路由对 `runtime_truth` 禁用，POST 要求 loopback 同源 JSON。
- 工作台已显示“进度 4/7 · 待确认”，“确认准备资源”可用，Node 5–7 保持依赖等待语义。
- mock 完整链路证明两份独立 confirmation、一次 `std_project_create`、一条权威 readback；并发确认只有一个获胜者。
- 最终只读复核确认当前 latest Job 仍为 0 confirmation、0 action、0 object、0 verified readback，本 Task 未消费真实 Plan。
