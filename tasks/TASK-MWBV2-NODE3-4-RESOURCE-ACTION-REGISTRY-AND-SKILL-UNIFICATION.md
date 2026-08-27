# TASK-MWBV2-NODE3-4-RESOURCE-ACTION-REGISTRY-AND-SKILL-UNIFICATION

状态：completed

更新时间：2026-08-27 CST

## 目标

将 Node 3“游戏保底包解析”和 Node 4“账户资源准备”收口为主 Workflow 内的唯一 Skill 实现，并建立唯一资源能力注册表。

完成后，Node 3/4 每个子节点都能通过 `job_id -> skill_key -> blocker_code -> module_ref -> evidence_ref` 定位；`executionPlan.mjs` 只为当前已有自动处理 handler 的资源生成 `ensure_resource:*`。

## 需求来源与边界

需求来源：`/Users/hys/Desktop/需求表述.md` 中的 `TASK-MWBV2-NODE3-4-RESOURCE-ACTION-REGISTRY-AND-SKILL-UNIFICATION`。

需求文档是业务输入，不是平台写入授权。本任务不执行真实资源准备、上传、推送、DMP、事件、广告创建、真实 monitor retry 或 token refresh；不保存 token、Cookie、完整 URL、raw request、raw response 或 raw payload。

## 合理性评估

需求合理，可以推进。

依据：

- Node 2 monitor planned action 已接入主 Workflow，下一步自然是 Node 3/4 的资源 readiness 与计划动作收口。
- 现有 `launch_skill_runs` 已具备 `module_ref`、`blocker_codes`、`evidence_refs`，本任务可优先复用现有表，不需要新增 migration。
- 当前 `executionPlan.mjs` 会为所有未就绪资源生成 `ensure_resource:*`，确实需要改为按真实 handler 能力登记。
- 现有 Node 3/4 CLI 能力可降为薄包装，避免脚本和主 Workflow 各算一套业务逻辑。

## 范围

- 新增 Node 4 共享资源能力注册表，覆盖 `OE3_REQUIRED_RESOURCE_TYPES` 的 verify/prepare module、action、stop condition 和 evidence 要求。
- 将备用落地页 readiness 收口到 Node 3 Skill；CLI 只保留参数解析与输出。
- 将小程序实例证据检查可复用逻辑迁入 Node 4 Skill；CLI 只保留包装。
- 统一 Node 4 八类资源输出结构，明确 `prepare_capability`、`blocker_codes`、`module_ref`、`evidence_refs` 和 `next_action`。
- 修正 `executionPlan.mjs`，仅为 `prepare_supported=true` 的未就绪资源生成可执行 action；unsupported 资源写 blocker。
- 增加 mock smoke 覆盖 ready、supported、unsupported、备用落地页阻断和小程序实例阻断。
- 更新长期说明、schema 说明和项目状态。

## 非目标

- 不执行真实资源准备、上传、推送或绑定。
- 不执行真实 monitor 创建或 retry。
- 不执行真实 `std_project/create`。
- 不修改前端布局或按钮交互。
- 不新增资源数据库表。
- 不删除现有 `scripts/03-*`、`scripts/04-*`；本任务只将其降为薄包装。
- 不重构 Node 2 monitor 业务逻辑。

## 验收标准

- Node 3 备用落地页检查由主 Workflow 调用，不依赖人工先运行 CLI。
- Node 4 八项资源均有统一 `prepare_capability` 输出。
- 未实现自动准备 handler 的资源不会进入可执行 `planned_actions`。
- 已实现 handler 的资源计划动作带正确 `module_ref` 与 `idempotency_key`。
- 每个 Node 3/4 子节点可通过 `job_id -> skill_key -> blocker_code -> module_ref -> evidence_ref` 定位。
- `scripts/03-*`、`scripts/04-*` 与主 Workflow 使用同一份业务 handler。
- mock job 覆盖 `resource_ready`、`resource_prepare_supported`、`resource_prepare_unsupported`、`backup_landing_page_blocked`、`micro_app_instance_blocked`。
- 不发生真实平台写入，不生成真实资源动作记录。

## 计划验证

```bash
npm run test:execution-plan
npm run smoke:workflow-skills
npm run smoke:api
npm run test:payload-contract
npm run check:runtime-consistency
git diff --check
```

## 关键文件

| 文件 | 说明 |
| --- | --- |
| `src/workflows/skills/oe3/04-resource-action-registry.mjs` | Node 4 八项资源 verify/prepare 能力唯一注册表 |
| `src/workflows/skills/oe3/03-landing-page-readiness.mjs` | Node 3 备用落地页 readiness 统一 handler |
| `src/workflows/skills/oe3/04-micro-app-instance-readiness.mjs` | Node 4 小程序实例 readiness 统一 handler |
| `src/workflows/skills/oe3/00-runner.mjs` | planned_actions 模式调度 Node 3/4 readiness，资源结果统一归一 |
| `src/workflows/executionPlan.mjs` | 仅按 `prepare_supported=true` 生成 `ensure_resource:*` |
| `scripts/03-*`、`scripts/04-micro-app-instance-evidence-check.mjs` | 降为薄 CLI/check 包装 |
| `scripts/04-resource-action-registry-smoke.mjs` | mock 覆盖 ready/supported/unsupported/landing/micro blocker |

## 验证结果

| 命令 | 结果 |
| --- | --- |
| `node --check src/workflows/skills/oe3/04-resource-action-registry.mjs src/workflows/skills/oe3/03-landing-page-readiness.mjs src/workflows/skills/oe3/04-micro-app-instance-readiness.mjs src/workflows/skills/oe3/04-resource-verifiers.mjs src/workflows/skills/oe3/03-launch-pack.mjs src/workflows/skills/oe3/00-runner.mjs src/workflows/executionPlan.mjs scripts/03-backup-landing-page-readonly-resolve.mjs scripts/03-landing-page-source-target-readonly-inventory.mjs scripts/04-micro-app-instance-evidence-check.mjs scripts/04-resource-action-registry-smoke.mjs` | passed |
| `npm run test:resource-action-registry` | passed |
| `npm run test:execution-plan` | passed |
| `npm run smoke:workflow-skills` | passed |
| `npm run smoke:api` | passed |
| `npm run test:payload-contract` | passed |
| `npm run check:runtime-consistency` | passed |
| `npm run test:monitor-planned-action` | passed，Node 2 回归未受影响 |
| `npm run check:oe3-backup-landing-page` | passed，本机 Postgres 只读检查；真实平台写入=false |
| `npm run check:oe3-landing-page-inventory` | passed，本机 Postgres 只读检查；真实平台写入=false |
| `npm run check:oe3-instance-id-evidence` | passed，本机 Postgres 只读检查；真实平台写入=false |
| `git diff --check` | passed |

## 关闭结论

本任务已完成。Node 3 备用落地页 readiness 和 Node 4 八项资源 capability 已进入主 Workflow Skill 链路；当前只有 `video_asset` 可生成 `ensure_resource:video_asset` planned action，其余未就绪资源明确写 `resource_prepare_unsupported:<resource_type>` blocker。真实资源准备、monitor retry、`std_project/create` 和 token refresh 仍保持关闭，必须另行单次授权。

下一 gate：已支持资源的 planned action 执行器与一次 execution grant 总编排。
