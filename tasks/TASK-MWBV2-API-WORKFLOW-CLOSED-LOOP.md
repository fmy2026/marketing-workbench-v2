# TASK-MWBV2-API-WORKFLOW-CLOSED-LOOP

状态：completed

更新时间：2026-08-23 CST

## 目标

实现阶段 3：把当前静态前端从 mock 数据切换为后端 API + Postgres 读写，跑通 `Intake -> 创建 job -> 7 节点 -> 诊断 -> 草稿 -> 确认占位 -> 回查占位`。

## 范围

| 类型 | 内容 |
| --- | --- |
| 目标库 | `marketing_workbench_v2` |
| schema | `mwb` |
| 目标 | 本地 API 服务、Postgres repository、7 节点 Workflow、前端 API 数据源 |
| 允许写入 | `launch_jobs`、`launch_node_runs`、`launch_drafts`、`readback_records`、`evidence_artifacts` |
| 非目标 | 不接真实平台、不做真实创建、不刷新凭据、不触碰旧库 `marketing_workbench` |

## API 合同

| 接口 | 用途 |
| --- | --- |
| `POST /api/launch/intake` | 解析 `route_id`、`game_code`、`advertiser_id` |
| `POST /api/launch/jobs` | 创建 `launch_job` 并初始化 7 个节点 |
| `GET /api/launch/jobs/:job_id` | 返回页面所需 job、节点、诊断、草稿、回查摘要 |
| `POST /api/launch/jobs/:job_id/diagnose` | 运行诊断并更新节点状态 |
| `POST /api/launch/jobs/:job_id/run` | 执行 7 节点后端闭环 |
| `POST /api/launch/jobs/:job_id/confirm` | 只写入确认占位，不触发真实平台 |
| `POST /api/launch/jobs/:job_id/readback` | 只写入回查占位或读取本地 seed，不调用真实平台 |

## Workflow 节点

1. `launch_intake`
2. `creation_context`
3. `game_launch_pack`
4. `account_resource_prepare`
5. `std_project_draft_builder`
6. `std_project_create_executor`
7. `readback_closer`

## 安全边界

- 统一使用 `game_code`，不使用 `game_slug` 作为 v2 运行字段。
- 新项目必须实现独立的 `std_project_name_builder`。
- `readback_records.object_name` 必须来自 `launch_drafts.project_name`。
- 不写入 token、Cookie、secret、完整触点 URL、raw payload、raw response。
- 旧项目 `/Users/hys/Projects/marketing-workbench` 只读参考，不作为 v2 运行时真值。

## 验收

| 标准 | 结果 |
| --- | --- |
| `npm run dev` 能启动本地服务并访问前端页面 | passed |
| 页面数据来自 `/api/launch/jobs/:job_id` | passed |
| 用户输入后能创建新的 `launch_job` | passed |
| 数据库中能看到对应 7 个 `launch_node_runs` | passed |
| 运行 diagnose/run 后节点状态能更新 | passed |
| 能生成 `launch_drafts.project_name` 和稳定 `payload_hash` | passed |
| confirm 只写入确认占位，不触发真实平台 | passed |
| readback 只写入回查占位或读取本地 seed，不调用真实平台 | passed |
| 安全检查确认无敏感字段泄漏 | passed |

## 已完成

- 新增 `package.json`，提供 `npm run dev`、`npm start` 和 `npm run smoke:api`。
- 新增 `src/server/index.mjs`，提供静态前端访问和 7 个 launch API。
- 新增 `src/repositories/postgresRepository.mjs`，封装 `marketing_workbench_v2.mwb` 的最小读写。
- 新增 `src/workflows/launchWorkflow.mjs`，实现 7 节点状态流转、诊断、草稿、确认占位和回查占位。
- 新增 `src/workflows/stdProjectNameBuilder.mjs`，独立生成 `std_project` 项目名。
- 新增 `src/agents/launchAgent.mjs`，解析 `route_id`、`game_code`、`advertiser_id`。
- 新增 `src/platforms/oceanenginePlaceholder.mjs`，明确 confirm/readback 只写本地占位。
- 修改前端从 API 读取 job 数据，不再加载 `mock-launch-job.js` 作为主数据源。
- 将前端 mock 里的 `gameSlug/jushou-hunt` 改为 `gameCode/JSZC`。

## 验收证据

| 类型 | 结果 |
| --- | --- |
| smoke job | `JOB-MWBV2-20260823104408-B727CC` |
| HTTP job | `JOB-MWBV2-20260823104211-D0E842` |
| 节点数 | 7 |
| 项目名 | `245791_N_JSZC_HUNT_PAY7DROI_平台定向不限_P01_20260817` |
| payload hash | `sha256:d82b6f244dae92e8cedc3b53d1ed3c67f96e0c34bbe72b9f69032a42ef33f946` |
| 回查对象名来源 | `readback_records.object_name = launch_drafts.project_name` |

## 已执行命令

```bash
npm run smoke:api
npm run dev
curl --noproxy 127.0.0.1 -s -I http://127.0.0.1:3000/
curl --noproxy 127.0.0.1 -s http://127.0.0.1:3000/api/launch/jobs/JOB-MWBV2-20260823104211-D0E842
psql -X -d marketing_workbench_v2 -c "SELECT ..."
rg -n "gameSlug|game_slug|jushou-hunt|rawPayload|rawResponse|raw_payload|raw_response|auth_code|token|cookie|secret|Cookie" frontend src package.json scripts/smoke-api.mjs
```

## 未验证项或风险

- 未做真实平台 API 调用，符合当前 guardrails。
- 前端已通过 HTTP 200 与 API smoke 验证，未做浏览器截图级视觉验收。
- 当前本地 dev 服务运行在 `http://127.0.0.1:3000`。

## 下一步

进入真实平台写入前的契约测试与只读平台 adapter。
