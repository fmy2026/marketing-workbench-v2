# marketing-workbench-v2｜project-现状逻辑图

```text
┌──────────────────────────────────────────────────────────────────┐
│ 权威：当前 OE3 标准项目创建闭环                                  │
│ 节点注册：src/workflows/skills/oe3/00-workflow-node-registry.mjs │
│ Skill 合同：src/workflows/skills/oe3/00-contracts.mjs            │
│ 动态真值：Postgres marketing_workbench_v2.mwb                    │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│ 输入：route_id + game_code + advertiser_id + case_id              │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│ workflow_case → launch_job（case_id 必填）                        │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│ N01 Intake 规范                                                   │
└──────────────────────────────────────────────────────────────────┘
                              ↓ passed
┌──────────────────────────────────────────────────────────────────┐
│ N02 创建上下文装配                                                │
└──────────────────────────────────────────────────────────────────┘
                              ↓ passed
┌──────────────────────────────────────────────────────────────────┐
│ N03 游戏保底包解析                                                │
└──────────────────────────────────────────────────────────────────┘
                              ↓ passed
┌──────────────────────────────────────────────────────────────────┐
│ N04 账户资源准备                                                  │
└──────────────────────────────────────────────────────────────────┘
                              ↓ 全部必需资源 passed
┌──────────────────────────────────────────────────────────────────┐
│ N05 创建草稿生成                                                  │
└──────────────────────────────────────────────────────────────────┘
                              ↓ ready_for_user_create_confirmation
┌──────────────────────────────────────────────────────────────────┐
│ 人工确认：single_create_confirmation                             │
└──────────────────────────────────────────────────────────────────┘
                              ↓ 已确认且权限 / plan / attempt 均通过
┌──────────────────────────────────────────────────────────────────┐
│ N06 一次性创建执行                                                │
└──────────────────────────────────────────────────────────────────┘
                              ↓ created_pending_readback
┌──────────────────────────────────────────────────────────────────┐
│ N07 只读回查与证据收口                                            │
└──────────────────────────────────────────────────────────────────┘
                              ↓ readback_verified
┌──────────────────────────────────────────────────────────────────┐
│ workflow_case_summary                                            │
│ → 当前 Gate / blocker / next_action → UI / API / CLI / 任务卡    │
└──────────────────────────────────────────────────────────────────┘


╔══════════════════════════════════════════════════════════════════╗
║ N01｜launch_intake｜Intake 规范                                  ║
╚══════════════════════════════════════════════════════════════════╝
                              ↑ INPUT
  route_id + game_code + advertiser_id + case_id
                              ↓
  route-normalize：路线归一
                              ↓
  game-identify：游戏识别
                              ↓
  advertiser-identify：账户识别
                              ↓
  runIntakeNormalizeSkill：检查 route_id / game_code / advertiser_id
                              ↓ EXECUTE
  归一业务定位
                              ↓ WRITE
  launch_jobs + launch_node_runs + 必要的 launch_skill_runs
                              ↓ OUTPUT
  launch_intake + route_id + game_code + advertiser_id
                              ↓
  ┌─ 缺 route_id | game_code | advertiser_id
  │    ↓
  │  missing_* → blocked → workflow_case_summary.blocker → 停止
  │
  └─ 三个字段完整
       ↓
     N02


╔══════════════════════════════════════════════════════════════════╗
║ N02｜creation_context｜创建上下文装配                             ║
╚══════════════════════════════════════════════════════════════════╝
                              ↑ INPUT
  route_id + game_code + advertiser_id + N01 业务定位
                              ↓
  [account-status]
    INPUT   route_id + game_code + advertiser_id
    SKILL   context-resolve-account
    OUTPUT  account_status + monitor_id
    STOP    account_missing | account_not_ready
                              ↓
  [touchpoint-reference]
    INPUT   route_id + game_code + advertiser_id + monitor_id
    SKILL   context-resolve-touchpoint
    OUTPUT  touchpoint_ref + url_hash + status + hash_matches
    STOP    touchpoint_missing | touchpoint_hash_mismatch
                              ↓
  [monitor]
    INPUT   provision / monitor / touchpoint / plan 上下文
    SKILL   monitor-readback
              ↓
            monitor-ensure
              ↓
            monitor-plan
              ↓
            monitor-query
    OUTPUT  monitor_readback_status + monitor_id + touchpoint_ref
            + touchpoint_url_hash + create_called + attempt_no
            + ensure_monitor_planned + plan_hash + attempt_policy + provision_id
    STOP    缺回查 | 触点未解析 | plan 未授权 | 尝试上限
            | monitor 创建失败 | plan/query 阻断
                              ↓
  [platform-app]
    INPUT   route_id + game_code
    SKILL   context-resolve-platform-app
    OUTPUT  app_id_present + app_type
    STOP    platform_app_missing
                              ↓ WRITE
  launch_node_runs + launch_skill_runs + monitor_provision_runs + 脱敏证据
                              ↓ OUTPUT
  creation_context + account + controlled_touchpoint + monitor + platform_app
                              ↓
  ┌─ 任一子节点 STOP
  │    ↓
  │  blocked / needs_confirmation → case_summary.blocker → 停止自动创建
  │
  └─ 全部通过
       ↓
     N03


╔══════════════════════════════════════════════════════════════════╗
║ N03｜game_launch_pack｜游戏保底包解析                             ║
╚══════════════════════════════════════════════════════════════════╝
                              ↑ INPUT
  route_id + game_code
                              ↓
  [game-master]
    SKILL   launch-pack-resolve-game
    OUTPUT  game_name + product_name + brand_name
    STOP    game_missing
                              ↓
  [route-defaults]
    SKILL   launch-pack-resolve-defaults
    OUTPUT  objective + deep_objective + budget + bid + aweme_id_baseline
    STOP    route_defaults_missing
                              ↓
  [base-material-pack]
    SKILL   launch-pack-resolve-materials
    OUTPUT  material_pack_id + material_item_count
    STOP    material_pack_missing
                              ↓
  [backup-landing-page]
    SKILL   launch-pack-resolve-backup-landing-page
    OUTPUT  landing_page_asset_id + site_id + site_name + url_hash + status
    STOP    backup_landing_page_default_missing
                              ↓
  [baseline-resource-blueprints]
    INPUT   route_id + game_code + resource_blueprints
    SKILL   launch-pack-resolve-resource-blueprints
    OUTPUT  blueprint_count + required_blueprint_count + resource_type[]
    STOP    baseline_resource_blueprints_missing
                              ↓ WRITE
  launch_node_runs + launch_skill_runs
                              ↓ OUTPUT
  game_launch_pack + game_master + route_defaults + material_pack
  + backup_landing_page + resource_blueprints
                              ↓
  ┌─ 任一子节点 STOP
  │    ↓
  │  blocked → workflow_case_summary.blocker → 停止自动创建
  │
  └─ 全部通过
       ↓
     N04


╔══════════════════════════════════════════════════════════════════╗
║ N04｜account_resource_prepare｜账户资源准备                       ║
╚══════════════════════════════════════════════════════════════════╝
                              ↑ INPUT
  route_id + game_code + advertiser_id
  + N02 creation_context + N03 game_launch_pack + resource_blueprints
                              ↓
  [01 baseline-resource-bootstrap]
    INPUT   route_id + game_code + advertiser_id + resource_blueprints
    SKILL   resource-bootstrap-from-blueprints
    OUTPUT  blueprint_count + created_resource_count + existing_resource_count
            + inheritance_status[]
    STOP    baseline_resource_blueprints_missing
                              ↓
  [02 target-resource-readonly]
    INPUT   route_id + game_code + advertiser_id + account_resources
    SKILL   resource-live-readonly-reconcile
    OUTPUT  readonly_status + probe_count + resource_update_count + evidence_ref
    STOP    credential_required | readonly_transport_failed
                              ↓
  [03 aweme-authorization]
    INPUT   route / game / advertiser + aweme_id_baseline
            + advertiser_accounts.aweme_authorization
    SKILL   aweme-authorization-readonly
    OUTPUT  selection_status + active_candidate_count + selected_aweme_id_hash
            + verified_at + evidence_ref
    STOP    baseline 缺失 | 无活跃候选 | 需人工选择 | 已选候选失效 | probe 失败
                              ↓
  [04 resource-avatar]
    INPUT   账户定位 + avatar.source_asset_id + 头像提交合同 + avatar
    SKILL   avatar-source-prepare
              ↓
            avatar-submit-plan
              ↓
            resource-verify-avatar
    OUTPUT  来源 hash / 格式 / 尺寸 + 提交合同 / request hash
            + avatar readiness + evidence + next_action
    STOP    来源 / hash / 尺寸 / 合同 / image_id 缺失
            | avatar_not_ready | prepare_unsupported
                              ↓
  [05 resource-dmp_audience_package]
    INPUT   账户定位 + package set + 来源户 / 目标户 + audience member IDs
    SKILL   dmp-baseline-resolve
              ↓
            dmp-source-readonly-verify
              ↓
            dmp-target-readonly-verify
              ↓
            dmp-push-plan
              ↓
            resource-verify-dmp-audience-package
    OUTPUT  package set / member 数 + 来源 / 目标核验 + missing 数
            + push plan + request hashes + audience readiness + evidence
    STOP    package set / member 缺失 | 权限 / readonly 异常
            | source 未完成 | push plan 待处理 | audience 未就绪 | prepare_unsupported
                              ↓
  [06 resource-video_asset]
    INPUT   account_resources + video_asset[] + material_source_account
    SKILL   resource-live-readonly-reconcile
              ↓
            video-material-bind-plan
              ↓
            resource-verify-video-asset
    OUTPUT  来源 / 目标账户 + bind plan + request hashes
            + video / cover readiness + evidence + next_action
    STOP    credential / transport 异常 | plan 阻断 | 来源素材缺失
            | platform probe 失败 | video 未就绪 | prepare_unsupported
                              ↓
  [07 resource-event_asset]
    INPUT   route + game + advertiser + event_asset
    SKILL   resource-verify-event-asset
    OUTPUT  resource status + blocker + evidence + readiness
    STOP    event_asset_not_ready | prepare_unsupported
                              ↓
  [08 resource-product_image]
    INPUT   route + game + advertiser + product_image
    SKILL   resource-verify-product-image
    OUTPUT  resource status + blocker + evidence + readiness
    STOP    product_image_not_ready | prepare_unsupported
                              ↓
  [09 resource-brand_info]
    INPUT   route + game + advertiser + brand_info
    SKILL   resource-verify-brand-info
    OUTPUT  resource status + blocker + evidence + readiness
    STOP    brand_info_not_ready | prepare_unsupported
                              ↓
  [10 resource-micro_app_instance]
    INPUT   route + game + advertiser + micro_app_instance
    SKILL   resource-verify-micro-app-instance
    OUTPUT  resource status + blocker + evidence + readiness
    STOP    micro_app_instance_not_ready | prepare_unsupported
                              ↓
  [11 resource-backup_landing_page]
    INPUT   route + game + advertiser + backup_landing_page
    SKILL   resource-verify-backup-landing-page
    OUTPUT  resource status + blocker + evidence + readiness
    STOP    backup_landing_page_not_ready | prepare_unsupported
                              ↓ WRITE
  launch_node_runs + launch_skill_runs + account_resources
  + DMP member / push-plan 事实 + 资源证据
                              ↓ OUTPUT
  account_ready_report + 逐资源 readiness + blocker + evidence + next_action
                              ↓
  ┌─ 任一创建所需资源 blocked | needs_confirmation | unsupported
  │    ↓
  │  workflow_case_summary.blocker → 停止自动创建
  │
  └─ 全部创建所需资源 passed
       ↓
     N05


╔══════════════════════════════════════════════════════════════════╗
║ N05｜std_project_draft_builder｜创建草稿生成                       ║
╚══════════════════════════════════════════════════════════════════╝
                              ↑ INPUT
  job + account + route_defaults + material_pack + account_resources
  + controlled_touchpoint + controlled_mini_game_launch_link
  + advertiser_accounts.aweme_authorization
                              ↓
  [project-name-and-draft]
    SKILL   payload-build
    OUTPUT  project_name + final_payload_hash + request_field_manifest
    STOP    payload_build_blocked
                              ↓
  [field-contract]
    INPUT   final_payload_manifest + payload_hash
    SKILL   payload-contract
    OUTPUT  payload_contract_status + checks + blockers
    STOP    payload_contract_blocked
                              ↓
  [duplicate-check]
    INPUT   advertiser_id + project_name
    SKILL   duplicate-check
    OUTPUT  status + checked_at + duplicate_found + matched_object_id + evidence_ref + reason
    STOP    duplicate_check_blocked | platform_duplicate_found
                              ↓
  [create-readiness]
    INPUT   all_skill_statuses + platform_actions + created_objects
    SKILL   create-readiness
    OUTPUT  create_readiness_status + unique_blocker + next_action
    STOP    not_ready_for_create
                              ↓ WRITE
  launch_node_runs + launch_skill_runs + 项目名预约
  + 草稿摘要 + payload hash + 查重 / 预检证据
                              ↓ OUTPUT
  creation_draft + project_name + final_payload_hash + request_field_manifest
  + create_readiness_status + unique_blocker + next_action
                              ↓
  ┌─ ready_for_user_create_confirmation
  │    ↓
  │  人工确认 single_create_confirmation
  │    ↓
  │  N06
  │
  └─ 其他状态
       ↓
     workflow_case_summary.blocker → 禁止真实创建


╔══════════════════════════════════════════════════════════════════╗
║ N06｜std_project_create_executor｜一次性创建执行                  ║
╚══════════════════════════════════════════════════════════════════╝
                              ↑ INPUT
  job_id + payload_hash + single_create_confirmation
  + project.state.json.guardrails.platform_write_allowed
  + workflow_case + execution_plan + confirmation + platform_actions
                              ↓
  [creation-grant]
    RESOLVER getExecutionGrantAvailability
    CHECK    global write allowed + 当前 job plan 允许 + 人工确认存在
             + 当前 attempt 未消耗
    OUTPUT   can_execute_once + already_attempted + child_status
    STOP     platform_write_disabled | single_create_attempt_already_recorded
                              ↓ can_execute_once
  [create-once]
    INPUT   job_id + payload_hash + single_create_confirmation
    SKILL   create-once
    EXECUTE 一次 std_project/create
    OUTPUT  platform_action_summary + object_id_present
    STOP    platform_write_disabled | single_attempt_already_recorded | create_failed
                              ↓
  [create-result]
    INPUT   platform_actions.action_status + created_objects.object_status
    RESOLVER childStatus
    OUTPUT  child_status
    STOP    create_failed
                              ↓ WRITE
  launch_execution_plans + launch_confirmations + platform_actions
  + created_objects + launch_node_runs + launch_skill_runs
                              ↓
  ┌─ 创建成功
  │    ↓
  │  created_pending_readback
  │    ↓
  │  N07
  │
  └─ 创建失败 / 授权不通过 / attempt 已消耗
       ↓
     workflow_case_summary.blocker
       ↓
     停止自动创建 → 人工复盘或新 payload 的 fresh job


╔══════════════════════════════════════════════════════════════════╗
║ N07｜readback_closer｜只读回查与证据收口                          ║
╚══════════════════════════════════════════════════════════════════╝
                              ↑ INPUT
  job_id + project_name + created_object_or_project_name
                              ↓
  [object-readback]
    SKILL   readback-std-project
    OUTPUT  readback_status + object_name_matches_draft + evidence_ref
    STOP    readback_not_found_or_mismatch
                              ↓
  [field-consistency]
    INPUT   readback_records.readback_status
    RESOLVER readbackStatus
    OUTPUT  child_status
    STOP    readback_not_found_or_mismatch
                              ↓
  [evidence-archive]
    INPUT   readback_records.readback_status + evidence_ref
    RESOLVER childStatus
    OUTPUT  child_status
    STOP    readback_not_found_or_mismatch | readback_evidence_missing
                              ↓ WRITE
  readback_records + evidence artifacts + launch_node_runs + launch_skill_runs
                              ↓
  ┌─ readback_verified
  │    ↓
  │  workflow_case 完成 → workflow_case_summary 输出完成状态
  │
  └─ not_found | mismatch | evidence_missing
       ↓
     禁止再次创建 → workflow_case_summary.blocker
       ↓
     人工决策或 fresh corrective job


======================================================================
全局写入 / 停止约束
======================================================================

  prepare_supported=true + fresh plan + 单次授权
    ↓
  允许一次资源写入
    ↓
  真实只读回查

  其他资源状态
    ↓
  blocker / evidence
    ↓
  不猜测、不自动补写、不自动重试

  global platform_write_allowed=true
    + 当前 job execution plan 允许
    + 当前 payload_hash 匹配
    + single_create_confirmation 存在
    + 当前 attempt 未消耗
      ↓
    允许一次 std_project/create

  任一条件不满足
    ↓
  零写入停止
```
