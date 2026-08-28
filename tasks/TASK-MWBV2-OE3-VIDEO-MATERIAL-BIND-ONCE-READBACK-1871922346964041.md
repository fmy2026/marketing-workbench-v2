# TASK-MWBV2-OE3-VIDEO-MATERIAL-BIND-ONCE-READBACK-1871922346964041

## Brief

对账户 `1871922346964041` 执行 Node 4 视频素材集合单次绑定与 `0s/30s/60s` 整组回查。只处理视频资源；本任务忽略乾坤 token 问题，不调用乾坤接口，不创建广告。

## Scope

| 项 | 值 |
| --- | --- |
| route | `oceanengine_3_byte_mini_game` |
| game | `JSZC` |
| target advertiser | `1871922346964041` |
| source advertiser | `1760246749825031` |
| runtime job | `JOB-MWBV2-20260828020933-3D65DC` |
| execution plan | `PLAN-JOB-MWBV2-20260828020933-3D65DC-V1` |
| plan hash | `sha256:ffadc9cc96709794ac1ef6b0615c0aa4fa00433942aac4b89b99e5dce5313a8e` |
| expected videos | `JSZC-HUNT-4IG2-3`、`JSZC-HUNT-4GE6-14` |

允许：本地改码、测试、Postgres 任务/证据摘要、真实只读 `file/video/get` / `file/image/get`、一次受控 `file/material/bind` 集合请求。

禁止：乾坤接口、monitor 创建、广告创建、素材上传、token refresh、预算/出价修改、raw request/response/token/Cookie/素材 URL 入库或入文档。

## Execution Contract

| 阶段 | 规则 |
| --- | --- |
| 视频预检 | 直接运行视频来源户/目标户只读，不依赖乾坤或 monitor |
| 绑定计划 | 仅绑定 fresh preflight 中仍为 `source_ready_target_missing` 的视频；目标户已存在则跳过 |
| 绑定请求 | `POST /open_api/2/file/material/bind/`，字段仅 `advertiser_id`、`target_advertiser_ids`、`video_ids` |
| 集合策略 | 按来源户分组，稳定排序，每批最多 50 条；当前两条同源，预计 1 次请求 |
| 授权边界 | 一个高层 `ensure_resource:video_asset`，内部 `maximum_platform_calls=1`，禁止重试 |
| 回查 | 绑定成功后目标户只读 `0s/30s/60s`，两条视频可见且封面满足显式或默认规则则通过 |
| 失败处理 | 任一 `fail_list`、接口失败、来源缺失、hash/scope 不匹配或 60 秒未收敛即停止，不自动重绑 |

## Progress

- [x] 建立任务卡、manifest 与任务状态。
- [x] 新增视频集合执行器、batch request hash、batch scope 校验和长期 CLI。
- [x] 扩展视频 executor smoke。
- [x] 完成回归测试。
- [x] 临时开启视频精确写入 scope。
- [x] 执行一次真实视频集合绑定与整组回查。
- [x] 撤回写权限，关闭任务并更新下一 gate。

## Result

状态：`closed_readback_pending`。

| 项 | 结果 |
| --- | --- |
| platform action | `ACTION-JOB-MWBV2-20260828020933-3D65DC-VIDEO-BIND-BATCH-01` |
| bind request count | `1` |
| bind action status | `succeeded` |
| HTTP/API | `200` / `0` |
| request id | present |
| response hash | present |
| fail list | `0` |
| readback attempts | `0s / 30s / 60s` |
| readback result | `readback_pending`；两条视频仍为 `source_ready_target_missing` |
| write scope | revoked |

结论：本次不是绑定接口参数失败；平台已受理集合绑定请求，但目标账户在 60 秒回查窗口内仍未出现两条视频。按任务边界不自动第二次绑定。

下一 gate：新建“视频素材绑定后延迟只读复核/技术确认”任务；仅做目标户只读或技术排查，不重复绑定，除非后续另行确认重发。

## Acceptance

- 当前目标户最多发生 `1` 次 `file/material/bind` 请求。
- 两条视频成功时均写为目标户 `readback_verified`。
- 失败时记录批次、素材级脱敏证据、HTTP/API 状态、`fail_list` 摘要和 hash。
- `platform_write_allowed` 在结束后恢复为 `false`，`active_task=null`。
- 不创建广告、monitor、预算、出价或其他资源，不刷新 token。
