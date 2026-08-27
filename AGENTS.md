# AGENTS

定位：Codex 和协作者的项目级启动协议。这里只放长期默认规则；动态状态、活动任务、上一任务和下一 gate 只看 `project.state.json`。

## 启动
1. 先读 `AGENTS.md`。
2. 再读 `project.state.json`。
3. 若 `active_task` 为对象，按其中 `read_order` 继续读取任务卡和 context manifest。
4. 若 `active_task = null`，只报告 `project_status` 和 `next_gate`，等待用户指定新任务。
稳定文档优先看 `docs/开发方案/plan1-新项目最高效启动框架_20260823.md`、`docs/开发方案/方案-投放创建Agent开发方案_20260823.md` 和 `docs/工作台逻辑底层/工作流-7节点-数据真值说明_20260826.md`；Markdown 只解释规则，不保存动态任务状态。

## 工作台
| 项 | 固定值 |
| --- | --- |
| 启动命令 | `npm run dev` |
| 工作台地址 | `http://127.0.0.1:3000/` |
| API 根路径 | `http://127.0.0.1:3000/api/` |
| 默认状态 | `idle`；不自动加载最后一次 job |
默认只使用上述地址。端口冲突只能临时排障，不能把其他地址写成项目入口。历史 job 只允许显式 `?job_id=` 只读查看，后续列表界面另建任务。

## 真值
优先级：`project.state.json` -> Postgres `marketing_workbench_v2.mwb` -> active task / manifest -> `schemas/` -> 稳定 docs。
JSON、schema、数据库记录和真实回查证据优先于 Markdown 说明。发现冲突时，先按权威入口执行，再提出最小修正。

## OE3 官方知识入口

巨量营销 3.0 / OceanEngine 3.0 相关问题，优先查看本机官方知识文档：

| 类型 | 路径 |
| --- | --- |
| 官方文档主库 | `/Users/hys/knowledge/01-个人本地知识库/01-官方文档/open.oceanengine.com-3.0` |
| 外部给定官方资料 | `/Users/hys/knowledge/01-个人本地知识库/01-官方文档/open.oceanengine.com-3.0-waibugei` |

这些文档只作为 OE3 官方知识参考；项目运行真值仍按 `project.state.json`、Postgres `marketing_workbench_v2.mwb`、active task / manifest 和 `schemas/` 的优先级执行。

## 唯一运行链路
```text
frontend/API
-> src/workflows/launchWorkflow.mjs
-> src/workflows/skills/oe3/00-workflow-node-registry.mjs
-> src/workflows/skills/oe3/00-runner.mjs
-> src/workflows/skills/oe3/01-07 Node Skill
-> src/platforms + src/repositories
-> Postgres marketing_workbench_v2.mwb
```
`.archive/` 只作历史参考，禁止 runtime import、API route、package script 或 shell 调用。旧项目 `/Users/hys/Projects/marketing-workbench` 只能人工借鉴，不得作为 v2 运行依赖、数据库真值或脚本入口。

## 节点与文件归属
3 阶段 7 节点的编号、名称、阶段和输出元数据唯一来源是 `src/workflows/skills/oe3/00-workflow-node-registry.mjs`，禁止新增第二份节点定义数组。

| 前缀 | 归属 |
| --- | --- |
| `00-` | 跨节点编排、公共合同、共享 CLI / smoke |
| `01-07-` | 对应 7 节点所属 Skill 或专项脚本 |
| 无编号基础设施 | `src/platforms/`、`src/repositories/`、`src/server/`，按职责命名 |

新 OE3 Skill 必须先在 `00-contracts.mjs` 声明 `nodeKey`，再由 `00-workflow-node-registry.mjs` 校验归属。新 CLI / smoke 先判断属于 `00` 还是 `01-07`，不得新增无归属长期脚本。`package.json` 命令名是长期入口；底层脚本可以编号迁移，但不得随意改变命令名。Node 2 monitor bootstrap 可以在 `planned_actions` mock 模式接入主链；真实乾坤 monitor 写入与广告项目创建仍是权限不同的链路，必须另行单次授权。

## 目录职责
| 目录 | 职责 |
| --- | --- |
| `frontend/` | 工作台页面 |
| `src/server/` | 本地 API |
| `src/workflows/` | 3 阶段 7 节点编排 |
| `src/workflows/skills/oe3/` | OE3 业务 Skill、唯一节点注册表和 `00-07` 节点归属实现 |
| `src/platforms/` | OceanEngine transport、凭据状态、只读 client、单次创建 executor |
| `src/repositories/` | Postgres 读写封装 |
| `scripts/` | 长期可复用 CLI、smoke、check；一次性任务脚本完成后必须归档 |
| `db/` | migration 和 seed |
| `schemas/` | API、Workflow、草稿和证据结构 |
| `tasks/` | 单任务合同 |
| `tasks-context-manifests/` | 单任务必读上下文 |
| `.local/` | 本机私密配置，禁止入 Git 和普通日志 |
| `.archive/` | 已完成专项任务脚本、废弃实现和历史参考；禁止 runtime import、package script 或 API 调用 |

## 记录规则
Workflow 固定为 3 阶段 7 节点。节点结果写入 `launch_node_runs`；细粒度 Skill 结果写入 `launch_skill_runs`；草稿、证据、回查和平台动作只写脱敏摘要、hash、状态和必要 ID。
`source_usage` 规则：`runtime_truth` 是真实用户轮次；`test_run` 是临时测试，必须由 smoke/CLI 清理且不影响真实项目名占用；`seed_source` 是初始化基准，不得当运行真值。项目名占用只写 `mwb.project_name_reservations`，不能由最后 job 或 source record 魔法值推断。

## 红线
- `project.state.json.guardrails` 是当前权限边界；任务可以收紧，不能自行放宽。
- 默认禁止真实平台写入、创建重试、素材上传、事件资产创建、DMP 推送、预算/出价修改和 token refresh。
- 未来若允许真实写入，必须是单次、低频、可回查、带确认变量；完成后收回写权限。
- 工作台点击 `开始执行` 与 CLI `MWBV2_OE_EXECUTION_CONFIRM=EXECUTE_ONE_LAUNCH npm run launch:execute-once -- --job-id ...` 必须进入同一个单次 execution grant 服务；授权只对当前 job、当前 draft、当前 payload hash 生效，不改变全局 guardrail。
- token、secret、auth_code、Cookie、完整 callback URL、完整点击监测 URL、raw payload、raw response 禁止进入项目文件、普通日志、API 或前端。
- 平台长数字 ID 按字符串处理；只有平台合同明确要求 number 时，才可先校验安全范围再转换。
- 同一任务只能有一个 `owner_agent`；协同 Agent 只补证据、风险和校验。

## 闭环
新需求先归一为 brief，明确目标、范围、非目标、权限、验收和缺口。执行只推进当前任务，不顺手扩范围；验证优先使用 `package.json` 和 `scripts/` 声明命令。关闭任务时更新任务卡、manifest 和 `project.state.json`，将 `active_task` 置为 `null` 并写明下一 gate。
专项任务中新增的一次性脚本，任务关闭后如果不再属于长期 CLI / smoke / check，必须移动到 `.archive/` 并从 `package.json` 移除入口；保留原因写入 archive manifest 或任务卡。
交付只说明：做了什么、关键文件、验证结果、未验证项或风险、下一步。
