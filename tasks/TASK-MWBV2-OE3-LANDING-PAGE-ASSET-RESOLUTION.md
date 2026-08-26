# TASK-MWBV2-OE3-LANDING-PAGE-ASSET-RESOLUTION

状态：completed

更新时间：2026-08-25 CST

## 目标

补齐 v2 字节小游戏 3.0 的备用网页落地页底层能力：

```text
游戏 × 路线共享备用网页资产
-> 目标账户可见性/可选性回查
-> 节点 3 解析默认资产
-> 节点 4 验证账户资源
-> 节点 5 编译 project_materials.external_url_material_list
-> 只有新 fresh job 且只读 gate 全通过后，才可另建单次真实创建授权任务
```

本任务只做数据库、repository、OE3 Skill、payload 合同、API/前端摘要和测试；不执行 `std_project/create`。

## 背景

当前 v2 已能编译：

```text
project_materials.mini_program_info.app_id
project_materials.mini_program_info.url
```

但尚未编译：

```text
project_materials.external_url_material_list
```

因此备用网页链接未进入创建前硬检查，也不能复用历史 job / draft / payload hash / create scope。历史 job `JOB-MWBV2-20260825041227-12D2B5` 只作为只读案例，不重试、不复用。

## 范围

- 新增 `mwb.landing_page_assets`。
- 扩展 `mwb.account_resources.resource_type`，支持 `backup_landing_page`。
- 导入 JSZC + OE3 路线的历史候选落地页 ID，候选不伪造 URL、不标记 active。
- repository 返回默认备用页安全摘要和受控 URL 读取方法。
- Workflow 节点 3 解析默认备用页摘要。
- Workflow 节点 4 增加 `backup_landing_page` 资源检查。
- Workflow 节点 5 在受控 payload 内加入 `project_materials.external_url_material_list`。
- payload summary / API / 前端只展示 asset id、site id、site name、url hash、状态，不展示完整 URL。
- payload contract / preflight 增加备用页硬 gate。

## 非目标

- 不执行 `std_project/create`。
- 不创建或修改 OceanEngine 落地页。
- 不上传素材、不绑定素材、不创建事件资产、不推 DMP。
- 不修改预算、出价或已存在历史 job 状态。
- 不刷新 token。
- 不把旧项目路径作为 v2 运行依赖。

## 数据设计

### `mwb.landing_page_assets`

| 字段 | 说明 |
| --- | --- |
| `landing_page_asset_id` | v2 内部资产 ID，例如 `LPA-JSZC-OE3-BACKUP-001` |
| `route_id` / `game_code` | 游戏 × 路线范围 |
| `site_id` | OceanEngine 备用网页站点 ID，长数字按 text 保存 |
| `site_name` | 平台展示名称 |
| `landing_url` | 受控完整 HTTPS URL，仅 DB 受控列可读 |
| `url_hash` | URL SHA-256；URL 缺失时保存空字符串 |
| `source_advertiser_id` | 物料户或来源账户 ID |
| `share_scope` | 第一版 `organization_accounts` |
| `is_default` | 游戏 × 路线默认备用页 |
| `status` | `reference_candidate` / `resolved` / `active` / `disabled` |
| `source_usage` | `reference_only` / `runtime_truth` |
| `metadata` | 非敏感摘要、证据 ref、来源说明；禁止 URL |

约束：

- `(route_id, game_code, site_id)` 唯一。
- 同一 `route_id + game_code` 只能有一个 `is_default=true AND status='active'`。
- `landing_url` 若存在必须是 HTTPS。
- `url_hash` 与 `landing_url` 一致；普通摘要不输出 `landing_url`。

### `mwb.account_resources`

复用现有账户资源表，新增资源类型：

```text
resource_type = backup_landing_page
platform_resource_id = landing_page_assets.site_id
source_asset_id = landing_page_assets.landing_page_asset_id
metadata = { site_id, site_name, url_hash, readonly_check, evidence_refs }
```

