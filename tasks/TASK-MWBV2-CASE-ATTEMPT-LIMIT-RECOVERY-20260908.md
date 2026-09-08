# TASK-MWBV2-CASE-ATTEMPT-LIMIT-RECOVERY-20260908

状态：completed_without_platform_write

## 目标

把标准项目创建已耗尽 Case 的人工复盘、失败取证与单次替代验证接入工作台。旧 Case 的三次真实创建和证据必须保持不可变；替代 Case 只能在有脱敏且已批准的复盘证据后，由原账户本人以既有“重新只读准备”启动，且最多确认创建一次。

## 已批准边界

- 目标 Case：`CASE-MWBV2-776936E13CC487A466`；当前动态事实只读自 Postgres。
- 不新增 Workflow Node、业务 Gate、Plan/action 类型或确认短语；不触发任何真实平台写、确认、创建或重试。
- migration `075` 增加 Case 级 `maximum_create_attempts`（普通 Case 默认 3，替代 Case 固定 1），并让 `workflow_case_summary`、runner、Plan 与最终 executor 都读取同一字段。
- 后续失败取证只存格式校验的 request id 与限长脱敏错误摘要；禁止 raw request、payload、response、URL、凭据或长 ID。
- 人工复盘批准通过受控维护入口写入最新 Job 脱敏 evidence 与旧 Case metadata；管理员仍无代运行、代确认或代恢复权限。
- 原 Case 在替代事务中改为 `cancelled`；同一事务创建同 owner、同 scope 的替代 Case 与 fresh Job。重复“重新只读准备”返回该替代 Case，不产生第二个 Case/Job。

## 实施与验收

- 增加 migration、repository 原子操作、失败安全摘要、工作台 Gate 文案与“重新只读准备”分支。
- 添加 mock-only smoke：未批准、非本人、历史 Job 与重复调用均无替代 Case；批准后旧 Case 终态、替代 Case/Job 幂等、最大次数为 1、readonly 阶段零真实创建。
- 验证旧 Case 三条 action、三份 consumed Plan、零对象和零 verified readback 未被重写；替代 Case 最多一条创建 action。
- 执行 DB 备份、migration、schema/Case/conversation/runtime-policy/error-summary/attempt smoke；真实业务平台写为 0。

## 停止条件

- 需要第 4 次创建、自动确认/重试、复制旧 Draft/Plan/confirmation/idempotency key，或弱化 owner/Plan/readback 校验。
- 任何实现路径需要保留 raw 平台请求、响应、URL 或凭据。

## 实施结果（2026-09-08）

- 已应用 `db/075_case_attempt_limit_replacement_recovery.sql`：普通 Case 默认 `maximum_create_attempts=3`，唯一替代 Case 固定为 `1`，`workflow_case_summary` 直接投影该 Case 真值。
- 已实现持久化 request id 的格式校验、限长安全错误摘要、受控人工复盘证据写入，以及 owner-bound、旧 Plan 已 `consumed`、旧 Case 无创建对象/verified readback 前提下的替代 Case/Job 原子建档。
- 已实现工作台人工复盘 Gate：耗尽时“继续执行”没有创建语义；只有获批、旧 Case 的账户本人输入“重新只读准备”才能进入替代 Case 的完整 readonly。新 Plan 仍须本人精确输入“确认创建”。
- 当前目标 Case 经只读复核保持 `3/3`、3 条创建 action、零创建对象、零 verified readback；未写入人工复盘批准证据，未创建替代 Case，未调用真实平台写。
- 本地数据库备份：`.local/backups/marketing_workbench_v2-20260908T062027Z.dump`。已通过 schema、workflow Case、attempt-limit、corrective create、workbench conversation/progress 与安全错误摘要 smoke；全部报告真实平台写为 0。

## 交付后的外部依赖

取得平台对 Attempt 3 的明确子码、字段路径或账户资格结论后，维护人员才可用受控维护入口写入脱敏复盘批准证据。若平台无法明确原因，旧 Case 保持人工复盘状态，不创建替代 Case。
