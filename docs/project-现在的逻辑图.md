# marketing-workbench-v2｜唯一底层机制：Workflow Skill → Case Gate → 执行闭环

| 元信息 | 值 |
| --- | --- |
| 文档状态 | 当前有效；静态底层机制总览 |
| 最后更新时间 | 2026-09-11 CST |
| 校验基线 | 当前代码、Node/Skill/资源注册表与数据契约；Schema 版本与文件数只查数据契约；静态核验 Task `TASK-MWBV2-CURRENT-LOGIC-DOC-CONSISTENCY-20260911` |
| 适用范围 | OceanEngine 3.0 字节小游戏路线的 Case、Job、资源准备、标准项目创建与权威回查 |
| 重新校验条件 | Node/Skill、runner mode、资源能力、Plan/确认、Case summary、工作台入口或 Schema/View 变化时 |

> “唯一”指每类事实只有一个权威所有者，不表示本路线可直接泛化到其他平台。本文不保存账户、Case、Job、Plan、资源、确认或平台动作状态；动态业务事实只查 Postgres。

## 1. 唯一闭环与真值分工

```text
本人作用域 Intake → active Case + fresh Job → 3 阶段 7 Node
→ monitor / 资源 / Draft 就绪 → BLOCKED、WAITING 或冻结 Plan
→ plan_id + plan_hash + 本人精确确认 + action grant
→ 统一 Plan-bound 执行层（monitor、resource、create）
→ 权威只读回查与脱敏证据 → workflow_case_summary
→ 唯一 Gate、root blocker、next action；工作台只消费投影
```

| 问题 | 唯一所有者 | 消费边界 |
| --- | --- | --- |
| 项目和任务允许什么 | `AGENTS.md`、`project.state.json`、active Task/Manifest | 不保存业务动态事实 |
| 当前业务事实是什么 | Postgres `marketing_workbench_v2.mwb` | Markdown、前端和代码不复制当前状态 |
| Workflow 如何组成和调度 | Node 注册表、Skill 合同、runner | Node 是模块结构；Skill run 是 Job 过程事实 |
| 平台动作是否可执行 | 冻结 Plan、confirmation、action grant、runtime policy | 缺一不可，CLI 不得旁路写入 |
| Case 现在该做什么 | `mwb.workflow_case_summary` | 每 Case 仅一个 Gate、零或一个 root blocker、一个 next action |

正式业务写入只有 `工作台 / HTTP API → 统一 Plan-bound 执行层 → platforms / repositories` 一条链；执行层按 `monitor_bootstrap`、`resource_prepare`、`std_project_create` 分发。CLI 仅限 dry-run、状态、readback 和安全诊断。

## 2. Workflow Skill：三阶段七 Node

Node 结构只由 [Node 注册表](../src/workflows/skills/oe3/00-workflow-node-registry.mjs) 定义；Skill 合同定义依赖、输入、输出和写入责任；实际 schedule 只查 [runner](../src/workflows/skills/oe3/00-runner.mjs)。

| 阶段 / Node | 核心职责 → 输出或停止边界 |
| --- | --- |
| 准备 01 `launch_intake` | 规范 route、game、advertiser；缺字段停止。owner 校验在建档前完成。 |
| 准备 02 `creation_context` | 装配账户、触点、monitor、平台 App；普通 schedule 只读 monitor，缺失 monitor 只能生成独立 `monitor_bootstrap` Plan。 |
| 准备 03 `game_launch_pack` | 解析游戏、路线默认值、物料、备用页和资源蓝图；不从历史账户复制动态资源 ID。 |
| 就绪 04 `account_resource_prepare` | 输出 `account_ready_report` 与资源四态；同轮基线 readonly 原子落库，来源、合同或回查不完整即 fail-closed。 |
| 就绪 05 `std_project_draft_builder` | 执行已确认资源 Plan，或生成 Draft/hash、字段合同、查重和创建就绪；不创建项目。 |
| 创建执行 06 `std_project_create_executor` | 只消费已确认 Create Plan；绑定或授权漂移即停止。 |
| 创建执行 07 `readback_closer` | 以官方 `project_ids` 精确只读回查；无对象 ID 的不明创建才按名称恢复性查询，空或不一致均停止且不得补发 create。 |

