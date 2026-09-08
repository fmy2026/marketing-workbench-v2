# AGENTS

| 元信息 | 值 |
| --- | --- |
| 文档状态 | 当前有效；项目启动协议 |
| 最后更新时间 | 2026-09-08 CST |
| 重新校验条件 | 启动顺序、真值来源、文档职责、运行主链、权限边界或任务闭环变化时 |

定位：Codex 和协作者每次任务必须遵守的启动、真值、权限与闭环协议。本文不承担工作台说明、流程状态机、数据字典或变更记录；动态业务事实只看 Postgres。

每条长期规则只设一个权威位置，其他文档只引用。功能细节变化不默认更新本文；只有上述启动协议边界变化时才同步修改。

## 启动

1. 读取 `AGENTS.md`。
2. 读取 `project.state.json`。
3. 有 `active_task` 时，严格按其 `read_order` 读取 Task、Context Manifest 和指定真值。
4. 没有 `active_task` 时，只报告项目生命周期；需要业务下一步时查询 `mwb.workflow_case_summary`。

`docs/.开发方案/`、`.archive/` 与 `scripts/archive/` 只供历史参考或可恢复隔离，不得作为启动必读、任务依据、运行真值或 runtime 依赖；`scripts/archive/` 还禁止 package 入口和直接执行。

## 按需读取

| 场景 | 权威位置 |
| --- | --- |
| 方案方法、重要调整与人工决策 | `docs/Solution Design.md` |
| 当前流程、Node、Gate、Plan 与工作台机制 | `docs/project-现在的逻辑图.md` |
| 数据表、View、持久化与报表边界 | `docs/project-数据与报表契约.md` |
| 已验证且可复用的经验 | `docs/project-lessons.md` |
| 部署、网络、启动、凭据录入与运维 | `deploy/README.md` |
| 当前任务的范围、允许写入、验证与停止条件 | active Task / Context Manifest |

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

Markdown 只保存规则、方案、任务合同和经验；不保存动态账户、Case、Job、Plan、Node、Skill、资源或平台动作状态。发生冲突时，按对应真值链提出最小修正。

## 最小运行约束

- 3 阶段 7 Node 的唯一来源是 `src/workflows/skills/oe3/00-workflow-node-registry.mjs`。
- `mwb.workflow_case_summary` 是当前 Gate、唯一 root blocker 和下一步的只读投影；消费端不得复制、写回或自行计算。
- Intent Resolver 只理解意图和输入槽位；不得计算 Gate、选择平台动作、扩大权限或持久化 raw transcript。
- 工作台/API → 通用 Plan-bound executor 是唯一正式业务写入链；CLI 只允许 dry-run、readback、状态和明确标注的安全诊断，不得成为旁路写入入口。
- `package.json` 只保留长期公开入口；一次性、历史 Task/账户绑定或已被主链替代的脚本移入 `scripts/archive/` 并登记 `manifest.json`。live `src/`、`scripts/` 与 package 均禁止 import 或调用 archive。

## 权限与安全

- `project.state.json.guardrails` 只提供全局边界。真实平台写入还必须精确匹配当前 Job、冻结 Plan、confirmation、action grant 与调用上限，并且只能由 active Task scope 或已启用的工作台 runtime policy 之一授权。
- 工作台用户只能读取、启动、运行和确认本人账户；管理员可以管理用户和读取授权报表，但不得代操作他人账户。
- 只有 `prepare_supported=true` 的资源可生成 `ensure_resource:*`；其他缺失资源只形成 blocker。
- 每份确认 Plan 只能按冻结动作消费一次；失败或修正必须使用新 Plan、hash、confirmation 和 attempt，禁止自动重试。
- 创建或写入响应不等于 READY；只有权威只读回查通过才能写入 verified。
- 动态运行授权只写 Postgres confirmation/action/readback；开发、迁移和专项人工写入必须使用 Task/Manifest 与相应 Guardrail scope。
- 平台长数字 ID 默认按字符串保存和比较。
- 禁止在项目文件、普通日志、API 或前端保存 token、secret、Cookie、auth_code、密码、完整触点 URL、raw request、raw payload 或 raw response。

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

重要方案批准后才能创建 Task；执行只推进当前 Task。任务关闭后，业务下一步始终重新读取 `mwb.workflow_case_summary`。只有形成真实、已验证且跨任务可复用的结论时，才更新 `docs/project-lessons.md`。
