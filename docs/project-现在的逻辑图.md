# marketing-workbench-v2｜唯一底层机制：Workflow Skill → Case Gate → 执行闭环

| 元信息 | 值 |
| --- | --- |
| 文档状态 | 当前有效；静态底层机制总览 |
| 最后更新时间 | 2026-09-13 CST |
| 校验基线 | 当前代码、Node/Skill/资源注册表与数据契约；Schema 版本与文件数只查数据契约；静态核验 Task `TASK-MWBV2-VIDEO-BIND-PLAN-SOURCE-RESOURCES-20260911` |
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

JSZC-HUNT 的“当前必需视频集”唯一由物料包中 `video_asset + required=true + status=active` 的条目决定；当前数据可恰有 10 条，但数量不是流程规则。Node 04 以乾坤素材库确认每条静态来源，物料户对账器扫描 `file/video/get` 全页并按完整边界在 `filename` 中唯一匹配来源码，返回项 `id` 写为 `oceanengine_video_mapping.status=verified` 的实际视频 ID；只有该映射才可进入 bind。每条视频再按 `source_asset_id` 关联唯一目标账户资源：默认封面能力开启时明确省略封面，显式封面能力开启时必须有同一 target 资源、当前 Job 的 visible/readback 证据。该单一解析结果进入 Draft、Plan/hash、payload 和嵌套合同。`buildVideoMaterialPreparePlan` 是绑定集合、批次、调用量与集合 hash 的唯一构造入口：全数目标可见为零动作，目标缺失只冻结精确缺失集合；零/多映射、未验证、查询失败、状态不明、封面来源歧义或集合不完整均阻断，绝不回退为默认一次绑定。乾坤预热记录和 `m_id` 是同步审计事实，不能覆盖已验证库存；本地 MP4 与旧 `asset.metadata.video_id` 都不是运行时依据。

## 2. Workflow Skill：三阶段七 Node

Node 结构只由 [Node 注册表](../src/workflows/skills/oe3/00-workflow-node-registry.mjs) 定义；Skill 合同定义依赖、输入、输出和写入责任；实际 schedule 只查 [runner](../src/workflows/skills/oe3/00-runner.mjs)。

