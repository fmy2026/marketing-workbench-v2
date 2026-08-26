-- Target database: marketing_workbench_v2
-- Scope: OE3 landing page source/target readonly inventory states.
-- No platform API calls. Does not touch legacy databases.

BEGIN;

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
    'not_found',
    'failed'
  ));

ALTER TABLE mwb.landing_page_assets
  DROP CONSTRAINT IF EXISTS landing_page_assets_status_check;

ALTER TABLE mwb.landing_page_assets
  ADD CONSTRAINT landing_page_assets_status_check
  CHECK (status IN (
    'reference_candidate',
    'resolved',
    'active',
    'disabled',
    'not_found_in_source_readonly'
  ));

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
    'LPA-JSZC-OE3-BACKUP-003',
    'oceanengine_3_byte_mini_game',
    'JSZC',
    '7450398108389376051',
    '巨兽战场-抖音小游戏-螺丝',
    NULL,
    '',
    '1760246749825031',
    'organization_accounts',
    false,
    'reference_candidate',
    'reference_only',
    jsonb_build_object(
      'source_note', 'historical_candidate_reference_only',
      'url_known', false,
      'active_without_url_allowed', false
    ),
    now(),
    now()
  ),
  (
    'LPA-JSZC-OE3-BACKUP-004',
    'oceanengine_3_byte_mini_game',
    'JSZC',
    '7582805366296346662',
    '巨兽战场-抖小-狙击',
    NULL,
    '',
    '1760246749825031',
    'organization_accounts',
    false,
    'reference_candidate',
    'reference_only',
    jsonb_build_object(
      'source_note', 'historical_candidate_reference_only',
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
  'unknown',
  'not_checked',
  lpa.landing_page_asset_id = 'LPA-JSZC-OE3-BACKUP-001',
  jsonb_build_object(
    'site_id', lpa.site_id,
    'site_name', lpa.site_name,
    'landing_page_asset_id', lpa.landing_page_asset_id,
    'url_hash', lpa.url_hash,
    'readonly_check',
    jsonb_build_object(
      'status', 'blocked_local_official_site_list_endpoint_missing',
      'key', 'landing_page_source_target_readonly_inventory',
      'gap', 'local_official_site_list_endpoint_missing',
      'next_action', '补入本机官方橙子建站站点列表接口资料后重跑只读盘点'
    )
  ),
  now(),
  now()
FROM mwb.landing_page_assets lpa
WHERE lpa.route_id = 'oceanengine_3_byte_mini_game'
  AND lpa.game_code = 'JSZC'
  AND lpa.source_advertiser_id = '1760246749825031'
ON CONFLICT (resource_id) DO UPDATE SET
  resource_name = EXCLUDED.resource_name,
  platform_resource_id = EXCLUDED.platform_resource_id,
  source_asset_id = EXCLUDED.source_asset_id,
  required = EXCLUDED.required,
  metadata = mwb.account_resources.metadata || EXCLUDED.metadata,
  updated_at = now();

COMMIT;
