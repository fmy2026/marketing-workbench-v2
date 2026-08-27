# TASK-MWBV2-OE3-MONITOR-CREATE-ONCE-WORKFLOW-GATE

状态：completed_with_blockers

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

- 创建请求当时按历史 `api-docs-20260825.md` 使用表单 POST；当前乾坤系统接口参考已切换为 `docs/.参考文档/乾坤系统/api-docs-20260827.md`。
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

## 执行结果

| 项 | 结果 |
| --- | --- |
| task 3 manifest | 已补齐 |
| 本地 owner_key | 已回填为 `fengmeiyu`，token 未输出、未入 Git |
| monitor_provision 默认值 | 已由真实案例下划线技术字段写入 `mwb.game_route_defaults.raw_defaults.monitor_provision` |
| PostgreSQL 报表 | 已新增 `mwb.v_monitor_provision_status_report`、`mwb.v_monitor_provision_blocker_report` |
| 无确认变量 gate | passed，创建前阻断，`createCalled=false` |
| 真实创建尝试 | 已在确认变量下调用一次 `/tf/ad/monitorSerialNumberAdd` |
| 创建结果 | blocked，HTTP 200 但业务 `code=500`，message=`服务器繁忙，请稍后重试(400)` |
| 创建后回查 | `/tf/ad/index` passed，但 `resultTotal=0` |
| 单次保护 | passed，`create_called=true`、`create_attempt_no=1`，后续自动重试被阻断 |
| `monitor_id` | unresolved |
| `touchpoint_url` | unresolved |

## 写入结果

| 位置 | 结果 |
| --- | --- |
| `mwb.monitor_provision_runs` | `status=failed`，记录一次 create attempt 的 request/response hash |
| `mwb.advertiser_accounts` | `auth_status=ready`，账号记录 ID 与 owner 已更新 |
| `mwb.evidence_artifacts` | 已写入 `qiankun_monitor_create_once` 脱敏证据 |
| `mwb.account_touchpoints` | 未写入；无有效 `monitor_id` |

## 剩余 Blocker

- `monitor_create_failed:500:服务器繁忙，请稍后重试(400)`
- `post_create_monitor_readback_missing`

按照单次创建规则，不允许自动重试。Workflow 第 2 节点仍不可通过。

## 验证结果

- `npm run monitor:report` passed
- `npm run monitor:status` passed
- `npm run monitor:create-once` 无确认变量时 passed：重复创建被阻断
- `npm run test:monitor-bootstrap` passed
- `npm run smoke:workflow-skills` passed
- `npm run smoke:api` passed
- `npm run check:runtime-consistency -- --job-id JOB-MWBV2-20260825041227-12D2B5` passed
- JSON parse check passed
- `git diff --check` passed
