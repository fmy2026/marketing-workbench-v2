# TASK-MWBV2-WORKBENCH-MINIMAL-DYNAMIC-VIEW-AFTER-CREATE-FAILURE

状态：completed

更新时间：2026-08-24 CST

## 需求来源

用户提供 `/Users/hys/Desktop/需求表述.md` 作为新需求材料。本文件只将其作为需求输入解读；执行边界仍以用户当前消息、`AGENTS.md` 和 `project.state.json` 为准。

## 目标

把 v2 工作台前端改成“极简动态视图”，同步展示一次真实 `std_project/create` 失败后的最新状态。

本任务只做状态同步、API view model 和前端最小展示；不执行任何平台写入。

## 当前事实

| 项 | 值 |
| --- | --- |
| 固定 job | `JOB-MWBV2-20260824014546-851B76` |
| create 调用 | 已真实调用 1 次 |
| create 结果 | HTTP 200，平台 `api_code=40000`，未返回 `stdProjectId` |
| 只读 readback | `not_found_or_mismatch` |
| `created_objects` | `0` |
| 当前边界 | 禁止重试，禁止平台写入 |

## 独立项目边界

| 类型 | 规则 |
| --- | --- |
| v2 数据库 | 只使用 `marketing_workbench_v2.mwb` |
| v2 前端 | 只使用 `marketing-workbench-v2/frontend` |
| v2 后端 | 只使用 `marketing-workbench-v2/src` |
| v2 脚本 | 只使用 `marketing-workbench-v2/scripts` |
| 旧项目 | 只能借鉴视图和状态组织经验 |
| 禁止 | import 或 shell 调用旧项目脚本；读取旧库作为运行真值 |

## 范围

| 项 | 动作 |
| --- | --- |
| Postgres 状态 | 将目标 job 同步为 `failed_waiting_manual_review`，`current_node=7` |
| 后端 view model | 在 `getJobView` 返回中新增 `headline`、极简 `workflow`、`execution`、数组式 `actions` |
| 前端 | 只渲染后端返回数据，不维护业务状态 label 映射 |
| latest | `GET /api/launch/jobs/latest` 优先返回失败待复盘或有真实平台动作的 job |
| 安全 | API/前端不展示 raw payload、raw response、完整触点 URL、token、Cookie |

## 非目标

| 项 | 状态 |
| --- | --- |
| 再次 `std_project/create` | 禁止 |
| 真实平台写入 | 禁止 |
| token refresh | 禁止 |
| Workflow 重构 | 不做 |
| 大段解释型前端 | 不做 |
| 旧项目运行依赖 | 禁止 |

## 极简 View Model

后端返回并由前端直接渲染：

```js
{
  headline: { title, status, statusLabel, nextAction },
  intake: { routeId, gameCode, advertiserId },
  workflow: [{ phase, nodes: [{ number, name, status, statusLabel }] }],
  draft: { projectName, payloadHash, duplicateStatus },
  execution: { status, statusLabel, apiCode, objectIdPresent, readbackStatus, retryAllowed },
  actions: [{ key, label, enabled, dangerous }]
}
```

## 验收

| 标准 | 状态 |
| --- | --- |
| 目标 job 状态同步为 `failed_waiting_manual_review` / `current_node=7` | passed |
| latest 默认返回目标失败 job，不被 smoke 新 job 覆盖 | passed |
| 后端返回极简 view model | passed |
| 前端不再维护业务状态 label 映射 | passed |
| 前端不展示 placeholder 回查对象 | passed |
| `npm run smoke:api` 通过 | passed |
| API 脱敏检查通过 | passed |
| 未执行任何平台写入 | active guardrail |

## 完成结果

| 项 | 结果 |
| --- | --- |
| Postgres job 状态 | `failed_waiting_manual_review`，`current_node=7` |
| latest API | 返回 `JOB-MWBV2-20260824014546-851B76` |
| 极简 view model | 已返回 `headline`、`workflow`、`draft`、`execution`、数组式 `actions` |
| 前端按钮 | 由后端 `actions[]` 驱动 |
| 执行状态 | `failed_or_unconfirmed`，`apiCode=40000`，`retryAllowed=false` |
| 只读回查 | `not_found_or_mismatch` |
| 真实对象 | `created_objects=0` |

## 验证结果

| 命令 / 检查 | 结果 |
| --- | --- |
| `node --check src/repositories/postgresRepository.mjs` | passed |
| `node --check src/workflows/launchWorkflow.mjs` | passed |
| `node --check frontend/app.js` | passed |
| `npm run smoke:api` | passed |
| `GET /api/launch/jobs/latest` | `JOB-MWBV2-20260824014546-851B76` |
| `GET /api/launch/jobs/JOB-MWBV2-20260824014546-851B76` | 返回极简失败态 |
| 敏感模式扫描 | passed |

## 下一步

进入 create 失败原因复盘任务：排查平台 `apiCode=40000`，或用平台后台/只读列表再次核对项目名是否存在；禁止重试真实创建。
