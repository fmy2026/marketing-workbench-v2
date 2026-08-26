# TASK-MWBV2-OE3-LANDING-PAGE-UI-CONFIRMATION-PASS

## 状态

completed

## 背景

上一轮 `site/get` / `orange_site/get` 只读探针显示目标账户未命中默认落地页，其中 `orange_site/get` 返回 `apiCode=40000`。用户随后提供目标账户后台截图：账户 `1871922175825993` 的项目 `7675218401040220179` 在项目编辑页已经能选择并展示默认落地页 `7624750304608649243`。

该 UI 证据说明：目标账户创建/编辑链路中可使用该落地页。此前把列表接口未命中直接判定为“目标账户不可用”过严，应改为“API 探针不一致，但 UI 人工确认通过”。

## 范围

- 只更新 v2 Postgres 与任务状态。
- 不调用 OceanEngine。
- 不刷新 token。
- 不执行 `std_project/create`。
- 不上传素材、不复制/转赠落地页、不做任何平台写入。
- 不保存 raw response、raw payload、token、Cookie 或完整落地页 URL 到任务文件/日志/API/前端。

## 官方依据

本机 2.0 官方文档确认：

- `tools/site/get` 可获取客户建站列表，并支持 `share_type` 区分自建/共享站点。
- 橙子建站地址可由 `site_id` 组装得到并用于营销投放。
- `orange_site/get` 可辅助创编营销，但官方说明它不区分自建/共享，需要和站点列表本地合并判断。

本次进一步补充：真实目标账户后台项目编辑页可选中默认落地页，因此作为手动 UI 证据放行。

## 数据库更新

- `mwb.landing_page_assets`
  - `landing_page_asset_id = LPA-JSZC-OE3-BACKUP-001`
  - `site_id = 7624750304608649243`
  - `status = active`
  - `source_usage = runtime_truth`
  - `metadata.manual_ui_confirmation.status = passed_by_manual_confirmation`
  - `metadata.manual_ui_confirmation.target_project_id = 7675218401040220179`

- `mwb.account_resources`
  - `advertiser_id = 1871922175825993`
  - `resource_type = backup_landing_page`
  - `source_asset_id = LPA-JSZC-OE3-BACKUP-001`
  - `visibility_status = visible`
  - `readback_status = readback_verified`
  - `metadata.readonly_check.status = passed_by_manual_confirmation`

- `mwb.evidence_artifacts`
  - `artifact_id = EV-OE3-LANDING-PAGE-TARGET-UI-MANUAL-CONFIRM-1871922175825993-7624750304608649243`
  - 只保存脱敏摘要、hash、状态和必要 ID。

## 结论

默认备用落地页不再阻断 fresh runtime job 的创建前校验。保留原 `site/get` / `orange_site/get` 探针不一致记录，后续可单独优化只读查询参数，但不应再影响本轮创建验证流程。

## 下一步 Gate

新建 fresh runtime job，重新跑创建前 preflight / payload contract。若其余 gate 均通过，再另建单次真实 `std_project/create` 确认任务。
