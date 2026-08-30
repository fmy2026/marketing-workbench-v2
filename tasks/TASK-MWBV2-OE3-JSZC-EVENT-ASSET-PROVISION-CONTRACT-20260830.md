# TASK-MWBV2-OE3-JSZC-EVENT-ASSET-PROVISION-CONTRACT-20260830

状态：closed_validated_no_platform_write

## 目标

为 JSZC 的 `event_asset` 建立唯一的“目标账户回查 → 已有即 READY → 缺失时仅在官方创建合同已验证后方可单次准备 → 完整回查”的正式机制。

## 已确认事实

- 目标账户：`1871922434025472`；路线：`oceanengine_3_byte_mini_game`；游戏：`JSZC`。
- 当前权威 blocker：`event_asset_target_not_found`。
- 参考账户 `1871922346964041` 提供的是目标账户已有资产后的只读验证经验，不存在事件资产创建平台动作记录。
- 当前官方 3.0 本地资料只确认资产列表/详情及目标/深度目标只读合同，未确认事件资产创建合同。

## 范围

- 补全 JSZC 事件资产保底模板的脱敏合同结构。
- 让 Node 4 明确区分已存在、可计划准备与不可准备三种状态。
- 新增只在经验证创建合同时可被调用的单次准备边界与 focused smoke。

## 禁止范围

- 真实平台写入、token 刷新、`std_project/create`、Promotion、预算或出价变更。
- 推测或硬编码未经官方验证的事件资产创建 endpoint、字段或 payload。
- 修改现有 Case、Job、Plan 或其运行事实。

## 验收

- 缺少官方创建合同时，事件资产保持 `BLOCKED`，不得进入 Execution Plan。
- 已有资产仍复用现有四段只读验证并零写入通过。
- 仅完整、可审计的模板与官方合同才允许产生 `ensure_resource:event_asset`；单次调用上限为 1，写后仍须资产/目标/深度目标回查。
- focused smoke 覆盖已有、缺失、合同缺失、模板缺失、歧义与重复执行。

## Solution Link

- source：`docs/Solution Design.md`、`docs/project-lessons.md`、官方 3.0 资产和优化目标资料。
- current truth：Postgres `marketing_workbench_v2.mwb`、当前代码和本 Manifest。
- stop condition：无法取得官方 3.0 创建合同、合同字段/权限不完整，或写后回查不通过时停止并保留 blocked。

## 关闭结果

- 已新增 JSZC 事件资产保底模板与官方创建合同的脱敏结构；真实数据明确标记为 `template_status=missing`、`official_create_contract.status=unverified`。
- Node 4 事件资产输出保留 `event_asset_target_not_found` 为首要目标账户 blocker，并附加模板/创建合同缺失的结构性 blocker。
- `ensure_resource:event_asset` 已登记为 reserved action，但 `prepare_supported=false`；因此任何 Execution Plan 都不会包含该动作。
- 已运行并通过事件资产合同、事件链、资源 registry、workflow、execution plan 与 schema 回归；未执行平台写入、token 刷新或项目创建。
- 下一步：单独任务先取得并验证官方 3.0 事件资产创建合同、字段清单、模板实现与权限，再实现 executor 并把 reserved action 升级为正式 action。
