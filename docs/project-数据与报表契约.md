# marketing-workbench-v2｜当前数据与报表契约

| 元信息 | 值 |
| --- | --- |
| 文档状态 | 当前有效；唯一数据库说明文档，含数据契约与数据库运维 |
| 最后更新时间 | 2026-09-10 CST |
| 校验基线 | Git 当前 HEAD + `TASK-MWBV2-GAME-BRAND-FALLBACK-VALIDATION-20260910`；Postgres 38 张基础表、7 个 View、`workflow_case_summary` 24 列；最新 migration `084_target_empty_brand_omit_experiment.sql` |
| 适用范围 | v2 数据结构、字段约定、来源、读写责任、报表口径，以及数据库连接、迁移与备份 |
| 权威来源 | `db/*.sql`、Postgres `mwb`、`src/repositories/postgresRepository.mjs`、节点合同与当前 Task/Manifest |
| 重新校验条件 | 表/列/约束/View、持久化来源、报表消费逻辑、数据库连接/迁移/备份脚本或定时配置变化时 |

> 更新时间只证明本文件最后一次静态校验时间；动态账户、Case、Job、Plan、资源与平台动作状态必须实时查询 Postgres。报表/View 只读，不是业务真值写入源。

本文集中维护当前数据库说明，其他当前文档只引用对应章节。SQL/Schema/代码仍承担实现职责，历史任务与 Git 记录只供追溯，不是另一份当前合同。

