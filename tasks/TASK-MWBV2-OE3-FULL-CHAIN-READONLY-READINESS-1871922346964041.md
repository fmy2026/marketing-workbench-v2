# TASK-MWBV2-OE3-FULL-CHAIN-READONLY-READINESS-1871922346964041

状态：completed

更新时间：2026-08-27 CST

## 需求来源

用户确认执行“账户 `1871922346964041` 全链路只读就绪核验”方案。

## 结构化理解

本任务新建一次正式 `runtime_truth` 只读核验 job。目标是在不创建广告、不刷新 token、不写平台的前提下，完整运行 OE3 workflow Node 1-5，并确认 Node 6 保持锁定、Node 7 仅保留 dry_run 的本地不适用记录。

本任务不是 `std_project/create` 创建任务，也不是 monitor 创建任务。

## 固定输入

| 项 | 值 |
| --- | --- |
| route_id | `oceanengine_3_byte_mini_game` |
| game_code | `JSZC` |
| advertiser_id | `1871922346964041` |
| object_type | `std_project` |
| source_usage | `runtime_truth` |
| 既有 monitor_id | `245828` |

## 权限边界

| 项 | 状态 |
| --- | --- |
| 写入 task/manifest/project.state | 允许 |
| 写入 Postgres runtime_truth job、node、skill、draft、readback、脱敏 evidence | 允许 |
| 乾坤真实只读 `accountIndex` | 允许 |
| 乾坤真实只读 `/tf/ad/index` | 允许 |
| 巨量真实只读 probe | 允许 |
| `monitorSerialNumberAdd` | 禁止 |
| `std_project/create` | 禁止 |
| token refresh | 禁止 |
| 预算、出价、DMP、事件、素材等平台写入 | 禁止 |

## 执行入口

```bash
npm run workflow:readonly-readiness -- --route-id oceanengine_3_byte_mini_game --game-code JSZC --advertiser-id 1871922346964041
```

入口要求：

- 首次运行创建新的 `source_usage=runtime_truth` job。
- 支持 `--job-id` 恢复同一 job。
- 拒绝 `--execute`、`--mock`、确认变量和所有平台写入参数。
- 输出脱敏 JSON，不输出 token、Cookie、完整触点 URL、完整落地页 URL、raw request、raw response 或 raw payload。

## 机制观察

| 观察 | 事实证据 | 对本次影响 | 建议后续任务 |
| --- | --- | --- | --- |
| Node 4 完整外部探针尚未接入正式 runner | `src/platforms/oceanengineReadonlyAdapter.mjs` 已有头像、品牌、事件、产品图等探针；正式 runner 当前只接入 DMP、事件、视频、查重等部分只读能力 | 本任务可声明 Node 1-5 workflow 已执行，但不能声明所有账户资源均已完成实时外部核验 | 独立任务：将 `oceanengineReadonlyAdapter` 以脱敏 evidence 和受控资源状态方式接入 Node 4 |

## 验收标准

| 标准 | 状态 |
| --- | --- |
| 新建 task 和 manifest | passed |
| `project.state.json.active_task` 指向本任务 | passed |
| 乾坤只读 preflight 精确命中 `monitor_id=245828` | passed |
| 新建 `runtime_truth` job | passed |
| 新 job 有 7 条 `launch_node_runs` | passed |
| Node 1-5 完整运行 | passed |
| Node 6 为 `locked` | passed |
| Node 7 为 dry_run `not_applicable` 本地记录 | passed |
| `launch_confirmations=0` | passed |
| `platform_actions=0` | passed |
| `created_objects=0` | passed |
| 未保存敏感明文 | passed |
| 任务结束后 `active_task=null` 且平台写入保持关闭 | passed |

## 执行记录

| 项 | 结果 |
| --- | --- |
| 结论 | `blocked_with_evidence` |
| runtime job | `JOB-MWBV2-20260827080834-877CB8` |
| draft | `DRAFT-JOB-MWBV2-20260827080834-877CB8` |
| project name | `245828_N_JSZC_HUNT_PAY7DROI_平台定向不限_P01_20260827` |
| payload hash | `sha256:d0fed3f8e326f36d97518e1eff53356e54d8954958ddd9fc6d27090b35908d0e` |
| source_usage | `runtime_truth` |
| job_status | `draft_ready` |
| current_node | `5` |

## 乾坤只读预检

