# marketing-workbench-v2｜当前数据与报表契约

| 元信息 | 值 |
| --- | --- |
| 文档状态 | 当前有效；静态数据与只读报表契约 |
| 最后更新时间 | 2026-09-02 12:48 CST |
| 校验基线 | Git 当前 HEAD + `TASK-MWBV2-DOCS-LATEST-MECHANISM-AUDIT-20260902`；Postgres 33 张基础表、5 个 View、`workflow_case_summary` 24 列；最新 migration `067_active_runtime_workflow_case_scope.sql` |
| 适用范围 | v2 的配置、账户、Case、运行证据、外部动作、回查和当前运营状态投影 |
| 权威来源 | `db/*.sql`、Postgres `mwb`、`src/repositories/postgresRepository.mjs`、节点合同与当前 Task/Manifest |
| 重新校验条件 | 表/列/约束/View 改动，新的运行或资源子链落库，或 Case Gate/报表消费逻辑变化时 |

> 更新时间只证明本文件最后一次静态校验时间；动态账户、Case、Job、Plan、资源与平台动作状态必须实时查询 Postgres。报表/View 只读，不是业务真值写入源。

本次复核确认 `db/*.sql` 共 68 个 migration 文件，均作为不可拆除的 Schema 演进历史保留；文件数不等于当前表数。`scripts/archive/` 中的隔离脚本不是数据库写入者、migration 或 runtime 依赖，不能据此改变下述 33 表、5 View 与 24 列合同。

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

## 2. 基础表契约（33 张）

| 层 | 表 | 行粒度 / 主关联 | 写入者 | 主要消费者 |
| --- | --- | --- | --- | --- |
| L1 配置（13） | `platform_routes`、`games`、`game_route_defaults`、`game_platform_apps` | 路线、游戏、路线×游戏、游戏×平台 App | migration、种子、受控配置维护 | Node 01–03、Node 05 |
|  | `game_assets`、`material_packs`、`material_pack_items` | 游戏资产、路线物料包、物料包条目 | 同上 | Node 03、Node 05 |
|  | `landing_page_assets`、`game_route_resource_blueprints` | 路线×游戏备用页、资源蓝图 | 同上 | Node 03–04 |
|  | `game_route_launch_links`、`game_route_micro_game_registration_profiles` | 路线×游戏受控启动链接、小游戏注册档案版本 | 同上 | Node 03、Node 05 |
|  | `dmp_package_sets`、`dmp_package_members` | 路线×游戏 DMP 集合、集合成员 | 同上 | Node 04–05 |
| L2 账户（5） | `advertiser_accounts`、`account_touchpoints` | route×game×advertiser 账户、受控触点 | 账户维护、只读 reconcile、已授权 monitor 流程 | Node 02、Node 05、专项 View |
|  | `account_resources`、`dmp_package_member_account_states` | 账户资源、DMP 成员×账户状态；事件资产合同仅可保存账户绑定、模板引用/hash、存在性与脱敏回查状态；小游戏实例候选只保存受控来源与脱敏诊断，目标账户已核验标记只能来自 event asset detail 的 App + instance 绑定 | Node 04 readonly / 已确认资源回查 | Node 04–05、Case summary |
|  | `qiankun_option_relations` | 乾坤父子选项关系 | 只读同步 | Node 02 诊断 |
| L3 Case（1） | `workflow_cases` | 一个 route×game×advertiser 的持续闭环，`case_id`；同一 scope 最多一个 active `runtime_truth` Case | Case / Job 入口 | Case summary、UI、API、CLI |
| L4 运行（8） | `launch_jobs`、`launch_node_runs`、`launch_skill_runs` | Case 下单次运行、Job×Node、Job×Skill×attempt | runner / Skill runner | Job View、Case summary、诊断 |
|  | `launch_drafts`、`project_name_reservations` | Job Draft、Job×名称预留 | Node 05 | Create Plan、查重、创建执行 |
|  | `dmp_package_push_plans` | Job×DMP 成员推送计划 | Node 04 | 已确认资源执行 |
|  | `monitor_provision_runs`、`monitor_provision_attempts` | monitor provision cycle、cycle×attempt | Node 02 monitor 子链 | monitor 专项 View、诊断 |
| L5 审计（6） | `launch_execution_plans`、`launch_confirmations` | Job×Plan 版本、Plan-bound confirmation；`plan_kind` 仅为 monitor bootstrap / resource / project / blocked；已确认 Resource Plan 成功或阻断后均须离开 `ready`，失败终态以 `consumed` + 脱敏 outcome metadata 保存，不代表执行成功；Create Plan 成功受理后为 `waiting_readback`，仅 verified 后为 `consumed` | Plan 编译、显式确认、confirmed-resource 终态与 Create 回查收口 | 执行 scope、Case summary |
|  | `platform_actions`、`created_objects` | 外部 action×attempt、创建对象 | executor / create result mapping | Node 06–07、Case summary |
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
- 所有平台长数字 ID 按字符串存储与比较；摘要 JSON 只保存脱敏状态、hash、必要 ID 和证据引用。

