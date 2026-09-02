# Solution Design

| 元信息 | 值 |
| --- | --- |
| 文档状态 | 当前有效；方案设计规范 |
| 最后更新时间 | 2026-09-02 12:48 CST |
| 校验基线 | Git 当前 HEAD + `TASK-MWBV2-DOCS-LATEST-MECHANISM-AUDIT-20260902`；当前逻辑图、数据报表契约、7 Node 注册表与 migration `067` |
| 重新校验条件 | 真值优先级、Task/Manifest、Plan/确认、平台写入或回查机制变化时 |

用途：针对卡点、异常、需求、迁移或重要调整，形成可落地、可验证、可停止的方案。

本文件只定义方案方法，不保存动态账户、Case、Job、Plan 或运行状态。

## 已批准设计：工作台原生 Plan-bound 首次创建闭环

正式运行时不得依赖 Codex 为每份 Plan 修改仓库 scope。`project.state.json.guardrails.workbench_runtime_write_policy` 是本机部署级固定策略：只允许 `127.0.0.1:3000` 的同源 JSON command、active Case 的最新 `runtime_truth` Job、ready 且零 blocker 的 `monitor_bootstrap`、`resource_prepare` 或 `std_project_create` Plan，以及当前 Plan ID/hash 对应的精确确认短语。它不选择动作、不生成 Plan、不允许重试；动作、调用上限和目标仍只来自冻结 Plan。

用户确认通过既有 `launch_confirmations` 原子占有当前 Plan 的一次执行权；只有首次成功记录 confirmation 的请求可进入原有 Plan-bound executor。资源执行完成后同一 Case 自动生成 fresh Job，下一份 Plan 只能包含一次 `std_project_create`。动态运行授权只保存在 Postgres confirmation/action/readback，不为每次运行生成仓库 Task/Manifest。开发、迁移、专项人工写入与非工作台入口继续使用原有 Task scope，且 `platform_write_allowed=false` 不影响已明确启用的窄化工作台策略。

`POST /api/launch/jobs/:job_id/command` 是唯一正式 runtime 写入口；`/run` 对真实 Job 只接受 dry-run/readonly/readback，旧 execute 路由对 `runtime_truth` fail-closed。写请求必须满足 loopback Host、同源 Origin 与 JSON Content-Type。历史 Job 永远只读。该设计不新增数据库表、View、Gate 或 Plan 类型。

## 已批准设计：正式写入入口与历史脚本隔离

工作台/API → 既有通用 Plan-bound executor 是唯一正式业务写入链。Resource、monitor 与 std_project 写入仍必须分别匹配当前 Case/Job、冻结 Plan/hash、人工 confirmation、action grant、调用上限与权威回查；不得通过专项 CLI、环境变量或历史 Task 脚本旁路授权。保留 CLI 仅承担 dry-run、readback、状态和明确标注的安全诊断。

已被主链替代、绑定历史 Task/账户或属于一次性人工补录的脚本迁入 `scripts/archive/` 可恢复隔离区，不删除内容。`manifest.json` 记录原路径、隔离原因、替代入口和恢复方式；archive 禁止 package 入口、runtime import 和直接执行。恢复必须先建立新的 Task，重新验证当前合同与权限，再移回原路径。`src/platforms` executor、Node/Skill、Plan/action 类型、HTTP API 与数据库迁移不属于隔离范围。

`db/*.sql` 是不可拆除的 Schema 演进历史，即使某一 migration 已执行也必须保留。脚本隔离不得改变表、View、业务运行事实或外部平台权限；测试只使用 `test_run` / mock 并在结束后清零。

## 已批准设计：Monitor READY 路径的新账户两次确认闭环

保持 OE3 既有 3 阶段 7 Node、`workflow_case_summary`、Plan 类型、Postgres 表和 Plan-bound 权限模型不变。成功路径使用两份相互独立且各只能消费一次的 Plan：第一份 `resource_prepare` 只授权可自动准备资源，第二份 fresh `std_project_create` 只授权一次标准项目创建。资源动作与项目创建不得混入同一 Plan。

当 event asset 缺失且账户级合同已通过时，Resource Plan 必须同时冻结 `ensure_resource:event_asset` 与紧随其后的 `ensure_event_configs:baseline`。事件资产 executor 在创建后先完成目标资产身份回查，并把真实 asset ID 仅在本次内存执行链中传给 event-config executor；baseline configs 完成后再执行完整事件链权威回查。任一动作或回查失败立即停止，修正必须使用新 Plan/hash/confirmation，不自动重试。

