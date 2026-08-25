# TASK-MWBV2-OE3-P04-VIDEO-MATERIAL-PREPARE

状态：completed_blocked

更新时间：2026-08-25 CST

## 需求来源

用户提供 `/Users/hys/Desktop/需求表述.md`，并补充：巨兽战场视频素材先上传到固定物料户或超管，再推送到目标账户；巨兽战场物料户固定为 `1760246749825031`，P04 目标账户为 `1871922175825993`。

## 结构化理解

本任务目标是为 JSZC / P04 建立 v2 独立的视频素材准备闭环：

```text
v2 本地保底 MP4
-> 物料户/超管素材状态
-> 目标账户绑定/可读状态
-> 节点 4 视频资源 readiness
-> fresh draft / 新单次创建 scope
```

这不是 `std_project/create` 任务。本任务期间不执行真实项目创建，不消费 P04 旧 create scope，不刷新 token。

## 固定对象

| 项 | 值 |
| --- | --- |
| route_id | `oceanengine_3_byte_mini_game` |
| game_code | `JSZC` |
| 当前轮次 | `P04` |
| 当前 P04 job | `JOB-MWBV2-20260824151431-ECA120` |
| 当前 P04 draft | `DRAFT-JOB-MWBV2-20260824151431-ECA120` |
| 目标账户 | `1871922175825993` |
| 巨兽战场物料户/超管 | `1760246749825031` |
| 必需视频 | `JSZC-HUNT-4IG2-3`、`JSZC-HUNT-4GE6-14` |

## 判断

需求合理。上一轮把 `video_cover_id` 强制等同于“必须有独立封面图片资源回查”，会把平台默认首帧/高光封面路径误判为阻断。本任务应改为：视频必须在目标账户可用；封面可以是显式封面已验证，或平台默认封面允许。

真实上传、绑定属于平台写入，必须单次授权、按 action list 执行、失败即停。本任务先完成独立资产、计划、只读与受控骨架；若要真实上传/绑定，必须另由用户明确确认。

## 权限

| 项 | 状态 |
| --- | --- |
| 读取 v2 Postgres | 允许 |
| 写入 v2 Postgres 脱敏状态/hash/证据 | 允许 |
| 复制本地 MP4 到 v2 独立资产目录 | 允许 |
| OceanEngine 只读 probe | 允许 |
| 真实视频上传/绑定 | 仅实现受控计划与骨架；无确认变量不执行 |
| `std_project/create` | 禁止 |
| token refresh | 禁止 |
| 旧项目运行依赖 | 禁止，仅可人工参考 |

## 目标

1. 将两条 P04 保底 MP4 独立保存到 `/Users/hys/ProjectAssets/marketing-workbench-v2/JSZC/videos/`。
2. 更新两条 `game_assets` 的本地路径、文件 hash、文件大小、素材来源。
3. 建立唯一视频素材准备入口：Workflow Skill -> `src/platforms/oceanengineVideoMaterialExecutor.mjs` -> Postgres。
4. 支持只读计划：源账号已就绪、目标缺失、源缺失但本地文件存在、源/本地均缺失、平台 probe 失败。
5. 调整 payload/preflight：`video_id` 必须存在，`video_cover_id` 仅在显式封面验证时发送；平台默认封面允许时不发送空值或伪 ID。
6. P04 当前 create scope 撤销或标记 superseded，不允许继续使用旧 scope。

## 非目标

| 项 | 状态 |
| --- | --- |
| 执行真实 `std_project/create` | 禁止 |
| 自动上传视频 | 禁止 |
| 自动绑定素材到目标账户 | 禁止 |
| 自动重试平台写入 | 禁止 |
| 上传/绑定封面图 | 禁止 |
| 刷新 token | 禁止 |
| 保存 token、Cookie、完整触点 URL、video ID、cover ID、raw payload、raw response | 禁止 |
| 依赖 `/Users/hys/Projects/marketing-workbench` 作为 runtime | 禁止 |

## 验收

| 标准 | 状态 |
| --- | --- |
| task 与 context manifest 已建立 | passed |
| v2 独立资产目录存在两条 P04 MP4 | passed |
| `game_assets` 已记录本地路径、hash、大小、来源 | passed |
| 视频准备逻辑只有一个平台 executor | passed |
| 无 grant 时只输出 action plan，不上传、不绑定 | passed |
| 节点 4 可展示 `视频素材 2/2 已就绪` 或明确阻断原因 | passed |
| 默认封面策略不再制造伪阻断 | passed |
| 相关 smoke/test 通过 | passed |
| 本任务 `std_project/create` 次数为 0 | passed |
| 无敏感信息泄漏 | passed |

## 执行结果

| 项 | 结果 |
| --- | --- |
| v2 资产目录 | `/Users/hys/ProjectAssets/marketing-workbench-v2/JSZC/videos/` |
| `JSZC-HUNT-4IG2-3` | 已复制，hash/大小已写入 `game_assets.metadata.local_file` |
| `JSZC-HUNT-4GE6-14` | 已复制，hash/大小已写入 `game_assets.metadata.local_file` |
| 视频素材准备入口 | `src/platforms/oceanengineVideoMaterialExecutor.mjs` |
| CLI | `npm run check:video-material-prepare` |
| 默认封面策略 | `platform_default_cover_allowed` 为合法 readiness 状态；默认封面模式下不发送 `video_cover_id` |
| P04 当前 payload_hash | `sha256:11e4a6623b5aba40a63d134cda6346b84de4c89550f1859f6dbef6b5d4e10e80` |
| P04 原 create scope | 已在 `project.state.json` 标记 `superseded_p04_create_scope_material_strategy_changed` |
| P04 写入计数 | `platform_actions=0`、`launch_confirmations=0`、`created_objects=0`、真实 `readback_records=0` |

## 视频计划

| source_asset_id | plan_status | cover_mode | 动作 |
| --- | --- | --- | --- |
| `JSZC-HUNT-4IG2-3` | `source_ready_target_ready` | `platform_default_cover_allowed` | 无需动作 |
| `JSZC-HUNT-4GE6-14` | `source_ready_target_missing` | `cover_not_ready` | 仅需绑定或推送到目标账户 |

## 验证命令

| 命令 | 结果 |
| --- | --- |
| `npm run check:video-material-prepare` | passed，输出 dry-run action plan |
| `npm run test:payload-contract` | passed |
| `npm run smoke:workflow-skills` | passed |
| `npm run smoke:api` | passed |
| `npm run check:runtime-consistency` | passed |
| `npm run token:status` | passed，脱敏输出，未刷新 |
| Postgres 写入计数校验 | passed |
| runtime 旧项目依赖扫描 | passed，无命中 |

## 下一步

另开“P04 单次视频素材绑定/推送任务”：仅对 `JSZC-HUNT-4GE6-14` 从物料户/超管 `1760246749825031` 绑定或推送到目标账户 `1871922175825993`。动作成功后重跑 video material prepare 与 P04 readiness，再生成 fresh runtime job/draft，并由用户另行确认新的单次 `std_project/create` scope。
