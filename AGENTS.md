# AGENTS

定位：Codex 和协作者的项目级启动协议，也是 v2 唯一的长期文件机制说明。这里只保留稳定规则；动态状态、活动任务、上一任务和下一 gate 只看 `project.state.json`。

## 启动

1. 先读 `AGENTS.md`。
2. 再读 `project.state.json`。
3. 若 `active_task` 为对象，按其 `read_order` 读取任务卡和 context manifest。
4. 若 `active_task = null`，只报告 `project_status` 和 `next_gate`，等待用户指定新任务。

`docs/开发方案/` 仅在任务需要设计背景时按需参考；`.archive/` 仅供历史复盘，二者均不是启动必读或运行真值。

## 工作台

| 项 | 固定值 |
| --- | --- |
| 启动命令 | `npm run dev` |
| 工作台地址 | `http://127.0.0.1:3000/` |
| API 根路径 | `http://127.0.0.1:3000/api/` |
| 默认状态 | `idle`；不自动加载最后一次 job |

默认只使用上述地址。历史 job 仅允许显式 `?job_id=` 只读查看；端口冲突只能临时排障，不能改写项目入口。

## 真值与知识入口

运行事实优先级：`project.state.json`（动态状态与权限）-> Postgres `marketing_workbench_v2.mwb` -> active task / manifest -> `schemas/` 与运行代码 -> 已验证的官方资料。Markdown 只解释规则，不保存动态任务状态；冲突时按更高优先级执行并提出最小修正。

OE3 问题优先查看本机官方资料：

| 类型 | 路径 |
| --- | --- |
| 官方文档主库 | `/Users/hys/knowledge/01-个人本地知识库/01-官方文档/open.oceanengine.com-3.0` |
| 外部给定官方资料 | `/Users/hys/knowledge/01-个人本地知识库/01-官方文档/open.oceanengine.com-3.0-waibugei` |
| 乾坤当前接口参考 | `docs/.参考文档/乾坤系统/api-docs-20260827.md` |

## 运行链路与归属

```text
frontend/API
-> src/workflows/launchWorkflow.mjs
-> src/workflows/skills/oe3/00-workflow-node-registry.mjs
-> src/workflows/skills/oe3/00-runner.mjs
-> src/workflows/skills/oe3/01-07 Node Skill
-> src/platforms + src/repositories
-> Postgres marketing_workbench_v2.mwb
```

- 3 阶段 7 节点的编号、名称、阶段和输出元数据唯一来源是 `src/workflows/skills/oe3/00-workflow-node-registry.mjs`；禁止第二份节点定义数组。
- 新 OE3 Skill 先在 `00-contracts.mjs` 声明 `nodeKey`，再由注册表校验；Node 4 prepare capability 只由 `04-resource-action-registry.mjs` 登记。
- `00-` 归属跨节点编排、公共合同和共享 CLI / smoke；`01-07-` 归属对应节点；`src/platforms/`、`src/repositories/`、`src/server/` 是无编号基础设施。
- `package.json` 命令名是长期入口；`scripts/` 只放长期 CLI、smoke、check。一次性脚本完成后移入 `.archive/` 并移除入口。

| 目录 | 职责 |
| --- | --- |
| `frontend/` | 工作台页面 |
| `src/server/` | 本地 API |
| `src/workflows/` | 工作流编排与 OE3 Skill |
| `src/platforms/`、`src/repositories/` | 平台适配与 Postgres 读写 |
| `db/`、`schemas/` | migration/seed 与结构合同 |
| `tasks/`、`tasks-context-manifests/` | 单任务合同与必读上下文 |
| `.local/`、`.archive/` | 私密本机配置、历史参考 |

`.archive/` 禁止被 runtime import、API route、package script 或 shell 调用；旧项目 `/Users/hys/Projects/marketing-workbench` 只能人工借鉴，不能成为 v2 运行依赖或真值。

## 记录与权限

- Workflow 固定 3 阶段 7 节点：节点结果写 `launch_node_runs`，细粒度 Skill 结果写 `launch_skill_runs`；草稿、证据、回查和平台动作仅保存脱敏摘要、hash、状态和必要 ID。
- Node 2 monitor lifecycle 以 `monitor_provision_runs.cycle_id` 为周期真值；同一 provision 可显式 reissue 多个 cycle，每个 cycle 最多两次 attempt，停止后不自动重试。
- `executionPlan.mjs` 只为 `prepare_supported=true` 的资源生成 `ensure_resource:*`；其他未就绪资源写 `resource_prepare_unsupported:<resource_type>` blocker。
- `source_usage`：`runtime_truth` 为真实用户轮次，`test_run` 必须由 smoke/CLI 清理，`seed_source` 仅作初始化；项目名占用只写 `mwb.project_name_reservations`。
- `project.state.json.guardrails` 是当前权限边界；任务可收紧，不得自行放宽。真实平台写入必须单次、低频、可回查、带确认变量，完成后立即收回。

禁止把 token、secret、auth_code、Cookie、完整 callback/点击监测 URL、raw payload 或 raw response 写入项目文件、普通日志、API 或前端。平台长数字 ID 按字符串处理，除非平台合同明确要求且通过安全范围校验。

## 闭环

新需求先归一为 brief，明确目标、范围、非目标、权限、验收和缺口；执行只推进当前任务。关闭任务时更新任务卡、manifest 和 `project.state.json`，设 `active_task=null` 并写清下一 gate。同一任务只允许一个 `owner_agent`，协同 Agent 只补证据、风险和校验。
