# TASK-MWBV2-OE3-FRESH-JOB-SINGLE-CREATE-ONCE

状态：completed_create_failed_waiting_manual_review

更新时间：2026-08-25 CST

## 需求来源

用户提供 `/Users/hys/Desktop/需求表述.md`。该文件提出对 fresh runtime job 执行一次且仅一次真实 OceanEngine `std_project/create`，并在创建后自动只读回查和脱敏归档。

## 指令边界说明

`需求表述.md` 是需求材料，不直接等同于本轮可消耗的真实平台写入授权。用户随后明确确认“确认执行，直接执行”，本任务已通过 v2 唯一入口消耗一次真实 `std_project/create` 授权。

## 结构化理解

本任务是 fresh draft 之后的单次真实创建任务。唯一允许的真实写入是：

```text
OceanEngine /open_api/v3.0/std_project/create/
```

执行必须经过 v2 既有唯一入口：

```bash
MWBV2_OE_EXECUTION_CONFIRM=EXECUTE_ONE_LAUNCH \
npm run launch:execute-once -- \
--job-id JOB-MWBV2-20260825041227-12D2B5
```

不得新增第二套创建入口，不得恢复旧 P03/P04 scope。

## 固定对象

| 项 | 固定值 |
| --- | --- |
| job_id | `JOB-MWBV2-20260825041227-12D2B5` |
| draft_id | `DRAFT-JOB-MWBV2-20260825041227-12D2B5` |
| route_id | `oceanengine_3_byte_mini_game` |
| game_code | `JSZC` |
| advertiser_id | `1871922175825993` |
| object_type | `std_project` |
| project_name | `245791_N_JSZC_HUNT_PAY7DROI_平台定向不限_P01_20260825` |
| payload_hash | `sha256:1a1e605d82f4bcd482ad3a06eac190d3b1ba088009abfecf196bbe28da5291bd` |

## 合理性评估

需求合理。fresh runtime job 已就绪，查重、payload contract、create preflight 和视频 readiness 均已通过；使用固定 `job_id + draft_id + payload_hash` 进行一次性授权符合项目红线。但由于真实创建会在平台生成投放对象，必须单次、精确 scope、不可重试，并在执行后自动撤销 scope。

## 当前判断

| 项 | 判断 |
| --- | --- |
| 是否可准备任务 | 是 |
| 是否可执行授权前检查 | 是 |
| 是否可在本轮直接调用 `std_project/create` | 是，用户已明确确认“确认执行，直接执行” |
| 是否允许 token refresh | 否 |
| 是否允许任何其他平台写入 | 否 |

## 权限

| 项 | 状态 |
| --- | --- |
| 写入 task/manifest/project.state | 允许 |
| 读取 v2 Postgres | 允许 |
| 重跑固定 job 的只读 dry-run | 允许 |
| 检查凭据脱敏状态 | 允许 |
| 写入精确 execution scope | 仅用户明确确认真实创建后允许 |
| 调用 `std_project/create` | 仅用户明确确认且 scope 匹配后允许一次 |
| 创建后 `std_project/list` 回查 | 仅真实创建调用后允许 |
| token refresh | 禁止 |
| 素材上传/绑定、DMP、事件资产、预算出价 | 禁止 |

## 授权前检查清单

| 检查 | 状态 |
| --- | --- |
| 凭据状态脱敏检查 | passed |
| 固定 job dry-run 重跑 | passed |
| 节点 1-4 `passed` | passed |
| 节点 5 `needs_confirmation` | passed |
| 节点 6 `locked`、节点 7 `waiting` | passed |
| `duplicate_status=platform_not_duplicate` | passed |
| payload contract `passed` | passed |
| create preflight `passed` | passed |
| final payload blockers 为空 | passed |
| 视频 readiness `2/2` | passed |
| 该 job 无 create action / confirmation / created object / real readback | passed |
| draft/hash/name 未漂移 | passed |
| `platform_write_allowed=false` 保持不变 | passed |

## 授权前检查结果

