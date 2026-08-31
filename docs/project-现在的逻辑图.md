# marketing-workbench-v2｜当前逻辑图与执行 Gate

| 元信息 | 值 |
| --- | --- |
| 文档状态 | 当前有效；静态底层机制说明 |
| 最后更新时间 | 2026-08-31 21:20 CST |
| 校验基线 | Git `62d6893` + 当前 Monitor 触点只读收口 Task；`project.state.json.schema_version=2026-08-28.project-control-plane-v2`；最新 migration `066_monitor_ready_stale_skill_projection.sql` |
| 适用范围 | OceanEngine 3.0 字节小游戏路线的 Case、Job、资源准备、标准项目创建与回查机制 |
| 权威来源 | `project.state.json` → 当前 Task/Manifest → 节点注册表与合同 → `db/*.sql` / Postgres `mwb` |
| 重新校验条件 | 7 Node 注册表、资源能力、Execution Plan/确认规则、`workflow_case_summary` Gate 优先级、工作台 Case/Job 入口或 Schema/View 变化时 |

> 更新时间只证明本文件最后一次静态校验时间；账户、Case、Job、Plan、确认、资源和平台动作的当前事实必须实时读取 Postgres，消费端只读 `mwb.workflow_case_summary`。

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

### Node 02 Monitor 单轨 Bootstrap

```text
v_monitor_readiness（唯一状态读取）
→ fresh readonly reconcile
→ monitor_bootstrap Plan（仅 ensure_monitor）
→ 精确 Plan ID/hash 的独立“确认创建 monitor”
→ Guardrail + confirmation + action grant
→ fresh readonly 查重 → atomic claim → 单次创建 → 权威回查
→ 脱敏证据与触点落账
→ 下一次继续执行创建 fresh runtime Job，进入正常 01–07
```

`monitor-state-read` 只读 Postgres；`monitor-readonly-reconcile` 是受 Gate 调度的外部只读；`monitor-plan-compile` 纯编译；`monitor-execute-once` 只在已确认的 `monitor_bootstrap` Plan 内执行。通用 runner 不会代替该 Plan 创建 monitor。

## 3. Node 04：资源状态与准备边界

```text
游戏级资源蓝图 + 目标账户 fresh readonly
  ├─ 唯一命中、可用、字段合同和权威回查通过 → READY
  ├─ 缺失，但 prepare_supported 且 executor / 调用上限 / 回查合同齐全 → PLANNED
  └─ 只读失败、多候选、来源或合同缺失、executor 缺失、回查失败 → BLOCKED
```

历史 verified 不会因一次只读降级被覆盖为 missing；但历史 verified 也不能跳过本轮 verify-only Gate。共享备用页的目标 `SHARE` 清单请求降级时，保留最后一次 verified 资源事实，同时以 `site_get_target_shared_blocked` 阻断本轮 Plan。

| 必需资源 | 可自动准备 | Plan action | READY 的权威依据 / 固定边界 |
| --- | ---: | --- | --- |
| avatar | 是 | `ensure_resource:avatar` | 头像源合同与目标账户回查 |
| dmp_audience_package | 是 | `ensure_resource:dmp_audience_package` | 来源/目标逐包只读与目标可投回查 |
| event_asset | 是 | `ensure_resource:event_asset` | 资产唯一命中、App/实例绑定、事件链回查 |
| video_asset | 是 | `ensure_resource:video_asset` | 视频、封面和目标账户可见性回查 |
| product_image | 是 | `ensure_resource:product_image` | 108×108 PNG、hash 与目标素材回查 |
| brand_info | 否 | — | 品牌与行业只读；缺失即 blocker |
| micro_app_instance | 否 | — | 实例与事件链只读；不猜测、不创建 |
| backup_landing_page | 否 | — | 仅人工共享后读取目标 `SHARE` 清单；不使用普通库存或非正式共享接口替代 |

已确认资源动作严格按以下顺序消费；每项均需 Plan 内授权、原子 claim、一次写入与权威回查：

```text
ensure_resource:avatar
→ ensure_resource:dmp_audience_package
→ ensure_resource:event_asset
→ ensure_resource:video_asset
→ ensure_resource:product_image
→ ensure_event_configs:baseline
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

全部 READY
  → Node 05 Draft / payload contract / duplicate readonly
  → Create Plan（只含 std_project_create）
  → plan_id + plan_hash + target payload hash 人工确认
  → Node 06 create once → Node 07 readonly readback
```

