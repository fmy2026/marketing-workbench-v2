# TASK-MWBV2-OE3-DEFAULT-BACKUP-LANDING-RESOLVE-AND-FRESH-JOB-READY

状态：blocked

更新时间：2026-08-25 CST

## 当前执行结论

2026-08-25 已按补充口径重跑 `npm run check:oe3-backup-landing-page`：

- 只读入口：`/open_api/v3.0/event_manager/optimized_goal/get/`
- 结果：HTTP 200，`api_code=0`
- 优化目标：命中
- 深度优化目标：命中
- 字节小游戏资产类型：命中
- 橙子落地页 `site_id/site_name`：未在该只读响应中显式返回
- 直接 URL：不期望、不保存、未出现
- evidence：`EV-OE3-BACKUP-LANDING-OPTIMIZED-GOAL-1871922175825993-7624750304608649243`

当前任务停在：

```text
blocked_backend_landing_linkage_contract_not_materialized
```

下一步不是向用户索取 URL，也不是按 `site_id` 拼接 URL；而是固化媒体后台自动联动的橙子落地页字段合同，明确 `std_project/create` payload 中备用页应如何表达。

## 目标

解析并验证 OE3 字节小游戏默认备用网页在 `optimized_goal/get` 链路下的橙子落地页站点信息与后台联动字段合同，满足后再生成一个全新的创建前 fresh runtime job：

```text
默认备用网页 site_id / site_name
-> optimized_goal 橙子落地页站点信息联动合同
-> 目标账户 1871922175825993 可见/可联动
-> landing_page_assets + account_resources 真值
-> 新 fresh job
-> Workflow 节点 1-5 自动完成
-> 新 draft / 新 payload hash / 新项目名
-> 预置一次 execution grant
-> 等待用户在工作台点击一次“开始执行”
```

本任务不得执行 `std_project/create`。任务结束后，如 gate 全通过，只允许用户在工作台点击一次“开始执行”发起唯一真实创建。

## 固定输入

| 项 | 值 |
| --- | --- |
| `route_id` | `oceanengine_3_byte_mini_game` |
| `game_code` | `JSZC` |
| `advertiser_id` | `1871922175825993` |
| `object_type` | `std_project` |
| 默认候选资产 | `LPA-JSZC-OE3-BACKUP-001` |
| 默认候选 `site_id` | `7624750304608649243` |
| 备选候选资产 | `LPA-JSZC-OE3-BACKUP-002` |
| 备选候选 `site_id` | `7450371049210462218` |

默认候选优先验证；只有默认候选不可用时，才可基于真实证据切换备选，并记录切换原因。

## 历史 job 规则

`JOB-MWBV2-20260825041227-12D2B5` 已有一次真实创建 action，结果为 `api_code=40000`。

- 保持 `failed_waiting_manual_review`。
- 禁止重试、复用、修改 draft、恢复 scope 或再次点击。
- 仅作为失败证据与字段对比对象。
- 本任务必须新建 fresh runtime job，不能继续使用该 job。

## 权限

允许：

- 新建任务卡、context manifest、必要代码、测试和 `project.state.json` 更新。
- 读取 v2 Postgres、旧项目历史、官方本机文档。
- OceanEngine 只读查询。
- 将已验证的完整 HTTPS URL 写入 `mwb.landing_page_assets.landing_url` 受控列。
- 更新 `landing_page_assets`、`account_resources`、evidence、fresh job、node/skill runs、draft 与 execution scope。

禁止：

- `std_project/create`、创建重试、Promotion 创建。
- 落地页创建、修改、共享、删除。
- token refresh、素材上传/绑定、DMP 推送、事件资产创建。
- 修改预算、出价、品牌、视频、产品图。
- 在 Markdown、JSON、日志、普通 API、前端、draft summary 中保存完整 URL、token、Cookie、raw payload 或 raw response。

## 纠偏说明

2026-08-25 补充确认：`external_url_material_list` 的“橙子落地页链接来源”为本机官方文档中的“通过优化目标获取橙子落地页站点信息”。当前不能把它理解为 v2 可直接读取、可直接保存、可手工拼接的完整 URL；媒体后台会根据优化目标/站点信息联动输出。v2 不得从截图、旧项目、网页搜索或 site_id 拼接完整 URL。

因此本任务第一硬 gate 改为：

- 只依据本机官方知识文档和 `event_manager/optimized_goal/get/` 只读结果确认字段合同。
- `mwb.landing_page_assets.landing_url` 保持空，除非后续官方本机文档或平台只读结果明确返回可投放的完整 HTTPS URL。
- 草稿/API/前端仍不得展示完整 URL。
- 若 optimized_goal 只能证明优化目标可用，但不能证明备用页字段如何进入 create payload，停在 `resolve_backend_landing_linkage_contract_before_fresh_job`，不得生成 fresh create grant。

