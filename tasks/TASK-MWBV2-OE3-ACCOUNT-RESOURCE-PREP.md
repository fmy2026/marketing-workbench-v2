# TASK-MWBV2-OE3-ACCOUNT-RESOURCE-PREP

状态：blocked_waiting_brand_industry_confirmation

更新时间：2026-08-23 CST

## 目标

进入账户资源补齐阶段，为账户 `1871922175825993` 在 `oceanengine_3_byte_mini_game` / `JSZC` 路线下完成创建 `std_project` 前的资源诊断、补齐计划、受控 once 脚本和只读回查闭环。

## 当前真值

上一任务完成后，v2 已具备独立 OceanEngine 凭据：

| 项 | 状态 |
| --- | --- |
| v2 env | `.local/oceanengine.env`，15 字段精简格式 |
| `token:status` | `valid` |
| 账户来源 | Postgres / workflow，不从 env 推断 |
| 真实创建 | 仍禁止 |

当前以 Postgres 与真实只读 evidence 为准。产品图已在后续任务中完成上传和 readback；最新只读 gate 的真实阻断为：

| 资源 | 当前状态 |
| --- | --- |
| `brand_info` | blocked |

用户粘贴需求中提到的 `avatar`、`event_asset` 已在最新只读回查中通过，本任务仍保留对应 once 脚本入口，但默认输出 no-op plan。

## 范围

| 类型 | 内容 |
| --- | --- |
| 目标 | 账户资源诊断、补齐计划、单次动作脚本骨架、只读 readback |
| 允许真实接口 | 只读 API |
| 默认禁止 | `std_project/create`、素材上传、事件资产创建、DMP 推送、预算/出价修改 |
| 可生成 | avatar / event_asset / product_image 的 once 脚本 |
| 当前写入边界 | `platform_write_allowed=false`，once 脚本即使带确认变量也必须先被 guardrail 拦住 |

## 目标对象

| 字段 | 值 |
| --- | --- |
| `route_id` | `oceanengine_3_byte_mini_game` |
| `game_code` | `JSZC` |
| `advertiser_id` | `1871922175825993` |
| 创建对象 | `std_project` |

## 脚本

| npm script | 作用 |
| --- | --- |
| `resource:diagnose` | 创建一次只读诊断 job，输出账户资源状态和补齐计划 |
| `resource:avatar-once` | 头像补齐 once 入口；无确认变量只输出 dry-run |
| `resource:event-asset-once` | 事件资产补齐 once 入口；无确认变量只输出 dry-run |
| `resource:product-image-once` | 产品图补齐 once 入口；当前产品图已 ready，重复执行应 no-op |
| `resource:readback` | 重跑只读 readback，刷新资源状态摘要 |

确认变量：

```bash
MWBV2_OE_AVATAR_CONFIRM=PREPARE_ONE_ACCOUNT_AVATAR npm run resource:avatar-once
MWBV2_OE_EVENT_ASSET_CONFIRM=PREPARE_ONE_EVENT_ASSET npm run resource:event-asset-once
MWBV2_OE_PRODUCT_IMAGE_CONFIRM=PREPARE_ONE_PRODUCT_IMAGE npm run resource:product-image-once
```

## 验收

| 标准 | 结果 |
| --- | --- |
| `resource:diagnose` 能输出阻断资源状态 | passed |
| 资源来源缺失时明确指出缺什么 | passed |
| 资源来源存在时生成单次补齐 plan | passed；`product_image` 已有 v2 独立文件来源，可进入 once 上传计划 |
| 每个真实补齐动作有独立确认变量 | passed |
| 未带确认变量不调用平台写入 | passed |
| 带确认变量但项目写入红线未打开时仍不调用平台写入 | passed |
| `account_resources` 只读状态被刷新 | passed |
| `std_project/create` 未执行 | passed |
| 无 token/secret/auth_code/Cookie/raw response 泄漏 | passed |

## 已完成

- 新增 `src/platforms/oceanengineAccountResourceAdapter.mjs`。
- 新增 `resource:diagnose`、`resource:avatar-once`、`resource:event-asset-once`、`resource:product-image-once`、`resource:readback`。
- `resource:diagnose` 会创建只读诊断 job，调用真实只读 probe，刷新 7 节点和 `account_resources.metadata.readonly_check`。
- once 脚本未带确认变量时只输出 dry-run plan。
- 后续任务已完成产品图单次上传和 readback，并已收回平台写入权限。
- 生成 `account_resource_plan` 脱敏 evidence。

## 验证结果

| 命令 | 结果 |
| --- | --- |
| `npm run token:status` | passed；credential `valid` |
| `npm run smoke:readonly` | passed；`credentialStatus=ready`，`platformReadonlyStatus=blocked` |
| `npm run smoke:api` | passed |
| `npm run test:payload-contract` | passed |
| `npm run resource:diagnose` | passed；job `JOB-MWBV2-20260823153232-CA8A85` |
| `npm run resource:avatar-once` | passed dry-run；头像 already ready |
| `npm run resource:event-asset-once` | passed dry-run；事件资产 already ready |
| `npm run resource:product-image-once` | passed；产品图已上传并通过 readback |
| `MWBV2_OE_PRODUCT_IMAGE_CONFIRM=PREPARE_ONE_PRODUCT_IMAGE npm run resource:product-image-once` | passed；产品图已完成单次上传，后续不应重复上传 |
| `npm run resource:readback` | passed；当前 blocked resources 为 `brand_info` |

## 当前诊断

| 资源 | 只读状态 | 是否补齐 | 下一步 |
| --- | --- | --- | --- |
| `avatar` | passed | 已 ready | 无需动作 |
| `event_asset` | passed | 已 ready | 无需动作 |
| `product_image` | passed | 已上传并 readback verified | 无需动作 |
| `brand_info` | blocked：`brand_industry_readback_required` | 未补齐 | 确认品牌/行业只读结果 |
| `video_asset` | passed | 已 ready | 无需动作 |
| `dmp_audience_package` | passed | 已 ready | 无需动作 |
| `micro_app_instance` | passed | 已 ready | 无需动作 |

## 7 节点最新状态

| 节点 | 状态 |
| --- | --- |
| `launch_intake` | passed |
| `creation_context` | passed |
| `game_launch_pack` | passed |
| `account_resource_prepare` | repairable |
| `std_project_draft_builder` | needs_confirmation |
| `std_project_create_executor` | locked |
| `readback_closer` | waiting |

## 当前阻断

- `product_image`：v2 独立素材已补齐为 `PI-JSZC-PRODUCT-IMAGE-001`，已取得真实平台 `image_id` 并通过 `file/image/get` readback。
- `brand_info`：品牌只读命中链路仍需要确认品牌/行业结果，本任务不主动修改品牌信息。

## 下一步

等待用户补充：

1. 品牌/行业确认结论。

补齐后重跑 `npm run resource:readback`。若 `prewriteGateStatus` 不再 blocked，可进入“单次真实创建确认前检查”；真实创建仍需单独任务确认。

## 下一步判定

- 若 `brand_info` 的品牌/行业只读仍 blocked：等待品牌/行业确认或补充可用品牌信息。
- 两项通过后，进入“单次真实创建确认前检查”；真实创建仍需另开任务确认。
