# TASK-MWBV2-QIANKUN-MONITOR-TOUCHPOINT-URL-SYNC-1871922346964041

状态：completed

更新时间：2026-08-27 CST

## 目标

对账户 `1871922346964041` 的既有乾坤 monitor 执行真实只读回查，补齐本地受控数据库中的 `touchpoint_url`。

## 需求边界

需求来源：用户确认“既有 Monitor 触点 URL 补齐方案”。

本任务不是创建任务。目标账户本地已记录 `monitor_id=245828`，但 `mwb.account_touchpoints.touchpoint_url` 为空；本任务只允许通过只读接口重新读取乾坤 monitor 列表，若接口返回完整触点 URL，则写入受控 DB 字段。

本任务允许：

- 创建本任务卡和 context manifest。
- 使用本机 `.local` 乾坤凭据调用 `POST /tf/account_info/accountIndex`。
- 使用本机 `.local` 乾坤凭据调用 `POST /tf/ad/index`。
- 执行 `npm run monitor:plan -- --advertiser-id 1871922346964041`。
- 将完整触点 URL 仅写入 `mwb.account_touchpoints.touchpoint_url` 受控列。

禁止：

- 调用 `POST /tf/ad/monitorSerialNumberAdd`。
- 创建新 monitor。
- 第三次创建旧账户 monitor。
- token refresh。
- 创建广告项目、promotion、素材、事件资产、DMP。
- 修改预算或出价。
- 将 token、Cookie、完整 callback/点击监测 URL、raw request 或 raw response 写入项目文件、普通日志、API 或前端。

## 执行前置

| 项 | 值 |
| --- | --- |
| advertiser_id | `1871922346964041` |
| provision_id | `MPR-OCEANENGINE-3-BYTE-MINI-GAME-JSZC-1871922346964041` |
| route_id | `oceanengine_3_byte_mini_game` |
| game_code | `JSZC` |
| 既有 monitor_id | `245828` |
| 当前 touchpoint_url_present | `false` |
| 当前 touchpoint 状态 | `hash_only_touchpoint_url_unverified` |
| 当前 touchpoint hash | `sha256:ccd1178914f17cc140a1c56c1d1fcbfd2ba461a58f8c5b4a1ca870f98504fff1` |

## 执行记录

| 步骤 | 状态 | 结果 |
| --- | --- | --- |
| 创建任务卡和 manifest | passed | 已创建 |
| 打开 `project.state.json.active_task` | passed | 已限制为旧账户既有 monitor 只读触点补齐 |
| `monitor:plan` 只读回查 | passed | `accountIndex` 与 `/tf/ad/index` 均 HTTP/API `200/0`；monitor exactMatchCount=`1`；`createCalled=false` |
| DB 回查 | passed | `touchpoint_url_present=true`，状态更新为 `stored_in_database` |
| 关闭任务 | passed | `active_task=null`，平台真实写入权限保持关闭 |

## 执行结果

| 项 | 值 |
| --- | --- |
| 任务结果 | `touchpoint_url_synced` |
| account_name | `上海游民-巨兽战场-汇金-抖小-27` |
| qiankun_account_record_id | `8448` |
| owner | `fengmeiyu` |
| monitor_id | `245828` |
| monitorSerialId | `245828` |
| monitor list HTTP/API | `200 / 0` |
| monitor list exactMatchCount | `1` |
| monitor list responseHash | `sha256:e8cfd7cb741b546cc483d9952756b3e3af6d56bb63be444259c1002cd72eb677` |
| touchpointUrlHash | `sha256:ccd1178914f17cc140a1c56c1d1fcbfd2ba461a58f8c5b4a1ca870f98504fff1` |
| touchpoint_url_present | `true` |
| touchpoint DB status | `stored_in_database` |
| createCalled | `false` |
| evidence | `EV-MPR-OCEANENGINE-3-BYTE-MINI-GAME-JSZC-1871922346964041-PLAN-ONLY` |

## DB 回查

| 表 | 结果 |
| --- | --- |
| `mwb.advertiser_accounts` | `account_name=上海游民-巨兽战场-汇金-抖小-27`，`monitor_id=245828`，`qiankun_account_record_id=8448` |
| `mwb.monitor_provision_runs` | `cycle_status=resolved`，`status=touchpoint_resolved`，`monitor_id=245828`，`response_hash=sha256:e8cfd7cb741b546cc483d9952756b3e3af6d56bb63be444259c1002cd72eb677` |
| `mwb.account_touchpoints` | `status=stored_in_database`，`touchpoint_url_present=true`，项目记录只展示 hash，不写完整触点 URL |

## 验证结果

| 命令 | 结果 |
| --- | --- |
| `npm run monitor:plan -- --advertiser-id 1871922346964041` | passed；只读接口成功，`createCalled=false` |
| DB 回查 account / provision / touchpoint | passed |
| `npm run monitor:status -- --advertiser-id 1871922346964041` | passed；写入权限未打开，创建确认不存在 |
| `node -e JSON.parse(...)` | passed |

## 验收

- `monitorSerialNumberAdd` 调用次数为 `0`。
- `/tf/ad/index` 精确命中 `monitor_id=245828`。
- 成功时 `mwb.account_touchpoints.touchpoint_url_present=true`。
- 若接口仍未返回可识别完整触点 URL，则不猜测、不拼接 URL，记录原因后关闭任务。
- 项目文件不保存 token、Cookie、完整触点 URL、raw request 或 raw response。
- 任务结束后 `active_task=null`，`platform_write_allowed=false`。

## 最终结论

本任务完成。账户 `1871922346964041` 的既有乾坤 monitor `245828` 已通过只读 `/tf/ad/index` 回查补齐受控 `touchpoint_url`，项目文件仅记录 hash、状态和必要 ID；未调用 monitor 创建接口。
