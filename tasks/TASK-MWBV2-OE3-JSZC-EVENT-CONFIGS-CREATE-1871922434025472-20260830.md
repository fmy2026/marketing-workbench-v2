# TASK-MWBV2-OE3-JSZC-EVENT-CONFIGS-CREATE-1871922434025472-20260830

状态：completed_event_chain_ready

## 目标

在账户 `1871922434025472` 上，为已创建的 JSZC `MINI_PROGRAME` 事件资产补齐游戏 baseline 事件配置，并用事件链只读回查收口：

```text
事件资产已存在
→ available_events/get 获取本资产 event_id
→ events/create 仅创建缺失 baseline 事件
→ event_configs/get 回查 6/6
→ optimized_goal/get 回查 PAY + PURCHASE_ROI_7D
→ dbt/get 回查 PER_AND_SEVEN_PAY_ROI
→ event_asset + micro_app_instance READY 或 BLOCKED
```

## 已确认事实

- Case：`CASE-MWBV2-3CDAF4E9202381253E`；Job：`JOB-MWBV2-20260830140153-667873`。
- 上一任务已执行一次真实 `event_manager/assets/create`，平台返回 HTTP `200`、API code `0`、`asset_id_present=true`。
- 上一任务写后 API 只读链路曾阻断在 `event_asset_app_binding_unverified`；本任务完成后 `event_asset` 与 `micro_app_instance` 已经通过 API 回查写为 READY。
- 用户截图显示平台事件资产页已可见「巨兽战场」，URL 路径中的事件资产 ID 为 `1874962943118532`；页面同时显示小程序 AppID `tte95a9fe77665844607` 与小程序资产 ID `7434750138926546994`。
- 本任务不重建事件资产，只补资产下事件配置。

## 范围

- 新增 `ensure_event_configs:baseline` 计划动作，真实平台动作类型固定为 `oceanengine_event_config_create`。
- 官方 2.0 创建接口固定为 `POST /open_api/2/event_manager/events/create/`。
- 每次创建只传 `advertiser_id`、`asset_id`、`event_id`、`track_types=["MINI_PROGRAME_API"]`。
- `event_id` 必须来自目标账户、目标资产自己的 `available_events/get`，不得复用其他账户或旧库 event_id。
- baseline 事件固定为：`active`、`active_register`、`active_pay`、`purchase_roi`、`purchase_roi_7d`、`purchase_roi_30d`。
- 最终通过 `PLAN-JOB-MWBV2-20260830140153-667873-V8` 收口；真实创建发生在 V7，V8 为 no-op READY 回查。

## 禁止范围

- 不创建第二个事件资产。
- 不创建标准项目、Promotion 或监测链接组。
- 不处理头像、DMP、视频、产品图、备用页。
- 不修改预算、出价、项目名或投放策略。
- 不刷新 OAuth token。
- 不保存 token、Cookie、secret、auth_code、raw payload、raw response 或完整 URL。
- 任一 POST 失败或写后回查失败时不自动重试。

## 人工 gate

真实 `events/create` 前已满足：

1. `PLAN-JOB-MWBV2-20260830140153-667873-V8` 已保存且 plan hash 可复现。
2. 用户确认 exact V8 plan hash。
3. `project.state.json.guardrails.platform_write_allowed=true` 仅授予当前 Job/Plan/action。
4. `launch_confirmations` 记录 `confirmed_for_execution_plan`，metadata 中 plan hash 与 V8 完全一致。

## 验收

- 写前 `all_assets/list + detail` 能确认唯一目标事件资产或命中 V8 绑定的 asset id。
- 写前 `available_events/get` 覆盖 6 个 baseline 事件，且每个事件包含 `MINI_PROGRAME_API`。
- 写前 `event_configs/get` 只计算缺失项；已存在事件不重复创建。
- 写后 `event_configs/get` 验证 6/6 baseline。
- 写后 `optimized_goal/get` 验证 `AD_CONVERT_TYPE_PAY + AD_CONVERT_TYPE_PURCHASE_ROI_7D`。
- 写后 `dbt/get` 验证 `PER_AND_SEVEN_PAY_ROI`。
- 通过后 `event_asset` 与 `micro_app_instance` 均写为 `visible + readback_verified`。
- Case summary 不再以事件资产/小游戏实例为当前 blocker。

## 最终 V8 Plan

- plan_id：`PLAN-JOB-MWBV2-20260830140153-667873-V8`
- plan_hash：`sha256:0ec98922195eba2b4fca8971251e7520c043097ec2cb5fba938cf96fcc7b741b`
- action：`ensure_event_configs:baseline`
- platform_action_type：`oceanengine_event_config_create`
- endpoint path：`/open_api/2/event_manager/events/create/`
- method：`POST`
- max_platform_calls：`6`
- status：`passed`
- blocker_codes：`[]`
- V8 执行时平台写入：`false`（no-op 回查收口）

## 执行审计

- `PLAN-JOB-MWBV2-20260830140153-667873-V3` 已在首次确认执行中写前停止，未调用 `oceanengine_event_config_create`。
- 停止原因：orchestrator 未把 V3 action 的事件资产 ID hint 显式传入事件配置 executor；该实现问题已修复。
- `PLAN-JOB-MWBV2-20260830140153-667873-V4` 已在第二次确认执行中写前停止，未调用 `oceanengine_event_config_create`。
- 停止原因：orchestrator 的 internal claim action id 只绑定 job/action，未绑定 plan id，导致 V3 的失败 claim 挡住 V4；该实现问题已修复。
- `PLAN-JOB-MWBV2-20260830140153-667873-V5` 已在第三次确认执行中写前停止，未调用 `oceanengine_event_config_create`。
- 停止原因：orchestrator internal claim 的 idempotency key 未绑定 plan id，导致 V3 的 idempotency key 挡住 V5；该实现问题已修复。
- `PLAN-JOB-MWBV2-20260830140153-667873-V6` 已进入业务预检并写前停止，未调用 `oceanengine_event_config_create`；停止原因是 `all_assets/detail` 参数需要 JSON 数字数组而非字符串数组，该实现问题已修复。
- `PLAN-JOB-MWBV2-20260830140153-667873-V7` 已真实调用 `events/create` 6 次，6 次均成功，均未保存 raw payload/response；写后因 `available_events/get` 创建后列表语义变化被误判阻断，该实现问题已修复。
- `PLAN-JOB-MWBV2-20260830140153-667873-V8` 已 no-op 回查通过：`event_configs/get` 返回 6/6 baseline，`optimized_goal/get` 与 `dbt/get` 均通过，`event_asset` 与 `micro_app_instance` 已写为 `visible + readback_verified`。

## 停止条件

- 找不到唯一事件资产，或 V8 绑定的事件资产 ID 不在目标账户库存中。
- `available_events/get` 缺任一 baseline 事件。
- `event_configs/get` 写前/写后失败。
- 任一 `events/create` 返回 API code 非 `0` 或传输失败。
- 写后 baseline 事件配置不是 6/6。
- `optimized_goal/get` 或 `dbt/get` 仍不通过。
- 出现资产候选歧义、App/instance 不匹配或平台权限不足。
