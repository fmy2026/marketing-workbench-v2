# TASK-MWBV2-AWEME-AUTH-READONLY-FRESH-JOB

状态：completed

更新时间：2026-08-29 CST

## 需求来源

用户要求实现“标准项目创建纠偏：固定抖音号 Node 4 专用只读核验”，只创建 fresh runtime-truth job，定向核验固定默认 `aweme_id=57018827026`，并只读取既有 readiness 报表输出结论。

## 目标

1. 新增 OE3 workflow 专用模式 `aweme_auth_readonly`。
2. 该模式仅运行 `intake-normalize`、`context-resolve-account`、`launch-pack-resolve-game`、`launch-pack-resolve-defaults`、`aweme-authorization-readonly`。
3. 扩展 `workflow:readonly-readiness` CLI，新增 `--scope aweme_authorization`，强制 fresh runtime-truth job 和显式 `case_id`。
4. 专用模式完成后将 job 标记为 `diagnosed`，当前节点为 `4`。
5. CLI 最终仅输出 `mwb.v_advertiser_aweme_authorization_readiness` 既有字段。

## 固定目标

| 项 | 值 |
| --- | --- |
| case_id | `CASE-LEGACY-2E4217E20C9E26BFB648772C` |
| advertiser_id | `1871922346964041` |
| route_id | `oceanengine_3_byte_mini_game` |
| game_code | `JSZC` |
| default aweme_id | `57018827026` |

## 范围

| 类型 | 规则 |
| --- | --- |
| 允许改动 | runner、result mapping、readonly readiness CLI、聚焦 smoke、任务记录 |
| 数据库事实写入 | 仅 fresh job/skill/node 运行事实和 `mwb.advertiser_accounts.aweme_authorization` |
| 最终展示 | 仅 `mwb.v_advertiser_aweme_authorization_readiness` 既有字段 |
| 禁止改动 | 表、View、migration、API、前端、`mwb.account_resources` |
| 禁止动作 | Node 5、draft、execution plan、confirmation、platform action、created object、readback、真实平台写入、token refresh |

## 验收

| 标准 | 状态 |
| --- | --- |
| 新建 task 和 context manifest，并设置 active task | completed |
| `aweme_auth_readonly` schedule 仅含 5 个指定技能 | completed |
| 专用模式不编译 execution plan，不生成 draft/readback/action | completed |
| job 完成状态为 `diagnosed`，current_node 为 `4` | completed |
| CLI `--scope aweme_authorization` 强制 fresh job，不允许 `--job-id` resume | completed |
| CLI scope 输出仅含 readiness 字段 | completed |
| 相关 smoke 与 `git diff --check` 通过 | completed |

## 当前备注

已完成；本任务未运行 `std_project/create`，未触发任何真实平台写入。

## 结果摘要

| 项 | 结果 |
| --- | --- |
| fresh job | `JOB-MWBV2-20260829095429-804E65` |
| job_status | `diagnosed` |
| current_node | `4` |
| skill runs | 5：`intake-normalize`、`context-resolve-account`、`launch-pack-resolve-game`、`launch-pack-resolve-defaults`、`aweme-authorization-readonly` |
| draft / execution plan / confirmation / platform action / created object / readback | 全部为 0 |
| readiness.required | `true` |
| readiness.configured | `true` |
| readiness.verification_status | `probe_failed` |
| readiness.ready | `false` |
| readiness.blocker_code | `aweme_auth_probe_failed` |
| readiness.next_action | `fix_readonly_query_or_credentials_then_rerun_node4` |
| readiness.evidence_ref | `EV-JOB-MWBV2-20260829095429-804E65-AWEME-AUTHORIZATION-READONLY` |

## 验证

| 命令 | 结果 |
| --- | --- |
| `npm run test:create-result-mapping` | passed |
| `npm run test:node4-resource-prep-contracts` | passed |
| `npm run test:readonly-readiness-cli` | passed |
| `npm run smoke:workflow-skills` | passed |
| `npm run test:aweme-authorization` | passed |
| `npm run test:payload-contract` | passed |
| `git diff --check` | passed |

## 下一步

目标账户固定默认抖音号授权核验未通过，当前阻断为 `aweme_auth_probe_failed`。下一步按 readiness view 的 `next_action` 修复只读查询或凭据后，重新运行 Node 4 专用只读核验；授权通过后再创建独立的后续创建任务。
