# TASK-MWBV2-INTAKE-READONLY-RECOVERY-20260909 验收证据

验证时间：2026-09-09T01:53:26Z。

## AC-01

`npm run test:workbench-address` 通过。已批准替代 Case 的首次 `created` Job 仅请求 initial readonly；`blocked_confirmed_resource_plan` 与 `blocked_confirmed_monitor_plan` 分别返回 `requiresReadonlyRecovery=true`；普通 blocker 与终态 monitor 不返回该标记。重复 Intake 只返回同一替代 Case，测试报告 replacement create 调用为 1、平台创建调用为 0。

## AC-02

`npm run test:workbench-address && npm run test:workbench-conversation` 通过。前端只在新标记分支调用既有 `submitJobCommand("重新只读准备")`；会话合同确认该命令创建 fresh readonly Job，不确认或创建平台对象。

## AC-03

`npm run test:workbench-conversation`、`npm run test:case-attempt-limit`、`npm run test:resource-action-registry` 与 `npm run test:single-confirmation-orchestrator` 均通过。Case attempt 测试报告 ordinary 最大创建次数为 3、replacement 为 1、平台写入为 0；资源和单次确认 smoke 均明确没有真实平台写入。

## AC-04

`git diff --check` 通过。关闭前项目合同检查在当前 Task 指针仍存在时执行。
