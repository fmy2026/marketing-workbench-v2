# TASK-MWBV2-OE3-FRESH-FULL-CHAIN-READONLY-READINESS-1871922346964041

状态：closed_readonly_reconciled

更新时间：2026-08-28 CST

## Brief

为账户 `1871922346964041` 新建一个 fresh `runtime_truth` job，执行一次全链路 readonly readiness。任务将已完成的视频延迟回查与乾坤 monitor 只读闭环重新汇总到新的 Node 4 聚合结果，确认旧 blocker 已过期，并输出产品图、小程序实例、备用落地页的实际当前状态。

本任务同时按用户授权校正 `docs/project-lessons.md`：Node 4 的八个资源 Skill 独立记录；头像为目标账户直传，DMP 和视频为物料户到目标账户的受控流转。未闭环项仅记录已验证合同与待验证边界。

## Scope

| 项 | 值 |
| --- | --- |
| route | `oceanengine_3_byte_mini_game` |
| game | `JSZC` |
| advertiser | `1871922346964041` |
| expected monitor | `245828` |
| command | `npm run workflow:readonly-readiness -- --route-id oceanengine_3_byte_mini_game --game-code JSZC --advertiser-id 1871922346964041 --expected-monitor-id 245828` |

允许：

- 运行 readonly readiness / monitor / video 回归 smoke。
- 新建本地 runtime-truth launch job，并写入本地 Node、Skill、证据和审计摘要。
- 仅调用既有的乾坤账户/monitor 精确只读端点，以及 Node 4 的目标账户资源只读探测。
- 依用户本次明确授权修正 `docs/project-lessons.md`，仅写脱敏、已验证或明确待验证的经验。

禁止：

- 任何 OceanEngine 写入：上传、素材绑定、DMP push、广告创建、预算或出价修改。
- 任何乾坤创建；尤其禁止 monitor serial 第三次创建。
- token refresh、执行确认变量、mock 或 execute 模式。
- 在任务文件、文档、日志、API 或前端保存 token、Cookie、完整 URL、raw request、raw payload 或 raw response。
- 因仍未通过的资源自动发起准备或重试。

## Acceptance

- [ ] `test:readonly-readiness-cli`、monitor lifecycle / planned-action、视频 readback 回归通过。
- [ ] 新 job 是 `runtime_truth`；`resource-live-readonly-reconcile` 已执行且有脱敏 evidence。
- [ ] 视频通过，旧视频 readback/source blocker 不再存在。
- [ ] 乾坤账户和 monitor 精确命中；无凭据或 monitor blocker；历史创建 attempt 保持 `2`。
- [ ] 产品图、小程序实例、备用落地页独立输出 status、blocker、prepare capability 与下一动作。
- [ ] 平台 action、平台创建、launch confirmation 均为 `0`，无 token refresh。
- [ ] 经验文档包含八个独立资源章节，且长效写入权限已在任务关闭时收回。

## Result

状态：`closed_readonly_reconciled`。

| 项 | 结果 |
| --- | --- |
| fresh job | `JOB-MWBV2-20260828033934-DA7950`，`runtime_truth`，7 个 Node、32 个 Skill run |
| Node 4 reconcile | `resource-live-readonly-reconcile=passed`，evidence 已生成 |
| 视频 | `resource-verify-video-asset=passed`；旧视频 readback/source blocker 未出现 |
| 乾坤 | 账户与 monitor 精确命中；monitor `245828`、touchpoint hash 存在、credential active；Cycle-01 为 resolved |
| 历史创建 | attempt 保持 `2`；本 job 无 monitor 创建。plan-only 的 blocked 仅表示当前无新建授权/已 resolved，不是凭据或 monitor 可用性 blocker。 |
| 产品图 | `product_image_not_ready`；`prepare_unsupported`；下一动作：补齐资源事实后重跑只读。 |
| 小程序实例 | `micro_app_instance_id_missing`、`micro_app_instance_not_ready`、`instance_id_long_id_transport_not_verified`；`prepare_unsupported`。 |
| 备用落地页 | `target_not_visible`、`readback_not_verified`、`readonly_not_passed`；`prepare_unsupported`。 |
| 平台写入审计 | platform action `0`、平台创建 `0`、launch confirmation `0`、token refresh `0`。 |
| 脱敏修复 | 发现 plan-only evidence 的默认来源 URL 留存后，已精确替换为脱敏摘要；后续 monitor 对外/证据摘要统一脱敏 URL 值，并新增 smoke。 |

## Validation

- [x] `npm run test:readonly-readiness-cli`
- [x] `npm run test:monitor-bootstrap`
- [x] `npm run test:monitor-cycle`
- [x] `npm run test:monitor-planned-action`
- [x] `npm run test:video-material-executor`
- [x] `npm run workflow:readonly-readiness -- --route-id oceanengine_3_byte_mini_game --game-code JSZC --advertiser-id 1871922346964041 --expected-monitor-id 245828`
- [x] Node 4 focus resources、monitor attempt count、零平台写入与 evidence URL/secret 检查。
- [x] `npm run monitor:report` 的 `blockerReport=[]`。
- [x] `git diff --check` 与任务 JSON 解析通过。

## Next Gate

新建一个只读任务，按资源独立确认 `product_image`、`micro_app_instance`、`backup_landing_page` 的归属、合同或目标可见性缺口；不自动推进上传、创建、绑定、推送或 token refresh。
