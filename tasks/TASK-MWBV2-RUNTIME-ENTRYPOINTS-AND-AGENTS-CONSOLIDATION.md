# TASK-MWBV2-RUNTIME-ENTRYPOINTS-AND-AGENTS-CONSOLIDATION

状态：completed

更新时间：2026-08-24 CST

## 需求来源

用户提供 `/Users/hys/Desktop/需求表述.md` 作为需求材料，并补充要求：`marketing-workbench-v2` 的数据库、前端、后端和脚本代码必须独立，不能关联依赖旧项目 `marketing-workbench` 的运行逻辑。附件内容只作为需求输入；执行边界以用户本轮消息、`AGENTS.md`、`project.state.json` 和 v2 本项目代码为准。

## 结构化理解

本需求的主体是对上一轮 Runtime Truth / DMP gate 工作做入口与协议收敛：

| 维度 | 结论 |
| --- | --- |
| DMP runtime truth | 上一任务已完成，当前 `project.state.json` 显示 DMP gate 已 passed |
| 本任务重点 | 收敛 npm 命令、简化根 `AGENTS.md`、固化 v2 唯一正式运行链路 |
| 独立边界 | v2 runtime 不 import、不 shell 调用旧项目，不使用旧库 `marketing_workbench` |
| 权限 | 不执行真实 `std_project/create`，不刷新 token，不做平台写入 |

## 目标

1. 新建 task 和 context manifest。
2. 将 `package.json` 收敛到唯一 Workflow CLI 语义入口。
3. 移除 npm scripts 中重复、误导或真实创建相关别名。
4. 将根 `AGENTS.md` 简化为长期启动协议，并准确描述当前 Skill 架构。
5. 补充归档 manifest，说明被移除命令的替代入口。
6. 更新 `project.state.json`，关闭本任务并写明下一 gate。

## 范围

| 文件 | 动作 |
| --- | --- |
| `tasks/TASK-MWBV2-RUNTIME-ENTRYPOINTS-AND-AGENTS-CONSOLIDATION.md` | 新建 |
| `tasks-context-manifests/TASK-MWBV2-RUNTIME-ENTRYPOINTS-AND-AGENTS-CONSOLIDATION.json` | 新建 |
| `AGENTS.md` | 简化为长期启动协议 |
| `package.json` | 收敛 scripts |
| `.archive/20260824-oe3-pre-skillization/manifest.json` | 增加移除命令替代关系 |
| `project.state.json` | 更新 last closed task 和 next gate |

## 非目标

| 项 | 状态 |
| --- | --- |
| 真实 `std_project/create` | 禁止 |
| 创建重试 | 禁止 |
| token refresh | 禁止 |
| 素材上传、事件资产创建、DMP 推送 | 禁止 |
| 预算/出价修改 | 禁止 |
| 新增数据库 migration | 不需要 |
| 从旧项目复制或运行代码 | 禁止 |

## 收敛后的 npm scripts

```text
dev
start
workflow:dry-run
workflow:readback-only
workflow:execute-once-mock
smoke:workflow-skills
smoke:api
smoke:readonly
test:payload-contract
check:runtime-consistency
token:status
token:refresh
```

真实创建命令不在 `package.json` 暴露；未来如果进入真实创建，必须另建 task-specific 一次性命令并带确认变量。

## 独立项目边界

| 类型 | 规则 |
| --- | --- |
| 数据库 | 只使用 `marketing_workbench_v2.mwb` |
| 前端 | 只使用本项目 `frontend/` |
| 后端 | 只使用本项目 `src/server/`、`src/workflows/`、`src/platforms/`、`src/repositories/` |
| 脚本 | 只使用本项目 `scripts/` |
| 私密配置 | 只使用本项目 `.local/` |
| 旧项目 | 只允许人工借鉴，不允许 runtime import、shell 调用、API route、npm script 或数据库真值依赖 |

## 验收

| 标准 | 状态 |
| --- | --- |
| 新建 task 和 context manifest | completed |
| `package.json` 无重复资源命令和真实创建命令 | completed |
| 根 `AGENTS.md` 简洁并指向当前唯一运行链路 | completed |
| `.archive` 不作为正式入口，manifest 写明替代关系 | completed |
| v2 runtime 无旧项目路径依赖 | completed |
| 无真实平台写入、无 token refresh、无敏感信息泄漏 | completed |

## 下一步 gate

继续停在平台同名查重与 fresh runtime job 创建前确认 gate。仍禁止真实平台写入、创建重试、token refresh，并继续禁止 v2 运行依赖旧项目 `marketing-workbench`。
