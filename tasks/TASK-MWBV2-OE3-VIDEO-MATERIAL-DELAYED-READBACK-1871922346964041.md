# TASK-MWBV2-OE3-VIDEO-MATERIAL-DELAYED-READBACK-1871922346964041

## Brief

对账户 `1871922346964041` 补齐视频素材绑定后的延迟只读复核，并同步修正后续视频绑定 readback 机制：默认采样从 `0s/30s/60s` 升级为 `0s/10s/20s/30s/60s/120s/180s`，绑定后轮询仅查目标户，来源户结论复用绑定前预检。

## Scope

| 项 | 值 |
| --- | --- |
| route | `oceanengine_3_byte_mini_game` |
| game | `JSZC` |
| target advertiser | `1871922346964041` |
| source advertiser | `1760246749825031` |
| runtime job | `JOB-MWBV2-20260828020933-3D65DC` |
| original action | `ACTION-JOB-MWBV2-20260828020933-3D65DC-VIDEO-BIND-BATCH-01` |
| expected videos | `JSZC-HUNT-4IG2-3`, `JSZC-HUNT-4GE6-14` |

允许：本地改码、测试、Postgres 任务/证据摘要、真实只读 `file/video/get` / `file/image/get`。

禁止：第二次 `file/material/bind`、素材上传、乾坤接口、广告创建、token refresh、预算/出价修改、raw request/response/token/Cookie/素材 URL 入库或入文档。

## Mechanism Changes

- `DEFAULT_VIDEO_READBACK_DELAYS_MS` 改为 `[0, 10000, 20000, 30000, 60000, 120000, 180000]`。
- 绑定成功响应受理后才启动 readback 计时；整组视频和封面满足规则时提前结束，窗口耗尽时返回兼容状态 `readback_pending`，并写入 `windowExhausted=true`、`terminalReason=readback_window_exhausted`。
- 绑定后的轮询使用目标账户专用 probe，不再每轮重复查询来源户。
- 每轮采样记录计划延时、实际 elapsed、整组数量、素材级可见性、封面模式、request id/hash 是否存在。
- readback 结果以 `readback_cycles` 追加到原 action metadata，并生成唯一 `video_material_readback_cycle` evidence；旧 `readback_attempts` 不覆盖。
- 新增长期 CLI：`npm run resource:video-material-readback`。

## Result

状态：`closed_readback_verified`。

| 项 | 结果 |
| --- | --- |
| delayed readback status | `readback_verified` |
| target video visibility | 两条均可见 |
| cover mode | 两条均为 `platform_default_cover_allowed` |
| first full visible window | `0s` 采样点，实际约 `1402ms` |
| platform write called | `false` |
| token refresh called | `false` |
| bind action count | `1` |
| legacy attempts retained | `3` 条：`0s/30s/60s` |
| appended readback cycles | `1` |
| evidence | `EV-JOB-MWBV2-20260828020933-3D65DC-VIDEO-MATERIAL-READBACK-CYCLE-VRB-JOB-MWBV2-20260828020933-3D65DC-delayed_manual_readback-20260828T030052-9b1d9f77` |

统计：当前同维度共有 `2` 个 readback cycle，其中成功 `1`、未收敛 `1`；成功样本少于 `3`，因此标记 `insufficientSample=true`，不计算 P50/P90。

## Acceptance

- [x] 默认绑定后 readback 改为 `0/10/20/30/60/120/180` 秒。
- [x] 绑定后轮询只查目标户，并复用来源户预检结论。
- [x] 窗口耗尽时保留兼容 `readback_pending`，并增加 terminal reason。
- [x] 延迟复核 CLI 先校验原 action 为 `HTTP 200 / API 0 / fail_list=0`。
- [x] 延迟复核不调用乾坤、不上传、不绑定、不刷新 token。
- [x] 旧 evidence/attempts 不覆盖，新 cycle 与 evidence 唯一追加。
- [x] 统计样本不足时不输出分位值。
- [x] 目标账户仍只有既有 1 次 `file/material/bind`。
