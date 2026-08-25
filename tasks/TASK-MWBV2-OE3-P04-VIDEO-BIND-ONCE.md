# TASK-MWBV2-OE3-P04-VIDEO-BIND-ONCE

状态：completed

更新时间：2026-08-25 CST

## 需求来源

用户提供 `/Users/hys/Desktop/需求表述.md`。该文件要求仅将 P04 必需视频 `JSZC-HUNT-4GE6-14` 从巨兽战场物料户/超管绑定或推送到目标账户；绑定后自动只读回查并重跑 P04 视频素材 readiness。

## 结构化理解

本任务是节点 4 `account_resource_prepare` 的可修复子流程，不是 `std_project/create`。唯一目标是补齐：

```text
source_asset_id=JSZC-HUNT-4GE6-14
物料户/超管 1760246749825031
-> 目标账户 1871922175825993
-> 目标账户只读回查
-> P04 视频 readiness 2/2
```

## 固定对象

| 项 | 值 |
| --- | --- |
| route_id | `oceanengine_3_byte_mini_game` |
| game_code | `JSZC` |
| source_asset_id | `JSZC-HUNT-4GE6-14` |
| 物料户/超管 | `1760246749825031` |
| 目标账户 | `1871922175825993` |
| 当前 P04 job | `JOB-MWBV2-20260824151431-ECA120` |
| 当前 P04 draft | `DRAFT-JOB-MWBV2-20260824151431-ECA120` |

## 判断

需求合理。上一任务已确认：该视频在物料户可读，但目标账户不可读；不需要重新上传视频，也不需要绑定封面图。本任务应只允许一次 `oceanengine_material_bind_target`。

当前轮次未提供确认变量，所以本轮实现受控绑定能力、dry-run preflight 与 action plan；真实绑定必须另带：

```text
MWBV2_OE_VIDEO_MATERIAL_CONFIRM=BIND_ONE_VIDEO_TO_TARGET
```

## 权限

| 项 | 状态 |
| --- | --- |
| 读取 v2 Postgres | 允许 |
| 写入 task/manifest/project.state | 允许 |
| 写入脱敏 preflight/action/evidence 摘要 | 允许 |
| OceanEngine 只读 probe | 允许 |
| OceanEngine material bind | 仅带确认变量、scope 匹配、preflight 通过时允许一次 |
| `std_project/create` | 禁止 |
| 上传视频/封面 | 禁止 |
| token refresh | 禁止 |
| 旧项目 runtime 依赖 | 禁止，仅人工参考 |

## 目标

1. 建立 `video-material:bind-once` 薄 CLI。
2. 在 `src/platforms/oceanengineVideoMaterialExecutor.mjs` 中实现唯一受控 bind preflight 与 gated executor。
3. 绑定前必须确认：源账号可读、目标账号未可读、本地素材与物料包一致、无成功绑定 action、无目标已验证资源。
4. 无确认变量时仅输出脱敏 blocker，不调用 bind API。
5. 若未来带确认变量执行，最多调用一次绑定接口，失败即停，成功或重复均自动只读回查。
6. P04 旧 create scope 保持 superseded，不得恢复。

## 非目标

| 项 | 状态 |
| --- | --- |
| `std_project/create` | 禁止 |
| 视频上传 | 禁止 |
| 封面图片上传/绑定 | 禁止 |
| 自动重试 | 禁止 |
| DMP/事件资产/预算/出价写入 | 禁止 |
| 保存 token、Cookie、完整触点 URL、video ID、cover ID、raw payload、raw response | 禁止 |

## 验收

| 标准 | 状态 |
| --- | --- |
| task 与 context manifest 已建立 | passed |
| bind-once CLI 已建立 | passed |
| 无确认变量时 dry-run/preflight 不调用绑定接口 | passed |
| preflight 能识别 `JSZC-HUNT-4GE6-14` 只需绑定到目标账户 | passed |
| 绑定 scope 不允许 `std_project/create` 或上传 | passed |
| `npm run check:video-material-prepare` 仍通过 | passed |
| `npm run test:payload-contract` 仍通过 | passed |
| `npm run smoke:workflow-skills` 仍通过 | passed |
| `npm run smoke:api` 仍通过 | passed |
| `npm run check:runtime-consistency` 仍通过 | passed |
| 本轮 `std_project/create` 次数为 0 | passed |

## 执行结果

| 项 | 结果 |
| --- | --- |
| 是否实际执行绑定 | 是，单次执行 |
| 绑定 action | `oceanengine_material_bind_target` |
| 绑定对象 | `JSZC-HUNT-4GE6-14` |
| API 结果 | `http=200`、`api_code=0`、`request_id_present=true` |
| action 记录 | `ACTION-JOB-MWBV2-20260824151431-ECA120-VIDEO-BIND-JSZC_HUNT_4GE6_14`，状态 `succeeded` |
| evidence | `EV-JOB-MWBV2-20260824151431-ECA120-VIDEO-BIND-JSZC_HUNT_4GE6_14`，脱敏摘要 |
| 绑定 scope | 执行后已收回，`platform_write_allowed=false` |
| `std_project/create` | 未执行，计数 `0` |

## 回查结果

| 项 | 结果 |
| --- | --- |
| `JSZC-HUNT-4IG2-3` | `source_ready_target_ready` |
| `JSZC-HUNT-4GE6-14` | `source_ready_target_ready` |
| 视频 readiness | `2/2` |
| 封面策略 | 两条均 `platform_default_cover_allowed` |
| P04 节点 4 | `passed` |
| P04 payload contract | `passed` |
| P04 `final_payload_blockers` | `[]` |
| P04 当前 payload hash | `sha256:11e4a6623b5aba40a63d134cda6346b84de4c89550f1859f6dbef6b5d4e10e80` |

## 验证命令

| 命令 | 结果 |
| --- | --- |
| dry-run preflight | passed，未调用绑定 |
| `MWBV2_OE_VIDEO_MATERIAL_CONFIRM=BIND_ONE_VIDEO_TO_TARGET npm run video-material:bind-once -- --job-id JOB-MWBV2-20260824151431-ECA120 --source-asset-id JSZC-HUNT-4GE6-14 --execute` | passed，单次绑定成功 |
| `npm run check:video-material-prepare` | passed，`readyCount=2` |
| `npm run test:payload-contract` | passed |
| `npm run smoke:workflow-skills` | passed |
| `npm run smoke:api` | passed |
| `npm run check:runtime-consistency` | passed |
| `npm run token:status` | passed，未刷新 token |

## 下一步

生成 fresh runtime job/draft，并为 fresh draft 重新完成 duplicate check、payload hash 与 preflight。P04 原 create scope 已废弃，不允许恢复；若要真实 `std_project/create`，必须另开新的单次创建确认任务。
