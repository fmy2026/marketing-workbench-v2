# TASK-MWBV2-CASE-FF06-OAUTH-RECOVERY-20260909

任务状态、读取清单与验证结果：[Context Manifest](../tasks-context-manifests/TASK-MWBV2-CASE-FF06-OAUTH-RECOVERY-20260909.json)。

## 目标

为 Case `CASE-MWBV2-FF06CC07F45EE8F4CC` 执行一次受控 OAuth token 恢复，并以只读方式重新核验当前 Job；不得创建或修改任何投放业务对象。

## 批准方案

用户于 2026-09-09 批准今天立即恢复。最新 Job 的站点只读 Skill 因 access token 已过期而未取得 HTTP 响应，`site_get_target_shared_blocked` 不能作为站点缺失结论。使用既有 OAuth 刷新实现，严格一次调用、无重试、无 curl 回退；成功后仅由账户本人在工作台执行“重新只读准备”。

## 范围

仅允许一次 OAuth refresh、脱敏状态/audit 读取、当前 Job 的工作台只读重跑，以及本 Task、Manifest、授权审计和证据文件的闭环。

## 非目标

不修改业务代码、数据库、View、API、UI、定时自动化或账户资源；不确认 Plan，不创建、复制或共享落地页，不执行资源准备或标准项目创建，不输出任何凭据或原始平台载荷。

## 验收

- AC-01: OAuth refresh 恰执行一次且成功；脱敏 token 状态为可用，并有新的脱敏成功 audit。
- AC-02: 账户本人在工作台对当前 Job 执行“重新只读准备”；无确认、资源写入、项目创建或重试。
- AC-03: 重读 Case 投影后，凭据和站点只读调用恢复可验证；若仍有 blocker，只保留新的权威 blocker。
- AC-04: 临时授权恢复、证据完整且项目闭环检查通过。

## 停止条件

OAuth refresh 非零退出、状态未恢复、发现需要第二次调用、需要业务平台写入、需要修改凭据内容以外的运行配置、或需输出敏感数据时，立即停止并保留 Task 为 blocked。

## 交付说明

交付一次性恢复的脱敏证据和 Case 最新投影。成功后不代表所有后续资源已就绪；后续唯一 blocker 由 Postgres 重新决定。
