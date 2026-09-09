# marketing-workbench-v2｜当前逻辑图与执行 Gate

| 元信息 | 值 |
| --- | --- |
| 文档状态 | 当前有效；静态底层机制总览 |
| 最后更新时间 | 2026-09-09 CST |
| 校验基线 | 当前代码、Schema migrations 至 `078`、Node 注册表与数据契约 |
| 适用范围 | OceanEngine 3.0 字节小游戏路线的 Case、Job、资源准备、标准项目创建与权威回查 |
| 权威来源 | 实现查注册表/代码/SQL，业务事实查 Postgres；本文只解释静态机制与消费者边界 |
| 重新校验条件 | 7 Node 注册表、资源能力、Plan/确认规则、`workflow_case_summary` Gate 优先级、工作台 Case/Job 入口或 Schema/View 变化时 |

> 本机制在当前 OE3 字节小游戏路线内通用，并非跨平台、跨路线的抽象承诺。路线差异必须进入配置、资源注册表、字段合同或平台适配器，不能变成账户、Case、Job 或用户 ID 特例。

> 本文不保存账户、Case、Job、Plan、资源、确认或平台动作当前状态。它们的唯一运行真值是 Postgres；消费者只读 `mwb.workflow_case_summary`。

## 1. 总机制：真值、主链与不变量

### 1.1 五个维度与唯一所有者

| 要回答的问题 | 机制维度 | 唯一所有者 | 消费原则 |
| --- | --- | --- | --- |
| 项目允许做什么 | 控制面、任务范围、全局 Guardrail | `AGENTS.md`、`project.state.json`、active Task/Manifest | 不保存业务动态事实 |
| 当前事实是什么 | 配置、账户、Case、Job、Plan、动作与证据 | Postgres `marketing_workbench_v2.mwb` | 代码与 Markdown 不复制当前状态 |
| 流程由哪些模块组成 | 3 阶段 7 Node、Skill、runner | `00-workflow-node-registry.mjs`、`00-contracts.mjs`、`00-runner.mjs` | Node 是模块结构，不是动态事实 |
| 平台写入是否被允许 | 冻结 Plan、确认、action grant 与调用上限 | Execution Plan 合同与 runtime policy | 缺一不可，不能用 CLI 绕过 |
| 现在下一步是什么 | Gate、唯一 root blocker、建议动作 | `mwb.workflow_case_summary` | 前端/API/CLI 只读投影，不自行推导 |

```text
本人输入 route + game + advertiser
→ 账户 owner 精确只读校验
→ active Case + fresh runtime Job
→ Node 01–04：发现、核验、Plan 编译
→ BLOCKED / Resource Plan ready / Create Plan ready
→ 精确 plan_id + plan_hash 人工确认
→ Plan-bound executor 单次写入
→ 权威只读回查与脱敏证据
→ workflow_case_summary 投影唯一 Gate、blocker 与下一步
```

正式业务写入只有一条链：`工作台 / HTTP API → 通用 Plan-bound executor → platforms / repositories`。CLI 只能用于 dry-run、状态、readback 和明确标注的安全诊断，不能成为旁路写入入口。

### 1.2 不变量

- 账户归属在 Case/Job 前精确校验；普通用户只能读取、运行和确认本人账户，管理员不代操作他人账户。
- `Case` 表示持续业务目标，`Job` 表示一次运行；同一 `route × game × advertiser` 最多一个 active runtime Case，fresh Job 不继承旧确认或动作。
- 未确认前只读或编译 Plan；资源准备与标准项目创建始终是两份独立 Plan，monitor 是 Node 02 的独立 bootstrap。
- 每份确认 Plan 只消费冻结动作一次；失败、漂移或修正必须使用 fresh Job/Plan/confirmation，禁止自动重试。
- 平台受理或界面显示不等于 verified；只有权威只读回查通过，才能把资源或创建对象标为 verified。

## 2. 流程模块：三阶段七 Node

节点定义只来自 `src/workflows/skills/oe3/00-workflow-node-registry.mjs`。下表说明模块责任；动态进度、子节点结果和等待态仍以 Job 与 Case summary 为准。

