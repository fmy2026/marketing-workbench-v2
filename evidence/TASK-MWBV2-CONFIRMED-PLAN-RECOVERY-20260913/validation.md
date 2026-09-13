# 确认 Plan 恢复完整性｜验收证据

核验时间：2026-09-13T05:56:35Z

## 数据迁移与真实 Case 投影

- 已以 `psql -X -v ON_ERROR_STOP=1 -d marketing_workbench_v2 -f db/090_confirmed_plan_recovery_integrity.sql` 执行 migration `090`。
- `CASE-MWBV2-F13F365AA0B98E01C8` 的 V1 保持 consumed；同 Job 后发且未确认的 V2 已标为 `stale`，原因是 `confirmed_create_plan_requires_fresh_job`。
- `mwb.workflow_case_summary` 投影为 `latest_plan_status=consumed`、`current_gate=resolve_case_blocker`、`root_blocker_codes=[readonly_transport_failed]`、`suggested_next_action=create_fresh_readonly_recovery`。创建 Attempt 仍为 `0/3`。

## 自动回归

- `npm run test:execution-plan`、`npm run test:workflow-case`：通过；覆盖 V1 confirmed/zero-action 后 V2 不能发布、summary 只投影恢复 Gate 和无卡片。
- `npm run test:execution-grant`、`npm run test:workbench-conversation`：通过；并发确认单赢家、重放拒绝、Node 07 readonly 边界和恢复对话均通过。
- `npm run test:workbench-progress`、`npm run test:workbench-runtime-policy`、`npm run test:aweme-authorization`、`npm run test:single-confirmation-orchestrator`、`npm run test:monitor`、`npm run test:resource-action-registry`、`npm run smoke:workflow-skills`：通过；无真实平台写入或 token 刷新。
- `npm run check:project -- --phase before-close` 与 `npm run test:project-contracts`：通过。

## 发布与运行时核验

- 已推送修复提交 `185b3e31ba4268bc778cdec685e32e36f6ae7a3` 到 `origin/main`，本地与远端 SHA 一致。
- 已重载 `gui/501/com.hys.marketing-workbench.local-server`。`GET /agents/launch-creation?case_id=CASE-MWBV2-F13F365AA0B98E01C8` 返回 `200 text/html; charset=utf-8`，`GET /app.js` 返回 `200`、`61609` bytes。
- 返回的 `/app.js` 仅含 `confirmationPreview()` 对 `job.confirmationPreview || null` 的读取，未包含 `pendingConfirmation`，因此显式空服务端投影不会回退为旧卡片。
