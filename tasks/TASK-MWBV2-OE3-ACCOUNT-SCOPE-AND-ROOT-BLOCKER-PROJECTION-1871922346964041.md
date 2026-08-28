# TASK-MWBV2-OE3-ACCOUNT-SCOPE-AND-ROOT-BLOCKER-PROJECTION-1871922346964041

状态：completed

## 目标

移除 Node 2 生产入口的账户 fallback，以显式 case 或完整账户 scope 驱动 monitor/乾坤只读与计划；同时把 Node 5 的叶子 blocker 投影到 execution plan 与 case summary。目标账户仅运行 fresh readonly 验证。

## 边界

- 禁止 `std_project/create`、monitor 创建、素材上传、token refresh、预算或出价修改。
- 只允许本地代码、Postgres runtime job/plan/evidence 与脱敏诊断写入。
- `instance_id` 保持数字字符串；缺少官方长数字传输合同仍必须阻断创建。

## 验收

- 缺少 `case_id` 或完整 `route_id + game_code + advertiser_id` 时，monitor CLI 返回 `explicit_account_scope_required`。
- Node 2 不再从代码常量取得生产 target；L3 覆盖仅使用精确 scope 的 evidence。
- 当前 case summary 直接显示 `instance_id_long_id_transport_not_verified`，并保留 `draft_not_ready_for_std_project_create` 结构状态。
- fresh readonly job 的 Node 1-4 passed、Node 5 repairable、Node 6 locked、Node 7 waiting，平台写入为 0。

## 结果

- 生产 monitor/乾坤 CLI 已取消账户默认值：必须提供 `case_id`，或完整 `route_id + game_code + advertiser_id`；缺失时返回 `explicit_account_scope_required`，且不创建 job、plan 或平台动作。
- 人工 L3 覆盖改为读取精确 `route_id + game_code + advertiser_id + provision_id` 的受控 evidence；缺失、不匹配、无有效期或过期证据均不生效。
- `launch_execution_plans.metadata.root_blocker_codes` 与 `mwb.workflow_case_summary` 已新增叶子 blocker 投影；结构 blocker 仍保存在 `structural_blocker_codes`。
- fresh readonly job：`JOB-MWBV2-20260828093157-210B29`。Node 1–4 passed，Node 5 repairable，Node 6 locked，Node 7 waiting；平台 action、创建确认、创建对象均为 0。
- 当前 case 的用户可见 blocker 为 `instance_id_long_id_transport_not_verified`；创建仍未被授权。
