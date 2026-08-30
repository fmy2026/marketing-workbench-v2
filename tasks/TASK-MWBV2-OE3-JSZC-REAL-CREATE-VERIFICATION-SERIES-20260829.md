# TASK-MWBV2-OE3-JSZC-REAL-CREATE-VERIFICATION-SERIES-20260829

状态：closed_exhausted_failed_or_unconfirmed

更新时间：2026-08-29 CST

## 目标

为 JSZC 标准项目建立一个最多三次的真实创建验证系列：每次只能使用 fresh runtime-truth Job、fresh Draft、fresh Execution Plan 和一次新的人工确认；任一次创建响应或列表回查确认对象存在，立即关闭整个系列。

本任务不授权自动创建。当前只允许本地机制实现、测试和 Node 1–5 的只读/草稿准备。首次真实创建必须在该次 Job、Draft、Plan、payload hash 已生成后由用户再次明确确认。

## 固定范围

| 项 | 值 |
| --- | --- |
| Case | `CASE-LEGACY-2E4217E20C9E26BFB648772C` |
| Advertiser | `1871922346964041` |
| Route / Game | `oceanengine_3_byte_mini_game` / `JSZC` |
| 验证系列 | `SERIES-MWBV2-JSZC-REAL-CREATE-20260829` |
| 新增真实创建上限 | 3 |
| 项目名槽位 | `P10`、`P11`、`P12`（仅在对应尝试真正开始时保留） |
| 唯一平台写接口 | `POST /open_api/v3.0/std_project/create/` |
| 创建后唯一平台只读接口 | `GET /open_api/v3.0/std_project/list/` |

历史创建记录只作故障证据，不计入这个新验证系列。

## 允许与禁止

允许：更新本地代码、测试、任务卡、Context Manifest、`project.state.json`，写入既有 Job / Draft / Execution Plan / Confirmation / Platform Action / Readback / Evidence 记录；运行 Node 1–5 的只读依赖核验和草稿准备。

真实写入的前置条件：当前 Task active、系列计数未达到上限、没有 created object 或 verified readback、fresh Job/Draft/Plan/hash 一致，并且用户对该次唯一尝试重新确认。

禁止：自动重试、复用旧 Job/Draft/Plan/payload、第四次创建、`promotion/create`、素材/锚点/组件写入、预算或出价修改、自动暂停、token refresh、新增表/View/报表，以及保存 token、完整 URL、raw payload 或 raw response。

## 机制与证据

| 机制 | 实现与验收 |
| --- | --- |
| Case + series 上限 | `platform_actions.metadata.verification_series_id` 与 `launch_jobs.case_id` 联合计数；换 fresh Job 也不能绕过上限。 |
| 首成即停 | 已有 created object 或 `readback_verified` 即阻断后续槽位。 |
| 单次一致性 | 实际调用前校验 Job、Draft、payload hash、Plan hash、attempt 序号和 Task 引用。 |
| 回查 | 创建后按项目名执行即时、10 秒、30 秒的只读 list 回查；命中即停止系列。 |
| 字段核验账本 | Node 5 manifest、preflight、Node 6、Node 7 共用脱敏账本；只保存路径、规则、数量/长度/hash、发送/省略策略及结果。 |
| 全字段确认 | list 仅确认项目 ID/名称/状态；命中后必须由人工在控制台逐项确认，并用 `npm run launch:attest-field-ledger -- --job-id <job>` 写入既有 readback/evidence。 |

## 当前进度

- [x] 建立 Task 与 Context Manifest，设为 active task。
- [x] 实现 Case + series 累计上限、成功锁定与每次 scope 一致性校验。
- [x] 实现创建字段脱敏账本、三阶段回查和人工控制台账本归档入口。
- [x] 回归测试覆盖跨 fresh Job 计数、成功锁定、未知 `40000` 不自动重试和敏感信息不落库。
- [x] 创建 Attempt 1 的 fresh runtime-truth Job，完成 Node 1–5，并记录唯一 Job/Draft/Plan/hash。
- [x] 用户对 Attempt 1 的精确对象与 `SCHEDULE_FROM_NOW` 风险作出独立确认。
- [x] Attempt 1 已执行唯一一次 `std_project/create`，并完成三次只读回查；未命中，已停止。
- [x] Attempt 2 使用 fresh P02 Job 执行唯一一次 create；返回 `40000` 且三次回查未命中，系列累计为 `2/3`。
- [x] Attempt 3 已以 P02 为基线完成 `audience.filter_event` 单变量省略的 hash-bound Plan，并按精确授权调用一次 create。
- [x] Attempt 3 返回 HTTP `200` / 业务码 `40000`、无项目 ID，三次 list 回查未命中；系列以 `3/3` 耗尽并关闭。

## Attempt 1 准备记录（尚未创建）

| 项 | 值 |
| --- | --- |
| Job | `JOB-MWBV2-20260829151802-CB8550` |
| Draft | `DRAFT-JOB-MWBV2-20260829151802-CB8550` |
| Plan | `PLAN-JOB-MWBV2-20260829151802-CB8550-V1`，状态 `ready` |
| payload hash | `sha256:84b9867717babc81c957b2ed9eab0f0883df175a0fd04ce46c419dce4bdf3040` |
| plan hash | `sha256:b0b4749a09fc74974987a7647919f2e3ec447c4875f73378247c1ca98936af3a` |
| 名称槽位 | `P10`（日期后缀已在本次 fresh draft 生成） |
| Node 1–5 | Node 1–4 `passed`；Node 5 `needs_confirmation` |
| Gate | payload contract `passed`、create preflight `passed`、duplicate `platform_not_duplicate`、blockers `[]` |
| 零写入审计 | `executionPlans=1`；`launchConfirmations=0`、`platformActions=0`、`createdObjects=0`、`readbacks=0` |
| 系列状态 | 新系列 action / object / verified readback 均为 `0`；下一序号 `1/3` |

