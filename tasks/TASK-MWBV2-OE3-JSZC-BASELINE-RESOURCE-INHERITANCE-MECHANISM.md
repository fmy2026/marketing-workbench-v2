# TASK-MWBV2-OE3-JSZC-BASELINE-RESOURCE-INHERITANCE-MECHANISM

状态：completed

更新时间：2026-08-27 CST

## 目标

建立 JSZC + `oceanengine_3_byte_mini_game` 的游戏级保底资源蓝图，使新账户自动获得保底候选与独立的账户级只读状态；不得复制旧账户 `passed` 结论。

## 范围

| 项 | 规则 |
| --- | --- |
| 蓝图 | 视频、产品图、头像候选、备用页、DMP、事件、品牌、小游戏实例均有游戏/路线级定义 |
| 账户实例 | 按目标账户幂等生成 `account_resources`，记录 `blueprint_id`、继承状态和来源 |
| 旧配置 | 删除 `material_source_account.target_advertiser_id` 的旧账户语义 |
| Node 3 / 4 | Node 3 解析蓝图，Node 4 在只读前物化候选；不复制旧账户 readback |
| 平台写入 | 禁止；仅为既有视频 executor 生成后续可确认的计划能力 |

## 非目标

- 不调用 OceanEngine API，不刷新 token，不绑定或共享素材。
- 不创建 monitor、广告项目、Promotion、DMP、事件资产或品牌授权。
- 不运行账户 `1871922346964041` 的真实只读应用；该步骤属于后续独立 Task 2。

## 验收

- `mwb.game_route_resource_blueprints` 成为 JSZC 保底资源唯一结构化来源。
- 新账户可从蓝图幂等生成候选资源，旧账户真实状态不被覆盖。
- Node 3 / Node 4 合同、workflow registry、执行计划和 payload 均保留现有安全边界。
- 对 DMP/产品图不自动选择；备用页不自动认定为目标账户可见。
- 所有测试、migration 检查和敏感字段检查通过。

## 下一步

已关闭本任务；随后已新建账户 `1871922346964041` 的真实只读应用任务。

## 完成记录

| 项 | 结果 |
| --- | --- |
| 结构化来源 | 新增 `mwb.game_route_resource_blueprints`，JSZC 有 `9` 条蓝图，覆盖 `8` 类资源 |
| 旧账户保护 | `1871922175825993` 的既有账户级 readback/状态未被覆盖 |
| 旧语义修正 | `material_source_account.target_advertiser_id` 已移除；物料来源账户保留为 `1760246749825031` |
| Node 3 | 增加 `launch-pack-resolve-resource-blueprints` |
| Node 4 | 先物化候选，再运行受限的头像、事件、品牌、产品图库存只读核验 |
| DMP | 列表结果仅记录候选计数/hash，未选择前不会进入 payload |
| 产品图 | 仅盘点，固定 `needs_confirmation`，不自动选择 ID |
| 视频 | 保留来源/目标账户逐条只读与唯一的 `ensure_resource:video_asset` 后续计划能力 |
| 本任务目标账户写入 | `1871922346964041` 的 `account_resources` 保持 `0` 行，未提前应用 |

## 验证

`test:baseline-resource-inheritance`、`smoke:workflow-skills`、`smoke:readonly`、`test:payload-contract`、`test:execution-plan`、`test:readonly-readiness-cli`、`check:runtime-consistency` 与 `git diff --check` 均通过；测试未调用 OceanEngine、未执行平台写入或 token refresh。