## 3. 只读 View 与报表边界（5 个）

| View | 行粒度 | 输入 | 核心输出 | 消费者 | 禁止 |
| --- | --- | --- | --- | --- | --- |
| `workflow_case_summary` | 一个 `workflow_case` 的当前状态 | Case、最新 Job/Node/Skill、账户资源/触点、Plan/confirmation/action/object/readback | 当前 Gate、唯一 root blocker、建议动作、节点/资源摘要、动作回查状态 | UI、API、CLI、任务卡、Gate Action Policy | 写回 Case/Job/资源；自行推导 next gate |
| `v_monitor_readiness` | route×game×advertiser | 最新 monitor cycle、受控触点、脱敏 readonly evidence | `monitor_ready`、readiness status、唯一 actionable blocker、诊断集合和建议动作 | Node 02、Plan、Case summary、API/UI | 直接创建 monitor、把历史诊断当作当前 blocker |
| `v_monitor_provision_status_report` | 一个 monitor provision cycle | monitor run/attempt、账户、触点、路线默认值 | cycle、attempt、账户/触点、脱敏回查与错误摘要 | Node 02、人工诊断 | 创建 monitor、写回触点或运行状态 |
| `v_monitor_provision_blocker_report` | 一个 monitor provision blocker | monitor run/attempt | blocker、最新 attempt 状态与错误分类 | Node 02 分流、人工排障 | 触发 retry 或写入 |
| `v_advertiser_aweme_authorization_readiness` | 一个 route×game×advertiser 授权就绪状态 | advertiser account 的脱敏抖音授权关系 | ready、blocker、next action、脱敏探测证据 | Node 04、Node 05 | 替代 fresh readonly 或修改授权 |

## 4. `workflow_case_summary` 合同

该 View 的 24 列按以下消费分组；它只投影当前状态，不保存完整历史，也不反向写入。

| 输出组 | 字段 | 含义 |
| --- | --- | --- |
| Case 身份（10） | `case_id`、`case_key`、`route_id`、`game_code`、`advertiser_id`、`business_goal`、`lifecycle_status`、`source_usage`、`created_at`、`updated_at` | 当前业务闭环与范围 |
| 最新运行（5） | `latest_job_id`、`latest_job_status`、`latest_current_node`、`latest_job_updated_at`、`latest_plan_status` | Case 下最新 Job 与 Plan 状态 |
| 当前动作（3） | `blocker_codes`、`current_gate`、`suggested_next_action` | 对外唯一可行动结论 |
| 摘要与取证（6） | `latest_node_states`、`resource_readiness`、`monitor_resolved`、`action_readback_state`、`structural_blocker_codes`、`root_blocker_codes` | 诊断摘要与 blocker 取证边界 |

`root_blocker_codes` 始终为零或一个 blocker，供工作台与任务卡展示最小修复方向；当 monitor 为 `needs_readonly` 或 `needs_touchpoint_readback` 时，必须优先使用 `v_monitor_readiness.actionable_blocker_code`，再选择 confirmed-resource 停止、其他 monitor/上下文、Node 4 资源和 Plan fallback。已确认资源执行超时、异常或响应不明时统一投影 `confirmed_resource_execution_interrupted`；旧 Plan 已收口为 `consumed`，不得再次展示为可确认。`structural_blocker_codes` 保存 Plan 的完整结构性 blocker 集合，供审计和诊断。两者均不构成执行授权。

| Gate 优先级 | 当前条件 | `current_gate` | `suggested_next_action` |
| ---: | --- | --- | --- |
| 1 | 已创建对象但尚未 verified readback | `run_readback_only` | `perform_readback_only` |
| 2 | 创建次数已达上限且未 verified | `manual_review_after_attempt_limit` | `manual_review_attempt_limit_reached` |
| 3 | Job 为 `failed_waiting_manual_review` | `prepare_corrective_attempt` | `correct_payload_then_build_next_attempt_version` |
| 4 | monitor 为 `needs_readonly` / `needs_touchpoint_readback` | `run_monitor_readonly` | `run_monitor_readonly_reconcile` |
| 5 | 有唯一 root blocker | `resolve_case_blocker` | `resolve_root_blocker:<code>` |
| 6 | 首次创建对象且 readback verified | `first_std_project_create_completed` | `first_std_project_create_completed` |
| 7 | 最新 Plan 为 ready | `await_job_write_authorization` | `obtain_single_plan_confirmation` |
| 8 | Job 为 created/running/waiting | `run_fresh_readiness` | `run_readonly_readiness` |
| 9 | 其他状态 | `review_latest_job` | `inspect_latest_job` |