工作台可为 ready 的普通 Resource Plan 展示脱敏确认卡；精确确认后只调用既有 confirmed-resource orchestrator。全部资源权威回查通过并消费 Plan 后，在同一 Case 下创建 fresh runtime Job，重新运行只读准备并生成只含 `std_project_create` 的 Create Plan。第二次精确确认后才允许一次创建，并以权威回查为完成条件。

“两次确认”只指 monitor 已 READY、人工 SHARE 和 verify-only 前提已完成且执行无失败的成功路径。monitor 缺失仍使用独立 `monitor_bootstrap` 确认；backup landing page SHARE 是前置条件，`micro-app-instance-authority-readonly` 仅可选诊断，不属于 Gate、Plan 或两份写入 Plan。实施与测试不得对真实账户执行平台写入。

## 已批准设计：Case Gate 真值与账户级事件资产合同

当同一 Case 同时缺少 monitor、触点和账户资源时，唯一 root blocker 必须按依赖顺序选择：已创建对象回查、创建尝试上限、人工修正、monitor/上下文、游戏包、Node 4 资源、Plan 兜底。View、Execution Plan 和工作台只消费这一排序结果，不各自选择不同 blocker。

事件资产保持 fail-closed：正式 action 只能使用与当前 route、game、advertiser 相同的账户级合同，合同必须带目标账户、版本化模板引用、动态模板 hash、官方接口合同、目标 App 与唯一受控实例候选。实例的目标账户绑定只能在 event asset detail 后确认；不得以移除校验的方式开放到所有账户。

本设计只修复本地真值、展示和计划资格；monitor、事件资产及投放创建仍须分别建立专项 Task、冻结 Plan 并取得明确写入授权。

## 已批准设计：Node 04 事件资产顺序

Node 04 保持 Case/Job、3 阶段 7 Node、`workflow_case_summary`、Plan、确认与 executor 不变。唯一有效顺序为：唯一受控实例候选校验 → event asset 创建或发现 → 资产详情确认 App 与 instance 绑定 → event configs baseline 完成 → 携带真实 `asset_id` 的 `optimized_goal/get` → `dbt/get` → READY。

event asset 创建前只校验账户范围、小游戏 App、唯一且来源受控的实例候选与版本化创建模板。实例候选缺失、歧义或来源不受控分别以 `micro_app_instance_candidate_missing`、`micro_app_instance_candidate_ambiguous`、`micro_app_instance_candidate_untrusted` fail-closed；不要求 `micro_app_instance_authority_readonly` 成功，也不提前把实例标为 `readback_verified`。该旧只读调用只保留为可选诊断和审计，不能作为 Plan、Gate 或 READY 真值。

event asset 已存在时直接详情回查，不得重复创建。只有详情确认目标 App 与 instance 绑定后，才可把实例标为目标账户已核验并进入 `ensure_event_configs:baseline`；绑定失败为 `micro_app_instance_binding_readback_failed`，不得创建 configs。configs 未完成时不得调用最终优化目标或 DBT；此后优化目标失败为 `optimized_goal_readonly_failed`，深度出价不可用为 `deep_bid_type_not_available`。任何失败停止且不得自动重试；真实写入仍只能使用 fresh Plan/hash、人工确认与单次 action grant。

## 已批准设计：事件资产详情真实响应的无损归一

Node 04 的资产绑定标准不变：当前账户内唯一 `MINI_PROGRAME` 资产必须由 detail 同时精确匹配受控 App 与实例候选，才可进入 baseline configs。平台详情的真实字段 `micro_app_id` 与 `micro_app_instance_id` 分别归一为标准 `appId`、`instanceId`；兼容已有 `app_id`、`mini_program_id`、`mini_program_app_id`、`instance_id` 与 `mini_program_instance_id`。不得恢复“唯一候选即通过”的旧回退。

所有平台资产/实例 ID 在 HTTP 响应文本进入 `JSON.parse` 前，只能按内部字段 allowlist 无损保留十进制 token 为字符串。事件资产 list/detail 至少覆盖 `asset_id`、`micro_app_instance_id`、`instance_id` 与 `mini_program_instance_id`；既有标准项目 ID 解析兼容接口保持不变。未列入 allowlist 的数值维持原有解析语义；响应无效、字段缺失、候选不唯一或任一绑定不匹配继续 fail-closed。该适配层只修复“平台响应 → 标准资源事实”，不改 Case/Job、Gate、Plan、确认、action、Schema、View、公开 API 或执行顺序，也不得保存 raw response。

