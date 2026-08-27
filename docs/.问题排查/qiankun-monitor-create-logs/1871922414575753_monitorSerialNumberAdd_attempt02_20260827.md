# 1871922414575753 monitorSerialNumberAdd 创建请求排查日志

状态：terminal_failed

更新时间：2026-08-27 CST

## 基本信息

| 项 | 值 |
| --- | --- |
| advertiser_id | `1871922414575753` |
| provision_id | `MPR-OCEANENGINE-3-BYTE-MINI-GAME-JSZC-1871922414575753` |
| cycle_id | `MPR-OCEANENGINE-3-BYTE-MINI-GAME-JSZC-1871922414575753-CYCLE-01` |
| attempt_no | `2` |
| 任务卡 | `tasks/TASK-MWBV2-QIANKUN-MONITOR-CYCLE01-ATTEMPT02-FINAL-CREATE-1871922414575753.md` |
| 接口文档 | `docs/.参考文档/乾坤系统/api-docs-20260827.md` |

## 创建接口

`POST /tf/ad/monitorSerialNumberAdd`

## 请求参数

| 字段 | 值 |
| --- | --- |
| `os` | `3` |
| `package_id` | `36820` |
| `package_download_url` | 当次未发送；后续机制已修正为显式发送空值 |
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

## 凭据状态

| 项 | 值 |
| --- | --- |
| credential_status | `active` |
| owner_key_present | `true` |
| credential_store_present | `true` |
| active_credential_count | `1` |
| token/cookie 明文 | 未写入项目文件 |

## monitor:plan 预检

| 项 | 值 |
| --- | --- |
| status | `passed` |
| accountIndex 精确匹配 | `1` |
| monitor list HTTP/API | `200 / 0 / Success` |
| monitor list exactMatchCount | `0` |
| attemptPolicy.action | `server_busy_retry` |
| attemptPolicy.nextAttemptNo | `2` |
| blockers | 空 |
| createPlan.requestHash | `sha256:4c5e32b231ec6f8995aee0c19de66d0e52c0d6943b9c5b9a95d3d121dc1710d4` |
| plan evidence | `EV-MPR-OCEANENGINE-3-BYTE-MINI-GAME-JSZC-1871922414575753-PLAN-ONLY` |

## 创建响应

| 项 | 值 |
| --- | --- |
| create_called | `true` |
| endpoint | `/tf/ad/monitorSerialNumberAdd` |
| HTTP status | `200` |
| apiCode | `500` |
| apiMessage | `服务器繁忙，请稍后重试(400)` |
| requestHash | `sha256:4c5e32b231ec6f8995aee0c19de66d0e52c0d6943b9c5b9a95d3d121dc1710d4` |
| responseHash | `sha256:a85b2886b658ea6421161c5c1583dde35d4863025ad732278be57e56992be719` |
| request_id_present | 未返回 |
| rawRequestStored | `false` |
| rawResponseStored | `false` |

本次执行命令摘要：

```bash
MWBV2_MONITOR_RETRY_CONFIRM=RETRY_ONE_BUSY_MONITOR_CREATE \
MWBV2_MONITOR_PROVISION_ID=MPR-OCEANENGINE-3-BYTE-MINI-GAME-JSZC-1871922414575753 \
MWBV2_MONITOR_ROUTE_ID=oceanengine_3_byte_mini_game \
MWBV2_MONITOR_GAME_CODE=JSZC \
MWBV2_MONITOR_ADVERTISER_ID=1871922414575753 \
MWBV2_MONITOR_CREATE_PLAN_HASH=sha256:4c5e32b231ec6f8995aee0c19de66d0e52c0d6943b9c5b9a95d3d121dc1710d4 \
npm run monitor:ensure -- --advertiser-id 1871922414575753
```

## 创建后 readback

| 项 | 值 |
| --- | --- |
| endpoint | `/tf/ad/index` |
| status | `passed` |
| HTTP/API | `200 / 0 / Success` |
| resultTotal | `0` |
| rowCount | `0` |
| exactMatchCount | `0` |
| monitor_id | 空 |
| touchpoint_url_hash | 空 |
| responseHash | `sha256:deb578e6c2dac77216d930bfb38d5f595ca2a132f56700e5716d83aafbd70493` |

## 失败定位

| 项 | 值 |
| --- | --- |
| final_status | `terminal_failed` |
| cycle_status | `stopped` |
| create_attempt_no | `2` |
| error_category | `server_busy` |
| error_summary | `monitor_create_failed:500:服务器繁忙，请稍后重试(400)` |
| provision_error_summary | `monitor_create_busy_retry_exhausted` |
| retry_allowed_after_attempt02 | `false` |
| evidence | `EV-MPR-OCEANENGINE-3-BYTE-MINI-GAME-JSZC-1871922414575753-ENSURE` |

结论：同一请求参数、同一账户、同一 provision 的 Cycle 01 两次真实创建均返回乾坤业务 `500 / 服务器繁忙，请稍后重试(400)`，且创建后 `/tf/ad/index` 回查仍为 0 条。按 v2 当前安全策略，本 cycle 不再自动发起第三次创建。

## 敏感字段说明

本项目文件只保存业务参数、响应摘要、hash 和必要 ID；不保存 token、Cookie、完整触点 URL、raw request 或 raw response。

## 后续机制修正

2026-08-27 CST 追加说明：技术侧要求后续 `monitorSerialNumberAdd` 创建请求显式携带 `package_download_url`，值为空也要发送为 form 字段。当前 Attempt 02 是历史请求，当时未发送该字段；后续脚本会将 `package_download_url=""` 纳入 `createPlan.requestHash`，并在真实创建 form body 中发送 `package_download_url=`。
