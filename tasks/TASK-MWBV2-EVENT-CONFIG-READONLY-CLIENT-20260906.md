# TASK-MWBV2-EVENT-CONFIG-READONLY-CLIENT-20260906

状态：completed

## 目标

修复事件资产已创建并权威回查后，事件配置 executor 的默认只读客户端因引用未定义函数而误报 `event_asset_inventory_readonly_failed`；随后使用既有“重新只读准备”恢复当前 Case。

## 范围

- 默认事件配置只读客户端直接复用共享 OceanEngine readonly client 与 15 秒 deadline。
- 增加默认客户端路径 mock 回归，确保传入 fetch 被调用并保留零自动重试。
- 重启本机服务后，对 `CASE-MWBV2-7F8C748BE84126BE77` 执行一次精确“重新只读准备”。
- 到达新的资源确认卡或唯一真实 blocker 后关闭 Task/Manifest。

## 禁止

- 不复用已 consumed 的 Resource V3、旧 confirmation、action grant 或 idempotency key。
- 不确认 fresh Plan，不调用事件配置、资源或广告项目平台写入。
- 不新增 Schema、API、Plan/action 类型、确认短语或旁路入口。

## 验收

- 默认客户端路径不再产生本地 `ReferenceError`，mock fetch 至少被调用一次。
- 当前 Case 创建 fresh runtime Job；旧 Job 与 V3 保持终态且可审计。
- fresh Job 停在资源确认卡或唯一真实 blocker；本 Task 平台写入为 0。

## Solution Link

`docs/Solution Design.md` 的“2026-09-06 Event Config 默认只读客户端修复（已批准）”。

## 完成证据

- 默认事件配置只读客户端已直接复用共享 OceanEngine readonly client；不存在的 `fetchEventConfigCreate` 引用已删除。
- focused mock 验证默认路径调用一次 GET、零写请求，并返回真实 `event_asset_target_not_found` 而非本地异常映射。
- fresh Job `JOB-MWBV2-20260906104527-7EB517` 已由精确“重新只读准备”创建；旧 Resource V3 保持 `consumed`。
- fresh Resource V1 为 `ready`，仅包含事件配置和其余未完成资源；已完成的事件资产创建未再次进入 Plan，fresh Job 平台 action 数为 0。
- 对 fresh Job 的真实无确认预检返回 `needs_create`、零 preflight blocker、无 inventory failure、零平台写入和零 token refresh。
- 当前 Case 停在 `await_job_write_authorization`，确认短语为“确认准备资源”。

完成时间：2026-09-06 18:46 CST
