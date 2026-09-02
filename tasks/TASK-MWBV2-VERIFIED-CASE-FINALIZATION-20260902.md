# TASK-MWBV2-VERIFIED-CASE-FINALIZATION-20260902

状态：completed

## 授权来源

用户于 2026-09-02 批准“已完成创建 Case 的最小状态收口修复”并要求实施。授权包含对唯一目标 Case 的受控数据库终态收口；不包含任何新的平台请求或创建调用。

## 唯一目标

复用已持久化的 create action、created object 与官方 verified readback，将标准项目创建的正常执行和后续 `readback_only` 统一收口，并修正完成 Case 的工作台 7/7 与完成态文案。

## 精确目标

- Case：`CASE-MWBV2-5B75EB40E6F9AF2469`
- Job：`JOB-MWBV2-20260902023329-FCF072`
- Plan：`PLAN-JOB-MWBV2-20260902023329-FCF072-V1`

## 实现范围

- 新增内部 verified finalization，严格校验最新 runtime Job、已确认 Create Plan、成功 action、对象 ID 与 verified readback。
- Plan 仅按 `ready → waiting_readback → consumed` 或 `waiting_readback → consumed` 收口；重复调用幂等。
- verified 后把 runtime Case 标记为 completed；不修改 Job 的 `created` 底层语义。
- `execute_once` 与 `readback_only` 共用同一收口逻辑。
- 完成 Gate 覆盖用户态标题、下一步和输入提示；Node 继续使用持久化 action/readback 投影，不改写历史 Node run。
- 对上述唯一 Case 使用相同强校验逻辑做一次数据库收口，不发平台请求。

## 禁止

- `std_project/create`、`std_project/list` 或任何其他真实平台调用。
- 新 confirmation、action、Job、后台 worker、自动重试或隐式刷新。
- Schema、View、Gate、7 Node 注册表、Plan/action 类型或公开 HTTP API 变更。
- 手工伪造或改写历史 Node run。

## 验收

- verified normal/readback-only 路径均能收口；pending、ID/名称不一致和 transport error 不收口。
- 重复收口不产生新平台调用，Plan/Case 状态保持稳定。
- 当前 Case 为 completed、Plan 为 consumed、Gate 保持 `first_std_project_create_completed`、页面为 7/7 已完成。
- “继续执行”只返回完成状态；“刷新进度”保持数据库只读。

## 停止条件

- 需要弱化 ID + 名称 verified 条件或扩大数据库目标范围。
- 需要新增 Schema/View/API、平台请求、confirmation、action 或 Job。

## 完成记录

- 已新增共享 verified finalization，并由 `execute_once` 与 `readback_only` 共用；只接受最新 runtime Job、单次成功 create action、单一创建对象、最新 Draft 和 ID/名称一致的 verified readback。
- 已复用既有 Plan 迁移完成 `ready → waiting_readback → consumed`，Case 进入 `completed`；重复收口幂等且不访问平台。
- 已修正完成 Gate 的顶部、Agent、下一步和输入提示；Job View 将持久化 action/object/readback 投影为 Node 5–7 passed，不改写历史 Node run。
- 目标 Case 已受控收口：Plan consumed、Case completed、Gate 完成、7/7 passed、无 blocker、无确认卡、禁止重试；真实平台调用为 0。
- 已通过 verified-finalization、readback schedule、工作台、Case、Execution Plan、execution grant、workflow skills 与 Schema 回归。
