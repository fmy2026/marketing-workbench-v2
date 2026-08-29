# TASK-MWBV2-AWEME-AUTH-POST-REFRESH-NODE4-20260829

状态：completed

更新时间：2026-08-29 CST

## Solution Link

| 项 | 值 |
| --- | --- |
| source | 用户确认的“Node 4 共享抖音号核验修正方案”；`docs/Solution Design.md` |
| objective | 修正 Node 4 对共享授权默认抖音号的只读核验机制，并用 fresh runtime-truth job 重新验证。 |
| current truth | PostgreSQL `marketing_workbench_v2.mwb`、当前代码、当前 manifest、官方 `tools/aweme_auth_list` 合同。 |
| stop condition | 非只读接口、raw response/token 保存、Node 5-7 生成、平台写入、默认号仍不可见或官方接口失败时停止。 |

## 固定对象

| 项 | 值 |
| --- | --- |
| case_id | `CASE-LEGACY-2E4217E20C9E26BFB648772C` |
| route_id | `oceanengine_3_byte_mini_game` |
| game_code | `JSZC` |
| advertiser_id | `1871922346964041` |
| default aweme_id | `57018827026` |
| 执行入口 | `npm run workflow:readonly-readiness -- --scope aweme_authorization --route-id oceanengine_3_byte_mini_game --game-code JSZC --advertiser-id 1871922346964041 --case-id CASE-LEGACY-2E4217E20C9E26BFB648772C` |

## 权限边界

允许：

- 修改 Node 4 只读核验机制、只读客户端安全摘要、只读 CLI、smoke、payload contract 相关只读 gate。
- 新增 readiness view 迁移；不改表结构。
- 创建 fresh `runtime_truth` job，并显式带 `case_id`。
- 仅调用官方只读接口 `GET /open_api/2/tools/aweme_auth_list/`。
- 写入 Postgres 运行事实、脱敏授权状态、hash、时间与 evidence 引用。
- 更新本任务卡、Context Manifest 与 `project.state.json`。

禁止：

- 调用 `std_project/create`、`std_project/list` 或任何非本任务需要的平台接口。
- 生成 Node 5 payload、draft、execution plan、confirmation、platform action、created object 或 readback。
- 调用素材上传、事件资产创建、DMP push、预算或出价修改。
- 刷新 token。
- 保存 token、secret、auth_code、Cookie、完整 URL、raw request、raw response 或 raw payload。

## 修正范围

| 模块 | 修正 |
| --- | --- |
| Node 4 | 主查询移除 `auth_status`，只用 `advertiser_id`、`auth_type=AWEME_ACCOUNT`、固定 `aweme_ids`。 |
| Node 4 fallback | 主查询成功但未命中默认号时，执行同账户同 `auth_type` 的只读发现查询；发现固定号则通过并记录告警。 |
| 诊断 | 保存 `probe_profile`、HTTP 状态、平台码、request_id 是否存在、message hash、response hash、返回条数、默认号命中、共享关系布尔证据。 |
| readiness view | 暴露脱敏诊断列，并优先使用已保存的细分 blocker / next_action。 |
| 测试 | 覆盖共享授权、精确过滤漏数 fallback、平台失败分类、只读边界与 CLI 输出。 |

## 验收

| 标准 | 状态 |
| --- | --- |
| task 与 context manifest 更新，并设置 active task | passed |
| Node 4 主查询不再传 `auth_status` | passed |
| `auth_type` 按官方完整参数形态使用 `string[]` | passed |
| 发现查询命中默认号时可通过并记录告警 | passed |
| readiness view 暴露安全诊断字段 | passed |
| `npm run test:aweme-authorization` | passed |
| `npm run test:readonly-readiness-cli` | passed |
| `npm run test:payload-contract` | passed |
| fresh runtime-truth job 仅运行 Node 4 只读核验 | passed；`JOB-MWBV2-20260829110932-B5FB75` |
| zero write audit：confirmation/action/object/readback/draft 均为 0 | passed |
| 任务结束后 `active_task=null`，平台写权限保持关闭 | passed |

## 当前结论区

### 执行结果

| 项 | 结果 |
| --- | --- |
| fresh job | `JOB-MWBV2-20260829110932-B5FB75` |
| job_status / current_node | `diagnosed` / `4` |
| source_usage | `runtime_truth` |
| readiness.required / configured | `true` / `true` |
| readiness.verification_status | `authorized` |
| readiness.ready | `true` |
| readiness.blocker_code | 空 |
| readiness.next_action | `ready_for_node5_payload_build` |
| probe_profile | `primary_precise` |
| platform_code / http_status | `0` / `200` |
| returned_row_count | `1` |
| default_aweme_id_hit | `true` |
| shared_relation_seen | `true` |
| evidence | `EV-JOB-MWBV2-20260829110932-B5FB75-AWEME-AUTHORIZATION-READONLY` |

### 根因结论

问题不是官方接口找错，也不是 token blocker。真正导致“默认抖音号找不到”的机制问题是：`tools/aweme_auth_list` 的 `filtering.auth_type` 官方完整参数形态为 `string[]`，旧 Node 4 按字符串传入，平台返回业务码 `40000`。同时旧实现还额外传了不必要的 `auth_status` 兼容枚举，并把参数错误笼统压成 `aweme_auth_probe_failed`，导致无法直接定位。

### 零写入审计

| 对象 | 数量 |
| --- | ---: |
| drafts | 0 |
| execution_plans | 0 |
| confirmations | 0 |
| platform_actions | 0 |
| created_objects | 0 |
| readbacks | 0 |

### 验证

| 命令 / 回查 | 结果 |
| --- | --- |
| `npm run token:status` | passed；`valid` |
| `psql -X -d marketing_workbench_v2 -f db/044_aweme_authorization_readonly_diagnostics.sql` | passed |
| `npm run workflow:readonly-readiness -- --scope aweme_authorization ...` | passed；Node 4 authorized |
| Postgres readiness readback | passed；`authorized / ready=true / shared_relation_seen=true` |
| Postgres zero write audit | passed；draft/action/object/readback 均为 0 |
| `npm run test:aweme-authorization` | passed |
| `npm run test:readonly-readiness-cli` | passed |
| `npm run test:payload-contract` | passed |
| `git diff --check` | passed |
