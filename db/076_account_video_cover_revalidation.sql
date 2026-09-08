-- Target database: marketing_workbench_v2
-- Scope: require fresh explicit video-cover bindings for one approved account.
-- Safety: no platform call and no historical Case, Job, Plan, action or
--         readback fact is changed by this migration.

BEGIN;

ALTER TABLE mwb.advertiser_accounts
  ADD COLUMN IF NOT EXISTS video_cover_required boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN mwb.advertiser_accounts.video_cover_required IS
  'Account capability policy. When true, every required video must have an explicit cover ID verified by the current Job and sent with the create payload.';

DO $$
DECLARE
  target_count integer;
  target_owner text;
  target_route text;
  target_game text;
  guide_required boolean;
BEGIN
  SELECT count(*), max(qiankun_owner_key), max(route_id), max(game_code), bool_and(guide_video_required)
  INTO target_count, target_owner, target_route, target_game, guide_required
  FROM mwb.advertiser_accounts
  WHERE advertiser_id = '1867508089433225';

  IF target_count <> 1
     OR target_owner IS DISTINCT FROM 'zhangjingwei'
     OR target_route IS DISTINCT FROM 'oceanengine_3_byte_mini_game'
     OR target_game IS DISTINCT FROM 'JSZC'
     OR guide_required IS DISTINCT FROM true THEN
    RAISE EXCEPTION '076 target advertiser scope, owner or guide-video policy mismatch';
  END IF;
END $$;

UPDATE mwb.advertiser_accounts
SET video_cover_required = true,
    updated_at = now()
WHERE advertiser_id = '1867508089433225'
  AND route_id = 'oceanengine_3_byte_mini_game'
  AND game_code = 'JSZC'
  AND qiankun_owner_key = 'zhangjingwei'
  AND guide_video_required = true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM mwb.advertiser_accounts
    WHERE advertiser_id = '1867508089433225'
      AND video_cover_required = true
      AND guide_video_required = true
  ) THEN
    RAISE EXCEPTION '076 video-cover account policy was not applied';
  END IF;
END $$;

COMMIT;
