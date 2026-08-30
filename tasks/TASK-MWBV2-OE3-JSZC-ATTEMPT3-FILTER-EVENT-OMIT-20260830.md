# TASK-MWBV2-OE3-JSZC-ATTEMPT3-FILTER-EVENT-OMIT-20260830

状态：closed_exhausted_failed_or_unconfirmed

更新时间：2026-08-30 CST

## 目标

以 P02 Job `JOB-MWBV2-20260830010824-488F0E` 为唯一冻结基线，为 JSZC 标准项目验证系列准备最后一次 Attempt 3。唯一业务字段变化为：在 `hide_if_converted=NO_EXCLUDE` 下，将 `audience.filter_event` 从单条数组完全省略。

本 Task 最初只修正合同、生成 fresh runtime Job/Draft/Execution Plan 并运行 Node 1–5；准备阶段不得进入 Node 6。现已取得下述精确执行授权，但在执行前安全修复通过前仍不得调用 `std_project/create`。

## 精确执行授权与执行前修复

用户已精确确认 `JOB-MWBV2-20260830031657-2CE128` / `PLAN-JOB-MWBV2-20260830031657-2CE128-V3`，接受 `SCHEDULE_FROM_NOW`、预算 `88888`、CPA `488`、ROI `0.088` 风险，并仅授权一次 `std_project/create`。

开启真实写入前的只读审计发现两项 fail-closed 阻断，当前仍保持平台写入关闭，且 confirmation、platform action、created object、readback 均为 `0`：

- `execute_once` 重编译 Plan 时未透传单变量实验绑定，可能覆盖已确认的 plan hash；必须保证 Node 1–5 重跑后 Plan ID/hash 仍与本 Task 已展示值完全一致，并在 Node 6 原子 claim 前再次断言。
- 创建响应的完整 request ID 仍可能进入内部 action 记录；本 Task 只允许保存 `request_id_present`，必须在真实调用前移除完整 request ID 持久化。

上述机制修复和聚焦回归通过后，本次精确授权继续有效；只有原 Plan ID/hash 与 payload hash 均未漂移才可临时开启一次写入范围。

执行前修复与回归已通过：canonical 单变量实验重编译保持原 Plan ID/hash；错误 hash 在覆盖数据库及 Node 6 claim 前阻断；完整 request ID 不再持久化；create 传输未确认会关闭当前 action 并继续只读回查；回查等待按累计 `0/10/30` 秒执行。最终只读复核仍为 Job `0/0/0/0`、系列 `2/3`、Plan 无 blocker、凭据有效。现仅对本 Job/Plan 开放一次 create。

## 固定范围

| 项 | 值 |
| --- | --- |
| Case | `CASE-LEGACY-2E4217E20C9E26BFB648772C` |
| Route / Game / Advertiser | `oceanengine_3_byte_mini_game` / `JSZC` / `1871922346964041` |
| Verification Series | `SERIES-MWBV2-JSZC-REAL-CREATE-20260829` |
| Attempt | `3/3`，最后一次；不得生成 Attempt 4 |
| P02 baseline | `JOB-MWBV2-20260830010824-488F0E` |
| P02 payload hash | `sha256:f2c98efc3a7279634e91501013c5009f7a39940d1aa03b6c78b0b8ce73eae104` |
| 唯一候选 | `audience.filter_event`：单条数组 → 完全省略 |
| 冻结业务值 | budget `88888`、CPA `488`、ROI `0.088`、`SCHEDULE_FROM_NOW` |

## 合同修正

- `hide_if_converted=NO_EXCLUDE` 时，路线必须声明 `filter_event_policy=omit`。
- Node 5 builder 不再从 `external_action` 自动制造 `filter_event`。
- 字段不存在才通过；发送空数组或任何非空数组均在 nested contract、field ledger、payload contract 和 create preflight 阻断。
- `converted_time_duration` 保持 P02 原值，不与本实验捆绑修改。
- Attempt 3 临时继续发送 P02 的一条已核验备用落地页，避免形成第二个业务变量；取消或失败后使用独立补偿迁移恢复外链 `omit`，但永久保留 `filter_event` 省略合同。

## 单变量与 Plan 绑定

字段账本差异只允许：

- fresh `name`；
- `audience.filter_event`；
- `audience.filter_event.[]`；
- 不进入业务字段账本的 fresh 运行证据与 hash。

Execution Plan 必须在 ready 前绑定 baseline Job/hash、候选路径、差异方向、changed paths 和 diff hash。出现任何其他业务字段变化时，不得保存 ready Plan。

## 允许与禁止

允许：局部修改 Node 5 合同、字段账本、预检、安全错误分类、Execution Plan 和既有验证系列准备脚本；执行路线合同迁移；写入 scoped fresh runtime Job、Draft、Node/Skill runs、Execution Plan 与脱敏 evidence；在精确授权和 scope 校验通过后，为本 Job 原子 claim 并调用一次 `std_project/create`，随后执行只读回查。

禁止：第二次 `std_project/create` 或 Attempt 4；Promotion、素材/事件/DMP/预算/出价写入；token refresh；自动重试；保存完整 URL、token、raw request、raw payload、raw response 或完整 request ID。

## 验收

