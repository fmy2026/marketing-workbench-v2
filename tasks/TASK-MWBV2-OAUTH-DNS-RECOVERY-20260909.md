# TASK-MWBV2-OAUTH-DNS-RECOVERY-20260909

任务状态、读取清单与验证结果：[Context Manifest](../tasks-context-manifests/TASK-MWBV2-OAUTH-DNS-RECOVERY-20260909.json)。

## 目标

在 DNS 预检通过后，为当前 OAuth 凭据执行一次新授权的 refresh，并确认 access token 恢复有效；仅在成功后由账户本人执行当前 Job 的只读重检。经用户于 2026-09-09 明确批准，补充最小工作台引导修正，使共享站点只读阻断能准确引导账户本人触发该重检；并在确认工作台服务仍加载旧合同后，重启同一服务并对当前 Job 做一次只读重检。

## 批准方案

用户于 2026-09-09 明确要求落地最小修复并确保 token 有效；随后批准“工作台只读恢复引导最小修正”。上一个 Task 已在单次 refresh 的 DNS 失败后取消；本 Task 不复用该调用额度。依据本地记录的官方 OAuth 文档，使用 `refresh_token` 有效期内的单次 POST 刷新，原子保存新 access/refresh token 与过期时间，避免并发刷新。工作台继续只读消费 `workflow_case_summary` 的唯一 root blocker，不改写任何运行事实。

## 范围

仅允许：不携带凭据的 DNS 预检、一次 OAuth refresh、脱敏 token/audit 读取、账户本人在工作台执行“重新只读准备”、Case 只读验证、`site_get_target_shared_blocked` 的通用前端文案/输入引导与 smoke 覆盖、从当前 Git HEAD 重启已确认的本地工作台服务，以及本 Task 闭环。

## 非目标

不修改数据库、View、API、Gate、Case/Job/Plan 状态、定时自动化或网络配置；不使用 curl 回退、代理绕过或第二次 refresh；不确认 Plan，不创建任何资源、共享站点或标准项目。不得为任何账户、Case、Job 或用户添加特例。

## 验收

- AC-01: DNS 预检通过，且 OAuth refresh 恰调用一次并成功。
- AC-02: 脱敏 token 状态为 `valid`，新的成功 audit 已记录，access/refresh token 过期时间已原子前移。
- AC-03: 账户本人执行“重新只读准备”，且未产生 confirmation、资源写入或项目创建。
- AC-04: Case 投影不再将凭据过期或本次共享站点调用失败作为 blocker；临时授权恢复并通过项目闭环检查。
- AC-05: 最新 Job 的 `site_get_target_shared_blocked` 展示为用户可理解的只读恢复引导，不泄露 Gate/action/blocker 内部码；输入框提示“重新只读准备”，既有恢复命令的只读边界不变。
- AC-06: 旧工作台服务从当前 Git HEAD 重启；当前 Job 的 Node 5 不再因旧进程 success-profile 合同产生版本、来源、fixture 或字段形状 mismatch，且本次重检不新增 confirmation、平台动作或创建对象。

## 停止条件

DNS 预检失败、refresh 非零退出、token 状态未恢复、需要第二次调用、需要修改网络/代理配置、需要业务平台写入或需要输出敏感数据时，立即停止并保留 Task 为 blocked。

## 交付说明

交付脱敏刷新、只读重检和 Case 投影证据。若凭据恢复后仍出现其他资源 blocker，仅报告其权威结果，不扩大本 Task。

本 Task 已被“引导视频能力自动识别”通用修复替代而取消：OAuth 刷新、工作台只读引导与旧服务合同重启已完成；当前 Case 的后续问题属于 Node 04–05 capability 来源与数据合同，不能在本 Task 范围内继续处理。
