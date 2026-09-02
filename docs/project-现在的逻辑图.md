# marketing-workbench-v2｜当前逻辑图与执行 Gate

| 元信息 | 值 |
| --- | --- |
| 文档状态 | 当前有效；静态底层机制说明 |
| 最后更新时间 | 2026-09-02 17:31 CST |
| 校验基线 | Git 当前 HEAD + `TASK-MWBV2-CANONICAL-ACCOUNT-READINESS-PROJECTION-20260902`；`project.state.json.schema_version=2026-09-01.project-control-plane-v3`；最新 migration `070_canonical_account_readiness_projection.sql` |
| 适用范围 | OceanEngine 3.0 字节小游戏路线的 Case、Job、资源准备、标准项目创建与回查机制 |
| 权威来源 | `project.state.json` → 当前 Task/Manifest → 节点注册表与合同 → `db/*.sql` / Postgres `mwb` |
| 重新校验条件 | 7 Node 注册表、资源能力、Execution Plan/确认规则、`workflow_case_summary` Gate 优先级、工作台 Case/Job 入口或 Schema/View 变化时 |

> 更新时间只证明本文件最后一次静态校验时间；账户、Case、Job、Plan、确认、资源和平台动作的当前事实必须实时读取 Postgres，消费端只读 `mwb.workflow_case_summary`。

当前机制只维护本 Markdown 文档，不再同步维护或提交配套 JPG；本地 `docs/.开发方案/` 仅作历史回收，不属于 GitHub 与运行真值。

## 1. 真值与唯一主链

```text
项目控制面
AGENTS.md → project.state.json → Task / Context Manifest
  │  规定范围、全局 Guardrail、验证与禁止项；不保存动态运行事实
  ▼
运行真值：Postgres marketing_workbench_v2.mwb
配置 / 账户 / Case / Job / Plan / 动作 / 回查证据
  ▼
唯一当前投影：mwb.workflow_case_summary
current_gate + root_blocker_codes + suggested_next_action
  ▼
frontend / API / CLI / 任务卡 / 工作台对话
只读当前投影，不反向写状态，不自行计算下一步
```

正式业务写入只有一条入口：`工作台 / HTTP API → 通用 Plan-bound executor → platforms / repositories`。CLI 不属于正式写入面，只保留 `00-oe3-workflow-cli.mjs`、`00-oe3-readonly-readiness-cli.mjs` 的安全 dry-run/readback，Node 02 状态与 readonly reconcile/配置只读同步，以及 Node 03/04、token 和合同诊断。任何 CLI 都不能绕过当前 Plan/hash、confirmation、action grant 或调用上限。

`scripts/archive/` 是可恢复隔离区，不是运行目录：禁止 `package.json` 入口、live `src/` / `scripts/` import 和直接执行。隔离文件的原路径、原因、替代入口与恢复条件只读 `scripts/archive/manifest.json`；恢复必须重新建立 Task 并按当前合同复核。

```text
工作台三项输入（route + game + advertiser）
→ 验证路线×游戏默认配置
→ 账户缺失时执行乾坤 accountIndex 精确只读预检
→ 唯一命中且身份合同完整：写 canonical `auth_status` 的 advertiser_accounts + 脱敏 evidence
→ 创建或复用 active Case → fresh runtime Job
→ 先读取唯一 Gate：`run_monitor_readonly` 时自动 fresh readonly reconcile
→ 已有且 canonical READY 的 monitor：同一 Job 自动 dry_run 继续资源检查
→ 无 monitor且合同完整：保存唯一 ready monitor_bootstrap Plan并返回确认卡
```

账户发现只补齐当前 route×game×advertiser 记录，不继承其他账户的 monitor、触点或动态资源 ID。零/多匹配、凭据异常、owner/agent/媒体主体缺失或既有账户 scope 冲突均在 Case/Job 前 fail-closed。自动阶段只读平台并写内部事实；`launch_confirmations`、`platform_actions`、`monitor_provision_attempts` 仍必须等到精确“确认创建 monitor”后才可产生创建记录。

