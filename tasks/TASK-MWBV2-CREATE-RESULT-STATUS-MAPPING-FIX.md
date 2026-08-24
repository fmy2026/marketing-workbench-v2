# TASK-MWBV2-CREATE-RESULT-STATUS-MAPPING-FIX

状态：completed

更新时间：2026-08-24 CST

## 需求来源

用户提供 `/Users/hys/Desktop/需求表述.md`。附件内容只作为本轮需求输入；执行边界以用户本轮消息、`AGENTS.md`、`project.state.json`、v2 代码和 v2 Postgres 为准。

## 结构化理解

本任务修正真实 `std_project/create` 与 readback 结果在 Workflow 聚合层被覆盖的问题。任务只做状态映射、写入责任收敛、API 摘要修正和无写入测试，不执行真实平台写入。

## 目标

1. 第 6 节点按真实 create Skill 结果映射为 `locked`、`blocked`、`passed`、`failed`。
2. 第 7 节点按真实 readback Skill 结果映射为 `waiting`、`locked`、`passed`、`repairable`/`blocked`。
3. `launch_jobs.job_status` 由 runner 统一根据最终 Skill 结果更新。
4. `confirmCreate.createCalled` 与 `summary.noRealPlatformWrite` 由实际 Skill 输出推导。
5. executor 只负责平台调用、平台动作、确认记录、对象记录、回查记录和证据摘要，不直接覆盖节点/job。
6. 新增不调用平台、不写 runtime truth 的真实结果映射测试。
7. 更新 runtime consistency 检查，覆盖最新 runtime dry-run 链路。

## 非目标

| 项 | 状态 |
| --- | --- |
| 真实 `std_project/create` | 禁止 |
| token refresh | 禁止 |
| 创建重试 | 禁止 |
| 素材、DMP、事件、品牌、预算、出价修改 | 禁止 |
| 新增第二套 executor 或 Workflow | 禁止 |
| 修改前端视觉设计 | 禁止 |
| 依赖旧项目运行逻辑 | 禁止 |

## 验收

| 标准 | 状态 |
| --- | --- |
| task 与 context manifest 已建立 | completed |
| 真实成功不再被聚合为 `locked` | completed |
| 节点、Skill、job、平台动作、API 摘要状态一致 | completed |
| 无写权限 confirm-create 仍为 `blocked_before_create` 且无平台动作 | completed |
| 新增真实结果映射测试通过 | completed |
| `smoke` 与一致性验证通过 | completed |
| 无 token、Cookie、完整触点 URL、raw payload、raw response 泄漏 | completed |

## 结果摘要

| 项 | 结果 |
| --- | --- |
| 第 6 节点 | 使用 `createNodeStatusFromSkill` 统一映射：`locked`、`blocked`、`passed`、`failed` |
| 第 7 节点 | 使用 `readbackNodeStatusFromSkill` 统一映射：`waiting`、`locked`、`passed`、`repairable`、`failed` |
| job 状态 | runner 统一写入：`draft_ready`、`failed_waiting_manual_review`、`created_pending_readback`、`created` |
| executor 写入责任 | 保留平台动作、确认记录、对象记录、回查记录、证据摘要；不再直接写节点/job |
| API | `confirmCreate.createCalled` 由 `create-once` Skill 摘要推导 |
| summary | `noRealPlatformWrite` 由实际 create Skill 输出推导 |

## 验证

| 命令 | 结果 |
| --- | --- |
| `npm run test:create-result-mapping` | passed |
| `npm run smoke:workflow-skills` | passed |
| `npm run smoke:api` | passed |
| `npm run smoke:readonly` | passed |
| `npm run test:payload-contract` | passed |
| `npm run check:runtime-consistency` | passed |
| `node scripts/confirm-create-preflight-smoke.mjs` | passed，无平台动作、无 created object |
| static scan | passed，无旧项目运行依赖；敏感扫描仅命中空 env 模板字段名 |

## 下一步 gate

完成后仍保持无平台写入。下一步若要真实创建，必须另建单次真实 `std_project/create` 确认任务，并显式打开写入 gate 与确认变量。
