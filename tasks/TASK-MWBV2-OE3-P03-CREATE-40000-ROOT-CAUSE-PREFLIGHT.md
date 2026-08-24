# TASK-MWBV2-OE3-P03-CREATE-40000-ROOT-CAUSE-PREFLIGHT

状态：completed

更新时间：2026-08-24 CST

## 需求来源

用户提供 `/Users/hys/Desktop/需求表述.md`。附件内容只作为本轮需求输入；执行边界以用户本轮消息、`AGENTS.md`、`project.state.json`、v2 代码和 v2 Postgres 为准。

## 结构化理解

P03 已发生一次真实 `std_project/create`，平台返回 `HTTP 200 / api_code=40000`，没有对象 ID；随后自动 `std_project/list` 未命中同名项目，当前轮次应停在 `failed_waiting_manual_review`，不可重试。

本任务目标是在不再次调用 create、不刷新 token、不重试历史 job 的前提下：

1. 只读复盘 P03 `40000` 的可证实原因。
2. 补齐 P03 “真实回查未命中”的正式 `readback_records` 审计记录。
3. 建立脱敏字段合同诊断，并接入唯一创建前 preflight，避免后续新轮次在同类字段问题上直接打到平台。

## 目标对象

| 项 | 值 |
| --- | --- |
| route_id | `oceanengine_3_byte_mini_game` |
| game_code | `JSZC` |
| advertiser_id | `1871922175825993` |
| failed_job_id | `JOB-MWBV2-20260824092327-494BF1` |
| draft_project_name | `245791_N_JSZC_HUNT_PAY7DROI_平台定向不限_P03_20260824` |
| draft_payload_hash | `sha256:152babf25efa31d4aa526d17a5dd7379f687dc8a069e5e93bf51eb38aa73a2f4` |

## 非目标

| 项 | 状态 |
| --- | --- |
| 再次执行 P03 `std_project/create` | 禁止 |
| 重试任何历史失败 job | 禁止 |
| token refresh | 禁止 |
| 上传素材、创建事件资产、DMP 推送、预算/出价修改 | 禁止 |
| 删除历史失败 job、platform action、evidence、readback | 禁止 |
| 新增第二套 Workflow、executor、payload builder、readback 路径 | 禁止 |
| 新增 migration | 禁止 |
| v2 runtime 依赖旧项目路径 | 禁止 |

## 验收

| 标准 | 状态 |
| --- | --- |
| task 与 context manifest 已建立 | passed |
| P03 真实 create 计数仍为 1 | passed |
| P03 真实 readback 未命中已有正式 `readback_records` | passed |
| P03 保持 `failed_waiting_manual_review` 且不可重试 | passed |
| 创建前合同诊断输出脱敏结构化结果 | passed |
| fake transport 下可识别至少一个非法字段形态 | passed |
| preflight blocker 时 create/readback 调用均为 0 | passed |
| 正常 fake 成功链路仍通过 | passed |
| 现有 smoke/check 通过 | passed |
| 无 token、Cookie、完整 URL、raw payload、raw response 泄漏 | passed |

## 当前结论区

| 项 | 结论 |
| --- | --- |
| P03 是否创建成功 | 否。真实 `std_project/list` 精确项目名回查未命中，`created_objects=0`。 |
| P03 是否可重试 | 否。已有 1 次真实 create action，当前 `failed_waiting_manual_review`，`current_node=7`。 |
| `40000` 根因 | 证据不足，不能伪造确定字段根因；当前结论为 `api_40000_message_not_retained`。 |
| 已排除原因 | 资源 ready、payload contract passed、同名查重未重复、brand_info readback passed、event chain passed、触点 hash matched。 |
| 仍无法证明 | 平台具体错误消息、精确拒绝字段路径。 |
| 新 preflight 阻断项 | fake transport 已验证 `advertiser_id` 非 string、`audience.retargeting_tags_exclude` 非 integer[] 会在 create 前阻断。 |
| 下一步 | 只允许新对话生成新 job 后先 dry-run；P03 禁止再次点击“开始执行”，禁止直接创建。 |

## 完成记录

- 新增 `src/workflows/skills/oe3/create-preflight-diagnostics.mjs`，输出脱敏字段合同诊断：`check_id`、`field_path`、`status`、`expected_type_or_rule`、`actual_shape`、`source`、`blocker_code`、`repair_hint`。
- `create-readiness` 与 executor 的 `prepareStdProjectCreate` 已调用同一份 preflight 结果。
- P03 已补写正式真实回查未命中记录：`RB-JOB-MWBV2-20260824092327-494BF1-STD-PROJECT-REAL`，状态 `not_found_after_create`。
- P03 已写入脱敏诊断 evidence：`EV-JOB-MWBV2-20260824092327-494BF1-API-40000-PREFLIGHT-DIAGNOSIS`。
- 未删除或篡改历史 dry-run 占位记录。

## 验证记录

- `npm run test:execution-grant` passed。
- `npm run test:create-result-mapping` passed。
- `npm run smoke:workflow-skills` passed。
- `npm run smoke:api` passed。
- `npm run smoke:readonly` passed。
- `npm run check:runtime-consistency` passed。
- API 敏感字段扫描 passed。

## 下一步 gate

只允许新对话生成新 job 后再 dry-run；P03 不可重试，不得直接创建。若后续要提升根因确定性，需要单独任务以脱敏方式保留平台错误 `message`/字段码，仍不得保存 raw response。
