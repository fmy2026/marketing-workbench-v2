-- Target database: marketing_workbench_v2
-- Scope: route-level JSZC guide-video capability source only.
-- Safety: no account, Case, Job, Plan, confirmation, action, object, credential,
-- request or response is changed. Dynamic guide-video IDs remain current-Job facts.

BEGIN;

UPDATE mwb.game_route_defaults
SET raw_defaults = jsonb_set(
      raw_defaults,
      '{official_create_field_contract,nested_rules,groups,project_materials.video_material_list,guide_video_policy}',
      '"fresh_readonly_auto_detect_with_account_force_required"'::jsonb,
      true
    ),
    updated_at = now()
WHERE route_id = 'oceanengine_3_byte_mini_game'
  AND game_code = 'JSZC';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM mwb.game_route_defaults
    WHERE route_id = 'oceanengine_3_byte_mini_game'
      AND game_code = 'JSZC'
      AND raw_defaults #>> '{official_create_field_contract,nested_rules,groups,project_materials.video_material_list,guide_video_policy}' = 'fresh_readonly_auto_detect_with_account_force_required'
  ) THEN
    RAISE EXCEPTION '079 JSZC guide-video auto-detect policy was not persisted';
  END IF;
END $$;

COMMIT;
