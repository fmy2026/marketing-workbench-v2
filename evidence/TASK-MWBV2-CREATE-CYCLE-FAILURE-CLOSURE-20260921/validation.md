# TASK-MWBV2-CREATE-CYCLE-FAILURE-CLOSURE-20260921｜验收证据

记录时间：2026-09-21T04:31:56Z。

## 隔离验证

- `npm run test:execution-plan`：通过。先以遗留三字段约束复现跨 cycle 写入失败；migration 重复运行后仅保留 `job_id + execution_cycle + skill_key + attempt_no` 唯一性。实际运行 dry-run → 确认 → execute_once；确认后零动作异常消费 Plan，Node 06 为 `blocked`、Node 07 为 `locked`。运行中 cycle 阻止收口，已消费 Plan 的迟到创建 action 认领失败。
- `npm run test:workbench-runtime-policy`：通过。确认领取后的本地异常仅在零动作条件下收口；重复确认拒绝，收口失败保留原异常。
- `npm run test:single-confirmation-orchestrator`、`npm run test:workbench-conversation`、`npm run test:workbench-progress`：通过。确认单次消费、对话恢复和服务端进度投影保持一致。
- `npm run test:workbench-auth-http`、`npm run test:workbench-client-pages`、`npm run test:workbench-cross-user-http`：通过。HTTP、页面和用户隔离回归通过。

## Schema 与发布

- `db/099_confirmed_create_cycle_failure_closure.sql` 已在 `marketing_workbench_v2` 应用并在无运行中 cycle 的窗口重复应用。约束回查只剩 `launch_skill_runs_job_cycle_skill_attempt_unique`，定义为 `UNIQUE (job_id, execution_cycle, skill_key, attempt_no)`。
- 远端 `origin/main` 已核验为 `be8b41edcf95b5d7182ee97fd138e9dc8460e108`；固定发布目录为 `.local/releases/be8b41edcf95b5d7182ee97fd138e9dc8460e108`，公司模式已重载。
- 直连健康检查 `curl --noproxy '*' http://192.168.42.7:3000/` 返回 HTTP 200。代理环境下的请求不作为服务状态结论。

## 当前 Case 受控收口

- 收口前只读核验：`CASE-MWBV2-262285EB4DFA3DB3CB` 的最新 Job/Plan 绑定保持一致，Case active、Plan executing、确认有效，运行中 cycle、platform action、delivery、created object 均为 0。
- 仅执行一次 `finalizeConfirmedCreatePlanBeforeAction` 本地收口，结果为 `finalized=true`、`jobFinalized=true`、`nodesFinalized=2`；没有平台调用。
- 收口后只读回查：旧 Plan 为 `consumed`，Job 为 `failed_waiting_manual_review`，Node 06 为 `blocked`，Node 07 为 `locked`；`workflow_case_summary` 为 `resolve_case_blocker`，唯一 blocker 为 `confirmed_create_execution_failed_before_action`，下一步为 `create_fresh_readonly_recovery`。当前 Job 的 action、delivery、对象仍均为 0。

后续业务操作必须由账户本人使用既有入口重新只读准备，核对 fresh Job 的新 Plan/hash 后独立确认；本任务没有创建平台项目。
