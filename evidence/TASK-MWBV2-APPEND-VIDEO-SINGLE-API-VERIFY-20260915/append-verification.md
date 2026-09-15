# 单次追加 API 验收快照

查询时间：2026-09-15 CST。

固定目标为账户 `1875922007036249`、项目 `7684895789612826666`、素材标识码 `4iLE-2`。冻结 Job 为 `JOB-MWBV2-20260915034556-DC2B4A`，Plan 为 `PLAN-JOB-MWBV2-20260915034556-DC2B4A-APPEND-V1`，请求 hash 为 `sha256:c6d8ca45c644a58de2b57b6ff11e423386016f8b6bd906860f59be6fd9e9cb86`。

账户本人确认后仅登记了 1 个 `oc_project_video_append` action，attempt 为 2。该 action 的 HTTP 状态为 200、业务码为 40100，受控结论为明确平台拒绝。首次执行后及两次 5 秒间隔的只读项目素材回查均为 `not_found_or_mismatch`，`verified_count=0`；没有第二次 POST。

权威数据库位置：`mwb.launch_execution_plans`、`mwb.launch_confirmations`、`mwb.platform_actions`、`mwb.readback_records`、`mwb.evidence_artifacts`；当前 Case 投影来自 `mwb.workflow_case_summary`。人员汇总 `mwb.v_user_workflow_summary` 的“已验证成功”不统计追加结果。
