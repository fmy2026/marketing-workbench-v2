# TASK-MWBV2-OE3-CREATE-DIAGNOSTICS-AND-FIELD-CONTRACT-HARDENING

状态：completed

更新时间：2026-08-25 CST

## 目标

收敛 OE3 `std_project/create` 的可诊断性与字段合同：不保存 raw payload、raw response 或完整平台 message；保存受控 request ID、错误类别和允许的字段路径；未来创建只发送有本机官方依据的字段。

## 固定边界

- 只使用 v2 代码、`marketing_workbench_v2.mwb` 与 AGENTS 指定的本机官方文档。
- 不调用 OceanEngine，不刷新凭据，不创建 job，不执行或重试 `std_project/create`。
- `JOB-MWBV2-20260825083821-9DB6FE` 保持 `failed_waiting_manual_review`，其已有 action 保持 1。
- 完整触点 URL、完整落地页 URL、token、Cookie、raw payload、raw response、完整平台 message 均不得进入普通表、API、前端、任务文件或日志。

## 实施

1. 复用 `mwb.platform_actions` 的既有 forensic 字段，将语义升级为 `request_id`、`error_category`、`offending_field_path`；request ID 仅数据库内部可读。
2. 执行器只在内存中解析响应，按白名单抽取类别和字段路径；无法安全归类时写 `unclassified` 与 hash。
3. 在 `mwb.game_route_defaults.raw_defaults.official_create_field_contract` 写入官方字段证据矩阵。
4. `delivery_type`、`micro_promotion_type`、`layer_roi_switch` 在创建合同无直接依据前默认 omit；`instance_id` 保留但因仅有相关接口依据而阻断 future create。
5. payload manifest 与 create preflight 增加字段证据结果。

## 完成结果

- 已应用 `db/017_harden_platform_action_diagnostics.sql`：`platform_actions` 现在仅保存内部 `request_id`、枚举 `error_category`、白名单 `offending_field_path` 与既有 hash；API/前端投影不返回 request ID。
- 已在 `game_route_defaults.raw_defaults.official_create_field_contract` 固化 OE3 字段证据矩阵。`delivery_type`、`micro_promotion_type`、`layer_roi_switch` 默认 omit；`instance_id` 保留但在获得直接创建字段依据前 block。
- fake transport 已覆盖字段、权限和未知错误：只落安全类别/字段路径/hash，不落平台 message。
- `JOB-MWBV2-20260825083821-9DB6FE` 仍为 `failed_waiting_manual_review`，`platform_actions=1`、`created_objects=0`，没有重试。

## 验证

| 命令/检查 | 结果 |
| --- | --- |
| `npm run test:payload-contract` | passed：真实矩阵阻断 `instance_id`；完整 test fixture 通过 |
| `npm run test:execution-grant` | passed：fake 字段/权限/未知错误均安全归类，未调用真实平台 |
| `npm run test:create-result-mapping` | passed |
| `npm run test:runtime-reservations` | passed |
| `npm run check:runtime-consistency -- --job-id JOB-MWBV2-20260825083821-9DB6FE` | passed：历史失败 job 未变化 |
| `npm run smoke:api` | passed |
| Postgres 安全审计 | 普通摘要和草稿摘要真实敏感内容命中数均为 `0` |

## 验收

- fake transport 的字段、权限、未知错误只产生受控诊断数据。
- 不保存 raw 数据；安全扫描通过。
- 未获创建直接依据的三项可选字段不会发送；`instance_id` 未获直接依据时阻断网络调用。
- 人工构造的完整证据矩阵可通过 payload/preflight 测试。
- P02 job 状态、platform action 数和 created object 数不变。

## 下一步 Gate

本任务关闭后，先完成 `instance_id` 的创建字段官方依据或获得平台书面确认；随后才可新建 fresh runtime job 并再次进入单次创建确认。
