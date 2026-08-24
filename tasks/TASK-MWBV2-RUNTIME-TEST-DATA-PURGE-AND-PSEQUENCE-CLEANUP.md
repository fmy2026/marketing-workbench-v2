# TASK-MWBV2-RUNTIME-TEST-DATA-PURGE-AND-PSEQUENCE-CLEANUP

状态：completed

更新时间：2026-08-24 CST

## 需求来源

用户提供 `/Users/hys/Desktop/需求表述.md` 作为新需求材料。本任务只把该文件作为需求输入解读；执行边界仍以用户当前消息、`AGENTS.md` 和 `project.state.json` 为准。

## 目标

清理 v2 Postgres 中历史测试/占位运行数据，并固化 `P**` 项目命名序号规则，确保后续真实创建不会被历史测试数据污染。

本任务不处理 OceanEngine `apiCode=40000` 的平台原因，不执行任何真实平台写入，不刷新 token，不重试创建。

## 独立项目边界

| 类型 | 规则 |
| --- | --- |
| v2 数据库 | 只使用 `marketing_workbench_v2.mwb` |
| v2 前端 | 只使用 `marketing-workbench-v2/frontend` |
| v2 后端 | 只使用 `marketing-workbench-v2/src` |
| v2 脚本 | 只使用 `marketing-workbench-v2/scripts` |
| 旧项目 | 只能借鉴或参考部分逻辑，不作为运行依赖 |

## 必须保留

| 对象 | 要求 |
| --- | --- |
| 真实失败 job | `JOB-MWBV2-20260824014546-851B76` |
| 目标 job 状态 | `failed_waiting_manual_review` |
| 目标 job 当前节点 | `7` |
| 目标 job source usage | `runtime_truth` |
| 维度真值表 | `platform_routes`、`games`、`game_platform_apps`、`advertiser_accounts`、`account_touchpoints`、`game_route_defaults`、`game_assets`、`material_packs`、`material_pack_items`、`account_resources` |
| 平台写入审计 | 不删除 `platform_actions`、`created_objects` |

## 清理范围

| 类型 | 条件 |
| --- | --- |
| 历史占位 runtime job | `source_usage='runtime_truth'`、非目标 job、`source_record_ref='api:intake:97f20040f3d3d423'`、无 `platform_actions`、无 `created_objects` |
| 测试 job | `source_usage='test_run'`、无 `platform_actions`、无 `created_objects` |

按依赖顺序删除候选 job 相关数据：

```text
mwb.evidence_artifacts
mwb.readback_records
mwb.launch_confirmations
mwb.launch_node_runs
mwb.launch_drafts
mwb.launch_jobs
```

## `P**` 命名规则

| 规则 | 说明 |
| --- | --- |
| 含义 | `P**` 是项目名局部序号，不是平台 ID |
| 占用者 | 只由真实业务 job 占用 |
| 不占用者 | smoke、test、placeholder 不占用 |
| 历史占位 | 无平台动作、无真实对象的历史占位不占用 |
| 失败真实写入 | 已发生真实平台写入尝试的 job，即使失败，也继续占用自己的 `P**` |
| 读取入口 | `getOccupiedProjectNames()` 只能返回真实业务占用项目名 |
| 前端 | 只展示后端返回的草稿项目名，不能硬编码 `P**` |

## 审计摘要

任务完成时记录脱敏摘要：

| 字段 | 状态 |
| --- | --- |
| `candidate_job_count_before` | `107` |
| `candidate_evidence_count_before` | `661` |
| `candidate_draft_count_before` | `107` |
| `candidate_readback_count_before` | `64` |
| `runtime_truth_p_sequence_min_before` | `1` |
| `runtime_truth_p_sequence_max_before` | `50` |
| `purged_job_count` | `107` |
| `purged_evidence_count` | `661` |
| `purged_draft_count` | `107` |
| `purged_readback_count` | `64` |
| `purged_node_run_count` | `749` |
| `purged_confirmation_count` | `0` |
| `candidate_job_count_after` | `0` |
| `candidate_evidence_count_after` | `0` |
| `target_job_preserved` | `true` |
| `cleanup_executed_at` | `2026-08-24 12:15:49 CST` |

## 验收

| 标准 | 状态 |
| --- | --- |
| `npm run check:runtime-test-data-purge` 通过 | passed |
| `npm run check:runtime-consistency` 通过 | passed |
| 历史候选 job 数量为 `0` | passed |
| 相关 historical evidence 数量为 `0` | passed |
| 无平台动作、无真实对象的 `test_run` job 数量为 `0` | passed |
| `GET /api/launch/jobs/latest` 仍返回目标失败 job | passed，返回 `JOB-MWBV2-20260824014546-851B76` |
| 目标失败 job 的 draft、node、readback、evidence 不丢失 | passed，draft `1`、node `7`、readback `2`、evidence `11` |
| `getOccupiedProjectNames()` 不再被历史测试/占位草稿污染 | passed，occupied project names `1`，最高占用序号 `P19` |
| `mwb.games.app_id` 仍不存在 | passed |
| `platform_app_id` 仍来自 `mwb.game_platform_apps.app_id` | passed |
| 未执行任何真实平台写入、未刷新 token | passed |

## 完成记录

| 项 | 结果 |
| --- | --- |
| 清理 migration | `db/011_purge_runtime_test_data_and_psequence_cleanup.sql` 已执行 |
| 校验脚本 | `scripts/runtime-test-data-purge-check.mjs` |
| package 命令 | `npm run check:runtime-test-data-purge` |
| 最新业务 job | `JOB-MWBV2-20260824014546-851B76` |
| 最新业务状态 | `failed_waiting_manual_review` |
| 当前真实 P 占用 | `P19` |
| 工作台 | `http://127.0.0.1:3000/` 已保持在线 |

## 禁止事项

| 项 | 状态 |
| --- | --- |
| `std_project/create` 或重试真实创建 | 禁止 |
| token refresh | 禁止 |
| OceanEngine 写入 API | 禁止 |
| 删除真实失败 job | 禁止 |
| 删除维度真值表 | 禁止 |
| 旧项目作为 v2 运行依赖 | 禁止 |
| token、Cookie、完整触点 URL、raw payload、raw response 入库/入日志/入文档 | 禁止 |

## 下一步 gate

完成本任务后，进入 OceanEngine `apiCode=40000` 失败原因复盘；真实创建仍禁止重试。