## 权限

| 项 | 状态 |
| --- | --- |
| v2 本地代码、migration、task、manifest | 允许 |
| v2 Postgres `marketing_workbench_v2.mwb` | 允许 |
| OceanEngine 只读查询 | 允许；本任务可先落本地 gate，不强制真实 probe |
| 旧项目/旧库 | 只读参考；不得 runtime import/call |
| `std_project/create` / token refresh / 平台写入 | 禁止 |

## 验收

- `mwb.landing_page_assets` 已迁移，约束与索引生效。
- JSZC + OE3 P01 默认 `site_id=7624750304608649243` 作为 `reference_only` 候选导入，不伪造 URL。
- 截图候选 `site_id=7450371049210462218` 可作为候选，不覆盖默认基线。
- 未解析真实 HTTPS URL 时不得标记 `active`。
- `account_resources.backup_landing_page` 可表示目标账户可见性与回查。
- 节点 3 可解析默认备用页；节点 4 可阻断；节点 5 只在已验证 URL 时编译 `external_url_material_list`。
- payload 合同允许 `project_materials.external_url_material_list`，并检查备用页 present / HTTPS / target visible / hash match。
- API 和前端不展示完整 URL。
- `npm run smoke:api`、`npm run test:payload-contract` 通过。
- 没有调用 `std_project/create`，没有 token、Cookie、完整 URL、raw payload、raw response 泄漏。

## 下一步 gate

本任务完成后，若备用网页仍只是 `reference_candidate`，下一步是“只读解析/验证备用网页 URL 与目标账户可见性”；若已 `active + readback_verified`，下一步才是新建 fresh runtime job，重跑节点 1-5，再另建单次真实创建授权任务。

## 完成结果

- 已新增并应用 `db/016_add_landing_page_assets.sql`。
- 已创建 `mwb.landing_page_assets`，并导入两个 JSZC + OE3 历史候选：
  - `LPA-JSZC-OE3-BACKUP-001` / `site_id=7624750304608649243` / 默认候选 / `reference_only` / `reference_candidate`
  - `LPA-JSZC-OE3-BACKUP-002` / `site_id=7450371049210462218` / 非默认候选 / `reference_only` / `reference_candidate`
- 已扩展 `mwb.account_resources.resource_type` 支持 `backup_landing_page`，并为目标账户写入默认候选资源占位。
- 当前默认备用页没有真实 HTTPS URL，因此保持 `needs_confirmation + not_checked`，Workflow / payload contract 按预期 blocked。
- repository 已返回 `backupLandingPage` 安全摘要，并提供受控 URL 读取方法；普通 API 不返回完整 URL。
- OE3 Skill 已增加节点 3 默认备用页解析、节点 4 备用页资源诊断、节点 5 `external_url_material_list` 受控编译。
- payload contract / preflight 已增加备用页 present、HTTPS、目标账户可见性、readback、hash match 硬检查。
- 工作台/API 已增加备用页安全摘要字段，只展示 asset/site/hash/status。
- 未调用 OceanEngine，未执行 `std_project/create`，未刷新 token。

## 验证结果

| 命令 | 结果 |
| --- | --- |
| `psql -X -d marketing_workbench_v2 -f db/016_add_landing_page_assets.sql` | passed |
| `npm run test:payload-contract` | passed；dry-run blocked，mock ready passed |
| `npm run smoke:api` | passed；payload contract blocked 符合当前 URL 未验证 gate |
| `npm run check:runtime-consistency -- --job-id JOB-MWBV2-20260825041227-12D2B5` | passed |
| `node --check` 相关变更文件 | passed |

## 实际下一步 gate

新建只读任务解析默认备用网页真实 HTTPS URL，并验证目标账户 `1871922175825993` 是否可见/可选。完成前不得新建真实创建授权任务。
