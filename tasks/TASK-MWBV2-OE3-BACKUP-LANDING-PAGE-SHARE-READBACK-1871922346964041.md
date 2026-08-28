# TASK-MWBV2-OE3-BACKUP-LANDING-PAGE-SHARE-READBACK-1871922346964041

状态：completed_target_share_readback_verified

更新时间：2026-08-28 CST

## Brief

本任务固化 JSZC 默认备用落地页从物料户到目标账户的共享与回查机制。唯一对象为 `LPA-JSZC-OE3-BACKUP-001` / `7624750304608649243`，物料户为 `1760246749825031`，目标账户为 `1871922346964041`。

本次只采用“物料户指定目标账户可用”的共享路径。禁止复制站点、重建页面、拼接或输出完整 URL，也不执行任何平台写接口。

## 两阶段

1. 机制确认与自动化能力预留：只核对本机 OE3 官方知识库、当前只读实现、`docs/project-lessons.md` 与旧项目“目标账户已解析才放行”的 Gate 经验。
2. 人工共享后的目标回查：用户在物料户完成指定账户共享后，运行 fresh readonly inventory job，目标侧只读验证普通库存和 `share_type=SHARE` 库存。

## 实现结论

- `backup_landing_page` 继续保持 `prepare_supported=false`。
- 能力注册表已预留未来 `ensure_resource:backup_landing_page`、独立 scope、幂等范围和单次确认/写后回查模型。
- 执行计划在没有本机官方可执行共享接口合同时，不会生成或执行落地页平台写动作。
- 只读回查通过标准收紧为：源默认页唯一且可用，目标普通库或共享库精确命中站点 ID，目标状态可用，受控资产 ID 与 URL hash 一致。
- 只有目标侧全部满足时，`account_resources.backup_landing_page` 才能写为 `visible + readback_verified`。

## 当前边界

截图只能证明物料户侧站点已审核通过且 UI 支持“指定账户可用”，不能证明目标账户已被加入共享范围。当前项目记录中，本机官方知识库未提供可执行的“指定账户共享站点”接口合同，因此本任务不启用自动共享执行器。

人工共享完成后的命令：

```bash
npm run check:oe3-landing-page-inventory -- --case-id=CASE-LEGACY-2E4217E20C9E26BFB648772C --advertiser-id=1871922346964041 --source-record-ref=TASK-MWBV2-OE3-BACKUP-LANDING-PAGE-SHARE-READBACK-1871922346964041
```

通过后只移除落地页自身 blocker；`product_image` 与 `micro_app_instance` 仍是独立 blocker，不自动放行创建。

## 本次真实只读结果

最新通过 job：`JOB-MWBV2-BACKUP-LANDING-INVENTORY-20260828072633-A30063`。

结论：`target_already_usable`。源户只读库存命中默认站点 `7624750304608649243`，状态 `AUDIT_ACCEPTED`；目标普通库存未命中，目标 `share_type=SHARE` 库存命中 1 条并精确命中默认站点，状态 `AUDIT_ACCEPTED`。

目标回查状态：

| 检查 | 状态 |
| --- | --- |
| 物料户 `site/get` | passed，HTTP 200，API code 0，request id present |
| 目标户 `site/get` | passed，HTTP 200，API code 0，默认站点匹配 0 |
| 目标户 `site/get?share_type=SHARE` | passed，HTTP 200，API code 0，默认站点匹配 1 |
| 源户实时 hash 与目标共享 hash | match |
| 平台写入 / token refresh | 0 / false |

补充：上一条 fresh job `JOB-MWBV2-BACKUP-LANDING-INVENTORY-20260828072433-9030A8` 已证明目标共享命中，但被历史 DB 构造 hash 阻塞。代码已修正为优先比较本轮源户只读 hash 与目标共享 hash，历史 DB hash 只作为兜底。

`mwb.account_resources` 已将目标账户 `backup_landing_page` 写为：

```text
source_asset_id = LPA-JSZC-OE3-BACKUP-001
platform_resource_id = 7624750304608649243
visibility_status = visible
readback_status = readback_verified
```

当前 case summary 中 `backup_landing_page` 已为 `visible + readback_verified`；`product_image` 与 `micro_app_instance` 仍为独立未就绪资源。

## 验收

- 覆盖源户命中、目标普通库命中、目标共享库命中、未命中、目标状态不可用和 hash 不一致。
- 未有官方接口合同时，不会生成 `ensure_resource:backup_landing_page` 平台写动作。
- 所有 evidence 只保存状态、ID、hash 与请求/响应存在性，不保存完整 URL 或 raw response。
- 不搜索外部资料，不刷新 token，不创建项目，不上传/绑定素材，不改预算出价。
