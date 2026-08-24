# TASK-MWBV2-OE3-BRAND-INFO-FINALIZE

状态：blocked_waiting_manual_brand_industry_confirmation

更新时间：2026-08-24 CST

## 目标

完成 `brand_info` 收口，让创建 `std_project` 前的 7 节点 gate 走到 ready。本任务只做只读校验和 v2 Postgres 结构化记录，不执行 `std_project/create`，不做任何平台写入。

## 背景

| 项 | 状态 |
| --- | --- |
| 产品图 | 已上传并通过 `file/image/get` readback |
| 当前唯一资源 blocker | `brand_info` |
| 品牌 fuzzy | 已命中 `巨兽战场` |
| 行业只读 | 当前 v2 返回 `api_code=40000` |
| 创建执行 | `std_project_create_executor` 必须保持 `locked` |

## 目标对象

| 字段 | 值 |
| --- | --- |
| `route_id` | `oceanengine_3_byte_mini_game` |
| `game_code` | `JSZC` |
| `advertiser_id` | `1871922175825993` |

## 目标字段

写入 `mwb.account_resources.metadata.brand_info_official`：

| 字段 | 值 |
| --- | --- |
| `cdp_brand_id` | `4016408` |
| `brand_name_id` | `11467384` |
| `cdp_brand_name` | `巨兽战场` |
| `yuntu_category_id` | `2202` |
| `matched_industry_path` | `游戏 / SLG` |
| `readback_status` | `fresh_target_brand_industry_readback_passed` |

## 范围

| 类型 | 内容 |
| --- | --- |
| 允许 | 当前账户品牌/行业只读校验、v2 Postgres 状态更新、Workflow/gate 重跑 |
| 禁止 | `std_project/create`、素材上传、事件资产创建、DMP push、预算/出价修改、凭据刷新 |
| 旧项目 | 只参考字段规则和旧证据，不作为 v2 运行依赖 |

## 实现要求

1. 检查并修正 v2 `brand_industry` 请求参数或解析逻辑。
2. 优先使用当前 live target-account readback。
3. 如果 live 行业接口仍返回 40000，只能输出人工确认方案，不能静默放行。
4. 结构化写入 `brand_info_official` 和 `readonly_check`。
5. 重跑完整 7 节点 gate。

## 验收

| 标准 | 结果 |
| --- | --- |
| `brand_info` 不再 blocked，或明确需要人工确认 | pending |
| v2 Postgres 有 `metadata.brand_info_official` | passed |
| `product_image` 仍为 `readback_verified` | passed |
| `blockedResourceTypes` 为空，或只剩人工确认项 | passed；仅剩 `brand_info` |
| 7 个 Workflow 节点状态更新 | passed |
| `std_project_create_executor` 仍 locked | passed |
| `gapCount=0` 后进入单次真实创建确认前检查 | blocked；当前 `gapCount=1` |
| 未执行 `std_project/create` | passed |
| 无 token/secret/Cookie/auth_code/raw response 泄漏 | passed |

## 执行结果

| 项 | 结果 |
| --- | --- |
| v2 行业查询参数 | 已修正为官方 `brand_name_id=11467384` 作为 `origin_req.outer_brand_id` |
| live brand fuzzy | passed；唯一目标品牌链路可读 |
| live brand industry | blocked；HTTP 200 但 `api_code=40000`，未返回可验证行业数据 |
| 40000 判断 | 不是 v2 旧的 std_project/list 端点问题；也不是产品图问题。当前判断为行业只读接口对该账号/参数返回业务失败，不能用 live readback 证明行业。 |
| Postgres 官方字段 | 已写入 `mwb.account_resources.metadata.brand_info_official` |
| 是否用于放行 | 否；`brand_info_official.used_for_create_gate=false` |
| 当前 blocked resources | `brand_info` |
| 当前 prewrite gate | `blocked`，`gapCount=1` |

## `brand_info_official`

| 字段 | 值 |
| --- | --- |
| `cdp_brand_id` | `4016408` |
| `brand_name_id` | `11467384` |
| `cdp_brand_name` | `巨兽战场` |
| `yuntu_category_id` | `2202` |
| `matched_industry_path` | `游戏 / SLG` |
| `readback_status` | `fresh_target_brand_industry_readback_passed` |
| `confirmation_status` | `manual_confirmation_required_after_live_industry_40000` |
| `used_for_create_gate` | `false` |

## 验证结果

| 命令 | 结果 |
| --- | --- |
| `npm run token:status` | passed；credential `valid` |
| `npm run resource:diagnose` | passed；仍 blocked on `brand_info` |
| `npm run resource:readback` | passed；产品图保持 ready，`brand_info` 仍需人工确认 |
| `npm run smoke:readonly` | passed；`blockedResourceTypes=[brand_info]` |
| `npm run smoke:api` | passed；`prewriteGateStatus=blocked` |
| `npm run test:payload-contract` | passed；`gapCount=1` |

## 7 节点状态

| 节点 | 状态 |
| --- | --- |
| `launch_intake` | passed |
| `creation_context` | passed |
| `game_launch_pack` | passed |
| `account_resource_prepare` | passed，本地最小真值通过；平台只读仍有 `brand_info` gap |
| `std_project_draft_builder` | needs_confirmation |
| `std_project_create_executor` | locked |
| `readback_closer` | waiting |

## 下一步

需要用户明确确认是否接受“沿用同账户历史 fresh 品牌/行业证据 + 当前 live fuzzy passed + 官方字段已结构化”的方案。确认前，`brand_info` 不放行，`std_project/create` 继续禁止。

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

1. `brand_info` 最终字段。
2. `brand_industry` 返回 40000 的原因判断。
3. 是否使用当前 live readback，还是需要人工确认旧证据。
4. 最新 blocked resources。
5. 最新 7 节点状态。
6. 是否可以进入“单次真实创建确认前检查”。
