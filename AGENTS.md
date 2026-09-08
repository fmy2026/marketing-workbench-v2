# AGENTS

| 元信息 | 值 |
| --- | --- |
| 文档状态 | 当前有效；项目启动协议 |
| 最后更新时间 | 2026-09-08 CST |
| 重新校验条件 | 启动顺序、真值来源、文档职责、运行主链、权限边界或任务闭环变化时 |

定位：Codex 和协作者每次任务必须遵守的启动、真值、权限与闭环协议。本文不承担工作台说明、流程状态机、数据字典或变更记录；动态业务事实只看 Postgres。

每条长期规则只设一个权威位置，其他文档只引用。功能细节变化不默认更新本文；只有上述启动协议边界变化时才同步修改。

## 启动

1. 读取 `AGENTS.md`。
2. 读取 `project.state.json`。
3. 有 `active_task` 时，先按指针读取 Task 与 Context Manifest，再按 Manifest 的唯一 `read_order` 读取指定真值，执行 `npm run check:project -- --phase start`。检查不代替实际阅读。
4. 没有 `active_task` 时，只报告项目生命周期；可以按用户需求只读分析，批准方案后才建立新任务。需要业务下一步时查询 `mwb.workflow_case_summary`。

`docs/.开发方案/`、`.archive/` 与 `scripts/archive/` 只供历史参考或可恢复隔离，不得作为启动必读、任务依据、运行真值或 runtime 依赖；`scripts/archive/` 还禁止 package 入口和直接执行。

## 按需读取

| 场景 | 权威位置 |
| --- | --- |
| 方案方法、重要调整与人工决策 | `docs/Solution Design.md` |
| 当前流程、Node、Gate、Plan 与工作台机制 | `docs/project-现在的逻辑图.md` |
| 数据表、View、持久化与报表边界 | `docs/project-数据与报表契约.md` |
| 已验证且可复用的经验 | `docs/project-lessons.md` |
| 部署、网络、启动、凭据录入与运维 | `deploy/README.md` |
| 当前任务的范围、允许写入、验证与停止条件 | active Task / Context Manifest |

## 文档与变更路由

下表是领域路由的唯一来源，`check:project` 直接读取；路径以分号分隔，支持 `*`（单段）和 `**`（跨目录）。Manifest 按需求声明 `domains`，检查器还按允许路径和实际 Git 改动补判领域；状态文件的 guardrails 相对基线变化另触发 security。改动路由表必须同时验证校验器正反例。关联文档须进入必读，关闭前须更新或在 `documentation_updates` 说明无需更新的理由。

