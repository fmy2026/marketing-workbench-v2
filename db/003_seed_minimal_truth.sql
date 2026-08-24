-- Target database: marketing_workbench_v2
-- Scope: seed one route, one game, one account, assets, material pack,
-- one launch job, seven node runs, one draft, one readback summary,
-- and redacted evidence artifacts.

INSERT INTO mwb.platform_routes (
  route_id,
  platform,
  marketing_product,
  route_name,
  version,
  object_type,
  write_policy,
  status,
  capabilities,
  created_at,
  updated_at
) VALUES (
  'oceanengine_3_byte_mini_game',
  'oceanengine',
  'byte_mini_game',
  '巨量引擎3.0-字节小游戏',
  '3.0',
  'std_project',
  'confirm_required',
  'active',
  '{"compile": true, "execute": false, "readback": true}'::jsonb,
  '2026-08-23 16:30:00+08',
  '2026-08-23 16:30:00+08'
) ON CONFLICT (route_id) DO UPDATE SET
  platform = EXCLUDED.platform,
  marketing_product = EXCLUDED.marketing_product,
  route_name = EXCLUDED.route_name,
  version = EXCLUDED.version,
  object_type = EXCLUDED.object_type,
  write_policy = EXCLUDED.write_policy,
  status = EXCLUDED.status,
  capabilities = EXCLUDED.capabilities,
  updated_at = EXCLUDED.updated_at;

INSERT INTO mwb.games (
  game_code,
  game_name,
  product_name,
  category,
  brand_name,
  status,
  product_identity,
  created_at,
  updated_at
) VALUES (
  'JSZC',
  '巨兽战场',
  '巨兽战场',
  '小游戏',
  '巨兽战场',
  'active',
  '{
    "profile_id": "PI-JSZC-HUNT-BASELINE-001",
    "brand_display_name": "巨兽战场",
    "semantic_category": "字节小游戏 / 策略休闲",
    "selling_points": ["开局装备全靠捡", "三分钟快速上手", "无需下载点开即玩"]
  }'::jsonb,
  '2026-08-23 16:30:00+08',
  '2026-08-23 16:30:00+08'
) ON CONFLICT (game_code) DO UPDATE SET
  game_name = EXCLUDED.game_name,
  product_name = EXCLUDED.product_name,
  category = EXCLUDED.category,
  brand_name = EXCLUDED.brand_name,
  status = EXCLUDED.status,
  product_identity = EXCLUDED.product_identity,
  updated_at = EXCLUDED.updated_at;

INSERT INTO mwb.advertiser_accounts (
  advertiser_id,
  route_id,
  game_code,
  account_name,
  platform,
  auth_status,
  platform_status,
  owner_name,
  monitor_id,
  created_at,
  updated_at
) VALUES (
  '1871922175825993',
  'oceanengine_3_byte_mini_game',
  'JSZC',
  '上海游民-巨兽战场-汇金-抖小-22',
  'oceanengine',
  'ready',
  'account_calibration_ready',
  'unknown',
  '245791',
  '2026-08-23 16:30:00+08',
  '2026-08-23 16:30:00+08'
) ON CONFLICT (advertiser_id) DO UPDATE SET
  route_id = EXCLUDED.route_id,
  game_code = EXCLUDED.game_code,
  account_name = EXCLUDED.account_name,
  platform = EXCLUDED.platform,
  auth_status = EXCLUDED.auth_status,
  platform_status = EXCLUDED.platform_status,
  owner_name = EXCLUDED.owner_name,
  monitor_id = EXCLUDED.monitor_id,
  updated_at = EXCLUDED.updated_at;