| 项 | 结果 |
| --- | --- |
| `POST /tf/account_info/accountIndex` | called |
| `POST /tf/ad/index` | called |
| exactMatchCount | `1` |
| expected monitor_id | `245828` |
| resolved monitor_id | `245828` |
| touchpoint_url_present | `true` |
| touchpoint url_hash | `sha256:ccd1178914f17cc140a1c56c1d1fcbfd2ba461a58f8c5b4a1ca870f98504fff1` |
| evidence | `EV-JOB-MWBV2-20260827080834-877CB8-MPR-OCEANENGINE-3-BYTE-MINI-GAME-JSZC-1871922346964041-PLAN-ONLY` |

说明：乾坤 `plan_only` 输出顶层 status 为 `blocked`，原因来自既有 Cycle attempt policy/历史创建尝试状态；本次只读 readback 已精确命中 monitor 和受控触点，不视为本任务失败。

## 7 节点状态

| 节点 | 状态 |
| --- | --- |
| `launch_intake` | `passed` |
| `creation_context` | `passed` |
| `game_launch_pack` | `blocked` |
| `account_resource_prepare` | `blocked` |
| `std_project_draft_builder` | `repairable` |
| `std_project_create_executor` | `locked` |
| `readback_closer` | `waiting` |

## 主要阻断

| 维度 | 阻断 |
| --- | --- |
| 备用落地页 | `backup_landing_page_resource_missing`、`backup_landing_page_missing`、`backup_landing_page_url_missing_or_not_https`、`backup_landing_page_target_not_visible`、`backup_landing_page_readback_not_verified`、`backup_landing_page_hash_mismatch` |
| 账户资源 | `avatar_missing`、`dmp_custom_audience_ids_missing`、`event_asset_not_ready`、`product_image_missing`、`brand_info_missing`、`micro_app_instance_missing` |
| 视频/巨量只读凭据 | `credential_required`、`access_token_expired_refresh_required`、`required_video_material_readback_incomplete`、`required_video_cover_readback_incomplete` |
| 字段合同 | `instance_id_long_id_transport_not_verified`、`brand_info_required`、`brand_info_numeric_fields`、`final_payload_blockers`、`payload_contract_not_passed` |

唯一优先阻断：`backup_landing_page_resource_missing`。

## 审计

| 项 | 数量 |
| --- | --- |
| `launch_node_runs` | `7` |
| `launch_skill_runs` | `22` |
| `launch_drafts` | `1` |
| `launch_execution_plans` | `1` |
| `readback_records` | `1` |
| `evidence_artifacts` | `2` |
| `launch_confirmations` | `0` |
| `platform_actions` | `0` |
| `created_objects` | `0` |

Evidence:

- `EV-JOB-MWBV2-20260827080834-877CB8-MPR-OCEANENGINE-3-BYTE-MINI-GAME-JSZC-1871922346964041-PLAN-ONLY`，`artifact_type=qiankun_monitor_plan_only`，`content_hash=sha256:ea4f29895ee7eeb8e72230465dbb58eaf9927efe3ad7d12fdc3fd933773df698`
- `EV-JOB-MWBV2-20260827080834-877CB8-STD-PROJECT-DUPLICATE-READONLY`，`artifact_type=std_project_duplicate_readonly`，`content_hash=sha256:427686bd8499422fb47b4e8209b552f8b64e7b250247d7d70e1117222b372501`

## 验证命令

| 命令 | 结果 |
| --- | --- |
| `node --check scripts/00-oe3-readonly-readiness-cli.mjs` | passed |
| `node --check scripts/00-oe3-readonly-readiness-cli-smoke.mjs` | passed |
| `node --check src/repositories/postgresRepository.mjs` | passed |
| `npm run test:readonly-readiness-cli` | passed |
| `npm run workflow:readonly-readiness -- --route-id oceanengine_3_byte_mini_game --game-code JSZC --advertiser-id 1871922346964041` | completed |
| `npm run test:execution-plan` | passed |
| `npm run test:payload-contract` | passed |
| `npm run smoke:workflow-skills` | passed |
| `npm run smoke:readonly` | passed |
| `npm run check:runtime-consistency -- --job-id JOB-MWBV2-20260827080834-877CB8` | passed |
| `git diff --check` | passed |

## 下一步

不进入真实创建。下一步最合理是独立任务修复目标账户资源和只读凭据阻断；机制层面另起任务接入 `src/platforms/oceanengineReadonlyAdapter.mjs` 到 Node 4。
