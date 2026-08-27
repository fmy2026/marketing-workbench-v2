# TASK-MWBV2-OE3-FULL-CHAIN-READONLY-READINESS-RERUN-1871922346964041

状态：completed

更新时间：2026-08-27 CST

## 目标

在 Node 3/4 顺序收口后，对账户 `1871922346964041` 创建一条新的 `runtime_truth` job，真实只读运行 Node 1-5，验证既有 monitor `245828`、JSZC 保底候选和目标账户资源事实；Node 6 保持 locked，Node 7 不创建对象。

## 固定输入

| 项 | 值 |
| --- | --- |
| route_id | `oceanengine_3_byte_mini_game` |
| game_code | `JSZC` |
| advertiser_id | `1871922346964041` |
| expected monitor_id | `245828` |
| 入口 | `npm run workflow:readonly-readiness -- --route-id oceanengine_3_byte_mini_game --game-code JSZC --advertiser-id 1871922346964041 --expected-monitor-id 245828` |

## 权限边界

| 允许 | 禁止 |
| --- | --- |
| 乾坤 `accountIndex`、`/tf/ad/index` 与巨量 GET 真实只读 | `monitorSerialNumberAdd`、`std_project/create`、素材/DMP/品牌/事件写入 |
| PostgreSQL runtime truth、候选资源只读状态、草稿、脱敏 evidence 写入 | token refresh、预算/出价修改、任何确认变量 |
| Node 1-5 只读核验 | Node 6 create 与 Node 7 创建后 readback |

## 验收

- 新 job 的 `source_usage=runtime_truth`，有 `7` 条节点记录。
- 乾坤精确命中 monitor `245828`，不触发创建分支。
- Node 3 备用页输出只包含静态默认值；Node 4 输出目标账户候选和真实只读结论。
- `launch_confirmations=0`、`platform_actions=0`、`created_objects=0`。
- 输出 `ready_for_single_create_task`、`blocked_with_evidence` 或 `mechanism_coverage_incomplete`；仅按证据决定下一任务。

## 执行记录

| 步骤 | 状态 | 结果 |
| --- | --- | --- |
| 建立任务卡、manifest、状态 | passed | 真实只读复核与机制修复分开记录 |
| 执行全链路只读 | passed | 新建 `JOB-MWBV2-20260827094922-284E26`，Node 1-5 已运行 |
| 乾坤 monitor 回查 | passed | `accountIndex`、`/tf/ad/index` 均调用；精确命中 `245828`，未触发创建 |
| Node 3/4 顺序验收 | passed | Node 3 默认页 Skill 通过且无资源缺失；Node 4 默认页仅因目标账户可见性/readback/只读状态受阻 |
| Node 4 reconcile 覆盖 | passed_with_blocker | Skill 已执行、有 evidence；唯一直接 probe blocker 为 `readonly_probe_not_passed:baseline_brand_industry` |
| DB 与零写入审计回查 | passed | `7` node runs、`25` Skill runs、`8` evidence；confirmation/action/object 均为 `0` |
| 关闭任务 | passed | `active_task=null`，平台写权限继续关闭 |

## 结果

结论：`blocked_with_evidence`，不得创建广告。

| 范围 | 当前事实 |
| --- | --- |
| 已通过 | Node 1、Node 2、Node 3；事件资产已为目标账户 `visible + readback_verified` |
| Node 4 主阻断 | 品牌行业只读探针实际执行但未通过；本轮未把它误报为未运行 |
| 目标账户候选待核验 | 头像、DMP、产品图、品牌、小游戏实例、备用页；两条视频仍不在目标账户可用状态 |
| Node 5 | 草稿已生成，但创建就绪为 `blocked_brand_industry` |
| Node 6/7 | `locked` / `waiting`，无 create、无 readback 对象 |

## 验证

`check:runtime-consistency -- --job-id JOB-MWBV2-20260827094922-284E26` 通过。审计回查确认：`launch_confirmations=0`、`platform_actions=0`、`created_objects=0`。

## 下一 Gate

新建“Node 4 品牌行业只读参数诊断”任务：仅核对官方接口合同、现有 GET 请求参数与脱敏响应分类，定位 `baseline_brand_industry` 受阻原因。不得修改品牌授权、创建广告或复用旧账户通过结论；诊断完成后再新建 fresh runtime truth job 复核。
