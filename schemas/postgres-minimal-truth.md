# Postgres Minimal Truth

目标库：`marketing_workbench_v2`

目标 schema：`mwb`

定位：第一版投放创建 Agent 的最小结构化真值层。它只保存路线、游戏、账户、触点引用、投放默认值、素材、物料包、Workflow job、节点、统一执行计划、草稿、回查和脱敏证据摘要。

## 字段规则

| 规则 | 要求 |
| --- | --- |
| 游戏标识 | 统一使用 `game_code` |
| 禁止字段 | 新库表结构不使用 `game_slug` |
| 路线产品字段 | `platform_routes` 使用 `marketing_product`，不使用 `product` |
| 平台长数字 ID | `advertiser_id`、`monitor_id`、`object_id` 等均为 `text` |
| 状态字段 | 状态类字段均为 `text` |
| 复杂摘要 | 使用 `jsonb` |
| 私密信息 | token、Cookie、raw payload、raw response 不入普通表；完整触点 URL、落地页 URL 和小游戏调起深链仅允许进入受控字段，不进普通 API、前端、日志或任务文件 |

## 最小表

| 表 | 用途 |
| --- | --- |
| `mwb.platform_routes` | 路线、平台、营销产品、对象类型、写入策略 |
| `mwb.games` | 游戏主档、产品名、品类、品牌名和产品身份摘要；不保存平台 appid |
| `mwb.advertiser_accounts` | 广告账户、授权状态、平台状态、监测序号、账户直存抖音号授权关系 |
| `mwb.account_touchpoints` | 触点 ref、URL hash、状态；`touchpoint_url` 仅作本地受控存储和 hash 校验，不作为普通 API/前端展示字段 |
| `mwb.monitor_provision_runs` | 乾坤技术侧监测序号初始化运行记录；以 `cycle_id` 表达 provision 下的创建周期，只保存账户、owner、固定参数摘要、monitor_id、hash、状态和脱敏错误，不保存 token、header、raw request/response 或完整触点 URL |
| `mwb.monitor_provision_attempts` | 乾坤监测序号真实创建调用审计；按 `cycle_id` 约束每个 cycle 最多 2 行，只存 job/plan 关联、幂等键、hash、状态、受控错误摘要和证据引用 |
| `mwb.v_monitor_provision_status_report` | 乾坤监测序号初始化状态报表 view；暴露 owner、monitor_id、触点 hash/状态、attempt 计数和最近错误，不暴露完整 URL 或敏感凭据 |
| `mwb.v_monitor_provision_blocker_report` | 乾坤监测序号初始化 blocker 明细 view；一行一个 blocker，关联最近 attempt，便于排查下一 gate |
| `mwb.v_advertiser_aweme_authorization_readiness` | 账户抖音号授权关系 readiness view；一行一个账户，只输出默认 ID hash、核验状态、ready、blocker、证据和下一动作 |
| `mwb.game_route_defaults` | 游戏 x 路线默认优化、预算、定向、排期、DMP 摘要和 `aweme_id` 保底字段策略 |
| `mwb.game_assets` | 游戏素材、产品身份、方向包引用 |
| `mwb.game_platform_apps` | 游戏在不同平台/形态下的 appid 唯一读取入口 |
| `mwb.game_route_launch_links` | 游戏 x 路线小游戏调起深链；完整 `sslocal` 仅允许进入受控列，普通摘要只输出 ref/hash/status/存在性 |
| `mwb.account_resources` | 账户级头像、DMP、事件、视频、产品图、品牌、小程序可用性；`metadata.readonly_check` 保存脱敏只读校验摘要 |
| `mwb.landing_page_assets` | 游戏 x 路线备用网页落地页资产；完整 URL 仅允许进入受控列，普通摘要只输出 site/hash/status |
| `mwb.material_packs` | 保底物料包 |
| `mwb.material_pack_items` | 保底物料包明细 |
| `mwb.launch_jobs` | 一次投放创建任务 |
| `mwb.launch_node_runs` | 7 个 Workflow 节点状态、脱敏 `output_summary` 和证据引用 |
| `mwb.launch_skill_runs` | 细粒度 Skill 运行记录；保存节点归属、attempt、execution_cycle、blocker_codes、error_code、module_ref、脱敏摘要和证据引用 |
| `mwb.launch_drafts` | 创建草稿摘要和稳定 hash |
| `mwb.project_name_reservations` | 数据库级项目名占用；`runtime_truth` 持久占用，`test_run` 独立并随测试清理 |
| `mwb.launch_execution_plans` | 统一执行计划；保存 job/draft/payload hash、plan_hash、planned_actions、blocker_codes 和必要 ID，不保存 raw request/response |
| `mwb.launch_confirmations` | 单次真实写入前的确认记录：确认哪个 plan/draft/hash、确认变量和状态 |
| `mwb.platform_actions` | 平台动作审计记录：plan_id、幂等键、endpoint、次数、状态、request/response hash、内部 request ID，以及受控 `error_category`/白名单 `offending_field_path`；不保存 raw payload、raw response 或平台 message |
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
| `db/015_add_project_name_reservations.sql` | 新增项目名 reservation、回填历史草稿，并由唯一约束保护并发序号 |
| `db/016_add_landing_page_assets.sql` | 新增备用落地页资产表、目标账户资源占位与受控 URL/hash 约束 |
| `db/017_harden_platform_action_diagnostics.sql` | 收敛平台错误为受控类别/字段路径，并写入 OE3 官方字段证据矩阵 |
| `db/018_reconcile_oe3_instance_id_create_evidence.sql` | 记录 `instance_id` 创建字段证据与 19 位 JSON number 传输阻断；`micro_app_instance_id` 仅作优化目标查询字段 |
| `db/019_landing_page_inventory_readonly_states.sql` | 补齐物料户落地页库存只读盘点状态枚举、四个历史候选和目标账户逐页资源记录 |
| `db/020_add_monitor_provision_runs.sql` | 新增 `monitor_provision_runs`，记录乾坤监测序号 provision 的脱敏状态、固定参数指纹、唯一运行约束和触点 URL hash |
| `db/021_monitor_provision_defaults_reports.sql` | 补齐 JSZC 监测序号固定参数、单次创建审计字段和两个脱敏 PostgreSQL 报表 view |
| `db/022_monitor_provision_attempts_and_ensure.sql` | 新增 `monitor_provision_attempts`、放宽同一 provision 总尝试数为 2、回填第一次服务器繁忙失败，并更新报表 view |
| `db/027_add_launch_execution_plans.sql` | 新增统一执行计划表、plan_id 关联、platform action 幂等键，以及 Skill 定位字段 |
| `db/028_add_monitor_attempt_idempotency.sql` | 新增 monitor provision attempt 的 planned-action 幂等键 |
| `db/029_monitor_provision_cycles.sql` | 将 monitor provision 从单行生命周期升级为 provision 下多 cycle；历史数据迁移为 Cycle 01，attempt 唯一约束改为 `(cycle_id, attempt_no)`，并新增显式 reissue 字段 |
| `db/038_add_game_route_launch_links.sql` | 新增游戏 x 路线小游戏调起深链受控表；普通摘要不暴露完整 `sslocal` |
| `db/041_add_aweme_authorization_direct_storage.sql` | 新增 `aweme_id` 游戏保底策略、账户直存授权关系 JSONB 和账户 readiness view；不新增身份主表或 `account_resources` 类型 |
| `db/042_add_jszc_fixed_default_aweme_policy.sql` | 将 JSZC 的 `oceanengine_3_byte_mini_game` 路线切换为固定默认 `aweme_id=57018827026` 的账户只读核验策略，并扩展同一个 readiness view |
| `db/043_aweme_auto_single_mechanism.sql` | 将当前 `aweme_id` 契约收敛为唯一固定游戏默认值机制，清理账户候选/选择字段并重建只读 readiness view |

