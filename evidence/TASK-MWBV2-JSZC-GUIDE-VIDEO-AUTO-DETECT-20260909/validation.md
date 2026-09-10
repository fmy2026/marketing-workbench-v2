# 验证记录

## AC-01

2026-09-09：`npm run test:guide-video-readonly` 通过。唯一、空、歧义、probe 失败、账户强制开启以及无内部 `source_asset_id` 的平台实例身份场景均已覆盖；没有平台创建调用。

## AC-02

2026-09-09：`npm run test:guide-video-payload`、`npm run test:payload-contract`、`npm run test:std-project-readback` 与 `npm run test:std-project-create-wire-body` 通过。自动命中路径使用两条相同的引导视频字段并形成 94 项账本；空列表路径省略字段并形成 92 项账本；评论管理保持 `ON`。

## AC-03

2026-09-09：`npm run db:contract-check` 通过；live `src/`、`frontend/` 和 `package.json` 未命中本次讨论的任一账户 ID。三个当前文档已同步 capability 来源、`platform_status` 诊断边界与数据保存边界。

## AC-04

2026-09-09：备份 `marketing_workbench_v2-20260909T080654Z.dump` 成功；`db/079_jszc_guide_video_auto_detect.sql` 成功应用并只更新 JSZC 路线默认合同。核心 smoke、项目启动检查和格式检查通过；工作台服务已从提交 `e70ece2` 重启为新的 LaunchAgent 进程。运行一致性与账户隔离回归确认本次没有创建平台对象、confirmation 或真实平台写入。

`test:workbench-auth-http` 需要测试登录凭据，当前环境未提供，未作为本 Task 的验收项；`test:workbench-runtime-policy` 在既有 resource-confirmation scope 数据上失败，亦未改动该 scope 或其运行策略。

## AC-05

2026-09-09：账户所有者已在当前 Case 完成 Attempt 3。Postgres 汇总显示该 Attempt 的 `std_project_create` Plan 为 `V3 / consumed`，且该 Job 只记录一条创建 action；Case 聚合为 `3/3`，没有 created object，随后按既有 fail-closed 合同进入人工复盘。该验收证明 fresh Job/Plan 的单次确认边界，没有声称平台项目已创建成功。
