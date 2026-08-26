# TASK-MWBV2-OE3-MONITOR-SECOND-FINAL-EXECUTE-RESULT

状态：completed_terminal_failed

更新时间：2026-08-26 CST

## 目标

在用户明确授权后，对新账户 `1871922346964041` 执行第二次且最后一次乾坤 monitor 真实创建。

## 授权边界

用户已在当前对话明确确认：

```text
确认针对新账户、第二次且最后一次乾坤 monitor 真实创建；请执行
```

本次执行仅限：

```text
provision_id=MPR-OCEANENGINE-3-BYTE-MINI-GAME-JSZC-1871922346964041
advertiser_id=1871922346964041
maximum_total_attempts=2
attempt_no=2
```

禁止第三次创建，禁止 token refresh，禁止 OceanEngine 项目/广告/素材/事件/DMP/预算/出价写入。

## 执行命令

```bash
MWBV2_MONITOR_RETRY_CONFIRM=RETRY_ONE_BUSY_MONITOR_CREATE \
MWBV2_MONITOR_PROVISION_ID=MPR-OCEANENGINE-3-BYTE-MINI-GAME-JSZC-1871922346964041 \
MWBV2_MONITOR_L3_OVERRIDE_CONFIRM=CONFIRM_MEDIA_RESOURCE_310_FOR_ONE_MONITOR \
npm run monitor:ensure
```

## 请求字段清单

本次创建接口为：

```text
POST /tf/ad/monitorSerialNumberAdd
```

本次 request field manifest 只记录字段名和 hash，不保存 raw request。

| 字段 | 值来源 | 本次状态 |
| --- | --- | --- |
| `os` | 已观测包选择层 | 已带 |
| `package_id` | 已观测融合拿包 | 已带 |
| `cate_id` | 已观测游戏组 | 已带 |
| `vest_id` | 已观测马甲 | 已带 |
| `channel` | 已观测融合渠道 | 已带 |
| `owner` | `accountIndex` 唯一命中 | 已带 |
| `media_id` | 人工 L3 覆盖确认 | 已带，`310` |
| `monitor_api` | 人工 L3 覆盖确认 | 已带，`toutiao_wxgame` |
| `agent_id` | `accountIndex` + 人工覆盖范围 | 已带，`613` |
| `media_account_id` | `accountIndex` 乾坤账号记录 | 已带，`8448` |
| `usage` | `usageList` 确认为普通广告 | 已带，`0` |
| `num` | 业务规则 | 已带，`1` |
| `remark` | v2 运行备注 | 已带 |

## 执行结果

| 项 | 结果 |
| --- | --- |
| preflight `/tf/ad/index` | passed，精确匹配 `0` 条 |
| 是否调用创建接口 | 是 |
| 创建接口 HTTP 状态 | `200` |
| 创建接口业务码 | `500` |
| 创建接口业务消息 | `服务器繁忙，请稍后重试(400)` |
| post-create `/tf/ad/index` | passed，精确匹配 `0` 条 |
| `monitor_id` | 未生成 / 未解析 |
| 触点 URL | 未写入 |
| attempt count | `2` |
| 最新 attempt | `attempt_no=2`，`failed` |
| provision 状态 | `terminal_failed` |
| error summary | `monitor_create_busy_retry_exhausted` |
| 是否允许继续重试 | 否 |

## 第三次阻断验证

执行完成后再次运行不带确认变量的 `npm run monitor:ensure`：

```text
accountApiCalled=false
monitorListApiCalled=false
createCalled=false
retryAllowed=false
blockers 包含 monitor_create_attempt_limit_reached
```

## Evidence

| Evidence | 类型 | 说明 |
| --- | --- | --- |
| `EV-QK-MANUAL-L3-CONFIRM-OCEANENGINE-3-BYTE-MINI-GAME-JSZC-1871922346964041-310` | `qiankun_manual_l3_confirm` | 人工确认 L3 资源位覆盖，仅限本 provision |
| `EV-MPR-OCEANENGINE-3-BYTE-MINI-GAME-JSZC-1871922346964041-ENSURE` | `qiankun_monitor_ensure` | 第二次真实创建尝试与回查摘要 |

## 数据库回查

`mwb.monitor_provision_runs`：

```text
status=terminal_failed
monitor_serial_id=
monitor_id=
create_called=true
create_attempt_no=2
error_summary=monitor_create_busy_retry_exhausted
```

`mwb.monitor_provision_attempts`：

| attempt_no | trigger_reason | attempt_status | http_status | api_code | error_category |
| --- | --- | --- | --- | --- | --- |
| `1` | `initial_create_once` | `failed` |  | `500` | `server_busy` |
| `2` | `server_busy_retry` | `failed` | `200` | `500` | `server_busy` |

## 关闭结论

第二次且最后一次乾坤 monitor 真实创建已经执行并失败。失败点仍是乾坤服务端返回 `服务器繁忙，请稍后重试(400)`，不是 v2 缺少创建字段；本次创建字段 manifest 显示必需字段已齐。

本 provision 的创建尝试次数已耗尽，后续不得再执行第三次创建。下一步只能走技术排查或人工在乾坤侧处理服务端 500；若乾坤后台已有人工创建结果，需要使用只读 `/tf/ad/index` 回查并入库，不得再调用创建接口。