注册 Skill 不表示进入每个 schedule：monitor reconcile、资源执行和回查均由对应 Gate/Plan 专链调用，通用 runner 不会自动写平台。

| runner mode | 范围与写入边界 |
| --- | --- |
| `dry_run` | 运行只读就绪与 Node 05，编译 Plan；不写平台。 |
| `draft_readiness` | 生成 Draft/就绪结果；不编译或执行平台 Plan。 |
| `planned_actions` | 运行至 Node 04 并编译资源状态/动作；不生成 Draft 或执行动作。 |
| `execute_once` | 确认上下文锁定后重核并消费对应 Plan；资源与创建使用各自执行器。 |
| `readback_only` | 只运行 Node 07 权威回查，绝不创建。 |
| `aweme_auth_readonly` | 只运行至 Node 04 的抖音号授权核验；不生成 Draft 或 Plan。 |

## 3. 账户资源四态

Node 04 固定核验八类资源：`avatar`、`dmp_audience_package`、`event_asset`、`video_asset`、`product_image`、`brand_info`、`micro_app_instance`、`backup_landing_page`。

| 聚合状态 | 含义 | 唯一后续 |
| --- | --- | --- |
| `READY` | 唯一命中且合同、可见性和回查通过 | 进入 Node 05；不生成资源动作 |
| `WAITING` | 等待已知依赖，如事件资产或 baseline 事件配置 | 由既有依赖动作推进；不伪造动作或 blocker |
| `PLANNED` | 缺失或未就绪，但 `prepare_supported=true` 且执行/回查合同完整 | 只能生成 `resource_prepare` 确认卡 |
| `BLOCKED` | readonly、候选、来源或合同失败，或不支持自动准备 | 形成候选 root blocker；零平台写入 |

[资源动作注册表](../src/workflows/skills/oe3/04-resource-action-registry.mjs)是能力、顺序、调用量和证据的唯一来源。可受控准备：`avatar`、`dmp_audience_package`、`event_asset`、`video_asset`、`product_image`；其余三类缺失时不自动创建。

`brand_info` 只接受目标账户 fresh 回查：

| `brandInfoMode` | 条件 | Node 04 / payload 结果 |
| --- | --- | --- |
| `target_verified` | 非空列表中唯一完整匹配 | 资源 READY，发送完整四字段对象 |
| `target_empty_omit` | API 成功且实际列表为空 | 保存 fresh 只读证据为 `not_required/not_required`，省略整个 `brand_info` |
| `blocked` | 查询失败、不明、未匹配、多匹配或行业不完整 | 阻断，零平台写入 |

