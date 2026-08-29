-- Target database: marketing_workbench_v2
-- Scope: JSZC OE3 std_project/create nested field semantic contract.
-- Safety: route contract metadata update only; no platform calls, token, URL, raw request, raw response, raw payload, table, view, report, or dashboard creation.

BEGIN;

UPDATE mwb.game_route_defaults
SET raw_defaults = jsonb_set(
    raw_defaults,
    '{official_create_field_contract}',
    COALESCE(raw_defaults -> 'official_create_field_contract', '{}'::jsonb)
      || jsonb_build_object(
        'version', '2026-08-29.oe3-create-field-nested-contract-v1',
        'source', 'official_3_0_std_project_create_field_contract',
        'nested_rules', jsonb_build_object(
          'version', '2026-08-29.oe3-std-project-create-nested-fields-v1',
          'source', 'postgres:mwb.game_route_defaults.raw_defaults.official_create_field_contract.nested_rules',
          'scope', 'current_jszc_oceanengine_3_byte_mini_game_sent_nested_paths_only',
          'official_reference', 'open.oceanengine.com-3.0-waibugei/巨量营销智擎版/创建标准项目.md:142',
          'groups', jsonb_build_object(
            'project_materials.video_material_list', jsonb_build_object(
              'reference', 'open.oceanengine.com-3.0-waibugei/巨量营销智擎版/创建标准项目.md:143',
              'source', 'mwb.material_packs+material_pack_items+account_resources.video_asset',
              'rule', 'required_video_asset_only;vertical_image_mode;target_readonly_video_id;cover_sent_only_when_explicit_cover_verified'
            ),
            'project_materials.product_info', jsonb_build_object(
              'reference', 'open.oceanengine.com-3.0-waibugei/巨量营销智擎版/创建标准项目.md:163',
              'source', 'game_identity+account_resources.product_image+route_defaults.product.selling_points',
              'rule', 'single_product_title_1_20;image_ids_1_10_verified;selling_points_1_10_each_6_9'
            ),
            'project_materials.call_to_action_buttons', jsonb_build_object(
              'reference', 'open.oceanengine.com-3.0-waibugei/巨量营销智擎版/创建标准项目.md:167',
              'source', 'route_defaults.product.call_to_action_buttons',
              'rule', 'string_array_1_10_each_2_4'
            ),
            'project_materials.source', jsonb_build_object(
              'reference', 'open.oceanengine.com-3.0-waibugei/巨量营销智擎版/创建标准项目.md:173',
              'source', 'game_identity',
              'rule', 'string_chars_2_10'
            ),
            'project_materials.anchor_related_type', jsonb_build_object(
              'reference', 'open.oceanengine.com-3.0-waibugei/巨量营销智擎版/创建标准项目.md:168',
              'source', 'route_defaults.product.anchor_related_type',
              'rule', 'current_jszc_route_off;no_anchor_material_list;no_component_material_list'
            ),
            'project_materials.mini_program_info', jsonb_build_object(
              'reference', 'open.oceanengine.com-3.0-waibugei/巨量营销智擎版/创建标准项目.md:184',
              'source', 'mwb.game_route_launch_links',
              'rule', 'micro_game_byte_game_sends_url_only;omit_app_id_start_path_params_when_url_present'
            ),
            'track_url_setting', jsonb_build_object(
              'reference', 'open.oceanengine.com-3.0-waibugei/巨量营销智擎版/创建标准项目.md',
              'source', 'controlled_touchpoint',
              'rule', 'server_send_single_controlled_touchpoint'
            ),
            'audience', jsonb_build_object(
              'reference', 'open.oceanengine.com-3.0-waibugei/巨量营销智擎版/创建标准项目.md',
              'source', 'route_defaults+dmp_readonly',
              'rule', 'route_enums;filter_event_contains_primary_optimization_event;dmp_ids_integer_array'
            ),
            'brand_info', jsonb_build_object(
              'reference', 'open.oceanengine.com-3.0-waibugei/巨量营销智擎版/创建标准项目.md:189',
              'source', 'brand_industry_readonly',
              'rule', 'brand_ids_integer;brand_name_present'
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
