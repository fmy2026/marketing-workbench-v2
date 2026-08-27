# TASK-MWBV2-QIANKUN-MONITOR-CYCLE01-ATTEMPT02-FINAL-CREATE-1871922414575753

状态：completed

更新时间：2026-08-27 CST

## 目标

对新账户 `1871922414575753` 执行一次且仅一次乾坤 monitor 真实创建，范围限定为当前 `Cycle 01 / Attempt 02`。

若本次 `/tf/ad/monitorSerialNumberAdd` 仍失败，本 cycle 停止，不自动发起第三次创建。

## 需求边界

需求来源：用户确认执行的 monitor 创建落地方案。

本任务只允许：

- 创建本任务卡、context manifest 和受控技术排查日志。
- 先执行 `npm run monitor:plan -- --advertiser-id 1871922414575753`。
- 在只读 plan 通过后，执行一次真实 `/tf/ad/monitorSerialNumberAdd`。
- 创建后执行一次 readback，确认是否已有 monitor。

禁止：

- 第三次 monitor 创建。
- 创建失败后的自动重试。
- 修改预算、出价、广告项目、素材、事件资产、DMP 或 token。
- 将 token、Cookie、完整触点 URL、raw request 或 raw response 写入项目文件、普通日志、API 或前端。

## 执行前置

| 项 | 值 |
| --- | --- |
| advertiser_id | `1871922414575753` |
| provision_id | `MPR-OCEANENGINE-3-BYTE-MINI-GAME-JSZC-1871922414575753` |
| cycle_id | `MPR-OCEANENGINE-3-BYTE-MINI-GAME-JSZC-1871922414575753-CYCLE-01` |
| attempt_no | `2` |
| route_id | `oceanengine_3_byte_mini_game` |
| game_code | `JSZC` |
| accountIndex 账户记录 | `8449` |
| owner | `fengmeiyu` |
| agent_id | `613` |
| media_id | `310` |

## 创建接口

接口：

`POST /tf/ad/monitorSerialNumberAdd`

计划请求参数：

| 字段 | 值 |
| --- | --- |
| `os` | `3` |
| `package_id` | `36820` |
| `cate_id` | `122` |
| `vest_id` | `1414` |
| `channel` | `dymini3k` |
| `owner` | `fengmeiyu` |
| `media_id` | `310` |
| `agent_id` | `613` |
| `num` | `1` |
| `usage` | `0` |
| `monitor_api` | `toutiao_wxgame` |
| `media_account_id` | `8449` |
| `server_callback_type` | `2` |
| `server_callback_data_types[]` | `active/register/success_order` |
| `remark` | `mwbv2-JSZC-1871922414575753` |

## 执行记录

| 步骤 | 状态 | 结果 |
| --- | --- | --- |
| 创建任务卡和 manifest | passed | 已创建 |
| 打开 `project.state.json.active_task` | passed | 已收紧到本任务 |
| `monitor:plan` 只读预检 | passed | account 精确 1 条；monitor list 0 条；Attempt 02 可执行；createPlanHash=`sha256:4c5e32b231ec6f8995aee0c19de66d0e52c0d6943b9c5b9a95d3d121dc1710d4` |
| 单次真实创建 | passed_called_once | HTTP 200；apiCode=`500`；apiMessage=`服务器繁忙，请稍后重试(400)` |
| 创建后 readback | passed_no_monitor | `/tf/ad/index` 返回 HTTP/API `200/0`，exactMatchCount=`0` |
| 技术排查日志 | passed | `docs/.问题排查/qiankun-monitor-create-logs/1871922414575753_monitorSerialNumberAdd_attempt02_20260827.md` |
| 关闭任务 | passed | Cycle 01 已停止，项目状态恢复真实写入暂停 |

## 执行结果

| 项 | 值 |
| --- | --- |
| 任务结果 | `terminal_failed` |
| create_called | `true` |
| create_attempt_no | `2` |
| create HTTP/API | `200 / 500` |
| create apiMessage | `服务器繁忙，请稍后重试(400)` |
| requestHash | `sha256:4c5e32b231ec6f8995aee0c19de66d0e52c0d6943b9c5b9a95d3d121dc1710d4` |
| responseHash | `sha256:a85b2886b658ea6421161c5c1583dde35d4863025ad732278be57e56992be719` |
| post-create readback | exactMatchCount=`0` |
| monitor_id | 空 |
| retry_allowed | `false` |
| evidence | `EV-MPR-OCEANENGINE-3-BYTE-MINI-GAME-JSZC-1871922414575753-ENSURE` |

## DB 回查

| 表 | 结果 |
| --- | --- |
| `mwb.monitor_provision_runs` | `cycle_status=stopped`，`status=terminal_failed`，`create_attempt_no=2`，`error_summary=monitor_create_busy_retry_exhausted` |
| `mwb.monitor_provision_attempts` | Attempt 01 与 Attempt 02 均为 `failed / server_busy / api_code=500` |
| `mwb.advertiser_accounts` | `monitor_id` 仍为空；`qiankun_account_record_id=8449`、`qiankun_agent_id=613`、`qiankun_media_master_id=今日头条` 保持 |

## 验证结果

| 命令 | 结果 |
| --- | --- |
| `npm run monitor:plan -- --advertiser-id 1871922414575753` | passed |
| `npm run monitor:ensure -- --advertiser-id 1871922414575753` | 已执行一次真实创建；乾坤业务返回 `500 server_busy` |
| DB 回查 provision / attempts / account | passed |
| `npm run monitor:status -- --advertiser-id 1871922414575753` | passed；`attemptCount=2`，`createAllowedInCurrentTask=false` |
| `node -e JSON.parse(...)` | passed |
| `git diff --check` | passed |
| 新任务/日志敏感扫描 | passed；只命中“禁止保存”说明文字，无 token/Cookie 明文 |

## 验收

- `monitorSerialNumberAdd` 最多调用一次。
- 技术排查日志能说明接口、业务请求参数、响应摘要和 readback 结果。
- 项目内不保存 token、Cookie、完整触点 URL、raw request 或 raw response。
- 成功时 DB 写入 monitor id 和 touchpoint hash。
- 失败时记录失败分类，并明确 Cycle 01 停止且不再自动重试。

## 最终结论

本任务完成，但乾坤创建未成功。问题集中在乾坤 `/tf/ad/monitorSerialNumberAdd` 返回业务 `500 / 服务器繁忙，请稍后重试(400)`；本地请求参数、账户身份、回调合同和单次执行边界均已记录。
