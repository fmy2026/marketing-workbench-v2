# TASK-MWBV2-OE3-MONITOR-FIRST-CREATE-ONCE-EXECUTE

状态：completed_server_busy_retry_available

更新时间：2026-08-26 CST

## 目标

对新账户 `1871922414575753` 执行一次且仅一次乾坤监测序号真实创建。

本任务已在聊天明确授权后执行首次真实创建。平台返回服务器繁忙，未生成 monitor_id；下一次重试必须另行授权。

## 需求来源与边界

需求来源：`/Users/hys/Desktop/需求表述.md`。

该文档是需求输入，不是自动执行授权。真实平台写入仍以当前聊天明确授权和项目 guardrails 为准。

## 合理性评估

需求合理，且真实写入已按人工确认 gate 执行。

合理性依据：

- 上一任务已将 `monitor:ensure` 收口为通用首次创建状态机。
- 新账户 `1871922414575753` 已 plan-only 通过，当前 attempt_count 为 `0`。
- 已验证创建合同与手动成功 monitor `245828` 的固定字段一致。
- 创建后会自动只读回查并写入 v2 Postgres。

已执行的权限 gate：

- 因本任务涉及 `POST /tf/ad/monitorSerialNumberAdd` 真实写入，不能仅凭附件文档触发。
- 用户已在聊天中明确确认“执行新账户首次真实乾坤 monitor 创建”。

## 已确认目标

```text
route_id=oceanengine_3_byte_mini_game
game_code=JSZC
advertiser_id=1871922414575753
qiankun_account_record_id=8449
provision_id=MPR-OCEANENGINE-3-BYTE-MINI-GAME-JSZC-1871922414575753
create_plan_hash=sha256:4c5e32b231ec6f8995aee0c19de66d0e52c0d6943b9c5b9a95d3d121dc1710d4
```

## 已验证创建合同

```text
os=3
package_id=36820
cate_id=122
vest_id=1414
channel=dymini3k
owner=fengmeiyu
media_id=310
agent_id=613
monitor_api=toutiao_wxgame
media_account_id=8449
num=1
usage=0
server_callback_type=2
server_callback_data_types[]=active
server_callback_data_types[]=register
server_callback_data_types[]=success_order
```

## 执行前置条件

- `attempt_count=0`。
- 当前账户唯一命中，账户记录为 `8449`。
- owner、agent、凭据状态一致。
- `/tf/ad/index` 未发现同合同既有 monitor。
- callback 合同完整。
- 手动成功合同对比无固定字段差异。
- 最新 create plan hash 与任务 hash 完全一致。

## 单次授权合同

真实创建必须使用唯一入口：

```bash
npm run monitor:ensure -- \
  --route-id oceanengine_3_byte_mini_game \
  --game-code JSZC \
  --advertiser-id 1871922414575753
```

并且必须同时绑定：

```text
MWBV2_MONITOR_CREATE_CONFIRM=CREATE_ONE_MONITOR
MWBV2_MONITOR_PROVISION_ID=MPR-OCEANENGINE-3-BYTE-MINI-GAME-JSZC-1871922414575753
MWBV2_MONITOR_ROUTE_ID=oceanengine_3_byte_mini_game
MWBV2_MONITOR_GAME_CODE=JSZC
MWBV2_MONITOR_ADVERTISER_ID=1871922414575753
MWBV2_MONITOR_CREATE_PLAN_HASH=sha256:4c5e32b231ec6f8995aee0c19de66d0e52c0d6943b9c5b9a95d3d121dc1710d4
```

## 非目标

- 不创建 OceanEngine 项目、广告、素材、事件资产或 DMP。
- 不刷新 token。
- 不修改预算或出价。
- 不对旧账户 `1871922346964041` 发起第三次创建。
- 不保存 token、Cookie、raw request、raw response、完整触点 URL。

## 当前进展

