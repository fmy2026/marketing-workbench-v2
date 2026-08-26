-- Target database: marketing_workbench_v2
-- Scope: OE3 backup landing page asset resolution.
-- No platform API calls. Does not touch legacy databases.

BEGIN;

ALTER TABLE mwb.account_resources
  DROP CONSTRAINT IF EXISTS account_resources_resource_type_check;

ALTER TABLE mwb.account_resources
  ADD CONSTRAINT account_resources_resource_type_check
  CHECK (resource_type IN (
    'avatar',
    'dmp_audience_package',
    'event_asset',
    'video_asset',
    'product_image',
    'brand_info',
    'micro_app_instance',
    'backup_landing_page'
  ));

ALTER TABLE mwb.account_resources
  DROP CONSTRAINT IF EXISTS account_resources_visibility_status_check;

ALTER TABLE mwb.account_resources
  ADD CONSTRAINT account_resources_visibility_status_check
  CHECK (visibility_status IN (
    'visible',
    'not_visible',
    'pending',
    'needs_confirmation',
    'not_required',
    'unknown'
  ));

ALTER TABLE mwb.account_resources
  DROP CONSTRAINT IF EXISTS account_resources_readback_status_check;

ALTER TABLE mwb.account_resources
  ADD CONSTRAINT account_resources_readback_status_check
  CHECK (readback_status IN (
    'readback_verified',
    'pending',
    'needs_confirmation',
    'not_checked',
    'not_required',
    'failed'
  ));

CREATE TABLE IF NOT EXISTS mwb.landing_page_assets (
  landing_page_asset_id text PRIMARY KEY,
  route_id text NOT NULL REFERENCES mwb.platform_routes(route_id),
  game_code text NOT NULL REFERENCES mwb.games(game_code),
  site_id text NOT NULL,
  site_name text NOT NULL,
  landing_url text,
  url_hash text NOT NULL DEFAULT '',
  source_advertiser_id text,
  share_scope text NOT NULL DEFAULT 'organization_accounts',
  is_default boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'reference_candidate',
  source_usage text NOT NULL DEFAULT 'reference_only',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT landing_page_assets_site_id_digits CHECK (site_id ~ '^[0-9]+$'),
  CONSTRAINT landing_page_assets_source_advertiser_digits CHECK (source_advertiser_id IS NULL OR source_advertiser_id ~ '^[0-9]+$'),
  CONSTRAINT landing_page_assets_share_scope_check CHECK (share_scope IN ('organization_accounts', 'advertiser_account', 'unknown')),
  CONSTRAINT landing_page_assets_status_check CHECK (status IN ('reference_candidate', 'resolved', 'active', 'disabled')),
  CONSTRAINT landing_page_assets_source_usage_check CHECK (source_usage IN ('runtime_truth', 'reference_only', 'seed_source', 'private_runtime', 'test_run')),
  CONSTRAINT landing_page_assets_url_https_check CHECK (landing_url IS NULL OR landing_url ~ '^https://'),
  CONSTRAINT landing_page_assets_url_hash_shape CHECK (
    (landing_url IS NULL AND url_hash = '')
    OR
    (landing_url IS NOT NULL AND url_hash ~ '^[0-9a-f]{64}$')
  ),
  CONSTRAINT landing_page_assets_no_url_in_metadata CHECK (metadata::text !~* 'https?://')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_landing_page_assets_scope_site
  ON mwb.landing_page_assets(route_id, game_code, site_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_landing_page_assets_active_default
  ON mwb.landing_page_assets(route_id, game_code)
  WHERE is_default = true
    AND status = 'active';

CREATE INDEX IF NOT EXISTS idx_landing_page_assets_lookup
  ON mwb.landing_page_assets(route_id, game_code, is_default, status);

COMMENT ON TABLE mwb.landing_page_assets IS
  'Backup landing page assets for OE3 std_project payload. landing_url is controlled; public summaries expose only url_hash and status.';

INSERT INTO mwb.landing_page_assets (
  landing_page_asset_id,
  route_id,
  game_code,
  site_id,
  site_name,
  landing_url,
  url_hash,
  source_advertiser_id,
  share_scope,
  is_default,
  status,
  source_usage,
  metadata,
  created_at,
  updated_at
) VALUES
  (
    'LPA-JSZC-OE3-BACKUP-001',
    'oceanengine_3_byte_mini_game',
    'JSZC',
    '7624750304608649243',
    '巨兽战场-抖音小游戏-狙击狩猎',
    NULL,
    '',
    '1760246749825031',
    'organization_accounts',
    true,
    'reference_candidate',
    'reference_only',
    jsonb_build_object(
      'source_note', 'p01_historical_default_reference_only',
      'url_known', false,
      'active_without_url_allowed', false
    ),
    now(),
    now()
  ),
  (
    'LPA-JSZC-OE3-BACKUP-002',
    'oceanengine_3_byte_mini_game',
    'JSZC',
    '7450371049210462218',
    '巨兽战场-抖音小游戏-吃肉',
    NULL,
    '',
    '1760246749825031',
    'organization_accounts',
    false,
    'reference_candidate',
    'reference_only',
    jsonb_build_object(
      'source_note', 'screenshot_candidate_reference_only',
      'url_known', false,
      'active_without_url_allowed', false
    ),
    now(),
    now()
  )
ON CONFLICT (landing_page_asset_id) DO UPDATE SET
  route_id = EXCLUDED.route_id,
  game_code = EXCLUDED.game_code,
  site_id = EXCLUDED.site_id,
  site_name = EXCLUDED.site_name,
  source_advertiser_id = EXCLUDED.source_advertiser_id,
  share_scope = EXCLUDED.share_scope,
  is_default = EXCLUDED.is_default,
  status = CASE
    WHEN mwb.landing_page_assets.status = 'active' THEN mwb.landing_page_assets.status
    ELSE EXCLUDED.status
  END,
  source_usage = CASE
    WHEN mwb.landing_page_assets.source_usage = 'runtime_truth' THEN mwb.landing_page_assets.source_usage
    ELSE EXCLUDED.source_usage
  END,
  metadata = mwb.landing_page_assets.metadata || EXCLUDED.metadata,
  updated_at = now();

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
  'AR-1871922175825993-JSZC-BACKUP-LANDING-PAGE-' || lpa.site_id,
  '1871922175825993',
  lpa.route_id,
  lpa.game_code,
  'backup_landing_page',
  lpa.site_name,
  lpa.site_id,
  lpa.landing_page_asset_id,
  'needs_confirmation',
  'not_checked',
  true,
  jsonb_build_object(
    'site_id', lpa.site_id,
    'site_name', lpa.site_name,
    'landing_page_asset_id', lpa.landing_page_asset_id,
    'url_hash', lpa.url_hash,
    'readonly_check',
    jsonb_build_object(
      'status', 'blocked',
      'key', 'backup_landing_page_readiness',
      'gap', 'backup_landing_page_url_missing',
      'next_action', '只读解析真实 HTTPS URL 并验证目标账户可见性'
    )
  ),
  now(),
  now()
FROM mwb.landing_page_assets lpa
WHERE lpa.landing_page_asset_id = 'LPA-JSZC-OE3-BACKUP-001'
ON CONFLICT (resource_id) DO UPDATE SET
  resource_name = EXCLUDED.resource_name,
  platform_resource_id = EXCLUDED.platform_resource_id,
  source_asset_id = EXCLUDED.source_asset_id,
  required = true,
  metadata = mwb.account_resources.metadata || EXCLUDED.metadata,
  updated_at = now();

COMMIT;

