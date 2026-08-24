# TASK-MWBV2-OE3-READONLY-GATES

状态：completed

更新时间：2026-08-23 CST

## 目标

把当前本地 prewrite gate 升级为 OceanEngine 真实平台只读校验，并将脱敏结果回写到 v2 自己的 Postgres 表中，支撑后续是否可以进入单次真实 `std_project/create` 确认。

## 范围

| 类型 | 内容 |
| --- | --- |
| 目标 | 真实平台只读 probe、脱敏证据、账户资源只读状态回写、7 节点只读诊断输出 |
| 允许修改 | `project.state.json`、`db/`、`src/platforms/`、`src/workflows/`、`src/repositories/`、`frontend/`、`scripts/`、`package.json` |
| 非目标 | 不执行 `std_project/create`，不上传头像/产品图/素材，不推送 DMP，不创建事件资产，不刷新凭据，不触碰旧库 |

## 目标对象

| 字段 | 值 |
| --- | --- |
| `route_id` | `oceanengine_3_byte_mini_game` |
| `game_code` | `JSZC` |
| `advertiser_id` | `1871922175825993` |
| `monitor_id` | `245791` |
| 创建对象 | `std_project` |

## 节点要求

- 7 个节点名称保持不变。
- `launch_intake` 校验 v2 运行字段为 `route_id/game_code/advertiser_id`，不使用 `game_slug`。
- `creation_context` 校验账户、monitor_id、触点 URL 存在且 hash 匹配、平台 appid，并输出平台只读凭据状态。
- `game_launch_pack` 校验游戏主档、路线默认值、保底物料包和 appid 来源。
- `account_resource_prepare` 对头像、DMP、事件资产、视频、产品图、品牌、小程序实例输出只读状态、缺口和下一步动作。
- `std_project_draft_builder` 输出本地/平台查重、payload 合同和 prewrite gate 状态。
- `std_project_create_executor` 只判断是否具备进入单次真实创建确认，不执行写入。
- `readback_closer` 校验占位回查一致性，不伪造真实 object_id。

## 安全边界

- 只允许真实平台只读 API。
- 凭据不可用或过期时返回 `credential_required`，不刷新凭据。
- 平台响应只保存脱敏摘要和 hash，不保存 raw response。
- API/前端不展示完整触点 URL、raw payload、raw response、token、Cookie、secret。
- 旧项目只读参考，不作为 v2 运行依赖。

## 验收

| 标准 | 结果 |
| --- | --- |
| `npm run test:payload-contract` 通过 | passed |
| `npm run smoke:api` 通过 | passed |
| 新增只读校验 smoke 通过 | passed |
| 7 个节点均能输出对应只读校验结果 | passed |
| `account_resources` 能回写只读校验摘要或明确凭据/查询缺口 | passed |
| 当前真实创建前 gate 明确 blocked 状态、资源类型和下一步动作 | passed |
| 未执行任何平台写入动作 | passed |
| 未刷新凭据、未触碰旧库 `marketing_workbench` | passed |
| 未泄漏完整触点 URL、token、Cookie、secret、raw payload、raw response | passed |

## 已完成

- 新增只读节点输出字段：`launch_node_runs.output_summary`、`launch_node_runs.evidence_refs`。
- 新增 v2 独立只读 client：只允许白名单 GET 端点，读取本机私密 env，校验 token 状态/过期，不刷新凭据。
- 扩展 OceanEngine 只读 adapter：整合账户访问、头像、事件资产、DMP、视频、产品图、品牌/行业、小程序实例和 `std_project/list` 查重的只读 gate。
- Workflow 的 `diagnose` 和首次 `run` 会执行只读校验；普通 GET 只读取已回写的缓存摘要，不重复打平台。
- 7 个节点均写入脱敏 `output_summary`，前端诊断弹窗展示每个子流程的状态、缺口和下一步动作。
- `account_resources.metadata.readonly_check` 已回写只读摘要；凭据不可用时明确 `credential_required`。
- 只读响应不 raw 入库，仅在可执行 probe 时保存脱敏证据摘要和响应 hash。

## 验收证据

| 类型 | 结果 |
| --- | --- |
| 只读 smoke job | `JOB-MWBV2-20260823135424-A81F84` |
| `platformReadonlyStatus` | `credential_required` |
| `credentialStatus` | `credential_required` |
| `prewriteGateStatus` | `blocked` |
| 阻断资源类型 | `avatar`、`event_asset`、`product_image` |
| 节点输出数 | 7/7 |
| 平台 evidence 数 | 0；凭据过期，未发起成功平台 probe，符合不刷新凭据边界 |
| live API 脱敏检查 | `passed`，最新接口返回 7/7 节点输出 |

## 已执行命令

```bash
psql -X -d marketing_workbench_v2 -v ON_ERROR_STOP=1 -f db/008_add_launch_node_readonly_outputs.sql
node --check src/platforms/oceanengineReadonlyClient.mjs
node --check src/platforms/oceanengineReadonlyAdapter.mjs
node --check src/workflows/launchWorkflow.mjs
node --check src/repositories/postgresRepository.mjs
node --check frontend/app.js
node --check scripts/readonly-oceanengine-smoke.mjs
npm run smoke:readonly
npm run test:payload-contract
npm run smoke:api
rg -n "<full-touchpoint-url-and-macro-patterns>" .
rg -n "<legacy-runtime-import-patterns>" src scripts package.json
psql -X -d marketing_workbench_v2 -c "SELECT ..."
curl --noproxy 127.0.0.1 -s -o /tmp/mwbv2-latest-api.json http://127.0.0.1:3000/api/launch/jobs/latest
```

## 未验证项或风险

- 本机 OceanEngine token 已过期；本任务没有刷新凭据，因此真实平台 GET 没有成功 probe，只写回 `credential_required`。
- 当前创建前 gate 仍 blocked：头像、事件资产、产品图仍需账户资源补齐或确认。
- 未验证平台 `std_project/list` 查重的成功返回路径；需要凭据处理后重跑只读 smoke。

## 下一步

完成后根据 gate：
- 如果只读 gate 仍 blocked：进入账户资源补齐确认任务；当前还需要先单独处理只读凭据后重跑校验。
- 如果只读 gate 全部通过：进入单次真实 `std_project/create` 确认任务。
