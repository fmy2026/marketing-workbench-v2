# TASK-MWBV2-OE3-NODE4-BRAND-INDUSTRY-READONLY-PARAMETER-ALIGNMENT-1871922346964041

状态：completed

更新时间：2026-08-27 CST

## 目标

修复 Node 4 `baseline_brand_industry` 只读探针的请求参数，使其与官方 `dpa/brand/adv_auth/industry/get` 合同一致：顶层传 `account_id` 与 `origin_req`，`origin_req` 内传 `brand_data_source=YUNTU` 和 `outer_brand_id`。

本任务完成后，对账户 `1871922346964041`、既有 monitor `245828` 创建一条新的 `runtime_truth` 只读复核 job。任务不创建 monitor、不创建广告、不修改平台资源、不刷新 token。

## 背景

上一轮全链路只读 job `JOB-MWBV2-20260827094922-284E26` 中，Node 1、Node 2、Node 3 已通过，Node 4 已真实执行但因 `readonly_probe_not_passed:baseline_brand_industry` 阻断。代码核对发现：普通只读链路已使用 `origin_req`，但 Node 4 保底资源链路仍向行业接口发送顶层 `brand_name_id`，与本机官方资料不一致。

## 范围与边界

| 允许 | 禁止 |
| --- | --- |
| 修改 Node 4 只读探针参数、脱敏字段摘要和 smoke | `monitorSerialNumberAdd`、`std_project/create`、素材/DMP/品牌/事件写入 |
| 新增本任务卡、manifest 和状态记录 | token refresh、预算/出价修改、任何确认变量 |
| 创建新的 `runtime_truth` 只读复核 job | 写入 token、Cookie、raw query、raw request、raw response、完整触点 URL、完整落地页 URL |

## 固定输入

| 项 | 值 |
| --- | --- |
| route_id | `oceanengine_3_byte_mini_game` |
| game_code | `JSZC` |
| advertiser_id | `1871922346964041` |
| expected monitor_id | `245828` |
| 官方资料 | `/Users/hys/knowledge/01-个人本地知识库/01-官方文档/open.oceanengine.com-3.0/05-商品管理.md` |

## 实施计划

1. 抽出品牌行业请求构造器，普通只读链路与 Node 4 保底资源链路共用。
2. Node 4 `baseline_brand_industry` 使用 `account_id + origin_req`，不再发送顶层 `brand_name_id`。
3. 只读 evidence 仅记录字段名清单：`account_id`、`origin_req`、`origin_req.brand_data_source`、`origin_req.outer_brand_id`。
4. 扩展 smoke，断言两条行业调用路径均使用官方参数形状。
5. 运行回归校验和 fresh runtime truth 只读复核。

## 验收

- `baseline_brand_industry` 实际使用官方 `origin_req` 参数结构。
- `brand_industry` 与 `baseline_brand_industry` 两条路径不再发送顶层 `brand_name_id`。
- 品牌行业 probe 返回 `api_code=0` 且命中“巨兽战场 / 游戏 / SLG”时，`brand_info` 写为目标账户 fresh readback 已通过。
- 新 job 保留 7 节点记录，Node 6 为 `locked`，Node 7 为 `waiting`。
- `launch_confirmations=0`、`platform_actions=0`、`created_objects=0`。

## 执行记录

| 步骤 | 状态 | 结果 |
| --- | --- | --- |
| 建立任务卡、manifest、状态 | passed | 平台写权限保持关闭 |
| 修复品牌行业参数 | passed | `brand_industry` 与 `baseline_brand_industry` 共用 `account_id + origin_req` 构造器；不再发送顶层 `brand_name_id` |
| 扩展 smoke 与校验 | passed | fake readonly client 捕获 query，断言 `origin_req.brand_data_source`、`origin_req.outer_brand_id` 和 forbidden manifest |
| fresh runtime truth 只读复核 | passed_with_blocker | 新建 `JOB-MWBV2-20260827101635-A8B517`；`brandIndustryStatus=passed`，Node 4 baseline 只读 probe 整体 `passed` |
| DB 零写入审计 | passed | `launch_confirmations=0`、`platform_actions=0`、`created_objects=0` |
| 关闭任务 | passed | `active_task=null`，下一 gate 转向最新唯一优先资源阻断 |

## 结果

结论：本任务机制修复完成；不得直接创建广告。

| 项 | 结果 |
| --- | --- |
| 最终 runtime job | `JOB-MWBV2-20260827101635-A8B517` |
| Node 1/2/3 | `passed` |
| Node 4 | 节点仍 `blocked`，但 `resource-live-readonly-reconcile=passed`，品牌行业已通过 |
| 品牌资源 | `brand_info visible + readback_verified + readonly passed` |
| Node 5 | `repairable`，创建就绪仍 blocked |
| Node 6/7 | `locked` / `waiting` |
| 当前唯一优先 blocker | `avatar_not_ready` |

Node 4 evidence：`EV-JOB-MWBV2-20260827101635-A8B517-NODE4-BASELINE-READONLY` 已记录字段合同摘要：

`baseline_brand_industry_fields=account_id,origin_req; origin_req_fields=brand_data_source,outer_brand_id; forbidden_top_level=brand_name_id; response_body_stored=false`

仍待处理资源：头像、DMP、两条视频、产品图、小程序实例、备用落地页。品牌行业已不再是阻断项。

## 验证

- `node --check src/platforms/oceanengineReadonlyAdapter.mjs`
- `node --check src/platforms/oceanengineReadonlyClient.mjs`
- `node --check src/workflows/skills/oe3/04-platform-readonly-reconcile.mjs`
- `node --check scripts/03-baseline-resource-inheritance-smoke.mjs`
- `npm run test:baseline-resource-inheritance`
- `npm run smoke:workflow-skills`
- `npm run test:readonly-readiness-cli`
- `npm run test:payload-contract`
- `npm run check:runtime-consistency`
- `npm run check:runtime-consistency -- --job-id JOB-MWBV2-20260827101635-A8B517`
- `git diff --check`

## 下一 Gate

新建“账户 `1871922346964041` 头像只读状态诊断与补齐方案”任务：先只读定位 `avatar_not_ready` 的真实原因；如需上传或绑定头像，另建单次资源准备任务并带确认变量。头像通过后重跑 fresh runtime truth，再按下一唯一 blocker 继续推进。