账户状态只允许在 `advertiser_accounts` 唯一持久化入口归一：“授权正常”“已授权”“ready”“active”均为 `ready`，其余值保持 fail-closed。`workflow_case_summary` 对最新 Job 读取当前同 scope 账户：账户存在时历史 `account_missing` 不再阻断，账户为 `ready` 时历史 `account_not_ready` 不再阻断；Skill 历史仍在 `?job_id=` 审计视图保留。没有当前账户或状态非 READY 时，原 blocker 与 Gate 不变。

```text
Case
→ fresh runtime Job（必须显式 case_id）
→ Node 01–04：只读发现、核验和资源 Plan 编译
→ BLOCKED / Resource Plan ready / Create Plan ready
→ 精确 plan_id + plan_hash 的人工确认
→ 已确认资源动作写后回查
→ fresh Draft + Create Plan + 再次确认
→ 单次 std_project/create
→ 权威只读回查
→ 脱敏证据落账 → workflow_case_summary 收口
```

| 层 | 权威内容 | 不承担 |
| --- | --- | --- |
| 项目文件 | 静态机制、任务范围、全局 Guardrail | 动态账户和平台结果 |
| `src/` | Node、Skill、Plan、executor、接口与脱敏合同 | 当前业务状态 |
| `db/*.sql` | Schema、约束、View、投影逻辑 | 外部平台写入 |
| `mwb` 表 | 配置、运行证据、授权、动作、回查 | 前端下一步推导 |
| `workflow_case_summary` | Case 当前 Gate、唯一 root blocker、建议动作 | 历史细节和反向写入 |

## 2. 三阶段七 Node

节点定义唯一来源：`src/workflows/skills/oe3/00-workflow-node-registry.mjs`；Skill 合同唯一来源：`00-contracts.mjs`；调度唯一来源：`00-runner.mjs`。

| 阶段 | Node | 主要输入 | 产物 | 写入边界 |
| --- | --- | --- | --- | --- |
| 准备 | 01 `launch_intake` | route、game、advertiser | 规范化 intake | 不访问平台 |
| 准备 | 02 `creation_context` | 账户、触点、monitor、平台 App | 创建上下文 | monitor 是独立 bootstrap，不混入广告创建写入 |
| 准备 | 03 `game_launch_pack` | 游戏主档、默认值、物料、备用页、蓝图 | 游戏保底包 | 不从历史账户复制动态资源 ID |
| 就绪 | 04 `account_resource_prepare` | 当前账户 fresh readonly、资源蓝图 | `account_ready_report`、资源 Plan 输入 | 未确认前零平台写入 |
| 就绪 | 05 `std_project_draft_builder` | 已验证资源、字段合同、查重 | Draft、payload hash、创建就绪 | 不创建项目 |
| 创建执行 | 06 `std_project_create_executor` | 已确认 Create Plan | 创建动作与对象记录 | 每份确认 Plan 仅一次调用 |
| 创建执行 | 07 `readback_closer` | 创建对象和 Draft | 权威回查与证据 | 不补发 create 修复 |

运行模式由 runner 决定：`dry_run` 与 `draft_readiness` 不真实写入；`planned_actions` 仅限明确计划动作；`execute_once` 只能消费冻结且已确认的 Plan；`readback_only` 绝不创建。

JSZC 的 Node 03/05 保底链只消费当前 PostgreSQL 路线默认值：CTA 为保留“立即试玩”后追加 4 项，预算/出价/ROI 为 `66666/366/0.16`，定向为男性与五档年龄，投放时段为 336 位半小时排期。Node 05 同时校验合法枚举、顺序、长度、时段摘要、92 条字段账本与至少 10 个目标账户 fresh readonly DMP 排除 ID；任一漂移 fail-closed。DMP、素材、事件资产、小游戏实例、Aweme 授权和触点仍在 Node 04 按账户动态读取，不复制进路线默认值。

### Node 02 Monitor 单轨 Bootstrap

```text
v_monitor_readiness（唯一状态读取）
→ fresh readonly reconcile
→ monitor_bootstrap Plan（仅 ensure_monitor）
→ 精确 Plan ID/hash 的独立“确认创建 monitor”
→ Guardrail + confirmation + action grant
→ fresh readonly 查重 → atomic claim → 单次创建 → 权威回查
→ 脱敏证据与触点落账
→ monitor 创建及权威回查通过，刷新同一 Job 的 Case Gate
→ 工作台按 Gate 自动继续当前 Job 的 readonly / 正常 01–07，停在下一确认卡、真实 blocker 或完成态
```