每份 Execution Plan 固定绑定 `case_id`、`job_id`、`advertiser_id`、`plan_id`、`plan_hash`、版本、计划动作、调用上限、资源状态、blocker 与目标 Draft/payload hash。写入必须同时通过：

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
| 确认前 | fresh readonly 可生成新 Plan；旧版失效 |
| 已确认资源动作失败 | 标记失败、停止后续动作、撤销 scope；不自动重试 |
| 每份 Create Plan | 仅调用一次 `std_project/create` |
| 创建失败的修正 | 必须新 Draft、payload hash、Plan、confirmation 和 attempt；最多 3 次，不自动重试 |
| 已出现创建对象但未回查 verified | 只允许 `readback_only`，不得再次创建 |
| 首次创建 + 对象存在 + 回查 verified | `first_std_project_create_completed`；Case 收口并撤销写范围 |

平台长数字 ID 默认按字符串存储与比较；仅官方要求 number token 的字段使用专用无损 wire 编码，禁止经 JavaScript Number 截断。

## 5. 当前 Case Gate 与工作台

`mwb.workflow_case_summary` 是唯一当前 Gate。`root_blocker_codes` 仅保留一个最高优先级 blocker；`structural_blocker_codes` 保留完整结构性取证集合。

| 优先级 | 条件 | `current_gate` | 消费端动作 |
| ---: | --- | --- | --- |
| 1 | 已创建对象但未 verified readback | `run_readback_only` | 只读回查 |
| 2 | 创建次数已达上限且仍未 verified | `manual_review_after_attempt_limit` | 人工复盘 |
| 3 | Job 等待人工修正 | `prepare_corrective_attempt` | 修正 payload 后准备新版本 |
| 4 | monitor 为 `needs_readonly` / `needs_touchpoint_readback` | `run_monitor_readonly` | 执行一次 fresh readonly reconcile；唯一 root blocker 直接取 canonical monitor blocker |
| 5 | confirmed-resource 执行停止、monitor/上下文、资源或 Plan 根阻断 | `resolve_case_blocker` | 按依赖顺序处理唯一 root blocker；仅终态 `monitor_create_busy_retry_exhausted` 可由精确只读指令回查 |
| 6 | 首次创建并已 verified | `first_std_project_create_completed` | Case 完成 |
| 7 | 最新 Plan ready | `await_job_write_authorization` | 展示绑定 Plan 的确认卡 |
| 8 | Job created/running/waiting | `run_fresh_readiness` | 执行只读就绪检查 |
| 9 | 其他终态 | `review_latest_job` | 只读检查最新 Job |

```text
工作台默认 idle
  ├─ ?case_id=：恢复该 Case 的最新 Job，可继续受 Gate 约束的工作流
  └─ ?job_id=：仅历史只读查看

用户消息 → allowlist Intent Resolver → Gate Action Policy（只读 summary）
→ 状态说明 / safe readonly / 脱敏确认卡
→ 仅 active Case 的最新 Job、唯一 `monitor_create_busy_retry_exhausted` blocker 且 `monitor_resolved=false` 时，精确“重新只读回查 monitor”可调用 Node 02 fresh readonly reconcile
→ 回查后若 Case Gate 为 `run_monitor_readonly`，普通“继续执行”只调用一次 fresh readonly reconcile；成功文案只以刷新后的 `monitor_resolved=true` 为准
→ 仅精确“确认创建”或“确认创建 monitor”且 plan_id + plan_hash 未漂移时，才进入对应既有 Plan-bound executor
```

Intent Resolver 只规范化意图和输入槽位；不计算 Gate、不选择平台动作、不扩大 Guardrail。对话、前端、API、CLI 和任务卡均不得持久化 raw transcript 或自行推导下一步。工作台只把 blocker code 映射为展示文案；Gate 与 suggested action 仍只来自 View。

## 6. 引用与边界

| 需要确认的内容 | 优先读取 |
| --- | --- |
| Node、Skill、子流程与模块归属 | `00-workflow-node-registry.mjs`、`00-contracts.mjs` |
| 资源 prepare 支持与顺序 | `04-resource-action-registry.mjs` |
| Plan/确认/执行约束 | `executionPlan.mjs`、执行 scope、当前 Task/Manifest |
| 当前 Gate、blocker、下一步 | `mwb.workflow_case_summary` |
| 数据表、View 与报表字段 | `docs/project-数据与报表契约.md`、`db/*.sql` |

项目文件与普通日志只允许保存脱敏摘要、hash、必要 ID、状态、字段路径和证据引用；禁止保存 token、secret、Cookie、auth_code、完整 URL、raw request、raw payload 或 raw response。