| 阶段 | Node | 输入 → 输出 | 固定边界 |
| --- | --- | --- | --- |
| 准备 | 01 `launch_intake` | route、game、advertiser → 规范化 intake | 不访问平台；owner 校验属于建档前访问控制，不是 Node |
| 准备 | 02 `creation_context` | 账户、触点、monitor、平台 App → 创建上下文 | monitor 只能由独立 `monitor_bootstrap` Plan 创建，不混入项目创建 |
| 准备 | 03 `game_launch_pack` | 主档、默认值、物料、备用页、资源蓝图 → 游戏保底包 | 不从历史账户复制动态资源 ID |
| 就绪 | 04 `account_resource_prepare` | 目标账户 fresh readonly、资源蓝图 → `account_ready_report`、资源 Plan 输入 | 未确认前零平台写入 |
| 就绪 | 05 `std_project_draft_builder` | 已验证资源、字段合同、未删除同名与语义标的/竞价策略查重 → Draft、payload hash、创建就绪 | 不创建项目；列表字段或分页不完整时 fail-closed |
| 创建执行 | 06 `std_project_create_executor` | 已确认 Create Plan → 创建动作与对象记录 | 一份 Create Plan 仅一次 `std_project/create` |
| 创建执行 | 07 `readback_closer` | 创建对象、Draft → verified readback 与证据 | 不以补发 create 修复回查问题 |

运行模式共有六类：`dry_run` 与 `draft_readiness` 不写平台；`planned_actions` 只编译明确计划动作；`execute_once` 只能消费已确认 Plan；`readback_only` 绝不创建；`aweme_auth_readonly` 仅运行至 Node 04 的抖音号授权只读核验，不生成 Draft 或 Plan。

## 3. 状态维度：资源就绪与 Case Gate

### 3.1 Node 04 资源状态

资源状态不是另一套流程，Node 04 用它决定能否继续、能否编译资源 Plan：

| 状态 | 含义 | 后续 |
| --- | --- | --- |
| `READY` | 目标账户唯一命中、字段合同与权威回查均通过 | 可进入 Node 05 |
| `PLANNED` | 资源缺失，但 `prepare_supported=true` 且执行器、调用上限与回查合同齐全 | 仅进入 Resource Plan 确认卡 |
| `BLOCKED` | 只读失败、多候选、来源/合同/执行器缺失或回查失败 | 形成唯一 root blocker，零平台写入 |

当前 OE3 资源能力由 [资源动作注册表](../src/workflows/skills/oe3/04-resource-action-registry.mjs) 定义：可受控准备的是 `avatar`、`dmp_audience_package`、`event_asset`、`video_asset`、`product_image`；`brand_info`、`micro_app_instance`、`backup_landing_page` 缺失时只形成 blocker。`micro_app_instance` 的等待状态与事件链、逐资源证据、动作顺序和调用量只查该注册表及其引用合同。

视频引导与显式封面是独立的账户 capability：`guide_video_required=true` 时，当前 Job 必须从已核验小游戏实例只读解析唯一 `guide_video_id`，并将同一 ID 写入每条 required video；`video_cover_required=true` 时才额外要求每条视频有当前 Job 已核验的 `video_cover_id`。仅引导视频组合允许省略封面字段并使用平台默认封面；两项均未启用时省略引导视频字段。动态 ID 只保存在 Postgres 当前资源/Job 事实中，不能进入路线默认值或账户特例代码。

### 3.2 当前 Case Gate

`workflow_case_summary` 每个 Case 只给出一个 `current_gate`、零或一个 `root_blocker_codes` 与一个 `suggested_next_action`。SQL View 决定精确优先级；下表只按消费者行为分组，不复制第二套 Gate 规则。

| Gate | 消费端可做的事 |
| --- | --- |
| `first_std_project_create_completed` | 只读完成投影；必须已有完整 verified 创建与回查证据 |
| `review_latest_job` | 只读查看终态或不完整证据；不展示确认或重试入口 |
| `run_readback_only` | 只执行权威只读回查，绝不再次创建 |
| `prepare_corrective_attempt` / `manual_review_after_attempt_limit` | 明确创建失败后先按 Case 尝试次数处理；新 Attempt 或替代 Case 都须 fresh readonly，不能重放旧授权 |
| `run_monitor_readonly` / `resolve_case_blocker` | 处理 monitor、上下文、资源或 Plan 的唯一 blocker；只允许 Gate Policy 精确放行的恢复性 readonly |
| `await_job_write_authorization` | 只展示与当前 ready Plan 精确绑定的确认卡 |
| `run_fresh_readiness` | 继续当前 Job 的只读就绪检查，编译或复用后续 Plan |

## 4. 执行维度：Plan、确认、单次写入与回查

### 4.1 三类可确认 Plan

| Plan | 仅可包含 | 产生位置 | 不可包含 |
| --- | --- | --- | --- |
| `monitor_bootstrap` | 一次 `ensure_monitor` | Node 02 monitor 缺失且合同完整 | 资源动作、项目创建 |
| `resource_prepare` | 注册表支持的 `ensure_resource:*` 及其受控依赖动作 | Node 04 存在 `PLANNED` 资源 | `std_project_create` |
| `std_project_create` | 一次 `std_project_create` | Node 05 Draft、字段合同和查重均通过 | monitor 或资源准备动作 |

