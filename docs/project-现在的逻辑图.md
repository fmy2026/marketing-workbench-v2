# marketing-workbench-v2｜Agent 公共基础、投放执行与市场情报

| 元信息 | 值 |
| --- | --- |
| 文档状态 | 当前有效；静态底层机制总览 |
| 最后更新时间 | 2026-09-14 CST |
| 校验基线 | 当前代码、Node/Skill/资源注册表与数据契约；Schema 版本与文件数只查数据契约；静态核验 Task `TASK-MWBV2-VIDEO-BIND-PLAN-SOURCE-RESOURCES-20260911` |
| 适用范围 | Agent 公共基础、投放执行、市场情报与投放策略的职责边界；投放执行当前覆盖 OceanEngine 3.0 字节小游戏路线 |
| 重新校验条件 | Agent 职责、Node/Skill、runner mode、资源能力、Plan/确认、数据合同、工作台入口或 Schema/View 变化时 |

> “唯一”指每类事实只有一个权威所有者，不表示任何一个 Agent 可直接泛化到其他平台。本文不保存账户、Case、Job、Plan、资源、确认或平台动作状态；动态业务事实只查对应的 Postgres 或公共服务只读来源。

## 1. 公共基础：职责、真值与隔离

```text
市场情报：公共只读数据 → 观察与证据
投放策略（规划中）：情报 + 业务目标 + 已授权效果数据 → 策略建议
投放执行：明确执行需求 → Case / Job / Plan / 确认 → 权威回查
```

| Agent | 目标与输出 | 事实来源与权限 | 当前边界 |
| --- | --- | --- | --- |
| 市场情报 | 素材网格、单条趋势、平台已有分析与已采集样本 HTML 月报；后续提供选定素材比较 | 公共电脑只读服务；连接和模型配置按登录用户隔离 | 不写平台，不计算 ROI，不自动生成 Case、Plan 或预算建议 |
| 投放策略 | 根据证据形成待人工确认的策略建议 | 规划中；未来仅消费已授权的情报与效果数据 | 本轮不开放，不执行任何动作 |
| 投放执行 | 创建项目或追加视频的状态、确认卡、执行结果与只读回查 | Postgres 的 Case/Job/Plan/summary 与受控平台适配器 | 仅本人范围，只有冻结 Plan、精确确认与 action grant 同时存在才可写平台 |

登录、用户隔离、公开 Agent 注册及按 `user_id × agent_key` 隔离的模型配置是公共基础。公开页面只消费服务端投影；不保存 Token、原始模型输出、对话原文或公共服务原始响应。

## 2. 投放执行 Agent：唯一闭环与真值分工

