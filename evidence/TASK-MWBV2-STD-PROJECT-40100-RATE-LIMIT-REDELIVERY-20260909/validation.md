# 验证记录

## AC-01

2026-09-10：`npm run test:execution-grant` 通过。假传输覆盖 `40100 → success`、`40100 → 40100 → success` 与连续三个 `40100`，物理 `std_project/create` 调用数分别为 2、3、3；每组仅记录一个逻辑 create action。调用点由 action ID 的确定性抖动生成，首、二、三次分别落在 `0`、`20–24`、`45–49` 秒窗口；未调用真实平台。

## AC-02

2026-09-10：`npm run test:execution-grant` 与 `npm run test:safe-platform-error-summary` 通过。`40000` 显式失败、坏 JSON、网络异常与超时均只投递一次；超时只进入既有只读恢复，不产生第二次创建投递。精确 `40100` 分类为 `system_rate_limited`，不保存平台消息或完整 request ID。

## AC-03

2026-09-10：`npm run test:execution-plan`、`npm run test:workbench-runtime-policy` 通过。标准项目 Create Plan、action 和 action grant 都冻结同一三次 `rate_limit_redelivery` 合同，通用 `retry_allowed=false` 保持有效；confirmation 仍原子单次 claim。migration `db/080_std_project_40100_rate_limit_redelivery.sql` 已在备份 `marketing_workbench_v2-20260909T105511Z.dump` 后应用；delivery 表仅记录脱敏摘要和 hash，action 外键为 `ON DELETE CASCADE`。

## AC-04

2026-09-10：`npm run test:workbench-progress`、`npm run smoke:workflow-skills` 与 `npm run check:runtime-consistency` 通过。工作台在 action 已开始且最近 delivery 为 `rate_limited` 时显示“平台限流，正在等待第 2/3 次错峰投递”；没有新增 Node、Gate、Plan 类型或公开 API。成功仍进入 Node 07 权威回查，三次耗尽为 Node 06/07 的失败终态。

## AC-05

2026-09-10：`node --check` 覆盖修改模块，`git diff --check`、`npm run check:project -- --phase start` 均通过。没有真实平台创建、confirmation 或 action grant；当前已耗尽的 runtime Case 未被读取写回或重开。
