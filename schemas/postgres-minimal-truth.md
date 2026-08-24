# Postgres Minimal Truth

目标库：`marketing_workbench_v2`

目标 schema：`mwb`

定位：第一版投放创建 Agent 的最小结构化真值层。它只保存路线、游戏、账户、触点引用、投放默认值、素材、物料包、Workflow job、节点、草稿、回查和脱敏证据摘要。

## 字段规则

| 规则 | 要求 |
| --- | --- |
| 游戏标识 | 统一使用 `game_code` |
| 禁止字段 | 新库表结构不使用 `game_slug` |
| 路线产品字段 | `platform_routes` 使用 `marketing_product`，不使用 `product` |
| 平台长数字 ID | `advertiser_id`、`monitor_id`、`object_id` 等均为 `text` |
| 状态字段 | 状态类字段均为 `text` |
| 复杂摘要 | 使用 `jsonb` |
| 私密信息 | token、Cookie、raw payload、raw response 不入普通表；完整触点 URL 仅允许进入受控字段，不进普通 API、前端、日志或任务文件 |

## 最小表

| 表 | 用途 |
| --- | --- |
| `mwb.platform_routes` | 路线、平台、营销产品、对象类型、写入策略 |
| `mwb.games` | 游戏主档、产品名、品类、品牌名和产品身份摘要；不保存平台 appid |
| `mwb.advertiser_accounts` | 广告账户、授权状态、平台状态、监测序号 |
| `mwb.account_touchpoints` | 触点 ref、URL hash、状态；`touchpoint_url` 仅作本地受控存储和 hash 校验，不作为普通 API/前端展示字段 |
| `mwb.game_route_defaults` | 游戏 x 路线默认优化、预算、定向、排期和 DMP 摘要 |
| `mwb.game_assets` | 游戏素材、产品身份、方向包引用 |
| `mwb.game_platform_apps` | 游戏在不同平台/形态下的 appid 唯一读取入口 |
| `mwb.account_resources` | 账户级头像、DMP、事件、视频、产品图、品牌、小程序可用性；`metadata.readonly_check` 保存脱敏只读校验摘要 |
| `mwb.material_packs` | 保底物料包 |
| `mwb.material_pack_items` | 保底物料包明细 |
| `mwb.launch_jobs` | 一次投放创建任务 |
| `mwb.launch_node_runs` | 7 个 Workflow 节点状态、脱敏 `output_summary` 和证据引用 |
| `mwb.launch_drafts` | 创建草稿摘要和稳定 hash |
| `mwb.launch_confirmations` | 单次真实写入前的确认记录：确认哪个 draft/hash、确认变量和状态 |
| `mwb.platform_actions` | 平台动作审计记录：endpoint、次数、状态、hash 和 request id 是否存在，不保存 raw payload/response |
| `mwb.created_objects` | 真实创建对象记录：对象 ID、对象名、readback 状态和证据引用 |
| `mwb.readback_records` | 回查摘要 |
| `mwb.evidence_artifacts` | 脱敏证据摘要和 hash |

## 执行文件

| 文件 | 作用 |
| --- | --- |
| `db/001_create_database.sql` | 创建 `marketing_workbench_v2` 数据库 |
| `db/002_create_mwb_minimal_truth.sql` | 创建 `mwb` schema 和最小表 |
| `db/003_seed_minimal_truth.sql` | 写入一组完整样例数据 |
| `db/004_refine_minimal_truth.sql` | 补充 appid、账户资源和 `source_usage` 一致性结构 |
| `db/005_seed_refine_minimal_truth.sql` | 写入 appid、账户资源和旧资料引用标记样例 |
| `db/006_add_account_touchpoint_url.sql` | 新增受控触点 URL 字段 |
| `db/007_update_account_touchpoint_url_template.sql` | 参数化更新触点 URL 和 hash，不保存具体 URL |
| `db/008_add_launch_node_readonly_outputs.sql` | 新增节点只读输出摘要和证据引用字段 |
| `db/009_create_platform_write_records.sql` | 新增 `launch_confirmations`、`platform_actions`、`created_objects`，用于单次真实创建闭环 |
| `db/010_runtime_consistency_cleanup.sql` | 结构一致性清理：`test_run` 标记、目标失败态修正、移除 `games.app_id` |
| `db/011_purge_runtime_test_data_and_psequence_cleanup.sql` | 清理历史测试/占位运行数据，保留真实失败 job 和维度真值表，固化 `P**` 真实业务占用边界 |

## 读取约定

| 场景 | 读取入口 |
| --- | --- |
| 游戏主档 | `mwb.games` |
| 平台 appid | `mwb.game_platform_apps`，按 `game_code + platform + app_type` 查询 |
| 游戏级素材 | `mwb.game_assets` |
| 账户级资源可用性 | `mwb.account_resources` |
| 旧资料引用 | 只允许 `source_usage = 'reference_only'`，不得作为运行时真值 |
