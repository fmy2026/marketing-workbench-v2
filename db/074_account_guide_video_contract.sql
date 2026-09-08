-- Target database: marketing_workbench_v2
-- Scope: add one account capability flag for conditional guide-video payloads.
-- Safety: no new table/View; no guide_video_id is stored as a route/game default;
--         historical Job/Plan/action/readback facts are unchanged.

BEGIN;

ALTER TABLE mwb.advertiser_accounts
  ADD COLUMN IF NOT EXISTS guide_video_required boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN mwb.advertiser_accounts.guide_video_required IS
  'Account capability policy. When true, each fresh Job must resolve exactly one guide_video_id from gameplay/list before Node 05; the dynamic ID is stored only in account_resources metadata.';

DO $$
DECLARE
  target_count integer;
  target_owner text;
  target_route text;
  target_game text;
  nested_version text;
BEGIN
  SELECT count(*), max(qiankun_owner_key), max(route_id), max(game_code)
  INTO target_count, target_owner, target_route, target_game
  FROM mwb.advertiser_accounts
  WHERE advertiser_id = '1867508089433225';

  IF target_count <> 1
     OR target_owner IS DISTINCT FROM 'zhangjingwei'
     OR target_route IS DISTINCT FROM 'oceanengine_3_byte_mini_game'
     OR target_game IS DISTINCT FROM 'JSZC' THEN
    RAISE EXCEPTION '074 target advertiser scope or owner mismatch';
  END IF;

  SELECT raw_defaults #>> '{official_create_field_contract,nested_rules,version}'
  INTO nested_version
  FROM mwb.game_route_defaults
  WHERE id = 'GRD-oceanengine_3_byte_mini_game-JSZC';

  IF nested_version NOT IN (
    '2026-09-02.oe3-std-project-create-nested-fields-v5',
    '2026-09-08.oe3-std-project-create-nested-fields-v6'
  ) THEN
    RAISE EXCEPTION '074 unexpected JSZC nested field contract version: %', nested_version;
  END IF;
END $$;

UPDATE mwb.advertiser_accounts
SET guide_video_required = true,
    updated_at = now()
WHERE advertiser_id = '1867508089433225'
  AND route_id = 'oceanengine_3_byte_mini_game'
  AND game_code = 'JSZC'
  AND qiankun_owner_key = 'zhangjingwei';

UPDATE mwb.game_route_defaults
SET raw_defaults = jsonb_set(
      jsonb_set(
        raw_defaults,
        '{official_create_field_contract,nested_rules,version}',
        '"2026-09-08.oe3-std-project-create-nested-fields-v6"'::jsonb,
        false
      ),
      '{official_create_field_contract,nested_rules,groups,project_materials.video_material_list,guide_video_policy}',
      '"account_policy_required_unique_current_job_readonly_else_omit"'::jsonb,
      true
    ),
    updated_at = now()
WHERE id = 'GRD-oceanengine_3_byte_mini_game-JSZC';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM mwb.advertiser_accounts
    WHERE advertiser_id = '1867508089433225'
      AND guide_video_required = true
  ) THEN
    RAISE EXCEPTION '074 guide-video account policy was not applied';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM mwb.game_route_defaults
    WHERE id = 'GRD-oceanengine_3_byte_mini_game-JSZC'
      AND raw_defaults #>> '{official_create_field_contract,nested_rules,version}' = '2026-09-08.oe3-std-project-create-nested-fields-v6'
      AND raw_defaults #>> '{official_create_field_contract,nested_rules,groups,project_materials.video_material_list,guide_video_policy}' = 'account_policy_required_unique_current_job_readonly_else_omit'
  ) THEN
    RAISE EXCEPTION '074 nested guide-video contract was not applied';
  END IF;
END $$;

COMMIT;
