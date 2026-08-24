-- Target database: marketing_workbench_v2
-- Scope: seed refined app identity, account resources, and source usage tags.

INSERT INTO mwb.game_platform_apps (
  id,
  game_code,
  platform,
  app_type,
  app_id,
  app_name,
  status,
  metadata,
  created_at,
  updated_at
) VALUES (
  'GPA-JSZC-OE-BYTE-MINI-GAME',
  'JSZC',
  'oceanengine',
  'byte_mini_game',
  'tte95a9fe77665844607',
  '巨兽战场',
  'active',
  '{"read_key": "game_code + platform + app_type", "replaces_games_app_id_for_runtime_reads": true}'::jsonb,
  '2026-08-23 17:50:00+08',
  '2026-08-23 17:50:00+08'
) ON CONFLICT (id) DO UPDATE SET
  game_code = EXCLUDED.game_code,
  platform = EXCLUDED.platform,
  app_type = EXCLUDED.app_type,
  app_id = EXCLUDED.app_id,
  app_name = EXCLUDED.app_name,
  status = EXCLUDED.status,
  metadata = EXCLUDED.metadata,
  updated_at = EXCLUDED.updated_at;

INSERT INTO mwb.account_resources (
  resource_id,
  advertiser_id,
  route_id,
  game_code,
  resource_type,
  resource_name,
  platform_resource_id,
  source_asset_id,
  visibility_status,
  readback_status,
  required,
  metadata,
  created_at,
  updated_at
) VALUES
  (
    'AR-1871922175825993-JSZC-AVATAR',
    '1871922175825993',
    'oceanengine_3_byte_mini_game',
    'JSZC',
    'avatar',
    '巨兽战场账户头像',
    NULL,
    'PI-JSZC-HUNT-BASELINE-001',
    'needs_confirmation',
    'needs_confirmation',
    true,
    '{"diagnostic_hint": "头像待确认"}'::jsonb,
    '2026-08-23 17:50:00+08',
    '2026-08-23 17:50:00+08'
  ),
  (
    'AR-1871922175825993-JSZC-DMP',
    '1871922175825993',
    'oceanengine_3_byte_mini_game',
    'JSZC',
    'dmp_audience_package',
    '六个月转化排除 DMP',
    'DMP-JSZC-HUNT-CONVERTED-EXCLUDE-BASELINE-001',
    NULL,
    'visible',
    'readback_verified',
    true,
    '{"exclude_count": 10, "summary": "六个月转化排除"}'::jsonb,
    '2026-08-23 17:50:00+08',
    '2026-08-23 17:50:00+08'
  ),
  (
    'AR-1871922175825993-JSZC-EVENT',
    '1871922175825993',
    'oceanengine_3_byte_mini_game',
    'JSZC',
    'event_asset',
    '付费转化事件资产',
    NULL,
    NULL,
    'pending',
    'not_checked',
    true,
    '{"objective": "AD_CONVERT_TYPE_PAY", "deep_objective": "AD_CONVERT_TYPE_PURCHASE_ROI_7D"}'::jsonb,
    '2026-08-23 17:50:00+08',
    '2026-08-23 17:50:00+08'
  ),
  (
    'AR-1871922175825993-JSZC-VIDEO-4IG2-3',
    '1871922175825993',
    'oceanengine_3_byte_mini_game',
    'JSZC',
    'video_asset',
    '4iG2+4iBP-1',
    'JSZC-HUNT-4IG2-3',
    'JSZC-HUNT-4IG2-3',
    'visible',
    'readback_verified',
    true,
    '{"duration_seconds": 108.7, "role": "default_video"}'::jsonb,
    '2026-08-23 17:50:00+08',
    '2026-08-23 17:50:00+08'
  ),
  (
    'AR-1871922175825993-JSZC-PRODUCT-IMAGE',
    '1871922175825993',
    'oceanengine_3_byte_mini_game',
    'JSZC',
    'product_image',
    '巨兽战场产品图',
    'PI-JSZC-HUNT-LONE-WOLF-108',
    'PI-JSZC-HUNT-BASELINE-001',
    'needs_confirmation',
    'needs_confirmation',
    true,
    '{"required_size": "108x108"}'::jsonb,
    '2026-08-23 17:50:00+08',
    '2026-08-23 17:50:00+08'
  ),
  (
    'AR-1871922175825993-JSZC-BRAND',
    '1871922175825993',
    'oceanengine_3_byte_mini_game',
    'JSZC',
    'brand_info',
    '巨兽战场品牌信息',
    NULL,
    'PI-JSZC-HUNT-BASELINE-001',
    'visible',
    'readback_verified',
    true,
    '{"brand_name": "巨兽战场", "category": "小游戏"}'::jsonb,
    '2026-08-23 17:50:00+08',
    '2026-08-23 17:50:00+08'
  ),
  (
    'AR-1871922175825993-JSZC-MICRO-APP',
    '1871922175825993',
    'oceanengine_3_byte_mini_game',
    'JSZC',
    'micro_app_instance',
    '巨兽战场字节小游戏',
    (SELECT app_id FROM mwb.game_platform_apps WHERE id = 'GPA-JSZC-OE-BYTE-MINI-GAME'),
    NULL,
    'visible',
    'readback_verified',
    true,
    '{"lookup": "game_platform_apps:GPA-JSZC-OE-BYTE-MINI-GAME"}'::jsonb,
    '2026-08-23 17:50:00+08',
    '2026-08-23 17:50:00+08'
  )
