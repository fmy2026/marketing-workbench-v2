# TASK-MWBV2-NEW-ACCOUNT-MONITOR-BOOTSTRAP-BRIDGE-20260902

状态：completed

更新时间：2026-09-02 16:34 CST

## 授权来源

用户于 2026-09-02 批准“全新账户启动与 Monitor Plan 自动落库补充方案”并要求实施。

## Solution Link

- source：工作台当前 `POST /api/workflow-cases`、首次 `dry_run`、乾坤 accountIndex readonly 与 monitor bootstrap Plan-bound 主链。
- objective：全新账户启动时自动完成乾坤账户只读发现并落入 `advertiser_accounts`，首次安全只读自动生成唯一 ready Monitor Plan 与确认卡。
- current truth：PostgreSQL、`workflow_case_summary`、当前工作台/API、Monitor Skill 与既有 Plan compiler。
- stop condition：任何未确认的乾坤写入、monitor 创建、跨范围账户覆盖、重复 Plan 或 raw 敏感数据持久化。

## 范围

- 在 Case 创建前复用现有 accountIndex readonly preflight 补齐不存在的账户记录。
- 账户范围冲突、凭据异常、零匹配、多匹配均 fail-closed，禁止创建 Case/Job。
- 首次工作台 dry-run 自动执行 monitor readonly reconcile；缺少 monitor 且合同完整时保存唯一 `monitor_bootstrap` Plan。
- 保持精确“确认创建 monitor”、fresh readonly、一次调用和权威回查边界不变。
- 更新工作台、workflow-case、monitor 与 API focused smoke。

## 非目标

- 新增表、字段、migration、API endpoint、Plan/action 类型或平台写入口。
- 未确认创建 monitor、资源或广告项目。
- 修改现有账户的路线/游戏范围，或保存 token、raw request/response、完整触点 URL。

## 验收

- 全新账户精确命中后先写 `advertiser_accounts` 与脱敏证据，再创建 Case/Job。
- 点击启动后的首次 dry-run 自动完成 monitor readonly；无 monitor 时直接返回 ready Plan 确认卡。
- ready Plan 仅含一次 `ensure_monitor`；确认前创建调用、confirmation、action 与 attempt 均为 0。
- 已有 monitor 不生成创建 Plan；失败路径无 Case/Job、无跨范围覆盖、无平台写入。
- focused smoke 与现有主链回归通过。

## 停止条件

- 需要放宽 Plan/hash、最新 Job、active Case、精确确认或调用上限约束。
- 账户 bootstrap 无法做到精确一条乾坤匹配或会覆盖其他范围账户。
- 自动只读无法与平台写入严格隔离。

## 完成记录

- `POST /api/workflow-cases` 已在全新 runtime 账户缺失时复用乾坤 `accountIndex` 精确只读预检；仅身份合同完整时补录账户与脱敏证据，失败或 scope 冲突在 Case/Job 前关闭。
- 工作台所有 runtime `dry_run` 已接入 monitor readonly bridge；缺少 monitor 且合同完整时保存唯一 ready `monitor_bootstrap` Plan，并直接返回“确认创建 monitor”卡片。
- Plan 仅含一次 `ensure_monitor`；确认、平台 action、attempt 与真实创建调用均未提前发生。
- focused mock、workflow-case、conversation/runtime policy、monitor、execution-plan、schema、API 与 PostgreSQL 合同回归通过；未新增 migration，真实平台写入为 0。
