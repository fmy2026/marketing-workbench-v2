# TASK-MWBV2-OE3-STD-PROJECT-CREATE-ONCE

状态：implementation_ready_waiting_explicit_confirmation

更新时间：2026-08-24 CST

## 目标

在 v2 独立项目内执行一次真实 OceanEngine 3.0 `std_project/create`，并立即 readback 收口。本任务当前已完成任务准备、执行器落地、运行字段补齐和非写入预检；真实创建必须由确认变量触发。

## 固定目标

| 字段 | 值 |
| --- | --- |
| `job_id` | `JOB-MWBV2-20260824014546-851B76` |
| `draft_id` | `DRAFT-JOB-MWBV2-20260824014546-851B76` |
| `object_type` | `std_project` |
| `route_id` | `oceanengine_3_byte_mini_game` |
| `game_code` | `JSZC` |
| `advertiser_id` | `1871922175825993` |
| `project_name` | `245791_N_JSZC_HUNT_PAY7DROI_平台定向不限_P19_20260824` |
| `payload_hash` | `sha256:8db82f4009abfc567592e59b4d11ad6324b4fbb12dd9d40cb89f64aa5007c7b7` |

## 独立项目边界

| 类型 | 规则 |
| --- | --- |
| v2 数据库 | 只使用 `marketing_workbench_v2.mwb` |
| v2 前端/API/脚本 | 只使用本项目 `frontend/`、`src/`、`scripts/` |
| v2 凭据 | 只读取本项目 `.local/oceanengine.env` |
| 旧项目 | 只借鉴 payload 白名单、类型策略、单次确认和 readback 经验 |
| 禁止 | import/shell 调用旧项目脚本、读取旧库作为运行真值、从旧项目复制 token |

## 写入边界

| 项 | 规则 |
| --- | --- |
| 唯一允许写入 | `POST /open_api/v3.0/std_project/create/` |
| 最大次数 | 1 |
| 必须确认变量 | `MWBV2_OE_STD_PROJECT_CREATE_CONFIRM=CREATE_ONE_STD_PROJECT` |
| 执行命令 | `MWBV2_OE_STD_PROJECT_CREATE_CONFIRM=CREATE_ONE_STD_PROJECT npm run std-project:create-once` |
| 单次锁 | `.local/std-project-create-attempt-JOB-MWBV2-20260824014546-851B76.json` |
| 失败策略 | 不自动重试；只读查重后停人工判断 |

## 禁止动作

| 动作 | 状态 |
| --- | --- |
| 创建第二个 `std_project` | 禁止 |
| `promotion/create` | 禁止 |
| `project/create` | 禁止 |
| 素材上传 | 禁止 |
| 事件资产创建 | 禁止 |
| DMP push | 禁止 |
| 预算 / 出价修改 | 禁止 |
| token refresh | 禁止 |
| raw payload / raw response 入库或输出 | 禁止 |

## 已落地实现

| 文件 | 动作 |
| --- | --- |
| `src/platforms/oceanengineStdProjectCreateExecutor.mjs` | 新增一次性创建执行器、受控 payload 构建、单次锁、创建后 readback |
| `scripts/std-project-create-once.mjs` | 新增真实创建入口；无确认变量时只输出 blocker |
| `scripts/std-project-readback-once.mjs` | 新增只读 readback 入口 |
| `src/repositories/postgresRepository.mjs` | 新增受控触点 URL 读取和节点状态写回方法 |
| `package.json` | 新增 `std-project:create-once`、`std-project:readback-once` |
| `project.state.json` | 切换为本任务 active_task |

## 创建前必须重跑

```bash
npm run token:status
npm run resource:diagnose
npm run resource:readback
npm run smoke:readonly
npm run smoke:api
npm run test:payload-contract
```

## 当前非写入预检结果

| 项 | 结果 |
| --- | --- |
| token 状态 | valid |
| payload contract | passed |
| `gapCount` | `0` |
| `blockedResourceTypes` | `[]` |
| duplicate status | `platform_not_duplicate` |
| 创建执行器 | 已就绪；等待显式确认变量 |
| 真实 `std_project/create` | 未执行 |

## 真实创建前额外 payload 字段

一次性执行器会在写入前检查 v2 自己的 Postgres 是否已有完整创建 payload 所需字段。缺失时会阻断，不会回退读取旧项目。

| 字段类型 | 来源 |
| --- | --- |
| `touchpoint_url` | v2 `mwb.account_touchpoints` 受控读取，不输出 |
| `event_asset_id` | v2 `mwb.account_resources.event_asset.platform_resource_id` |
| `brand_info` | v2 `mwb.launch_drafts.payload_summary.brand_info` |
| `product_image_id` | v2 `mwb.account_resources.product_image.platform_resource_id` |
| `micro_app_instance_id` | v2 `mwb.account_resources.micro_app_instance.metadata` |
| `aweme_id` | v2 `mwb.account_resources.avatar.metadata` |
| `mini_program_url` | v2 `mwb.account_resources.micro_app_instance.metadata` |
| `video_id / video_cover_id` | v2 `mwb.game_assets.metadata` 或 v2 资源映射 |

当前 `npm run std-project:create-once` 在无确认变量下验证结果：

| blocker | 说明 |
| --- | --- |
| `confirm_variable_missing_or_invalid` | 符合预期；未带确认变量不得写平台 |
| `network_write_not_enabled_by_caller` | 符合预期；脚本未启用网络写入 |

## 完成后验收

| 标准 | 状态 |
| --- | --- |
| 最多调用一次 `std_project/create` | waiting |
| 返回真实 `std_project_id` | waiting |
| `mwb.readback_records.object_id` 写入真实 ID | waiting |
| `readback_status=readback_verified` | waiting |
| 7 节点最终状态均通过 | waiting |
| `project.state.json` 关闭 active_task | waiting |
| 无敏感泄漏 | active guardrail |

## 下一步

v2 运行字段已补齐。下一步如用户确认执行真实创建，使用：

```bash
MWBV2_OE_STD_PROJECT_CREATE_CONFIRM=CREATE_ONE_STD_PROJECT npm run std-project:create-once
```

执行后必须检查 readback 结果，并关闭本任务进入创建结果复盘。
