# TASK-MWBV2-STRUCTURE-CONSISTENCY-AND-RUNTIME-CLEANUP

状态：completed

更新时间：2026-08-24 CST

## 需求来源

用户提供 `/Users/hys/Desktop/需求表述.md` 作为新需求材料。本任务只把该文件作为需求输入解读；执行边界仍以用户当前消息、`AGENTS.md` 和 `project.state.json` 为准。

## 目标

修正 v2 项目中容易误导后续 Agent 的结构一致性问题，让前端、后端、Workflow、Postgres 记录保持一致。

本任务不处理 OceanEngine `apiCode=40000` 的平台原因，不执行任何真实平台写入，不刷新 token。

## 独立项目边界

| 类型 | 规则 |
| --- | --- |
| v2 数据库 | 只使用 `marketing_workbench_v2.mwb` |
| v2 前端 | 只使用 `marketing-workbench-v2/frontend` |
| v2 后端 | 只使用 `marketing-workbench-v2/src` |
| v2 脚本 | 只使用 `marketing-workbench-v2/scripts` |
| 旧项目 | 只能借鉴或参考部分逻辑，不作为运行依赖 |

## 范围

| 项 | 动作 |
| --- | --- |
| 项目状态 | 校验 `project.state.json` 与任务卡完成态一致 |
| readback 输出 | 失败 readback 输出改为 `readback_failed`，避免 `failed` 节点输出 `readback_verified` |
| smoke/test 隔离 | smoke/test job 和证据标记 `source_usage=test_run`，不占用真实 latest 和 P 序号 |
| 平台 appid | 删除 `mwb.games.app_id`，统一从 `mwb.game_platform_apps.app_id` 读取 |
| create executor | 明确固定目标执行器是临时 one fixed target executor，禁止重试 |
| 前端字段 | 后端提供 `summaryFields[]`，前端优先渲染 |
| 一致性检查 | 新增 `npm run check:runtime-consistency` |

## 非目标

| 项 | 状态 |
| --- | --- |
| 复盘 `apiCode=40000` 平台原因 | 不做 |
| 再次 `std_project/create` | 禁止 |
| token refresh | 禁止 |
| 素材上传 / 事件资产创建 / DMP push / 预算出价修改 | 禁止 |

## 验收

| 标准 | 状态 |
| --- | --- |
| `npm run check:runtime-consistency` 通过 | passed |
| `npm run smoke:api` 通过，新增 job 为 `source_usage=test_run` | passed |
| `npm run test:payload-contract` 通过，新增 job 为 `source_usage=test_run` | passed |
| `npm run smoke:readonly` 通过，新增 job 为 `source_usage=test_run` | passed |
| `GET /api/launch/jobs/latest` 仍返回目标失败 job | passed，返回 `JOB-MWBV2-20260824014546-851B76` |
| `mwb.games` 不存在 `app_id` 列 | passed |
| payload summary 的 `platform_app_id` 来自 `mwb.game_platform_apps.app_id` | passed |
| API/前端无 token、Cookie、完整触点 URL、raw payload、raw response 泄漏 | passed |
| 未执行任何真实平台写入 | passed |

## 完成记录

| 项 | 结果 |
| --- | --- |
| 最新业务 job | `JOB-MWBV2-20260824014546-851B76` |
| 最新业务状态 | `failed_waiting_manual_review` |
| readback 输出 | `readback_failed`，`readbackStatus=not_found_or_mismatch` |
| smoke/test job | 标记为 `source_usage=test_run`，不占用真实 latest 和 P 序号 |
| 工作台 | `http://127.0.0.1:3000/` 已保持在线 |

## 下一步 gate

进入 OceanEngine `apiCode=40000` 失败原因复盘；真实创建、重试创建、素材上传、事件资产创建、DMP 推送、预算出价修改仍禁止。
