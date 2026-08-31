# TASK-MWBV2-AGENTS-SOLUTION-DESIGN-SYNC-20260831

状态：completed

创建时间：2026-08-31 17:50 CST

## 目标

以当前逻辑图、数据报表契约和 Git `70f1fbc` 为基线，精简并同步项目启动协议与方案设计规范。

## 范围

- 更新 `AGENTS.md`。
- 更新 `docs/Solution Design.md`。
- 更新本 Task、Context Manifest 和 `project.state.json` 后关闭任务。

## 非目标

- 不修改运行代码、Schema、View、API 或业务运行事实。
- 不执行平台读写、资源准备、创建、重试、预算/出价变更或 OAuth 刷新。
- 不提交或推送 Git。

## 验收

- 两份文档均有更新时间、校验基线和重新校验条件。
- 启动、真值、工作台、单一 Gate、Plan-bound 执行、安全和任务闭环规则无遗漏。
- Solution Design 保留方案最小格式、真值优先级、Task 映射和单模块专项闭环。
- JSON、Markdown、引用路径、敏感内容扫描和 `git diff --check` 通过。

## 完成结果

- `AGENTS.md` 已同步 Case/Job 工作台入口、单一 Case Gate、Plan-bound 权限、安全与任务闭环。
- `docs/Solution Design.md` 已精简为使用条件、真值优先级、最小方案、Task/Plan 映射和单模块专项闭环。
- 乾坤接口引用已修正为仓库实际路径 `docs/.乾坤系统/api-docs-20260827.md`。
- 未修改运行代码、Schema、View、API 或业务事实；未执行平台读写或 Git 提交/推送。

| 校验 | 结果 |
| --- | --- |
| 当前逻辑图与数据契约对照 | passed |
| Task/Manifest JSON 与引用路径 | passed |
| Case/Job、Gate、Plan 和回查关键规则扫描 | passed |
| 动态长数字 ID 与敏感值扫描 | passed；仅保留工作台本地地址 |
| `git diff --check` | passed |

完成时间：2026-08-31 17:53 CST
