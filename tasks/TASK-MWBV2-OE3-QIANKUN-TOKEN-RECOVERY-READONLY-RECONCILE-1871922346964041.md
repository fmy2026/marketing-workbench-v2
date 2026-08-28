# TASK-MWBV2-OE3-QIANKUN-TOKEN-RECOVERY-READONLY-RECONCILE-1871922346964041

状态：closed_touchpoint_resolved

更新时间：2026-08-28 CST

## Brief

用户已确认乾坤 ApiToken 已更新。本任务对账户 `1871922346964041` 做一次凭据恢复后的乾坤只读回查，验证账户可读性，并对已耗尽的 Monitor Cycle-01 做只读 reconcile。

当前视频素材延迟复核已通过；旧 full-chain job 的视频 blocker 已过期。下一关键点是先消除乾坤账户和监测序号事实的不确定性，再回到新的 full-chain readonly readiness 核验 Node 4 剩余资源。

## Scope

| 项 | 值 |
| --- | --- |
| route | `oceanengine_3_byte_mini_game` |
| game | `JSZC` |
| advertiser | `1871922346964041` |
| provision | `MPR-OCEANENGINE-3-BYTE-MINI-GAME-JSZC-1871922346964041` |
| cycle | `Cycle-01` |
| command | `npm run monitor:reconcile` |

允许：

- 运行现有 monitor cycle / planned-action smoke。
- 执行一次真实乾坤只读 reconcile。
- 仅调用 `POST /tf/account_info/accountIndex` 和 `POST /tf/ad/index`。
- 写入本地 Postgres runtime truth、脱敏 evidence、monitor provision 只读回查状态。
- 更新本任务卡、context manifest 和 `project.state.json`。

禁止：

- 调用 `/tf/ad/monitorSerialNumberAdd`。
- 发起第三次乾坤 monitor 创建。
- 调用 OceanEngine 写接口、素材绑定、素材上传、广告创建、DMP push、预算或出价修改。
- 刷新 token。
- 保存 ApiToken、Cookie、raw request、raw response、header 或完整触点 URL 到项目文件、普通日志、API 或前端。
- 覆盖两次历史创建 attempt 和 `server_busy` 失败证据。

## Acceptance

- [x] `npm run test:monitor-cycle` 通过。
- [x] `npm run test:monitor-planned-action` 通过，并确认非授权/已有路径不会调用创建接口。
- [x] `npm run test:monitor-bootstrap` 通过，覆盖 reference candidates 参与只读精确匹配且不调用创建端点。
- [x] `npm run monitor:reconcile` 完成真实只读回查。
- [x] CLI 输出 `createCalled=false`，且 evidence 不包含敏感值。
- [x] 数据库中该 provision 的历史 attempt 数仍为 `2`。
- [x] 未新增 OceanEngine platform action，未发生 token refresh。
- [x] 账户和 monitor 精确命中且触点 hash 可用，下一 gate 指向 fresh full-chain readonly readiness。

## Initial Runtime Truth

- `project.state.json.project_status=oe3_video_material_readback_verified`。
- 视频素材任务 `TASK-MWBV2-OE3-VIDEO-MATERIAL-DELAYED-READBACK-1871922346964041` 已关闭为 `closed_readback_verified`。
- 当前 guardrail：`platform_write_allowed=false`，`maximum_platform_calls=0`，乾坤第三次创建在 `do_not_start` 中明确禁止。
- 数据库中 `MPR-OCEANENGINE-3-BYTE-MINI-GAME-JSZC-1871922346964041-CYCLE-01` 已有 `create_attempt_no=2`，两次 attempt 均为历史创建失败证据；本任务只做只读回查，不增加 attempt。

## Result

状态：`touchpoint_resolved`。

| 项 | 结果 |
| --- | --- |
| ApiToken status | `active` |
| accountIndex | `HTTP 200 / API code 0 / Success` |
| account exact match | 1 条，账户 `1871922346964041` |
| owner | `fengmeiyu` / `冯美钰` |
| account auth | `授权正常` |
| ad/index | `HTTP 200 / API code 0 / Success` |
| monitor exact match | 1 条 |
| monitor id | `245828` |
| touchpoint | hash present，明文 URL 未写入 |
| CLI createCalled | `false` |
| historical attempt count | `2`，旧 `server_busy` 失败证据保留 |
| monitor create platform actions | `0` |
| evidence | `EV-MPR-OCEANENGINE-3-BYTE-MINI-GAME-JSZC-1871922346964041-READONLY-RECONCILE` |

## Implementation Notes

- `runMonitorProvisionReadonlyReconcile` 现在复用 `monitorPlanConfig`，允许 `monitor_provision_reference_candidates` 中的 `media_id`、`agent_id`、`monitor_api` 参与只读精确匹配；本轮实际命中后，这些字段由平台返回事实验证。
- 只读回查成功解析触点 hash 时，`monitor_provision_runs.cycle_status` 写为 `resolved`，避免已闭环 cycle 继续显示历史创建失败 blocker。
- `getMonitorProvisionBlockerReport` 过滤已 resolved / `touchpoint_resolved` provision；历史 attempt 仍保留在 status report，不再阻塞下一 gate。
- 首次真实只读回查暴露了 reference candidates 未参与精确匹配的本地机制缺口；修复后补跑只读回查完成闭环。全程未调用 `/tf/ad/monitorSerialNumberAdd`。

## Next Gate

新建 fresh full-chain readonly readiness，重新核验账户 `1871922346964041` 的 Node 4。预期旧视频 blocker 与乾坤凭据 blocker 均消失，重点只剩产品图、小游戏实例、备用落地页等资源缺口。
