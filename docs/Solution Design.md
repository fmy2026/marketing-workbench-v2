# Solution Design

| 元信息 | 值 |
| --- | --- |
| 文档状态 | 当前有效；方案方法与有效决策索引 |
| 最后更新时间 | 2026-09-10 CST |
| 校验基线 | 当前代码、SQL migrations 至 `083`；逻辑图精简任务 `TASK-MWBV2-WORKFLOW-LOGIC-DOC-SIMPLIFICATION-20260910` |
| 重新校验条件 | 方案方法或已批准关键选择发生变化时 |

本文回答“如何形成方案、为什么选择这条路”。当前行为分别查 [逻辑图](project-现在的逻辑图.md)、[数据与报表契约](project-数据与报表契约.md)、[部署说明](../deploy/README.md)；启动、权限和任务闭环规则只定义在 [AGENTS](../AGENTS.md)。不在这里追加任务执行流水或账户当前状态。

## 有效决策索引

每项只保留选择、理由及依据。改变选择时更新对应行并关联新的批准 Task；实现细节在权威机制文档维护，任务结果及验证在对应 Task/Manifest 保存。收口前完整设计与当时的排查记录保留于 Git `4b54087bf25b84137af9414fc2d34f331fef1535:docs/Solution Design.md`，不能作为当前运行真值。