`resourceReady` 是唯一资源判定；显式省略必须具备有效 readonly 证据，Node 05、字段合同和 Execution Plan 复用该结论。字段账本、存储形态和动态 ID 只查[数据契约](project-数据与报表契约.md#配置与资源来源)及对应 verifier。

## 4. Plan、确认与执行不变量

| Plan kind | 唯一内容 | 产生条件 | 禁止 |
| --- | --- | --- | --- |
| `monitor_bootstrap` | 一次 `ensure_monitor` | Node 02 fresh readonly 证明缺失且合同完整 | 资源动作、项目创建 |
| `resource_prepare` | 注册表支持的有序、定量资源及依赖动作 | Node 04 存在 `PLANNED` | `std_project_create` |
| `std_project_create` | 一个逻辑 `std_project_create` | Draft、字段合同、查重和资源均通过 | monitor 或资源准备动作 |
| `readiness_blocked` | blocker 与就绪快照 | 任一前提不满足 | confirmation 与平台写入 |

```text
全局 Guardrail + latest Job 的 ready Plan / 精确 plan_id、plan_hash
+ 账户本人单次 confirmation + action grant 的目标、动作、顺序、调用上限
= 唯一可执行的平台写入
```

- Case 是持续目标，Job 是一次运行；fresh Job 不继承旧 Plan、确认、grant 或 idempotency key。
- monitor、资源准备、项目创建分别确认；确认前必须 fresh readonly，资源、调用量、Draft/hash、授权、重复或 effective config 漂移均 fail-closed。
- 每份确认 Plan 仅消费冻结动作一次；写入受理不等于 READY，只有权威回查可写入 verified。
- 创建 Attempt 由 Case 的 `nextCreateAttemptNo` 推导；失败或修正使用新 Job/Plan/confirmation/Attempt。
- 唯一重投例外是无对象 ID 的精确 `40100`，同一冻结 Create action 最多三次错峰物理投递；其余错误、超时或不明结果不自动重试。OAuth 与存储边界分别查[部署说明](../deploy/README.md#巨量-oauth-token-每日刷新)和数据契约。

## 5. Case Gate 与工作台

`mwb.workflow_case_summary` 决定 Gate 优先级；下表只定义消费者行为，不构成第二套 Gate 计算规则。

| 核心情况 | 投影 Gate | 唯一允许动作 |
| --- | --- | --- |
| active Case 尚无 Job | `create_fresh_job` | 建立 fresh Job 后从 readonly 开始 |
| monitor/触点需要 fresh 查询 | `run_monitor_readonly` | 只读 reconcile；确证缺失才编译 monitor Plan |
| latest Job 可继续只读就绪 | `run_fresh_readiness` | 运行安全 readonly/Plan 编译 |
| 任一 ready monitor、资源或创建 Plan | `await_job_write_authorization` | 展示绑定 Plan ID/hash 的确认卡；“继续执行”不写平台 |
| monitor、上下文、资源或 Plan 有当前阻断 | `resolve_case_blocker` | 展示唯一 blocker；仅 Gate Policy 明示的恢复性 readonly |
| 已有创建对象但未完成 verified 回查 | `run_readback_only` | 只读回查，绝不再次 create |
| 明确创建失败且尚有次数 | `prepare_corrective_attempt` | “重新只读准备”创建同 Case fresh Job/Attempt 后再确认 |
| 已达 `maximum_create_attempts` | `manual_review_after_attempt_limit` | 禁止重试；复盘批准后才可建立一次性替代 Case |
| 创建对象和回查证据完整 | `first_std_project_create_completed` | 只读完成投影并收口 Case |
| 其他终态 | `review_latest_job` | 只读查看，不提供确认、恢复或重试 |

- 工作台固定为 `allowlist Intent Resolver → Gate Action Policy → 状态/readonly/确认卡 → 已确认 Plan 执行层`；历史 Job 只读，越权或冲突 scope fail-closed。
- Agent 壳层、右侧 Workflow 和统计只消费受控投影：壳层不计算 Gate、blocker、next action、Plan 或执行动作；普通用户仅本人范围，管理员读取全量报表也不获得账户操作权。
- 模型仅在规则未完整识别 Intake 且本人配置已测试启用时补槽位；确认、取消、状态和恢复始终规则优先。模型不接收运行状态或原始对话，用户可见进度与提示只来自 Summary 投影和确定性模板。

## 6. 权威来源索引

| 要核对的细节 | 唯一或优先来源 |
| --- | --- |
| 启动、任务范围、Guardrail、归档 | `AGENTS.md`、`project.state.json`、active Task/Manifest |
| 已批准方法与关键选择 | [Solution Design](Solution%20Design.md) |
| Node、Skill、mode 顺序 | [Node 注册表](../src/workflows/skills/oe3/00-workflow-node-registry.mjs)、[Skill 合同](../src/workflows/skills/oe3/00-contracts.mjs)、[runner](../src/workflows/skills/oe3/00-runner.mjs) |
| 资源能力、动作顺序、调用量与证据 | [资源动作注册表](../src/workflows/skills/oe3/04-resource-action-registry.mjs) |
| Plan、hash/binding 与执行 scope | [Execution Plan](../src/workflows/executionPlan.mjs)及对应执行器 |
| Gate、blocker、next action 与数据字段 | `mwb.workflow_case_summary`、[数据契约 §4](project-数据与报表契约.md#4-workflow_case_summary-合同) |
| 对话命令与恢复性 readonly | [Gate Action Policy](../src/workflows/gateActionPolicy.mjs)、[工作台对话](../src/workflows/workbenchConversation.mjs) |
| 路线字段、资源来源、Schema 版本 | [数据契约](project-数据与报表契约.md) |
| 平台接口与运维 | [乾坤 API 文档](qiankun-api-docs-20260827.md)、[部署说明](../deploy/README.md) |
