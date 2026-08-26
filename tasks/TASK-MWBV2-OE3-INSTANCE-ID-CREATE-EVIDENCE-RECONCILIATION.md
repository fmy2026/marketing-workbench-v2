# TASK-MWBV2-OE3-INSTANCE-ID-CREATE-EVIDENCE-RECONCILIATION

状态：completed

更新时间：2026-08-25 CST

## 目标

核对 `instance_id` 的创建字段证据，并将尚未有官方合同的 19 位 JSON number 传输问题保持为明确阻断。

## 范围与边界

- 只读取 v2 代码、`marketing_workbench_v2.mwb` 与 AGENTS 指定的本机官方资料。
- 不调用 OceanEngine，不新建 job，不刷新 token，不执行或重试 `std_project/create`。
- `JOB-MWBV2-20260825083821-9DB6FE` 必须保持 `failed_waiting_manual_review`，create action 保持 1，created object 保持 0。
- 不保存或输出 token、Cookie、完整触点 URL、完整落地页 URL、raw payload、raw response 或文档原文。

## 实施项

1. 增加 `check:oe3-instance-id-evidence`，检查创建文档的字段名、类型、`MICRO_GAME + BYTE_GAME` 条件及长数字 JSON 传输依据。
2. 将 `std_project/list.instance_id` 与 `optimized_goal/get.micro_app_instance_id` 固定为相关证据，不得替代创建字段证据。
3. 通过 `db/018_reconcile_oe3_instance_id_create_evidence.sql` 更新路线合同：`instance_id` 是创建字段候选，`micro_app_instance_id` 仅为优化目标查询字段。
4. 本机创建文档已证明字段名、`number` 类型和小游戏适用性，但未证明 19 位 ID 的 JSON number 传输；因此不发送该字段，并以 `instance_id_long_id_transport_not_verified` 阻断。
5. 将脱敏检查摘要写入 `mwb.evidence_artifacts`。

## 验收

- 当前资料下证据检查返回 `blocked`，原因是 19 位 ID 的 JSON number 传输合同缺失。
- payload 不含未经证实的实例候选字段，preflight 仍明确阻断。
- 全量 fixture 可以证明字段、类型、适用条件；没有 19 位长数字传输合同仍阻断。
- P02 历史失败 job 的状态、平台动作和创建数不变。

## 完成结果

- 已新增 `scripts/oe3-instance-id-create-evidence-check.mjs` 与 `npm run check:oe3-instance-id-evidence`。它只输出本机文档路径、hash、布尔结论与 blocker；当前结果为 `blocked`。
- 事实核对修正：本机《创建标准项目》请求参数表确有 `instance_id`，类型为 `number`，并可结合相同请求表中的 `MICRO_GAME`、`BYTE_GAME` 得到字段适用性；因此未将其错误标记为“字段不存在”。
- 唯一未获证实的部分是 19 位实例 ID 的 JSON `number` 传输策略。路线合同记为 `official_direct_partial`，当前 blocker 为 `instance_id_long_id_transport_not_verified`。
- 已应用 `db/018_reconcile_oe3_instance_id_create_evidence.sql`，将 `micro_app_instance_id` 固定为优化目标查询字段，创建 payload 不会带入 19 位 `instance_id`，但 preflight 不会静默放行。
- 脱敏证据已写入 `mwb.evidence_artifacts`，仅含状态、hash、布尔项与 blocker。

## 验证

| 命令/检查 | 结果 |
| --- | --- |
| `npm run check:oe3-instance-id-evidence` | passed：检查本身成功，证据结论为 `blocked` |
| `npm run test:payload-contract` | passed：真实合同阻断长 ID；完整内存 fixture 可通过 |
| `npm run smoke:api` | passed：7 节点 API smoke 正常，未调用平台 |
| `npm run check:runtime-consistency -- --job-id JOB-MWBV2-20260825083821-9DB6FE` | passed：历史 job 未变化 |
| Postgres 审计 | P02=`failed_waiting_manual_review`，platform actions=`1`，created objects=`0`，test jobs=`0` |

## 下一 Gate

补入平台关于 19 位 `instance_id` 的 JSON `number` 传输策略的本机官方资料或书面合同；之后先重跑证据检查，再新建 fresh runtime job 并重新取得单次创建确认。
