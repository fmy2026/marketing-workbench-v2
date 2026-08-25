# TASK-MWBV2-OE3-P04-POST-REFRESH-READONLY-RERUN

状态：completed

更新时间：2026-08-25 CST

## 需求来源

用户提供 `/Users/hys/Desktop/需求表述.md`。该文件内容作为本轮需求输入；执行边界以用户本轮消息、`AGENTS.md`、`project.state.json`、v2 代码和 v2 Postgres 为准。

## 结构化理解

本任务假设 v2 本地 OceanEngine 凭据已经由外部流程刷新完成。本任务不刷新 token，只先脱敏检查 `token:status`，若状态为 `valid`，则通过唯一 workflow 对既有 P04 runtime job 重跑真实平台只读预检。

执行入口固定为：

```text
runJob(repo, "JOB-MWBV2-20260824151431-ECA120", {
  mode: "dry_run",
  allowReadonlyDependency: true,
  allowNetworkWrite: false
})
```

不得使用未透传 `allowReadonlyDependency` 的 CLI 作为本次入口；不得新增 workflow mode、API route、Skill、永久 CLI 或第二套预检逻辑。

## 固定对象

| 项 | 值 |
| --- | --- |
| P04 job_id | `JOB-MWBV2-20260824151431-ECA120` |
| 项目名 | `245791_N_JSZC_HUNT_PAY7DROI_平台定向不限_P04_20260824` |
| route_id | `oceanengine_3_byte_mini_game` |
| game_code | `JSZC` |
| advertiser_id | `1871922175825993` |
| 历史失败 P03 | `JOB-MWBV2-20260824092327-494BF1`，不可重试、不可修改 |

## 权限

| 项 | 状态 |
| --- | --- |
| `token:status` | 允许，脱敏，只读本地 env |
| `token:refresh` | 禁止 |
| 真实平台只读 | 仅允许 DMP 和 std_project/list |
| `std_project/create` | 禁止 |
| 平台写入 | 禁止，maximum actions = `0` |

允许只读接口：

```text
GET dmp/custom_audience/select
GET /open_api/v3.0/std_project/list/
```

## 目标

1. `npm run token:status` 确认凭据状态。若不是 `valid`，停止并记录 blocker。
2. token valid 时重跑 P04 dry-run 只读预检。
3. DMP 平台只读 `api_code=0`，`custom_audience_id_count > 0`，并写入脱敏 evidence / resource metadata。
4. P04 精确项目名查重 `api_code=0`，`duplicate_status=platform_not_duplicate`。
5. P04 final manifest 保持 storage=`string`、transport=`number`、safe=`true`。
6. 若全部 gate 通过，P04 进入等待单次真实创建确认状态；节点 6 继续 locked，节点 7 waiting。

## 非目标

| 项 | 状态 |
| --- | --- |
| token refresh 或写 `.local` | 禁止 |
| 点击工作台“开始执行” | 禁止 |
| `std_project/create` | 禁止 |
| 新建 job / migration / API route / Skill / 永久 CLI | 禁止 |
| 修改 P03 历史记录 | 禁止 |
| 修改 `hide_if_converted=NO_EXCLUDE` | 禁止 |
| 修改 payload 业务字段、项目命名、素材、事件、DMP、预算或出价 | 禁止 |
| 保存 token、Cookie、完整触点 URL、raw payload、raw response | 禁止 |

## 验收

| 标准 | 状态 |
| --- | --- |
| task 与 context manifest 已建立 | passed |
| `token:status.status=valid` 或明确凭据 blocker | passed；`valid` |
| 本任务未调用 refresh | passed |
| DMP 只读通过并有非空数字 ID，或明确只读失败 blocker | passed；10 个 ID |
| 查重只读通过并 `platform_not_duplicate`，或明确只读失败 blocker | passed |
| P04 manifest advertiser_id transport 仍为 `number/safe=true` | passed |
| P04 `platform_actions=0`、`launch_confirmations=0`、`created_objects=0` | passed |
| P03 create action 仍为 `1`，created object 仍为 `0` | passed |
| 指定验证命令通过或给出阻断原因 | passed |
| 无敏感信息泄漏 | passed |

## 当前结论区

### 执行结果

| 项 | 结果 |
| --- | --- |
| token status | `valid` |
| 执行入口 | `runJob(repo, P04, { mode: "dry_run", allowReadonlyDependency: true, allowNetworkWrite: false })` |
| P04 job | `JOB-MWBV2-20260824151431-ECA120` |
| job_status / current_node | `draft_ready` / `5` |
| 节点 1-4 | `passed` |
| 节点 5 | `needs_confirmation` |
| 节点 6 / 7 | `locked` / `waiting` |
| create readiness | `ready_for_user_create_confirmation` |
| unique blocker | `无` |
| DMP readonly status | `passed` |
| DMP custom audience ID count | `10` |
| duplicate_status | `platform_not_duplicate` |
| advertiser_id manifest | storage=`string`，transport=`number`，safe=`true` |
| `hide_if_converted` | 保持 `NO_EXCLUDE` |

### Evidence

| artifact | 摘要 |
| --- | --- |
| `EV-JOB-MWBV2-20260824151431-ECA120-DMP-CUSTOM-AUDIENCE-READONLY` | `status=passed; endpoint=dmp/custom_audience/select; api_code=0; http=200; request_id_present=true; custom_audience_id_count=10; response_body_stored=false` |
| `EV-JOB-MWBV2-20260824151431-ECA120-STD-PROJECT-DUPLICATE-READONLY` | `status=platform_not_duplicate; endpoint=std_project/list; api_code=0; http=200; request_id_present=true; duplicate_found=false; matched_object_id_present=false; response_body_stored=false` |

DMP `account_resources.metadata.readonly_check.status=passed`，并保存 10 个 custom audience ID 字符串用于最终 payload integer array。

### Postgres 核验

| job | platform_actions | confirmations | created_objects | real_readbacks |
| --- | ---: | ---: | ---: | ---: |
| P03 `JOB-MWBV2-20260824092327-494BF1` | 1 | 1 | 0 | 1 |
| P04 `JOB-MWBV2-20260824151431-ECA120` | 0 | 0 | 0 | 0 |

### 验证

| 命令 | 结果 |
| --- | --- |
| `npm run token:status` | passed；`valid` |
| `npm run smoke:workflow-skills` | passed |
| `npm run test:payload-contract` | passed |
| `npm run check:runtime-consistency` | passed |

## 下一步 gate

P04 DMP 与查重均已通过。下一 gate 为“P04 单次真实创建确认任务”；届时才允许通过工作台“开始执行”或同源 CLI execution grant 授予一次真实创建。当前任务结束后真实创建仍禁止。
