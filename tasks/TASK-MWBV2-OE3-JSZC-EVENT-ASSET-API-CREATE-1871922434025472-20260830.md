# TASK-MWBV2-OE3-JSZC-EVENT-ASSET-API-CREATE-1871922434025472-20260830

状态：blocked_after_event_asset_create_post_readback_not_verified

## 目标

在账户 `1871922434025472` 上单独打通 JSZC `event_asset` 的 API 自动创建，并把机制收敛为唯一串联链路：

```text
目标账户事件资产只读回查
→ 已存在且唯一：optimized_goal + dbt 回查后 READY
→ 不存在：按本地官方 2.0 创建合同单次创建 MINI_PROGRAME
→ 资产列表/详情回查
→ optimized_goal/get 回查
→ dbt/get 回查
→ READY 或 BLOCKED
```

## 已确认事实

- Case：`CASE-MWBV2-3CDAF4E9202381253E`；Job：`JOB-MWBV2-20260830140153-667873`。
- 当前目标账户权威 blocker：`event_asset_target_not_found`。
- 参考账户 `1871922346964041` 只提供“已有事件资产后的只读验证”经验，不提供创建动作或创建参数。
- v2 `platform_actions` 当前没有 `oceanengine_event_asset_create` 或 `/event_manager/assets/create/` 创建成功记录；本任务是首次 API 自动创建补证。
- 本任务依据限定为本地 `docs/Solution Design.md`、本地官方 2.0 资产接口资料、Postgres `marketing_workbench_v2.mwb`。

## 范围

- 将 `event_asset` 升级为经合同/模板校验后可计划的正式资源动作。
- 新增 `src/platforms/oceanengineEventAssetExecutor.mjs`，真实平台动作类型固定为 `oceanengine_event_asset_create`。
- 新增 plan-bound scope 校验：仅 V2 plan、当前 Job、当前 advertiser、`ensure_resource:event_asset`、单次平台写调用。
- 新增 V2 单资源计划：`PLAN-JOB-MWBV2-20260830140153-667873-V2`，只包含 `ensure_resource:event_asset`。
- 创建后必须复用现有事件链只读回查；只有事件资产、小程序实例、optimized_goal、dbt 均通过，才写 `visible + readback_verified`。

## 禁止范围

- 不包含头像、DMP、视频、产品图、备用页、标准项目创建、Promotion、预算、出价或 token 刷新。
- 不保存 raw payload、完整 URL、token、Cookie、secret、auth_code 或 raw response。
- 不因 POST 成功就直接信任响应；没有写后回查唯一通过，不写 READY。
- 创建失败、权限不足、接口不支持、候选歧义、App/instance 不匹配或任一回查失败时，不自动重试。

## 人工 gate

真实 POST 前必须满足同一份 V2 plan：

1. `PLAN-JOB-MWBV2-20260830140153-667873-V2` 已保存且 plan hash 可复现。
2. 用户确认 exact plan hash。
3. `project.state.json.guardrails.platform_write_allowed=true` 仅授予该 Job/Plan/action。
4. `launch_confirmations` 记录 `confirmed_for_execution_plan`，metadata 中 plan hash 与 V2 完全一致。

## 验收

- 自动化覆盖已有资产零写入、缺失后单次创建并回查、重复执行不重复创建、多候选/App 或 instance 不匹配、创建成功但回查失败、接口失败。
- V2 plan 只含 `ensure_resource:event_asset`；确认前平台写入为零。
- 真实验收时，账户 `1871922434025472` 的 `event_asset` 与 `micro_app_instance` 均为 `visible + readback_verified`，Case summary 不再显示 `event_asset_target_not_found`。

## 当前 V2 Plan

- plan_id：`PLAN-JOB-MWBV2-20260830140153-667873-V2`
- plan_hash：`sha256:1b491dc867ce162cf2b1045c4d8ef3f77fde6dcf0d47796891433be750c52376`
- action：`ensure_resource:event_asset`
- status：`ready`
- blocker_codes：`[]`
- 生成计划时平台写入：`false`

## 执行结果

- confirmation_id：`CONFIRM-JOB-MWBV2-20260830140153-667873-EVENT-ASSET-V2`
- 高层计划动作：`ensure_resource:event_asset`，结果 `failed_once`
- 真实平台动作：`oceanengine_event_asset_create`
- endpoint path：`/open_api/2/event_manager/assets/create/`
- method：`POST`
- 平台返回：HTTP `200`，API code `0`，`request_id_present=true`，`asset_id_present=true`
- 写后回查：`event_asset_readback_not_verified`
- 当前 blocker：`event_asset_app_binding_unverified`
- 写后事件资产库存：`inventory_candidates=1`，`app_bound_candidates=0`
- `optimized_goal/get`：未调用；原因是资产 App 绑定未验证
- `dbt/get`：未调用；原因是资产 App 绑定未验证
- `event_asset` / `micro_app_instance` 仍保持 `needs_confirmation + not_checked`
- 平台写入调用次数：`1`
- token refresh：`false`
- payload/response 持久化：`false`

## BLOCKED 结论

本次 API 创建动作本身成功返回，但唯一底层机制不能巩固为“验证通过”：

```text
POST 成功
→ 写后 list/detail 看到 1 个 MINI_PROGRAME 候选
→ 未验证到当前 App/instance 绑定
→ optimized_goal/dbt 不继续调用
→ BLOCKED
```

下一步只能做 fresh read-only 诊断或人工平台核对该新事件资产的 App 绑定；本 Job 不允许二次创建。

## 停止条件

- 本地合同/模板 hash 不吻合。
- 平台返回不支持、权限不足或字段无效。
- 创建后资产列表/详情、optimized_goal/get 或 dbt/get 任一不通过。
- 出现多个可用候选或 App/instance 绑定歧义。