## 已批准设计：事件配置中断收口与 fresh readonly 续跑

保持 Case、Job、Gate、Plan、confirmation、executor、`workflow_case_summary` 与权威回查不变。事件配置写请求使用固定 15 秒超时；超时或异常只能记为 `failed_once`，复用现有 `unclassified` 错误类别并在脱敏 response summary 标记 `outcome_category=platform_response_unknown`，随后停止剩余动作并执行只读回查，禁止自动重试。confirmed-resource orchestrator 必须在正常失败或异常时完成父 action、blocked Skill、`blocked_confirmed_resource_plan` Job 和已确认 Plan 的终态收口，确保已确认 Plan 不再以 ready 状态投影为可确认。

事件 baseline 的 partial readback 以“已配置集合 ∪ 当前 available 集合”判断覆盖：已配置事件即使不再出现在 available 列表中也已满足；只有尚未配置且当前 available 的事件可生成 create candidate；尚未配置且不可用继续 fail-closed。工作台仍只消费 `workflow_case_summary`，统一展示 `confirmed_resource_execution_interrupted`，不在前端复制 Gate 计算。本设计不新增 API、Schema、View、Gate、Plan/action 类型，不自动确认、不刷新 token，也不保存 raw request 或 response。

## 已批准设计：partial baseline 的单一分类器

`eventConfigBaselineReadiness` 是 event-config partial baseline 的唯一分类器。`available_events/get` 与 `event_configs/get` 的各自读取函数只负责 HTTP、解析和标准化；两份结果齐备后才允许调用分类器决定 `status`、blocker 与 create candidates。不得以 available 列表单独覆盖 6/6 为由提前阻断。

因此，已配置项不要求仍出现在 available；只有“尚未配置且当前不可用”的项才产生 `event_config_available_events_baseline_missing`。4/6 configured + 2/6 available 必须是 `needs_create` 且只生成 2 个候选；6/6 configured + empty available 必须 no-op 通过。Node 04 事件链使用同一规则决定是否追加 `available_events_baseline_missing`，保留原始 available/configured 计数作诊断，但不保存 event ID 列表或 raw response。

## 已批准设计：事件配置子 action 的 Plan-scoped 幂等绑定

事件配置 create 子 action 的幂等键必须来自当前已验证的 `ensure_event_configs:baseline` planned action，并同时绑定当前 Plan ID 与 event type。request hash 只用于证明请求内容稳定，不能单独作为跨 Job 的全局幂等身份；否则 fresh Job 的相同合法请求会与历史 action 发生唯一键冲突。

`validateEventConfigsWriteScope` 必须把 `validatePlannedActionGrant` 返回的 planned action 透传给 executor。planned action key、Plan ID 或 event type 任一缺失时，executor 必须在 action 审计占位和平台请求之前 fail-closed。数据库唯一约束、已消费 Plan 与历史 action 均保持不变，不删除、不复用、不重试；恢复只能使用 fresh Job/Plan/hash/confirmation。该修复不新增 API、Schema、View、Gate 或 action 类型，也不改变 partial baseline 与权威回查规则。

## 已批准设计：工作台唯一入口与多账户 Case 隔离

本机工作台的唯一公开入口固定为 `http://127.0.0.1:3000/`，服务仅绑定该 loopback host 与端口。地址配置、服务监听、工作台链接、API 返回链接和本机 LaunchAgent 必须消费同一模块；不得保留旧项目地址或可变端口作为 v2 入口。

入口根页保持 idle，并只读展示 `runtime_truth + active` 的 `workflow_case_summary` 行。用户必须通过 `?case_id=` 恢复一个活动 Case 的最新 Job；`?job_id=` 仅查看该 Job 历史，禁止确认或执行；两个参数同时出现、参数格式非法或目标不存在时 fail-closed，不回退到其他账户或最近访问状态。浏览器不得持久化“当前账户”。

运行进度的唯一隔离键是 `workflow_cases.case_id`，不是账户 ID 或浏览器状态。同一 route、game、advertiser 仅允许一个 active `runtime_truth` Case；创建请求命中已有活动 Case 时返回该 Case 及其恢复链接，不生成重复 Case。所有 Job、Plan、confirmation 与平台动作继续由现有 `case_id`、advertiser、最新 Job 与精确 Plan/hash 约束；本设计不放宽任何 Gate 或写入权限。

