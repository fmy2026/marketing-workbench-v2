# TASK-MWBV2-OE3-TITLE-MATERIALS-GAME-ASSETS-20260829

状态：completed

更新时间：2026-08-29 CST

## Solution Link

| 项 | 值 |
| --- | --- |
| source | 用户确认的“问题三修订：标题作为游戏级素材存入 `game_assets`”；`docs/Solution Design.md`；历史排查文档仅作证据。 |
| objective | 将 JSZC 标题文案作为游戏级 `title_material` 资产存入 `mwb.game_assets`，由既有物料包关联到路线，并在 Node 5、payload contract、create preflight 中阻断非标题素材名兜底。 |
| current truth | PostgreSQL `marketing_workbench_v2.mwb`、当前代码/schema、当前 manifest、官方 `std_project/create` 标题字段合同。 |
| stop condition | 出现平台写入、`std_project/create`、素材更新接口调用、raw payload/response/token 保存、历史失败 draft 复用、或 fresh job 仍有标题合同 blocker 时停止。 |

## 固定对象

| 项 | 值 |
| --- | --- |
| case_id | `CASE-LEGACY-2E4217E20C9E26BFB648772C` |
| route_id | `oceanengine_3_byte_mini_game` |
| game_code | `JSZC` |
| advertiser_id | `1871922346964041` |
| material_pack_id | `MD-JSZC-HUNT-HUNTING-BASELINE-001` |

## 标题素材

| asset_id | 标题 |
| --- | --- |
| `TM-JSZC-HUNT-HUNTING-BASELINE-001-001` | `开局一把枪，装备全靠捡，看你能射多远！` |
| `TM-JSZC-HUNT-HUNTING-BASELINE-001-002` | `3分钟上手，5分钟上头，来试试你能过多少关卡！` |
| `TM-JSZC-HUNT-HUNTING-BASELINE-001-003` | `2026超魔性的休闲策略小游戏，无需下载，点开即玩！` |

## 权限边界

允许：

- 修改本地 Node 5 payload、payload contract、create preflight、smoke、migration 与数据/报表契约文档。
- 在 `mwb.game_assets` 新增三条 `title_material` 游戏级资产。
- 在既有 `mwb.material_packs + mwb.material_pack_items` 中把三条标题资产关联到 JSZC 路线保底包。
- 创建 fresh `runtime_truth` job，显式绑定原 case，仅运行 Node 1-5 的只读/草稿验证。
- 写入本任务卡、Context Manifest、Postgres 运行事实、脱敏字段 manifest 与测试记录。

禁止：

- 调用 `std_project/create`、`tools/project_material_type/update` 或任何平台写接口。
- 生成真实 execution plan、confirmation、platform action、created object 或真实 readback。
- 复用或修改历史失败 draft。
- 保存 token、secret、auth_code、Cookie、完整 URL、raw request、raw response 或 raw payload。
- 新增表、View 或运营报表。

## 验收

- [x] task 与 context manifest 创建，并作为 active task 执行。
- [x] 三条标题作为 `mwb.game_assets.asset_type=title_material` 一行一条落库。
- [x] 三条标题通过既有 `material_pack_items` 关联到 `MD-JSZC-HUNT-HUNTING-BASELINE-001`。
- [x] Node 5 仅从当前物料包 `title_material` item 读取标题，不再自动生成标题，不再从视频/图片 `asset_name` 回退。
- [x] 标题合同覆盖 1-30 条、单条 5-55 字、英文两个字符计一字、非空、去重、文件名特征和素材类型来源。
- [x] payload contract 与 create preflight 都能阻断非法标题。
- [x] final payload manifest 只保存标题素材来源、资产 ID/hash、数量、长度范围、规则版本与 blocker 数，不保存完整标题数组或 raw payload。
- [x] `docs/project-数据与报表契约.md` 明确未来游戏维度汇总链路，不新增报表。
- [x] fresh runtime-truth job 到 Node 5，标题合同通过。
- [x] zero write audit：fresh job 中 execution plan、confirmation、platform action、created object、readback 均为 0。

## 结果记录

| 项 | 结果 |
| --- | --- |
| title assets | `TM-JSZC-HUNT-HUNTING-BASELINE-001-001..003` 已写入 `mwb.game_assets`，`asset_type=title_material`。 |
| pack links | 三条标题通过 `mwb.material_pack_items.item_type=title_material` 关联到 `MD-JSZC-HUNT-HUNTING-BASELINE-001`，排序 `101..103`。 |
| Node 5 | `project_materials.title_material_list` 只来自物料包标题资产；自动标题与视频/图片 `asset_name` 回退已移除。 |
| official contract | `std_project/create`：`title_material_list` 数量 `0-30`，`title` 长度 `5-55`，2 个英文字符占 1 个字符；V2 Gate 要求至少 1 条明确标题资产。 |
| final manifest | 只记录来源、pack、标题资产 ID/hash、数量、长度范围、规则版本与 blocker 计数；`titleMaterialTitles` 不存在。 |
| fresh job | `JOB-MWBV2-20260829131422-9CF5E6` |
| fresh job status | `draft_ready` / Node `5` |
| title manifest | source=`postgres:mwb.material_packs+material_pack_items+game_assets.asset_type=title_material`；count=`3`；min/max=`19/26`；validated=`true`；blocker_count=`0`。 |
| payload contract / create preflight | `passed` / `passed` |
| video-name fallback audit | fresh build title count=`3`；video asset names present=`false`；manifest raw titles stored=`false`。 |

## 审计

| 对象 | 数量 |
| --- | ---: |
| drafts | 1 |
| execution_plans | 0 |
| launch_confirmations | 0 |
| platform_actions | 0 |
| created_objects | 0 |
| readback_records | 0 |

## 验证

- `psql -X -d marketing_workbench_v2 -f db/046_jszc_title_materials_game_assets.sql` passed
- `npm run test:payload-contract` passed
- `npm run smoke:workflow-skills` passed
- `npm run test:aweme-authorization` passed
- `npm run test:mini-game-launch-link` passed
- fresh runtime-truth `draft_readiness` job passed：`JOB-MWBV2-20260829131422-9CF5E6`
- `git diff --check` passed
