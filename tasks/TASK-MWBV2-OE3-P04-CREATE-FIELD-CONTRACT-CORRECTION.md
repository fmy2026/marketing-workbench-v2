# TASK-MWBV2-OE3-P04-CREATE-FIELD-CONTRACT-CORRECTION

状态：closed

更新时间：2026-08-29 CST

## Brief

修正 OE3 JSZC 标准项目创建字段合同：`delivery_type` 与 `layer_roi_switch` 已有官方 `std_project/create` 直接字段依据，应进入最终 create payload；`micro_promotion_type` 仅用于 Node 4 只读优化目标查询，不进入 Node 5 创建候选字段。

## Scope

允许：更新本地代码、测试、任务文件、context manifest、`project.state.json`，以及新增一条只更新 `mwb.game_route_defaults.raw_defaults.official_create_field_contract` 的 Postgres 迁移。

禁止：真实平台写入、`std_project/create`、素材更新、token refresh、预算或出价修改、新增表、View 或报表、保存 token、完整 URL、raw request、raw response 或完整 payload。

## Acceptance

- [x] `delivery_type=NORMAL` 与 `layer_roi_switch=OFF` 出现在最终 payload。
- [x] 两字段在 `officialFieldEvidence` 中为 `official_direct/send`。
- [x] `micro_promotion_type` 不出现在最终 payload。
- [x] 非法 `delivery_type` 或 `layer_roi_switch` 在 create preflight 前阻断。
- [x] Fresh runtime-truth Job 仅执行 Node 1-5，且平台写入计数为零。

## Result

已完成。

| 项 | 结果 |
| --- | --- |
| 字段合同迁移 | `db/047_jszc_create_field_contract_delivery_and_layer_roi.sql` 已应用，更新 1 行路线配置。 |
| Node 5 | `micro_promotion_type` 已移出 create 候选 payload；仅保留 Node 4 只读查询用途。 |
| Preflight | `delivery_type`、`layer_roi_switch` 加入枚举校验；`micro_promotion_type` 进入 forbidden field。 |
| Payload contract | 新增 `create_field_contract_delivery_layer_micro` Gate。 |
| Fresh runtime job | `JOB-MWBV2-20260829133430-20A33B`，停在 Node 5，`payloadContractStatus=passed`、`createPreflightStatus=passed`、blockers 为空。 |
| 写入审计 | `executionPlans=0`、`launchConfirmations=0`、`platformActions=0`、`createdObjects=0`、`readbackRecords=0`。 |

## 验证

| 命令 / 检查 | 结果 |
| --- | --- |
| `node --check` changed modules | passed |
| `psql -X -d marketing_workbench_v2 -f db/047_jszc_create_field_contract_delivery_and_layer_roi.sql` | passed |
| `npm run test:payload-contract` | passed |
| `npm run test:mini-game-launch-link` | passed |
| `npm run smoke:workflow-skills` | passed |
| Fresh runtime `draft_readiness` | passed，未创建 execution plan 或平台写入记录 |
