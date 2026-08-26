# TASK-MWBV2-WORKFLOW-TRUTH-DOCUMENTATION-AND-AGENTS-FINALIZATION

状态：completed

更新时间：2026-08-26 CST

## 目标

按用户最新调整，输出一份 Markdown 真值说明文档，并同步修正 `AGENTS.md` 长期启动协议；旧 HTML 逻辑图归档，不继续作为当前结构真值入口。

目标运行链路：

```text
frontend/API
-> src/workflows/launchWorkflow.mjs
-> src/workflows/skills/oe3/00-workflow-node-registry.mjs
-> src/workflows/skills/oe3/00-runner.mjs
-> src/workflows/skills/oe3/01-07 Node Skill
-> src/platforms + src/repositories
-> Postgres marketing_workbench_v2.mwb
```

## 需求来源与边界

需求来源：`/Users/hys/Desktop/需求表述.md`。

该文档是需求输入，不是平台写入授权。本任务只改文档和任务状态，不执行 monitor 重试，不执行 OceanEngine 或乾坤真实写入，不刷新 token，不修改数据库结构。

## 合理性评估

需求合理，可以推进。

依据：

- 唯一节点注册表和 `00-07` 文件归属已经在本地完成，需要一份稳定 Markdown 给后续 Codex 迭代读取。
- `AGENTS.md` 是项目级启动协议，必须同步到当前 task 真值。
- Markdown 比 HTML 更适合后续自动更新和 diff review。
- 旧 HTML 逻辑图容易产生维护分叉，应归档保留历史。
- 稳定文档不应复制动态 monitor 失败细节。

## 范围

- 新增 `docs/工作台逻辑底层/工作流-7节点-数据真值说明_20260826.md`。
- 更新 `AGENTS.md` 的稳定文档入口、唯一运行链路、节点与文件归属规则。
- 归档旧 HTML：`.archive/工作流-7节点-数据真值逻辑图_20260825.html`。
- 更新本任务卡、context manifest 和 `project.state.json`。

## 非目标

- 不修改 `src/`、`scripts/` 运行逻辑或文件名。
- 不继续维护 HTML 逻辑图作为当前真值文档。
- 不新增 migration，不修改 Postgres 数据。
- 不删除 monitor 失败记录、launch job、evidence 或历史任务。
- 不创建 monitor，不重试 monitor。
- 不创建 OceanEngine 项目、广告、素材、DMP、事件资产。
- 不刷新 token，不修改预算或出价。
- 不把 token、Cookie、raw payload、raw response、完整触点 URL 写入文档。

## 当前进展

- 已读取 `AGENTS.md`、`project.state.json`、`/Users/hys/Desktop/需求表述.md`。
- 已确认需求合理，无需额外提问。
- 已创建本任务卡和 context manifest。
- 用户调整为以 Markdown 文档方便后续 Codex 更新迭代，并确认 `AGENTS.md` 需要按 task 修正、旧 HTML 归档。
- 已新增 `docs/工作台逻辑底层/工作流-7节点-数据真值说明_20260826.md`。
- 已更新 `AGENTS.md`。
- 已归档旧 HTML 逻辑图到 `.archive/工作流-7节点-数据真值逻辑图_20260825.html`。
- 已完成验证并关闭任务。

## 验证结果

| 命令 | 结果 |
| --- | --- |
| `npm run smoke:workflow-skills` | passed；注册表 7 节点通过，Node 4 资源数 8，`noRealPlatformWrite=true` |
| `npm run smoke:api` | passed；API smoke 返回 7 节点，使用 `test_run` |
| `npm run check:runtime-consistency` | passed；临时 `test_run` job 自测，真实动作数为 0 |
| `npm run test:payload-contract` | passed |
| `git diff --check` | passed |
| `.DS_Store` 扫描 | passed，无命中 |
| 文档敏感信息与旧结论扫描 | passed；未发现动态账号 ID、真实 token/Cookie、完整 URL、raw 请求响应或旧“双写”结论 |

## 验收标准

- Markdown 中 Skill、脚本、表名与当前项目一致。
- Markdown 简洁说明唯一节点注册表、`00/01-07` 命名规则、Node 2 bootstrap 边界。
- Markdown 不包含动态账户 ID、token、Cookie、完整 URL 或 raw 请求响应。
- `AGENTS.md` 简洁说明唯一节点注册表、`00/01-07` 命名规则、Node 2 bootstrap 边界。
- 旧 HTML 已移入 `.archive/`。
- 验证命令通过：

```bash
npm run smoke:workflow-skills
npm run smoke:api
npm run check:runtime-consistency
npm run test:payload-contract
git diff --check
```
