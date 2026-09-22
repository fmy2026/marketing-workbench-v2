# TASK-MWBV2-OCEANENGINE-TOKEN-MAINTENANCE-20260922

任务状态、读取清单与验证结果：[Context Manifest](../tasks-context-manifests/TASK-MWBV2-OCEANENGINE-TOKEN-MAINTENANCE-20260922.json)。

## 目标

将巨量 OAuth access token 的日常维护改为当前项目的专用 macOS LaunchAgent：每小时检查，在剩余有效期不足两小时后刷新，并以 OAuth 只读接口验证新 token 生效。

## 批准方案

用户已批准“独立的 Token 自动刷新任务”方案：不依赖 Codex、模型、精确分钟窗口或 active Task；复用受控刷新、原子凭据写入、文件锁与脱敏审计。异常不会在单次运行内重试，结果不明禁止后续自动重发，首次异常、状态恶化和恢复会产生本机通知。

## 范围

新增 token 维护入口、脱敏审计与测试；更新专项授权、部署说明、方案和流程说明；安装当前项目专用 LaunchAgent，暂停 Codex automation 并移除旧项目同用途 LaunchAgent。

## 非目标

不创建、修改或重试任何投放业务对象；不新增数据库或前端能力；不输出 token、secret、完整 URL、原始请求或响应；不保证 Mac 关机、退出登录、长时休眠、断网或平台撤销授权期间的持续有效。

## 验收

- AC-01: `token:maintain` 对未到期凭据不发刷新请求，到期阈值内仅刷新一次，并在刷新后完成 OAuth 只读验证。
- AC-02: 授权、并发、网络失败、超时/结果不明、持久化和验证失败均按批准的停止或恢复规则处理，输出与 audit 不泄露敏感值。
- AC-03: 当前项目专用 LaunchAgent 每小时检查并在登录时补检；旧 Codex 和旧项目刷新入口已停用，系统只保留一个刷新入口。
- AC-04: 更新后的代码、合同和部署文档通过项目检查与相关自动测试；必要时完成真实维护运行与只读生效验证。

## 停止条件

外部 OAuth 返回不明结果、平台拒绝、凭据失效、运行环境没有网络或 LaunchAgent 安装无法验证时停止自动刷新并保留脱敏证据；不扩大为业务 API 写入或未批准的网络权限。

## 交付说明

完成后在 Manifest 记录测试、系统调度和真实只读验证证据；项目状态与授权边界以更新后的 `project.state.json` 为准。