```text
受控咨询 / 自然语言临时草稿 / 标准 JSON → 已选事项的 `LaunchRequest v1/v2` → 本人作用域 Intake → active Case + fresh Job → 3 阶段 7 Node
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

## 3. 投放执行 Agent：Workflow Skill、三阶段七 Node

Node 结构只由 [Node 注册表](../src/workflows/skills/oe3/00-workflow-node-registry.mjs) 定义；Skill 合同定义依赖、输入、输出和写入责任；实际 schedule 只查 [runner](../src/workflows/skills/oe3/00-runner.mjs)。

| 阶段 / Node | 核心职责 → 输出或停止边界 |
| --- | --- |
| 准备 01 `launch_intake` | 只接收已校验的 `LaunchRequest v1`：`create_std_project + oceanengine_3_byte_mini_game + JSZC + advertiser_id`；缺字段、未知字段、冲突输入或未支持事项停止。自然语言和 JSON 只在建档前归一，Case/Job 使用同一冻结请求；owner 校验在建档前完成；已登记 Create confirmation 的 Job 不得再次进入 Node 01–05。 |
| 准备 02 `creation_context` | 装配账户、触点、monitor、平台 App；普通 schedule 只读 monitor，缺失 monitor 只能生成独立 `monitor_bootstrap` Plan。 |
| 准备 03 `game_launch_pack` | 解析游戏、路线默认值、物料、备用页和资源蓝图；不从历史账户复制动态资源 ID。 |
| 就绪 04 `account_resource_prepare` | 仅将当前 `required=true` 的路线资源蓝图原子物化为新账户候选；退役或非必需蓝图不进入账户资源。必需视频蓝图的 `source_asset_id` 集合必须等于当前必需视频集；普通视频来源、唯一 target 映射、条件封面和目标可见性查询先完成，再核验引导视频依赖。输出须区分“核验完成、仍需准备资源”和“资源全部就绪”；已确认资源动作编排也归属本节点，同轮基线 readonly 原子落库，来源、合同或回查不完整即 fail-closed。 |
| 就绪 05 `std_project_draft_builder` | 生成 Draft/hash、字段合同、查重和创建就绪；不创建项目。 |
| 创建执行 06 `std_project_create_executor` | 只消费已确认 Create Plan；confirmation ID 从 Plan ID 派生，claim 原子核验最新 Job、Plan/hash、Case 生命周期和本人归属；绑定或授权漂移即停止。 |
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

## 4. 投放执行 Agent：账户资源四态

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

## 5. 投放执行 Agent：Plan、确认与执行不变量

| Plan kind | 唯一内容 | 产生条件 | 禁止 |
| --- | --- | --- | --- |
| `monitor_bootstrap` | 一次 `ensure_monitor` | Node 02 fresh readonly 证明缺失且合同完整 | 资源动作、项目创建 |
| `resource_prepare` | 注册表支持的有序、定量资源及依赖动作 | Node 04 存在 `PLANNED` | `std_project_create` |
| `std_project_create` | 一个逻辑 `std_project_create` | Draft、字段合同、查重和资源均通过 | monitor 或资源准备动作 |
| `readiness_blocked` | blocker 与就绪快照 | 任一前提不满足 | confirmation 与平台写入 |

```text
全局 Guardrail + latest Job 的 ready Plan / 精确 plan_id、plan_hash
+ 账户本人单次 confirmation 原子切换为 executing + action grant 的目标、动作、顺序、调用上限
= 唯一可执行的平台写入
```

- Case 是持续目标，Job 是一次运行；fresh Job 不继承旧 Plan、确认或 grant。追加 action 的幂等键绑定冻结 Plan ID 与已核验素材集合：同一 Plan 的重复提交保持同一键，fresh Plan 即使素材集合相同也使用新键。
- 页面只读同一服务端 progress 投影：资源 Plan 待确认是 3/7、资源执行是 Node 04；草稿检查通过是 5/7，创建确认或执行仍是 Node 06 的 5/7，创建成功待权威回查为 6/7，只有 Node 07 verified 才是 7/7。确认卡的资源数量、批次、动作码和调用上限均来自冻结 Plan；只读核验不计入平台写入上限。
- monitor、资源准备、项目创建分别确认；确认前必须 fresh readonly，资源、调用量、Draft/hash、授权、重复或 effective config 漂移均 fail-closed。视频资源还必须重算当前绑定集合、批次与集合 hash；无法核验、集合变化或 hash 不同在占用 confirmation 前停止。
- 已确认 Create Plan 在实际 create action 前停止时，冻结 Plan 仍消费，executor 必须记录最具体的上游 blocker 及脱敏观察引用。同一 Job 已确认 `std_project_create` 后，Node 01–05、普通 runner 和 Plan 发布事务均拒绝重跑或生成后续 Plan；只有原 Plan 的 Node 07 回查可继续。若 Case 最新、本人范围、无 create action、无创建对象且次数未耗尽，Gate 只允许既有 fresh readonly recovery；它按 Case 锁去重，产生新 Job、新 Plan/hash 和新确认。已有 action、对象或结果不明一律只走 readonly readback，不能恢复性创建。
- 每份确认 Plan 仅消费冻结动作一次；写入受理不等于 READY。事件资产创建收到资产 ID 后，只能在 `0 / 1 / 3 / 5` 秒窗口按该 ID、目标 App 与实例作只读回查；窗口耗尽、ID 缺失或不匹配均保持已消费且不得重发创建。资源 Plan 已调用平台但回查未确认时，工作台必须如实提示“已受理、未确认、不会重发”，不暴露对象 ID 或原始响应。标准项目的权威完成回查仅核验项目 ID 与 Draft 名称；素材、封面和引导视频合同在 Node 04、Node 05 与 preflight 完成。
- 创建 Attempt 由 Case 的 `nextCreateAttemptNo` 推导；失败或修正使用新 Job/Plan/confirmation/Attempt。
- 新冻结且携带完整 delivery 合同的 Create 或追加 action，只有在精确 `HTTP 200 + 40100` 且没有对象/受理结果时，才能在同一 confirmation 内最多三次错峰物理投递；请求 hash 不变，调用点为 `0 / 20–24 / 45–49` 秒。其余错误、超时或不明结果不自动重试。OAuth 与存储边界分别查[部署说明](../deploy/README.md#巨量-oauth-token-每日刷新)和数据契约。
- Node 05 查重唯一只读限流例外是首次 `GET std_project/list` 的 `HTTP 200 + api_code=40100`：完全相同参数在 Job 确定的 `20–24` 秒后最多重试一次；第二次 `40100` 以 `duplicate_readonly_rate_limited` 停止，其他错误零重试。该 GET 不产生 Plan、confirmation、action 或 Attempt；证据仅记录调用次数、最终业务码与是否恢复。

## 6. 投放执行 Agent：Case Gate 与工作台

### 项目视频追加事项

七个固定 Node ID 不变；服务端按 `workflow_cases.operation` 提供展示名称：追加需求核对、账户与目标项目核验、指定视频识别、视频可用性与推送准备、追加计划核对、单次追加、追加结果回查。工作台只展示该服务端投影，默认展开当前阶段，其余阶段和子检查项按需展开。

追加的只读准备依次核验乾坤视频标识码、物料户和目标账户的巨量视频库存，以及目标项目的现有视频。项目素材查询固定使用官方 `filtering.material_type=VIDEO`；素材标识码只清理首尾空格，原始大小写贯穿 Intake、Case、乾坤查询、库存匹配、Plan 与幂等键。文件名匹配使用大小写敏感的完整边界，`4iLE-2` 不匹配 `4ile-2` 或 `4iLE-20`。分页、查询失败和零/多个同大小写来源均停止。待新增视频已在物料户唯一命中但目标账户缺失时，先形成独立 `project_video_material_push` Plan；其 `video_ids` 从查询、Plan/hash、幂等键到平台请求始终保留原始非空字符串及大小写。视频 ID 是不透明字符串，常见字母数字组合；账户和项目 ID 在唯一共享 wire builder 中无损编码为 JSON 整数 token。追加 Plan 复用新建项目的当前 Job 小游戏实例与 `gameplay/list` 引导视频核验：唯一引导视频时，每条待追加视频携带同一 `guide_video_id`；零候选仅按账户既有规则省略，多个候选、查询失败或当前 Job 证据缺失均停止。显式封面仍按既有合同发送或省略。完整视频条目、请求 hash 与执行前复核共用同一冻结形态。新追加 Plan 同时冻结精确 `40100` 的三笔 delivery 合同；只有该返回码且无受理/对象矛盾证据时才以相同请求 hash 错峰重投，超过总时限的调度点不发送。确认后的追加将即时项目素材观察或后续 `run_project_video_append_readback` 交给同一收口事务：它保存 readback、匹配的脱敏 evidence、节点 05–07，再同步 Job 与 Case。只有项目素材完整命中才完成；查询失败不能解释为视频缺失，旧 Plan 也不会重发。若追加或素材推送在动作前受阻、action claim 未取得或执行器异常，且该 Plan 没有任何平台 action，Plan 必须消费并保存唯一 blocker，Job 转入 `resolve_case_blocker`，由“重新只读准备”建立 fresh Job。Node 06 区分未调用平台、平台受理、拒绝、系统限流耗尽和由回查确认；Node 07 记录每一次观察。若平台动作明确为 `platform_rejected` 且最新项目回查成功确认仍缺失，本人可用“重新准备追加”按 Case 锁创建或复用一个 fresh Job，重新核验完整请求、跳过已有项并生成新确认。超时、结果不明或查询失败只保留只读回查入口。每轮只读仍核验完整请求；项目已有项仅计入摘要，追加 Plan 仅保留待追加项。确认卡显示请求总数、项目已有数、待追加数、引导视频绑定数和最多三笔系统限流投递。每轮只读结果写入既有 Plan 元数据：首个有序 blocker 进入 `root_blocker_codes`，Job 当前节点同步到实际失败点；其他受控查询结果仅供诊断，不能冒充第二个 Gate。

`project_video_material_push` 的平台返回成功只表示已受理。执行后和“检查推送结果”都使用同一个冻结 ID 精确 readonly probe；它不扫全量库存、不凭文件名重猜映射。首次观察从最后成功批次的受理时间起按 `0/10/20/30/60/120/180` 秒安排，页面只在存活时发起各自短请求；每一轮绑定原 Job、Plan/hash 和轮次，后端原子领取，关闭页面不重置窗口。未全部可见时只更新原已消费 Plan 的安全观察，Node 04 显示“已受理、未确认、不会重发”，Node 05–07 等待；查询失败立即停止自动检查，窗口结束才显示人工“检查推送结果”。查询失败与未找到分开记录且失败计数为零。观察与 evidence、节点、Job 和 Plan 在同一事务写入，较新轮次或同轮较新观察优先，迟到响应不得回退状态。素材库存回查只能推进 Node 04，Node 07 只由绑定目标项目的 `oc_project_video_append` 回查点亮。全量可见后才在同一 Job 重新准备 `project_video_append` Plan，仍需本人独立确认。

来源库存、目标库存和项目素材的每一次失败都保存到其现有 `readonly_checks` 条目：仅保留检查环节、页码、客户端状态、HTTP/API 状态、凭据 blocker 与响应 hash，不保存密钥、完整 URL、请求或响应。首页查询未通过、后续页查询未通过、分页范围异常和项目身份未确认使用不同 blocker；来源库存失败停在 Node 3，目标库存或项目素材失败停在 Node 4，后续节点保持 waiting。工作台收到 readonly 运行响应后立即以该 Job 投影更新节点、唯一 blocker、底部进度和同一条对话回复；前端不自行推断根因。`resolve_case_blocker` 只提供 Gate Policy 允许的“重新只读准备”，未确认/未消费 Job 是否复用仍由服务端策略决定。

`mwb.workflow_case_summary` 决定 Gate 优先级；下表只定义消费者行为，不构成第二套 Gate 计算规则。

| 核心情况 | 投影 Gate | 唯一允许动作 |
| --- | --- | --- |
| active Case 尚无 Job | `create_fresh_job` | 建立 fresh Job 后从 readonly 开始 |
| monitor/触点需要 fresh 查询 | `run_monitor_readonly` | 只读 reconcile；确证缺失才编译 monitor Plan |
| latest Job 可继续只读就绪 | `run_fresh_readiness` | 运行安全 readonly/Plan 编译 |
| 任一 ready monitor、资源或创建 Plan | `await_job_write_authorization` | 展示绑定 Plan ID/hash 的确认卡；“继续执行”不写平台 |
| monitor、上下文、资源或 Plan 有当前阻断 | `resolve_case_blocker` | 展示 summary 的唯一具体 blocker；素材推送回查阻断只允许“检查推送结果”，其余仅 Gate Policy 明示的恢复性 readonly |
| 已有创建对象但未完成 verified 回查 | `run_readback_only` | 只读回查，绝不再次 create |
| 明确创建失败且尚有次数 | `prepare_corrective_attempt` | “重新只读准备”创建同 Case fresh Job/Attempt 后再确认 |
| 已达 `maximum_create_attempts` | `manual_review_after_attempt_limit` | 禁止重试；复盘批准后才可建立一次性替代 Case |
| 创建对象和回查证据完整 | `first_std_project_create_completed` | 只读完成投影并收口 Case |
| 其他终态 | `review_latest_job` | 只读查看，不提供确认、恢复或重试 |

- 工作台固定为 `受控咨询与临时 Intake → allowlist Intent Resolver → Gate Action Policy → 状态/readonly/确认卡 → 已确认 Plan 执行层`；首屏不预选事项、不显示七节点或进度。完整 Intake 仅在最新对话下提供一张启动卡片，输入变化即失效；点击时冻结完整的服务端校验请求，并将同一快照依次提交给 Case 与 fresh Job，页面不得增删字段。右侧先显示创建 Case、创建 Job 等真实请求阶段，取得实际 Job 后才展示服务端七节点投影。右侧标题仅固定显示事项、`3 阶段`与`7 节点`，不使用 Gate 或 blocker 文案；节点颜色、当前节点和展开状态仍使用服务端投影。`run_fresh_readiness` 只显示“开始只读核验”并提交“继续执行”；`run_project_video_append_readback` 只显示“检查追加结果”，并在平台明确拒绝时额外显示“重新准备追加”；`resolve_case_blocker` 遇到素材推送回查 blocker 时显示“检查推送结果”，其他恢复才显示“重新只读准备”。输入框、快捷入口和确认卡都先写入用户决策气泡，再以“已使用规则解析”或“已使用模型辅助解析”原位完成同一条回复；轮询只刷新进度投影，不替换已完成轮次，刷新后不保存聊天原文。追加视频隐藏新建项目专用子检查，只显示追加专用节点；受阻时顶部和对话共同消费 summary 的唯一 blocker，不自动重试。历史 Job 只读，越权或冲突 scope fail-closed。
- `resolve_case_blocker` 只展示 summary 投影的唯一具体原因与 Gate Policy 允许的下一步。旧视频绑定 Plan 为空、视频来源未唯一核验或绑定条件不完整时，提供既有“重新只读准备”文字命令；它只创建或复用同一 Case 的 fresh Job，不重放旧 Plan、不确认也不创建平台对象。
- consumed Create Plan 的确认前停止只在确有 `blocked_before_create`、零 create action 与零创建对象时进入该同一 readonly 恢复入口；通用 `readiness_not_ready:*`、授权探测包装原因不会覆盖 Skill 的具体传输或合同 blocker。确认卡、提示和按钮都读取同一服务端 Gate/Plan/confirmation 可用性；确认被登记或 Plan 被消费后不再显示陈旧的可确认卡。
- 确认卡点击时先冻结当前 `jobId`、`planId`、`planHash` 与精确确认短语；提交中只锁定该按钮并显示“提交中”，轮询或界面重绘不得改写本次请求目标。请求结束后只消费同一服务端投影的 `confirmationPreview`；显式 `null` 必须清卡，页面不得以旧 Plan 状态回填。未分类服务错误仅显示受控诊断与最新状态，不推断 confirmation 或平台动作是否已发生。
- “启动流程”在创建 Case、创建 fresh Job 与启动 readonly 任一阶段遇到未分类 5xx 时，只显示该阶段与脱敏诊断码；服务端只写本地受控诊断（方法、路径、阶段、指纹、受控错误码和不含错误消息的栈帧）。它不是业务 blocker，不触发自动重试、confirmation 或平台创建。
- 数字员工广场以“市场情报提供依据 → 投放策略形成建议 → 投放执行承接受控执行”说明职责；内部键仍为 `launch_creation`，名称变更不迁移既有入口、配置或执行合同。
- Agent 壳层、右侧 Workflow 和统计只消费受控投影：壳层不计算 Gate、blocker、next action、Plan 或执行动作；普通用户仅本人范围，管理员读取全量报表也不获得账户操作权。
- JSON 不与自然语言草稿混用，且不调用模型；未知 schema/version/operation/字段或无效类型直接拒绝。新建项目仍是完整请求。追加视频在 Intake 可只提供本人账户、已验证项目和视频标识码：服务端以 Postgres 中本人账户的 `runtime_truth`、已回查标准项目记录派生路线和游戏，随后才生成完整 `LaunchRequest v2`。未找到、越权、未验证或显式路线/游戏冲突均不可启动，不回退平台列表或默认值。已选追加、账户和项目而缺少视频时，可直接粘贴标识码列表；逗号、顿号、分号、空白和换行均分隔条目，纯数字无标签输入必须明确标注为视频标识码。自然语言在事项未明确时只返回临时草稿、受控回复和不可启动状态，不创建 Case、Job、Plan 或确认；草稿仅保留在页面内存与单次 Intake 响应，刷新或切换输入方式即重新输入，服务端不保存原始文本或 JSON。
- 模型仅在规则未完整识别自然语言 Intake 且本人配置已测试启用时补槽位；确认、取消、状态和恢复始终规则优先。DeepSeek `api.deepseek.com` 的固定测试和运行时槽位请求均使用关闭 thinking 的同一请求配置。模型不接收 Case、Job、Gate、Plan 或执行状态，输出只能使用输入中可验证的证据；用户仅看到采用槽位名，或超时、供应商拒绝、非 JSON、意图/置信度、槽位/证据等受控回退分类，绝不显示或保存模型原始输出。

## 7. 市场情报 Agent：只读证据链与演进边界

```text
用户问题 → 明确素材、日期和分析目的 → 受限只读查询
→ 校验字段、观察范围和来源 → 受控模型解释证据 → 结论、依据、限制与可追问方向
```

市场情报当前先把“有哪些游戏或素材”等问题路由为候选发现：工作台在公共服务未指定游戏的单个受限分页中读取素材卡，并只展示该响应中去重后的游戏名称。它明确标记已读取候选页和条数，不把候选名称、当前页或 `meta.total` 说成全量游戏目录。用户只能点击或输入已发现的名称继续研究；规则无法理解的自由表达不会猜测名称，可选地提示本人配置模型。指定研究对象后，工作区展示每页 8 条素材网格、少量筛选、分页、同源视频和单条日人气趋势。公共服务尚无已核验的按月列表筛选时，工作台只检查每个研究对象当前最多 40 条候选素材的目标月份趋势；“已找到”只指已加载候选中的合格素材，尚未遍历完显示继续查询。`0` 表示平台报告值为零，`null` 或缺失日期表示无该观察；两者均不说明投放效果。查询范围、有效观察范围、参考线覆盖范围、公共服务全库更新时间及逐素材采集时间必须独立呈现。参考线是平台百分位基准，不能与日值相加或表述为某条视频的走势；净变化不是持续上涨。

打开单条素材后，工作台重新读取详情和趋势，再展示观察范围、有效点、零值、缺失、净变化、已有标签和脚本。未配置模型时，确定性说明只把这些事实作为“值得继续查看的依据”，不评价效果、ROI、排名或因果；模型可选地将同一脱敏证据改写为创意观察，非法、超时或无依据输出仍回退确定性说明并给出配置入口。每个最终回复和素材解读／月报卡片都要明示来源：规则处理显示“已使用规则解读”；模型意图被采用但内容仍由确定性服务生成时显示“需求已使用大模型解析；内容已使用规则解读”；模型内容被采用时显示“内容已使用大模型解析”；模型请求失败或输出未通过校验时显示“大模型解析未成功，已回退规则解读”。加载状态和欢迎语不标识来源，下载的离线 HTML 不加入运行时来源话术。市场情报的模型配置将“保存并测试”作为一次操作：保存当前 Base、模型和可选新 Key 后测试同一配置版本，并只在测试成功后按用户勾选启用；状态回读会区分已保存、测试通过、启用、失败或暂时无法确认。仅切换启用状态不会清除已通过的测试时间；配置在测试期间被其他页面修改时，旧结果不会覆盖新配置。Base 只能填写兼容接口的服务根地址，不能填写 `/chat/completions` 端点。月报继承当前研究对象和月份，或要求用户补齐研究对象；只纳入目标月份有有效观察的素材，最多 30 条并按研究对象轮流选取。报告固定为“三个重点、研究对象、代表素材、继续关注”，摘要可在页面内编辑并导出单个离线 HTML；不保存报告、聊天或素材副本。没有有效样本不生成报告，缺少上月数据不生成环比，缺少效果数据不评价 ROI。公共电脑负责采集、存档、质量校验和统一指标计算；工作台只做允许字段投影和解释，任何未知字段、格式异常、上游失败或数据不足均明确停止结论。只有本人测试通过并启用的模型可在规则无法理解问题时提出带用户原文证据的研究对象、月份和目的，或根据脱敏标签、脚本和服务端事实写出观察；它不能生成数字、执行平台操作、访问任意 URL 或绕开服务端统计。选定素材的比较待公共电脑的统一比较合同通过后开放。市场情报不继承 Case、Gate、Plan、confirmation 或平台写权限。

页面沿用投放执行的六模块壳层。默认对话状态在首屏只读取本人配置，输入或快捷入口才触发公共电脑请求；对话区域保留当前页面的短记录和最新结果。Agent 概览、技能和知识库只说明可用只读能力；记忆只投影当前研究对象、月份、当前素材和报告草稿，数据统计只投影本次请求返回的候选、有效样本、观察月份和未完成核验数。切换模块不重复查询，刷新不保存这些页面状态。

## 8. 投放策略 Agent：规划中

投放策略将消费市场情报、业务目标及已授权投放效果数据，输出可审阅的策略建议和理由。它不直接执行市场情报结论，也不持有平台写权限；任何可执行动作必须重新进入投放执行 Agent 的 Intake、Case、冻结 Plan 与本人确认闭环。本轮仅保留广场预告，不提供工作区、模型调用或策略结论。

## 9. 权威来源索引

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

## 10. 开发验证入口

新能力通过隔离测试入口验证；环境与数据合同见[隔离测试数据库](project-数据与报表契约.md#隔离测试数据库)。正式 server 的 HTTP 处理器由内部 `createWorkbenchServer({ repo, env })` 构造，部署入口仍使用默认仓储与环境；请求参数不能切换仓储或测试模式。测试平台请求必须使用显式假传输和合成凭据依赖，未配置请求阻断并令回归失败；正式 runner、Plan 编译、确认、创建和回查不会因测试来源自动放宽资源、确认或权限判断。

追加只读、Plan 保存和素材推送不计追加次数；同一 Case 的 `oc_project_video_append` action 跨 Job 累计最多三次。确认前必须校验冻结 wire/hash，再在 Case 锁中核验本人、最新 Job、Plan、次数和最近动作结束时间并原子领取一次额度；相邻请求至少间隔 20 秒。每次额度都要求新 Plan、新 hash 和本人新确认，旧 Plan 永不重发。只有明确平台拒绝且权威回查确认仍缺失时才允许恢复；超时、网络异常、5xx、非 JSON、缺少业务码或查询失败都只允许回查。额度耗尽后停止恢复入口，保留回查和人工排查。

### 追加视频的两段受控写入

当指定视频已在物料户可用、但目标账户尚未拥有时，工作流先冻结 `project_video_material_push` Plan：每批最多 50 条，最多两批；任一批失败即停止。推送完成后必须重新只读核验，才会生成独立的 `project_video_append` Plan。两份 Plan 分别确认、分别单次消费；追加前继续校验项目素材集合与受保护配置漂移。

追加视频的 Intake 在已识别本人账户而尚未选择项目时，查询 Postgres 中本人账户已验证的标准项目：候选必须来自已完成的 `runtime_truth` 创建 Job、本人 Case、`created_objects` 和该对象最新 `readback_verified` 记录。推荐按最近验证时间展示至多五项；手动输入按精确项目 ID 查询完整候选集合。两种方式均重新核验同一记录，再派生路线和游戏。选择只写当前页面草稿；它不创建 Case、Job、Plan 或确认记录。
