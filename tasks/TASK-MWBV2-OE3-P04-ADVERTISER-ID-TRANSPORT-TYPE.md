# TASK-MWBV2-OE3-P04-ADVERTISER-ID-TRANSPORT-TYPE

状态：completed

更新时间：2026-08-24 CST

## 需求来源

用户提供 `/Users/hys/Desktop/需求表述.md`。该文件内容作为本轮需求输入；执行边界以用户本轮消息、`AGENTS.md`、`project.state.json`、v2 代码和 v2 Postgres 为准。

## 结构化理解

本任务基于 P01 / P03 脱敏字段对比，修正 v2 的 OceanEngine `std_project/create` 最终提交边界：Postgres、Intake、Job、API 和前端仍保留 `advertiser_id` 为 string；只有最终受控 create payload 中将其转为 safe integer number。

本任务必须新建 P04 runtime job 并只运行本地 dry-run，验证新的最终 payload 结构。P03 历史失败记录保持不可变。

## 固定对象

| 项 | 值 |
| --- | --- |
| route_id | `oceanengine_3_byte_mini_game` |
| game_code | `JSZC` |
| advertiser_id | `1871922175825993` |
| P03 job | `JOB-MWBV2-20260824092327-494BF1` |

## 目标

1. 在 v2 唯一 payload builder 中，把最终 `std_project/create` payload 的 `advertiser_id` 转为 safe integer number。
2. 保持数据库、业务上下文、API、前端、日志和 evidence 中的 `advertiser_id` 为 string。
3. payload contract、preflight、executor、workflow 使用同一份最终 payload 结论，不新增第二套 builder。
4. Node 5 的 `requestFieldManifest` 明确记录 storage type、transport type 和 safe 状态。
5. 创建新的 P04 runtime job 并只执行 dry-run。
6. P03 历史状态、create action、created object 和 payload hash 不变。

## 非目标

| 项 | 状态 |
| --- | --- |
| 真实 `std_project/create` | 禁止 |
| 点击或重试 P03 创建 | 禁止 |
| token refresh | 禁止 |
| 新增 migration | 禁止 |
| 修改 `hide_if_converted` | 禁止 |
| 修改 DMP、品牌、事件资产、素材、触点、命名规则 | 禁止 |
| 新增第二套 payload builder/preflight/executor/workflow | 禁止 |
| 旧项目成为 v2 runtime 依赖 | 禁止 |

## 验收

| 标准 | 状态 |
| --- | --- |
| task 与 context manifest 已建立 | passed |
| P03 历史记录完全不变 | passed |
| 最终 API payload 的 `advertiser_id` 为 safe integer number | passed |
| Postgres/API/前端中的 `advertiser_id` 仍为 string | passed |
| 超安全整数范围账户会在 Node 5 / preflight 阻断 | passed |
| P04 创建并完成本地 dry-run | passed |
| P04 无真实 create action、confirmation、created object、真实 readback | passed |
| 指定验证命令通过 | passed |
| 无 token、Cookie、完整触点 URL、raw payload、raw response 泄漏 | passed |

## 当前结论区

### 实现

| 文件 | 结果 |
| --- | --- |
| `src/workflows/skills/oe3/payload.mjs` | 只在最终受控 create payload 边界把 `advertiser_id` 转成 safe integer number；不安全时给出 `advertiser_id_not_safe_integer_for_platform_payload`。 |
| `src/workflows/skills/oe3/payload-contract.mjs` | 合同新增 `advertiser_id_transport_type` 检查；业务摘要 ID 继续按 string 校验。 |
| `src/workflows/skills/oe3/create-preflight-diagnostics.mjs` | preflight 改为要求最终 payload / manifest 中 `advertiser_id` 为 safe integer number。 |
| `scripts/payload-contract-smoke.mjs`、`scripts/oe3-workflow-skills-smoke.mjs`、`scripts/execution-grant-smoke.mjs` | 增加 storage string / transport number / safe true 与 unsafe manifest 阻断断言。 |
| `scripts/runtime-consistency-check.mjs` | 最新 runtime dry-run 允许被只读/资源 gate 阻断，但必须校验 advertiser_id transport manifest。 |

### P04 dry-run

| 项 | 结果 |
| --- | --- |
| P04 job | `JOB-MWBV2-20260824151431-ECA120` |
| job_status | `draft_ready` |
| project_name | `245791_N_JSZC_HUNT_PAY7DROI_平台定向不限_P04_20260824` |
| payload_hash | `sha256:91ef2ae7f61ee346938fb292d9138f1fc922df7848566b0679b08a67ba0c1ffc` |
| Postgres `advertiser_id` 类型 | `text` |
| payload summary `advertiser_id` JSON 类型 | `string` |
| final payload manifest storage type | `string` |
| final payload manifest transport type | `number` |
| final payload manifest transport safe | `true` |
| node runs | `7` |
| platform actions / confirmations / created objects / real readbacks | `0 / 0 / 0 / 0` |

P04 当前 `createReadiness.status=new_runtime_job_required`，阻断来自 `readonly_permission_required` / DMP 只读依赖，不是 advertiser_id。符合“只 dry-run，不绕过 gate”的要求。

### P03 保持不变

| 项 | 结果 |
| --- | --- |
| P03 job | `JOB-MWBV2-20260824092327-494BF1` |
| job_status | `failed_waiting_manual_review` |
| current_node | `7` |
| payload_hash | `sha256:152babf25efa31d4aa526d17a5dd7379f687dc8a069e5e93bf51eb38aa73a2f4` |
| platform_actions | `1` |
| created_objects | `0` |

### 验证

| 命令 / 检查 | 结果 |
| --- | --- |
| `npm run test:payload-contract` | passed |
| `npm run smoke:workflow-skills` | passed |
| `npm run test:execution-grant` | passed |
| `npm run smoke:api` | passed |
| `npm run check:runtime-consistency` | passed |
| `npm run workflow:dry-run` | passed；创建 P04 runtime_truth dry-run |
| 超安全整数 builder 检查 | passed；输出固定 blocker |
| JSON parse | passed |
| 敏感关键词扫描 | 未发现真实 token、Cookie、完整触点 URL、raw payload、raw response |

## 下一步 gate

P04 dry-run 结构已通过。下一步单独评估：是否开放 P04 真实平台只读校验、是否处理 `hide_if_converted` 枚举差异、是否建立新的单次真实创建确认任务。本任务结束时真实创建仍保持禁止。
