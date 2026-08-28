-- Target database: marketing_workbench_v2
-- Scope: approve the local engineering transport strategy for OE3 std_project/create instance_id.
-- Safety: no platform call, no credential material, no raw request/response data.

BEGIN;

UPDATE mwb.game_route_defaults
SET raw_defaults = jsonb_set(
  jsonb_set(
    raw_defaults,
    '{contract_mapping}',
    COALESCE(raw_defaults -> 'contract_mapping', '{}'::jsonb) ||
      jsonb_build_object(
        'mini_game_instance_candidate_create_field', 'instance_id',
        'mini_game_instance_create_field_verified', true,
        'optimized_goal_query_instance_field', 'micro_app_instance_id',
        'optimized_goal_query_app_field', 'mini_program_id',
        'source', 'local_official_docs:std_project_create+optimized_goal_get;engineering:lossless_wire_encoder',
        'verified_for_route', true
      ),
    true
  ),
  '{official_create_field_contract}',
  COALESCE(raw_defaults -> 'official_create_field_contract', '{}'::jsonb) || jsonb_build_object(
    'version', '2026-08-28.oe3-instance-id-lossless-wire-transport-v1',
    'source', 'local_official_docs_for_field_contract_plus_local_engineering_wire_encoder_for_transport',
    'instance_id_create_evidence', jsonb_build_object(
      'status', 'passed',
      'candidate_create_field', 'instance_id',
      'field_name_verified', true,
      'create_field_type', 'number',
      'field_type_verified', true,
      'landing_type', 'MICRO_GAME',
      'delivery_medium', 'BYTE_GAME',
      'applicability_verified', true,
      'long_id_transport_strategy', 'decimal_bigint_json_number',
      'long_id_transport_source', 'local_engineering_lossless_wire_encoder',
      'long_id_transport_verified', true,
      'references', jsonb_build_array(
        'open.oceanengine.com-3.0-waibugei/巨量营销智擎版/创建标准项目.md',
        'open.oceanengine.com-3.0-waibugei/巨量营销智擎版/获取标准项目列表.md',
        'open.oceanengine.com-3.0-waibugei/巨量营销智擎版/调控任务/标准项目下获取可用优化目标.md'
      ),
      'reason', 'official_docs_verify_instance_id_field_name_type_and_route_applicability;local_encoder_verifies_19_digit_json_number_token_without_js_number_precision_loss'
    ),
    'field_rules', jsonb_set(
      COALESCE(raw_defaults -> 'official_create_field_contract' -> 'field_rules', '{}'::jsonb),
      '{instance_id}',
      jsonb_build_object(
        'evidence_level', 'official_direct',
        'send_policy', 'send',
        'reference', 'open.oceanengine.com-3.0-waibugei/巨量营销智擎版/创建标准项目.md',
        'applies_when', 'MICRO_GAME + BYTE_GAME',
        'reason', 'field_contract_official_direct;transport_verified_by_local_decimal_bigint_json_number_encoder'
      ),
      true
    )
  ),
  true
)
WHERE route_id = 'oceanengine_3_byte_mini_game'
  AND game_code = 'JSZC';

COMMIT;