结构清单沿用 migration `084` 的已核验基线；连接、字段与运维说明按当前 SQL、仓储及部署实现静态核对，不声明重新做过在线数据对账或备份/恢复演练。`db/*.sql` 当前共有 85 个 migration 文件、编号至 `084`，作为不可拆除的 Schema 演进历史保留；文件数不等于当前表数。`.archive/` 中的隔离内容不是数据库写入者、migration 或 runtime 依赖，不能据此改变下述 38 表、7 View 与 24 列合同。

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
|  | `game_assets`、`material_packs`、`material_pack_items` | 游戏资产、路线物料包、物料包条目 | 同上 | Node 03、Node 05 |
|  | `landing_page_assets`、`game_route_resource_blueprints` | 路线×游戏备用页、资源蓝图 | 同上 | Node 03–04 |
|  | `game_route_launch_links`、`game_route_micro_game_registration_profiles` | 路线×游戏受控启动链接、小游戏注册档案版本 | 同上 | Node 03、Node 05 |
|  | `dmp_package_sets`、`dmp_package_members` | 路线×游戏 DMP 集合、集合成员 | 同上 | Node 04–05 |
| L2 账户（5） | `advertiser_accounts`、`account_touchpoints` | route×game×advertiser 账户、唯一 `owner_user_id`、受控触点；新 Intake 在 Case/Job 前用当前用户 owner key 执行乾坤 `accountIndex` 精确只读预检，禁止跨 scope 覆盖和自动转移。`qiankun_agent_id`、`qiankun_account_record_id`、`qiankun_owner_key` 是 Monitor 的账户身份唯一投影；它们只由同一账户的 fresh `accountIndex` 写入，路线默认值不得保存代理或账户记录。`auth_status` 写入时“授权正常”“已授权”“ready”“active”统一为 `ready`，其他值保持原样 fail-closed。`platform_status` 是原始诊断值，不决定引导视频分支。`guide_video_required` 默认 false，表示可自动探测；true 仅保留为强制要求，空 probe 不得降级。`video_cover_required` 是独立、默认 false 的显式封面开关 | 账户维护、Case 入口账户只读预检、monitor readonly reconcile、已授权 monitor 流程 | 访问控制、Node 02、Node 04–05、专项 View |
|  | `account_resources`、`dmp_package_member_account_states` | 账户资源、DMP 成员×账户状态；Node 04 在 `event-chain-readonly` 前只用当前账户、App 与唯一受控实例候选同步动态账户绑定、模板引用/hash；前提不完整时不落合同。JSZC fresh Job 的 `gameplay/list` 结果仅保存为唯一 `micro_app_instance.metadata.guide_video_readiness`：是否 required、候选数、ID 是否存在、response hash、evidence ref、Job/实例绑定与时间；不保存原始响应。品牌默认只保存目标账户回查；一次性游戏保底实验仅在 `brand_info.metadata.game_route_fallback_experiment` 保存 route/game/Case、品牌蓝图、三元组 hash、支持账户数、变体数和脱敏证据引用，三元组本身位于 `brand_info_official` 并标记 `source=game_route_fallback_experiment`、`validation_status=experimental_pending_create`。成功权威回查前不得写为 fresh target readback。唯一 ID 要求两条 required video 复用；成功空列表允许省略；歧义/失败阻断。视频行不复制动态 ID | Node 04 readonly / 已确认资源回查 | Node 04–05、Case summary |
|  | `qiankun_option_relations` | 乾坤父子选项关系 | 只读同步 | Node 02 诊断 |
| L3 Case（1） | `workflow_cases` | 一个 route×game×advertiser 的持续闭环，`case_id`；保存 `owner_user_id`、`created_by_user_id` 与 `maximum_create_attempts`（普通 Case 默认 3，获批替代 Case 固定 1）；同一 scope 最多一个 active `runtime_truth` Case | Case / Job 入口、受控替代事务 | Case summary、UI、API、CLI |
| L4 运行（8） | `launch_jobs`、`launch_node_runs`、`launch_skill_runs` | Case 下单次运行、Job×Node、Job×Skill×attempt | runner / Skill runner | Job View、Case summary、诊断 |
|  | `launch_drafts`、`project_name_reservations` | Job Draft、Job×名称预留 | Node 05 | Create Plan、查重、创建执行 |
|  | `dmp_package_push_plans` | Job×DMP 成员推送计划 | Node 04 | 已确认资源执行 |
|  | `monitor_provision_runs`、`monitor_provision_attempts` | monitor provision cycle、cycle×attempt | Node 02 monitor 子链 | monitor 专项 View、诊断 |
| L5 审计（7） | `launch_execution_plans`、`launch_confirmations` | Job×Plan 版本、Plan-bound confirmation；confirmation 保存真实 `confirmed_by_user_id`。`plan_version` 在同一 Job 的 monitor/resource/create Plan 间单调递增并在同轮普通编译中稳定复用，`create_attempt_no` 独立计数。`plan_kind` 仅为 monitor bootstrap / resource / project / blocked；首次工作台 dry-run 的 monitor readonly合同可直接编译唯一 ready `monitor_bootstrap` Plan，但不产生 confirmation/action/attempt。任一已记录平台 action 的 ready Plan 必须离开 `ready`。Create 成功链固定为 `ready → waiting_readback → consumed`；明确失败与回查未确认的结果均为 `consumed` + 脱敏 outcome metadata，不代表执行成功 | Plan 编译、显式确认、终态收口与 Create 回查 | 执行 scope、Case summary |
|  | `platform_actions`、`platform_action_deliveries`、`created_objects` | 外部逻辑 action×Attempt、其最多三条物理 delivery、创建对象；delivery 仅适用于精确 `std_project/create + 40100 + 无对象 ID`，保存序号、计划/实际时间、HTTP/API code、hash、request ID/对象 ID 存在性和安全分类，不保存原始请求/响应或平台消息 | executor / create result mapping | Node 06–07、Case summary |
|  | `readback_records`、`evidence_artifacts` | Job×回查、脱敏证据 | Node 04/07 与各 executor | Case summary、审计与诊断 |

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
| 游戏素材与账户资源 | 标题由 `game_assets.asset_type=title_material` 经物料包关联；商品身份来自 `games`，卖点来自路线默认值，产品图及其他动态资源来自目标账户已核验记录。账户资源、DMP 成员状态、实例、引导视频和触点不复制进路线默认值 |
| 固定抖音号与授权 | 默认号从 `game_route_defaults.raw_defaults.aweme_id_baseline.default_aweme_id` 读取；基线保存默认号、hash、适用条件和规则依据，不表示账户已授权。`advertiser_accounts.aweme_authorization` 只保存当前默认号的脱敏只读核验快照，包括 scope、default hash、Job、时间、response hash、证据和 blocker，不保存候选列表或已选 ID。专项 readiness View 投影最近快照；平台变化须重新运行 Node 04 才会更新 |
| 启动链接与备用页 | `game_route_launch_links` 按 route×game 读取受控深链；平台 App 关联、hash 与协议在 payload 前校验。`landing_page_assets` 保存备用页库存，目标账户可见性读取 `account_resources` 的 `backup_landing_page`；完整 URL 只进入受控字段，普通摘要仅输出 ref/hash/status/存在性 |
| 资源核验与审计 | `account_resources` 的已核验事件资产、小游戏实例、备用页以 `visibility_status=visible` 与 `readback_status=readback_verified` 表达，写入者见本节表契约；其他资源按自身合同核对。Node 04 同一轮基线 readonly 的头像、品牌和产品图通过同 scope 的单条原子更新保存，任一 CHECK 失败则不允许部分资源落库。品牌实验候选沿用既有 `inheritance_status=baseline_candidate`；其 `game_route_fallback_experiment` 来源、冻结 hash 和 `experimental_pending_create` 只存 `brand_info` JSON 元数据。候选只能由 `listVerifiedGameBrandEvidence` 聚合至少两份同 route×game、状态为 `live_target_account_readback` 的新鲜证据；唯一三元组及 hash 通过后，当前 Case 的显式 `brand_fallback_experiment` 批准才可用于一次 create Plan。DMP 目标状态按集合成员×目标账户保存。Skill 和平台动作只保存受控证据摘要，外部动作审计包括 endpoint path、method、HTTP/API code、request ID 存在性、hash 与脱敏 metadata，不保存 raw request/response |

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

