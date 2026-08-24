# TASK-MWBV2-PREWRITE-READONLY-ADAPTER

状态：completed

更新时间：2026-08-23 CST

## 目标

为后续真实创建 `std_project` 做写入前准备：接入受控触点 URL 入库、只读平台 adapter 骨架、payload 合同测试和创建前诊断 gate。本任务仍不执行真实平台创建。

## 范围

| 类型 | 内容 |
| --- | --- |
| 目标 | 触点 URL 仅入库受控保存；API/前端只展示触点 ref、hash、状态；增加只读检查和 payload 合同检查 |
| 允许修改 | `project.state.json`、`db/`、`src/repositories/`、`src/workflows/`、`src/platforms/`、`src/server/`、`frontend/`、`scripts/`、`package.json` |
| 非目标 | 不执行 `std_project/create`、不调用真实平台写入 API、不做预算/出价修改、不刷新凭据、不触碰旧库 |

## 目标账户

| 字段 | 值 |
| --- | --- |
| `route_id` | `oceanengine_3_byte_mini_game` |
| `game_code` | `JSZC` |
| `advertiser_id` | `1871922175825993` |
| `monitor_id` | `245791` |
| `touchpoint_ref` | `OCEANENGINE_BMG_TOUCHPOINT_1871922175825993_245791_URL` |

## 具体要求

- `mwb.account_touchpoints` 若缺少 `touchpoint_url` 字段，则通过 migration 新增。
- 用户提供的真实触点 URL 写入本地 v2 数据库，重新计算 `url_hash`，状态更新为 `stored_in_database`。
- API 和前端不展示完整 `touchpoint_url`，不展示 raw payload/raw response/token/Cookie/secret。
- 新增 `src/platforms/oceanengineReadonlyAdapter.mjs`，只做本地 gate 和只读检查结构，不刷新凭据，不写平台。
- 新增 `src/platforms/oceanengineStdProjectPayloadContract.mjs`，检查字段齐全、禁止字段、长数字 ID 类型、hash 稳定、命名规则和回查来源。
- `std_project_draft_builder` 输出 payload 合同检查结果。
- `std_project_create_executor` 保持 locked / placeholder，不因触点 URL 已录入而进入真实创建。

## 验收

| 标准 | 结果 |
| --- | --- |
| `account_touchpoints.touchpoint_url` 已受控写入本地 v2 库 | passed |
| `url_hash` 与真实 URL 一致 | passed |
| API 返回不泄漏完整 `touchpoint_url` | passed |
| 前端不展示完整 `touchpoint_url` | passed |
| `npm run smoke:api` 通过 | passed |
| 新增 payload 合同测试通过 | passed |
| 诊断报告明确显示真实创建前条件和缺口 | passed |
| 未执行 `std_project/create` | passed |
| 未刷新凭据、未调用真实平台写入 API、未触碰旧库 | passed |

## 已完成

- 新增 `mwb.account_touchpoints.touchpoint_url` 受控字段，并通过参数化 SQL 模板写入目标账户触点。
- `url_hash` 由真实触点 URL 稳定计算，当前 hash 为 `3723ee0d37c85bb9d7637cf2005b9e24603de1d3a7c8e0b5c91ac78b57a12ed9`。
- repository 默认返回触点脱敏投影，API/前端只展示 `touchpointRef`、`urlHash`、`status`。
- 新增 OceanEngine 只读 adapter 本地 gate，检查授权、触点、appid、账户资源、草稿名、payload 合同和回查对象名来源。
- 新增 `std_project` payload 合同检查，覆盖字段齐全、禁止字段、长数字 ID 字符串、hash 稳定、命名规则和 object_name 来源一致。
- Workflow 7 节点名称保持不变；第 5 节点输出合同状态，第 6 节点保持 `locked` 占位，不触发真实创建。
- 前端展示触点状态/hash、payload 合同状态、创建前 gate 状态和缺口列表，不展示完整触点 URL。

## 验收证据

| 类型 | 结果 |
| --- | --- |
| DB 触点状态 | `stored_in_database` |
| DB/API 触点 hash | `3723ee0d37c85bb9d7637cf2005b9e24603de1d3a7c8e0b5c91ac78b57a12ed9` |
| payload 合同 smoke | `passed` |
| API smoke | `passed` |
| live API 脱敏检查 | `passed` |
| 最新 live job | `JOB-MWBV2-20260823132449-772890` |
| 最新创建执行节点 | `locked` |
| 当前创建前 gate | `blocked`，3 个资源缺口 |

## 已执行命令

```bash
psql -X -d marketing_workbench_v2 -v ON_ERROR_STOP=1 -f db/006_add_account_touchpoint_url.sql
psql -X -d marketing_workbench_v2 -c "SELECT ..."
node --check src/repositories/postgresRepository.mjs
node --check src/platforms/oceanengineReadonlyAdapter.mjs
node --check src/platforms/oceanengineStdProjectPayloadContract.mjs
node --check src/workflows/launchWorkflow.mjs
node --check src/server/index.mjs
node --check frontend/app.js
node --check scripts/smoke-api.mjs
node --check scripts/payload-contract-smoke.mjs
npm run test:payload-contract
npm run smoke:api
rg -n "<full-touchpoint-url-and-macro-patterns>" .
rg -n "from ['\\\"](/Users/hys/Projects/marketing-workbench|../../marketing-workbench)|marketing-workbench/scripts|marketing-workbench/src|child_process.*marketing-workbench" src scripts package.json
curl --noproxy 127.0.0.1 -s -o /tmp/mwbv2-latest-api.json http://127.0.0.1:3000/api/launch/jobs/latest
```

## 未验证项或风险

- 未调用真实平台只读 API；adapter 当前只输出本地 gate 和 `credential_required` 状态。
- 当前创建前 gate 阻断缺口为头像、事件资产、产品图未 ready。
- 未实现并发环境下的强序号锁；仍沿用本地 Postgres 最小序号占用逻辑。

## 下一步

只读平台 API 校验或单次真实创建确认。
