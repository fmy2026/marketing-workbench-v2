# TASK-MWBV2-OE3-SELLING-POINTS-CONTRACT-20260829

状态：completed

更新时间：2026-08-29 CST

## Solution Link

| 项 | 值 |
| --- | --- |
| source | 用户确认的“问题二：商品卖点长度合同修正”；`docs/Solution Design.md`；历史排查文档仅作证据。 |
| objective | 修正 JSZC 路线默认商品卖点，并在 Node 5 payload 与 create preflight 两层阻断不满足官方长度合同的卖点。 |
| current truth | PostgreSQL `marketing_workbench_v2.mwb`、当前代码/schema、当前 manifest、官方 `std_project/create` 与 `tools/project_material_type/update` 字段合同。 |
| stop condition | 出现平台写入、`std_project/create`、素材更新接口调用、raw payload/response/token 保存、历史失败 draft 复用、或 fresh job 仍有创建前 blocker 时停止。 |

## 固定对象

| 项 | 值 |
| --- | --- |
| case_id | `CASE-LEGACY-2E4217E20C9E26BFB648772C` |
| route_id | `oceanengine_3_byte_mini_game` |
| game_code | `JSZC` |
| advertiser_id | `1871922346964041` |
| 目标卖点 | `开局装备全靠捡`、`三分钟快速上手`、`无需下载点开即玩` |

## 权限边界

允许：

- 修改本地 Node 5 payload、payload contract、create preflight、smoke 与 migration。
- 更新 `mwb.game_route_defaults.raw_defaults.payload_defaults.product.selling_points` 的 JSZC 路线默认值。
- 创建 fresh `runtime_truth` job，显式绑定原 case，仅运行 Node 1-5 的只读/草稿验证。
- 写入本任务卡、Context Manifest、Postgres 运行事实、脱敏字段 manifest 与测试记录。

禁止：

- 调用 `std_project/create`、`tools/project_material_type/update` 或任何平台写接口。
- 生成 execution plan、confirmation、platform action、created object 或真实 readback。
- 复用或修改历史失败 draft。
- 保存 token、secret、auth_code、Cookie、完整 URL、raw request、raw response 或 raw payload。

## 验收

- [x] task 与 context manifest 创建，并作为 active task 执行。
- [x] JSZC 路线默认卖点更新为三条 6-9 字文案。
- [x] Node 5 构建阶段校验卖点必须为 1-10 项、每项非空字符串、Unicode 长度 6-9。
- [x] create preflight 对 payload 与 final payload manifest 均有卖点合同校验。
- [x] final payload manifest 只保存来源、数量、长度范围、校验结果与规则版本，不保存完整 payload。
- [x] smoke 覆盖合法、4 字、5 字、10 字、空数组、超过 10 项与非字符串。
- [x] fresh runtime-truth job 到 Node 5，卖点合同通过。
- [x] zero write audit：strict payload-only job 中 execution plan、confirmation、platform action、created object、readback 均为 0。
- [x] 任务结束后 `active_task=null`，平台写权限保持关闭。

## 结果记录

| 项 | 结果 |
| --- | --- |
| route defaults | `product.selling_points` 已更新为 `开局装备全靠捡`、`三分钟快速上手`、`无需下载点开即玩`。 |
| official contract | `std_project/create` 明确 `selling_points` 为 `string[]`，字符限制 `[6-9]`，个数限制 `[1,10]`；素材更新接口同样支持该合同作为旁证。 |
| Node 5 | 新增共享合同校验；短卖点、空数组、超过 10 项、非字符串都会写入脱敏 blocker。 |
| create preflight | 新增 payload 直检与 manifest 投影校验；绕过 Node 5 的非法卖点仍会在创建前被阻断。 |
| final manifest | 只记录卖点来源、规则版本、数量、最小/最大字符数、校验结果与 blocker 数量。 |
| fresh strict job | `JOB-MWBV2-20260829124021-BAC541` |
| strict job status | `draft_ready` / Node `5` |
| selling point manifest | source=`postgres:mwb.game_route_defaults.raw_defaults.payload_defaults.product.selling_points`；count=`3`；min/max=`7/8`；validated=`true` |
| payload contract / create preflight | `passed` / `passed` |
| case gate | `review_latest_job`，blockers 空，next action `inspect_latest_job` |

## 审计

| 对象 | 数量 |
| --- | ---: |
| drafts | 1 |
| execution_plans | 0 |
| launch_confirmations | 0 |
| platform_actions | 0 |
| created_objects | 0 |
| readback_records | 0 |

说明：另有一次常规 `dry_run` 验证 `JOB-MWBV2-20260829123839-F3D4D7`，用于确认完整 runner 路径下 duplicate/readiness 也通过卖点合同。当前 runner 的 `dry_run` 会按既有机制保存 execution plan 与 not-applicable readback；因此最终验收采用 strict payload-only fresh job。

## 验证

- `psql -X -d marketing_workbench_v2 -f db/045_jszc_selling_points_contract.sql` passed
- `npm run test:payload-contract` passed
- `npm run test:aweme-authorization` passed
- `npm run smoke:workflow-skills` passed
- fresh strict runtime-truth payload-only job passed：`JOB-MWBV2-20260829124021-BAC541`
