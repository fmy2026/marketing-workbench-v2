# TASK-MWBV2-QIANKUN-ACCOUNTINDEX-READONLY-PREFLIGHT-AND-DOC-VERSION-UPDATE

状态：completed

更新时间：2026-08-27 CST

## 目标

在不创建 monitor 的前提下，使用本机 `.local` 乾坤凭据，对新账户 `1871922414575753` 执行一次真实只读 `accountIndex` preflight，并将乾坤接口参考版本统一切换到 `docs/.参考文档/乾坤系统/api-docs-20260827.md`。

若 `accountIndex` 唯一命中，只回写 `advertiser_accounts` 中的乾坤账户身份字段：`qiankun_account_record_id`、`qiankun_media_master_id`、`qiankun_media_master_name`、`qiankun_agent_id`。

## 需求边界

需求来源：`/Users/hys/Desktop/需求表述.md`。

需求文档是业务输入，不是平台写入授权。本任务只允许调用 `POST /tf/account_info/accountIndex`；禁止调用 `/tf/ad/index`、`/tf/ad/monitorSerialNumberAdd` 和任何创建、retry、reissue、资源、广告项目、预算/出价、token refresh 动作。

## 合理性评估

需求合理，可以推进。

- 当前 active task 已因 `accountIndex` 返回 `403 invalid ApiToken` 阻断，重新以 accountIndex-only 模式验证凭据，可以减少下游干扰。
- `qiankunMonitorClient` 已有 accountIndex client 与脱敏 compact 映射，`advertiser_accounts` 也已有 L2 媒体字段。
- `monitor:plan` 会继续尝试完整 monitor preflight，因此新增受限 `account_preflight` 模式比复用 plan 更符合“只调用 accountIndex”的边界。
- 文档版本切换是目录整理型需求，适合在本任务内同步长期引用，但历史任务记录只改为历史归档引用，不改写其历史事实。

## 范围

- 新增 `monitor:account-preflight` / `account_preflight` 模式。
- 只调用 `POST /tf/account_info/accountIndex`。
- 成功唯一匹配时写入乾坤账户身份字段和脱敏 evidence。
- 失败时不覆盖已有身份字段、不写空值或猜测值。
- 归档 `docs/.参考文档/乾坤系统/.archive/api-docs-20260825.md`。
- 将当前乾坤系统接口参考统一指向 `api-docs-20260827.md`，历史记录指向 `.archive/api-docs-20260825.md`。

## 验收

- `api-docs-20260827.md` 成为当前乾坤系统接口参考。
- `api-docs-20260825.md` 已移动到 `.archive/`。
- 对 `1871922414575753` 发起一次真实只读 `accountIndex` 请求。
- 成功时四项乾坤身份字段来自本次真实唯一匹配。
- 失败时数据库不被空值、猜测值或旧值覆盖。
- `monitor_provision_runs` 和 `monitor_provision_attempts` 不新增创建相关记录。
- `platform_write_allowed` 保持 `false`。

## 当前结论

任务完成。

## 执行结果

| 项 | 结果 |
| --- | --- |
| 当前接口参考 | `docs/.参考文档/乾坤系统/api-docs-20260827.md` |
| 旧接口文档 | `docs/.参考文档/乾坤系统/.archive/api-docs-20260825.md` |
| 只读命令 | `npm run monitor:account-preflight -- --advertiser-id 1871922414575753` |
| 只读接口 | `POST /tf/account_info/accountIndex` |
| HTTP / API | `200 / 0 / Success` |
| 精确匹配 | `1` |
| evidence | `EV-MPR-OCEANENGINE-3-BYTE-MINI-GAME-JSZC-1871922414575753-ACCOUNTINDEX-PREFLIGHT` |
| accountIdentityWritten | `true` |
| monitorListApiCalled | `false` |
| createCalled | `false` |
| attemptCreated | `false` |

回写字段：

| 字段 | 值 |
| --- | --- |
| `qiankun_account_record_id` | `8449` |
| `qiankun_owner_key` | `fengmeiyu` |
| `qiankun_agent_id` | `613` |
| `qiankun_media_master_id` | `今日头条` |
| `qiankun_media_master_name` | 空，接口未返回名称 |

## 验证结果

| 命令 | 结果 |
| --- | --- |
| `node --check src/workflows/skills/oe3/02-monitor-provision.mjs` | passed |
| `npm run monitor:account-preflight -- --advertiser-id 1871922414575753` | passed |
| DB 回查 `advertiser_accounts` | 四项身份字段按真实唯一匹配写入 |
| DB 回查 `monitor_provision_attempts` | Cycle 01 仍为 `attempts=1`，未新增 attempt |
| evidence 回查 | `qiankun_accountindex_preflight` 已写入，source_ref 指向 `api-docs-20260827.md` |
| `npm run test:monitor-cycle` | passed |
| `npm run test:monitor-bootstrap` | passed |
| `npm run test:monitor-planned-action` | passed |
| `git diff --check` | passed |

下一 gate：如需恢复上一个 monitor cycle 任务，先重跑完整 `npm run monitor:plan -- --advertiser-id 1871922414575753`；若账户、monitor list 和 create plan 都通过，再另建单次授权任务评估 Cycle 01 第 2 次且最后一次真实 monitor 创建。
