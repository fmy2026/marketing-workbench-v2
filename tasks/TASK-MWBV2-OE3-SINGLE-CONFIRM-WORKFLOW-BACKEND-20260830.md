# TASK-MWBV2-OE3-SINGLE-CONFIRM-WORKFLOW-BACKEND-20260830

状态：closed_validated_no_platform_write

更新时间：2026-08-30 CST

## 目标

在不修改前端、不复制现有资源 executor 的前提下，将 OE3 正式 Node 1–7 收敛为一个后端 Execution Plan 和一次人工确认：Node 4 只读盘点与计划，Node 5 执行已确认资源动作并生成最终 Draft，Node 6 只执行一次 `std_project/create`，Node 7 只读回查。

## 目标账户证据范围

- 广告主：`1871922434025472`
- 路线：`oceanengine_3_byte_mini_game`
- 游戏：`JSZC`
- 复用 Case：`CASE-MWBV2-3CDAF4E9202381253E`
- 当前 blocked Job 只作为证据，不复用其 Draft/Plan：`JOB-MWBV2-20260830083744-4F7FC2`

## 实施范围

1. 统一 Node 4 资源状态为 `READY / PLANNED / BLOCKED`，只输出一个根 blocker。
2. 复用现有资源 action registry 和头像、DMP、视频、产品图 executor。
3. 一份 Execution Plan 同时包含资源动作与最终 create；一条 plan-bound Confirmation 授权全部计划动作。
4. Node 5 增加一个编排 Skill，只负责调用已有 executor、写后回查、重新加载 bundle，再运行既有 payload/contract/preflight。
5. Node 6 验证最终 Draft 由已确认 Plan 确定性派生，且 create 最多一次。
6. 仅做现有 Plan/Confirmation/Action 持久化所需的最小兼容；不新增业务表。

## 允许范围

- 修改 workflow、Skill、executor scope、repository、CLI 和 smoke。
- 新增唯一数据库迁移以兼容 plan-bound pre-draft Confirmation。
- 使用 fake transport、test_run 和只读数据库检查验证。
- 更新本 Task、Manifest 和 `project.state.json`。

## 禁止范围

- 不调用任何真实平台写接口。
- 不刷新 token，不创建 Promotion，不调用 `std_project/create`。
- 不修改前端页面、API 展示或交互。
- 不新增第二套 Node、payload builder 或资源 executor。
- 不创建 one-off 创建脚本。
- 不开发事件创建、小游戏绑定或备用页自动分享能力。
- 不执行脚本目录重构或历史归档。

## 验收

- 有 BLOCKED 资源时：零 Confirmation、零 platform action。
- fake transport 下：一份 Plan、一条 Confirmation 可授权多个资源 action 与一次 create。
- Plan 外动作、重复动作、调用超限、资源失败和最终 Draft 派生漂移均阻断。
- Node 6 仍只负责一次 create；Node 7 行为不扩展。
- 现有头像、DMP、视频、产品图和 payload/create smoke 回归通过。

## 实施结果

- Node 4 统一输出 `READY / PLANNED / BLOCKED`，并按资源顺序只投影一个最前置根 blocker；存在 `BLOCKED` 时不会生成可确认的 create 动作。
- 一份 Plan 可同时包含头像、DMP、视频、产品图和 `std_project_create`；各动作带独立调用上限，Plan 总体固定 `retry_allowed=false`。
- 新增公共 `validatePlannedActionGrant`，统一校验 Job、广告主、Plan ID/hash、共享 Confirmation、计划动作、调用上限和重试策略；四个资源 scope 继续保留自己的官方字段合同。
- Node 5 新增 `confirmed-resource-orchestrator`，只按固定顺序调度现有 executor。每个高层动作先在现有 `platform_actions` 中原子 claim；失败即停止，Node 6 create 不会调用。
- Confirmation 可在最终 Draft 前绑定 Plan；最终 Draft 记录 `derived_from_plan_id/hash` 和派生 hash。项目名、预算、CPA 或 ROI 漂移会在 Node 5/6 阻断。
- Node 6 继续沿用一次 create 的原子 claim；Plan-bound 模式复用原 Confirmation，不覆盖或重写确认记录。Node 7 行为未扩展。
- 已应用 `db/055_plan_bound_confirmation.sql`，仅将 `launch_confirmations.draft_id` 改为可空；未新增表。
- 未修改前端，未新增资源 executor、事件/小游戏/备用页写能力，也未创建 one-off 创建脚本。

## 验证结果

- `npm run test:single-confirmation-orchestrator`：通过；验证 4 READY + 4 PLANNED 三态、5 动作单 Plan、共享 Confirmation、计划外动作阻断、重复资源消费阻断、失败立即停止以及最终 Draft 派生漂移阻断。
- `npm run test:execution-plan`：通过；Plan hash 稳定、动作 scope 和既有单变量实验绑定未回归。
- `npm run test:execution-grant`：通过；14 个 fake transport 分支覆盖单次 create、并发 claim、40000 回查、传输异常、失败不重试和验证系列锁定。
- `npm run smoke:workflow-skills`、`npm run test:payload-contract`、`npm run validate:schemas`、`npm run test:node4-resource-prep-contracts`、`npm run test:std-project-create-wire-body`：通过。
- 头像、DMP、视频、产品图现有 executor smoke：全部通过。
- `git diff --check`：通过。
- 目标账户 `1871922434025472` 验收后仍为 Confirmation `0`、platform action `0`、created object `0`；本 Task 未触发真实平台写入。

## 后续 Gate

当前账户的旧 Job 仅保留证据，不复用 Draft/Plan。小游戏实例/事件/PAY 与 7 日 ROI 链、备用页目标账户可见性仍属于外部 `BLOCKED`；外部状态完成后，创建 fresh Job 运行 Node 1–4，只有新 Plan 无 `BLOCKED` 时才申请唯一一次确认。

## Solution Link

- source：`docs/project-最合理的逻辑图.md` 与用户批准的后端单确认最小改造方案。
- objective：用现有模块实现最小、无重复的单确认 Node 1–7 后端链路。
- current truth：Postgres `marketing_workbench_v2.mwb`、当前代码、当前 Task/Manifest。
- stop condition：任何真实平台写入、未经计划的动作、外部资源仍 BLOCKED 或需要扩展未验证 executor 时立即停止。
