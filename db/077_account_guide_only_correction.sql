-- Target database: marketing_workbench_v2
-- Scope: correct one approved account capability from explicit-cover-plus-guide
--        to guide-only. Dynamic guide-video IDs remain current-Job readonly facts.
-- Safety: no platform call and no historical Case, Job, Plan, action, created-object
--         or readback fact is changed by this migration.

BEGIN;

DO $$
DECLARE
  target_count integer;
  target_owner text;
  target_route text;
  target_game text;
  guide_required boolean;
  cover_required boolean;
BEGIN
  SELECT
    count(*),
    max(qiankun_owner_key),
    max(route_id),
    max(game_code),
    bool_and(guide_video_required),
    bool_and(video_cover_required)
  INTO
    target_count,
    target_owner,
    target_route,
    target_game,
    guide_required,
    cover_required
  FROM mwb.advertiser_accounts
  WHERE advertiser_id = '1867508089433225';

  IF target_count <> 1
     OR target_owner IS DISTINCT FROM 'zhangjingwei'
     OR target_route IS DISTINCT FROM 'oceanengine_3_byte_mini_game'
     OR target_game IS DISTINCT FROM 'JSZC'
     OR guide_required IS DISTINCT FROM true
     OR cover_required IS DISTINCT FROM true THEN
    RAISE EXCEPTION '077 target advertiser scope or capability precondition mismatch';
  END IF;
END $$;

UPDATE mwb.advertiser_accounts
SET video_cover_required = false,
    updated_at = now()
WHERE advertiser_id = '1867508089433225'
  AND route_id = 'oceanengine_3_byte_mini_game'
  AND game_code = 'JSZC'
  AND qiankun_owner_key = 'zhangjingwei'
  AND guide_video_required = true
  AND video_cover_required = true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM mwb.advertiser_accounts
    WHERE advertiser_id = '1867508089433225'
      AND route_id = 'oceanengine_3_byte_mini_game'
      AND game_code = 'JSZC'
      AND qiankun_owner_key = 'zhangjingwei'
      AND guide_video_required = true
      AND video_cover_required = false
  ) THEN
    RAISE EXCEPTION '077 guide-only account capability correction was not applied';
  END IF;
END $$;

COMMIT;
