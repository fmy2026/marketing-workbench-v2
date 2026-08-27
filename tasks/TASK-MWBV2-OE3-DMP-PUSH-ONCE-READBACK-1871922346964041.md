# TASK-MWBV2-OE3-DMP-PUSH-ONCE-READBACK-1871922346964041

## Brief

一次性完成账户 `1871922346964041` 的 JSZC DMP 默认集合目标户环节：以 fresh runtime truth job 的 10 条逐包计划为唯一依据，逐包执行 `push_v2`，并在每包写入后立即对目标户执行 `read/select` 回查。

## Scope

- 修复 DMP 成员目标户状态域，新增“保底集合 + 成员 + 账户”维度的只读状态表。
- 修正 DMP push request hash，使其基于真实 JSON 数字传输形状。
- 新增 DMP 写入 scope、执行器和 `resource:dmp-ensure-once` 长期入口。
- 真实写入前必须验证官方 `push_v2` 合同来源与内容 hash。
- 若官方合同缺失，任务关闭为 `blocked_missing_official_dmp_push_contract`，平台写入次数为 `0`。

## Non Goals

- 不创建广告项目。
- 不创建 monitor。
- 不刷新 token。
- 不修改预算、出价、视频、头像、产品图、落地页或事件资产。
- 不把 token、Cookie、raw request、raw payload、raw response 写入项目文件或 DB metadata。

## Target

| 字段 | 值 |
| --- | --- |
| route_id | `oceanengine_3_byte_mini_game` |
| game_code | `JSZC` |
| package_set_id | `DMP-JSZC-HUNT-CONVERTED-EXCLUDE-BASELINE-001` |
| source_advertiser_id | `1871922153496588` |
| target_advertiser_id | `1871922346964041` |
| expected_package_count | `10` |
| action_scope | `ensure_resource:dmp_audience_package` |
| confirm_variable | `MWBV2_OE_DMP_PUSH_CONFIRM=PUSH_ONE_DMP_BASELINE_SET` |

## Progress

- [x] 建立任务卡与 manifest。
- [x] 新增目标账户维度 DMP member state migration。
- [x] 修正 DMP push request hash 数字传输口径。
- [x] 新增 DMP executor、scope 和 CLI。
- [x] 执行 migration 与回归测试。
- [x] 官方 `push_v2` 合同证据核验。
- [x] 创建 fresh job 并生成新 hash 口径的 10 条 planned 计划。
- [x] 关闭任务并更新 `project.state.json`。

## Current Gate

已按 `AGENTS.md` 优先级补查 2.0 知识库，并定位到 `dmp/custom_audience/push_v2` 官方合同。3.0 主库和 3.0 外部给定资料仍未命中；2.0 仅作为信息不足时的补充合同来源。

官方合同结论：

| 项 | 结论 |
| --- | --- |
| 主库摘要 | `/Users/hys/knowledge/01-个人本地知识库/01-官方文档/open.oceanengine.com-2.0/11-DMP人群管理.md:158` |
| 完整正文 | `/Users/hys/knowledge/01-个人本地知识库/01-官方文档/open.oceanengine.com-2.0-copy/09-DMP人群管理.md:2428` |
| 官方链接 | `https://open.oceanengine.com/labels/7/docs/1696710572311552` |
| endpoint | `https://ad.oceanengine.com/open_api/2/dmp/custom_audience/push_v2/` |
| method | `POST` |
| header | `Content-Type: application/json`、`Access-Token` |
| request fields | `advertiser_id`、`custom_audience_id`、`target_advertiser_ids` |
| response fields | `code`、`message`、`data`、`request_id` |
| copy content hash | `sha256:41b9c87f6d6da19783da95114b53c9243acff98f4cb13bd50ce84fdd14ec57ad` |

注意：主库摘要提到 `delivery_status`，但完整正文的 `push_v2` 请求参数未列出该字段；本任务已将 `delivery_status` 修正为回查判断字段，不再在 push 请求中发送。

## Result

状态：`official_contract_located_pending_single_dmp_push_authorization`。

已完成：

| 项 | 结果 |
| --- | --- |
| migration | 已执行 `db/033_add_dmp_member_account_states.sql` |
| target-account DMP state | 新增 `mwb.dmp_package_member_account_states`，目标户状态按账户维度保存 |
| request hash | 已改为基于真实 JSON 数字传输形状计算 |
| executor/scope/CLI | 已新增 `resource:dmp-ensure-once`，默认无合同/无 scope 零写入停止 |
| fresh readonly job | `JOB-MWBV2-20260827125751-2CDDFD` |
| fresh push plans | `10` 条，状态均为 `planned`，请求字段为 `advertiser_id/custom_audience_id/target_advertiser_ids` |
| target states | `1871922346964041` 为 `missing 10` |
| platform DMP actions | `0` |
| official contract | 2.0 兜底知识库已定位 |

拦截验证：

- 旧 job `JOB-MWBV2-20260827122811-BF9632` 被拦截，除缺少确认/scope/官方合同外，还存在旧 hash 口径 `dmp_push_plan_request_hash_mismatch`。
- fresh job `JOB-MWBV2-20260827124956-588321` 被拦截，原因仅为未带确认变量、未开启写入 scope、缺少官方 `push_v2` 合同证据；没有 hash mismatch。
- 新 fresh job `JOB-MWBV2-20260827125751-2CDDFD` 生成 3 字段 request hash，可作为下一次单次 DMP push/readback 的候选 job。

机制观察：

- `package.json` 当前没有 `db:migrate` 入口，本次 migration 使用 `psql -X -d marketing_workbench_v2 -v ON_ERROR_STOP=1 -f db/033_add_dmp_member_account_states.sql` 执行。后续可独立补一个长期 migration CLI，避免任务中依赖手工 psql。
- 3.0 知识库未检索到 `push_v2` 合同页；2.0 兜底知识库已定位。下一步如果用户确认执行，需把上述 official contract 写入临时 DMP scope，并设置确认变量。

下一 gate：基于 fresh job `JOB-MWBV2-20260827125751-2CDDFD` 临时开启精确 DMP scope，并执行一次 `resource:dmp-ensure-once`；仍不创建广告，Node 6 继续锁定。

## Acceptance

- 目标户 DMP 状态不再写入无账户维度的 `dmp_package_members.target_readonly_status`。
- fresh plan 的 `request_hash` 与真实传输 JSON 完全一致。
- 执行器最多允许 10 次 DMP push，每次仅一个 `custom_audience_id` 和一个目标账户。
- 任一包失败或回查未验证即停止，不自动重试。
- 官方合同缺失时，真实平台写入数为 `0`，任务记录明确下一 gate。
