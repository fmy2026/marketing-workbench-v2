# TASK-MWBV2-OE3-DMP-PUSH-SCOPE-EXECUTE-READBACK-1871922346964041

## Brief

一次性完成账户 `1871922346964041` 的 JSZC DMP 默认集合目标户推送与回查。仅基于 fresh job `JOB-MWBV2-20260827125751-2CDDFD` 的 10 条 `planned` DMP push plan 执行，每包最多一次 `push_v2`，每包写入后立即 `read/select` 回查。

## Scope

- 允许唯一真实平台动作：`ensure_resource:dmp_audience_package`。
- 请求字段只发送 `advertiser_id`、`custom_audience_id`、`target_advertiser_ids`。
- `delivery_status` 仅用于回查判断，不发送。
- 不创建广告、不创建 monitor、不刷新 token、不修改预算出价或其他资源。
- 不记录 token、Cookie、raw request、raw payload、raw response。

## Execution Target

| 字段 | 值 |
| --- | --- |
| target_advertiser_id | `1871922346964041` |
| source_advertiser_id | `1871922153496588` |
| package_set_id | `DMP-JSZC-HUNT-CONVERTED-EXCLUDE-BASELINE-001` |
| job_id | `JOB-MWBV2-20260827125751-2CDDFD` |
| plan_id | `PLAN-JOB-MWBV2-20260827125751-2CDDFD-V1` |
| plan_hash | `sha256:21fb89028f5f980177eeb9946c2ae9921e82c781f79e0f8d5bf5e1cf5b5c6c9e` |
| confirm_variable | `MWBV2_OE_DMP_PUSH_CONFIRM=PUSH_ONE_DMP_BASELINE_SET` |
| maximum_platform_calls | `10` |

## Progress

- [x] 建立任务卡与 manifest。
- [x] 执行前核验计划、目标状态、平台动作计数。
- [x] 临时开启精确 DMP scope。
- [x] 执行 `resource:dmp-ensure-once`。
- [x] 写权限撤回后回查 DB。
- [x] 停止于首包 readback 未验证，未继续推送剩余 9 包。
- [x] 关闭任务并更新 `project.state.json`。

## Result

状态：`blocked_first_dmp_push_readback_not_verified`。

真实执行结果：

| 项 | 结果 |
| --- | --- |
| first_custom_audience_id | `465498363` |
| push action | `ACTION-JOB-MWBV2-20260827125751-2CDDFD-DMP-PUSH-465498363` |
| push http/api | `HTTP 200` / `api_code=0` |
| push request id | 存在 |
| push response hash | 存在 |
| first plan status | `executed` |
| first target state | `blocked` |
| evidence ref | `EV-JOB-MWBV2-20260827125751-2CDDFD-DMP-PUSH-465498363-READBACK` |
| remaining plans | `planned 9` |
| total DMP platform actions | `1` |

解释：第一个包的 `push_v2` 已返回成功，但随后目标户 `read/select` 没有验证到该包 ID，所以不能把 DMP 资源判定为 ready。按任务规则，本次没有重试，也没有继续推剩余 9 个包。

下一 gate：新建“DMP 首包 `465498363` 已推送后只读回查诊断”任务。只允许目标户 DMP `read/select`，不再次调用 `push_v2`；确认是平台延迟、接口字段解析问题、查询条件问题，还是推送成功但目标户仍不可用。

## Acceptance

- 失败时已精确记录首个失败包并停止。
- DMP platform actions 为 `1`，仅首包 push。
- 任务结束后 `active_task=null`、`platform_write_allowed=false`。