## 已批准设计：Monitor 单轨真值与 Plan-bound Bootstrap

保持既有 3 阶段 7 Node、Case/Job、Postgres 真值、`workflow_case_summary` 唯一 Gate 与 Plan-bound executor 不变。monitor 仍属于 Node 02 `creation_context` 的独立 bootstrap，不能与资源或广告项目创建混合授权。

`mwb.v_monitor_readiness` 是 route×game×advertiser 粒度的唯一 monitor readiness 投影。它以 scope、monitor ID、受控触点、fresh readonly 回查证据和最新 cycle 状态决定 `monitor_ready`、唯一 `actionable_blocker_code`、诊断集合和建议动作。已 resolved 的 cycle 只保留历史诊断，绝不能再把 `monitor_id_already_resolved_no_create_needed`、`cycle_not_active:resolved` 或历史 attempt 上限投影为当前 root blocker。

monitor 写入使用现有 `launch_execution_plans`、`launch_confirmations`、`platform_actions` 与 action grant；新增的 `monitor_bootstrap` Plan 只能包含一次 `ensure_monitor`。执行前必须匹配全局 Guardrail、active Case、精确 Plan/hash、confirmation 和单动作 grant；创建前 fresh readonly、创建一次、创建后权威回查。失败不得自动重试；下一次尝试必须使用新 Plan/hash/confirmation，cycle 内最多两次。

Node 02 只公开一个 monitor facade。CLI 只保留状态、fresh readonly reconcile 和只读配置同步；Plan、确认和真实执行不再由 CLI 环境变量直接授权。实施与测试不调用真实 monitor、资源或广告平台写接口。

## 已批准设计：终态失败 Monitor 的受控只读回查

`workflow_case_summary` 的 Gate、根阻断和排序不变。仅当 active Case 的最新 Job 处于 `resolve_case_blocker`、唯一 root blocker 为 `monitor_create_busy_retry_exhausted` 且 `monitor_resolved=false` 时，工作台允许精确指令“重新只读回查 monitor”。该指令复用 Node 02 的 fresh readonly reconcile，不生成 Plan、confirmation、action grant 或平台写入。

普通“继续执行”保持只展示 blocker，避免误触发外部查询；历史 Job、非 active Case、其他 blocker 均不得触发该动作。回查发现唯一 monitor 并完成触点回查时，只落脱敏证据并刷新既有 Case 投影；未发现、查询失败或结果不唯一时保留原终态 blocker，不重试、不创建、不改写旧 cycle/attempt/Plan。工作台文案只提示精确指令及安全错误码，不展示完整 URL 或 raw 响应。

## 已批准设计：已确认资源 Plan 停止后的最小只读恢复

工作台新增精确指令“重新只读准备”，但不新增 Gate、Plan 类型、API 路由、数据库 Schema 或平台写权限。Gate Action Policy 仍只读取 `workflow_case_summary`：仅 active Case 的最新 Job 位于 `resolve_case_blocker` 且不是终态 monitor 专用回查时可用。

当最新 Job 为 `blocked_confirmed_resource_plan` 时，先本地读取脱敏凭据状态；未 ready 则不创建 Job、不调用平台。凭据 ready 后，以 Case advisory lock 和确定性 `source_record_ref` 原子创建或返回一个同一 Case 的 fresh runtime Job，并只运行既有 `dry_run`。fresh Job 绝不复制旧 Job 的 Plan、confirmation、action、grant 或 idempotency key；并发重复指令只允许一个 fresh Job 运行只读准备。其他普通只读 blocker 只在当前 Job 运行 `dry_run`。终态 monitor 仍只接受“重新只读回查 monitor”。

该入口不刷新 token、不确认资源 Plan、不创建资源或项目、不更改 `project.state.json` 写权限。真实资源或项目写入仍必须在 fresh Plan/hash、独立 Task、全局 scope 和精确确认齐备后进入既有 executor。

## 已批准设计：工作台进度同步

`?case_id=` 的工作台底栏必须明确展示当前节点计数与当前 Case 的稳定状态：仅在前端请求尚未返回时显示“正在处理”；存在 `root_blocker_codes[0]` 时显示“已暂停”及已有脱敏 blocker 标题；存在确认卡时显示“待确认”；`first_std_project_create_completed` 时显示“已完成”。Gate、blocker、建议动作及最新 Job 仍只消费既有 `workflow_case_summary` 与 Job view，展示层不得自行计算 Gate。

