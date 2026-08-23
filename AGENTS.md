# AGENTS

定位：Codex 和协作者的项目级启动协议。这里只放长期默认规则、安全底线和任务闭环；动态状态、活动任务、上一关闭任务和下一步只以 `project.state.json` 为准。

## 启动顺序

| 步骤 | 动作 |
| --- | --- |
| 1 | 先读 `AGENTS.md` |
| 2 | 再读 `project.state.json` |
| 3 | 当 `active_task` 为对象时，按 `project.state.json.active_task.read_order` 继续读取 |
| 4 | 当 `active_task = null` 时，只报告 `project_status` 和 `next_gate`，等待用户指定新任务 |

`active_task.read_order` 是活动任务的有序必读清单。第一版任务上下文清单放在 `tasks-context-manifests/`；新任务启动后，应由任务卡和 context manifest 明确必读文件，避免把临时上下文写进长期规则。

稳定文档发现优先看 `docs/方案-新项目最高效启动框架_20260823.md`；投放创建 Agent 方案优先看 `docs/方案-投放创建Agent开发方案_20260823.md`。Markdown 稳定文档只解释规则，不保存动态任务指令。

## 真值优先级

| 问题 | 权威入口 |
| --- | --- |
| 项目状态、活动任务、上一关闭任务、下一 gate | `project.state.json` |
| 活动任务合同 | `project.state.json.active_task.task_ref` |
| 活动任务上下文 | `project.state.json.active_task.context_manifest_ref` |
| 必读顺序 | `project.state.json.active_task.read_order` |
| 新项目启动框架 | `docs/方案-新项目最高效启动框架_20260823.md` |
| 投放创建 Agent 方案 | `docs/方案-投放创建Agent开发方案_20260823.md` |
| 前端页面效果参考 | `docs/方案-前端页面效果_html_20260823.html` |
| 任务卡 | `tasks/` |
| 任务上下文清单 | `tasks-context-manifests/` |
| 前端外壳 | `frontend/` |
| 本地 API 服务 | `src/server/` |
| Agent 主控入口 | `src/agents/` |
| Workflow 编排 | `src/workflows/` |
| 数据读写封装 | `src/repositories/` |
| 平台适配位置 | `src/platforms/` |
| 数据库 migration 和 seed | `db/` |
| API、Workflow、草稿和证据结构 | `schemas/` |
| 本地开发、seed、smoke、诊断脚本 | `scripts/` |
| 本机私密配置 | `.local/`，不得进入版本管理或普通日志 |
| 旧项目经验参考 | `/Users/hys/Projects/marketing-workbench` 只作人工参考，不作为本项目运行真值 |

JSON、schema、数据库记录和真实回查证据优先于 Markdown 说明。发现冲突时，先按权威入口执行，再提出最小修正方案。

## 执行红线

| 类型 | 规则 |
| --- | --- |
| 当前任务 | 只推进 `active_task` 指定的唯一目标；`active_task = null` 时不得继承 `last_closed_task_ref` 或旧项目任务继续执行 |
| 权限 | `project.state.json.guardrails` 是当前权限边界；任务可以收紧，不能自行放宽 |
| 第一版边界 | 默认只做协作骨架、前端外壳、Postgres 最小真值和 Workflow 闭环；真实平台写入后置 |
| 人工确认 | 真实平台写入、预算 / 出价、凭据、安全边界、架构路线、长期规则入库、Agent / Skill 机制变更，必须先给方案并等用户拍板 |
| 平台写入 | 默认禁止；未来如获授权，必须单次、低频、可回查，并带确认变量；执行后收回写权限 |
| 私密信息 | token、secret、auth_code、Cookie、完整 callback URL、完整点击监测地址不得进入项目文件、日志或回复 |
| 数据沉淀 | 未成熟归因、当天实时数据、未校验素材数据不能写成长期经验 |
| 平台 ID | 长数字 ID 一律按字符串处理，不转成 JavaScript number |
| 旧项目依赖 | 可以参考旧项目经验、脚本和文档；不能让 v2 运行时直接依赖旧项目路径 |

## Agent / Skill 边界

| 对象 | 只放什么 |
| --- | --- |
| 根 `AGENTS.md` | 项目级启动协议、真值优先级、安全红线、任务闭环 |
| 子目录 `AGENTS.md` | 该目录特殊规则；只能补充或收紧根规则，不保存动态状态 |
| `tasks/` | 单个开发任务合同 |
| `tasks-context-manifests/` | 单个任务必读上下文、参考资料和排除项 |
| `src/agents/` | Agent 主控入口；第一版只放投放创建 Agent |
| `src/workflows/` | 3 阶段 7 节点 Workflow 编排 |
| `src/platforms/` | 平台 adapter；第一版只放 OceanEngine 占位和只读能力 |
| `schemas/` | API、Workflow、草稿、证据结构 |

同一任务只能有一个 `owner_agent`。协同 Agent 只补证据、风险和校验，不改变任务方向。

## 任务闭环

| 阶段 | 要求 |
| --- | --- |
| 需求归一 | 用户输入可能口语化；执行前先转成结构化任务 brief，明确目标、范围、非目标、权限、验收、缺口和建议推进方式。低风险清晰需求可继续执行，高风险、跨任务或不清楚时先让用户拍板。 |
| 读状态 | 确认 `project_status`、`active_task`、guardrails、目标和验收标准 |
| 装上下文 | 先读 `active_task.read_order`；无活动任务时只读 `project.state.json` 和必要稳定文档 |
| 执行 | 只做当前目标，不顺手扩范围 |
| 验证 | 优先使用项目内 `package.json`、`scripts/`、`docs/` 中声明的验证命令；没有命令时做最小静态校验 |
| 写回 | 只更新真实变化的任务状态、context manifest、records 或文档；任务关闭后将 `active_task` 置为 `null` 并写明 `next_gate` |
| 沉淀 | 只有已验证、可复用、会影响后续判断的经验才写入长期经验 |

## 交付回复

每次交付只说明：做了什么、关键文件、验证结果、未验证项或风险、下一步。
