# Solution Design

| 元信息 | 值 |
| --- | --- |
| 文档状态 | 当前有效；方案设计规范 |
| 最后更新时间 | 2026-08-31 20:40 CST |
| 校验基线 | Git `4c0a737`；当前逻辑图与数据报表契约 |
| 重新校验条件 | 真值优先级、Task/Manifest、Plan/确认、平台写入或回查机制变化时 |

用途：针对卡点、异常、需求、迁移或重要调整，形成可落地、可验证、可停止的方案。

本文件只定义方案方法，不保存动态账户、Case、Job、Plan 或运行状态。

## 已批准设计：Case Gate 真值与账户级事件资产合同

当同一 Case 同时缺少 monitor、触点和账户资源时，唯一 root blocker 必须按依赖顺序选择：已创建对象回查、创建尝试上限、人工修正、monitor/上下文、游戏包、Node 4 资源、Plan 兜底。View、Execution Plan 和工作台只消费这一排序结果，不各自选择不同 blocker。

事件资产保持 fail-closed：正式 action 只能使用与当前 route、game、advertiser 相同的账户级合同，合同必须带目标账户、版本化模板引用、动态模板 hash、官方接口合同与目标 App/实例只读前提。不得以移除校验的方式开放到所有账户。

本设计只修复本地真值、展示和计划资格；monitor、事件资产及投放创建仍须分别建立专项 Task、冻结 Plan 并取得明确写入授权。

## 已批准设计：Monitor 单轨真值与 Plan-bound Bootstrap

保持既有 3 阶段 7 Node、Case/Job、Postgres 真值、`workflow_case_summary` 唯一 Gate 与 Plan-bound executor 不变。monitor 仍属于 Node 02 `creation_context` 的独立 bootstrap，不能与资源或广告项目创建混合授权。

`mwb.v_monitor_readiness` 是 route×game×advertiser 粒度的唯一 monitor readiness 投影。它以 scope、monitor ID、受控触点、fresh readonly 回查证据和最新 cycle 状态决定 `monitor_ready`、唯一 `actionable_blocker_code`、诊断集合和建议动作。已 resolved 的 cycle 只保留历史诊断，绝不能再把 `monitor_id_already_resolved_no_create_needed`、`cycle_not_active:resolved` 或历史 attempt 上限投影为当前 root blocker。

monitor 写入使用现有 `launch_execution_plans`、`launch_confirmations`、`platform_actions` 与 action grant；新增的 `monitor_bootstrap` Plan 只能包含一次 `ensure_monitor`。执行前必须匹配全局 Guardrail、active Case、精确 Plan/hash、confirmation 和单动作 grant；创建前 fresh readonly、创建一次、创建后权威回查。失败不得自动重试；下一次尝试必须使用新 Plan/hash/confirmation，cycle 内最多两次。

Node 02 只公开一个 monitor facade。CLI 只保留状态、fresh readonly reconcile 和只读配置同步；Plan、确认和真实执行不再由 CLI 环境变量直接授权。实施与测试不调用真实 monitor、资源或广告平台写接口。

## 已批准设计：终态失败 Monitor 的受控只读回查

`workflow_case_summary` 的 Gate、根阻断和排序不变。仅当 active Case 的最新 Job 处于 `resolve_case_blocker`、唯一 root blocker 为 `monitor_create_busy_retry_exhausted` 且 `monitor_resolved=false` 时，工作台允许精确指令“重新只读回查 monitor”。该指令复用 Node 02 的 fresh readonly reconcile，不生成 Plan、confirmation、action grant 或平台写入。

普通“继续执行”保持只展示 blocker，避免误触发外部查询；历史 Job、非 active Case、其他 blocker 均不得触发该动作。回查发现唯一 monitor 并完成触点回查时，只落脱敏证据并刷新既有 Case 投影；未发现、查询失败或结果不唯一时保留原终态 blocker，不重试、不创建、不改写旧 cycle/attempt/Plan。工作台文案只提示精确指令及安全错误码，不展示完整 URL 或 raw 响应。

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
