# TASK-MWBV2-OE3-RUNTIME-UNIFICATION-AND-DMP-READONLY-GATE

状态：completed

更新时间：2026-08-24 CST

## 需求来源

用户提供 `/Users/hys/Desktop/需求表述.md` 作为本任务需求材料。附件内容只作为需求输入；当前执行边界以用户本轮消息、`AGENTS.md`、`project.state.json` 和 v2 本项目代码/数据库为准。

## 目标

将 v2 OE3 字节小游戏 3.0 标准项目创建链路统一为唯一正式运行链路：

```text
前端/API
-> launchWorkflow
-> src/workflows/skills/oe3
-> repositories / platforms
-> marketing_workbench_v2.mwb
```

同时补齐账户 `1871922175825993` 的 DMP `custom_audience_id[]` 只读 gate，使 DMP 能独立运行、独立记录、独立阻断或通过。

## 独立项目边界

| 类型 | 规则 |
| --- | --- |
| v2 数据库 | 只使用 `marketing_workbench_v2.mwb` |
| v2 前端 | 只使用 `marketing-workbench-v2/frontend` |
| v2 后端 | 只使用 `marketing-workbench-v2/src` |
| v2 脚本 | 只使用 `marketing-workbench-v2/scripts`，且只作为 CLI / smoke / check 入口 |
| v2 私密配置 | 只使用 `marketing-workbench-v2/.local` |
| 旧项目 | `/Users/hys/Projects/marketing-workbench` 只能人工参考，不允许 runtime import、shell 调用或作为数据库/API/脚本真值 |

## 范围

| 模块 | 动作 |
| --- | --- |
| Task / manifest | 新建本任务卡和 context manifest |
| Project state | 打开 active task；完成后恢复 `active_task=null` |
| Skill runner | 拆分 `src/workflows/skills/oe3/runner.mjs`，runner 只保留 DAG、依赖检查、最小重跑和汇总 |
| Skill modules | 新增 `context.mjs`、`launch-pack.mjs`、`resource-verifiers.mjs`、`dmp-readonly.mjs`、`payload-contract.mjs`、`create-once.mjs`、`readback.mjs` |
| DMP gate | `resource-verify-dmp-audience-package` 只读提取真实数字 `custom_audience_id[]`，失败时明确阻断 |
| Payload | DMP 通过时写入最终 payload manifest 的 `audience.retargeting_tags_exclude`；失败时不生成可创建状态 |
| API | `POST /api/launch/jobs/:job_id/run` 接收 `mode=dry_run|execute_once|readback_only` |
| API 收敛 | 旧 `diagnose`、`confirm`、`readback` 路由不再作为前端正式入口 |
| Frontend | 只展示开始诊断与生成草稿、刷新状态、查看诊断详情 |
| Scripts | 只保留调用正式 `src` 的 CLI、smoke、check 入口 |
| Archive | 确认归档文件无正式 import/package/API 引用，并补充归档 manifest |

## 非目标

| 项 | 状态 |
| --- | --- |
| 真实 `std_project/create` | 禁止 |
| 创建重试 | 禁止 |
| token refresh | 禁止 |
| 素材上传 | 禁止 |
| 事件资产创建 | 禁止 |
| DMP 推送 | 禁止 |
| 预算/出价修改 | 禁止 |
| 清理既有历史 `test_run` | 不做，需另开数据清理任务 |
| 依赖旧项目运行逻辑 | 禁止 |

## 验收

| 标准 | 状态 |
| --- | --- |
| 新建 task 和 context manifest | completed |
| 前端/API 到 Postgres 只有一条正式 Workflow Skill 链路 | completed |
| `dry_run` 自动执行节点 1-5，不再经过旧 placeholder confirm/readback | completed |
| `resource-verify-dmp` 可独立运行、记录、阻断 | completed |
| DMP 成功时，真实数字 `custom_audience_id[]` 可进入最终 payload manifest | completed：当前读到 10 个 ID，写入 `audience.retargeting_tags_exclude` manifest |
| DMP 失败时，唯一阻断明确为 DMP，不生成可创建草稿 | completed：失败分支输出 `dmp_custom_audience_ids_missing` / `dmp_readonly_probe_not_passed` |
| 归档文件无正式 import、package script、API route 调用 | completed |
| 两个历史失败 job 保持锁定，`platform_actions=1`、`created_objects=0` | completed |
| 无真实平台写入、无 token refresh、无敏感信息泄漏 | completed |
| `npm run smoke:workflow-skills`、`npm run test:payload-contract`、`npm run smoke:api`、`npm run check:runtime-consistency` 通过 | completed |

## 验证结果

| 命令 | 结果 |
| --- | --- |
| `node --check` changed modules/scripts | passed |
| `npm run smoke:workflow-skills` | passed |
| `npm run test:payload-contract` | passed |
| `npm run smoke:api` | passed |
| `npm run smoke:readonly` | passed，DMP `custom_audience_id` count = 10 |
| `npm run check:oe3-dmp-readonly` | passed |
| `npm run check:runtime-consistency` | passed，目标失败 job 仍 `platform_actions=1`、`created_objects=0` |
| 旧项目路径扫描 | passed，`src/`、`scripts/`、`frontend/`、`db/`、`package.json` 无旧项目绝对路径运行依赖 |
| `npm run check:runtime-test-data-purge` | skipped by task guard：该脚本仅允许 runtime test data purge 专属 active task |

## 下一步 gate

DMP gate 已通过。下一步进入平台同名查重与 fresh runtime job 创建前确认 gate；仍禁止真实创建、创建重试、token refresh 和任何平台写入，直到用户另建并确认单次真实创建任务。
