# TASK-MWBV2-OE3-PRECREATE-GAPZERO-MANUAL-BRAND-CONFIRMATION

状态：completed

更新时间：2026-08-24 CST

## 目标

接受用户对 `brand_info` 的人工确认，让 v2 创建前 gate 从资源准备进入 `gapCount=0`，并进入“单次真实创建确认前检查”。本任务仍不执行 `std_project/create`，不刷新 token，不做任何平台写入。

## 独立项目边界

| 类型 | 规则 |
| --- | --- |
| v2 数据库 | 只使用 `marketing_workbench_v2.mwb` |
| v2 前端/API/脚本 | 只使用本项目 `frontend/`、`src/`、`scripts/` |
| 旧项目 | 只提炼字段规则和成功链路经验，不作为运行依赖 |
| 禁止 | import/shell 调用旧项目脚本、读取旧库作为 v2 运行真值 |

## 背景

| 项 | 状态 |
| --- | --- |
| 产品图 | 已上传并通过 `file/image/get` readback |
| `brand_info_official` | 已结构化写入 v2 Postgres |
| live brand fuzzy | passed，唯一命中 `巨兽战场` |
| live brand industry | `api_code=40000`，无法 live 证明行业 |
| 用户确认 | 接受同账户历史 fresh 品牌/行业证据 + 当前 live fuzzy passed + v2 官方字段入库 |

## 目标字段

| 字段 | 值 |
| --- | --- |
| `cdp_brand_id` | `4016408` |
| `brand_name_id` | `11467384` |
| `cdp_brand_name` | `巨兽战场` |
| `yuntu_category_id` | `2202` |
| `matched_industry_path` | `游戏 / SLG` |
| `readback_status` | `fresh_target_brand_industry_readback_passed` |

## 实现范围

| 文件 | 动作 |
| --- | --- |
| `src/platforms/oceanengineReadonlyAdapter.mjs` | 人工确认后 `brand_info` 不再进入 blocked |
| `src/platforms/oceanengineStdProjectPayloadContract.mjs` | 增加 `brand_info` 必填与禁止字段检查 |
| `src/workflows/launchWorkflow.mjs` | `payload_summary.brand_info` 纳入草稿摘要 |
| `src/repositories/postgresRepository.mjs` | 复用 v2 metadata 写入能力 |
| `scripts/account-resource-readback.mjs` | 验证输出保持脱敏 |
| `project.state.json` | 当前任务和下一 gate |

## 验收

| 标准 | 结果 |
| --- | --- |
| `brand_info` 不再 blocked | passed |
| `blockedResourceTypes=[]` | passed |
| `gapCount=0` | passed |
| `payload_summary.brand_info` 存在 | passed |
| payload contract 通过并禁止 `ecom_brand_id` | passed |
| 7 个节点更新到创建前完整准备 | passed |
| `std_project_create_executor` 仍 locked | passed |
| `createNodeStatus=ready_for_single_create_confirmation` | passed |
| 未执行 `std_project/create` | passed |
| 无 token/secret/Cookie/auth_code/raw response 泄漏 | passed |

## 完成结果

| 项 | 结果 |
| --- | --- |
| `brand_info` 最终状态 | `passed_by_manual_confirmation` |
| `brand_info_official.used_for_create_gate` | `true` |
| `blockedResourceTypes` | `[]` |
| `gapCount` | `0` |
| `prewriteGateStatus` | `locked` |
| `createNodeStatus` | `ready_for_single_create_confirmation` |
| `std_project/create` | 未执行 |

## `payload_summary.brand_info`

| 字段 | 值 |
| --- | --- |
| `brand_name_id` | `11467384` |
| `cdp_brand_id` | `4016408` |
| `cdp_brand_name` | `巨兽战场` |
| `yuntu_category_id` | `2202` |
| `matched_industry_path` | `游戏 / SLG` |
| `readback_status` | `fresh_target_brand_industry_readback_passed` |
| `confirmation_status` | `accepted_manual_confirmation` |

## 验证结果

| 命令 | 结果 |
| --- | --- |
| `npm run token:status` | passed |
| `npm run resource:diagnose` | passed；`status=ready`，`blockedResourceTypes=[]` |
| `npm run resource:readback` | passed；`status=ready` |
| `npm run smoke:readonly` | passed；`prewriteGateStatus=locked` |
| `npm run smoke:api` | passed |
| `npm run test:payload-contract` | passed；`gapCount=0` |

## 7 节点状态

| 节点 | 状态 |
| --- | --- |
| `launch_intake` | passed |
| `creation_context` | passed |
| `game_launch_pack` | passed |
| `account_resource_prepare` | passed |
| `std_project_draft_builder` | needs_confirmation |
| `std_project_create_executor` | locked，`createNodeStatus=ready_for_single_create_confirmation` |
| `readback_closer` | waiting |

## 下一步

进入“单次真实创建确认任务”。该任务必须单独新建，继续保持单次、带确认变量、写后立即 readback；本任务没有执行真实创建。

## 验证命令

```bash
npm run token:status
npm run resource:diagnose
npm run resource:readback
npm run smoke:readonly
npm run smoke:api
npm run test:payload-contract
```

## 完成后输出

1. `brand_info` 最终确认状态。
2. `payload_summary.brand_info` 内容。
3. 最新 blocked resources。
4. 最新 `gapCount`。
5. 最新 7 节点状态。
6. 是否可以进入“单次真实创建确认任务”。
