# TASK-MWBV2-WORKFLOW-NODE-REGISTRY-UNIFICATION

状态：completed

更新时间：2026-08-26 CST

## 目标

建立 v2 工作台唯一的 3 阶段 7 节点注册表，消除 `launchWorkflow.mjs` 与 `runner.mjs` 各自维护节点元数据的双写问题。

## 需求来源与边界

需求来源：`/Users/hys/Desktop/需求表述.md`。

该文档是需求输入，不是平台写入授权。本任务只做运行节点元数据和代码引用收口，不执行任何 OceanEngine 或乾坤真实写入。

## 合理性评估

需求合理，可以直接推进。

依据：

- 当前确实存在 `WORKFLOW_NODES` 与 `NODE_DEFINITIONS` 两份 7 节点定义。
- Skill 合同已有 `OE3_SKILL_DEFINITIONS` 和 `OE3_REQUIRED_RESOURCE_TYPES`，适合做一致性校验真值。
- 本任务为本地结构整理，不触碰平台写入 gate。

## 范围

- 新增唯一节点注册表：`src/workflows/skills/oe3/00-workflow-node-registry.mjs`。
- `src/workflows/launchWorkflow.mjs` 与 `src/workflows/skills/oe3/00-runner.mjs` 统一读取注册表。
- 保持 `launchWorkflow.mjs` 对外 re-export `WORKFLOW_NODES`，降低调用方改动面。
- 将 Node 4 成功文案里的资源数量改为由 `OE3_REQUIRED_RESOURCE_TYPES.length` 推导。
- 在现有 `smoke:workflow-skills` 中加入节点注册表与 Skill 合同一致性校验。
- 更新本任务卡、context manifest 和 `project.state.json`。

## 非目标

- 不重命名任何现有 Skill 文件。
- 不修改 `scripts/` 文件名或 `package.json` 命令。
- 不更新 HTML 逻辑图。
- 不更新 `AGENTS.md`。
- 不新增或修改 Postgres 表、字段、migration。
- 不执行第二次 monitor 重试。
- 不执行 OceanEngine 或乾坤的任何真实写入。
- 不删除历史 job、monitor run、attempt 或 evidence。

## 当前进展

- 已读取 `AGENTS.md`、`project.state.json` 和 `/Users/hys/Desktop/需求表述.md`。
- 已确认需求合理，无需额外提问。
- 已创建任务卡和 context manifest。
- 已新增唯一节点注册表，并接入 `launchWorkflow.mjs`、`runner.mjs` 与现有 smoke 校验。
- 已确认 `npm run check:runtime-consistency` 原先无参数会要求 `--job-id`；已保持 `--job-id` 兼容，并补充无参数 `test_run` 临时 job 校验与清理。
- 已确认项目中只有 `src/workflows/skills/oe3/00-workflow-node-registry.mjs` 定义 `WORKFLOW_NODES`。
- 已移除 `runner.mjs` 本地 `NODE_DEFINITIONS`。
- 已将 Node 4 资源通过文案改为由 `OE3_REQUIRED_RESOURCE_TYPES.length` 推导。
- 已在注册表里将 `monitor-provision` 标注为 Node 2 creation-context bootstrap 能力，且不属于广告 job 自动真实创建分支。
- 已更新 `project.state.json`，本任务关闭后的下一 gate 指向“节点所属文件编号与脚本归档整理”，monitor 第二次重试仍暂停并需单独授权。

## 验证结果

| 命令 | 结果 |
| --- | --- |
| `npm run smoke:workflow-skills` | passed；包含 registryValidation，7 节点、Skill nodeKey、Node 4 资源 Skill 均一致 |
| `npm run smoke:api` | passed；前端/API 视图仍返回 7 节点 |
| `npm run test:monitor-bootstrap` | passed；未授权 ensure 仍阻断，未泄漏 token |
| `npm run check:runtime-consistency` | passed；无参数临时 `test_run` job 自测并清理 |
| `node --check scripts/00-runtime-consistency-check.mjs` | passed |
| `git diff --check` | 待最终提交前执行 |

## 验收标准

- 项目中只有 `00-workflow-node-registry.mjs` 定义 7 节点元数据数组。
- `launchWorkflow.mjs` 与 `runner.mjs` 均从注册表读取节点编号、名称、阶段和输出。
- Skill 合同中的所有 `nodeKey` 都能在注册表中找到。
- Node 1-7 都至少有一个已注册 Skill。
- Node 4 资源数量由 `OE3_REQUIRED_RESOURCE_TYPES` 推导。
- `monitor-provision` 明确归类为 Node 2 上下文 bootstrap 能力，不触发广告 job 自动真实创建。
- 验证命令通过：

```bash
npm run smoke:workflow-skills
npm run smoke:api
npm run test:monitor-bootstrap
npm run check:runtime-consistency
```

当前均已通过。
