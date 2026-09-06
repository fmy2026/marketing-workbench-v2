# TASK-MWBV2-CANONICAL-ACCOUNT-READINESS-PROJECTION-20260902

状态：completed

## 目标

修复当前账户已 READY、monitor 已权威 READY 后，历史 `context-resolve-account` 的 `account_not_ready` 仍覆盖唯一 Case Gate 的漂移；同时在账户唯一持久化入口归一授权状态，防止全新账户复发。

验收续跑发现同一 Case 的已消费 Monitor Plan V2 会遮住随后更新的 Resource Plan V1，且现有账户级事件资产合同生成器未接入 Node 04 主链，导致 active Job 在零 root blocker 时错误落入 `review_latest_job`。本 Task 继续收口该验收缺口，不另建平行 Task。

## 范围

- 在 `advertiser_accounts` 唯一持久化入口归一已知授权正常值为 `ready`，其余状态继续 fail-closed。
- 新增仅修改 `mwb.workflow_case_summary` 投影的 migration `070`，按当前账户事实剔除过时的 `account_missing` / `account_not_ready` 历史 Skill blocker。
- 将 Plan 版本与标准项目创建 attempt 分离；Monitor Plan V2 消费后，同一 Job 的后续 Resource Plan 使用 V3，但 `create_attempt_no` 保持 1。
- 在 Node 04 `event-chain-readonly` 前同步当前账户的事件资产 provision 合同；仅写脱敏账户资源合同，前提不完整时继续 fail-closed。
- 新增仅修改 `mwb.workflow_case_summary` 投影的 migration `071`，把 active、monitor READY、Monitor Plan 已消费且零创建动作的滞留 Job 投影回 `run_fresh_readiness`。
- 补充 focused smoke，更新机制文档，并仅对 `CASE-MWBV2-7F8C748BE84126BE77` 的既有 Job 运行一次 Gate-driven readonly 续跑。

## 禁止

- 不创建或重试 monitor、资源、广告项目或任何平台对象。
- 不新增 HTTP endpoint、表、Plan/action 类型、确认短语或授权路径。
- 不删除历史 Skill、Plan、confirmation、action 或 readback 事实。

## 验收

- 当前账户 `auth_status=ready` 时，历史 `account_missing` / `account_not_ready` 不再成为 root blocker；非 READY 时仍 fail-closed。
- 当前 Case 保持同一 Job，monitor READY，自动 readonly 后停在新的资源确认卡或真实 blocker。
- 当前 Case 不再以零 blocker 停在 `review_latest_job`；后续 Resource Plan 版本高于已消费 Monitor Plan，且当前账户事件资产合同精确绑定当前 advertiser。
- 全部验证只使用 mock / `test_run` 或明确允许的 readonly；零真实平台写入。

## Solution Link

用户已批准“当前 Case 最小闭环修复”方案，包括 Plan 版本分离、Node 04 当前账户合同同步、migration `071` 与同一 Job 的一次 Gate-driven readonly 续跑。真值链为 `project.state.json` → 本 Task/Manifest → 当前代码与 Schema → Postgres `mwb.workflow_case_summary`。

## 完成证据

- migration `071` 已应用；当前 Case 不再落入零 blocker 的 `review_latest_job`。
- 同一 Job 的 Plan 序列为 Resource V1 `stale` → Monitor V2 `consumed` → Resource V3 `ready`；V3 的 `create_attempt_no=1`。
- Node 04 已为当前账户 `1871922453447051` 写入脱敏、账户绑定的 event asset provision 合同。
- 当前 Case `CASE-MWBV2-7F8C748BE84126BE77` 已停在 `await_job_write_authorization`，确认短语为“确认准备资源”。
- 本次续跑新增标准项目创建 action 0、非 monitor 平台 action 0；未消费资源确认，也未调用任何平台写入。
- workflow runner、monitor bridge、conversation、runtime policy、execution plan、Node 04 合同及 schema 检查通过；`root_blocker_codes` 超过一个的 Case 数为 0。

完成时间：2026-09-06 18:37 CST
