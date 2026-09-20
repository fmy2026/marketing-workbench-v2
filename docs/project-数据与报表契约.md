# marketing-workbench-v2｜当前数据与报表契约

| 元信息 | 值 |
| --- | --- |
| 文档状态 | 当前有效；唯一数据库说明文档，含数据契约与数据库运维 |
| 最后更新时间 | 2026-09-13 CST |
| 校验基线 | 静态核验 Task `TASK-MWBV2-WORKBENCH-PROGRESS-EXECUTION-OBSERVABILITY-20260913`；Postgres 39 张基础表、7 个 View、`workflow_case_summary` 24 列；`db/*.sql` 编号至 `091`，最新为 `091_workbench_progress_execution_observability.sql` |
| 适用范围 | v2 数据结构、字段约定、来源、读写责任、报表口径，以及数据库连接、迁移与备份 |
| 权威来源 | `db/*.sql`、Postgres `mwb`、`src/repositories/postgresRepository.mjs`、节点合同与当前 Task/Manifest |
| 重新校验条件 | 表/列/约束/View、持久化来源、报表消费逻辑、数据库连接/迁移/备份脚本或定时配置变化时 |

> 更新时间只证明本文件最后一次静态校验时间；动态账户、Case、Job、Plan、资源与平台动作状态必须实时查询 Postgres。报表/View 只读，不是业务真值写入源。

本文集中维护当前数据库说明，其他当前文档只引用对应章节。SQL/Schema/代码仍承担实现职责，历史任务与 Git 记录只供追溯，不是另一份当前合同。

连接、字段与运维说明按当前 SQL、仓储及部署实现静态核对，不声明重新做过在线数据对账或备份/恢复演练。`db/*.sql` 是不可拆除的 Schema 演进历史，文件数不等于当前表数；精确基线见上表。`.archive/` 中的隔离内容不是数据库写入者、migration 或 runtime 依赖，不能据此改变下述 38 表、7 View 与 24 列合同。

## 1. 六层数据流

```text
L1 业务配置真值
  route / game / 默认值 / 素材 / 蓝图 / DMP / 启动链接
        ↓
L2 账户业务真值
  账户 / 触点 / 资源 / DMP 成员账户状态 / 乾坤关系
        ↓
L3 业务闭环
  workflow_cases
        ↓
L4 一次运行与过程证据
  Job / Node / Skill / Draft / 名称预留 / monitor / DMP push plan
        ↓
L5 授权、外部动作与回查证据
  Execution Plan / confirmation / action / object / readback / evidence
        ↓
L6 当前运营状态只读投影
workflow_case_summary + v_monitor_readiness + 专项 readiness / monitor View
```

## 2. 基础表契约（38 张）

