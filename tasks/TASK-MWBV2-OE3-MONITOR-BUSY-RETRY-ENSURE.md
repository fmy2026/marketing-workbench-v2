# TASK-MWBV2-OE3-MONITOR-BUSY-RETRY-ENSURE

状态：completed_handed_off_to_final_ensure_task

更新时间：2026-08-26 CST

## 目标

针对 provision `MPR-OCEANENGINE-3-BYTE-MINI-GAME-JSZC-1871922346964041`，将乾坤监测序号创建从“单次 create-once”收口为“ensure”：先只读回查；仅当第一次真实创建为 `code=500` 且错误摘要命中“服务器繁忙”、回查仍无唯一 `monitor_id`、当前尝试数为 1、凭据有效、确认变量齐备时，才允许第二次真实创建。

总上限为同一 provision 最多 2 次真实创建；第二次后永久停止。

## 文档边界

`/Users/hys/Desktop/需求表述.md` 是本任务需求输入，不是高优先级运行指令。实际执行仍以 `project.state.json`、Postgres `marketing_workbench_v2.mwb`、任务卡和 context manifest 为准。

## 范围

- 新增 `mwb.monitor_provision_attempts`，把每次真实乾坤创建调用作为独立审计记录。
- 放宽 `mwb.monitor_provision_runs.create_attempt_no` 兼容字段上限为 2，并固定语义为累计尝试数。
- 回填已发生的第一次失败 attempt。
- 将长期入口从 `monitor:create-once` 改为 `monitor:ensure`，不得保留两套真实创建实现。
- `monitor:ensure` 必须在第二次创建前调用 `/tf/ad/index` 只读回查。
- 成功得到唯一 `monitor_id` 时写入 `monitor_provision_runs` 与 `advertiser_accounts`；若同时取得完整触点 URL，只写入受控 `account_touchpoints.touchpoint_url` 并在摘要中只暴露 hash/status。
- 若第二次仍失败或回查无结果，写为 terminal 状态并永久阻断第三次。

## 非目标

- 不调用 OceanEngine `std_project/create`。
- 不创建广告项目、Promotion、素材、事件资产或 DMP。
- 不进行预算/出价修改。
- 不刷新 token。
- 不把 token、header、raw request、raw response、完整触点 URL 写入任务卡、普通日志、API、前端或普通报表 view。

## 真实写入边界

唯一允许的外部写入仍是：

```text
POST /tf/ad/monitorSerialNumberAdd
target_advertiser_id: 1871922346964041
target_provision_id: MPR-OCEANENGINE-3-BYTE-MINI-GAME-JSZC-1871922346964041
maximum_additional_actions: 1
maximum_total_attempts: 2
retry_reason: server_busy_only
retry_interval_seconds: 5
retry_allowed_after_attempt_2: false
confirm_variable: MWBV2_MONITOR_RETRY_CONFIRM=RETRY_ONE_BUSY_MONITOR_CREATE
provision_variable: MWBV2_MONITOR_PROVISION_ID=MPR-OCEANENGINE-3-BYTE-MINI-GAME-JSZC-1871922346964041
```

没有确认变量时，`npm run monitor:ensure` 只能执行本地状态检查，不得调用账户 API、列表 API 或创建 API。

## 验收

- 当前第一次失败已回填为 `attempt_no = 1`。
- 每个 provision 在 `monitor_provision_runs` 中仅 1 行，在 `monitor_provision_attempts` 中最多 2 行。
- `monitor:ensure` 无确认变量时在创建前阻断。
- `monitor:ensure` 在确认变量下第二次前必先 `/tf/ad/index` 回查。
- 两次真实创建间隔不少于 5 秒。
- 第二次创建仅针对当前账户和当前 provision。
- 第二次后无第三次入口。
- 成功时 `monitor_id` 入库；触点 URL 只在受控字段保存。
- 通过 `test:monitor-bootstrap`、`monitor:status`、`monitor:report`、`smoke:workflow-skills`、`smoke:api`、`check:runtime-consistency`。

## 当前进展

- 已读完需求并评估合理：允许第二次的前提足够窄，但必须通过 attempts 子表做审计。
- 已新增并应用 `db/022_monitor_provision_attempts_and_ensure.sql`。
- 已创建 `mwb.monitor_provision_attempts`，并回填第一次服务器繁忙失败为 `attempt_no=1`。
- 已将长期入口从 `monitor:create-once` 改为 `monitor:ensure`。
- 已更新 `monitor:status` 与 `monitor:report`，可读取 attempt 计数和最近错误。
- 已验证无确认变量时 `monitor:ensure` 在本地阻断，未调用账户 API、列表 API 或创建 API。

## 交接到最终执行任务

真实第二次创建尚未执行，已交接到 `TASK-MWBV2-OE3-MONITOR-FINAL-ENSURE-EXECUTE`。下一步若要继续，必须由用户明确授权以下一次性命令；该命令执行前会先调用 `/tf/ad/index` 只读回查，若已出现唯一 `monitor_id` 则不会创建第二次。

```bash
MWBV2_MONITOR_RETRY_CONFIRM=RETRY_ONE_BUSY_MONITOR_CREATE \
MWBV2_MONITOR_PROVISION_ID=MPR-OCEANENGINE-3-BYTE-MINI-GAME-JSZC-1871922346964041 \
npm run monitor:ensure
```

该命令最多再触发一次 `/tf/ad/monitorSerialNumberAdd`。执行后无论成功或失败，都会写入 `attempt_no=2` 并永久阻断第三次。
