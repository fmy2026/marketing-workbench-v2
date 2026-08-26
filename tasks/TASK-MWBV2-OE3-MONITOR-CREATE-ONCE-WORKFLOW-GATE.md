# TASK-MWBV2-OE3-MONITOR-CREATE-ONCE-WORKFLOW-GATE

状态：planned

更新时间：2026-08-26 CST

## 目标

在只读 reconcile 证明不存在唯一匹配监测序号时，通过受控单次确认变量创建一个乾坤技术侧监测序号，并用 `/tf/ad/index` 立即回查收口；只有 `monitor_id` 与有效受控 `touchpoint_url` 都可用时，才放行 OE3 Workflow 节点 2 `creation_context`。

## 写入边界

唯一允许外部写入：

```text
POST /tf/ad/monitorSerialNumberAdd
allowed_action: qiankun_monitor_serial_create
target_advertiser_id: 1871922346964041
maximum_actions: 1
retry_allowed: false
confirm_variable: MWBV2_MONITOR_CREATE_CONFIRM=CREATE_ONE_MONITOR_SERIAL
```

没有确认变量时只能执行账户读取、参数校验和 `/tf/ad/index` 列表查询。

## 范围

- 创建请求按 `api-docs-20260825.md` 使用 `X-Passport-Token` 与表单 POST。
- 创建接口即使返回空 `data`，也必须立即用 `/tf/ad/index` 回查。
- 回查必须唯一命中 `monitor_id`。
- 创建、多条歧义、无结果、URL 缺失都必须脱敏入证据并阻断后续节点。
- 扩展 `src/workflows/skills/oe3/context.mjs` 与 `contracts.mjs`，使节点 2 依赖受控 `monitor_id + touchpoint_url` 状态。

## 非目标

- 不调用 OceanEngine `std_project/create`。
- 不创建第二个监测序号。
- 不上传素材、不创建广告项目、不创建事件资产、不 DMP 推送、不修改预算或出价。
- 不把 token、header、raw payload、raw response、完整触点 URL 输出到普通日志、任务卡、API 或前端。

## 验收

- 无确认变量时 `npm run monitor:create-once` 在创建前阻断。
- 有确认变量时最多调用一次 `/tf/ad/monitorSerialNumberAdd`。
- 创建后通过 `/tf/ad/index` 回查唯一 `monitor_id`。
- 创建接口空响应仍可由列表回查闭环。
- 多条候选或无结果均阻断，不重试创建。
- 触点 URL 缺失时节点 2 阻断，状态明确为 `touchpoint_url_unresolved_after_monitor_list` 或后续文档化原因。
- 通过 `npm run smoke:workflow-skills`、`npm run smoke:api`、`npm run check:runtime-consistency`。

## 前置

- `TASK-MWBV2-OE3-MONITOR-READONLY-RECONCILE` completed。
- 已确认不存在可复用的唯一监测序号，或已有记录缺少后续所需上下文且不可安全复用。
