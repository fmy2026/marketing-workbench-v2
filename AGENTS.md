# AGENTS

| 元信息 | 值 |
| --- | --- |
| 文档状态 | 当前有效；项目启动协议 |
| 最后更新时间 | 2026-09-01 12:10 CST |
| 校验基线 | Git 当前 HEAD + `TASK-MWBV2-SCRIPT-ENTRYPOINT-ISOLATION-20260901`；`project.state.json.schema_version=2026-08-28.project-control-plane-v2` |
| 重新校验条件 | 项目控制面、运行主链、权限 Gate、Case/Job 入口或真值来源变化时 |

定位：Codex 和协作者每次任务必须遵守的启动、真值、权限与闭环规则。动态业务事实只看 Postgres。

## 启动

1. 读取 `AGENTS.md`。
2. 读取 `project.state.json`。
3. 有 `active_task` 时，严格按其 `read_order` 读取 Task、Context Manifest 和指定真值。
4. 没有 `active_task` 时，只报告项目生命周期；需要业务下一步时查询 `mwb.workflow_case_summary`。

`docs/.开发方案/`、`.archive/` 与 `scripts/archive/` 只供历史参考或可恢复隔离，不得作为启动必读、任务依据、运行真值或 runtime 依赖；`scripts/archive/` 还禁止 package 入口和直接执行。

以下情况按需读取：

| 场景 | 文档 |
| --- | --- |
| 方案、接口、平台读写、资源、授权、回查、数据库或报表调整 | `docs/Solution Design.md` |
| 项目流程、Node、Plan、Gate、工作台机制 | `docs/project-现在的逻辑图.md` |
| 数据表、View、报表与读写边界 | `docs/project-数据与报表契约.md` |
| 已验证且可复用的经验 | `docs/project-lessons.md` |

## 工作台

```text
工作台唯一入口：http://127.0.0.1:3000/；根页选择活动 Case，`?case_id=` 恢复最新进度，`?job_id=` 只读历史。
```

```text
用户消息
→ allowlist Intent Resolver
→ Gate Action Policy（只读 workflow_case_summary）
→ 状态说明 / safe readonly / Plan 确认卡
→ 既有 Plan-bound executor
```

Intent Resolver 只理解意图和输入槽位；不得计算 Gate、选择平台动作、扩大权限或持久化 raw transcript。

ready 的普通 `resource_prepare` Plan 使用精确短语“确认准备资源”进入既有 confirmed-resource orchestrator；全部动作和权威回查通过后，在同一 Case 创建 fresh runtime Job。下一份确认 Plan 只能包含一次 `std_project_create`。

## 真值

```text
项目协调与全局权限：
project.state.json
→ active Task / Context Manifest
→ 当前代码与 Schema

业务运行事实：
Postgres marketing_workbench_v2.mwb
→ 当前 Task / Context Manifest
→ 当前代码与 Schema
→ 已验证官方资料

当前业务下一步：
mwb.workflow_case_summary
→ current_gate
→ root_blocker_codes（零或一个）
→ suggested_next_action
```

Markdown 只保存规则、方案、任务合同和经验；不保存动态账户、Case、Job、Plan、Node、Skill、资源或平台动作状态。

发生冲突时，按对应真值链提出最小修正。

## 运行机制

```text
frontend / API
→ launchWorkflow
→ workflow-node-registry
→ runner
→ Node 01–07 Skills
→ platforms / repositories
→ Postgres
→ mwb.workflow_case_summary
→ UI / API / CLI / 任务卡 / 工作台对话
```

- 3 阶段 7 Node 的唯一来源是 `src/workflows/skills/oe3/00-workflow-node-registry.mjs`。
- Node 02 monitor 的唯一公开入口是 `src/workflows/skills/oe3/02-monitor/index.mjs`；CLI 只允许状态、readonly reconcile 和配置只读同步。monitor 写入必须消费 `monitor_bootstrap` Plan，不能由 CLI 或环境变量直接授权。
- 对 `monitor_create_busy_retry_exhausted` 的终态 Case，工作台只接受精确“重新只读回查 monitor”触发一次 fresh readonly reconcile；该动作不改变 Gate 真值，也不授权创建或重试。回查后进入 `run_monitor_readonly` 时，“继续执行”仍只能执行 fresh readonly reconcile；只有 canonical `monitor_ready=true` 才能离开 monitor Gate，历史 Node 02 blocker 不得覆盖 READY 结果。
- 新 Skill 必须先在 `00-contracts.mjs` 声明 `nodeKey`，再由注册表校验。
- `00-` 负责跨节点编排、公共合同、CLI 和 smoke；`01-07-` 负责对应 Node。
- 工作台/API → 通用 Plan-bound executor 是唯一正式业务写入链。保留 CLI 仅限 dry-run、readback、状态或明确标注的安全诊断，不得成为旁路写入入口。
- `package.json` 只保留长期公开入口；一次性、历史 Task/账户绑定或已被主链替代的脚本移入 `scripts/archive/`，登记 `manifest.json` 并删除 package 入口。live `src/`、`scripts/` 与 package 均禁止 import/调用 archive。
- `workflow_cases` 是业务闭环总控；新 `runtime_truth` Job 必须显式带 `case_id`。
- `workflow_case_summary` 是当前 Gate、唯一 root blocker 和下一步的只读投影；消费端不得复制或自行计算。

## 权限与安全

- Node 结果写 `launch_node_runs`；Skill 结果写 `launch_skill_runs`。
- `project.state.json.guardrails` 只提供全局边界；真实写入还必须匹配当前 Job、Execution Plan、confirmation、action grant 和调用上限。
- 只有 `prepare_supported=true` 的资源可生成 `ensure_resource:*`；其他缺失资源只形成 blocker。
- 每份确认 Plan 只能按冻结动作执行一次；修正必须使用新 Plan、hash、confirmation 和 attempt，禁止自动重试。
- 创建响应不等于 READY；只有权威只读回查通过才能写入 verified。
- `runtime_truth` 是真实用户轮次；`test_run` 必须由 smoke/CLI 清理；`seed_source` 仅用于初始化。
- 平台长数字 ID 默认按字符串保存和比较。
- 禁止在项目文件、普通日志、API 或前端保存 token、secret、Cookie、auth_code、完整触点 URL、raw request、raw payload 或 raw response。

## 任务闭环

```text
卡点 / 需求
→ Solution Design
→ 人工确认关键选择
→ Task + Context Manifest
→ 执行 / 验证
→ Postgres 运行事实
→ 关闭 Task / Manifest
→ project.state.json.active_task=null
→ 必要时写入 project-lessons
```

重要方案批准后才能创建 Task；执行只推进当前 Task。任务关闭后，业务下一步始终重新读取 `workflow_case_summary`。
