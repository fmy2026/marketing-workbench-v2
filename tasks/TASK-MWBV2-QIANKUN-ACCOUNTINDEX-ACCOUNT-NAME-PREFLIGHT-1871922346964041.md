# TASK-MWBV2-QIANKUN-ACCOUNTINDEX-ACCOUNT-NAME-PREFLIGHT-1871922346964041

状态：completed

更新时间：2026-08-27 CST

## 目标

在不创建 monitor 的前提下，使用本机 `.local` 乾坤凭据，对账户 `1871922346964041` 执行一次真实只读 `accountIndex` preflight，读取接口返回的 `advertiser_name`，并写入 `mwb.advertiser_accounts.account_name`。

## 边界

只允许调用：

- `POST /tf/account_info/accountIndex`

禁止：

- `/tf/ad/index`
- `/tf/ad/monitorSerialNumberAdd`
- monitor 创建、重试或 reissue
- token refresh
- 预算、出价、广告项目、素材、事件资产、DMP 写入
- token、Cookie、raw request、raw response 或完整 URL 入项目文件

## 执行记录

| 步骤 | 状态 | 结果 |
| --- | --- | --- |
| 创建任务卡和 manifest | passed | 已创建 |
| 打开 `project.state.json.active_task` | passed | 只读任务，platform write 仍暂停 |
| accountIndex preflight | passed | HTTP/API `200/0`，exactMatchCount=`1`，createCalled=`false` |
| DB 回查 account_name | passed | `上海游民-巨兽战场-汇金-抖小-27` |
| 关闭任务 | passed | `active_task=null`，platform write 仍暂停 |

## 执行结果

| 项 | 值 |
| --- | --- |
| 命令 | `npm run monitor:account-preflight -- --advertiser-id 1871922346964041` |
| endpoint | `POST /tf/account_info/accountIndex` |
| HTTP/API | `200 / 0 / Success` |
| resultTotal | `1` |
| exactMatchCount | `1` |
| responseHash | `sha256:b87020780bb183f6b4c9d320e5c7351b933f7ae3d2df506b87dd8805b7c0d649` |
| evidence | `EV-MPR-OCEANENGINE-3-BYTE-MINI-GAME-JSZC-1871922346964041-ACCOUNTINDEX-PREFLIGHT` |
| accountIdentityWritten | `true` |
| monitorListApiCalled | `false` |
| createCalled | `false` |
| attemptCreated | `false` |

DB 回写字段：

| 字段 | 值 |
| --- | --- |
| `advertiser_id` | `1871922346964041` |
| `account_name` | `上海游民-巨兽战场-汇金-抖小-27` |
| `qiankun_account_record_id` | `8448` |
| `qiankun_agent_id` | `613` |
| `qiankun_media_master_id` | `今日头条` |
| `qiankun_identity_status` | `observed` |

## 验证结果

| 命令 | 结果 |
| --- | --- |
| `node -e JSON.parse(...)` | passed |
| `git diff --check` | passed |
| accountIndex preflight | passed |
| DB 回查 `advertiser_accounts` | passed |
| DB 回查 `evidence_artifacts` | passed |
| `npm run monitor:status -- --advertiser-id 1871922346964041` | passed；`createAllowedInCurrentTask=false` |

## 验收

- `accountIndex` 真实只读调用一次。
- 精确匹配 `1871922346964041`。
- `mwb.advertiser_accounts.account_name` 等于本次接口返回的 `advertiser_name`。
- evidence 记录响应摘要和 hash。
- `active_task=null`，`platform_write_allowed=false`。

## 最终结论

本任务完成。`account_name` 已按本次真实只读 `accountIndex` 返回的 `advertiser_name` 写入数据库；未调用 monitor list 或 monitor 创建接口。