`monitor-state-read` 只读 Postgres；`monitor-readonly-reconcile` 是受 Gate 调度的外部只读；`monitor-plan-compile` 纯编译；`monitor-execute-once` 只在已确认的 `monitor_bootstrap` Plan 内执行。通用 runner 不会代替该 Plan 创建 monitor。

最新 Case 视图中的 Node 02 子项使用当前账户事实与 `v_monitor_readiness`：账户状态只表示账户可用性，触点引用表示受控触点与回查完整性，monitor 表示 canonical `monitor_ready`。同一 Job 的历史 Skill 结果仅作为 trace；`?job_id=` 继续按历史 Skill 显示，不使用后续 reconcile 覆盖。节点已落账进度仍属于 Job 执行历史，不能由展示层回写。

## 3. Node 04：资源状态与准备边界

```text
游戏级资源蓝图 + 目标账户 fresh readonly
  ├─ 唯一命中、可用、字段合同和权威回查通过 → READY
  ├─ 缺失，但 prepare_supported 且 executor / 调用上限 / 回查合同齐全 → PLANNED
  └─ 只读失败、多候选、来源或合同缺失、executor 缺失、回查失败 → BLOCKED
```

`micro_app_instance` 例外地允许输出 `waiting_on_event_asset` / `waiting_on_event_configs`：这两个状态在统一归一、Node 04 聚合和 Plan 编译中始终保持 `WAITING`，不生成独立准备动作，也不得降级为 `resource_prepare_unsupported`。其 READY 只来自事件资产详情与后续事件链权威回查。

事件资产是账户级受控合同，不是通用模板开关：先校验当前账户、当前小游戏 App、唯一且来源受控的实例候选和版本化创建模板；候选缺失、歧义或来源不受控分别 fail-closed。该阶段可直接生成带 `target_advertiser_id`、`template_ref` 与动态 `template_hash` 的脱敏合同，并在同一未确认 `resource_prepare` Plan 中连续冻结 `ensure_resource:event_asset` 与 `ensure_event_configs:baseline`。资产创建或发现后，必须用 detail 同时确认 App + instance 绑定，才可标记目标实例已核验并把真实 asset ID 仅传给本次 configs 执行；configs 6/6 后才调用带 asset_id 的 `optimized_goal/get` 和 `dbt/get`。不带 asset_id 的实例 optimized-goal 调用只可选诊断和审计，不能生成 Plan 或改变 Gate/READY 真值。

平台 detail 的 `micro_app_id` / `micro_app_instance_id` 分别归一为标准 App / instance；兼容字段仍按 allowlist 处理。`asset_id`、`micro_app_instance_id`、`instance_id`、`mini_program_instance_id` 等长数字 token 必须在 `JSON.parse` 前无损保留为字符串；未列入 allowlist 的数值保持原解析语义。字段缺失、绑定失配、候选歧义、响应无效或解析失败均保持 fail-closed，且不得保存 raw response。

历史 verified 不会因一次只读降级被覆盖为 missing；但历史 verified 也不能跳过本轮 verify-only Gate。共享备用页的目标 `SHARE` 清单请求降级时，保留最后一次 verified 资源事实，同时以 `site_get_target_shared_blocked` 阻断本轮 Plan。

| 必需资源 | 可自动准备 | Plan action | READY 的权威依据 / 固定边界 |
| --- | ---: | --- | --- |
| avatar | 是 | `ensure_resource:avatar` | 头像源合同与目标账户回查 |
| dmp_audience_package | 是 | `ensure_resource:dmp_audience_package` | 来源/目标逐包只读与目标可投回查 |
| event_asset | 是 | `ensure_resource:event_asset` | 资产唯一命中、App/实例绑定、事件链回查 |
| video_asset | 是 | `ensure_resource:video_asset` | 视频、封面和目标账户可见性回查 |
| product_image | 是 | `ensure_resource:product_image` | 108×108 PNG、hash 与目标素材回查 |
| brand_info | 否 | — | 品牌与行业只读；缺失即 blocker |
| micro_app_instance | 否 | — | 创建前只允许唯一受控候选；event asset detail 确认 App + instance 绑定后才标记目标账户已核验；不猜测、不创建 |
| backup_landing_page | 否 | — | 仅人工共享后读取目标 `SHARE` 清单；不使用普通库存或非正式共享接口替代 |

