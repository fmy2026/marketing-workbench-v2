# TASK-MWBV2-READONLY-RECONCILIATION-FRESH-RUNTIME-DRY-RUN

状态：completed

更新时间：2026-08-24 CST

## 需求来源

用户提供 `/Users/hys/Desktop/需求表述.md`。附件内容只作为需求输入；执行边界以用户本轮消息、`AGENTS.md`、`project.state.json` 和 v2 本项目代码/数据库为准。

## 结构化理解

本任务目标是在 v2 唯一正式链路下创建一条全新的 `runtime_truth` dry-run：

```text
frontend/API
-> launchWorkflow
-> src/workflows/skills/oe3
-> platforms/repositories
-> marketing_workbench_v2.mwb
```

只允许真实平台只读校验；禁止 `std_project/create`、创建重试、token refresh、素材/事件/DMP/品牌/头像/产品图写入、预算或出价修改。

## 目标

1. 新建 task 和 context manifest。
2. 修正 DMP 真值：`runtime_truth` 轮次必须有真实只读 audience ID 证据才可 passed。
3. 新增 `duplicate-readonly` Skill，使用 `std_project/list` 做本轮草稿真实只读查重。
4. 将 `duplicate-check` 接入第 5 节点。
5. 使用正式 `workflow:dry-run` 创建 fresh `runtime_truth` job，并跑到创建前 gate。
6. 清理历史 `source_usage='test_run'` 数据。
7. 输出 fresh job 的 7 节点状态、Skill 记录、阻断原因和下一 gate。

## 允许的真实平台只读范围

| endpoint | 用途 |
| --- | --- |
| `dmp/custom_audience/select` | DMP audience ID 只读 |
| `/open_api/v3.0/std_project/list/` | 标准项目同名查重 |
| 既有 readonly API | 账户、素材、事件、品牌等现有只读校验 |

## 禁止动作

| 动作 | 状态 |
| --- | --- |
| `std_project/create` | 禁止 |
| 素材上传 | 禁止 |
| DMP 创建或推送 | 禁止 |
| 头像、事件、品牌、产品图写入 | 禁止 |
| token refresh | 禁止 |
| 历史失败 job retry | 禁止 |
| 使用旧项目作为 v2 runtime 依赖 | 禁止 |

## 独立项目边界

| 类型 | 规则 |
| --- | --- |
| 数据库 | 只使用 `marketing_workbench_v2.mwb` |
| 前端 | 只使用本项目 `frontend/` |
| 后端 | 只使用本项目 `src/` |
| 脚本 | 只使用本项目 `scripts/` |
| 私密配置 | 只使用本项目 `.local/` |
| 旧项目 | 不 import、不 shell 调用、不作为数据库/API/脚本真值 |

## 验收

| 标准 | 状态 |
| --- | --- |
| 新建 task 和 context manifest | completed |
| DMP `runtime_truth` 轮次真实只读校验通过或明确阻断 | completed：`custom_audience_id` count = 10，来源 `oceanengine_readonly_probe` |
| `duplicate-readonly` Skill 接入第 5 节点 | completed：`std_project/list` 返回 `platform_not_duplicate` |
| fresh `runtime_truth` job 有 7 个 `launch_node_runs` | completed：`JOB-MWBV2-20260824092327-494BF1` |
| fresh job 有 `launch_skill_runs` | completed：18 条 |
| 第 6 节点 `locked`，未调用 `std_project/create` | completed：`platform_actions=0`、`created_objects=0` |
| 第 7 节点 dry-run 下 `not_applicable` 或 waiting，不伪造成功 | completed：`readback_records.readback_status=not_applicable` |
| 历史 `test_run` 清理为 0 | completed：`test_run_jobs=0`、`test_run_skill_runs=0` |
| 无 token、完整触点 URL、raw payload、raw response 泄漏 | completed |

## 结果摘要

| 项 | 结果 |
| --- | --- |
| fresh job | `JOB-MWBV2-20260824092327-494BF1` |
| source_usage | `runtime_truth` |
| project_name | `245791_N_JSZC_HUNT_PAY7DROI_平台定向不限_P03_20260824` |
| payload_hash | `sha256:152babf25efa31d4aa526d17a5dd7379f687dc8a069e5e93bf51eb38aa73a2f4` |
| DMP | `passed`，10 个 audience ID 已写入 payload manifest |
| duplicate check | `platform_not_duplicate` |
| create readiness | `ready_for_user_create_confirmation` |
| create/readback | 未创建；dry-run readback 为 `not_applicable` |

## 验证

| 命令 | 结果 |
| --- | --- |
| `npm run workflow:dry-run` | passed |
| `node scripts/runtime-test-data-purge.mjs` | passed，删除 27 条 `test_run` job |
| `npm run smoke:workflow-skills` | passed |
| `npm run smoke:api` | passed |
| `npm run smoke:readonly` | passed |
| `npm run test:payload-contract` | passed |
| `npm run check:runtime-consistency` | passed |
| Postgres test_run 查询 | passed：`test_run_jobs=0`、`test_run_skill_runs=0` |

## 下一步 gate

完成本任务后，若 DMP 和平台同名查重均通过，下一步进入“fresh runtime job 单次真实创建确认任务”；本任务仍不执行真实创建。