- [x] `NO_EXCLUDE` 正确省略 `filter_event`；空数组、`[PAY]` 或误发均阻断。
- [x] 安全错误 `filter_event invalid` 映射为 `audience.filter_event / invalid_field`，且不保存原始文案。
- [x] P02 → Attempt 3 的脱敏账本差异只包含批准路径，并由 diff hash 绑定到 Plan hash。
- [x] fresh Job 完整运行 Node 1–5；payload contract、create preflight、查重和资源回查通过。
- [x] 确认前 confirmation、platform action、created object、readback 均为 `0`；系列仍为 `2/3`。
- [x] 输出精确 Job/Draft/Plan/hash/项目名与预算、出价、排期风险，然后停止等待人工确认。
- [x] 精确授权后仅调用一次 create；写入审计为 confirmation `1`、create action `1`、created object `0`、REAL readback `1`。
- [x] HTTP `200` / 业务码 `40000` 未返回项目 ID；累计 `0/10/30` 秒三次 list 均未命中。
- [x] 系列以 `3/3` 耗尽并关闭写入 scope；未自动重试、未生成 Attempt 4。
- [x] 应用 053 补偿：备用落地页恢复 `omit`，永久保留 `filter_event=omit` 合同。

## 已完成准备

| 项 | 值 |
| --- | --- |
| Job | `JOB-MWBV2-20260830031657-2CE128` |
| Draft | `DRAFT-JOB-MWBV2-20260830031657-2CE128-V3` |
| Plan | `PLAN-JOB-MWBV2-20260830031657-2CE128-V3`，状态 `ready` |
| 项目名 | `245828_N_JSZC_HUNT_PAY7DROI_平台定向不限_P03_20260830` |
| payload hash | `sha256:611616c1cfcfbb66d42d204137628f8a2513369cc4bb85db3206045010af9cfe` |
| plan hash | `sha256:eab096b09de22cdd5616b4d88519b7e57191d5b0d09f12abc0a44af0b6f430a7` |
| diff hash | `sha256:adf7312ab4de678bbd48bba80645eb4114ed23e0937dce782705b32d4588bd7b` |
| 唯一差异路径 | `name`、`audience.filter_event`、`audience.filter_event.[]` |
| Node 1–5 | Node 1–4 `passed`；Node 5 `needs_confirmation` |
| Gate | payload contract `passed`、preflight `passed`、duplicate `platform_not_duplicate`、blockers `[]` |
| 发送形态 | `NO_EXCLUDE`；`filter_event` 完全省略；备用落地页继续 `send` 1 条 |
| 写入审计 | confirmation `0`、platform action `0`、created object `0`、readback `0` |
| 系列状态 | create action `2`、created object `0`、verified readback `0`；下一序号仍为 `3/3` |

首次 diff 防线因数组元素会归一到同一路径而把合法的多条账本记录误判为重复，因此未生成 Plan。比较器随后修正为按路径比较脱敏条目多重集，并复用同一 fresh Job 生成上述 Plan；未新建第二个 Attempt 3 Job、未重跑平台写入、未产生 confirmation 或 action。

准备阶段 Case 投影曾为 `await_job_write_authorization / obtain_single_attempt_authorization`；上述记录仅是执行前基线，不是平台创建成功记录。真实结果如下。

## Attempt 3 执行结果（已关闭）

| 项 | 结果 |
| --- | --- |
| 创建调用 | 恰好 1 次；action attempt `3`；不自动重试 |
| HTTP / 平台码 | `200` / `40000` |
| 请求 ID | 平台响应中存在；数据库仅保存存在性，完整值未落库 |
| 项目 ID | 未返回；created object `0` |
| 平台安全分类 | `unclassified`；未识别安全字段路径，不保留原始文案 |
| List 回查 | 3 次，累计 `0/10/30` 秒；均 HTTP `200`、平台码 `0`、未命中项目名 |
| Job 结果 | `failed_waiting_manual_review`；Node 6 `failed`、Node 7 `failed` |
| 系列终态 | create action `3`、created object `0`、verified readback `0`；下一序号为 `4`，超过 `3` 次上限 |
| 写入 scope | 执行器已自动关闭；allowed actions `[]`、maximum actions `0`、retry `false` |
| 合同补偿 | 已执行 053；备用落地页 `omit`，`NO_EXCLUDE` 下 `filter_event` 继续 `omit` |
| 独立投影缺陷 | `mwb.workflow_case_summary.action_readback_state` 仍按 latest Job 显示 `1/3`，未聚合 verification series；真实硬锁以 series action `3/3` 为准。该缺陷不参与本次 `40000` 根因归因。 |

该结果只证明“P02 发送形态减去 `audience.filter_event`”仍未被平台确认创建成功，因此该字段不是足以单独解决前两次 `40000` 的变量；不能宣称它与失败无关，也不能识别新的具体根因。系列已耗尽，不得开启 Attempt 4。

## 后续结果规则

- 精确确认后最多调用一次 create，再执行 `0/10/30` 秒 list 回查。
- 成功只能记录“P02 基线减去 `filter_event` 的组合被接受”，不得宣称它是前两次 `40000` 的唯一根因。
- 仍为 `40000` 或未确认创建：说明它不是唯一根因，系列以 `3/3` 终止，不得 Attempt 4；恢复备用落地页 `omit`。
- 若准备取消且未进入真实确认，同样恢复备用落地页 `omit`；`filter_event` 省略合同保留。

## Solution Link

| 项 | 内容 |
| --- | --- |
| source | 用户批准的“省略 `audience.filter_event` 的 Attempt 3 单变量验证”方案、`docs/Solution Design.md`、官方智擎版 3.0 字段表与相关 v3 create 交叉规则。 |
| objective | 在系列最后一次尝试中，以 P02 为唯一基线验证 `NO_EXCLUDE + filter_event=[PAY]` 这一高强度候选，并在任何未确认结果后关闭系列。 |
| current truth | Postgres `marketing_workbench_v2.mwb`、本 Task/Manifest、当前代码、P02 冻结字段账本和官方资料。 |
| stop condition | 已触发：Attempt 3 返回 `40000` 且三次回查未命中；系列 `3/3` 耗尽、scope 关闭、补偿完成。 |