已确认资源动作严格按以下顺序消费；每项均需 Plan 内授权、原子 claim、一次写入与权威回查：

```text
ensure_resource:event_asset
→ ensure_event_configs:baseline
→ ensure_resource:avatar
→ ensure_resource:dmp_audience_package
→ ensure_resource:video_asset
→ ensure_resource:product_image
```

## 4. Plan、确认与执行

```text
任一 BLOCKED
  → blocked Plan → root blocker → 不可确认、零平台写入

存在 PLANNED
  → Resource Plan（只含资源 ensure action）
  → plan_id + plan_hash + action / limit 人工确认
  → confirmed-resource-orchestrator
  → 每项 atomic claim → write once → authoritative readback
  → 全部通过后消费 Plan，在同一 Case 创建 fresh runtime Job

全部 READY
  → Node 05 Draft / payload contract / duplicate readonly
  → Create Plan（只含 std_project_create）
  → plan_id + plan_hash + target payload hash 人工确认
  → Node 06 create once → Node 07 readonly readback
```

每份 Execution Plan 固定绑定 `case_id`、`job_id`、`advertiser_id`、`plan_id`、`plan_hash`、版本、计划动作、调用上限、资源状态、blocker 与目标 Draft/payload hash。写入必须同时通过：

ready 的 `resource_prepare` Plan 已接管当前 Gate 时，其当前根 blocker 为空；资源尚未执行所导致的 Node 5 payload/readback 缺口仍可作为下游诊断保留，但不得写入该 ready Plan 的 `metadata.root_blocker_codes` 并覆盖确认 Gate。

```text
project.state.json.guardrails 的全局范围
              +
launch_confirmations 的同一 plan_id + plan_hash 确认
              +
plannedActionGrant / executionGrantScope 的动作、次数、目标 Job 与 attempt 校验
```

`plan_kind` 只允许 `monitor_bootstrap`、`resource_prepare`、`std_project_create`、`readiness_blocked`。`monitor_bootstrap` 的 Draft/payload 为空、最大平台调用为 1、`retry_allowed=false`，且不得混入资源或广告项目动作。

| 场景 | 行为 |
| --- | --- |
| 确认前 | 无最终 Draft 的 Create Plan 不得 ready；最终 Draft 与 exact Plan ID/hash 的原子绑定、`draft_ready` Job 与 Node 04 passed 后才可确认，旧版失效 |
| 已确认资源动作失败、超时或响应不明 | 当前 action 记为 `failed_once`，停止后续动作并执行可用的权威只读回查；父 action、blocked Skill、`blocked_confirmed_resource_plan` Job 与旧 Plan 必须终态收口，旧 Plan 进入 `consumed`；不自动重试 |
| 每份 Create Plan | 仅调用一次 `std_project/create` |
| 创建前 fail-closed 的修正 | 已确认但零 create action 的 Plan 收口为 consumed、Job 进入人工修正终态；必须新 Draft、payload hash、Plan、confirmation 和 attempt；最多 3 次，不自动重试 |
| 创建成功受理、尚未 verified | Create Plan 严格进入 `ready → waiting_readback`；Node 05/06 通过、Node 07 等待；只允许 `readback_only`，不得再次创建 |
| Node 07 当轮同步回查 | 从本轮起点按绝对 `0/3/5/8/10` 秒调用 `std_project/list`，命中即停止；整轮硬截止 25 秒；未命中保持待回查，ID/名称不一致转人工检查 |
| 超时、异常或响应不明 | action 标记为结果不明且不重试；仅项目 ID 与最新 Draft 名称严格匹配的 verified readback 可将 action 标为“由回查确认成功”，再按正常链关闭 Plan、Job 与 Case |
| 平台明确业务失败 | 不得通过同名对象回查改为成功；Create Plan 直接 `consumed`，Job 为人工修正终态，必须新 Job/Draft/Plan/confirmation |
| 首次创建 + ID/最新 Draft 名称一致 + 回查 verified | Create Plan 进入 `consumed`；共享 finalizer 强校验最新 runtime Job、确认、成功 action、唯一对象、最新 Draft 与 verified readback 后，将 Job 与 Case 收口为 `completed` 并投影 `first_std_project_create_completed` |