底栏提供一个只读“刷新进度”按钮。该按钮先读取当前 `case_id` 的 summary，再以其 `latest_job_id` 读取 Job view；若最新 Job 已变化，前端只在内存中切换到该 Job，Case URL 保持不变。前端命令或 dry-run 请求进行期间以 1.2 秒间隔复用该只读刷新；请求结束立即停止并做一次最终同步。历史 `?job_id=` 只刷新自身历史 Job，根页不轮询。不新增 API、Schema、View、后台任务或浏览器持久化，刷新不执行 workflow、不创建 Job、不确认 Plan、不产生平台写入。

## 已批准设计：工作台 Gate 投影去重

右侧 Workflow 面板保持固定结构，只展示唯一注册表提供的 3 阶段 7 Node、节点流、子节点详情与运行状态；标题后不得再插入独立 `case-gate` 卡片。动态 `currentGate`、唯一 blocker 与 `suggestedNextAction` 仍由后端同一 `job.caseGate` / `workflow_case_summary` 提供：左侧对话负责状态说明与确认卡，底部进度栏负责节点计数、稳定状态和手动只读刷新。

这是纯展示层去重。`job.caseGate` 数据、Gate Action Policy、节点等待态、确认资格、输入状态、最新 Case/历史 Job 隔离、API 字段、数据库 View 与 Plan-bound executor 全部保持不变；不得通过前端复制 Gate 计算来填补被删除的卡片。

## 已批准设计：标准项目回查与 verified Case 终态收口

`std_project_create` 成功受理后不等于 READY：Create Plan 由 `ready` 进入 `waiting_readback`，Node 05/06 投影为已通过，Node 07 从本轮回查起点按绝对 `0/3/5/8/10` 秒调用既有 `std_project/list`，命中即提前停止。回查必须同时满足项目 ID 与最新 Draft 名称一致；五次未命中保持 `created_pending_readback` / `run_readback_only`，ID 或名称不一致进入人工检查，所有分支都禁止再次 create。

verified 后由 `execute_once` 与后续 `readback_only` 共用的内部 finalizer 强校验：目标必须是同一 Case 的最新 `runtime_truth` Job、已确认 Create Plan、唯一成功 create action、唯一创建对象、最新 Draft，以及 ID/名称一致的 verified readback。通过后 Plan 才进入 `consumed`，active Case 才进入 `completed`；该收口幂等，不改写历史 Node run、不新建 confirmation/action/Job，也不产生额外平台请求。工作台完成态只读取刷新后的 `first_std_project_create_completed` 与 7/7 投影。

## 已批准设计：Create Plan 与最终 Draft 的发布绑定

`std_project_create` Plan 缺少最终 Draft 时只能保持非 ready 诊断状态，不能展示确认卡。最终 Draft 存在后，编译器先验证项目名、预算、出价、ROI、draft ID 与 payload hash 同 Plan 的 planning intent 与 execution scope 一致；在同一原子持久化内锁定 Draft、写入 `derived_from_plan_id`、`derived_from_plan_hash` 和 `plan_derivation_status=passed`，并发布 ready Plan。确认 scope 在写入 `launch_confirmations` 前再次校验该绑定、`draft_ready` Job 与 Node 04 `passed`；任何缺失只 fail-closed，confirmation 与平台 action 均不得新增。

执行中尚未产生本轮资源 Skill 输出时，Node 04 保留上一份 canonical READY，或在无稳定事实时显示 waiting；只有已完成的真实资源失败才能投影为 blocked。已确认的 Create Plan 若在 action claim 前被创建前校验阻断且零 `std_project_create` action，必须将 Plan 收口为 `consumed`、Job 进入既有人工修正终态，并保留 confirmation 供审计。修正使用 fresh Job、Draft、Plan/hash 与新 confirmation；不新增 API、Schema、View、Gate、Plan/action 类型，不自动确认或重试。

## 已批准设计：小程序实例被动就绪状态保留

