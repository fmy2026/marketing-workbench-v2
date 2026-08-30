-- Target database: marketing_workbench_v2
-- Scope: JSZC Attempt 2 single-field validation. Switch only the controlled backup landing-page nested send policy to send.
-- Safety: route default metadata only; no platform call, token, URL, raw request, raw response, raw payload, table, view, report, or dashboard creation.

BEGIN;

UPDATE mwb.game_route_defaults
SET raw_defaults = jsonb_set(
      raw_defaults,
      '{official_create_field_contract,nested_rules,groups,project_materials.external_url_material_list}',
      jsonb_build_object(
        'reference', 'open.oceanengine.com-3.0-waibugei/巨量营销智擎版/创建标准项目.md:174',
        'source', 'controlled_backup_landing_page',
        'send_policy', 'send',
        'reason', 'attempt_2_single_variant_validation_of_official_conditional_required_field',
        'rule', 'send_exactly_one_active_https_target_visible_readback_verified_readonly_passed_hash_matched_backup_landing_page'
      ),
      true
    ),
    updated_at = now()
WHERE route_id = 'oceanengine_3_byte_mini_game'
  AND game_code = 'JSZC';

COMMIT;
