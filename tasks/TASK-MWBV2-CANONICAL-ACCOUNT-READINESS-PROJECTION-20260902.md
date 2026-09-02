# TASK-MWBV2-CANONICAL-ACCOUNT-READINESS-PROJECTION-20260902

状态：in_progress

## 目标

修复当前账户已 READY、monitor 已权威 READY 后，历史 `context-resolve-account` 的 `account_not_ready` 仍覆盖唯一 Case Gate 的漂移；同时在账户唯一持久化入口归一授权状态，防止全新账户复发。

## 范围

- 在 `advertiser_accounts` 唯一持久化入口归一已知授权正常值为 `ready`，其余状态继续 fail-closed。
- 新增仅修改 `mwb.workflow_case_summary` 投影的 migration `070`，按当前账户事实剔除过时的 `account_missing` / `account_not_ready` 历史 Skill blocker。
- 补充 focused smoke，更新机制文档，并仅对 `CASE-MWBV2-7F8C748BE84126BE77` 的既有 Job 运行一次 Gate-driven readonly 续跑。

## 禁止

- 不创建或重试 monitor、资源、广告项目或任何平台对象。
- 不新增 HTTP endpoint、表、Plan/action 类型、确认短语或授权路径。
- 不删除历史 Skill、Plan、confirmation、action 或 readback 事实。

## 验收

- 当前账户 `auth_status=ready` 时，历史 `account_missing` / `account_not_ready` 不再成为 root blocker；非 READY 时仍 fail-closed。
- 当前 Case 保持同一 Job，monitor READY，自动 readonly 后停在新的资源确认卡或真实 blocker。
- 全部验证只使用 mock / `test_run` 或明确允许的 readonly；零真实平台写入。

## Solution Link

用户已批准“修复账户 READY 后的旧 blocker 漂移”方案。真值链为 `project.state.json` → 本 Task/Manifest → 当前代码与 Schema → Postgres `mwb.workflow_case_summary`。