这不是平台创建成功记录，只是用户确认前的精确准备对象。`SCHEDULE_FROM_NOW` 风险仍需在实际调用前单独确认。

## Attempt 1 执行结果（已停止）

| 项 | 结果 |
| --- | --- |
| 创建调用 | 1 次；不自动重试 |
| HTTP / 平台码 | `200` / `40000` |
| 请求 ID | 已出现（只保存存在性） |
| 项目 ID | 未返回 |
| 平台安全分类 | `resource_not_eligible`；未推断具体根因或字段路径 |
| List 回查 | 3 次（即时、10 秒、30 秒）；均为 HTTP `200`、平台码 `0`，未命中名称 |
| 创建结果 | `failed_or_unconfirmed`；Node 6 `failed`、Node 7 `failed` |
| 系列状态 | action `1`、created object `0`、verified readback `0`；下一序号为 `2/3` |
| 写入 scope | 已由执行器自动关闭：`platform_write_allowed=false`、allowed actions 为空 |

该结果只说明本次创建未被平台确认，不能据此猜测 `40000` 的具体原因。下一次只能在新 Task/修正方案获确认后，使用 fresh Attempt 2 的 Job、Draft、Plan 和新的人工确认。

## 历史 Handoff 与当前接续

Attempt 1 的 `40000` 未包含安全可记录的具体字段路径，且三次 list 回查均未确认对象；其历史归因已交由 [TASK-MWBV2-OE3-JSZC-ATTEMPT1-40000-FORENSIC-20260830](TASK-MWBV2-OE3-JSZC-ATTEMPT1-40000-FORENSIC-20260830.md)。Attempt 2 同样未确认对象。

最终接续为 [TASK-MWBV2-OE3-JSZC-ATTEMPT3-FILTER-EVENT-OMIT-20260830](TASK-MWBV2-OE3-JSZC-ATTEMPT3-FILTER-EVENT-OMIT-20260830.md)：Attempt 3 已执行且未确认创建成功；系列累计 `3/3`，platform write scope 已关闭，不得 Attempt 4。

## Attempt 3 执行结果（系列终态）

| 项 | 结果 |
| --- | --- |
| Job / Plan | `JOB-MWBV2-20260830031657-2CE128` / `PLAN-JOB-MWBV2-20260830031657-2CE128-V3` |
| 单变量 | `audience.filter_event`：单条数组 → 完全省略；其余业务发送形态按 P02 冻结 |
| 创建 | 恰好 1 次；HTTP `200` / 平台码 `40000`；请求 ID 仅保存存在性；无项目 ID |
| 回查 | 累计 `0/10/30` 秒三次；均 HTTP `200` / 平台码 `0`；项目名未命中 |
| 系列 | action `3`、created object `0`、verified readback `0`；达到上限并关闭 |
| 补偿 | 备用落地页策略恢复 `omit`；`filter_event=omit` 合同保留 |
| 解释 | 该单变量不足以使 P02 组合通过；不能据此确定前两次 `40000` 的唯一根因 |

`mwb.workflow_case_summary.action_readback_state` 当前仍按 latest Job 投影为单 Job `1/3`，没有展示 verification series 的真实 `3/3`。这是独立审计投影缺陷；执行授权与防重使用 Postgres series action 聚合，系列硬锁不受影响。本任务不把该投影缺陷与平台 `40000` 混为一谈。

## 本地验证

| 检查 | 结果 |
| --- | --- |
| `npm run test:payload-contract` | passed |
| `npm run test:execution-plan` | passed |
| `npm run test:execution-grant` | passed；覆盖跨 fresh Job 累计、成功锁定、字段账本归档、未知失败不自动重试。 |
| `npm run smoke:workflow-skills` | passed；未发生平台写入。 |
| `npm run test:std-project-create-wire-body` | passed；fixture 已对齐字段账本。 |
| `git diff --check` | passed |

## 停止条件

- 任一 Node 1–5 blocker、重复项目、凭据/资源异常、合同失败或 scope 不一致：停在 Node 5，不调用创建。
- 创建响应异常、超时或 `40000`：只执行三次 list 回查，记录安全摘要，等待人工决定是否修复后开启下一 fresh attempt。
- 任一回查命中或响应返回项目 ID：关闭写入 scope 和整个系列；未经全字段人工核验不得声称字段已被平台确认。
- 达到三次未成功：系列终止，不创建第四次。

## Solution Link

| 项 | 内容 |
| --- | --- |
| source | 用户确认的“JSZC 真实创建验证系列：最多 3 次、首成即停”方案。 |
| objective | 将首次真实平台验证限制为可回溯、可审计、不可绕过的最多三次单次创建。 |
| current truth | Postgres `marketing_workbench_v2.mwb`、本 Task / Manifest、当前代码、本机 3.0 官方 `std_project/create` 和 `std_project/list` 文档。 |
| stop condition | 任次不确定响应先只读回查；无新的用户确认不得开始下一次；成功即停止。 |
