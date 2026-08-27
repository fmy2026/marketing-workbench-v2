# TASK-MWBV2-NODE2-MONITOR-CYCLE-REISSUE-AND-LIVE-PREFLIGHT

状态：blocked_external_credential

更新时间：2026-08-27 CST

## 目标

为新账户 `1871922414575753` 的乾坤 monitor 创建建立 cycle 生命周期：同一 provision 可显式 reissue 多个 cycle；每个 cycle 最多两次真实创建 attempt；停止的 cycle 永不自动重试。

本任务只做 cycle 语义、只读 preflight、脱敏 create plan 和记录闭环，不执行真实 monitor 创建。

## 需求来源与边界

需求来源：`/Users/hys/Desktop/需求表述.md` 中的 `TASK-MWBV2-NODE2-MONITOR-CYCLE-REISSUE-AND-LIVE-PREFLIGHT`。

需求文档是业务输入，不是平台写入授权。本任务禁止调用 `/tf/ad/monitorSerialNumberAdd`，禁止真实资源准备、`std_project/create`、token refresh、预算/出价修改；禁止保存 token、Cookie、完整 URL、raw payload、raw request、raw response。

## 合理性评估

需求合理，可以推进。

依据：

- 现有 `monitor_provision_runs` 更像单行汇总，确实难以表达“旧 cycle 停止后显式 reissue 新 cycle”。
- 现有 `monitor_provision_attempts` 已有 attempt 审计与 idempotency 基础，适合做最小 schema 扩展，不需要第二套 monitor 表。
- `02-monitor-provision.mjs` 已是 CLI 与 Workflow 共用 handler，可以通过新增 `02-monitor-cycle.mjs` 将 cycle policy 从平台调用中拆出。
- `project.state.json.guardrails.real_platform_dependency_allowed=true` 允许真实只读依赖；`platform_write_allowed=false` 与本任务“禁止真实创建”一致。

## 范围

- 检查真实 schema 后新增最小 migration，将历史 provision 数据无损迁移为 Cycle 01。
- 新增 `02-monitor-cycle.mjs`，集中处理 cycle ID、attempt policy、reissue 校验、错误分类和状态判断，不调用外部 API。
- 扩展 `02-monitor-provision.mjs`，让 `monitor:plan`、`monitor:reissue-plan`、Workflow Node 2 继续复用唯一 handler。
- 扩展 `scripts/02-monitor-provision-cli.mjs`，新增或映射 plan/reissue-plan 入口，CLI 只做参数解析与输出。
- 对目标账户执行一次真实乾坤只读 preflight，校验账户身份、agent、媒体、三级资源位、monitor API、游戏路线默认参数、callback 合同和精确 monitor 列表。
- 写入 cycle、evidence、execution plan 的脱敏真值，并输出最新可确认创建计划。
- 更新长期说明、schema 说明、task/manifest 和 `project.state.json`。

## 非目标

- 不执行真实 monitor 创建或 retry。
- 不执行真实资源准备、视频上传、事件创建、DMP 推送。
- 不执行 `std_project/create`。
- 不刷新 token。
- 不修改前端界面。
- 不创建第二套 monitor 表、第二套 CLI 或第二套 execution grant。
- 不删除历史 monitor、attempt、job、evidence 或项目记录。
- 不写入 token、Cookie、完整 URL、raw payload、raw request、raw response。

## 验收标准

- 历史 monitor provision 数据可无损迁移为 Cycle 01。
- 同一 cycle 最多只允许两条 attempt，第三次被明确阻断。
- retryable 仅包含 `server_busy`、`temporary_network_failure`；不可重试错误第一次即停止 cycle。
- 停止后的 cycle 可通过显式 `reissue_reason` 创建 Cycle 02，attempt 从 1 开始，不覆盖 Cycle 01。
- Workflow 与 CLI 使用同一份 cycle policy 和 monitor handler。
- 目标账户完成真实只读 preflight，并输出脱敏创建计划。
- `monitor_id` 已存在时，不创建新 cycle，也不生成创建动作。
- 记录可按 `advertiser_id -> provision_id -> cycle_id -> attempt_no -> blocker/error -> module_ref/evidence_ref` 定位。
- 不执行任何真实平台写入。

## 计划验证

