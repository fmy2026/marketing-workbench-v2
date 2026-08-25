# TASK-MWBV2-OE3-P04-FINAL-MATERIAL-AND-CONTRACT-READINESS

状态：completed_blocked

更新时间：2026-08-25 CST

## 需求来源

用户提供 `/Users/hys/Desktop/需求表述.md`。该文件内容作为本轮需求输入；执行边界以用户本轮消息、`AGENTS.md`、`project.state.json`、v2 代码、v2 Postgres 和本机 OE3 官方文档为准。

## 结构化理解

本任务是在 P04 真实 `std_project/create` 前补齐最后一层 readiness：逐条确认两条最终视频及封面、收口字节小游戏实例与优化目标字段合同、把 P04 业务默认值从 `payload.mjs` 收回到 Postgres 路线配置或素材包。

本任务只做只读校验、配置收口和脱敏证据记录，不执行真实创建，不消费 P04 已预置 execution grant。

## 固定对象

| 项 | 值 |
| --- | --- |
| P04 job_id | `JOB-MWBV2-20260824151431-ECA120` |
| P04 draft_id | `DRAFT-JOB-MWBV2-20260824151431-ECA120` |
| route_id | `oceanengine_3_byte_mini_game` |
| game_code | `JSZC` |
| advertiser_id | `1871922175825993` |
| 创建对象 | `std_project` |
| 巨兽战场物料户/超管 | `1760246749825031` |

## 补充规则

视频素材按游戏维度存在固定物料户或超管；视频和封面应先上传到物料户或超管，再推送或共享到目标账户。P04 的目标账户仍是 `1871922175825993`，素材来源账号记录在 `mwb.game_route_defaults.raw_defaults.material_source_account`，不放入 env。

## 权限

| 项 | 状态 |
| --- | --- |
| 读取 v2 Postgres | 允许 |
| 写入脱敏 readiness/evidence/node summary | 允许 |
| 新增最小 migration | 仅当现有表无法表达多视频资源或路线 payload 默认值时允许 |
| 真实只读 probe | 仅限视频/封面、优化目标与必要账户资源校验 |
| `std_project/create` | 禁止 |
| 消费或修改 P04 execution grant | 禁止 |
| token refresh | 禁止 |
| 旧项目运行依赖 | 禁止，仅人工参考 |

## 目标

1. 从 P04 实际素材包解析两条 required `video_asset`，每条视频和封面独立完成账户侧只读回查。
2. `account_resources` 支持同账户多条 `video_asset` 用 `source_asset_id` 区分；P04 脱敏 manifest 记录 `finalMaterialReadiness`。
3. 节点 4 与 preflight 校验 `selected_required_video_count === verified_video_count`，且每条封面已验证。
4. 用官方文档和只读“获取可用优化目标”结果明确小游戏实例查询字段与创建字段，创建 transport 只保留一个实例字段。
5. 将 P04 业务默认值迁到 Postgres 路线配置或素材包；`payload.mjs` 只读取配置，缺配置时输出 blocker。
6. 保持 P04 `platform_actions`、`launch_confirmations`、`created_objects`、真实 `readback_records` 数量为 `0`。

## 非目标

| 项 | 状态 |
| --- | --- |
| 执行真实 `std_project/create` | 禁止 |
| 上传视频/封面/产品图 | 禁止 |
| 创建事件资产 | 禁止 |
| 推送或修改 DMP | 禁止 |
| 修改预算或出价 | 禁止 |
| 刷新 token | 禁止 |
| 保存 raw payload/raw response/token/Cookie/完整 URL/视频 ID/封面 ID | 禁止 |
| 依赖 `/Users/hys/Projects/marketing-workbench` 作为 runtime | 禁止 |

## 验收

| 标准 | 状态 |
| --- | --- |
| task 与 context manifest 已建立 | passed |
| P04 两条最终视频均有独立脱敏回查证据 | passed |
| 节点 4 支持视频素材 `2/2` readiness；任意缺口会阻断 | passed |
| 小游戏实例查询字段与创建字段唯一且已记录 | passed |
| 当前优化目标/深度目标/深度优化方式经只读确认 | passed |
| P04 业务默认值不再硬编码在 `payload.mjs` | passed |
| `schedule_time` 不作为强制缺失项 | passed |
| package 声明的相关 smoke/test 通过 | passed |
| P04 写入计数仍为 `0` | passed |
| 无敏感信息泄漏 | passed |

## 当前判断

需求方向合理：在消费 P04 单次真实创建授权前，先把素材粒度、字段合同和配置来源补齐，可以降低一次性创建失败风险。

关键约束：如果业务默认值迁移后生成的 payload hash 与当前 P04 scope 中的 hash 不一致，本任务不得静默更新或消费 scope；必须把下一 gate 改为“重新生成/确认 fresh runtime job 或重新授予单次 create scope”。

## 执行结果

| 项 | 结果 |
| --- | --- |
| P04 payload_hash | `sha256:cbdb497145254b17c8c87c1863ffea4f28c6d69ddfc246f329e56947b4896b5a`，未变化 |
| P04 写入计数 | `platform_actions=0`、`launch_confirmations=0`、`created_objects=0`、真实 `readback_records=0` |
| 节点状态 | 1-3 passed，4 blocked，5 repairable，6 locked，7 waiting |
| 优化目标/DBT | `optimized_goal` 与 `dbt` 只读证据均 passed |
| 小游戏实例字段 | 创建字段只使用 `instance_id`；优化目标只读查询使用 `micro_app_instance_id` 与 `mini_program_id` |
| 业务默认值来源 | `mwb.game_route_defaults.raw_defaults.payload_defaults` |
| 物料户来源 | `mwb.game_route_defaults.raw_defaults.material_source_account.advertiser_id=1760246749825031` |

## 最终阻断

P04 当前不可创建，唯一硬阻断是视频素材/封面账户侧 readiness 未通过：

| source_asset_id | 只读结果 |
| --- | --- |
| `JSZC-HUNT-4IG2-3` | 视频在物料户与目标账户均可读；封面在物料户不可读，目标账户也不可读 |
| `JSZC-HUNT-4GE6-14` | 视频在物料户可读但目标账户不可读；封面在物料户不可读，目标账户也不可读 |

因此工作台不得进入真实创建确认；P04 execution grant 未消费。

## 验证命令

| 命令 | 结果 |
| --- | --- |
| `npm run token:status` | passed，脱敏输出 |
| P04 readonly dry-run | passed by execution，返回 blocked readiness，不执行创建 |
| `npm run test:payload-contract` | passed |
| `npm run smoke:workflow-skills` | passed |
| `npm run smoke:api` | passed |
| `npm run check:runtime-consistency` | passed |
| Postgres 写入计数校验 | passed，四类写入计数均为 `0` |

## 下一步

进入“P04 视频素材/封面补齐任务”：确认两条视频及封面先在巨兽战场物料户/超管 `1760246749825031` 可读，再推送或共享到目标账户 `1871922175825993`。补齐后重跑 P04 final readiness；只有 gate 全部 passed 后，才可另开单次真实创建确认任务。