INSERT INTO mwb.account_touchpoints (
  touchpoint_id,
  advertiser_id,
  route_id,
  game_code,
  monitor_id,
  touchpoint_ref,
  url_hash,
  status,
  source,
  created_at,
  updated_at
) VALUES (
  'tp_1871922175825993_245791',
  '1871922175825993',
  'oceanengine_3_byte_mini_game',
  'JSZC',
  '245791',
  'OCEANENGINE_BMG_TOUCHPOINT_1871922175825993_245791_URL',
  '3723ee0d37c85bb9d7637cf2005b9e24603de1d3a7c8e0b5c91ac78b57a12ed9',
  'stored_in_private',
  'account_profile',
  '2026-08-23 16:30:00+08',
  '2026-08-23 16:30:00+08'
) ON CONFLICT (touchpoint_id) DO UPDATE SET
  advertiser_id = EXCLUDED.advertiser_id,
  route_id = EXCLUDED.route_id,
  game_code = EXCLUDED.game_code,
  monitor_id = EXCLUDED.monitor_id,
  touchpoint_ref = EXCLUDED.touchpoint_ref,
  url_hash = EXCLUDED.url_hash,
  status = EXCLUDED.status,
  source = EXCLUDED.source,
  updated_at = EXCLUDED.updated_at;

INSERT INTO mwb.game_route_defaults (
  id,
  route_id,
  game_code,
  objective,
  deep_objective,
  deep_bid_type,
  budget,
  bid,
  roi_goal,
  schedule,
  targeting_summary,
  dmp_summary,
  raw_defaults,
  created_at,
  updated_at
) VALUES (
  'GRD-oceanengine_3_byte_mini_game-JSZC',
  'oceanengine_3_byte_mini_game',
  'JSZC',
  'AD_CONVERT_TYPE_PAY',
  'AD_CONVERT_TYPE_PURCHASE_ROI_7D',
  'PER_AND_SEVEN_PAY_ROI',
  88888,
  488,
  0.088,
  '{
    "schedule_type": "SCHEDULE_FROM_NOW",
    "summary": "使用已验证排期摘要",
    "schedule_time_digest": "9e35339db1e951fd0c5b2de1908de02d1ff0d67243145c05ec195b15236c9594"
  }'::jsonb,
  '平台定向不限',
  '六个月转化排除 + 10 个排除标签',
  '{
    "optimization": {
      "external_action": "AD_CONVERT_TYPE_PAY",
      "deep_external_action": "AD_CONVERT_TYPE_PURCHASE_ROI_7D"
    },
    "budget_bid": {
      "budget": 88888,
      "bid": 488,
      "roi_goal": 0.088,
      "deep_bid_type": "PER_AND_SEVEN_PAY_ROI"
    },
    "schedule": {
      "summary": "使用已验证排期摘要",
      "schedule_time_digest": "9e35339db1e951fd0c5b2de1908de02d1ff0d67243145c05ec195b15236c9594"
    },
    "audience_targeting": {
      "platform_label": "平台定向不限"
    },
    "audience_filters": {
      "converted_time_duration": "SIX_MONTH",
      "retargeting_tags_exclude_count": 10,
      "dmp_audience_package_set_ref": "DMP-JSZC-HUNT-CONVERTED-EXCLUDE-BASELINE-001"
    }
  }'::jsonb,
  '2026-08-23 16:30:00+08',
  '2026-08-23 16:30:00+08'
) ON CONFLICT (id) DO UPDATE SET
  route_id = EXCLUDED.route_id,
  game_code = EXCLUDED.game_code,
  objective = EXCLUDED.objective,
  deep_objective = EXCLUDED.deep_objective,
  deep_bid_type = EXCLUDED.deep_bid_type,
  budget = EXCLUDED.budget,
  bid = EXCLUDED.bid,
  roi_goal = EXCLUDED.roi_goal,
  schedule = EXCLUDED.schedule,
  targeting_summary = EXCLUDED.targeting_summary,
  dmp_summary = EXCLUDED.dmp_summary,
  raw_defaults = EXCLUDED.raw_defaults,
  updated_at = EXCLUDED.updated_at;

