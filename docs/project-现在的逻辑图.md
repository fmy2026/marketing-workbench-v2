# marketing-workbench-v2｜唯一底层机制：Workflow Skill → Case Gate → 执行闭环

| 元信息 | 值 |
| --- | --- |
| 文档状态 | 当前有效；静态底层机制总览 |
| 最后更新时间 | 2026-09-10 CST |
| 校验基线 | 当前代码、Schema migrations 至 `080`、Node/Skill/资源注册表与数据契约 |
| 适用范围 | OceanEngine 3.0 字节小游戏路线的 Case、Job、资源准备、标准项目创建与权威回查 |
| 重新校验条件 | Node/Skill、runner mode、资源能力、Plan/确认、Case summary、工作台入口或 Schema/View 变化时 |

> “唯一”指每类事实只有一个权威所有者，不表示本路线机制可直接泛化到其他平台。本文不保存任何账户、Case、Job、Plan、资源、确认或平台动作的当前状态；动态业务事实只查 Postgres。

## 1. 唯一闭环与真值分工

```text
本人作用域 Intake
→ active Case + fresh Job
→ runner 按 3 阶段 7 Node 调度 Workflow Skill
→ monitor / 账户资源 / Draft 就绪判定
→ BLOCKED、WAITING 或冻结 Plan
→ plan_id + plan_hash + 本人精确确认 + action grant
→ 有界 Plan-bound executor
→ 权威只读回查与脱敏证据
→ workflow_case_summary 投影唯一 Gate、root blocker、next action
→ 工作台只消费投影，不自行计算状态
```

| 问题 | 唯一所有者 | 消费边界 |
| --- | --- | --- |
| 项目和任务允许什么 | `AGENTS.md`、`project.state.json`、active Task/Manifest | 不保存业务动态事实 |
| 当前业务事实是什么 | Postgres `marketing_workbench_v2.mwb` | Markdown、前端和代码不复制当前状态 |
| Workflow 如何组成和调度 | Node 注册表、Skill 合同、runner | Node 是模块结构；Skill run 才是 Job 过程事实 |
| 平台动作是否可执行 | 冻结 Plan、confirmation、action grant、runtime policy | 缺一不可，CLI 不得旁路写入 |
| Case 现在该做什么 | `mwb.workflow_case_summary` | 每个 Case 只投影一个 Gate、零或一个 root blocker 和一个 next action |

正式业务写入只有 `工作台 / HTTP API → 通用 Plan-bound executor → platforms / repositories` 一条链。CLI 只允许 dry-run、状态、readback 和明确标注的安全诊断。

## 2. Workflow Skill：三阶段七 Node

Node 结构只由 [Node 注册表](../src/workflows/skills/oe3/00-workflow-node-registry.mjs) 定义；Skill 的依赖、输入、输出、停止条件与写入责任查 [Skill 合同](../src/workflows/skills/oe3/00-contracts.mjs)；mode 的实际顺序只查 [runner](../src/workflows/skills/oe3/00-runner.mjs)。

| 阶段 / Node | Skill 组 | 核心职责 → 输出或停止分支 |
| --- | --- | --- |
| 准备 01 `launch_intake` | `intake-normalize` | route、game、advertiser 规范化为 intake；缺字段即停止。owner 精确校验发生在建档前，不属于 Node。 |
| 准备 02 `creation_context` | `context-resolve-*`、`monitor-state-read`；独立 monitor reconcile → Plan → execute → readback 链 | 装配账户、触点、monitor、平台 App；普通 schedule 只读 monitor 状态，缺失 monitor 只能走独立 `monitor_bootstrap` Plan。 |
| 准备 03 `game_launch_pack` | `launch-pack-resolve-*` | 解析游戏主档、路线默认值、保底物料、备用页与资源蓝图；不从历史账户复制动态资源 ID。 |
| 就绪 04 `account_resource_prepare` | blueprint bootstrap、目标账户 readonly、抖音授权、资源来源/绑定/事件链与八类 verifier | 产出 `account_ready_report` 和四态资源摘要；只读、来源或合同不完整时 fail-closed，未确认前零平台写入。 |
| 就绪 05 `std_project_draft_builder` | confirmed resource orchestrator、`payload-build`、`payload-contract`、`duplicate-check`、`create-readiness` | 受控执行已确认资源 Plan，或生成 Draft/hash 并完成字段合同及未删除同名+语义查重；不创建项目。 |
| 创建执行 06 `std_project_create_executor` | execution grant、`create-once`、持久化结果 | 只消费已确认 Create Plan，记录一个逻辑创建 action 与结果；授权或绑定漂移即停止。 |
| 创建执行 07 `readback_closer` | `readback-std-project`、一致性与证据投影 | 以对象 ID/名称和字段回查决定 verified、等待或 blocker；不得补发 create 修复回查。 |

