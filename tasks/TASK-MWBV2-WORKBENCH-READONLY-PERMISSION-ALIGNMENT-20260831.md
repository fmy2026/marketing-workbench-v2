# TASK-MWBV2-WORKBENCH-READONLY-PERMISSION-ALIGNMENT-20260831

状态：completed

## 目标

修复工作台 `dry_run` 未继承项目全局真实平台只读许可而产生伪 `readonly_permission_required` 的问题。

```text
project.state.json.guardrails.real_platform_dependency_allowed
→ runJob 的有效只读许可
→ Node 01–05 readonly Skills
→ workflow_case_summary 的真实 Gate
```

## 范围

- 在工作流入口实现“未传继承全局 Guardrail，显式 true/false 保持覆盖”的只读权限解析。
- 让所有通过该入口运行的只读 Skill 尊重显式拒绝，不发起平台请求。
- 新增无网络回归覆盖，保持测试运行不依赖真实平台。
- 对指定账户的三个较早重复 Case 做零动作审计后标记 `cancelled`；复用最新 Case 创建一个 fresh readonly Job。

## 禁止范围

- 所有平台写入、资源准备执行、`std_project/create`、预算或出价变更。
- 数据库 Schema、View、Node/Skill 状态语义、公开 API 形态变更。
- 删除现有 Case、Job、Plan、证据或记录敏感值。

## Solution Link

- source：用户确认的“工作台只读权限 Gate 最小修正”方案；`docs/Solution Design.md`；`docs/project-现在的逻辑图.md`。
- objective：只消除由权限传递断裂造成的伪 blocker，使 Case Gate 恢复为真实只读结果。
- current truth：Postgres `mwb.workflow_case_summary`、`workflow_cases`、`launch_jobs`、`launch_skill_runs`，及当前代码。
- stop condition：需要任何平台写入、创建确认、Schema/View 修改，或 fresh readonly 出现非权限的真实 blocker。

## 验收

- 全局 Guardrail 允许且 API 未传参数时，入口向 runner 传递允许的只读依赖。
- 显式 `false` 时，所有依赖 `readonlyPermissionState` 的 Skill 均拒绝调用。
- `dry_run` 仍不能创建平台 action、对象或调用 Node 06。
- 最新 Case 的 fresh Job 不再以 `readonly_permission_required` 作为 root blocker；若出现其他 blocker，停止在只读阶段。
- 三个较早重复 Case 仅在各自 `platform_actions=0` 后标记 `cancelled`；最新 Case 保持 `active`。

## 完成结果

- 工作流入口在未显式传入只读许可时继承全局 Guardrail；显式拒绝不会再回退为全局允许。
- 工作台 fresh readonly 通过 Node 01–04，Case 不再投影 `readonly_permission_required`；已停在等待写入确认 Gate。
- 三个零动作重复 Case 已取消，历史记录保留；未发生平台写入、创建或重试。
- 回归与静态检查通过；项目控制面已恢复为空闲状态。
