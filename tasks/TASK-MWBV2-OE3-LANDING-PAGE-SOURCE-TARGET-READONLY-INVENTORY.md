# TASK-MWBV2-OE3-LANDING-PAGE-SOURCE-TARGET-READONLY-INVENTORY

状态：completed_blocked_at_gate

更新时间：2026-08-25 CST

## Brief

本任务承接“物料户共享落地页库存 -> 目标账户可见性 -> 默认备用页选择”的新需求，目标是让 v2 独立沉淀 OE3 字节小游戏备用网页落地页真值：

```text
物料户 1760246749825031 全量落地页库存
-> mwb.landing_page_assets
-> 目标账户 1871922175825993 可见/可选性读取
-> mwb.account_resources
-> 脱敏证据 mwb.evidence_artifacts
-> 默认备用页选择 gate
```

本任务只读本机官方资料与 v2 Postgres；未调用 OceanEngine，未刷新 token，未执行任何平台写入。

## 合理性评估

方向合理：`mwb.landing_page_assets` 作为游戏 × 路线共享资产表，`mwb.account_resources` 作为目标账户可见性表，是当前最合理的位置；不应把落地页库存塞进 `launch_jobs`、`launch_drafts` 或 `project.state.json`。

当前限制：本机官方创建文档只确认 `project_materials.external_url_material_list` 是落地页链接，并指向“通过优化目标获取橙子落地页站点信息”；同时 `web_url_material_list` 的来源指向“获取橙子建站站点列表”。但本机官方资料中没有找到“获取橙子建站站点列表”的完整接口正文、请求参数和响应字段，因此不能自动调用未知站点列表端点，也不能把历史 `site_id` 拼成 URL。

本任务落地结果是：模型、候选、检查入口和阻断证据已就绪；下一步需要补入本机官方站点列表接口资料，或由受控只读返回完整 HTTPS URL 后重跑。

## 固定范围

| 项 | 值 |
| --- | --- |
| `route_id` | `oceanengine_3_byte_mini_game` |
| `game_code` | `JSZC` |
| 物料户 advertiser_id | `1760246749825031` |
| 目标账户 advertiser_id | `1871922175825993` |
| 资产类型 | `backup_landing_page` |
| 创建对象 | `std_project`，本任务不创建 |

## 历史候选

以下记录仅作为读取和比对线索，不是当前可用事实：

| asset_id | site_id | site_name | 默认 |
| --- | --- | --- | --- |
| `LPA-JSZC-OE3-BACKUP-001` | `7624750304608649243` | `巨兽战场-抖音小游戏-狙击狩猎` | 是 |
| `LPA-JSZC-OE3-BACKUP-002` | `7450371049210462218` | `巨兽战场-抖音小游戏-吃肉` | 否 |
| `LPA-JSZC-OE3-BACKUP-003` | `7450398108389376051` | `巨兽战场-抖音小游戏-螺丝` | 否 |
| `LPA-JSZC-OE3-BACKUP-004` | `7582805366296346662` | `巨兽战场-抖小-狙击` | 否 |

## 实现范围

- 新增 migration：`db/019_landing_page_inventory_readonly_states.sql`。
- 新增长期检查脚本：`scripts/oe3-landing-page-source-target-readonly-inventory.mjs`。
- 新增 package script：`npm run check:oe3-landing-page-inventory`。
- 扩展 repository：`upsertLandingPageAsset()`。
- 新建本任务 task 与 context manifest。
- 更新 `project.state.json` 记录本任务关闭和下一 gate。

## 数据库记录规则

`mwb.landing_page_assets`：

- 保存物料户共享候选，`site_id` 按 text 保存。
- 完整 URL 只允许进入受控列 `landing_url`。
- `metadata` 不得保存完整 URL。
- 未经平台只读验证时保持 `source_usage=reference_only`、`status=reference_candidate`。

`mwb.account_resources`：

- 每个候选页在目标账户下单独记录。
- `resource_type=backup_landing_page`。
- `platform_resource_id=site_id`。
- `source_asset_id=landing_page_asset_id`。
- 当前未完成平台只读验证时保持 `visibility_status=unknown`、`readback_status=not_checked`。

`mwb.evidence_artifacts`：

- `artifact_type=oceanengine_landing_page_source_readonly`
- `artifact_type=oceanengine_landing_page_target_readonly`
- 只保存状态、数量、hash、文档路径和阻断码。
- 不保存完整 URL、raw request、raw response。

## 当前结论

当前检查状态：

```text
blocked_local_official_site_list_endpoint_missing
```

阻断原因：

- 本机官方创建文档能证明 `external_url_material_list` 是落地页链接。
- 本机官方创建文档能证明存在“橙子落地页站点信息/橙子建站站点列表”的来源方向。
- 本机资料里没有找到“获取橙子建站站点列表”的完整接口正文。
- 因此 v2 不能调用未知只读 endpoint，也不能拼接或猜测完整 URL。

## 非目标

- 不新建 fresh job。
- 不调用 `std_project/create`。
- 不预置 execution grant。
- 不修改失败 job。
- 不刷新 token。
- 不创建、修改、共享、删除落地页。
- 不上传素材、不创建事件资产、不推送 DMP、不改预算或出价。
- 不依赖旧项目作为运行真值。

## 验证

| 命令 | 结果 |
| --- | --- |
| `psql -X -d marketing_workbench_v2 -f db/019_landing_page_inventory_readonly_states.sql` | passed |
| `npm run check:oe3-landing-page-inventory` | passed，输出当前 blocker，不写库 |
| `node scripts/oe3-landing-page-source-target-readonly-inventory.mjs --record` | passed，写入脱敏 evidence 和候选资源状态 |
| `npm run test:payload-contract` | passed |
| `npm run smoke:api` | passed |
| `node --check scripts/oe3-landing-page-source-target-readonly-inventory.mjs src/repositories/postgresRepository.mjs` | passed |

## 下一步 Gate

补入本机官方“获取橙子建站站点列表”接口正文，或通过受控只读方式取得物料户返回的完整 HTTPS URL，再重跑：

```bash
npm run check:oe3-landing-page-inventory -- --record
```

只有默认页同时满足 `active + HTTPS + url_hash 一致 + target visible + readback_verified` 后，才可进入 fresh runtime job 与单次创建确认任务。