| 层 | 表 | 行粒度 / 主关联 | 写入者 | 主要消费者 |
| --- | --- | --- | --- | --- |
| L0 用户（4） | `workbench_users`、`workbench_sessions`、`workbench_audit_events`、`workbench_agent_model_configs` | 用户、登录会话、脱敏登录/改密/用户管理/归属冲突审计，以及按 `user_id × agent_key` 唯一的模型配置元数据。配置只保存 `openai_compatible` 协议、模型名、无凭据 API Base、不可逆本地凭据引用、启用及测试状态；API Key 不入库，会话只存 token hash | migration、认证与模型配置 API | API 认证、账户访问控制、本人模型配置 |
| L1 配置（13） | `platform_routes`、`games`、`game_route_defaults`、`game_platform_apps` | 路线、游戏、路线×游戏、游戏×平台 App；JSZC 路线默认值含数值保底、CTA、性别/年龄、336 位时段及其 success-profile/ledger 摘要 | migration、种子、受控配置维护 | Node 01–03、Node 05 |
|  | `game_assets`、`material_packs`、`material_pack_items` | 游戏资产、路线物料包、物料包条目；当前必需视频集只取 `video_asset + required=true + status=active`，其 `source_asset_id` 集合必须与必需视频资源蓝图一致。视频数量由该集合决定，不由路线默认值中的固定数字决定 | 同上 | Node 03、Node 04–05 |
|  | `landing_page_assets`、`game_route_resource_blueprints` | 路线×游戏备用页、资源蓝图；只有 `required=true` 的蓝图可在 Node 04 原子物化为新账户候选，退役或非必需蓝图只保留配置/历史语义，不参与账户资源唯一键 | 同上 | Node 03–04 |
|  | `game_route_launch_links`、`game_route_micro_game_registration_profiles` | 路线×游戏受控启动链接、小游戏注册档案版本 | 同上 | Node 03、Node 05 |
|  | `dmp_package_sets`、`dmp_package_members` | 路线×游戏 DMP 集合、集合成员 | 同上 | Node 04–05 |
| L2 账户（5） | `advertiser_accounts`、`account_touchpoints` | route×game×advertiser 账户、唯一 `owner_user_id`、受控触点；新 Intake 在 Case/Job 前用当前用户 owner key 执行乾坤 `accountIndex` 精确只读预检，禁止跨 scope 覆盖和自动转移。`qiankun_agent_id`、`qiankun_account_record_id`、`qiankun_owner_key` 是 Monitor 的账户身份唯一投影；它们只由同一账户的 fresh `accountIndex` 写入，路线默认值不得保存代理或账户记录。`auth_status` 写入时“授权正常”“已授权”“ready”“active”统一为 `ready`，其他值保持原样 fail-closed。`platform_status` 是原始诊断值，不决定引导视频分支。`guide_video_required` 默认 false，表示可自动探测；true 仅保留为强制要求，空 probe 不得降级。`video_cover_required` 是独立、默认 false 的显式封面开关 | 账户维护、Case 入口账户只读预检、monitor readonly reconcile、已授权 monitor 流程 | 访问控制、Node 02、Node 04–05、专项 View |
|  | `account_resources`、`dmp_package_member_account_states` | 账户资源、DMP 成员×账户状态；Node 04 在 `event-chain-readonly` 前只用当前账户、App 与唯一受控实例候选同步动态账户绑定、模板引用/hash；前提不完整时不落合同。JSZC fresh Job 的 `gameplay/list` 结果仅保存为唯一 `micro_app_instance.metadata.guide_video_readiness`：是否 required、候选数、ID 是否存在、response hash、evidence ref、Job/实例绑定与时间；不保存原始响应。品牌只保存目标账户 fresh 回查：非空唯一完整匹配保存完整品牌/行业；接口成功且实际列表为空时，`brand_info_official` 保存 `source=live_target_account_empty_brand_list`、当前 Job、`brand_list_count=0`、响应 hash、查询时间和证据引用，资源用 `not_required/not_required` 表达整组省略。查询失败、歧义、非空未匹配或行业不完整均阻断。当前必需视频集的每条 ID 只可来自其物料户资源 `metadata.oceanengine_video_mapping.status=verified` 的实际 ID，并按 `source_asset_id` 唯一关联目标账户视频资源；显式封面只能来自该 target 行的 current-Job visible/readback 证据，默认封面必须显式记录为允许省略。追加 Plan 不复制资源行：只在既有 Plan metadata 中冻结待追加条目的视频、适用封面和当前 Job 引导视频合同摘要/hash；歧义、未验证、封面或引导视频证据缺失均阻断，且不保存原始请求或响应。 | Node 04 readonly / 已确认资源回查 | Node 04–05、Case summary |
|  | `qiankun_option_relations` | 乾坤父子选项关系 | 只读同步 | Node 02 诊断 |
| L3 Case（1） | `workflow_cases` | 一个 route×game×advertiser 的持续闭环，`case_id`；保存 `owner_user_id`、`created_by_user_id` 与 `maximum_create_attempts`（普通 Case 默认 3，获批替代 Case 固定 1）；同一 scope 最多一个 active `runtime_truth` Case。建档只消费已校验 `LaunchRequest v1` 的 route、game、账户字段，不保存原始自然语言、原始 JSON 或页面草稿 | Case / Job 入口、受控替代事务 | Case summary、UI、API、CLI |
| L4 运行（8） | `launch_jobs`、`launch_node_runs`、`launch_skill_runs` | Case 下单次运行、Job×Node、Job×Skill×attempt | runner / Skill runner | Job View、Case summary、诊断 |
|  | `launch_drafts`、`project_name_reservations` | Job Draft、Job×名称预留 | Node 05 | Create Plan、查重、创建执行 |
|  | `dmp_package_push_plans` | Job×DMP 成员推送计划 | Node 04 | 已确认资源执行 |
|  | `monitor_provision_runs`、`monitor_provision_attempts` | monitor provision cycle、cycle×attempt | Node 02 monitor 子链 | monitor 专项 View、诊断 |
| L5 审计（7） | `launch_execution_plans`、`launch_confirmations` | Job×Plan 版本、Plan-bound confirmation；confirmation ID 从 `plan_id` 派生，并保存真实 `confirmed_by_user_id`。claim 在同一事务核验 Plan/hash、latest Job、Case 生命周期和 owner；同一 Job 已确认 `std_project_create` 后不得再发布 Plan。`plan_version` 在同一 Job 的 monitor/resource/create Plan 间单调递增并在同轮普通编译中稳定复用，`create_attempt_no` 独立计数。`plan_kind` 仅为 monitor bootstrap / resource / project / blocked；首次工作台 dry-run 的 monitor readonly合同可直接编译唯一 ready `monitor_bootstrap` Plan，但不产生 confirmation/action/attempt。任一已记录平台 action 的 ready Plan 必须离开 `ready`。Create 成功链固定为 `ready → waiting_readback → consumed`；明确失败与回查未确认的结果均为 `consumed` + 脱敏 outcome metadata，不代表执行成功 | Plan 编译、显式确认、终态收口与 Create 回查 | 执行 scope、Case summary |
|  | `platform_actions`、`platform_action_deliveries`、`created_objects` | 外部逻辑 action×Attempt、其最多三条物理 delivery、创建对象；delivery 仅适用于新冻结的精确 `std_project/create` 或 `oc_project/material/create` 的 `HTTP 200 + 40100` 有界重投，保存序号、计划/实际时间、HTTP/API code、hash、request ID/对象 ID 存在性和安全分类，不保存原始请求/响应或平台消息 | executor / create result mapping | Node 06–07、Case summary |
|  | `readback_records`、`evidence_artifacts` | Job×回查观察、脱敏证据；每次 Node 7 `readback_only` 生成独立 readback/evidence ID，历史观察不覆盖，消费者按 `created_at` 选择最新记录。追加即时观察与后续只读观察均在同一收口事务同时写入 observation/evidence、节点 05–07、Job 与 Case；摘要只保存数量、查询状态和受控 blocker，不保存视频 ID 或原始响应 | Node 04/07 与各 executor | Case summary、审计与诊断 |

### 核心关联

```text
route_id + game_code
  ├─ L1 默认值 / 素材 / 蓝图 / DMP / 启动链接
  └─ + advertiser_id → L2 账户、触点、资源
                         ↓
                    workflow_cases.case_id
                         ↓
                    launch_jobs.job_id
                         ↓
  node / skill / draft / plan / confirmation / action / object / readback / evidence
```

- `workflow_cases` 是业务闭环总控；`runtime_truth` Job 必须显式绑定 `case_id`。
- `source_usage` 用于区分真实运行、测试和种子来源；`test_run` 必须由 smoke/CLI 清理，不能作为业务报表事实。

