# TASK-MWBV2-OE3-FINAL-READINESS-AND-BRAND-INDUSTRY-REPAIR

状态：completed

更新时间：2026-08-24 CST

## 目标

修复/定位 `JOB-MWBV2-20260824014546-851B76` 的 `brand_industry` fresh readback 阻断，并生成创建前最终 readiness packet。

本任务不执行 `std_project/create`，不重试创建，不刷新 token，不上传素材，不调用任何平台写入 API。

## 独立项目边界

| 类型 | 规则 |
| --- | --- |
| v2 数据库 | 只使用 `marketing_workbench_v2.mwb` |
| v2 前端 | 只使用 `marketing-workbench-v2/frontend` |
| v2 后端 | 只使用 `marketing-workbench-v2/src` |
| v2 脚本 | 只使用 `marketing-workbench-v2/scripts` |
| 旧项目 | 只能借鉴或参考部分逻辑，不作为运行依赖 |

## 当前事实

| 项 | 值 |
| --- | --- |
| 目标 job | `JOB-MWBV2-20260824014546-851B76` |
| 目标账户 | `1871922175825993` |
| 路线 | `oceanengine_3_byte_mini_game` |
| 游戏 | `JSZC` |
| 当前状态 | `failed_waiting_manual_review`（保持不变） |
| 当前节点 | `7` |
| platform actions | `1` |
| created objects | `0` |
| 已知阻断 | 已定位：`outer_brand_id` 字符串形态 HTTP `200` + `api_code=40000`，数字形态通过 |

## 完成结论

| 维度 | 结论 |
| --- | --- |
| brand fuzzy | passed，唯一 VALID `巨兽战场` |
| brand industry | passed，`outer_brand_id` 数字形态通过并命中 `游戏 / SLG` |
| event chain | passed |
| payload contract | passed |
| payload hash | stable |
| duplicate check | `platform_not_duplicate` |
| 当前 job 可创建 | 否 |
| 唯一阻断 | `single_create_attempt_already_recorded` |
| readiness status | `blocked_after_single_create_failure` |
| 下一步 | 新建 fresh runtime job 或开启单次创建确认任务 |

## 范围

| 项 | 动作 |
| --- | --- |
| brand industry | 新增只读诊断脚本，尝试官方/兼容参数形态，输出脱敏结论 |
| readiness packet | 新增最终创建前 readiness 脚本，明确当前 job 是否可创建 |
| Postgres 状态表达 | 更新 `brand_info`、`event_asset` metadata 与 7 节点 output_summary，不改 job 创建结果 |
| API | `GET /api/launch/jobs/:job_id` 增加 `createReadiness` |
| 前端 | 最小展示当前状态、唯一阻断、下一步动作；禁止显示可创建 |

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

## 验收

| 标准 | 状态 |
| --- | --- |
| 新建 task 和 context manifest | passed |
| `npm run check:oe3-brand-industry` 通过并输出脱敏诊断 | passed |
| `npm run check:std-project-create-readiness` 通过并写入 readiness evidence | passed |
| `npm run check:runtime-consistency` 通过 | passed |
| `npm run test:payload-contract` 通过 | passed |
| `npm run smoke:api` 通过 | passed |
| `platform_actions` 仍为 `1` | passed |
| `created_objects` 仍为 `0` | passed |
| 不执行 `std_project/create` | passed |
| 不刷新 token | passed |
| 不泄漏 token、Cookie、完整触点 URL、raw payload、raw response | passed |
| API 返回 `createReadiness` | passed |
| 前端显示不可创建/禁止重试 | passed |

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

## 下一步 gate

brand/event/payload 已通过；当前 job 因已有单次 create attempt 不可复用。下一步进入“新建 fresh runtime job 或单次创建确认任务”，本任务仍不执行真实创建。
