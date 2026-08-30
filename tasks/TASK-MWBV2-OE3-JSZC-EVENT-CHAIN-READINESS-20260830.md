# TASK-MWBV2-OE3-JSZC-EVENT-CHAIN-READINESS-20260830

状态：closed_validated_no_platform_write

更新时间：2026-08-30 CST

## 目标

将 JSZC/BYTE_GAME 的目标账户事件资产、小游戏实例、PAY 优化目标、7 日 ROI 深度目标和深度出价收敛为唯一的正式 Node 4 只读链路；不执行任何平台写入。

## 范围

- 目标账户：`1871922434025472`；路线：`oceanengine_3_byte_mini_game`；游戏：`JSZC`。
- 新增 `event-chain-readonly` 正式 Node 4 Skill，复用只读客户端、`account_resources` 与 `evidence_artifacts`。
- 事件资产与小游戏实例继续保留为两个资源类型，但共享同一份只读结论；禁止历史实例 ID 直接成为目标账户运行真值。
- 使用资产列表、资产详情、可用优化目标和可用深度优化方式的只读证据，形成稳定、可行动的 blocker。
- 更新正式 runner、Skill 合同、节点注册、资源 registry、只读诊断入口与 focused smoke。

## 禁止范围

- 事件资产、实例、优化目标、共享关系或落地页的任何平台写入。
- `std_project/create`、Promotion、资源 executor、token 刷新、预算或出价修改。
- 修改当前 blocked Job `JOB-MWBV2-20260830110925-8CA4A1`、其 Plan 或其审计事实。
- 新增第二套 Workflow、payload builder 或数据库表。

## 验收

- 正式 Node 4 只调用一条事件链协调 Skill；两个资源 verifier 不再各自发起目标/深度优化查询。
- 无候选、App 不匹配、多候选、历史实例候选、PAY 缺失、深度目标缺失、深度出价缺失均输出精确 blocker 且零平台写入。
- 完整 fake readback 使 `event_asset` 与 `micro_app_instance` 同时通过目标账户 readback；不存在目标账户 ID、raw query 或 raw response 持久化。
- 完成后当前正式认证 Task 仍保持 blocked，等待平台侧资源准备；外部准备完成后必须创建 fresh readonly Job。

## Solution Link

- source：`docs/Solution Design.md`、`docs/project-lessons.md`、本地 OE3 资产与优化目标官方资料。
- objective：修正 Node 4 对事件资产/实例链的只读真值与 blocker 分类，不把未知平台写入接口带入正式机制。
- current truth：Postgres `marketing_workbench_v2.mwb`、当前代码、当前认证 Task/Manifest。
- stop condition：需要平台写入、缺少本地官方只读合同、或任何路径要求以历史 ID 覆盖目标账户事实时停止。

## 关闭结果

- `event-chain-readonly` 已成为正式 Node 4 中事件资产、小游戏实例、优化目标和深度优化的唯一目标账户只读协调 Skill。
- 基础资源盘点不再更新 `event_asset`；事件资产与小游戏实例的两个 resource verifier 只消费同一份事件链只读结论。
- 已移除独立 micro-instance CLI/smoke 与旧双查询模块，避免形成第二套 Workflow；`workflow:readonly-readiness` 是唯一正式只读入口。
- 新增 focused fake-transport 回归，覆盖无资产、App 不匹配、多候选、仅历史候选、PAY/深度目标/深度出价缺失及完整通过链路。
- 未调用真实平台接口、未生成 Confirmation、未执行任何平台写入，目标账户原 blocked Job/Plan 未改动。
- 正式认证 Task 恢复为 active；下一步仍是平台侧完成事件资产/实例/目标链与备用页共享，然后创建 fresh readonly Job 复核。