`micro_app_instance` 的 `waiting_on_event_asset` 与 `waiting_on_event_configs` 是事件链中的被动就绪状态，不是独立资源准备能力。资源结果归一必须保留这两个状态，同时继续声明 `prepare_supported=false`；runner 将其聚合为 `WAITING`，Execution Plan 不生成实例动作或 `resource_prepare_unsupported:micro_app_instance` blocker。实例只有在既有事件资产详情确认 App + instance 绑定后才能进入 verified，禁止猜测实例 ID、人工映射其他实例或新增实例 executor。

事件资产候选与准备合同 ready 时，Resource Plan 继续只包含既有受控动作：事件资产、baseline 事件配置、头像、DMP、视频和产品图；小程序实例只通过事件资产链权威回查收口。本修正不新增 API、Schema、View、Gate、Plan 类型或平台写权限。

只要上述受控资源动作已形成 ready Resource Plan，Plan 元数据的当前 `root_blocker_codes` 必须为空；Node 5 在资源执行前必然存在的 payload/readback 缺口只保留为下游诊断，不能覆盖 ready Plan 的 `await_job_write_authorization` Gate。该规则不改变 Gate 排序或 Plan 类型。

## 已批准设计：Monitor 触点只读回查收口

Node 02 fresh readonly reconcile 必须以平台返回的受控触点 URL 与其 hash 的一致性作为完成条件，不能仅凭 URL hash 判定 `touchpoint_resolved`。受控 URL 只允许在内存中传递并写入既有 `mwb.account_touchpoints.touchpoint_url` 字段；对外 API、工作台、普通日志与 evidence 只保存存在性、hash、状态和脱敏引用。

回查写入后必须调用既有触点完整性校验；只有 monitor ID、受控触点引用、完整受控 URL、hash 一致性和回查证据均存在时，才可把本次 run 标为 `touchpoint_resolved`，并由 canonical `monitor_ready` 推进 Case。缺 URL、hash 或完整性不一致时只标记 `monitor_resolved_touchpoint_pending`，保留 `needs_touchpoint_readback` 与 `touchpoint_url_missing`，不创建、不重试、不生成 Plan。

`workflow_case_summary` 在 `run_monitor_readonly` 状态必须直接选择 `v_monitor_readiness.actionable_blocker_code`，不得以历史 Skill blocker 回退覆盖它。monitor 已 READY 后，`monitor_id_missing`、`touchpoint_url_missing` 和 `touchpoint_url_hash_mismatch` 等历史 Node 02 Skill blocker 必须从 root 排序中排除，让 Case 进入下一项真实非 monitor blocker。工作台回查成功提示必须读取刷新后的 canonical `monitor_ready=true`；否则只说明“已找到 monitor，但受控触点回查未完成”，并不暗示可继续创建。

## 已批准设计：最新 Case 的 Node 02 当前就绪投影

工作台的 `?case_id=` 最新 Case 视图必须把 Node 02 的当前就绪状态与历史 Skill 取证分开：账户状态读取当前 `advertiser_accounts`，触点引用与 monitor 读取 `v_monitor_readiness`。只有当前账户、受控触点与 canonical readiness 均满足时才显示通过；当前 readiness 有对应 blocker 时显示阻断；未知时显示等待。

`?job_id=` 是历史只读视图，继续展示该 Job 的 `launch_skill_runs`，不得被后续 readonly reconcile 覆盖。最新 Case 视图可在每个子项的 trace 中保留这些历史 Skill 结果供审计，但不得用它们覆盖当前 canonical 状态。此展示修复不改写 `launch_node_runs`、`launch_skill_runs`、Case Gate、root blocker 或任何平台动作。

事件资产仍按账户级合同 fail-closed：fresh readonly 先验证目标 App、唯一受控实例候选，以及当前账户的 `target_advertiser_id`、`template_ref`、动态 `template_hash` 与官方创建合同；满足后即可编译 `ensure_resource:event_asset` 与 `ensure_event_configs:baseline` 的 fresh `resource_prepare` Plan。目标实例的账户绑定、优化目标与 DBT 必须在资产详情和 configs 后分别回查；候选缺失、歧义、不受控或跨账户模板都只能形成 blocker。该专项不确认、不执行写入；未来执行必须使用新的 Task、Plan/hash 与单次确认。

## 何时使用

以下情况必须读取：

- 调整流程、Node、Skill、API、数据库、View 或报表。
- 涉及平台读写、资源准备、授权、回查、迁移或外部接口。
- 需要复用历史经验、比较多个方案或作人工关键决策。
- 变更不可逆、高风险，或会改变当前 Gate 与真值边界。

