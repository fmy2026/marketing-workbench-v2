# TASK-MWBV2-OCEANENGINE-TOKEN-REFRESH-MINIMAL-20260909

任务状态、读取清单与验证结果：[Context Manifest](../tasks-context-manifests/TASK-MWBV2-OCEANENGINE-TOKEN-REFRESH-MINIMAL-20260909.json)。

## 目标

将巨量引擎 OAuth token 每日刷新收口为每日 12:01 的唯一单次受控刷新，并提供脱敏、可行动的传输失败分类与成功审计。

## 批准方案

用户批准保留唯一 Codex cron、automation ID、失败通知、一次 OAuth POST、文件锁、原子凭据更新与 scope 校验；每天 12:01 Asia/Shanghai 执行。失败时只告警并停止，不使用 curl 回退或自动重试。依据为当前 token 已通过只读平台探针、定时任务持续触发但刷新审计只有 `transport_error/TypeError`。不新增公开 API、数据库 Schema 或业务写入入口。

## 范围

修改 token refresh 的安全失败分类与成功 audit、12:01 scope 合同、对应 smoke、调度自动化配置和必要的方案/逻辑/部署文档；不立即执行 OAuth 刷新。

## 非目标

不改动业务 API、Case/Job/Plan、数据库、预算、素材或凭据内容；不输出 token、secret、auth code、Cookie、请求体、响应体或原始异常；不引入重试、curl 回退或 LaunchAgent。

## 验收

- AC-01: scope、automation ID、确认变量与每日 12:01 合同准确匹配；不匹配时零 OAuth 请求。
- AC-02: 成功、DNS、连接/代理、TLS、超时和未知传输失败均产生脱敏且可行动的结果；每次至多一次 OAuth POST，成功和失败都写安全 audit。
- AC-03: 既有刷新安全边界、敏感信息保护、项目闭环检查和 smoke 全部通过；真实 token 仅留待下一个 12:01 调度窗口验证。

## 停止条件

若实现需要未批准的 OAuth 立即刷新、业务平台调用、凭据输出、自动重试、curl 回退、LaunchAgent 或数据库变更，则停止并报告。

## 交付说明

完成后交付单一每日调度合同、分类诊断和脱敏审计；动态 token 状态仍只看本地受控凭据与调度审计。
