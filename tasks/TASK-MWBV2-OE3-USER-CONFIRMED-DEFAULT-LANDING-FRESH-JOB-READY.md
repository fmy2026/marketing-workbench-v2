# TASK-MWBV2-OE3-USER-CONFIRMED-DEFAULT-LANDING-FRESH-JOB-READY

状态：completed

更新时间：2026-08-25 CST

## 目标

承接用户修正信息：将 `site_id=7624750304608649243` 作为 JSZC / OE3 字节小游戏路线的默认备用落地页，按官方本机文档确认 `std_project/create` 字段合同后，准备一个全新的 runtime job 进入单次创建前状态。

## 结论先行

本机官方文档显示：

- `project_materials.external_url_material_list` 是 `string[]`，字段说明为“落地页链接”。
- 该字段支持橙子建站落地页、自研落地页，数量 `[1,10]`。
- 错误码说明会校验链接是否符合 `https` 格式。
- 当前未看到“裸 `site_id` 可直接传入 `external_url_material_list` 并创建成功”的官方依据。

因此本任务采用：

```text
受控 DB landing_url -> payload external_url_material_list[0]
```

不采用：

```text
external_url_material_list[0] = site_id
```

## 固定输入

| 项 | 值 |
| --- | --- |
| `route_id` | `oceanengine_3_byte_mini_game` |
| `game_code` | `JSZC` |
| `advertiser_id` | `1871922175825993` |
| `object_type` | `std_project` |
| 默认落地页资产 | `LPA-JSZC-OE3-BACKUP-001` |
| 默认 `site_id` | `7624750304608649243` |
| 默认站点名 | `巨兽战场-抖音小游戏-狙击狩猎` |
| 来源物料户 | `1760246749825031` |

完整 HTTPS URL 只允许写入 `mwb.landing_page_assets.landing_url`，任务卡、manifest、API、前端和普通日志只展示 `site_id`、`url_hash`、状态和 evidence ref。

## 与上一任务关系

上一任务：

```text
TASK-MWBV2-OE3-DEFAULT-BACKUP-LANDING-RESOLVE-AND-FRESH-JOB-READY
```

停在 `blocked_backend_landing_linkage_contract_not_materialized`，原因是 `optimized_goal/get` 本身不返回可直接用于 payload 的完整落地页链接。该结论保留。

本任务的新事实来自用户在平台 UI 对默认页的人工确认；因此可以把完整 URL 作为受控 DB 真值写入，但不能把该 URL 写入 Markdown/manifest/普通输出。

## 权限

允许：

- 更新 v2 Postgres：`landing_page_assets`、`account_resources`、`evidence_artifacts`、fresh `launch_jobs` / `launch_node_runs` / `launch_drafts`。
- 运行本机官方文档核对、payload contract、smoke、runtime consistency。
- 在 `project.state.json` 为 fresh job 预置单次 execution grant。

禁止：

- 本任务内调用 `std_project/create`。
- 重试或复用 `JOB-MWBV2-20260825041227-12D2B5`。
- token refresh。
- 上传/绑定素材、创建事件资产、DMP 推送、预算/出价修改。
- 让 v2 运行时依赖旧项目路径。
- 泄漏 token、Cookie、完整触点 URL、完整落地页 URL、raw payload、raw response。

## 执行步骤

1. 将默认落地页写入受控 DB：
   - `landing_page_assets.status=active`
   - `landing_page_assets.source_usage=runtime_truth`
   - `landing_page_assets.url_hash=SHA-256(landing_url)`
   - `account_resources.visibility_status=visible`
   - `account_resources.readback_status=readback_verified`
   - `readonly_check.status=passed_by_manual_confirmation`
2. 新建 `source_usage=runtime_truth` fresh job。
3. 运行 `runJob(dry_run)`，生成新 draft、项目名、payload hash。
4. 确认 payload contract / preflight 通过，且 `external_url_material_list` 在摘要中只暴露 hash/存在性。
5. 预置 execution grant：
   - `platform_write_allowed=true`
   - 只允许 `oceanengine_std_project_create`
   - `maximum_actions=1`
   - `retry_allowed=false`
6. 本任务结束后等待用户在工作台或 CLI 显式触发单次创建。

## 验收

- 默认落地页 DB 状态为 active，目标账户资源为 visible + readback_verified。
- API/前端/任务文件不展示完整落地页 URL。
- 新 fresh job 节点 1-5 完成，节点 5 为 `needs_confirmation`。
- 新 fresh job `platform_actions=0`、`created_objects=0`。
- `project.state.json` execution grant 只绑定新 job / draft / payload hash。
- 未执行 `std_project/create`。

## 下一步 gate

用户确认后，通过工作台“开始执行”或显式 CLI 确认变量执行唯一一次真实 `std_project/create`。

## 完成记录

2026-08-25 已完成：

- 官方本机文档核对：`external_url_material_list` 应传 `string[]` 落地页链接，没有直接传裸 `site_id` 的依据。
- 默认落地页已写入受控 DB，公开摘要只保留 `site_id`、`url_hash` 和状态。
- `LPA-JSZC-OE3-BACKUP-001` 已设为 `active + runtime_truth + is_default=true`。
- 目标账户 `1871922175825993` 的 `backup_landing_page` 资源已设为 `visible + readback_verified + passed_by_manual_confirmation`。
- fresh job 已创建：`JOB-MWBV2-20260825083821-9DB6FE`。
- draft 已生成：`DRAFT-JOB-MWBV2-20260825083821-9DB6FE`。
- payload hash：`sha256:71e30949688120e2aef449e2c3350236263a8cfb2bd28625dbe2c3e8f5ac4e90`。
- 项目名：`245791_N_JSZC_HUNT_PAY7DROI_平台定向不限_P02_20260825`。
- 节点状态：1-4 `passed`，5 `needs_confirmation`，6 `locked`，7 `waiting`。
- `platform_actions=0`、`launch_confirmations=0`、`created_objects=0`、真实回查 `0`。
- `project.state.json` 已预置单次 execution grant；本任务未执行 `std_project/create`。

验证：

- `npm run check:runtime-consistency -- --job-id JOB-MWBV2-20260825083821-9DB6FE` 通过。
- `npm run test:payload-contract` 通过。
- `npm run smoke:api` 通过。
- 安全检查确认完整落地页 URL 仅存在受控列 `mwb.landing_page_assets.landing_url`；任务文件、draft summary、node summary、evidence summary 未泄漏。
