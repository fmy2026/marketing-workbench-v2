# TASK-MWBV2-OE3-P04-EXECUTION-GRANT-GUARDRAIL-ALIGNMENT

状态：completed

更新时间：2026-08-25 CST

## 需求来源

用户提供 `/Users/hys/Desktop/需求表述.md`。该文件内容作为本轮需求输入；执行边界以用户本轮消息、`AGENTS.md`、`project.state.json`、v2 代码和 v2 Postgres 为准。

## 结构化理解

P04 已具备创建条件，但工作台点击“开始执行”必须先与 `project.state.json.guardrails.platform_write_scope` 严格对齐。当前任务只做执行授权链路收口，并为 P04 当前 draft/hash 预置一条严格 scope；不消费 scope，不执行真实创建。

唯一真实创建链路保持：

```text
frontend/API
-> executeConfirmedLaunch
-> runJob execute_once
-> create-once Skill
-> OceanEngine std_project/create
-> 自动 std_project/list 回查
```

## 固定对象

| 项 | 值 |
| --- | --- |
| P04 job_id | `JOB-MWBV2-20260824151431-ECA120` |
| P04 draft_id | `DRAFT-JOB-MWBV2-20260824151431-ECA120` |
| P04 payload hash | `sha256:cbdb497145254b17c8c87c1863ffea4f28c6d69ddfc246f329e56947b4896b5a` |
| route_id | `oceanengine_3_byte_mini_game` |
| game_code | `JSZC` |
| advertiser_id | `1871922175825993` |
| P03 | `JOB-MWBV2-20260824092327-494BF1`，不可重试、不可修改 |

## 权限

| 项 | 状态 |
| --- | --- |
| 修改执行授权校验 | 允许 |
| 预置 P04 单次 scope | 允许 |
| 消费 P04 scope | 禁止 |
| `std_project/create` | 禁止 |
| token refresh | 禁止 |
| 新 job / migration / 第二套入口 | 禁止 |

## 目标

1. `executeConfirmedLaunch()` 进入 `execute_once` 前强制校验 `project.state.json.guardrails.platform_write_scope`。
2. 校验项包括：`platform_write_allowed=true`、P04 job/draft/hash 匹配、allowed action 仅为 `oceanengine_std_project_create`、`maximum_actions=1`、`retry_allowed=false`、当前 job 无 action/confirmation/object/真实 readback、intent 正确。
3. 真正发起 create 前再次校验 scope，避免草稿漂移。
4. 一次执行结束后无论成功、失败或回查失败，都撤销写入 scope。
5. 本任务结束时为 P04 当前 draft/hash 预置严格 scope，但不点击工作台、不执行 create。

## 非目标

| 项 | 状态 |
| --- | --- |
| 点击工作台“开始执行” | 禁止 |
| 真实 `std_project/create` | 禁止 |
| P03 重试或修改 | 禁止 |
| token refresh | 禁止 |
| 修改 P04 素材、DMP、事件、品牌、预算、出价、项目名或 payload 业务字段 | 禁止 |
| 新增 Workflow、Skill、migration、第二套执行入口 | 禁止 |
| 保存 token、Cookie、完整触点 URL、raw payload、raw response | 禁止 |

## 验收

| 标准 | 状态 |
| --- | --- |
| task 与 context manifest 已建立 | passed |
| 未开启 scope 的工作台/执行请求被阻断，`createCalled=false` | passed |
| job_id 或 payload hash 不匹配被阻断，`createCalled=false` | passed |
| intent 缺失被阻断，`createCalled=false` | passed |
| fake transport + 正确 scope 仅调用一次 mock create，并自动回查 | passed |
| 消费后 scope 自动撤销 | passed |
| P04 本任务结束时 create/confirmation/object 计数仍为 `0` | passed |
| P03 create action 仍为 `1`，created object 仍为 `0` | passed |
| P04 严格 scope 已预置 | passed |
| 无敏感信息泄漏 | passed |

## 当前结论区

### 实现

| 文件 | 结果 |
| --- | --- |
| `src/workflows/executeConfirmedLaunch.mjs` | 新增 `project.state.json` scope 校验；进入 `execute_once` 前校验一次，发起 create 前再校验一次；执行结束后自动撤销 scope。 |
| `scripts/execution-grant-smoke.mjs` | 新增无 scope、hash mismatch、intent 缺失、正确 scope、消费后撤销等覆盖。 |

### Scope 规则

`executeConfirmedLaunch()` 现在要求：

| 项 | 要求 |
| --- | --- |
| `platform_write_allowed` | `true` |
| `target_job_id` | 当前 job |
| `target_draft_id` | 当前 draft |
| `target_payload_hash` | 当前 draft hash |
| `allowed_actions` | 仅 `oceanengine_std_project_create` |
| `maximum_actions` | `1` |
| `retry_allowed` | `false` |
| attempt state | 无 create action、confirmation、created object、真实 readback |
| intent | `EXECUTE_ONE_LAUNCH` |

### P04 预置 scope

| 项 | 值 |
| --- | --- |
| target_job_id | `JOB-MWBV2-20260824151431-ECA120` |
| target_draft_id | `DRAFT-JOB-MWBV2-20260824151431-ECA120` |
| target_payload_hash | `sha256:cbdb497145254b17c8c87c1863ffea4f28c6d69ddfc246f329e56947b4896b5a` |
| allowed_actions | `["oceanengine_std_project_create"]` |
| maximum_actions | `1` |
| retry_allowed | `false` |

本任务未消费该 scope，未执行真实创建。

### Postgres 核验

| job | platform_actions | confirmations | created_objects | real_readbacks |
| --- | ---: | ---: | ---: | ---: |
| P03 `JOB-MWBV2-20260824092327-494BF1` | 1 | 1 | 0 | 1 |
| P04 `JOB-MWBV2-20260824151431-ECA120` | 0 | 0 | 0 | 0 |

### 验证

| 命令 | 结果 |
| --- | --- |
| `npm run test:execution-grant` | passed |
| `npm run test:payload-contract` | passed |
| `npm run smoke:workflow-skills` | passed |
| `npm run check:runtime-consistency` | passed |

## 下一步 gate

任务完成并确认 P04 scope 已正确预置后，用户可以在工作台对 P04 点击一次“开始执行”。该点击会自动执行节点 1-7、真实创建一次并自动回查；无论结果如何，P04 都会撤销写入权限且不可重试。
