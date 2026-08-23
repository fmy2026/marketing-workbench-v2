# TASK-MWBV2-POSTGRES-MINIMAL-TRUTH

状态：completed

更新时间：2026-08-23 CST

## 目标

为第一版投放创建 Agent 建立独立 Postgres 数据基础，支持一个账户、一款游戏、一条路线跑通后续前后端 Workflow。

## 范围

| 类型 | 内容 |
| --- | --- |
| 目标库 | `marketing_workbench_v2` |
| schema | `mwb` |
| 目标 | migration、seed、表结构说明、任务上下文 |
| 非目标 | 不接真实平台、不做真实创建、不刷新凭据、不触碰旧库数据 |

## 已完成

- 新增 `db/001_create_database.sql`，用于创建 `marketing_workbench_v2`。
- 新增 `db/002_create_mwb_minimal_truth.sql`，用于创建 `mwb` schema 和 13 张最小表。
- 新增 `db/003_seed_minimal_truth.sql`，用于写入一组完整样例数据。
- 新增 `schemas/postgres-minimal-truth.md`，记录表结构和字段约束。
- 新增 `tasks-context-manifests/TASK-MWBV2-POSTGRES-MINIMAL-TRUTH.json`。
- 已执行建库、建表和 seed。
- 更新 `project.state.json`，关闭当前任务并写明下一步 gate。

## 已执行命令

```bash
psql -X -d postgres -f db/001_create_database.sql
psql -X -d marketing_workbench_v2 -f db/002_create_mwb_minimal_truth.sql
psql -X -d marketing_workbench_v2 -f db/003_seed_minimal_truth.sql
```

## 预期创建对象

| 类别 | 内容 |
| --- | --- |
| database | `marketing_workbench_v2` |
| schema | `mwb` |
| tables | `platform_routes`、`games`、`advertiser_accounts`、`account_touchpoints`、`game_route_defaults`、`game_assets`、`material_packs`、`material_pack_items`、`launch_jobs`、`launch_node_runs`、`launch_drafts`、`readback_records`、`evidence_artifacts` |
| seed | 1 条路线、1 款游戏、1 个账户、1 个触点、1 组默认值、5 个素材/身份/方向资产、1 个物料包、3 个物料明细、1 个 job、7 个节点、1 个草稿、1 个回查摘要、4 个证据摘要 |

## 安全边界

- 新库表结构不包含 `game_slug` 字段。
- `platform_routes` 使用 `marketing_product`，不使用 `product`。
- 平台长数字 ID 均为 `text`。
- 不迁移完整触点 URL。
- 不迁移 token、Cookie、secret、raw payload、raw response。
- 旧库 `marketing_workbench.mwb` 只读参考，不写入、不依赖。

## 验收结果

| 标准 | 结果 |
| --- | --- |
| 新库 `marketing_workbench_v2` 已创建 | passed |
| `mwb` schema 和 13 张最小表已创建 | passed |
| seed 写入一组完整样例数据 | passed |
| `launch_node_runs` 初始化 7 个节点 | passed |
| 核心路线、游戏、账户、触点、默认值、物料包、job、草稿、回查可 join 查询 | passed |
| `advertiser_id`、`monitor_id`、`object_id` 为 `text` | passed |
| 新表中不出现 `game_slug` 字段 | passed |
| `platform_routes` 不出现 `product` 字段 | passed |
| 数据库内容未命中完整 URL、token、Cookie、raw payload、raw response 风险模式 | passed |

## 下一步

进入前后端 API + Workflow 闭环。