注册 Skill 不等于都进入每种 schedule：monitor 后四步由 Gate/Plan 专链调用；小程序实例 authority Skill 是诊断入口；事件配置 baseline 是资源动作依赖。它们仍归属对应 Node，但不能被通用 runner 当成自动平台写入。

| runner mode | 范围与写入边界 |
| --- | --- |
| `dry_run` | 运行只读就绪与 Node 05，编译当前 Plan；不写平台。 |
| `draft_readiness` | 运行同一就绪 Skill 并生成 Draft/就绪结果；runner 不编译或执行平台 Plan。 |
| `planned_actions` | 运行至 Node 04 并编译资源状态/动作；不生成 Draft，不执行动作。 |
| `execute_once` | 仅在确认上下文锁定后重核并消费对应 Plan；资源 Plan 与 Create Plan 走各自执行器。 |
| `readback_only` | 只运行 Node 07 权威回查，绝不创建。 |
| `aweme_auth_readonly` | 只运行至 Node 04 的抖音号授权核验，不生成 Draft 或 Plan。 |

## 3. 核心情况：账户资源四态

Node 04 固定核验八类资源：`avatar`、`dmp_audience_package`、`event_asset`、`video_asset`、`product_image`、`brand_info`、`micro_app_instance`、`backup_landing_page`。

| 聚合状态 | 含义 | 唯一后续 |
| --- | --- | --- |
| `READY` | 目标账户唯一命中且合同、可见性和所需回查通过 | 可进入 Node 05；不生成资源动作 |
| `WAITING` | 资源正在等待已知依赖，如事件资产或 baseline 事件配置 | 由依赖资源的既有 Plan/action 推进；自身不伪造写动作或 blocker |
| `PLANNED` | 缺失或未就绪，但 `prepare_supported=true` 且执行器、调用量和回查合同完整 | 只能生成 `resource_prepare` 确认卡 |
| `BLOCKED` | 只读失败、多候选、来源/合同缺失，或资源不支持自动准备 | 形成候选 root blocker，零平台写入 |