平台长数字 ID 默认按字符串存储与比较；仅官方要求 number token 的字段使用专用无损 wire 编码，禁止经 JavaScript Number 截断。

所有生产平台 HTTP 请求只能经过唯一 deadline 封装：普通 JSON 单次 15 秒、文件上传单次 60 秒；封装组合已有 `AbortSignal`、超时中止与 timer 清理，不引入自动重试。读超时落既有只读失败与脱敏 `timeout` 诊断；写超时、异常或响应不明只允许权威只读回查。事件配置保留 15 秒 deadline。每个 create 子 action 的幂等键由已验证 planned action key、当前 Plan ID 与 event type 共同组成；任一绑定缺失时在 action 占位和平台调用前 fail-closed，request hash 仅作请求证据。partial baseline 只能由共享 `eventConfigBaselineReadiness` 在 `event_configs/get` 与 `available_events/get` 都完成标准化后分类；读取函数不得把 available 自身是否 6/6 当成提前 Gate。分类以“已配置集合 ∪ 当前 available 集合”判断覆盖：已配置事件即使不再 available 也视为满足；只有尚未配置且当前 available 的事件可生成 create candidate，尚未配置且不可用继续 fail-closed。Node 04 复用这一结论，仅保存两端计数作诊断。平台响应不明统一映射为 `confirmed_resource_execution_interrupted`，只允许沿既有“重新只读准备”路径创建 fresh readonly Job。

## 5. 当前 Case Gate 与工作台

`mwb.workflow_case_summary` 是唯一当前 Gate。`root_blocker_codes` 仅保留一个最高优先级 blocker；`structural_blocker_codes` 保留完整结构性取证集合。

| 优先级 | 条件 | `current_gate` | 消费端动作 |
| ---: | --- | --- | --- |
| 1 | 非 active 且有完整 verified 完成证据 | `first_std_project_create_completed` | 只读完成投影 |
| 2 | 非 active 且证据不完整 | `review_latest_job` | 只读检查最新 Job；不展示确认、重试或执行入口 |
| 3 | 已创建对象但未 verified readback | `run_readback_only` | 只读回查 |
| 4 | 创建次数已达上限且仍未 verified | `manual_review_after_attempt_limit` | 人工复盘 |
| 5 | Job 等待人工修正 | `prepare_corrective_attempt` | 修正 payload 后准备新版本 |
| 6 | monitor 为 `needs_readonly` / `needs_touchpoint_readback` | `run_monitor_readonly` | 执行一次 fresh readonly reconcile；唯一 root blocker 直接取 canonical monitor blocker |
| 7 | confirmed-resource 执行停止、monitor/上下文、资源或 Plan 根阻断 | `resolve_case_blocker` | 按依赖顺序处理唯一 root blocker；终态 `monitor_create_busy_retry_exhausted` 仅可精确“重新只读回查 monitor”；其他 blocker 可精确“重新只读准备” |
| 8 | 首次创建并已 verified | `first_std_project_create_completed` | Case 完成 |
| 9 | 最新 Plan ready | `await_job_write_authorization` | 展示绑定 Plan 的确认卡 |
| 10 | Job created/running/waiting | `run_fresh_readiness` | 执行只读就绪检查 |
| 11 | 其他终态 | `review_latest_job` | 只读检查最新 Job |

