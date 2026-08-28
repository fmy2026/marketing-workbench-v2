# TASK-MWBV2-OE3-MICRO-APP-INSTANCE-READONLY-1871922346964041

状态：completed_micro_app_instance_ready

更新时间：2026-08-28 CST

## 目标

仅解决目标账户 `1871922346964041` 的 `micro_app_instance` Node 4 资源可用性：使用候选小游戏实例在目标账户执行 `optimized_goal/get` 只读 eligibility 回查，通过后将资源标记为 `visible + readback_verified`。

## 范围

| 项 | 值 |
| --- | --- |
| case | `CASE-LEGACY-2E4217E20C9E26BFB648772C` |
| route | `oceanengine_3_byte_mini_game` |
| game | `JSZC` |
| target advertiser | `1871922346964041` |
| resource | `micro_app_instance` |
| app source | `mwb.game_platform_apps` |

## 边界

| 类型 | 规则 |
| --- | --- |
| 允许 | 目标账户 `optimized_goal/get` 只读回查 |
| 禁止 | 创建实例、共享实例、`std_project/create`、token refresh、任何平台写入 |
| 更新 | 仅 `account_resources.micro_app_instance` 与本任务 fresh job 的 evidence/skill/plan 摘要 |
| Node 5 | 继续保留 19 位 `instance_id` JSON `number` 传输合同 blocker |

## 官方依据

| 依据 | 本机来源 |
| --- | --- |
| 创建字段 `instance_id` 存在、类型与小游戏适用性 | `open.oceanengine.com-3.0-waibugei/巨量营销智擎版/创建标准项目.md:199` |
| 只读 eligibility 查询字段 `mini_program_id` / `micro_app_instance_id` | `open.oceanengine.com-3.0-waibugei/调控任务/标准项目下获取可用优化目标.md:27` |

## 验收

- [x] fresh readonly job 已创建：`JOB-MWBV2-20260828083124-B7BE76`。
- [x] `optimized_goal/get` 命中当前路线所需优化目标。
- [x] 通过时 `account_resources.micro_app_instance = visible + readback_verified`。
- [x] baseline 只读适配器不再凭本地 appid 误判通过。
- [x] `micro_app_instance.prepare_supported=false`，无 `ensure_resource:micro_app_instance`。
- [x] `payload-contract` 仍保留 `instance_id_long_id_transport_not_verified`。
- [x] 证据不保存 token、完整 URL、raw payload、raw response。

## 执行结果

| 项 | 结果 |
| --- | --- |
| fresh job | `JOB-MWBV2-20260828083124-B7BE76` |
| 只读结论 | passed；`target_optimized_goal_eligible` |
| 目标资源 | `visible + readback_verified` |
| 优化目标 | 当前 objective 与 deep objective 均命中 |
| 平台写入 | 0 |
| token refresh | 未调用 |
| 执行计划 | 不生成 `ensure_resource:micro_app_instance`；仍阻断创建前草稿/Node 5 |

## 验收结果

| 命令/检查 | 结果 |
| --- | --- |
| `npm run test:micro-app-instance-readonly` | passed |
| `npm run test:resource-action-registry` | passed |
| `npm run test:node4-resource-prep-contracts` | passed |
| `npm run test:payload-contract` | passed |
