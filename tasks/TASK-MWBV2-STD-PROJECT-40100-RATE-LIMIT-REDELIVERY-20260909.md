# TASK-MWBV2-STD-PROJECT-40100-RATE-LIMIT-REDELIVERY-20260909

任务状态、读取清单与验证结果：[Context Manifest](../tasks-context-manifests/TASK-MWBV2-STD-PROJECT-40100-RATE-LIMIT-REDELIVERY-20260909.json)。

## 目标

将标准项目创建的精确平台业务码 `40100` 处理为一个受冻结 Plan 和单次确认约束的限流重投序列：最多三次物理投递，但只消耗一个逻辑创建 Attempt；保持其他失败、超时与不明响应的既有 fail-closed 行为。

## 批准方案

用户于 2026-09-09 批准：仅对 `POST /open_api/v3.0/std_project/create/` 的明确 `40100`、无对象 ID 响应，在同一 action ID、payload/hash、idempotency key 和 confirmation 下按 `0 / 20–24 / 45–49` 秒最多投递三次。非 40100、超时、网络错误和无法解析响应均不重投；三次 40100 终止为 `system_rate_limit_retry_exhausted`。每个物理投递仅保存脱敏审计。该窄化例外取代“任何平台失败均禁止自动重试”的绝对表述，其他 action 仍禁止自动重试。

## 范围

- 更新标准项目创建 executor、Plan/action grant 合同、逻辑 Attempt 聚合、Node 06/07 终态映射和工作台公共投影。
- 新增前向 migration，保存同一逻辑 action 的三次以内脱敏 delivery 审计；不修改现有 action 或 Case 历史。
- 更新安全协议、方案、逻辑图、数据契约和相应 smoke，覆盖 40100 成功/耗尽及非 40100 fail-closed 分支。

## 非目标

- 不发起真实平台创建，不重开、删除或改写现有 Case/Plan/action；不改变 `40000`、HTTP 429、超时、网络错误或其他业务码的策略。
- 不新增 Node、Gate、Plan 类型、公开 HTTP API、账户/Case/Job/user ID 特例或持久化 raw request/response。
- 不实现可跨进程延迟队列；本次三次调用严格由一次 confirmed HTTP 请求在 70 秒窗口内完成。

## 验收

- AC-01: `40100 → success`、`40100 → 40100 → success` 与三个 `40100` 分别执行 2、3、3 次物理投递，同一 action/confirmation/Plan/payload/hash/idempotency key 不变，逻辑创建 Attempt 只计 1。
- AC-02: `40000`、权限/字段错误、超时、网络失败与坏 JSON 都只调用一次；不明响应仍仅走既有只读恢复。
- AC-03: Plan/action grant 只为 `std_project_create + 40100` 允许 `maximum_delivery_calls=3`，并在每个 delivery 保存脱敏审计；其他业务写入继续 `retry_allowed=false`。
- AC-04: Node 06、Node 07、Case summary、公共 Job View 和工作台在等待/成功/耗尽时一致；不新增 Gate 或账户专用分支。
- AC-05: migration、相关 smoke、项目启动/关闭检查和格式检查通过；不发生真实平台写入，现有 `3/3` Case 不被改写。

## 停止条件

若平台资料或可控测试不能证明 40100 是明确未执行、需要将任何其他错误纳入重投、需跨进程队列、需增加新 Node/Gate/API、需要真实平台写入或有敏感信息泄露风险时停止。

## 交付说明

交付通用、窄化的 40100 限流重投能力及脱敏审计。现有耗尽 Case 仅可在后续人工批准后，通过既有替代 Case 路径使用该能力。
