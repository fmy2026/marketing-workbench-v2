-- Target database: marketing_workbench_v2
-- Scope: JSZC OE3 std_project/create field closure for optional nested fields and static switches.
-- Safety: route default metadata update only; no platform calls, token, URL, raw request, raw response, raw payload, table, view, report, or dashboard creation.

BEGIN;

UPDATE mwb.game_route_defaults
SET raw_defaults =
  jsonb_set(
    jsonb_set(
      jsonb_set(
        raw_defaults,
        '{payload_defaults,strategy}',
        COALESCE(raw_defaults #> '{payload_defaults,strategy}', '{}'::jsonb) ||
          jsonb_build_object(
            'layer_roi_switch', 'OFF',
            'aigc_dynamic_creative_switch', 'OFF',
            'is_comment_disable', 'OFF'
          ),
        true
      ),
      '{payload_defaults,track_url_setting}',
      COALESCE(raw_defaults #> '{payload_defaults,track_url_setting}', '{}'::jsonb) ||
        jsonb_build_object(
          'send_type', 'SERVER_SEND'
        ),
      true
    ),
    '{official_create_field_contract,nested_rules}',
    COALESCE(raw_defaults #> '{official_create_field_contract,nested_rules}', '{}'::jsonb) ||
      jsonb_build_object(
        'version', '2026-08-29.oe3-std-project-create-nested-fields-v2',
        'source', 'postgres:mwb.game_route_defaults.raw_defaults.official_create_field_contract.nested_rules',
        'scope', 'current_jszc_oceanengine_3_byte_mini_game_sent_and_omitted_nested_paths',
        'official_reference', 'open.oceanengine.com-3.0-waibugei/巨量营销智擎版/创建标准项目.md:142',
        'groups',
          COALESCE(raw_defaults #> '{official_create_field_contract,nested_rules,groups}', '{}'::jsonb) ||
          jsonb_build_object(
            'project_materials.image_material_list', jsonb_build_object(
              'reference', 'open.oceanengine.com-3.0-waibugei/巨量营销智擎版/创建标准项目.md:149',
              'source', 'route_nested_contract',
              'send_policy', 'send_empty_array',
              'rule', 'current_jszc_video_first_route_sends_empty_array'
            ),
            'project_materials.external_url_material_list', jsonb_build_object(
              'reference', 'open.oceanengine.com-3.0-waibugei/巨量营销智擎版/创建标准项目.md:174',
              'source', 'route_nested_contract',
              'send_policy', 'omit',
              'reason', 'conditional_required_field_without_current_micro_game_byte_game_url_only_required_evidence;historical_success_omitted',
              'rule', 'current_jszc_micro_game_byte_game_url_only_route_omits_external_url_material_list'
            ),
            'project_materials.mini_program_info', COALESCE(raw_defaults #> '{official_create_field_contract,nested_rules,groups,project_materials.mini_program_info}', '{}'::jsonb) ||
              jsonb_build_object(
                'send_policy', 'send',
                'rule', 'micro_game_byte_game_sends_url_only;omit_app_id_start_path_params_when_url_present'
              ),
            'track_url_setting', COALESCE(raw_defaults #> '{official_create_field_contract,nested_rules,groups,track_url_setting}', '{}'::jsonb) ||
              jsonb_build_object(
                'send_policy', 'send',
                'source', 'route_defaults.track_url_setting.send_type+controlled_touchpoint',
                'rule', 'route_default_server_send_single_controlled_touchpoint'
              )
          )
      ),
    true
  ),
  updated_at = now()
WHERE route_id = 'oceanengine_3_byte_mini_game'
  AND game_code = 'JSZC';

COMMIT;
