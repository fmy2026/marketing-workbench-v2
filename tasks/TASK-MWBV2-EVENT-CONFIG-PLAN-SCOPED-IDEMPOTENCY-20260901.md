# TASK-MWBV2-EVENT-CONFIG-PLAN-SCOPED-IDEMPOTENCY-20260901

状态：completed

## 授权来源

用户于 2026-09-01 批准“事件配置幂等键最小修复”并要求直接实施。

## 唯一目标

让 `ensure_event_configs:baseline` 的子 action 幂等键绑定当前 Job/Plan，避免相同平台请求在 fresh Job 中与历史审计记录发生全局唯一键碰撞。

## 已确认事实

- 当前 Case 连续两份已确认 Resource Plan 都在首个事件配置动作开始前收口为 `consumed`。
- PostgreSQL 权威日志显示 `ux_platform_actions_idempotency_key` 冲突；碰撞键仅由 request hash 与 event type 组成。
- 当前 baseline 为 4/6，缺少 `purchase_roi_7d` 与 `purchase_roi_30d`；preflight 和 request plan 均通过，失败发生在子 action 审计占位写入。
- 失败前没有调用事件配置平台写接口，不得把该审计冲突当作平台响应不明或复用旧 Plan。

## 实现范围

- 把 `validatePlannedActionGrant` 已验证的 planned action 透传给事件配置执行 scope。
- 子 action 幂等键固定为 planned action key + Plan ID + event type；缺少任一绑定时在平台调用前 fail-closed。
- 为跨 Job 相同请求、同 Job 重复执行、缺失幂等绑定与 partial baseline 增加 mock/test_run 回归。
- 重启工作台，并只对当前 Case 执行既有“重新只读准备”恢复到 fresh Plan。

## 禁止

- 跳过事件配置 Gate、修改或复用已消费 Plan/confirmation/action/idempotency key。
- 自动确认新 Plan、真实平台写入、重试、OAuth refresh 或标准项目创建。
- 新增 API、Schema、View、Gate、Plan/action 类型或后台 worker。
- 删除历史记录或保存 token、Cookie、secret、完整 URL、raw request/payload/response。

## 验收

- 相同 request hash/event type 在不同 Job/Plan 下生成不同幂等键。
- 同一 Job 已存在子 action 时仍在写前阻断，平台调用次数为零。
- planned action key 或 Plan ID 缺失时 fail-closed，平台调用次数为零。
- 4/6 baseline 只生成两个候选；6/6 权威回查后才能 READY。
- 事件配置、单确认编排、Schema、安全与 runtime consistency 校验通过。
- 当前 Case fresh readonly 恢复后只生成新 ready Resource Plan；本 Task 不消费确认。

## 停止条件

- 修复需要修改数据库唯一约束、删除历史 action 或放宽 Plan-bound 权限。
- 修复需要真实平台写入、自动重试、自动确认或 Token 刷新。

## 完成结果

- `eventConfigExecutionScope` 已透传验证后的 planned action；executor 使用 planned action key、Plan ID 与 event type 构造子 action 幂等键，缺失绑定时在 action 占位与平台调用前阻断。
- 事件配置、单确认编排、事件链只读、Schema、安全、runtime consistency、资源 action registry、工作台策略/对话与 execution plan 校验通过；4/6 baseline 仍只生成两个候选。
- 工作台已重启。Case `CASE-MWBV2-5B75EB40E6F9AF2469` 经精确“重新只读准备”创建 fresh Job `JOB-MWBV2-20260901103627-D875E0` 与 ready Plan `PLAN-JOB-MWBV2-20260901103627-D875E0-V1`。
- 当前 Gate 为 `await_job_write_authorization`，确认数与平台 action 数均为 0；未消费新 Plan，等待用户明确输入“确认准备资源”。
