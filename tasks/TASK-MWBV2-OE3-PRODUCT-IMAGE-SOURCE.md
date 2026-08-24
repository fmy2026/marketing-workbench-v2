# TASK-MWBV2-OE3-PRODUCT-IMAGE-SOURCE

状态：completed

更新时间：2026-08-23 CST

## 目标

补齐 `product_image` 的真实素材来源：从旧素材目录一次性选择并复制产品图到 v2 独立素材目录，写入 v2 Postgres `mwb.game_assets`，并更新 `mwb.account_resources.product_image` 的 `source_asset_id`。

## 背景

当前 Postgres 中存在 `product_image` 账户资源记录，但它指向的是产品身份记录，不是图片素材：

| 字段 | 当前值 |
| --- | --- |
| `resource_type` | `product_image` |
| `source_asset_id` | `PI-JSZC-HUNT-BASELINE-001` |
| `source asset_type` | `product_identity` |
| `platform_resource_id` | `PI-JSZC-HUNT-LONE-WOLF-108`，seed/占位式 ID |
| 只读缺口 | `platform_resource_id_missing` |

准确说：Postgres 里有产品图需求记录，但没有产品图本体。

## 本任务范围

| 类型 | 内容 |
| --- | --- |
| 目标 | 补齐本地 v2 产品图素材文件和 Postgres 素材引用 |
| 旧目录 | `/Users/hys/ProjectAssets/marketing-workbench` 只作一次性来源参考 |
| 新目录 | `/Users/hys/ProjectAssets/marketing-workbench-v2/JSZC/product-image.png` |
| 数据库 | `marketing_workbench_v2.mwb.game_assets`、`mwb.account_resources` |
| 非目标 | 不上传素材、不调用平台写入、不执行 `std_project/create` |

## 目标记录

新增或更新：

| 字段 | 值 |
| --- | --- |
| `asset_id` | `PI-JSZC-PRODUCT-IMAGE-001` |
| `game_code` | `JSZC` |
| `asset_type` | `product_image` |
| `asset_name` | `巨兽战场产品图` |
| `asset_ref` | `/Users/hys/ProjectAssets/marketing-workbench-v2/JSZC/product-image.png` |
| `asset_hash` | 文件 SHA-256 |
| `visibility_status` | `active` |
| `source_usage` | `private_runtime` |

更新：

| 表 | 字段 |
| --- | --- |
| `mwb.account_resources` | `source_asset_id = PI-JSZC-PRODUCT-IMAGE-001` |
| `mwb.account_resources` | `platform_resource_id = null` |
| `mwb.account_resources` | `visibility_status = needs_confirmation` |
| `mwb.account_resources` | `readback_status = needs_confirmation` |

## 验收

| 标准 | 结果 |
| --- | --- |
| 复制 v2 独立产品图文件 | passed |
| 图片尺寸和 SHA-256 已计算 | passed |
| `mwb.game_assets` 有 `product_image` 记录 | passed |
| `mwb.account_resources.product_image` 指向新 `source_asset_id` | passed |
| `npm run resource:diagnose` 可识别产品图已有可上传来源 | passed |
| 未执行真实上传/平台写入/std_project 创建 | passed |
| 素材文件不进入 Git | passed |

## 完成结果

| 项 | 值 |
| --- | --- |
| 旧素材来源 | `/Users/hys/ProjectAssets/marketing-workbench/source-materials/jushou-hunt/icons/ICON-JSZC-HUNT-BASELINE-001/ICON-JSZC-HUNT-BASELINE-001-triceratops-1024.png` |
| v2 新素材路径 | `/Users/hys/ProjectAssets/marketing-workbench-v2/JSZC/product-image.png` |
| 图片格式 | PNG |
| 尺寸 | `1024 x 1024` |
| SHA-256 | `5c9a0395bd05204575345178ec23d0df8465dd364faff5b749060b81db7245b8` |
| `game_assets.asset_id` | `PI-JSZC-PRODUCT-IMAGE-001` |
| `game_assets.asset_type` | `product_image` |
| `game_assets.source_usage` | `private_runtime` |
| `account_resources.source_asset_id` | `PI-JSZC-PRODUCT-IMAGE-001` |
| `account_resources.platform_resource_id` | `null` |

## 验证结果

| 命令 | 结果 |
| --- | --- |
| `sips -g pixelWidth -g pixelHeight` | passed；`1024 x 1024` |
| `shasum -a 256` | passed |
| Postgres `game_assets/account_resources` 查询 | passed |
| `npm run resource:diagnose` | passed；产品图 `action=prepare_product_image_once` |
| `npm run resource:product-image-once` | passed dry-run；等待确认变量和写入 gate |
| `npm run resource:readback` | passed；仍 blocked，因为尚未真实上传取得平台 image_id |

## 下一步

产品图现在已有 v2 独立本地来源。下一步不是再找素材，而是：

1. 另开或恢复账户资源补齐任务，执行产品图单次上传确认前检查。
2. 处理 `brand_info` 的品牌/行业确认。
3. 继续禁止 `std_project/create`，直到资源 gate 全部通过。
