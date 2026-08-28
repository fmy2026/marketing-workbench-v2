# TASK-MWBV2-OE3-NODE5-DRAFT-PREFLIGHT-1871922346964041

状态：completed_node5_preflight_blocked_by_instance_transport

更新时间：2026-08-28 CST

## 目标

为 case `CASE-LEGACY-2E4217E20C9E26BFB648772C` / 目标账户 `1871922346964041` 创建一次 fresh `runtime_truth` 只读 readiness job，运行 OE3 Node 1-5，生成标准项目草稿、payload hash 与创建前诊断，并收敛真实创建 blocker。

本任务不是创建任务。

## 范围

| 项 | 值 |
| --- | --- |
| route | `oceanengine_3_byte_mini_game` |
| game | `JSZC` |
| target advertiser | `1871922346964041` |
| case | `CASE-LEGACY-2E4217E20C9E26BFB648772C` |
| source record | `TASK-MWBV2-OE3-NODE5-DRAFT-PREFLIGHT-1871922346964041` |
| expected monitor | `245828` |

## 边界

| 类型 | 规则 |
| --- | --- |
| 允许 | 写入本任务 task/manifest/project.state；写入 v2 Postgres runtime job、node、skill、draft、execution plan、脱敏 evidence；执行乾坤和巨量只读回查 |
| 禁止 | `std_project/create`、创建确认、素材/DMP/事件/监测/品牌写入、token refresh、预算或出价修改 |
| 敏感信息 | 禁止保存或输出 token、Cookie、auth_code、完整 URL、raw payload、raw request、raw response |

## 官方依据

| 依据 | 本机来源 |
| --- | --- |
| `std_project/create` 创建接口 | `open.oceanengine.com-3.0-waibugei/巨量营销智擎版/创建标准项目.md` |
| `instance_id` 字段名、类型与小游戏/小程序适用性 | `open.oceanengine.com-3.0-waibugei/巨量营销智擎版/创建标准项目.md:199` |
| `optimized_goal/get` 支持 `micro_app_instance_id` 只读 eligibility | `open.oceanengine.com-3.0-waibugei/调控任务/标准项目下获取可用优化目标.md:27` |
| 2.0 创建资料 | 仅作旧接口差异核对，不作为 3.0 标准项目字段真值 |

## 验收

- [x] fresh runtime job 和 Node 5 草稿已生成。
- [x] latest job 已为 Node 5 `draft_ready`，不再停在资源专项 job。
- [x] 最终 payload manifest 唯一底层 blocker 为 `instance_id_long_id_transport_not_verified`。
- [x] `launch_confirmations=0`、`platform_actions=0`、`created_objects=0`。
- [x] 19 位 `instance_id` 不经 `Number()` 发送，且未验证时不进入 payload。
- [x] 验证命令通过，输出与证据保持脱敏。

## 执行结果

| 项 | 结果 |
| --- | --- |
| fresh job | `JOB-MWBV2-20260828085253-380771` |
| draft | `DRAFT-JOB-MWBV2-20260828085253-380771` |
| project name | `245828_N_JSZC_HUNT_PAY7DROI_平台定向不限_P07_20260828` |
| payload hash | `sha256:687017cb90451e8b9aa408462cd95806be664f4c33cc7a18484c29b72f3ef636` |
| Node 4 | `passed` |
| Node 5 | `repairable` |
| duplicate check | `platform_not_duplicate` |
| final manifest blocker | `instance_id_long_id_transport_not_verified` |
| create readiness wrappers | `final_payload_blockers`、`payload_contract_not_passed` |
| platform write | `0` |
| token refresh | `0` |

## 本轮机制修正

- `product_image` ready 判定允许采用 `product_image_target_upload_readback.status=passed` 的目标户上传回查证据，避免被旧 `readonly_check=needs_confirmation` 摘要误挡。
- `backup_landing_page` source-prepare 在目标户已 `visible + readback_verified + readonly passed + hash match` 时，不再保留共享传输合同 blocker；它仍不声明官方自动共享接口已验证。
- `MICRO_GAME + BYTE_GAME` 不再把 `mini_program_info.url` 作为当前路线的独立 blocker；创建侧缺口归并到 `instance_id_long_id_transport_not_verified`。

## 验证命令

| 命令 | 结果 |
| --- | --- |
| `npm run workflow:readonly-readiness -- --route-id=oceanengine_3_byte_mini_game --game-code=JSZC --advertiser-id=1871922346964041 --case-id=CASE-LEGACY-2E4217E20C9E26BFB648772C --source-record-ref=TASK-MWBV2-OE3-NODE5-DRAFT-PREFLIGHT-1871922346964041` | completed |
| `npm run test:node4-resource-prep-contracts` | passed |
| `npm run test:resource-action-registry` | passed |
| `npm run test:execution-plan` | passed |
| `npm run test:readonly-readiness-cli` | passed |
| `npm run test:payload-contract` | passed |
| `npm run smoke:workflow-skills` | passed |
| `npm run check:runtime-consistency -- --job-id JOB-MWBV2-20260828085253-380771` | passed |
| `git diff --check` | passed |
