# TASK-MWBV2-JSZC-GUIDE-ONLY-CAPABILITY-20260909｜验证证据

## AC-01

在 2026-09-09T02:48:23Z 完成 `marketing_workbench_v2` 本地备份并通过归档目录校验。应用 `db/077_account_guide_only_correction.sql` 前，受限查询只返回目标 scope 的 `1|true|true`；迁移输出 `BEGIN / DO / UPDATE 1 / DO / COMMIT`。随后只读回查显示该账户 capability 为 `guide_video_required=true`、`video_cover_required=false`，且已验证 `micro_app_instance` 数量为 1。整个过程未调用平台。

## AC-02

在 2026-09-09T02:54:05Z 的回归中：

- `npm run test:guide-video-readonly` 通过；guide-only 结果为 `platform_default_cover_allowed`，无平台创建调用。
- `npm run test:guide-video-payload` 通过；guide-only 有 2 条 `guide_video_id`、0 条 `video_cover_id`、字段账本为 94 条；普通、guide-only、guide+cover 分别保持 92、94、96 条路径。
- `npm run test:std-project-readback` 通过；guide-only 只校验两个视频与同一引导视频的绑定，封面不作为匹配条件。
- `npm run test:payload-contract`、`npm run smoke:workflow-skills` 通过；模拟执行链的 payload 合同与 Node 01–07 均通过，输出明确 `noRealPlatformWrite=true`。

## AC-03

人工核对当前 Solution Design、逻辑图和数据契约：guide video 与 explicit cover 均为账户 capability；guide-only 使用唯一当前 Job 引导视频及平台默认封面。`rg -n "1867508089433225" src frontend package.json` 无输出；目标账户 ID 未进入 live runtime。

## AC-04

以下检查全部通过：

- `npm run db:contract-check`
- `npm run test:project-contracts`（80 个合同场景）
- `npm run check:project -- --phase start`（当前 Task、3 个领域、78 个 migration 文件）
- `git diff --check`

Task 仍为 `blocked`：当前 Case 的 blocker 是迁移前的只读结果，必须由账户所有者登录工作台后执行一次“重新只读准备”生成新的事实；真实创建仍须该所有者输入精确“确认创建”。
