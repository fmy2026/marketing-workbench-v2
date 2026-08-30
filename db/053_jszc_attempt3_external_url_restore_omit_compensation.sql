-- Target database: marketing_workbench_v2
-- Scope: Attempt 3 failure/cancel compensation. Restore only the external URL policy to omit while retaining the filter_event omission contract.
-- Safety: route contract metadata only; no platform call, credential change, URL, raw request, raw response, or raw payload storage.
-- Apply only after Attempt 3 is cancelled before real confirmation or closes without a confirmed creation.

BEGIN;

UPDATE mwb.game_route_defaults
SET raw_defaults = jsonb_set(
      raw_defaults,
      '{official_create_field_contract}',
      COALESCE(raw_defaults -> 'official_create_field_contract', '{}'::jsonb)
        || jsonb_build_object(
          'version', '2026-08-30.oe3-create-field-filter-event-omit-v3',
          'source', 'official_3_0_std_project_create_field_contract',
          'nested_rules',
            COALESCE(raw_defaults #> '{official_create_field_contract,nested_rules}', '{}'::jsonb)
            || jsonb_build_object(
              'version', '2026-08-30.oe3-std-project-create-nested-fields-v3',
              'source', 'postgres:mwb.game_route_defaults.raw_defaults.official_create_field_contract.nested_rules',
              'scope', 'current_jszc_oceanengine_3_byte_mini_game_filter_event_omit_external_url_restored_omit',
              'official_reference', 'open.oceanengine.com-3.0/09-01-2-巨量营销智擎版-项目管理-创建标准项目.md:311',
              'groups',
                COALESCE(raw_defaults #> '{official_create_field_contract,nested_rules,groups}', '{}'::jsonb)
                || jsonb_build_object(
                  'audience',
                    COALESCE(raw_defaults #> '{official_create_field_contract,nested_rules,groups,audience}', '{}'::jsonb)
                    || jsonb_build_object(
                      'reference', 'open.oceanengine.com-3.0/09-01-2-巨量营销智擎版-项目管理-创建标准项目.md:311',
                      'related_reference', 'open.oceanengine.com-2.0-copy/06-巨量营销升级版.md:2520',
                      'source', 'route_defaults+dmp_readonly+official_related_v3_create_contract',
                      'filter_event_policy', 'omit',
                      'applies_when', 'hide_if_converted=NO_EXCLUDE',
                      'expected_filter_event_present', false,
                      'reason', 'permanent_no_exclude_filter_event_omission_contract_retained_after_attempt_3',
                      'rule', 'route_enums;hide_if_converted_no_exclude_requires_filter_event_omitted;empty_or_populated_filter_event_is_invalid;dmp_ids_integer_array'
                    ),
                  'project_materials.external_url_material_list', jsonb_build_object(
                    'reference', 'open.oceanengine.com-3.0-waibugei/巨量营销智擎版/创建标准项目.md:174',
                    'source', 'controlled_backup_landing_page',
                    'send_policy', 'omit',
                    'reason', 'attempt_3_cancelled_or_not_confirmed_created_restore_external_url_omit_filter_event_omit_retained',
                    'rule', 'omit_until_a_separately_approved_corrective_hypothesis_is_ready'
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