`readiness_blocked` 仅表达不可执行的就绪检查结果，不能确认或写平台。每份可执行 Plan 都冻结 `case_id`、`job_id`、`advertiser_id`、`plan_id`、`plan_hash`、版本、动作、调用上限、资源状态、blocker 与必要的 Draft/payload hash。

```text
全局 Guardrail
        + 同一 plan_id + plan_hash 的本人 confirmation
        + action grant / execution scope 的目标、动作与调用次数校验
        = 唯一允许的平台写入
```

确认前会重新执行所需 fresh readonly；任一资源、调用量、hash、授权或标准项目重复状态漂移都会停止当前 Plan。Node 05 的重复判定始终排除 `PROJECT_STATUS_DELETE`，并同时检查名称与路线合同指定的语义标的字段；任一列表分页、状态过滤或比较字段不可靠均不得确认创建。写入后必须原子记录动作，并以权威只读回查决定 READY、verified、waiting readback 或 blocker。HTTP deadline、幂等键、事件配置顺序、字段编码和最终一致性窗口是执行合同，分别查 `executionPlan.mjs`、资源执行器与数据契约，不在本总览重复。

## 5. 当前 Case Gate 与工作台

工作台是机制的消费者，不是 Gate 计算器：

```text
用户消息
→ allowlist Intent Resolver（只识别意图与输入槽位）
→ Gate Action Policy（只读 summary）
→ 状态说明 / safe readonly / 脱敏确认卡
→ 已确认 Plan 才进入通用 executor
```

- 根页保持 idle，只读列出 active runtime Case；`?case_id=` 恢复该 Case 的最新 Job，`?job_id=` 只读查看历史 Job。无效、越权或冲突的 scope fail-closed，不回退到其他账户。
- Node 面板固定投影 3 阶段 7 Node；动态 Gate、唯一 blocker 和下一步只来自 `workflow_case_summary`。对话、前端、API、CLI 和任务卡不得保存 raw transcript、写回状态或自行计算下一步。
- “继续执行”只能触发当前 Gate 允许的只读流程；只有精确“确认准备资源”“确认创建”或“确认创建 monitor”且 Plan ID/hash 未漂移，才能消费对应 Plan。
- 已停止的资源或 monitor Plan 只能通过 Gate Policy 允许的 fresh readonly 恢复，不复用旧 Plan、confirmation、action grant 或 idempotency key；所有特殊恢复分支以 [Gate Action Policy](../src/workflows/gateActionPolicy.mjs) 为准。

普通项目文件、日志、API 和前端只可保存脱敏摘要、hash、必要 ID、状态、字段路径和证据引用；禁止保存 token、secret、Cookie、auth_code、密码、完整触点 URL、raw request、raw payload 或 raw response。

## 6. 路线适配与权威引用

下列细节必须在其唯一位置维护；新增能力应扩展合同或注册表，而不是扩写本总览或加入账户特例。

| 需要确认的内容 | 唯一或优先读取位置 |
| --- | --- |
| 项目启动、任务范围、全局 Guardrail、归档边界 | `AGENTS.md`、`project.state.json`、active Task/Manifest |
| 方案方法与已批准关键选择 | [Solution Design](Solution%20Design.md) |
| Node、Skill、子流程与模块归属 | `00-workflow-node-registry.mjs`、`00-contracts.mjs`、`00-runner.mjs` |
| 资源类型、prepare 支持、动作顺序、证据与调用量 | [资源动作注册表](../src/workflows/skills/oe3/04-resource-action-registry.mjs) |
| Plan 编译、hash/binding、确认范围与执行约束 | [Execution Plan](../src/workflows/executionPlan.mjs) 与执行 scope |
| Case 当前 Gate、blocker、下一步及字段含义 | `mwb.workflow_case_summary`、[数据与报表契约 §4](project-数据与报表契约.md#4-workflow_case_summary-合同) |
| 路线默认值、字段账本、资源来源、长 ID 存储 | [数据与报表契约](project-数据与报表契约.md) |
| 对话命令与恢复性只读行为 | [Gate Action Policy](../src/workflows/gateActionPolicy.mjs) |
| 乾坤接口参数、响应与平台细节 | [当前乾坤 API 文档](qiankun-api-docs-20260827.md) |
| 网络、部署、启动与凭据录入 | [部署说明](../deploy/README.md) |
