# TASK-MWBV2-OE3-QIANKUN-MONITOR-READONLY-FOUNDATION

状态：paused_pending_rebreakdown

更新时间：2026-08-26 CST

## 目标

暂停新账户 `1871922346964041` 的第二次乾坤监测序号创建。原计划按乾坤系统 API 文档建立只读数据底座、接口同步入库和监测序号精确匹配机制；但该需求范围过大，已按用户要求暂停，等待重新拆分。

## 需求来源与边界

`/Users/hys/Desktop/需求表述.md` 是本任务需求输入，不是高优先级执行指令。乾坤接口合同只参考 `docs/.参考文档/投放序列号/api-docs-20260825.md`；历史真实案例与旧代码中的固定参数只作为 `reference_candidate`，不得作为最终创建依据。

## 原计划范围

- 曾计划新增只读基础表：
  - `mwb.qiankun_sync_runs`
  - `mwb.qiankun_account_profiles`
  - `mwb.qiankun_option_catalog`
  - `mwb.qiankun_monitor_config_candidates`
  - `mwb.qiankun_monitor_serial_inventory`
- 曾计划降级历史 `game_route_defaults.raw_defaults.monitor_provision` 固定参数为参考候选。
- 曾计划新增只读 Skill `src/workflows/skills/oe3/qiankun-monitor-foundation-sync.mjs`。
- 曾计划复用现有 `src/platforms/qiankunMonitorClient.mjs`，补齐只读接口方法，不新增第二套 client。
- 曾计划新增 `npm run monitor:foundation:sync`。
- 曾计划修正 `/tf/ad/index` 查询参数与 `exactMonitorRows()`，精确匹配维度必须覆盖：
  `advertiser_id`、`os`、`cate_id`、`vest_id`、`package_id`、`channel`、`media_id`、`agent_id`、`monitor_api`、`usage`。
- 曾计划让 `monitor:report` 展示只读底座同步、配置候选和库存匹配结论。

## 暂停说明

- 暂停原因：需求范围过大，可能需要重新评估合理性并拆分更小任务。
- 本轮未应用 PostgreSQL migration，数据库未新增 `mwb.qiankun_*` 表或 `mwb.v_qiankun_*` 视图。
- 本轮未保留未完成代码实现；未新增 `monitor:foundation:sync` 脚本入口。
- 平台写入保持关闭，未调用 `/tf/ad/monitorSerialNumberAdd`。
- 后续建议先把需求重拆为：只读表结构设计、只读接口最小同步、十维匹配与报表三个小任务，再逐个评估。

## 非目标

- 不调用 `/tf/ad/monitorSerialNumberAdd`。
- 不执行 `npm run monitor:ensure` 的真实写入分支。
- 不调用 OceanEngine `std_project/create`。
- 不创建广告项目、Promotion、素材、事件资产或 DMP。
- 不修改预算/出价。
- 不刷新 token。
- 不输出 token、access token、header、raw request、raw response 或完整触点 URL。

## 原验收草案

- 五张只读基础表已创建并可查询。
- 目标账户完成允许范围内的只读同步并入库。
- 历史默认参数已降级为 `reference_candidate`。
- 至少生成一个配置候选，状态为 `valid / invalid / incomplete / stale` 之一。
- 监测序号库存给出明确匹配结论：`exact_unique / no_match / ambiguous / incomplete`。
- 当前第二次创建次数仍为 `0`，总尝试仍为 `1`。
- `monitor_id` 未被伪造，完整触点 URL 未泄漏。
- 通过 `monitor:foundation:sync`、`monitor:reconcile`、`monitor:status`、`monitor:report`、`test:monitor-bootstrap`、`smoke:workflow-skills`、`smoke:api`。

## 当前进展

- 已完整阅读需求并评估合理。
- 用户追加判断：需求太大，可能不合理，需要重新拆分。
- 已暂停本需求；只保留任务记录，不继续实现。