INSERT INTO mwb.game_assets (
  asset_id,
  game_code,
  asset_type,
  asset_name,
  asset_ref,
  asset_hash,
  visibility_status,
  metadata,
  created_at,
  updated_at
) VALUES
  (
    'JSZC-HUNT-4IG2-3',
    'JSZC',
    'video_asset',
    '4iG2+4iBP-1',
    'JSZC-HUNT-4IG2-3',
    '3240649a53786763244421475235e4ec4ddd735cf00c41bf9b576461399cc028',
    'active',
    '{"width": 720, "height": 1280, "duration_seconds": 108.7, "material_code": "4iG2-3"}'::jsonb,
    '2026-08-23 16:30:00+08',
    '2026-08-23 16:30:00+08'
  ),
  (
    'JSZC-HUNT-4GE6-14',
    'JSZC',
    'video_asset',
    '射击野猪+口播改MD5=荒野狙击',
    'JSZC-HUNT-4GE6-14',
    'de340357f8485b85fe5240c5951d0d0af52cbacf3dcf6dbec5d076b44ca39db6',
    'active',
    '{"width": 720, "height": 1280, "duration_seconds": 17.733, "material_code": "4gE6-14"}'::jsonb,
    '2026-08-23 16:30:00+08',
    '2026-08-23 16:30:00+08'
  ),
  (
    'JSZC-HUNT-4GE6-23',
    'JSZC',
    'video_asset',
    '4gE6-14组合后接',
    'JSZC-HUNT-4GE6-23',
    '8851b68d8c1d898ea826e186a2755f69321a4aafcf5ffefba9a0e2b9255692a1',
    'active',
    '{"width": 720, "height": 1280, "duration_seconds": 81.6, "material_code": "4gE6-23"}'::jsonb,
    '2026-08-23 16:30:00+08',
    '2026-08-23 16:30:00+08'
  ),
  (
    'PI-JSZC-HUNT-BASELINE-001',
    'JSZC',
    'product_identity',
    '巨兽战场产品身份',
    'PI-JSZC-HUNT-BASELINE-001',
    NULL,
    'active',
    '{"brand_name": "巨兽战场", "category": "小游戏", "semantic_category": "字节小游戏 / 策略休闲"}'::jsonb,
    '2026-08-23 16:30:00+08',
    '2026-08-23 16:30:00+08'
  ),
  (
    'MD-JSZC-HUNT-HUNTING-BASELINE-001',
    'JSZC',
    'material_direction_pack',
    '狩猎保底方向包',
    'MD-JSZC-HUNT-HUNTING-BASELINE-001',
    NULL,
    'baseline_ready',
    '{"direction": "狩猎", "required_video_count": 2, "default_video_asset_ids": ["JSZC-HUNT-4IG2-3", "JSZC-HUNT-4GE6-14"]}'::jsonb,
    '2026-08-23 16:30:00+08',
    '2026-08-23 16:30:00+08'
  )
ON CONFLICT (asset_id) DO UPDATE SET
  game_code = EXCLUDED.game_code,
  asset_type = EXCLUDED.asset_type,
  asset_name = EXCLUDED.asset_name,
  asset_ref = EXCLUDED.asset_ref,
  asset_hash = EXCLUDED.asset_hash,
  visibility_status = EXCLUDED.visibility_status,
  metadata = EXCLUDED.metadata,
  updated_at = EXCLUDED.updated_at;

INSERT INTO mwb.material_packs (
  pack_id,
  game_code,
  route_id,
  pack_name,
  pack_type,
  status,
  summary,
  created_at,
  updated_at
) VALUES (
  'MD-JSZC-HUNT-HUNTING-BASELINE-001',
  'JSZC',
  'oceanengine_3_byte_mini_game',
  '狩猎保底物料包',
  'baseline',
  'baseline_ready',
  '{"direction": "狩猎", "default_video_asset_ids": ["JSZC-HUNT-4IG2-3", "JSZC-HUNT-4GE6-14"], "candidate_video_asset_ids": ["JSZC-HUNT-4IG2-3", "JSZC-HUNT-4GE6-14", "JSZC-HUNT-4GE6-23"]}'::jsonb,
  '2026-08-23 16:30:00+08',
  '2026-08-23 16:30:00+08'
) ON CONFLICT (pack_id) DO UPDATE SET
  game_code = EXCLUDED.game_code,
  route_id = EXCLUDED.route_id,
  pack_name = EXCLUDED.pack_name,
  pack_type = EXCLUDED.pack_type,
  status = EXCLUDED.status,
  summary = EXCLUDED.summary,
  updated_at = EXCLUDED.updated_at;

