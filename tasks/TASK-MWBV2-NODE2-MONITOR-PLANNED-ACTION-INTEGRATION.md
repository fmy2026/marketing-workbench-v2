# TASK-MWBV2-NODE2-MONITOR-PLANNED-ACTION-INTEGRATION

状态：completed

更新时间：2026-08-27 CST

## 目标

将 `ensure_monitor` 从统一 execution plan 的计划动作，接入 Node 2 主 Workflow，使缺少 `monitor_id` 的账户可以在受控 mock 模式下完成 monitor query、plan、ensure、readback，再回到 creation context 校验链路。

本任务只做代码收口、mock 执行和安全验证；不执行真实乾坤 monitor 创建或重试。

## 需求来源与边界

需求来源：`/Users/hys/Desktop/需求表述.md` 中的“第二个任务”。

需求文档是业务输入，不是平台写入授权。本任务不放宽 `project.state.json.guardrails`，不刷新 token，不保存 token、Cookie、完整触点 URL、raw request、raw response 或 raw payload。

## 合理性评估

需求合理，可以推进。

依据：

- 第一个任务已完成 `mwb.launch_execution_plans`、`planned_actions`、`plan_hash` 和 plan action scope 校验。
- 现有 `src/workflows/skills/oe3/02-monitor-provision.mjs` 已集中承载 monitor plan/ensure/readback 能力，适合接入主链，不需要新建第二套 monitor workflow。
- 通过 mock transport 测试完整分支，可以验证调度与记录闭环，同时保持真实写入关闭。

## 范围

- 补齐 Node 2 monitor Skill 合同：`monitor-query`、`monitor-plan`、`monitor-ensure`、`monitor-readback`。
- 扩展 `00-runner.mjs`，支持受控 planned-action mock 模式。
- 复用 `02-monitor-provision.mjs` 作为唯一 monitor 业务 handler；CLI 保持薄包装。
- 将 `plan_id`、`job_id`、`idempotency_key` 等计划关联写入 monitor provision run/attempt 的审计记录。
- 增加 mock smoke，验证缺 monitor、已有 monitor、未授权、server busy 最多两次和 CLI/Workflow handler 一致性。
- 更新 `project.state.json`、task、manifest 和必要的长期说明。

## 关键文件

| 文件 | 说明 |
| --- | --- |
| `src/workflows/skills/oe3/00-contracts.mjs` | 新增 Node 2 monitor Skill 合同与 moduleRef |
| `src/workflows/skills/oe3/02-monitor-provision.mjs` | 统一 monitor workflow handler、mock 注入、plan/job/idempotency 关联 |
| `src/workflows/skills/oe3/00-runner.mjs` | 新增 `planned_actions` 模式并调度 monitor query/plan/ensure/readback |
| `src/workflows/skills/oe3/00-result-mapping.mjs` | `planned_actions` job 状态收口到 Node 2 |
| `src/workflows/launchWorkflow.mjs` | 透传 planned-action mock 参数 |
| `src/repositories/postgresRepository.mjs` | monitor attempt/run 计划关联、空 monitor 读取、synthetic smoke 清理 |
| `db/028_add_monitor_attempt_idempotency.sql` | 新增 monitor attempt 幂等键 |
| `scripts/02-monitor-planned-action-workflow-smoke.mjs` | Node 2 planned-action mock smoke |
| `AGENTS.md`、`docs/工作台逻辑底层/*`、`schemas/postgres-minimal-truth.md` | 更新长期边界与结构说明 |

## 非目标

- 不执行真实 monitor 创建或 retry。
- 不接入 Node 3 落地页自动准备。
- 不接入 Node 4 头像、DMP、事件、视频、产品图等自动准备。
- 不改工作台前端按钮行为。
- 不执行 `std_project/create`。
- 不刷新或修改 `.local` 凭据。
- 不新增 Postgres 表；仅在现有字段不足时做最小字段补齐。

## 验收标准

- 缺少 monitor 的 mock job 可依次完成 `monitor-query -> monitor-plan -> monitor-ensure -> monitor-readback -> context-resolve-account -> context-resolve-touchpoint -> context-resolve-platform-app`。
- 已有 monitor 的 mock job 不产生 `ensure_monitor` 创建调用。
- 未授权 `ensure_monitor` 时，主链返回 `planned_action_not_allowed:ensure_monitor` 且不调用创建 transport。
- mock server busy 场景最多两次尝试，绝不出现第三次。
- monitor 成功后，`advertiser_accounts`、`account_touchpoints`、`monitor_provision_runs` 与 Node 2 输出一致。
- Workflow 与 CLI 使用同一 handler，并对相同 mock 输入产生相同 blocker。
- 每个 Node 2 Skill 可通过 `job_id -> skill_key -> module_ref -> blocker_code / evidence_ref` 定位源码。
- 验证通过：

```bash
npm run test:execution-plan
npm run test:monitor-bootstrap
npm run smoke:workflow-skills
npm run smoke:api
npm run check:runtime-consistency
git diff --check
```

## 验证结果

| 命令 | 结果 |
| --- | --- |
| `node --check src/workflows/skills/oe3/02-monitor-provision.mjs src/workflows/skills/oe3/00-runner.mjs src/workflows/skills/oe3/00-result-mapping.mjs src/workflows/launchWorkflow.mjs src/repositories/postgresRepository.mjs scripts/02-monitor-planned-action-workflow-smoke.mjs` | passed |
| `psql -X -d marketing_workbench_v2 -v ON_ERROR_STOP=1 -f db/028_add_monitor_attempt_idempotency.sql` | passed，重复执行 passed |
| `npm run test:monitor-planned-action` | passed |
| `npm run test:execution-plan` | passed |
| `npm run test:monitor-bootstrap` | passed |
| `npm run smoke:workflow-skills` | passed |
| `npm run smoke:api` | passed |
| `npm run check:runtime-consistency` | passed |
| `git diff --check` | passed |

DB 清理核对：synthetic `899...` 测试账户、job、monitor run、attempt 均为 0。

敏感值核对：未发现实际 token、Cookie、完整触点 URL、raw request、raw response 或 raw payload；扫描只命中 `00-contracts.mjs` 的敏感检测正则。

## 关闭结论

第二个任务已完成。`ensure_monitor` 已在 Node 2 主 Workflow 的 `planned_actions` mock 模式下可调度、可审计、可定位；真实乾坤 monitor 创建/重试仍保持关闭，必须另行单次授权。下一 gate 建议推进 Node 3-4 planned action 自动准备 Skill 接入。
