# TASK-MWBV2-SMOKE-FIX-PUBLISH-WORKBENCH-20260911

任务状态、读取清单与验证结果：[Context Manifest](../tasks-context-manifests/TASK-MWBV2-SMOKE-FIX-PUBLISH-WORKBENCH-20260911.json)。

## 目标

将已完成的视频执行器 smoke 修复推送至 GitHub，并使本机工作台服务重新加载该版本，供新账户流程测试使用。

## 批准方案

用户明确要求将当前已验证改动更新至 GitHub，并确保工作台服务器使用最新版本。保留当前服务网络与安全配置；通过既有 `com.hys.marketing-workbench.local-server` LaunchAgent 重启服务并进行本地 HTTP 可用性核验。

## 范围

- 提交并推送当前已验证的 smoke 修复与任务协调文件。
- 将该 smoke 修复及其已完成的 Task/Manifest 纳入本次发布任务的明确文件范围。
- 重启既有本机工作台服务并确认监听与首页响应。
- 允许更新本 Task、Context Manifest 与项目当前任务指针。

## 非目标

- 不修改运行时代码、部署配置、数据库或业务数据。
- 不执行新账户流程、平台写入或 OAuth 刷新。
- 不改变工作台访问权限或安全策略。

## 验收

- AC-01: 当前分支提交已推送至 `origin/main`，且工作树不再含本次已提交改动。
- AC-02: 工作台服务已重启并在既有 LAN 地址响应；定向视频执行器 smoke 仍通过。

## 停止条件

如远端拒绝推送、服务重启后未能响应，或操作需要修改部署/安全配置，停止并报告当前状态。

## 交付说明

完成后 GitHub 与本机工作台将使用同一提交；新账户测试仍须按既有用户归属、readonly、Plan 和确认边界执行。