## 第一硬 Gate

### 1. 默认备用网页站点信息与联动合同确认

- 复用 `src/platforms/oceanengineReadonlyClient.mjs` 作为唯一只读 transport。
- 只查阅本机官方文档确认适用的落地页/站点读取方式；遇到巨量营销文档疑问时，不拓展网页搜索。
- 核验默认候选：
  - `site_id=7624750304608649243`
  - 平台展示名称
  - 来源物料户
  - `optimized_goal/get` 下优化目标、深度优化目标与橙子落地页站点信息的联动可解释
- 不要求、不得拼接、不得人工猜测完整 HTTPS URL。
- 如字段合同无法固化，停在 `resolve_backend_landing_linkage_contract_before_fresh_job`。

### 2. 目标账户可见/可选验证

目标账户 `1871922175825993` 必须验证：

```text
可在目标账户选择
或
目标账户可见且 optimized_goal 联动可确认
```

验证结果写入：

```text
mwb.account_resources
resource_type = backup_landing_page
platform_resource_id = site_id
source_asset_id = landing_page_asset_id
visibility_status = visible
readback_status = readback_verified
```

`metadata` 仅保存 `site_id`、`site_name`、`url_hash`、`readonly_check`、`evidence_refs`。

### 3. 默认资产激活条件

以下条件全部满足，才允许将默认候选写为：

```text
status = active
is_default = true
source_usage = runtime_truth
```

- `site_id`、站点名称与平台/控制台证据一致。
- 来源物料户信息明确。
- 目标账户 `1871922175825993` 已 `visible + readback_verified` 或已被 optimized_goal 联动合同明确覆盖。
- 已生成脱敏 evidence ref。

任一失败：保持 `reference_candidate` 或 `resolved`，节点 4 必须 blocked，不得新建创建授权。

## Workflow / Payload 统一链路

确认并只保留：

```text
launch-pack-resolve-backup-landing-page
-> resource-verify-backup-landing-page
-> payload-build
-> project_materials.external_url_material_list
-> payload-contract
-> create-preflight
```

规则：

- `mini_program_info.url` 只放 `sslocal://` 小游戏调起链接。
- `external_url_material_list` 不得由 v2 拼接；只有在本机官方文档/平台只读结果明确返回可投放完整 HTTPS 链接时才可填入。
- 两者不得互换。
- 完整 URL 默认不作为 v2 运行真值保存；若后续官方合同明确返回，再进入受控 DB 读取与内存 payload。
- 草稿/API/前端只显示 `landing_page_asset_id`、`site_id`、`site_name`、`url_hash`、`visibility_status`、`readback_status`。

## Fresh Job Gate

仅在默认备用网页已 `active` 且目标账户资源已 `visible + readback_verified` 后：

- 新建 `source_usage=runtime_truth` fresh job。
- 通过 `createJob -> runJob(dry_run)` 自动运行节点 1-5。
- 生成新的 `job_id`、`draft_id`、项目名称、`payload_hash`。
- 禁止复用历史失败 job 的 draft、hash、scope 或创建记录。

验收目标：

| 项 | 目标 |
| --- | --- |
| 节点 1-4 | `passed` |
| 节点 5 | `needs_confirmation` |
| 节点 6 | `locked` |
| 节点 7 | `waiting` |
| `duplicate_status` | `platform_not_duplicate` |
| payload contract | `passed` |
| create preflight | `passed` |
| final payload blockers | `[]` |
| 新 job 创建记录 | `platform_actions=0`、`launch_confirmations=0`、`created_objects=0`、真实 readback=0 |

## Execution Grant

新 fresh job 全部通过后，才允许更新 `project.state.json`：

```json
{
  "platform_write_allowed": true,
  "platform_write_scope": {
    "target_job_id": "<new_job_id>",
    "target_draft_id": "<new_draft_id>",
    "target_payload_hash": "<new_payload_hash>",
    "allowed_actions": ["oceanengine_std_project_create"],
    "maximum_actions": 1,
    "retry_allowed": false
  }
}
```

本任务不得调用 `/execute-once`，不得真实创建。

## 验收命令

```bash
npm run test:payload-contract
npm run smoke:workflow-skills
npm run smoke:api
npm run test:execution-grant
npm run check:runtime-consistency
```

## 下一步 gate

- 若 optimized_goal 联动字段合同无法固化：停在 `resolve_backend_landing_linkage_contract_before_fresh_job`。
- 若全部通过：用户可在工作台对新 fresh job 点击一次“开始执行”。
