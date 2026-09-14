-- Target database: marketing_workbench_v2
-- Scope: align the route-held JSZC baseline profile with the current
-- controlled landing-page ledger shape.  No Case, Plan or platform state is
-- changed by this contract-only migration.

BEGIN;

UPDATE mwb.game_route_defaults
SET raw_defaults = jsonb_set(
  jsonb_set(raw_defaults, '{official_create_field_contract,success_profile,golden_field_shape_hash}', '"sha256:de0c8f4e681f7faa9981bfb38112b02971617f51bbdabe722f38280a079eee44"'::jsonb, true),
  '{official_create_field_contract,success_profile,expected_ledger_path_count}', '91'::jsonb, true
),
updated_at = now()
WHERE route_id = 'oceanengine_3_byte_mini_game'
  AND game_code = 'JSZC'
  AND (
    raw_defaults #>> '{official_create_field_contract,success_profile,golden_field_shape_hash}' <> 'sha256:de0c8f4e681f7faa9981bfb38112b02971617f51bbdabe722f38280a079eee44'
    OR raw_defaults #>> '{official_create_field_contract,success_profile,expected_ledger_path_count}' <> '91'
  );

DO $$
DECLARE
  field_hash text;
  ledger_count text;
BEGIN
  SELECT raw_defaults #>> '{official_create_field_contract,success_profile,golden_field_shape_hash}',
         raw_defaults #>> '{official_create_field_contract,success_profile,expected_ledger_path_count}'
  INTO field_hash, ledger_count
  FROM mwb.game_route_defaults
  WHERE route_id = 'oceanengine_3_byte_mini_game' AND game_code = 'JSZC';
  IF field_hash <> 'sha256:de0c8f4e681f7faa9981bfb38112b02971617f51bbdabe722f38280a079eee44' OR ledger_count <> '91' THEN
    RAISE EXCEPTION 'jszc_success_profile_ledger_contract_095_not_applied';
  END IF;
END;
$$;

COMMIT;
