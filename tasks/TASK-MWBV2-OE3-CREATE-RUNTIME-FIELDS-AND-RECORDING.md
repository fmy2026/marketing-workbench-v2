# TASK-MWBV2-OE3-CREATE-RUNTIME-FIELDS-AND-RECORDING

状态：completed

更新时间：2026-08-24 CST

## 目标

补齐 v2 真实 `std_project/create` 前最后一组运行字段，并补齐真实创建记录表。本任务不执行 `std_project/create`。

## 固定目标

| 字段 | 值 |
| --- | --- |
| `job_id` | `JOB-MWBV2-20260824014546-851B76` |
| `draft_id` | `DRAFT-JOB-MWBV2-20260824014546-851B76` |
| `project_name` | `245791_N_JSZC_HUNT_PAY7DROI_平台定向不限_P19_20260824` |
| `payload_hash` | `sha256:8db82f4009abfc567592e59b4d11ad6324b4fbb12dd9d40cb89f64aa5007c7b7` |

## 独立项目边界

| 类型 | 规则 |
| --- | --- |
| v2 数据库 | 只使用 `marketing_workbench_v2.mwb` |
| v2 前端/API/脚本 | 只使用本项目 `frontend/`、`src/`、`scripts/` |
| v2 凭据 | 只读取本项目 `.local/oceanengine.env` |
| 旧项目 | 只借鉴字段来源和类型策略，不作为运行依赖 |
| 禁止 | import/shell 调用旧项目脚本、读取旧库作为 v2 运行真值、从旧项目运行任务 |

## 本任务范围

| 项 | 动作 |
| --- | --- |
| 创建运行字段 | 补齐 `micro_app_instance_id`、`aweme_id`、`mini_program_url`、`video_id`、`video_cover_id` |
| 记录表 | 新增 `mwb.launch_confirmations`、`mwb.platform_actions`、`mwb.created_objects` |
| create executor | 增加确认、平台动作、真实对象记录写入逻辑 |
| 安全 | raw payload/raw response 不入库；完整 URL 不进 API/前端/任务文件 |
| 真实创建 | 不执行 |

## 数据写入位置

| 字段 | v2 写入位置 |
| --- | --- |
| `micro_app_instance_id` | `mwb.account_resources.micro_app_instance.metadata.micro_app_instance_id` 和 `mwb.game_platform_apps.metadata.micro_app_instance_id` |
| `aweme_id` | `mwb.account_resources.avatar.metadata.default_aweme_id` |
| `mini_program_url` | `mwb.account_resources.micro_app_instance.metadata.mini_program_url`，受控本地字段，不输出 |
| `video_id / video_cover_id` | `mwb.game_assets.metadata.video_id`、`mwb.game_assets.metadata.video_cover_id` |

## 验收

| 标准 | 状态 |
| --- | --- |
| 新表存在 | passed |
| v2 运行字段补齐 | passed |
| `npm run std-project:create-once` 无确认变量只剩确认变量和网络写入 blocker | passed |
| 不再出现缺字段 blocker | passed |
| 未执行真实 `std_project/create` | passed |
| 无 token/secret/Cookie/auth_code/完整触点 URL/raw payload/raw response 泄漏 | passed |

## 完成结果

| 项 | 结果 |
| --- | --- |
| 新增表 | `mwb.launch_confirmations`、`mwb.platform_actions`、`mwb.created_objects` |
| `micro_app_instance_id` | 已写入 v2 Postgres |
| `aweme_id` | 已写入 v2 Postgres |
| `mini_program_url` | 已写入 v2 受控 metadata；不输出明文 |
| `video_id / video_cover_id` | 已写入 v2 `game_assets.metadata` |
| 无确认变量 create-once | `createCalled=false` |
| 剩余 blocker | `confirm_variable_missing_or_invalid`、`network_write_not_enabled_by_caller` |
| 真实创建记录表行数 | 仍为 0，符合本任务未创建要求 |

## 验证结果

| 命令 | 结果 |
| --- | --- |
| `npm run token:status` | passed |
| `npm run resource:diagnose` | passed |
| `npm run resource:readback` | passed |
| `npm run smoke:readonly` | passed |
| `npm run smoke:api` | passed |
| `npm run test:payload-contract` | passed |
| `npm run std-project:create-once` | blocked before create；只剩确认变量和网络写入 blocker |

## 验证命令

```bash
npm run token:status
npm run resource:diagnose
npm run resource:readback
npm run smoke:readonly
npm run smoke:api
npm run test:payload-contract
npm run std-project:create-once
```

## 下一步

本任务已完成。下一步回到“单次真实创建执行任务”，由用户显式确认后再执行一次真实 `std_project/create`。
