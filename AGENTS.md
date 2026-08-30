# AGENTS

定位：Codex 和协作者的项目启动协议。这里只保留每次任务必须遵守的规则；动态业务事实只看 Postgres。

## 启动

1. 读取 `AGENTS.md`。
2. 读取 `project.state.json`。
3. 有 `active_task` 时，按其 `read_order` 读取 Task 和 Context Manifest。
4. 没有 `active_task` 时，只报告项目生命周期；需要业务下一步时查询 `mwb.workflow_case_summary`。

`docs/.开发方案/` 与 `.archive/` 只供历史参考；不得作为启动必读、任务依据、运行真值或 runtime 依赖。

涉及方案判断、OE3 接口、平台读写、资源准备、授权、回查、数据库或报表变更时，按需读取 `docs/Solution Design.md`；再由当前 manifest 指定精确代码、数据库和参考资料。

## 工作台

```text
启动：npm run dev
地址：http://127.0.0.1:3000/
API：http://127.0.0.1:3000/api/
默认：idle；不自动加载最后一次 job。
```

历史 Job 只能显式 `?job_id=` 只读查看。

## 真值

```text
项目协调与全局权限：
project.state.json → active task / manifest → 代码与 schema

业务运行事实：
Postgres marketing_workbench_v2.mwb
→ active task / manifest
→ 代码与 schema
→ 已验证官方资料

Markdown：
只保存规则、方案、任务合同和经验；
不保存动态账户、Case、Job、Node、Skill 或平台动作状态。
```

冲突时按对应真值链路提出最小修正。

涉及项目流程、数据报表时，按需读取：

```text
docs/project-现在的逻辑图.md
docs/project-数据与报表契约.md
```

可复用、已验证的经验只记录在 `docs/project-lessons.md`；它辅助诊断，不替代 Postgres、当前代码或任务合同。

## 运行机制

```text
frontend / API
→ launchWorkflow
→ workflow-node-registry
→ runner
→ Node 01-07 Skills
→ platforms / repositories
→ Postgres
→ mwb.workflow_case_summary
→ UI / API / CLI / 任务卡
```

- 3 阶段 7 节点的唯一来源：`src/workflows/skills/oe3/00-workflow-node-registry.mjs`；禁止第二份节点定义。
- 新 Skill 先在 `00-contracts.mjs` 声明 `nodeKey`，再由注册表校验。
- `00-` 负责跨节点编排、公共合同、CLI 和 smoke；`01-07-` 负责对应节点。
- `package.json` 是长期命令入口；一次性脚本完成后移入 `.archive/` 并移除入口。
- `workflow_cases` 是业务闭环总控；新 runtime Job 必须显式带 `case_id`。
- `mwb.workflow_case_summary` 是当前 Gate、blocker、next_action 的唯一只读投影；UI、CLI 和任务卡不得手写或复制 `next_gate`。

## 权限与安全

- Node 结果写 `launch_node_runs`；Skill 结果写 `launch_skill_runs`；运行记录仅保存脱敏摘要、hash、状态、必要 ID 与证据引用。
- `project.state.json.guardrails` 只提供全局权限；真实写入还必须满足当前 Job 的 execution plan、confirmation 与 platform action 授权。
- 仅 `prepare_supported=true` 的资源可生成 `ensure_resource:*`；其余未就绪资源只写 blocker，不自动补写。
- `runtime_truth` 是真实用户轮次；`test_run` 必须由 smoke/CLI 清理；`seed_source` 仅作初始化。
- 禁止把 token、secret、auth_code、Cookie、完整 URL、raw payload 或 raw response 写入项目文件、普通日志、API 或前端。
- 平台长数字 ID 默认按字符串处理。

## 闭环

```text
卡点 / 需求
→ Solution Design
→ 人工确认关键选择
→ Task + Context Manifest
→ 执行 / 验证
→ Postgres 运行事实
→ 任务关闭 / project.state.json / project-lessons
```

重要方案批准后才能创建 Task；执行只推进当前 Task。关闭后更新 Task、Manifest 与 `project.state.json`，业务下一步始终读取 `workflow_case_summary`。