## 5. 读写、安全与未建边界

| 主题 | 合同 |
| --- | --- |
| 写入来源 | 仅受控 migration、配置维护、runner、Skill、已确认 executor 和权威回查可写入对应真值表；Resource Plan 成功后可在同一 Case 建立 fresh runtime Job，但不得复制旧 Job 的 Plan/confirmation |
| Create Plan/Draft 绑定 | 无最终 Draft 时 Create Plan 不得 ready。ready `std_project_create` Plan 与 `launch_drafts.payload_summary` 的 exact Plan ID/hash、`plan_derivation_status=passed` 必须在同一原子持久化中完成；确认 scope 复核该绑定、`draft_ready` Job 与 Node 04 passed。已确认但零 create action 的创建前阻断 Plan 只可收口为 consumed，confirmation 保留。 |
| Create 回查与 Case 收口 | create 成功受理后 Plan 为 `waiting_readback`；Node 07 按绝对 `0/3/5/8/10` 秒只读回查，五次未命中保持待回查，ID/名称不一致转人工检查。只有同一 Case 最新 `runtime_truth` Job、已确认 Plan、唯一成功 action/对象、最新 Draft 与 ID/名称一致的 verified readback 同时成立，Plan 才可 `consumed`、Case 才可 `completed`；收口幂等且不改写历史 Node run。 |
| 消费顺序 | UI/API/CLI/任务卡先读 `workflow_case_summary`；需要历史细节才按 `case_id` / `job_id` 读取底层表 |
| 工作台投影 | `job.caseGate` 是 `workflow_case_summary` 的同一后端投影，不是第二套 Gate。右侧只展示注册表驱动的固定 3 阶段 7 Node；左侧对话展示动态 Gate/blocker/下一步与确认卡，底部进度栏保留计数和只读刷新。删除右侧独立 Gate 卡片不删除字段，也不改变节点等待态、确认资格或 API/View 合同。 |
| 工作台恢复 | 唯一入口根页只读列出 active runtime Case；`?case_id=` 恢复活动 Case 的最新 Job，`?job_id=` 仅历史只读；两参数并存或非法时 fail-closed，不加载其他账户。`resolve_case_blocker` 的精确“重新只读准备”只消费当前 summary：已确认资源 Plan 停止时 Case lock 下创建 fresh Job 后 `dry_run`，其他 blocker 重跑当前 Job 的 `dry_run`；不复制旧 Plan/confirmation/action/grant，不产生平台写入。 |
| Node 02 展示 | 最新 Case 的账户状态来自当前账户记录；触点与 monitor 来自 `v_monitor_readiness`；历史 Job 仅显示自身 Skill 快照，二者不得互相覆盖 |
| 事件资产合同 | `account_resources.event_asset.metadata.event_asset_provision` 在同账户 App、唯一受控实例候选、版本化模板与官方创建合同通过后保存，以生成 event asset + baseline configs Plan；event asset detail 的 `micro_app_id` / `micro_app_instance_id` 归一后必须精确匹配 App + instance，allowlist 长数字 ID 在解析前无损保留为字符串；configs、携带 asset_id 的优化目标与 DBT 是后续 READY 回查，不保存完整 URL、raw request/response 或凭证。 |
| 事件配置中断 | 写请求固定 15 秒超时；子 action 幂等键绑定已验证 planned action key、当前 Plan ID 与 event type，缺失任一绑定时在 action 占位和平台调用前 fail-closed。超时、异常或响应不明记为 `failed_once`，随后只读回查并收口 action、Skill、Job 与已确认 Plan。partial baseline 的唯一分类器是共享 `eventConfigBaselineReadiness`，仅在 configs 与 available 都完成标准化后输出 `status`、blocker 和 candidates；已配置事件即使不再 available 也视为满足，只为尚未配置且当前 available 的事件生成候选；读取函数不得单独要求 available 为 6/6，不得自动重试。 |
| 敏感数据 | 禁止 token、secret、Cookie、auth_code、完整 URL、raw request、raw payload、raw response；仅保存脱敏摘要、hash、状态、必要 ID 与证据引用 |
| 授权 | `project.state.json` 只给全局 Guardrail；正式 runtime 工作台可消费启用的 loopback Plan-bound 策略，仍须匹配 active Case 最新 Job、ready Plan、精确 confirmation、action grant 与调用上限。动态授权事实只写 Postgres，不为普通运行创建仓库 Task。 |
| 隔离脚本 | `scripts/archive/` 仅保存可恢复历史文件；禁止 package/runtime import/直接执行，不属于表或 View 的写入来源 |

投放效果原始接入、标准投放事实表，以及按日期×游戏×渠道×账户×广告对象汇总的消耗、曝光、点击、转化、收入、ROI 报表目前均未建立。当前 5 个 View 是运营流程就绪状态投影，不是投放效果报表，也不是自动策略的唯一输入。
