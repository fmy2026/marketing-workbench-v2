-- Target database: marketing_workbench_v2
-- Scope: JSZC OE3 std_project/create field contract correction.
-- Safety: route contract metadata update only; no platform calls, token, URL, raw request, raw response, or raw payload storage.

BEGIN;

UPDATE mwb.game_route_defaults
SET raw_defaults = jsonb_set(
    raw_defaults,
    '{official_create_field_contract}',
    COALESCE(raw_defaults -> 'official_create_field_contract', '{}'::jsonb)
      || jsonb_build_object(
        'version', '2026-08-29.oe3-create-field-delivery-layer-v1',
        'source', 'official_3_0_std_project_create_field_contract',
        'field_rules',
          COALESCE(raw_defaults #> '{official_create_field_contract,field_rules}', '{}'::jsonb)
          || jsonb_build_object(
            'delivery_type', jsonb_build_object(
              'evidence_level', 'official_direct',
              'send_policy', 'send',
              'reference', 'open.oceanengine.com-3.0-waibugei/巨量营销智擎版/创建标准项目.md:197',
              'applies_when', 'std_project_create',
              'reason', 'official_create_contract_enum_NORMAL_OR_UBX_INTELLIGENT'
            ),
            'layer_roi_switch', jsonb_build_object(
              'evidence_level', 'official_direct',
              'send_policy', 'send',
              'reference', 'open.oceanengine.com-3.0-waibugei/巨量营销智擎版/创建标准项目.md:203',
              'applies_when', 'std_project_create',
              'reason', 'official_create_contract_enum_OFF_OR_ON'
            )
          )
      ),
    true
  ),
  updated_at = now()
WHERE route_id = 'oceanengine_3_byte_mini_game'
  AND game_code = 'JSZC';

COMMIT;