普通文案、小范围无风险修正可使用精简方案格式。

## 真值与资料优先级

```text
当前动态事实：
Postgres marketing_workbench_v2.mwb
→ 当前 Task / Context Manifest
→ 当前代码与 Schema

项目机制：
project.state.json
→ 当前逻辑图 / 数据报表契约
→ 节点注册表、合同与 runner

OE3 接口：
官方 3.0
→ 外部给定官方 3.0
→ 官方 2.0
→ 官方 2.0 copy

历史经验：
docs/project-lessons.md
→ 旧项目和历史数据库
```

| 资料 | 位置 |
| --- | --- |
| 当前流程与 Gate | `docs/project-现在的逻辑图.md` |
| 当前数据与报表 | `docs/project-数据与报表契约.md` |
| 已验证经验 | `docs/project-lessons.md` |
| OE3 官方 3.0 | `/Users/hys/knowledge/01-个人本地知识库/01-官方文档/open.oceanengine.com-3.0` |
| OE3 外部给定 3.0 | `/Users/hys/knowledge/01-个人本地知识库/01-官方文档/open.oceanengine.com-3.0-waibugei` |
| OE3 官方 2.0 | `/Users/hys/knowledge/01-个人本地知识库/01-官方文档/open.oceanengine.com-2.0` |
| OE3 官方 2.0 copy | `/Users/hys/knowledge/01-个人本地知识库/01-官方文档/open.oceanengine.com-2.0-copy` |
| 乾坤接口 | `docs/.乾坤系统/api-docs-20260827.md` |

只有 3.0 资料不足时才补查 2.0；版本冲突必须停止确认。旧项目、历史数据库和历史方案只能提供假设与测试思路，不能替代 v2 当前真值。

## 最小方案格式

每份方案至少回答：

| 项目 | 必须说明 |
| --- | --- |
| 问题与目标 | 当前现象、唯一 blocker、影响、成功标准、非目标 |
| 系统位置 | 所属 Case、流程、Node、Skill、数据层；上下游和动态真值源 |
| 事实与约束 | 已确认事实、未知项、权限、安全、兼容性和风险 |
| 方案选择 | 可选方案、推荐方案、理由、允许与禁止修改 |
| 验证与停止 | 测试、数据校验、权威回查、停止条件、回退和剩余风险 |
| 决策与依据 | 需要人工确认的选择，以及代码、Postgres、官方资料和经验来源 |

小改动可压缩为：

```text
问题 → 推荐修正 → 验收 → 停止条件
```

复杂或高风险变更必须完整展开上述六项。

## Task 与 Plan 落地

方案批准后映射为：

| Solution Design | Task / Manifest |
| --- | --- |
| 目标与非目标 | Task goal / scope |
| 系统位置与真值 | `read_order` |
| 允许与禁止修改 | `allowed_writes` / `forbidden_actions` |
| 验证方法 | `validation_plan` |
| 停止与回退 | `stop_conditions` |
| 人工决策 | human gate / `project.state.json.guardrails` |

复杂、高风险或历史排查型 Task 必须声明 Solution Link，至少包含 `source`、`objective`、`current truth` 和 `stop condition`。

## 单模块专项闭环

```text
workflow_case_summary 定位唯一 blocker
→ 只读确认目标 Case / Job / 资源和证据缺口
→ 单模块 Task + Manifest
→ 单动作 immutable Plan + 最小调用上限
→ 人工确认 plan_id + plan_hash
→ 写前 fresh readonly
→ atomic claim + 单次 executor
→ 权威只读回查
→ Postgres 脱敏落账
→ workflow_case_summary 收口
→ 必要时写入 project-lessons
```

固定规则：

- 一次专项只绑定一个明确模块和 Plan action，不夹带其他平台动作。
- `planned_actions` 必须明确，调用上限取最小值，`retry_allowed=false`。
- 创建或写入响应不等于 READY；只有 list/detail/get/readback 等权威回查通过才可写 verified。
- 失败立即停止并形成 blocker；修正必须新 Plan/version、hash 和 confirmation，不重复消费旧 Plan。
- `platform_actions`、`account_resources`、`evidence_artifacts`、Plan/confirmation、Node/Skill runs 只保存脱敏状态、hash、必要 ID 和证据引用。
- 成功后只固化已验证的接口、字段合同、回查判定和停止条件；不得固化动态账户、资产、事件、预算、出价、完整 URL 或 raw request/response。
