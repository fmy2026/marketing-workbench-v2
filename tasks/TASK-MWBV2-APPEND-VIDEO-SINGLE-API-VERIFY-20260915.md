# TASK-MWBV2-APPEND-VIDEO-SINGLE-API-VERIFY-20260915

任务状态、读取清单与验证结果：[Context Manifest](../tasks-context-manifests/TASK-MWBV2-APPEND-VIDEO-SINGLE-API-VERIFY-20260915.json)。

## 目标

为 Case `CASE-MWBV2-718FF962130E387B3A` 准备并冻结仅追加素材标识码 `4iLE-2` 的单次项目视频追加请求；在账户本人针对冻结请求明确确认后，最多调用一次平台追加接口，并以项目素材权威回查确认实际结果。全过程仅保存脱敏审计、hash 与回查证据，随后基于真实结果修复通用跨 Job 幂等与收口机制。

## 批准方案

用户批准专项单次验证：账户 `1875922007036249`、项目 `7684895789612826666`、素材标识码 `4iLE-2`（严格大小写）和 Case 固定。先执行只读库存、项目素材、引导视频和封面合同核验，建立新诊断 Job、冻结单项 Plan 与预览；只有在 Codex 展示冻结的 Plan、视频 ID、请求 hash、调用上限及上一次平台 action 状态后，账户本人明确确认，才开启一次精确的 POST 授权。历史确认和 action 不修改、不重放；平台结果不明只读回查，不自动重试。

## 范围

允许建立当前 Task 和 Context Manifest，创建任务私有的一次性预检/执行器与脱敏证据，按专项授权写入本 Case 的新诊断 Job、Plan、confirmation、action、readback 和 evidence 记录；允许更新临时精确 Guardrail 以绑定已冻结 Job、Plan、hash、账户、项目、动作 `oc_project_video_append` 和一次调用；允许基于真实结果修改通用追加执行器、Postgres repository、必要 migration、回归测试、当前机制/数据/部署文档，并发布固定 release 到既有公司模式服务。

## 非目标

不执行素材推送、项目创建、预算或出价修改；不复用或修改历史确认/action；不新增 package 入口、长期 API 旁路、账户专用 runtime 分支、Node 或 Gate；不输出或保存 token、Cookie、secret、原始请求、原始响应或完整触点 URL；不在本人确认前调用追加 POST。

## 验收

- AC-01: Task、Manifest 与当前指针通过启动检查；专项授权限定到账户、项目、`4iLE-2`、一份新 Plan 和最多一次追加 POST。
- AC-02: 只读预检精确匹配目标账户库存中的 `4iLE-2`，核验项目当前素材、引导视频和封面合同；若已在项目或存在历史结果不明，则零 POST 收口并保存脱敏证据。
- AC-03: 预检通过时生成新诊断 Job、单项冻结 Plan 与预览；预览展示脱敏视频绑定、Plan/hash、请求字段清单、历史 action 状态及一次调用上限，且同一 Plan 不会生成第二份确认。
- AC-04: 仅在账户本人明确确认冻结请求后，原子记录 confirmation 和 action claim，最多发送一次 `POST /open_api/v3.0/oc_project/material/create/`；重复执行不产生第二次 POST。
- AC-05: POST 后记录 HTTP/业务码的受控摘要、hash 和权威项目素材回查；只有目标视频可见才记为 `readback_verified`，否则停止或仅回查。
- AC-06: 交付只读专项核验 SQL 和带时间的脱敏快照，能关联本次素材标识码、账户、项目、Job、Plan、确认、发送次数、结果摘要和最新回查；Case 页面投影与记录一致。
- AC-07: 根据真实证据修复通用跨 Job 幂等键与零动作/结果收口，覆盖重复调用、旧 action、明确拒绝、结果不明和成功回查回归；通过检查后提交、推送、发布并核验 `192.168.42.7:3000` 运行版本。
- AC-08: 关闭 Task 前撤销专项 Guardrail、清除 Task 私有可执行入口并将其归档，保留 Postgres 审计和脱敏验收证据；完成 before-close 与 after-close 检查。

## 停止条件

预检无法唯一匹配 `4iLE-2`、视频已存在、项目/引导视频/封面合同漂移、历史结果尚未澄清、Case 额度或 20 秒冷却不满足、账户本人未明确确认冻结预览、或任何步骤需要第二次 POST 时，停止平台写入并记录真实原因。凭据不可用、平台返回拒绝/超时、权威查询失败或发布重载失败时不重发；仅在 Task 范围内收口和报告。

## 交付说明

完成后在 Manifest 中记录专项 Plan/confirmation/action/readback 的 Postgres 证据引用、专项核验快照、通用修复 revision 与在线 release SHA。`mwb.v_user_workflow_summary` 的已验证成功只统计项目创建；本次追加的验收以专项核验 SQL、`platform_actions`、`readback_records`、`evidence_artifacts` 和 Case 的 `project_video_append_completed` Gate 为准。
