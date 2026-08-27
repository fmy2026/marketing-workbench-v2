# TASK-MWBV2-QIANKUN-MONITOR-FIRST-CREATE-1871922434025472

状态：completed

更新时间：2026-08-27 CST

## 目标

对新账户 `1871922434025472` 先执行乾坤 `accountIndex` 只读预检并落库，再按受控流程执行一次且仅一次乾坤 monitor 真实创建。

## 需求边界

需求来源：用户确认“新账户 `1871922434025472` 落地记录数据库，并创建 monitor id”的方案。

本任务允许：

- 创建本任务卡和 context manifest。
- 使用本机 `.local` 乾坤凭据调用 `POST /tf/account_info/accountIndex`。
- 执行 `npm run monitor:plan -- --advertiser-id 1871922434025472`。
- 在 plan 通过后，使用绑定确认变量调用一次 `POST /tf/ad/monitorSerialNumberAdd`。
- 创建后执行 `/tf/ad/index` readback，并写入 DB evidence、monitor run、attempt 和 touchpoint 摘要。

禁止：

- monitor 创建失败后的自动重试。
- 超过一次真实 `monitorSerialNumberAdd` 调用。
- 创建广告项目、promotion、素材、事件资产、DMP。
- 修改预算或出价。
- token refresh。
- 将 token、Cookie、完整 callback/点击监测 URL、raw request 或 raw response 写入项目文件、普通日志、API 或前端。

## 执行前置

| 项 | 值 |
| --- | --- |
| advertiser_id | `1871922434025472` |
| provision_id | `MPR-OCEANENGINE-3-BYTE-MINI-GAME-JSZC-1871922434025472` |
| route_id | `oceanengine_3_byte_mini_game` |
| game_code | `JSZC` |
| cycle_no | `1` |
| attempt_no | `1` |
| 当前 DB account | 执行前未存在 |
| 当前 monitor 默认参数 | 使用 `mwb.game_route_defaults.raw_defaults.monitor_provision` |

## 创建接口

接口：

`POST /tf/ad/monitorSerialNumberAdd`

计划请求参数：

| 字段 | 值/来源 |
| --- | --- |
| `os` | `3` |
| `package_id` | `36820` |
| `package_download_url` | 空字符串，必须实际传 `package_download_url=` |
| `cate_id` | `122` |
| `vest_id` | `1414` |
| `channel` | `dymini3k` |
| `owner` | `fengmeiyu` |
| `media_id` | `310` |
| `agent_id` | `613` |
| `num` | `1` |
| `usage` | `0` |
| `monitor_api` | `toutiao_wxgame` |
| `media_account_id` | `8450` |
| `server_callback_type` | `2` |
| `server_callback_data_types[]` | `active/register/success_order` |
| `remark` | `mwbv2-JSZC-1871922434025472` |

## 执行记录

| 步骤 | 状态 | 结果 |
| --- | --- | --- |
| 创建任务卡和 manifest | passed | 已创建 |
| 打开 `project.state.json.active_task` | passed | 已限制到本账户一次真实 monitor 创建 |
| accountIndex 只读预检 | passed | HTTP/API `200/0`；exactMatchCount=`1`；账户名已写入 DB |
| `monitor:plan` 只读预检 | passed | account 精确 1 条；monitor list 0 条；`attemptPolicy.action=first_create`；createPlanHash=`sha256:210e0ccbaa1134cac4fec1f3c9e5c668751d58596c4cd9deb6bd8b0d366d5490` |
| 单次真实创建 | passed_called_once | HTTP/API `200/0`；apiMessage=`Success`；monitor_id=`245830` |
| 创建后 readback | passed | `/tf/ad/index` 返回 HTTP/API `200/0`，exactMatchCount=`1` |
| DB 回查 | passed | `monitor_provision_runs`、`monitor_provision_attempts`、`advertiser_accounts`、`account_touchpoints` 均已对齐 |
| 关闭任务 | passed | `active_task=null`，平台真实写入权限已收回 |

## 执行结果

| 项 | 值 |
| --- | --- |
| 任务结果 | `resolved` |
| account_name | `上海游民-巨兽战场-汇金-抖小-29` |
| qiankun_account_record_id | `8450` |
| owner | `fengmeiyu` |
| agent_id | `613` |
| create_called | `true` |
| create_attempt_no | `1` |
| create HTTP/API | `200 / 0` |
| create apiMessage | `Success` |
| monitor_id | `245830` |
| monitor_serial_id | `245830` |
| requestHash | `sha256:210e0ccbaa1134cac4fec1f3c9e5c668751d58596c4cd9deb6bd8b0d366d5490` |
| create responseHash | `sha256:a5d79d8b52ea95887fa699a1de158675cd0ca372d2183701167493da22233871` |
| readback responseHash | `sha256:e396f1b35e851a1591802bd7f6346074caa721628ca525a46c18e02a84fffa6c` |
| touchpointUrlHash | `sha256:c5216018562fc5cf15a7160de1600df4b51dd9cd552a5b1015dcac0eaa8ba97d` |
| evidence | `EV-MPR-OCEANENGINE-3-BYTE-MINI-GAME-JSZC-1871922434025472-ENSURE` |

## DB 回查

| 表 | 结果 |
| --- | --- |
| `mwb.advertiser_accounts` | `account_name=上海游民-巨兽战场-汇金-抖小-29`，`monitor_id=245830`，`qiankun_account_record_id=8450`，`qiankun_agent_id=613` |
| `mwb.monitor_provision_runs` | `cycle_status=resolved`，`status=resolved`，`create_attempt_no=1`，`error_summary=monitor_resolved` |
| `mwb.monitor_provision_attempts` | Attempt 01 为 `passed / api_code=0 / monitor_create_passed` |
| `mwb.account_touchpoints` | touchpoint 已写入；项目记录只展示 hash，不写完整触点 URL |

## 验证结果

| 命令 | 结果 |
| --- | --- |
| `npm run monitor:account-preflight -- --advertiser-id 1871922434025472` | passed |
| `npm run monitor:plan -- --advertiser-id 1871922434025472` | passed |
| `MWBV2_MONITOR_CREATE_CONFIRM=CREATE_ONE_MONITOR ... npm run monitor:ensure -- --advertiser-id 1871922434025472` | passed；真实创建成功 |
| DB 回查 provision / attempts / account / touchpoint | passed |
| `npm run monitor:status -- --advertiser-id 1871922434025472` | passed；`createAllowedInCurrentTask=false` |
| `node -e JSON.parse(...)` | passed |
| `git diff --check` | passed |
| 新任务/manifest/project state 敏感扫描 | passed；无 token、Cookie、raw payload 或 raw response 明文 |

## 验收

- `accountIndex` 精确匹配账户 `1871922434025472` 并写入 `mwb.advertiser_accounts`。
- `monitor:plan` 返回 `blockers=[]`、`attemptPolicy.action=first_create`、`nextAttemptNo=1`。
- `createPlan.requestHash` 存在，且包含 `package_download_url` 字段。
- `monitorSerialNumberAdd` 最多调用一次。
- 成功时 DB 写入 monitor id 和 touchpoint hash；失败时记录失败分类，不自动重试。
- 项目文件不保存 token、Cookie、完整触点 URL、raw request 或 raw response。

## 最终结论

本任务完成。新账户 `1871922434025472` 已完成乾坤账户身份落库，并成功创建 monitor：`monitor_id=245830`。本任务真实创建只调用一次，创建后 readback 精确命中 1 条，平台写入权限已收回。