### 字段与存储约定

| 主题 | 当前约定 |
| --- | --- |
| 游戏与路线命名 | 游戏标识统一为 `game_code`，新表不用 `game_slug`；`platform_routes` 的营销产品字段为 `marketing_product`，不是 `product` |
| 平台长数字 ID | `advertiser_id`、`monitor_id`、`object_id` 等列使用 `text`；JSON 和代码按字符串保存、比较，不经 JavaScript Number 截断 |
| 状态与摘要 | 现有状态列使用 `text`，合法值按各表当前 CHECK/代码合同核对，不能任意新增状态；结构化摘要使用 `jsonb`，只保存脱敏状态、hash、必要 ID 和证据引用 |
| 平台 App | 唯一来源为 `game_platform_apps`，按 `game_code + platform + app_type` 查询；`games` 仅保存游戏主档，不保存平台 appid |

命名和类型依据 [初始结构](../db/002_create_mwb_minimal_truth.sql)、[App 唯一约束](../db/004_refine_minimal_truth.sql) 与 [游戏 App 字段清理](../db/010_runtime_consistency_cleanup.sql)；当前完整约束需结合后续 migration，不复制整份旧字段清单。

### 配置与资源来源

| 内容 | 唯一来源与读取边界 |
| --- | --- |
| 路线默认值与创建字段合同 | `game_route_defaults.raw_defaults`；`payload_defaults` 保存静态发送参数，`official_create_field_contract.field_rules / nested_rules` 保存顶层/嵌套规则，Node 05 与 preflight 共用。`duplicate_semantic_contract` 保存未删除语义查重的字段集合与状态过滤。JSZC 静态基线为保留“立即试玩”再追加 4 项 CTA、预算/出价/ROI `66666/366/0.16`、男性与五档年龄、336 位半小时排期，以及评论管理启用 `is_comment_disable=ON`；这些是 migration `069`、`078` 的配置基线，不代替当前查询或授权 |
| 游戏素材与账户资源 | 标题由 `game_assets.asset_type=title_material` 经物料包关联；当前必需视频集由物料包 active required video 条目决定，其 `game_assets.metadata.qiankun_origin_resource_id` 保存静态乾坤来源码，且集合须与必需视频蓝图的 `source_asset_id` 相同。`getLaunchJobBundle()` 仅按当前 Job 的 `route_id`、`game_code` 及 `game_route_defaults.raw_defaults.material_source_account.advertiser_id` 装载物料户的 `video_asset` 资源；不会把目标账户视频资源或历史资产字段作为回退。物料户 `account_resources.metadata.qiankun_preheat` 保存预热记录和乾坤 `m_id` 审计，`metadata.oceanengine_video_mapping` 保存物料户 `file/video/get` 全页中唯一完整 `filename` 来源码匹配到的 OceanEngine 返回项 `id`。只有 `mapping.status=verified` 时才可作为实际 OceanEngine 视频 ID；旧 `asset.metadata.video_id`、零/多匹配都不得回退使用并阻断。目标户可见性仍保存在目标账户行。商品身份来自 `games`，卖点来自路线默认值，产品图及其他动态资源来自目标账户已核验记录。账户资源、DMP 成员状态、实例、引导视频和触点不复制进路线默认值 |
| 固定抖音号与授权 | 默认号从 `game_route_defaults.raw_defaults.aweme_id_baseline.default_aweme_id` 读取；基线保存默认号、hash、适用条件和规则依据，不表示账户已授权。`advertiser_accounts.aweme_authorization` 只保存当前默认号的脱敏只读核验快照，包括 scope、default hash、Job、时间、response hash、证据和 blocker，不保存候选列表或已选 ID。专项 readiness View 投影最近快照；平台变化须重新运行 Node 04 才会更新 |
| 启动链接与备用页 | `game_route_launch_links` 按 route×game 读取受控深链；平台 App 关联、hash 与协议在 payload 前校验。`landing_page_assets` 保存备用页库存，目标账户可见性读取 `account_resources` 的 `backup_landing_page`；完整 URL 只进入受控字段，普通摘要仅输出 ref/hash/status/存在性 |
| 资源核验与审计 | `account_resources` 的已核验事件资产、小游戏实例、备用页以 `visibility_status=visible` 与 `readback_status=readback_verified` 表达，写入者见本节表契约；显式省略仅可用成对的 `not_required/not_required` 加有效只读证据表达，并仍须通过资源类型的合同校验。事件资产创建响应包含资产 ID 时，执行器仅在 `0 / 1 / 3 / 5` 秒受限窗口按该 ID、目标 App 与实例做只读确认；不重复创建，ID 缺失、不匹配或窗口耗尽均记录脱敏结果并保持 Plan 已消费。Node 04 同一轮基线 readonly 的头像、品牌和产品图通过同 scope 的单条原子更新保存，任一 CHECK 失败则不允许部分资源落库。游戏维度品牌候选只保留为已消费历史 Plan 的解释，不能用于新 Draft。`brandInfoMode` 仅在目标账户 API 成功且实际 `brandListCount=0` 时允许整个省略 `brand_info`；它不保存空对象或部分字段，且非空未匹配、多匹配、行业不完整、失败或不明一律阻断。DMP 目标状态按集合成员×目标账户保存。Skill 和平台动作只保存受控证据摘要，外部动作审计包括 endpoint path、method、HTTP/API code、request ID 存在性、hash 与脱敏 metadata，不保存 raw request/response |

来源依据 [固定抖音号合同](../db/043_aweme_auto_single_mechanism.sql)、[创建嵌套字段合同](../db/048_jszc_nested_create_field_contract.sql)、[路线参数修正](../db/069_jszc_fallback_parameters_incremental.sql)、[引导视频合同](../db/074_account_guide_video_contract.sql)、[仅引导视频能力校正](../db/077_account_guide_only_correction.sql)、[语义查重与评论管理默认值](../db/078_semantic_duplicate_comment_defaults.sql) 与当前仓储实现。这里只解释数据来源，Node/Gate 行为仍查逻辑图。

