# TASK-MWBV2-OE3-MONITOR-READONLY-RECONCILE

状态：completed_with_blockers

更新时间：2026-08-26 CST

## 目标

在 foundation 完成后，实现技术侧只读 reconcile：读取本地技术凭据脱敏状态，调用乾坤技术 API 查询账户身份与已有监测序号，若存在唯一匹配则写入 v2 Postgres，使账户 `1871922346964041` 获得可审计的 `monitor_id` 与触点上下文状态。

## 范围

- 路线：`oceanengine_3_byte_mini_game`
- 游戏：`JSZC`
- 账户：`1871922346964041`
- 接口：
  - `POST /tf/account_info/accountIndex`
  - `POST /tf/ad/index`
- 只读验证 `game_route_defaults.raw_defaults.monitor_provision` 的实际固定参数。
- 写入脱敏 `monitor_provision_runs`、`advertiser_accounts`、`account_touchpoints`、`evidence_artifacts`。

## 非目标

- 不调用 `/tf/ad/monitorSerialNumberAdd`。
- 不调用 OceanEngine `std_project/create`。
- 不上传素材、不创建广告项目、不改预算/出价、不刷新 token。
- 不保存 token、header、raw request、raw response 或完整触点 URL 到任务文件、普通日志、API 或前端。

## 验收

- 账户可被 `/tf/account_info/accountIndex` 精确识别。
- `sso_owner` 与本地凭据 `owner_key` 精确匹配；缺失、过期或 mismatch 均阻断。
- `/tf/ad/index` 查询使用文档定义入口，不依赖旧脚本过期判断。
- 已有唯一匹配监测序号时不创建，并写入 `monitor_id`。
- 多条候选或无候选均不猜测、不创建，交给 task 3 或人工判断。
- 列表包含有效 URL 时只写受控字段与 hash；列表不含完整 URL 时标记 `touchpoint_url_unresolved_after_monitor_list`。
- `npm run monitor:status`、`npm run monitor:reconcile`、`npm run test:monitor-bootstrap` 可运行并脱敏输出。

## 前置

- `TASK-MWBV2-OE3-MONITOR-PROVISION-FOUNDATION` completed。
- 第一阶段 migration、凭据合同、敏感信息边界已落地。

## 下一步 Gate

第二关已完成只读执行并写入脱敏真值。当前不能直接进入创建关，需先完成两个前置确认：

- 本地 `.local/qiankun-passport-credentials.json` 的 `owner_key` 尚未回填；账号接口返回候选值为 `冯美钰`，需用户明确确认后再写入本地凭据。
- `mwb.game_route_defaults.raw_defaults.monitor_provision` 仍为空，无法按固定参数做精确监测序号匹配或创建 payload。

## 执行结果

| 项 | 结果 |
| --- | --- |
| `/tf/account_info/accountIndex` | passed；去掉 `sorts` 参数后成功 |
| 账号精确匹配 | passed，`account_id=1871922346964041` |
| 技术账户记录 ID | `8448` |
| owner 候选 | `冯美钰` |
| 授权状态 | `授权正常` |
| `/tf/ad/index` 宽查询 | passed，按账号 + owner 查询，`resultTotal=0` |
| 固定参数精确匹配 | blocked，`monitor_provision` 缺失 |
| `monitor_id` | unresolved |
| 触点 URL | unresolved |
| 创建接口 | 未调用 |

## 写入结果

| 位置 | 结果 |
| --- | --- |
| `mwb.advertiser_accounts` | 已写入账号基础信息、owner_name、授权状态；`monitor_id` 为空 |
| `mwb.monitor_provision_runs` | 已写入 `account_resolved` 状态 |
| `mwb.evidence_artifacts` | 已写入脱敏只读证据 |
| `mwb.account_touchpoints` | 未写入；尚无有效 `monitor_id` |

## 剩余 Blocker

- `owner_key_resolved_but_not_persisted`
- `monitor_provision_defaults_missing`

Workflow 第 2 节点仍不可通过；不得伪造 `monitor_id` 或 `touchpoint_url`。
