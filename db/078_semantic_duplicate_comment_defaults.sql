-- Target database: marketing_workbench_v2
-- Scope: configure JSZC's standard-project semantic duplicate contract and
--        enable comment management through the official create-field value.
-- Safety: route default metadata only; no platform call, dynamic account fact,
--         Case, Job, Plan, action, object, request, response, token, or URL.

BEGIN;

UPDATE mwb.game_route_defaults
SET raw_defaults = jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
          jsonb_set(
            jsonb_set(
              raw_defaults,
              '{payload_defaults,strategy,is_comment_disable}',
              '"ON"'::jsonb,
              true
            ),
            '{official_create_field_contract,success_profile,version}',
            '"2026-09-09.jszc-byte-game-comment-management-enabled-v3"'::jsonb,
            true
          ),
          '{official_create_field_contract,success_profile,source}',
          '"jszc_incremental_fallback_plus_official_comment_management_contract"'::jsonb,
          true
        ),
        '{official_create_field_contract,success_profile,fixture_hash}',
        '"sha256:9f10bcd285990f9f56962ae9084630e26917e903f9289d3d8923af0cd93441ad"'::jsonb,
        true
      ),
      '{official_create_field_contract,success_profile,golden_field_shape_hash}',
      '"sha256:e2fd4ac63467eeda4b72064ea751a23bedf71b927e3c4e462ae5a7e4cbd1a844"'::jsonb,
      true
    ),
      '{duplicate_semantic_contract}',
      jsonb_build_object(
        'version', '2026-09-09.oe3-std-project-semantic-duplicate-v1',
        'source', 'postgres:mwb.game_route_defaults.raw_defaults.duplicate_semantic_contract',
        'status_first', 'ALL_EXCEPT_DELETE',
        'field_paths', jsonb_build_array(
          'asset_id',
          'landing_type',
          'native_type',
          'delivery_medium',
          'marketing_goal',
          'external_action',
          'deep_external_action',
          'deep_bid_type',
          'bid_type'
        ),
        'comparison', 'all_exact_normalized_values;name_and_instance_id_excluded'
      ),
      true
    ),
    updated_at = now()
WHERE route_id = 'oceanengine_3_byte_mini_game'
  AND game_code = 'JSZC';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM mwb.game_route_defaults
    WHERE route_id = 'oceanengine_3_byte_mini_game'
      AND game_code = 'JSZC'
      AND raw_defaults #>> '{payload_defaults,strategy,is_comment_disable}' = 'ON'
      AND raw_defaults #>> '{official_create_field_contract,success_profile,version}' = '2026-09-09.jszc-byte-game-comment-management-enabled-v3'
      AND raw_defaults #>> '{official_create_field_contract,success_profile,fixture_hash}' = 'sha256:9f10bcd285990f9f56962ae9084630e26917e903f9289d3d8923af0cd93441ad'
      AND raw_defaults #>> '{official_create_field_contract,success_profile,golden_field_shape_hash}' = 'sha256:e2fd4ac63467eeda4b72064ea751a23bedf71b927e3c4e462ae5a7e4cbd1a844'
      AND raw_defaults #>> '{duplicate_semantic_contract,status_first}' = 'ALL_EXCEPT_DELETE'
      AND raw_defaults #> '{duplicate_semantic_contract,field_paths}' = jsonb_build_array(
        'asset_id',
        'landing_type',
        'native_type',
        'delivery_medium',
        'marketing_goal',
        'external_action',
        'deep_external_action',
        'deep_bid_type',
        'bid_type'
      )
  ) THEN
    RAISE EXCEPTION '078 JSZC semantic duplicate or comment management defaults were not persisted';
  END IF;
END $$;

COMMIT;