INSERT INTO mwb.material_pack_items (
  item_id,
  pack_id,
  asset_id,
  item_type,
  asset_ref,
  required,
  sort_order,
  status,
  metadata,
  created_at,
  updated_at
) VALUES
  (
    'MPI-MD-JSZC-HUNT-HUNTING-BASELINE-001-001',
    'MD-JSZC-HUNT-HUNTING-BASELINE-001',
    'JSZC-HUNT-4IG2-3',
    'video_asset',
    'JSZC-HUNT-4IG2-3',
    true,
    1,
    'active',
    '{"role": "default_video"}'::jsonb,
    '2026-08-23 16:30:00+08',
    '2026-08-23 16:30:00+08'
  ),
  (
    'MPI-MD-JSZC-HUNT-HUNTING-BASELINE-001-002',
    'MD-JSZC-HUNT-HUNTING-BASELINE-001',
    'JSZC-HUNT-4GE6-14',
    'video_asset',
    'JSZC-HUNT-4GE6-14',
    true,
    2,
    'active',
    '{"role": "default_video"}'::jsonb,
    '2026-08-23 16:30:00+08',
    '2026-08-23 16:30:00+08'
  ),
  (
    'MPI-MD-JSZC-HUNT-HUNTING-BASELINE-001-003',
    'MD-JSZC-HUNT-HUNTING-BASELINE-001',
    'JSZC-HUNT-4GE6-23',
    'video_asset',
    'JSZC-HUNT-4GE6-23',
    false,
    3,
    'active',
    '{"role": "candidate_video"}'::jsonb,
    '2026-08-23 16:30:00+08',
    '2026-08-23 16:30:00+08'
  )
ON CONFLICT (item_id) DO UPDATE SET
  pack_id = EXCLUDED.pack_id,
  asset_id = EXCLUDED.asset_id,
  item_type = EXCLUDED.item_type,
  asset_ref = EXCLUDED.asset_ref,
  required = EXCLUDED.required,
  sort_order = EXCLUDED.sort_order,
  status = EXCLUDED.status,
  metadata = EXCLUDED.metadata,
  updated_at = EXCLUDED.updated_at;

INSERT INTO mwb.launch_jobs (
  job_id,
  route_id,
  game_code,
  advertiser_id,
  object_type,
  job_status,
  current_node,
  source_record_ref,
  created_at,
  updated_at
) VALUES (
  'JOB-MWBV2-DEMO-001',
  'oceanengine_3_byte_mini_game',
  'JSZC',
  '1871922175825993',
  'std_project',
  'draft_ready',
  '5',
  'seed:minimal_truth_v1',
  '2026-08-23 16:30:00+08',
  '2026-08-23 16:30:00+08'
) ON CONFLICT (job_id) DO UPDATE SET
  route_id = EXCLUDED.route_id,
  game_code = EXCLUDED.game_code,
  advertiser_id = EXCLUDED.advertiser_id,
  object_type = EXCLUDED.object_type,
  job_status = EXCLUDED.job_status,
  current_node = EXCLUDED.current_node,
  source_record_ref = EXCLUDED.source_record_ref,
  updated_at = EXCLUDED.updated_at;