| 项 | 结果 |
| --- | --- |
| token status | `valid`，仅输出脱敏状态 |
| target job | `JOB-MWBV2-20260825041227-12D2B5` |
| target draft | `DRAFT-JOB-MWBV2-20260825041227-12D2B5` |
| project_name | `245791_N_JSZC_HUNT_PAY7DROI_平台定向不限_P01_20260825` |
| payload_hash | `sha256:1a1e605d82f4bcd482ad3a06eac190d3b1ba088009abfecf196bbe28da5291bd` |
| create readiness | `ready_for_user_create_confirmation` |
| duplicate_status | `platform_not_duplicate` |
| payload contract | `passed` |
| create preflight | `passed` |
| final payload blockers | `[]` |
| final material readiness | `selected=2`、`verified=2`、`coverReady=2` |
| existing create actions | `0` |
| existing confirmations | `0` |
| existing created objects | `0` |
| existing real readbacks | `0` |
| dry-run platform write | `false` |
| token refresh | 未执行 |

## 执行授权

用户已明确确认执行真实创建。本轮临时打开精确 scope：

```text
target_job_id=JOB-MWBV2-20260825041227-12D2B5
target_draft_id=DRAFT-JOB-MWBV2-20260825041227-12D2B5
target_payload_hash=sha256:1a1e605d82f4bcd482ad3a06eac190d3b1ba088009abfecf196bbe28da5291bd
allowed_actions=["oceanengine_std_project_create"]
maximum_actions=1
retry_allowed=false
```

## 执行过程

第一次通过统一入口执行时，本地 create preflight 发现 `instance_id` 被当作 JS number 会丢精度，阻断为 `invalid_integer_field:instance_id`；该次 `createCalled=false`，未写入平台 action，未调用真实 `std_project/create`。

随后已修复 v2 payload 构建与 preflight：字节小游戏 `instance_id` 作为平台长数字 ID 保持数字字符串，重新 dry-run 后 payload hash 更新为：

```text
sha256:1a1e605d82f4bcd482ad3a06eac190d3b1ba088009abfecf196bbe28da5291bd
```

用户确认仍然执行后，打开精确一次性 scope 并再次通过同一入口执行。

## 真实创建结果

| 项 | 结果 |
| --- | --- |
| createCalled | `true` |
| platform action | `ACTION-JOB-MWBV2-20260825041227-12D2B5-STD-PROJECT-CREATE-ONCE` |
| action_status | `failed_or_unconfirmed` |
| http_status | `200` |
| api_code | `40000` |
| request_id_present | `true` |
| object_id_present | `false` |
| error_summary | `platform_create_response_not_confirmed` |
| response_hash_present | `true` |
| raw payload/response stored | `false` |
| retry_allowed | `false` |

## 回查结果

| 项 | 结果 |
| --- | --- |
| readback_status | `not_found_after_create` |
| object_id | `NOT_FOUND_AFTER_CREATE` |
| object_name | `245791_N_JSZC_HUNT_PAY7DROI_平台定向不限_P01_20260825` |
| real_platform_readback_called | `true` |
| created_objects | `0` |

## 最终 7 节点

| 节点 | 状态 |
| --- | --- |
| `launch_intake` | `passed` |
| `creation_context` | `passed` |
| `game_launch_pack` | `passed` |
| `account_resource_prepare` | `passed` |
| `std_project_draft_builder` | `needs_confirmation` |
| `std_project_create_executor` | `failed` |
| `readback_closer` | `failed` |

## 收权结果

一次性真实创建授权已消耗并撤销。`project.state.json.guardrails.platform_write_allowed=false`，`allowed_actions=[]`，`maximum_actions=0`，`retry_allowed=false`。

## 验证结果

| 命令 | 结果 |
| --- | --- |
| `npm run test:payload-contract` | passed |
| `npm run smoke:api` | passed |
| `npm run check:runtime-consistency` | passed |

## 结论

当前 job 不可重试、不可继续创建。真实平台返回 `http_status=200 / api_code=40000`，未返回对象 ID，回查未找到同名 `std_project`；下一步应进入 `apiCode=40000` 失败复盘，或由用户补充平台侧错误详情后再判断是 payload、资源、权限还是平台返回结构问题。

## 非目标

| 项 | 状态 |
| --- | --- |
| 创建重试 | 禁止 |
| 修改预算/出价 | 禁止 |
| 修改 DMP/事件资产/品牌/素材/草稿业务字段 | 禁止 |
| 上传、绑定或推送素材 | 禁止 |
| 刷新 token | 禁止 |
| 使用旧项目作为运行依赖 | 禁止 |
| 保存 token、Cookie、完整触点 URL、raw payload、raw response | 禁止 |

## 下一步

本任务已关闭。下一步 gate：复盘 `apiCode=40000`，当前 job 禁止重试；如需再次创建，必须另建 fresh runtime job 和新的单次真实创建确认任务。