| 决策 | 已批准选择与理由 | 依据 / 当前合同 |
| --- | --- | --- |
| 项目协作合同 | 保留既有文档骨架，以两份 Schema、单一 Manifest 状态/读取清单及只读检查防止任务记录漂移；先约束新任务 | [本次批准任务](../tasks/TASK-MWBV2-PROJECT-CONTRACT-CHECKS-20260908.md)、[启动协议](../AGENTS.md) |
| 数据库文档唯一入口 | 结构、口径与数据库运维说明全部集中；旧说明及后续获批删除的早期方案由 Git 保留历史，避免重复规则漂移 | [批准任务](../tasks/TASK-MWBV2-DATABASE-DOC-CONSOLIDATION-20260908.md)、[数据契约](project-数据与报表契约.md) |
| 3 阶段 7 Node | 节点只从注册表定义，Skill 与 runner 承接固定流程，减少消费者各自解释 | [节点统一任务](../tasks/TASK-MWBV2-WORKFLOW-NODE-REGISTRY-UNIFICATION.md)、[逻辑图](project-现在的逻辑图.md) |
| 当前逻辑图分层 | 当前逻辑图以唯一闭环为主线，按 7 Node 归纳 Workflow Skill，以资源四态和核心 Gate 场景说明分支，只保留一次 Plan-bound 安全约束；路线字段、接口参数、时间窗口和专项异常只链接唯一合同，避免静态总览退化为实现流水或第二套状态机 | [本次批准任务](../tasks/TASK-MWBV2-WORKFLOW-LOGIC-DOC-SIMPLIFICATION-20260910.md)、[逻辑图](project-现在的逻辑图.md) |
| 数字员工广场与 Agent 壳层 | 登录后先进入 Agent 广场；可用 Agent 通过服务端公开注册表声明，工作区仅以模块和地址承载既有 Workflow。壳层不计算 Gate、不选择 Plan、不持有账户动态事实；历史 Case/Job 链接统一迁至 Agent 工作区，旧根路径链接重定向兼容。P0 只开放投放创建，能力摘要采用真实的 7 Node、8 类资源和 3 类 Plan，不虚构知识库或技能数量 | [本次批准 Task](../tasks/TASK-MWBV2-AGENT-HUB-SHELL-20260910.md)、[当前逻辑图](project-现在的逻辑图.md) |
| 每用户 Agent 模型配置 | 模型配置按 `user_id × agent_key` 隔离；Postgres 仅保存协议、模型、无凭据 API Base、不可逆本地凭据引用、启用和脱敏测试状态，API Key 仅保存于 gitignored 的本机 `0600` 原子凭据库。更新配置即失效，只有无业务数据的固定 Schema 测试通过后可启用；管理员不能读取或代改他人配置 | [本次批准 Task](../tasks/TASK-MWBV2-AGENT-MODEL-CONFIG-20260910.md)、[数据契约](project-数据与报表契约.md) |
| LLM 仅作受限意图解析 | 只有本人已测试、已启用的配置才能解析未被规则准确识别的输入；精确确认、取消、状态、继续与 readonly 恢复始终由确定性解析优先处理。模型输入不含 Case、Job、Gate、Plan 或账户运行状态，输出只能是 allowlist intent、置信度和三项 Intake 槽位；超时、非 JSON、低置信或非法输出均回退规则解析。模型不能决定 Gate、Plan、确认、权限或任何平台动作 | [本次批准 Task](../tasks/TASK-MWBV2-LLM-INTENT-RESOLVER-20260910.md)、[当前逻辑图](project-现在的逻辑图.md) |
| LLM 显式 Intake 与用户语言进度 | 规则完整识别三项 Intake 时直接使用规则；仅部分识别且模型已启用时，模型只能凭输入中可验证的证据补空槽位，规则值不可被覆盖，缺项不得从默认值、历史或账户推断。模型输出不直接作为对话答案；用户可见的范围提示、卡点、下一步和进度均由读取 Case summary 的确定性模板生成。预设只是用户显式选择，不改变 Workflow、Gate、Plan 或平台动作 | [本次批准 Task](../tasks/TASK-MWBV2-LLM-EXPLICIT-INTAKE-PROGRESS-20260910.md)、[当前逻辑图](project-现在的逻辑图.md) |
| Agent 只读模块 | 记忆只投影本人 Case、最新 Job、规范化槽位、状态和受控证据引用，不保存聊天原文；知识库和技能仅展示注册表与 7 Node 的公开能力说明。数据统计默认本人，管理员须显式切换“全部用户”才读取全量只读报表，且不获得代操作权限 | [本次批准 Task](../tasks/TASK-MWBV2-AGENT-READONLY-MODULES-20260910.md)、[数据契约](project-数据与报表契约.md) |
| Case 与单一 Gate | Case 管持续目标、Job 管一次运行；消费者统一读 summary，避免历史 blocker 冒充当前阻断 | [Case Gate 任务](../tasks/TASK-MWBV2-CASE-GATE-TRUTH-UI-ACCOUNT-CONTRACT-20260831.md)、[数据契约](project-数据与报表契约.md) |
| 用户与账户归属 | 本人执行/确认，管理员管理用户及只读报表；账户发现前验证唯一 owner | [账户隔离任务](../tasks/TASK-MWBV2-LAN-USER-ACCOUNT-ISOLATION-20260907.md) |
| 局域网入口 | 私网 HTTP 仅以显式配置开放受限试用；部署配置与恢复方式集中在运维文档 | [部署说明](../deploy/README.md) |
| 正式平台写入 | 工作台/API 通过冻结 Plan、精确确认和通用 executor 执行；普通运行不再为每份 Plan 创建仓库 Task | [原生 Plan-bound 任务](../tasks/TASK-MWBV2-WORKBENCH-NATIVE-PLAN-BOUND-CLOSURE-20260901.md) |
| 分开确认资源和创建 | 独立 Resource Plan 与 fresh Create Plan，避免资源修正扩大项目创建授权；monitor 缺失时另用 Bootstrap Plan | [两次确认任务](../tasks/TASK-MWBV2-NEW-ACCOUNT-TWO-CONFIRM-CLOSURE-20260831.md) |
| 正式入口与文件隔离 | 业务写入只走主链；`.archive/` 是唯一可恢复归档根，SQL migration 与 Task/Manifest 历史原位保留 | [入口隔离任务](../tasks/TASK-MWBV2-SCRIPT-ENTRYPOINT-ISOLATION-20260901.md)、[文件收口任务](../tasks/TASK-MWBV2-PROJECT-FILE-CONSOLIDATION-20260908.md) |
| 新账户只读推进 | 精确账户预检后建立 Case，Gate 驱动有界只读推进；在确认卡或真实 blocker 停止 | [新账户桥接任务](../tasks/TASK-MWBV2-NEW-ACCOUNT-MONITOR-BOOTSTRAP-BRIDGE-20260902.md) |
| 账户当前状态 | 使用账户 canonical readiness 纠正历史缺失/未就绪投影，保留历史 Skill 证据 | [账户投影任务](../tasks/TASK-MWBV2-CANONICAL-ACCOUNT-READINESS-PROJECTION-20260902.md) |
| 资源准备与回查 | 只为注册表支持的资源编译动作；事件资产、配置与目标绑定顺序核验，部分完成也要有准确 blocker | [逻辑图](project-现在的逻辑图.md)、[资源能力注册表](../src/workflows/skills/oe3/04-resource-action-registry.mjs) |
| 资源动作精确调用量 | 资源 executor 的 fresh readonly 结果是该动作唯一调用量来源：0 表示已满足、不生成写动作；正整数同时冻结在 planned action、action grant 与 Plan 总调用量。确认前重新计算；任一数量或授权不一致均在 confirmation claim 前 fail-closed，必须走 fresh Job/Plan，不能改写旧 Plan | [本次批准任务](../tasks/TASK-MWBV2-GENERIC-RESOURCE-ACTION-CALL-LIMIT-20260908.md)、[当前逻辑](project-现在的逻辑图.md) |
| 事件配置最终一致性 | 所有写入成功后采用有界只读回查窗口吸收可见性延迟，失败不重试创建 | [回查窗口任务](../tasks/TASK-MWBV2-EVENT-CONFIG-POST-CREATE-READBACK-20260906.md) |
| 平台响应与完成判定 | 受理不等于 verified；统一错误分类、HTTP deadline 和严格 finalizer，避免误成功或悬挂 | [终态任务](../tasks/TASK-MWBV2-CASE-TERMINAL-HTTP-DEADLINE-20260902.md)、[回查收口任务](../tasks/TASK-MWBV2-STD-PROJECT-READBACK-CLOSURE-20260902.md) |
| 标准项目 `40100` 有界错峰投递 | 一个冻结 Create Plan、payload/hash、confirmation 与逻辑 action 只能在精确 `std_project/create + 40100 + 无对象 ID` 下投递至多三次；调用点为 `0 / 20–24 / 45–49` 秒，抖动由 action ID 确定。其他业务码、HTTP 429、超时、网络/解析不明均 fail-closed；物理投递写入脱敏 delivery 审计，Case Attempt 仍只计该一个逻辑 action | [本次批准任务](../tasks/TASK-MWBV2-STD-PROJECT-40100-RATE-LIMIT-REDELIVERY-20260909.md)、migration `080`、[当前逻辑](project-现在的逻辑图.md) |
| 尝试次数与安全重开 | Case 跨 Job 计数，耗尽先人工诊断；获批后由本人建立单次替代 Case，不复制旧授权 | [次数与恢复任务](../tasks/TASK-MWBV2-CASE-ATTEMPT-LIMIT-RECOVERY-20260908.md) |
| 个体事实数据化、运行机制能力化 | 账户差异只作为 Postgres 的通用 capability（例如 `video_cover_required`）参与既有合同；耗尽重开只依据 owner、Case/Gate、批准 evidence、零创建对象和零 verified readback。runtime 不以内嵌账户/Case/Job/user ID 作为默认目标或分支；同类问题扩展既有能力并验证开/关正反例 | [本次批准任务](../tasks/TASK-MWBV2-GENERIC-RUNTIME-MECHANISM-20260908.md)、[启动协议](../AGENTS.md)、[当前逻辑](project-现在的逻辑图.md) |
| Monitor 账户身份有效配置 | 乾坤 `accountIndex` 是账户技术身份的只读来源，账户的 `agent_id`、乾坤账户记录和 owner 写入 `advertiser_accounts`；路线默认值只保留路线/游戏字段，绝不保存或兼容代理 ID。Monitor readonly、Plan 与确认后的 fresh preflight 由同一装配器把路线固定配置与数据库账户身份合成为 immutable effective config；身份漂移使旧 Plan 失效，不写平台，须经 fresh Job/Plan 重新确认 | [本次批准任务](../tasks/TASK-MWBV2-MONITOR-ACCOUNT-IDENTITY-CONFIG-20260910.md)、[当前逻辑](project-现在的逻辑图.md)、[数据契约](project-数据与报表契约.md) |
| 引导视频能力自动识别 | JSZC 每个 fresh Job 在唯一已核验小游戏实例上仅作一次 `gameplay/list` readonly；唯一非空 ID 要求每条 required video 复用它，空列表允许省略，多候选或 probe 失败 fail-closed。账户 `guide_video_required=true` 仅为兼容性强制要求，不能将空结果降级；动态 ID 仅保存在当前 Job 绑定的资源 metadata。`platform_status` 不参与此分支 | [本次批准任务](../tasks/TASK-MWBV2-JSZC-GUIDE-VIDEO-AUTO-DETECT-20260909.md)、migration `079`、[当前逻辑](project-现在的逻辑图.md) |
| Intake 启动只读恢复桥接 | 本人重新规范化三项 Intake 并点击“启动流程”是一次显式只读恢复授权：仅已批准替代 Case 的最新 Job 被 Gate Policy 判定为已停止 confirmed resource/monitor Plan 时，工作台提交既有“重新只读准备”命令，创建或复用同一 Case 的 fresh Job。该桥接不重放旧 Plan、不确认、不创建平台对象，也不依赖任何个体 ID | [本次批准任务](../tasks/TASK-MWBV2-INTAKE-READONLY-RECOVERY-20260909.md)、[当前逻辑](project-现在的逻辑图.md) |
| Plan / Draft 发布绑定 | Plan 版本与创建 Attempt 分离；最终 Draft 与 Plan ID/hash 原子绑定，避免消费陈旧授权 | [Plan 合同](../src/workflows/executionPlan.mjs)、[数据契约](project-数据与报表契约.md) |
| 游戏默认值与账户资源 | 路线保底参数逐叶修正；DMP、素材、实例、引导视频和触点仍从各自真值读取，避免复制账户动态值 | [数据契约](project-数据与报表契约.md)、migrations `069`、`074` |
| 标准项目语义查重与评论管理 | Node 05 以路线合同同时执行未删除同名与语义标的/竞价策略查重；语义字段或分页无法可靠核验即 fail-closed。评论管理默认启用，由路线默认值 `is_comment_disable=ON` 与字段账本共同保护；不引入账户专用逻辑 | [本次批准任务](../tasks/TASK-MWBV2-SEMANTIC-DUPLICATE-COMMENT-20260909.md)、migration `078`、[当前逻辑](project-现在的逻辑图.md) |
| OAuth 每日刷新与瞬时失败 | 唯一 Codex cron 每天 12:01（Asia/Shanghai）执行一次受控 OAuth 刷新；成功和失败均写脱敏 audit。传输失败按 DNS、代理/连接、TLS、超时或未知分类并非零退出，不自动重试；仅原 access token 可信且未过期时保留其可用状态 | [本次批准任务](../tasks/TASK-MWBV2-OCEANENGINE-TOKEN-REFRESH-MINIMAL-20260909.md)、[刷新实现](../src/platforms/oceanengineTokenRefresh.mjs)、[部署说明](../deploy/README.md) |