INSERT INTO mwb.launch_node_runs (
  node_run_id,
  job_id,
  node_key,
  node_name,
  phase,
  status,
  summary,
  diagnostic_level,
  started_at,
  finished_at
) VALUES
  ('NR-JOB-MWBV2-DEMO-001-01', 'JOB-MWBV2-DEMO-001', 'launch_intake', 'Intake 规范', '准备阶段', 'passed', '路线、游戏、账户已识别。', 'info', '2026-08-23 16:30:00+08', '2026-08-23 16:30:00+08'),
  ('NR-JOB-MWBV2-DEMO-001-02', 'JOB-MWBV2-DEMO-001', 'creation_context', '创建上下文装配', '准备阶段', 'passed', '账户、监测序号和触点引用已装配。', 'info', '2026-08-23 16:30:00+08', '2026-08-23 16:30:00+08'),
  ('NR-JOB-MWBV2-DEMO-001-03', 'JOB-MWBV2-DEMO-001', 'game_launch_pack', '游戏保底包解析', '准备阶段', 'passed', '游戏产品身份和保底物料包已装配。', 'info', '2026-08-23 16:30:00+08', '2026-08-23 16:30:00+08'),
  ('NR-JOB-MWBV2-DEMO-001-04', 'JOB-MWBV2-DEMO-001', 'account_resource_prepare', '账户资源诊断与补齐', '就绪阶段', 'repairable', '头像和账户资源需要确认。', 'warning', '2026-08-23 16:30:00+08', NULL),
  ('NR-JOB-MWBV2-DEMO-001-05', 'JOB-MWBV2-DEMO-001', 'std_project_draft_builder', '创建草稿生成', '就绪阶段', 'needs_confirmation', '创建草稿已生成，等待确认。', 'warning', '2026-08-23 16:30:00+08', NULL),
  ('NR-JOB-MWBV2-DEMO-001-06', 'JOB-MWBV2-DEMO-001', 'std_project_create_executor', '创建执行', '创建执行', 'waiting', '等待确认后执行。', 'pending', NULL, NULL),
  ('NR-JOB-MWBV2-DEMO-001-07', 'JOB-MWBV2-DEMO-001', 'readback_closer', '回查收口', '创建执行', 'waiting', '等待创建结果后回查。', 'pending', NULL, NULL)
ON CONFLICT (node_run_id) DO UPDATE SET
  job_id = EXCLUDED.job_id,
  node_key = EXCLUDED.node_key,
  node_name = EXCLUDED.node_name,
  phase = EXCLUDED.phase,
  status = EXCLUDED.status,
  summary = EXCLUDED.summary,
  diagnostic_level = EXCLUDED.diagnostic_level,
  started_at = EXCLUDED.started_at,
  finished_at = EXCLUDED.finished_at;

INSERT INTO mwb.launch_drafts (
  draft_id,
  job_id,
  object_type,
  project_name,
  payload_summary,
  payload_hash,
  duplicate_status,
  write_policy,
  created_at
) VALUES (
  'DRAFT-MWBV2-DEMO-001',
  'JOB-MWBV2-DEMO-001',
  'std_project',
  '245791_N_JSZC_HUNT_PAY7DROI_平台定向不限_P01_20260817',
  '{
    "route_id": "oceanengine_3_byte_mini_game",
    "game_code": "JSZC",
    "advertiser_id": "1871922175825993",
    "object_type": "std_project",
    "objective": "AD_CONVERT_TYPE_PAY",
    "deep_objective": "AD_CONVERT_TYPE_PURCHASE_ROI_7D",
    "budget": 88888,
    "bid": 488,
    "roi_goal": 0.088,
    "material_pack_id": "MD-JSZC-HUNT-HUNTING-BASELINE-001"
  }'::jsonb,
  'sha256:MWBV2-DEMO-DRAFT-001',
  'not_checked',
  'confirm_required',
  '2026-08-23 16:30:00+08'
) ON CONFLICT (draft_id) DO UPDATE SET
  job_id = EXCLUDED.job_id,
  object_type = EXCLUDED.object_type,
  project_name = EXCLUDED.project_name,
  payload_summary = EXCLUDED.payload_summary,
  payload_hash = EXCLUDED.payload_hash,
  duplicate_status = EXCLUDED.duplicate_status,
  write_policy = EXCLUDED.write_policy,
  created_at = EXCLUDED.created_at;