| 阶段 / Node | 核心职责 → 输出或停止边界 |
| --- | --- |
| 准备 01 `launch_intake` | 规范 route、game、advertiser；缺字段停止。owner 校验在建档前完成。 |
| 准备 02 `creation_context` | 装配账户、触点、monitor、平台 App；普通 schedule 只读 monitor，缺失 monitor 只能生成独立 `monitor_bootstrap` Plan。 |
| 准备 03 `game_launch_pack` | 解析游戏、路线默认值、物料、备用页和资源蓝图；不从历史账户复制动态资源 ID。 |
| 就绪 04 `account_resource_prepare` | 仅将当前 `required=true` 的路线资源蓝图原子物化为新账户候选；退役或非必需蓝图不进入账户资源。必需视频蓝图的 `source_asset_id` 集合必须等于当前必需视频集；普通视频来源、唯一 target 映射、条件封面和目标可见性查询先完成，再核验引导视频依赖。输出须区分“核验完成、仍需准备资源”和“资源全部就绪”；同轮基线 readonly 原子落库，来源、合同或回查不完整即 fail-closed。 |
| 就绪 05 `std_project_draft_builder` | 执行已确认资源 Plan，或生成 Draft/hash、字段合同、查重和创建就绪；不创建项目。 |
| 创建执行 06 `std_project_create_executor` | 只消费已确认 Create Plan；绑定或授权漂移即停止。 |
| 创建执行 07 `readback_closer` | 仅以官方 `project_ids` 精确回查项目 ID 与 Draft 名称；二者一致即完成。无对象 ID 的不明创建才按名称恢复性查询，空或不一致均停止且不得补发 create；不再创建后查询素材详情。 |

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
- monitor、资源准备、项目创建分别确认；确认前必须 fresh readonly，资源、调用量、Draft/hash、授权、重复或 effective config 漂移均 fail-closed。视频资源还必须重算当前绑定集合、批次与集合 hash；无法核验、集合变化或 hash 不同在占用 confirmation 前停止。
- 已确认 Create Plan 在实际 create action 前停止时，冻结 Plan 仍消费，但 executor 必须记录最具体的上游 blocker。若 Case 最新、本人范围、无 create action、无创建对象且次数未耗尽，Gate 只允许既有 fresh readonly recovery；它按 Case 锁去重，产生新 Job、新 Plan/hash 和新确认。已有 action、对象或结果不明一律只走 readonly readback，不能恢复性创建。
- 每份确认 Plan 仅消费冻结动作一次；写入受理不等于 READY。事件资产创建收到资产 ID 后，只能在 `0 / 1 / 3 / 5` 秒窗口按该 ID、目标 App 与实例作只读回查；窗口耗尽、ID 缺失或不匹配均保持已消费且不得重发创建。资源 Plan 已调用平台但回查未确认时，工作台必须如实提示“已受理、未确认、不会重发”，不暴露对象 ID 或原始响应。标准项目的权威完成回查仅核验项目 ID 与 Draft 名称；素材、封面和引导视频合同在 Node 04、Node 05 与 preflight 完成。
- 创建 Attempt 由 Case 的 `nextCreateAttemptNo` 推导；失败或修正使用新 Job/Plan/confirmation/Attempt。
- 唯一重投例外是无对象 ID 的精确 `40100`，同一冻结 Create action 最多三次错峰物理投递；其余错误、超时或不明结果不自动重试。OAuth 与存储边界分别查[部署说明](../deploy/README.md#巨量-oauth-token-每日刷新)和数据契约。
- Node 05 查重唯一只读限流例外是首次 `GET std_project/list` 的 `HTTP 200 + api_code=40100`：完全相同参数在 Job 确定的 `20–24` 秒后最多重试一次；第二次 `40100` 以 `duplicate_readonly_rate_limited` 停止，其他错误零重试。该 GET 不产生 Plan、confirmation、action 或 Attempt；证据仅记录调用次数、最终业务码与是否恢复。

## 5. Case Gate 与工作台

`mwb.workflow_case_summary` 决定 Gate 优先级；下表只定义消费者行为，不构成第二套 Gate 计算规则。

| 核心情况 | 投影 Gate | 唯一允许动作 |
| --- | --- | --- |
| active Case 尚无 Job | `create_fresh_job` | 建立 fresh Job 后从 readonly 开始 |
| monitor/触点需要 fresh 查询 | `run_monitor_readonly` | 只读 reconcile；确证缺失才编译 monitor Plan |
| latest Job 可继续只读就绪 | `run_fresh_readiness` | 运行安全 readonly/Plan 编译 |
| 任一 ready monitor、资源或创建 Plan | `await_job_write_authorization` | 展示绑定 Plan ID/hash 的确认卡；“继续执行”不写平台 |
| monitor、上下文、资源或 Plan 有当前阻断 | `resolve_case_blocker` | 展示 summary 的唯一具体 blocker；仅 Gate Policy 明示的恢复性 readonly |
| 已有创建对象但未完成 verified 回查 | `run_readback_only` | 只读回查，绝不再次 create |
| 明确创建失败且尚有次数 | `prepare_corrective_attempt` | “重新只读准备”创建同 Case fresh Job/Attempt 后再确认 |
| 已达 `maximum_create_attempts` | `manual_review_after_attempt_limit` | 禁止重试；复盘批准后才可建立一次性替代 Case |
| 创建对象和回查证据完整 | `first_std_project_create_completed` | 只读完成投影并收口 Case |
| 其他终态 | `review_latest_job` | 只读查看，不提供确认、恢复或重试 |

- 工作台固定为 `allowlist Intent Resolver → Gate Action Policy → 状态/readonly/确认卡 → 已确认 Plan 执行层`；历史 Job 只读，越权或冲突 scope fail-closed。
- `resolve_case_blocker` 只展示 summary 投影的唯一具体原因与 Gate Policy 允许的下一步。旧视频绑定 Plan 为空、视频来源未唯一核验或绑定条件不完整时，提供既有“重新只读准备”文字命令；它只创建或复用同一 Case 的 fresh Job，不重放旧 Plan、不确认也不创建平台对象。
- consumed Create Plan 的确认前停止只在确有 `blocked_before_create`、零 create action 与零创建对象时进入该同一 readonly 恢复入口；通用 `readiness_not_ready:*`、授权探测包装原因不会覆盖 Skill 的具体传输或合同 blocker。确认卡、提示和按钮都读取同一服务端 Gate/Plan/confirmation 可用性；确认被登记或 Plan 被消费后不再显示陈旧的可确认卡。
- 确认卡点击时先冻结当前 `jobId`、`planId`、`planHash` 与精确确认短语；提交中只锁定该按钮并显示“提交中”，轮询或界面重绘不得改写本次请求目标。请求结束后重新读取服务端投影；未分类服务错误仅显示受控诊断与最新状态，不推断 confirmation 或平台动作是否已发生。
- “启动流程”在创建 Case、创建 fresh Job 与启动 readonly 任一阶段遇到未分类 5xx 时，只显示该阶段与脱敏诊断码；服务端只写本地受控诊断（方法、路径、阶段、指纹、受控错误码和不含错误消息的栈帧）。它不是业务 blocker，不触发自动重试、confirmation 或平台创建。
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
| 平台接口与运维 | [乾坤 API 文档](qiankun-api-docs-20260911.md)、[部署说明](../deploy/README.md) |