## 读取约定

| 场景 | 读取入口 |
| --- | --- |
| 游戏主档 | `mwb.games` |
| 平台 appid | `mwb.game_platform_apps`，按 `game_code + platform + app_type` 查询 |
| 小游戏调起深链 | `mwb.game_route_launch_links`，按 `route_id + game_code` 唯一读取；最终 payload 前再校验 `platform_app_id + app_id + hash + sslocal://microgame` |
| 游戏级素材 | `mwb.game_assets` |
| 账户级资源可用性 | `mwb.account_resources` |
| 备用网页落地页库存 | `mwb.landing_page_assets`，目标账户可见性继续看 `mwb.account_resources.resource_type='backup_landing_page'` |
| 监测序号初始化状态 | `mwb.monitor_provision_runs` 的 `cycle_id/cycle_no/cycle_status` 周期真值 + `mwb.monitor_provision_attempts` 每次真实调用审计；固定参数从 `mwb.game_route_defaults.raw_defaults.monitor_provision` 读取 |
| 监测序号初始化报表 | `mwb.v_monitor_provision_status_report` 和 `mwb.v_monitor_provision_blocker_report` |
| 统一执行计划 | `mwb.launch_execution_plans` 按 `job_id + plan_version` 读取；`plan_hash` 由 job、draft、planned_actions 和 blocker_codes 的脱敏稳定输入生成 |
| `aweme_id` 默认策略 | `mwb.game_route_defaults.raw_defaults.aweme_id_baseline`；保存 `default_aweme_id` 字符串、hash、适用条件、官方来源、核验策略、合同版本和规则 hash，不表示任一账户已授权 |
| 账户抖音号授权关系 | `mwb.advertiser_accounts.aweme_authorization`，只保存目标账户对游戏默认抖音号的只读核验结果、默认 ID hash、job 范围、核验时间、response hash、证据引用、blocker 和下一动作；不保存候选列表或已选 ID |
| 账户抖音号 readiness 报表 | `mwb.v_advertiser_aweme_authorization_readiness` 仅供工作台和排查读取；输出 `required/configured/verification_status/ready/blocker_code/next_action/default_aweme_id_hash/verified_at/expires_at/evidence_ref`，不作为新的运行真值 |
| Node 2 monitor planned action | `planned_actions` mock 模式调度 `monitor-query/monitor-plan/monitor-ensure/monitor-readback`；`monitor:plan` 做真实只读 preflight，`monitor:reissue-plan` 只允许 stopped/failed cycle 显式开新周期；真实乾坤写入仍需另行单次授权 |
| Node 3/4 resource readiness | `planned_actions` mock 模式可调度 Node 3 备用落地页 readiness、Node 4 抖音号授权关系只读核验与八项资源 verify；`prepare_capability` 写入 `launch_skill_runs.output_summary` |
| 资源动作能力注册表 | `src/workflows/skills/oe3/04-resource-action-registry.mjs` 是唯一来源；未登记 `prepare_supported=true` 的资源不生成 `ensure_resource:*`，只写 `resource_prepare_unsupported:<resource_type>` |
| plan 外动作拦截 | 单次真实写入 guardrail 可绑定 `target_plan_id`、`target_plan_hash` 和 `allowed_plan_actions`；未出现在 plan 中的动作不得进入 grant |
| Skill 卡点定位 | `mwb.launch_skill_runs.execution_cycle/blocker_codes/error_code/module_ref` |
| 旧资料引用 | 只允许 `source_usage = 'reference_only'`，不得作为运行时真值 |