INSERT INTO mwb.readback_records (
  readback_id,
  job_id,
  object_type,
  object_id,
  object_name,
  readback_status,
  field_diff_summary,
  evidence_ref,
  created_at
) VALUES (
  'READBACK-MWBV2-DEMO-001',
  'JOB-MWBV2-DEMO-001',
  'std_project',
  '7675218401040220179',
  '245791_N_JSZC_HUNT_PAY7DROI_平台定向不限_P01_20260817',
  'readback_verified',
  '{"status": "matched", "checked_fields": ["object_id", "object_name", "object_type"], "summary": "字段一致摘要"}'::jsonb,
  'EV-MWBV2-DEMO-READBACK-001',
  '2026-08-23 16:30:00+08'
) ON CONFLICT (readback_id) DO UPDATE SET
  job_id = EXCLUDED.job_id,
  object_type = EXCLUDED.object_type,
  object_id = EXCLUDED.object_id,
  object_name = EXCLUDED.object_name,
  readback_status = EXCLUDED.readback_status,
  field_diff_summary = EXCLUDED.field_diff_summary,
  evidence_ref = EXCLUDED.evidence_ref,
  created_at = EXCLUDED.created_at;

INSERT INTO mwb.evidence_artifacts (
  artifact_id,
  job_id,
  artifact_type,
  title,
  summary,
  content_hash,
  storage_ref,
  source_ref,
  created_at
) VALUES
  ('EV-MWBV2-DEMO-ROUND-001', 'JOB-MWBV2-DEMO-001', 'round_summary', '成功轮次摘要', '保留一组可跑通投放创建 Workflow 的脱敏摘要。', 'sha256:MWBV2-DEMO-ROUND-001', 'postgres:mwb.evidence_artifacts/EV-MWBV2-DEMO-ROUND-001', 'seed:minimal_truth_v1', '2026-08-23 16:30:00+08'),
  ('EV-MWBV2-DEMO-ROUTE-001', 'JOB-MWBV2-DEMO-001', 'route_default_summary', 'route default 摘要', '记录优化目标、预算出价、排期、定向和 DMP 摘要。', 'sha256:MWBV2-DEMO-ROUTE-001', 'postgres:mwb.evidence_artifacts/EV-MWBV2-DEMO-ROUTE-001', 'seed:minimal_truth_v1', '2026-08-23 16:30:00+08'),
  ('EV-MWBV2-DEMO-MATERIAL-001', 'JOB-MWBV2-DEMO-001', 'material_pack_summary', '素材包摘要', '狩猎方向保底包，含三条视频素材引用。', 'sha256:MWBV2-DEMO-MATERIAL-001', 'postgres:mwb.evidence_artifacts/EV-MWBV2-DEMO-MATERIAL-001', 'seed:minimal_truth_v1', '2026-08-23 16:30:00+08'),
  ('EV-MWBV2-DEMO-READBACK-001', 'JOB-MWBV2-DEMO-001', 'readback_summary', '回查证据摘要', '只保存对象 ID、名称、状态和字段一致摘要。', 'sha256:MWBV2-DEMO-READBACK-001', 'postgres:mwb.evidence_artifacts/EV-MWBV2-DEMO-READBACK-001', 'seed:minimal_truth_v1', '2026-08-23 16:30:00+08')
ON CONFLICT (artifact_id) DO UPDATE SET
  job_id = EXCLUDED.job_id,
  artifact_type = EXCLUDED.artifact_type,
  title = EXCLUDED.title,
  summary = EXCLUDED.summary,
  content_hash = EXCLUDED.content_hash,
  storage_ref = EXCLUDED.storage_ref,
  source_ref = EXCLUDED.source_ref,
  created_at = EXCLUDED.created_at;