- 已读取 `AGENTS.md`、`project.state.json` 和 `/Users/hys/Desktop/需求表述.md`。
- 已确认参数与流程合理。
- 已创建本任务卡与 context manifest。
- 已执行授权前 `plan-only` preflight。
- 新账户 `1871922414575753` 当前仍为 `attempt_count=0`，未创建。
- `accountIndex` 唯一命中，乾坤账户记录为 `8449`，owner 为 `fengmeiyu`，agent 为 `613`。
- `/tf/ad/index` 创建前查重返回 `resultTotal=0`、`exactMatchCount=0`。
- callback 合同完整，`server_callback_type=2`，事件为 `active/register/success_order`。
- 手动成功 monitor `245828` 固定合同对比无差异；`media_account_id=8448 -> 8449` 为预期账户差异。
- create plan hash 稳定为 `sha256:4c5e32b231ec6f8995aee0c19de66d0e52c0d6943b9c5b9a95d3d121dc1710d4`。
- 已验证未授权真实 ensure 只返回 `confirm_variable_missing_or_invalid`，`createCalled=false`。
- 已验证旧账户 `1871922346964041` 阻断，包含 `monitor_id_already_resolved_no_create_needed` 与 `monitor_create_attempt_limit_reached`。
- 用户已在聊天中明确授权：确认执行新账户 `1871922414575753` 首次真实乾坤 monitor 创建。
- 已带完整绑定变量执行唯一入口 `npm run monitor:ensure -- --route-id oceanengine_3_byte_mini_game --game-code JSZC --advertiser-id 1871922414575753`。
- 执行前 `accountIndex` 唯一命中，身份预检通过：`advertiser_id=1871922414575753`、`qiankun_account_record_id=8449`、`owner=fengmeiyu`、`agent_id=613`、`auth_status=ready`。
- 创建前 `/tf/ad/index` 精确查重仍为 `0`。
- 已原子 claim `attempt_no=1`，`trigger_reason=initial_create_once`。
- 已调用一次 `/tf/ad/monitorSerialNumberAdd`，HTTP 状态为 `200`，业务码为 `500`，业务消息为 `服务器繁忙，请稍后重试(400)`。
- 创建后 `/tf/ad/index` 回查仍为 `0`，未获得 monitor_id。
- 已记录 attempt 和 evidence，未保存 token、Cookie、raw request、raw response 或完整触点 URL。
- 已修正本地 run `error_summary` 为 `monitor_create_server_busy_retry_available`，避免误标为终态失败。

## 授权前 preflight 快照

| 项 | 值 |
| --- | --- |
| status | `passed` |
| runStatus | `planned` |
| provision_id | `MPR-OCEANENGINE-3-BYTE-MINI-GAME-JSZC-1871922414575753` |
| account record | `8449` |
| existing monitor | 否 |
| monitor resultTotal / exactMatchCount | `0 / 0` |
| attempt policy | `first_create` |
| next attempt | `1 / initial_create_once` |
| callback hash | `sha256:224d383b42f1a1a89774f85c267f16758f6b9e5acb4488724b9cfa387ded3819` |
| create plan hash | `sha256:4c5e32b231ec6f8995aee0c19de66d0e52c0d6943b9c5b9a95d3d121dc1710d4` |
| createCalled | `false` |

## 真实创建结果

| 项 | 值 |
| --- | --- |
| createCalled | `true` |
| attempt_no | `1` |
| trigger_reason | `initial_create_once` |
| create httpStatus | `200` |
| create apiCode | `500` |
| create apiMessage | `服务器繁忙，请稍后重试(400)` |
| post-create exactMatchCount | `0` |
| monitor_id | 空 |
| latest attempt category | `server_busy` |
| run error_summary | `monitor_create_server_busy_retry_available` |
| evidence | `EV-MPR-OCEANENGINE-3-BYTE-MINI-GAME-JSZC-1871922414575753-ENSURE` |

## 当前卡点

首次真实创建已执行并返回服务器繁忙。不得自动重试。

下一 gate：若要执行第二次且最后一次重试，必须另建或继续单次重试授权，并绑定当前 provision 与 create plan hash。