## 何时使用

调整流程、Node、Skill、API、数据库、View、报表、授权、外部接口或迁移时先形成方案；需要比较路径或人工关键决策时也使用本文件。普通文案和小范围可逆修正可压缩为“问题 → 推荐修正 → 验收 → 停止条件”，不为形式增加材料。

## 方案最小格式

| 项目 | 必须说明 |
| --- | --- |
| 问题与目标 | 当前现象、证据、唯一目标、成功标准与非目标；涉及业务下一步时实时查询 summary |
| 系统位置 | 影响的能力、Node、表/View、上下游及真值所有者 |
| 事实与约束 | 已确认事实、未知项、权限、兼容性、副作用和风险 |
| 方案选择 | 可选方案、推荐理由、允许与禁止修改；关键选择由人确认 |
| 验证与停止 | 验收条件、检查方法、证据、停止与回退条件、剩余风险 |
| 决策与依据 | 批准的选择及日期，当前代码、数据库只读结果、官方资料和经验引用 |

批准后将方案映射到 Task 的目标、范围及 `AC-*` 验收；将必读、允许路径、领域、检查方法和停止条件映射到 Manifest。任务状态、关闭次序、命令与证据格式只查 [AGENTS 的任务合同](../AGENTS.md#任务合同与校验)。

## 资料使用

当前项目与业务真值优先级只定义在 [AGENTS](../AGENTS.md#真值)。代码/Schema 证明实现，Postgres 证明业务事实，当前文档解释合同；旧项目和历史方案只提供可验证的假设，不能成为新任务的当前真值。

| 接口资料 | 检索入口 |
| --- | --- |
| OE3 官方 3.0 | `/Users/hys/knowledge/01-个人本地知识库/01-官方文档/open.oceanengine.com-3.0` |
| OE3 外部给定 3.0 | `/Users/hys/knowledge/01-个人本地知识库/01-官方文档/open.oceanengine.com-3.0-waibugei` |
| OE3 官方 2.0 | `/Users/hys/knowledge/01-个人本地知识库/01-官方文档/open.oceanengine.com-2.0` |
| OE3 官方 2.0 copy | `/Users/hys/knowledge/01-个人本地知识库/01-官方文档/open.oceanengine.com-2.0-copy` |
| 乾坤接口 | [当前 API 文档](qiankun-api-docs-20260827.md) |

OE3 按上表顺序查证：3.0 资料不足时才补查 2.0，关键版本冲突转为人工决策。需要的官方具体文件按任务加入读取清单，避免整个知识库成为默认必读。

## 本项目采用的方法

- v3：使用固定启动锚点、最小充分上下文和任务验收合同；历史召回与当前权威分开。
- 长线补充：每项能力明确输入、执行、输出与承接；每张核心表/View 明确粒度、键、来源、写入者和消费者。
- v4：以产物、正确数据、证据、验证和副作用说明完成闭环；把重复错误固化成检查，按真实需要演化架构。

三份方法论位于 `/Users/hys/knowledge/01-个人本地知识库/03-人机协作与方法论/1-human-AI/`，本项目只采用上述已批准的部分，不将其全部目录结构、原始数据留存或通用重试建议直接引入运行主链。
