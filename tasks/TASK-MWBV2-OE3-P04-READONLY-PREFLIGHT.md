# TASK-MWBV2-OE3-P04-READONLY-PREFLIGHT

状态：completed

更新时间：2026-08-24 CST

## 需求来源

用户提供 `/Users/hys/Desktop/需求表述.md`。该文件内容作为本轮需求输入；执行边界以用户本轮消息、`AGENTS.md`、`project.state.json`、v2 代码和 v2 Postgres 为准。

## 结构化理解

本任务对已生成的 P04 执行一次真实平台只读预检，只覆盖节点 1-5 的 DMP 只读和同名项目查重。任务复用 v2 唯一运行链路：

```text
runJob(...)
-> runOe3WorkflowSkills(...)
-> src/workflows/skills/oe3
-> OceanEngine readonly client
-> Postgres marketing_workbench_v2.mwb
```

本任务不新增 workflow mode、Skill、API route、CLI script 或第二套预检逻辑。

## 固定对象

| 项 | 值 |
| --- | --- |
| P04 job | `JOB-MWBV2-20260824151431-ECA120` |
| 项目名 | `245791_N_JSZC_HUNT_PAY7DROI_平台定向不限_P04_20260824` |
| 路线 | `oceanengine_3_byte_mini_game` |
| 游戏 | `JSZC` |
| 账户 | `1871922175825993` |
| P03 | `JOB-MWBV2-20260824092327-494BF1`，不可重试 |

## 权限

| 项 | 状态 |
| --- | --- |
| `std_project/create` | 禁止 |
| token refresh | 禁止 |
| 平台写入 | 禁止，maximum actions = `0` |
| 真实平台只读依赖 | 仅本任务允许 |
| 允许只读接口 | `GET dmp/custom_audience/select`、`GET /open_api/v3.0/std_project/list/` |

## 目标

1. 以 `mode=dry_run`、`allowReadonlyDependency=true`、`allowNetworkWrite=false` 重跑 P04。
2. 节点 4 确认 DMP audience ID 是否平台只读通过、`api_code=0`、数量大于 0，并写入脱敏 evidence 与 `account_resources.metadata.readonly_check`。
3. 节点 5 确认 P04 精确项目名查重，期望 `duplicate_status=platform_not_duplicate`。
4. 确认 P04 final manifest 仍为 `advertiserIdStorageType=string`、`advertiserIdTransportType=number`、`advertiserIdTransportSafe=true`。
5. 不修改 `hide_if_converted=NO_EXCLUDE`。

## 非目标

| 项 | 状态 |
| --- | --- |
| 点击工作台开始执行 | 禁止 |
| P04 或 P03 真实创建 | 禁止 |
| 素材、事件、DMP、预算或出价写入 | 禁止 |
| 修改 P03 历史记录 | 禁止 |
| 修改 `hide_if_converted` | 禁止 |
| 新增 migration / API route / 永久 CLI script | 禁止 |
| 保存 token、Cookie、完整触点 URL、raw payload、raw response | 禁止 |

## 验收

| 标准 | 状态 |
| --- | --- |
| task 与 context manifest 已建立 | passed |
| P04 `platform_actions`、`launch_confirmations`、`created_objects` 新增数量均为 `0` | passed |
| P03 create action 仍为 `1`，created object 仍为 `0` | passed |
| P04 DMP 真实只读结果写入脱敏 evidence | blocked_by_credential；已写入 credential_required evidence |
| P04 同名查重真实只读结果写入脱敏 evidence | blocked_by_credential；已写入 credential_required evidence |
| P04 DMP audience ID 为非空 integer array | blocked_by_credential；未刷新 token，不继续 probe |
| P04 manifest 的 advertiser_id transport 仍为 `number/safe=true` | passed |
| P04 仅在全部只读 gate 通过时变为 `draft_ready` / Node 5 `needs_confirmation` | passed；本次未全部通过，Node 5 保持 `repairable` |
| 指定验证命令通过或明确凭据/平台只读 blocker | passed |
| 无敏感信息泄漏 | passed |

## 当前结论区

### 执行结果

| 项 | 结果 |
| --- | --- |
| 执行入口 | `runJob(repo, P04, { mode: "dry_run", allowReadonlyDependency: true, allowNetworkWrite: false })` |
| P04 job | `JOB-MWBV2-20260824151431-ECA120` |
| job_status / current_node | `draft_ready` / `5` |
| 节点 4 | `blocked` |
| 节点 5 | `repairable` |
| 节点 6 / 7 | `locked` / `waiting` |
| create readiness | `new_runtime_job_required` |
| DMP readonly status | `credential_required` |
| duplicate_status | `credential_required` |
| DMP ID count | `0` |
| advertiser_id manifest | storage=`string`，transport=`number`，safe=`true` |
| `hide_if_converted` | 保持 `NO_EXCLUDE` |

### 凭据阻断

`npm run token:status` 输出脱敏状态：

| 项 | 结果 |
| --- | --- |
| env file | present |
| app config | present |
| access token | present but expired |
| refresh token | present |
| blocker | `access_token_expired_refresh_required` |

本任务禁止 token refresh，因此 DMP 和查重都在 credential gate 停止；未继续调用写入 API。

### Postgres 核验

| job | platform_actions | confirmations | created_objects | real_readbacks |
| --- | ---: | ---: | ---: | ---: |
| P03 `JOB-MWBV2-20260824092327-494BF1` | 1 | 1 | 0 | 1 |
| P04 `JOB-MWBV2-20260824151431-ECA120` | 0 | 0 | 0 | 0 |

P04 evidence：

| artifact | 状态 |
| --- | --- |
| `EV-JOB-MWBV2-20260824151431-ECA120-DMP-CUSTOM-AUDIENCE-READONLY` | `credential_required`，endpoint=`not_called`，response_body_stored=false |
| `EV-JOB-MWBV2-20260824151431-ECA120-STD-PROJECT-DUPLICATE-READONLY` | `credential_required`，endpoint=`not_called`，response_body_stored=false |

### 验证

| 命令 | 结果 |
| --- | --- |
| `npm run smoke:readonly` | passed；明确 `credential_required` |
| `npm run smoke:workflow-skills` | passed |
| `npm run test:payload-contract` | passed |
| `npm run check:runtime-consistency` | passed |
| `npm run token:status` | passed；脱敏输出 token 已过期 |

## 下一步 gate

P04 真实只读预检未通过，唯一前置阻断是凭据过期：`access_token_expired_refresh_required`。下一步应另建“受控 token refresh + P04 readonly rerun”任务；刷新后先重跑 DMP 和 std_project/list 查重。真实创建仍禁止，不先改 `hide_if_converted`。
