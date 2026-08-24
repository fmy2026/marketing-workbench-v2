# TASK-MWBV2-STD-PROJECT-CREATE-EXECUTOR-PREFLIGHT

状态：completed

更新时间：2026-08-24 CST

## 需求来源

用户提供 `/Users/hys/Desktop/需求表述.md`。附件内容只作为需求输入；执行边界以用户本轮消息、`AGENTS.md`、`project.state.json`、v2 代码和 v2 Postgres 为准。

## 结构化理解

本任务不是执行真实创建，而是把第 6、7 节点的真实能力接入唯一 Workflow + Skill 链路，并完成无平台写入预演：

```text
frontend/API
-> src/workflows/launchWorkflow.mjs
-> src/workflows/skills/oe3
-> src/platforms/oceanengineStdProjectCreateExecutor.mjs
-> src/repositories/postgresRepository.mjs
-> marketing_workbench_v2.mwb
```

## 目标

1. 新建 task 和 context manifest。
2. 收敛 `oceanengineStdProjectCreateExecutor.mjs`，只保留动态 `prepareStdProjectCreate`、`createStdProjectForTargetOnce`、`readbackStdProjectOnce`。
3. 移除 runtime 固定旧 job 目标和 `.local/std-project-create-attempt-*.json` 依赖。
4. 新增 Postgres 单次创建幂等约束。
5. 第 6 节点接入动态 create executor；默认无写权限时返回 `blocked_before_create`。
6. 第 7 节点接入动态 readback wrapper；dry-run 为 `not_applicable`。
7. 新增受控 API：`POST /api/launch/jobs/:job_id/confirm-create`，本任务默认拒绝真实写入。
8. 做一次无写入端到端预演，验证没有 `std_project/create` 网络调用，没有真实 `platform_actions` 写入。

## 非目标

| 项 | 状态 |
| --- | --- |
| 真实 `std_project/create` | 禁止 |
| 创建重试 | 禁止 |
| token refresh | 禁止 |
| 素材、DMP、事件、品牌、头像、产品图写入 | 禁止 |
| 预算/出价修改 | 禁止 |
| 重试历史失败 job | 禁止 |
| 依赖旧项目运行逻辑 | 禁止 |

## 独立边界

| 类型 | 规则 |
| --- | --- |
| 数据库 | 只使用 `marketing_workbench_v2.mwb` |
| 前端/API | 只使用本项目 `frontend/` 与 `src/server/` |
| Workflow | 只使用 `src/workflows/` 与 `src/workflows/skills/oe3/` |
| 平台适配 | 只使用本项目 `src/platforms/` |
| 脚本 | 只使用本项目 `scripts/` |
| 旧项目 | 不 import、不 shell 调用、不作为真值 |

## 验收

| 标准 | 状态 |
| --- | --- |
| task 与 context manifest 已建立 | completed |
| executor 不再含固定旧 job runtime 目标 | completed |
| executor 不再依赖 `.local` attempt 文件 | completed |
| 新增并应用 Postgres 单次创建幂等约束 | completed：`ux_mwb_platform_actions_one_oe_std_project_create_per_job` |
| 第 6 节点默认返回 `blocked_before_create` 且不写平台 | completed |
| 第 7 节点具备真实 readback wrapper，dry-run 为 `not_applicable` | completed |
| `confirm-create` API 已存在并默认拒绝写入 | completed |
| `smoke` 与一致性验证通过 | completed |
| 无 token、完整触点 URL、raw payload、raw response 泄漏 | completed |

## 结果摘要

| 项 | 结果 |
| --- | --- |
| executor | 仅保留动态 `prepareStdProjectCreate`、`createStdProjectForTargetOnce`、`readbackStdProjectOnce` |
| 固定旧目标 | 已从 runtime executor 移除 |
| 本地 attempt 文件 | 已从 runtime executor 移除 |
| API | `POST /api/launch/jobs/:job_id/confirm-create` 已接入 |
| 无写入预演 | passed：`blocked_before_create`、`createCalled=false`、`platformActionRecorded=false` |
| 最新可确认 runtime job | `JOB-MWBV2-20260824092327-494BF1` |

## 验证

| 命令 | 结果 |
| --- | --- |
| `psql -X -d marketing_workbench_v2 -f db/013_add_std_project_create_idempotency.sql` | passed |
| `node scripts/confirm-create-preflight-smoke.mjs` | passed |
| `npm run smoke:workflow-skills` | passed |
| `npm run smoke:api` | passed |
| `npm run smoke:readonly` | passed |
| `npm run test:payload-contract` | passed |
| `npm run check:runtime-consistency` | passed |
| static scan | passed，executor/Skill/API 无固定旧 job runtime 目标、无 `.local` attempt 依赖、无旧项目运行依赖 |

## 下一步 gate

完成后下一步仍是“新建 fresh runtime job 的单次真实创建确认任务”；必须由用户另行明确授权并带确认变量。
