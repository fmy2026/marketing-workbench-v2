# TASK-MWBV2-WORKBENCH-GATE-DRIVEN-READONLY-AUTO-ADVANCE-20260902

状态：completed

## 目标

修复全新账户工作台启动时的 readonly 推进顺序，使其先消费唯一 `workflow_case_summary` Gate 执行 monitor readonly reconcile，再进入 01–07 dry-run。正常成功链只停在写入确认卡、真实 blocker 或完成态，不需用户输入“继续执行”。

## 范围

- 将 `runWorkbenchInitialReadonly` 收口为 active Case 最新 Job 的有界 Gate-driven readonly 推进器。
- monitor Plan 确认及权威回查成功后，同一 Job 自动继续 readonly。
- 资源 Plan 成功后继续沿用 fresh Job + 自动 readonly 链路，且只投影最新确认卡。
- 同步 AGENTS、Solution Design 与当前逻辑图，并补齐 focused smoke。

## 禁止

- 不增加 endpoint、Schema、Plan/action 类型、确认短语或平台写入授权路径。
- 不自动消费 `monitor_bootstrap`、`resource_prepare` 或 `std_project_create` 的写入确认。
- 不对真实平台执行写入、不刷新 token、不重试平台动作。

## 验收

- 无 monitor 的全新账户启动后先执行 bridge，不调用 Node 05，直接返回“确认创建 monitor”卡。
- 已有完整 monitor 的账户只执行一次 bridge 与一次 dry-run。
- monitor 确认成功后同一 Job 自动推进；资源确认成功后 fresh Job 自动推进；旧确认卡不得回流。
- 历史 Job、非 active Case、Gate 不变或 readonly 回查结果不明时停止，零自动重试、零平台写入。

## Solution Link

用户已批准“新账户正常链取消额外‘继续执行’”方案。当前真值是 `project.state.json`、本 Task/Manifest、当前代码/Schema 与 Postgres `mwb.workflow_case_summary`。若需真实平台写入、修改写入确认语义、引入新 Gate/Plan 或表结构，立即停止。

## 完成事实

- `runWorkbenchInitialReadonly` 先读取 active Case 最新 Job 的唯一 Gate；无 monitor 时先执行 bridge 且不运行 Node 05，已有 canonical READY monitor 时最多再运行一次 dry-run。
- monitor Plan 权威回查成功后在同一 Job 自动继续；Resource Plan 成功后仍在同一 Case 创建 fresh Job，再自动继续。响应仅投影自动推进后的确认卡。
- 已有正常 Case 的一次“继续执行”在 monitor readonly 成功后同样自动继续；终态专用“重新只读回查 monitor”保持单次回查。
- 已通过 `test:new-account-monitor-bridge`、`test:workbench-conversation`、`test:workbench-runtime-policy`、`test:monitor`、`smoke:api`、`test:workbench-address`、`test:workbench-progress` 与 `git diff --check`。全部验证只使用 mock / `test_run`，未执行真实平台写入。
