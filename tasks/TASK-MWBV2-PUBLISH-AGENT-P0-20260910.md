# TASK-MWBV2-PUBLISH-AGENT-P0-20260910

任务状态、读取清单与验证结果：[Context Manifest](../tasks-context-manifests/TASK-MWBV2-PUBLISH-AGENT-P0-20260910.json)。

## 目标

将已关闭并验证的投放创建 Agent P0 代码、迁移、文档、测试和任务证据提交并推送到 `origin/main`。

## 批准方案

按用户“更新 GitHub”授权，先复核现有 P0 工作树和项目合同，再进行非交互式 Git 提交与推送；不改变产品行为、数据库或平台权限。

## 范围

- 提交当前 P0 相关源代码、迁移、文档、测试和已关闭的 Task/Manifest/Evidence。
- 推送当前 `main` 至配置的 GitHub `origin`。

## 非目标

- 不修改业务代码、数据、平台配置、凭据或工作台权限。
- 不改写 Git 历史、不强推、不创建 PR。

## 验收

- AC-01: 当前 P0 变更通过 Git diff、任务合同和现有回归复核。
- AC-02: 提交仅包含当前已确认的 P0 交付与发布 Task 闭环记录。
- AC-03: `origin/main` 成功接收提交，工作树保持干净。

## 停止条件

- 发现未确认的无关改动、远端非快进冲突、认证失败或推送需要强制覆盖时停止。

## 交付说明

状态和逐项验证只维护在 Manifest。
