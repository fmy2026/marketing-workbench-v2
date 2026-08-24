# TASK-MWBV2-OE3-BRAND-EVENT-READONLY-GATE-HARDENING

状态：completed

更新时间：2026-08-24 CST

## 需求来源

用户提供 `/Users/hys/Desktop/需求表述.md` 作为新需求材料。本任务只把该文件作为需求输入解读；执行边界仍以用户当前消息、`AGENTS.md` 和 `project.state.json` 为准。

## 目标

针对 `JOB-MWBV2-20260824014546-851B76` 的 `apiCode=40000` 失败复盘结论，补齐 v2 创建前最关键的只读 gate：

1. `brand_info` 必须来自 fresh target-account brand + industry live readback，不能继续依赖人工确认放行。
2. 事件链必须补齐 event asset detail、available events、event configs、optimized goal、dbt。
3. 不执行 `std_project/create`，不重试创建，不刷新 token，不执行任何写入 API。

## 独立项目边界

| 类型 | 规则 |
| --- | --- |
| v2 数据库 | 只使用 `marketing_workbench_v2.mwb` |
| v2 前端 | 只使用 `marketing-workbench-v2/frontend` |
| v2 后端 | 只使用 `marketing-workbench-v2/src` |
| v2 脚本 | 只使用 `marketing-workbench-v2/scripts` |
| 旧项目 | 只能借鉴或参考部分逻辑，不作为运行依赖 |

## 目标 job

| 字段 | 值 |
| --- | --- |
| `job_id` | `JOB-MWBV2-20260824014546-851B76` |
| `advertiser_id` | `1871922175825993` |
| `game_code` | `JSZC` |
| `route_id` | `oceanengine_3_byte_mini_game` |
| 期望状态 | `failed_waiting_manual_review` |
| 期望节点 | `7` |
| 期望 platform actions | `1` |
| 期望 created objects | `0` |

## 只读 gate

| Gate | 状态 | 证据摘要 | 结论 | 下一步 |
| --- | --- | --- | --- | --- |
| `brand_fuzzy` | passed | HTTP `200`，`api_code=0`，request id present，matched `1`，唯一 VALID 巨兽战场 | 品牌可投列表 fresh readback 通过 | 无需动作 |
| `brand_industry` | blocked | HTTP `200`，`api_code=40000`，request id present，data absent，industry node `0` | fresh target-account 行业 readback 未命中 `游戏 / SLG` | 修 `brand_industry` 参数、权限或行业映射 |
| `event_asset_detail` | passed | HTTP `200`，`api_code=0`，asset count `1`，目标 asset id found，`MINI_PROGRAME`，app matched，advertiser matched | 目标账户事件资产 detail 通过；detail 中 micro app 字段未作为硬阻断 | 无需动作 |
| `available_events` | passed | HTTP `200`，`api_code=0`，event count `67`，`MINI_PROGRAME_API` found，PAY/ROI found | 可创建事件列表满足事件链继续条件 | 无需动作 |
| `event_configs` | passed | HTTP `200`，`api_code=0`，event count `6`，`MINI_PROGRAME_API` found，PAY/ROI found | 已创建事件配置满足当前只读 gate | 无需动作 |
| `optimized_goal` | passed | HTTP `200`，`api_code=0`，goal count `7`，PAY + 7D ROI found | 优化目标支持当前计划 | 无需动作 |
| `dbt` | passed | HTTP `200`，`api_code=0`，deep bid type count `1`，`PER_AND_SEVEN_PAY_ROI` found | 深度优化方式支持当前计划 | 无需动作 |

## 写入边界

允许写入脱敏证据：

```text
mwb.evidence_artifacts
mwb.account_resources.metadata.readonly_check
mwb.launch_node_runs.output_summary
```

禁止修改：

```text
mwb.platform_actions
mwb.created_objects
mwb.launch_drafts.payload_hash
mwb.launch_jobs.job_status
```

## 禁止事项

| 项 | 状态 |
| --- | --- |
| `std_project/create` | 禁止 |
| 真实创建重试 | 禁止 |
| token refresh | 禁止 |
| 素材上传 | 禁止 |
| 事件资产创建 | 禁止 |
| event configs 创建 | 禁止 |
| DMP push | 禁止 |
| 预算/出价修改 | 禁止 |
| 输出 token、Cookie、完整触点 URL、raw payload、raw response | 禁止 |
| 旧项目作为 v2 运行依赖 | 禁止 |

## 验收

| 标准 | 状态 |
| --- | --- |
| 新建 task 和 context manifest | passed |
| 新增 `scripts/oe3-brand-event-readonly-gate-check.mjs` | passed |
| `npm run check:oe3-brand-event-readonly-gate` 可运行 | passed，结果 `blocked`，阻断点为 `brand_industry` |
| `npm run check:runtime-consistency` 通过 | passed |
| 不执行 `std_project/create` | passed |
| 不刷新 token | passed |
| 不调用任何写入 API | passed |
| 目标 job 仍是 `failed_waiting_manual_review`、`current_node=7` | passed |
| `platform_actions` 仍为 `1`，`created_objects` 仍为 `0` | passed |
| brand/event 只读结果写入脱敏 evidence | passed，`7` 条 |
| 明确下一步 gate | passed |

## 完成记录

| 项 | 结果 |
| --- | --- |
| 新增脚本 | `scripts/oe3-brand-event-readonly-gate-check.mjs` |
| 新增命令 | `npm run check:oe3-brand-event-readonly-gate` |
| 更新只读白名单 | `src/platforms/oceanengineReadonlyClient.mjs` 增加 brand/event 深检 GET endpoint |
| 新增 evidence | `7` 条 `oe3_brand_event_readonly_gate` |
| 目标 job | 状态未变：`failed_waiting_manual_review`，节点 `7` |
| 平台动作 | 仍为 `1` |
| created objects | 仍为 `0` |
| 结论 | 事件链深检通过；唯一阻断为 `brand_industry` HTTP `200` + `api_code=40000` |

## 下一步 gate

完成后根据结果三选一：

1. 修 `brand_industry` readback。
2. 补事件链配置。
3. 如果 brand + event 全通过，再进入 `std_project/create payload official diff` 任务。

当前实际下一步：修 `brand_industry` readback；不要直接重试创建。
