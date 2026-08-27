# TASK-MWBV2-ARCHIVE-FRONTEND-MOCK-LAUNCH-JOB

状态：completed

更新时间：2026-08-27 CST

## 目标

将已不再被工作台加载或运行链路引用的历史前端 mock job 文件归档，避免其旧节点结构被误认为当前真值。

## 范围与边界

- 移动 `frontend/mock-launch-job.js` 至 `.archive/frontend/mock-launch-job.js`。
- 不改运行代码、API、数据库、平台状态或 guardrails。
- 历史任务记录保留其原始路径文字，作为历史审计，不改写为运行入口。

## 验收

- 当前 `frontend/` 与 package/runtime 不再包含该文件。
- 归档文件保留原始内容。
- `git diff --check` 与路径引用检查通过。

## 结果

- 已移动至 `.archive/frontend/mock-launch-job.js`。
- 归档文件 SHA-256 与 Git 中原文件内容一致。
- `frontend/`、`package.json`、`src/`、`scripts/` 不存在对 `mock-launch-job.js` 或 `mockLaunchJob` 的运行引用。
- 仅历史任务卡与 manifest 保留旧路径文字，作为审计记录。

## 验证

| 检查 | 结果 |
| --- | --- |
| 归档前后 SHA-256 | passed；内容未改变 |
| 运行路径引用检查 | passed；无运行引用 |
| JSON 解析与 `git diff --check` | passed |

## 关闭

未改运行行为、数据库、平台状态或 guardrails。
