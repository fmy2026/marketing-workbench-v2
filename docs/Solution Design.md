# Solution Design

| 元信息 | 值 |
| --- | --- |
| 文档状态 | 当前有效；方案设计规范 |
| 最后更新时间 | 2026-08-31 23:22 CST |
| 校验基线 | Git `f61f700` + 新账户两次确认闭环 Task；当前逻辑图与数据报表契约 |
| 重新校验条件 | 真值优先级、Task/Manifest、Plan/确认、平台写入或回查机制变化时 |

用途：针对卡点、异常、需求、迁移或重要调整，形成可落地、可验证、可停止的方案。

本文件只定义方案方法，不保存动态账户、Case、Job、Plan 或运行状态。

## 已批准设计：Monitor READY 路径的新账户两次确认闭环

保持 OE3 既有 3 阶段 7 Node、`workflow_case_summary`、Plan 类型、Postgres 表和 Plan-bound 权限模型不变。成功路径使用两份相互独立且各只能消费一次的 Plan：第一份 `resource_prepare` 只授权可自动准备资源，第二份 fresh `std_project_create` 只授权一次标准项目创建。资源动作与项目创建不得混入同一 Plan。

当 event asset 缺失且账户级合同已通过时，Resource Plan 必须同时冻结 `ensure_resource:event_asset` 与紧随其后的 `ensure_event_configs:baseline`。事件资产 executor 在创建后先完成目标资产身份回查，并把真实 asset ID 仅在本次内存执行链中传给 event-config executor；baseline configs 完成后再执行完整事件链权威回查。任一动作或回查失败立即停止，修正必须使用新 Plan/hash/confirmation，不自动重试。

工作台可为 ready 的普通 Resource Plan 展示脱敏确认卡；精确确认后只调用既有 confirmed-resource orchestrator。全部资源权威回查通过并消费 Plan 后，在同一 Case 下创建 fresh runtime Job，重新运行只读准备并生成只含 `std_project_create` 的 Create Plan。第二次精确确认后才允许一次创建，并以权威回查为完成条件。

“两次确认”只指 monitor 已 READY、人工 SHARE 和 verify-only 前提已完成且执行无失败的成功路径。monitor 缺失仍使用独立 `monitor_bootstrap` 确认；backup landing page SHARE 与 micro-app authority readonly 是前置条件，不属于这两份写入 Plan。实施与测试不得对真实账户执行平台写入。

## 已批准设计：Case Gate 真值与账户级事件资产合同

当同一 Case 同时缺少 monitor、触点和账户资源时，唯一 root blocker 必须按依赖顺序选择：已创建对象回查、创建尝试上限、人工修正、monitor/上下文、游戏包、Node 4 资源、Plan 兜底。View、Execution Plan 和工作台只消费这一排序结果，不各自选择不同 blocker。

事件资产保持 fail-closed：正式 action 只能使用与当前 route、game、advertiser 相同的账户级合同，合同必须带目标账户、版本化模板引用、动态模板 hash、官方接口合同与目标 App/实例只读前提。不得以移除校验的方式开放到所有账户。

本设计只修复本地真值、展示和计划资格；monitor、事件资产及投放创建仍须分别建立专项 Task、冻结 Plan 并取得明确写入授权。

## 已批准设计：零事件资产账户的小游戏实例独立只读回查

当目标账户尚无 `MINI_PROGRAME` 事件资产时，Node 04 不得把“事件资产详情中观察到实例”作为小游戏实例唯一的权威来源。对唯一、受控的候选 `micro_app_instance_id`，可单独调用官方 `optimized_goal/get`，以当前账户、`BYTE_GAME`、小游戏 App 和实例候选执行只读 eligibility 回查；该调用不带事件资产前提，也不创建任何资源。

只有业务码成功、request ID 存在、候选不歧义，并且当前路线的主/深度优化目标均命中时，才可把 `micro_app_instance` 落为 `visible + readback_verified`，并保存脱敏 probe 摘要和 evidence 引用。失败、歧义或缺少候选一律保持 `micro_app_instance_target_unverified`。事件资产创建仍要求账户级合同、独立 Plan/hash、人工确认、单次调用与权威回查；该只读 Skill 不产生 Plan 或写授权。

## 已批准设计：Monitor 单轨真值与 Plan-bound Bootstrap

保持既有 3 阶段 7 Node、Case/Job、Postgres 真值、`workflow_case_summary` 唯一 Gate 与 Plan-bound executor 不变。monitor 仍属于 Node 02 `creation_context` 的独立 bootstrap，不能与资源或广告项目创建混合授权。

`mwb.v_monitor_readiness` 是 route×game×advertiser 粒度的唯一 monitor readiness 投影。它以 scope、monitor ID、受控触点、fresh readonly 回查证据和最新 cycle 状态决定 `monitor_ready`、唯一 `actionable_blocker_code`、诊断集合和建议动作。已 resolved 的 cycle 只保留历史诊断，绝不能再把 `monitor_id_already_resolved_no_create_needed`、`cycle_not_active:resolved` 或历史 attempt 上限投影为当前 root blocker。

