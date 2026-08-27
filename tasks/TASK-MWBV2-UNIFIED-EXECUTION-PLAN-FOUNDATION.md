# TASK-MWBV2-UNIFIED-EXECUTION-PLAN-FOUNDATION

状态：completed

更新时间：2026-08-27 CST

## 目标

为“新账户一次确认、自动完成准备与创建”的目标态建立统一执行计划基础：Postgres 计划表、计划编译 service、repository 读写、mock 验证与任务状态记录。

本任务只完成执行计划、后端合同和测试验证；不执行任何真实 monitor 创建、资源准备或 OceanEngine 创建。

## 需求来源与边界

需求来源：`/Users/hys/Desktop/需求表述.md` 中的“第一个任务”。

参考目标态文档（已归档）：`.archive/工作台逻辑底层/20260827-plan-工作流7节点-数据真值说明.md`。

文档是需求输入，不是平台写入授权。本任务不放宽 `project.state.json.guardrails`，不执行真实平台写入，不刷新 token，不保存 raw request/response 或完整 URL。

## 合理性评估

需求合理，可以推进。

依据：

- 当前 3 阶段 7 节点与 `00-07` 文件归属已收口，具备将“准备动作”和“创建动作”统一编译为计划的前置结构。
- 现有 `launch_confirmations`、`platform_actions`、`monitor_provision_runs`、`monitor_provision_attempts` 已有审计基础，本任务适合做最小关联字段，不新建第二套授权机制。
- 先做 plan/mock，不执行真实动作，可以降低 monitor retry 和 std_project/create 的风险。

## 范围

- 新增 migration：`mwb.launch_execution_plans`。
- 最小扩展现有授权/动作/monitor/skill run 表字段，使记录可关联 `plan_id`、`idempotency_key`、`module_ref` 等定位信息。
- 新增或扩展唯一 execution-plan service，编译脱敏 `planned_actions` 和稳定 `plan_hash`。
- 新增 repository 读写方法和最小 mock 验证脚本。
- 更新 task、manifest、`project.state.json`。

## 非目标

- 不执行真实 monitor 创建或重试。
- 不执行真实资源上传、推送、DMP、事件创建。
- 不执行真实 `std_project/create`。
- 不修改预算、出价、物料内容。
- 不重写 Node 2-4 业务实现。
- 不修改工作台界面布局。

## 当前进展

- 已读取 `AGENTS.md`、`project.state.json`、`/Users/hys/Desktop/需求表述.md` 和目标态 MD。
- 已确认需求合理，无需额外提问。
- 已创建本任务卡与 context manifest。
- 已新增 `mwb.launch_execution_plans` 迁移，并将 plan 关联补入 confirmations、platform actions、monitor provision 审计表和 Skill run 定位字段。
- 已新增 execution plan compiler，输出脱敏 `planned_actions`、稳定 `plan_hash` 和 plan action scope 校验。
- 已补齐 repository 读写接口、单次 create executor 的可选 `plan_id/idempotency_key` 关联，以及 `test:execution-plan` smoke。
- 已更新 `schemas/postgres-minimal-truth.md` 的长期结构说明。

## 关键文件

| 文件 | 说明 |
| --- | --- |
| `db/027_add_launch_execution_plans.sql` | 新增统一执行计划表、plan 关联字段、platform action 幂等键和 Skill 定位字段 |
| `src/workflows/executionPlan.mjs` | 统一执行计划编译、稳定 hash、plan action scope 校验 |
| `src/repositories/postgresRepository.mjs` | execution plan 读写、bundle 读取、plan-aware confirmation/action 写入 |
| `src/workflows/executeConfirmedLaunch.mjs` | guardrail 可选校验 `target_plan_id`、`target_plan_hash`、`allowed_plan_actions` |
| `src/platforms/oceanengineStdProjectCreateExecutor.mjs` | 单次真实 create 审计可携带 plan 关联与幂等键 |
| `scripts/00-execution-plan-smoke.mjs` | mock/test_run execution plan smoke |
| `package.json` | 新增 `npm run test:execution-plan` |

## 验收标准

- migration 可重复执行，现有真实记录不丢失。
- `launch_execution_plans` 能为一个新 job 生成稳定 plan。
- “已有 monitor”与“缺 monitor”两种 mock 场景分别生成正确计划。
- 缺 monitor 时计划包含 `ensure_monitor`，但没有平台写入。
- 同一 job 相同输入重复编译时 `plan_hash` 稳定。
- 计划外动作无法进入 grant scope。
- 每个 Skill 运行可通过 `job_id -> skill_key -> module_ref` 定位源码。
- API、日志、数据库摘要和测试输出均不含 token、Cookie、完整 URL、raw payload、raw response。
- 保持验证通过：

```bash
npm run smoke:workflow-skills
npm run smoke:api
npm run check:runtime-consistency
npm run test:payload-contract
git diff --check
```

## 验证结果

| 命令 | 结果 |
| --- | --- |
| `node --check src/workflows/executionPlan.mjs scripts/00-execution-plan-smoke.mjs src/repositories/postgresRepository.mjs src/workflows/skills/oe3/00-contracts.mjs src/workflows/executeConfirmedLaunch.mjs src/platforms/oceanengineStdProjectCreateExecutor.mjs` | passed |
| `psql -X -d marketing_workbench_v2 -v ON_ERROR_STOP=1 -f db/027_add_launch_execution_plans.sql` | passed，重复执行 passed |
| `npm run test:execution-plan` | passed |
| `npm run smoke:workflow-skills` | passed |
| `npm run smoke:api` | passed |
| `npm run check:runtime-consistency` | passed |
| `npm run test:payload-contract` | passed |
| `npm run test:execution-grant` | passed |
| `git diff --check` | passed |

DB 清理核对：`mwb.launch_execution_plans` 中 `source_usage='test_run'` 记录数为 0。

敏感值核对：未发现实际 token、Cookie、完整触点 URL、raw payload 或 raw response；扫描只命中 `00-contracts.mjs` 的敏感检测正则。

## 关闭结论

第一个任务已完成。当前只完成计划基础和 mock 验证，未执行真实 monitor 创建、资源准备、std_project/create 或 token refresh。下一 gate 建议把 Node 2-4 的真实准备动作按 plan action 接入主 Workflow，但仍需逐类单次授权。