## 3. 只读 View 与报表边界（7 个）

| View | 行粒度 | 输入 | 核心输出 | 消费者 | 禁止 |
| --- | --- | --- | --- | --- | --- |
| `workflow_case_summary` | 一个 `workflow_case` 的当前状态 | Case、最新 Job/Node/Skill、账户资源/触点、Plan/confirmation/action/object/readback | 当前 Gate、唯一 root blocker、建议动作、节点/资源摘要、动作回查状态 | UI、API、CLI、任务卡、Gate Action Policy | 写回 Case/Job/资源；自行推导 next gate |
| `v_monitor_readiness` | route×game×advertiser | 最新 monitor cycle、受控触点、脱敏 readonly evidence | `monitor_ready`、readiness status、唯一 actionable blocker、诊断集合和建议动作 | Node 02、Plan、Case summary、API/UI | 直接创建 monitor、把历史诊断当作当前 blocker |
| `v_monitor_provision_status_report` | 一个 monitor provision cycle | monitor run/attempt、账户、触点、路线默认值 | cycle、attempt、账户/触点、脱敏回查与错误摘要 | Node 02、人工诊断 | 创建 monitor、写回触点或运行状态 |
| `v_monitor_provision_blocker_report` | 当前 scope 的一个 actionable blocker | canonical monitor readiness + cycle 状态报表 | blocker、最新 attempt 状态与错误分类 | Node 02 分流、人工排障 | 触发 retry 或写入 |
| `v_advertiser_aweme_authorization_readiness` | 一个 route×game×advertiser 授权就绪状态 | advertiser account 的脱敏抖音授权关系 | ready、blocker、next action、脱敏探测证据 | Node 04、Node 05 | 替代 fresh readonly 或修改授权 |
| `v_user_workflow_case_detail` | 一个 `runtime_truth` Case | Case、账户、唯一 summary、owner 用户 | 账户、最新 Job、Gate、root blocker、创建/回查状态；多个 Job 不重复计数 | 数据统计明细：普通用户固定本人，管理员显式选“全部用户”才读取全量 | 写回流程事实、统计 `test_run` |
| `v_user_workflow_summary` | 一个工作台用户 | 账户与 Case 明细 | 账户数、Case 数、verified 成功数、进行中、阻断和终态未成功数 | 数据统计汇总：默认本人，管理员可选全量只读范围 | 把平台受理当成功、授予代操作权限 |

## 4. `workflow_case_summary` 合同

该 View 的 24 列按以下消费分组；它只投影当前状态，不保存完整历史，也不反向写入。

| 输出组 | 字段 | 含义 |
| --- | --- | --- |
| Case 身份（10） | `case_id`、`case_key`、`route_id`、`game_code`、`advertiser_id`、`business_goal`、`lifecycle_status`、`source_usage`、`created_at`、`updated_at` | 当前业务闭环与范围 |
| 最新运行（5） | `latest_job_id`、`latest_job_status`、`latest_current_node`、`latest_job_updated_at`、`latest_plan_status` | Case 下最新 Job 与 Plan 状态 |
| 当前动作（3） | `blocker_codes`、`current_gate`、`suggested_next_action` | 对外唯一可行动结论 |
| 摘要与取证（6） | `latest_node_states`、`resource_readiness`、`monitor_resolved`、`action_readback_state`、`structural_blocker_codes`、`root_blocker_codes` | 诊断摘要与 blocker 取证边界 |

