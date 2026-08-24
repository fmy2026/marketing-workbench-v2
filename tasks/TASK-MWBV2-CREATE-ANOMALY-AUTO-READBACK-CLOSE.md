# TASK-MWBV2-CREATE-ANOMALY-AUTO-READBACK-CLOSE

状态：completed

更新时间：2026-08-24 CST

## 需求来源

用户提供 `/Users/hys/Desktop/需求表述.md`。附件内容只作为本轮需求输入；执行边界以用户本轮消息、`AGENTS.md`、`project.state.json`、v2 代码和 v2 Postgres 为准。

## 结构化理解

本任务补齐节点 7 的最终收口行为：只要本轮已经发生一次真实 `std_project/create` 请求，无论 create 响应是否返回对象 ID，节点 7 都必须自动执行一次 `std_project/list` 只读回查，用 `launch_drafts.project_name` 精确查询平台对象。

本任务只实现代码与 fake-transport 测试，不执行真实平台创建，不刷新 token，不重试历史失败 job。

## 目标

1. 扩展 `readback-std-project` 触发条件：有真实 create action 即可执行一次只读回查，不要求先存在 `created_object`。
2. create 响应异常但回查命中同名对象时，Workflow 自动收口为 `created`。
3. create 响应异常且回查未命中时，Workflow 保持失败并禁止重试。
4. create 前 gate 阻断时，不调用 create，也不调用 readback。
5. 保持一个 job 最多一次真实 create，不新增第二套 Workflow、executor、readback 路径或 migration。
6. 扩展 fake-transport 测试，覆盖 create 成功、create 响应异常但回查命中、create 响应异常且回查未命中、创建前阻断。

## 非目标

| 项 | 状态 |
| --- | --- |
| 本任务中执行真实 `std_project/create` | 禁止 |
| token refresh | 禁止 |
| 重试历史失败 job | 禁止 |
| 上传素材、创建事件资产、推送 DMP、预算/出价修改 | 禁止 |
| 新增第二套 Workflow、executor、readback 路径 | 禁止 |
| 新增 Postgres migration | 禁止 |
| 依赖旧项目运行路径 | 禁止 |

## 验收

| 标准 | 状态 |
| --- | --- |
| task 与 context manifest 已建立 | passed |
| create 响应异常后节点 7 仍自动只读回查一次 | passed |
| 回查命中可收口为 `created` | passed |
| 回查未命中保持失败并禁止重试 | passed |
| 创建前 gate 阻断时无 create/readback 调用 | passed |
| fake-transport 覆盖 4 个场景 | passed |
| P03 不执行真实创建且 create 计数保持 0 | passed |
| 现有 smoke/check 通过 | passed |
| 无 token、Cookie、完整触点 URL、raw payload、raw response 泄漏 | passed |

## 完成记录

- `readback-std-project` 已扩展为：只要存在本轮真实 `oceanengine_std_project_create` action，就自动执行一次 `std_project/list` 只读回查；不再要求先存在 `created_object`。
- create 响应未确认但 list 命中同名项目时，节点 7 passed，job 收口为 `created`，并记录 `recoveredByReadback=true`。
- create 响应未确认且 list 未命中时，节点 7 failed，job 保持 `failed_waiting_manual_review`，再次 execution grant 会被阻断，不重试 create。
- 创建前 gate 阻断时，不调用 fake/real create，也不调用 readback。

## 验证记录

- `npm run test:execution-grant` passed，覆盖 create 成功回查命中、create=40000 回查命中、create=40000 回查未命中、创建前阻断 4 个场景。
- `npm run test:create-result-mapping` passed。
- `npm run smoke:workflow-skills` passed。
- `npm run smoke:api` passed。
- `npm run smoke:readonly` passed。
- `npm run check:runtime-consistency` passed。
- P03 `JOB-MWBV2-20260824092327-494BF1` 计数保持 `confirmationCount=0`、`createActionCount=0`、`realReadbackCount=0`、`createdObjectCount=0`。

## 下一步 gate

P03 的单次 execution grant 若发生真实 create 响应异常，会自动执行一次只读回查收口；若回查未命中，则停在人工复盘并禁止重试。下一步仍是用户明确发起单次 execution grant，或继续在只读范围内检查最终创建前条件。
