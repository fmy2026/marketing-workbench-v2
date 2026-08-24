# TASK-MWBV2-OE3-PRECREATE-RESOURCE-FINALIZE

状态：blocked_waiting_brand_industry_confirmation

更新时间：2026-08-24 CST

## 目标

完成创建 `std_project` 前的资源准备收口：只允许一次 OceanEngine 产品图上传，拿到真实 `image_id` 后回写 Postgres 并 readback；同时对 `brand_info` 做只读确认。本任务仍不执行 `std_project/create`。

## 目标对象

| 字段 | 值 |
| --- | --- |
| `route_id` | `oceanengine_3_byte_mini_game` |
| `game_code` | `JSZC` |
| `advertiser_id` | `1871922175825993` |
| 创建对象 | `std_project` |

## 背景真值

| 项 | 状态 |
| --- | --- |
| v2 素材目录 | `/Users/hys/ProjectAssets/marketing-workbench-v2` |
| 产品图文件 | `/Users/hys/ProjectAssets/marketing-workbench-v2/JSZC/product-image.png` |
| 产品图 asset | `mwb.game_assets.asset_id = PI-JSZC-PRODUCT-IMAGE-001` |
| 产品图资源 | `mwb.account_resources.product_image.source_asset_id = PI-JSZC-PRODUCT-IMAGE-001` |
| 当前缺口 | 产品图缺真实平台 `image_id`；`brand_info` 仍需只读确认 |

## 写入边界

| 类型 | 规则 |
| --- | --- |
| 允许 | OceanEngine 产品图上传一次：`file/image/ad` |
| 确认变量 | `MWBV2_OE_PRODUCT_IMAGE_CONFIRM=PREPARE_ONE_PRODUCT_IMAGE` |
| 最大真实写入 | `1` |
| 禁止 | `std_project/create`、`event asset create`、DMP push、avatar upload、预算/出价修改、promotion/project create、token refresh |
| 停止条件 | 如果产品图上传需要超过 1 个写入动作，立即停止并输出原因 |

## 实现范围

| 文件 | 动作 |
| --- | --- |
| `scripts/account-resource-prepare-product-image-once.mjs` | 完善 once 入口 |
| `src/platforms/oceanengineAccountResourceAdapter.mjs` | 增加产品图预检、单次上传、脱敏结果、Postgres 回写 |
| `src/repositories/postgresRepository.mjs` | 增加产品图平台 ID 和只读状态回写能力 |
| `project.state.json` | 当前任务期间只放开一次产品图上传 |

## 验收

| 标准 | 结果 |
| --- | --- |
| 产品图上传前校验文件存在、hash、尺寸 | passed |
| 未带确认变量时只 dry-run | passed |
| 带确认变量时最多调用一次产品图上传 | passed |
| 上传成功后写回真实 `image_id` | passed |
| 立刻 readback 并更新产品图状态 | passed |
| `brand_info` 给出明确通过或阻断结论 | passed；品牌 fuzzy 通过，行业只读 `api_code=40000`，仍 blocked |
| 7 个 Workflow 节点状态更新 | passed |
| `std_project_create_executor` 仍 locked | passed |
| 未执行 `std_project/create` 或其他平台写入 | passed |
| 无 token/secret/auth_code/Cookie/raw response 泄漏 | passed |

## 执行结果

| 项 | 结果 |
| --- | --- |
| 产品图预检 | passed；PNG `1024 x 1024`；SHA-256 匹配 |
| 产品图上传 | passed；`file/image/ad` 返回 `api_code=0` |
| 真实 `image_id` | `tos-cn-i-sd07hgqsbj/39eabdb27b794b1c8ae146ca7bf5640a` |
| Postgres 回写 | passed；`mwb.account_resources.product_image.platform_resource_id` 已写入 |
| 产品图 readback | passed；`file/image/get` 可查，`readback_status=readback_verified` |
| 查重只读 | passed；已修正为 `/open_api/v3.0/std_project/list/` |
| `brand_info` | blocked；`brand_info` fuzzy passed，`brand_industry` 返回 `api_code=40000` |
| 最新 blocked resources | `brand_info` |
| 当前创建 gate | `blocked`，gapCount=1 |

## 验证结果

| 命令 | 结果 |
| --- | --- |
| `npm run token:status` | passed；credential `valid` |
| `npm run resource:diagnose` | passed；产品图上传前计划可生成 |
| `npm run resource:product-image-once` | passed dry-run；未写平台 |
| `MWBV2_OE_PRODUCT_IMAGE_CONFIRM=PREPARE_ONE_PRODUCT_IMAGE npm run resource:product-image-once` | passed；仅调用一次 `file/image/ad` |
| `npm run resource:readback` | passed；产品图 ready，`brand_info` blocked |
| `npm run smoke:readonly` | passed；`blockedResourceTypes=[brand_info]` |
| `npm run smoke:api` | passed；`prewriteGateStatus=blocked` |
| `npm run test:payload-contract` | passed；`gapCount=1` |

## 7 节点状态

| 节点 | 状态 |
| --- | --- |
| `launch_intake` | passed |
| `creation_context` | passed |
| `game_launch_pack` | passed |
| `account_resource_prepare` | passed，本地资源已 ready；平台只读仍有 `brand_info` gap |
| `std_project_draft_builder` | needs_confirmation |
| `std_project_create_executor` | locked |
| `readback_closer` | waiting |

## 当前阻断

- `product_image` 已完成：有真实 `image_id`，readback 已通过。
- `brand_info` 未完全收口：目标品牌 `巨兽战场` 的品牌 fuzzy 只读通过，但行业只读接口返回 `api_code=40000`，无法证明 `小游戏 / 字节小游戏 / 策略休闲` 已匹配。
- `std_project/create` 继续禁止。

## 下一步

进入 `brand_info` 品牌/行业确认任务；确认通过后重跑 `npm run resource:readback`、`npm run smoke:readonly`、`npm run test:payload-contract`。若 `gapCount=0`，再进入“单次真实创建确认前检查”。

## 验证命令

```bash
npm run token:status
npm run resource:diagnose
MWBV2_OE_PRODUCT_IMAGE_CONFIRM=PREPARE_ONE_PRODUCT_IMAGE npm run resource:product-image-once
npm run resource:readback
npm run smoke:readonly
npm run smoke:api
npm run test:payload-contract
```

## 完成后输出

1. 产品图上传结果和真实 `image_id` 是否取得。
2. 产品图 readback 结果。
3. `brand_info` 确认结论。
4. 最新 blocked resources。
5. 最新 7 节点状态。
6. 是否可以进入“单次真实创建确认前检查”。