`root_blocker_codes` 是零或一个可行动 blocker；`structural_blocker_codes` 是完整结构性诊断集合。两者均不构成授权。已确认的 `monitor_bootstrap` Plan 在平台写入前失败时，summary 优先投影其 `confirmed_execution_blocker`，不得被通用 `monitor_plan_required` 覆盖。已确认的 `std_project_create` Plan 若在任何 create action 前以 `blocked_before_create` 停止，也优先投影具体 blocker；存储的是通用 readiness 包装原因时，View 从同一最新 Job 的 blocked Skill 中选择具体原因。migration `090` 将该 Job 后发且未确认的 Plan 标为 `stale`，并使 View 优先选择已确认的零动作停止 Plan，禁止新 Plan 遮盖 recovery Gate。它仅在无 create action、无对象且次数未耗尽时给出 `create_fresh_readonly_recovery`，恢复仍由既有 Case 锁和 Plan/confirmation 合同约束。字段来源与过滤由 SQL View 定义，Gate 优先级和消费行为统一查 [当前逻辑图 §5](project-现在的逻辑图.md#5-当前-case-gate-与工作台)，本文件不再维护第二张 Gate 规则表。

## 5. 核心键、时间与去重

以下是数据约束说明，不另建业务状态。完整约束由现有 migrations 和运行库定义；变更时先核对实际 Schema，不能据文档猜测数据库已有唯一约束。

| 对象 | 主键 / 业务去重边界 | 时间与历史语义 |
| --- | --- | --- |
| 路线 / 游戏 / 默认值 / 平台 App | `route_id` / `game_code`；默认值主键 `id` 且唯一 route×game；App 主键 `id` 且唯一 game×platform×app_type | `created_at` 是建档时间，`updated_at` 是本地记录更新时间；不等于平台核验时间 |
| 账户 | `advertiser_id` 主键，保留 route/game 与唯一 owner；不能为同一 ID 跨 scope 新造第二份账户真值 | `updated_at` 不代表所有资源重新核验，归属变更只能走受控入口 |
| 触点 / 账户资源 | `touchpoint_id` / `resource_id` 主键；平台 ID、ref 与 hash 不代替本地主键；不假定同一资源类型只能一行 | readiness 使用当前 scope 的记录和核验证据；有多个候选必须按合同判定，不任意取首条 |
| Case | `case_id` 主键、`case_key` 唯一；部分唯一索引约束同 route×game×advertiser 最多一个 active runtime Case | Case 可包含多个 Job；`updated_at` 是本地生命周期/元数据变化，不是每个子事件的时间 |
| Job / Node / Skill / execution cycle | `job_id` / `node_run_id` / `skill_run_id` / `cycle_id`；Node 唯一 job×node_key，Skill 唯一 job×execution_cycle×skill_key×attempt_no，cycle 唯一 job×cycle_no | cycle 从真实开始到结束独立记录；Skill 关联单一 cycle。轮次间人工等待不并入 Skill 耗时，运行中的 cycle 不写结束时间；没有 cycle 的历史 Skill 保留原记录，仅按历史聚合口径展示 |
| Draft / 名称预留 | `draft_id` / `reservation_id`；名称预留有 job 唯一及 scope×序号、scope×名称约束 | fresh Job 不继承旧确认；runtime 名称占用保留，测试占用单独清理 |
| Plan / confirmation | `plan_id` / `confirmation_id`；Plan 唯一 job×plan_version，confirmation ID 由 Plan ID 派生并按 Plan 单次占有 | Plan 版本不等于创建次数；immutable Plan/hash 绑定最终 Draft，确认 claim 同时校验 owner/latest Job/Case 生命周期，授权消费留在数据库审计 |
| Action / delivery / 创建对象 | `action_id` / `(action_id, delivery_no)` / `created_object_id`；action 使用独立幂等键及 job×action_type×attempt_no 约束；delivery 序号限定 1–3；对象唯一 job×object_type×object_id | Case 创建次数跨同 source_usage 的 Job 聚合且只按逻辑 action 计数；追加 action 的键包含冻结 Plan ID 与素材集合，故同 Plan 防重、fresh Plan 不会与旧 action 冲突；`40100` 的物理 delivery 不增加 Attempt。外部调用时间与本地记录时间分开，不能用 fresh Job 重置历史次数 |
| Readback / evidence | `readback_id` / `artifact_id`；一条证据对应一次观察，不按对象 ID 覆盖所有历史观察 | `created_at` 是记录时间，核验状态/来源/摘要关联具体 Job；平台事实是否新鲜由相应 readonly 合同判断 |
| Monitor cycle / attempt | cycle 主键 `cycle_id`，同 provision×cycle_no 唯一；attempt 主键 `attempt_id` 且唯一 cycle×attempt_no | 报表按 cycle 聚合调用；当前 readiness 只取当前 scope 最新 cycle 和触点，不把历史失败重复加为当前 blocker |
| 用户 / 会话 / 用户审计 | `user_id` / `session_id` / `audit_event_id`；登录名与 owner key 大小写归一后唯一，会话 token hash 唯一 | 会话到期/撤销与用户变更审计独立；报表读取权限不能推导为账户操作权限 |
| Agent 模型配置 | `(user_id, agent_key)`；协议固定 `openai_compatible`，启用记录只能对应测试通过状态 | 更新 API Base、模型或本地 Key 后清除测试时间并停止启用；本地 Key 的唯一事实为 gitignored `0600` 凭据库，数据库只保存不可用来换取 Key 的引用 |

SQL `timestamptz` 表示绝对时间；`started_at / finished_at` 可空，空值表示尚无对应执行时间，不能填成成功或零耗时。当前 View 是查询时的运营投影，没有按日分桶、币种换算或归因窗口。导出及对账须注明查询时刻与显示时区，禁止把文档更新时间当成数据截至时间。

`launch_execution_cycles` 只保存 Job、运行 mode、可选冻结 Plan、开始/结束、结果分类和脱敏摘要；删除测试 Job 时级联删除 cycle，删除 Plan 时只清空其可选关联。Job API 的 `executionTiming` 只读取 cycle 与 Skill 时间，用于定位每轮和每个 Skill 的耗时，不能把嵌套时长相加或把它作为 Gate、授权或平台写入依据。

## 6. View 去重与人员指标口径

| View | 唯一行标识 / 选取方式 | 来源与时间边界 |
| --- | --- | --- |
| `workflow_case_summary` | `case_id`；最新 Job 按 updated_at、created_at、job_id 倒序；普通 Plan 按版本倒序，但已确认、零动作 `blocked_before_create` Plan 优先；动作/回查按 Case 合同聚合 | Case 当前投影；过程记录按 Job/Skill/Attempt 回溯；不把多 Job 统计成多 Case |
| `v_monitor_readiness` | route×game×advertiser；cycle 按 cycle_no、updated_at、cycle_id 倒序，触点按 updated_at、touchpoint_id 倒序 | 当前 scope 就绪投影；来源记录时间保留，不能替代 fresh 平台回查 |
| `v_monitor_provision_status_report` | `cycle_id`，attempt 先按 cycle 聚合再关联 | 每个 cycle 的运行审计；历史 cycle 不等于当前 Gate |
| `v_monitor_provision_blocker_report` | 每个 scope 最多一个 actionable blocker；来自当前 readiness，关联其 cycle | 有 blocker 才有行；不是全部历史错误的明细表 |
| `v_advertiser_aweme_authorization_readiness` | 账户 advertiser_id，关联 route×game 默认合同 | 返回 verified_at/expires_at 与 evidence_ref；过期规则按 View/readonly 合同判定 |
| `v_user_workflow_case_detail` | `case_id`；仅 summary.source_usage=`runtime_truth` | 账户与 owner 关联后的 Case 明细，保留 Case 和最新 Job 的更新时间 |
| `v_user_workflow_summary` | `user_id`；从所有工作台用户 LEFT JOIN 账户与 Case 聚合 | 无记录计数为 0；不是互斥状态分类，不能把各计数直接相加 |

人员汇总指标只在 migration `072` 的 View 定义，消费者不得另算：

| 字段 | 精确口径 |
| --- | --- |
| `advertiser_count` | `advertiser_accounts` 中 owner_user_id 非空、按 owner 分组的账户行数；该子查询没有 source_usage 过滤 |
| `case_count` | 用户所属 `v_user_workflow_case_detail` 行数，即 runtime Case 数 |
| `verified_success_count` | Case detail 的 create_verified=true；该标志直接来自 summary 的完成 Gate，不按 HTTP 200 计成功 |
| `active_case_count` | lifecycle_status=`active` 的 Case 数 |
| `blocked_case_count` | root_blocker_codes 非空的 Case 数；可与 active_case_count 重叠 |
| `terminal_unsuccessful_count` | create_verified=false 且 lifecycle_status 非 active 的 Case 数；仍 active 的人工复盘 Case 不纳入此项 |

配置修正、迟到回查或 fresh Job 更新后，当前 View 下次读取会重新投影；历史 Job/证据保持可追溯。这些报表用于流程运营，不提供投放消耗/收入/ROI 指标，也不是冻结的历史日结快照。新增历史统计须另行批准时间、去重和修正规则。

## 7. 变更与安全边界

| 主题 | 合同 |
| --- | --- |
| 数据写入责任 | 仅本文件表契约列明的受控配置维护、runner、Skill、确认 executor 与回查写入对应表；报表/View 不反向更新业务真值 |
| 数据变更任务 | 新增/变更表、列、View 或报表时，同一 Task 登记粒度、主键/自然键、时间语义、来源、写入者、消费者、去重、修正与质量检查；更新本文件相关行并关联 migration 和回归证据 |
| 模型与投影权威 | SQL/数据库约束定义数据结构，注册表定义 Node，summary 定义当前 Gate；[逻辑图](project-现在的逻辑图.md) 解释流程，不另建可写状态副本 |
| 元数据边界 | 账户级资源合同、核验时间、Plan/Draft hash、来源和必要关联 ID 保存到既有受控字段；当前目标账户品牌空列表合同只存于 `account_resources.metadata.brand_info_official` 与 `readonly_check`，记录 fresh Job、实际列表数量、响应 hash、查询时间和证据引用，不新增列或生命周期枚举。历史验证可在 Case/资源 metadata 的只读 `brand_empty_omit_validation` 保存，但不得被运行时读取为授权；不得把账户动态资源 ID 或历史 Plan 复制进游戏默认配置 |
| 授权与回查 | 平台授权、安全规则与任务闭环只查 [AGENTS](../AGENTS.md)；Plan 状态变化、资源动作、HTTP deadline 和 Case finalizer 行为只查 [逻辑图](project-现在的逻辑图.md) |
| 敏感信息 | 普通 JSON/日志仅保存脱敏摘要、hash、状态、必要 ID 与证据引用；触点、落地页和启动深链仅用既有受控存储，禁止复制到报表、前端或 Task。模型 API Key 仅在 `.local/workbench-llm-credentials.json` 的 `0600` 本地原子凭据库中出现；模型 API Base 仅在本人配置表中保存且禁止含用户名、密码、query 或 fragment，audit/API/前端均不回显 Key |
| 历史与测试 | `test_run` 与 runtime 真值分离并由测试清理；旧 migration 不删除，旧 Task/Manifest 不补造验收，隔离脚本不是新的表/View 写入来源 |
| 完成证明 | 开发任务由 Manifest 验收关闭；真实创建成功必须有 Postgres 权威回查证据；两者不得互相替代 |

投放效果原始接入、标准投放事实表，以及按日期×游戏×渠道×账户×广告对象汇总的消耗、曝光、点击、转化、收入、ROI 报表目前均未建立。当前 7 个 View 提供运营就绪状态和人员流程统计。

## 8. 数据库运维

### 项目视频追加请求承载

migration `092_project_video_append.sql` 为 `mwb.workflow_cases` 增加 `operation`、`target_project_id` 与 `origin_resource_ids`。它们保存已规范化事项、目标项目文本 ID 和 JSON 字符串数组；不保存自然语言、原始 JSON、模型输出、token 或平台原始响应。`operation` 仅允许 `create_std_project` 或 `append_project_videos`。

`mwb.launch_execution_plans.plan_kind` 增加 `project_video_append`，用于冻结目标项目、待新增视频摘要、只读快照 hash、单一追加 action 及一次确认范围。

追加 action 的恢复额度按同一 `workflow_cases.maximum_create_attempts`（默认 3）跨同一 `source_usage` 的 Job 聚合，只有 `oc_project_video_append` action 计入；只读、Plan 保存和素材推送均不计入。领取额度时锁定 Case，确认最新 Job、冻结 Plan、本人确认、次数与最近 action 的结束时间；相邻请求至少 20 秒。新 Plan 明确冻结 `40100` delivery 合同时，一个逻辑 action 最多三笔相同 hash 的物理请求，仍只计一个 Case action；调度点越过总时限或 `40100` 携带受理/对象矛盾证据时停止投递。动作产生的即时观察与任一次后续回查均使用同一事务保存 readback、对应 evidence 与节点 05–07，随后更新 Job/Case；结果不明确时只允许回查，不能借恢复入口再次写入。`platform_actions.error_category` 保持既有 allowlist；追加适配器将细分的受控平台结果写入 `metadata.error_category` 与 `metadata.platform_outcome_code`，Plan 收口和 Gate 投影据此区分系统限流、明确拒绝与结果不明。

### 追加项目候选的只读口径

工作台的追加项目推荐只查询 Postgres，不调用平台列表。候选以 `created_objects.object_type='std_project'` 为粒度，关联 `launch_jobs`、已完成的 `workflow_cases` 与同一 Job、对象的最新 `readback_records`；仅保留 `runtime_truth`、当前登录用户拥有的账户和 Case、对象与最新回查均为 `readback_verified`、且项目 ID 为合法数字的记录。推荐列表按项目 ID 去重、按最新回查时间倒序，最多返回五项；手动项目 ID 仍在同一完整候选口径中精确查询，不受推荐上限影响。输出仅含项目 ID、名称、路线、游戏、验证时间和固定来源标记，不返回原始响应或执行载荷。该查询只服务 Intake 上下文补齐，不是平台事实的替代，启动后的既有只读核验保持必经。

### 连接与迁移

目标数据库为 `marketing_workbench_v2`，业务 schema 为 `mwb`。[仓储](../src/repositories/postgresRepository.mjs) 通过系统 `psql` 执行 SQL，默认库名来自构造参数 `database`；调用使用 `-X -d <database> -v ON_ERROR_STOP=1`，不会读取 psql 启动脚本。实现未设置 host、port 或 user，连接沿用进程环境与本机 PostgreSQL 客户端配置；不在文档记录真实密码或含凭据的连接串。

`MWBV2_DATABASE_NAME` 是下面备份脚本的库名覆盖项，不是应用仓储的环境变量配置入口。核对连接可使用以下只读命令；它不执行 migration：

```sh
psql -X -v ON_ERROR_STOP=1 -d marketing_workbench_v2 -c "SELECT current_database(), to_regnamespace('mwb') IS NOT NULL AS mwb_schema_exists;"
```

[建库文件](../db/001_create_database.sql) 在维护库 `postgres` 执行，后续获批 migration 在目标业务库执行。当前没有统一自动 migration runner；由批准 Task 明确目标库、具体文件、应用前提及回查，用 `psql -X -v ON_ERROR_STOP=1 -d` 指定库并用 `-f` 指定单个文件。历史上 `015_add_project_name_reservations.sql` 与 `015_p04_video_material_local_assets.sql` 共用编号，二者均保留且不得重命名；后续 migration 必须使用未占用编号。历史文件含种子和专项修正，不能把编号清单当作可直接重跑的初始化脚本，也不能仅凭文档基线推断在线库已应用哪些迁移。

### 备份与定时执行

项目根目录的手工备份入口：

```sh
npm run db:backup
```

[备份脚本](../deploy/backup-postgres.sh) 使用 `pg_dump --format=custom --no-owner --no-acl`，随后用 `pg_restore --list` 检查归档可读性。默认库名 `marketing_workbench_v2`，目录 `.local/backups`；`umask 077` 限制新文件权限，文件名带 UTC 时间。可用 `MWBV2_DATABASE_NAME`、`MWBV2_BACKUP_DIR`、`MWBV2_BACKUP_RETENTION_DAYS` 覆盖；保留天数默认 14，必须为非负整数。成功校验后按脚本的 `find -mtime +天数` 清理同库名旧 dump，不是精确到小时的保留期限。

[备份 LaunchAgent 示例](../deploy/launchd/com.hys.marketing-workbench-backup.plist.example) 配置每天本机时间 02:20 执行，日志写入 `.local/logs/backup.stdout.log` 和 `backup.stderr.log`。启用前核对项目路径、日志目录、运行用户连接权限及 `pg_dump/pg_restore` 可执行环境；安装与应用服务使用同一 launchd 管理方式，配置文件本身不证明已启用。

`pg_restore --list` 只验证归档目录可读，不证明恢复成功。恢复需单独任务明确目标库、备份文件及覆盖范围；本合同不提供自动覆盖线上库的恢复命令。

### 隔离测试数据库

自动回归通过 `tests/run.mjs` 为每个数据库/HTTP 测试创建 `marketing_workbench_v2_test_<run_id>`，只从业务库读取 `mwb` Schema，记录规范化结构 SHA-256；不导出真实账户、用户、Case、Job、Plan、确认或回查数据，不重放历史 migration。静态合同夹具与合成身份、资源、运行记录由 `tests/fixtures` 和 `tests/support` 装载。测试构造器要求显式测试库，库名不可改写；测试进程的 psql 只能访问本轮数据库。结束时关闭测试服务、删除本轮数据库和临时目录。

`npm run test:unit` 运行无业务库依赖的合同测试；`npm run test:integration` 运行独立数据库及 HTTP 测试；`npm run test:workflow-regression` 聚合两者。既有专项测试命令委托同一入口。`tests/isolation.test.mjs` 单独验证禁止业务库连接、仅导入结构和清理结果。缺少夹具或未配置的外部请求使测试失败，不能作为跳过项。测试库所需 PostgreSQL 建库权限仅用于本地回归；应用默认数据库仍由仓储构造器定义。

追加视频可使用两类 Plan：`project_video_material_push` 仅用于将已核验的物料户视频分批推送至目标账户，`project_video_append` 仅用于把目标账户已可用的视频追加到指定项目。推送动作和目标库存回查分别记录；回查未通过也消费推送 Plan 并保留受控 blocker，回查通过才可在同一 Job 生成下一份追加 Plan。确认后若动作前核验、action claim 或执行器异常停止，且该 Plan 不存在 platform action，Plan 会以 `blocked_before_platform_write` 消费，并保存唯一 `confirmed_execution_blocker`、受控证据引用与零调用量；Job 进入 `failed_waiting_manual_review`，summary 投影为 `resolve_case_blocker`，只允许 fresh readonly recovery。追加 action 审计记录请求/响应 hash、HTTP 状态、业务码、受控错误分类和字段合同摘要；不记录原始请求或响应。追加发送时账户/项目 ID 是无损 JSON 整数，视频 ID 为原始字符串。已消费追加 Plan 的每次项目素材回查都创建独立 `readback_records` 观察；查询失败与“未发现视频”由摘要中的查询状态和 blocker 区分。只有明确 `platform_rejected` 且最新回查仍缺失时，Case 锁允许生成一个 fresh 追加恢复 Job；旧 Plan/action 仍不可重发。二者的 `metadata.execution_scope`、Plan hash、confirmation 与 action 审计独立保存；结构枚举由迁移 `096_project_video_material_push_plan.sql` 维护。

## 市场情报外部只读合同

公共电脑是市场素材和视频的事实所有者。工作台不复制到 mwb，不新增表/View；数据在一次请求内做允许字段投影后供当前页面使用，不保存原始响应或对话。平台哈希素材 ID 为 32 位十六进制不透明字符串，按原值关联列表、详情、趋势和视频。用户连接凭证的存储与录入查[部署说明](../deploy/README.md#市场情报数据连接)。

公共服务 `/api/v1` 合同：`GET /health` 验证连接；`GET /assets` 返回 data 数组与 meta.total；`GET /assets/{id}` 返回 data.asset、sources、files、metrics；`GET /stats/trend?asset={id}&from=&to=` 返回 data.points 和 summary；`GET/HEAD /files/{id}` 返回 MP4/WebM，支持单段 Range。文件路径、未列明字段、任意来源 URL 和原始载荷不下发浏览器。列表投影仅含稳定 ID、可用名称/游戏、平台标签和更新时间；详情只投影允许的标签和平台脚本文本；当前没有可安全投影的封面字段时，页面使用标题占位，不能伪造封面。未知字段不猜测。

日趋势只接收唯一日期、非负整数或 null 的 popularity_daily；0 表示平台报告值为零，null 为缺失，二者都不能推断投放效果。日期为 YYYY-MM-DD、时区 Asia/Shanghai，观察日期与 meta 的采集更新时间、查询时间分开。`summary` 只读取 `popularity_points`、`points_returned`、`observed_from`、`observed_to`、`refline_from`、`refline_to` 和 `net_change`；缺少字段明确显示未提供，不猜测旧字段名。图表对 null 和日期缺口断线，不补零；人气值不是消耗、曝光、转化或 ROI。`top1/top5/top10/top50` 是平台百分位参考线的日展开，周参考线不与日值相加。首版不计算排名、标签分布、质量汇总或跨素材对比；meta.total 是服务端全查询范围总数，不能以当前页条数代替。

候选发现接口只接收 `page=1..500`，以未指定游戏的 `GET /assets` 读取最多 40 条稳定投影素材；它返回当前候选中的去重非空游戏名称、卡片、候选页、候选数量、上游素材总数和是否可继续发现。游戏名称必须来自该次响应；没有公共服务全量游戏目录时，页面必须标记为当前已读取候选，`meta.total` 也只能表示上游素材总数。工作台结构化查询只接收规范化的 `games[0..5]`、`month=YYYY-MM`、`page` 和 `candidatePage`；默认月份为上海上一个完整自然月，当月上限为当前上海日期。公共服务尚未确认按月筛选时，工作台对每个研究对象在一个 `candidatePage` 中最多请求 40 条候选，再以趋势请求的 `[from,to]` 检查是否至少有一个非 null 人气观察。返回的素材网格固定每页 8 条；`resultCount` 是本次已加载候选中的合格数，`loadedCandidateCount` 与每对象 `queryComplete` 必须同时返回。上游 `meta.total` 只有在候选页遍历完时才可表述为完成，不能称作目标月份总数。

月报请求只接收相同规范化筛选，服务端重新查询并核验素材 ID，浏览器传回的标签、脚本、数值或证据一律不可信。每份报告最多 30 条有效样本，按研究对象轮流选择；素材仅在目标月份至少有一个非 null 人气观察时纳入，0 有效、缺失不补零，采集时间不能替代观察日期。报告事实包括服务端计算的样本数、对象、观察范围和来源；模型只能接收脱敏标签、脚本和这些事实，输出必须关联已纳入素材 ID，且不得生成数字、URL、ROI、预算或平台动作。模型未配置、超时、非法输出或无效证据时，报告仍返回确定性事实摘要并标记 AI 摘要不可用。报告、摘要编辑和下载只存在当前页面内存；导出文件内嵌样式与可取得的安全素材表示，不含视频、凭证、内部资源地址或可执行用户输入。

单素材证据解读接口只接收素材 ID 和规范化月份筛选；服务端重新取得详情及对应趋势，投影观察范围、有效点数、零值数量、缺失数量、上游净变化、标签和脚本。无模型时返回确定性事实说明；已测试启用的模型只能改写已投影的脱敏证据，返回单条不含数字、效果、ROI、排名、因果、URL 或操作指令的观察。模型不可用或输出不合格时保留确定性说明并标记状态；浏览器传入的脚本、数值、标签和结论一律不可信。

公共电脑完成合同交付后，可增加 `GET /stats/compare`：只接受 2–5 条稳定素材 ID 及日期范围，服务端以同游戏、同来源、同单位和 day 粒度计算共同有效观察期与净变化。共同有效日期不足两天、首值为 0 或存在中间缺失都必须显式返回限制；工作台不自行排名或计算百分比。

上游返回 401、404、409、416、429、503 等结果映射为受控提示；超时、非 JSON、非成功信封、超出 1 MiB JSON 或趋势合同不符不展示为成功空数据。不回传上游错误原文。后端每次请求重新以登录用户的连接访问数据，同源视频路由沿用同一身份并只转发必要的 MIME、长度和 Range 头；禁止跨地址重定向。
