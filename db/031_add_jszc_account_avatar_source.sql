-- Target database: marketing_workbench_v2
-- Scope: register the JSZC 300x300 account avatar source separately from product_image.
-- Safety: metadata stores only asset identity, hashes, format and dimensions.

BEGIN;

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
) VALUES (
  'AI-JSZC-ACCOUNT-AVATAR-300-001',
  'JSZC',
  'avatar_image',
  '巨兽战场账户头像 300x300',
  '/Users/hys/ProjectAssets/marketing-workbench-v2/JSZC/account-avatar-300x300.png',
  '270ccf2dc35ab4175c6f37305bd4b4dbbc5720606d104c0e665beae1d12ed087',
  'active',
  jsonb_build_object(
    'format', 'png',
    'width', 300,
    'height', 300,
    'derived_from_asset_id', 'PI-JSZC-PRODUCT-IMAGE-001',
    'source_asset_hash', '5c9a0395bd05204575345178ec23d0df8465dd364faff5b749060b81db7245b8'
  ),
  now(),
  now()
)
ON CONFLICT (asset_id) DO UPDATE SET
  asset_name = EXCLUDED.asset_name,
  asset_ref = EXCLUDED.asset_ref,
  asset_hash = EXCLUDED.asset_hash,
  visibility_status = EXCLUDED.visibility_status,
  metadata = EXCLUDED.metadata,
  updated_at = now();

UPDATE mwb.game_route_resource_blueprints
SET source_kind = 'game_asset',
    source_asset_id = 'AI-JSZC-ACCOUNT-AVATAR-300-001',
    source_advertiser_id = '',
    candidate_platform_resource_id = '',
    inheritance_mode = 'baseline_candidate',
    metadata = jsonb_build_object(
      'brand_name', '巨兽战场',
      'source_role', 'account_avatar',
      'requires_target_account_submit', true
    ),
    updated_at = now()
WHERE blueprint_id = 'BRP-JSZC-OE3-AVATAR';

UPDATE mwb.account_resources
SET source_asset_id = 'AI-JSZC-ACCOUNT-AVATAR-300-001',
    metadata = metadata || jsonb_build_object(
      'baseline_blueprint', coalesce(metadata->'baseline_blueprint', '{}'::jsonb) || jsonb_build_object(
        'blueprint_id', 'BRP-JSZC-OE3-AVATAR',
        'source_kind', 'game_asset',
        'source_asset_id', 'AI-JSZC-ACCOUNT-AVATAR-300-001',
        'source_advertiser_id', '',
        'inheritance_mode', 'baseline_candidate'
      )
    ),
    updated_at = now()
WHERE route_id = 'oceanengine_3_byte_mini_game'
  AND game_code = 'JSZC'
  AND resource_type = 'avatar';

COMMIT;