ON CONFLICT (resource_id) DO UPDATE SET
  advertiser_id = EXCLUDED.advertiser_id,
  route_id = EXCLUDED.route_id,
  game_code = EXCLUDED.game_code,
  resource_type = EXCLUDED.resource_type,
  resource_name = EXCLUDED.resource_name,
  platform_resource_id = EXCLUDED.platform_resource_id,
  source_asset_id = EXCLUDED.source_asset_id,
  visibility_status = EXCLUDED.visibility_status,
  readback_status = EXCLUDED.readback_status,
  required = EXCLUDED.required,
  metadata = EXCLUDED.metadata,
  updated_at = EXCLUDED.updated_at;

UPDATE mwb.game_assets
SET source_usage = 'seed_source'
WHERE source_usage <> 'seed_source';

UPDATE mwb.material_packs
SET source_usage = 'seed_source'
WHERE source_usage <> 'seed_source';

UPDATE mwb.material_pack_items
SET source_usage = 'seed_source'
WHERE source_usage <> 'seed_source';

UPDATE mwb.game_route_defaults
SET source_usage = 'seed_source'
WHERE source_usage <> 'seed_source';

UPDATE mwb.launch_jobs
SET source_usage = 'seed_source'
WHERE source_usage <> 'seed_source';

UPDATE mwb.evidence_artifacts
SET source_usage = 'seed_source'
WHERE source_usage <> 'seed_source';

INSERT INTO mwb.evidence_artifacts (
  artifact_id,
  job_id,
  artifact_type,
  title,
  summary,
  content_hash,
  storage_ref,
  source_ref,
  source_usage,
  created_at
) VALUES (
  'EV-MWBV2-LEGACY-REFERENCE-001',
  NULL,
  'legacy_reference_summary',
  '旧项目参考摘要',
  '旧项目和历史资料仅用于字段经验参考，不作为 v2 运行时真值。',
  'sha256:MWBV2-LEGACY-REFERENCE-001',
  'reference:legacy_project_summary',
  'legacy_project_reference_only_no_runtime_dependency',
  'reference_only',
  '2026-08-23 17:50:00+08'
) ON CONFLICT (artifact_id) DO UPDATE SET
  job_id = EXCLUDED.job_id,
  artifact_type = EXCLUDED.artifact_type,
  title = EXCLUDED.title,
  summary = EXCLUDED.summary,
  content_hash = EXCLUDED.content_hash,
  storage_ref = EXCLUDED.storage_ref,
  source_ref = EXCLUDED.source_ref,
  source_usage = EXCLUDED.source_usage,
  created_at = EXCLUDED.created_at;
