# TASK-MWBV2-NODE4-EVENT-ASSET-ORDER-20260901

状态：completed

## 目标

在不改变 Case/Job、3 阶段 7 Node、`workflow_case_summary`、Plan、确认或 executor 的前提下，修正 Node 04 的事件资产前置顺序：先以受控实例候选取得 event asset Plan 资格，资产绑定和 configs 完成后才进行最终优化目标与 DBT 权威回查。

## 范围

- 统一 Node 04 的受控小游戏实例候选规则，并移除独立实例优化目标回查对 Plan/Gate/READY 的影响。
- 调整 event asset 合同、只读链路、资源就绪投影及既有 Plan 编译消费顺序。
- 同步 Solution Design、逻辑图、数据与报表契约和 lessons；添加 focused fake/test_run 回归。
- 对用户指定的活动 Case 仅执行合同所需只读和 fresh Plan 资格验收；不确认、不执行。

## 禁止

- 任何真实平台写入、confirmation、action grant、资源/config/monitor/标准项目创建、token refresh、预算或出价修改。
- 新增业务表、View、Node、Plan 类型、action 类型、公开 API 或第二套 Gate 真值。
- 保存动态账户状态、敏感凭证、完整 URL 或 raw request/response。

## 验收

- 唯一受控实例候选且 event asset 缺失时，不依赖独立 optimized-goal 成功即可生成 `resource_prepare` Plan。
- 候选缺失、歧义、来源不受控时 fail-closed；资产绑定不一致时不执行 configs；configs 不完整时不调用最终优化目标。
- 完整测试链路严格为资产回查 → configs → 携带 `asset_id` 的优化目标 → DBT；已有资产不重复创建。
- 测试和目标 Case 验收前 confirmation、platform action 与 created object 均为零；`workflow_case_summary` 仍仅有一个 root blocker。

## Solution Link

- source：用户批准的“Node 04 事件资产顺序最小修正方案”。
- current truth：`project.state.json`、本 Task/Manifest、当前代码与 Schema，动态业务事实仅为 Postgres `mwb.workflow_case_summary`。
- stop condition：需要真实平台写入、修改 Case Gate/View 真值、增加 Plan/action/node/schema 或发现官方合同要求改变。

## 完成结果

- Node 04 已以唯一受控实例候选生成事件资产合同；独立 optimized-goal 只保留审计诊断，不能提升资源真值或 Plan 资格。
- 资产 detail 的 App + instance 绑定成为目标实例已核验的唯一来源；configs 前不会调用最终优化目标，最终优化目标与 DBT 均携带真实 asset ID。
- event asset Resource Plan 已冻结顺序动作 `ensure_resource:event_asset` → `ensure_event_configs:baseline`；测试、Schema、Case Gate、API 和确认编排回归已完成，未执行真实平台写入。
