# TASK-MWBV2-WORKFLOW-CASE-CONTROL-PLANE-REFACTOR

状态：completed

更新时间：2026-08-28 CST

## Brief

把项目协调控制面与账户投放闭环运行面拆分。新增 `workflow_case` 管理一个账户在路线、游戏和业务目标下的长期闭环；已有 job、Node、Skill、资源、平台 action 与 evidence 继续作为 case 下的运行记录。项目状态文件只保留项目级协调和全局默认权限。

## Scope

允许：本地 migration、Postgres 数据回填、workflow/API/CLI/UI 代码、smoke、`AGENTS.md` 与项目状态文件的结构收敛。

禁止：任何 OceanEngine 或乾坤调用、平台写入、token refresh、删除 runtime truth、保存敏感值或完整 URL。

## Acceptance

- [x] 同一账户可拥有多个隔离 case；新 runtime job 显式归属 case。
- [x] case summary 从既有运行事实投影当前 Gate、blocker、建议动作，不复制运行状态。
- [x] 项目状态不含账户、job、资源、接口或单次授权细节。
- [x] 历史 job 完整回填为 legacy case，无 evidence 丢失。
- [x] API、CLI、smoke 和项目协议均使用新的真值边界。

## Completion

- 已应用 `db/035_add_workflow_cases.sql`：历史 job 的 `case_id` 缺失数为 0；历史 runtime case 保持 active，只有显式选择该 case 才能新建 fresh job。
- 已验证同一账户的两个 case 不共享 job 或 Gate；`test:workflow-case`、只读 readiness、execution plan、execution grant 与资源执行器 smoke 通过。
- 本任务未调用任何外部平台接口、未刷新 token、未产生平台写入；`project.state.json.guardrails.platform_write_allowed=false` 保持不变。