monitor 写入使用现有 `launch_execution_plans`、`launch_confirmations`、`platform_actions` 与 action grant；新增的 `monitor_bootstrap` Plan 只能包含一次 `ensure_monitor`。执行前必须匹配全局 Guardrail、active Case、精确 Plan/hash、confirmation 和单动作 grant；创建前 fresh readonly、创建一次、创建后权威回查。失败不得自动重试；下一次尝试必须使用新 Plan/hash/confirmation，cycle 内最多两次。

Node 02 只公开一个 monitor facade。CLI 只保留状态、fresh readonly reconcile 和只读配置同步；Plan、确认和真实执行不再由 CLI 环境变量直接授权。实施与测试不调用真实 monitor、资源或广告平台写接口。

## 已批准设计：终态失败 Monitor 的受控只读回查

`workflow_case_summary` 的 Gate、根阻断和排序不变。仅当 active Case 的最新 Job 处于 `resolve_case_blocker`、唯一 root blocker 为 `monitor_create_busy_retry_exhausted` 且 `monitor_resolved=false` 时，工作台允许精确指令“重新只读回查 monitor”。该指令复用 Node 02 的 fresh readonly reconcile，不生成 Plan、confirmation、action grant 或平台写入。

普通“继续执行”保持只展示 blocker，避免误触发外部查询；历史 Job、非 active Case、其他 blocker 均不得触发该动作。回查发现唯一 monitor 并完成触点回查时，只落脱敏证据并刷新既有 Case 投影；未发现、查询失败或结果不唯一时保留原终态 blocker，不重试、不创建、不改写旧 cycle/attempt/Plan。工作台文案只提示精确指令及安全错误码，不展示完整 URL 或 raw 响应。

## 已批准设计：Monitor 触点只读回查收口

Node 02 fresh readonly reconcile 必须以平台返回的受控触点 URL 与其 hash 的一致性作为完成条件，不能仅凭 URL hash 判定 `touchpoint_resolved`。受控 URL 只允许在内存中传递并写入既有 `mwb.account_touchpoints.touchpoint_url` 字段；对外 API、工作台、普通日志与 evidence 只保存存在性、hash、状态和脱敏引用。

回查写入后必须调用既有触点完整性校验；只有 monitor ID、受控触点引用、完整受控 URL、hash 一致性和回查证据均存在时，才可把本次 run 标为 `touchpoint_resolved`，并由 canonical `monitor_ready` 推进 Case。缺 URL、hash 或完整性不一致时只标记 `monitor_resolved_touchpoint_pending`，保留 `needs_touchpoint_readback` 与 `touchpoint_url_missing`，不创建、不重试、不生成 Plan。

`workflow_case_summary` 在 `run_monitor_readonly` 状态必须直接选择 `v_monitor_readiness.actionable_blocker_code`，不得以历史 Skill blocker 回退覆盖它。monitor 已 READY 后，`monitor_id_missing`、`touchpoint_url_missing` 和 `touchpoint_url_hash_mismatch` 等历史 Node 02 Skill blocker 必须从 root 排序中排除，让 Case 进入下一项真实非 monitor blocker。工作台回查成功提示必须读取刷新后的 canonical `monitor_ready=true`；否则只说明“已找到 monitor，但受控触点回查未完成”，并不暗示可继续创建。

## 已批准设计：最新 Case 的 Node 02 当前就绪投影

工作台的 `?case_id=` 最新 Case 视图必须把 Node 02 的当前就绪状态与历史 Skill 取证分开：账户状态读取当前 `advertiser_accounts`，触点引用与 monitor 读取 `v_monitor_readiness`。只有当前账户、受控触点与 canonical readiness 均满足时才显示通过；当前 readiness 有对应 blocker 时显示阻断；未知时显示等待。

`?job_id=` 是历史只读视图，继续展示该 Job 的 `launch_skill_runs`，不得被后续 readonly reconcile 覆盖。最新 Case 视图可在每个子项的 trace 中保留这些历史 Skill 结果供审计，但不得用它们覆盖当前 canonical 状态。此展示修复不改写 `launch_node_runs`、`launch_skill_runs`、Case Gate、root blocker 或任何平台动作。

事件资产仍按账户级合同 fail-closed：仅在 fresh readonly 已验证目标 App、目标小游戏实例的权威回查证据和事件资产链路，且当前账户的 `target_advertiser_id`、`template_ref`、动态 `template_hash` 与官方创建合同匹配时，才可编译只含 `ensure_resource:event_asset` 的 fresh `resource_prepare` Plan。引用型实例候选、缺失实例回查或跨账户模板都只能形成 blocker，不能持久化可执行合同。该专项不确认、不执行写入；未来执行必须使用新的 Task、Plan/hash 与单次确认。

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
