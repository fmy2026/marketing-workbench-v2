-- Target database: marketing_workbench_v2
-- Scope: enable the JSZC event_asset single-resource API-create contract for advertiser 1871922434025472.
-- Safety: stores only a redacted template reference/hash, endpoint path, and field manifest; no token, full URL,
-- raw payload, or raw response is persisted.

BEGIN;

UPDATE mwb.game_route_resource_blueprints
SET metadata = metadata || jsonb_build_object(
  'event_asset_provision', jsonb_build_object(
    'version', '2026-08-30.event-asset-api-create-v2',
    'template_status', 'ready',
    'template_ref', 'jszc:event_asset:mini_program:1871922434025472:20260830',
    'template_hash', 'sha256:b54b0162ef187671e7718342a1296b10d27aea9a448950bbc51bf3eb7ba48486',
    'asset_type', 'MINI_PROGRAME',
    'platform_app_ref', 'GPA-JSZC-OE-BYTE-MINI-GAME',
    'objective', 'AD_CONVERT_TYPE_PAY',
    'deep_objective', 'AD_CONVERT_TYPE_PURCHASE_ROI_7D',
    'deep_bid_type', 'PER_AND_SEVEN_PAY_ROI',
    'official_create_contract', jsonb_build_object(
      'status', 'verified',
      'source_ref', 'official:oceanengine:2.0:19-asset:event_manager/assets/create:120-180',
      'secondary_source_ref', 'official:oceanengine:2.0-copy:17-asset:event_manager/assets/create:3283-3661',
      'content_hash', 'sha256:f80b0648c8e79eb279d2f1e35e24dca0fa36e7e84e33d34f9c45f22fc16ad9d8',
      'method', 'POST',
      'endpoint', '/open_api/2/event_manager/assets/create/',
      'request_field_manifest', jsonb_build_array(
        'advertiser_id',
        'asset_type',
        'mini_program_asset.mini_program_id',
        'mini_program_asset.mini_program_name',
        'mini_program_asset.instance_id',
        'mini_program_asset.mini_program_type'
      ),
      'payload_persisted', false,
      'response_persisted', false
    )
  ),
  'event_asset_provision_status', 'ready_for_single_api_create'
),
updated_at = now()
WHERE blueprint_id = 'BRP-JSZC-OE3-EVENT'
  AND route_id = 'oceanengine_3_byte_mini_game'
  AND game_code = 'JSZC';

COMMENT ON TABLE mwb.game_route_resource_blueprints IS
  'Game-route baseline resource candidates. JSZC event_asset API create is available only through the plan-bound single-resource executor after local contract/template verification.';

COMMIT;