`root_blocker_codes` 是零或一个可行动 blocker；`structural_blocker_codes` 是完整结构性诊断集合。两者均不构成授权。已确认的 `monitor_bootstrap` Plan 在平台写入前失败时，summary 优先投影其 `confirmed_execution_blocker`，不得被通用 `monitor_plan_required` 覆盖。字段来源与过滤由 SQL View 定义，Gate 优先级和消费行为统一查 [当前逻辑图 §5](project-现在的逻辑图.md#5-当前-case-gate-与工作台)，本文件不再维护第二张 Gate 规则表。

## 5. 核心键、时间与去重

以下是数据约束说明，不另建业务状态。完整约束由现有 migrations 和运行库定义；变更时先核对实际 Schema，不能据文档猜测数据库已有唯一约束。

| 对象 | 主键 / 业务去重边界 | 时间与历史语义 |
| --- | --- | --- |
| 路线 / 游戏 / 默认值 / 平台 App | `route_id` / `game_code`；默认值主键 `id` 且唯一 route×game；App 主键 `id` 且唯一 game×platform×app_type | `created_at` 是建档时间，`updated_at` 是本地记录更新时间；不等于平台核验时间 |
| 账户 | `advertiser_id` 主键，保留 route/game 与唯一 owner；不能为同一 ID 跨 scope 新造第二份账户真值 | `updated_at` 不代表所有资源重新核验，归属变更只能走受控入口 |
| 触点 / 账户资源 | `touchpoint_id` / `resource_id` 主键；平台 ID、ref 与 hash 不代替本地主键；不假定同一资源类型只能一行 | readiness 使用当前 scope 的记录和核验证据；有多个候选必须按合同判定，不任意取首条 |
| Case | `case_id` 主键、`case_key` 唯一；部分唯一索引约束同 route×game×advertiser 最多一个 active runtime Case | Case 可包含多个 Job；`updated_at` 是本地生命周期/元数据变化，不是每个子事件的时间 |
| Job / Node / Skill | `job_id` / `node_run_id` / `skill_run_id`；Node 唯一 job×node_key，Skill 唯一 job×skill_key×attempt_no | Job 建档/更新时间、Node/Skill 开始/结束时间分别保存；不得把新 readonly 结果改写成历史运行证据 |
| Draft / 名称预留 | `draft_id` / `reservation_id`；名称预留有 job 唯一及 scope×序号、scope×名称约束 | fresh Job 不继承旧确认；runtime 名称占用保留，测试占用单独清理 |
| Plan / confirmation | `plan_id` / `confirmation_id`；Plan 唯一 job×plan_version，confirmation 按 Plan 单次占有 | Plan 版本不等于创建次数；immutable Plan/hash 绑定最终 Draft，授权消费留在数据库审计 |
| Action / delivery / 创建对象 | `action_id` / `(action_id, delivery_no)` / `created_object_id`；action 使用独立幂等键及 job×action_type×attempt_no 约束；delivery 序号限定 1–3；对象唯一 job×object_type×object_id | Case 创建次数跨同 source_usage 的 Job 聚合且只按逻辑 action 计数；`40100` 的物理 delivery 不增加 Attempt。外部调用时间与本地记录时间分开，不能用 fresh Job 重置历史次数 |
| Readback / evidence | `readback_id` / `artifact_id`；一条证据对应一次观察，不按对象 ID 覆盖所有历史观察 | `created_at` 是记录时间，核验状态/来源/摘要关联具体 Job；平台事实是否新鲜由相应 readonly 合同判断 |
| Monitor cycle / attempt | cycle 主键 `cycle_id`，同 provision×cycle_no 唯一；attempt 主键 `attempt_id` 且唯一 cycle×attempt_no | 报表按 cycle 聚合调用；当前 readiness 只取当前 scope 最新 cycle 和触点，不把历史失败重复加为当前 blocker |
| 用户 / 会话 / 用户审计 | `user_id` / `session_id` / `audit_event_id`；登录名与 owner key 大小写归一后唯一，会话 token hash 唯一 | 会话到期/撤销与用户变更审计独立；报表读取权限不能推导为账户操作权限 |
| Agent 模型配置 | `(user_id, agent_key)`；协议固定 `openai_compatible`，启用记录只能对应测试通过状态 | 更新 API Base、模型或本地 Key 后清除测试时间并停止启用；本地 Key 的唯一事实为 gitignored `0600` 凭据库，数据库只保存不可用来换取 Key 的引用 |

SQL `timestamptz` 表示绝对时间；`started_at / finished_at` 可空，空值表示尚无对应执行时间，不能填成成功或零耗时。当前 View 是查询时的运营投影，没有按日分桶、币种换算或归因窗口。导出及对账须注明查询时刻与显示时区，禁止把文档更新时间当成数据截至时间。

## 6. View 去重与人员指标口径

| View | 唯一行标识 / 选取方式 | 来源与时间边界 |
| --- | --- | --- |
| `workflow_case_summary` | `case_id`；最新 Job 按 updated_at、created_at、job_id 倒序，最新 Plan 按版本倒序；动作/回查按 Case 合同聚合 | Case 当前投影；过程记录按 Job/Skill/Attempt 回溯；不把多 Job 统计成多 Case |
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
| 元数据边界 | 账户级资源合同、核验时间、Plan/Draft hash、来源和必要关联 ID 保存到既有受控字段；目标品牌空列表实验只存于 `workflow_cases.metadata.brand_empty_omit_experiment` 与 `account_resources.metadata.target_empty_omit_experiment`，记录 scope、fresh Job、空列表证据引用、一次调用上限和终态，不新增列或生命周期枚举；不得把账户动态资源 ID 或历史 Plan 复制进游戏默认配置 |
| 授权与回查 | 平台授权、安全规则与任务闭环只查 [AGENTS](../AGENTS.md)；Plan 状态变化、资源动作、HTTP deadline 和 Case finalizer 行为只查 [逻辑图](project-现在的逻辑图.md) |
| 敏感信息 | 普通 JSON/日志仅保存脱敏摘要、hash、状态、必要 ID 与证据引用；触点、落地页和启动深链仅用既有受控存储，禁止复制到报表、前端或 Task。模型 API Key 仅在 `.local/workbench-llm-credentials.json` 的 `0600` 本地原子凭据库中出现；模型 API Base 仅在本人配置表中保存且禁止含用户名、密码、query 或 fragment，audit/API/前端均不回显 Key |
| 历史与测试 | `test_run` 与 runtime 真值分离并由测试清理；旧 migration 不删除，旧 Task/Manifest 不补造验收，隔离脚本不是新的表/View 写入来源 |
| 完成证明 | 开发任务由 Manifest 验收关闭；真实创建成功必须有 Postgres 权威回查证据；两者不得互相替代 |

投放效果原始接入、标准投放事实表，以及按日期×游戏×渠道×账户×广告对象汇总的消耗、曝光、点击、转化、收入、ROI 报表目前均未建立。当前 7 个 View 提供运营就绪状态和人员流程统计。

## 8. 数据库运维

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
