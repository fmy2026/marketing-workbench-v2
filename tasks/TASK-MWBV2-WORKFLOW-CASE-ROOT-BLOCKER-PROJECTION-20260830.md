# TASK-MWBV2-WORKFLOW-CASE-ROOT-BLOCKER-PROJECTION-20260830

状态：superseded_by_canonical_workflow_gate_hardening

更新时间：2026-08-30 CST

替代任务：`TASK-MWBV2-OE3-CANONICAL-WORKFLOW-GATE-HARDENING-20260830`。本任务不再单独实施，避免重复修改同一 Case 投影。

## 目标

修正 `mwb.workflow_case_summary` 的根因投影：资源准备阶段只输出当前可执行的单一 root blocker/next_action，不把尚未具备输入的 Node 5 payload、wire、字段账本和素材派生错误混入资源根因。

## 系统位置

- 真值：Postgres 当前 Case、Execution Plan metadata、Node/Skill 状态。
- 输出：`mwb.workflow_case_summary.root_blocker_codes`、`blocker_codes`、`current_gate`、`suggested_next_action`。
- 不修改 Node 1–7 定义，不修改资源能力、payload 合同或平台 executor。

## 设计边界

- 资源 Gate 未通过时，优先输出未就绪且不可自动准备的资源；同优先级按正式资源顺序稳定选择一个。
- Node 5 派生 blocker 仅在 Node 4 资源全部 ready 后进入根因候选。
- 完整结构 blocker 仍保留在 `structural_blocker_codes` 供取证，不丢失证据。
- 不执行平台读写，不修改业务 Case 的资源状态或动作记录。

## 验收

- 使用当前认证 Case 的脱敏 fixture 验证 root blocker 数量为 1，next_action 指向同一资源。
- Node 4 全 ready 的 fixture 仍能暴露真实 Node 5 合同 blocker。
- 已创建待回查、尝试上限、人工复核等更高优先级 Gate 保持原行为。
- `workflow_case_summary`、API、CLI 和任务卡读取同一投影，不新增第二套 next_action。

## Solution Link

- source：新账户正式只读 bootstrap 暴露的资源根因与派生 blocker 混排。
- objective：恢复 Case 投影的单一 Gate 与可执行下一步。
- current truth：Postgres、当前 view 定义、Execution Plan metadata 和 Node/Skill 运行记录。
- stop condition：任何平台写入；任何需要改变资源或 payload 合同的修复。
