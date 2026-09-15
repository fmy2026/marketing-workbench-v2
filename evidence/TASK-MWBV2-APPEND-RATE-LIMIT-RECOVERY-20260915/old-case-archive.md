# 旧 Case 归档验收快照

查询与归档时间：2026-09-15 CST。

指定 Case `CASE-MWBV2-718FF962130E387B3A` 在归档前为 active，最新 Job 已是 `failed_waiting_manual_review`，不存在 `action_status=started` 且 `finished_at IS NULL` 的平台 action。

受控事务仅将该 Case 的 lifecycle 设置为 `cancelled`，并写入 Task ID `TASK-MWBV2-APPEND-RATE-LIMIT-RECOVERY-20260915`、用户要求关闭旧流程的受控原因与时间。未删除或修改历史 Job、Plan、confirmation、action 或 readback；归档后仍可查询到 3 个历史 action。

归档后 `workflow_case_summary` 已不再提供该 Case 的执行 Gate，当前为 `review_latest_job`。新追加流程必须从浏览器重新开始，生成新的 Case、Job、Plan 和确认。
