-- Target database: marketing_workbench_v2
-- Scope: JSZC OE3 route product selling_points contract fix.
-- Safety: route-default update only; no platform calls, no token, URL, raw request, or raw response storage.

BEGIN;

UPDATE mwb.game_route_defaults
SET raw_defaults = jsonb_set(
    raw_defaults,
    '{payload_defaults,product,selling_points}',
    '["开局装备全靠捡", "三分钟快速上手", "无需下载点开即玩"]'::jsonb,
    true
  ),
  updated_at = now()
WHERE route_id = 'oceanengine_3_byte_mini_game'
  AND game_code = 'JSZC';

COMMIT;

