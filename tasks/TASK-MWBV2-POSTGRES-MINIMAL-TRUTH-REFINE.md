# TASK-MWBV2-POSTGRES-MINIMAL-TRUTH-REFINE

状态：completed

更新时间：2026-08-23 CST

## 目标

基于当前 `marketing_workbench_v2.mwb`，补充第一版投放创建 Agent 后续需要的一致性表结构。

## 范围

| 类型 | 内容 |
| --- | --- |
| 目标库 | `marketing_workbench_v2` |
| schema | `mwb` |
| 目标 | 新增游戏平台 app 表、账户资源表、来源用途标记 |
| 非目标 | 不接真实平台、不做真实创建、不刷新凭据、不触碰旧库 `marketing_workbench` |

## 已完成

- 新增 `mwb.game_platform_apps`，后续通过 `game_code + platform + app_type` 读取平台 appid。
- 新增 `mwb.account_resources`，作为“账户资源诊断与补齐”节点的主要读取入口。
- 给 `evidence_artifacts`、`game_assets`、`material_packs`、`material_pack_items`、`game_route_defaults`、`launch_jobs` 增加 `source_usage`。
- 新增 seed：`JSZC + oceanengine + byte_mini_game` app 行、7 类账户资源、1 条旧项目参考摘要。

## 执行文件

```bash
psql -X -d marketing_workbench_v2 -f db/004_refine_minimal_truth.sql
psql -X -d marketing_workbench_v2 -f db/005_seed_refine_minimal_truth.sql
```

## 安全边界

- 不写入 token、Cookie、secret、完整触点 URL、raw payload、raw response。
- 旧项目、历史资料、外部路径只能标记为 `reference_only`。
- 后续代码不得把 `reference_only` 当作运行时真值。

## 验收结果

| 标准 | 结果 |
| --- | --- |
| migration 可执行 | passed |
| seed 可执行 | passed |
| `game_platform_apps` 创建成功 | passed |
| 存在 `JSZC + oceanengine + byte_mini_game` 样例行 | passed |
| `account_resources` 创建成功 | passed |
| 账户资源覆盖 `avatar`、`dmp_audience_package`、`event_asset`、`video_asset`、`product_image`、`brand_info` | passed |
| `source_usage` 已加到 6 张相关表 | passed |
| 旧项目参考摘要标记为 `reference_only` | passed |
| 数据库内容未命中完整 URL、token、Cookie、raw payload、raw response 风险模式 | passed |

## 下一步

完成验收后进入前后端 API + Workflow 闭环。
