# TASK-MWBV2-OE3-NODE4-RESOURCE-PREP-CONTRACTS-1871922346964041

状态：closed_implemented

更新时间：2026-08-28 CST

## Brief

为账户 `1871922346964041` 的 Node 4 三个剩余资源建立独立准备合同与 Skill 结构：`product_image`、`micro_app_instance`、`backup_landing_page`。本任务只补本地 workflow 能力和脱敏 evidence 结构，不执行真实平台写入。

## Scope

| 项 | 值 |
| --- | --- |
| route | `oceanengine_3_byte_mini_game` |
| game | `JSZC` |
| advertiser | `1871922346964041` |
| case | `CASE-LEGACY-2E4217E20C9E26BFB648772C` |
| latest readiness job | `JOB-MWBV2-20260828033934-DA7950` |
| permission | `platform_write_allowed=false` |

允许：

- 新增本地 Node 4 Skill、合同定义、调度与 smoke。
- 写入任务卡、manifest、Skill run、资源 metadata 与脱敏 evidence 摘要。
- 使用官方文档和旧项目经验做只读合同映射。

禁止：

- OceanEngine 上传、绑定、推送、创建或预算/出价修改。
- 乾坤创建、monitorSerialNumberAdd 或 token refresh。
- 将 token、Cookie、完整 URL、raw request、raw payload 或 raw response 写入项目文件、日志、API 或前端。
- 因产品图、小程序实例或备用落地页仍未通过而自动打开 `prepare_supported`。

## Acceptance

- [x] 三个资源各有独立 Skill：`product-image-source-prepare`、`micro-app-instance-readonly`、`backup-landing-page-source-prepare`。
- [x] dry_run / planned_actions schedule 中三项 Skill 在 verifier 前执行。
- [x] 产品图默认目标户直传路线，不默认走物料户；物料户图片链路仅在官方合同验证后允许。
- [x] 小程序实例只作为目标账户资产核验，不生成素材户上传/推送计划。
- [x] 备用落地页按“本地素材文件夹 -> 物料户 -> 目标户”建模，并保留目标传输合同未验证 blocker。
- [x] `prepare_supported` 对三项仍保持 `false`。
- [x] smoke 与回归测试通过，且本轮真实平台写入为 0。

## Result

状态：`closed_implemented`。

| 项 | 结果 |
| --- | --- |
| code | 已新增三项 Node 4 准备合同 Skill，并接入 `00-contracts`、`00-runner`、`00-index`、resource verifier 与 action registry。 |
| fresh job | `JOB-MWBV2-20260828051246-FF7873`，`runtime_truth`，35 个 Skill run，Node 5 已生成草稿但不可创建。 |
| 产品图 | `product-image-source-prepare=passed`；源文件/hash/尺寸可读；目标户候选数为 0；默认下一步为目标户单次图片上传计划，物料户图片链路未验证且不启用。 |
| 小程序实例 | `micro-app-instance-readonly=blocked`；存在平台应用候选，但目标户实例未验证；不生成素材户路线。 |
| 备用落地页 | `backup-landing-page-source-prepare=needs_confirmation`；本地素材文件夹 manifest 已记录，流转建模为本地文件夹到物料户再到目标户；目标传输合同仍未验证。 |
| prepare capability | `product_image`、`micro_app_instance`、`backup_landing_page` 均保持 `prepare_supported=false`。 |
| 真实只读观察 | 本次 OceanEngine baseline readonly 被 `credential_required/token_status_not_valid` 阻断；乾坤 monitor 精确只读仍命中 monitor `245828`。 |
| 平台写入审计 | launch confirmation `0`、platform action `0`、created object `0`，无 token refresh。 |
| local cleanup | 一次因本地 status 映射中断的 job 已标记为 `failed_local_status_mapping`，并保留历史不删除；case summary 指向最新 fresh job。 |

## Validation

- [x] `npm run test:node4-resource-prep-contracts`
- [x] `npm run test:resource-action-registry`
- [x] `npm run smoke:workflow-skills`
- [x] `npm run test:execution-plan`
- [x] `npm run test:readonly-readiness-cli`
- [x] `npm run test:video-material-executor`
- [x] `npm run test:workflow-case`
- [x] `npm run workflow:readonly-readiness -- --route-id oceanengine_3_byte_mini_game --game-code JSZC --advertiser-id 1871922346964041 --expected-monitor-id 245828 --case-id CASE-LEGACY-2E4217E20C9E26BFB648772C`
- [x] `git diff --check`

## Next Gate

先恢复/确认 OceanEngine 只读凭据，再新建 fresh readiness。凭据恢复后重点复核三项：产品图目标户图片上传合同、小程序实例目标户可见性与长 ID 字段合同、备用落地页物料户到目标户的发布/推送/授权合同。
