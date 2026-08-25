-- Target database: marketing_workbench_v2
-- Scope: P04 pre-create readiness support only.
-- Adds route-level payload defaults/field mapping and per-video resource lookup support.
-- Does not touch legacy databases or call platforms.

CREATE UNIQUE INDEX IF NOT EXISTS uq_account_resources_source_asset
  ON mwb.account_resources(advertiser_id, route_id, game_code, resource_type, source_asset_id);

UPDATE mwb.game_route_defaults
SET raw_defaults = raw_defaults
  || jsonb_build_object(
    'payload_defaults',
    jsonb_build_object(
      'project',
      jsonb_build_object(
        'ad_type', 'ALL',
        'landing_type', 'MICRO_GAME',
        'marketing_goal', 'VIDEO_AND_IMAGE',
        'native_type', 'AWEME',
        'delivery_mode', 'PROCEDURAL'
      ),
      'strategy',
      jsonb_build_object(
        'delivery_type', 'NORMAL',
        'delivery_medium', 'BYTE_GAME',
        'micro_promotion_type', 'BYTE_GAME',
        'bid_type', 'CUSTOM',
        'budget_mode', 'BUDGET_MODE_DAY',
        'pricing', 'PRICING_OCPM',
        'audience_type', 'CUSTOM'
      ),
      'targeting',
      jsonb_build_object(
        'district', 'NONE',
        'gender', 'GENDER_UNLIMITED',
        'age', '[]'::jsonb,
        'converted_time_duration', 'SIX_MONTH',
        'hide_if_converted', 'NO_EXCLUDE',
        'interest_action_mode', 'UNLIMITED'
      ),
      'product',
      jsonb_build_object(
        'selling_points', '["策略开荒", "巨兽养成", "联盟对战"]'::jsonb,
        'call_to_action_buttons', '["立即试玩"]'::jsonb,
        'anchor_related_type', 'OFF'
      ),
      'schedule',
      jsonb_build_object(
        'schedule_type', coalesce(schedule->>'schedule_type', 'SCHEDULE_FROM_NOW')
      )
    ),
    'contract_mapping',
    jsonb_build_object(
      'mini_game_instance_create_field', 'instance_id',
      'optimized_goal_query_instance_field', 'micro_app_instance_id',
      'optimized_goal_query_app_field', 'mini_program_id',
      'source', 'official_docs:std_project_create+optimized_goal_get',
      'verified_for_route', 'oceanengine_3_byte_mini_game'
    ),
    'material_source_account',
    jsonb_build_object(
      'account_role', 'material_account_or_super_admin',
      'advertiser_id', '1760246749825031',
      'target_advertiser_id', '1871922175825993',
      'usage', 'video_material_source_readonly_then_push_or_share_to_target'
    )
  ),
  updated_at = now()
WHERE route_id = 'oceanengine_3_byte_mini_game'
  AND game_code = 'JSZC';

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
)
SELECT
  'AR-1871922175825993-JSZC-VIDEO-4GE6-14',
  '1871922175825993',
  'oceanengine_3_byte_mini_game',
  'JSZC',
  'video_asset',
  ga.asset_name,
  ga.asset_id,
  ga.asset_id,
  'needs_confirmation',
  'not_checked',
  true,
  jsonb_build_object(
    'role', 'default_video',
    'readonly_check',
    jsonb_build_object(
      'status', 'not_checked',
      'key', 'platform_video_material_pair',
      'gap', 'video_material_pair_readback_required',
      'next_action', '逐条确认视频和封面账户侧可用性',
      'source_asset_id', ga.asset_id,
      'video_id_present', ga.metadata ? 'video_id',
      'video_cover_id_present', ga.metadata ? 'video_cover_id'
    )
  ),
  now(),
  now()
FROM mwb.game_assets ga
WHERE ga.asset_id = 'JSZC-HUNT-4GE6-14'
ON CONFLICT (resource_id) DO UPDATE SET
  resource_name = EXCLUDED.resource_name,
  platform_resource_id = EXCLUDED.platform_resource_id,
  source_asset_id = EXCLUDED.source_asset_id,
  required = true,
  metadata = mwb.account_resources.metadata || jsonb_build_object(
    'role', 'default_video',
    'readonly_check',
    coalesce(mwb.account_resources.metadata->'readonly_check', EXCLUDED.metadata->'readonly_check')
  ),
  updated_at = now();
