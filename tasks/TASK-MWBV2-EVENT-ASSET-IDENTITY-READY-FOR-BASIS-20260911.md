# TASK-MWBV2-EVENT-ASSET-IDENTITY-READY-FOR-BASIS-20260911

任务状态、读取清单与验证结果：[Context Manifest](../tasks-context-manifests/TASK-MWBV2-EVENT-ASSET-IDENTITY-READY-FOR-BASIS-20260911.json)。

## 目标

在 Node 5 事件资产执行器链路中，新增“已核验身份但缺 baseline 配置”分支：在满足身份可核验且仅缺 `event_configs_baseline_missing` 时，直接返回 `event_asset_identity_ready`，不触发事件资产平台创建，并向下游事件配置动作透传 `runtime_event_asset_id`。

## 批准方案

用户明确方案是：不改机制，不新增平台写入边界，仅补齐 `event_chain` 已就绪但 `baseline` 未齐的闭环。该分支与事件资产只读已存在身份核验为准，作为 `deferFullEventChainUntilConfigs` 流程的有效准备态；其余场景仍走现有平台写入/阻断规则。

## 范围

- 修改 `src/platforms/oceanengineEventAssetExecutor.mjs`，新增 `preflight` 分支：仅当 `event_configs_baseline_missing` 且该条 blocker 独占、身份可核验时返回 `event_asset_identity_ready`。
- 修改 `scripts/04-event-asset-executor-smoke.mjs`：新增 baseline-missing 只读身份分支断言，补强与 `event_asset_target_not_found` 的两类对照。
- 更新 `project.state.json` 激活本任务指针。

## 非目标

- 不恢复或补偿 `event_asset_target_not_found` 时的平台创建流程。
- 不引入视频数量硬编码、不改用旧 `asset.metadata.video_id`。
- 不修改确认模型、主链 Gate、Case/Job 流转或真实平台写入权限。

## 验收

- AC-01: `npm run test:event-asset-executor` 通过；关键断言覆盖 `event_configs_baseline_missing` 与 `event_asset_target_not_found` 两类 blocker。
- AC-02: `npm run check:project -- --phase start` 通过；`result` 与 `manifest` 记录与实际范围一致。

## 停止条件

- 需要新增平台写入动作或放宽 `event_configs_baseline_missing` 的阻断语义时暂停。
- `event_chain` 已验身份但缺基线配置之外的未知场景出现（例如凭据、实例绑定不一致）时需人工确认。

## 交付说明

完成后记录执行指纹、测试证据和验证结果。Case 侧仅需在同一 Case 执行一次“重新只读准备”即可重新入场，避免触发新的平台创建动作。