```bash
npm run test:monitor-bootstrap
npm run test:monitor-planned-action
npm run test:execution-plan
npm run smoke:workflow-skills
npm run check:runtime-consistency
git diff --check
```

## 当前结论

本任务的本地 schema、cycle policy、CLI 入口和 smoke 验证已落地；真实 monitor 创建仍关闭。

目标账户 `1871922414575753` 的真实只读 preflight 已调用 `accountIndex`，但乾坤返回 `403: 拒绝访问：当前ApiToken无效，请通过乾坤系统重新获取`。因此本轮无法完成账户身份、精确 monitor list 和 create plan hash 的最终只读确认。

2026-08-27 CST 按桌面需求再次重跑 `npm run monitor:plan -- --advertiser-id 1871922414575753`，结果仍为同一 `403 invalid ApiToken`。随后新建 accountIndex-only 任务，仅调用 `/tf/account_info/accountIndex`，真实只读 preflight 已成功唯一命中并回写 `qiankun_media_master_id=今日头条`；但本 monitor cycle 任务尚未重跑完整 `monitor:plan`，因此仍不直接进入创建。

当前目标账户状态：

| 维度 | 结果 |
| --- | --- |
| provision_id | `MPR-OCEANENGINE-3-BYTE-MINI-GAME-JSZC-1871922414575753` |
| cycle_id | `MPR-OCEANENGINE-3-BYTE-MINI-GAME-JSZC-1871922414575753-CYCLE-01` |
| cycle_status | `active` |
| attempt_count | `1` |
| latest_attempt | `attempt_no=1`, `error_category=server_busy`, `api_code=500` |
| attempt_policy | `server_busy_retry`, `nextAttemptNo=2`, `maximumTotalAttempts=2` |
| 上轮完整 plan blocker | `account_query_failed:403:拒绝访问：当前ApiToken无效，请通过乾坤系统重新获取` |
| accountIndex-only 最新结果 | `passed`; `accountIdentityWritten=true`; evidence `EV-MPR-OCEANENGINE-3-BYTE-MINI-GAME-JSZC-1871922414575753-ACCOUNTINDEX-PREFLIGHT` |
| create_called | `false` |

待凭据修复后重跑：

```bash
npm run monitor:plan -- --advertiser-id 1871922414575753
```

若返回 passed，再另建单次真实创建任务处理 Cycle 01 的第 2 次且最后一次 monitor 创建授权。

## 已完成

- 新增并已应用 `db/029_monitor_provision_cycles.sql`。
- 新增 `src/workflows/skills/oe3/02-monitor-cycle.mjs`。
- 扩展 `src/workflows/skills/oe3/02-monitor-provision.mjs` 支持 cycle policy、当前尝试授权摘要和 reissue plan。
- 扩展 `scripts/02-monitor-provision-cli.mjs` 与 `package.json`，新增 `monitor:plan`、`monitor:reissue-plan`、`test:monitor-cycle`。
- 新增 `scripts/02-monitor-cycle-smoke.mjs`。

## 验证结果

| 命令 | 结果 |
| --- | --- |
| `node --check src/workflows/skills/oe3/02-monitor-cycle.mjs` | passed |
| `node --check src/workflows/skills/oe3/02-monitor-provision.mjs` | passed |
| `node --check src/repositories/postgresRepository.mjs` | passed |
| `node --check scripts/02-monitor-cycle-smoke.mjs` | passed |
| `npm run test:monitor-cycle` | passed |
| `npm run test:monitor-bootstrap` | passed |
| `npm run test:monitor-planned-action` | passed |
| `npm run monitor:plan -- --advertiser-id 1871922414575753` | blocked: `account_query_failed:403:拒绝访问：当前ApiToken无效，请通过乾坤系统重新获取`; `accountIdentityWritten=false`; `createCalled=false` |
| `npm run test:execution-plan` | passed |
| `npm run smoke:workflow-skills` | passed |
| `npm run check:runtime-consistency` | passed |
| `npm run monitor:reissue-plan -- --advertiser-id 1871922414575753 --reissue-reason service_recovered` | blocked as expected: `previous_cycle_not_stopped:active` |
| `git diff --check` | passed |
| `npm run check` | 项目未定义该 script |
| `npm run validate` | 项目未定义该 script |
