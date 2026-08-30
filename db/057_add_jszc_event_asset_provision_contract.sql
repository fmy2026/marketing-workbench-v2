-- Target database: marketing_workbench_v2
-- Scope: declare the JSZC event-asset provision contract shape without enabling any platform write.
-- Safety: no endpoint, payload, URL, credential, raw request, or raw response is stored as verified truth.

BEGIN;

UPDATE mwb.game_route_resource_blueprints
SET metadata = metadata || jsonb_build_object(
  'event_asset_provision', jsonb_build_object(
    'version', '2026-08-30.event-asset-provision-v1',
    'template_status', 'missing',
    'template_ref', '',
    'template_hash', '',
    'asset_type', 'MINI_PROGRAME',
    'platform_app_ref', 'GPA-JSZC-OE-BYTE-MINI-GAME',
    'objective', coalesce(metadata->>'objective', 'AD_CONVERT_TYPE_PAY'),
    'deep_objective', coalesce(metadata->>'deep_objective', 'AD_CONVERT_TYPE_PURCHASE_ROI_7D'),
    'deep_bid_type', 'PER_AND_SEVEN_PAY_ROI',
    'official_create_contract', jsonb_build_object(
      'status', 'unverified',
      'source_ref', '',
      'content_hash', '',
      'method', '',
      'endpoint', '',
      'request_field_manifest', '[]'::jsonb
    )
  ),
  'event_asset_provision_status', 'blocked_pending_official_create_contract'
),
updated_at = now()
WHERE blueprint_id = 'BRP-JSZC-OE3-EVENT'
  AND route_id = 'oceanengine_3_byte_mini_game'
  AND game_code = 'JSZC';

COMMENT ON TABLE mwb.game_route_resource_blueprints IS
  'Game-route baseline resource candidates. Event-asset create remains disabled until an official create contract and template are verified.';

COMMIT;
