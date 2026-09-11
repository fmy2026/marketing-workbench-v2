# TASK-MWBV2-PUBLISH-WORKBENCH-DIAGNOSTIC-FIXES-20260911

任务状态、读取清单与验证结果：[Context Manifest](../tasks-context-manifests/TASK-MWBV2-PUBLISH-WORKBENCH-DIAGNOSTIC-FIXES-20260911.json)。

## 目标

将已关闭的工作台启动诊断与 `getCoreContext` 别名修复提交并推送到 `origin/main`。

## 批准方案

用户明确要求更新 GitHub。只发布现有已验证工作区变更及其任务证据；不再改动业务代码、数据库或工作台运行状态。

## 范围

- 提交并推送现有工作区的两项已验证修复及任务记录。
- 更新本发布 Task、Manifest 和项目指针。

## 非目标

- 不修改业务代码、数据库、服务配置或平台状态。
- 不提交新的工作台启动、confirmation、平台写入或 OAuth 刷新。

## 验收

- AC-01: 发布前差异检查通过，提交内容只含已验证的诊断与查询修复及其任务记录。
- AC-02: 两个发布提交均成功推送至 `origin/main`，工作树最终干净。

## 停止条件

如远端分支已变化、推送失败或发现范围外改动，停止并报告，不覆盖远端历史。

## 交付说明

完成后，GitHub `main` 与已验证的本机工作台修复一致。
