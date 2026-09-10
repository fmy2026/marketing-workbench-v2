# TASK-MWBV2-HISTORICAL-CASE-MINIMAL-RECONCILIATION-20260910

任务状态、读取清单与验证结果：[Context Manifest](../tasks-context-manifests/TASK-MWBV2-HISTORICAL-CASE-MINIMAL-RECONCILIATION-20260910.json)。

## 目标

收口冯美钰名下两个已经被独立、权威成功 Case 取代的历史 active Case，并将首页标题“活动账户”改为“进行中的流程”。

## 批准方案

用户于 2026-09-10 批准：仅取消账户 `1871922346964041` 的 legacy active Case，取消账户 `1871922434025472` 的重复 active Case 并将其未消费创建 Plan 置为 `stale`，不调用媒体平台、不删除或改写成功项目、readback 或历史动作证据；首页只调整该标题。

## 范围

- 新增一次性、精确目标的数据库 migration，执行前验证两个已完成 Case 的 `readback_verified` 证据。
- 修改首页活动 Case 区域标题。
- 维护本 Task、Manifest、项目状态及脱敏验证证据。

## 非目标

- 不改动账户/ID 展示、状态中文化、重复 Case 防护或其他工作台界面。
- 不调用外部平台，不创建、确认、重试或删除任何平台对象。
- 不删除或篡改历史 Job、Plan、confirmation、action、created object、readback 或 evidence。

## 验收

- AC-01: Task 启动检查通过，范围与干净基线准确。
- AC-02: 首页标题为“进行中的流程”，其余活动 Case 展示逻辑未改。
- AC-03: migration 仅收口指定两个历史 Case，重复 ready Plan 变为 `stale`，两个成功项目继续保持 `readback_verified`。
- AC-04: 冯美钰的 active Case 数为 0，首页 API 不再返回这两条历史流程。
- AC-05: 关闭前后项目检查通过，Task 正常收口。

## 停止条件

- 任一指定 Case、Plan 或独立成功 readback 前提与批准方案不符。
- migration 需要修改历史证据、发起外部平台调用或扩大到其他账户/Case。
- 任一变更超出 Manifest 的允许路径或平台写入边界。

## 交付说明

完成后交付已收口的历史状态、首页单处标题更新及验证证据。账户名称、ID 展示、中文状态和重复防护仍留待后续工作台全面重构。
