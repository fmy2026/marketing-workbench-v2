-- Target database: marketing_workbench_v2
-- Scope: Close JSZC Attempt 2 after a real create returned generic 40000 without a field path.
-- Safety: restore only the tested nested route-default policy; no platform call, credential change, URL, raw payload, or raw response.

BEGIN;

UPDATE mwb.game_route_defaults
SET raw_defaults = jsonb_set(
      raw_defaults,
      '{official_create_field_contract,nested_rules,groups,project_materials.external_url_material_list}',
      jsonb_build_object(
        'reference', 'open.oceanengine.com-3.0-waibugei/巨量营销智擎版/创建标准项目.md:174',
        'source', 'controlled_backup_landing_page',
        'send_policy', 'omit',
        'reason', 'attempt_2_generic_40000_without_field_path_restore_omit_pending_independent_forensic_review',
        'rule', 'omit_until_a_separately_approved_corrective_hypothesis_is_ready'
      ),
      true
    ),
    updated_at = now()
WHERE route_id = 'oceanengine_3_byte_mini_game'
  AND game_code = 'JSZC';

COMMIT;
