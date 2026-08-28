# TASK-MWBV2-OE3-VIDEO-MATERIAL-BIND-MECHANISM-PREFLIGHT-1871922346964041

## Brief

对账户 `1871922346964041` 收口 Node 4 视频素材机制：补齐可追溯 `video-material-bind-plan` Skill、执行器预检/scope、长期 dry-run CLI 与测试；本任务只做机制和真实只读预检，不绑定视频。

## Scope

- route: `oceanengine_3_byte_mini_game`
- game: `JSZC`
- target advertiser: `1871922346964041`
- 当前最高优先 blocker: `video_material_not_ready:JSZC-HUNT-4IG2-3`，同步核验 `JSZC-HUNT-4GE6-14`
- 允许：本地改码、Postgres 任务/证据摘要、真实只读 `file/video/get` 与 `file/image/get`
- 禁止：素材上传、素材绑定、广告创建、monitor 创建、token refresh、预算/出价修改

## Historical Reference

| 参考 | 可借鉴点 | 边界 |
| --- | --- | --- |
| `/Users/hys/Projects/marketing-workbench` | 来源核验、目标核验、单素材绑定、`0s/30s/60s` 延迟回查 | 不作为 v2 runtime 依赖 |
| PostgreSQL `marketing_workbench` | 历史资源/审计/状态建模 | 不作为本账户实时真值 |
| OE 2.0 fallback docs | `file/material/bind` 官方兜底合同 | 3.0 缺详细页时才使用；若冲突则暂停 |

## Contract

| 模块 | 规则 |
| --- | --- |
| 只读核验 | 来源户/目标户分别按 `advertiser_id + filtering.video_ids + page/page_size` 查询 |
| 绑定计划 | 仅对 `source_ready_target_missing` 生成 `oceanengine_material_bind_target` |
| 绑定请求 | `POST /open_api/2/file/material/bind/`，字段为 `advertiser_id`、`target_advertiser_ids`、`video_ids` |
| 成功判定 | HTTP/API 成功且当前素材不在 `fail_list`；最终仍需目标户 readback |
| 回查策略 | 后续真实绑定任务使用 `0s/30s/60s`；未收敛则关闭，不自动重绑 |

## Progress

- [x] 建立任务卡、manifest 与权限边界。
- [x] `AGENTS.md` 增加旧项目/旧库只读经验入口。
- [x] 新增 `video-material-bind-plan` Skill 并接入 Node 4 调度与 trace。
- [x] 修复视频执行器默认旧账户、request hash、`fail_list` 与 idempotency。
- [x] 新增视频执行 scope 与长期 dry-run CLI。
- [x] 完成 smoke/check 与真实只读 readiness。

## Result

状态：`closed_success`。

| 项 | 结果 |
| --- | --- |
| platform writes | `0` |
| token refresh | `0` |
| fresh readonly job | `JOB-MWBV2-20260828020933-3D65DC` |
| fresh execution plan | `PLAN-JOB-MWBV2-20260828020933-3D65DC-V1` |
| plan hash | `sha256:ffadc9cc96709794ac1ef6b0615c0aa4fa00433942aac4b89b99e5dce5313a8e` |
| `video-material-bind-plan` | passed；`bindActionCount=2`、`requestHashCount=2` |
| `resource-verify-video-asset` | blocked；`JSZC-HUNT-4IG2-3`、`JSZC-HUNT-4GE6-14` |
| readonly state | 两条视频均为 `source_ready_target_missing` |
| expected next gate | 新建“视频集合单次绑定与 0/30/60 秒回查”任务 |

观察：本轮带 `expected-monitor-id=245828` 的 full readiness 被乾坤 `accountIndex` 403 拦截，原因是当前 ApiToken 无效；本地 DB 仍记录 `monitor_id=245828` 且触点 URL 已存在。视频机制验证使用显式空 `expected-monitor-id` 继续跑完 Node 4 只读，未创建或绑定任何平台对象。

## Acceptance

- `video-material-bind-plan` 可从 fresh bundle 输出每条视频的 source/target 状态、request hash、下一动作。
- 执行器不再写死旧目标账户。
- `file/material/bind` 的 `fail_list` 会阻断成功判定。
- 真实绑定入口仍需单次 scope 与确认变量，本任务不调用。
- 任务结束后 `active_task=null`，`platform_write_allowed=false`。
- 不保存 token、Cookie、raw request、raw response、素材 URL。