<!-- project-domain-routes:start -->
| 领域 | 变更路径 | 必读与回写文档 |
| --- | --- | --- |
| control | AGENTS.md;project.state.json;package.json;schemas/**;tasks/**;tasks-context-manifests/**;scripts/00-project-contract-check*.mjs | docs/Solution Design.md |
| workflow | src/workflows/**;src/agents/**;src/platforms/**;src/server/**;frontend/**;docs/project-现在的逻辑图.md | docs/project-现在的逻辑图.md |
| data | db/**;src/repositories/**;docs/project-数据与报表契约.md | docs/project-数据与报表契约.md |
| deploy | deploy/** | deploy/README.md |
| security | src/security/**;src/workflows/*Scope.mjs;src/workflows/*Grant.mjs;src/workflows/workbenchRuntimeWritePolicy.mjs;src/platforms/*CredentialStore.mjs;src/platforms/oceanengineTokenRefresh.mjs | docs/project-现在的逻辑图.md;deploy/README.md |
<!-- project-domain-routes:end -->

`AGENTS.md` 管启动与闭环；`project.state.json` 只保存项目生命周期、当前任务指针、最近关闭任务引用与全局边界。方案方法和有效决策索引归 Solution Design；流程解释归当前逻辑图；表/View/指标合同归数据与报表契约；环境配置归部署说明。任务执行细节和证据归 Task/Manifest；业务运行事实仍只读 Postgres。

早期 `docs/plan1-*`、`docs/plan2-*` 与 `schemas/postgres-minimal-truth.md` 是历史参考，只能放入 `reference_only`，不得进入当前任务必读。新任务从 `tasks/_templates/task.md` 与 `tasks-context-manifests/_templates/context-manifest.json` 建立，不复制历史任务作为模板。

## 真值

```text
项目协调与全局权限：
project.state.json
→ active Task / Context Manifest
→ 当前代码与 Schema

业务运行事实：
Postgres marketing_workbench_v2.mwb
→ 当前 Task / Context Manifest
→ 当前代码与 Schema
→ 已验证官方资料

当前业务下一步：
mwb.workflow_case_summary
→ current_gate
→ root_blocker_codes（零或一个）
→ suggested_next_action
```

Markdown 只保存规则、方案、任务合同和经验；不保存动态账户、Case、Job、Plan、Node、Skill、资源或平台动作状态。发生冲突时，按对应真值链提出最小修正。

## 最小运行约束

- 3 阶段 7 Node 的唯一来源是 `src/workflows/skills/oe3/00-workflow-node-registry.mjs`。
- `mwb.workflow_case_summary` 是当前 Gate、唯一 root blocker 和下一步的只读投影；消费端不得复制、写回或自行计算。
- Intent Resolver 只理解意图和输入槽位；不得计算 Gate、选择平台动作、扩大权限或持久化 raw transcript。
- 工作台/API → 通用 Plan-bound executor 是唯一正式业务写入链；CLI 只允许 dry-run、readback、状态和明确标注的安全诊断，不得成为旁路写入入口。
- `package.json` 只保留长期公开入口；一次性、历史 Task/账户绑定或已被主链替代的脚本移入 `scripts/archive/` 并登记 `manifest.json`。live `src/`、`scripts/` 与 package 均禁止 import 或调用 archive。

## 权限与安全

- `project.state.json.guardrails` 只提供全局边界。真实平台写入还必须精确匹配当前 Job、冻结 Plan、confirmation、action grant 与调用上限，并且只能由 active Task scope 或已启用的工作台 runtime policy 之一授权。
- 工作台用户只能读取、启动、运行和确认本人账户；管理员可以管理用户和读取授权报表，但不得代操作他人账户。
- 只有 `prepare_supported=true` 的资源可生成 `ensure_resource:*`；其他缺失资源只形成 blocker。
- 每份确认 Plan 只能按冻结动作消费一次；失败或修正必须使用新 Plan、hash、confirmation 和 attempt，禁止自动重试。
- 创建或写入响应不等于 READY；只有权威只读回查通过才能写入 verified。
- 动态运行授权只写 Postgres confirmation/action/readback；开发、迁移和专项人工写入必须使用 Task/Manifest 与相应 Guardrail scope。
- 平台长数字 ID 默认按字符串保存和比较。
- 禁止在项目文件、普通日志、API 或前端保存 token、secret、Cookie、auth_code、密码、完整触点 URL、raw request、raw payload 或 raw response。

## 任务闭环

```text
卡点 / 需求
→ Solution Design
→ 人工确认关键选择
→ Task + Context Manifest
→ check:project --phase start
→ 执行 / 验证
→ 验收证据（涉及业务时引用 Postgres 证据）
→ check:project --phase before-close
→ Manifest 终态 + active_task=null + last_closed_task_ref
→ check:project --phase after-close
→ 必要时写入 project-lessons
```

重要方案批准后才能创建 Task；执行只推进当前 Task。任务关闭后，业务下一步始终重新读取 `mwb.workflow_case_summary`。只有形成真实、已验证且跨任务可复用的结论时，才更新 `docs/project-lessons.md`。

### 任务合同与校验

- Manifest 是任务状态和 `read_order` 的唯一来源。Task 不再手写 `状态：`；状态文件的 `active_task` 仅含 `id / task_ref / context_manifest_ref`。任务状态仅为 `planned / active / blocked / completed / cancelled`；开发完成与业务 Case verified 分别判断。
- Task 固定章节为目标、批准方案、范围、非目标、验收、停止条件、交付说明；验收使用唯一 `AC-01` 等编号。Manifest 的 `validation_plan` 与 `validation_results` 引用同一编号，记录实际命令/核验方法、时间、结果、摘要和可定位证据。不得以待运行命令或自述成功替代证据。
- `read_order` 前四项固定为 AGENTS、状态文件、当前 Task、当前 Manifest，其后是所需权威文件或章节。项目内使用相对路径；已验证官方资料可用绝对只读路径。历史资料只进带理由的 `reference_only`；计划新增但不存在的文件只能列入 `allowed_writes`，不能假装已读。
- `base_revision` 是开始时完整 Git HEAD；如有既存脏文件，先用 `npm run check:project -- --baseline` 获取路径及内容指纹，原样记录为 `baseline_dirty_files`。检查覆盖此基线后的提交、暂存、未暂存、未跟踪、删除及重命名；既存脏文件只有指纹未变才排除。不得用任务结束时的基线隐藏本次改动。
- `before-close` 保留当前指针，要求所有验收有证据、无未解决缺口；默认按 completed 验收，取消任务用 `--outcome cancelled` 并说明原因及未完成项。通过后将 Manifest 改为相应终态、填写 `closed_at` 并同步 `updated_at`，清空当前指针，写入最近关闭 Task 引用，再执行 `after-close`；该引用必须指向新版合同中关闭时间最新的任务。任何一步失败不得声称已完成，修正后复验。
- 临时授权在 `temporary_authorizations` 登记 `/guardrails/...` 路径及恢复值；关闭前恢复并验证。专项平台写标志必须关闭、动作授权清空；既有工作台 runtime policy 和定时 OAuth 策略不因关闭开发 Task 被禁用。
- 两份 Schema 仅约束项目协调文件；`check:project` 使用其明确支持的 JSON Schema 子集，未知关键字报错。它只检查结构、引用、变更范围与证据存在性，不执行 Manifest 中的命令，不连接数据库，不证明证据内容或业务结果真实。`validate:schemas` 保持兼容，仍是抖音授权业务合同 smoke，不是项目文档校验。
- 历史合同仅用 `npm run check:project -- --audit-history` 诊断，不改状态、不补造证据。重新启用时必须显式升级到当前 Schema；旧任务中的 blocked 不等于当前 active Task。
