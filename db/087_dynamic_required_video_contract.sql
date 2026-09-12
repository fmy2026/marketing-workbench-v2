-- Target database: marketing_workbench_v2
-- Scope: remove duplicate JSZC required-video cardinality from route defaults.
-- Safety: route-contract metadata only; the active material pack owns the video set.

BEGIN;

UPDATE mwb.game_route_defaults
SET raw_defaults = jsonb_set(
      raw_defaults #- '{official_create_field_contract,success_profile,material_counts,video_material_list}',
      '{official_create_field_contract,success_profile,golden_field_shape_hash}',
      '"sha256:3ca0165414980e6fc9a7f353e4d766024a560e6d6bc855821bda8b3a1060fe11"'::jsonb,
      true
    ),
    updated_at = now()
WHERE route_id = 'oceanengine_3_byte_mini_game'
  AND game_code = 'JSZC';

UPDATE mwb.game_route_defaults
SET raw_defaults = jsonb_set(
      raw_defaults,
      '{official_create_field_contract,success_profile,expected_ledger_path_count}',
      '90'::jsonb,
      true
    ),
    updated_at = now()
WHERE route_id = 'oceanengine_3_byte_mini_game'
  AND game_code = 'JSZC';

COMMIT;
