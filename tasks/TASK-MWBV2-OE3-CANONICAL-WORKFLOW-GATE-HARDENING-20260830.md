# TASK-MWBV2-OE3-CANONICAL-WORKFLOW-GATE-HARDENING-20260830

状态：closed_validated_no_platform_write

更新时间：2026-08-30 CST

## 目标

在零真实平台写入前提下，加固唯一 OE3 Node 1–7 后端流程：Node 4 只生成可执行的单一 Plan 或单一根阻断；Node 5 在同一 Confirmation 下执行既有资源动作并生成最终 Draft；Node 6/7 保持一次创建与三次回查边界。

## 目标账户证据范围

- 广告主：`1871922434025472`
- 路线：`oceanengine_3_byte_mini_game`
- 游戏：`JSZC`
- Case：`CASE-MWBV2-3CDAF4E9202381253E`
- 旧 Job 只作投影与回归证据：`JOB-MWBV2-20260830083744-4F7FC2`

## 实施范围

1. Plan 只允许包含正式 executor registry 可消费的动作；缺少 monitor 时改为明确 `BLOCKED`，不生成无法由 Node 5 消费的 `ensure_monitor`。
2. 将 `confirmed-resource-orchestrator` 放入正式 Node 5 调度顺序，删除 runner 循环外的隐藏调用。
3. Confirmation 生成后冻结 Plan；任何重新编译、覆盖或 hash/业务意图漂移都阻断。
4. runtime truth 只接受 plan-bound Confirmation；旧单动作 scope 仅保留给隔离测试。
5. 新增唯一 Case Gate 投影迁移：当前根 blocker 只能为零条或一条，完整结构错误保留在 forensic 列。
6. 将正式新账户认证 Task/Manifest 修正为一份 Plan、一次 Confirmation；统一黄金字段账本为 82 条。

## 允许范围

- 修改 workflow、Skill、repository、execution-plan、Case summary view、CLI 合同和 smoke。
- 新增 `db/056_workflow_case_single_gate_projection.sql`。
- 使用 fake transport、`test_run` 和目标账户只读查询验证。
- 更新 Task、Manifest、project state 和已验证经验中的静态合同数字。

## 禁止范围

- 任何真实 OceanEngine/乾坤写入、`std_project/create`、Promotion 或 token refresh。
- 前端页面、API 展示或交互调整。
- 新增事件、小游戏绑定、备用页分享 executor。
- one-off 创建脚本、第二套 Node/runner/payload builder。
- 修改旧 Job、旧 Draft、旧 Plan 或资源状态来伪造通过。

## 验收

- Node 4 的 Plan 动作集合全部可由正式 Node 5 orchestrator 消费。
- `ensure_monitor` 不再成为无法执行的 READY Plan 动作。
- 一条 plan-bound Confirmation 后 Plan 不可变。
- 当前认证 Case 投影只显示一个最前置资源根 blocker，Node 5 派生错误仍可在 `structural_blocker_codes` 取证。
- fake transport 证明一 Plan、一 Confirmation、多资源动作、一次 create 与单条汇总 readback；任一资源失败时 create 为零。
- 所有测试数据清理，目标账户真实 Confirmation/action/created object 计数保持零。

## 后续 Gate

Task A 关闭后，只读核验目标账户的小游戏实例/PAY/7 日 ROI/事件链及备用页共享状态。任一仍未通过时停止；全部通过后另建 fresh Job 进入正式单确认创建，不复用旧 Job。

## 关闭结果

- `confirmed-resource-orchestrator` 已进入正式 Node 5 调度，runner 循环外不再存在隐藏资源执行。
- 正式 Plan 只接受 registry 中可执行的资源动作；monitor 缺失只形成 blocker，不生成 `ensure_monitor`。
- Plan 以 blocker 优先判定状态；Node 4 存在 BLOCKED 时 Plan 不可确认，Node 5 结构错误仍保留为 forensic 证据。
- runtime truth 仅接受绑定当前 Plan/hash 的 Confirmation；Confirmation 后 Plan 原子冻结。
- `db/056_workflow_case_single_gate_projection.sql` 已应用，Case summary 的 root blocker 为零条或一条。
- fresh 目标账户只读 Gate 已完成，数据库审计确认 Confirmation、platform action、created object 均为零；外部资源仍 BLOCKED，因此未进入 Task B 写入阶段。
- 回归覆盖执行计划、单确认 orchestrator、Case 投影、monitor transport、安全字段合同和数据库合同；测试数据已清理。

## Solution Link

- source：用户批准的“新账户快速闭环：核心 Workflow 精简与正式创建计划”。
- objective：先修影响正式认证的最小正确性问题，再尽快进入目标账户真实创建。
- current truth：Postgres `marketing_workbench_v2.mwb`、当前代码、当前 Task/Manifest、`docs/Solution Design.md`。
- stop condition：任何真实平台写入、未验证资源写能力、需要第二套机制或目标外部资源仍 BLOCKED 时停止。
