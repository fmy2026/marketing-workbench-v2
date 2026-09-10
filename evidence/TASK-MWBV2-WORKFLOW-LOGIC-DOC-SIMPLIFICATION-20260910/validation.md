# TASK-MWBV2-WORKFLOW-LOGIC-DOC-SIMPLIFICATION-20260910 验证证据

验证时间：2026-09-10T02:20:35Z
基线：`94e22eea0a908bb6782746092c9b9628115c365d`

本任务只修改静态文档与任务协调文件；未连接业务数据库，未执行真实平台写入、OAuth 刷新或外部资产操作。

## AC-01

- 人工核对 `docs/project-现在的逻辑图.md`：总计 132 行，主阅读路径依次为唯一闭环与真值分工、Workflow Skill、资源四态、Plan 安全不变量、Case Gate 矩阵和权威来源索引。
- 唯一正式写入链只解释一次：工作台/API 经通用 Plan-bound executor 进入平台与 repository；工作台只消费 `mwb.workflow_case_summary`，不自行计算 Gate。
- 文档未保存当前账户、Case、Job、Plan、资源、确认或平台动作状态，也未复制 SQL Gate 优先级或接口参数。

结果：通过。

## AC-02

执行：

```text
npm run smoke:workflow-skills
npm run test:resource-action-registry
npm run test:execution-plan
```

- `smoke:workflow-skills`：通过；注册表为 7 Node，六种 schedule mode 全部合法，八类 required resource 与 Node 04 子资源一致，未发生真实平台写入或 token 刷新。
- `test:resource-action-registry`：通过；八类 capability 中五类可受控准备，`micro_app_instance` 的被动等待态和不支持自动准备的阻断语义通过。
- `test:execution-plan`：通过；Plan hash 稳定、确认后不可变、精确 scope 通过、越界 action 阻断。
- 静态核对文档完整出现 7 Node、六种 mode、八类资源、`READY / WAITING / PLANNED / BLOCKED` 四态、三类可确认 Plan 与不可执行的 `readiness_blocked`；Skill 按核心场景分组，不逐项复制 45 个定义。

结果：通过。

## AC-03

人工对照 `mwb.workflow_case_summary` 数据合同、`src/workflows/gateActionPolicy.mjs` 与文档矩阵：

- 矩阵覆盖 `create_fresh_job`、`run_monitor_readonly`、`run_fresh_readiness`、`await_job_write_authorization`、`resolve_case_blocker`、`run_readback_only`、`prepare_corrective_attempt`、`manual_review_after_attempt_limit`、`first_std_project_create_completed`、`review_latest_job`。
- 矩阵只写消费者允许行为；正文明确精确 Gate 优先级唯一属于 SQL View。
- monitor 的只读、Plan、确认执行、回查及停止/阻断分支均归入专链，不伪装成通用 runner 自动写入。

结果：通过。

## AC-04

执行：

```text
npm run test:workflow-case
npm run test:workbench-conversation
git diff --check
```

- `test:workflow-case`：通过；Case 隔离、单一当前 Gate、资源/Node 05 blocker、创建完成 Gate、三次 Attempt 上限及历史 Job 隔离均通过，平台写入为 0。
- `test:workbench-conversation`：通过；精确确认、资源确认、只读恢复、创建后 readback、修正 Attempt 与替代 Case 行为通过，替代路径平台创建调用为 0。
- `git diff --check`：通过。
- `docs/Solution Design.md` 仅收紧既有“当前逻辑图分层”决策行，没有新增重复决策。

结果：通过。

## 文档路由结论

- 已更新 `docs/project-现在的逻辑图.md` 与 `docs/Solution Design.md`。
- 数据结构、View、接口和部署行为均未变化，因此 `docs/project-数据与报表契约.md`、`docs/qiankun-api-docs-20260827.md` 与 `deploy/README.md` 无需回写。
