# TASK-MWBV2-OE3-BACKUP-LANDING-PAGE-MATERIAL-INVENTORY-1871922346964041

状态：completed_default_source_verified

更新时间：2026-08-28 CST

## Brief

本任务只确认 JSZC 物料户现有备用落地页库存、受控默认页和跨户解决路径。目标账户为 `1871922346964041`，物料户为 `1760246749825031`，受控默认候选为 `LPA-JSZC-OE3-BACKUP-001`。

本轮不启动全量 7 节点流程，不创建项目，不上传，不绑定，不刷新 token，不调用 `tools/site/handsel` 或 `tools/site/copy`。

## 实现

- 新增 `backup-landing-page-material-inventory` 独立 Skill，只由 CLI 显式运行，不加入 fresh readiness schedule。
- `npm run check:oe3-landing-page-inventory` 现在执行 case-scoped 只读 inventory：创建独立 readonly inventory job，调用 `site/get` 分页读取物料户和目标户，调用 `orange_site/get` 仅作目标户辅助证据。
- 默认页只在实时物料户列表唯一命中 `LPA-JSZC-OE3-BACKUP-001` 且站点状态可投放时确认；不自动改选其余候选。
- 本地素材文件夹仍作为长期链路说明：`local_folder_to_material_account_to_target_account`；复用既有物料户页面时，本地文件夹不阻断默认确认。
- 输出与 evidence 只保存 ID、状态、名称 hash、URL hash、响应 hash 和请求 ID 是否存在；不保存完整 URL、token、Cookie、raw request 或 raw response。

## 结果分支

- `default_source_verified`：默认物料页清晰，下一任务专门评审跨户共享或推送方案。
- `default_source_unverified`：默认缺失、状态异常、候选多义或 API/凭据失败，禁止推送。
- `target_already_usable`：目标户已可见且可用，无需推送。

## 本次真实只读结果

最新记录 job：`JOB-MWBV2-BACKUP-LANDING-INVENTORY-20260828064407-6FAF91`。

结论：`default_source_verified`。库内候选数为 4；物料户 `site/get` 返回 19 个站点，其中 3 个命中库内 JSZC 候选。受控默认项 `LPA-JSZC-OE3-BACKUP-001` / `7624750304608649243` 在物料户唯一命中，状态为 `AUDIT_ACCEPTED`，可作为默认保底页候选。

只读状态：

| 检查 | 状态 |
| --- | --- |
| 物料户 `site/get` | passed，HTTP 200，API code 0，request id present |
| 目标户 `site/get` | passed，HTTP 200，API code 0，候选匹配 0 |
| 目标户 `site/get?share_type=SHARE` | passed，HTTP 200，API code 0，共享匹配 0 |
| 目标户 `orange_site/get` | API code 40000，仅辅助证据，不能单独判定共享来源 |

当前 blocker：

- 无。当前状态是默认物料页清晰，但目标户尚不可见；下一任务需专门评审跨户共享/复制路径。

补充确认：`npm run token:status` 返回 `tokenStatus=valid`，无 blocker。本轮仍未执行 token refresh。

## 跨户路径

本机官方资料确认 `tools/site/handsel` 和 `tools/site/copy` 存在，但它们都是写接口；其中 `handsel` 文档说明存在清空目标新站点资产信息的风险。因此本任务只记录路径结论，不执行推送。下轮必须先补齐“保内容”的官方合同、全局权限和单次 execution confirmation。

## 验收

- 平台写入、创建、推送、token refresh 均为 0。
- `backup_landing_page.prepare_supported` 保持 `false`。
- 只读 cycle、候选汇总、默认依据和 evidence 归入当前 workflow case。
- smoke 覆盖 4 个候选、唯一默认成功、默认缺失、状态不可用、多义、目标已存在、API 失败。
