# 验证证据

## AC-01 Task 启动

`npm run check:project -- --phase start` 于 2026-09-10T06:35:47Z 通过。基线为 `de8bc52a48b4327ea300d3233646a8f7ca188f68`，无既存脏文件；检查确认本任务的 control、workflow、data 范围与允许写入路径一致。

## AC-02 首页标题

`node --check frontend/app.js` 与 `rg -n '进行中的流程' frontend/app.js` 通过；唯一界面修改是 `renderActiveCases` 的标题文本。运行中的 LAN 服务也返回包含该文本的 `/app.js`。

## AC-03 精确历史状态收口

`psql -X -d marketing_workbench_v2 -v ON_ERROR_STOP=1 -f db/081_historical_case_minimal_reconciliation.sql` 于 2026-09-10T06:37Z 成功执行，事务输出为一个 `DO` 和三个精确 `UPDATE 1`。

- `CASE-LEGACY-2E4217E20C9E26BFB648772C` 与 `CASE-MWBV2-EC9287D4A4BC82E5E2` 都为 `cancelled`，原因均为 `superseded_by_verified_same_account_case`。
- `PLAN-JOB-MWBV2-20260831082504-E6BE94-V1` 为 `stale`，原因相同。
- P04 与 P07 对应对象仍为 `ENABLE` 且 `readback_verified`；未修改任何历史对象或 readback。

## AC-04 用户首页投影

只读查询 `mwb.v_user_workflow_summary` 显示 `USR-FENGMEIYU` 的 `advertiser_count=4`、`verified_success_count=4`、`active_case_count=0`、`blocked_case_count=0`。与首页接口相同的 active Case 查询返回 0 行。

## AC-05 Task 关闭

`git diff --check` 与 `node --check frontend/app.js` 通过。`npm run check:project -- --phase before-close` 于 2026-09-10T06:39:25Z 通过；完成状态写入后，`npm run check:project -- --phase after-close` 通过。
