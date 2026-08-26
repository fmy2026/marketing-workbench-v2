# TASK-MWBV2-OE3-MONITOR-READONLY-RECONCILE

状态：planned

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

若没有唯一匹配监测序号，进入 `TASK-MWBV2-OE3-MONITOR-CREATE-ONCE-WORKFLOW-GATE`，由用户显式确认后最多创建一次并立即列表回查。
