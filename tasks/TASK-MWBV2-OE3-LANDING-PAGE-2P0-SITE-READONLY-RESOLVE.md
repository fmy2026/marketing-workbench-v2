# TASK-MWBV2-OE3-LANDING-PAGE-2P0-SITE-READONLY-RESOLVE

状态：completed_blocked_target_not_visible

更新时间：2026-08-25 CST

## Brief

按用户补充要求，读取本机 OceanEngine 2.0 官方资料：

```text
/Users/hys/knowledge/01-个人本地知识库/01-官方文档/open.oceanengine.com-2.0
/Users/hys/knowledge/01-个人本地知识库/01-官方文档/open.oceanengine.com-2.0-copy
```

确认橙子建站落地页是否可用官方接口查询，并尽快更新 v2 Postgres，使默认落地页进入“源端已验证、目标端待共享/可见”的准确状态。

## 结论

2.0 官方资料确认：

- `GET https://ad.oceanengine.com/open_api/2/tools/site/get/` 是“获取橙子建站站点列表”。
- 该接口返回 `siteId/name/status/siteType/function_type/thumbnail`，但不返回建站正式地址。
- 官方说明允许按 `site_id` 构造可投放 URL，格式为 `chengzijianzhan.com/tetris/page/{site_id}`。
- `GET https://api.oceanengine.com/open_api/v3.0/tools/orange_site/get/` 可按优化目标查询关联橙子落地页站点信息。
- 该接口不区分自建/共享，需要和 `site/get` 在本地合并判断。

## 真实只读结果

| 检查 | 结果 |
| --- | --- |
| 物料户 `1760246749825031` `site/get` | passed，默认 `site_id=7624750304608649243` 命中，名称匹配，状态 `AUDIT_ACCEPTED` |
| 目标账户 `1871922175825993` `site/get` | passed，但默认 `site_id` 未命中 |
| 目标账户 `orange_site/get` | HTTP 200，`apiCode=40000`，未命中默认页 |
| 平台写入 | 0 |
| token refresh | 0 |
| raw response 保存 | 0 |

当前不能宣称“已可给目标新账户使用”。准确状态是：

```text
blocked_landing_page_target_readonly_not_verified
```

阻断项：

- `default_landing_page_not_visible_in_target_account`
- `target_orange_site_probe_not_passed`

## 数据库更新

已更新 `marketing_workbench_v2.mwb`：

- `mwb.landing_page_assets`
  - 四个历史候选均写入受控 `landing_url` 与 `url_hash`。
  - 默认 P01 保持 `is_default=true`。
  - 当前全部保持 `source_usage=reference_only`。
  - 当前不设 `active`，避免创建流程误放行。
- `mwb.account_resources`
  - 目标账户下四个 `backup_landing_page` 资源逐条存在。
  - 默认 P01 `required=true`。
  - 当前均为 `visibility_status=unknown`、`readback_status=not_checked`。
  - `metadata.readonly_check.status=blocked_landing_page_target_readonly_not_verified`。
- `mwb.evidence_artifacts`
  - 写入 source/target 两条脱敏 evidence。
  - evidence 不包含完整 URL、raw request、raw response。

## 代码更新

- `src/platforms/oceanengineReadonlyClient.mjs`
  - 增加只读白名单 endpoint：
    - `https://ad.oceanengine.com/open_api/2/tools/site/get/`
    - `/open_api/v3.0/tools/orange_site/get/`
- `scripts/oe3-landing-page-source-target-readonly-inventory.mjs`
  - 增加 2.0 / 2.0-copy 官方资料识别。
  - 增加 `site/get` 与 `orange_site/get` 只读 probe。
  - 支持写入受控 DB URL/hash，但普通输出仍只展示 hash/状态。

## 非目标

- 不调用 `tools/site/handsel`。
- 不调用 `tools/site/copy`。
- 不执行 `std_project/create`。
- 不创建 fresh runtime job。
- 不刷新 token。
- 不上传素材、不创建事件资产、不推 DMP、不改预算出价。

## 验证

| 命令 | 结果 |
| --- | --- |
| `npm run check:oe3-landing-page-inventory` | passed，执行 3 个只读 probe，目标账户未命中 |
| `npm run check:oe3-landing-page-inventory -- --record` | passed，写入脱敏 evidence 与 DB 状态 |
| `node --check scripts/oe3-landing-page-source-target-readonly-inventory.mjs` | passed |
| `node --check src/platforms/oceanengineReadonlyClient.mjs` | passed |
| Postgres 审计 | `landing_page_assets` 有 URL/hash；`account_resources` 未 active；evidence summary 无 URL |

## 下一步 Gate

目标账户尚不可用。下一步需要二选一：

1. 在平台后台把默认橙子建站页共享/转赠/复制到目标账户后，重跑：

```bash
npm run check:oe3-landing-page-inventory -- --record
```

2. 另建一个明确授权的平台写入任务，单次调用官方 `tools/site/handsel` 或 `tools/site/copy`，完成后立即只读回查。

完成前不得新建 fresh runtime job，也不得预置 `std_project/create` execution grant。