```text
唯一入口：http://127.0.0.1:3000/
  ├─ 根页默认 idle，只读列出 active runtime Case；不加载最近账户
  ├─ ?case_id=：恢复该 Case 的最新 Job，可继续受 Gate 约束的工作流
  └─ ?job_id=：仅历史只读查看，Node 02 保留该 Job 的历史 Skill 状态

同一 route×game×advertiser 最多一个 active runtime Case；重复启动请求恢复该 Case，不创建新 Case 或 fresh Job。case_id 与 job_id 同时出现、格式非法或目标不存在时 fail-closed，不能回退到其他账户。

右侧 Workflow 面板是节点注册表的固定结构投影：只保留 3 阶段 7 Node、节点流、子节点详情和运行状态，标题后不再设置独立 Case Gate 卡片。动态 Gate、唯一 blocker 与下一步仍只读取同一 `job.caseGate` / `workflow_case_summary`：左侧对话展示状态说明和确认卡，底部操作栏保留“进度 n/7 + 刷新进度”。同一 Gate 数据仍控制节点等待态、确认资格与输入状态；去除重复卡片不等于删除后端字段或创建第二套前端逻辑。

用户消息 → allowlist Intent Resolver → Gate Action Policy（只读 summary）
→ 状态说明 / safe readonly / 脱敏确认卡
→ 仅 active Case 的最新 Job、唯一 `monitor_create_busy_retry_exhausted` blocker 且 `monitor_resolved=false` 时，精确“重新只读回查 monitor”可调用 Node 02 fresh readonly reconcile
→ 正常启动、monitor Plan 成功与 Resource Plan 成功后，唯一有界推进器自动消费 latest active Job 的 `run_monitor_readonly` / `run_fresh_readiness`；不消费写入确认、`run_readback_only`、blocker 或历史 Job
→ 已有正常 Case 若仍停在 `run_monitor_readonly`，一次“继续执行”完成该回查后同样交给推进器继续 readonly；终态专用“重新只读回查 monitor”仍只做一次回查
→ active Case 最新 Job 为 `resolve_case_blocker` 时，精确“重新只读准备”只执行恢复性 readonly：`blocked_confirmed_resource_plan` 先以 Case lock 创建同一 Case 的 fresh runtime Job，再 `dry_run`；其他 blocker 只重跑当前 Job 的 `dry_run`；不复用旧 Plan/confirmation/action/grant
→ 仅精确“确认准备资源”“确认创建”或“确认创建 monitor”且 plan_id + plan_hash 未漂移时，才进入对应既有 Plan-bound executor
→ Resource Plan 成功后自动切换到同一 Case 的 fresh Job；重新只读准备后只展示第二张 Create Plan 确认卡
```

本机正式运行的授权来源是固定 `workbench_runtime_write_policy` 加当前 Plan-bound confirmation；它只允许 loopback command、active Case 最新 runtime Job、ready Plan、精确 ID/hash/短语和一次消费。仓库 Task scope 只服务开发、迁移或专项人工写入，不再是普通用户从工作台完成首次创建的运行时前置条件。

`?case_id=` 底栏的“刷新进度”只读调用当前 Case summary，再读取其最新 Job view；若 Job 已切换，页面只在内存中切到该 Job。前端命令或 dry-run 请求期间可按 1.2 秒短暂重复这一只读同步，结束后立即停止；这不是后台队列、不会推动节点、更不构成执行授权。`?job_id=` 仅刷新自身历史 Job，根页不轮询。

Intent Resolver 只规范化意图和输入槽位；不计算 Gate、不选择平台动作、不扩大 Guardrail。对话、前端、API、CLI 和任务卡均不得持久化 raw transcript 或自行推导下一步。工作台只把 blocker code 映射为展示文案；Gate 与 suggested action 仍只来自 View。

## 6. 引用与边界

| 需要确认的内容 | 优先读取 |
| --- | --- |
| Node、Skill、子流程与模块归属 | `00-workflow-node-registry.mjs`、`00-contracts.mjs` |
| 资源 prepare 支持与顺序 | `04-resource-action-registry.mjs` |
| Plan/确认/执行约束 | `executionPlan.mjs`、执行 scope、当前 Task/Manifest |
| 当前 Gate、blocker、下一步 | `mwb.workflow_case_summary` |
| 数据表、View 与报表字段 | `docs/project-数据与报表契约.md`、`db/*.sql` |
| 正式入口与隔离脚本 | 工作台/API、`scripts/archive/manifest.json`；archive 仅供恢复审计 |

项目文件与普通日志只允许保存脱敏摘要、hash、必要 ID、状态、字段路径和证据引用；禁止保存 token、secret、Cookie、auth_code、完整 URL、raw request、raw payload 或 raw response。
