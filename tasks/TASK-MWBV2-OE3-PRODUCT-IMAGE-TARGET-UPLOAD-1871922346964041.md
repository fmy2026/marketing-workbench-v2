# TASK-MWBV2-OE3-PRODUCT-IMAGE-TARGET-UPLOAD-1871922346964041

状态：completed_product_image_ready

更新时间：2026-08-28 CST

## 目标

仅解决目标账户 `1871922346964041` 的 `product_image`：以本机原图生成 `108x108` PNG，更新 v2 runtime 产品图资产，并走目标户直接上传加 `file/image/get` 回查闭环。

## 范围

| 项 | 值 |
| --- | --- |
| case | `CASE-LEGACY-2E4217E20C9E26BFB648772C` |
| route | `oceanengine_3_byte_mini_game` |
| game | `JSZC` |
| target advertiser | `1871922346964041` |
| source asset | `PI-JSZC-PRODUCT-IMAGE-001` |
| original image | `/Users/hys/ProjectAssets/marketing-workbench-v2/JSZC/image.png` |
| generated image | `/Users/hys/ProjectAssets/marketing-workbench-v2/JSZC/product_image_108*108.png` |

## 写入边界

| 类型 | 规则 |
| --- | --- |
| 允许 | 一次目标户 `file/image/ad` 文件上传 |
| 动作 | `ensure_resource:product_image` |
| 最大平台写入 | `1` |
| 禁止 | URL 上传、跨账户共享、token refresh、`std_project/create`、DMP、视频、头像、事件、小程序实例 |
| 回查 | 只接受目标账户 `file/image/get` 中 `image_id/material_id + 108x108 + png + md5` 精确命中 |

## 官方依据

| 依据 | 本机来源 |
| --- | --- |
| 产品主图尺寸 | `open.oceanengine.com-3.0-waibugei/巨量营销智擎版/创建标准项目.md:165` |
| 图片上传 | `open.oceanengine.com-2.0-copy/12-素材管理.md:894` |
| 图片回查 | `open.oceanengine.com-2.0-copy/12-素材管理.md:2155` |

## 当前验收

- [x] 生成图为 `108x108 PNG`，不覆盖原图。
- [x] `mwb.game_assets.PI-JSZC-PRODUCT-IMAGE-001` 指向生成图并记录脱敏 hash/尺寸 metadata。
- [x] execution plan 只新增 `ensure_resource:product_image` 资源准备动作。
- [x] 若目标已命中同图，则 no-op 并标记 `visible + readback_verified`。
- [x] 若目标未命中，则最多一次上传，并以 `file/image/get` 通过后更新 `account_resources.product_image`。
- [x] `micro_app_instance` blocker 保持独立有效，不触发创建流程。

## 执行结果

| 项 | 结果 |
| --- | --- |
| 生成图 | passed；`108x108 PNG`，大小 `30691` bytes |
| source asset | passed；`asset_ref=/Users/hys/ProjectAssets/marketing-workbench-v2/JSZC/product_image_108*108.png` |
| source hash | `sha256:46ad4d14069a5b70c318d2a88c4bc57445785091833ae673a4df864072dec645` |
| 目标上传 | called once；`file/image/ad` 返回 `api_code=0`，取得 image/material 标识 |
| 第一次写后回查 | blocked；目标素材库未立即收敛 |
| 复核回查 | passed；按 signature/尺寸命中目标户同图 |
| `account_resources.product_image` | `visible + readback_verified` |
| token refresh | 未调用 |
| 其他资源 | 未处理；`micro_app_instance` 仍是独立 blocker |

## 验收结果

| 命令/检查 | 结果 |
| --- | --- |
| `npm run test:product-image-executor` | passed |
| `npm run test:resource-action-registry` | passed |
| `npm run test:node4-resource-prep-contracts` | passed |
| `npm run test:payload-contract` | passed |
| `git diff --check` | passed |
