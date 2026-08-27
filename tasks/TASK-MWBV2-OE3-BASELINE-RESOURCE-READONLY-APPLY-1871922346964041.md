# TASK-MWBV2-OE3-BASELINE-RESOURCE-READONLY-APPLY-1871922346964041

状态：completed

更新时间：2026-08-27 CST

## 目标

对账户 `1871922346964041` 创建一个新的 `runtime_truth` job：先装配 JSZC 保底资源候选，再执行真实只读核验。只记录目标账户事实，不创建、绑定、上传、共享或选择任何平台资产。

## 固定输入

| 项 | 值 |
| --- | --- |
| route_id | `oceanengine_3_byte_mini_game` |
| game_code | `JSZC` |
| advertiser_id | `1871922346964041` |
| expected monitor_id | `245828` |
| source_usage | `runtime_truth` |
| 执行入口 | `npm run resource:bootstrap-readonly -- --route-id oceanengine_3_byte_mini_game --game-code JSZC --advertiser-id 1871922346964041` |

## 权限边界

| 允许 | 禁止 |
| --- | --- |
| PostgreSQL 的 job、节点、Skill、候选资源、脱敏 evidence、执行计划写入 | `monitorSerialNumberAdd`、`std_project/create`、素材上传/绑定/共享、DMP/事件/品牌写入、预算/出价修改 |
| 乾坤 `accountIndex` 与 `/tf/ad/index` 真实只读 | token refresh、`--execute`、`--mock`、任何确认变量 |
| 巨量 GET 只读：头像、事件、品牌/行业、产品图库存、视频、DMP、优化目标/深度出价、项目查重 | 写入 token、Cookie、raw request/response、完整触点或落地页 URL |

## 预期行为

1. 新建 job，禁止 `--job-id` 恢复，避免重跑混淆本次真实事实。
2. 乾坤只读预检精确命中已有 monitor `245828`；不因历史 monitor 创建 attempt 耗尽而触发写入分支。
3. Node 3 读取 `9` 条蓝图；Node 4 幂等建立目标账户 `account_resources` 候选行。
4. 视频仅核验来源与目标可见性，并在目标不可见时生成后续单次绑定/共享计划；不在本任务执行。
5. DMP 与产品图只盘点。DMP 不产生 `audience.retargeting_tags_exclude` 选择；产品图不产生最终 image ID 选择。
6. 备用页维持 `needs_confirmation`，除非存在可审计的目标账户可见性证据；不沿用旧账户结论。

## 验收

- 新 job 为 `runtime_truth`，有 7 条节点记录，Node 6 为 `locked`，Node 7 不创建平台对象。
- `launch_confirmations=0`、`platform_actions=0`、`created_objects=0`。
- 目标账户获得蓝图候选行；每一行只有目标账户真实只读结果或未核验状态。
- 输出每个资源的 `ready`、`prepare_planned`、`needs_confirmation` 或 `blocked_with_evidence` 之一。
- 若发现机制问题，只写入本任务的“机制观察”，不在本任务扩展修复。

## 机制观察

| 观察 | 事实证据 | 影响 | 后续建议 |
| --- | --- | --- | --- |
| Node 3/4 备用页检查顺序 | Node 3 在候选物化前运行，记录了 `backup_landing_page_resource_missing`；同一 job 的 Node 4 随后已建立 `BRP-JSZC-OE3-BACKUP-LANDING` 候选 | 结论仍正确地保持“目标账户可见性未知”，但“资源缺失”原因已过期，增加诊断噪声 | 独立机制任务：将 Node 3 限定为静态默认页解析，把账户候选/目标可见性统一收口到 Node 4，或在 bootstrap 后重算该 Skill |
| CLI 的执行状态文案 | `resource-live-readonly-reconcile` 实际执行 `5` 个探针并留存证据，但因 Skill 状态为 `blocked`，CLI 把它描述成“未运行” | 覆盖率字段已正确显示 adapter 已接入；`mechanismObservations` 文案不准确 | 独立小修复：用 Skill 是否存在/是否产生 evidence 判定“已运行”，把 `blocked` 单列为运行结果 |

## 执行结果

| 项 | 结果 |
| --- | --- |
| runtime job | `JOB-MWBV2-20260827091313-EF85A9` |
| 乾坤预检 | `accountIndex`、`/tf/ad/index` 均调用；精确命中 monitor `245828`，受控触点存在 |
| Node 4 探针 | `5` 个；头像、事件、品牌 fuzzy、产品图库存 API 通过；品牌行业 API 返回 `HTTP 200 / API code 40000` |
| 蓝图候选 | 新建 `9` 条目标账户候选，覆盖 `8` 类资源 |
| 已真实 ready | 事件资产：`target_readonly_verified` |
| 待人工选择 | 产品图：只记录库存，`needs_confirmation`；未选择 image ID |
| 待资源补齐/计划 | 两条保底视频在来源账户可读、目标账户不可见；生成唯一后续 `ensure_resource:video_asset` 计划，未执行 |
| 待账户事实/确认 | 头像、DMP、品牌、小游戏实例、备用页均未被旧账户结论覆盖 |
| 结论 | `blocked_with_evidence`，不得创建广告 |

## 审计与证据

| 项 | 数量 |
| --- | --- |
| launch_node_runs | `7` |
| launch_skill_runs | `25` |
| evidence_artifacts | `8` |
| launch_confirmations | `0` |
| platform_actions | `0` |
| created_objects | `0` |

无 token refresh、无 monitor 创建、无广告创建、无素材绑定/上传/共享、无 DMP 或产品图自动选择。所有证据仅保存摘要与 hash。

## 下一 Gate

保持 `platform_write_allowed=false`。优先新建“Node 3/4 保底备用页顺序收口”机制任务；其后按证据分别决定视频单次绑定/共享、品牌行业只读参数诊断、备用页目标账户可见性确认等独立任务。不得直接进入 `std_project/create`。
