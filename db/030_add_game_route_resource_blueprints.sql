-- Target database: marketing_workbench_v2
-- Scope: separate JSZC route baseline candidates from account-specific readiness.
-- Safety: stores IDs, hashes, and redacted metadata only. No token, Cookie, full URL, raw request, or raw response.

BEGIN;

CREATE TABLE IF NOT EXISTS mwb.game_route_resource_blueprints (
  blueprint_id text PRIMARY KEY,
  route_id text NOT NULL REFERENCES mwb.platform_routes(route_id),
  game_code text NOT NULL REFERENCES mwb.games(game_code),
  resource_type text NOT NULL,
  resource_name text NOT NULL,
  source_kind text NOT NULL,
  source_asset_id text NOT NULL DEFAULT '',
  source_advertiser_id text NOT NULL DEFAULT '',
  candidate_platform_resource_id text NOT NULL DEFAULT '',
  required boolean NOT NULL DEFAULT true,
  inheritance_mode text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_usage text NOT NULL DEFAULT 'reference_only',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT game_route_resource_blueprints_resource_type_check CHECK (resource_type IN (
    'avatar', 'dmp_audience_package', 'event_asset', 'video_asset', 'product_image', 'brand_info', 'micro_app_instance', 'backup_landing_page'
  )),
  CONSTRAINT game_route_resource_blueprints_source_kind_check CHECK (source_kind IN (
    'game_asset', 'landing_page_asset', 'platform_app', 'route_default', 'none'
  )),
  CONSTRAINT game_route_resource_blueprints_inheritance_mode_check CHECK (inheritance_mode IN (
    'baseline_candidate', 'account_readonly_verify'
  )),
  CONSTRAINT game_route_resource_blueprints_metadata_shape_check CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT game_route_resource_blueprints_no_sensitive_text_check CHECK (
    metadata::text !~* '(raw_request|raw_response|raw_payload|passport_token|access_token|refresh_token|authorization|cookie|tf-api\\.3k\\.com|callback/click|landing_url)'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_game_route_resource_blueprints_scope
  ON mwb.game_route_resource_blueprints(route_id, game_code, blueprint_id);

ALTER TABLE mwb.account_resources
  ADD COLUMN IF NOT EXISTS blueprint_id text REFERENCES mwb.game_route_resource_blueprints(blueprint_id),
  ADD COLUMN IF NOT EXISTS inheritance_status text NOT NULL DEFAULT 'manual';

ALTER TABLE mwb.account_resources
  DROP CONSTRAINT IF EXISTS account_resources_inheritance_status_check;

ALTER TABLE mwb.account_resources
  ADD CONSTRAINT account_resources_inheritance_status_check CHECK (inheritance_status IN (
    'manual', 'baseline_candidate', 'target_readonly_verified', 'target_readonly_blocked', 'write_plan_pending'
  ));

CREATE UNIQUE INDEX IF NOT EXISTS uq_account_resources_blueprint_scope
  ON mwb.account_resources(advertiser_id, route_id, game_code, blueprint_id)
  WHERE blueprint_id IS NOT NULL;

INSERT INTO mwb.game_route_resource_blueprints (
  blueprint_id, route_id, game_code, resource_type, resource_name, source_kind, source_asset_id, source_advertiser_id,
  candidate_platform_resource_id, required, inheritance_mode, metadata, source_usage, created_at, updated_at
) VALUES
  (
    'BRP-JSZC-OE3-VIDEO-4IG2-3', 'oceanengine_3_byte_mini_game', 'JSZC', 'video_asset', '4iG2+4iBP-1',
    'game_asset', 'JSZC-HUNT-4IG2-3', '1760246749825031', '', true, 'baseline_candidate',
    jsonb_build_object('role', 'default_video', 'material_pack_id', 'MD-JSZC-HUNT-HUNTING-BASELINE-001'), 'reference_only', now(), now()
  ),
  (
    'BRP-JSZC-OE3-VIDEO-4GE6-14', 'oceanengine_3_byte_mini_game', 'JSZC', 'video_asset', '射击野猪+口播改MD5=荒野狙击',
    'game_asset', 'JSZC-HUNT-4GE6-14', '1760246749825031', '', true, 'baseline_candidate',
    jsonb_build_object('role', 'default_video', 'material_pack_id', 'MD-JSZC-HUNT-HUNTING-BASELINE-001'), 'reference_only', now(), now()
  ),
  (
    'BRP-JSZC-OE3-PRODUCT-IMAGE', 'oceanengine_3_byte_mini_game', 'JSZC', 'product_image', '巨兽战场产品图',
    'game_asset', 'PI-JSZC-PRODUCT-IMAGE-001', '', '', true, 'baseline_candidate',
    jsonb_build_object('selection_required', true, 'required_size', '108x108'), 'reference_only', now(), now()
  ),
  (
    'BRP-JSZC-OE3-AVATAR', 'oceanengine_3_byte_mini_game', 'JSZC', 'avatar', '巨兽战场账户头像候选',
    'game_asset', 'PI-JSZC-HUNT-BASELINE-001', '', '', true, 'account_readonly_verify',
    jsonb_build_object('brand_name', '巨兽战场'), 'reference_only', now(), now()
  ),
  (
    'BRP-JSZC-OE3-BACKUP-LANDING', 'oceanengine_3_byte_mini_game', 'JSZC', 'backup_landing_page', '巨兽战场-抖音小游戏-狙击狩猎',
    'landing_page_asset', 'LPA-JSZC-OE3-BACKUP-001', '1760246749825031', '7624750304608649243', true, 'baseline_candidate',
    jsonb_build_object('target_visibility_required', true), 'reference_only', now(), now()
  ),
  (
    'BRP-JSZC-OE3-DMP', 'oceanengine_3_byte_mini_game', 'JSZC', 'dmp_audience_package', '六个月转化排除 DMP',
    'route_default', '', '', '', true, 'account_readonly_verify',
    jsonb_build_object('selection_required', true, 'payload_field', 'audience.retargeting_tags_exclude'), 'reference_only', now(), now()
  ),
  (
    'BRP-JSZC-OE3-EVENT', 'oceanengine_3_byte_mini_game', 'JSZC', 'event_asset', '付费转化事件资产',
    'route_default', '', '', '', true, 'account_readonly_verify',
    jsonb_build_object('objective', 'AD_CONVERT_TYPE_PAY', 'deep_objective', 'AD_CONVERT_TYPE_PURCHASE_ROI_7D'), 'reference_only', now(), now()
  ),
  (
    'BRP-JSZC-OE3-BRAND', 'oceanengine_3_byte_mini_game', 'JSZC', 'brand_info', '巨兽战场品牌信息',
    'game_asset', 'PI-JSZC-HUNT-BASELINE-001', '', '', true, 'account_readonly_verify',
    jsonb_build_object('brand_name', '巨兽战场', 'industry', '游戏 / SLG'), 'reference_only', now(), now()
  ),
  (
    'BRP-JSZC-OE3-MICRO-APP', 'oceanengine_3_byte_mini_game', 'JSZC', 'micro_app_instance', '巨兽战场字节小游戏实例',
    'platform_app', 'GPA-JSZC-OE-BYTE-MINI-GAME', '', '', true, 'account_readonly_verify',
    jsonb_build_object('platform_app_ref', 'GPA-JSZC-OE-BYTE-MINI-GAME'), 'reference_only', now(), now()
  )
ON CONFLICT (blueprint_id) DO UPDATE SET
  resource_name = EXCLUDED.resource_name,
  source_kind = EXCLUDED.source_kind,
  source_asset_id = EXCLUDED.source_asset_id,
  source_advertiser_id = EXCLUDED.source_advertiser_id,
  candidate_platform_resource_id = EXCLUDED.candidate_platform_resource_id,
  required = EXCLUDED.required,
  inheritance_mode = EXCLUDED.inheritance_mode,
  metadata = EXCLUDED.metadata,
  source_usage = EXCLUDED.source_usage,
  updated_at = now();

UPDATE mwb.game_route_defaults
SET raw_defaults = jsonb_set(
  raw_defaults,
  '{material_source_account}',
  (coalesce(raw_defaults->'material_source_account', '{}'::jsonb) - 'target_advertiser_id')
    || jsonb_build_object('usage', 'shared_source_readonly_then_target_bind'),
  true
),
updated_at = now()
WHERE route_id = 'oceanengine_3_byte_mini_game'
  AND game_code = 'JSZC';

UPDATE mwb.account_resources
SET blueprint_id = CASE
  WHEN resource_type = 'video_asset' AND source_asset_id = 'JSZC-HUNT-4IG2-3' THEN 'BRP-JSZC-OE3-VIDEO-4IG2-3'
  WHEN resource_type = 'video_asset' AND source_asset_id = 'JSZC-HUNT-4GE6-14' THEN 'BRP-JSZC-OE3-VIDEO-4GE6-14'
  WHEN resource_type = 'product_image' AND source_asset_id = 'PI-JSZC-PRODUCT-IMAGE-001' THEN 'BRP-JSZC-OE3-PRODUCT-IMAGE'
  WHEN resource_type = 'avatar' AND source_asset_id = 'PI-JSZC-HUNT-BASELINE-001' THEN 'BRP-JSZC-OE3-AVATAR'
  WHEN resource_type = 'backup_landing_page' AND source_asset_id = 'LPA-JSZC-OE3-BACKUP-001' THEN 'BRP-JSZC-OE3-BACKUP-LANDING'
  WHEN resource_type = 'dmp_audience_package' THEN 'BRP-JSZC-OE3-DMP'
  WHEN resource_type = 'event_asset' THEN 'BRP-JSZC-OE3-EVENT'
  WHEN resource_type = 'brand_info' THEN 'BRP-JSZC-OE3-BRAND'
  WHEN resource_type = 'micro_app_instance' THEN 'BRP-JSZC-OE3-MICRO-APP'
  ELSE blueprint_id
END,
inheritance_status = CASE
  WHEN visibility_status IN ('visible', 'not_required')
    AND readback_status IN ('readback_verified', 'not_required') THEN 'target_readonly_verified'
  ELSE 'baseline_candidate'
END
WHERE route_id = 'oceanengine_3_byte_mini_game'
  AND game_code = 'JSZC';

COMMENT ON TABLE mwb.game_route_resource_blueprints IS
  'Game and route baseline resource candidates. A blueprint never implies target-account visibility or write authorization.';

COMMENT ON COLUMN mwb.account_resources.blueprint_id IS
  'Optional baseline blueprint that generated this account-specific resource candidate.';

COMMENT ON COLUMN mwb.account_resources.inheritance_status IS
  'Candidate inheritance lifecycle, separate from target-account visibility and readback truth.';

COMMIT;
