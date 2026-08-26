# TASK-MWBV2-WORKFLOW-NODE-FILE-NAMING-AND-SCRIPT-CONSOLIDATION

状态：completed

更新时间：2026-08-26 CST

## 目标

按已落地的 7 节点注册表，为 v2 的节点所属 Skill 和长期 CLI 建立统一编号命名，让文件归属与运行链路更清晰。

目标运行链路：

```text
frontend/API
-> launchWorkflow
-> 00-workflow-node-registry
-> 01-07 Node Skill
-> platforms / repositories
-> Postgres
```

## 需求来源与边界

需求来源：`/Users/hys/Desktop/需求表述.md`。

该文档是需求输入，不是平台写入授权。本任务不改变业务行为，不执行 monitor 第二次重试，不执行 OceanEngine 或乾坤真实写入。

## 合理性评估

需求合理，可以推进。

依据：

- 上一轮已在本地完成唯一节点注册表，适合作为编号归属真值。
- `src/workflows/skills/oe3/` 中多数文件可按 00-07 节点归属重命名。
- `scripts/` 中长期 CLI 和 smoke 可以只更新底层文件名，保持 `package.json` 命令名兼容。
- `.DS_Store` 属于无业务作用的系统文件，适合清理。

## 范围

- 编号化 `src/workflows/skills/oe3/` 下 OE3 Skill 与跨节点模块。
- 将原 `context.mjs` 拆为 `01-intake-normalize.mjs` 与 `02-context-resolvers.mjs`。
- 编号化 `scripts/` 下长期 CLI 与 smoke 文件。
- 保持 `package.json` 命令名不变，仅更新底层脚本路径。
- 清理项目内 `.DS_Store`。
- 更新任务卡、context manifest 和 `project.state.json`。

## 非目标

- 不新增、删除或迁移 Postgres 表、字段、数据。
- 不修改 7 节点注册表中的业务名称、顺序或 Node key。
- 不修改前端页面交互。
- 不更新 HTML 逻辑图或 `AGENTS.md`。
- 不创建 monitor，不重试 monitor。
- 不执行 OceanEngine `std_project/create`。
- 不刷新 token，不修改预算或出价。
- 不保存 token、Cookie、raw request、raw response、完整 URL。

## 当前进展

- 已读取 `AGENTS.md`、`project.state.json` 和 `/Users/hys/Desktop/需求表述.md`。
- 已确认需求合理，无需额外提问。
- 已创建本任务卡和 context manifest。
- 已按编号移动 OE3 Skill 文件和 scripts 文件。
- 已拆分 `context.mjs`，Node 1 intake 归入 `01-intake-normalize.mjs`，Node 2 context resolver 归入 `02-context-resolvers.mjs`。
- 已更新 runtime import、script import 与 `package.json` 底层脚本路径。
- 已清理项目内 `.DS_Store`。
- 已确认 `package.json` 命令名保持兼容，仅底层脚本路径更新为编号文件。
- 已确认 runtime 代码与 scripts 中无旧路径 import、旧 package script 引用或重复转发壳。
- 已确认 `monitor-provision` 仍只归属 Node 2 bootstrap，未触发任何真实写入。

## 验证结果

| 命令 | 结果 |
| --- | --- |
| `npm run smoke:workflow-skills` | passed；包含 registryValidation，且 `noRealPlatformWrite=true` |
| `npm run smoke:api` | passed；API 视图仍返回 7 节点 |
| `npm run test:monitor-bootstrap` | passed；未授权 ensure 仍阻断，未泄漏 token |
| `npm run check:runtime-consistency` | passed；无参数临时 `test_run` job 自测并清理 |
| `npm run test:payload-contract` | passed |
| `node --check` 关键脚本和拆分模块 | passed |
| 旧 runtime import / 旧 package script 扫描 | passed，无命中 |
| `.DS_Store` 扫描 | passed，无命中 |
| `git diff --check` | 待最终提交前执行 |

## 验收标准

- 所有节点所属 Skill 文件以 `01-07-` 前缀清晰归属。
- 所有跨节点模块以 `00-` 前缀清晰归属。
- `src/platforms/`、`src/repositories/`、`src/server/` 保持职责命名。
- `scripts/` 中长期 CLI 与 smoke 的编号归属清晰，`package.json` 命令名保持兼容。
- 项目 runtime 内无旧路径 import、旧 package script 引用或重复转发壳。
- 项目内无 `.DS_Store`。
- `monitor-provision` 仅归属 Node 2 bootstrap，未触发任何真实写入。
- 验证命令通过：

```bash
npm run smoke:workflow-skills
npm run smoke:api
npm run test:monitor-bootstrap
npm run check:runtime-consistency
npm run test:payload-contract
git diff --check
```

当前除最终提交前 `git diff --check` 外均已通过；提交前会再次执行。