[资源动作注册表](../src/workflows/skills/oe3/04-resource-action-registry.mjs) 是资源能力、动作顺序、调用量与证据要求的唯一来源。当前可受控准备前五类；`brand_info`、`micro_app_instance`、`backup_landing_page` 缺失时不自动创建，其中备用页只允许既定人工共享后的只读核验。引导视频/封面等账户 capability 与动态 ID 存储只查[数据契约](project-数据与报表契约.md#配置与资源来源)及对应 verifier，不在本总览复制。

## 4. Plan、确认与执行不变量

| Plan kind | 唯一内容 | 产生条件 | 明确禁止 |
| --- | --- | --- | --- |
| `monitor_bootstrap` | 一次 `ensure_monitor` | Node 02 fresh readonly 证明缺失且合同完整 | 资源动作、项目创建 |
| `resource_prepare` | 注册表支持的有序、定量资源动作及依赖动作 | Node 04 存在 `PLANNED` | `std_project_create` |
| `std_project_create` | 一个逻辑 `std_project_create` | Node 05 Draft、字段合同、查重和资源均通过 | monitor 或资源准备动作 |
| `readiness_blocked` | blocker 与就绪快照 | 任一前提不满足 | confirmation 与平台写入 |

```text
全局 Guardrail
+ 当前 latest Job 的 ready Plan 与精确 plan_id / plan_hash
+ 账户本人的单次 confirmation
+ action grant 的目标、动作、顺序与 maximum_platform_calls
= 唯一可执行的平台写入
```

- `Case` 表示持续业务目标，`Job` 表示一次运行；同一 route×game×advertiser 最多一个 active runtime Case，fresh Job 不继承旧 Plan、确认、grant 或 idempotency key。
- monitor、资源准备和项目创建分别确认；资源回查通过后才以 fresh Job/Plan 生成创建确认卡。
- 确认前重新执行所需 fresh readonly；资源、调用量、Draft/payload hash、授权或重复状态漂移均 fail-closed。
- 每份确认 Plan 只消费冻结动作一次；写入受理不等于 READY，只有权威只读回查可以写入 verified。
- 明确失败或修正使用新 Job/Plan/confirmation/Attempt。唯一例外是同一冻结 Create action 收到无对象 ID 的精确 `40100`，可在一个逻辑 action 内按合同错峰物理投递至多三次；其他错误、超时或不明结果不自动重试。
- OAuth 刷新不属于业务 Plan，其授权和调度只查[部署说明](../deploy/README.md#巨量-oauth-token-每日刷新)。普通文件、日志和前端只保存脱敏摘要、hash、必要 ID、字段路径与证据引用，禁止保存凭据、完整触点 URL 或 raw request/response。

## 5. 当前 Case Gate 与工作台

`mwb.workflow_case_summary` 的 SQL View 决定精确优先级；同一 Case 即使同时满足多个描述，也只输出一个 `current_gate`。下表只定义消费者行为，不构成第二套 Gate 计算规则。

| 核心情况 | 投影 Gate | 唯一允许动作 |
| --- | --- | --- |
| active Case 尚无 Job | `create_fresh_job` | 建立 fresh Job 后从 readonly 开始 |
| monitor/触点需要 fresh 查询 | `run_monitor_readonly` | 只读 reconcile；若确证缺失才编译 monitor Plan |
| latest Job 可继续只读就绪 | `run_fresh_readiness` | 运行当前 Job 的安全 readonly/Plan 编译 |
| 任一 ready monitor、资源或创建 Plan | `await_job_write_authorization` | 只展示与 Plan ID/hash 绑定的确认卡；“继续执行”不写平台 |
| monitor 终态、上下文、资源或 Plan 有唯一当前阻断 | `resolve_case_blocker` | 展示 root blocker；只允许 Gate Policy 明示的恢复性 readonly |
| 已有创建对象但未完成 verified 回查 | `run_readback_only` | 只读回查，绝不再次 create |
| 明确创建失败且 Case 尚有次数 | `prepare_corrective_attempt` | 新建同 Case fresh Job/Attempt，重新 readonly 后再确认 |
| Case 已达 `maximum_create_attempts` | `manual_review_after_attempt_limit` | 禁止重试；复盘批准后才可建立独立的一次性替代 Case |
| 创建对象和回查证据完整 | `first_std_project_create_completed` | 只读完成投影并收口 Case |
| 非 active 且没有精确完成证据，或其他终态 | `review_latest_job` | 只读查看，不提供确认、恢复或重试入口 |

工作台链路固定为 `allowlist Intent Resolver → Gate Action Policy → 状态/readonly/确认卡 → 已确认 Plan executor`。Intent Resolver 只识别意图和槽位；Gate Policy 只读 summary；历史 Job 始终只读；无效、越权或冲突 scope 均 fail-closed，不回退到其他账户。

## 6. 权威来源索引

| 要核对的细节 | 唯一或优先来源 |
| --- | --- |
| 启动、任务范围、全局 Guardrail、归档 | `AGENTS.md`、`project.state.json`、active Task/Manifest |
| 已批准方法与关键选择 | [Solution Design](Solution%20Design.md) |
| Node、Skill、子流程与 mode 顺序 | [Node 注册表](../src/workflows/skills/oe3/00-workflow-node-registry.mjs)、[Skill 合同](../src/workflows/skills/oe3/00-contracts.mjs)、[runner](../src/workflows/skills/oe3/00-runner.mjs) |
| 资源 capability、动作顺序、调用量与证据 | [资源动作注册表](../src/workflows/skills/oe3/04-resource-action-registry.mjs) |
| Plan 编译、hash/binding 与执行 scope | [Execution Plan](../src/workflows/executionPlan.mjs)及对应 executor |
| Gate、root blocker、next action 与数据字段 | `mwb.workflow_case_summary`、[数据契约 §4](project-数据与报表契约.md#4-workflow_case_summary-合同) |
| 对话命令与恢复性 readonly | [Gate Action Policy](../src/workflows/gateActionPolicy.mjs)、[工作台对话](../src/workflows/workbenchConversation.mjs) |
| 路线字段、资源来源和账户 capability | [数据契约](project-数据与报表契约.md) |
| 乾坤接口参数与响应 | [当前乾坤 API 文档](qiankun-api-docs-20260827.md) |
| 网络、启动、凭据录入与 OAuth 运维 | [部署说明](../deploy/README.md) |
