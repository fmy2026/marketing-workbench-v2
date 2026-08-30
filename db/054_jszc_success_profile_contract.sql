-- Target database: marketing_workbench_v2
-- Scope: Persist the verified JSZC/BYTE_GAME std_project success profile for the formal Node 5 path.
-- Safety: route contract metadata only; no platform call, credential change, URL, raw request, raw response, or raw payload storage.

BEGIN;

DO $$
BEGIN
  IF (
    SELECT count(*)
    FROM mwb.game_route_defaults
    WHERE route_id = 'oceanengine_3_byte_mini_game'
      AND game_code = 'JSZC'
  ) <> 1 THEN
    RAISE EXCEPTION 'expected exactly one JSZC route defaults row';
  END IF;
END $$;

UPDATE mwb.game_route_defaults
SET raw_defaults = jsonb_set(
      raw_defaults,
      '{official_create_field_contract}',
      COALESCE(raw_defaults -> 'official_create_field_contract', '{}'::jsonb)
        || jsonb_build_object(
          'version', '2026-08-30.oe3-jszc-success-profile-v1',
          'source', 'official_3_0_std_project_create_contract_plus_verified_success_profile',
          'success_profile', jsonb_build_object(
            'version', '2026-08-30.jszc-byte-game-success-profile-v1',
            'source', 'verified_jszc_oneoff_created_and_three_readbacks',
            'fixture_hash', 'sha256:ef55f4f1c8f0955a5102ffb2912c432058328fec207b4152c2a90182630eff1b',
            'golden_field_shape_hash', 'sha256:9203ddf077d05b51958e851dad86894f75fdf09884ffc99690ad459ce5dd1064',
            'expected_ledger_path_count', 82,
            'material_counts', jsonb_build_object(
              'video_material_list', 2,
              'title_material_list', 3,
              'image_material_list', 0,
              'product_image_ids', 1,
              'external_url_material_list', 1,
              'dmp_exclusions', 10
            ),
            'raw_payload_stored', false
          ),
          'nested_rules',
            COALESCE(raw_defaults #> '{official_create_field_contract,nested_rules}', '{}'::jsonb)
            || jsonb_build_object(
              'version', '2026-08-30.oe3-std-project-create-nested-fields-v4',
              'source', 'postgres:mwb.game_route_defaults.raw_defaults.official_create_field_contract.nested_rules',
              'scope', 'jszc_byte_game_verified_success_profile',
              'groups',
                COALESCE(raw_defaults #> '{official_create_field_contract,nested_rules,groups}', '{}'::jsonb)
                || jsonb_build_object(
                  'audience',
                    COALESCE(raw_defaults #> '{official_create_field_contract,nested_rules,groups,audience}', '{}'::jsonb)
                    || jsonb_build_object(
                      'source', 'route_defaults+dmp_readonly+verified_success_profile',
                      'filter_event_policy', 'omit',
                      'converted_time_duration_policy', 'omit_when_no_exclude',
                      'applies_when', 'hide_if_converted=NO_EXCLUDE',
                      'expected_filter_event_present', false,
                      'expected_converted_time_duration_present', false,
                      'rule', 'no_exclude_omits_filter_event_and_converted_time_duration;dmp_ids_integer_array'
                    ),
                  'project_materials.external_url_material_list', jsonb_build_object(
                    'source', 'controlled_backup_landing_page',
                    'send_policy', 'send',
                    'required_count', 1,
                    'rule', 'exactly_one_active_https_target_visible_readback_verified_hash_matched_backup_page'
                  )
                )
            )
        ),
      true
    ),
    updated_at = now()
WHERE route_id = 'oceanengine_3_byte_mini_game'
  AND game_code = 'JSZC';

COMMIT;
