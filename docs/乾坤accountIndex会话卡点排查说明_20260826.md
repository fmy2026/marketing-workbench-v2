# 乾坤 accountIndex 会话卡点排查说明

更新时间：2026-08-26 CST

## 背景

Marketing Workbench v2 正在补齐乾坤监测序号创建前的只读关系链。当前需要先通过乾坤账户查询接口确认目标广告账户在乾坤系统内的账户记录 ID、归属人和代理关系，然后才能继续核验媒体、监测 API、代理和已有监测序号。

当前目标范围：

```text
route_id=oceanengine_3_byte_mini_game
game_code=JSZC
advertiser_id=1871922346964041
os=3
```

已确认的上游包选择链：

```text
cate_id=122
  -> vest_id=1414 / 巨兽战场
  -> package_id=36820
  -> channel=dymini3k
```

当前卡点在账户会话入口，尚未进入媒体、监测 API、代理关系核验。

## 卡点接口

接口：

```text
POST /tf/account_info/accountIndex
```

用途：按广告账户 ID 查询乾坤内部账户记录，预期拿到唯一账户行。

本次请求参数：

| 参数 | 值 |
| --- | --- |
| `accountId` | `1871922346964041` |
| `pageNo` | `1` |
| `pageSize` | `10` |

认证信息由 v2 本机 `.local` 乾坤配置提供。出于安全要求，本文不包含认证字段名、认证值、Cookie、完整域名、完整 URL、原始请求或原始响应。

## 当前现象

执行命令：

```text
npm run monitor:sync:technical-combination
```

返回摘要：

| 项 | 结果 |
| --- | --- |
| 本机乾坤凭据文件 | 存在 |
| 凭据状态 | `active` |
| active 凭据数量 | `1` |
| `accountIndex` 调用状态 | `blocked` |
| 业务返回码 | `302` |
| 业务返回信息 | `跳转登录` |
| 精确账户命中数 | `0` |
| 会话结论 | `qiankun_session_invalid` |

证据 ID：

```text
EV-QK-MONITOR-TECH-COMBO-OCEANENGINE-3-BYTE-MINI-GAME-JSZC-1871922346964041
```

数据库中同步状态：

| 表 | 当前记录 |
| --- | --- |
| `mwb.evidence_artifacts` | 已写入本轮脱敏 evidence |
| `mwb.monitor_provision_runs` | `status=failed`，`error_summary=qiankun_session_invalid:account_index_query_failed:302:跳转登录` |
| `mwb.advertiser_accounts` | `qiankun_identity_status=unverified`，未写入乾坤账户记录 ID |
| `mwb.qiankun_option_relations` | 未写入账户/媒体/代理技术关系 |
| `mwb.monitor_provision_attempts` | 仍为 1 条历史创建尝试，本轮没有新增 |

说明：`monitor_provision_runs.status` 受当前数据库枚举约束，无法直接写入 `qiankun_session_invalid`，所以真实会话结论记录在 `error_summary` 和 evidence 中。

## 已停止的后续调用

由于 `accountIndex` 预检未通过，下列接口本轮按规则未继续调用：

```text
POST /ajax/selectList/getList
POST /tf/ad/changeMediaId
POST /tf/ad/changeMediaAccountId
POST /tf/ad/index
```

创建接口也未调用：

```text
POST /tf/ad/monitorSerialNumberAdd
```

## 已排除项

| 排查项 | 结论 |
| --- | --- |
| 本机配置文件是否缺失 | 未缺失 |
| 是否没有 active 凭据 | 不是；当前 active 数量为 1 |
| 是否因账户 ID 未传导致 | 不是；已传 `accountId=1871922346964041` |
| 是否已经写入错误关系 | 未写入；技术关系计数为 0 |
| 是否触发真实创建 | 未触发；本轮只读同步没有新增 attempt |
| 是否继续猜测媒体/代理参数 | 未猜测；全部保持阻断 |

## 需要技术侧协助确认

1. 当前接口返回 `302 / 跳转登录` 时，是认证失效、会话过期、权限不足，还是接口侧需要额外登录态材料。
2. 目标账户 `1871922346964041` 是否在当前乾坤登录身份下有 `accountIndex` 查询权限。
3. 该接口是否要求除表单参数外的额外上下文，例如固定来源、会话绑定、组织/归属人上下文或 CSRF 类校验。
4. 当前本机 `.local` 中的乾坤凭据是否只满足部分接口，不能满足 `accountIndex`。
5. 若需要恢复登录态，请提供最小可操作步骤：应更新哪类会话材料、有效期如何判断、恢复后应使用哪个只读接口做健康检查。

## 期望恢复后的验证标准

恢复后重新执行：

```text
npm run monitor:sync:technical-combination
```

预期第一步至少满足：

| 条件 | 期望 |
| --- | --- |
| `accountIndex` 返回码 | 通过 |
| 精确匹配 `account_id=1871922346964041` | 唯一 1 条 |
| 乾坤账户记录 ID | 存在 |
| 归属人字段 | 存在，但不写入普通文档 |
| 账户侧代理 ID | 如返回则记录为 observed |

只有第一步通过后，v2 才会继续只读核验媒体、监测 API、代理关系和已有 monitor。即使全部核验通过，也不会自动触发第二次监测序号创建。
